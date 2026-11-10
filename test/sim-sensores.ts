// Põe valores de exemplo nos sensores do simulador (só para ver as telas "vivas").
// Uso: npx tsx test/sim-sensores.ts [rpm]
import { TsClient } from '../src/core/protocol.js';
import { tcpTransport } from '../src/bridge/ecu.js';
const rpm = process.argv[2] ?? '5200';
const c = new TsClient(await tcpTransport('127.0.0.1', Number(process.env.SIM_PORT ?? 29002)));
const cmds = [
  `rpm ${rpm}`,
  'set_sensor_mock Clt 88', 'set_sensor_mock Iat 41', 'set_sensor_mock BarometricPressure 101.3',
  'set_sensor_mock Map 226', 'set_sensor_mock Lambda1 0.82', 'set_sensor_mock OilPressure 350',
  'set_sensor_mock Tps1 78', 'set_sensor_mock FuelPressureLow 300',
];
for (const cmd of cmds) await c.request([0x45, ...Buffer.from(cmd)]);
console.log('ok');
process.exit(0);
