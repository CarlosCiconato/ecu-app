// Biblioteca de .ini: acha o .ini certo para a assinatura que a ECU respondeu.
//  1. .ini que vêm com o app (nosso firmware, simulador)
//  2. .ini que o usuário já escolheu antes ou que já foram baixados (pasta de cache)
//  3. Speeduino: todas as versões oficiais, guardadas dentro do app (ini/biblioteca/speeduino)
//  4. rusEFI: baixa do servidor da rusEFI pela assinatura (igual o TunerStudio/console deles) e guarda
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

export type FonteIni = 'app' | 'guardado' | 'biblioteca' | 'baixado' | 'parecido';
export interface IniAchado {
  texto: string;
  fonte: FonteIni;
  aviso?: string; // ex.: versão parecida, não a exata
}

export interface OpcoesBiblioteca {
  pastaApp: string; // ini/ do app (tem biblioteca/speeduino dentro)
  pastaCache: string; // pasta do usuário onde ficam .ini baixados/escolhidos
  baixar?: boolean; // pode usar a internet (padrão: sim)
  fetchFn?: typeof fetch;
}

const ASSINATURA_RE = /^\s*signature\s*=\s*"([^"]+)"/m;
export const assinaturaDoTexto = (t: string) => t.match(ASSINATURA_RE)?.[1] ?? '';
const nomeSeguro = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 120);

/** "rusEFI master.2020.07.06.frankenso_na6.2468827536" -> endereço do .ini no servidor da rusEFI. */
export function urlRusefi(sig: string): { url: string; arquivo: string } | undefined {
  const m = sig.match(/^rusEFI\s+(?:\(\w+\)\s+)?(.+?)\.(\d{4})\.(\d{2})\.(\d{2})\.([\w-]+)\.(\d+)$/);
  if (!m) return undefined;
  const [, branch, y, mo, d, alvo, hash] = m;
  return { url: `https://rusefi.com/online/ini/rusefi/${branch}/${y}/${mo}/${d}/${alvo}/${hash}.ini`, arquivo: `${hash}.ini` };
}

function lerTodos(pasta: string, ext = '.ini'): { arquivo: string; texto: string }[] {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta).filter((f) => f.endsWith(ext)).map((f) => ({ arquivo: path.join(pasta, f), texto: readFileSync(path.join(pasta, f), 'latin1') }));
}

/** Guarda um .ini escolhido pelo usuário, para a próxima conexão achar sozinha. */
export function guardarIni(pastaCache: string, texto: string): string {
  mkdirSync(pastaCache, { recursive: true });
  const sig = assinaturaDoTexto(texto) || 'sem-assinatura';
  const f = path.join(pastaCache, nomeSeguro(sig) + '.ini');
  writeFileSync(f, texto, 'latin1');
  return f;
}

/** Lista das versões da Speeduino que vêm no app. */
export function versoesSpeeduino(pastaApp: string): Record<string, { arquivo: string; versao: string }> {
  const f = path.join(pastaApp, 'biblioteca', 'speeduino', 'indice.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
}

export async function acharIni(sig: string, o: OpcoesBiblioteca): Promise<IniAchado | undefined> {
  // 1 e 2: .ini do app e os guardados, pela assinatura exata
  for (const { texto } of lerTodos(o.pastaApp)) if (assinaturaDoTexto(texto) === sig) return { texto, fonte: 'app' };
  for (const { texto } of lerTodos(o.pastaCache)) if (assinaturaDoTexto(texto) === sig) return { texto, fonte: 'guardado' };
  // 3: Speeduino
  if (/^speeduino/i.test(sig)) {
    const idx = versoesSpeeduino(o.pastaApp);
    const dir = path.join(o.pastaApp, 'biblioteca', 'speeduino');
    const abrir = (a: string) => gunzipSync(readFileSync(path.join(dir, a))).toString('latin1');
    if (idx[sig]) return { texto: abrir(idx[sig].arquivo), fonte: 'biblioteca' };
    // Versão que não está na lista (ex.: compilação de teste "202504-dev"): usa a mais próxima anterior.
    const num = Number(sig.match(/(\d{6})/)?.[1] ?? 0);
    const cand = Object.keys(idx)
      .map((s) => ({ s, n: Number(s.match(/(\d{6})/)?.[1] ?? 0) }))
      .filter((c) => c.n <= num)
      .sort((a, b) => b.n - a.n)[0];
    if (cand) return { texto: abrir(idx[cand.s].arquivo), fonte: 'parecido', aviso: `Usando o .ini da versão ${cand.s}, a mais próxima de "${sig}". Se algo aparecer estranho, escolha o .ini do seu firmware.` };
    return undefined;
  }
  // 4: rusEFI pelo servidor deles
  const r = urlRusefi(sig);
  if (r) {
    const local = path.join(o.pastaCache, 'rusefi', r.arquivo);
    if (existsSync(local)) return { texto: readFileSync(local, 'latin1'), fonte: 'guardado' };
    if (o.baixar === false) return undefined;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      const resp = await (o.fetchFn ?? fetch)(r.url, { signal: ctl.signal });
      clearTimeout(t);
      if (!resp.ok) return undefined;
      const texto = await resp.text();
      if (assinaturaDoTexto(texto) !== sig) return undefined;
      mkdirSync(path.dirname(local), { recursive: true });
      writeFileSync(local + '.tmp', texto, 'latin1');
      renameSync(local + '.tmp', local);
      return { texto, fonte: 'baixado' };
    } catch {
      return undefined;
    }
  }
  return undefined;
}
