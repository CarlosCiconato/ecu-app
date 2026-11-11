// Gera ini/biblioteca/speeduino: o .ini de cada versão oficial da Speeduino (o mais novo de cada assinatura),
// comprimido, mais o indice.json. Rodar de novo quando sair versão nova:  node scripts/gerar-biblioteca-speeduino.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';

const out = path.resolve('ini/biblioteca/speeduino');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'speeduino-'));
const git = (...a) => execFileSync('git', ['-C', tmp, ...a], { maxBuffer: 64 << 20 }).toString('latin1');
execFileSync('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', 'https://github.com/speeduino/speeduino.git', tmp], { stdio: 'inherit' });
const tags = git('tag').split('\n').filter(Boolean);
const chave = (t) => (t === 'master' ? [99999999, 0] : [t.split('.')[0].length === 6 ? Number(t.split('.')[0]) : 0, Number(t.split('.')[1] ?? 0)]);
const maior = (a, b) => { const x = chave(a), y = chave(b); return x[0] !== y[0] ? x[0] > y[0] : x[1] > y[1]; };
const melhor = new Map();
for (const t of [...tags, 'master']) {
  let txt;
  try { txt = git('show', `${t === 'master' ? 'origin/HEAD' : t}:reference/speeduino.ini`); } catch { continue; }
  const sig = txt.match(/^\s*signature\s*=\s*"([^"]+)"/m)?.[1];
  if (!sig) continue;
  if (!melhor.has(sig) || maior(t, melhor.get(sig).t)) melhor.set(sig, { t, txt });
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const indice = {};
for (const [sig, { t, txt }] of [...melhor].sort((a, b) => a[0].localeCompare(b[0]))) {
  const arquivo = sig.replace(/ /g, '-') + '.ini.gz';
  writeFileSync(path.join(out, arquivo), gzipSync(Buffer.from(txt, 'latin1'), { level: 9 }));
  indice[sig] = { arquivo, versao: t };
}
writeFileSync(path.join(out, 'indice.json'), JSON.stringify(indice, null, 1));
rmSync(tmp, { recursive: true, force: true });
console.log(`${Object.keys(indice).length} versões da Speeduino em ${out}`);
