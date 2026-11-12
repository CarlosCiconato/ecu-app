// Calibração dos sensores da Speeduino (o que o TunerStudio faz em Ferramentas > Calibrar):
// gera a tabela ADC -> valor e monta o comando 't' que o firmware espera (comms.cpp, case 't').
//  - Temperatura (motor = tabela 0, ar = tabela 1): 32 pontos (ADC 0, 33, 66... 1023), cada um em °F × 10,
//    16 bits, byte baixo primeiro; o firmware converte para °C. Tem que ir num pacote só de 64 bytes.
//  - Sonda (tabela 2): 1024 pontos de 1 byte (AFR × 10), em pacotes de 256; o firmware guarda 1 a cada 32.
import type { Calibracao } from './ini.js';

/** Steinhart-Hart pelos 3 pontos (°C, ohms): devolve a temperatura (°C) para uma resistência. */
export function steinhart(pontos: [number, number][]): (ohms: number) => number {
  const [[t1, r1], [t2, r2], [t3, r3]] = pontos;
  const L1 = Math.log(r1), L2 = Math.log(r2), L3 = Math.log(r3);
  const Y1 = 1 / (t1 + 273.15), Y2 = 1 / (t2 + 273.15), Y3 = 1 / (t3 + 273.15);
  const g2 = (Y2 - Y1) / (L2 - L1), g3 = (Y3 - Y1) / (L3 - L1);
  const C = (g3 - g2) / (L3 - L2) / (L1 + L2 + L3);
  const B = g2 - C * (L1 * L1 + L1 * L2 + L2 * L2);
  const A = Y1 - (B + L1 * L1 * C) * L1;
  return (r) => { const L = Math.log(r); return 1 / (A + B * L + C * L * L * L) - 273.15; };
}

/** ADC (0..1023, 5 V) de cada ponto da tabela. */
export const adcDoPonto = (i: number, n: number) => Math.round((i * 1023) / (n - 1));

/** Temperatura (°C) em cada ponto: termistor para o terra com resistor bias para 5 V. NaN = fora (curto/aberto). */
export function curvaTermistor(bias: number, pontos: [number, number][], n = 32): number[] {
  const t = steinhart(pontos);
  return Array.from({ length: n }, (_, i) => {
    const adc = adcDoPonto(i, n);
    if (adc <= 0 || adc >= 1023) return NaN;
    return t((bias * adc) / (1023 - adc));
  });
}

/** Bytes de uma tabela de temperatura como o TunerStudio manda (°F × scale, int16, byte baixo primeiro).
 *  Fora dos limites do .ini (tableLimits, em °F) vai o valor padrão, igual ao TunerStudio. */
export function bytesTemperatura(cal: Calibracao, idx: number, tempsC: number[]): number[] {
  const lim = cal.tabelas.find((t) => t.idx === idx);
  const out: number[] = [];
  for (const c of tempsC) {
    let f = c * 1.8 + 32;
    if (!Number.isFinite(f) || (lim?.min !== undefined && f < lim.min) || (lim?.max !== undefined && f > lim.max)) f = lim?.padrao ?? 70;
    const v = Math.round(f * cal.scale) & 0xffff;
    out.push(v & 0xff, v >> 8);
  }
  return out;
}

/** Sonda linear: AFR em cada um dos n pontos (tensão = ADC × 5 / 1023), dois pontos (V, AFR) da reta. */
export function curvaLinear(v1: number, a1: number, v2: number, a2: number, n = 1024): number[] {
  return Array.from({ length: n }, (_, i) => {
    const v = (adcDoPonto(i, n) * 5) / 1023;
    return a1 + ((v - v1) * (a2 - a1)) / (v2 - v1);
  });
}

/** Bytes da sonda: AFR × scale em 1 byte (0..255). */
export function bytesLinear(cal: Calibracao, valores: number[]): number[] {
  return valores.map((x) => Math.max(0, Math.min(255, Math.round(x * cal.scale))));
}

/** Comandos 't' prontos para mandar: [tabela, deslocamento, tamanho] em big-endian, como o firmware lê. */
export function comandosCalibracao(idx: number, dados: number[], pacote: number): number[][] {
  const out: number[][] = [];
  for (let off = 0; off < dados.length; off += pacote) {
    const d = dados.slice(off, off + pacote);
    out.push([0x74, 0x00, idx, off >> 8, off & 0xff, d.length >> 8, d.length & 0xff, ...d]);
  }
  return out;
}

/** Sondas conhecidas (saída analógica 0-5 V linear): [nome, V1, AFR1, V2, AFR2]. */
export const SONDAS: [string, number, number, number, number][] = [
  ['Innovate LC-1 / LC-2 (padrão)', 0, 7.35, 5, 22.39],
  ['AEM UEGO X-Series', 0.5, 8.5, 4.5, 18],
  ['14Point7 Spartan 2/3 (padrão)', 0, 10, 5, 20],
];
