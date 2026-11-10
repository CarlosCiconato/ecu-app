// Assistente de mapa padrão (estilo "mapa padrão", manual cap. 7.8 e 24.2):
// com os dados do motor gera o mapa de injeção em ms, o de ignição e o lambda alvo
// do ajuste em uso. Cilindrada, cilindros e vazão vêm da Configuração do motor.
import { useEffect, useState } from 'react';
import { call, useStatus } from '../api';
import { fmt } from '../format';
import type { Screen } from '../App';

const COMB = ['Gasolina', 'Gasolina de competição', 'Etanol', 'Metanol'];
const COMP = ['Alta compressão', 'Média compressão', 'Baixa compressão'];
const CAME = ['Comando original', 'Média graduação', 'Alta graduação'];

function Escolha({ titulo, opcoes, v, set }: { titulo: string; opcoes: string[]; v: number; set: (n: number) => void }) {
  return (
    <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="label">{titulo}</span>
      {opcoes.map((t, i) => (
        <button key={t} className="btn" style={{ height: 44, fontSize: 15, borderWidth: 2, borderColor: v === i ? 'var(--amber)' : undefined }} onClick={() => set(i)}>{t}</button>
      ))}
    </div>
  );
}

function Numero({ titulo, v, unit, passo, set, min, max }: { titulo: string; v: number; unit: string; passo: number; set: (n: number) => void; min: number; max: number }) {
  const lim = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="label">{titulo}</span>
      <span className="num" style={{ fontSize: 34, textAlign: 'center' }}>{fmt(v, 0)} <span style={{ fontSize: 16 }}>{unit}</span></span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <button className="btn" style={{ height: 44 }} onClick={() => set(lim(v - passo))}>−{passo}</button>
        <button className="btn" style={{ height: 44 }} onClick={() => set(lim(v + passo))}>+{passo}</button>
      </div>
    </div>
  );
}

export function MapaPadrao({ go }: { go: (s: Screen) => void }) {
  const s = useStatus();
  const [c, setC] = useState<Record<string, number | null>>();
  const [rpmMax, setRpmMax] = useState(8000);
  const [mapMax, setMapMax] = useState(250);
  const [fuel, setFuel] = useState(0);
  const [compression, setCompression] = useState(1);
  const [cam, setCam] = useState(0);
  const [confirma, setConfirma] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  useEffect(() => {
    if (s.state !== 'conectado') return;
    call<Record<string, number | null>>('constants', { names: ['cylindersCount', 'displacement', 'injector_flow', 'injTimeUseTps'] }).then(setC, (e) => setMsg(e.message));
  }, [s.state]);

  if (s.state !== 'conectado') return <main className="screen"><div className="notice err">Conecte na ECU para gerar o mapa padrão.</div></main>;
  if (!c) return <main className="screen"><span className="label">Lendo…</span></main>;
  const tps = c.injTimeUseTps === 1;

  async function gerar() {
    setBusy(true);
    try {
      const r = await call<{ tune: number; dead: number; maxDuty: number }>('mapaPadrao', { p: { rpmMax, mapMax, fuel, compression, cam } });
      setMsg(`Mapa padrão criado no ajuste ${r.tune} (injeção, ignição e lambda alvo; tempo morto a 14 V: ${fmt(r.dead, 2)} ms). Confira e grave.`
        + (r.maxDuty > 85 ? ` ATENÇÃO: no ponto mais alto os bicos ficariam abertos ${r.maxDuty} % do ciclo (máximo seguro ~85 %). Confira a vazão dos bicos ou use bicos maiores.` : ''));
      setConfirma(false);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <main className="screen" style={{ gap: 12, paddingTop: 10 }}>
      <div className="card" style={{ padding: '10px 16px', display: 'flex', gap: 24, fontSize: 15, alignItems: 'center' }}>
        <span>Motor: <b>{c.cylindersCount} cilindros</b>, <b>{fmt(c.displacement ?? 0, 2)} L</b></span>
        <span>Bicos: <b>{fmt(c.injector_flow ?? 0, 0)} cc/min</b> cada</span>
        <span>Mapa por <b>{tps ? 'TPS' : 'MAP'}</b></span>
        <span style={{ flexGrow: 1 }} />
        <button className="btn" style={{ height: 40 }} onClick={() => go('motor')}>Mudar na Configuração do motor</button>
      </div>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10, flexGrow: 1, alignItems: 'start' }}>
        <Numero titulo="Rotação máxima" v={rpmMax} unit="RPM" passo={500} min={3000} max={15000} set={setRpmMax} />
        {tps ? <div className="card" style={{ padding: 12, fontSize: 14, color: 'var(--muted)' }}>Mapa por TPS: a carga vai de 0 a 100% da borboleta.</div>
          : <Numero titulo="Pressão máxima (absoluta)" v={mapMax} unit="kPa" passo={10} min={100} max={600} set={setMapMax} />}
        <Escolha titulo="Combustível" opcoes={COMB} v={fuel} set={setFuel} />
        <Escolha titulo="Taxa de compressão" opcoes={COMP} v={compression} set={setCompression} />
        <Escolha titulo="Comando de válvulas" opcoes={CAME} v={cam} set={setCam} />
      </section>
      {!tps && <span style={{ fontSize: 13, color: 'var(--muted)' }}>100 kPa = aspirado (pressão do ar). Turbo com 1,5 bar = 250 kPa.</span>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {msg ? <div className={`notice ${msg.startsWith('Mapa padrão criado') || msg.startsWith('Gravado') ? 'ok' : 'err'}`} style={{ flexGrow: 1 }}>{msg}</div>
          : confirma ? <div className="notice err" style={{ flexGrow: 1 }}>Isso troca o mapa de injeção, o de ignição e o lambda alvo do ajuste em uso. Os eixos de RPM e carga valem para os 3 ajustes.</div>
          : <span style={{ flexGrow: 1, fontSize: 13, color: 'var(--muted)' }}>É um ponto de partida para o motor pegar. Acerte depois com a sonda.</span>}
        {confirma
          ? <><button className="btn" style={{ height: 52 }} onClick={() => setConfirma(false)}>Cancelar</button>
            <button className="btn primary" style={{ height: 52, width: 200, fontSize: 17 }} disabled={busy} onClick={gerar}>Sim, gerar</button></>
          : <button className="btn" style={{ height: 52, width: 200, fontSize: 17 }} disabled={busy} onClick={() => { setMsg(undefined); setConfirma(true); }}>Gerar mapa padrão</button>}
        <button className="btn primary" style={{ height: 52, width: 180, fontSize: 17 }} disabled={busy || !s.dirty} onClick={async () => { setBusy(true); try { await call('burn'); setMsg('Gravado na ECU.'); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } }}>Gravar na ECU</button>
      </div>
    </main>
  );
}
