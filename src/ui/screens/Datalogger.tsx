// Datalogger (programas profissionais para computador, itens 12 a 16): grava os canais, mostra em faixas,
// cursor com o valor de cada canal, mínimos e máximos, abrir e salvar logs (.csv).
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useLive, useTable, type TableData } from '../api';
import { heat, MAPA_IGNICAO, MAPA_INJECAO } from './MapaInjecao';
import { call, getLogCfg, setAutoChannels, isRecording, setLog, setLogCfg, startLog, stopLog, useLog, useStatus, type LogCfg, type LogData } from '../api';
import { fmt } from '../format';

export const LOG_CH: [string, string, string, number][] = [
  ['RPMValue', 'RPM', 'rpm', 0], ['MAPValue', 'MAP', 'kPa', 0], ['TPSValue', 'Borboleta (TPS)', '%', 0],
  ['lambdaValue', 'Lambda', 'λ', 2], ['targetLambda', 'Lambda alvo', 'λ', 2], ['actualLastInjection', 'Tempo de injeção', 'ms', 2],
  ['injectorDutyCycle', 'Duty dos bicos', '%', 0], ['ignitionAdvanceCyl1', 'Avanço', '°', 1], ['coolant', 'Temp. do motor', '°C', 0],
  ['intake', 'Temp. do ar', '°C', 0], ['VBatt', 'Bateria', 'V', 1], ['oilPressure', 'Pressão de óleo', 'kPa', 0],
  ['lowFuelPressure', 'Pressão de combustível', 'kPa', 0], ['vehicleSpeedKph', 'Velocidade', 'km/h', 0], ['detectedGear', 'Marcha', '', 0],
  ['throttlePedalPosition', 'Pedal', '%', 0], ['egt1', 'EGT 1', '°C', 0], ['flexPercent', 'Etanol', '%', 0], ['baroPressure', 'Pressão atm.', 'kPa', 0],
];
setAutoChannels(LOG_CH.map((c) => c[0]));
const INFO = new Map<string, [string, string, string, number]>(LOG_CH.map((c) => [c[0], c]));
const COLORS = ['#FF5A5F', '#3DDC84', '#4CC9F0', '#FFB020', '#C77DFF', '#FF9F1C', '#7BDFF2', '#F15BB5', '#A3E635', '#F2F2F0'];
const DEFAULT_VIS = ['RPMValue', 'MAPValue', 'TPSValue', 'lambdaValue', 'targetLambda', 'actualLastInjection', 'ignitionAdvanceCyl1'];
// Grupos (como nos programas profissionais): cada grupo é uma faixa do gráfico e pode ter vários canais.
type Grupo = { nome: string; canais: string[] };
const GRUPOS_PADRAO: Grupo[] = [
  { nome: 'Rotação', canais: ['RPMValue', 'vehicleSpeedKph', 'detectedGear'] },
  { nome: 'Carga', canais: ['MAPValue', 'TPSValue', 'throttlePedalPosition'] },
  { nome: 'Lambda', canais: ['lambdaValue', 'targetLambda'] },
  { nome: 'Injeção', canais: ['actualLastInjection', 'injectorDutyCycle'] },
  { nome: 'Ignição', canais: ['ignitionAdvanceCyl1'] },
  { nome: 'Temperaturas', canais: ['coolant', 'intake', 'egt1'] },
  { nome: 'Pressões e bateria', canais: ['oilPressure', 'lowFuelPressure', 'VBatt'] },
];
// ---- canais matemáticos e configuração por canal
type Mat = { id: string; nome: string; unidade: string; expr: string };
type CanalCfg = { nome?: string; cor?: string; suav?: number; min?: number; max?: number };
const SUAV = [1, 3, 7, 15]; // janela da média móvel: desligada, baixa, média, alta
const MATH_FN = ['abs', 'min', 'max', 'sqrt', 'pow', 'round'];
/** Compila a fórmula de um canal matemático. Só aceita nomes de canais, números, operadores e abs/min/max/sqrt/pow/round. */
function compilar(expr: string, canais: string[]): { fn?: (...a: (number | null)[]) => number; usa: string[]; erro?: string } {
  if (!/^[\w\s+\-*/().,<>=?:!&|]+$/.test(expr)) return { usa: [], erro: 'Use só nomes de canais, números e + − × ÷ ( ).' };
  const ids = [...new Set(expr.match(/[A-Za-z_]\w*/g) ?? [])];
  const desconhecido = ids.find((id) => !canais.includes(id) && !MATH_FN.includes(id));
  if (desconhecido) return { usa: [], erro: `Canal "${desconhecido}" não existe neste log.` };
  const usa = ids.filter((id) => canais.includes(id));
  try {
    // eslint-disable-next-line no-new-func
    const f = new Function(...usa, ...MATH_FN, `return (${expr});`) as (...a: unknown[]) => number;
    return { usa, fn: (...vals) => f(...vals, Math.abs, Math.min, Math.max, Math.sqrt, Math.pow, Math.round) };
  } catch { return { usa, erro: 'A fórmula tem um erro.' }; }
}
function media(d: (number | null)[], n: number) {
  if (n <= 1) return d;
  const h = n >> 1;
  return d.map((_, i) => { let s = 0, c = 0; for (let j = i - h; j <= i + h; j++) { const v = d[j]; if (v != null) { s += v; c++; } } return c ? s / c : null; });
}
/** Log como aparece na tela: com suavização e com os canais matemáticos calculados. */
function efetivo(raw: LogData | undefined, mats: Mat[], cc: Record<string, CanalCfg>): LogData | undefined {
  if (!raw) return raw;
  const channels = [...raw.channels];
  const data = raw.data.map((d, k) => media(d, SUAV[cc[raw.channels[k]]?.suav ?? 0] ?? 1));
  for (const m of mats) {
    const c = compilar(m.expr, raw.channels);
    if (!c.fn) continue;
    const idx = c.usa.map((u) => raw.channels.indexOf(u));
    const arr = raw.t.map((_, i) => {
      const vals = idx.map((k) => raw.data[k][i]);
      if (vals.some((v) => v == null)) return null;
      const r = c.fn!(...vals);
      return Number.isFinite(r) ? r : null;
    });
    channels.push(m.id); data.push(media(arr, SUAV[cc[m.id]?.suav ?? 0] ?? 1));
  }
  return { ...raw, channels, data };
}

const ler = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

function toCsv(l: LogData) {
  const head = ['Tempo', ...l.channels].join(',');
  const lines = l.t.map((t, i) => [t.toFixed(3), ...l.data.map((d) => (d[i] == null ? '' : String(d[i])))].join(','));
  return [head, ...lines].join('\n');
}
export function fromCsv(name: string, text: string): LogData {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const sep = head.includes('\t') ? '\t' : head.includes(';') ? ';' : ',';
  const cols = head.split(sep).map((c) => c.trim());
  const channels = cols.slice(1);
  const t: number[] = [], data: (number | null)[][] = channels.map(() => []);
  for (const r of rows) {
    const v = r.split(sep);
    const tt = Number(v[0]);
    if (!Number.isFinite(tt)) continue;
    t.push(tt);
    channels.forEach((_, i) => { const x = v[i + 1]; data[i].push(x === undefined || x === '' ? null : Number(x)); });
  }
  return { name: name.replace(/\.csv$/i, ''), channels, t, data };
}
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const unb64 = (s: string) => decodeURIComponent(escape(atob(s)));

/** Abre um log salvo (chamado também pela tela inicial). */
export async function openLogFile(name: string) {
  const data = await call<string>('readFile', { kind: 'logs', name });
  setLog(fromCsv(name, unb64(data)));
}

export function Datalogger() {
  const raw = useLog();
  // canais matemáticos e configuração de cada canal (manual de referência 17.2)
  const [mats, setMatsRaw] = useState<Mat[]>(() => ler('log.mat', []));
  const setMats = (m: Mat[]) => { setMatsRaw(m); gravar('log.mat', m); };
  const [cc, setCcRaw] = useState<Record<string, CanalCfg>>(() => ler('log.canal', {}));
  const setCc = (ch: string, c: CanalCfg | undefined) => { const n = { ...cc }; if (c) n[ch] = c; else delete n[ch]; setCcRaw(n); gravar('log.canal', n); };
  const [editCanal, setEditCanal] = useState<string>();
  const [novoMat, setNovoMat] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const log = useMemo(() => efetivo(raw, mats, cc), [raw, raw?.t.length, mats, cc]); // eslint-disable-line react-hooks/exhaustive-deps
  const info = (ch: string): [string, string, string, number] => {
    const m = mats.find((x) => x.id === ch), base = INFO.get(ch) ?? (m ? [m.id, m.nome, m.unidade, 2] as [string, string, string, number] : [ch, ch, '', 2] as [string, string, string, number]);
    return [base[0], cc[ch]?.nome || base[1], base[2], base[3]];
  };
  const corDe = (ch: string, k: number) => cc[ch]?.cor ?? COLORS[k % COLORS.length];
  const st = useStatus();
  const [vis, setVisRaw] = useState<Set<string>>(() => new Set(ler('log.vis', DEFAULT_VIS)));
  const setVis = (f: (s: Set<string>) => Set<string>) => setVisRaw((s) => { const n = f(s); gravar('log.vis', [...n]); return n; });
  const [grupos, setGruposRaw] = useState<Grupo[]>(() => ler('log.grupos', GRUPOS_PADRAO));
  const setGrupos = (g: Grupo[]) => { setGruposRaw(g); gravar('log.grupos', g); };
  const moverPara = (ch: string, gi: number) => setGrupos(grupos.map((g, i) => ({ ...g, canais: i === gi ? [...g.canais.filter((c) => c !== ch), ch] : g.canais.filter((c) => c !== ch) })));
  const [cfgOpen, setCfgOpen] = useState(false);
  const [tab, setTab] = useState<'valores' | 'minmax'>('valores');
  const [view, setView] = useState<[number, number] | undefined>(); // janela de tempo; undefined = tudo
  const [cursor, setCursor] = useState<number>();
  // manual de referência cap. 17: origem, valores no cursor, espessura, posição da barra de canais, canais zerados
  const [origem, setOrigem] = useState(0);
  const [verValores, setVerValores] = useState(() => ler('log.valores', true));
  const [espessura, setEspessura] = useState(() => ler('log.espessura', 1.5));
  const [barra, setBarraRaw] = useState<'dir' | 'esq' | 'topo' | 'oculta'>(() => ler('log.barra', 'dir'));
  const setBarra = (b: typeof barra) => { setBarraRaw(b); gravar('log.barra', b); };
  const [semZerados, setSemZerados] = useState(() => ler('log.semZerados', false));
  const [gmenu, setGmenu] = useState<{ x: number; y: number; t: number }>();
  const keyRef = useRef<(e: KeyboardEvent) => void>(undefined);
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current?.(e);
    const c = () => setGmenu(undefined);
    window.addEventListener('keydown', h); window.addEventListener('click', c);
    return () => { window.removeEventListener('keydown', h); window.removeEventListener('click', c); };
  }, []);
  const [files, setFiles] = useState<string[]>();
  const [msg, setMsg] = useState<string>();
  const cv = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; v: [number, number] }>(undefined);
  const recording = !!log?.recording && isRecording();

  const tEnd = log?.t[log.t.length - 1] ?? 0;
  const win: [number, number] = recording ? [Math.max(0, tEnd - 30), Math.max(30, tEnd)] : view ?? [0, Math.max(tEnd, 1)];
  const lanes = log ? grupos.map((g) => g.canais.filter((c) => vis.has(c) && log.channels.includes(c))).filter((l) => l.length) : [];

  const stats = useMemo(() => {
    if (!log) return [];
    return log.data.map((d) => {
      let lo = Infinity, hi = -Infinity;
      for (const v of d) if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; }
      return { lo, hi };
    });
  }, [log, log?.t.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const idxAt = (time: number) => {
    if (!log || !log.t.length) return -1;
    let a = 0, b = log.t.length - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (log.t[m] < time) a = m; else b = m; }
    return Math.abs(log.t[a] - time) < Math.abs(log.t[b] - time) ? a : b;
  };
  const ci = cursor != null ? idxAt(cursor) : log ? log.t.length - 1 : -1;
  const zoom = (k: number, at?: number) => {
    const t = at ?? (log && ci >= 0 ? log.t[ci] : (win[0] + win[1]) / 2);
    const a = t - (t - win[0]) * k, b = t + (win[1] - t) * k;
    setView(b - a >= tEnd ? undefined : [Math.max(0, a), Math.min(tEnd, b)]);
  };
  // teclas do log (manual de referência 6.5): setas andam no tempo, Ctrl +/− zoom, Alt+setas desloca 1/4 da tela
  keyRef.current = (e) => {
    const el = document.activeElement as HTMLElement | null;
    if (!log || recording || (el && /INPUT|SELECT|TEXTAREA/.test(el.tagName))) return;
    const k = e.key;
    if (e.ctrlKey && (e.code === 'Equal' || k === '+')) zoom(0.8);
    else if (e.ctrlKey && (e.code === 'Minus' || k === '-')) zoom(1.25);
    else if ((k === 'ArrowLeft' || k === 'ArrowRight') && e.altKey) {
      const d = (win[1] - win[0]) / 4 * (k === 'ArrowLeft' ? -1 : 1);
      const a = Math.max(0, Math.min(tEnd - (win[1] - win[0]), win[0] + d));
      setView([a, a + (win[1] - win[0])]);
    } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const dir = k === 'ArrowLeft' ? -1 : 1, passo = e.ctrlKey ? 0.1 : e.shiftKey ? 0.001 : 0.01;
      const i0 = ci < 0 ? 0 : ci;
      let ni = idxAt(log.t[i0] + dir * passo);
      if (ni === i0) ni = Math.max(0, Math.min(log.t.length - 1, i0 + dir));
      const nt = log.t[ni];
      setCursor(nt);
      if (nt < win[0] || nt > win[1]) { const w = win[1] - win[0]; const a = Math.max(0, Math.min(tEnd - w, nt - w / 2)); setView([a, a + w]); }
    } else return;
    e.preventDefault();
  };

  useEffect(() => {
    const c = cv.current;
    if (!c || !log) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const AX = 22, LH = (H - AX) / Math.max(1, lanes.length);
    const X = (t: number) => ((t - win[0]) / (win[1] - win[0])) * W;
    // grade de tempo
    const span = win[1] - win[0];
    const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((s) => span / s <= 12) ?? 600;
    g.font = '11px Barlow, system-ui'; g.fillStyle = '#A3A7AE'; g.strokeStyle = '#2A2D33'; g.lineWidth = 1;
    for (let tr = Math.ceil((win[0] - origem) / step) * step; tr + origem <= win[1]; tr += step) {
      const x = Math.round(X(tr + origem)) + 0.5, at = Math.abs(tr);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H - AX); g.stroke();
      g.fillText(`${tr < 0 ? '−' : ''}${at >= 60 ? `${Math.floor(at / 60)}:${String(Math.round(at % 60)).padStart(2, '0')}` : `${fmt(at, step < 1 ? 1 : 0)} s`}`, x + 3, H - 7);
    }
    if (origem > 0 && origem >= win[0] && origem <= win[1]) {
      const x = Math.round(X(origem)) + 0.5;
      g.save(); g.setLineDash([5, 4]); g.strokeStyle = '#FF9F1C'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H - AX); g.stroke(); g.restore();
      g.fillStyle = '#FF9F1C'; g.fillText('origem', x + 3, 11);
    }
    const i0 = Math.max(0, idxAt(win[0]) - 1), i1 = Math.min(log.t.length - 1, idxAt(win[1]) + 1);
    const stride = Math.max(1, Math.floor((i1 - i0) / (W * 2)));
    lanes.forEach((chs, li) => {
      const top = li * LH + 4, h = LH - 8;
      g.strokeStyle = '#2A2D33'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, li * LH + 0.5); g.lineTo(W, li * LH + 0.5); g.stroke();
      let lx = 6;
      // canais da mesma unidade no mesmo grupo dividem a escala (ex.: lambda e lambda alvo)
      const esc = new Map<string, { lo: number; hi: number }>();
      for (const ch of chs) {
        const c = cc[ch];
        if (c && c.min != null && c.max != null && c.max > c.min) { esc.set('#' + ch, { lo: c.min, hi: c.max }); continue; }
        const u = info(ch)?.[2] ?? ch, st = stats[log.channels.indexOf(ch)] ?? { lo: 0, hi: 1 }, e = esc.get(u);
        esc.set(u, e ? { lo: Math.min(e.lo, st.lo), hi: Math.max(e.hi, st.hi) } : { ...st });
      }
      for (const ch of chs) {
        const k = log.channels.indexOf(ch), d = log.data[k];
        const { lo, hi } = esc.get('#' + ch) ?? esc.get(info(ch)?.[2] ?? ch)!;
        const rng = hi - lo || 1;
        g.strokeStyle = corDe(ch, k); g.lineWidth = espessura; g.beginPath();
        let pen = false;
        for (let i = i0; i <= i1; i += stride) {
          const v = d[i];
          if (v == null) { pen = false; continue; }
          const x = X(log.t[i]), y = top + h - ((v - lo) / rng) * h;
          if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
        }
        g.stroke();
        g.fillStyle = corDe(ch, k); g.font = '600 12px Barlow, system-ui';
        const label = info(ch)?.[1] ?? ch;
        g.fillText(label, lx, top + 12);
        lx += g.measureText(label).width + 14;
      }
    });
    if (ci >= 0 && log.t.length) {
      const x = Math.round(X(log.t[ci])) + 0.5;
      g.strokeStyle = '#F2F2F0'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H - AX); g.stroke();
      // valor de cada canal no ponto do cursor, dentro de cada faixa (como nos programas profissionais)
      g.font = '700 13px Barlow, system-ui';
      if (verValores) lanes.forEach((chs, li) => {
        const items = chs.map((ch) => {
          const k = log.channels.indexOf(ch), inf = info(ch), v = log.data[k][ci];
          return { txt: `${inf?.[1] ?? ch}: ${fmt(v, inf?.[3] ?? 2)} ${inf?.[2] ?? ''}`.trim(), color: corDe(ch, k) };
        });
        const bw = Math.max(...items.map((it) => g.measureText(it.txt).width)) + 16, bh = items.length * 17 + 8;
        const top = li * LH + Math.min(26, Math.max(4, LH - bh - 4));
        const bx = x + 8 + bw > W ? x - 8 - bw : x + 8;
        g.fillStyle = 'rgba(14,15,17,0.88)'; g.strokeStyle = '#3a3e45';
        g.beginPath(); g.roundRect(bx, top, bw, bh, 5); g.fill(); g.stroke();
        items.forEach((it, j) => { g.fillStyle = it.color; g.fillText(it.txt, bx + 8, top + 18 + j * 17); });
      });
      // tempo no pé da linha
      const tt = `${fmt(log.t[ci] - origem, 3)} s`, tw = g.measureText(tt).width + 12;
      const tx = Math.min(Math.max(0, x - tw / 2), W - tw);
      g.fillStyle = '#F2F2F0'; g.beginPath(); g.roundRect(tx, H - AX + 2, tw, 18, 4); g.fill();
      g.fillStyle = '#141518'; g.fillText(tt, tx + 6, H - AX + 15);
    }
  });

  async function save() {
    if (!log) return;
    try { const n = await call<string>('saveFile', { kind: 'logs', name: `${raw!.name}.csv`, data: b64(toCsv(raw!)) }); setMsg(`Salvo em ECU Arquivos/Logs/${n}`); }
    catch (e) { setMsg((e as Error).message); }
  }
  async function showFiles() {
    if (files) { setFiles(undefined); return; }
    const r = await call<{ files: { kind: string; name: string }[] }>('files');
    setFiles(r.files.filter((f) => f.kind === 'logs').map((f) => f.name));
  }

  const posBtns = () => (<>
    {([['esq', '◧', 'Valores à esquerda'], ['dir', '◨', 'Valores à direita'], ['topo', '⬒', 'Valores no topo'], ['oculta', '×', 'Esconder a barra de canais']] as const).map(([b, ic, tip]) => (
      <button key={b} title={tip} className={barra === b ? 'on' : ''} onClick={() => setBarra(b)}>{ic}</button>
    ))}
  </>);
  const timeAtX = (clientX: number) => {
    const r = cv.current!.getBoundingClientRect();
    return win[0] + ((clientX - r.left) / r.width) * (win[1] - win[0]);
  };

  return (
    <main className="screen" style={{ gap: 8, paddingTop: 8 }}>
      {/* 12 e 13: nome do log e barra de controle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="num" style={{ fontSize: 22, marginRight: 8 }}>{log?.name ?? 'Nenhum log aberto'}</span>
        {recording ? <span style={{ color: 'var(--red)', fontWeight: 700 }}>● Gravando {fmt(tEnd, 0)} s</span> : log ? <span style={{ color: 'var(--muted)' }}>{fmt(tEnd, 1)} s · {log.t.length} amostras</span> : null}
        <span style={{ flexGrow: 1 }} />
        {recording
          ? <button className="btn" style={{ height: 36 }} onClick={stopLog}>■ Parar</button>
          : <button className="btn primary" style={{ height: 36 }} disabled={st.state !== 'conectado'} onClick={() => { setCursor(undefined); setView(undefined); startLog(LOG_CH.map((c) => c[0])); }}>● Gravar</button>}
        <button className="btn" style={{ height: 36 }} disabled={!log || recording} onClick={save}>Salvar</button>
        <div style={{ position: 'relative' }}>
          <button className="btn" style={{ height: 36 }} disabled={recording} onClick={showFiles}>Abrir ▾</button>
          {files && (
            <div className="ctx" style={{ position: 'absolute', right: 0, top: 40, left: 'auto', maxHeight: 360, overflow: 'auto' }}>
              {files.length === 0 && <button disabled><span>Nenhum log salvo ainda</span></button>}
              {files.map((f) => <button key={f} onClick={() => { setFiles(undefined); setView(undefined); setCursor(undefined); void openLogFile(f).catch((e) => setMsg(e.message)); }}><span>{f}</span></button>)}
            </div>
          )}
        </div>
        <button className="btn" style={{ height: 36 }} disabled={!log || recording} onClick={() => setView(undefined)} title="Mostrar o log inteiro">Tudo</button>
        <button className="btn" style={{ height: 36 }} disabled={!log || recording || ci < 0} onClick={() => log && setOrigem(log.t[ci])} title="Definir a origem do tempo no cursor">Definir origem</button>
        <button className="btn" style={{ height: 36 }} disabled={!log || recording} onClick={() => { const w = win[1] - win[0]; setView([origem, Math.min(tEnd, origem + w)]); setCursor(origem); }} title="Enquadrar na origem">⇤ Origem</button>
        <button className={`btn ${overlay ? 'primary' : ''}`} style={{ height: 36 }} disabled={!log} onClick={() => setOverlay(!overlay)} title="Ver e corrigir o mapa dentro do log">Overlay</button>
        {barra === 'oculta' && <button className="btn" style={{ height: 36 }} onClick={() => setBarra('dir')}>Mostrar canais</button>}
        <button className="btn" style={{ height: 36 }} onClick={() => setCfgOpen(true)} title="Configurações do datalogger">⚙ Configurações</button>
      </div>
      {msg && <div className="notice ok" onClick={() => setMsg(undefined)}>{msg}</div>}
      {overlay && log && <OverlayMapa log={log} ci={ci} win={win} />}
      {cfgOpen && <ConfigLog close={() => setCfgOpen(false)} />}
      {editCanal && <ConfigCanal ch={editCanal} nomePadrao={(INFO.get(editCanal)?.[1]) ?? mats.find((m) => m.id === editCanal)?.nome ?? editCanal} cfg={cc[editCanal] ?? {}}
        mat={mats.find((m) => m.id === editCanal)} apagarMat={() => { setMats(mats.filter((m) => m.id !== editCanal)); setCc(editCanal, undefined); setEditCanal(undefined); }}
        salvar={(c) => { setCc(editCanal, c); setEditCanal(undefined); }} close={() => setEditCanal(undefined)} />}
      {novoMat && <NovoMat canais={raw?.channels ?? LOG_CH.map((c) => c[0])} nomeDe={(c) => INFO.get(c)?.[1] ?? c}
        criar={(m) => { setMats([...mats.filter((x) => x.id !== m.id), m]); setGrupos(grupos.length ? grupos.map((g, i) => (i === grupos.length - 1 ? { ...g, canais: [...g.canais, m.id] } : g)) : [{ nome: 'Calculados', canais: [m.id] }]); setVis((v) => new Set([...v, m.id])); setNovoMat(false); }}
        close={() => setNovoMat(false)} />}
      {gmenu && (
        <div className="ctx" style={{ left: gmenu.x, top: gmenu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setOrigem(gmenu.t); setGmenu(undefined); }}><span>Definir origem aqui</span></button>
          <button disabled={!origem} onClick={() => { setOrigem(0); setGmenu(undefined); }}><span>Origem no início do log</span></button>
          <hr />
          <button onClick={() => { setVerValores(!verValores); gravar('log.valores', !verValores); setGmenu(undefined); }}><span>{verValores ? 'Esconder' : 'Mostrar'} valores e nomes no cursor</span></button>
          <hr />
          {([[1, 'Linha fina'], [1.5, 'Linha média'], [2.5, 'Linha grossa']] as const).map(([w, l]) => (
            <button key={w} onClick={() => { setEspessura(w); gravar('log.espessura', w); setGmenu(undefined); }}><span>{l}</span><small>{espessura === w ? '✓' : ''}</small></button>
          ))}
          <hr />
          <button onClick={() => { zoom(0.8, gmenu.t); setGmenu(undefined); }}><span>Zoom +</span><small>Ctrl +</small></button>
          <button onClick={() => { setView(undefined); setGmenu(undefined); }}><span>Zoom −, log inteiro</span></button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 8, flexDirection: barra === 'esq' ? 'row-reverse' : barra === 'topo' ? 'column-reverse' : 'row' }}>
        {/* 16: área gráfica */}
        <section className="card" style={{ flex: 1, minWidth: 0, minHeight: 0, padding: 6, display: 'flex' }}>
          {log && log.t.length > 1 ? (
            <canvas ref={cv} style={{ flex: 1, minWidth: 0, cursor: 'crosshair' }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!recording) setGmenu({ x: e.clientX, y: e.clientY, t: timeAtX(e.clientX) }); }}
              onPointerDown={(e) => { if (e.button === 2) return; if (!recording) { drag.current = { x: e.clientX, v: win }; (e.target as HTMLElement).setPointerCapture(e.pointerId); } }}
              onPointerMove={(e) => {
                if (drag.current) {
                  const r = cv.current!.getBoundingClientRect();
                  const dt = ((e.clientX - drag.current.x) / r.width) * (drag.current.v[1] - drag.current.v[0]);
                  if (Math.abs(e.clientX - drag.current.x) > 3) setView([drag.current.v[0] - dt, drag.current.v[1] - dt]);
                }
                if (!recording) setCursor(timeAtX(e.clientX));
              }}
              onPointerUp={() => (drag.current = undefined)}
              onWheel={(e) => { if (!recording) zoom(e.deltaY > 0 ? 1.25 : 0.8, timeAtX(e.clientX)); }} />
          ) : (
            <div style={{ margin: 'auto', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6 }}>
              {st.state === 'conectado' ? 'Clique em Gravar para começar um log.' : 'Conecte na ECU para gravar, ou abra um log salvo.'}<br />
              Roda do mouse dá zoom, arrastar anda no tempo.
            </div>
          )}
        </section>

        {/* 14 e 15: barra e lista de canais */}
        {barra === 'topo' && log && (
          <div className="card lg-topo">
            {lanes.flat().map((ch) => {
              const k = log.channels.indexOf(ch), inf = info(ch);
              return <span key={ch} style={{ borderColor: corDe(ch, k) }}><small>{inf?.[1] ?? ch}</small><b>{fmt(ci >= 0 ? log.data[k][ci] : null, inf?.[3] ?? 2)}</b><i>{inf?.[2]}</i></span>;
            })}
            <span className="lg-pos">{posBtns()}</span>
          </div>
        )}
        {(barra === 'dir' || barra === 'esq' || !log) && (
        <aside className="card" style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="lg-pos" style={{ justifyContent: 'flex-end', padding: '4px 6px 0' }}>{posBtns()}</div>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
            {([['valores', 'Valores'], ['minmax', 'Mínimos e máximos']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ flex: 1, height: 34, border: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: tab === k ? 'var(--amber)' : 'var(--muted)', boxShadow: tab === k ? 'inset 0 -2px 0 var(--amber)' : undefined, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 4 }}>
            {(() => {
              const zerado = (c: string) => { const k = log?.channels.indexOf(c) ?? -1; const st = k >= 0 ? stats[k] : undefined; return !!log && (!st || !Number.isFinite(st.lo) || (st.lo === 0 && st.hi === 0)); };
              const all = (log?.channels ?? LOG_CH.map((c) => c[0])).filter((c) => !semZerados || !zerado(c));
              const emGrupo = new Set(grupos.flatMap((g) => g.canais));
              const linha = (ch: string) => {
                const k = all.indexOf(ch), inf = info(ch), d = inf?.[3] ?? 2;
                const v = log && ci >= 0 && k >= 0 ? log.data[k][ci] : null;
                return (
                  <label key={ch} className="lg-ch" draggable onDragStart={(e) => e.dataTransfer.setData('text/canal', ch)}
                    title="Botão direito: nome, cor, escala e suavização" onContextMenu={(e) => { e.preventDefault(); setEditCanal(ch); }}>
                    <input type="checkbox" checked={vis.has(ch)} onChange={() => setVis((s) => { const n = new Set(s); if (n.has(ch)) n.delete(ch); else n.add(ch); return n; })} />
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: corDe(ch, k), flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inf?.[1] ?? ch}</span>
                    <span className="num" style={{ fontSize: 15, textAlign: 'right' }}>
                      {tab === 'valores' ? `${fmt(v, d)}` : k >= 0 && stats[k] && Number.isFinite(stats[k].lo) ? `${fmt(stats[k].lo, d)} / ${fmt(stats[k].hi, d)}` : '–'}
                      <small style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 3 }}>{inf?.[2]}</small>
                    </span>
                  </label>
                );
              };
              const drop = (gi: number) => ({
                onDragOver: (e: DragEvent) => e.preventDefault(),
                onDrop: (e: DragEvent) => { const ch = e.dataTransfer.getData('text/canal'); if (ch) moverPara(ch, gi); },
              });
              const mover = (gi: number, d: number) => { const n = grupos.slice(); const [g] = n.splice(gi, 1); n.splice(Math.max(0, Math.min(n.length, gi + d)), 0, g); setGrupos(n); };
              return (<>
                {grupos.map((g, gi) => (
                  <div key={gi} className="lg-grp" {...drop(gi)}>
                    <div className="lg-grphead">
                      <span>{g.nome}</span>
                      <button title="Subir o grupo" onClick={() => mover(gi, -1)}>▲</button>
                      <button title="Descer o grupo" onClick={() => mover(gi, 1)}>▼</button>
                      <button title="Apagar o grupo (os canais vão para Sem grupo)" onClick={() => setGrupos(grupos.filter((_, i) => i !== gi))}>×</button>
                    </div>
                    {g.canais.filter((c) => all.includes(c)).map(linha)}
                    {g.canais.filter((c) => all.includes(c)).length === 0 && <div className="lg-vazio">Arraste canais para cá</div>}
                  </div>
                ))}
                <div className="lg-grp" onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { const ch = e.dataTransfer.getData('text/canal'); if (ch) setGrupos([...grupos.map((g) => ({ ...g, canais: g.canais.filter((c) => c !== ch) })), { nome: `Grupo ${grupos.length + 1}`, canais: [ch] }]); }}>
                  <div className="lg-grphead"><span>Sem grupo</span><small>solte aqui para criar um grupo novo</small></div>
                  {all.filter((c) => !emGrupo.has(c)).map(linha)}
                </div>
                <button className="lg-reset" onClick={() => setNovoMat(true)}>+ Canal matemático</button>
                <label className="lg-ch" style={{ cursor: 'pointer' }}><input type="checkbox" checked={semZerados} onChange={(e) => { setSemZerados(e.target.checked); gravar('log.semZerados', e.target.checked); }} /> Esconder canais zerados</label>
                <button className="lg-reset" onClick={() => setGrupos(GRUPOS_PADRAO)}>Voltar aos grupos padrão</button>
              </>);
            })()}
          </div>
          {log && ci >= 0 && <div style={{ padding: '6px 10px', borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)' }}>Cursor em {fmt(log.t[ci] - origem, 3)} s{origem ? ' (da origem)' : ''}</div>}
        </aside>)}
      </div>
    </main>
  );
}

/** Configurações do datalogger: quando começar e parar sozinho, amostras por segundo, salvar sozinho. */
function ConfigLog({ close }: { close: () => void }) {
  const [c, setC] = useState<LogCfg>(getLogCfg());
  const up = (p: Partial<LogCfg>) => setC((x) => ({ ...x, ...p }));
  const num = (v: string) => Math.max(0, Number(v.replace(',', '.')) || 0);
  return (
    <div className="dk-modal" onClick={close}>
      <div className="card lg-cfg" onClick={(e) => e.stopPropagation()}>
        <span className="num" style={{ fontSize: 24 }}>Configurações do datalogger</span>
        <label><span>Começar a gravar</span>
          <select className="field" value={c.inicio} onChange={(e) => up({ inicio: e.target.value as LogCfg['inicio'] })}>
            <option value="manual">Só no botão Gravar</option>
            <option value="rpm">Sozinho, quando a RPM passar de</option>
            <option value="tps">Sozinho, quando a borboleta passar de</option>
            <option value="sempre">Sempre que a ECU estiver conectada</option>
          </select>
        </label>
        {c.inicio === 'rpm' && <label><span>RPM</span><input className="field" inputMode="numeric" value={c.rpm} onChange={(e) => up({ rpm: num(e.target.value) })} /></label>}
        {c.inicio === 'tps' && <label><span>Borboleta (%)</span><input className="field" inputMode="numeric" value={c.tps} onChange={(e) => up({ tps: num(e.target.value) })} /></label>}
        {(c.inicio === 'rpm' || c.inicio === 'tps') && <label><span>Parar depois de (segundos abaixo disso)</span><input className="field" inputMode="decimal" value={c.parar} onChange={(e) => up({ parar: num(e.target.value) })} /></label>}
        <label><span>Amostras por segundo</span>
          <select className="field" value={c.taxa} onChange={(e) => up({ taxa: Number(e.target.value) })}>
            {[5, 10, 20].map((t) => <option key={t} value={t}>{t} por segundo</option>)}
          </select>
        </label>
        <label className="lg-check"><input type="checkbox" checked={c.salvar} onChange={(e) => up({ salvar: e.target.checked })} /> Salvar sozinho na pasta Logs quando parar</label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={close}>Cancelar</button>
          <button className="btn primary" onClick={() => { setLogCfg(c); close(); }}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

function ConfigCanal({ ch, nomePadrao, cfg, mat, salvar, apagarMat, close }: { ch: string; nomePadrao: string; cfg: CanalCfg; mat?: Mat; salvar: (c: CanalCfg | undefined) => void; apagarMat: () => void; close: () => void }) {
  const [c, setC] = useState<CanalCfg>(cfg);
  const n = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));
  return (
    <div className="dk-modal" onClick={close}>
      <div className="card lg-cfg" onClick={(e) => e.stopPropagation()}>
        <span className="num" style={{ fontSize: 24 }}>Canal: {nomePadrao}</span>
        {mat && <span style={{ color: 'var(--muted)', fontSize: 13 }}>Canal matemático: {mat.expr}</span>}
        <label><span>Nome no log</span><input className="field" placeholder={nomePadrao} value={c.nome ?? ''} onChange={(e) => setC({ ...c, nome: e.target.value || undefined })} /></label>
        <label><span>Cor</span><input type="color" value={c.cor ?? '#4CC9F0'} onChange={(e) => setC({ ...c, cor: e.target.value })} style={{ width: 70, height: 36, border: 'none', background: 'none' }} /></label>
        <label><span>Suavização</span>
          <select className="field" value={c.suav ?? 0} onChange={(e) => setC({ ...c, suav: Number(e.target.value) })}>
            {['Desligada', 'Baixa', 'Média', 'Alta'].map((l, i) => <option key={i} value={i}>{l}</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{ flex: 1 }}><span>Escala mínima (vazio = automática)</span><input className="field" inputMode="decimal" defaultValue={c.min ?? ''} onChange={(e) => setC({ ...c, min: n(e.target.value) })} /></label>
          <label style={{ flex: 1 }}><span>Escala máxima</span><input className="field" inputMode="decimal" defaultValue={c.max ?? ''} onChange={(e) => setC({ ...c, max: n(e.target.value) })} /></label>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {mat && <button className="btn" onClick={apagarMat}>Apagar canal</button>}
          <button className="btn" onClick={() => salvar(undefined)}>Restaurar padrão</button>
          <button className="btn" onClick={close}>Cancelar</button>
          <button className="btn primary" onClick={() => salvar(c)}>Salvar</button>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{ch}</span>
      </div>
    </div>
  );
}

function NovoMat({ canais, nomeDe, criar, close }: { canais: string[]; nomeDe: (c: string) => string; criar: (m: Mat) => void; close: () => void }) {
  const [nome, setNome] = useState('Erro de lambda');
  const [unidade, setUnidade] = useState('%');
  const [expr, setExpr] = useState('(lambdaValue - targetLambda) / targetLambda * 100');
  const c = compilar(expr, canais);
  return (
    <div className="dk-modal" onClick={close}>
      <div className="card lg-cfg" style={{ width: 620 }} onClick={(e) => e.stopPropagation()}>
        <span className="num" style={{ fontSize: 24 }}>Novo canal matemático</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{ flex: 2 }}><span>Nome</span><input className="field" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
          <label style={{ flex: 1 }}><span>Unidade</span><input className="field" value={unidade} onChange={(e) => setUnidade(e.target.value)} /></label>
        </div>
        <label><span>Fórmula (clique num canal para colocar)</span><input className="field" style={{ fontSize: 15 }} value={expr} onChange={(e) => setExpr(e.target.value)} /></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 120, overflow: 'auto' }}>
          {canais.map((ch) => <button key={ch} className="btn" style={{ height: 26, fontSize: 12, padding: '0 8px' }} onClick={() => setExpr((x) => `${x} ${ch}`.trim())}>{nomeDe(ch)}</button>)}
        </div>
        <span style={{ fontSize: 12, color: c.erro ? 'var(--red)' : 'var(--muted)' }}>{c.erro ?? 'Dá para usar + − * / ( ) e abs, min, max, sqrt, pow, round. Ex.: MAPValue - baroPressure'}</span>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={close}>Cancelar</button>
          <button className="btn primary" disabled={!!c.erro || !nome.trim()} onClick={() => criar({ id: 'mat_' + nome.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'), nome: nome.trim(), unidade, expr })}>Criar canal</button>
        </div>
      </div>
    </div>
  );
}

/** Overlay (manual de referência 17.3): o mapa dentro do log. Mostra a célula do cursor, por onde o log passou
 *  e, no mapa de injeção, quanto corrigir pela lambda medida × alvo. Dá para editar e aplicar a correção. */
function OverlayMapa({ log, ci, win }: { log: LogData; ci: number; win: [number, number] }) {
  const st = useStatus();
  const [qual, setQual] = useState<'inj' | 'ign'>('inj');
  const cfg = qual === 'inj' ? MAPA_INJECAO : MAPA_IGNICAO;
  const tune = Math.min(3, Math.max(1, useLive(['tuneInUse']).tuneInUse ?? 1));
  const { table, setTable, error } = useTable(cfg.tables[tune - 1]);
  const [sel, setSel] = useState<[number, number]>();
  const [msg, setMsg] = useState<string>();
  const on = st.state === 'conectado';
  const col = (n: string) => log.channels.indexOf(n);
  const kR = col('RPMValue'), kM = col('MAPValue'), kT = col('TPSValue'), kL = col('lambdaValue'), kA = col('targetLambda');
  const near = (bins: number[], v: number) => { let b = 0; bins.forEach((x, i) => { if (Math.abs(x - v) < Math.abs(bins[b] - v)) b = i; }); return b; };
  const cel = useMemo(() => {
    if (!table) return undefined;
    const usaTps = table.yUnits === '%';
    const kY = usaTps ? kT : kM;
    const n = new Array(table.rows * table.cols).fill(0), soma = new Array(table.rows * table.cols).fill(0), ns = new Array(table.rows * table.cols).fill(0);
    const pos = (i: number) => {
      const rpm = log.data[kR]?.[i], y = log.data[kY]?.[i];
      if (rpm == null || y == null) return -1;
      return near(table.yBins, y) * table.cols + near(table.xBins, rpm);
    };
    for (let i = 0; i < log.t.length; i++) {
      if (log.t[i] < win[0] || log.t[i] > win[1]) continue;
      const p = pos(i); if (p < 0) continue;
      n[p]++;
      const l = kL >= 0 ? log.data[kL][i] : null, a = kA >= 0 ? log.data[kA][i] : null;
      if (l != null && a != null && a > 0.5 && l > 0.5 && l < 1.3) { soma[p] += l / a; ns[p]++; }
    }
    return { n, fator: soma.map((s, i) => (ns[i] >= 5 ? s / ns[i] : null)), cursor: ci >= 0 ? pos(ci) : -1 };
  }, [table, log, log.t.length, win[0], win[1], ci]); // eslint-disable-line react-hooks/exhaustive-deps

  async function mudar(cells: { index: number; value: number }[]) {
    if (!table) return;
    try { setTable(await call<TableData>('setCells', { name: table.name, cells })); setMsg(undefined); } catch (e) { setMsg((e as Error).message); }
  }
  const corrigir = () => {
    if (!table || !cel) return;
    const cells = cel.fator.map((f, i) => (f == null ? null : { index: i, value: Math.round(table.values[i] * f * 1000) / 1000 })).filter(Boolean) as { index: number; value: number }[];
    if (!cells.length) { setMsg('Ainda não há dados de lambda suficientes (5 amostras por célula) na parte do log que está na tela.'); return; }
    void mudar(cells).then(() => setMsg(`Corrigidas ${cells.length} células pela lambda. Dá para desfazer com ⌘Z.`));
  };
  if (!on) return <div className="card lg-ov"><span style={{ color: 'var(--muted)' }}>Abra um mapa (ou conecte a ECU ou a demonstração) para ver o mapa dentro do log.</span></div>;
  if (error) return <div className="card lg-ov"><span className="notice err">{error}</span></div>;
  if (!table || !cel) return <div className="card lg-ov">Lendo o mapa…</div>;
  const lo = Math.min(...table.values), hi = Math.max(...table.values);
  const rows = Array.from({ length: table.rows }, (_, i) => table.rows - 1 - i);
  const sIdx = sel ? sel[0] * table.cols + sel[1] : cel.cursor;
  return (
    <div className="card lg-ov">
      <div className="lg-ovgrid" style={{ gridTemplateColumns: `44px repeat(${table.cols}, minmax(0, 1fr))` }}>
        <span />
        {table.xBins.map((x, c) => <span key={c} className="lg-ovax">{x >= 1000 ? `${fmt(x / 1000, 1)}k` : fmt(x)}</span>)}
        {rows.map((r) => [
          <span key={'y' + r} className="lg-ovax">{fmt(table.yBins[r])}</span>,
          ...table.xBins.map((_, c) => {
            const i = r * table.cols + c, f = cel.fator[i];
            return (
              <button key={i} className={`lg-ovc ${i === cel.cursor ? 'cur' : ''} ${i === sIdx ? 'sel' : ''}`} style={{ background: heat(table.values[i], lo, hi), opacity: cel.n[i] ? 1 : 0.45 }}
                onClick={() => setSel([r, c])} title={`${cel.n[i]} amostras${f != null ? ` · correção ${fmt((f - 1) * 100, 1)} %` : ''}`}>
                {fmt(table.values[i], cfg.digits)}
                {qual === 'inj' && f != null && <small style={{ color: f > 1.01 ? '#FFB3B5' : f < 0.99 ? '#9BEFC0' : '#ddd' }}>{f > 1 ? '+' : ''}{fmt((f - 1) * 100, 0)}%</small>}
              </button>
            );
          }),
        ])}
      </div>
      <aside className="lg-ovside">
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`btn ${qual === 'inj' ? 'primary' : ''}`} style={{ height: 30, flex: 1 }} onClick={() => setQual('inj')}>Injeção</button>
          <button className={`btn ${qual === 'ign' ? 'primary' : ''}`} style={{ height: 30, flex: 1 }} onClick={() => setQual('ign')}>Ignição</button>
        </div>
        <span className="label">{sel ? 'Célula escolhida' : 'Célula do cursor'}</span>
        {sIdx >= 0 && <>
          <span style={{ fontSize: 13 }}>{fmt(table.xBins[sIdx % table.cols])} rpm · {fmt(table.yBins[Math.floor(sIdx / table.cols)])} {table.yUnits === '%' ? '%' : 'kPa'}</span>
          <span className="num" style={{ fontSize: 34, color: 'var(--amber)' }}>{fmt(table.values[sIdx], cfg.digits)} <small style={{ fontSize: 14, color: 'var(--muted)' }}>{cfg.unit}</small></span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn" style={{ height: 32, flex: 1 }} onClick={() => mudar([{ index: sIdx, value: cfg.small[1](table.values[sIdx]) }])}>− {cfg.small[0]}</button>
            <button className="btn" style={{ height: 32, flex: 1 }} onClick={() => mudar([{ index: sIdx, value: cfg.small[2](table.values[sIdx]) }])}>+ {cfg.small[0]}</button>
          </div>
        </>}
        {qual === 'inj' && <button className="btn primary" style={{ height: 34 }} onClick={corrigir} title="Usa a lambda medida e a lambda alvo do pedaço do log que está na tela">Corrigir pela lambda</button>}
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Células apagadas: o log não passou por elas na parte que está na tela. Os números pequenos mostram quanto a lambda pede de combustível.</span>
        {msg && <span style={{ fontSize: 12, color: 'var(--amber)' }}>{msg}</span>}
      </aside>
    </div>
  );
}
