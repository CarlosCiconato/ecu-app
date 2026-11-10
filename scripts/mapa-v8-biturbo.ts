// Gera um mapa de teste: V8 6.2 biturbo a etanol, com todos os sensores e atuadores ligados.
// Rodar: npx tsx scripts/mapa-v8-biturbo.ts <pasta de saída>
// Os pinos são os do simulador (firmware sim-test); na placa de verdade o .ini é outro.
import fs from 'node:fs';
import path from 'node:path';
import { parseIni } from '../src/core/ini.js';
import { EcuSession } from '../src/bridge/ecu.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ini = parseIni(fs.readFileSync(path.join(root, 'ini/simulador.ini'), 'latin1'));
const ecu = new EcuSession(ini);
ecu.connectDemo();
const ok: string[] = [], miss: string[] = [];

async function set(name: string, v: number | string) {
  const f = ini.constants.get(name) as any;
  if (!f) { miss.push(`${name} (não existe)`); return; }
  try {
    let n = v as number;
    if (typeof v === 'string') {
      if (f.kind !== 'bits') { miss.push(`${name}=${v} (não é lista)`); return; }
      n = f.options.findIndex((o: string) => o === v);
      if (n < 0) n = f.options.findIndex((o: string) => o.toLowerCase().includes(v.toLowerCase()));
      if (n < 0) { miss.push(`${name}=${v} (opção não achada)`); return; }
    }
    if (f.kind === 'array') { miss.push(`${name} (é tabela)`); return; }
    await ecu.setValue(name, n);
    ok.push(name);
  } catch (e) { miss.push(`${name}: ${(e as Error).message}`); }
}
/** Preenche uma tabela 2D a partir dos eixos (x = colunas, y = linhas). */
async function fill(name: string, xName: string, yName: string, fn: (x: number, y: number) => number) {
  const f = ini.constants.get(name) as any;
  const xs = ecu.constant(xName) as unknown as number[], ys = ecu.constant(yName) as unknown as number[];
  if (!f || !Array.isArray(xs) || !Array.isArray(ys)) { miss.push(`${name} (tabela/eixos não achados)`); return; }
  const cells: { index: number; value: number }[] = [];
  ys.forEach((y, r) => xs.forEach((x, c) => cells.push({ index: r * xs.length + c, value: fn(x, y) })));
  try { await ecu.setArray(name, cells); ok.push(name); } catch (e) { miss.push(`${name}: ${(e as Error).message}`); }
}
async function axis(name: string, vals: number[]) {
  try { await ecu.setArray(name, vals.map((value, index) => ({ index, value }))); ok.push(name); } catch (e) { miss.push(`${name}: ${(e as Error).message}`); }
}

// ---- Motor: V8 6.2, biturbo, etanol
await set('cylindersCount', 8);
await set('firingOrder', '1-8-4-3-6-5-7-2');
await set('displacement', 6.2);
await set('cylinderBore', 103.25);
await set('injector_flow', 2200);
await set('injectionMode', 'Sequential');
await set('crankingInjectionMode', 'Simultaneous');
await set('ignitionMode', 'Individual Coils');
await set('trigger_type', '60-2');
await set('rpmHardLimit', 7200);
await set('cranking_rpm', 450);
// ---- Sensores
await set('map_sensor_type', 'MPXH6400'); // 4 bar
await set('afr_type', 'Custom'); // sonda wideband 0-5 V
await set('oilPressureCurve_enabled', 1);
await set('oilPressure_v1', 0.5); await set('oilPressure_value1', 0); await set('oilPressure_v2', 4.5); await set('oilPressure_value2', 1000);
await set('lowPressureFuelCurve_enabled', 1);
await set('lowPressureFuel_v1', 0.5); await set('lowPressureFuel_value1', 0); await set('lowPressureFuel_v2', 4.5); await set('lowPressureFuel_value2', 1000);
await set('oilPressure_hwChannel', 'PA3');
await set('lowPressureFuel_hwChannel', 'PA4');
await set('flexSensorPin', 'PC6');
await set('vehicleSpeedSensorInputPin', 'PC7');
await set('vssToothCount', 21); await set('driveWheelRevPerKm', 480);
await set('totalGearsCount', 6); await set('finalGearRatio', 3.42);
for (const [i, r] of [2.66, 1.78, 1.30, 1.00, 0.74, 0.50].entries()) await set(`gearRatio${i + 1}`, r);
await set('throttlePedalPositionAdcChannel', 'PA5');
await set('ftcanEgtEnabled', 1);
await set('vvtMode1', 'Single Tooth');
// ---- Atuadores
const out = ['PD8', 'PD9', 'PD10', 'PD11', 'PD12', 'PD13', 'PD14', 'PD15'];
for (let i = 1; i <= 8; i++) await set(`injectionPins${i}`, out[i - 1]);
const ign = ['PE8', 'PE9', 'PE10', 'PE11', 'PE12', 'PE13', 'PE14', 'PE15'];
for (let i = 1; i <= 8; i++) await set(`ignitionPins${i}`, ign[i - 1]);
await set('mainRelayPin', 'PB0'); await set('fuelPumpPin', 'PB1'); await set('fanPin', 'PB2'); await set('fan2Pin', 'PB3');
await set('acRelayPin', 'PB4'); await set('boostControlPin', 'PB5'); await set('tachOutputPin', 'PB6'); await set('starterControlPin', 'PB7');
await set('alertOutputPin', 'PB8'); await set('shiftLightPin', 'PB9'); await set('vvtPins1', 'PB10');
await set('fanOnTemperature', 95); await set('fanOffTemperature', 90); await set('fan2OnTemperature', 101); await set('fan2OffTemperature', 96);
await set('startUpFuelPumpDuration', 4);
await set('tachPulsePerRev', 4);
await set('startStopButtonPin', 'PC8');
await set('etbFunctions1', 'Throttle 1');
await set('coastingFuelCutEnabled', 1);
await set('fuelClosedLoopCorrectionEnabled', 1);
await set('knockRetardAggression', 20);
for (const [i, r] of [6000, 6200, 6400, 6600, 6800, 7000, 7100].entries()) await set(`shiftLightRpm${i + 1}`, r);
// ---- Turbo: controle de pressão (malha aberta + fechada)
await set('isBoostControlEnabled', 1);
await set('boostType', 'Open + Closed Loop');
await set('enableSoftwareKnock', 1);
await set('isSdCardEnabled', 1);
await set('boostPwmFrequency', 33);
await set('boostControlMinRpm', 2500); await set('boostControlMinTps', 30); await set('boostControlMinMap', 110);
await set('boostCutPressure', 330);
await set('antiLagEnabled', 1);
await set('launchControlEnabled', 1); await set('launchRpm', 4000);
await set('wmiActiveDuty', 60);

// ---- Mapas de injeção e ignição pelo gerador do app (etanol, até 2,5 bar de turbo)
try { await ecu.mapaPadrao({ rpmMax: 7200, mapMax: 320, fuel: 3, compression: 1, cam: 1 }); ok.push('mapa de injeção e ignição'); }
catch (e) { miss.push(`mapaPadrao: ${(e as Error).message}`); }
// duty da válvula (malha aberta) e alvo de pressão (kPa absoluto) por RPM × TPS
await fill('boostTableOpenLoop', 'boostRpmBins', 'boostOpenLoopLoadBins', (rpm, tps) => (rpm < 2500 || tps < 30 ? 0 : Math.min(85, 25 + (tps - 30) * 0.6 + (rpm - 2500) / 120)));
await fill('boostTableClosedLoop', 'boostRpmBins', 'boostClosedLoopLoadBins', (rpm, tps) => (rpm < 2500 || tps < 30 ? 100 : Math.round(100 + Math.min(150, (tps - 30) * 1.6 + (rpm - 2500) / 25))));

const dir = process.argv[2] ?? '.';
const m = ecu.exportMap('V8 6.2 biturbo etanol (teste)');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'V8 6.2 biturbo etanol (teste).ecumap'), JSON.stringify(m, null, 1));
console.log(`OK (${ok.length}): ${ok.join(' ')}`);
console.log(`FALTOU (${miss.length}):\n  ${miss.join('\n  ')}`);
process.exit(0);
