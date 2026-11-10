import { useLive, useStatus } from '../api';
import type { Screen } from '../App';
import { fmt } from '../format';
import { lambdaOut, pressure, setPrefs, usePrefs, type Prefs } from '../prefs';


interface Gauge { name: string; value: number | null; digits: number; unit: string; min: number; max: number; color: string; note?: string; warn?: (v: number) => boolean }

// Catálogo de mostradores (estilo profissional 23.6: cada posição do painel escolhe um).
type V = Record<string, number | null>;
export const GAUGES: Record<string, { name: string; ch: string[]; make: (v: V, p: Prefs) => Omit<Gauge, 'name'> }> = {
  boost: { name: 'Pressão do turbo', ch: ['MAPValue', 'baroPressure'], make: (v, p) => {
    const psi = p.pressure === 'psi';
    return { value: v.MAPValue != null && v.baroPressure != null ? pressure(v.MAPValue - v.baroPressure, p.pressure) : null, digits: psi ? 1 : 2, unit: p.pressure, min: psi ? -15 : -1, max: psi ? 36 : 2.5, color: 'var(--amber)', warn: (x) => x > (psi ? 29 : 2) };
  } },
  lambda: { name: 'Lambda', ch: ['lambdaValue', 'targetLambda'], make: (v, p) => {
    const afr = p.lambda === 'afr';
    return { value: v.lambdaValue != null ? lambdaOut(v.lambdaValue, p.lambda) : null, digits: afr ? 1 : 2, unit: afr ? ':1' : 'λ', min: afr ? 8.8 : 0.6, max: afr ? 19 : 1.3, color: 'var(--green)',
      note: `Alvo ${fmt(v.targetLambda != null ? lambdaOut(v.targetLambda, p.lambda) : null, afr ? 1 : 2)}` };
  } },
  inj: { name: 'Tempo de injeção', ch: ['actualLastInjection', 'injectorDutyCycle'], make: (v) => ({ value: v.actualLastInjection, digits: 2, unit: 'ms', min: 0, max: 25, color: 'var(--cyan)', note: `Duty ${fmt(v.injectorDutyCycle)} %` }) },
  duty: { name: 'Duty dos bicos', ch: ['injectorDutyCycle'], make: (v) => ({ value: v.injectorDutyCycle, digits: 0, unit: '%', min: 0, max: 100, color: 'var(--cyan)', warn: (x) => x > 85 }) },
  adv: { name: 'Avanço', ch: ['ignitionAdvanceCyl1'], make: (v) => ({ value: v.ignitionAdvanceCyl1, digits: 1, unit: '°', min: -10, max: 50, color: 'var(--cyan)' }) },
  clt: { name: 'Temperatura do motor', ch: ['coolant'], make: (v) => ({ value: v.coolant, digits: 0, unit: '°C', min: 40, max: 140, color: 'var(--text)', warn: (x) => x > 105 }) },
  iat: { name: 'Temperatura do ar', ch: ['intake'], make: (v) => ({ value: v.intake, digits: 0, unit: '°C', min: 0, max: 100, color: 'var(--text)', warn: (x) => x > 65 }) },
  oil: { name: 'Pressão de óleo', ch: ['oilPressure'], make: (v, p) => ({ value: v.oilPressure != null ? pressure(v.oilPressure, p.pressure) : null, digits: p.pressure === 'psi' ? 0 : 1, unit: p.pressure, min: 0, max: p.pressure === 'psi' ? 145 : 10, color: 'var(--text)' }) },
  oilT: { name: 'Temperatura do óleo', ch: ['oilTemp'], make: (v) => ({ value: v.oilTemp, digits: 0, unit: '°C', min: 0, max: 150, color: 'var(--text)', warn: (x) => x > 130 }) },
  fuelP: { name: 'Pressão de combustível', ch: ['lowFuelPressure'], make: (v, p) => ({ value: v.lowFuelPressure != null ? pressure(v.lowFuelPressure, p.pressure) : null, digits: p.pressure === 'psi' ? 0 : 1, unit: p.pressure, min: 0, max: p.pressure === 'psi' ? 145 : 10, color: 'var(--text)' }) },
  batt: { name: 'Bateria', ch: ['VBatt'], make: (v) => ({ value: v.VBatt, digits: 1, unit: 'V', min: 8, max: 16, color: 'var(--text)', warn: (x) => x < 11.5 }) },
  tps: { name: 'Borboleta (TPS)', ch: ['TPSValue'], make: (v) => ({ value: v.TPSValue, digits: 0, unit: '%', min: 0, max: 100, color: 'var(--text)' }) },
  pedal: { name: 'Pedal', ch: ['throttlePedalPosition'], make: (v) => ({ value: v.throttlePedalPosition, digits: 0, unit: '%', min: 0, max: 100, color: 'var(--text)' }) },
  speed: { name: 'Velocidade', ch: ['vehicleSpeedKph'], make: (v) => ({ value: v.vehicleSpeedKph, digits: 0, unit: 'km/h', min: 0, max: 300, color: 'var(--text)' }) },
  gear: { name: 'Marcha', ch: ['detectedGear'], make: (v) => ({ value: v.detectedGear, digits: 0, unit: 'ª', min: 0, max: 6, color: 'var(--text)' }) },
  egt: { name: 'EGT 1', ch: ['egt1'], make: (v) => ({ value: v.egt1, digits: 0, unit: '°C', min: 0, max: 1100, color: 'var(--text)', warn: (x) => x > 950 }) },
  flex: { name: 'Etanol', ch: ['flexPercent'], make: (v) => ({ value: v.flexPercent, digits: 0, unit: '%', min: 0, max: 100, color: 'var(--green)' }) },
  wmi: { name: 'Água/metanol', ch: ['wmiDuty', 'wmiStatus'], make: (v) => ({ value: v.wmiDuty, digits: 0, unit: '%', min: 0, max: 100, color: 'var(--cyan)',
    note: ['Desligada', 'Pronta', 'Injetando', 'Tanque baixo', 'FALHA: tanque vazio'][v.wmiStatus ?? 0], warn: () => (v.wmiStatus ?? 0) >= 3 }) },
  slip: { name: 'Patinagem', ch: ['wheelSlip'], make: (v) => ({ value: v.wheelSlip, digits: 0, unit: '%', min: 0, max: 50, color: 'var(--amber)', warn: (x) => x > 15 }) },
  rodaD: { name: 'Roda dianteira', ch: ['wheelSpeedFront'], make: (v) => ({ value: v.wheelSpeedFront, digits: 0, unit: 'km/h', min: 0, max: 300, color: 'var(--text)' }) },
  rodaT: { name: 'Roda traseira', ch: ['wheelSpeedRear'], make: (v) => ({ value: v.wheelSpeedRear, digits: 0, unit: 'km/h', min: 0, max: 300, color: 'var(--text)' }) },
  ic: { name: 'Temperatura do intercooler', ch: ['compressorDischargeTemp'], make: (v) => ({ value: v.compressorDischargeTemp, digits: 0, unit: '°C', min: 0, max: 150, color: 'var(--text)' }) },
};
const ALL_CH = [...new Set(['RPMValue', 'alertActiveMask', 'shiftLightTarget', 'shiftLightOn', ...Object.values(GAUGES).flatMap((g) => g.ch)])];

// Picos (máximo visto desde o último "Zerar picos"). Ficam na memória do app.
const picos: Record<string, number> = {};
export function zerarPicos() { for (const k of Object.keys(picos)) delete picos[k]; }

/** As 9 posições de cada painel (layout de painel de corrida). A barra de RPM é fixa. */
export const SLOTS = [
  { id: 'arco', name: 'Relógio redondo (esquerda)' },
  { id: 'centro', name: 'Número gigante (centro)' },
  { id: 'direita', name: 'Número grande (direita)' },
  { id: 'num1', name: 'Número embaixo 1' },
  { id: 'num2', name: 'Número embaixo 2' },
  { id: 'barra', name: 'Barra deitada' },
  { id: 'col1', name: 'Coluna 1' },
  { id: 'col2', name: 'Coluna 2' },
  { id: 'col3', name: 'Coluna 3' },
] as const;
export const NOMES_PAINEL = ['Pista', 'Turbo', 'Rua', 'Diagnóstico'];
export const PAINEIS_PADRAO: string[][] = [
  ['boost', 'gear', 'speed', 'lambda', 'batt', 'tps', 'oil', 'fuelP', 'clt'],
  ['boost', 'adv', 'inj', 'lambda', 'iat', 'duty', 'oil', 'fuelP', 'egt'],
  ['clt', 'gear', 'speed', 'batt', 'iat', 'pedal', 'oil', 'oilT', 'fuelP'],
  ['lambda', 'inj', 'adv', 'batt', 'flex', 'tps', 'oil', 'fuelP', 'iat'],
];

const ORA = '#FF8A00', RED = '#FF2A2A', TXT = '#fff', DIM = '#9a9a9a', COND = "'Barlow Condensed', system-ui, sans-serif";
const pt = (cx: number, cy: number, r: number, a: number): [number, number] => { const t = ((a - 90) * Math.PI) / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; };
const arcP = (cx: number, cy: number, r: number, a0: number, a1: number) => { const [x0, y0] = pt(cx, cy, r, a0), [x1, y1] = pt(cx, cy, r, a1); return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
/** Passo "redondo" (1, 2, 2,5, 5 × 10ⁿ) para uns 4 intervalos. */
function nice(range: number, parts = 4, quarter = true) { const raw = range / parts, e = Math.pow(10, Math.floor(Math.log10(raw))); return (quarter ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10]).map((m) => m * e).find((s) => s >= raw * 0.99) ?? raw; }
const ticks = (min: number, max: number, step: number) => { const out: number[] = []; for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000 || 0); return out; };
/** Início da faixa vermelha (primeiro valor onde o aviso do mostrador acende). */
function redFrom(g: Gauge) { if (!g.warn) return null; for (let i = 0; i <= 100; i++) { const v = g.min + ((g.max - g.min) * i) / 100; if (g.warn(v)) return i === 0 ? null : v; } return null; }
const frac = (g: Gauge) => (g.value == null ? 0 : Math.max(0, Math.min(1, (g.value - g.min) / (g.max - g.min))));
const bad = (g: Gauge) => g.value != null && !!g.warn?.(g.value);
const valTxt = (g: Gauge, id: string) => (id === 'gear' ? (g.value == null ? '–' : g.value <= 0 ? 'N' : String(Math.round(g.value))) : fmt(g.value, g.digits));
const label = (x: number, y: number, t: string, anchor: 'start' | 'middle' | 'end' = 'start') => <text x={x} y={y} fill={ORA} fontSize={18} textAnchor={anchor}>{t}</text>;

function Arco({ g }: { g: Gauge }) {
  const cx = 175, cy = 368, r = 108, A0 = -135, A1 = 135, ang = (v: number) => A0 + ((A1 - A0) * (v - g.min)) / (g.max - g.min);
  const red = redFrom(g), step = nice(g.max - g.min, 4), col = bad(g) ? RED : ORA;
  return <g>
    {label(cx, 218, g.name, 'middle')}
    <path d={arcP(cx, cy, r, A0, A1)} stroke="#262626" strokeWidth={22} fill="none" />
    {g.value != null && <path d={arcP(cx, cy, r, A0, A0 + (A1 - A0) * Math.max(0.002, frac(g)))} stroke={col} strokeWidth={22} fill="none" />}
    {red != null && <path d={arcP(cx, cy, r + 15, ang(red), A1)} stroke={RED} strokeWidth={4} fill="none" />}
    {ticks(g.min, g.max, step / 2).map((v) => { const a = ang(v), major = Math.abs(v / step - Math.round(v / step)) < 1e-6, rr = red != null && v >= red;
      const [x1, y1] = pt(cx, cy, r - 16, a), [x2, y2] = pt(cx, cy, r - (major ? 28 : 22), a), [xt, yt] = pt(cx, cy, r - 44, a);
      return <g key={v}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={rr ? RED : '#bbb'} strokeWidth={major ? 3 : 2} />{major && <text x={xt} y={yt + 6} fill={rr ? RED : '#ccc'} fontSize={17} textAnchor="middle">{fmt(v, step < 1 ? 1 : 0)}</text>}</g>; })}
    <text x={cx} y={cy + 16} fill={bad(g) ? RED : TXT} fontSize={54} fontWeight={700} textAnchor="middle" fontFamily={COND}>{fmt(g.value, g.digits)}</text>
    <text x={cx} y={cy + 40} fill="#bbb" fontSize={17} textAnchor="middle">{g.unit}</text>
  </g>;
}

function Grande({ g, id, x, w, y, max, align }: { g: Gauge; id: string; x: number; w: number; y: number; max: number; align: 'middle' | 'end' }) {
  const t = valTxt(g, id), fs = Math.min(max, w / (0.5 * Math.max(1, t.length))), ax = align === 'middle' ? x + w / 2 : x + w;
  return <g>
    {label(ax, y, g.name, align)}
    <text x={ax} y={y + 14 + fs * 0.78} fill={bad(g) ? RED : TXT} fontSize={fs} fontWeight={id === 'gear' ? 700 : 500} textAnchor={align} fontFamily={COND}>{t}</text>
    {id !== 'gear' && <text x={ax} y={y + 36 + fs * 0.78} fill="#ccc" fontSize={22} textAnchor={align}>{g.unit}</text>}
  </g>;
}

const CURTO: Record<string, string> = { oil: 'Óleo', fuelP: 'Comb.', clt: 'Motor', iat: 'Temp. ar', oilT: 'Temp. óleo', egt: 'EGT 1', ic: 'Intercooler', batt: 'Bateria', boost: 'Turbo', duty: 'Duty', inj: 'Injeção', tps: 'TPS', pedal: 'Pedal', flex: 'Etanol', speed: 'Velocidade' };
function Numero({ g, id, x }: { g: Gauge; id: string; x: number }) {
  return <g>
    {label(x, 494, CURTO[id] ?? g.name)}
    <text x={x} y={548} fill={bad(g) ? RED : TXT} fontSize={56} fontWeight={700} fontFamily={COND}>{valTxt(g, id)}</text>
    <text x={x} y={574} fill="#bbb" fontSize={16}>{g.note ?? g.unit}</text>
  </g>;
}

function Barra({ g }: { g: Gauge }) {
  const x = 330, y = 504, w = 290, h = 40, step = nice(g.max - g.min, 2), f = frac(g);
  return <g>
    <text x={x + w / 2} y={494} fontSize={18} textAnchor="middle"><tspan fill={ORA}>{g.name} </tspan><tspan fill={bad(g) ? RED : TXT} fontWeight={700}>{fmt(g.value, g.digits)} {g.unit}</tspan></text>
    <rect x={x} y={y} width={w} height={h} fill="#111" stroke="#777" strokeWidth={2} />
    <rect x={x + 2} y={y + 2} width={(w - 4) * f} height={h - 4} fill={bad(g) ? RED : '#29D65A'} />
    {ticks(g.min, g.max, step / 2).map((v) => { const px = x + 2 + ((w - 4) * (v - g.min)) / (g.max - g.min), major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
      return <g key={v}>{v > g.min && v < g.max && <line x1={px} y1={y + 2} x2={px} y2={y + (major ? 18 : 11)} stroke={(v - g.min) / (g.max - g.min) <= f ? '#000' : '#666'} strokeWidth={2} />}
        {major && <text x={px} y={y + h + 20} fill="#ccc" fontSize={16} textAnchor="middle">{fmt(v)}</text>}</g>; })}
  </g>;
}

const COL_COR = ['#29D65A', ORA, '#22C7E8'];
function Coluna({ g, i, id }: { g: Gauge; i: number; id: string }) {
  const x = 658 + i * 120, y = 390, w = 106, h = 196, f = frac(g), step = nice(g.max - g.min, 5, false), col = bad(g) ? RED : COL_COR[i];
  return <g>
    <text x={x + w / 2} y={378} fontSize={18} textAnchor="middle"><tspan fill={ORA}>{CURTO[id] ?? g.name}</tspan><tspan fill="#bbb" fontSize={13}> {g.unit}</tspan></text>
    <rect x={x} y={y} width={w} height={h} fill="#111" stroke="#777" strokeWidth={2} />
    <rect x={x + 2} y={y + 2 + (h - 4) * (1 - f)} width={w - 4} height={(h - 4) * f} fill={col} />
    {ticks(g.min, g.max, step / 2).filter((v) => v > g.min + 1e-9 && v < g.max - 1e-9).map((v) => {
      const fy = (v - g.min) / (g.max - g.min), yy = y + 2 + (h - 4) * (1 - fy), under = fy <= f, k = under ? '#000' : '#666', major = Math.abs(v / step - Math.round(v / step)) < 1e-6, tw = major ? 22 : 12;
      return <g key={v}><rect x={x + 2} y={yy - 1} width={tw} height={2} fill={k} /><rect x={x + w - 2 - tw} y={yy - 1} width={tw} height={2} fill={k} />
        {major && <text x={x + w / 2} y={yy + 7} fill={under ? '#000' : DIM} fontSize={20} fontWeight={700} textAnchor="middle" fontFamily={COND}>{fmt(v, step < 1 ? 1 : 0)}</text>}</g>; })}
  </g>;
}

function BarraRpm({ rpm, max, shift }: { rpm: number; max: number; shift: number }) {
  const x = 20, y = 84, w = 984, h = 76, seg = 60, gap = 3, sw = (w - gap * (seg - 1)) / seg, on = (rpm / max) * seg, sf = shift / max, every = max > 12000 ? 2000 : 1000;
  return <g>
    {Array.from({ length: seg }, (_, i) => { const f = i / seg, hi = h * (0.7 + 0.3 * f);
      const c = i < on ? (f < sf - 0.2 ? '#FFD400' : f < sf ? `hsl(${48 - ((f - (sf - 0.2)) / 0.2) * 30},100%,50%)` : '#FF1A1A') : f >= sf ? '#3a1414' : '#1E1E1E';
      return <rect key={i} x={x + i * (sw + gap)} y={y + h - hi} width={sw} height={hi} fill={c} />; })}
    <rect x={x} y={y + h + 2} width={w} height={2} fill="#666" />
    <rect x={x + w * sf} y={y + h + 2} width={w * (1 - sf)} height={3} fill={RED} />
    {ticks(every, max, every).map((r) => { const px = x + (w * r) / max - (r === max ? 2 : 0), rr = r >= shift;
      return <g key={r}><rect x={px - 1} y={y + h + 4} width={2} height={8} fill={rr ? RED : '#ccc'} /><text x={Math.min(px, x + w - 8)} y={y + h + 28} fill={rr ? RED : '#ddd'} fontSize={17} textAnchor="middle">{r / 1000}</text></g>; })}
  </g>;
}

export function Painel({ go }: { go: (s: Screen) => void }) {
  const v = useLive(ALL_CH);
  const p = usePrefs();
  const s = useStatus();
  const rpm = v.RPMValue ?? 0;
  if (rpm > (picos.rpm ?? -Infinity)) picos.rpm = rpm;
  const ativos = [0, 1, 2, 3].filter((i) => p.paineisAtivos[i]);
  const atual = ativos.includes(p.painelAtual) ? p.painelAtual : (ativos[0] ?? 0);
  const ids = PAINEIS_PADRAO[0].map((d, i) => p.paineis[atual]?.[i] ?? d);
  const G = ids.map((id) => {
    const g = GAUGES[id] ?? GAUGES.batt, made = g.make(v, p);
    if (made.value != null && made.value > (picos[id] ?? -Infinity)) picos[id] = made.value;
    return { name: id === 'lambda' && p.lambda === 'afr' ? 'AFR' : g.name, ...made } as Gauge;
  });
  const proximo = () => { if (ativos.length > 1) { setPrefs({ painelAtual: ativos[(ativos.indexOf(atual) + 1) % ativos.length] }); } };
  const alerts = v.alertActiveMask ?? 0;
  // shift light da ECU (RPM de troca da marcha atual); sem ele, a barra usa o valor da configuração do painel
  const shift = v.shiftLightTarget ? v.shiftLightTarget : p.shiftRpm;
  const trocar = !!v.shiftLightOn;
  return (
    <main style={{ position: 'relative', width: 1024, height: 600, background: '#000', flexShrink: 0 }}>
      <svg width={1024} height={600} viewBox="0 0 1024 600" onClick={proximo} style={{ display: 'block', fontFamily: 'Barlow, system-ui, sans-serif', cursor: ativos.length > 1 ? 'pointer' : undefined }}>
        <text x={22} y={70} fill={TXT} fontSize={86} fontWeight={700} fontFamily={COND}>{v.RPMValue == null ? '–' : String(Math.round(v.RPMValue))}</text>
        <text x={240} y={36} fill={TXT} fontSize={26} fontWeight={700} fontFamily={COND}>{p.maxRpm}</text>
        <text x={240} y={60} fill={TXT} fontSize={19} fontWeight={700}>RPM</text>
        <BarraRpm rpm={rpm} max={p.maxRpm} shift={shift} />
        <Arco g={G[0]} />
        <Grande g={G[1]} id={ids[1]} x={360} w={200} y={212} max={250} align="middle" />
        <Grande g={G[2]} id={ids[2]} x={580} w={420} y={206} max={124} align="end" />
        <Numero g={G[3]} id={ids[3]} x={22} />
        <Numero g={G[4]} id={ids[4]} x={172} />
        <Barra g={G[5]} />
        {[6, 7, 8].map((k, i) => <Coluna key={k} g={G[k]} i={i} id={ids[k]} />)}
      </svg>
      {/* shift light: a tela inteira pisca na rotação de troca (estilo profissional) */}
      {trocar && <div className="shift-flash" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', border: `14px solid ${RED}` }} />}
      {/* canto de cima: painel atual, conexão e menu */}
      <div style={{ position: 'absolute', top: 14, right: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        {alerts !== 0 && <span style={{ background: RED, color: '#fff', fontWeight: 700, fontSize: 17, padding: '8px 14px', borderRadius: 8 }}>
          ⚠ {Array.from({ length: 8 }, (_, i) => (alerts >> i) & 1 ? `Alerta ${i + 1}` : null).filter(Boolean).join(', ')}</span>}
        {s.demo && <span style={{ color: ORA, fontWeight: 700, fontSize: 15 }}>DEMO</span>}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, color: DIM }}>
          {NOMES_PAINEL[atual]}
          {ativos.map((i) => <span key={i} className="dot" style={{ width: 9, height: 9, background: i === atual ? ORA : '#444' }} />)}
        </span>
        <button className="btn" style={{ height: 48, padding: '0 18px', background: '#111' }} onClick={() => go('menu')}>Menu</button>
      </div>
    </main>
  );
}
