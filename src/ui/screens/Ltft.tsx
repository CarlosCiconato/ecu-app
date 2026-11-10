// Correção de longo prazo (LTFT, item 18): o que a ECU aprendeu em cada célula do
// mapa em ms. "Aplicar no mapa" passa a correção para o mapa principal e zera.
import { useEffect, useState } from 'react';
import { call, useLive, useStatus, type TableData } from '../api';
import { fmt } from '../format';
import { heat } from './MapaInjecao';

export function Ltft() {
  const s = useStatus();
  const live = useLive(['ltftCorrection1', 'ltftLearning', 'ltftCorrecting']);
  const [t, setT] = useState<TableData>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const load = () => call<TableData>('table', { name: 'ltftBank1InjTimeTbl' }).then(setT, (e) => setMsg(e.message));
  useEffect(() => { if (s.state === 'conectado') void load(); }, [s.state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (s.state !== 'conectado') return <main className="screen"><div className="notice err">Conecte na ECU para ver a correção.</div></main>;
  if (!t) return <main className="screen"><span className="label">{msg ?? 'Lendo…'}</span></main>;

  async function run(name: string, ok: string) {
    setBusy(true);
    try { await call('cmd', { name }); await load(); setMsg(ok); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  const lim = Math.max(5, ...t.values.map(Math.abs));
  const cols = `56px repeat(${t.cols}, minmax(0, 1fr))`;
  const rows = Array.from({ length: t.rows }, (_, i) => t.rows - 1 - i);
  return (
    <main className="screen" style={{ flexDirection: 'row', gap: 14, paddingTop: 10 }}>
      <section className="card" style={{ flexGrow: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>kPa \ RPM</span>
          {t.xBins.map((x, c) => <span key={c} className="num" style={{ fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>{x >= 1000 ? fmt(x / 1000, 1) + 'k' : fmt(x)}</span>)}
        </div>
        {rows.map((r) => (
          <div key={r} style={{ flexGrow: 1, display: 'grid', gridTemplateColumns: cols, gap: 3 }}>
            <span className="num" style={{ fontSize: 14, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{fmt(t.yBins[r])}</span>
            {t.xBins.map((_, c) => {
              const v = t.values[r * t.cols + c];
              return <span key={c} style={{ borderRadius: 4, background: v === 0 ? '#1F2226' : heat(v, -lim, lim), fontFamily: 'var(--cond)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{v === 0 ? '' : `${v > 0 ? '+' : ''}${fmt(v, 1)}`}</span>;
            })}
          </div>
        ))}
      </section>
      <aside style={{ width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="label">Correção média agora</span>
          <span className="num" style={{ fontSize: 44, color: 'var(--amber)' }}>{fmt(live.ltftCorrection1, 1)} %</span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{live.ltftLearning ? 'Aprendendo' : 'Parada'}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Em % sobre o mapa em ms. Positivo = a ECU está pondo mais combustível do que o mapa pede. Célula vazia = ainda não aprendeu.</div>
        <span style={{ flexGrow: 1 }} />
        {msg && <div className={`notice ${/aplicada|zerada/.test(msg) ? 'ok' : 'err'}`}>{msg}</div>}
        <button className="btn" style={{ height: 50 }} disabled={busy} onClick={() => run('cmd_ltft_reset', 'Correção zerada.')}>Zerar a correção</button>
        <button className="btn primary" style={{ height: 56, fontSize: 17 }} disabled={busy} onClick={() => run('cmd_ltft_apply_to_ve', 'Correção aplicada no mapa em ms. Grave na tela do mapa.')}>Aplicar no mapa em ms</button>
      </aside>
    </main>
  );
}
