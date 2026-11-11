// Speeduino falsa na rede (porta 29010) para ver o app funcionando sem placa:
//   npx tsx test/speeduino-tcp.ts [assinatura]   e no app: Conexão > Simulador > porta 29010
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { parseIni } from '../src/core/ini.js';
import { SpeeduinoFalsa } from './speeduino-falsa.js';

const sig = process.argv[2] ?? 'speeduino 202402';
const LIB = path.resolve('ini/biblioteca/speeduino');
const idx = JSON.parse(readFileSync(path.join(LIB, 'indice.json'), 'utf8'));
const ini = parseIni(gunzipSync(readFileSync(path.join(LIB, idx[sig].arquivo))).toString('latin1'));

const ecu = new SpeeduinoFalsa(ini, 'Speeduino teste');
const put = (name: string, v: number) => {
  const f = ini.constants.get(name);
  if (!f || f.kind === 'bits') return;
  const n = f.kind === 'array' ? f.rows * f.cols : 1;
  for (let i = 0; i < n; i++) {
    const val = typeof v === 'number' ? v : 0;
    const [pg, o] = ecu.pos(f.offset + i * (f.type.endsWith('16') ? 2 : 1));
    pg[o] = val & 0xff;
  }
};
// mapa VE com cara de motor: sobe com a carga e a rotação
const ve = ini.constants.get('veTable')!;
for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) { const [pg, o] = ecu.pos(ve.offset + r * 16 + c); pg[o] = Math.round(35 + r * 3 + c * 1.5); }
const adv = ini.constants.get('advTable1')!;
for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) { const [pg, o] = ecu.pos(adv.offset + r * 16 + c); pg[o] = Math.round(40 + 10 + c * 1.6 - r * 1.2); }
const bins = (name: string, f: (i: number) => number) => { const a = ini.constants.get(name); if (!a) return; for (let i = 0; i < 16; i++) { const [pg, o] = ecu.pos(a.offset + i); pg[o] = f(i); } };
bins('rpmBins', (i) => 5 + i * 5); bins('fuelLoadBins', (i) => 10 + i * 6); bins('rpmBins2', (i) => 5 + i * 5); bins('mapBins1', (i) => 10 + i * 6);
put('stoich', 147);
// canais ao vivo: motor a 3000 RPM
const out = (name: string, v: number) => { const f = ini.outputs.get(name); if (!f || f.kind === 'bits') return; const raw = Math.round((v - f.translate) / f.scale); ecu.saida[f.offset] = raw & 0xff; if (f.type.endsWith('16')) ecu.saida[f.offset + 1] = (raw >> 8) & 0xff; };
let t = 0;
setInterval(() => {
  t += 0.1;
  const rpm = 3000 + 1500 * Math.sin(t / 3);
  out('rpm', rpm); out('map', 60 + 30 * Math.sin(t / 3)); out('tps', 30 + 20 * Math.sin(t / 3)); out('coolantRaw', 88 + 40); out('iatRaw', 32 + 40);
  out('batteryVoltage', 13.8); out('afr', 14.2 + Math.sin(t)); out('afrTarget', 14.7); out('advance', 24); out('pulseWidth', 4.2); out('baro', 101); out('VE1', 60);
}, 100);

net.createServer((sock) => {
  const t = ecu.transporte();
  ecu['paraApp'] = undefined;
  (t as any).onData((d: Uint8Array) => sock.write(d));
  sock.on('data', (d: Buffer) => t.write(new Uint8Array(d)));
}).listen(29010, () => console.log(`[speeduino falsa] ${sig} na porta 29010`));
