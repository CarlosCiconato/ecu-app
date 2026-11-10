// Diagnóstico (manual de referência 6.6): abas Partida, Geral, Entradas e saídas, Mínimos e máximos.
import { useEffect, useState } from 'react';
import { call, useLive, useStatus } from '../api';
import { FIOS, PINOS } from '../../core/placa';
import { fmt } from '../format';

const SENSORES: [string, string, string, number][] = [
  // canal, nome, unidade, casas
  ['rawTps1Primary', 'TPS', 'V', 2], ['rawMap', 'MAP', 'V', 2], ['rawClt', 'Temp. do motor', 'V', 2], ['rawIat', 'Temp. do ar', 'V', 2],
  ['rawOilPressure', 'Pressão de óleo', 'V', 2], ['rawLowFuelPressure', 'Pressão de combustível', 'V', 2], ['VBatt', 'Bateria', 'V', 1],
  ['internalMcuTemperature', 'Temp. da ECU', '°C', 0],
];
const ERROS: [string, string][] = [
  ['isTpsError', 'TPS'], ['isMapError', 'MAP'], ['isCltError', 'Temp. do motor'], ['isIatError', 'Temp. do ar'], ['isTriggerError', 'Sinal de rotação'], ['hasCriticalError', 'Erro grave'],
];
const hms = (s: number | null) => (s == null ? '–' : `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}min ${String(Math.floor(s % 60)).padStart(2, '0')}s`);

// Mínimos e máximos desde o último "zerar" (ficam na memória do app enquanto ele estiver aberto).
const MINMAX: [string, string, string, number][] = [
  ['RPMValue', 'RPM', 'RPM', 0], ['TPSValue', 'TPS', '%', 1], ['MAPValue', 'MAP', 'kPa', 0], ['VBatt', 'Bateria', 'V', 2],
  ['actualLastInjection', 'Tempo de injeção', 'ms', 2], ['injectorDutyCycle', 'Duty dos bicos', '%', 0], ['ignitionAdvanceCyl1', 'Avanço', '°', 1],
  ['intake', 'Temp. do ar', '°C', 1], ['coolant', 'Temp. do motor', '°C', 1], ['oilPressure', 'Pressão de óleo', 'kPa', 0], ['lowFuelPressure', 'Pressão de combustível', 'kPa', 0],
  ['lambdaValue', 'Lambda', 'λ', 2],
];
const mm: Record<string, [number, number]> = {};

const ABAS = ['Partida', 'Geral', 'Entradas e saídas', 'Mínimos e máximos'] as const;

export function Diagnostico() {
  const [aba, setAba] = useState<(typeof ABAS)[number]>('Partida');
  return (
    <main className="screen" style={{ gap: 10, paddingTop: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ABAS.length}, minmax(0, 1fr))`, gap: 6 }}>
        {ABAS.map((a) => <button key={a} className="btn" style={{ height: 44, borderWidth: 2, borderColor: aba === a ? 'var(--amber)' : undefined }} onClick={() => setAba(a)}>{a}</button>)}
      </div>
      {aba === 'Partida' && <Partida />}
      {aba === 'Geral' && <Geral />}
      {aba === 'Entradas e saídas' && <EntradasSaidas />}
      {aba === 'Mínimos e máximos' && <MinMax />}
    </main>
  );
}

function Partida() {
  const v = useLive(['RPMValue', 'isTriggerError', 'totalTriggerErrorCounter', 'orderingErrorCounter', 'vvtPositionB1I', 'vvtCamCounter', 'isCranking']);
  const box = (n: string, val: string, bad = false, sub = '') => (
    <div className="card" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4, borderColor: bad ? 'var(--red)' : undefined }}>
      <span className="label">{n}</span>
      <span className="num" style={{ fontSize: 40, color: bad ? 'var(--red)' : undefined }}>{val}</span>
      {sub && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{sub}</span>}
    </div>
  );
  const rpm = v.RPMValue ?? 0;
  return (
    <>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {box('Rotação da roda fônica', fmt(rpm), false, v.isCranking ? 'Dando partida' : rpm > 0 ? 'Motor girando' : 'Parado')}
        {box('Sinal de rotação', v.isTriggerError ? 'COM ERRO' : rpm > 0 ? 'SINCRONIZADO' : 'SEM SINAL', !!v.isTriggerError)}
        {box('Posição do comando (fase)', `${fmt(v.vvtPositionB1I, 1)}°`, false, `Dentes do comando lidos: ${fmt(v.vvtCamCounter)}`)}
        {box('Falhas na roda fônica', fmt(v.totalTriggerErrorCounter), (v.totalTriggerErrorCounter ?? 0) > 0, 'Dente faltando no lugar errado, ruído no sinal')}
        {box('Erros de ordem dos dentes', fmt(v.orderingErrorCounter), (v.orderingErrorCounter ?? 0) > 0, 'Borda trocada ou sensor de fase fora da janela')}
      </section>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>Sem sinal com o motor de partida girando: confira o sensor de rotação e o tipo (VR ou Hall) em Configuração do motor &gt; Sinal de RPM.</span>
    </>
  );
}

function EntradasSaidas() {
  const s = useStatus();
  const [vals, setVals] = useState<Record<string, number | null>>();
  const [opts, setOpts] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (s.state !== 'conectado') return;
    (async () => {
      const c = await call<Record<string, number | null>>('constants', { names: PINOS.map(([n]) => n) });
      const o: Record<string, string[]> = {};
      for (const [n] of PINOS) o[n] = await call<string[]>('options', { name: n });
      setOpts(o); setVals(c);
    })().catch(() => undefined);
  }, [s.state]);
  if (!vals) return <span className="label">Lendo…</span>;
  // função ligada em cada fio da placa
  const uso: Record<string, string[]> = {};
  for (const [n, nome] of PINOS) {
    const pin = vals[n] != null ? opts[n]?.[vals[n]!] : undefined;
    if (pin) (uso[pin] ??= []).push(nome);
  }
  const grupo = (tipo: 'saida' | 'entrada', titulo: string) => (
    <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0, overflowY: 'auto' }}>
      <span className="num" style={{ fontSize: 18, color: 'var(--amber)' }}>{titulo}</span>
      {FIOS.filter((f) => f.tipo === tipo).map((f) => {
        const u = uso[f.pino] ?? [];
        return (
          <div key={f.nome} style={{ display: 'flex', gap: 8, fontSize: 14, padding: '3px 0', borderBottom: '1px solid var(--line)' }}>
            <b style={{ width: 90 }}>{f.nome}</b>
            <span style={{ flexGrow: 1, color: u.length ? 'var(--text)' : 'var(--muted)' }}>{u.length ? u.join(', ') : 'Livre'}</span>
            {u.length > 1 && <span style={{ color: 'var(--red)', fontWeight: 700 }}>REPETIDO</span>}
          </div>
        );
      })}
    </div>
  );
  return (
    <section style={{ flexGrow: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {grupo('saida', 'Saídas (azul, cinza, amarelo)')}
      {grupo('entrada', 'Entradas (branco)')}
    </section>
  );
}

function MinMax() {
  const v = useLive(MINMAX.map((x) => x[0]));
  const [, force] = useState(0);
  for (const [k] of MINMAX) {
    const x = v[k];
    if (x == null) continue;
    const old = mm[k];
    mm[k] = old ? [Math.min(old[0], x), Math.max(old[1], x)] : [x, x];
  }
  return (
    <>
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
        {MINMAX.map(([k, n, u, d]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 40px', fontSize: 16, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <span>{n}</span><b style={{ textAlign: 'right' }}>{fmt(mm[k]?.[0] ?? null, d)}</b><b style={{ textAlign: 'right' }}>{fmt(mm[k]?.[1] ?? null, d)}</b>
            <span style={{ color: 'var(--muted)', textAlign: 'right' }}>{u}</span>
          </div>
        ))}
      </section>
      <span style={{ flexGrow: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flexGrow: 1, fontSize: 13, color: 'var(--muted)' }}>Mínimo e máximo desde que o app abriu ou desde o último "Zerar".</span>
        <button className="btn" style={{ height: 48, width: 160 }} onClick={() => { for (const k of Object.keys(mm)) delete mm[k]; force((n) => n + 1); }}>Zerar</button>
      </div>
    </>
  );
}

function Geral() {
  const s = useStatus();
  const v = useLive([...SENSORES.map((x) => x[0]), ...ERROS.map((x) => x[0]), 'totalTriggerErrorCounter', 'warningCounter', 'lastErrorCode',
    'seconds', 'engineRunTime', 'odometerTotal', 'RPMValue', 'sd_present', 'alertLevel', 'odometerTotal', 'odometerPartial', 'hourMeterTotal', 'hourMeterPartial']);
  if (s.state !== 'conectado') return <div className="notice err">Conecte na ECU para ver o diagnóstico.</div>;

  const tile = (name: string, value: string, unit = '', bad = false) => (
    <div key={name} className="card" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 2, borderColor: bad ? 'var(--red)' : undefined }}>
      <span className="label">{name}</span>
      <span className="num" style={{ fontSize: 30, color: bad ? 'var(--red)' : undefined }}>{value} <span style={{ fontSize: 14, color: 'var(--muted)' }}>{unit}</span></span>
    </div>
  );

  return (
    <>
      <span className="label">Tensão nos sensores (0 a 5 V; perto de 0 ou de 5 costuma ser fio solto ou em curto)</span>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {SENSORES.map(([k, n, u, d]) => {
          const x = v[k];
          const bad = u === 'V' && k !== 'VBatt' && x != null && (x < 0.1 || x > 4.9);
          return tile(n, fmt(x, d), u, bad);
        })}
      </section>
      <span className="label">Erros dos sensores</span>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
        {ERROS.map(([k, n]) => {
          const bad = !!v[k];
          return (
            <div key={k} className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, borderColor: bad ? 'var(--red)' : undefined }}>
              <span className="dot" style={{ width: 12, height: 12, background: bad ? 'var(--red)' : 'var(--green)' }} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>{n}</span>
            </div>
          );
        })}
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {tile('Falhas no sinal de rotação', fmt(v.totalTriggerErrorCounter), '', (v.totalTriggerErrorCounter ?? 0) > 0)}
        {tile('Avisos da ECU', fmt(v.warningCounter), v.lastErrorCode ? `último: ${v.lastErrorCode}` : '')}
        {tile('ECU ligada há', hms(v.seconds))}
        {tile('Cartão SD', v.sd_present ? 'Presente' : 'Sem cartão', '', !v.sd_present)}
      </section>
    </>
  );
}
