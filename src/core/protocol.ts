// Cliente do protocolo do TunerStudio (envelope msEnvelope_1.0, igual ao da rusEFI):
//   pacote = [tamanho 16 bits big-endian][dados][CRC32 big-endian dos dados]
// A resposta tem o mesmo envelope; o primeiro byte dos dados é o código de status.
import { crc32 } from 'node:zlib';
import type { Ini } from './ini.js';

export interface Transport {
  write(data: Uint8Array): void;
  onData(cb: (data: Uint8Array) => void): void;
  onClose(cb: (err?: Error) => void): void;
  close(): void;
}

export const TS_OK = 0x00;
export const TS_BURN_OK = 0x04;

export function frame(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + 6);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, payload.length, false);
  out.set(payload, 2);
  dv.setUint32(2 + payload.length, crc32(payload) >>> 0, false);
  return out;
}

const u16le = (v: number) => [v & 0xff, (v >> 8) & 0xff];

export class TsClient {
  private rx = new Uint8Array(0);
  private waiting?: { resolve: (p: Uint8Array) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };
  private queue: Promise<unknown> = Promise.resolve();
  closed = false;

  constructor(private t: Transport, private timeoutMs = 2000) {
    t.onData((d) => this.feed(d));
    t.onClose((err) => {
      this.closed = true;
      this.waiting?.reject(err ?? new Error('conexão fechada'));
    });
  }

  private feed(d: Uint8Array) {
    const merged = new Uint8Array(this.rx.length + d.length);
    merged.set(this.rx);
    merged.set(d, this.rx.length);
    this.rx = merged;
    if (this.rx.length < 2) return;
    const n = (this.rx[0] << 8) | this.rx[1];
    if (this.rx.length < n + 6) return;
    const payload = this.rx.slice(2, 2 + n);
    const crc = new DataView(this.rx.buffer, this.rx.byteOffset + 2 + n, 4).getUint32(0, false);
    this.rx = this.rx.slice(n + 6);
    const w = this.waiting;
    this.waiting = undefined;
    if (!w) return;
    clearTimeout(w.timer);
    if ((crc32(payload) >>> 0) !== crc) w.reject(new Error('CRC errado na resposta'));
    else w.resolve(payload);
  }

  /** Envia um comando e espera a resposta. Os comandos andam em fila, um de cada vez. */
  request(payload: number[] | Uint8Array): Promise<Uint8Array> {
    const run = () =>
      new Promise<Uint8Array>((resolve, reject) => {
        if (this.closed) return reject(new Error('desconectado'));
        this.rx = new Uint8Array(0);
        const timer = setTimeout(() => {
          this.waiting = undefined;
          reject(new Error('a ECU não respondeu'));
        }, this.timeoutMs);
        this.waiting = { resolve, reject, timer };
        this.t.write(frame(Uint8Array.from(payload)));
      });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private static ok(p: Uint8Array, accept = [TS_OK]): Uint8Array {
    if (!accept.includes(p[0])) throw new Error(`ECU respondeu com erro 0x${p[0].toString(16)}`);
    return p.subarray(1);
  }

  async signature(): Promise<string> {
    const p = TsClient.ok(await this.request([0x53])); // 'S'
    return new TextDecoder('latin1').decode(p).replace(/\0+$/, '');
  }

  /** Canais ao vivo: comando 'O' + início + quantidade (16 bits little-endian). */
  async readOutputs(offset: number, count: number): Promise<Uint8Array> {
    return TsClient.ok(await this.request([0x4f, ...u16le(offset), ...u16le(count)]));
  }

  async readPage(ini: Ini, pageNumber: number, onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
    const page = ini.pages[pageNumber - 1];
    const out = new Uint8Array(page.size);
    const step = ini.blockingFactor;
    for (let off = 0; off < page.size; off += step) {
      const n = Math.min(step, page.size - off);
      const d = TsClient.ok(await this.request([0x52, ...u16le(page.identifier), ...u16le(off), ...u16le(n)]));
      out.set(d.subarray(0, n), off);
      onProgress?.(off + n, page.size);
    }
    return out;
  }

  /** Lê um pedaço de uma página (para conferir uma escrita). */
  async readChunk(ini: Ini, pageNumber: number, offset: number, count: number): Promise<Uint8Array> {
    const page = ini.pages[pageNumber - 1];
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i += ini.blockingFactor) {
      const n = Math.min(ini.blockingFactor, count - i);
      const d = TsClient.ok(await this.request([0x52, ...u16le(page.identifier), ...u16le(offset + i), ...u16le(n)]));
      out.set(d.subarray(0, n), i);
    }
    return out;
  }

  /** Escreve bytes na memória de trabalho da ECU (vale na hora, mas some ao desligar sem gravar). */
  async writeChunk(ini: Ini, pageNumber: number, offset: number, data: Uint8Array): Promise<void> {
    const page = ini.pages[pageNumber - 1];
    const step = ini.blockingFactor;
    for (let i = 0; i < data.length; i += step) {
      const part = data.subarray(i, Math.min(data.length, i + step));
      TsClient.ok(await this.request([0x43, ...u16le(page.identifier), ...u16le(offset + i), ...u16le(part.length), ...part]));
    }
  }

  /** Grava a página na memória flash da ECU (fica salvo ao desligar). */
  /** Comando de bancada/ação ('Z' + subsistema + índice), ex.: senhas. */
  async command(bytes: number[]): Promise<void> {
    await this.request(bytes);
  }

  async burn(ini: Ini, pageNumber: number): Promise<void> {
    const page = ini.pages[pageNumber - 1];
    TsClient.ok(await this.request([0x42, ...u16le(page.identifier)]), [TS_OK, TS_BURN_OK]);
  }
}
