// Diagrama de sincronismo: desenha, com a configuração da ECU, os dentes da roda fônica, o sensor de fase,
// o PMS de cada cilindro, os 4 tempos, a ignição e a injeção. Dá para dar zoom, arrastar para o lado
// e animar (o cursor anda e as rodas giram). É um desenho calculado pela configuração, não uma leitura dos sensores.
import { useEffect, useRef, useState } from 'react';
import { call, useLive, useStatus } from '../api';
import { fmt } from '../format';

const CAMPOS = ['cylindersCount', 'firingOrder', 'trigger_type', 'trigger_customTotalToothCount', 'trigger_customSkippedToothCount',
  'globalTriggerAngleOffset', 'vvtMode1', 'vvtOffsets1', 'injectionMode', 'ignitionMode', 'injectionTimingMode', 'twoStroke',
  ...Array.from({ length: 12 }, (_, k) => `customFiringOrder${k + 1}`)];
type Val = number | string | null;

const COR_TEMPO = ['#2f7fd8', '#e7c331', '#e0474c', '#6b7380']; // admissão, compressão, expansão, escape
const NOME_TEMPO = ['Admissão', 'Compressão', 'Expansão', 'Escape'];
const MODO_INJ: Record<string, string> = { Simultaneous: 'Simultânea', Sequential: 'Sequencial', Batch: 'Semissequencial (em pares)', 'Single Point': 'Monoponto' };
const MODO_IGN: Record<string, string> = { 'Single Coil': 'Distribuidor', 'Individual Coils': 'Bobinas individuais', 'Wasted Spark': 'Centelha perdida', 'Two Distributors': 'Dois distribuidores' };
const MOMENTO: Record<string, string> = { 'End of injection': 'fim', 'Start of injection': 'início', 'Center of injection': 'meio' };

/** Roda fônica pelo nome (60-2, 36-1…); "custom toothed wheel" usa os campos de dentes. */
function roda(nome: string, total: number, falta: number): { n: number; m: number; extra: number; texto: string } {
  if (/^custom/i.test(nome)) return { n: Math.max(1, total || 60), m: Math.max(0, falta || 0), extra: 0, texto: `${total}-${falta} (personalizada)` };
  const r = nome.match(/(\d+)\s*-\s*(\d+)/);
  if (r) return { n: Number(r[1]), m: Number(r[2]), extra: 0, texto: nome };
  const e = nome.match(/(\d+)\s*\+\s*(\d+)/); // ex.: Honda K 12+1 = 12 dentes iguais + 1 dente a mais
  if (e) return { n: Number(e[1]), m: 0, extra: Number(e[2]), texto: nome };
  if (/single tooth/i.test(nome)) return { n: 1, m: 0, extra: 0, texto: '1 dente' };
  return { n: 0, m: 0, extra: 0, texto: `${nome} (desenho dos dentes indisponível)` };
}
/** Ordem de ignição em números (a "personalizada" lê os campos 1º, 2º…). */
function ordem(label: string, n: number, v: Record<string, Val>): number[] {
  if (/^Custom/i.test(label)) return Array.from({ length: n }, (_, k) => Number(v[`customFiringOrder${k + 1}`]) || k + 1);
  if (label === 'One Cylinder') return [1];
  const o = label.split(' ')[0].split(/[-_]/).map(Number).filter((x) => x > 0);
  return o.length === n ? o : Array.from({ length: n }, (_, k) => k + 1);
}
const mod = (a: number, m: number) => ((a % m) + m) % m;
function passo(range: number, n: number) { const raw = range / n, e = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 1.5, 3, 4.5, 9, 10].map((m) => m * e).find((x) => x >= raw * 0.99) ?? raw; }

export function Sincronismo() {
  const s = useStatus();
  const live = useLive(['RPMValue', 'ignitionAdvanceCyl1', 'actualLastInjection', 'injectionOffset', 'sparkDwellValue']);
  const [v, setV] = useState<Record<string, Val>>();
  const [msg, setMsg] = useState<string>();
  const [inicio, setInicio] = useState(-90);
  const [janela, setJanela] = useState(810);
  const [cursor, setCursor] = useState(0);
  const [anima, setAnima] = useState(false);
  const [rpmDes, setRpmDes] = useState(3000);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1000);
  const arraste = useRef<{ x: number; ini: number; moveu: boolean } | undefined>(undefined);

  useEffect(() => {
    if (s.state !== 'conectado') return;
    (async () => {
      const c = await call<Record<string, Val>>('constants', { names: CAMPOS });
      // campos de opções vêm como número: troca pelo nome da opção
      for (const k of ['firingOrder', 'trigger_type', 'vvtMode1', 'injectionMode', 'ignitionMode', 'injectionTimingMode', 'twoStroke']) {
        if (typeof c[k] !== 'number') continue;
        try { const op = await call<string[]>('options', { name: k }); c[k] = op[c[k] as number] ?? c[k]; } catch { /* campo não existe nesta ECU */ }
      }
      setV(c);
    })().catch((e) => setMsg((e as Error).message));
  }, [s.state, s.rev]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); return () => ro.disconnect();
  }, [v]);
  // animação: o cursor anda devagar (1 volta do motor a cada ~3 s) e a janela acompanha
  useEffect(() => {
    if (!anima) return;
    let t0 = performance.now(), raf = 0;
    const passoAnim = (t: number) => {
      const d = ((t - t0) / 1000) * 240; t0 = t;
      setCursor((c) => {
        const nc = c + d;
        setInicio((i) => (nc > i + janela * 0.8 ? nc - janela * 0.2 : nc < i ? nc - janela * 0.2 : i));
        return nc;
      });
      raf = requestAnimationFrame(passoAnim);
    };
    raf = requestAnimationFrame(passoAnim);
    return () => cancelAnimationFrame(raf);
  }, [anima, janela]);

  if (s.state !== 'conectado') return <main className="screen"><div className="notice err">Conecte na ECU (ou use a demonstração) para ver o diagrama.</div></main>;
  if (!v) return <main className="screen"><span className="label">{msg ?? 'Lendo…'}</span></main>;

  const n = Math.max(1, Number(v.cylindersCount) || 4);
  const dois = String(v.twoStroke).startsWith('Two');
  const ciclo = dois ? 360 : 720;
  const ord = ordem(String(v.firingOrder ?? ''), n, v);
  const rd = roda(String(v.trigger_type ?? ''), Number(v.trigger_customTotalToothCount), Number(v.trigger_customSkippedToothCount));
  const alinh = Number(v.globalTriggerAngleOffset) || 0;
  const camModo = String(v.vvtMode1 ?? 'Inactive');
  const temCam = !/inactive/i.test(camModo);
  const camAng = Number(v.vvtOffsets1) || 0;
  const injModo = String(v.injectionMode ?? 'Sequential');
  const ignModo = String(v.ignitionMode ?? 'Individual Coils');
  const rpmVivo = (live.RPMValue ?? 0) > 300;
  const rpm = rpmVivo ? (live.RPMValue as number) : rpmDes;
  const avanco = rpmVivo && live.ignitionAdvanceCyl1 != null ? live.ignitionAdvanceCyl1 : 15;
  const injMs = rpmVivo && live.actualLastInjection ? live.actualLastInjection : 3;
  const faseInj = live.injectionOffset != null && rpmVivo ? live.injectionOffset : -360;
  const dwellMs = live.sparkDwellValue ?? 3;
  const grau = (ms: number) => (ms * rpm * 6) / 1000; // ms → graus do virabrequim
  const injGraus = grau(injMs), dwellGraus = grau(dwellMs);
  const momento = MOMENTO[String(v.injectionTimingMode)] ?? 'fim';
  const pms = (pos: number) => (pos * ciclo) / n; // PMS de compressão do pos-ésimo a disparar (cil. da 1ª posição em 0°)
  const pmsCil = new Map(ord.map((c, k) => [c, pms(k)]));

  // escala
  const L = 90, R = 16, Wd = Math.max(400, w), larg = Wd - L - R;
  const px = (a: number) => L + ((a - inicio) / janela) * larg;
  const fim = inicio + janela;
  const ciclosVisiveis = (fn: (base: number) => React.ReactNode[]) => {
    const out: React.ReactNode[] = [];
    for (let base = Math.floor((inicio - ciclo) / ciclo) * ciclo; base <= fim + ciclo; base += ciclo) out.push(...fn(base));
    return out;
  };
  const LIN = { dentes: 30, pms: 30, cil: 14, fase: 26, ign: 26, inj: 14 };
  let y = 34;
  const yDentes = y; y += LIN.dentes + 8;
  const yPms = y; y += LIN.pms + 8;
  const yCic = y; y += LIN.cil * n + 8;
  const yFase = y; y += LIN.fase + 8;
  const yIgn = y; y += LIN.ign + 8;
  const injSeq = /Sequential/.test(injModo);
  const nInj = injSeq ? n : 1;
  const yInj = y; y += LIN.inj * nInj + 8;
  const H = y + 4;
  const st = passo(janela, Math.max(4, Math.floor(larg / 80)));

  const dentes: React.ReactNode[] = [];
  if (rd.n > 0) {
    const esp = 360 / rd.n;
    const sinc = -alinh; // primeiro dente depois da falha
    for (let volta = Math.floor((inicio - sinc) / 360) - 1; volta * 360 + sinc <= fim + 360; volta++) {
      for (let k = 0; k < rd.n - rd.m; k++) {
        const a = sinc + volta * 360 + k * esp;
        if (a < inicio - esp || a > fim + esp) continue;
        dentes.push(<rect key={`d${volta}_${k}`} x={px(a)} y={yDentes} width={Math.max(1, (esp / janela) * larg * 0.5)} height={LIN.dentes} fill={k === 0 ? '#ffd54a' : '#3b8fe6'} />);
      }
      for (let j = 0; j < rd.extra; j++) { // dente a mais (sincronismo) entre o 1º e o 2º
        const a = sinc + volta * 360 + (j + 0.5) * esp / Math.max(1, rd.extra);
        if (a >= inicio - esp && a <= fim + esp) dentes.push(<rect key={`x${volta}_${j}`} x={px(a)} y={yDentes + 6} width={Math.max(1, (esp / janela) * larg * 0.3)} height={LIN.dentes - 6} fill="#ffd54a" />);
      }
    }
  }

  const alvo = (e: React.PointerEvent) => { const r = box.current!.getBoundingClientRect(); return inicio + ((e.clientX - r.left - L) / larg) * janela; };
  const zoom = (f: number) => { const c = cursor; const nj = Math.max(90, Math.min(2880, janela * f)); setInicio(c - (c - inicio) * (nj / janela)); setJanela(nj); };

  // posição das rodas no cursor
  const angCrank = mod(cursor + alinh, 360);
  const linha = (yy: number, h: number, nome: string) => (
    <g key={nome}><rect x={L} y={yy} width={larg} height={h} fill="#1d2026" /><text x={L - 8} y={yy + h / 2 + 4} fill="var(--muted)" fontSize={12} textAnchor="end">{nome}</text></g>
  );

  return (
    <main className="screen" style={{ gap: 10, paddingTop: 10 }}>
      <div className="card sinc-resumo">
        <span>Cilindros: <b>{n}</b></span><span>Roda: <b>{rd.texto}</b></span><span>Alinhamento do 1º dente: <b>{fmt(alinh, 1)}°</b></span>
        <span>Sensor de fase: <b>{temCam ? `${camModo} · ${fmt(camAng, 1)}°` : 'não usa'}</b></span>
        <span>Ordem: <b>{ord.join('-')}</b></span><span>Injeção: <b>{MODO_INJ[injModo] ?? injModo}</b></span><span>Ignição: <b>{MODO_IGN[ignModo] ?? ignModo}</b></span>
        <span>Fase da injeção: <b>{fmt(faseInj, 0)}° ({momento})</b></span>
      </div>
      <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flexGrow: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ flexGrow: 1 }}>Diagrama: arraste para o lado, clique para pôr o cursor</b>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{rpmVivo ? `Motor girando: ${fmt(rpm, 0)} RPM` : 'Desenho a'}</span>
          {!rpmVivo && <>
            <button className="btn" style={{ height: 34 }} onClick={() => setRpmDes(Math.max(500, rpmDes - 500))}>−</button>
            <span className="num" style={{ minWidth: 70, textAlign: 'center' }}>{fmt(rpmDes, 0)} RPM</span>
            <button className="btn" style={{ height: 34 }} onClick={() => setRpmDes(Math.min(12000, rpmDes + 500))}>+</button>
          </>}
          <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 10 }}>Janela {fmt(janela, 0)}°</span>
          <button className="btn" style={{ height: 34 }} onClick={() => zoom(1.5)}>−</button>
          <button className="btn" style={{ height: 34 }} onClick={() => zoom(1 / 1.5)}>+</button>
          <button className="btn" style={{ height: 34 }} onClick={() => { setInicio(-90); setJanela(ciclo + 90); }}>Ajustar</button>
          <button className={`btn ${anima ? 'primary' : ''}`} style={{ height: 34, minWidth: 90 }} onClick={() => setAnima(!anima)}>{anima ? 'Parar' : 'Animar'}</button>
        </div>
        <div ref={box} style={{ position: 'relative', touchAction: 'none', cursor: 'grab', flexShrink: 0 }}
          onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); arraste.current = { x: e.clientX, ini: inicio, moveu: false }; }}
          onPointerMove={(e) => { const a = arraste.current; if (!a) return; const dx = e.clientX - a.x; if (Math.abs(dx) > 3) a.moveu = true; if (a.moveu) setInicio(a.ini - (dx / larg) * janela); }}
          onPointerUp={(e) => { const a = arraste.current; arraste.current = undefined; if (a && !a.moveu) setCursor(alvo(e)); }}
          onWheel={(e) => zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2)}>
          <svg width={Wd} height={H} style={{ display: 'block', userSelect: 'none' }}>
            {/* escala de graus */}
            {(() => { const out: React.ReactNode[] = []; for (let a = Math.ceil(inicio / st) * st; a <= fim; a += st) out.push(
              <g key={`e${a}`}><line x1={px(a)} x2={px(a)} y1={22} y2={H - 4} stroke="#30343b" /><text x={px(a)} y={16} fill="var(--text)" fontSize={12} textAnchor="middle">{fmt(a, 0)}°</text></g>); return out; })()}
            <defs><clipPath id="sinc-area"><rect x={L} y={0} width={larg} height={H} /></clipPath></defs>
            {linha(yDentes, LIN.dentes, 'Dentes')}
            <g clipPath="url(#sinc-area)">{dentes}
            </g>
            {linha(yPms, LIN.pms, 'PMS')}
            <g clipPath="url(#sinc-area)">
            {ciclosVisiveis((base) => ord.map((c, k) => { const a = base + pms(k); return a < inicio - 5 || a > fim + 5 ? null : (
              <g key={`p${base}_${k}`}><line x1={px(a)} x2={px(a)} y1={yPms + 2} y2={yPms + LIN.pms - 12} stroke="#ff5a5f" strokeWidth={2} />
                <text x={px(a)} y={yPms + LIN.pms - 1} fill="#ff8a8d" fontSize={11} textAnchor="middle">Cil {c}</text></g>); }))}
            </g>
            {/* 4 tempos de cada cilindro */}
            {Array.from({ length: n }, (_, i) => i + 1).map((c, i) => (
              <g key={`c${c}`}>
                <text x={L - 8} y={yCic + i * LIN.cil + 11} fill="var(--muted)" fontSize={11} textAnchor="end">{i === 0 ? 'Ciclo  ' : ''}{c}</text>
                <g clipPath="url(#sinc-area)">{ciclosVisiveis((base) => [0, 1, 2, 3].map((t) => {
                  const p = base + (pmsCil.get(c) ?? 0);
                  const ini = dois ? p - 180 + t * 90 : p - 360 + t * 180; const lg = dois ? 90 : 180;
                  if (ini + lg < inicio || ini > fim) return null;
                  return <rect key={`t${base}_${c}_${t}`} x={px(ini)} y={yCic + i * LIN.cil} width={(lg / janela) * larg} height={LIN.cil - 2} fill={COR_TEMPO[t]} opacity={0.85}>
                    <title>{`Cilindro ${c}: ${NOME_TEMPO[t]}`}</title></rect>;
                }))}</g>
              </g>
            ))}
            {linha(yFase, LIN.fase, 'Fase')}
            {linha(yIgn, LIN.ign, 'Ignição')}
            <g clipPath="url(#sinc-area)">
            {temCam && ciclosVisiveis((base) => { const a = base + mod(-camAng, ciclo); return a < inicio || a > fim ? [] : [
              <g key={`f${base}`}><rect x={px(a) - 2} y={yFase + 3} width={5} height={LIN.fase - 6} fill="#ffd54a" /><text x={px(a) + 6} y={yFase + 17} fill="#ffd54a" fontSize={11}>fase</text></g>]; })}
            {ciclosVisiveis((base) => ord.flatMap((c, k) => {
              const centelhas = /Wasted/.test(ignModo) && !dois ? [0, 360] : [0];
              return centelhas.map((extra) => { const a = base + pms(k) - avanco + extra; if (a < inicio - dwellGraus || a > fim + 5) return null; return (
                <g key={`i${base}_${k}_${extra}`}><rect x={px(a - dwellGraus)} y={yIgn + 8} width={(dwellGraus / janela) * larg} height={LIN.ign - 16} fill="rgba(255,159,28,.35)" />
                  <line x1={px(a)} x2={px(a)} y1={yIgn + 3} y2={yIgn + LIN.ign - 3} stroke="var(--amber)" strokeWidth={2} />
                  {extra === 0 && <text x={px(a) + 3} y={yIgn + 11} fill="var(--amber)" fontSize={10}>{c}</text>}</g>); });
            }))}
            </g>
            {/* injeção */}
            {Array.from({ length: nInj }, (_, i) => (
              <g key={`inj${i}`}>
                <rect x={L} y={yInj + i * LIN.inj} width={larg} height={LIN.inj - 2} fill="#1d2026" />
                <text x={L - 8} y={yInj + i * LIN.inj + 11} fill="var(--muted)" fontSize={11} textAnchor="end">{injSeq ? `${i === 0 ? 'Injeção  ' : ''}${i + 1}` : 'Injeção'}</text>
                <g clipPath="url(#sinc-area)">{ciclosVisiveis((base) => {
                  const pulsos = injSeq ? [base + (pmsCil.get(i + 1) ?? 0) + faseInj]
                    : /Batch/.test(injModo) ? [base + faseInj, base + faseInj + ciclo / 2] : Array.from({ length: dois ? 1 : 2 }, (_, k) => base + k * 360 + faseInj);
                  return pulsos.map((ref, k) => {
                    const ini = momento === 'fim' ? ref - injGraus : momento === 'meio' ? ref - injGraus / 2 : ref;
                    if (ini + injGraus < inicio || ini > fim) return null;
                    return <rect key={`j${base}_${i}_${k}`} x={px(ini)} y={yInj + i * LIN.inj + 1} width={Math.max(2, (injGraus / janela) * larg)} height={LIN.inj - 4} fill="var(--cyan)" rx={2} />;
                  });
                })}</g>
              </g>
            ))}
            {/* cursor */}
            <line x1={px(cursor)} x2={px(cursor)} y1={22} y2={H - 4} stroke="#fff" strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={px(cursor) + 4} y={30} fill="#fff" fontSize={11}>{fmt(cursor, 0)}°</text>
          </svg>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <Roda titulo="Roda fônica (virabrequim)" n={rd.n} m={rd.m} extra={rd.extra} ang={angCrank} />
          {temCam && <Roda titulo={`Roda de comando · ${fmt(camAng, 0)}°`} n={1} m={0} ang={mod((cursor + camAng) / 2, 360)} />}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
            {NOME_TEMPO.map((t, i) => <span key={t}><span style={{ display: 'inline-block', width: 14, height: 10, background: COR_TEMPO[i], marginRight: 5 }} />{t}</span>)}
            <span><span style={{ display: 'inline-block', width: 14, height: 10, background: 'var(--cyan)', marginRight: 5 }} />Bico aberto ({fmt(injMs, 1)} ms)</span>
            <span><span style={{ display: 'inline-block', width: 14, height: 10, background: 'var(--amber)', marginRight: 5 }} />Centelha ({fmt(avanco, 1)}° de avanço, carga {fmt(dwellMs, 1)} ms)</span>
            <span><span style={{ display: 'inline-block', width: 14, height: 10, background: '#ffd54a', marginRight: 5 }} />1º dente depois da falha</span>
          </div>
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>0° = PMS de compressão do cilindro 1. Desenho calculado pela configuração da ECU{rpmVivo ? ' e pelos valores ao vivo' : ''}; confira o ponto com a lâmpada de ponto.</span>
      </div>
    </main>
  );
}

/** Roda vista de frente, girando com o cursor. */
function Roda({ titulo, n, m, ang, extra = 0 }: { titulo: string; n: number; m: number; ang: number; extra?: number }) {
  const R = 46, c = 54;
  const dentes = n > 0 ? [...Array.from({ length: n - m }, (_, k) => (k * 360) / n), ...Array.from({ length: extra }, (_, j) => ((j + 0.5) * 360) / n / Math.max(1, extra))] : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width={108} height={108}>
        <g transform={`rotate(${-ang} ${c} ${c})`}>
          <circle cx={c} cy={c} r={R - 6} fill="#24323f" />
          {dentes.map((a, k) => { const t = ((a - 90) * Math.PI) / 180; return (
            <line key={k} x1={c + (R - 6) * Math.cos(t)} y1={c + (R - 6) * Math.sin(t)} x2={c + R * Math.cos(t)} y2={c + R * Math.sin(t)}
              stroke={k === 0 ? '#ffd54a' : '#3b8fe6'} strokeWidth={n > 40 ? 2 : n > 1 ? 4 : 10} />); })}
        </g>
        <polygon points={`${c - 6},2 ${c + 6},2 ${c},12`} fill="#fff" />
      </svg>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{titulo}</span>
    </div>
  );
}
