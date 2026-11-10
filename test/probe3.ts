import fs from 'node:fs';
import { parseIni, type ArrayField } from '../src/core/ini.js';
import { TsClient } from '../src/core/protocol.js';
import { tcpTransport } from '../src/bridge/ecu.js';
import { decodeArray, decodeScalar, encodeArray } from '../src/core/codec.js';
const ini = parseIni(fs.readFileSync('ini/simulador.ini', 'latin1'));
const c = new TsClient(await tcpTransport('127.0.0.1', 29002));
const p = await c.readPage(ini, 1);
const f = ini.constants.get('injTimeTable') as ArrayField;
const k = Number(process.argv[2] ?? 1.5);
const v = decodeArray(p, f).map((x) => x * k);
const [lo, hi] = encodeArray(p, f, v);
await c.writeChunk(ini, 1, lo, p.subarray(lo, hi));
const inj = ini.outputs.get('actualLastInjection') as any;
for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 400)); const o = await c.readOutputs(0, ini.ochBlockSize); console.log('inj', decodeScalar(o, inj).toFixed(2), 'corr', decodeScalar(o, ini.outputs.get('totalFuelCorrection') as any).toFixed(3)); }
process.exit(0);
