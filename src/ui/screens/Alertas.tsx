// Alertas (item 3 do firmware): 8 alertas, cada um com sensor, limite, tempo,
// RPM mínimo e ação (só avisar, modo de segurança ou desligar o motor).
import { useCallback, useEffect, useState } from 'react';
import { call, useLive, useStatus } from '../api';
import { fmt } from '../format';
import type { Screen } from '../App';

const N = 8;
const ACTIONS = ['Desligado', 'Só avisar', 'Modo de segurança', 'Desligar o motor'];
const ACTION_COLOR = ['#5a5e66', 'var(--yellow)', 'var(--amber)', 'var(--red)'];

// Nome em português e unidade dos sensores mais usados (índice da lista do firmware).
export const SENSOR_PT: Record<number, [string, string]> = {
  0: ['Nenhum', ''], 1: ['TPS', '%'], 2: ['MAP', 'kPa'], 3: ['Temperatura do motor', '°C'], 4: ['Temperatura do ar', '°C'],
  9: ['Pedal', '%'], 10: ['Bateria', 'V'], 15: ['Etanol', '%'], 24: ['RPM', 'RPM'], 25: ['Marcha', ''], 26: ['Pressão atmosférica', 'kPa'],
  27: ['EGT 1', '°C'], 28: ['EGT 2', '°C'], 31: ['Velocidade', 'km/h'], 32: ['Pressão de óleo', 'kPa'], 33: ['Temperatura do óleo', '°C'],
  34: ['Pressão de combustível', 'kPa'], 36: ['EGT 3', '°C'], 37: ['EGT 4', '°C'], 38: ['EGT 5', '°C'], 39: ['EGT 6', '°C'],
  40: ['EGT 7', '°C'], 41: ['EGT 8', '°C'], 42: ['Pressão de combustível (diferencial)', 'kPa'], 43: ['EGT mais quente', '°C'],
  44: ['Correção da sonda', '%'], 45: ['Rotação da turbina', 'RPM'], 46: ['MAP acima do limite do etanol', 'kPa'], 47: ['Subida rápida da EGT', '°C/s'],
  48: ['Falha da água/metanol', ''], 49: ['Patinagem das rodas', '%'],
};
// Modelos prontos no estilo profissional (cap. 21.2): preenchem o alerta de uma vez; depois dá para ajustar.
type Modelo = { nome: string; sub: string; v: Partial<Alert> };
const MODELOS: Modelo[] = [
  { nome: 'Overboost', sub: 'MAP acima de 300 kPa (2 bar)', v: { sensor: 2, triggerBelow: 0, threshold: 300, delay: 0.1, minRpm: 0, action: 2 } },
  { nome: 'Pressão de óleo baixa', sub: 'Abaixo de 100 kPa com motor acima de 1500 RPM', v: { sensor: 32, triggerBelow: 1, threshold: 100, delay: 0.2, minRpm: 1500, action: 3 } },
  { nome: 'Pressão de óleo alta', sub: 'Acima de 700 kPa', v: { sensor: 32, triggerBelow: 0, threshold: 700, delay: 1, minRpm: 0, action: 1 } },
  { nome: 'Temperatura do motor alta', sub: 'Acima de 105 °C', v: { sensor: 3, triggerBelow: 0, threshold: 105, delay: 2, minRpm: 0, action: 1 } },
  { nome: 'Temperatura do óleo alta', sub: 'Acima de 130 °C', v: { sensor: 33, triggerBelow: 0, threshold: 130, delay: 2, minRpm: 0, action: 1 } },
  { nome: 'Pressão de combustível baixa', sub: 'Diferencial abaixo de 250 kPa acima de 1500 RPM', v: { sensor: 42, triggerBelow: 1, threshold: 250, delay: 0.5, minRpm: 1500, action: 2 } },
  { nome: 'EGT alta', sub: 'EGT mais quente acima de 900 °C', v: { sensor: 43, triggerBelow: 0, threshold: 900, delay: 0.1, minRpm: 0, action: 2 } },
  { nome: 'EGT baixa (cilindro falhando)', sub: 'EGT mais quente abaixo de 300 °C acima de 3000 RPM', v: { sensor: 43, triggerBelow: 1, threshold: 300, delay: 1, minRpm: 3000, action: 1 } },
  { nome: 'EGT subindo rápido', sub: 'Mais de 150 °C por segundo', v: { sensor: 47, triggerBelow: 0, threshold: 150, delay: 0.1, minRpm: 0, action: 1 } },
  { nome: 'Bateria baixa', sub: 'Abaixo de 11,5 V com motor ligado', v: { sensor: 10, triggerBelow: 1, threshold: 11.5, delay: 5, minRpm: 500, action: 1 } },
  { nome: 'Pressão alta com pouco etanol', sub: 'MAP acima do limite da curva do etanol', v: { sensor: 46, triggerBelow: 0, threshold: 0, delay: 0.2, minRpm: 0, action: 2 } },
  { nome: 'Rotação alta', sub: 'Acima de 8200 RPM (aviso antes do corte)', v: { sensor: 24, triggerBelow: 0, threshold: 8200, delay: 0, minRpm: 0, action: 1 } },
  { nome: 'Água/metanol acabou', sub: 'Tanque baixo com turbo pedindo: modo de segurança', v: { sensor: 48, triggerBelow: 0, threshold: 0.5, delay: 0.2, minRpm: 0, action: 2 } },
  { nome: 'Rodas patinando', sub: 'Patinagem acima de 25 %', v: { sensor: 49, triggerBelow: 0, threshold: 25, delay: 0.5, minRpm: 0, action: 1 } },
  { nome: 'Malha fechada no limite', sub: 'Correção da sonda acima de 20%', v: { sensor: 44, triggerBelow: 0, threshold: 20, delay: 2, minRpm: 1500, action: 1 } },
];
const FIELDS = ['sensor', 'action', 'triggerBelow', 'useRpmCurve', 'threshold', 'minRpm', 'delay'] as const;
type Alert = Record<(typeof FIELDS)[number], number>;

export function Alertas({ go }: { go: (s: Screen) => void }) {
  const s = useStatus();
  const live = useLive(['alertActiveMask', 'alertLatchedMask', 'RPMValue']);
  const [alerts, setAlerts] = useState<Alert[]>();
  const [sensorNames, setSensorNames] = useState<string[]>([]);
  const [safeRpm, setSafeRpm] = useState<number>();
  const [sel, setSel] = useState(0);
  const [picking, setPicking] = useState<false | 'sensor' | 'modelo'>(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  const load = useCallback(async () => {
    const names = Array.from({ length: N }, (_, i) => FIELDS.map((f) => `alerts${i + 1}_${f}`)).flat();
    const c = await call<Record<string, number>>('constants', { names: [...names, 'alertSafeModeRpm'] });
    setAlerts(Array.from({ length: N }, (_, i) => Object.fromEntries(FIELDS.map((f) => [f, c[`alerts${i + 1}_${f}`] ?? 0])) as Alert));
    setSafeRpm(c.alertSafeModeRpm);
    setSensorNames(await call<string[]>('options', { name: 'alerts1_sensor' }));
  }, []);
  useEffect(() => { if (s.state === 'conectado') load().catch((e) => setMsg((e as Error).message)); }, [s.state, load]);

  if (s.state !== 'conectado') return <main className="screen"><div className="notice err">Conecte na ECU para ver os alertas.</div></main>;
  if (!alerts) return <main className="screen"><span className="label">Lendo os alertas…</span></main>;

  const sensorName = (i: number) => SENSOR_PT[i]?.[0] ?? sensorNames[i] ?? `Sensor ${i}`;
  const unit = (i: number) => SENSOR_PT[i]?.[1] ?? '';
  const active = live.alertActiveMask ?? 0;
  const latched = live.alertLatchedMask ?? 0;
  const a = alerts[sel];

  async function set(field: (typeof FIELDS)[number], value: number) {
    setBusy(true);
    try {
      const v = await call<number>('setValue', { name: `alerts${sel + 1}_${field}`, value });
      setAlerts((p) => p && p.map((x, i) => (i === sel ? { ...x, [field]: v } : x)));
      setMsg(undefined);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }
  async function aplicarModelo(m: Modelo) {
    setBusy(true);
    try {
      const novo = { ...a, useRpmCurve: 0 };
      for (const f of FIELDS) {
        const want = f === 'useRpmCurve' ? 0 : m.v[f];
        if (want === undefined) continue;
        novo[f] = await call<number>('setValue', { name: `alerts${sel + 1}_${f}`, value: want });
      }
      setAlerts((p) => p && p.map((x, i) => (i === sel ? novo : x)));
      setMsg(undefined);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }
  async function setSafe(v: number) {
    setBusy(true);
    try { setSafeRpm(await call<number>('setValue', { name: 'alertSafeModeRpm', value: v })); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }
  async function burn() {
    setBusy(true);
    try { await call('burn'); setMsg('Gravado na ECU.'); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  const step = (x: Alert) => (unit(x.sensor) === 'RPM' ? 100 : unit(x.sensor) === 'V' ? 0.1 : 1);
  const condition = (x: Alert) => x.action === 0 ? 'Desligado'
    : `${x.triggerBelow ? 'Abaixo de' : 'Acima de'} ${x.useRpmCurve ? 'curva por RPM' : `${fmt(x.threshold, step(x) < 1 ? 1 : 0)} ${unit(x.sensor)}`}`;

  const Stepper = ({ label, value, digits, unitText, onChange, small, big }: { label: string; value: number; digits: number; unitText: string; onChange: (v: number) => void; small: number; big: number }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="label">{label}</span>
      <div style={{ display: 'grid', gridTemplateColumns: '52px 52px 1fr 52px 52px', gap: 6, alignItems: 'center' }}>
        <button className="btn" disabled={busy} onClick={() => onChange(value - big)}>−{fmt(big)}</button>
        <button className="btn" disabled={busy} onClick={() => onChange(value - small)}>−</button>
        <span className="num" style={{ fontSize: 30, textAlign: 'center' }}>{fmt(value, digits)} <span style={{ fontSize: 15, color: 'var(--muted)' }}>{unitText}</span></span>
        <button className="btn" disabled={busy} onClick={() => onChange(value + small)}>+</button>
        <button className="btn" disabled={busy} onClick={() => onChange(value + big)}>+{fmt(big)}</button>
      </div>
    </div>
  );

  return (
    <main className="screen" style={{ flexDirection: 'row', gap: 14, paddingTop: 10 }}>
      <section style={{ width: 380, flexShrink: 0, display: 'grid', gridTemplateRows: `repeat(${N + 1}, minmax(0, 1fr))`, gap: 6 }}>
        <button className="btn" onClick={() => go('f_alertaSaida' as Screen)}>Saída de alerta (fio e acionamento)</button>
        {alerts.map((x, i) => {
          const on = (active >> i) & 1;
          const was = (latched >> i) & 1;
          return (
            <button key={i} className="card" onClick={() => { setSel(i); setPicking(false); }}
              style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer',
                borderColor: sel === i ? 'var(--amber)' : on ? 'var(--red)' : undefined, borderWidth: 2, background: on ? '#3a1714' : undefined }}>
              <span className="num" style={{ fontSize: 22, width: 22, color: 'var(--muted)' }}>{i + 1}</span>
              <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.action ? sensorName(x.sensor) : 'Livre'}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{condition(x)}</span>
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: ACTION_COLOR[x.action], textAlign: 'right', width: 86 }}>
                {on ? 'ATIVO AGORA' : was ? 'Disparou' : x.action ? ACTIONS[x.action] : ''}
              </span>
            </button>
          );
        })}
      </section>

      <section className="card" style={{ flexGrow: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="num" style={{ fontSize: 26 }}>Alerta {sel + 1}</span>
          <span style={{ flexGrow: 1 }} />
          {!picking && <button className="btn" onClick={() => setPicking('modelo')}>Modelos prontos</button>}
          <button className="btn" onClick={() => setPicking((p) => (p ? false : 'sensor'))}>{picking ? 'Voltar' : `Sensor: ${sensorName(a.sensor)}`}</button>
        </div>

        {picking === 'modelo' ? (
          <div style={{ flexGrow: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, alignContent: 'start' }}>
            {MODELOS.filter((m) => sensorNames.length === 0 || (m.v.sensor ?? 0) < sensorNames.length).map((m) => (
              <button key={m.nome} className="btn" disabled={busy} style={{ height: 58, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2, textAlign: 'left' }}
                onClick={async () => { await aplicarModelo(m); setPicking(false); }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{m.nome}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{m.sub}</span>
              </button>
            ))}
          </div>
        ) : picking ? (
          <div style={{ flexGrow: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, alignContent: 'start' }}>
            {sensorNames.map((_, i) => i).filter((i) => SENSOR_PT[i]).map((i) => (
              <button key={i} className="btn" disabled={busy} style={{ height: 46, fontSize: 14, borderColor: a.sensor === i ? 'var(--amber)' : undefined }}
                onClick={async () => { await set('sensor', i); setPicking(false); }}>{sensorName(i)}</button>
            ))}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
              {ACTIONS.map((t, k) => (
                <button key={k} className="btn" disabled={busy} onClick={() => set('action', k)}
                  style={{ height: 48, fontSize: 14, borderColor: a.action === k ? ACTION_COLOR[k] : undefined, borderWidth: 2, color: a.action === k ? 'var(--text)' : 'var(--muted)' }}>{t}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
              {(['Acima do limite', 'Abaixo do limite'] as const).map((t, k) => (
                <button key={t} className="btn" disabled={busy} onClick={() => set('triggerBelow', k)}
                  style={{ height: 42, fontSize: 14, borderColor: a.triggerBelow === k ? 'var(--amber)' : undefined }}>{t}</button>
              ))}
              {(['Limite fixo', 'Curva por RPM'] as const).map((t, k) => (
                <button key={t} className="btn" disabled={busy} onClick={() => set('useRpmCurve', k)}
                  style={{ height: 42, fontSize: 14, borderColor: a.useRpmCurve === k ? 'var(--amber)' : undefined }}>{t}</button>
              ))}
            </div>
            {a.useRpmCurve
              ? <button className="btn" style={{ height: 52, fontSize: 16 }} onClick={() => go(`c_alert${sel + 1}` as Screen)}>Editar a curva de limite por RPM ›</button>
              : Stepper({ label: 'Limite', value: a.threshold, digits: step(a) < 1 ? 1 : 0, unitText: unit(a.sensor), small: step(a), big: step(a) * 10, onChange: (v) => set('threshold', v), })}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {Stepper({ label: 'Tempo na condição', value: a.delay, digits: 1, unitText: 's', small: 0.1, big: 1, onChange: (v) => set('delay', v), })}
              {Stepper({ label: 'Só a partir de', value: a.minRpm, digits: 0, unitText: 'RPM', small: 100, big: 1000, onChange: (v) => set('minRpm', v), })}
            </div>
            {a.action === 2 && safeRpm !== undefined && (
              Stepper({ label: 'Modo de segurança: corta combustível acima de (vale para todos)', value: safeRpm, digits: 0, unitText: 'RPM', small: 100, big: 1000, onChange: setSafe, })
            )}
          </>
        )}
        <span style={{ flexGrow: 1 }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <div className={`notice ${msg.startsWith('Gravado') ? 'ok' : 'err'}`} style={{ flexGrow: 1 }}>{msg}</div>}
          {s.dirty && !msg && <div className="notice" style={{ flexGrow: 1, background: '#2A2116', color: '#FFD08A' }}>Mudanças valendo, mas ainda não gravadas.</div>}
          {!msg && !s.dirty && <span style={{ flexGrow: 1, fontSize: 13, color: 'var(--muted)' }}>O alerta que dispara fica marcado até a próxima partida.</span>}
          <button className="btn primary" style={{ height: 52, width: 200, fontSize: 17 }} disabled={busy || !s.dirty} onClick={burn}>Gravar na ECU</button>
        </div>
      </section>
    </main>
  );
}
