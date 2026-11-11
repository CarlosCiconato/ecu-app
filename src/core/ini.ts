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
  scaleExpr?: string; // escala que depende de outra configuração, ex.: {fuelLoadRes} (Speeduino)
  unitsExpr?: string; // unidade que depende de outra configuração, ex.: bitStringValue(algorithmUnits, algorithm)
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
  idBytes: number[]; // os bytes do pageIdentifier como estão no .ini (%2i)
  size: number;
  readCommand?: string; // pageReadCommand desta página, ex.: "R%2i%2o%2c" (rusEFI) ou "p%2i%2o%2c" (Speeduino)
  writeCommand?: string; // pageChunkWrite / pageValueWrite
  burnCommand?: string; // "" = página que não grava na flash
}

/** Como falar com a ECU, tirado do próprio .ini (cada ECU e cada versão tem o seu). */
export interface IniComms {
  queryCommand: string; // "S" na rusEFI, "Q" na Speeduino
  envelope: boolean; // messageEnvelopeFormat = msEnvelope_1.0 (pacote com tamanho + CRC)
  ochGetCommand: string; // "O%2o%2c" na rusEFI, "r\x00\x30%2o%2c" na Speeduino
  delayAfterPortOpen: number; // ms
  interWriteDelay: number; // ms (protocolo antigo sem envelope: a ECU não responde à escrita)
  blockReadTimeout: number; // ms
  bigEndian: boolean;
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
  comms: IniComms;
  family: 'rusefi' | 'speeduino' | 'outra';
  /** Speeduino: as 15 páginas de verdade. O app enxerga todas juntas como uma "página 1" só
   *  (uma depois da outra), e o protocolo separa de novo na hora de ler, escrever e gravar. */
  realPages?: IniPage[];
  pageBase?: number[]; // início de cada página de verdade dentro da página 1 virtual
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

/** Decodifica uma string de comando do .ini ("\x00\x01", "\$tsCanId", letras) em bytes.
 *  $tsCanId é o número da ECU no barramento CAN do TunerStudio: sempre 0 numa ECU ligada direto. */
export function decodeCmd(s: string): number[] {
  const t = unquote(s).replace(/\\?\$tsCanId/g, '\\x00');
  const out: number[] = [];
  t.replace(/\\x([0-9a-fA-F]{2})|(.)/g, (_, h, c) => { out.push(h ? parseInt(h, 16) : c.charCodeAt(0)); return ''; });
  return out;
}

function parseOptions(rest: string[], defines: Map<string, string[]>): string[] {
  const out: string[] = [];
  for (const r of rest) {
    if (r.startsWith('$')) out.push(...(defines.get(r.slice(1)) ?? []));
    else out.push(unquote(r));
  }
  return out;
}

/** Símbolos dos #if do .ini que o app liga. Na Speeduino: graus Celsius e lambda (o app trabalha
 *  em lambda e unidades métricas). O resto (placa Teensy/STM32, modo compatível...) fica desligado. */
export const DEFAULT_SYMBOLS = ['CELSIUS', 'LAMBDA'];

export function parseIni(text: string, symbols: string[] = DEFAULT_SYMBOLS): Ini {
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
    comms: { queryCommand: 'S', envelope: false, ochGetCommand: 'O%2o%2c', delayAfterPortOpen: 0, interWriteDelay: 0, blockReadTimeout: 2000, bigEndian: false },
    family: 'outra',
  };
  const sym = new Set(symbols);
  let readCmds: string[] = [];
  let writeCmds: string[] = [];
  let chunkCmds: string[] = [];
  let burnCmds: string[] = [];
  let lastStart = 0; // offset do campo anterior: "lastOffset" no .ini = mesmo lugar do campo de cima (outra unidade, ex.: AFR e lambda)
  let section = '';
  let page = 1;
  let pageIds: number[][] = [];
  let pageSizes: number[] = [];
  let table: TableDef | undefined;
  // Pilha de #if/#elif/#else: vale o ramo cujo símbolo está ligado (DEFAULT_SYMBOLS ou #set).
  // Cada nível guarda [ramo atual ativo, algum ramo já foi usado].
  const cond: [boolean, boolean][] = [];
  const active = () => cond.every((c) => c[0]);

  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('#')) {
      const [dir, ...rest] = trimmed.split(/\s+/);
      const test = (r: string | undefined) => (r?.startsWith('!') ? !sym.has(r.slice(1)) : sym.has(r ?? ''));
      if (dir === '#if') { const v = test(rest[0]); cond.push([v, v]); }
      else if (dir === '#elif' && cond.length) { const c = cond[cond.length - 1]; const v = !c[1] && test(rest[0]); c[0] = v; c[1] = c[1] || v; }
      else if (dir === '#else' && cond.length) { const c = cond[cond.length - 1]; c[0] = !c[1]; c[1] = true; }
      else if (dir === '#endif') cond.pop();
      else if (dir === '#set' && active() && rest[0]) sym.add(rest[0]);
      else if (dir === '#unset' && active() && rest[0]) sym.delete(rest[0]);
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
      if (key === 'queryCommand' && section === 'MegaTune') ini.comms.queryCommand = unquote(value);
      continue;
    }

    if (section === 'Constants') {
      if (key === 'page') { page = Number(value); lastStart = 0; continue; }
      if (key === 'pageIdentifier') { pageIds = splitCsv(value).map(decodeCmd); continue; }
      if (key === 'pageSize') { pageSizes = splitCsv(value).map(Number); continue; }
      if (key === 'blockingFactor') { ini.blockingFactor = Number(value); continue; }
      if (key === 'pageReadCommand') { readCmds = splitCsv(value).map(unquote); continue; }
      if (key === 'pageValueWrite') { writeCmds = splitCsv(value).map(unquote); continue; }
      if (key === 'pageChunkWrite') { chunkCmds = splitCsv(value).map(unquote); continue; }
      if (key === 'burnCommand') { burnCmds = splitCsv(value).map(unquote); continue; }
      if (key === 'endianness') { ini.comms.bigEndian = value.trim() === 'big'; continue; }
      if (key === 'messageEnvelopeFormat') { ini.comms.envelope = /msEnvelope/.test(value); continue; }
      if (key === 'delayAfterPortOpen') { ini.comms.delayAfterPortOpen = Number(value) || 0; continue; }
      if (key === 'interWriteDelay') { ini.comms.interWriteDelay = Number(value) || 0; continue; }
      if (key === 'blockReadTimeout') { ini.comms.blockReadTimeout = Number(value) || 2000; continue; }
      const parts = splitCsv(value);
      const kind = parts[0];
      if (parts[2]?.trim() === 'lastOffset') parts[2] = String(lastStart);
      if (kind === 'string') continue;
      if (kind === 'scalar' || kind === 'array' || kind === 'bits') lastStart = Number(parts[2]) || 0;
      if (kind === 'scalar' || kind === 'array') {
        const type = parts[1] as IniType;
        const offset = Number(parts[2]);
        let rows = 1;
        let cols = 1;
        let i = 3;
        if (kind === 'array') {
          const dim = parts[3].match(/\[\s*(\d+)\s*(?:x\s*(\d+))?\s*\]/);
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
        const ex = (t?: string) => { const v = t?.trim(); return v?.startsWith('{') && resolveExpr(v.slice(1, -1).trim()) === undefined && !/^\{[-+*/0-9.\s()]+\}$/.test(v) ? v.slice(1, -1).trim() : undefined; };
        if (ex(parts[i + 1])) f.scaleExpr = ex(parts[i + 1]);
        if (ex(parts[i])) f.unitsExpr = ex(parts[i]);
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
      if (key === 'ochGetCommand') { ini.comms.ochGetCommand = unquote(value); continue; }
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

  ini.pages = pageSizes.map((size, i) => {
    const idBytes = pageIds[i] ?? [i & 0xff, (i >> 8) & 0xff];
    return {
      number: i + 1, idBytes, size,
      identifier: (idBytes[0] ?? 0) | ((idBytes[1] ?? 0) << 8),
      readCommand: readCmds[i], writeCommand: chunkCmds[i] || writeCmds[i], burnCommand: burnCmds[i],
    };
  });
  ini.family = /^rusEFI/i.test(ini.signature) ? 'rusefi' : /^speeduino/i.test(ini.signature) ? 'speeduino' : 'outra';
  if (ini.family === 'speeduino' && ini.pages.length > 1) juntarPaginas(ini);
  for (const m of text.matchAll(/^\s*(cmd_\w+)\s*=\s*"([^"]*)"/gm)) {
    const bytes: number[] = [];
    m[2].replace(/\\x([0-9a-fA-F]{2})|(.)/g, (_, h, c) => { bytes.push(h ? parseInt(h, 16) : c.charCodeAt(0)); return ''; });
    ini.commands.set(m[1], bytes);
  }
  return ini;
}

/** Junta as páginas numa página 1 virtual (ver Ini.realPages). Os campos passam a apontar para
 *  o lugar dentro dela, então o resto do app (que trabalha com a página 1) não muda. */
export function juntarPaginas(ini: Ini) {
  const base: number[] = [];
  let total = 0;
  for (const p of ini.pages) { base.push(total); total += p.size; }
  for (const f of ini.constants.values()) {
    f.offset += base[f.page - 1] ?? 0;
    f.page = 1;
  }
  ini.realPages = ini.pages;
  ini.pageBase = base;
  ini.pages = [{ number: 1, identifier: 0, idBytes: [0, 0], size: total }];
}

/** Separa um trecho da página 1 virtual nos pedaços de cada página de verdade. */
export function pedacosReais(ini: Ini, lo: number, len: number): { page: IniPage; offset: number; count: number; at: number }[] {
  if (!ini.realPages || !ini.pageBase) return [];
  const out = [];
  for (let i = 0; i < ini.realPages.length; i++) {
    const a = Math.max(lo, ini.pageBase[i]);
    const b = Math.min(lo + len, ini.pageBase[i] + ini.realPages[i].size);
    if (b > a) out.push({ page: ini.realPages[i], offset: a - ini.pageBase[i], count: b - a, at: a - lo });
  }
  return out;
}
