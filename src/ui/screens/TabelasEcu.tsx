// Lista de todas as tabelas do .ini da ECU conectada (Speeduino e outras que não são a nossa).
// Cada uma abre no mesmo editor de mapa do app.
import { useEffect, useState, type ReactElement } from 'react';
import { call, useStatus } from '../api';
import type { Screen } from '../App';
import type { MapaConfig } from './MapaInjecao';

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

export function TabelasEcu({ go }: { go: (s: Screen) => void }) {
  const s = useStatus();
  const [lista, setLista] = useState<{ name: string; title: string }[]>([]);
  useEffect(() => { if (s.state === 'conectado') call<{ name: string; title: string }[]>('tabelasIni').then(setLista, () => setLista([])); }, [s.state, s.iniSignature]);
  return (
    <main className="screen" style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: '80px', gap: 12, alignContent: 'start', paddingTop: 10 }}>
      {lista.length === 0 && <div className="notice">Conecte uma ECU para ver as tabelas dela.</div>}
      {lista.map((t) => (
        <button key={t.name} className="card" onClick={() => go(`t_ini_${t.name}` as Screen)}
          style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4, flexGrow: 1 }}>
            <span className="num" style={{ fontSize: 20 }}>{t.title}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t.name}</span>
          </span>
          <span style={{ fontSize: 26, color: 'var(--muted)' }}>›</span>
        </button>
      ))}
    </main>
  );
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
