import { useEffect, useState } from 'react';
import { call, useLive, useStatus } from './api';

type Estado = { ligado: boolean; modo: 'auto' | 'manual'; tps: number };

/** Modo demonstração: controle do motor de mentira (ligar, desligar, acelerar), como se fosse o carro. */
export function DemoControle({ desktop }: { desktop?: boolean }) {
  const s = useStatus();
  const v = useLive(['RPMValue', 'TPSValue', 'MAPValue', 'coolant']);
  const [aberto, setAberto] = useState(false);
  const [e, setE] = useState<Estado>({ ligado: true, modo: 'auto', tps: 0 });
  const ctl = (c: Record<string, unknown>) => call<Estado>('demoControle', { c }).then(setE, () => undefined);
  useEffect(() => { if (s.demo) void ctl({}); }, [s.demo]);
  if (!s.demo) return null;
  const pos: React.CSSProperties = desktop ? { position: 'fixed', left: 16, bottom: 40 } : { position: 'absolute', left: 12, bottom: 12 };
  if (!aberto) return (
    <button className="btn demo-ctl-btn" style={{ ...pos, zIndex: 50 }} onClick={() => setAberto(true)}>
      <span className="dot" style={{ width: 10, height: 10, background: e.ligado ? 'var(--green)' : '#5a5e66' }} /> Simulador
    </button>
  );
  return (
    <div className="demo-ctl" style={{ ...pos, zIndex: 50 }}>
      <div className="demo-ctl-cab">
        <b>Simulador do motor</b>
        <span className="demo-ctl-vals">{Math.round(v.RPMValue ?? 0)} RPM · {Math.round(v.MAPValue ?? 0)} kPa · {Math.round(v.coolant ?? 0)} °C</span>
        <button className="btn" onClick={() => setAberto(false)}>✕</button>
      </div>
      <div className="demo-ctl-linha">
        <button className={`btn ${e.ligado ? '' : 'primary'}`} style={{ flex: 1 }} onClick={() => ctl({ ligado: !e.ligado })}>
          {e.ligado ? '■ Desligar motor' : '▶ Dar partida'}</button>
        <button className="btn" onClick={() => ctl({ frio: true })} title="Volta a temperatura do motor para 20 °C">Motor frio</button>
      </div>
      <div className="demo-ctl-linha">
        <button className={`btn ${e.modo === 'auto' ? 'primary' : ''}`} onClick={() => ctl({ modo: 'auto' })}>Automático</button>
        <button className={`btn ${e.modo === 'manual' ? 'primary' : ''}`} onClick={() => ctl({ modo: 'manual', tps: e.tps })}>Eu acelero</button>
      </div>
      <label className="demo-ctl-acel">
        <span>Acelerador <b>{Math.round(e.modo === 'manual' ? e.tps : v.TPSValue ?? 0)} %</b></span>
        <input type="range" min={0} max={100} step={1} value={e.modo === 'manual' ? e.tps : Math.round(v.TPSValue ?? 0)}
          onChange={(ev) => { const t = Number(ev.target.value); setE({ ...e, modo: 'manual', tps: t }); void ctl({ tps: t }); }} />
      </label>
      <div className="demo-ctl-linha">
        {[0, 25, 50, 100].map((t) => <button key={t} className="btn" style={{ flex: 1 }} onClick={() => ctl({ tps: t })}>{t === 0 ? 'Soltar' : `${t} %`}</button>)}
      </div>
    </div>
  );
}
