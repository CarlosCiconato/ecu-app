// Leitor do arquivo .ini do TunerStudio gerado pelo build do nosso firmware.
// Lê só o que o app precisa: assinatura, páginas, campos de configuração ([Constants])
// e canais ao vivo ([OutputChannels]). Assim, cada campo novo do firmware aparece
// no app sem reescrever código.

export type IniType = 'U08' | 'S08' | 'U16' | 'S16' | 'U32' | 'S32' | 'F32';

export interface ScalarField {
  kind: 'scalar';
  name: string;
  page: number; // índice da página no .ini (1 = configuração principal)
  type: IniType;
  offset: number;
  units: string;
  scale: number;
  translate: number;
  min?: number;
  max?: number;
  digits?: number;
}

export interface ArrayField extends Omit<ScalarField, 'kind'> {
  kind: 'array';
  rows: number; // [16x16] -> rows=16, cols=16 ; [16] -> rows=16, cols=1
  cols: number;
}

export interface BitsField {
  kind: 'bits';
  name: string;
  page: number;
  type: IniType;
  offset: number;
  bitLo: number;
  bitHi: number;
  options: string[];
}

export type Field = ScalarField | ArrayField | BitsField;

export interface IniPage {
  number: number; // 1..n
  identifier: number; // valor de 16 bits enviado no comando (0x0000, 0x0001, ...)
  size: number;
}

export interface TableDef {
  name: string; // ex.: injTimeTableTbl
  title: string;
  xBins: string; // campo do eixo X (RPM)
  xLive?: string; // canal ao vivo do eixo X
  yBins: string;
  yLive?: string;
  zBins: string;
}

export interface Ini {
  signature: string;
  pages: IniPage[];
  blockingFactor: number;
  ochBlockSize: number;
  constants: Map<string, Field>;
  outputs: Map<string, ScalarField | BitsField>;
  expressions: Map<string, string>; // canais calculados de [OutputChannels] (ex.: "{ a ? b : c }")
  defines: Map<string, string[]>;
  tables: Map<string, TableDef>;
  commands: Map<string, number[]>; // botões de ação do .ini (cmd_*), ex.: teste de bico
}

export const TYPE_SIZE: Record<IniType, number> = {
  U08: 1, S08: 1, U16: 2, S16: 2, U32: 4, S32: 4, F32: 4,
};

/** Separa por vírgula respeitando aspas e chaves { }. */
export function splitCsv(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote = false;
  let depth = 0;
  for (const ch of s) {
    if (ch === '"') quote = !quote;
    else if (!quote && ch === '{') depth++;
    else if (!quote && ch === '}') depth--;
    if (ch === ',' && !quote && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

// O app trabalha sempre em unidades métricas e em lambda: estas chaves do TunerStudio valem "sim".
const FLAGS: Record<string, boolean> = { useMetricOnInterface: true, useLambdaOnInterface: true };
const UNIT_LABELS: Record<string, string> = { unitsLabels: 'C', pressureUnitsLabels: 'kPa' };
/** Resolve "{ chave ? a : b }" e "{bitStringValue(lista, chave)}" com as chaves acima. */
function resolveExpr(inner: string): string | undefined {
  const m = inner.match(/^(!?)\s*(\w+)\s*\?\s*(.+?)\s*:\s*(.+)$/);
  if (m && m[2] in FLAGS) return (FLAGS[m[2]] !== (m[1] === '!')) ? m[3] : m[4];
  const b = inner.match(/^bitStringValue\(\s*(\w+)\s*,\s*(\w+)\s*\)$/);
  if (b && b[1] in UNIT_LABELS && b[2] in FLAGS) return `"${UNIT_LABELS[b[1]]}"`;
  return undefined;
}

const unquote = (s: string) => {
  const t = s.trim();
  if (t.startsWith('{')) { const r = resolveExpr(t.slice(1, -1).trim()); if (r !== undefined) return r.replace(/^"(.*)"$/, '$1'); }
  return t.replace(/^"(.*)"$/, '$1');
};

function num(s: string | undefined, fallback: number): number {
  if (s === undefined) return fallback;
  const t = s.trim();
  // Expressões {…} do TunerStudio: só aceitamos as numéricas simples, ex. {1/10}.
  if (t.startsWith('{')) {
    let inner = t.slice(1, -1).trim();
    inner = resolveExpr(inner) ?? inner;
    if (/^[-+*/0-9.\s()]+$/.test(inner)) {
      try {
        // eslint-disable-next-line no-new-func
        const v = Function(`"use strict";return (${inner})`)();
        if (typeof v === 'number' && Number.isFinite(v)) return v;
      } catch { /* cai no padrão */ }
    }
    return fallback;
  }
  const v = Number(t);
  return Number.isFinite(v) ? v : fallback;
}

function stripComment(line: string): string {
  // Comentários começam com ';' fora de aspas.
  let quote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quote = !quote;
    else if (ch === ';' && !quote) return line.slice(0, i);
  }
  return line;
}

/** Decodifica "\x00\x01" do pageIdentifier para o número de 16 bits little-endian. */
function parsePageId(s: string): number {
  const bytes = [...unquote(s).matchAll(/\\x([0-9a-fA-F]{2})/g)].map((m) => parseInt(m[1], 16));
  return (bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8);
}

function parseOptions(rest: string[], defines: Map<string, string[]>): string[] {
  const out: string[] = [];
  for (const r of rest) {
    if (r.startsWith('$')) out.push(...(defines.get(r.slice(1)) ?? []));
    else out.push(unquote(r));
  }
  return out;
}

export function parseIni(text: string): Ini {
  const ini: Ini = {
    signature: '',
    pages: [],
    blockingFactor: 256,
    ochBlockSize: 0,
    constants: new Map(),
    outputs: new Map(),
    expressions: new Map(),
    defines: new Map(),
    tables: new Map(),
    commands: new Map(),
  };
  let section = '';
  let page = 1;
  let pageIds: number[] = [];
  let pageSizes: number[] = [];
  let table: TableDef | undefined;
  // Pilha de #if: o app não define nenhum símbolo, então vale o ramo #else.
  const cond: boolean[] = [];
  const active = () => cond.every(Boolean);

  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('#')) {
      const [dir, ...rest] = trimmed.split(/\s+/);
      if (dir === '#if') cond.push(false);
      else if (dir === '#else') cond[cond.length - 1] = !cond[cond.length - 1];
      else if (dir === '#endif') cond.pop();
      else if (dir === '#define' && active()) {
        const def = trimmed.slice('#define'.length).trim();
        const eq = def.indexOf('=');
        if (eq > 0) ini.defines.set(def.slice(0, eq).trim(), splitCsv(def.slice(eq + 1)).map(unquote));
      }
      void rest;
      continue;
    }
    if (!active()) continue;
    const line = stripComment(raw).trim();
    if (!line) continue;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      section = sec[1];
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();

    if (section === 'MegaTune' || section === 'TunerStudio') {
      if (key === 'signature' && !ini.signature) ini.signature = unquote(value);
      continue;
    }

    if (section === 'Constants') {
      if (key === 'page') { page = Number(value); continue; }
      if (key === 'pageIdentifier') { pageIds = splitCsv(value).map(parsePageId); continue; }
      if (key === 'pageSize') { pageSizes = splitCsv(value).map(Number); continue; }
      if (key === 'blockingFactor') { ini.blockingFactor = Number(value); continue; }
      const parts = splitCsv(value);
      const kind = parts[0];
      if (kind === 'scalar' || kind === 'array') {
        const type = parts[1] as IniType;
        const offset = Number(parts[2]);
        let rows = 1;
        let cols = 1;
        let i = 3;
        if (kind === 'array') {
          const dim = parts[3].match(/\[(\d+)(?:x(\d+))?\]/);
          if (dim) {
            if (dim[2]) { cols = Number(dim[1]); rows = Number(dim[2]); }
            else rows = Number(dim[1]);
          }
          i = 4;
        }
        const f: ScalarField = {
          kind: 'scalar', name: key, page, type, offset,
          units: unquote(parts[i] ?? ''),
          scale: num(parts[i + 1], 1),
          translate: num(parts[i + 2], 0),
          min: num(parts[i + 3], NaN),
          max: num(parts[i + 4], NaN),
          digits: num(parts[i + 5], 0),
        };
        if (kind === 'array') ini.constants.set(key, { ...f, kind: 'array', rows, cols });
        else ini.constants.set(key, f);
      } else if (kind === 'bits') {
        const bits = parts[3].match(/\[(\d+):(\d+)\]/);
        ini.constants.set(key, {
          kind: 'bits', name: key, page, type: parts[1] as IniType, offset: Number(parts[2]),
          bitLo: bits ? Number(bits[1]) : 0, bitHi: bits ? Number(bits[2]) : 0,
          options: parseOptions(parts.slice(4), ini.defines),
        });
      }
      continue;
    }

    if (section === 'OutputChannels') {
      if (key === 'ochBlockSize') { ini.ochBlockSize = Number(value); continue; }
      if (value.startsWith('{')) { ini.expressions.set(key, value.slice(1, -1).trim()); continue; }
      const parts = splitCsv(value);
      if (parts[0] === 'scalar') {
        ini.outputs.set(key, {
          kind: 'scalar', name: key, page: 0, type: parts[1] as IniType, offset: Number(parts[2]),
          units: unquote(parts[3] ?? ''), scale: num(parts[4], 1), translate: num(parts[5], 0),
        });
      } else if (parts[0] === 'bits') {
        const bits = parts[3].match(/\[(\d+):(\d+)\]/);
        ini.outputs.set(key, {
          kind: 'bits', name: key, page: 0, type: parts[1] as IniType, offset: Number(parts[2]),
          bitLo: bits ? Number(bits[1]) : 0, bitHi: bits ? Number(bits[2]) : 0,
          options: parseOptions(parts.slice(4), ini.defines),
        });
      }
      continue;
    }

    if (section === 'TableEditor') {
      const parts = splitCsv(value);
      if (key === 'table') {
        table = { name: parts[0], title: unquote(parts[2] ?? parts[0]), xBins: '', yBins: '', zBins: '' };
        ini.tables.set(table.name, table);
      } else if (table && key === 'xBins') { table.xBins = parts[0]; table.xLive = parts[1]; }
      else if (table && key === 'yBins') { table.yBins = parts[0]; table.yLive = parts[1]; }
      else if (table && key === 'zBins') { table.zBins = parts[0]; }
    }
  }

  ini.pages = pageSizes.map((size, i) => ({ number: i + 1, identifier: pageIds[i] ?? i, size }));
  for (const m of text.matchAll(/^\s*(cmd_\w+)\s*=\s*"([^"]*)"/gm)) {
    const bytes: number[] = [];
    m[2].replace(/\\x([0-9a-fA-F]{2})|(.)/g, (_, h, c) => { bytes.push(h ? parseInt(h, 16) : c.charCodeAt(0)); return ''; });
    ini.commands.set(m[1], bytes);
  }
  return ini;
}
