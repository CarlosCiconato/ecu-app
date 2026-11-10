// Gravar (burn) e conferir depois de reiniciar o simulador. Uso: npx tsx test/sim-burn.ts gravar|conferir
import fs from 'node:fs';
import { parseIni } from '../src/core/ini.js';
import { EcuSession } from '../src/bridge/ecu.js';
const ini = parseIni(fs.readFileSync('ini/simulador.ini', 'latin1'));
const ecu = new EcuSession(ini);
await ecu.connect('127.0.0.1', 29001);
if (process.argv[2] === 'gravar') {
  await ecu.setValue('shiftLightBlinkHz', 7);
  const t = ecu.table('ignitionTableTbl');
  await ecu.setCells('ignitionTableTbl', [{ index: 5, value: 21.5 }]);
  await ecu.burn();
  console.log('gravado: blink 7, ignição[5] 21.5 (antes', t.values[5], ')');
} else {
  console.log('depois de reiniciar: blink', ecu.constant('shiftLightBlinkHz'), 'ignição[5]', ecu.table('ignitionTableTbl').values[5]);
}
ecu.disconnect();
process.exit(0);
