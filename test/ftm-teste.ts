import fs from 'node:fs';
import { parseIni } from '../src/core/ini.js';
import { EcuSession } from '../src/bridge/ecu.js';
import zlib from 'node:zlib';
import { readFtTable } from '../src/core/ftm.js';
const ini = parseIni(fs.readFileSync('ini/simulador.ini', 'latin1'));
const e = new EcuSession(ini); e.connectDemo();
await new Promise(r => setTimeout(r, 300));
const b64 = fs.readFileSync('ini/modelo-módulo de referência.ftm').toString('base64');
const info = e.ftmRead(b64); console.log(JSON.stringify(info));
console.log(await e.ftmApply(info.items.map(i => i.key)));
const t = e.table('injTimeTableTbl'); console.log('rpm', t.xBins.join(' ')); console.log('kPa', t.yBins.join(' ')); console.log('row kPa idx 5', t.values.slice(5*16, 6*16).join(' '));
const ig = e.table('ignitionTableTbl'); console.log('ign row0', ig.values.slice(0,16).join(' '), '| y', ig.yBins.join(' '));
const la = e.table('lambdaTableTbl'); console.log('lam', la.values.slice(0,16).join(' '), la.units);
const out = e.ftmExport(b64, 'K20 teste'); console.log(out.done);
const xml = zlib.gunzipSync(Buffer.from(out.data, 'base64')).toString();
const orig = zlib.gunzipSync(fs.readFileSync('ini/modelo-módulo de referência.ftm')).toString();
for (const tag of ['Inj_MainMap_A_Table','Ign_MainMap_Table','Inj_MapLambda_Table','Inj_AuxEngTemp_Table']) {
  const a = readFtTable(orig, tag)!, b = readFtTable(xml, tag)!;
  console.log(tag, b.rows.length, b.cols.length, 'r', b.rows.slice(0,4), 'c', b.cols.slice(0,5), 'orig', a.values[0].slice(0,5), 'novo', b.values[0].slice(0,5).map(v=>+v.toFixed(3)));
}
console.log('len', orig.length, xml.length, /<Name>.*<\/Name>/.exec(xml)?.[0]);
process.exit(0);
