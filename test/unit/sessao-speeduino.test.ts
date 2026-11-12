import { describe, it, expect } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import os from 'node:os';
import { parseIni } from '../../src/core/ini.js';
import { EcuSession } from '../../src/bridge/ecu.js';
import { SpeeduinoFalsa } from '../speeduino-falsa.js';

const LIB = path.resolve('ini/biblioteca/speeduino');
const iniDe = (sig: string) => {
  const idx = JSON.parse(readFileSync(path.join(LIB, 'indice.json'), 'utf8'));
  return parseIni(gunzipSync(readFileSync(path.join(LIB, idx[sig].arquivo))).toString('latin1'));
};
const esperar = (s: EcuSession, estados: string[]) => new Promise<void>((ok) => {
  if (estados.includes(s.status.state)) return ok();
  s.on('status', (st) => estados.includes(st.state) && ok());
});

describe('sessão com Speeduino', () => {
  it('conecta, troca o .ini sozinha, lê tabela, edita, grava e lê ao vivo', async () => {
    const nosso = parseIni(readFileSync('ini/simulador.ini', 'latin1'));
    const cache = path.join(os.tmpdir(), 'ecu-ini-teste');
    rmSync(cache, { recursive: true, force: true });
    const s = new EcuSession(nosso, { app: path.resolve('ini'), cache });
    const ecu = new SpeeduinoFalsa(iniDe('speeduino 202402'), 'Speeduino 2024.02.3', 1500); // surda 1,5 s (reinício do Arduino)
    const ve = ecu.ini.constants.get('veTable')!;
    for (let i = 0; i < 256; i++) { const [pg, o] = ecu.pos(ve.offset + i); pg[o] = 50 + (i % 40); }
    const p = s.connectTransport('falsa', ecu.transporte(), true);
    await p;
    expect(s.status.message ?? '').not.toMatch(/não respondeu/);
    expect(s.status.state).toBe('conectado');
    expect(s.status.family).toBe('speeduino');
    expect(s.status.iniFonte).toBe('biblioteca');
    expect(s.ini.signature).toBe('speeduino 202402');

    const t = s.table('veTable1Tbl');
    expect(t.rows).toBe(16);
    expect(t.values[0]).toBe(50);
    expect(t.values[41]).toBe(51);
    await s.setCells('veTable1Tbl', [{ index: 0, value: 77 }]);
    expect(ecu.pos(ve.offset)[0][ecu.pos(ve.offset)[1]]).toBe(77);
    await s.burn();
    expect(ecu.eepromEm(ve.offset)).toBe(77);

    await new Promise((r) => setTimeout(r, 300));
    expect(s.live('rpm')).toBeTypeOf('number');
    s.disconnect();

    // demonstração volta para o nosso .ini
    s.connectDemo();
    expect(s.ini.signature).toBe(nosso.signature);
    s.disconnect();
  }, 20000);

  it('Arduino Mega de verdade: bootloader que prende se receber bytes cedo', async () => {
    const nosso = parseIni(readFileSync('ini/simulador.ini', 'latin1'));
    const s = new EcuSession(nosso, { app: path.resolve('ini'), cache: path.join(os.tmpdir(), 'ecu-ini-teste') });
    // janela de 3 s (pior que a real): o app fala aos 2,5 s e prende o bootloader; tem de se recuperar sozinho
    const ecu = new SpeeduinoFalsa(iniDe('speeduino 202402'), 'Speeduino 2024.02.3').bootloaderReal(3000);
    await s.connectTransport('falsa', ecu.transporte(), true);
    expect(s.status.message ?? '').not.toMatch(/não respondeu/);
    expect(s.status.state).toBe('conectado');
    s.disconnect();
  }, 60000);

  it('sem .ini na biblioteca pede o arquivo', async () => {
    const nosso = parseIni(readFileSync('ini/simulador.ini', 'latin1'));
    const s = new EcuSession(nosso, { app: path.resolve('ini'), cache: path.join(os.tmpdir(), 'ecu-ini-vazio') });
    const fake = iniDe('speeduino 202402');
    fake.signature = 'outra ecu 1.0';
    await s.connectTransport('falsa', new SpeeduinoFalsa(fake).transporte());
    expect(s.status.faltaIni).toBe(true);
    expect(s.status.message).toContain('outra ecu 1.0');
  });
});
