// Preferências da tela (ficam neste computador/tablet, não na ECU).
import { useSyncExternalStore } from 'react';
import type { Screen } from './App';

export type FluxoUn = 'Lmin' | 'Lh' | 'ccmin' | 'gpm' | 'gph' | 'lbh' | 'gs';

export interface Prefs {
  pressure: 'bar' | 'psi' | 'kPa';
  lambda: 'lambda' | 'afrMapa' | 'afr' | 'afrE100' | 'afrMetanol'; // afr = gasolina 14,7
  estequiometrica: number; // AFR do combustível do mapa (lido da ECU ao escolher "AFR pelo combustível do mapa")
  temp: 'C' | 'F';
  speed: 'kmh' | 'mph';
  fuelVol: 'L' | 'gal';
  engineVol: 'cc' | 'L' | 'in3';
  flow: FluxoUn; // fluxo (bomba, consumo instantâneo)
  injFlow: FluxoUn; // vazão dos bicos
  size: 'mm' | 'in';
  tirePressure: 'psi' | 'bar' | 'kPa';
  density: 'gcc' | 'lbft3';
  distance: 'km' | 'm' | 'mi' | 'ft';
  power: 'kW' | 'cv' | 'hp';
  torque: 'Nm' | 'kgfm' | 'lbft';
  consumption: 'kmL' | 'mpg' | 'L100';
  maxRpm: number; // fim da barra de RPM do painel
  shiftRpm: number; // a barra fica vermelha a partir daqui
  favorites: Screen[];
  paineis: string[][]; // 4 painéis × 9 posições (ids de GAUGES em Painel.tsx)
  paineisAtivos: boolean[]; // quais painéis entram na troca por toque
  painelAtual: number;
  tema: 'noite' | 'dia'; // qual nível de luz de fundo está valendo (as cores não mudam)
  brilho: number; // luz de fundo no modo dia, 10 a 100 %
  brilhoNoite: number; // luz de fundo no modo noite, 10 a 100 %
  som: boolean; // bipe quando um alerta dispara
  telaInicial: Screen; // tela que abre ao conectar
  nomesAjuste: string[]; // nome de cada ajuste 1-3 (referência cap. 24.1)
}
const KEY = 'ecu-app-prefs';
const DEFAULT: Prefs = { pressure: 'bar', lambda: 'lambda', estequiometrica: 14.7, temp: 'C', speed: 'kmh', fuelVol: 'L', engineVol: 'cc', flow: 'Lmin', injFlow: 'ccmin', size: 'mm',
  tirePressure: 'psi', density: 'gcc', distance: 'km', power: 'cv', torque: 'Nm', consumption: 'kmL', maxRpm: 9000, shiftRpm: 7500, favorites: ['mapa', 'ignicao', 'f_accel', 'f_partida', 'f_lenta', 'outras', 'f_sdlog', 'alertas'],
  paineis: [
    ['boost', 'gear', 'speed', 'lambda', 'batt', 'tps', 'oil', 'fuelP', 'clt'],
    ['boost', 'adv', 'inj', 'lambda', 'iat', 'duty', 'oil', 'fuelP', 'egt'],
    ['clt', 'gear', 'speed', 'batt', 'iat', 'pedal', 'oil', 'oilT', 'fuelP'],
    ['lambda', 'inj', 'adv', 'batt', 'flex', 'tps', 'oil', 'fuelP', 'iat'],
  ], paineisAtivos: [true, true, true, true], painelAtual: 0, tema: 'dia', brilho: 100, brilhoNoite: 40, som: true, telaInicial: 'painel', nomesAjuste: ['', '', ''] };

let prefs: Prefs = DEFAULT;
try { prefs = { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* sem armazenamento: usa o padrão */ }
const listeners = new Set<() => void>();

export function setPrefs(p: Partial<Prefs>) {
  prefs = { ...prefs, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignora */ }
  listeners.forEach((l) => l());
}
export function usePrefs(): Prefs {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => prefs);
}

/** Pressão em kPa (relativa ou absoluta) para a unidade escolhida. */
export const pressure = (kpa: number, unit: Prefs['pressure']) => (unit === 'psi' ? kpa * 0.145038 : unit === 'kPa' ? kpa : kpa / 100);
/** Casas decimais e faixa de mostrador (dada em bar) para a unidade de pressão escolhida. */
export const pressDigits = (unit: Prefs['pressure'], barDigits: number) => (unit === 'bar' ? barDigits : unit === 'psi' ? Math.max(0, barDigits - 1) : 0);
export const pressRange = (bar: number, unit: Prefs['pressure']) => (unit === 'bar' ? bar : unit === 'psi' ? Math.round(bar * 14.5038) : bar * 100);

/** AFR estequiométrico de cada opção de mistura (lambda = 1). */
export function estequiometrica(p: Pick<Prefs, 'lambda' | 'estequiometrica'>) {
  return { lambda: 1, afrMapa: p.estequiometrica || 14.7, afr: 14.7, afrE100: 9.0, afrMetanol: 6.4 }[p.lambda] ?? 1;
}
/** Lambda para a unidade escolhida (lambda ou AFR do combustível escolhido). */
export const lambdaOut = (l: number, unit: Prefs['lambda'], p?: Pick<Prefs, 'estequiometrica'>) => l * estequiometrica({ lambda: unit, estequiometrica: p?.estequiometrica ?? 14.7 });
export const lambdaUnit = (unit: Prefs['lambda']) => (unit === 'lambda' ? 'λ' : 'AFR');

/** Temperatura em °C para a unidade escolhida. */
export const tempOut = (c: number, unit: Prefs['temp']) => (unit === 'F' ? c * 1.8 + 32 : c);
export const tempUnit = (unit: Prefs['temp']) => (unit === 'F' ? '°F' : '°C');
/** Velocidade em km/h para a unidade escolhida. */
export const speedOut = (kmh: number, unit: Prefs['speed']) => (unit === 'mph' ? kmh / 1.609344 : kmh);
export const speedUnit = (unit: Prefs['speed']) => (unit === 'mph' ? 'mph' : 'km/h');

/** Fluxo: de cc/min (como a ECU guarda a vazão dos bicos) para a unidade escolhida. Gasolina ~0,74 g/cc para lb/h e g/s. */
const FLUXO: Record<FluxoUn, [number, string]> = {
  ccmin: [1, 'cc/min'], Lmin: [1 / 1000, 'L/min'], Lh: [60 / 1000, 'L/h'], gpm: [1 / 3785.41, 'GPM'], gph: [60 / 3785.41, 'GPH'],
  lbh: [(0.74 * 60) / 453.592, 'lb/h'], gs: [0.74 / 60, 'g/s'],
};
export const flowOut = (ccmin: number, unit: FluxoUn) => ccmin * FLUXO[unit][0];
export const flowUnit = (unit: FluxoUn) => FLUXO[unit][1];
/** Volume do motor: de litros para a unidade escolhida. */
export const engineVolOut = (l: number, unit: Prefs['engineVol']) => (unit === 'cc' ? l * 1000 : unit === 'in3' ? l * 61.0237 : l);
export const engineVolUnit = (unit: Prefs['engineVol']) => ({ cc: 'cm³', L: 'L', in3: 'in³' }[unit]);
/** Distância: de km para a unidade escolhida. */
export const distOut = (km: number, unit: Prefs['distance']) => ({ km, m: km * 1000, mi: km / 1.609344, ft: km * 3280.84 }[unit]);
export const distUnit = (unit: Prefs['distance']) => unit;
