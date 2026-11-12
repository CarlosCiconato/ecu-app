// Speeduino falsa para testar a comunicação sem placa: responde como o firmware de verdade
// (comms.cpp), com ou sem envelope, usando as páginas do .ini da versão escolhida.
import { crc32 } from 'node:zlib';
import type { Transport } from '../src/core/protocol.js';
import type { Ini } from '../src/core/ini.js';

export class SpeeduinoFalsa {
  paginas: Uint8Array[];
  eeprom: Uint8Array[];
  saida: Uint8Array;
  log: string[] = [];
  private rx: number[] = [];
  private paraApp?: (d: Uint8Array) => void;
  private acordaEm = 0;

  constructor(public ini: Ini, public versao = 'Speeduino 2025.01.7', reiniciaMs = 0) {
    this.paginas = (ini.realPages ?? ini.pages).map((p) => new Uint8Array(p.size));
    this.eeprom = this.paginas.map((p) => p.slice());
    this.saida = new Uint8Array(Math.max(ini.ochBlockSize, 1));
    this.saida.forEach((_, i) => (this.saida[i] = i & 0xff));
    this.acordaEm = Date.now() + reiniciaMs; // o Arduino Mega reinicia quando a porta abre
  }

  /** Byte na posição da página 1 virtual do app (todas as páginas juntas). */
  pos(v: number): [Uint8Array, number] {
    const base = this.ini.pageBase ?? [0];
    let i = base.length - 1;
    while (i > 0 && base[i] > v) i--;
    return [this.paginas[i], v - base[i]];
  }
  eepromEm(v: number): number { const [, o] = this.pos(v); const i = this.paginas.indexOf(this.pos(v)[0]); return this.eeprom[i][o]; }

  /** O "cabo USB" entre o app e esta ECU falsa. */
  transporte(): Transport {
    let fechou: ((e?: Error) => void) | undefined;
    return {
      write: (d) => setTimeout(() => this.recebe(d), 1),
      onData: (cb) => (this.paraApp = cb),
      onClose: (cb) => (fechou = cb),
      close: () => fechou?.(),
    };
  }

  private manda(d: number[] | Uint8Array) {
    const u = Uint8Array.from(d);
    setTimeout(() => this.paraApp?.(u), 1);
  }

  /** Bootloader do Arduino Mega de verdade (stk500v2): espera ~1 s; se chegar QUALQUER byte nesse tempo,
   *  fica preso esperando gravação e só sai depois de ~5,5 s sem receber nada. */
  bootloaderReal(janelaMs = 1000, presoMs = 5500) {
    this.boot = { fim: Date.now() + janelaMs, presoMs, preso: false };
    return this;
  }
  private boot?: { fim: number; presoMs: number; preso: boolean };

  private recebe(d: Uint8Array) {
    if (this.boot) {
      const agora = Date.now();
      if (agora < this.boot.fim) { this.boot.preso = true; this.boot.fim = agora + this.boot.presoMs; return; }
      this.boot = undefined; // o firmware já subiu
    }
    if (Date.now() < this.acordaEm) return; // ainda no bootloader: perde os bytes
    this.rx.push(...d);
    if (this.ini.comms.envelope) this.envelope();
    else this.cru();
  }

  private envelope() {
    // A Speeduino nova também aceita 'Q'/'S' crus de um byte (modo antigo)
    while (this.rx.length) {
      if (this.rx[0] === 0x51 || this.rx[0] === 0x53) {
        const c = this.rx.shift()!;
        this.manda(this.texto(c));
        continue;
      }
      if (this.rx.length < 2) return;
      const n = (this.rx[0] << 8) | this.rx[1];
      if (this.rx.length < n + 6) return;
      const payload = Uint8Array.from(this.rx.slice(2, 2 + n));
      const crc = Buffer.from(this.rx.slice(2 + n, 6 + n)).readUInt32BE(0);
      this.rx = this.rx.slice(n + 6);
      if ((crc32(payload) >>> 0) !== crc) { this.responde([0x82]); continue; }
      this.responde(this.trata(payload, true));
    }
  }

  private responde(p: number[] | undefined) {
    if (!p) return;
    const u = Uint8Array.from(p);
    const out = Buffer.alloc(u.length + 6);
    out.writeUInt16BE(u.length, 0);
    Buffer.from(u).copy(out, 2);
    out.writeUInt32BE(crc32(u) >>> 0, 2 + u.length);
    this.manda(out);
  }

  private cru() {
    while (this.rx.length) {
      const c = this.rx[0];
      const precisa = c === 0x51 || c === 0x53 ? 1 : c === 0x70 || c === 0x72 ? 7 : c === 0x62 ? 3
        : c === 0x77 ? (this.rx.length >= 7 ? 7 + (this.rx[5] | (this.rx[6] << 8)) : 7) : 1;
      if (this.rx.length < precisa) return;
      const cmd = Uint8Array.from(this.rx.slice(0, precisa));
      this.rx = this.rx.slice(precisa);
      if (c === 0x51 || c === 0x53) { this.manda(this.texto(c)); continue; }
      const r = this.trata(cmd, false);
      if (r) this.manda(r);
    }
  }

  private texto(c: number) {
    const s = c === 0x51 ? this.ini.signature : this.versao;
    return [...s].map((x) => x.charCodeAt(0));
  }

  /** Comandos (comms.cpp). Com envelope, a resposta começa com o código de status. */
  private trata(p: Uint8Array, env: boolean): number[] | undefined {
    const st = (code: number, data: number[] = []) => (env ? [code, ...data] : data.length ? data : undefined);
    const cmd = String.fromCharCode(p[0]);
    const u16 = (i: number) => p[i] | (p[i + 1] << 8);
    this.log.push(cmd);
    switch (cmd) {
      case 'Q': case 'S': return [0, ...this.texto(p[0])];
      case 'p': {
        const pg = this.paginas[p[2] - 1];
        if (!pg) return st(0x8a);
        return st(0, [...pg.subarray(u16(3), u16(3) + u16(5))]);
      }
      case 'M': case 'w': {
        const pg = this.paginas[p[2] - 1];
        const off = u16(3), n = u16(5);
        pg.set(p.subarray(7, 7 + n), off);
        return st(0);
      }
      case 'b': this.eeprom[p[2] - 1] = this.paginas[p[2] - 1].slice(); return st(0x04);
      case 'r': if (p[2] === 0x30) return st(0, [...this.saida.subarray(u16(3), u16(3) + u16(5))]); return st(0x83);
      default: return st(0x83);
    }
  }
}
