// Cliente do protocolo do TunerStudio. Os comandos não ficam mais fixos no código: vêm do .ini
// de cada ECU (pageReadCommand, pageChunkWrite, burnCommand, ochGetCommand, queryCommand).
// Assim o mesmo app fala com a nossa ECU, com qualquer rusEFI e com a Speeduino.
//
// Dois jeitos de mandar os pacotes:
//  - com envelope (msEnvelope_1.0, rusEFI e Speeduino 202201+):
//      pacote = [tamanho 16 bits big-endian][dados][CRC32 big-endian dos dados]
//      a resposta tem o mesmo envelope e o primeiro byte é o código de status.
//  - sem envelope (Speeduino antiga, até 202108): bytes crus; a leitura devolve só os dados e
//    a escrita/gravação não devolve nada.
import { crc32 } from 'node:zlib';
import { pedacosReais, type Ini, type IniPage } from './ini.js';

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

const u16 = (v: number, big: boolean) => (big ? [(v >> 8) & 0xff, v & 0xff] : [v & 0xff, (v >> 8) & 0xff]);

/** Monta os bytes de um comando do .ini, ex. "p%2i%2o%2c" ou "r\$tsCanId\x30%2o%2c". */
export function buildCommand(
  template: string,
  a: { id?: number[]; offset?: number; count?: number; data?: Uint8Array },
  bigEndian = false,
): number[] {
  const out: number[] = [];
  const t = template.replace(/\\?\$tsCanId/g, '\\x00');
  for (let i = 0; i < t.length; i++) {
    const rest = t.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^\\x([0-9a-fA-F]{2})/))) { out.push(parseInt(m[1], 16)); i += 3; }
    else if ((m = rest.match(/^%(\d?)([ioc])/))) {
      const n = Number(m[1] || 2);
      if (m[2] === 'i') out.push(...(a.id ?? [0, 0]).slice(0, n));
      else {
        const v = m[2] === 'o' ? a.offset ?? 0 : a.count ?? 0;
        out.push(...(n === 1 ? [v & 0xff] : u16(v, bigEndian)));
      }
      i += m[0].length - 1;
    } else if (rest.startsWith('%v')) { out.push(...(a.data ?? [])); i += 1; }
    else out.push(t.charCodeAt(i));
  }
  return out;
}

export class TsClient {
  private rx = new Uint8Array(0);
  private waiting?: {
    resolve: (p: Uint8Array) => void; reject: (e: Error) => void; timer: NodeJS.Timeout;
    raw?: number; // sem envelope: quantos bytes esperar (0 = até a linha ficar quieta)
    idle?: NodeJS.Timeout;
  };
  private queue: Promise<unknown> = Promise.resolve();
  closed = false;
  /** Envelope ligado? Vem do .ini; a detecção também ajusta. */
  envelope = true;
  bigEndian = false;

  constructor(private t: Transport, private timeoutMs = 2000) {
    t.onData((d) => this.feed(d));
    t.onClose((err) => {
      this.closed = true;
      this.waiting?.reject(err ?? new Error('conexão fechada'));
    });
  }

  /** Usa os ajustes de comunicação do .ini carregado. */
  useIni(ini: Ini) {
    this.envelope = ini.comms.envelope;
    this.bigEndian = ini.comms.bigEndian;
    this.timeoutMs = Math.max(this.timeoutMs, ini.comms.blockReadTimeout || 0);
  }

  private feed(d: Uint8Array) {
    if (!this.waiting) { this.rx = new Uint8Array(0); return; } // ninguém esperando: resposta atrasada, joga fora
    const merged = new Uint8Array(this.rx.length + d.length);
    merged.set(this.rx);
    merged.set(d, this.rx.length);
    this.rx = merged;
    const w = this.waiting;
    if (w && w.raw !== undefined) {
      if (w.raw > 0) {
        if (this.rx.length < w.raw) return;
        this.finish(this.rx.slice(0, w.raw));
        this.rx = this.rx.slice(w.raw);
      } else {
        // resposta de tamanho desconhecido (assinatura): espera 150 ms sem bytes novos
        if (w.idle) clearTimeout(w.idle);
        w.idle = setTimeout(() => { const p = this.rx; this.rx = new Uint8Array(0); this.finish(p); }, 150);
      }
      return;
    }
    if (this.rx.length < 2) return;
    const n = (this.rx[0] << 8) | this.rx[1];
    if (this.rx.length < n + 6) return;
    const payload = this.rx.slice(2, 2 + n);
    const crc = new DataView(this.rx.buffer, this.rx.byteOffset + 2 + n, 4).getUint32(0, false);
    this.rx = this.rx.slice(n + 6);
    if ((crc32(payload) >>> 0) !== crc) this.fail(new Error('CRC errado na resposta'));
    else this.finish(payload);
  }

  private finish(p: Uint8Array) {
    const w = this.waiting;
    this.waiting = undefined;
    if (!w) return;
    clearTimeout(w.timer);
    if (w.idle) clearTimeout(w.idle);
    w.resolve(p);
  }

  private fail(e: Error) {
    const w = this.waiting;
    this.waiting = undefined;
    if (!w) return;
    clearTimeout(w.timer);
    if (w.idle) clearTimeout(w.idle);
    w.reject(e);
  }

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /** Envia um comando com envelope e espera a resposta. Os comandos andam em fila, um de cada vez. */
  request(payload: number[] | Uint8Array): Promise<Uint8Array> {
    return this.enqueue(() => this.send(Uint8Array.from(payload), true));
  }

  /** Sem envelope: manda bytes crus. expect = bytes da resposta (0 = tamanho livre, -1 = nenhuma). */
  requestRaw(payload: number[] | Uint8Array, expect: number, quietMs = 0): Promise<Uint8Array> {
    return this.enqueue(async () => {
      if (expect < 0) {
        if (this.closed) throw new Error('desconectado');
        this.t.write(Uint8Array.from(payload));
        await new Promise((r) => setTimeout(r, quietMs));
        return new Uint8Array(0);
      }
      return this.send(Uint8Array.from(payload), false, expect);
    });
  }

  private send(payload: Uint8Array, framed: boolean, raw?: number): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve, reject) => {
      if (this.closed) return reject(new Error('desconectado'));
      this.rx = new Uint8Array(0);
      const timer = setTimeout(() => {
        const w = this.waiting;
        this.waiting = undefined;
        if (w?.idle) clearTimeout(w.idle);
        reject(new Error('a ECU não respondeu'));
      }, this.timeoutMs);
      this.waiting = { resolve, reject, timer, raw: framed ? undefined : raw };
      this.t.write(framed ? frame(payload) : payload);
    });
  }

  private static ok(p: Uint8Array, accept = [TS_OK]): Uint8Array {
    if (!accept.includes(p[0])) throw new Error(`ECU respondeu com erro 0x${p[0]?.toString(16)}`);
    return p.subarray(1);
  }

  /** Um comando que devolve dados (leitura): com envelope tira o byte de status. */
  private async read(cmd: number[], count: number): Promise<Uint8Array> {
    if (this.envelope) return TsClient.ok(await this.request(cmd));
    return this.requestRaw(cmd, count);
  }

  /** Um comando que só confirma (escrita, gravação). */
  private async exec(cmd: number[], waitMs: number, accept = [TS_OK, TS_BURN_OK]): Promise<void> {
    if (this.envelope) { TsClient.ok(await this.request(cmd), accept); return; }
    await this.requestRaw(cmd, -1, waitMs);
  }

  /** Tabela de calibração de sensor (Speeduino 't'): só com envelope, a ECU responde OK ou erro. */
  async calibracao(cmd: number[]): Promise<void> {
    if (!this.envelope) throw new Error('Esta versão da Speeduino é antiga (sem envelope): calibre os sensores pelo TunerStudio.');
    TsClient.ok(await this.request(cmd));
  }

  /** Assinatura do firmware. query = queryCommand do .ini ("S" na rusEFI, "Q" na Speeduino). */
  async signature(query = 'S'): Promise<string> {
    const cmd = [...query].map((c) => c.charCodeAt(0));
    const p = this.envelope ? TsClient.ok(await this.request(cmd)) : await this.requestRaw(cmd, 0);
    return new TextDecoder('latin1').decode(p).replace(/\0+$/, '').trim();
  }

  /** Canais ao vivo (ochGetCommand do .ini). */
  async readOutputs(offset: number, count: number, ini?: Ini): Promise<Uint8Array> {
    const tpl = ini?.comms.ochGetCommand ?? 'O%2o%2c';
    const step = ini?.blockingFactor && ini.family === 'speeduino' ? Math.min(ini.blockingFactor, 255) : count;
    if (count <= step) return this.read(buildCommand(tpl, { offset, count }, this.bigEndian), count);
    const out = new Uint8Array(count);
    for (let off = 0; off < count; off += step) {
      const n = Math.min(step, count - off);
      out.set((await this.read(buildCommand(tpl, { offset: offset + off, count: n }, this.bigEndian), n)).subarray(0, n), off);
    }
    return out;
  }

  private pageCmd(page: IniPage, kind: 'read' | 'write' | 'burn', offset = 0, count = 0, data?: Uint8Array): number[] {
    const tpl = kind === 'read' ? page.readCommand ?? 'R%2i%2o%2c'
      : kind === 'write' ? page.writeCommand ?? 'C%2i%2o%2c%v'
        : page.burnCommand ?? 'B%2i';
    return buildCommand(tpl, { id: page.idBytes ?? [page.identifier & 0xff, page.identifier >> 8], offset, count, data }, this.bigEndian);
  }

  async readPage(ini: Ini, pageNumber: number, onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
    const page = ini.pages[pageNumber - 1];
    return this.readChunk(ini, pageNumber, 0, page.size, onProgress);
  }

  /** Lê um pedaço de uma página (para conferir uma escrita). */
  async readChunk(ini: Ini, pageNumber: number, offset: number, count: number, onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
    const out = new Uint8Array(count);
    const partes = ini.realPages && pageNumber === 1 ? pedacosReais(ini, offset, count)
      : [{ page: ini.pages[pageNumber - 1], offset, count, at: 0 }];
    const step = ini.family === 'speeduino' ? Math.min(ini.blockingFactor, 250) : ini.blockingFactor;
    let feito = 0;
    for (const pt of partes) {
      for (let i = 0; i < pt.count; i += step) {
        const n = Math.min(step, pt.count - i);
        let d = await this.read(this.pageCmd(pt.page, 'read', pt.offset + i, n), n);
        // resposta curta = pedaço faltando (ficaria zerado na tela): tenta de novo e, se repetir, avisa
        if (d.length < n) d = await this.read(this.pageCmd(pt.page, 'read', pt.offset + i, n), n);
        if (d.length < n) throw new Error(`a ECU mandou ${d.length} de ${n} bytes da página ${pt.page.number} (posição ${pt.offset + i})`);
        out.set(d.subarray(0, n), pt.at + i);
        feito += n;
        onProgress?.(feito, count);
      }
    }
    return out;
  }

  private sujas = new Set<IniPage>(); // páginas de verdade mudadas desde a última gravação

  /** Escreve bytes na memória de trabalho da ECU (vale na hora, mas some ao desligar sem gravar). */
  async writeChunk(ini: Ini, pageNumber: number, offset: number, data: Uint8Array): Promise<void> {
    if (ini.realPages && pageNumber === 1) {
      for (const pt of pedacosReais(ini, offset, data.length)) {
        await this.writeReal(ini, pt.page, pt.offset, data.subarray(pt.at, pt.at + pt.count));
        this.sujas.add(pt.page);
      }
      return;
    }
    await this.writeReal(ini, ini.pages[pageNumber - 1], offset, data);
  }

  private async writeReal(ini: Ini, page: IniPage, offset: number, data: Uint8Array): Promise<void> {
    // A Speeduino tem buffer serial de 257 bytes: o pedaço da escrita precisa caber com o cabeçalho.
    const step = ini.family === 'speeduino' ? Math.min(ini.blockingFactor, 240) : ini.blockingFactor;
    for (let i = 0; i < data.length; i += step) {
      const part = data.subarray(i, Math.min(data.length, i + step));
      await this.exec(this.pageCmd(page, 'write', offset + i, part.length, part), Math.max(ini.comms.interWriteDelay, 10));
    }
  }

  /** Comando de bancada/ação ('Z' + subsistema + índice), ex.: senhas. */
  async command(bytes: number[]): Promise<void> {
    if (this.envelope) await this.request(bytes);
    else await this.requestRaw(bytes, -1, 20);
  }

  /** Grava a página na memória flash/EEPROM da ECU (fica salvo ao desligar). */
  async burn(ini: Ini, pageNumber: number): Promise<void> {
    if (ini.realPages && pageNumber === 1) {
      for (const p of ini.realPages) if (this.sujas.has(p)) await this.burnReal(ini, p);
      this.sujas.clear();
      return;
    }
    await this.burnReal(ini, ini.pages[pageNumber - 1]);
  }

  private async burnReal(ini: Ini, page: IniPage): Promise<void> {
    if (page.burnCommand === '') return; // página que a ECU não grava (só leitura/RAM)
    // A EEPROM da Speeduino leva até ~1 s para gravar uma página inteira.
    await this.exec(this.pageCmd(page, 'burn'), ini.family === 'speeduino' ? 1000 : 50);
  }
}

/** Descobre quem está do outro lado: tenta 'Q' e 'S' com envelope (rusEFI e Speeduino nova)
 *  e depois 'Q' cru (Speeduino antiga). Devolve a assinatura e se a ECU usa envelope. */
export async function detectSignature(t: Transport, timeoutMs = 1200): Promise<{ signature: string; envelope: boolean } | undefined> {
  const c = new TsClient(t, timeoutMs);
  const good = (s: string) => /^[\x20-\x7e]{7,}$/.test(s);
  for (const q of ['Q', 'S']) {
    c.envelope = true;
    try {
      const s = await c.signature(q);
      // Na Speeduino, 'S' devolve o texto da versão ("Speeduino 2024.02.3"), não a assinatura.
      if (good(s) && !(q === 'S' && /^speeduino/i.test(s))) return { signature: s, envelope: true };
    } catch { /* tenta o próximo */ }
  }
  c.envelope = false;
  try {
    const s = await c.signature('Q');
    if (good(s)) {
      // Respondeu cru. A Speeduino nova aceita os dois jeitos: confere se ela fala com envelope.
      c.envelope = true;
      try { if (good(await c.signature('Q'))) return { signature: s, envelope: true }; } catch { /* é antiga mesmo */ }
      return { signature: s, envelope: false };
    }
  } catch { /* nada respondeu */ }
  return undefined;
}
