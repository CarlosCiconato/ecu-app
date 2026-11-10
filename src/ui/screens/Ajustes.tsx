// Gerenciador de ajustes (item 6 do firmware): 3 ajustes com mapas próprios de
// injeção, VE, ignição, lambda e turbo. Escolher o ajuste em uso, quantos entram
// no botão do painel, dar nome, copiar um ajuste para outro e zerar (referência cap. 24).
// O nome fica neste aparelho (prefs), a ECU não guarda texto.
import { useEffect, useState } from 'react';
import { call, useLive, useStatus } from '../api';
import { setPrefs, usePrefs } from '../prefs';
import type { Screen } from '../App';

export function Ajustes({ go }: { go: (s: Screen) => void }) {
  const s = useStatus();
  const live = useLive(['tuneInUse']);
  const [c, setC] = useState<{ activeTune: number; tuneCount: number }>();
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(2);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const prefs = usePrefs();
  const [zerar, setZerar] = useState<number>(); // ajuste esperando a confirmação de zerar

  useEffect(() => {
    if (s.state !== 'conectado') return;
    call<{ activeTune: number; tuneCount: number }>('constants', { names: ['activeTune', 'tuneCount'] }).then(setC, (e) => setMsg(e.message));
  }, [s.state]);

  if (s.state !== 'conectado') return <main className="screen"><div className="notice err">Conecte na ECU para ver os ajustes.</div></main>;
  if (!c) return <main className="screen"><span className="label">Lendo…</span></main>;

  const inUse = live.tuneInUse ?? 1;
  async function run(fn: () => Promise<void>, ok?: string) {
    setBusy(true);
    try { await fn(); setMsg(ok); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  // No firmware, tuneCount = quantos ajustes estão ligados (1, 1-2 ou 1-3); o botão troca entre eles.
  // Um ajuste acima disso não entra nem escolhido pelo app (visto no simulador real), então escolher
  // o ajuste 3 com só 1 ligado liga também os de baixo.
  const setField = (name: 'activeTune' | 'tuneCount', v: number) =>
    run(async () => {
      if (name === 'activeTune' && c && v > c.tuneCount) {
        const n = await call<number>('setValue', { name: 'tuneCount', value: v });
        setC((p) => p && { ...p, tuneCount: n });
      }
      const r = await call<number>('setValue', { name, value: v });
      setC((p) => p && { ...p, [name]: r });
    }, name === 'activeTune' && c && v > c.tuneCount ? `Ajustes 1 a ${v} ligados (o botão troca entre eles).` : undefined);

  return (
    <main className="screen" style={{ gap: 14, paddingTop: 10 }}>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, flexGrow: 1 }}>
        {[1, 2, 3].map((n) => {
          const using = inUse === n;
          const chosen = c.activeTune === n;
          const inButton = n <= c.tuneCount;
          return (
            <div key={n} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, borderWidth: 2, borderColor: using ? 'var(--green)' : chosen ? 'var(--amber)' : undefined }}>
              <span className="num" style={{ fontSize: 40 }}>Ajuste {n}</span>
              <input value={prefs.nomesAjuste[n - 1] ?? ''} maxLength={20} placeholder="Nome do ajuste"
                onChange={(e) => { const nomes = [...prefs.nomesAjuste]; nomes[n - 1] = e.target.value; setPrefs({ nomesAjuste: nomes }); }}
                style={{ height: 36, fontSize: 16, padding: '0 10px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 8 }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: using ? 'var(--green)' : 'var(--muted)' }}>
                {using ? 'EM USO NO MOTOR' : chosen ? 'Escolhido, mas o mapa está vazio' : 'Parado'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                {n === 1 ? 'Mapas principais.' : 'Mapas próprios. Se estiver vazio, a ECU usa o ajuste 1.'}
              </span>
              <span style={{ fontSize: 13, color: inButton ? 'var(--text)' : 'var(--muted)' }}>{inButton ? 'Ligado (entra no botão de troca)' : 'Desligado: a ECU não usa este ajuste'}</span>
              <span style={{ flexGrow: 1 }} />
              <button className={`btn ${chosen ? '' : 'primary'}`} style={{ height: 48, fontSize: 17 }} disabled={busy || chosen} onClick={() => setField('activeTune', n)}>
                {chosen ? 'Escolhido' : 'Usar este ajuste'}
              </button>
              {n > 1 && (zerar === n
                ? <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn" style={{ height: 46, flexGrow: 1, borderColor: 'var(--red)', color: 'var(--red)' }} disabled={busy}
                      onClick={() => { setZerar(undefined); run(() => call('zeroTune', { n }).then(() => undefined), `Ajuste ${n} zerado.`); }}>Apagar os mapas</button>
                    <button className="btn" style={{ height: 46 }} onClick={() => setZerar(undefined)}>Cancelar</button>
                  </div>
                : <button className="btn" style={{ height: 46 }} disabled={busy} onClick={() => setZerar(n)}>Zerar ajuste</button>)}
            </div>
          );
        })}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="label">Ajustes ligados (o botão do painel troca entre eles)</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[1, 2, 3].map((n) => (
              <button key={n} className="btn" disabled={busy} onClick={() => setField('tuneCount', n)}
                style={{ height: 46, borderColor: c.tuneCount === n ? 'var(--amber)' : undefined, borderWidth: 2 }}>{n === 1 ? 'Só o 1' : `1 a ${n}`}</button>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="label">Copiar todos os mapas de um ajuste para outro</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {[1, 2, 3].map((n) => (
              <button key={n} className="btn" style={{ width: 54, height: 46, borderColor: from === n ? 'var(--amber)' : undefined, borderWidth: 2 }} onClick={() => { setFrom(n); if (to === n) setTo(n === 1 ? 2 : 1); }}>{n}</button>
            ))}
            <span style={{ fontSize: 22, padding: '0 6px' }}>→</span>
            {[1, 2, 3].map((n) => (
              <button key={n} className="btn" disabled={n === from} style={{ width: 54, height: 46, borderColor: to === n ? 'var(--amber)' : undefined, borderWidth: 2 }} onClick={() => setTo(n)}>{n}</button>
            ))}
            <span style={{ flexGrow: 1 }} />
            <button className="btn" style={{ height: 46 }} disabled={busy}
              onClick={() => run(() => call('copyTune', { from, to }).then(() => undefined), `Ajuste ${from} copiado para o ajuste ${to}.`)}>Copiar</button>
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {msg ? <div className={`notice ${/copiado|Gravado|zerado/.test(msg) ? 'ok' : 'err'}`} style={{ flexGrow: 1 }}>{msg}</div>
          : s.dirty ? <div className="notice" style={{ flexGrow: 1, background: '#2A2116', color: '#FFD08A' }}>Mudanças valendo, mas ainda não gravadas.</div>
          : <span style={{ flexGrow: 1, fontSize: 13, color: 'var(--muted)' }}>As telas de mapa sempre mostram o mapa do ajuste em uso.</span>}
        <button className="btn" style={{ height: 52, fontSize: 17 }} onClick={() => go('mapaPadrao')}>Mapa padrão</button>
        <button className="btn" style={{ height: 52, fontSize: 17 }} onClick={() => go('ftm')}>Importar mapa .ftm</button>
        <button className="btn primary" style={{ height: 52, width: 200, fontSize: 17 }} disabled={busy || !s.dirty} onClick={() => run(() => call('burn').then(() => undefined), 'Gravado na ECU.')}>Gravar na ECU</button>
      </div>
    </main>
  );
}
