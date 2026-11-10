// Teste das funções do app com o simulador REAL (porta 29001 = app, 29002 = console).
// Uso: npx tsx test/sim-funcoes.ts
import fs from 'node:fs';
import { parseIni } from '../src/core/ini.js';
import { EcuSession, tcpTransport } from '../src/bridge/ecu.js';
import { TsClient } from '../src/core/protocol.js';

const ini = parseIni(fs.readFileSync('ini/simulador.ini', 'latin1'));
const ecu = new EcuSession(ini);
const con = new TsClient(await tcpTransport('127.0.0.1', 29002), 3000);
const say = async (cmd: string) => { await con.request([0x45, ...Buffer.from(cmd)]); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const res: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, info = '') => { res.push([name, ok, info]); console.log(ok ? 'OK  ' : 'FALHA', name, info); };
const L = (n: string) => ecu.live(n) ?? NaN;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

await ecu.connect('127.0.0.1', 29001);
check('conectar + assinatura + ler página', ecu.status.state === 'conectado', ecu.status.ecuSignature ?? ecu.status.message ?? '');
if (ecu.status.state !== 'conectado') process.exit(1);

// ---- sensores e dados ao vivo
for (const c of ['rpm 3000', 'set_sensor_mock Clt 88', 'set_sensor_mock Iat 41', 'set_sensor_mock Map 150', 'set_sensor_mock Lambda1 0.82',
  'set_sensor_mock OilPressure 350', 'set_sensor_mock Tps1 40', 'set_sensor_mock FuelPressureLow 300', 'set_sensor_mock BarometricPressure 101.3']) await say(c);
await wait(1500);
check('ao vivo: RPM', near(L('RPMValue'), 3000, 60), String(L('RPMValue')));
check('ao vivo: temp. motor', near(L('coolant'), 88, 0.5), String(L('coolant')));
check('ao vivo: temp. ar', near(L('intake'), 41, 0.5), String(L('intake')));
check('ao vivo: MAP', near(L('MAPValue'), 150, 1), String(L('MAPValue')));
check('ao vivo: lambda', near(L('lambdaValue'), 0.82, 0.01), String(L('lambdaValue')));
check('ao vivo: TPS', near(L('TPSValue'), 40, 1), String(L('TPSValue')));
check('ao vivo: pressão óleo', near(L('oilPressure'), 350, 2), String(L('oilPressure')));
check('ao vivo: eixo do mapa ms (expressão)', near(L('injTimeTableYAxis'), 150, 1), String(L('injTimeTableYAxis')));

// ---- mapa em ms manda no combustível
await ecu.setValue('injTimeUseTps', 0);
await ecu.setValue('fuelAlgorithm', 4);
await wait(800);
const t = ecu.table('injTimeTableTbl');
const fuel1 = L('running_baseFuel');
await ecu.setCells('injTimeTableTbl', t.values.map((v, index) => ({ index, value: v * 2 })));
await wait(800);
const fuel2 = L('running_baseFuel');
check('mapa ms: dobrar o mapa aumenta o combustível', fuel2 > fuel1 * 1.5, `${fuel1} -> ${fuel2} mg`);
await ecu.setCells('injTimeTableTbl', t.values.map((v, index) => ({ index, value: v })));

// ---- ajustes (tunes)
await ecu.copyTune(1, 2);
await ecu.setValue('tuneCount', 3); // o app liga os ajustes ao escolher um acima (Ajustes.tsx)
await ecu.setValue('activeTune', 2);
await wait(1500);
check('ajuste 2 em uso', L('tuneInUse') === 2, String(L('tuneInUse')));
await ecu.zeroTune(2);
await wait(1500);
check('ajuste 2 zerado: ECU volta para o 1', L('tuneInUse') === 1, String(L('tuneInUse')));
await ecu.setValue('activeTune', 1);
await ecu.setValue('tuneCount', 1);

// ---- alerta (temperatura do motor acima de 80 °C, só aviso)
await ecu.setValue('alerts1_sensor', 3);
await ecu.setValue('alerts1_threshold', 80);
await ecu.setValue('alerts1_delay', 0);
await ecu.setValue('alerts1_minRpm', 0);
await ecu.setValue('alerts1_triggerBelow', 0);
await ecu.setValue('alerts1_action', 1);
await wait(2500);
check('alerta 1 ativo (CLT 88 > 80)', (L('alertActiveMask') & 1) === 1, `mask ${L('alertActiveMask')} nivel ${L('alertLevel')}`);
await ecu.setValue('alerts1_action', 0);

// ---- shift light
for (let i = 1; i <= 7; i++) await ecu.setValue(`shiftLightRpm${i}`, 2800);
await ecu.setValue('shiftLightPreRpm', 1000);
await wait(1500);
check('shift light acende a 3000 RPM (troca 2800)', L('shiftLightOn') === 1, `alvo ${L('shiftLightTarget')} prog ${L('shiftLightProgress')} on ${L('shiftLightOn')}`);
for (let i = 1; i <= 7; i++) await ecu.setValue(`shiftLightRpm${i}`, 0);

// ---- nº de cilindros muda junto com a ordem (sem derrubar a ECU)
await ecu.setValue('cylindersCount', 6);
await wait(800);
check('6 cilindros: ordem de ignição acompanha', ecu.status.state === 'conectado' && Number(ecu.constant('cylindersCount')) === 6, `ordem ${ini.constants.get('firingOrder')!.kind === 'bits' ? (ini.constants.get('firingOrder') as any).options[Number(ecu.constant('firingOrder'))] : ''}`);
let refused = false;
try { await ecu.setValue('firingOrder', 1); } catch { refused = true; }
check('ordem de 4 cil. com motor de 6 é recusada pelo app', refused);
await ecu.setValue('cylindersCount', 4);
await wait(500);

// ---- comandos (teste de saídas, zerar parcial)
for (const c of ['cmd_test_inj1', 'cmd_test_spk1', 'cmd_test_fuel_pump', 'cmd_test_fan_1', 'cmd_odometer_reset_partial']) {
  try { await ecu.command(c); check(`comando ${c}`, true); } catch (e) { check(`comando ${c}`, false, (e as Error).message); }
}

// ---- LTFT (página 3)
try { const lt = ecu.table('ltftTableTbl' in {} ? '' : [...ini.tables.keys()].find((k) => /ltft/i.test(k)) ?? ''); check('LTFT (página 3) lida', lt.values.length > 0, `${lt.rows}x${lt.cols}`); }
catch (e) { check('LTFT (página 3) lida', false, (e as Error).message); }

// ---- mapa padrão
try { await ecu.mapaPadrao({ rpmMax: 8000, mapMax: 250, fuel: 0, compression: 10, cam: 0 }); const m = ecu.table('injTimeTableTbl'); check('mapa padrão gera o mapa ms', m.values.some((v) => v > 0) && m.xBins.at(-1)! >= 7000, `max ${Math.max(...m.values).toFixed(2)} ms, eixo RPM até ${m.xBins.at(-1)}`); }
catch (e) { check('mapa padrão', false, (e as Error).message); }

// ---- senhas: preparador trava os mapas
const pin = 4321;
await ecu.password('setTuner', 0, pin);
await wait(1200);
check('senha do preparador criada', (L('pinStatus') & 2) === 2, `status ${L('pinStatus')} resultado ${L('pinLastResult')}`);
const before = ecu.table('ignitionTableTbl').values[0];
await ecu.password('lockAll', 0);
await wait(1200);
check('travado depois de lockAll', (L('pinStatus') & 64) === 64, `status ${L('pinStatus')}`);
let blocked = '';
try { await ecu.setCells('ignitionTableTbl', [{ index: 0, value: before + 3 }]); } catch (e) { blocked = (e as Error).message; }
check('travado: app avisa que a escrita não entrou', blocked.includes('senha'), blocked);
await ecu.disconnect(); await ecu.connect('127.0.0.1', 29001);
const lockedRead = ecu.table('ignitionTableTbl').values[0];
check('travado: mapa de ignição aparece zerado ao app', lockedRead === 0, `lido ${lockedRead} (antes ${before})`);
await ecu.password('unlockTuner', pin);
await wait(1200);
const afterUnlock = ecu.table('ignitionTableTbl').values[0];
check('depois de liberar, o app mostra o mapa de verdade', afterUnlock === before, `lido ${afterUnlock} (esperado ${before}; escrita travada não pode ter entrado)`);
await ecu.password('setTuner', pin, 0);
await wait(1200);
check('senha do preparador removida', (L('pinStatus') & 2) === 0, `status ${L('pinStatus')}`);

// ---- gravar (burn) e reiniciar
await ecu.setValue('shiftLightBlinkHz', 7);
await ecu.burn();
check('gravar na ECU', !ecu.status.dirty, '');
ecu.disconnect();
console.log('RESULTADO', res.filter((r) => r[1]).length, 'de', res.length);
fs.writeFileSync('/tmp/claude-0/sim-funcoes.json', JSON.stringify(res));
process.exit(0);
