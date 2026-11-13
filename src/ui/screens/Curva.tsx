// Editor de curvas (tabelas de 1 linha): compensações por temperatura, partida etc.
// Cada curva = eixo X (ex.: temperatura) + valores. Toque/arraste nas colunas
// para escolher e use os botões para mudar. Mostra onde o motor está agora.
import { useEffect, useRef, useState } from 'react';
import { call, useLive, useStatus } from '../api';
import { fmt } from '../format';
import { heat } from './MapaInjecao';

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
  /** Coloca um valor (na unidade mostrada) nos pontos de i0 a i1. */
  async function definir(i0: number, i1: number, v: number) {
    const cells = [];
    for (let i = i0; i <= i1; i++) cells.push({ index: i, value: store(Math.round(v * 1e4) / 1e4) });
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
        <GraficoCurva xs={xs} vals={shown} sel={[a, b]} setSel={setSel} liveI={liveI} lv={lv ?? null} def={def} busy={busy} definir={definir} />
        <TabelaCurva xs={xs} vals={shown} sel={[a, b]} setSel={setSel} liveI={liveI} def={def} busy={busy} definir={definir} />
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
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Arraste uma bolinha para cima ou para baixo para mudar o valor. Arraste no fundo do gráfico ou na tabela para escolher vários pontos. Dois cliques na tabela para digitar.</div>
        <span style={{ flexGrow: 1 }} />
        {msg && <div className={`notice ${msg.startsWith('Gravado') ? 'ok' : 'err'}`}>{msg}</div>}
        {s.dirty && !msg && <div className="notice" style={{ background: '#2A2116', color: '#FFD08A' }}>Mudanças valendo, mas ainda não gravadas.</div>}
        <button className="btn primary" style={{ height: 56, fontSize: 18 }} disabled={busy || !s.dirty} onClick={burn}>Gravar na ECU</button>
      </aside>
    </main>
  );
}

type Props = { xs: number[]; vals: number[]; sel: [number, number]; setSel: (s: [number, number]) => void; liveI: number; def: CurvaDef; busy: boolean;
  definir: (i0: number, i1: number, v: number) => Promise<void> };

/** Passo "redondo" (1, 2, 2,5, 5 × 10ⁿ) para uns n intervalos. */
function passo(range: number, n: number) { const raw = range / n || 1, e = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map((m) => m * e).find((x) => x >= raw * 0.99) ?? raw; }
function marcas(lo: number, hi: number, st: number) { const out: number[] = []; for (let v = Math.ceil(lo / st - 1e-9) * st; v <= hi + 1e-9; v += st) out.push(Math.round(v * 1e6) / 1e6 || 0); return out; }

/**
 * Gráfico da curva no estilo dos programas profissionais: escala de valores do lado esquerdo, escala do eixo X embaixo
 * (proporcional, com marcas finas), linha com bolinhas que dá para arrastar, faixa da posição atual do motor.
 */
function GraficoCurva({ xs, vals, sel, setSel, liveI, lv, def, busy, definir }: Props & { lv: number | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: 800, h: 360 });
  const [arraste, setArraste] = useState<{ i: number; v: number; lo: number; hi: number }>();
  const selArr = useRef<number | undefined>(undefined);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setTam({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const mostra = vals.map((v, i) => (arraste && i >= sel[0] && i <= sel[1] && arraste.i >= sel[0] && arraste.i <= sel[1] ? arraste.v : arraste && i === arraste.i ? arraste.v : v));
  // escala Y: fica parada enquanto arrasta
  let lo = Math.min(0, ...vals), hi = Math.max(...vals);
  if (hi - lo < 1e-6) hi = lo + 1;
  const pad = (hi - lo) * 0.12; lo = lo < 0 ? lo - pad : lo; hi += pad;
  if (arraste) { lo = arraste.lo; hi = arraste.hi; }
  const yStep = passo(hi - lo, 6);
  lo = Math.floor(lo / yStep) * yStep; hi = Math.ceil(hi / yStep) * yStep;
  const x0 = xs[0], x1 = xs[xs.length - 1] === x0 ? x0 + 1 : xs[xs.length - 1];
  const L = 58, R = 18, T = 14, B = 44, W = Math.max(200, tam.w), H = Math.max(160, tam.h);
  const px = (x: number) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const py = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const xStep = passo(x1 - x0, Math.max(4, Math.floor((W - L - R) / 70)));
  const yMin = yStep / 5, xMin = xStep / 5;
  const cor = (i: number) => (i >= sel[0] && i <= sel[1] ? 'var(--amber)' : 'var(--green)');
  const valorDoY = (clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    const v = lo + (1 - (clientY - r.top - T) / (H - T - B)) * (hi - lo);
    return Math.round(v / def.step) * def.step;
  };
  const colunaDoX = (clientX: number) => {
    const r = box.current!.getBoundingClientRect(); const x = clientX - r.left;
    let best = 0; xs.forEach((xv, i) => { if (Math.abs(px(xv) - x) < Math.abs(px(xs[best]) - x)) best = i; });
    return best;
  };
  return (
    <div ref={box} className="cv-graf" style={{ flexGrow: 1, minHeight: 220, position: 'relative', touchAction: 'none' }}
      onPointerDown={(e) => {
        if (busy) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const t = (e.target as Element).getAttribute('data-i');
        if (t != null) {
          const i = Number(t);
          if (!(i >= sel[0] && i <= sel[1])) setSel([i, i]);
          setArraste({ i, v: vals[i], lo, hi });
        } else { const i = colunaDoX(e.clientX); selArr.current = i; setSel([i, i]); }
      }}
      onPointerMove={(e) => {
        if (arraste) setArraste({ ...arraste, v: valorDoY(e.clientY) });
        else if (selArr.current != null) setSel([selArr.current, colunaDoX(e.clientX)]);
      }}
      onPointerUp={() => {
        if (arraste) {
          const d = arraste; setArraste(undefined);
          if (Math.abs(d.v - vals[d.i]) > 1e-9) {
            const dentro = d.i >= sel[0] && d.i <= sel[1];
            void definir(dentro ? sel[0] : d.i, dentro ? sel[1] : d.i, d.v);
          }
        }
        selArr.current = undefined;
      }}>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, display: 'block' }}>
        <defs>
          <linearGradient id="cv-fundo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b3038" /><stop offset="1" stopColor="#1b1e23" /></linearGradient>
        </defs>
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="url(#cv-fundo)" />
        {/* faixa de pontos selecionados */}
        <rect x={px(xs[sel[0]]) - 6} y={T} width={px(xs[sel[1]]) - px(xs[sel[0]]) + 12} height={H - T - B} fill="rgba(255,159,28,0.10)" />
        {/* linhas verticais em cada ponto da curva */}
        {xs.map((x, i) => <line key={i} x1={px(x)} x2={px(x)} y1={T} y2={H - B} stroke="#454b55" strokeWidth={1} />)}
        {/* escala Y (esquerda): marcas grandes com número e marcas finas */}
        <line x1={L} x2={L} y1={T} y2={H - B} stroke="#c9ccd1" strokeWidth={2} />
        {marcas(lo, hi, yMin).map((v) => { const big = Math.abs(v / yStep - Math.round(v / yStep)) < 1e-6; return (
          <line key={`ym${v}`} x1={L - (big ? 10 : 5)} x2={L} y1={py(v)} y2={py(v)} stroke="#c9ccd1" strokeWidth={big ? 2 : 1} />); })}
        {marcas(lo, hi, yStep).map((v) => <text key={`y${v}`} x={L - 14} y={py(v) + 5} fill="var(--text)" fontSize={14} fontWeight={600} textAnchor="end">{fmt(v, yStep < 1 ? (yStep < 0.1 ? 2 : 1) : 0)}</text>)}
        {lo < 0 && <line x1={L} x2={W - R} y1={py(0)} y2={py(0)} stroke="#8a9099" strokeDasharray="4 4" />}
        {/* escala X (embaixo) */}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="#c9ccd1" strokeWidth={2} />
        {marcas(x0, x1, xMin).map((v) => { const big = Math.abs(v / xStep - Math.round(v / xStep)) < 1e-6; return (
          <line key={`xm${v}`} x1={px(v)} x2={px(v)} y1={H - B} y2={H - B + (big ? 10 : 5)} stroke="#c9ccd1" strokeWidth={big ? 2 : 1} />); })}
        {marcas(x0, x1, xStep).map((v) => <text key={`x${v}`} x={px(v)} y={H - B + 26} fill="var(--text)" fontSize={13} textAnchor="middle">{fmt(v, def.xDigits ?? 0)}</text>)}
        <text x={W - R} y={H - 4} fill="var(--muted)" fontSize={12} textAnchor="end">{def.xUnit}</text>
        <text x={6} y={T + 2} fill="var(--muted)" fontSize={12} dominantBaseline="hanging">{def.yUnit}</text>
        {/* onde o motor está agora */}
        {lv != null && lv >= x0 && lv <= x1 && <>
          <line x1={px(lv)} x2={px(lv)} y1={T} y2={H - B} stroke="var(--cyan)" strokeWidth={2} />
          <text x={px(lv) + 4} y={T + 14} fill="var(--cyan)" fontSize={12}>agora {fmt(lv, def.xDigits ?? 0)}</text>
        </>}
        {/* linha e bolinhas */}
        <polyline points={xs.map((x, i) => `${px(x)},${py(mostra[i])}`).join(' ')} fill="none" stroke="var(--green)" strokeWidth={2.5} />
        {xs.map((x, i) => (
          <g key={i}>
            <circle cx={px(x)} cy={py(mostra[i])} r={i === liveI ? 8 : 6} fill={cor(i)} stroke={i === liveI ? 'var(--cyan)' : '#0b0c0e'} strokeWidth={2} />
            <circle data-i={i} cx={px(x)} cy={py(mostra[i])} r={16} fill="transparent" style={{ cursor: busy ? 'default' : 'ns-resize' }} />
          </g>
        ))}
        {arraste && <text x={px(xs[arraste.i])} y={py(arraste.v) - 16} fill="var(--amber)" fontSize={16} fontWeight={700} textAnchor="middle">{fmt(arraste.v, def.digits)}</text>}
      </svg>
    </div>
  );
}

/** Tabela embaixo do gráfico: linha do eixo X e linha dos valores, com cor pelo valor (como nos mapas). */
function TabelaCurva({ xs, vals, sel, setSel, liveI, def, busy, definir }: Props) {
  const [editando, setEditando] = useState<string>();
  const arr = useRef<number | undefined>(undefined);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const dentro = (i: number) => i >= sel[0] && i <= sel[1];
  const cols = `64px repeat(${xs.length}, minmax(0, 1fr))`;
  const salvar = () => {
    const v = Number(String(editando).replace(',', '.'));
    setEditando(undefined);
    if (Number.isFinite(v)) void definir(sel[0], sel[1], v);
  };
  return (
    <div className="cv-tab" onPointerUp={() => (arr.current = undefined)} onPointerLeave={() => (arr.current = undefined)}>
      <div style={{ display: 'grid', gridTemplateColumns: cols }}>
        <span className="cv-cab">{def.xUnit}</span>
        {xs.map((x, i) => <span key={i} className={`cv-cab ${i === liveI ? 'agora' : ''}`}>{fmt(x, def.xDigits ?? 0)}</span>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: cols }}>
        <span className="cv-cab">{def.yUnit}</span>
        {vals.map((v, i) => (
          <button key={i} className={`cv-cel ${dentro(i) ? 'sel' : ''}`} disabled={busy}
            style={{ background: heat(v, lo, hi === lo ? lo + 1 : hi) }}
            onPointerDown={(e) => { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); arr.current = i; setSel(e.shiftKey ? [sel[0], i] : [i, i]); }}
            onPointerEnter={() => arr.current != null && setSel([arr.current, i])}
            onDoubleClick={() => { setSel(dentro(i) ? sel : [i, i]); setEditando(fmt(v, def.digits)); }}>
            {editando != null && i === sel[0]
              ? <input autoFocus value={editando} onChange={(e) => setEditando(e.target.value)} onBlur={salvar}
                  onKeyDown={(e) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(undefined); }}
                  onPointerDown={(e) => e.stopPropagation()} />
              : fmt(v, def.digits)}
          </button>
        ))}
      </div>
    </div>
  );
}
