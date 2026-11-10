// Mapas (.ftm): importar as tabelas que temos (injeção em ms, ignição,
// lambda alvo, correções por temperatura) e exportar o nosso mapa num .ftm.
// O export usa um .ftm de verdade como modelo e troca só as tabelas equivalentes.
import { useEffect, useRef, useState } from 'react';
import { call, useStatus } from '../api';

interface Item { key: string; title: string; found: boolean; ftSize: string; ecuSize: string; perTune: boolean }
interface Info { name: string; mainLoad: string; product: string; tune: number; items: Item[] }

async function toB64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function download(b64: string, name: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Exportar fica escondido até o Carlos decidir se precisa (01/11). O código está pronto.
const SHOW_EXPORT = false;

/** Arquivo escolhido na tela inicial para abrir aqui. */
export let pendingFtm: { name: string; data: string } | undefined;
export const openFtmLater = (f: { name: string; data: string }) => { pendingFtm = f; };

export function ArquivoFtm() {
  const s = useStatus();
  const openRef = useRef<HTMLInputElement>(null);
  const tplRef = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<Info>();
  const [file, setFile] = useState('');
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [tpl, setTpl] = useState<{ name: string; data: string }>();
  const [name, setName] = useState('Meu mapa');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  useEffect(() => {
    const f = pendingFtm;
    if (!f || s.state !== 'conectado') return;
    pendingFtm = undefined;
    void run(async () => {
      const r = await call<Info>('ftmRead', { data: f.data });
      setInfo(r); setFile(f.name);
      setPick(new Set(r.items.filter((i) => i.found).map((i) => i.key)));
      return `Arquivo aberto: ${r.items.filter((i) => i.found).length} tabelas podem ser importadas.`;
    });
  }, [s.state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (s.state !== 'conectado') return <main className="screen"><div className="notice err">Conecte na ECU para importar ou exportar mapas.</div></main>;

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    try { setMsg({ ok: true, text: await fn() }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  }

  const onOpen = (f?: File) => f && run(async () => {
    const r = await call<Info>('ftmRead', { data: await toB64(f) });
    setInfo(r); setFile(f.name);
    setPick(new Set(r.items.filter((i) => i.found).map((i) => i.key)));
    return `Arquivo aberto: ${r.items.filter((i) => i.found).length} tabelas podem ser importadas.`;
  });

  const apply = () => run(async () => {
    const done = await call<string[]>('ftmApply', { keys: [...pick] });
    return done.length ? `Importado: ${done.join(', ')}. Confira os mapas e grave na ECU.` : 'Nada foi importado.';
  });

  const exportar = () => run(async () => {
    const r = await call<{ data: string; done: string[] }>('ftmExport', { name, template: tpl?.data });
    download(r.data, `${name.replace(/[^\w\- ]+/g, '').trim() || 'mapa'}.ftm`);
    return `Exportado (${r.done.join(', ')}). O arquivo foi para a pasta Downloads.`;
  });

  const big = { height: 52, fontSize: 17 } as const;

  return (
    <main className="screen" style={{ gap: 12, paddingTop: 10 }}>
      <section style={{ display: 'grid', gridTemplateColumns: SHOW_EXPORT ? '1.35fr 1fr' : '1fr', gap: 12, flexGrow: 1, minHeight: 0 }}>
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <span className="num" style={{ fontSize: 26 }}>Importar mapa .ftm</span>
          <input ref={openRef} type="file" accept=".ftm" hidden onChange={(e) => { onOpen(e.target.files?.[0]); e.target.value = ''; }} />
          {!info ? (
            <>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>Abra um arquivo .ftm do programa de origem. O app mostra o que dá para trazer e você escolhe. Os eixos são reamostrados para o tamanho dos nossos mapas (16 × 16), sem mudar o desenho do mapa.</span>
              <span style={{ flexGrow: 1 }} />
            </>
          ) : (
            <>
              <span style={{ fontSize: 14 }}><b>{info.name || file}</b> <span style={{ color: 'var(--muted)' }}>· FT{info.product} · mapa principal por {info.mainLoad} · vai para o ajuste {info.tune}</span></span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
                {info.items.map((i) => {
                  const on = pick.has(i.key);
                  return (
                    <button key={i.key} className="btn" disabled={!i.found || busy}
                      onClick={() => setPick((p) => { const n = new Set(p); if (on) n.delete(i.key); else n.add(i.key); return n; })}
                      style={{ height: 50, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', borderWidth: 2, borderColor: on ? 'var(--amber)' : undefined, opacity: i.found ? 1 : 0.5 }}>
                      <span style={{ width: 22, height: 22, borderRadius: 5, border: '2px solid var(--muted)', background: on ? 'var(--amber)' : 'transparent', flexShrink: 0 }} />
                      <span style={{ flexGrow: 1, fontSize: 16 }}>{i.title}</span>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{i.found ? `${i.ftSize} → ${i.ecuSize}` : 'não está no arquivo'}</span>
                    </button>
                  );
                })}
              </div>
              <span style={{ flexGrow: 1 }} />
            </>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className={`btn ${info ? '' : 'primary'}`} style={{ ...big, flexGrow: 1 }} disabled={busy} onClick={() => openRef.current?.click()}>{info ? 'Abrir outro' : 'Abrir arquivo .ftm'}</button>
            {info && <button className="btn primary" style={{ ...big, flexGrow: 1 }} disabled={busy || !pick.size} onClick={apply}>Importar {pick.size} {pick.size === 1 ? 'tabela' : 'tabelas'}</button>}
          </div>
        </div>

        {SHOW_EXPORT && <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="num" style={{ fontSize: 26 }}>Exportar paros módulos profissionais</span>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>Gera um .ftm com o nosso mapa (ajuste em uso): injeção em ms, ignição, lambda alvo e correções por temperatura. O resto vem do arquivo modelo.</span>
          <span className="label">Nome do mapa</span>
          <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)}
            style={{ height: 46, fontSize: 18, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line, #333)', background: 'var(--bg, #111)', color: 'inherit' }} />
          <span className="label">Arquivo modelo</span>
          <input ref={tplRef} type="file" accept=".ftm" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setTpl({ name: f.name, data: await toB64(f) }); }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ flexGrow: 1, fontSize: 14 }}>{tpl ? tpl.name : 'Padrão (modelo de exemplo)'}</span>
            <button className="btn" style={{ height: 44 }} disabled={busy} onClick={() => tplRef.current?.click()}>Escolher</button>
            {tpl && <button className="btn" style={{ height: 44 }} onClick={() => setTpl(undefined)}>Padrão</button>}
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Use como modelo um .ftm salvo da sua próprios módulos profissionais. Ainda não testamos se o programa de origem aceita o arquivo editado.</span>
          <span style={{ flexGrow: 1 }} />
          <button className="btn primary" style={big} disabled={busy} onClick={exportar}>Exportar .ftm</button>
        </div>}
      </section>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {msg ? <div className={`notice ${msg.ok ? 'ok' : 'err'}`} style={{ flexGrow: 1 }}>{msg.text}</div>
          : s.dirty ? <div className="notice" style={{ flexGrow: 1, background: '#2A2116', color: '#FFD08A' }}>Mudanças valendo, mas ainda não gravadas.</div>
          : <span style={{ flexGrow: 1, fontSize: 13, color: 'var(--muted)' }}>Importar muda a memória de trabalho da ECU. Só fica salvo depois de gravar.</span>}
        <button className="btn primary" style={{ height: 52, width: 200, fontSize: 17 }} disabled={busy || !s.dirty} onClick={() => run(() => call('burn').then(() => 'Gravado na ECU.'))}>Gravar na ECU</button>
      </div>
    </main>
  );
}
