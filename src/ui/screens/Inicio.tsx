// Tela inicial do computador (como a dos programas profissionais): mapa ativo em destaque, ECUs disponíveis,
// blocos de Mapas e Logs com atalhos e os arquivos abertos recentemente.
import { useEffect, useRef, useState } from 'react';
import { call, setLog, useStatus } from '../api';
import type { Screen } from '../App';
import { openFtmLater } from './ArquivoFtm';
import { EscolherIni } from './Conexao';
import { fromCsv, openLogFile } from './Datalogger';

type F = { kind: string; name: string; size: number; mtime: number };
type Ultimo = { nome: string; onde: string; quando: number };
const when = (ms: number) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} kB`);

/** Guarda qual foi o último mapa aberto ou salvo (aparece em destaque na tela inicial). */
export function lembrarMapa(nome: string, onde: string) {
  try { localStorage.setItem('ultimoMapa', JSON.stringify({ nome, onde, quando: Date.now() })); } catch { /* sem armazenamento */ }
}
function ultimoMapa(): Ultimo | undefined { try { return JSON.parse(localStorage.getItem('ultimoMapa') ?? 'null') ?? undefined; } catch { return undefined; } }

const I = ({ d }: { d: string }) => <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const IC = {
  ecu: 'M4 7h16v10H4zM8 7V4M16 7V4M8 20v-3M16 20v-3M8 11h8M8 14h5',
  pc: 'M3 5h18v11H3zM8 20h8M12 16v4',
  novo: 'M6 3h9l4 4v14H6zM14 3v5h5M12 11v6M9 14h6',
  exemplo: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13l2 2 4-4',
  importar: 'M12 3v12M7 10l5 5 5-5M4 17v3h16v-3',
  log: 'M3 3v18h18M7 15l3-4 3 3 5-7',
};

export function Inicio({ go }: { go: (s: Screen) => void }) {
  const s = useStatus();
  const on = s.state === 'conectado';
  const [list, setList] = useState<{ dir: string; files: F[] }>();
  const [ports, setPorts] = useState<{ path: string; label: string }[]>([]);
  const [msg, setMsg] = useState<string>();
  const mapRef = useRef<HTMLInputElement>(null), logRef = useRef<HTMLInputElement>(null);
  const ult = ultimoMapa();
  const load = () => call<{ dir: string; files: F[] }>('files').then(setList, (e) => setMsg(e.message));
  useEffect(() => {
    if (!s.bridgeUp) return;
    void load();
  }, [s.bridgeUp]);
  // Procura a ECU no USB a cada 3 s enquanto não há ECU ligada (a placa pode ser ligada depois de abrir o app).
  const [erroPortas, setErroPortas] = useState<string>();
  const procurar = () => call<{ path: string; label: string }[]>('serialPorts')
    .then((p) => { setPorts(p); setErroPortas(undefined); }, (e) => { setPorts([]); setErroPortas((e as Error).message); });
  useEffect(() => {
    if (!s.bridgeUp || (on && !s.offline)) return;
    void procurar();
    const t = setInterval(() => void procurar(), 3000);
    return () => clearInterval(t);
  }, [s.bridgeUp, on, s.offline]);

  const err = (e: unknown) => setMsg((e as Error).message);
  async function openMap(f: F) {
    try {
      if (/\.ecumap$/i.test(f.name)) {
        await call('mapLoad', { name: f.name }); lembrarMapa(f.name, `${list?.dir ?? 'ECU Arquivos'}/Mapas`); go('mapa'); return;
      }
      openFtmLater({ name: f.name, data: await call<string>('readFile', { kind: 'mapas', name: f.name }) }); go('ftm');
    } catch (e) { err(e); }
  }
  const b64 = (f: File) => new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] ?? ''); r.readAsDataURL(f); });
  async function mapFromPc(f?: File) {
    if (!f) return;
    try {
      if (/\.ftm$/i.test(f.name)) { openFtmLater({ name: f.name, data: await b64(f) }); go('ftm'); return; }
      await call('mapLoad', { data: await b64(f), name: f.name }); lembrarMapa(f.name, 'arquivo escolhido no computador'); go('mapa');
    } catch (e) { err(e); }
  }
  async function logFromPc(f?: File) { if (f) { setLog(fromCsv(f.name, await f.text())); go('datalogger'); } }

  const mapas = (list?.files ?? []).filter((f) => f.kind === 'mapas');
  const logs = (list?.files ?? []).filter((f) => f.kind === 'logs');
  const exemplos = mapas.filter((f) => /teste|exemplo/i.test(f.name));
  const Tile = ({ icon, label, onClick, disabled }: { icon: string[]; label: string; onClick: () => void; disabled?: boolean }) => (
    <button className="ini-tile" disabled={disabled} onClick={onClick}><span>{icon.map((d) => <I key={d} d={d} />)}</span>{label}</button>
  );
  const Recente = ({ f, onOpen }: { f: F; onOpen: () => void }) => (
    <button className="ini-file" onClick={onOpen} title="Abrir">
      <b>{f.name.replace(/\.(ecumap|csv)$/i, '')}</b>
      <small>{when(f.mtime)} · {size(f.size)}{/\.ftm$/i.test(f.name) ? ' · .ftm' : ''}</small>
    </button>
  );

  return (
    <main className="screen ini">
      <input ref={mapRef} type="file" accept=".ecumap,.ftm" hidden onChange={(e) => { void mapFromPc(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={logRef} type="file" accept=".csv,.msl,.txt" hidden onChange={(e) => { void logFromPc(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="ini-top">
        <section className="ini-hero">
          <div className="ini-hero-tag">BEM-VINDO À SUA ECU</div>
          <div className="ini-hero-body">
            <span className="label">Mapa ativo</span>
            <span className="num" style={{ fontSize: 36 }}>{s.offline ? s.offline.replace(/\.ecumap$/i, '') : on ? (s.demo ? 'Demonstração' : 'Mapa da ECU') : ult ? ult.nome.replace(/\.ecumap$/i, '') : 'Nenhum mapa aberto'}</span>
            {ult && <span>Último arquivo: <b>{ult.nome}</b> · {ult.onde}</span>}
            {ult && <span>Aberto/salvo em {when(ult.quando)}</span>}
            {s.offline && <span style={{ color: 'var(--cyan)' }}>Aberto sem ECU (offline). Edite à vontade; Salvar grava no arquivo.</span>}
            {on && <span style={{ color: 'var(--muted)' }}>Firmware: {s.ecuSignature}</span>}
            {s.dirty && <span style={{ color: 'var(--amber)' }}>Há mudanças ainda não gravadas na ECU.</span>}
          </div>
          <div className="ini-hero-logo">ECU</div>
        </section>
        <aside className="ini-ecus">
          <span className="num" style={{ fontSize: 24 }}>ECUs</span>
          <span className="label">ECUs disponíveis</span>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
            {on && !s.offline && <div className="ini-ecu on"><span className="dot" style={{ background: 'var(--green)' }} />{s.demo ? 'Demonstração' : s.message ?? 'Conectada'}<small>conectada</small></div>}
            {ports.map((p) => (
              <button key={p.path} className="ini-ecu" disabled={on && !s.offline} onClick={() => call('connectSerial', { path: p.path })}>
                <span className="dot" style={{ background: '#5a5e66' }} />{p.path.replace('/dev/', '')}<small>USB · conectar</small>
              </button>
            ))}
            {s.state === 'erro' && s.message && <div className="notice err" style={{ fontSize: 13 }}>{s.message}</div>}
            <EscolherIni />
            {(!on || s.offline) && ports.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 14 }}>Nenhuma ECU encontrada no USB<br />(procurando sozinho a cada 3 s)</div>}
            {erroPortas && <div className="notice err" style={{ fontSize: 13 }}>Não consegui listar as portas USB: {erroPortas}</div>}
          </div>
          {on && !s.offline
            ? <button className="btn" onClick={() => call('disconnect')}>Desconectar</button>
            : <button className="btn primary" disabled={!s.bridgeUp} onClick={() => call('demo')}>Usar a demonstração</button>}
          <button className="btn" onClick={() => go('conexao')}>Mais opções de conexão</button>
        </aside>
      </div>

      <section className="ini-band mapas">
        <h2>MAPAS</h2>
        <div className="ini-tiles">
          <Tile icon={[IC.ecu, IC.novo]} label="Abrir mapa da ECU" disabled={!on} onClick={() => go('mapa')} />
          <Tile icon={[IC.pc, IC.novo]} label="Abrir mapa do PC" onClick={() => mapRef.current?.click()} />
          <Tile icon={[IC.novo]} label="Assistente de novo mapa" disabled={!on} onClick={() => go('mapaPadrao')} />
          <Tile icon={[IC.exemplo]} label="Mapas de exemplo" disabled={!exemplos.length} onClick={() => exemplos[0] && openMap(exemplos[0])} />
          <Tile icon={[IC.importar]} label="Importar mapa .ftm" onClick={() => go('ftm')} />
        </div>
        <span className="ini-sub">Abertos recentemente</span>
        <div className="ini-files">
          {mapas.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhum mapa salvo ainda. Use "Salvar como" na barra de cima.</span>}
          {mapas.slice(0, 8).map((f) => <Recente key={f.name} f={f} onOpen={() => openMap(f)} />)}
        </div>
      </section>

      <section className="ini-band logs">
        <h2>LOGS</h2>
        <div className="ini-tiles">
          <Tile icon={[IC.ecu, IC.log]} label="Gravar log da ECU" disabled={!on || !!s.offline} onClick={() => go('datalogger')} />
          <Tile icon={[IC.pc, IC.log]} label="Abrir log do PC" onClick={() => logRef.current?.click()} />
        </div>
        <span className="ini-sub">Abertos recentemente</span>
        <div className="ini-files">
          {logs.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhum log salvo ainda.</span>}
          {logs.slice(0, 8).map((f) => <Recente key={f.name} f={f} onOpen={() => openLogFile(f.name).then(() => go('datalogger'), err)} />)}
        </div>
      </section>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--muted)', fontSize: 12 }}>
        <span>Arquivos em {list?.dir ?? '…'}</span>
        <button className="btn" style={{ height: 28, fontSize: 12 }} onClick={() => call('openFolder')}>Abrir pasta no Finder</button>
        <button className="btn" style={{ height: 28, fontSize: 12 }} onClick={load}>Atualizar</button>
      </div>
      {msg && <div className="notice err" onClick={() => setMsg(undefined)}>{msg}</div>}
    </main>
  );
}
