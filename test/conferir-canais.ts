// Confere se os canais ao vivo que as telas pedem existem no .ini (outputs ou expressões).
import fs from 'node:fs';
import path from 'node:path';
import { parseIni } from '../src/core/ini.js';
const ini = parseIni(fs.readFileSync('ini/simulador.ini', 'latin1'));
const files: string[] = [];
const walk = (d: string) => fs.readdirSync(d).forEach((f) => { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && files.push(p); });
walk('src/ui');
const want = new Map<string, string>();
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/(?:useLive\(\[|ch: \[|live: |yLiveName: |SENSORES[^=]*=|ERROS[^=]*=)([^\]\n]*)/g))
    for (const n of m[1].matchAll(/'([A-Za-z_]\w*)'/g)) want.set(n[1], path.basename(f));
  for (const m of s.matchAll(/\[\s*'([A-Za-z_]\w*)'\s*,\s*'[^']*'/g)) if (ini.outputs.has(m[1]) || /^[a-z]/.test(m[1])) want.set(m[1], path.basename(f) + '*');
}
const bad = [...want].filter(([n]) => !ini.outputs.has(n) && !ini.expressions.has(n) && !ini.constants.has(n));
console.log(`canais pedidos ${want.size}, faltando ${bad.length}`);
for (const [n, f] of bad) console.log(' -', n, f);
