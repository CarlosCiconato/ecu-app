// Lista de todas as tabelas do .ini da ECU conectada (Speeduino e outras que não são a nossa).
// Cada uma abre no mesmo editor de mapa do app.
import { useEffect, useState, type ReactElement } from 'react';
import { call, useStatus } from '../api';
import type { Screen } from '../App';
import type { MapaConfig } from './MapaInjecao';
import { Formulario, type CampoDef, type SecaoDef } from './Formulario';
import { CURVAS, Curva, type CurvaDef } from './Curva';

/** Editor genérico: passos tirados das casas decimais da tabela. */
export function cfgGenerica(nome: string, digits = 0, unit = ''): MapaConfig & { title: string } {
  const p = 10 ** -Math.min(3, Math.max(0, digits));
  const r = (v: number) => Math.round(v / p) * p;
  return {
    title: nome, tables: [nome, nome, nome], unit, digits,
    small: [String(p).replace('.', ','), (v) => r(v - p), (v) => r(v + p)],
    big: ['5 %', (v) => r(v * 0.95), (v) => r(v * 1.05)],
  };
}

type ItemIni = { kind: string; id: string; label: string; on: boolean };
/** Nome de cada tela aberta a partir do .ini (para o título da aba). */
export const ROTULOS_INI: Record<string, string> = {};
export const telaIni = (i: { kind: string; id: string }) => (i.kind === 't' ? `t_ini_${i.id}` : i.kind === 'c' ? `c_ini_${i.id}` : `d_ini_${i.id}`) as Screen;

/** Todas as funções que o .ini da ECU traz (os mesmos menus do TunerStudio): ajustes, curvas e tabelas. */
export function TabelasEcu({ go }: { go: (s: Screen) => void }) {
  const s = useStatus();
  const [menus, setMenus] = useState<{ title: string; items: ItemIni[] }[]>([]);
  const [busca, setBusca] = useState('');
  useEffect(() => {
    if (s.state !== 'conectado') return;
    const ler = () => call<{ title: string; items: ItemIni[] }[]>('funcoesIni').then((m) => {
      setMenus(m);
      for (const g of m) for (const i of g.items) ROTULOS_INI[telaIni(i)] = i.label;
    }, () => setMenus([]));
    void ler();
    const t = setInterval(() => void ler(), 3000); // itens ligam e desligam conforme a configuração
    return () => clearInterval(t);
  }, [s.state, s.iniSignature]);
  const q = busca.trim().toLowerCase();
  const TIPO: Record<string, string> = { t: 'Tabela', c: 'Curva', d: 'Ajustes' };
  const MENU_PT: Record<string, string> = { Settings: 'Configurações (Settings)', Tuning: 'Acerto (Tuning)', Spark: 'Ignição (Spark)', 'Startup/Idle': 'Partida e marcha lenta (Startup/Idle)', Accessories: 'Acessórios (Accessories)', Tools: 'Ferramentas (Tools)' };
  return (
    <main className="screen" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
      {menus.length === 0 && <div className="notice">Conecte uma ECU para ver as funções dela.</div>}
      {menus.length > 0 && <input className="field" placeholder="Procurar função (ex.: idle, boost, launch)" value={busca} onChange={(e) => setBusca(e.target.value)} />}
      {menus.map((m) => {
        const itens = m.items.filter((i) => !q || i.label.toLowerCase().includes(q) || m.title.toLowerCase().includes(q));
        if (!itens.length) return null;
        return (
          <section key={m.title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="num" style={{ fontSize: 22, color: 'var(--amber)' }}>{MENU_PT[m.title.trim()] ?? m.title}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridAutoRows: '64px', gap: 10 }}>
              {itens.map((i) => (
                <button key={i.kind + i.id} className="card" onClick={() => go(telaIni(i))} title={i.on ? '' : 'Desligada pela configuração atual (dá para abrir e ver)'}
                  style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer', opacity: i.on ? 1 : 0.5 }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1, minWidth: 0 }}>
                    <span className="num" style={{ fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{TIPO[i.kind]}{i.on ? '' : ' · desligada'}</span>
                  </span>
                  <span style={{ fontSize: 22, color: 'var(--muted)' }}>›</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}

type DialogoIni = { title: string; secoes: { title: string; fields: (CampoDef & { cond?: string })[] }[]; links: { kind: string; id: string; label: string }[] };
/** Um diálogo do .ini no Formulario do app. Os campos aparecem e somem pelas condições do .ini. */
export function DialogoIniTela({ id, go }: { id: string; go: (s: Screen) => void }) {
  const [d, setD] = useState<DialogoIni>();
  const [vis, setVis] = useState<Record<string, boolean>>({});
  const [erro, setErro] = useState<string>();
  useEffect(() => { call<DialogoIni>('dialogoIni', { alvo: id }).then(setD, (e) => setErro((e as Error).message)); }, [id]);
  useEffect(() => {
    if (!d) return;
    const exprs = [...new Set(d.secoes.flatMap((x) => x.fields.map((f) => f.cond).filter((c): c is string => !!c)))];
    if (!exprs.length) return;
    const ler = () => call<boolean[]>('condicoes', { exprs }).then((r) => setVis((old) => {
      const novo = Object.fromEntries(exprs.map((e, k) => [e, r[k]]));
      return exprs.every((e) => old[e] === novo[e]) ? old : novo;
    }), () => undefined);
    void ler();
    const t = setInterval(() => void ler(), 1200);
    return () => clearInterval(t);
  }, [d]);
  if (erro) return <main className="screen"><div className="notice err">{erro}</div></main>;
  if (!d) return <main className="screen"><span className="label">Lendo…</span></main>;
  const usados = new Set<string>();
  const sections: SecaoDef[] = d.secoes.map((sec, k) => {
    let title = sec.title || d.title || `Ajustes ${k + 1}`;
    while (usados.has(title)) title += ' ';
    usados.add(title);
    return { title, fields: sec.fields.map((f) => ({ ...f, showIf: f.cond ? () => vis[f.cond!] !== false : undefined })) };
  });
  const extra = d.links.length ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {d.links.map((l) => { ROTULOS_INI[telaIni(l)] = l.label; return <button key={l.kind + l.id} className="btn" style={{ height: 40, fontSize: 14 }} onClick={() => go(telaIni(l))}>{l.kind === 't' ? 'Tabela' : 'Curva'}: {l.label} ›</button>; })}
    </div>
  ) : undefined;
  if (!sections.length) return <main className="screen">{extra ?? <div className="notice">Esta função não tem ajustes que o app saiba mostrar.</div>}</main>;
  return <Formulario key={id} sections={sections} extra={extra} />;
}

/** Uma curva do .ini no editor de curvas do app. */
export function CurvaIniTela({ id }: { id: string }) {
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState<string>();
  useEffect(() => { setOk(false); call<CurvaDef>('curvaIni', { alvo: id }).then((c) => { CURVAS[`ini_${id}`] = c; setOk(true); }, (e) => setErro((e as Error).message)); }, [id]);
  if (erro) return <main className="screen"><div className="notice err">{erro}</div></main>;
  return ok ? <Curva key={id} id={`ini_${id}`} /> : <main className="screen"><span className="label">Lendo…</span></main>;
}

/** Abre uma tabela do .ini pelo nome, com as unidades e casas que a própria ECU informa. */
export function TabelaIni({ nome, Editor }: { nome: string; Editor: (p: { cfg: MapaConfig }) => ReactElement }) {
  const [cfg, setCfg] = useState<MapaConfig>();
  useEffect(() => {
    call<{ units: string; digits: number }>('table', { name: nome }).then((t) => setCfg(cfgGenerica(nome, t.digits, t.units)), () => setCfg(cfgGenerica(nome)));
  }, [nome]);
  return cfg ? <Editor cfg={cfg} /> : <main className="screen" />;
}

/** Speeduino: o mapa principal é o VE (%), não tempo em ms. */
export const SPEEDUINO_VE: MapaConfig = {
  tables: ['veTable1Tbl', 'fuelTable2Tbl', 'veTable1Tbl'], unit: '%', digits: 0,
  small: ['1 %', (v) => v - 1, (v) => v + 1], big: ['5 %', (v) => Math.round(v * 0.95), (v) => Math.round(v * 1.05)],
};
export const SPEEDUINO_IGN: MapaConfig = {
  tables: ['sparkTbl', 'spark2Tbl', 'sparkTbl'], unit: '°', digits: 0,
  small: ['1°', (v) => v - 1, (v) => v + 1], big: ['3°', (v) => v - 3, (v) => v + 3],
};
