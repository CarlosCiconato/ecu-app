// Converte bytes da ECU em valores físicos e vice-versa, usando a descrição do .ini.
import { TYPE_SIZE, type ArrayField, type BitsField, type Field, type ScalarField } from './ini.js';

function readRaw(buf: Uint8Array, type: ScalarField['type'], off: number): number {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  switch (type) {
    case 'U08': return dv.getUint8(off);
    case 'S08': return dv.getInt8(off);
    case 'U16': return dv.getUint16(off, true);
    case 'S16': return dv.getInt16(off, true);
    case 'U32': return dv.getUint32(off, true);
    case 'S32': return dv.getInt32(off, true);
    case 'F32': return dv.getFloat32(off, true);
  }
}

function writeRaw(buf: Uint8Array, type: ScalarField['type'], off: number, v: number): void {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const clamp = (lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));
  switch (type) {
    case 'U08': dv.setUint8(off, clamp(0, 0xff)); break;
    case 'S08': dv.setInt8(off, clamp(-0x80, 0x7f)); break;
    case 'U16': dv.setUint16(off, clamp(0, 0xffff), true); break;
    case 'S16': dv.setInt16(off, clamp(-0x8000, 0x7fff), true); break;
    case 'U32': dv.setUint32(off, clamp(0, 0xffffffff), true); break;
    case 'S32': dv.setInt32(off, clamp(-0x80000000, 0x7fffffff), true); break;
    case 'F32': dv.setFloat32(off, v, true); break;
  }
}

// Valor físico = (bruto + translate) * scale  (convenção do TunerStudio)
export const toPhys = (raw: number, f: { scale: number; translate: number }) => (raw + f.translate) * f.scale;
export const toRaw = (phys: number, f: { scale: number; translate: number }) => phys / f.scale - f.translate;

export function decodeScalar(buf: Uint8Array, f: ScalarField, base = 0): number {
  return toPhys(readRaw(buf, f.type, base + f.offset), f);
}

export function decodeBits(buf: Uint8Array, f: BitsField, base = 0): number {
  const raw = readRaw(buf, f.type, base + f.offset) >>> 0;
  const width = f.bitHi - f.bitLo + 1;
  return (raw >>> f.bitLo) & ((1 << width) - 1);
}

export function decodeArray(buf: Uint8Array, f: ArrayField): number[] {
  const n = f.rows * f.cols;
  const size = TYPE_SIZE[f.type];
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = toPhys(readRaw(buf, f.type, f.offset + i * size), f);
  return out;
}

/** Escreve valores físicos no buffer da página. Retorna [início, fim) alterados. */
export function encodeArray(buf: Uint8Array, f: ArrayField, values: number[], from = 0): [number, number] {
  const size = TYPE_SIZE[f.type];
  values.forEach((v, i) => writeRaw(buf, f.type, f.offset + (from + i) * size, toRaw(v, f)));
  return [f.offset + from * size, f.offset + (from + values.length) * size];
}

export function decodeField(buf: Uint8Array, f: Field): number | number[] {
  if (f.kind === 'bits') return decodeBits(buf, f);
  if (f.kind === 'array') return decodeArray(buf, f);
  return decodeScalar(buf, f);
}

/** Escreve um campo de bits sem mexer nos outros bits da mesma palavra. */
export function encodeBits(buf: Uint8Array, f: BitsField, value: number): [number, number] {
  const off = f.offset;
  const raw = readRaw(buf, f.type, off) >>> 0;
  const width = f.bitHi - f.bitLo + 1;
  const mask = ((1 << width) - 1) << f.bitLo;
  const next = ((raw & ~mask) | ((value << f.bitLo) & mask)) >>> 0;
  writeRaw(buf, f.type, off, next);
  return [off, off + TYPE_SIZE[f.type]];
}

/** Escreve um valor físico num campo simples. Retorna [início, fim) alterados. */
export function encodeScalar(buf: Uint8Array, f: ScalarField, value: number): [number, number] {
  writeRaw(buf, f.type, f.offset, toRaw(value, f));
  return [f.offset, f.offset + TYPE_SIZE[f.type]];
}
