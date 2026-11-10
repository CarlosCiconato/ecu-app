import { useEffect, useState } from 'react';
import { call, useStatus } from '../api';
import { stateColor } from '../App';

const STATE_TEXT: Record<string, string> = {
  desconectado: 'Desconectado', conectando: 'Conectando…', lendo: 'Lendo a configuração da ECU…',
  conectado: 'Conectado', erro: 'Erro',
};

export function Conexao() {
  const s = useStatus();
  const [mode, setMode] = useState<'demo' | 'sim' | 'usb'>('demo');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('29001');
  const [ports, setPorts] = useState<{ path: string; label: string }[]>([]);
  const [serial, setSerial] = useState('');
  const scan = () => call<{ path: string; label: string }[]>('serialPorts').then((p) => {
    setPorts(p);
    setSerial((cur) => (p.some((x) => x.path === cur) ? cur : (p.find((x) => /usbmodem/i.test(x.path)) ?? p[0])?.path ?? ''));
  }).catch(() => setPorts([]));
  useEffect(() => { if (mode === 'usb' && s.bridgeUp) void scan(); }, [mode, s.bridgeUp]);
  const busy = s.state === 'conectando' || s.state === 'lendo';
  const connected = s.state === 'conectado';

  return (
    <main className="screen" style={{ flexDirection: 'row', gap: 16 }}>
      <section className="card" style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="label">Como ligar na ECU</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {([['demo', 'Demonstração', 'ECU falsa dentro do app, para ver as telas'], ['sim', 'Simulador (rede)', 'ECU de teste rodando no computador'], ['usb', 'Cabo USB', 'Placa de verdade no cabo']] as const).map(([k, t, d]) => (
            <button key={k} className="card" onClick={() => setMode(k)}
              style={{ padding: 16, textAlign: 'left', cursor: 'pointer', borderColor: mode === k ? 'var(--amber)' : undefined, borderWidth: 2}}>
              <div className="num" style={{ fontSize: 24 }}>{t}</div>
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
              {ports.length === 0 && <option value="">Nenhuma placa encontrada</option>}
              {ports.map((p) => <option key={p.path} value={p.path}>{p.path.replace('/dev/', '')} · {p.label}</option>)}
            </select>
          </label>
          <button className="btn" style={{ height: 48 }} onClick={scan}>Procurar</button>
        </div>}
        {mode === 'demo' && <div className="notice ok">Os sensores andam sozinhos (lenta, acelerada, puxada até o corte). Você pode editar e gravar o mapa; a gravação fica guardada até fechar o app.</div>}
        <span style={{ flexGrow: 1 }} />
        {connected || busy ? (
          <button className="btn" style={{ height: 60, fontSize: 19 }} onClick={() => call('disconnect')}>Desconectar</button>
        ) : (
          <button className="btn primary" style={{ height: 60, fontSize: 19 }}
            disabled={!s.bridgeUp || (mode === 'usb' && !serial)}
            onClick={() => (mode === 'demo' ? call('demo') : mode === 'usb' ? call('connectSerial', { path: serial }) : call('connect', { host, port: Number(port) }))}>Conectar</button>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="label">Firmware da ECU</span>
          <span style={{ fontSize: 14, wordBreak: 'break-all' }}>{s.ecuSignature ?? '–'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="label">Arquivo .ini do app</span>
          <span style={{ fontSize: 14, wordBreak: 'break-all' }}>{s.iniSignature || '–'}</span>
        </div>
        {s.signatureMatch !== undefined && (
          <div className={`notice ${s.signatureMatch ? 'ok' : 'err'}`}>
            {s.signatureMatch ? 'Firmware e .ini são da mesma versão.' : 'Versões diferentes: atualize o .ini do app antes de mexer no mapa.'}
          </div>
        )}
      </section>
    </main>
  );
}
