import { useEffect, useState } from 'react';
import { call, useStatus } from '../api';
import { isPainel, stateColor } from '../App';

const STATE_TEXT: Record<string, string> = {
  desconectado: 'Desconectado', conectando: 'Conectando…', lendo: 'Lendo a configuração da ECU…',
  conectado: 'Conectado', erro: 'Erro',
};

const FAMILIA: Record<string, string> = { rusefi: 'rusEFI', speeduino: 'Speeduino', outra: 'Outra ECU' };
const FONTE: Record<string, string> = {
  app: 'veio com o app', guardado: 'guardado neste computador', biblioteca: 'biblioteca do app',
  baixado: 'baixado agora do servidor da rusEFI', parecido: 'versão mais próxima da biblioteca',
};

/** Quando a ECU responde mas o app não tem o .ini dela: o usuário escolhe o arquivo (o mesmo do TunerStudio). */
export function EscolherIni() {
  const s = useStatus();
  const [erro, setErro] = useState<string>();
  if (!s.faltaIni) return null;
  const abrir = async (f?: File) => {
    if (!f) return;
    setErro(undefined);
    const b = new Uint8Array(await f.arrayBuffer());
    let bin = '';
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
    call('iniArquivo', { data: btoa(bin) }).catch((e) => setErro((e as Error).message));
  };
  return (
    <label className="btn primary" style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      Escolher o arquivo .ini da ECU
      <input type="file" accept=".ini" hidden onChange={(e) => { void abrir(e.target.files?.[0]); e.target.value = ''; }} />
      {erro && <span className="notice err">{erro}</span>}
    </label>
  );
}

export function Conexao() {
  const s = useStatus();
  const [mode, setMode] = useState<'demo' | 'sim' | 'usb' | 'wifi'>(isPainel ? 'wifi' : 'demo');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('29001');
  const [ports, setPorts] = useState<{ path: string; label: string }[]>([]);
  const [serial, setSerial] = useState('');
  const [busca, setBusca] = useState<{ estado: 'procurando' | 'ok' | 'erro'; texto?: string }>();
  const scan = () => {
    setBusca({ estado: 'procurando' });
    return call<{ path: string; label: string }[]>('serialPorts').then((p) => {
      setPorts(p);
      setSerial((cur) => (cur && !p.length ? cur : p.some((x) => x.path === cur) ? cur : (p.find((x) => /usbmodem|usbserial|wchusb|COM\d/i.test(x.path)) ?? p[0])?.path ?? ''));
      setBusca({ estado: 'ok', texto: p.length ? `${p.length} porta${p.length > 1 ? 's' : ''} encontrada${p.length > 1 ? 's' : ''} (${new Date().toLocaleTimeString()}).` : undefined });
    }).catch((e) => { setPorts([]); setBusca({ estado: 'erro', texto: `Não consegui listar as portas: ${(e as Error).message}` }); });
  };
  useEffect(() => { if (mode === 'usb' && s.bridgeUp) void scan(); }, [mode, s.bridgeUp]);
  const busy = s.state === 'conectando' || s.state === 'lendo';
  const connected = s.state === 'conectado';

  return (
    <main className="screen" style={{ flexDirection: 'row', gap: 16 }}>
      <section className="card" style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="label">Como ligar na ECU</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {([['wifi', 'Wi-Fi da ECU', 'Sem fio: rede "ECU-…" da nossa placa'], ['usb', 'Cabo USB', 'Nossa placa, rusEFI ou Speeduino'], ['sim', 'Simulador (rede)', 'ECU de teste em outro computador'], ['demo', 'Demonstração', 'ECU falsa dentro do app']] as const).map(([k, t, d]) => (
            <button key={k} className="card" onClick={() => setMode(k)}
              style={{ padding: '12px 14px', textAlign: 'left', cursor: 'pointer', borderColor: mode === k ? 'var(--amber)' : undefined, borderWidth: 2}}>
              <div className="num" style={{ fontSize: 22 }}>{t}</div>
              <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>{d}</div>
            </button>
          ))}
        </div>
        {mode === 'sim' && <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <span className="label">Endereço</span>
            <input className="field" value={host} onChange={(e) => setHost(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 140 }}>
            <span className="label">Porta</span>
            <input className="field" value={port} inputMode="numeric" onChange={(e) => setPort(e.target.value)} />
          </label>
        </div>}
        {mode === 'usb' && <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <span className="label">Porta do cabo</span>
            <select className="field" value={serial} onChange={(e) => setSerial(e.target.value)}>
              {ports.length === 0 && !serial && <option value="">Nenhuma placa encontrada</option>}
              {serial && !ports.some((p) => p.path === serial) && <option value={serial}>{serial} · digitada</option>}
              {ports.map((p) => <option key={p.path} value={p.path}>{p.path.replace('/dev/', '')} · {p.label}</option>)}
            </select>
          </label>
          <button className="btn" style={{ height: 48 }} disabled={busca?.estado === 'procurando'} onClick={() => void scan()}>{busca?.estado === 'procurando' ? 'Procurando…' : 'Procurar'}</button>
        </div>}
        {mode === 'usb' && <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="label">Ou digite a porta (ex.: COM3 ou /dev/cu.usbserial-110)</span>
          <input className="field" value={serial} placeholder="COM3" onChange={(e) => setSerial(e.target.value.trim())} />
        </label>}
        {mode === 'usb' && busca?.estado === 'erro' && <div className="notice err">{busca.texto}</div>}
        {mode === 'usb' && busca?.estado === 'ok' && busca.texto && <div className="notice ok">{busca.texto}</div>}
        {mode === 'usb' && busca?.estado === 'ok' && !ports.length && <div className="notice err">
          Nenhuma porta USB apareceu. Confira: o cabo é de dados (não só de carga); o Arduino IDE e o TunerStudio estão fechados;
          Arduino Mega paralelo (chip CH340) precisa do driver CH340 no Windows e em Mac antigo. Se o Arduino IDE enxerga a porta, digite o nome dela acima.
        </div>}
        {mode === 'wifi' && <div className="notice ok">
          Ligue este aparelho na rede Wi-Fi da ECU (nome "ECU-…", senha na etiqueta da placa) e toque em Conectar. Endereço 192.168.4.1, porta 29001.
          {isPainel && ' No modo painel a tela liga sozinha quando a ECU aparece.'}
        </div>}
        {mode === 'demo' && <div className="notice ok">Os sensores andam sozinhos (lenta, acelerada, puxada até o corte). Você pode editar e gravar o mapa; a gravação fica guardada até fechar o app.</div>}
        <span style={{ flexGrow: 1 }} />
        {connected || busy ? (
          <button className="btn" style={{ height: 60, fontSize: 19 }} onClick={() => call('disconnect')}>Desconectar</button>
        ) : (
          <button className="btn primary" style={{ height: 60, fontSize: 19 }}
            disabled={!s.bridgeUp || (mode === 'usb' && !serial)}
            onClick={() => (mode === 'demo' ? call('demo') : mode === 'usb' ? call('connectSerial', { path: serial }) : mode === 'wifi' ? call('connect', { host: '192.168.4.1', port: 29001 }) : call('connect', { host, port: Number(port) }))}>Conectar</button>
        )}
      </section>

      <section className="card" style={{ width: 400, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span className="label">Situação</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="dot" style={{ width: 16, height: 16, background: stateColor(s.bridgeUp ? s.state : 'erro') }} />
          <span className="num" style={{ fontSize: 34 }}>{s.bridgeUp ? STATE_TEXT[s.state] : 'App sem ponte'}</span>
        </div>
        {s.state === 'lendo' && (
          <div className="bar" style={{ height: 10 }}><span style={{ height: 10, width: `${Math.round((s.progress ?? 0) * 100)}%`, background: 'var(--amber)' }} /></div>
        )}
        {s.message && <div className={`notice ${s.state === 'erro' ? 'err' : 'ok'}`}>{s.message}</div>}
        {s.state === 'erro' && /registro/i.test(s.message ?? '') && (
          <button className="btn" onClick={() => call('openFolder')}>Abrir a pasta do registro (conexao-log.txt)</button>
        )}
        <EscolherIni />
        {s.state === 'conectado' && !s.demo && s.family && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="label">ECU</span>
            <span style={{ fontSize: 14 }}>{FAMILIA[s.family] ?? s.family}{s.iniFonte ? ` · .ini ${FONTE[s.iniFonte] ?? s.iniFonte}` : ''}</span>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="label">Firmware da ECU</span>
          <span style={{ fontSize: 14, wordBreak: 'break-all' }}>{s.ecuSignature ?? '–'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="label">Arquivo .ini do app</span>
          <span style={{ fontSize: 14, wordBreak: 'break-all' }}>{s.iniSignature || '–'}</span>
        </div>
        {s.signatureMatch !== undefined && !s.faltaIni && (
          <div className={`notice ${s.signatureMatch ? 'ok' : 'err'}`}>
            {s.signatureMatch ? 'Firmware e .ini são da mesma versão.' : 'Versões diferentes: atualize o .ini do app antes de mexer no mapa.'}
          </div>
        )}
      </section>
    </main>
  );
}
