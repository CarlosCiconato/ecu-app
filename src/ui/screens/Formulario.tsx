// Tela genérica de configurações: lê os campos do .ini e mostra cada um com
// botões de mais/menos (números) ou botões de escolha (opções). Serve para
// Configuração do motor, Sensores, Outras funções etc.
import { useEffect, useState, type ReactNode } from 'react';
import { call, useLive, useStatus } from '../api';
import { fmt } from '../format';
import { FIOS, PINOS, PINO_NOME, PINO_TIPO } from '../../core/placa';

export interface CampoDef {
  name: string;
  label: string;
  unit?: string;
  step?: number; // passo pequeno (padrão 1)
  big?: number; // passo grande (padrão 10 × passo)
  digits?: number;
  labels?: Record<number, string>; // nome em português das opções
  only?: number[]; // mostrar só estas opções
  hint?: string;
  live?: string; // canal ao vivo para calibrar: mostra o valor de agora e o botão "Usar agora"
  pick?: (label: string, vals: Record<string, Val>) => boolean; // filtra as opções (ex.: ordem de ignição pelo nº de cilindros)
  showAll?: boolean; // na lista de escolha, botão "Mostrar todos" além das opções principais
  showIf?: (vals: Record<string, Val>) => boolean;
  warn?: (vals: Record<string, Val>) => string | undefined; // aviso vermelho embaixo do campo (ex.: cilindro repetido) // só mostra o campo quando valer (ex.: dentes da roda personalizada)
}
export interface SecaoDef { title: string; fields: CampoDef[]; presets?: { label: string; values: Record<string, number> }[]; presetsLabel?: string } // presets: botões de sensor pronto que preenchem vários campos

type Val = number | number[] | null;

const isPinList = (list: string[]) => list.includes('PA0');

export function Formulario({ sections, extra }: { sections: SecaoDef[]; extra?: ReactNode }) {
  const s = useStatus();
  const [vals, setVals] = useState<Record<string, Val>>();
  const [opts, setOpts] = useState<Record<string, string[]>>({});
  const [picking, setPicking] = useState<CampoDef>();
  const [everyOpt, setEveryOpt] = useState(false);
  const [uso, setUso] = useState<Record<string, Val>>({});
  const [usoOpts, setUsoOpts] = useState<Record<string, string[]>>({}); // valor de todos os campos de pino (para mostrar o que já está em uso)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const all = sections.flatMap((x) => x.fields);
  const liveVals = useLive(all.flatMap((f) => (f.live ? [f.live] : [])));

  useEffect(() => {
    if (s.state !== 'conectado') return;
    (async () => {
      setVals(await call<Record<string, Val>>('constants', { names: all.map((f) => f.name) }));
      const o: Record<string, string[]> = {};
      for (const f of all) {
        const list = await call<string[]>('options', { name: f.name });
        if (list.length) o[f.name] = list;
      }
      setOpts(o);
      if (Object.values(o).some(isPinList)) {
        setUso(await call<Record<string, Val>>('constants', { names: PINOS.map(([n]) => n) }));
        const po: Record<string, string[]> = {};
        for (const [n] of PINOS) po[n] = await call<string[]>('options', { name: n });
        setUsoOpts(po);
      }
    })().catch((e) => setMsg((e as Error).message));
  }, [s.state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (s.state !== 'conectado') return <main className="screen"><div className="notice err">Conecte na ECU para ver as configurações.</div></main>;
  if (!vals) return <main className="screen"><span className="label">Lendo…</span></main>;

  async function set(name: string, value: number) {
    setBusy(true);
    try { const v = await call<number>('setValue', { name, value }); setVals((p) => ({ ...p, [name]: v })); if (name === 'cylindersCount') { const fo = await call<Record<string, Val>>('constants', { names: ['firingOrder'] }); setVals((p) => ({ ...p, ...fo })); } if (name in PINO_NOME) setUso((p) => ({ ...p, [name]: v })); setMsg(undefined); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }
  async function burn() {
    setBusy(true);
    try { await call('burn'); setMsg('Gravado na ECU.'); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  const optionList = (f: CampoDef, everything = false) => {
    const list = opts[f.name] ?? [];
    const idx = !everything && f.only ? f.only : list.map((_, i) => i);
    return idx.filter((i) => list[i] && list[i] !== 'INVALID' && !/^0x/.test(list[i]))
      .filter((i) => everything || !f.pick || f.pick(list[i], vals!))
      .map((i) => [i, f.labels?.[i] ?? list[i]] as const);
  };

  /** Fio da placa para o pino escolhido ("Azul 3"), ou o nome do pino do processador. */
  const fioDe = (list: string[], i: number) => (i <= 0 ? 'Nenhum' : FIOS.find((x) => x.pino === list[i])?.nome ?? list[i]);
  /** Lista de escolha de pino estilo profissional: "Amarelo 2 · Em uso: Ventoinha 1". */
  const pinOptions = (f: CampoDef, everything: boolean) => {
    const list = opts[f.name] ?? [];
    const tipo = PINO_TIPO[f.name] ?? 'saida';
    // compara pelo nome do pino: cada tipo de campo tem a sua lista (saída, botão, entrada analógica)
    const usedBy = (i: number) => Object.entries(uso).filter(([n, v]) => n !== f.name && typeof v === 'number' && v > 0 && usoOpts[n]?.[v] === list[i]).map(([n]) => PINO_NOME[n]);
    const items: { i: number; nome: string; sub: string; busy: boolean }[] = [{ i: 0, nome: 'Nenhum', sub: 'Função desligada', busy: false }];
    if (everything) list.forEach((t, i) => { if (i > 0 && t !== 'INVALID') { const u = usedBy(i); items.push({ i, nome: fioDe(list, i) === t ? t : `${t} (${fioDe(list, i)})`, sub: u.length ? `Em uso: ${u.join(', ')}` : '', busy: u.length > 0 }); } });
    else for (const fio of FIOS.filter((x) => x.tipo === tipo)) {
      const i = list.indexOf(fio.pino);
      if (i < 0) continue;
      const u = usedBy(i);
      items.push({ i, nome: fio.nome, sub: u.length ? `Em uso: ${u.join(', ')}` : 'Disponível', busy: u.length > 0 });
    }
    return items;
  };

  function Campo({ f }: { f: CampoDef }) {
    const v = vals![f.name];
    if (v == null || Array.isArray(v)) return null;
    if (f.showIf && !f.showIf(vals!)) return null;
    const list = opts[f.name];
    // número com poucas escolhas (ex.: 0 = traseira, 1 = dianteira): botões, como nas listas
    if (!list && f.labels && f.only && f.only.length <= 4) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="label">{f.label}</span>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${f.only.length}, minmax(0, 1fr))`, gap: 6 }}>
            {f.only.map((i) => (
              <button key={i} className="btn" disabled={busy} onClick={() => set(f.name, i)}
                style={{ height: 44, fontSize: 14, borderWidth: 2, borderColor: v === i ? 'var(--amber)' : undefined, color: v === i ? 'var(--text)' : 'var(--muted)' }}>{f.labels![i]}</button>
            ))}
          </div>
          {f.hint && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{f.hint}</span>}
        </div>
      );
    }
    if (list) {
      const options = optionList(f);
      const current = isPinList(list) ? fioDe(list, v) : f.labels?.[v] ?? list[v] ?? String(v);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="label">{f.label}</span>
          {options.length <= 4 && !isPinList(list) ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: 6 }}>
              {options.map(([i, t]) => (
                <button key={i} className="btn" disabled={busy} onClick={() => set(f.name, i)}
                  style={{ height: 44, fontSize: 14, borderWidth: 2, borderColor: v === i ? 'var(--amber)' : undefined, color: v === i ? 'var(--text)' : 'var(--muted)' }}>{t}</button>
              ))}
            </div>
          ) : (
            <button className="btn" disabled={busy} style={{ height: 44, fontSize: 15, justifyContent: 'space-between', display: 'flex', alignItems: 'center', padding: '0 14px' }} onClick={() => { setEveryOpt(false); setPicking(f); }}>
              <span>{current}</span><span style={{ color: 'var(--muted)' }}>Trocar ›</span>
            </button>
          )}
          {f.hint && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{f.hint}</span>}
        </div>
      );
    }
    const step = f.step ?? 1;
    const big = f.big ?? step * 10;
    const digits = f.digits ?? (step < 1 ? (step < 0.1 ? 2 : 1) : 0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="label">{f.label}</span>
        <div style={{ display: 'grid', gridTemplateColumns: '50px 44px 1fr 44px 50px', gap: 6, alignItems: 'center' }}>
          <button className="btn" style={{ height: 44, fontSize: 13 }} disabled={busy} onClick={() => set(f.name, v - big)}>−{fmt(big, big < 1 ? 1 : 0)}</button>
          <button className="btn" style={{ height: 44 }} disabled={busy} onClick={() => set(f.name, v - step)}>−</button>
          <span className="num" style={{ fontSize: 26, textAlign: 'center' }}>{fmt(v, digits)} <span style={{ fontSize: 14, color: 'var(--muted)' }}>{f.unit ?? ''}</span></span>
          <button className="btn" style={{ height: 44 }} disabled={busy} onClick={() => set(f.name, v + step)}>+</button>
          <button className="btn" style={{ height: 44, fontSize: 13 }} disabled={busy} onClick={() => set(f.name, v + big)}>+{fmt(big, big < 1 ? 1 : 0)}</button>
        </div>
        {f.live && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--muted)' }}>
            <span>Agora: <b className="num" style={{ color: 'var(--cyan)', fontSize: 17 }}>{fmt(liveVals[f.live], digits)}</b> {f.unit ?? ''}</span>
            <button className="btn" style={{ height: 34, fontSize: 13 }} disabled={busy || liveVals[f.live] == null} onClick={() => set(f.name, liveVals[f.live!] as number)}>Usar agora</button>
          </div>
        )}
        {f.warn?.(vals!) && <span style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>{f.warn(vals!)}</span>}
        {f.hint && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{f.hint}</span>}
      </div>
    );
  }

  return (
    <main className="screen" style={{ gap: 10, paddingTop: 10 }}>
      {extra}
      {picking ? (
        <section className="card" style={{ flexGrow: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="num" style={{ fontSize: 24, flexGrow: 1 }}>{picking.label}</span>
            {picking.showAll && !isPinList(opts[picking.name] ?? []) && <button className="btn" style={{ marginRight: 8 }} onClick={() => setEveryOpt((a) => !a)}>{everyOpt ? (isPinList(opts[picking.name] ?? []) ? 'Só os fios da placa' : 'Só os principais') : (isPinList(opts[picking.name] ?? []) ? 'Pinos do processador' : 'Mostrar todos')}</button>}
            <button className="btn" onClick={() => setPicking(undefined)}>Voltar</button>
          </div>
          {isPinList(opts[picking.name] ?? []) ? (
          <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, alignContent: 'start' }}>
            {pinOptions(picking, everyOpt).map((o) => (
              <button key={o.i} className="btn" disabled={busy} style={{ minHeight: 56, fontSize: 15, borderWidth: 2, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2, padding: '6px 12px',
                borderColor: vals[picking.name] === o.i ? 'var(--amber)' : undefined }}
                onClick={async () => { await set(picking.name, o.i); setPicking(undefined); }}>
                <span style={{ fontWeight: 700 }}>{o.nome}</span>
                <span style={{ fontSize: 12, color: o.busy ? 'var(--amber)' : 'var(--green)' }}>{vals[picking.name] === o.i ? 'Escolhido' : o.sub}</span>
              </button>
            ))}
          </div>
          ) : (
          <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, alignContent: 'start' }}>
            {optionList(picking, everyOpt).map(([i, t]) => (
              <button key={i} className="btn" disabled={busy} style={{ minHeight: 44, fontSize: 14, borderWidth: 2, borderColor: vals[picking.name] === i ? 'var(--amber)' : undefined }}
                onClick={async () => { await set(picking.name, i); setPicking(undefined); }}>{t}</button>
            ))}
          </div>
          )}
        </section>
      ) : (
        <section style={{ flexGrow: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, alignContent: 'start', minHeight: 0 }}>
          {sections.filter((sec) => sec.fields.some((f) => !f.showIf || f.showIf(vals!))).map((sec) => (
            <div key={sec.title} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span className="num" style={{ fontSize: 20, color: 'var(--amber)' }}>{sec.title}</span>
              {sec.presets && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{sec.presetsLabel ?? 'Sensor pronto:'}</span>
                  {sec.presets.map((pr) => (
                    <button key={pr.label} className="btn" style={{ height: 38, fontSize: 13 }} disabled={busy}
                      onClick={async () => { for (const [n, v] of Object.entries(pr.values)) await set(n, v); setMsg(undefined); }}>{pr.label}</button>
                  ))}
                </div>
              )}
              {sec.fields.map((f) => <div key={f.name} style={{ display: "contents" }}>{Campo({ f })}</div>)}
            </div>
          ))}
        </section>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {msg ? <div className={`notice ${msg.startsWith('Gravado') ? 'ok' : 'err'}`} style={{ flexGrow: 1 }}>{msg}</div>
          : s.dirty ? <div className="notice" style={{ flexGrow: 1, background: '#2A2116', color: '#FFD08A' }}>Mudanças valendo, mas ainda não gravadas.</div>
          : <span style={{ flexGrow: 1 }} />}
        <button className="btn primary" style={{ height: 50, width: 200, fontSize: 17 }} disabled={busy || !s.dirty} onClick={burn}>Gravar na ECU</button>
      </div>
    </main>
  );
}
