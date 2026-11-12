// Layout de computador (Mac/PC), no estilo dos programas profissionais para computador (manual de referência, p. 51-52):
// barra superior, barra lateral de grupos, submenu de funções, abas, área de ajuste,
// painel em tempo real embaixo e barra de status.
import { useEffect, useMemo, useRef, useState } from 'react';
import { openFtmLater } from './screens/ArquivoFtm';
import { lembrarMapa } from './screens/Inicio';
import { call, isRecording, startLog, stopLog, useLive, useLog, useStatus } from './api';
import { LOG_CH } from './screens/Datalogger';
import { fmt } from './format';
import { usePrefs } from './prefs';
import { BipeAlerta, screenTitle, ScreenView, stateColor, type Screen } from './App';
import { TILES, TILE_TABELAS_ECU } from './screens/Menu';
import { useDisponivel } from './disponivel';
import { SUBMENUS } from './screens/SubMenu';
import { GAUGES } from './screens/Painel';

type Group = { id: Screen; name: string; icon: string };
const GROUPS: Group[] = [
  { id: 'inicio', name: 'Tela inicial', icon: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10' },
  { id: 'conexao', name: 'Conexão', icon: 'M7 7h10v6a5 5 0 0 1-10 0zM10 3v4M14 3v4M12 18v3' },
  { id: TILE_TABELAS_ECU.go, name: TILE_TABELAS_ECU.name, icon: TILE_TABELAS_ECU.icon }, // só aparece com Speeduino ou outra ECU
  ...TILES.filter((t) => t.go).flatMap((t) => [{ id: t.go as Screen, name: t.name, icon: t.icon },
    ...(t.go === 'painel' ? [{ id: 'datalogger' as Screen, name: 'Datalogger', icon: 'M3 3v18h18M7 15l3-4 3 3 5-7' }] : [])]),
];

const LIVE_KEYS = ['rpm', 'boost', 'lambda', 'inj', 'duty', 'adv', 'clt', 'iat', 'tps', 'batt', 'oil'];
const LIVE_ALL = ['rpm', ...Object.keys(GAUGES)];
const liveName = (k: string) => (k === 'rpm' ? 'RPM' : GAUGES[k]?.name ?? k);

/** Campo que liga/desliga cada função (referência: função ativa em branco, desligada em cinza). on = valor para ligar; sem on = é um pino (escolher na tela). */
const ATIVA: Record<string, { field: string; on?: number }> = {};
const regra = (gos: string[], field: string, on?: number) => gos.forEach((g) => (ATIVA[g] = { field, on }));
regra(['f_sdlog'], 'isSdCardEnabled', 1);
regra(['f_desaceleracao'], 'coastingFuelCutEnabled', 1);
regra(['outras'], 'launchControlEnabled', 1);
regra(['f_ventoinhas'], 'fanPin');
regra(['f_arCondicionado'], 'acRelayPin');
regra(['f_bomba'], 'fuelPumpPin');
regra(['f_partidaFrio', 'c_coldStartPulse'], 'coldStartInjectorPin');
regra(['f_contagiros'], 'tachOutputPin');
regra(['f_shiftLight'], 'shiftLightPin');
regra(['turbo', 't_boostOpen', 't_boostClosed', 't_boostShift', 'f_turboExtra', 'c_boostEthanol'], 'isBoostControlEnabled', 1);
regra(['f_antilag', 't_alsPonto', 't_alsComb', 't_alsCorte'], 'antiLagEnabled', 1);
regra(['f_wmi'], 'wmiGppwmChannel');
regra(['f_botaoPartida'], 'startStopButtonPin');
regra(['f_vvt', 't_vvt'], 'vvtPins1');
regra(['f_etb', 'c_etbOpen', 'c_etbClose'], 'etbFunctions1', 1);
regra(['f_malha', 'c_stftAdd', 'c_stftRemove'], 'fuelClosedLoopCorrectionEnabled', 1);
regra(['f_knock'], 'enableSoftwareKnock', 1);
regra(['f_nitro'], 'nitrousControlEnabled', 1);
regra(['f_trocaRapida'], 'torqueReductionEnabled', 1);
regra(['f_wastegateEletronica'], 'etbFunctions2', 4);
regra(['f_sensVel'], 'vehicleSpeedSensorInputPin');
regra(['f_pedal'], 'throttlePedalPositionAdcChannel');
regra(['f_sensPressao', 'c_oilCurve'], 'oilPressure_hwChannel');
regra(['c_fuelCurve'], 'lowPressureFuel_hwChannel');
regra(['f_sensOutros'], 'flexSensorPin');
const ATIVA_CAMPOS = [...new Set(Object.values(ATIVA).map((r) => r.field))];

const STATE_TEXT: Record<string, string> = {
  desconectado: 'Desconectado', conectando: 'Conectando…', lendo: 'Lendo a configuração…', conectado: 'Conectado', erro: 'Erro',
};

function load<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function save(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } }

const Icon = ({ d, size = 20 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

/** Todas as funções que dá para abrir (para a busca da barra superior). */
function allFunctions(): { go: Screen; label: string; where: string }[] {
  const out: { go: Screen; label: string; where: string }[] = [];
  for (const g of GROUPS) {
    if (!SUBMENUS[g.id]) out.push({ go: g.id, label: g.name, where: '' });
  }
  for (const [, m] of Object.entries(SUBMENUS)) for (const i of m.items) if (!SUBMENUS[i.go]) out.push({ go: i.go, label: i.label, where: m.title });
  return out.filter((x, i, a) => a.findIndex((y) => y.go === x.go) === i);
}

export function Desktop() {
  const s = useStatus();
  const ok = useDisponivel();
  const [names, setNames] = useState(() => load('dk.menuAberto', false));
  const [subOpen, setSubOpen] = useState(() => load('dk.submenu', true));
  const [drop, setDrop] = useState<string>(); // menu aberto da barra superior
  const log = useLog();
  const prefs = usePrefs();
  const tune = useLive(['tuneInUse']).tuneInUse ?? 1;
  const [group, setGroup] = useState<Screen>('inicio');
  const [stack, setStack] = useState<Screen[]>([]); // submenus abertos dentro do grupo
  const [tabs, setTabs] = useState<Screen[]>(['inicio']);
  const [active, setActive] = useState<Screen>('inicio');
  const [query, setQuery] = useState('');
  const [liveOpen, setLiveOpen] = useState(() => load('dk.aovivo', true));
  const funcs = useMemo(allFunctions, []);

  const openTab = (sc: Screen) => {
    setTabs((t) => (t.includes(sc) ? t : [...t, sc]));
    setActive(sc);
  };
  // Speeduino ou outra ECU: ao conectar, abre direto a tela com todas as funções dela.
  const outraEcu = s.state === 'conectado' && !s.demo && !s.offline && !!s.family && s.family !== 'rusefi';
  useEffect(() => { if (outraEcu) { setGroup('tabelasEcu'); setStack([]); openTab('tabelasEcu'); } }, [outraEcu]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (sc: Screen) => {
    if (SUBMENUS[sc]) {
      if (GROUPS.some((g) => g.id === sc)) { setGroup(sc); setStack([]); } else setStack((st) => [...st, sc]);
      return;
    }
    openTab(sc);
  };
  const pickGroup = (g: Group) => {
    setGroup(g.id); setStack([]);
    if (SUBMENUS[g.id] && !subOpen) { setSubOpen(true); save('dk.submenu', true); }
    if (!SUBMENUS[g.id]) openTab(g.id);
  };
  const closeTab = (sc: Screen) => {
    const i = tabs.indexOf(sc);
    const next = tabs.filter((t) => t !== sc);
    setTabs(next);
    if (active === sc) setActive(next[Math.min(i, next.length - 1)] ?? ('' as Screen));
  };

  const menuId = stack[stack.length - 1] ?? group;
  const menu = SUBMENUS[menuId];
  const groupName = GROUPS.find((g) => g.id === group)?.name ?? '';
  const results = query.trim().length >= 2
    ? funcs.filter((f) => (f.label + ' ' + f.where).toLowerCase().includes(query.trim().toLowerCase())).slice(0, 12) : [];

  const run = (op: string) => call(op).catch((e) => alert((e as Error).message));
  const burn = () => run('burn');
  const undo = () => run('undo');
  const cancel = () => { if (confirm('Cancelar todas as mudanças que ainda não foram gravadas na ECU?')) void run('cancel'); };
  const on = s.state === 'conectado';
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      // manual de referência 6.5: Ctrl+Tab troca de função aberta, Ctrl+W fecha a atual
      if (e.ctrlKey && k === 'tab' && tabs.length) {
        e.preventDefault();
        const i = tabs.indexOf(active), n = tabs.length;
        setActive(tabs[((i < 0 ? 0 : i) + (e.shiftKey ? n - 1 : 1)) % n]);
        return;
      }
      if (e.ctrlKey && k === 'w') { e.preventDefault(); if (active) closeTab(active); return; }
      if (k === 's') { e.preventDefault(); if (on && s.dirty) void burn(); }
      else if (k === 'z' && !e.shiftKey) { e.preventDefault(); if (on && s.undo) void undo(); }
      else if (k === 'o') { e.preventDefault(); fileRef.current?.click(); }
    };
    const close = () => { setDrop(undefined); setItemMenu(undefined); };
    window.addEventListener('keydown', h);
    window.addEventListener('click', close);
    return () => { window.removeEventListener('keydown', h); window.removeEventListener('click', close); };
  });
  const TOOLS: [Screen, string][] = [['ajustes', 'Gerenciador de ajustes'], ['mapaPadrao', 'Gerar mapa padrão'], ['ftm', 'Importar mapa .ftm (.ftm)'], ['ltft', 'Correção de longo prazo'], ['testes', 'Teste de saídas'], ['diagnostico', 'Diagnóstico'], ['senhas', 'Senhas']];
  const PREFS: [Screen, string][] = [['tema', 'Tema do programa (cores)'], ['interface', 'Unidades de medida'], ['telaSom', 'Tela, som e tela inicial'], ['painelCfg', 'Configuração do painel'], ['versao', 'Versões, odômetro e horímetro']];
  const Tb = ({ icon, label, onClick, disabled, hot, title }: { icon: string; label: string; onClick: () => void; disabled?: boolean; hot?: boolean; title?: string }) => (
    <button className={`dk-tb ${hot ? 'hot' : ''}`} disabled={disabled} title={title ?? label} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <Icon d={icon} size={18} /><span>{label}</span>
    </button>
  );
  const Drop = ({ id, icon, label, items }: { id: string; icon: string; label: string; items: [Screen, string][] }) => (
    <div style={{ position: 'relative' }}>
      <Tb icon={icon} label={`${label} ▾`} onClick={() => setDrop(drop === id ? undefined : id)} />
      {drop === id && (
        <div className="ctx" style={{ position: 'absolute', top: 50, left: 0 }}>
          {items.map(([sc, l]) => <button key={sc} onClick={() => { setDrop(undefined); openTab(sc); }}><span>{l}</span></button>)}
        </div>
      )}
    </div>
  );
  const tuneName = prefs.nomesAjuste?.[Math.max(1, tune) - 1];
  // funções ligadas/desligadas no mapa
  const [ativos, setAtivos] = useState<Record<string, number | null>>({});
  const [soAtivas, setSoAtivas] = useState(() => load('dk.soAtivas', false));
  const [busca, setBusca] = useState('');
  const [itemMenu, setItemMenu] = useState<{ x: number; y: number; go: Screen }>();
  const [aviso, setAviso] = useState<string>();
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(undefined), 6000); return () => clearTimeout(t); }, [aviso]);
  const lerAtivos = () => { if (on) call<Record<string, number | null>>('constants', { names: ATIVA_CAMPOS }).then(setAtivos, () => undefined); };
  useEffect(lerAtivos, [s.state, s.rev, s.undo]); // eslint-disable-line react-hooks/exhaustive-deps
  const ativa = (go: string) => { const r = ATIVA[go]; if (!r || !on) return true; const v = ativos[r.field]; return v == null || v !== 0; };
  async function ligar(go: Screen, liga: boolean) {
    const r = ATIVA[go];
    if (!r) return;
    try {
      if (liga && r.on === undefined) { openTab(go); setAviso('Para ligar esta função, escolha a saída (pino) dela nesta tela.'); return; }
      await call('setValue', { name: r.field, value: liga ? r.on! : 0 });
      lerAtivos();
    } catch (e) { alert((e as Error).message); }
  }
  const [ask, setAsk] = useState<{ title: string; value: string; ok: (v: string) => void }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const saveAs = () => setAsk({ title: 'Salvar o mapa como', value: tuneName || 'Meu mapa', ok: (v) => {
    call<string>('mapSave', { name: v }).then((n) => { lembrarMapa(n, 'Documentos/ECU Arquivos/Mapas'); alert(`Mapa salvo em ECU Arquivos/Mapas/${n}`); }, (e) => alert(e.message));
  } });
  async function openFile(f?: File) {
    if (!f) return;
    const data = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] ?? ''); r.readAsDataURL(f); });
    if (/\.ftm$/i.test(f.name)) { openFtmLater({ name: f.name, data }); openTab('ftm'); return; }
    try { await call('mapLoad', { data, name: f.name }); lembrarMapa(f.name, 'arquivo escolhido no computador'); openTab('mapa'); } catch (e) { alert((e as Error).message); }
  }

  return (
    <div className="dk">
      <BipeAlerta on={usePrefs().som} />
      {/* 2 - Barra superior */}
      <header className="dk-top">
        <span className="dk-logo">ECU</span>
        <Tb icon="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10" label="Início" onClick={() => openTab('inicio')} />
        <div className="dk-grp"><small>Mapa</small><div>
        <Tb icon="M4 6h6l2 2h8v11H4z" label="Abrir" title="Abrir mapa .ecumap ou .ftm (⌘O)" onClick={() => fileRef.current?.click()} />
        <input ref={fileRef} type="file" accept=".ecumap,.ftm" hidden onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = ''; }} />
        <button className="dk-map" title="Ajuste em uso na ECU" onClick={(e) => { e.stopPropagation(); openTab('ajustes'); }}>
          <small>Mapa aberto</small>
          <span>{s.offline ? s.offline.replace(/\.ecumap$/i, '') : on ? `Ajuste ${Math.max(1, tune)}${tuneName ? ` · ${tuneName}` : ''}` : 'Nenhum'}{s.dirty ? ' •' : ''}</span>
        </button>
        <Tb icon="M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7" label="Salvar" title={s.offline ? 'Salvar no arquivo do mapa (⌘S)' : 'Gravar as mudanças na ECU (⌘S)'} disabled={!on || !s.dirty} hot={s.dirty} onClick={burn} />
        <Tb icon="M5 3h11l3 3v6M8 3v6h8M5 3v18h7M15 21l6-6-2-2-6 6v2z" label="Salvar como" title="Salvar o mapa num arquivo (.ecumap)" disabled={!on} onClick={saveAs} />
        <Tb icon="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" label="Desfazer" title={`Desfazer a última mudança (⌘Z)${s.undo ? ` · ${s.undo} na lista` : ''}`} disabled={!on || !s.undo} onClick={undo} />
        <Tb icon="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8" label="Cancelar" title="Voltar ao que está gravado na ECU" disabled={!on || !s.dirty} onClick={cancel} />
        </div></div>
        <span className="dk-sep" />
        <div className="dk-grp"><small>ECU</small><div>
        <Tb icon="M7 7h10v6a5 5 0 0 1-10 0zM10 3v4M14 3v4M12 18v3" label={on && !s.offline ? 'Conectado' : 'Conectar'} title="Conexão com a ECU" hot={false} onClick={() => openTab('conexao')} />
        </div></div>
        <span className="dk-sep" />
        <div className="dk-grp"><small>Log</small><div>
        <Tb icon="M3 3v18h18M7 15l3-4 3 3 5-7" label="Datalogger" onClick={() => openTab('datalogger')} />
        <Tb icon={log?.recording ? 'M7 7h10v10H7z' : 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z'} label={log?.recording ? 'Parar log' : 'Gravar log'} disabled={(!on || !!s.offline) && !log?.recording}
          hot={!!log?.recording} onClick={() => (isRecording() ? stopLog() : startLog(LOG_CH.map((c) => c[0])))} />
        </div></div>
        <span className="dk-sep" />
        <Drop id="ferr" icon="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" label="Ferramentas" items={TOOLS} />
        <Drop id="pref" icon="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-1-3-2 .2-1.2-1.4.4-2-2.8-1.4L13 5h-2L9.6 3.4 6.8 4.8l.4 2L6 8.2 4 8 3 11l2 1-2 1 1 3 2-.2 1.2 1.4-.4 2 2.8 1.4L11 19h2l1.4 1.6 2.8-1.4-.4-2 1.2-1.4 2 .2 1-3z" label="Preferências" items={PREFS} />
        <span style={{ flexGrow: 1 }} />
        <div className="dk-search">
          <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" size={16} />
          <input placeholder="Buscar função" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { openTab(results[0].go); setQuery(''); } if (e.key === 'Escape') setQuery(''); }} />
          {results.length > 0 && (
            <div className="dk-results">
              {results.map((r) => (
                <button key={r.go} onClick={() => { openTab(r.go); setQuery(''); }}>
                  <span>{r.label}</span>{r.where && <small>{r.where}</small>}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="dk-body">
        {/* 3 - Barra lateral com os grupos */}
        <nav className={`dk-rail ${names ? 'wide' : ''}`}>
          {GROUPS.filter((g) => ok(g.id)).map((g) => (
            <button key={g.id} className={group === g.id ? 'on' : ''} onClick={() => pickGroup(g)} title={g.name}>
              <Icon d={g.icon} />{names && <span>{g.name}</span>}
            </button>
          ))}
          <span style={{ flexGrow: 1 }} />
          {/* 5 - Expandir menu */}
          <button onClick={() => { setNames(!names); save('dk.menuAberto', !names); }} title={names ? 'Recolher menu' : 'Expandir menu'}>
            <Icon d="M4 6h16M4 12h16M4 18h16" />{names && <span>Recolher menu</span>}
          </button>
        </nav>

        {/* Submenu do grupo */}
        {menu && !subOpen && (
          <button className="dk-subclosed" title="Mostrar o submenu" onClick={() => { setSubOpen(true); save('dk.submenu', true); }}>
            <Icon d="M9 6l6 6-6 6" size={16} /><span>{stack.length ? menu.title : groupName}</span>
          </button>
        )}
        {menu && subOpen && (
          <aside className="dk-sub">
            <div className="dk-subhead">
              {stack.length > 0 && <button className="dk-back" onClick={() => setStack(stack.slice(0, -1))} title="Voltar"><Icon d="M15 6l-6 6 6 6" size={16} /></button>}
              <span style={{ flex: 1 }}>{stack.length ? menu.title : groupName}</span>
              <button className="dk-back" title="Minimizar o submenu" onClick={() => { setSubOpen(false); save('dk.submenu', false); }}><Icon d="M15 6l-6 6 6 6M20 6v12" size={16} /></button>
            </div>
            <div className="dk-subtools">
              <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" size={14} />
              <input placeholder="Pesquisar" value={busca} onChange={(e) => setBusca(e.target.value)} />
              <button className={soAtivas ? 'on' : ''} title={soAtivas ? 'Mostrando só as funções ligadas' : 'Mostrar só as funções ligadas'}
                onClick={() => { setSoAtivas(!soAtivas); save('dk.soAtivas', !soAtivas); }}><Icon d="M3 5h18l-7 8v6l-4-2v-4z" size={15} /></button>
            </div>
            <div className="dk-sublist">
              {menu.items.filter((i) => ok(i.go) && (!soAtivas || ativa(i.go)) && (!busca || (i.label + ' ' + i.sub).toLowerCase().includes(busca.toLowerCase()))).map((i) => (
                <button key={i.go} className={`${active === i.go ? 'on' : ''} ${ativa(i.go) ? '' : 'off'}`} onClick={() => go(i.go)}
                  title={ATIVA[i.go] ? (ativa(i.go) ? 'Ligada neste mapa · botão direito para desligar' : 'Desligada neste mapa · botão direito para ligar') : undefined}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setItemMenu({ x: e.clientX, y: e.clientY, go: i.go }); }}>
                  <span>{i.label}{SUBMENUS[i.go] ? ' ›' : ''}</span>
                  {i.sub && <small>{i.sub}</small>}
                </button>
              ))}
            </div>
          </aside>
        )}

        <section className="dk-main">
          {/* 8 - Abas: só a aberta aparece; a lista mostra as outras, separadas por grupo */}
          <TabSwitcher tabs={tabs} active={active} setActive={setActive} closeTab={closeTab} />
          {/* 9 - Área da função */}
          <div className="dk-content">
            {active ? <div className="dk-screen" key={`${active}:${s.rev ?? 0}`}><ScreenView screen={active} go={go} /></div>
              : <div className="dk-empty">Escolha uma função na barra lateral.</div>}
          </div>
          {/* 10 - Painel em tempo real */}
          {active !== 'inicio' && <LivePanel screen={active} open={liveOpen} toggle={() => { setLiveOpen(!liveOpen); save('dk.aovivo', !liveOpen); }} />}
        </section>
      </div>

      {itemMenu && ATIVA[itemMenu.go] && (
        <div className="ctx onoff" style={{ left: itemMenu.x, top: itemMenu.y }} onClick={(e) => e.stopPropagation()} onMouseLeave={() => setItemMenu(undefined)}>
          <button disabled={!on} onClick={() => { void ligar(itemMenu.go, !ativa(itemMenu.go)); setItemMenu(undefined); }}>
            <span>On/Off</span><small>{ativa(itemMenu.go) ? 'ligada' : 'desligada'}</small>
          </button>
        </div>
      )}
      {aviso && <div className="dk-toast" onClick={() => setAviso(undefined)}>{aviso}</div>}
      {ask && (
        <div className="dk-modal" onClick={() => setAsk(undefined)}>
          <form className="card" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); const v = (new FormData(e.currentTarget).get('v') as string).trim(); setAsk(undefined); if (v) ask.ok(v); }}>
            <span className="label">{ask.title}</span>
            <input name="v" className="field" autoFocus defaultValue={ask.value} onFocus={(e) => e.currentTarget.select()} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setAsk(undefined)}>Cancelar</button>
              <button type="submit" className="btn primary">Salvar</button>
            </div>
          </form>
        </div>
      )}
      {/* 4 - Barra de status */}
      <StatusBar />
    </div>
  );
}

/** Painel em tempo real (área 10): cada função guarda os seus canais. */
function LivePanel({ screen, open, toggle }: { screen: Screen; open: boolean; toggle: () => void }) {
  const storeKey = `dk.live.${screen || 'geral'}`;
  const [keys, setKeysState] = useState<string[]>(() => load(storeKey, LIVE_KEYS));
  const [adding, setAdding] = useState(false);
  const [forScreen, setForScreen] = useState(storeKey);
  if (forScreen !== storeKey) { setForScreen(storeKey); setKeysState(load(storeKey, LIVE_KEYS)); }
  const setKeys = (k: string[]) => { setKeysState(k); save(storeKey, k); };
  const ch = open ? [...new Set(keys.flatMap((k) => (k === 'rpm' ? ['RPMValue'] : GAUGES[k]?.ch ?? [])))] : [];
  const v = useLive(ch);
  const p = usePrefs();
  const st = useStatus();
  const on = st.state === 'conectado' && !st.offline;
  return (
    <div className={`dk-live ${open ? '' : 'closed'}`}>
      <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
        <button className="dk-livehead" onClick={toggle}>Tempo real {open ? '▾' : '▸'}</button>
        {open && <button className="dk-livehead" onClick={(e) => { e.stopPropagation(); setAdding(!adding); }} title="Escolher canais deste painel">+ canal</button>}
        {open && <button className="dk-livehead" onClick={() => setKeys(LIVE_KEYS)} title="Voltar aos canais padrão">padrão</button>}
        {adding && (
          <div className="ctx" style={{ position: 'absolute', bottom: 26, left: 90, maxHeight: 320, overflow: 'auto' }} onMouseLeave={() => setAdding(false)}>
            {LIVE_ALL.filter((k) => !keys.includes(k)).map((k) => (
              <button key={k} onClick={() => { setKeys([...keys, k]); setAdding(false); }}><span>{liveName(k)}</span></button>
            ))}
          </div>
        )}
      </div>
      {open && (
        <div className="dk-livegrid">
          {keys.map((k) => {
            const g = k === 'rpm' ? { value: v.RPMValue, digits: 0, unit: '', warn: undefined } : GAUGES[k]?.make(v, p);
            if (!g) return null;
            const warn = on && g.value != null && g.warn?.(g.value);
            return (
              <div key={k} className={`dk-cell ${warn ? 'warn' : ''}`}>
                <small>{liveName(k)}</small>
                <button className="x" onClick={() => setKeys(keys.filter((x) => x !== k))} title="Tirar do painel">×</button>
                <b>{on ? fmt(g.value, g.digits) : '–'}<i>{g.unit}</i></b>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Situação no estilo do LED do módulo de referência (manual p. 50). */
function led(s: ReturnType<typeof useStatus>, logging: boolean, alerts: number): { color: string; blink?: string; text: string } {
  if (!s.bridgeUp) return { color: '#FF5A5F', text: 'Problema no app (sem ponte)' };
  if (s.state === 'erro') return { color: '#FF5A5F', text: s.signatureMatch === false ? 'Mapa inválido: .ini diferente do firmware' : 'Erro de conexão' };
  if (s.state === 'conectando' || s.state === 'lendo') return { color: '#FF9F1C', blink: '#4CC9F0', text: 'Conectando na ECU' };
  if (s.state !== 'conectado') return { color: '#5a5e66', text: 'Sem ECU' };
  if (s.offline) return { color: '#4CC9F0', text: 'Mapa aberto sem ECU (offline)' };
  if (alerts) return { color: '#FF5A5F', blink: '#000', text: 'Alerta ativo' };
  if (logging) return { color: '#3DDC84', blink: '#F2F2F0', text: 'Mapa carregado · gravando log' };
  return { color: '#F2F2F0', text: 'Mapa carregado · log parado' };
}

function StatusBar() {
  const s = useStatus();
  const v = useLive(['alertActiveMask']);
  let alerts = 0;
  for (let m = (v.alertActiveMask ?? 0) >>> 0; m; m &= m - 1) alerts++;
  const log = useLog();
  const logging = !!log?.recording;
  const l = led(s, logging, alerts);
  const tasks = [logging && `Gravando log (${log!.t.length} amostras)`, s.state === 'lendo' && `Lendo a configuração ${Math.round((s.progress ?? 0) * 100)}%`, s.state === 'conectando' && 'Conectando'].filter(Boolean);
  return (
    <footer className="dk-status">
      <span title={l.text} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className={`led ${l.blink ? 'blink' : ''}`} style={{ background: l.color, ['--b' as string]: l.blink }} />{l.text}
      </span>
      <span className={alerts ? 'bad' : ''}>⚠ {alerts} {alerts === 1 ? 'alerta' : 'alertas'}</span>
      {s.message && <span className={s.state === 'erro' ? 'bad' : ''}>{s.message}</span>}
      <span style={{ flexGrow: 1 }} />
      {s.dirty && <span className="warn">Mudanças ainda não gravadas na ECU</span>}
      <span title="Tarefas em segundo plano">⟳ {tasks.length ? tasks.join(' · ') : 'Nenhum processo em andamento'}</span>
      <span title="Firmware da ECU">{s.ecuSignature ?? s.iniSignature}</span>
    </footer>
  );
}

/** Grupo de cada tela (para separar e colorir a lista de abas, como nos programas profissionais). */
const GROUP_COLOR: Record<string, string> = {
  menuInjecao: '#4CC9F0', menuIgnicao: '#FF9F1C', datalogger: '#3DDC84', painel: '#FF5A5F', alertas: '#FF5A5F',
  menuMotor: '#C77DFF', menuSensores: '#C77DFF', menuOutras: '#7BDFF2', menuInterface: '#A3A7AE', menuDiag: '#F2F2F0',
};
const groupOf = (() => {
  const m = new Map<string, string>();
  const walk = (menu: string, g: string) => SUBMENUS[menu]?.items.forEach((i) => { if (!m.has(i.go)) { m.set(i.go, g); walk(i.go, g); } });
  for (const g of GROUPS) { m.set(g.id, g.id); walk(g.id, g.id); }
  return (sc: string) => m.get(sc) ?? 'outros';
})();

function TabSwitcher({ tabs, active, setActive, closeTab }: { tabs: Screen[]; active: Screen; setActive: (s: Screen) => void; closeTab: (s: Screen) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const c = () => setOpen(false);
    window.addEventListener('click', c);
    return () => window.removeEventListener('click', c);
  }, []);
  const groups: [string, Screen[]][] = [];
  for (const t of tabs) {
    const g = groupOf(t);
    const e = groups.find((x) => x[0] === g);
    if (e) e[1].push(t); else groups.push([g, [t]]);
  }
  const color = (sc: string) => GROUP_COLOR[groupOf(sc)] ?? '#A3A7AE';
  const popOut = (sc: Screen) => window.open(`${location.pathname}?desktop&solo&tela=${encodeURIComponent(sc)}`, '_blank', 'width=1100,height=750');
  const Pill = ({ sc, big }: { sc: Screen; big?: boolean }) => (
    <div className={`dk-pill ${big ? 'big' : ''} ${sc === active ? 'on' : ''}`} style={{ ['--c' as string]: color(sc) }}
      onClick={(e) => { e.stopPropagation(); setActive(sc); setOpen(false); }}>
      <span>{screenTitle(sc)}</span>
      <button title="Abrir em outra janela" onClick={(e) => { e.stopPropagation(); popOut(sc); }}><Icon d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" size={15} /></button>
      <button title="Fechar" onClick={(e) => { e.stopPropagation(); closeTab(sc); }}>×</button>
    </div>
  );
  return (
    <div className="dk-tabs">
      {active ? <Pill sc={active} big /> : <span style={{ color: 'var(--muted)', fontSize: 13, padding: '0 8px' }}>Nenhuma função aberta</span>}
      <button className="dk-tablist" title="Funções abertas" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        <span>{tabs.length}</span><Icon d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} size={16} />
      </button>
      {open && (
        <div className="dk-tabmenu" onClick={(e) => e.stopPropagation()}>
          {tabs.length === 0 && <div style={{ color: 'var(--muted)', padding: 10 }}>Nenhuma função aberta.</div>}
          {groups.map(([g, list]) => (
            <div key={g}>
              <div className="dk-tabgrp" style={{ borderColor: GROUP_COLOR[g] ?? '#A3A7AE' }}>{GROUPS.find((x) => x.id === g)?.name ?? 'Outras'}</div>
              {list.map((sc) => <Pill key={sc} sc={sc} />)}
            </div>
          ))}
          {tabs.length > 1 && <button className="dk-closeall" onClick={() => { tabs.filter((t) => t !== active).forEach(closeTab); setOpen(false); }}>Fechar as outras</button>}
        </div>
      )}
    </div>
  );
}
