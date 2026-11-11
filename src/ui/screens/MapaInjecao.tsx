import { useEffect, useMemo, useRef, useState } from 'react';
import { call, useLive, useStatus, useTable, type TableData } from '../api';
import { fmt } from '../format';
import { isDesktop } from '../App';
import { Grafico3D } from './Grafico3D';
import { SPEEDUINO_IGN, SPEEDUINO_VE } from './TabelasEcu';

export interface MapaConfig {
  tables: [string, string, string]; // nome da tabela no .ini para os ajustes 1, 2 e 3
  unit: string; // unidade mostrada na célula grande
  digits: number;
  small: [string, (v: number) => number, (v: number) => number]; // rótulo, menos, mais
  big: [string, (v: number) => number, (v: number) => number];
  msStrategy?: boolean; // mostra o aviso "usar o mapa em ms"
  y?: { name: string; unit: string; live: string; digits?: number }; // eixo Y comum (não é pressão), ex.: marcha
  x?: { name: string; unit: string; live: string; digits?: number }; // eixo X que não é RPM
  yLiveName?: string; // canal ao vivo do eixo Y quando ele é pressão
}

export const MAPA_INJECAO: MapaConfig = {
  tables: ['injTimeTableTbl', 'tune2InjTimeTbl', 'tune3InjTimeTbl'], unit: 'ms', digits: 2, msStrategy: true,
  small: ['0,05', (v) => v - 0.05, (v) => v + 0.05],
  big: ['5 %', (v) => v * 0.95, (v) => v * 1.05],
};

export const MAPA_IGNICAO: MapaConfig = {
  tables: ['ignitionTableTbl', 'tune2IgnitionTbl', 'tune3IgnitionTbl'], unit: '°', digits: 1,
  small: ['0,5°', (v) => v - 0.5, (v) => v + 0.5],
  big: ['2°', (v) => v - 2, (v) => v + 2],
};
type Sel = { r0: number; c0: number; r1: number; c1: number };

export function heat(v: number, lo: number, hi: number) {
  const t = hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 0;
  const stops = [[31, 58, 95], [46, 92, 110], [122, 90, 30], [168, 50, 30]];
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  return `rgb(${stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f)).join(',')})`;
}

/** Índice do eixo mais perto do valor ao vivo (para marcar onde o motor está). */
function nearest(bins: number[], v: number | null | undefined) {
  if (v == null) return -1;
  let best = 0;
  bins.forEach((b, i) => { if (Math.abs(b - v) < Math.abs(bins[best] - v)) best = i; });
  return best;
}

export const TABELAS: Record<string, MapaConfig & { title: string }> = {
  gearFuel: { title: 'Injeção por marcha', tables: ['gearFuelTableTbl', 'gearFuelTableTbl', 'gearFuelTableTbl'], unit: '%', digits: 0,
    small: ['1 %', (v) => v - 1, (v) => v + 1], big: ['5 %', (v) => v - 5, (v) => v + 5], y: { name: 'Marcha', unit: 'ª', live: 'detectedGear' } },
  gearTiming: { title: 'Avanço por marcha', tables: ['gearTimingTableTbl', 'gearTimingTableTbl', 'gearTimingTableTbl'], unit: '°', digits: 1,
    small: ['0,5°', (v) => v - 0.5, (v) => v + 0.5], big: ['2°', (v) => v - 2, (v) => v + 2], y: { name: 'Marcha', unit: 'ª', live: 'detectedGear' } },
  postCrank: { title: 'Enriquecimento pós-partida', tables: ['postCrankingEnrichmentTbl', 'postCrankingEnrichmentTbl', 'postCrankingEnrichmentTbl'], unit: '×', digits: 2,
    small: ['0,05', (v) => v - 0.05, (v) => v + 0.05], big: ['0,2', (v) => v - 0.2, (v) => v + 0.2],
    y: { name: 'Motor °C', unit: '°C', live: 'coolant' }, x: { name: 'Ciclos', unit: 'ciclos', live: 'postCrankingAxis' } },
  boostOpen: { title: 'Turbo: duty da válvula (malha aberta)', tables: ['boostTableTbl', 'tune2BoostOpenTbl', 'tune3BoostOpenTbl'], unit: '%', digits: 1,
    small: ['0,5 %', (v) => v - 0.5, (v) => v + 0.5], big: ['5 %', (v) => v - 5, (v) => v + 5], y: { name: 'TPS %', unit: '%', live: 'TPSValue' } },
  boostClosed: { title: 'Turbo: pressão alvo (malha fechada)', tables: ['boostClosedTbl', 'tune2BoostClosedTbl', 'tune3BoostClosedTbl'], unit: 'kPa', digits: 0,
    small: ['2 kPa', (v) => v - 2, (v) => v + 2], big: ['10 kPa', (v) => v - 10, (v) => v + 10], y: { name: 'TPS %', unit: '%', live: 'TPSValue' } },
  lambda: { title: 'Lambda alvo', tables: ['lambdaTableTbl', 'tune2LambdaTbl', 'tune3LambdaTbl'], unit: 'λ', digits: 2,
    small: ['0,01', (v) => v - 0.01, (v) => v + 0.01], big: ['0,05', (v) => v - 0.05, (v) => v + 0.05] },
  deadTime: { title: 'Tempo morto dos bicos (bateria × pressão)', tables: ['injectorsDeadTime', 'injectorsDeadTime', 'injectorsDeadTime'], unit: 'ms', digits: 2,
    small: ['0,01', (v) => v - 0.01, (v) => v + 0.01], big: ['0,1', (v) => v - 0.1, (v) => v + 0.1],
    x: { name: 'Bateria', unit: 'V', live: 'VBatt', digits: 1 }, y: { name: 'Pressão', unit: 'kPa', live: 'lowFuelPressure' } },
  tcTiming: { title: 'Controle de tração: retardo de ponto', tables: ['tractionTimingTableTbl', 'tractionTimingTableTbl', 'tractionTimingTableTbl'], unit: '°', digits: 0,
    small: ['1°', (v) => v - 1, (v) => v + 1], big: ['5°', (v) => v - 5, (v) => v + 5],
    x: { name: 'Velocidade', unit: 'km/h', live: 'vehicleSpeedKph' }, y: { name: 'Patinagem', unit: '×', live: 'wheelSlipRatio' } },
  alsPonto: { title: 'Anti-lag: correção de ponto', tables: ['IgnRetardTableALS', 'IgnRetardTableALS', 'IgnRetardTableALS'], unit: '°', digits: 1,
    small: ['1°', (v) => v - 1, (v) => v + 1], big: ['5°', (v) => v - 5, (v) => v + 5],
    x: { name: 'RPM', unit: 'RPM', live: 'RPMValue' }, y: { name: 'TPS', unit: '%', live: 'TPSValue' } },
  alsComb: { title: 'Anti-lag: combustível a mais', tables: ['FuelAdderTableALS', 'FuelAdderTableALS', 'FuelAdderTableALS'], unit: '%', digits: 1,
    small: ['1 %', (v) => v - 1, (v) => v + 1], big: ['5 %', (v) => v - 5, (v) => v + 5],
    x: { name: 'RPM', unit: 'RPM', live: 'RPMValue' }, y: { name: 'TPS', unit: '%', live: 'TPSValue' } },
  alsCorte: { title: 'Anti-lag: corte de ignição', tables: ['IgnSkipTableALS', 'IgnSkipTableALS', 'IgnSkipTableALS'], unit: '', digits: 0,
    small: ['10', (v) => v - 10, (v) => v + 10], big: ['50', (v) => v - 50, (v) => v + 50],
    x: { name: 'RPM', unit: 'RPM', live: 'RPMValue' }, y: { name: 'TPS', unit: '%', live: 'TPSValue' } },
  tcSkip: { title: 'Controle de tração: corte de ignição', tables: ['tractionIgnitionSkipTableTbl', 'tractionIgnitionSkipTableTbl', 'tractionIgnitionSkipTableTbl'], unit: '%', digits: 0,
    small: ['1 %', (v) => v - 1, (v) => v + 1], big: ['10 %', (v) => v - 10, (v) => v + 10],
    x: { name: 'Velocidade', unit: 'km/h', live: 'vehicleSpeedKph' }, y: { name: 'Patinagem', unit: '×', live: 'wheelSlipRatio' } },
  tcEtb: { title: 'Controle de tração: fechar a borboleta', tables: ['tractionEtbTableTbl', 'tractionEtbTableTbl', 'tractionEtbTableTbl'], unit: '%', digits: 0,
    small: ['1 %', (v) => v - 1, (v) => v + 1], big: ['5 %', (v) => v - 5, (v) => v + 5],
    x: { name: 'Velocidade', unit: 'km/h', live: 'vehicleSpeedKph' }, y: { name: 'Patinagem', unit: '×', live: 'wheelSlipRatio' } },
  vvt: { title: 'Comando variável (VVT): alvo do comando', tables: ['vvtTable1Tbl', 'vvtTable1Tbl', 'vvtTable1Tbl'], unit: '°', digits: 0,
    small: ['1°', (v) => v - 1, (v) => v + 1], big: ['5°', (v) => v - 5, (v) => v + 5], y: { name: 'Carga', unit: '%', live: 'fuelingLoad' } },
  injPhase: { title: 'Ângulo de injeção', tables: ['injPhaseTableTbl', 'injPhaseTableTbl', 'injPhaseTableTbl'], unit: '°', digits: 0,
    small: ['5°', (v) => v - 5, (v) => v + 5], big: ['30°', (v) => v - 30, (v) => v + 30], y: { name: 'Carga', unit: '%', live: 'fuelingLoad' } },
  accel: { title: 'Injeção rápida (borboleta antes × depois)', tables: ['tpsTpsAccelTbl', 'tpsTpsAccelTbl', 'tpsTpsAccelTbl'], unit: 'ms', digits: 2,
    small: ['0,1', (v) => v - 0.1, (v) => v + 0.1], big: ['0,5', (v) => v - 0.5, (v) => v + 0.5],
    x: { name: 'TPS antes', unit: '%', live: 'tpsFrom' }, y: { name: 'TPS depois', unit: '%', live: 'tpsTo' } },
  ignClt: { title: 'Avanço por temperatura do motor', tables: ['ignitionCltCorrTable', 'ignitionCltCorrTable', 'ignitionCltCorrTable'], unit: '°', digits: 1,
    small: ['0,5°', (v) => v - 0.5, (v) => v + 0.5], big: ['2°', (v) => v - 2, (v) => v + 2],
    x: { name: 'Motor', unit: '°C', live: 'coolant' }, y: { name: 'Carga', unit: 'kPa', live: 'ignitionLoad' } },
  ignIat: { title: 'Avanço por temperatura do ar', tables: ['ignitionIatCorrTableTbl', 'ignitionIatCorrTableTbl', 'ignitionIatCorrTableTbl'], unit: '°', digits: 1,
    small: ['0,5°', (v) => v - 0.5, (v) => v + 0.5], big: ['2°', (v) => v - 2, (v) => v + 2],
    x: { name: 'Ar', unit: '°C', live: 'intake' }, y: { name: 'Carga', unit: 'kPa', live: 'ignitionLoad' } },
  shiftRetard: { title: 'Retardo do ponto depois da troca', tables: ['shiftTimingRetardTbl', 'shiftTimingRetardTbl', 'shiftTimingRetardTbl'], unit: '°', digits: 1,
    small: ['0,5°', (v) => v - 0.5, (v) => v + 0.5], big: ['2°', (v) => v - 2, (v) => v + 2],
    y: { name: 'Marcha', unit: 'ª', live: 'detectedGear' }, x: { name: 'Segundos', unit: 's', live: 'timeSinceShift', digits: 1 } },
  shiftFuel: { title: 'Combustível depois da troca', tables: ['shiftFuelTbl', 'shiftFuelTbl', 'shiftFuelTbl'], unit: '%', digits: 0,
    small: ['1 %', (v) => v - 1, (v) => v + 1], big: ['5 %', (v) => v - 5, (v) => v + 5],
    y: { name: 'Marcha', unit: 'ª', live: 'detectedGear' }, x: { name: 'Segundos', unit: 's', live: 'timeSinceShift', digits: 1 } },
  boostShift: { title: 'Turbo: alvo por marcha e tempo após a troca', tables: ['boostShiftTimeTbl', 'boostShiftTimeTbl', 'boostShiftTimeTbl'], unit: 'kPa', digits: 0,
    small: ['2 kPa', (v) => v - 2, (v) => v + 2], big: ['10 kPa', (v) => v - 10, (v) => v + 10],
    y: { name: 'Marcha', unit: 'ª', live: 'detectedGear' }, x: { name: 'Segundos', unit: 's', live: 'timeSinceShift', digits: 1 } },
};
// Ajuste individual por cilindro (injeção em %, ignição em graus).
for (let n = 1; n <= 8; n++) {
  TABELAS[`fuelTrim${n}`] = { title: `Injeção do cilindro ${n}`, tables: [`fuelTrimTbl${n}`, `fuelTrimTbl${n}`, `fuelTrimTbl${n}`], unit: '%', digits: 1,
    small: ['0,2 %', (v) => v - 0.2, (v) => v + 0.2], big: ['1 %', (v) => v - 1, (v) => v + 1], y: { name: 'Carga', unit: '', live: 'fuelingLoad' } };
  TABELAS[`ignTrim${n}`] = { title: `Avanço do cilindro ${n}`, tables: [`ignTrimTbl${n}`, `ignTrimTbl${n}`, `ignTrimTbl${n}`], unit: '°', digits: 1,
    small: ['0,2°', (v) => v - 0.2, (v) => v + 0.2], big: ['1°', (v) => v - 1, (v) => v + 1], y: { name: 'Carga', unit: '', live: 'ignitionLoad' } };
}
// Saídas PWM programáveis 1 a 8 (tabela própria de cada saída).
for (let g = 1; g <= 8; g++) {
  TABELAS[`gppwm${g}`] = { title: `Saída PWM ${g}: tabela`, tables: [`gppwm${g}Tbl`, `gppwm${g}Tbl`, `gppwm${g}Tbl`], unit: '%', digits: 0,
    small: ['1 %', (v) => v - 1, (v) => v + 1], big: ['10 %', (v) => v - 10, (v) => v + 10],
    x: { name: 'Eixo X', unit: '', live: `gppwmXAxis${g}` }, y: { name: 'Eixo Y', unit: '', live: `gppwmYAxis${g}` } };
}

export function MapaInjecao() { const s = useStatus(); return <MapaTabela key={s.family} cfg={s.family === 'speeduino' && s.state === 'conectado' && !s.demo ? SPEEDUINO_VE : MAPA_INJECAO} />; }
export function MapaIgnicao() { const s = useStatus(); return <MapaTabela key={s.family} cfg={s.family === 'speeduino' && s.state === 'conectado' && !s.demo ? SPEEDUINO_IGN : MAPA_IGNICAO} />; }

/** Área de transferência entre mapas (linhas de baixo para cima, como a tabela). */
let clip: number[][] | undefined;

export function MapaTabela({ cfg }: { cfg: MapaConfig }) {
  const tune = useLive(['tuneInUse']).tuneInUse ?? 1; // edita o mapa do ajuste em uso
  const TABLE = cfg.tables[Math.min(3, Math.max(1, tune)) - 1];
  const s = useStatus();
  const { table, setTable, error } = useTable(TABLE);
  const live = useLive(['RPMValue', 'MAPValue', 'TPSValue', 'baroPressure', 'injTimeTableYAxis', 'ignitionLoad', ...[cfg.x?.live, cfg.y?.live, cfg.yLiveName].filter((n): n is string => !!n)]);
  const [sel, setSel] = useState<Sel>({ r0: 0, c0: 0, r1: 0, c1: 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const dragging = useRef(false);
  const [strategy, setStrategy] = useState<{ value: number; names: string[] }>();
  const LM_INJ_TIME = 4;
  // Teclado e botão direito do mouse (programas profissionais para computador): o handler é atualizado a cada render.
  const keyRef = useRef<(e: KeyboardEvent) => void>(undefined);
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const [typing, setTypingRaw] = useState<string>();
  const [typeMode, setTypeMode] = useState<'set' | 'add' | 'mul'>('set');
  const setTyping = (v: string | undefined, mode: 'set' | 'add' | 'mul' = 'set') => { setTypeMode(mode); setTypingRaw(v); };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current?.(e);
    const close = () => setMenu(undefined);
    window.addEventListener('keydown', h);
    window.addEventListener('click', close);
    return () => { window.removeEventListener('keydown', h); window.removeEventListener('click', close); };
  }, []);
  useEffect(() => {
    if (s.state !== 'conectado' || !cfg.msStrategy) return;
    Promise.all([call<Record<string, number>>('constants', { names: ['fuelAlgorithm'] }), call<string[]>('options', { name: 'fuelAlgorithm' })])
      .then(([c, names]) => setStrategy({ value: c.fuelAlgorithm, names }), () => undefined);
  }, [s.state]);

  const range = useMemo(() => {
    if (!table) return [0, 1];
    return [Math.min(...table.values), Math.max(...table.values)];
  }, [table]);

  if (s.state !== 'conectado') return <main className="screen"><div className="notice err">Conecte na ECU para ver o mapa.</div></main>;
  if (error) return <main className="screen"><div className="notice err">{error}</div></main>;
  if (!table) return <main className="screen"><span className="label">Lendo o mapa…</span></main>;

  const t: TableData = table;
  const tps = !cfg.y && t.yUnits === '%';
  const baro = live.baroPressure && live.baroPressure > 50 ? live.baroPressure : 101.3;
  const yLabel = (kpa: number) => (cfg.y ? fmt(kpa, cfg.y.digits ?? 0) : tps ? `${fmt(kpa)}` : `${kpa - baro > 0 ? '+' : ''}${fmt((kpa - baro) / 100, 2)}`);
  const rowsTopDown = Array.from({ length: t.rows }, (_, i) => t.rows - 1 - i); // carga alta em cima
  const liveC = nearest(t.xBins, cfg.x ? live[cfg.x.live] : live.RPMValue);
  const xName = cfg.x?.name ?? 'RPM';
  const xLabel = (x: number) => (cfg.x ? fmt(x, cfg.x.digits ?? 0) : x >= 1000 ? fmt(x / 1000, 1) + 'k' : fmt(x));
  const yUnit = cfg.y ? cfg.y.unit : tps ? '%' : 'bar';
  const yLive = cfg.y ? live[cfg.y.live] : cfg.yLiveName ? live[cfg.yLiveName] : cfg.msStrategy ? live.injTimeTableYAxis : live.ignitionLoad;
  const liveR = nearest(t.yBins, yLive ?? (tps ? live.TPSValue : live.MAPValue));
  const r0 = Math.min(sel.r0, sel.r1), r1 = Math.max(sel.r0, sel.r1);
  const c0 = Math.min(sel.c0, sel.c1), c1 = Math.max(sel.c0, sel.c1);
  const inSel = (r: number, c: number) => r >= r0 && r <= r1 && c >= c0 && c <= c1;
  const selCount = (r1 - r0 + 1) * (c1 - c0 + 1);
  const first = t.values[r0 * t.cols + c0];

  async function change(fn: (v: number, r: number, c: number) => number, rr0 = r0, rr1 = r1, cc0 = c0, cc1 = c1) {
    const cells: { index: number; value: number }[] = [];
    for (let r = rr0; r <= rr1; r++)
      for (let c = cc0; c <= cc1; c++) {
        const index = r * t.cols + c;
        let v = Math.round(fn(t.values[index], r, c) * 1000) / 1000;
        if (t.min !== undefined && Number.isFinite(t.min)) v = Math.max(t.min, v);
        if (t.max !== undefined && Number.isFinite(t.max)) v = Math.min(t.max, v);
        cells.push({ index, value: v });
      }
    setBusy(true);
    try { setTable(await call<TableData>('setCells', { name: TABLE, cells })); setMsg(undefined); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  const at = (r: number, c: number) => t.values[r * t.cols + c];
  /** Interpola a seleção a partir dos cantos (só linha = horizontal, só coluna = vertical, bloco = os 4 cantos). */
  function interpolate(modo: 'ambos' | 'h' | 'v' = 'ambos') {
    const fx = (c: number) => (c1 > c0 ? (t.xBins[c] - t.xBins[c0]) / (t.xBins[c1] - t.xBins[c0]) : 0);
    const fy = (r: number) => (r1 > r0 ? (t.yBins[r] - t.yBins[r0]) / (t.yBins[r1] - t.yBins[r0]) : 0);
    // h: cada linha entre a 1ª e a última coluna; v: cada coluna entre a 1ª e a última linha
    if (modo === 'h') return change((_, r, c) => at(r, c0) + (at(r, c1) - at(r, c0)) * fx(c));
    if (modo === 'v') return change((_, r, c) => at(r0, c) + (at(r1, c) - at(r0, c)) * fy(r));
    return change((_, r, c) => {
      const top = at(r0, c0) + (at(r0, c1) - at(r0, c0)) * fx(c);
      const bot = at(r1, c0) + (at(r1, c1) - at(r1, c0)) * fx(c);
      return top + (bot - top) * fy(r);
    });
  }
  /** Suaviza a seleção: cada célula vira a média dela com as vizinhas (manual de referência, tecla s). */
  function smooth() {
    return change((v, r, c) => {
      let sum = 0, n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= t.rows || cc >= t.cols) continue;
        const w = dr === 0 && dc === 0 ? 2 : 1;
        sum += at(rr, cc) * w; n += w;
      }
      return sum / n;
    });
  }
  function copy() {
    const vals: number[][] = [];
    for (let r = r0; r <= r1; r++) vals.push(Array.from({ length: c1 - c0 + 1 }, (_, i) => at(r, c0 + i)));
    clip = vals;
    void navigator.clipboard?.writeText(vals.slice().reverse().map((row) => row.join('\t')).join('\n')).catch(() => undefined);
    setMsg(undefined);
  }
  function paste() {
    if (!clip) return;
    const cp = clip;
    const pr1 = Math.min(t.rows - 1, r0 + cp.length - 1), pc1 = Math.min(t.cols - 1, c0 + cp[0].length - 1);
    return change((v, r, c) => cp[r - r0]?.[c - c0] ?? v, r0, pr1, c0, pc1);
  }
  function setValue(text: string) {
    const v = Number(text.replace(',', '.'));
    const mode = typeMode;
    setTyping(undefined);
    if (text.trim() === '' || !Number.isFinite(v)) return;
    if (mode === 'add') void change((x) => x + v);
    else if (mode === 'mul') void change((x) => x * v);
    else void change(() => v);
  }
  const moveSel = (dr: number, dc: number, extend: boolean) => setSel((p) => {
    const r = Math.max(0, Math.min(t.rows - 1, (extend ? p.r1 : p.r0) + dr));
    const c = Math.max(0, Math.min(t.cols - 1, (extend ? p.c1 : p.c0) + dc));
    return extend ? { ...p, r1: r, c1: c } : { r0: r, c0: c, r1: r, c1: c };
  });
  keyRef.current = (e) => {
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') && el.dataset.cell !== 'edit') return;
    if (typing !== undefined) return; // o campo de digitar cuida das teclas
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key;
    if (busy) return;
    if (k === 'ArrowUp') moveSel(1, 0, e.shiftKey); // carga alta fica em cima
    else if (k === 'ArrowDown') moveSel(-1, 0, e.shiftKey);
    else if (k === 'ArrowLeft') moveSel(0, -1, e.shiftKey);
    else if (k === 'ArrowRight') moveSel(0, 1, e.shiftKey);
    else if (e.code === 'Equal' || e.code === 'NumpadAdd' || k === '+' || e.code === 'Minus' || e.code === 'NumpadSubtract' || k === '-' || k === '_') {
      // manual de referência: + / − normal, Ctrl (ou Option) rápido, Shift lento
      const up = e.code === 'Equal' || e.code === 'NumpadAdd' || k === '+';
      const slow = e.shiftKey && !(up && e.code === 'Equal');
      const base = up ? cfg.small[2] : cfg.small[1];
      void change(e.ctrlKey || e.altKey ? (up ? cfg.big[2] : cfg.big[1]) : slow ? (x: number) => x + (base(x) - x) / 5 : base);
    }
    else if (k === 'PageUp') void change(cfg.big[2]);
    else if (k === 'PageDown') void change(cfg.big[1]);
    else if (mod && k.toLowerCase() === 'c') copy();
    else if (mod && k.toLowerCase() === 'v') void paste();
    else if (mod && k.toLowerCase() === 'a') setSel({ r0: 0, c0: 0, r1: t.rows - 1, c1: t.cols - 1 });
    else if (!mod && k.toLowerCase() === 'i') void interpolate();
    else if (!mod && k.toLowerCase() === 'h') void interpolate('h');
    else if (!mod && k.toLowerCase() === 'v') void interpolate('v');
    else if (!mod && k.toLowerCase() === 's') void smooth();
    else if (!mod && k.toLowerCase() === 'a') setTyping('', 'add');
    else if (!mod && k.toLowerCase() === 'm') setTyping('', 'mul');
    else if (!mod && /^[0-9.,]$/.test(k)) setTyping(k);
    else if (k === 'Enter' || k === 'F2' || k === ' ') setTyping('');
    else return;
    e.preventDefault();
  };

  async function useThisMap() {
    setBusy(true);
    try { await call('setBits', { name: 'fuelAlgorithm', value: LM_INJ_TIME }); setStrategy((p) => p && { ...p, value: LM_INJ_TIME }); setMsg(undefined); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  async function burn() {
    setBusy(true);
    try { await call('burn'); setMsg('Gravado na ECU.'); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  const cols = `56px repeat(${t.cols}, minmax(0, 1fr))`;
  return (
    <main className="screen" style={{ flexDirection: 'row', gap: 14, paddingTop: 10 }}>
      <section className="card" style={{ flexGrow: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}
        onPointerUp={() => (dragging.current = false)} onPointerLeave={() => (dragging.current = false)}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', alignSelf: 'end' }}>{cfg.y ? cfg.y.name : tps ? 'TPS %' : 'bar'} \ {xName}</span>
          {t.xBins.map((x, c) => (
            <span key={c} className="num" style={{ fontSize: 14, fontWeight: 600, color: c === liveC ? 'var(--cyan)' : 'var(--muted)', textAlign: 'center' }}>{xLabel(x)}</span>
          ))}
        </div>
        {rowsTopDown.map((r) => (
          <div key={r} style={{ flexGrow: 1, display: 'grid', gridTemplateColumns: cols, gap: 3 }}>
            <span className="num" style={{ fontSize: 14, fontWeight: 600, color: r === liveR ? 'var(--cyan)' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{yLabel(t.yBins[r])}</span>
            {t.xBins.map((_, c) => {
              const v = t.values[r * t.cols + c];
              const selected = inSel(r, c);
              const isLive = r === liveR && c === liveC;
              return (
                <button key={c} aria-label={`${yLabel(t.yBins[r])} · ${t.xBins[c]} ${cfg.x?.unit ?? 'RPM'}: ${fmt(v, cfg.digits)} ${cfg.unit}`}
                  onPointerDown={(e) => {
                    if (e.button === 2) return;
                    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); dragging.current = true;
                    if (e.shiftKey) setSel((p) => ({ ...p, r1: r, c1: c })); else setSel({ r0: r, c0: c, r1: r, c1: c });
                  }}
                  onDoubleClick={() => setTyping('')}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!inSel(r, c)) setSel({ r0: r, c0: c, r1: r, c1: c }); setMenu({ x: e.clientX, y: e.clientY }); }}
                  onPointerEnter={() => dragging.current && setSel((p) => ({ ...p, r1: r, c1: c }))}
                  style={{
                    border: 'none', borderRadius: 4, padding: 0, cursor: 'pointer', background: heat(v, range[0], range[1]),
                    fontFamily: 'var(--cond)', fontSize: 14, fontWeight: 600, color: '#fff',
                    outline: selected ? '2px solid var(--amber)' : isLive ? '2px solid var(--cyan)' : 'none', outlineOffset: -2,
                    boxShadow: isLive && selected ? 'inset 0 0 0 4px var(--cyan)' : undefined,
                  }}>{fmt(v, cfg.digits)}</button>
              );
            })}
          </div>
        ))}
      </section>

      <aside style={{ width: isDesktop ? 300 : 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isDesktop && (
          <div className="card" style={{ height: 230, flexShrink: 0, padding: 4, position: 'relative' }}>
            <span className="label" style={{ position: 'absolute', left: 12, top: 8, fontSize: 12 }}>Gráfico 3D</span>
            <Grafico3D values={t.values} rows={t.rows} cols={t.cols} live={liveR >= 0 && liveC >= 0 ? [liveR, liveC] : undefined} sel={[r0, r1, c0, c1]} />
          </div>
        )}
        <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="label">{selCount > 1 ? `${selCount} células` : 'Célula selecionada'}</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{cfg.y ? `${cfg.y.name} ` : ''}{yLabel(t.yBins[r0])} {yUnit} · {fmt(t.xBins[c0], cfg.x?.digits ?? 0)} {cfg.x?.unit ?? 'RPM'}</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            {typing !== undefined ? (<span style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
              <span className="label" style={{ color: 'var(--amber)' }}>{typeMode === 'add' ? 'Somar (use − para tirar)' : typeMode === 'mul' ? 'Multiplicar por' : 'Novo valor'}</span>
              <input autoFocus data-cell="edit" className="field" defaultValue={typing} inputMode="decimal" style={{ width: '100%', fontSize: 32 }}
                onFocus={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; e.currentTarget.value = v; }}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') setValue(e.currentTarget.value); if (e.key === 'Escape') setTyping(undefined); }}
                onBlur={(e) => setValue(e.currentTarget.value)} />
            </span>) : (
              <span className="num" style={{ fontSize: 56, color: 'var(--amber)', cursor: 'text' }} onClick={() => setTyping('')}>{fmt(first, cfg.digits)}</span>
            )}
            <span style={{ fontSize: 18, color: 'var(--muted)' }}>{cfg.unit}</span>
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button className="btn big" disabled={busy} onClick={() => change(cfg.small[1])}>− {cfg.small[0]}</button>
          <button className="btn big" disabled={busy} onClick={() => change(cfg.small[2])}>+ {cfg.small[0]}</button>
          <button className="btn" style={{ height: 52 }} disabled={busy} onClick={() => change(cfg.big[1])}>− {cfg.big[0]}</button>
          <button className="btn" style={{ height: 52 }} disabled={busy} onClick={() => change(cfg.big[2])}>+ {cfg.big[0]}</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 14, height: 14, borderRadius: 3, border: '2px solid var(--cyan)' }} />Ponto atual do motor
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
          {isDesktop ? <>Setas movem · Shift+setas seleciona · + / − ajusta (Ctrl rápido, Shift lento) · espaço ou número edita · A soma · M multiplica · I/H/V interpola · S suaviza · botão direito para mais</> : 'Arraste o dedo para selecionar várias células.'}
        </div>
        <span style={{ flexGrow: 1 }} />
        {cfg.msStrategy && strategy && strategy.value !== LM_INJ_TIME && (
          <div className="notice" style={{ background: '#2A2116', color: '#FFD08A', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span>Este mapa não está em uso. A estratégia agora é <b>{strategy.names[strategy.value] ?? strategy.value}</b>.</span>
            <button className="btn" disabled={busy} onClick={useThisMap}>Usar o mapa em ms</button>
          </div>
        )}
        {msg && <div className={`notice ${msg.startsWith('Gravado') ? 'ok' : 'err'}`}>{msg}</div>}
        {s.dirty && !msg && <div className="notice" style={{ background: '#2A2116', color: '#FFD08A' }}>Mudanças valendo, mas ainda não gravadas.</div>}
        <button className="btn primary" style={{ height: 56, fontSize: 18 }} disabled={busy || !s.dirty} onClick={burn}>Gravar na ECU</button>
      </aside>
      {menu && (
        <div className="ctx" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {([
            [`Aumentar ${cfg.small[0]}`, '+', () => change(cfg.small[2])],
            [`Diminuir ${cfg.small[0]}`, '−', () => change(cfg.small[1])],
            [`Aumentar ${cfg.big[0]}`, 'Ctrl +', () => change(cfg.big[2])],
            [`Diminuir ${cfg.big[0]}`, 'Ctrl −', () => change(cfg.big[1])],
            null,
            ['Definir valor…', 'Espaço', () => setTyping('')],
            ['Somar…', 'A', () => setTyping('', 'add')],
            ['Multiplicar…', 'M', () => setTyping('', 'mul')],
            ['Interpolar seleção', 'I', () => interpolate()],
            ['Interpolar na horizontal', 'H', () => interpolate('h')],
            ['Interpolar na vertical', 'V', () => interpolate('v')],
            ['Suavizar', 'S', smooth],
            null,
            ['Copiar', '⌘C', copy],
            ['Colar', '⌘V', paste, !clip],
            ['Selecionar tudo', '⌘A', () => setSel({ r0: 0, c0: 0, r1: t.rows - 1, c1: t.cols - 1 })],
          ] as ([string, string, () => unknown, boolean?] | null)[]).map((it, i) => it === null ? <hr key={i} /> : (
            <button key={i} disabled={busy || it[3] === true} onClick={() => { setMenu(undefined); void it[2](); }}>
              <span>{it[0]}</span><small>{it[1]}</small>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
