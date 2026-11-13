// Cor de célula pelo valor (azul = baixo, vermelho = alto), usada nos mapas e nas curvas.
export function heat(v: number, lo: number, hi: number) {
  const t = hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 0;
  const stops = [[31, 58, 95], [46, 92, 110], [122, 90, 30], [168, 50, 30]];
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  return `rgb(${stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f)).join(',')})`;
}

