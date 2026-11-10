// Teste com o simulador REAL: para cada campo da página 1 usado pelas telas do app,
// escreve um valor diferente, lê de volta da ECU (depois de 150 ms) e restaura.
// Uso: npx tsx test/sim-campos.ts   (simulador na porta 29001; ninguém mais conectado)
import fs from 'node:fs';
import path from 'node:path';
import { parseIni, TYPE_SIZE, type Field } from '../src/core/ini.js';
import { TsClient } from '../src/core/protocol.js';
import { tcpTransport } from '../src/bridge/ecu.js';
import { decodeField, encodeArray, encodeBits, encodeScalar } from '../src/core/codec.js';

const ini = parseIni(fs.readFileSync('ini/simulador.ini', 'latin1'));
// nomes usados nas telas: todo texto entre aspas em src/ui que é um campo da página 1
const files: string[] = [];
const walk = (d: string) => fs.readdirSync(d).forEach((f) => { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && files.push(p); });
walk('src/ui'); files.push('src/bridge/ecu.ts');
const names = new Set<string>();
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/['"`]([A-Za-z_][\w]*)['"`]/g)) {
  const c = ini.constants.get(m[1]);
  if (c && c.page === 1) names.add(m[1]);
}
// tabelas: eixos e valores
for (const t of ini.tables.values()) for (const n of [t.xBins, t.yBins, t.zBins]) if (ini.constants.get(n)?.page === 1 && fs.readFileSync('src/ui/screens/MapaInjecao.tsx', 'utf8').includes(t.name)) names.add(n);
const SKIP = new Set(process.argv.slice(2)); // campos que derrubam o simulador ficam de fora: passar na linha de comando

const c = new TsClient(await tcpTransport('127.0.0.1', 29001), 3000);
const sig = await c.signature();
if (sig !== ini.signature) { console.log('assinatura diferente', sig); process.exit(1); }
const page = await c.readPage(ini, 1);
const span = (f: Field) => f.kind === 'array' ? f.rows * f.cols * TYPE_SIZE[f.type] : TYPE_SIZE[f.type];
const readBack = async (f: Field) => {
  const n = span(f);
  const buf = page.slice();
  for (let off = 0; off < n; off += ini.blockingFactor) {
    const k = Math.min(ini.blockingFactor, n - off);
    const d = await c.request([0x52, 0, 0, (f.offset + off) & 0xff, (f.offset + off) >> 8, k & 0xff, k >> 8]);
    if (d[0] !== 0) throw new Error('leitura erro ' + d[0]);
    buf.set(d.subarray(1, 1 + k), f.offset + off);
  }
  return buf;
};
const near = (a: number, b: number, f: { scale: number }) => Math.abs(a - b) <= Math.abs(f.scale) * 0.51 + 1e-6;
const fails: string[] = [];
let ok = 0;
for (const name of [...names].sort()) {
  if (SKIP.has(name)) continue;
  const f = ini.constants.get(name)!;
  const work = page.slice();
  let want: number | number[];
  let lo: number, hi: number;
  if (f.kind === 'bits') {
    const cur = decodeField(page, f) as number;
    const opts = f.options.map((o, i) => [o, i] as const).filter(([o, i]) => i !== cur && o && !/INVALID|^"?\s*"?$/i.test(o));
    if (!opts.length) continue;
    want = opts[0][1];
    [lo, hi] = encodeBits(work, f, want);
  } else {
    const step = (f.scale || 1) * Math.max(1, Math.round(1 / Math.abs(f.scale || 1) / 10)); // passo pequeno e representável
    const pick = (cur: number) => {
      let v = cur + step;
      if (f.max !== undefined && v > f.max) v = cur - step;
      if (f.min !== undefined && v < f.min) v = cur;
      return v;
    };
    if (f.kind === 'scalar') {
      want = pick(decodeField(page, f) as number);
      [lo, hi] = encodeScalar(work, f, want);
    } else {
      const arr = decodeField(page, f) as number[];
      // eixos precisam continuar crescentes: muda só o último ponto para cima
      const i = arr.length - 1;
      const v = pick(arr[i]);
      want = arr.slice(); (want as number[])[i] = v;
      [lo, hi] = encodeArray(work, f, [v], i);
    }
  }
  try {
    await c.request([0x43, 0, 0, lo & 0xff, lo >> 8, (hi - lo) & 0xff, (hi - lo) >> 8, ...work.subarray(lo, hi)]);
    await new Promise((r) => setTimeout(r, 150));
    const got = decodeField(await readBack(f), f);
    const exp = decodeField(work, f);
    const same = Array.isArray(exp) ? (got as number[]).every((g, k) => near(g, exp[k], f as { scale: number })) : (f.kind === 'bits' ? got === exp : near(got as number, exp, f));
    if (same) ok++; else fails.push(`${name}: escrevi ${JSON.stringify(exp)} li ${JSON.stringify(got)}`);
    // restaura
    await c.request([0x43, 0, 0, lo & 0xff, lo >> 8, (hi - lo) & 0xff, (hi - lo) >> 8, ...page.subarray(lo, hi)]);
    await new Promise((r) => setTimeout(r, 30));
  } catch (e) {
    fails.push(`${name}: ${(e as Error).message}`);
    console.log('PAROU em', name, (e as Error).message);
    break;
  }
}
const after = await c.readPage(ini, 1);
let diff = 0; for (let i = 0; i < after.length; i++) if (after[i] !== page[i]) diff++;
console.log(`campos testados ${ok + fails.length} de ${names.size}, ok ${ok}, falhas ${fails.length}, bytes diferentes no fim ${diff}`);
fails.forEach((x) => console.log(' -', x));
process.exit(0);
