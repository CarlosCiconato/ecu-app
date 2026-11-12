// Calibração dos sensores da Speeduino (o "Calibrar tabelas dos termistores" e "Calibrar AFR" do TunerStudio):
// escolhe o sensor (lista do .ini ou valores próprios), vê a curva e manda para a ECU, que grava sozinha.
import { useEffect, useMemo, useState } from 'react';
import { call } from '../api';
import { fmt } from '../format';
import { adcDoPonto, curvaLinear, curvaTermistor } from '../../core/calibracao';

type Info = {
  id: string; title: string; tipo: 'temperatura' | 'sonda'; pontos: number;
  tabelas: { idx: number; nome: string }[];
  termistores: { nome: string; bias: number; pontos: [number, number][] }[];
  sondas: [string, number, number, number, number][];
};

const num = (s: string) => Number(s.replace(',', '.'));

export function CalibracaoIni({ id }: { id: string }) {
  const [info, setInfo] = useState<Info>();
  const [erro, setErro] = useState<string>();
  const [tabela, setTabela] = useState(0);
  const [preset, setPreset] = useState('');
  const [v, setV] = useState<string[]>([]); // temperatura: bias, t1, r1, t2, r2, t3, r3 · sonda: v1, a1, v2, a2
  const [msg, setMsg] = useState<{ ok: boolean; texto: string }>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    call<Info>('calibracaoIni', { alvo: id }).then((i) => {
      setInfo(i); setTabela(i.tabelas[0]?.idx ?? 0);
      if (i.tipo === 'sonda' && i.sondas[0]) escolhe(i, i.sondas[0][0]);
      else if (i.termistores[0]) escolhe(i, i.termistores[0].nome);
    }, (e) => setErro((e as Error).message));
  }, [id]);

  function escolhe(i: Info, nome: string) {
    setPreset(nome); setMsg(undefined);
    if (i.tipo === 'sonda') { const s = i.sondas.find((x) => x[0] === nome); if (s) setV(s.slice(1).map(String)); }
    else { const t = i.termistores.find((x) => x.nome === nome); if (t) setV([t.bias, ...t.pontos.flat()].map(String)); }
  }

  const curva = useMemo(() => {
    if (!info || v.some((x) => !Number.isFinite(num(x)))) return undefined;
    const n = v.map(num);
    try {
      if (info.tipo === 'sonda') return n[0] === n[2] ? undefined : curvaLinear(n[0], n[1], n[2], n[3], 11).map((y, i) => [(i * 5) / 10, y]);
      const c = curvaTermistor(n[0], [[n[1], n[2]], [n[3], n[4]], [n[5], n[6]]], info.pontos);
      return c.map((t, i) => [(adcDoPonto(i, info.pontos) * 5) / 1023, t]).filter(([, t]) => Number.isFinite(t));
    } catch { return undefined; }
  }, [info, v]);

  if (erro) return <main className="screen"><div className="notice err">{erro}</div></main>;
  if (!info) return <main className="screen"><span className="label">Lendo…</span></main>;
  const sonda = info.tipo === 'sonda';
  const nomes = sonda ? info.sondas.map((s) => s[0]) : info.termistores.map((t) => t.nome);
  const campos = sonda
    ? [['Tensão 1 (V)', 0], ['AFR na tensão 1', 1], ['Tensão 2 (V)', 2], ['AFR na tensão 2', 3]] as const
    : [['Resistor bias da placa (Ω)', 0], ['Ponto 1: °C', 1], ['Ponto 1: Ω', 2], ['Ponto 2: °C', 3], ['Ponto 2: Ω', 4], ['Ponto 3: °C', 5], ['Ponto 3: Ω', 6]] as const;

  async function enviar() {
    setEnviando(true); setMsg(undefined);
    const n = v.map(num);
    const p = sonda ? { v1: n[0], a1: n[1], v2: n[2], a2: n[3] } : { bias: n[0], pontos: [[n[1], n[2]], [n[3], n[4]], [n[5], n[6]]] };
    try {
      await call('calibrar', { alvo: id, tabela, p });
      setMsg({ ok: true, texto: `Enviado: a ECU gravou a calibração de ${info!.tabelas.find((t) => t.idx === tabela)?.nome.toLowerCase()} (${preset || 'valores próprios'}).` });
    } catch (e) { setMsg({ ok: false, texto: (e as Error).message }); }
    setEnviando(false);
  }

  return (
    <main className="screen" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 10 }}>
      <div className="notice">Faça com o motor desligado. A ECU grava a calibração sozinha ao receber (não precisa gravar depois).</div>
      {info.tabelas.length > 1 && (
        <div style={{ display: 'flex', gap: 8 }}>
          {info.tabelas.map((t) => <button key={t.idx} className={`btn${tabela === t.idx ? ' on' : ''}`} style={{ height: 44, flex: 1, outline: tabela === t.idx ? '2px solid var(--amber)' : undefined }} onClick={() => { setTabela(t.idx); setMsg(undefined); }}>{t.nome}</button>)}
        </div>
      )}
      <section className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
        <span className="label">{sonda ? 'Sonda (saída analógica 0-5 V)' : 'Sensor (termistor)'}</span>
        <select className="field" value={nomes.includes(preset) ? preset : ''} onChange={(e) => (e.target.value ? escolhe(info, e.target.value) : setPreset(''))}>
          {nomes.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value="">Valores próprios</option>
        </select>
        <div style={{ display: 'grid', gridTemplateColumns: sonda ? 'repeat(2, 1fr)' : '1fr 1fr', gap: 8 }}>
          {campos.map(([rot, i]) => (
            <label key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: !sonda && i === 0 ? '1 / -1' : undefined }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{rot}</span>
              <input className="field" inputMode="decimal" value={v[i] ?? ''} onChange={(e) => { const n = v.slice(); n[i] = e.target.value; setV(n); setPreset(''); setMsg(undefined); }} />
            </label>
          ))}
        </div>
        {!sonda && <span style={{ fontSize: 12, color: 'var(--muted)' }}>O bias é o resistor da placa entre o sensor e 5 V (2490 Ω nas placas Speeduino). Os 3 pontos vêm da tabela do fabricante do sensor: temperatura e resistência.</span>}
      </section>
      {curva && (
        <section className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <span className="label">Como vai ficar ({sonda ? 'tensão → AFR' : 'tensão → °C'})</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 14 }}>
            {curva.filter((_, i) => sonda || i % 3 === 0).map(([x, y]) => <span key={x} className="num">{fmt(x, 2)} V = <b>{fmt(y, sonda ? 1 : 0)}</b>{sonda ? '' : ' °C'}</span>)}
          </div>
        </section>
      )}
      {!curva && <div className="notice err">Confira os números: com esses valores não dá para montar a curva.</div>}
      <button className="btn" style={{ height: 52, fontSize: 18, flexShrink: 0 }} disabled={!curva || enviando} onClick={() => void enviar()}>{enviando ? 'Enviando…' : 'Enviar para a ECU'}</button>
      {msg && <div className={`notice${msg.ok ? '' : ' err'}`}>{msg.texto}</div>}
    </main>
  );
}
