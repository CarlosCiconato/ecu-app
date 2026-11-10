// Gera um log de teste (.csv) de uma puxada do V8 biturbo: lenta, largada no 2-step, 1ª a 4ª marcha,
// corte, desaceleração e cruzeiro. Tem de propósito uma empobrecida na 4ª (lambda 0,86) para treinar o ajuste.
// Rodar: npx tsx scripts/log-v8-biturbo.ts <pasta de saída>
import fs from 'node:fs';
import path from 'node:path';

const CH = ['RPMValue', 'MAPValue', 'TPSValue', 'lambdaValue', 'targetLambda', 'actualLastInjection', 'injectorDutyCycle', 'ignitionAdvanceCyl1',
  'coolant', 'intake', 'VBatt', 'oilPressure', 'lowFuelPressure', 'vehicleSpeedKph', 'detectedGear', 'throttlePedalPosition', 'egt1', 'flexPercent', 'baroPressure'];
const HZ = 25, T = 62;
const ratio = [0, 2.66, 1.78, 1.30, 1.00, 0.74, 0.50], fin = 3.42, revKm = 480;
const rpmOf = (kmh: number, g: number) => (kmh * revKm / 60) * ratio[g] * fin;
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));

const rows: string[] = ['Tempo,' + CH.join(',')];
let speed = 0, gear = 1, map = 35, clt = 84, iat = 32, egt = 420, cut = 0, rpmPrev = 850, tEnd = 99;
for (let i = 0; i <= T * HZ; i++) {
  const t = i / HZ, dt = 1 / HZ;
  let tps = 0, rpm = 850, targetMap = 35, phase = 'lenta';
  if (t >= 8 && t < 12) { phase = 'largada'; tps = 100; rpm = 4000 + 60 * Math.sin(t * 30); targetMap = 175; }
  else if (t >= 12 && t < tEnd) {
    phase = 'puxada'; tps = 100;
    if (cut > 0) { cut -= dt; tps = 100; }
    const accel = (map - 60) / 260 * [0, 9, 7.5, 5.5, 4][gear] ; // km/h por s
    speed += Math.max(0.5, accel) * dt * 3.2;
    rpm = Math.max(3200, rpmOf(speed, gear));
    if (rpm > 7000 && gear < 4) { gear++; cut = 0.18; rpm = rpmOf(speed, gear); }
    if (gear === 4 && rpm > 6900) tEnd = t; // tira o pé no fim da 4ª
    targetMap = rpm < 3000 ? 160 : Math.min(330, 160 + (rpm - 3000) * 0.07);
    if (cut > 0) targetMap = map - 40;
  } else if (t >= tEnd && t < tEnd + 8) { phase = 'desacelera'; tps = 0; speed = Math.max(90, speed - 9 * dt); gear = Math.min(gear, 4); rpm = Math.max(1100, rpmOf(speed, gear)); targetMap = 24; }
  else if (t >= tEnd + 8) { phase = 'cruzeiro'; tps = 18 + 2 * Math.sin(t); gear = 5; speed = lerp(speed, 110, dt * 0.4); rpm = rpmOf(speed, gear); targetMap = 72; }
  map += (targetMap - map) * Math.min(1, dt * (targetMap > map ? 2.2 : 6));
  rpm += rnd() * 20; rpmPrev = rpm;
  const boost = map > 105;
  const tLam = boost ? 0.78 : phase === 'desacelera' ? 1.0 : 1.0;
  let lam = tLam + rnd() * 0.02;
  if (phase === 'puxada' && gear === 4 && rpm > 5200 && rpm < 6400) lam = 0.86 + rnd() * 0.01; // empobreceu: mapa precisa de mais combustível aqui
  if (phase === 'desacelera') lam = 1.6; // corte na desaceleração
  if (phase === 'largada') lam = 0.80 + rnd() * 0.02;
  const inj = phase === 'desacelera' ? 0 : 1.1 + map * 0.044 * (tLam < 1 ? 1 / tLam * 0.85 : 1);
  const duty = rpm > 0 ? (inj / (120000 / rpm)) * 100 : 0;
  const adv = phase === 'largada' ? 2 : phase === 'desacelera' ? 30 : Math.max(10, 26 - (map - 100) * 0.055 + (rpm - 3000) * 0.0008);
  clt += ((phase === 'puxada' ? 96 : 88) - clt) * dt * 0.05;
  iat += ((boost ? 32 + (map - 100) * 0.12 : 34) - iat) * dt * 0.15;
  egt += ((phase === 'puxada' || phase === 'largada' ? 880 + (map - 100) * 0.3 : phase === 'lenta' ? 420 : 520) - egt) * dt * 0.8;
  const oil = 140 + rpm * 0.075 + rnd() * 5, fuelP = 300 + Math.max(0, map - 100) + rnd() * 4;
  const v = [rpm, map, tps, lam, tLam, inj, duty, adv, clt, iat, 13.9 + rnd() * 0.1 - (boost ? 0.2 : 0), oil, fuelP, speed, phase === 'lenta' ? 0 : gear, tps, egt, 98, 101.3];
  const digits = [0, 1, 1, 3, 2, 2, 1, 1, 1, 1, 2, 0, 0, 1, 0, 1, 0, 0, 1];
  rows.push([t.toFixed(3), ...v.map((x, k) => x.toFixed(digits[k]))].join(','));
}
const dir = process.argv[2] ?? '.';
fs.mkdirSync(dir, { recursive: true });
const f = path.join(dir, 'Log V8 biturbo - puxada de teste.csv');
fs.writeFileSync(f, rows.join('\n'));
console.log(f, rows.length - 1, 'amostras');
