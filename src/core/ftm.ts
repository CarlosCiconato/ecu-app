// Mapas (.ftm = XML compactado com gzip, gerado pelo programa de origem).
// Lê e escreve as tabelas que têm equivalente na nossa ECU e reamostra os eixos
// (os módulos profissionais usa qualquer número de pontos; nossas tabelas têm tamanho fixo).

export interface FtTable {
  rows: number[]; // "Linhas" (RPM; nas curvas é só [1])
  cols: number[]; // "Colunas" (carga, temperatura...)
  values: number[][]; // [linha][coluna]
}

/** Uma tabela dos módulos profissionais que sabemos traduzir para um campo da nossa ECU. */
export interface FtLink {
  key: string;
  title: string;
  ft: string; // nome da tabela no .ftm
  kind: 'map' | 'curve';
  // nomes no .ini (mapa: tabela por ajuste; curva: eixo + valores)
  z: string; x?: string; y?: string; perTune?: boolean;
  // FT -> nosso e o contrário, nos valores e no eixo de carga
  toEcu?: (v: number) => number; toFt?: (v: number) => number;
  loadToEcu?: (v: number) => number; loadToFt?: (v: number) => number;
}

const bar = { loadToEcu: (b: number) => b * 100 + 101.3, loadToFt: (k: number) => (k - 101.3) / 100 };
const pct = { toEcu: (p: number) => 1 + p / 100, toFt: (r: number) => (r - 1) * 100 };

export const FT_LINKS: FtLink[] = [
  { key: 'inj', title: 'Mapa de injeção (ms)', ft: 'Inj_MainMap_A_Table', kind: 'map', z: 'injTimeTable', x: 'injTimeRpmBins', y: 'injTimeLoadBins', perTune: true, ...bar },
  { key: 'injTps', title: 'Mapa de injeção por TPS (ms)', ft: 'Inj_MainTps_A_Table', kind: 'map', z: 'injTimeTable', x: 'injTimeRpmBins', y: 'injTimeLoadBins', perTune: true },
  { key: 'ign', title: 'Mapa de ignição', ft: 'Ign_MainMap_Table', kind: 'map', z: 'ignitionTable', x: 'ignitionRpmBins', y: 'ignitionLoadBins', perTune: true, ...bar },
  { key: 'lambda', title: 'Lambda alvo', ft: 'Inj_MapLambda_Table', kind: 'map', z: 'lambdaTable', x: 'lambdaRpmBins', y: 'lambdaLoadBins', perTune: true, ...bar,
    // a escala do lambda no .ini depende de uma expressão que o app não calcula: o valor fica cru (lambda × 147)
    toEcu: (l: number) => l * 147, toFt: (r: number) => r / 147 },
  { key: 'clt', title: 'Injeção por temperatura do motor', ft: 'Inj_AuxEngTemp_Table', kind: 'curve', z: 'cltFuelCorr', x: 'cltFuelCorrBins', ...pct },
  { key: 'iat', title: 'Injeção por temperatura do ar', ft: 'Inj_AuxAirTemp_Table', kind: 'curve', z: 'iatFuelCorr', x: 'iatFuelCorrBins', ...pct },
];

// ---------- XML ----------
const doubles = (s: string) => [...s.matchAll(/<double>([^<]*)<\/double>/g)].map((m) => Number(m[1]));

function block(xml: string, tag: string) {
  const a = xml.indexOf(`<${tag}>`);
  if (a < 0) return undefined;
  const end = `</${tag}>`;
  const b = xml.indexOf(end, a);
  return b < 0 ? undefined : { start: a, end: b + end.length, inner: xml.slice(a + tag.length + 2, b) };
}

export function readFtTable(xml: string, tag: string): FtTable | undefined {
  const t = block(xml, tag);
  if (!t) return undefined;
  const rows = doubles(block(t.inner, 'Linhas')?.inner ?? '');
  const cols = doubles(block(t.inner, 'Colunas')?.inner ?? '');
  const tab = block(t.inner, 'Tabela')?.inner ?? '';
  const values: number[][] = [];
  // cada linha: <Item><Key><double>rpm</double></Key><Value><Serializable...> pares coluna/valor
  for (const m of tab.matchAll(/<SerializableDictionaryOfDoubleDouble>([\s\S]*?)<\/SerializableDictionaryOfDoubleDouble>/g)) {
    const pairs = doubles(m[1]);
    values.push(cols.map((_, i) => pairs[i * 2 + 1]));
  }
  if (!rows.length || !cols.length || values.length !== rows.length) return undefined;
  return { rows, cols, values };
}

const num = (v: number) => String(Math.round(v * 10000) / 10000);

export function writeFtTable(xml: string, tag: string, t: FtTable): string {
  const old = block(xml, tag);
  if (!old) return xml;
  const lineStart = xml.lastIndexOf('\n', old.start) + 1;
  const ind = xml.slice(lineStart, old.start);
  const i1 = ind + '  ', i2 = i1 + '  ';
  const list = (name: string, a: number[]) => `${i1}<${name}>\n${a.map((v) => `${i2}<double>${num(v)}</double>`).join('\n')}\n${i1}</${name}>`;
  const items = t.rows.map((r, ri) => {
    const pairs = t.cols.map((c, ci) => `${i2}      <Item>\n${i2}        <Key>\n${i2}          <double>${num(c)}</double>\n${i2}        </Key>\n${i2}        <Value>\n${i2}          <double>${num(t.values[ri][ci])}</double>\n${i2}        </Value>\n${i2}      </Item>`).join('\n');
    return `${i2}<Item>\n${i2}  <Key>\n${i2}    <double>${num(r)}</double>\n${i2}  </Key>\n${i2}  <Value>\n${i2}    <SerializableDictionaryOfDoubleDouble>\n${pairs}\n${i2}    </SerializableDictionaryOfDoubleDouble>\n${i2}  </Value>\n${i2}</Item>`;
  }).join('\n');
  const body = `<${tag}>\n${list('Linhas', t.rows)}\n${list('Colunas', t.cols)}\n${i1}<Tabela>\n${items}\n${i1}</Tabela>\n${ind}</${tag}>`;
  return xml.slice(0, old.start) + body + xml.slice(old.end);
}

export function ftName(xml: string) { return /<Name>([^<]*)<\/Name>/.exec(xml)?.[1] ?? ''; }
export function ftMainLoad(xml: string) { return /<MainMap>([^<]*)<\/MainMap>/.exec(xml)?.[1] ?? 'MAP'; }
export function setFtName(xml: string, name: string) {
  const safe = name.replace(/[<&>]/g, '').slice(0, 32);
  return xml.replace(/<Name>[^<]*<\/Name>/, `<Name>${safe}</Name>`);
}

// ---------- reamostragem ----------
/** Escolhe n pontos para um eixo: mantém os pontos originais quando dá, senão divide os maiores intervalos. */
export function resampleAxis(src: number[], n: number): number[] {
  if (src.length === n) return src.slice();
  if (src.length > n) return Array.from({ length: n }, (_, i) => src[Math.round((i * (src.length - 1)) / (n - 1))]);
  const a = src.length ? src.slice() : [0, 1];
  if (a.length === 1) a.push(a[0] + 1);
  while (a.length < n) {
    let gi = 0;
    for (let i = 1; i < a.length - 1; i++) if (a[i + 1] - a[i] > a[gi + 1] - a[gi]) gi = i;
    a.splice(gi + 1, 0, (a[gi] + a[gi + 1]) / 2);
  }
  return a;
}

/**
 * Escolhe n pontos de um eixo. Com mais pontos que n, tira primeiro os pontos que
 * a interpolação dos vizinhos já reproduz (menor erro nos valores), assim o desenho
 * do mapa fica igual. Com menos, divide os maiores intervalos.
 * series: valores ao longo do eixo (uma lista por linha/coluna da tabela).
 */
export function pickAxis(src: number[], series: number[][], n: number): number[] {
  if (src.length <= n) return resampleAxis(src, n);
  const idx = src.map((_, i) => i);
  while (idx.length > n) {
    let best = 1, bestErr = Infinity;
    for (let k = 1; k < idx.length - 1; k++) {
      const [a, i, b] = [idx[k - 1], idx[k], idx[k + 1]];
      const f = (src[i] - src[a]) / (src[b] - src[a] || 1);
      let err = 0;
      for (const s of series) {
        const span = Math.max(...s) - Math.min(...s) || 1; // erro relativo, para ms e graus pesarem igual
        err = Math.max(err, Math.abs(s[i] - (s[a] + (s[b] - s[a]) * f)) / span);
      }
      if (err < bestErr) { bestErr = err; best = k; }
    }
    idx.splice(best, 1);
  }
  return idx.map((i) => src[i]);
}

function locate(bins: number[], v: number): [number, number, number] {
  if (bins.length === 1 || v <= bins[0]) return [0, 0, 0];
  const last = bins.length - 1;
  if (v >= bins[last]) return [last, last, 0];
  let i = 0;
  while (bins[i + 1] < v) i++;
  return [i, i + 1, (v - bins[i]) / (bins[i + 1] - bins[i])];
}

/** Valor da tabela em (linha, coluna) com interpolação bilinear; fora dos eixos usa a borda. */
export function lookup(t: FtTable, r: number, c: number) {
  const [r0, r1, fr] = locate(t.rows, r);
  const [c0, c1, fc] = locate(t.cols, c);
  const a = t.values[r0][c0] + (t.values[r0][c1] - t.values[r0][c0]) * fc;
  const b = t.values[r1][c0] + (t.values[r1][c1] - t.values[r1][c0]) * fc;
  return a + (b - a) * fr;
}

/** Eixo inteiro (campos U16 do .ini) sem pontos repetidos. */
export function intAxis(a: number[]) {
  const out = a.map((v) => Math.round(v));
  for (let i = 1; i < out.length; i++) if (out[i] <= out[i - 1]) out[i] = out[i - 1] + 1;
  return out;
}
