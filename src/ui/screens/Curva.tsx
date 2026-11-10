// Editor de curvas (tabelas de 1 linha): compensações por temperatura, partida etc.
// Cada curva = eixo X (ex.: temperatura) + valores. Toque/arraste nas colunas
// para escolher e use os botões para mudar. Mostra onde o motor está agora.
import { useEffect, useRef, useState } from 'react';
import { call, useLive, useStatus } from '../api';
import { fmt } from '../format';

export interface CurvaDef {
  title: string;
  x: string; // vetor do eixo X no .ini
  y: string; // vetor dos valores
  xUnit: string;
  yUnit: string;
  live?: string; // canal ao vivo do eixo X
  step: number; // passo pequeno, na unidade mostrada
  big: number;
  digits: number;
  xDigits?: number;
  show?: (v: number) => number; // valor do .ini -> valor mostrado (ex.: 1,05 -> +5 %)
  store?: (v: number) => number; // o contrário
  hint?: string;
  toggle?: string; // campo liga/desliga da função (botões Ligado/Desligado em cima da curva)
}

// Compensações e curvas por menu. A chave vira o nome da tela (c_<chave>).
const pct = { show: (v: number) => (v - 1) * 100, store: (v: number) => 1 + v / 100 };
export const CURVAS: Record<string, CurvaDef> = {
  cltFuel: { title: 'Injeção por temperatura do motor', x: 'cltFuelCorrBins', y: 'cltFuelCorr', xUnit: '°C', yUnit: '%', live: 'coolant', step: 1, big: 5, digits: 0, ...pct, hint: 'Quanto a mais (ou a menos) de combustível em cada temperatura do motor.' },
  iatFuel: { title: 'Injeção por temperatura do ar', x: 'iatFuelCorrBins', y: 'iatFuelCorr', xUnit: '°C', yUnit: '%', live: 'intake', step: 1, big: 5, digits: 0, ...pct },
  crankFuel: { title: 'Injeção na partida por temperatura', x: 'crankingFuelBins', y: 'crankingFuelCoef', xUnit: '°C', yUnit: '×', live: 'coolant', step: 0.05, big: 0.5, digits: 2, hint: 'Multiplica o combustível da partida. 1,00 = sem mudança.' },
  prime: { title: 'Pulso inicial ao ligar a chave', x: 'primeBins', y: 'primeValues', xUnit: '°C', yUnit: 'mg', live: 'coolant', step: 5, big: 25, digits: 0 },
  accelCold: { title: 'Rápida de aceleração com motor frio', x: 'tpsAccelCltBins', y: 'tpsAccelCltMult', xUnit: '°C', yUnit: '×', live: 'coolant', step: 0.02, big: 0.2, digits: 2, hint: 'Multiplica a rápida de aceleração. 1,00 = igual ao motor quente.' },
  crankAdv: { title: 'Avanço na partida por rotação', x: 'crankingAdvanceBins', y: 'crankingAdvance', xUnit: 'RPM', yUnit: '°', live: 'RPMValue', step: 0.5, big: 2, digits: 1 },
  crankAdvClt: { title: 'Avanço na partida por temperatura', x: 'crankingAdvanceCltBins', y: 'crankingAdvanceCltAdder', xUnit: '°C', yUnit: '°', live: 'coolant', step: 0.5, big: 2, digits: 1, hint: 'Soma ao avanço da partida.' },
  idleTps: { title: 'Mapa de marcha lenta por TPS', x: 'injTimeIdleRpmBins', y: 'injTimeIdleTable', xUnit: 'RPM', yUnit: 'ms', live: 'RPMValue', step: 0.05, big: 0.5, digits: 2, toggle: 'injTimeIdleTableEnabled',
    hint: 'Só com o mapa principal por TPS. Com a borboleta fechada (abaixo do TPS de lenta), o tempo de injeção vem desta curva em vez do mapa principal.' },
  compMapTps: { title: 'Compensação por MAP / TPS', x: 'injTimeLoadCompBins', y: 'injTimeLoadComp', xUnit: 'TPS % (mapa por MAP) ou MAP kPa (mapa por TPS)', yUnit: '%', step: 1, big: 5, digits: 1, toggle: 'injTimeLoadCompEnabled',
    hint: 'Usa o sensor que o mapa principal não usa: mapa por MAP → compensa por TPS; mapa por TPS → compensa por MAP. Corrige só a parte útil do pulso.' },
  crankIdle: { title: 'Posição do atuador de lenta na partida', x: 'cltCrankingCorrBins', y: 'cltCrankingCorr', xUnit: '°C', yUnit: '%', live: 'coolant', step: 1, big: 5, digits: 0, hint: 'Quanto o atuador abre durante a partida, pela temperatura do motor.' },
  idleRpm: { title: 'Rotação da marcha lenta por temperatura', x: 'cltIdleRpmBins', y: 'cltIdleRpm', xUnit: '°C', yUnit: 'RPM', live: 'coolant', step: 20, big: 100, digits: 0 },
  revClt: { title: 'Corte de rotação por temperatura', x: 'cltRevLimitRpmBins', y: 'cltRevLimitRpm', xUnit: '°C', yUnit: 'RPM', live: 'coolant', step: 100, big: 500, digits: 0, hint: 'Motor frio corta mais cedo.' },
  etbOpen: { title: 'Velocidade de abertura da borboleta', x: 'etbSpeedCltBins', y: 'etbOpenSpeed', xUnit: '°C', yUnit: '%/s', live: 'coolant', step: 10, big: 100, digits: 0, hint: '0 = sem limite. Motor frio abre mais devagar.' },
  etbClose: { title: 'Velocidade de fechamento da borboleta', x: 'etbSpeedCltBins', y: 'etbCloseSpeed', xUnit: '°C', yUnit: '%/s', live: 'coolant', step: 10, big: 100, digits: 0, hint: '0 = sem limite.' },
  coldStartPulse: { title: 'Pulso do bico de partida a frio', x: 'coldStartInjectorCltBins', y: 'coldStartInjectorPulse', xUnit: '°C', yUnit: 'ms', live: 'coolant', step: 1, big: 5, digits: 1 },
  stftAdd: { title: 'Malha fechada: quanto pode adicionar (por MAP)', x: 'stftLimitMapBins', y: 'stftLimitMaxAdd', xUnit: 'kPa', yUnit: '%', live: 'MAPValue', step: 1, big: 5, digits: 0, hint: 'Vale quando "Limites" estiver "Por MAP".' },
  stftRemove: { title: 'Malha fechada: quanto pode tirar (por MAP)', x: 'stftLimitMapBins', y: 'stftLimitMaxRemove', xUnit: 'kPa', yUnit: '%', live: 'MAPValue', step: 1, big: 5, digits: 0, hint: 'Vale quando "Limites" estiver "Por MAP".' },
  boostEthanol: { title: 'Pressão máxima por % de etanol', x: 'alertBoostEthanolBins', y: 'alertBoostEthanolLimit', xUnit: '% etanol', yUnit: 'kPa', live: 'flexPercent', step: 5, big: 20, digits: 0, hint: 'Usado pelo alerta "MAP acima do limite do etanol".' },
  idleAdv: { title: 'Avanço na marcha lenta', x: 'idleAdvanceBins', y: 'idleAdvance', xUnit: 'RPM', yUnit: '°', live: 'RPMValue', step: 0.5, big: 2, digits: 1 },
  oilCurve: { title: 'Sensor de pressão de óleo (8 pontos)', x: 'oilPressureCurve_voltage', y: 'oilPressureCurve_value', xUnit: 'V', yUnit: 'kPa', live: 'rawOilPressure', step: 5, big: 25, digits: 0, xDigits: 2, hint: 'Ligue "Curva de 8 pontos" em Sensores para usar.' },
  fuelCurve: { title: 'Sensor de pressão de combustível (8 pontos)', x: 'lowPressureFuelCurve_voltage', y: 'lowPressureFuelCurve_value', xUnit: 'V', yUnit: 'kPa', live: 'rawLowFuelPressure', step: 5, big: 25, digits: 0, xDigits: 2, hint: 'Ligue "Curva de 8 pontos" em Sensores para usar.' },
  dwell: { title: 'Tempo de carga da bobina (dwell)', x: 'sparkDwellRpmBins', y: 'sparkDwellValues', xUnit: 'RPM', yUnit: 'ms', live: 'RPMValue', step: 0.1, big: 0.5, digits: 1 },
  dwellVolt: { title: 'Tempo de carga da bobina por bateria', x: 'dwellVoltageCorrVoltBins', y: 'dwellVoltageCorrValues', xUnit: 'V', yUnit: '×', live: 'VBatt', step: 0.02, big: 0.1, digits: 2, xDigits: 1 },
};

// Curva do limite por RPM de cada alerta (o eixo de RPM é o mesmo para os 8).
for (let i = 1; i <= 8; i++) {
  CURVAS[`alert${i}`] = { title: `Alerta ${i}: limite por RPM`, x: 'alertRpmBins', y: `alerts${i}_curve`, xUnit: 'RPM', yUnit: '', live: 'RPMValue', step: 1, big: 10, digits: 1,
    hint: 'O limite muda com a rotação. Mesma unidade do sensor do alerta.' };
}

export function Curva({ id }: { id: string }) {
  const def = CURVAS[id];
  const s = useStatus();
  const live = useLive(def.live ? [def.live] : []);
  const [xs, setXs] = useState<number[]>();
  const [ys, setYs] = useState<number[]>();
  const [sel, setSel] = useState<[number, number]>([0, 0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [on, setOn] = useState<number>();
  const dragging = useRef(false);
  const show = def.show ?? ((v: number) => v);
  const store = def.store ?? ((v: number) => v);

  useEffect(() => {
    if (s.state !== 'conectado') return;
    call<Record<string, number[]>>('constants', { names: [def.x, def.y] }).then((c) => { setXs(c[def.x]); setYs(c[def.y]); }, (e) => setMsg(e.message));
    if (def.toggle) call<Record<string, number>>('constants', { names: [def.toggle] }).then((c) => setOn(c[def.toggle!]), (e) => setMsg(e.message));
  }, [s.state, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (s.state !== 'conectado') return <main className="screen"><div className="notice err">Conecte na ECU para ver a curva.</div></main>;
  if (!xs || !ys) return <main className="screen"><span className="label">{msg ?? 'Lendo…'}</span></main>;

  const shown = ys.map(show);
  const lo = Math.min(0, ...shown), hi = Math.max(...shown, lo + 1e-6);
  const a = Math.min(...sel), b = Math.max(...sel);
  const lv = def.live ? live[def.live] : null;
  let liveI = -1;
  if (lv != null) xs.forEach((x, i) => { if (liveI < 0 || Math.abs(x - lv) < Math.abs(xs[liveI] - lv)) liveI = i; });

  async function change(delta: number) {
    const cells = [];
    for (let i = a; i <= b; i++) cells.push({ index: i, value: store(Math.round((shown[i] + delta) * 1e4) / 1e4) });
    setBusy(true);
    try { setYs(await call<number[]>('setArray', { name: def.y, cells })); setMsg(undefined); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }
  async function setToggle(v: number) {
    setBusy(true);
    try { setOn(await call<number>('setValue', { name: def.toggle, value: v })); setMsg(undefined); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }
  async function burn() {
    setBusy(true);
    try { await call('burn'); setMsg('Gravado na ECU.'); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <main className="screen" style={{ flexDirection: 'row', gap: 14, paddingTop: 10 }}>
      <section className="card" style={{ flexGrow: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}
        onPointerUp={() => (dragging.current = false)} onPointerLeave={() => (dragging.current = false)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="num" style={{ fontSize: 22, flexGrow: 1 }}>{def.title}</span>
          {def.toggle && on !== undefined && ([[0, 'Desligado'], [1, 'Ligado']] as const).map(([v, t]) => (
            <button key={v} className="btn" disabled={busy} onClick={() => setToggle(v)}
              style={{ height: 42, width: 110, borderWidth: 2, borderColor: on === v ? (v ? 'var(--green)' : 'var(--amber)') : undefined }}>{t}</button>
          ))}
        </div>
        {def.hint && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{def.hint}</span>}
        <div style={{ flexGrow: 1, display: 'grid', gridTemplateColumns: `repeat(${xs.length}, minmax(0, 1fr))`, gap: 4, alignItems: 'end', minHeight: 0 }}>
          {shown.map((v, i) => {
            const h = ((v - lo) / (hi - lo)) * 100;
            const on = i >= a && i <= b;
            return (
              <button key={i} aria-label={`${fmt(xs[i], def.xDigits ?? 0)} ${def.xUnit}: ${fmt(v, def.digits)} ${def.yUnit}`}
                onPointerDown={(e) => { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); dragging.current = true; setSel([i, i]); }}
                onPointerEnter={() => dragging.current && setSel((p) => [p[0], i])}
                style={{ height: '100%', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4 }}>
                <span className="num" style={{ fontSize: 14, textAlign: 'center', color: on ? 'var(--amber)' : 'var(--text)' }}>{fmt(v, def.digits)}</span>
                <span style={{ height: `${Math.max(2, h * 0.8)}%`, borderRadius: 4, background: on ? 'var(--amber)' : i === liveI ? 'var(--cyan)' : '#2E5C6E',
                  outline: i === liveI ? '2px solid var(--cyan)' : 'none', outlineOffset: 1 }} />
              </button>
            );
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${xs.length}, minmax(0, 1fr))`, gap: 4 }}>
          {xs.map((x, i) => <span key={i} className="num" style={{ fontSize: 13, textAlign: 'center', color: i === liveI ? 'var(--cyan)' : 'var(--muted)' }}>{fmt(x, def.xDigits ?? 0)}</span>)}
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>{def.xUnit}{lv != null ? ` · agora ${fmt(lv, def.xDigits ?? 0)} ${def.xUnit}` : ''}</span>
      </section>

      <aside style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="label">{b > a ? `${b - a + 1} pontos` : 'Ponto selecionado'}</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{fmt(xs[a], def.xDigits ?? 0)} {def.xUnit}</span>
          <span className="num" style={{ fontSize: 52, color: 'var(--amber)' }}>{fmt(shown[a], def.digits)} <span style={{ fontSize: 18, color: 'var(--muted)' }}>{def.yUnit}</span></span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button className="btn big" disabled={busy} onClick={() => change(-def.step)}>− {fmt(def.step, def.digits)}</button>
          <button className="btn big" disabled={busy} onClick={() => change(def.step)}>+ {fmt(def.step, def.digits)}</button>
          <button className="btn" style={{ height: 52 }} disabled={busy} onClick={() => change(-def.big)}>− {fmt(def.big, def.digits)}</button>
          <button className="btn" style={{ height: 52 }} disabled={busy} onClick={() => change(def.big)}>+ {fmt(def.big, def.digits)}</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Arraste o dedo para escolher vários pontos.</div>
        <span style={{ flexGrow: 1 }} />
        {msg && <div className={`notice ${msg.startsWith('Gravado') ? 'ok' : 'err'}`}>{msg}</div>}
        {s.dirty && !msg && <div className="notice" style={{ background: '#2A2116', color: '#FFD08A' }}>Mudanças valendo, mas ainda não gravadas.</div>}
        <button className="btn primary" style={{ height: 56, fontSize: 18 }} disabled={busy || !s.dirty} onClick={burn}>Gravar na ECU</button>
      </aside>
    </main>
  );
}
