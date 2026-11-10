import fs from 'node:fs';
import { parseIni } from '../src/core/ini.js';
import { TsClient } from '../src/core/protocol.js';
import { tcpTransport } from '../src/bridge/ecu.js';
import { decodeScalar, decodeBits } from '../src/core/codec.js';
const ini = parseIni(fs.readFileSync('ini/simulador.ini', 'latin1'));
const c = new TsClient(await tcpTransport('127.0.0.1', 29002));
const p = await c.readPage(ini, 1);
console.log('fuelAlgorithm', decodeBits(p, ini.constants.get('fuelAlgorithm') as any));
const o = await c.readOutputs(0, ini.ochBlockSize);
for (const n of process.argv.slice(2)) { const f = ini.outputs.get(n) as any; console.log(n, f && decodeScalar(o, f)); }
process.exit(0);
