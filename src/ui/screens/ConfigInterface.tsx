// Configuração da interface (manual de referência cap. 23). Quase tudo fica guardado no aparelho da tela, não na ECU.
import { useState } from 'react';
import { call, useLive, useStatus } from '../api';
import { fmt } from '../format';
import { setPrefs, usePrefs, type Prefs } from '../prefs';
import type { Screen } from '../App';
import { GAUGES, NOMES_PAINEL, PAINEIS_PADRAO, SLOTS, zerarPicos } from './Painel';
export const APP_VERSION = '0.30';

function Choice<K extends keyof Prefs>({ label, k, options }: { label: string; k: K; options: [Prefs[K], string][] }) {
  const p = usePrefs();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="label">{label}</span>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: 6 }}>
        {options.map(([v, t]) => (
          <button key={String(v)} className="btn" onClick={() => setPrefs({ [k]: v } as Partial<Prefs>)}
            style={{ height: 48, borderWidth: 2, borderColor: p[k] === v ? 'var(--amber)' : undefined, color: p[k] === v ? 'var(--text)' : 'var(--muted)' }}>{t}</button>
        ))}
      </div>
    </div>
  );
}

function Passo({ label, value, unit, onChange }: { label: string; value: number; unit: string; onChange: (d: number) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="label">{label}</span>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 60px', gap: 6, alignItems: 'center' }}>
        <button className="btn" style={{ height: 48 }} onClick={() => onChange(-1)}>−</button>
        <span className="num" style={{ fontSize: 30, textAlign: 'center' }}>{fmt(value)} <span style={{ fontSize: 14, color: 'var(--muted)' }}>{unit}</span></span>
        <button className="btn" style={{ height: 48 }} onClick={() => onChange(1)}>+</button>
      </div>
    </div>
  );
}

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="card" style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
    <span className="num" style={{ fontSize: 20, color: 'var(--amber)' }}>{title}</span>
    {children}
  </section>
);

/** 23.1 a 23.7: luz de fundo dia/noite (só brilho, cores iguais), som e tela inicial. */
export function TelaSom() {
  const p = usePrefs();
  return (
    <main className="screen" style={{ flexDirection: 'row', gap: 12, paddingTop: 10 }}>
      <Card title="Tela">
        <Choice label="Luz de fundo em uso" k="tema" options={[['dia', 'Dia'], ['noite', 'Noite']]} />
        <Passo label="Brilho no modo dia" value={p.brilho} unit="%" onChange={(d) => setPrefs({ brilho: Math.max(10, Math.min(100, p.brilho + d * 10)) })} />
        <Passo label="Brilho no modo noite" value={p.brilhoNoite} unit="%" onChange={(d) => setPrefs({ brilhoNoite: Math.max(10, Math.min(100, p.brilhoNoite + d * 10)) })} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="label">Tela cheia</span>
          <button className="btn" style={{ height: 48 }} onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)}>Liga/desliga</button>
        </div>
      </Card>
      <Card title="Som e tela inicial">
        <Choice label="Bipe quando um alerta dispara" k="som" options={[[true, 'Ligado'], [false, 'Desligado']]} />
        <Choice label="Tela que abre ao conectar" k="telaInicial" options={[['painel', 'Painel'], ['menu', 'Menu'], ['mapa', 'Mapa de injeção']] as [Screen, string][]} />
        <span style={{ flexGrow: 1 }} />
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Estas escolhas ficam guardadas no aparelho da tela, não na ECU.</span>
      </Card>
    </main>
  );
}

/** 23.6 e 23.10: o que aparece em cada posição do painel, barra de RPM e zerar picos. */
export function PainelCfg() {
  const p = usePrefs();
  const [pag, setPag] = useState(p.painelAtual);
  const [pos, setPos] = useState<number>();
  const [ok, setOk] = useState(false);
  const ids = PAINEIS_PADRAO[0].map((d, i) => p.paineis[pag]?.[i] ?? PAINEIS_PADRAO[pag][i] ?? d);
  const troca = (i: number, id: string) => { const all = [0, 1, 2, 3].map((k) => [...(p.paineis[k] ?? PAINEIS_PADRAO[k])]); all[pag][i] = id; setPrefs({ paineis: all }); };
  if (pos != null) {
    return (
      <main className="screen" style={{ gap: 10, paddingTop: 10 }}>
        <span className="label">Painel {pag + 1} ({NOMES_PAINEL[pag]}) · {SLOTS[pos].name}: escolha o mostrador</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, overflowY: 'auto' }}>
          {Object.entries(GAUGES).map(([id, g]) => (
            <button key={id} className="btn" style={{ height: 54, fontSize: 15, borderWidth: 2, borderColor: ids[pos] === id ? 'var(--amber)' : undefined }}
              onClick={() => { troca(pos, id); setPos(undefined); }}>{g.name}</button>
          ))}
        </div>
        <button className="btn" style={{ height: 48, width: 160 }} onClick={() => setPos(undefined)}>Voltar</button>
      </main>
    );
  }
  const ativos = p.paineisAtivos;
  const slot = (i: number, style: React.CSSProperties) => (
    <button key={i} className="btn" style={{ position: 'absolute', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14, padding: 4, ...style }} onClick={() => setPos(i)}>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{SLOTS[i].name}</span>{GAUGES[ids[i]]?.name ?? ids[i]}
    </button>
  );
  return (
    <main className="screen" style={{ flexDirection: 'row', gap: 12, paddingTop: 10 }}>
      <Card title="Painéis (toque na tela do painel troca para o próximo)">
        <div style={{ display: 'flex', gap: 8 }}>
          {[0, 1, 2, 3].map((k) => (
            <button key={k} className={`btn${k === pag ? ' primary' : ''}`} style={{ flex: 1, height: 48 }} onClick={() => setPag(k)}>{k + 1} · {NOMES_PAINEL[k]}</button>
          ))}
        </div>
        {/* miniatura do painel: cada botão fica onde o mostrador aparece */}
        <div style={{ position: 'relative', height: 300, background: '#000', borderRadius: 10, border: '1px solid var(--line)' }}>
          <div style={{ position: 'absolute', left: 8, right: 8, top: 8, height: 34, borderRadius: 6, background: 'linear-gradient(90deg,#FFD400 60%,#FF8A00 85%,#FF1A1A)', color: '#000', fontWeight: 700, display: 'flex', alignItems: 'center', paddingLeft: 10, fontSize: 14 }}>Barra de RPM (fixa)</div>
          {slot(0, { left: 8, top: 52, width: 170, height: 130 })}
          {slot(1, { left: 186, top: 52, width: 150, height: 130 })}
          {slot(2, { left: 344, top: 52, width: 230, height: 90 })}
          {slot(3, { left: 8, top: 190, width: 82, height: 100 })}
          {slot(4, { left: 96, top: 190, width: 82, height: 100 })}
          {slot(5, { left: 186, top: 190, width: 150, height: 100 })}
          {slot(6, { left: 344, top: 150, width: 74, height: 140 })}
          {slot(7, { left: 422, top: 150, width: 74, height: 140 })}
          {slot(8, { left: 500, top: 150, width: 74, height: 140 })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ flex: 1, height: 48, borderColor: ativos[pag] ? 'var(--green)' : undefined }}
            onClick={() => { const n = [0, 1, 2, 3].map((k) => ativos[k] ?? true); n[pag] = !n[pag]; if (n.some(Boolean)) setPrefs({ paineisAtivos: n }); }}>
            {ativos[pag] ? 'Painel ligado (entra na troca)' : 'Painel desligado'}
          </button>
          <button className="btn" style={{ height: 48 }} onClick={() => { const all = [0, 1, 2, 3].map((k) => [...(p.paineis[k] ?? PAINEIS_PADRAO[k])]); all[pag] = [...PAINEIS_PADRAO[pag]]; setPrefs({ paineis: all }); }}>Voltar ao padrão</button>
        </div>
      </Card>
      <section style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Card title="Barra de RPM">
          <Passo label="Fim da barra" value={p.maxRpm} unit="RPM" onChange={(d) => setPrefs({ maxRpm: Math.max(1000, Math.min(15000, p.maxRpm + d * 250)) })} />
          <Passo label="Começo do vermelho" value={p.shiftRpm} unit="RPM" onChange={(d) => setPrefs({ shiftRpm: Math.max(1000, Math.min(15000, p.shiftRpm + d * 250)) })} />
        </Card>
        <button className="btn" style={{ height: 52 }} onClick={() => { zerarPicos(); setOk(true); }}>{ok ? 'Picos zerados' : 'Zerar picos'}</button>
      </section>
    </main>
  );
}

/** 23.11: unidades de medida. */
export function Unidades() {
  return (
    <main className="screen" style={{ flexDirection: 'row', gap: 12, paddingTop: 10 }}>
      <Card title="Unidades">
        <Choice label="Pressão (turbo, óleo, combustível)" k="pressure" options={[['bar', 'bar'], ['psi', 'psi']]} />
        <Choice label="Mistura" k="lambda" options={[['lambda', 'Lambda'], ['afr', 'AFR (gasolina)']]} />
      </Card>
    </main>
  );
}

/** 23.14 e 23.15: versões, odômetro e horímetro. */
export function Versao() {
  const s = useStatus();
  const v = useLive(['odometerTotal', 'odometerPartial', 'hourMeterTotal', 'hourMeterPartial']);
  const [msg, setMsg] = useState<string>();
  const hms = (x: number | null | undefined) => (x == null ? '–' : `${Math.floor(x / 3600)}h ${String(Math.floor((x % 3600) / 60)).padStart(2, '0')}min`);
  const linha = (a: string, b: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 15 }}><span style={{ color: 'var(--muted)' }}>{a}</span><b style={{ textAlign: 'right', wordBreak: 'break-all' }}>{b}</b></div>
  );
  return (
    <main className="screen" style={{ flexDirection: 'row', gap: 12, paddingTop: 10 }}>
      <Card title="Versões">
        {linha('App', APP_VERSION)}
        {linha('Firmware da ECU', s.ecuSignature ?? 'não conectado')}
        {linha('Arquivo .ini do app', s.iniSignature)}
        {s.signatureMatch === false && <div className="notice err">Versões diferentes: atualize o .ini do app antes de mexer no mapa.</div>}
      </Card>
      <Card title="Odômetro e horímetro">
        {linha('Odômetro total', `${fmt((v.odometerTotal ?? 0) / 1000, 1)} km`)}
        {linha('Odômetro parcial', `${fmt((v.odometerPartial ?? 0) / 1000, 1)} km`)}
        {linha('Horímetro total', hms(v.hourMeterTotal))}
        {linha('Horímetro parcial', hms(v.hourMeterPartial))}
        <button className="btn" style={{ height: 48 }} disabled={s.state !== 'conectado'}
          onClick={() => call('cmd', { name: 'cmd_odometer_reset_partial' }).then(() => setMsg('Parcial zerado.'), (e) => setMsg(e.message))}>Zerar o parcial</button>
        {msg && <div className="notice ok">{msg}</div>}
      </Card>
    </main>
  );
}
