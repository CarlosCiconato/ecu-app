// Preferências da tela (ficam neste computador/tablet, não na ECU).
import { useSyncExternalStore } from 'react';
import type { Screen } from './App';

export interface Prefs {
  pressure: 'bar' | 'psi';
  lambda: 'lambda' | 'afr';
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
const DEFAULT: Prefs = { pressure: 'bar', lambda: 'lambda', maxRpm: 9000, shiftRpm: 7500, favorites: ['mapa', 'ignicao', 'f_accel', 'f_partida', 'f_lenta', 'outras', 'f_sdlog', 'alertas'],
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
export const pressure = (kpa: number, unit: Prefs['pressure']) => (unit === 'psi' ? kpa * 0.145038 : kpa / 100);
/** Lambda para a unidade escolhida (AFR da gasolina, 14,7). */
export const lambdaOut = (l: number, unit: Prefs['lambda']) => (unit === 'afr' ? l * 14.7 : l);
