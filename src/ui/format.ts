// Números no padrão brasileiro (vírgula decimal).
export function fmt(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export const kpaToBar = (kpa: number) => kpa / 100;
