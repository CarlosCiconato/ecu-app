import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { parseIni } from '../../src/core/ini.js';
import { TsClient, detectSignature, buildCommand } from '../../src/core/protocol.js';
import { acharIni, urlRusefi } from '../../src/core/biblioteca.js';
import { SpeeduinoFalsa } from '../speeduino-falsa.js';

const LIB = path.resolve('ini/biblioteca/speeduino');
const iniDe = (sig: string) => {
  const idx = JSON.parse(readFileSync(path.join(LIB, 'indice.json'), 'utf8'));
  return parseIni(gunzipSync(readFileSync(path.join(LIB, idx[sig].arquivo))).toString('latin1'));
};

describe('comandos do .ini', () => {
  it('monta os comandos da Speeduino e da rusEFI', () => {
    expect(buildCommand('p%2i%2o%2c', { id: [0, 2], offset: 0x110, count: 16 })).toEqual([0x70, 0, 2, 0x10, 1, 16, 0]);
    expect(buildCommand('r\\$tsCanId\\x30%2o%2c', { offset: 0, count: 130 })).toEqual([0x72, 0, 0x30, 0, 0, 130, 0]);
    expect(buildCommand('R%2i%2o%2c', { id: [0, 1], offset: 2, count: 4 })).toEqual([0x52, 0, 1, 2, 0, 4, 0]);
    expect(buildCommand('M%2i%2o%2c%v', { id: [0, 3], offset: 1, count: 2, data: Uint8Array.from([9, 8]) })).toEqual([0x4d, 0, 3, 1, 0, 2, 0, 9, 8]);
  });
  it('lê o .ini da rusEFI igual antes', () => {
    const ini = parseIni(readFileSync('ini/simulador.ini', 'latin1'));
    expect(ini.family).toBe('rusefi');
    expect(ini.pages[0].readCommand).toBe('R%2i%2o%2c');
    expect(ini.pages[1].burnCommand).toBe('');
  });
});

for (const sig of ['speeduino 202501', 'speeduino 202207', 'speeduino 202008', 'speeduino 201810']) {
  describe(sig, () => {
    it('detecta, lê, escreve, grava e lê dados ao vivo', async () => {
      const ini = iniDe(sig);
      const ecu = new SpeeduinoFalsa(ini);
      const ve = ini.constants.get('veTable')!;
      expect(ve.page).toBe(1); // tudo junto na página 1 virtual
      for (let i = 0; i < 256; i++) { const [pg, o] = ecu.pos(ve.offset + i); pg[o] = (i * 7) & 0xff; }
      const real = (v: number) => { const [pg, o] = ecu.pos(v); return pg[o]; };
      const t = ecu.transporte();
      const det = await detectSignature(t, 300);
      expect(det?.signature).toBe(sig);
      expect(det?.envelope).toBe(ini.comms.envelope);

      const c = new TsClient(t, 1000);
      c.useIni(ini);
      expect(await c.signature(ini.comms.queryCommand)).toBe(sig);
      const lida = await c.readPage(ini, 1);
      expect(lida.length).toBe(ini.realPages!.reduce((a, p) => a + p.size, 0));
      for (let i = 0; i < 256; i++) expect(lida[ve.offset + i]).toBe((i * 7) & 0xff);

      await c.writeChunk(ini, 1, ve.offset + 5, Uint8Array.from([111, 112, 113]));
      expect([real(ve.offset + 5), real(ve.offset + 6), real(ve.offset + 7)]).toEqual([111, 112, 113]);
      // escrita que atravessa duas páginas de verdade
      const b1 = ini.pageBase![1];
      await c.writeChunk(ini, 1, b1 - 2, Uint8Array.from([1, 2, 3, 4]));
      expect([real(b1 - 2), real(b1 - 1), real(b1), real(b1 + 1)]).toEqual([1, 2, 3, 4]);
      expect([...(await c.readChunk(ini, 1, b1 - 2, 4))]).toEqual([1, 2, 3, 4]);
      await c.burn(ini, 1);
      expect(ecu.eepromEm(ve.offset + 6)).toBe(112);
      expect(ecu.eepromEm(b1)).toBe(3);

      const out = await c.readOutputs(0, ini.ochBlockSize, ini);
      expect(out.length).toBe(ini.ochBlockSize);
      expect(out[3]).toBe(3);
    });
  });
}

describe('biblioteca', () => {
  it('acha a Speeduino exata e a parecida', async () => {
    const o = { pastaApp: path.resolve('ini'), pastaCache: '/tmp/claude-ecu-cache-teste', baixar: false };
    expect((await acharIni('speeduino 202402', o))?.fonte).toBe('biblioteca');
    const p = await acharIni('speeduino 202504-dev', o);
    expect(p?.fonte).toBe('biblioteca'); // o master está na biblioteca
    const q = await acharIni('speeduino 202412', o);
    expect(q?.fonte).toBe('parecido');
    expect(q?.aviso).toContain('202402');
  });
  it('monta o endereço do .ini da rusEFI', () => {
    expect(urlRusefi('rusEFI master.2020.07.06.frankenso_na6.2468827536')?.url)
      .toBe('https://rusefi.com/online/ini/rusefi/master/2020/07/06/frankenso_na6/2468827536.ini');
  });
  it('acha o .ini do simulador que vem com o app', async () => {
    const sig = parseIni(readFileSync('ini/simulador.ini', 'latin1')).signature;
    expect((await acharIni(sig, { pastaApp: path.resolve('ini'), pastaCache: '/tmp/x', baixar: false }))?.fonte).toBe('app');
  });
});
