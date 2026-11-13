import { useEffect, useState } from 'react';
import { useLive, useStatus } from './api';
import { fmt } from './format';
import { pressDigits, pressure, tempOut, tempUnit, usePrefs } from './prefs';
import { Conexao } from './screens/Conexao';
import { Painel } from './screens/Painel';
import { MapaIgnicao, MapaInjecao, MapaTabela, TABELAS } from './screens/MapaInjecao';
import { Alertas } from './screens/Alertas';
import { Ajustes } from './screens/Ajustes';
import { ArquivoFtm } from './screens/ArquivoFtm';
import { MapaPadrao } from './screens/MapaPadrao';
import { ConfigMotor, SinalRpm, FORMS, OutrasFuncoes, Turbo } from './screens/Configuracoes';
import { Formulario } from './screens/Formulario';
import { Senhas } from './screens/Senhas';
import { Diagnostico } from './screens/Diagnostico';
import { Favoritos } from './screens/Favoritos';
import { PainelCfg, TelaSom, Unidades, Versao } from './screens/ConfigInterface';
import { Curva, CURVAS } from './screens/Curva';
import { SubMenu, SUBMENUS } from './screens/SubMenu';
import { CurvaIniTela, DialogoIniTela, ROTULOS_INI, TabelaIni, TabelasEcu } from './screens/TabelasEcu';
import { CalibracaoIni } from './screens/Calibracao';
import { Menu } from './screens/Menu';
import { Ltft } from './screens/Ltft';
import { Testes } from './screens/Testes';
import { Desktop } from './Desktop';
import { Datalogger } from './screens/Datalogger';
import { Inicio } from './screens/Inicio';
import { Tema, aplicarTema } from './screens/Tema';

/** No Mac/PC (janela do app) usa o layout de computador, no estilo dos programas profissionais. */
export const isDesktop = new URLSearchParams(location.search).has('desktop');
/** Modo painel: tela de 7" no carro (Raspberry Pi), tela cheia por toque, liga sozinho na ECU. */
export const isPainel = new URLSearchParams(location.search).has('painel');
if (new URLSearchParams(location.search).has('semcursor')) document.documentElement.classList.add('sem-cursor');

export type Screen = 'conexao' | 'menu' | 'painel' | 'mapa' | 'ignicao' | 'alertas' | 'ajustes' | 'motor' | 'outras' | 'sensores' | 'diagnostico' | 'favoritos' | 'interface' | 'telaSom' | 'painelCfg' | 'versao' | 'menuInjecao' | 'menuIgnicao' | 'menuOutras' | 'turbo' | 'senhas' | 'menuInterface' | 'ftm' | 'mapaPadrao' | 'ltft' | 'testes' | 'sinalRpm' | 'inicio' | 'datalogger' | 'tema' | 'tabelasEcu' | `menu${string}` | `c_${string}` | `t_${string}` | `f_${string}` | `d_${string}` | `k_${string}`;
export const TITLES: Record<string, string> = {
  conexao: 'Conexão com a ECU', menu: 'Menu principal', painel: 'Painel de instrumentos', mapa: 'Mapa principal de injeção', ignicao: 'Mapa principal de ignição', alertas: 'Alertas', ajustes: 'Gerenciador de ajustes', motor: 'Características do motor', sinalRpm: 'Sinal de RPM', outras: 'Corte de rotação e largada', sensores: 'Sensores e calibração', diagnostico: 'Diagnóstico', favoritos: 'Favoritos', turbo: 'Controle de turbo', senhas: 'Senhas', interface: 'Unidades de medida', telaSom: 'Tela, som e tela inicial', painelCfg: 'Configuração do painel', versao: 'Versões, odômetro e horímetro', ftm: 'Mapas (.ftm)', mapaPadrao: 'Mapa padrão', ltft: 'Correção de longo prazo', tabelasEcu: 'Funções da ECU', testes: 'Teste de saídas', inicio: 'Tela inicial', datalogger: 'Datalogger', tema: 'Tema do programa',
};

function useFit() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const f = () => setScale(Math.min(window.innerWidth / 1024, window.innerHeight / 600));
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return scale;
}

export function stateColor(state: string) {
  return state === 'conectado' ? 'var(--green)' : state === 'erro' ? 'var(--red)' : state === 'desconectado' ? '#5a5e66' : 'var(--yellow)';
}

export function screenTitle(screen: Screen): string {
  return TITLES[screen] ?? SUBMENUS[screen]?.title ?? (/^[tcdk]_ini_/.test(screen) ? ROTULOS_INI[screen] ?? screen.slice(6) : screen.startsWith('t_') ? TABELAS[screen.slice(2)]?.title : screen.startsWith('f_') ? FORMS[screen.slice(2)]?.title : CURVAS[screen.slice(2)]?.title) ?? screen;
}

function TopBar({ screen, go }: { screen: Screen; go: (s: Screen) => void }) {
  const s = useStatus();
  const v = useLive(['RPMValue', 'MAPValue', 'baroPressure', 'coolant', 'tuneInUse']);
  const p = usePrefs();
  const boost = v.MAPValue != null && v.baroPressure != null ? pressure(v.MAPValue - v.baroPressure, p.pressure) : null;
  return (
    <header className="topbar">
      {screen !== 'menu' && screen !== 'conexao' && (
        <button className="btn" onClick={() => go(parentOf(screen))} aria-label="Voltar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>{parentOf(screen) === 'menu' ? 'Menu' : 'Voltar'}
        </button>
      )}
      <button className="btn" onClick={() => go('conexao')} aria-label="Conexão" style={{ padding: '0 12px' }}>
        <span className="dot" style={{ background: stateColor(s.bridgeUp ? s.state : 'erro') }} />
      </button>
      <span className="title">{screenTitle(screen)}</span>
      {s.demo && <span className="sub" style={{ color: 'var(--amber)', fontWeight: 700 }}>DEMO</span>}
      {s.state === 'conectado' && <span className="sub">Ajuste {Math.max(1, v.tuneInUse ?? 1)}{p.nomesAjuste?.[Math.max(1, v.tuneInUse ?? 1) - 1] ? ` · ${p.nomesAjuste[Math.max(1, v.tuneInUse ?? 1) - 1]}` : ''}</span>}
      <span className="spacer" />
      {s.state === 'conectado' && (
        <div className="quick">
          <span><span>RPM</span>{fmt(v.RPMValue)}</span>
          <span><span>Turbo</span>{fmt(boost, pressDigits(p.pressure, 2))} {p.pressure}</span>
          <span><span>Motor</span>{fmt(v.coolant != null ? tempOut(v.coolant, p.temp) : null)} {tempUnit(p.temp)}</span>
        </div>
      )}
    </header>
  );
}

/** Bipe quando um alerta novo dispara (manual de referência 23.5). */
export function BipeAlerta({ on }: { on: boolean }) {
  const v = useLive(['alertActiveMask']);
  const [last, setLast] = useState(0);
  const mask = v.alertActiveMask ?? 0;
  useEffect(() => {
    if (on && (mask & ~last)) {
      try {
        const ctx = new AudioContext();
        const o = ctx.createOscillator(); o.frequency.value = 2400; o.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.35); o.onended = () => ctx.close();
      } catch { /* sem som neste aparelho */ }
    }
    setLast(mask);
  }, [mask]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Tela de cima: o submenu que tem esta tela, senão o menu principal. */
function parentOf(screen: Screen): Screen {
  if (screen.startsWith('c_alert')) return 'alertas';
  if (screen === 'ftm' || screen === 'mapaPadrao') return 'ajustes';
  return (Object.entries(SUBMENUS).find(([, m]) => m.items.some((i) => i.go === screen))?.[0] as Screen) ?? 'menu';
}

export function ScreenView({ screen, go: setScreen }: { screen: Screen; go: (s: Screen) => void }) {
  return (
    <>
      {screen === 'conexao' && <Conexao />}
      {screen === 'inicio' && <Inicio go={setScreen} />}
      {screen === 'datalogger' && <Datalogger />}
      {screen === 'tema' && <Tema />}
      {screen === 'menu' && <Menu go={setScreen} />}
      {screen === 'painel' && <Painel go={setScreen} />}
      {screen === 'mapa' && <MapaInjecao />}
      {screen === 'ignicao' && <MapaIgnicao />}
      {screen === 'alertas' && <Alertas go={setScreen} />}
      {screen === 'ajustes' && <Ajustes go={setScreen} />}
      {screen === 'ftm' && <ArquivoFtm />}
      {screen === 'mapaPadrao' && <MapaPadrao go={setScreen} />}
      {screen === 'motor' && <ConfigMotor />}
      {screen === 'sinalRpm' && <SinalRpm />}
      {screen === 'outras' && <OutrasFuncoes />}
      {screen === 'diagnostico' && <Diagnostico />}
      {screen === 'favoritos' && <Favoritos go={setScreen} />}
      {screen === 'interface' && <Unidades />}
      {screen === 'telaSom' && <TelaSom />}
      {screen === 'painelCfg' && <PainelCfg />}
      {screen === 'versao' && <Versao />}
      {screen === 'turbo' && <Turbo />}
      {screen === 'senhas' && <Senhas />}
      {screen === 'ltft' && <Ltft />}
      {screen === 'testes' && <Testes />}
      {screen.startsWith('f_') && FORMS[screen.slice(2)] && <Formulario key={screen} sections={FORMS[screen.slice(2)].sections} />}
      {screen.startsWith('t_') && TABELAS[screen.slice(2)] && <MapaTabela key={screen} cfg={TABELAS[screen.slice(2)]} />}
      {screen === 'tabelasEcu' && <TabelasEcu go={setScreen} />}
      {screen.startsWith('t_ini_') && <TabelaIni key={screen} nome={screen.slice(6)} Editor={MapaTabela} />}
      {screen.startsWith('d_ini_') && <DialogoIniTela key={screen} id={screen.slice(6)} go={setScreen} />}
      {screen.startsWith('c_ini_') && <CurvaIniTela key={screen} id={screen.slice(6)} />}
      {screen.startsWith('k_ini_') && <CalibracaoIni key={screen} id={screen.slice(6)} />}
      {SUBMENUS[screen] && <SubMenu id={screen} go={setScreen} />}
      {screen.startsWith('c_') && !screen.startsWith('c_ini_') && CURVAS[screen.slice(2)] && <Curva key={screen} id={screen.slice(2)} />}
    </>
  );
}

/** Uma função sozinha em outra janela (botão "abrir em outra janela" das abas). */
function Solo() {
  const [screen, setScreen] = useState<Screen>(() => (new URLSearchParams(location.search).get('tela') as Screen) || 'painel');
  useEffect(() => { document.title = screenTitle(screen); }, [screen]);
  return <div className="dk"><div className="dk-screen" style={{ flex: 1 }}><ScreenView screen={screen} go={setScreen} /></div></div>;
}

export function App() {
  if (isDesktop) aplicarTema();
  if (isDesktop && new URLSearchParams(location.search).has('solo')) return <Solo />;
  if (isDesktop) return <Desktop />;

  const scale = useFit();
  const s = useStatus();
  const [screen, setScreen] = useState<Screen>(() => (new URLSearchParams(location.search).get('tela') as Screen) || 'conexao');
  const prefs = usePrefs();
  // Luz de fundo como nos módulos profissionais: modo dia e modo noite são só dois níveis de brilho.
  const luz = prefs.tema === 'noite' ? prefs.brilhoNoite : prefs.brilho;
  // Ao conectar pela primeira vez, vai para a tela inicial escolhida (Configuração da interface).
  const [wasConnected, setWas] = useState(false);
  useEffect(() => {
    if (s.state === 'conectado' && !wasConnected) { setWas(true); if (screen === 'conexao') setScreen(prefs.telaInicial); }
    if (s.state !== 'conectado') setWas(false);
  }, [s.state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
      <BipeAlerta on={prefs.som} />
      {screen !== 'painel' && <TopBar screen={screen} go={setScreen} />}
      <ScreenView screen={screen} go={setScreen} />
      {luz < 100 && <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: (100 - luz) / 100, pointerEvents: 'none', zIndex: 50 }} />}
    </div>
  );
}
