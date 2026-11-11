// Quais telas a ECU conectada tem. A nossa ECU tem todas; uma Speeduino ou outra rusEFI só vê as
// telas cujos campos existem no .ini dela (a ponte traduz os nomes, ver core/traducao.ts).
import { useSyncExternalStore } from 'react';
import { call, useStatus } from './api';
import type { Screen } from './App';
import { TABELAS } from './screens/MapaInjecao';
import { CURVAS } from './screens/Curva';
import { FORMS } from './screens/Configuracoes';
import { SUBMENUS } from './screens/SubMenu';

/** Telas que não dependem de campos do .ini (configuração do próprio app). */
const SEMPRE = new Set<string>(['inicio', 'conexao', 'menu', 'painel', 'datalogger', 'favoritos', 'telaSom', 'painelCfg', 'interface', 'versao', 'tema', 'menuInterface']);
/** Telas especiais e o campo que precisam existir. */
const ESPECIAIS: Record<string, string> = {
  mapa: 'injTimeTableTbl', ignicao: 'ignitionTableTbl', ltft: 'ltftBank1InjTimeTbl', alertas: 'alertSensor1', senhas: 'pinUser',
  motor: 'firingOrder', sinalRpm: 'trigger_type', outras: 'rpmHardLimit', turbo: 'isBoostControlEnabled', testes: 'cmd_test_inj1',
  diagnostico: 'totalTriggerErrorCounter', ajustes: 'injTimeTable', ftm: 'injTimeTable', mapaPadrao: 'injTimeTable', tabelasEcu: '__speeduino',
};

function nomes(go: string): string[] {
  if (go.startsWith('t_')) return TABELAS[go.slice(2)] ? [TABELAS[go.slice(2)].tables[0]] : [];
  if (go.startsWith('c_')) return CURVAS[go.slice(2)] ? [CURVAS[go.slice(2)].y] : [];
  if (go.startsWith('f_')) return FORMS[go.slice(2)]?.sections[0]?.fields.slice(0, 1).map((f) => f.name) ?? [];
  return ESPECIAIS[go] ? [ESPECIAIS[go]] : [];
}

let tem: Record<string, boolean> = {};
let chave = '';
const ouvintes = new Set<() => void>();
function atualizar(sig: string) {
  if (sig === chave) return;
  chave = sig;
  const todos = new Set<string>();
  for (const m of Object.values(SUBMENUS)) for (const i of m.items) nomes(i.go).forEach((n) => todos.add(n));
  Object.keys(ESPECIAIS).forEach((g) => nomes(g).forEach((n) => todos.add(n)));
  call<Record<string, boolean>>('existe', { names: [...todos] }).then((r) => { tem = r; ouvintes.forEach((l) => l()); }, () => { chave = ''; });
}

/** ok(tela) = a ECU conectada tem essa tela. Sem ECU ou com a nossa ECU: tudo aparece. */
export function useDisponivel(): (go: Screen | string) => boolean {
  const s = useStatus();
  useSyncExternalStore((l) => { ouvintes.add(l); return () => ouvintes.delete(l); }, () => tem);
  const outra = s.state === 'conectado' && !s.demo && !s.offline && !!s.family && s.family !== 'rusefi';
  if (s.state === 'conectado' && s.bridgeUp) atualizar(`${s.iniSignature}|${s.family}`);
  const ok = (go: string, prof = 0): boolean => {
    if (go === 'tabelasEcu') return outra;
    if (!outra || SEMPRE.has(go)) return true;
    if (SUBMENUS[go]) return prof < 3 && SUBMENUS[go].items.some((i) => ok(i.go, prof + 1));
    const n = nomes(go);
    if (!n.length) return false; // tela especial da nossa ECU sem campo conhecido
    return n.every((x) => tem[x]);
  };
  return ok;
}
