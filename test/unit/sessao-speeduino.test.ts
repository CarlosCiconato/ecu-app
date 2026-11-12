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

  it.each(['speeduino 201909', 'speeduino 202207', 'speeduino 202501'])('abre todas as funções do .ini (%s)', async (sig) => {
    const nosso = parseIni(readFileSync('ini/simulador.ini', 'latin1'));
    const s = new EcuSession(nosso, { app: path.resolve('ini'), cache: path.join(os.tmpdir(), 'ecu-ini-teste') });
    await s.connectTransport('falsa', new SpeeduinoFalsa(iniDe(sig)).transporte());
    const n = { d: 0, c: 0, t: 0, campos: 0 };
    const visto = new Set<string>();
    const abre = (i: { kind: string; id: string }) => {
      if (visto.has(i.kind + i.id)) return;
      visto.add(i.kind + i.id);
      if (i.kind === 't') { expect(s.table(i.id).values.length).toBeGreaterThan(0); n.t++; }
      else if (i.kind === 'k') { expect(s.calibracaoIni(i.id).tabelas.length).toBeGreaterThan(0); }
      else if (i.kind === 'c') { const c = s.curvaIni(i.id); expect(Array.isArray(s.constant(c.x)) && Array.isArray(s.constant(c.y))).toBe(true); n.c++; }
      else {
        const d = s.dialogoIni(i.id); n.d++;
        for (const sec of d.secoes) for (const f of sec.fields) { n.campos++; expect(typeof s.constant(f.name)).toBe('number'); if (f.cond) expect(typeof s.condicoes([f.cond])[0]).toBe('boolean'); }
        d.links.forEach(abre);
      }
    };
    s.funcoesIni().forEach((m) => m.items.forEach(abre));
    expect(n.d).toBeGreaterThan(25); expect(n.c).toBeGreaterThan(15); expect(n.t).toBeGreaterThan(8); expect(n.campos).toBeGreaterThan(300);
    // Engine Constants traz os campos da tela pronta do TunerStudio (combustível requerido, cilindros)
    expect(s.dialogoIni('engine_constants').secoes.flatMap((x) => x.fields.map((f) => f.name))).toEqual(expect.arrayContaining(['reqFuel', 'nCylinders']));
    // muda um ajuste e confere na ECU falsa
    await s.setValue('nCylinders', 6);
    expect(s.constant('nCylinders')).toBe(6);
    s.disconnect();
  }, 30000);

  it('português, botões de teste de saídas e calibração de sensores (202501)', async () => {
    const nosso = parseIni(readFileSync('ini/simulador.ini', 'latin1'));
    const s = new EcuSession(nosso, { app: path.resolve('ini'), cache: path.join(os.tmpdir(), 'ecu-ini-teste') });
    const ecu = new SpeeduinoFalsa(iniDe('speeduino 202501'));
    await s.connectTransport('falsa', ecu.transporte());
    // nomes em português
    const menus = s.funcoesIni();
    const todos = menus.flatMap((m) => m.items.map((i) => i.label));
    expect(todos).toEqual(expect.arrayContaining(['Mapa de VE', 'Testar saídas', 'Calibrar sensores de temperatura']));
    expect(s.dialogoIni('engine_constants').secoes.flatMap((x) => x.fields.map((f) => f.label))).toContain('Número de cilindros');
    expect(s.options('injLayout')).toContain('Sequencial');
    // teste de saídas: botões com condição, comando 'E' chega na ECU e liga o modo de teste
    const d = s.dialogoIni('outputtest1');
    const botoes = d.secoes.flatMap((x) => x.botoes);
    const liga = botoes.find((b) => b.cmd === 'cmdEnableTestMode')!;
    const bico1 = botoes.find((b) => b.cmd === 'cmdtestinj1Pulsed')!;
    expect(botoes.find((b) => b.cmd === 'cmdStopTestMode')?.fecha).toBe('clickOnCloseIfEnabled');
    expect(d.secoes.flatMap((x) => x.avisos).join(' ')).toContain('ATENÇÃO');
    expect(s.condicoes([liga.cond!, bico1.cond!])).toEqual([true, false]);
    await s.command('cmdEnableTestMode');
    expect(ecu.comandos).toContain(0x0101);
    await new Promise((r) => setTimeout(r, 400)); // ao vivo atualiza testactive
    expect(s.condicoes([liga.cond!, bico1.cond!])).toEqual([false, true]);
    await s.command('cmdtestinj1Pulsed');
    expect(ecu.comandos).toContain(0x0203);
    // calibração: temperatura do motor (sensor GM) e sonda linear
    const cal = s.calibracaoIni('std_ms2gentherm');
    const gm = cal.termistores.find((t) => t.nome === 'GM')!;
    const r = await s.calibrar('std_ms2gentherm', 0, { bias: gm.bias, pontos: gm.pontos });
    expect(ecu.calibracoes[0].tabela).toBe(0);
    expect(ecu.calibracoes[0].dados.length).toBe(64);
    // ponto 15 (ADC 495): ~30 °C = 86 °F -> 860, byte baixo primeiro
    const v15 = ecu.calibracoes[0].dados[30] | (ecu.calibracoes[0].dados[31] << 8);
    expect(Math.abs(v15 / 10 - (r.curva[15] * 1.8 + 32))).toBeLessThan(0.1);
    expect(r.curva[15]).toBeGreaterThan(25); expect(r.curva[15]).toBeLessThan(35);
    await s.calibrar('std_ms2geno2', 2, { v1: 0, a1: 10, v2: 5, a2: 20 });
    const o2 = ecu.calibracoes.filter((c) => c.tabela === 2);
    expect(o2.map((c) => c.off)).toEqual([0, 256, 512, 768]);
    expect(o2[0].dados[0]).toBe(100); expect(o2[3].dados[255]).toBe(200);
    s.disconnect();
  }, 30000);

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
