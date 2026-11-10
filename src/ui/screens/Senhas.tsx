// Senhas (item 46 do firmware): usuário, preparador e manutenção.
// A senha fica na ECU, fora do ajuste. 3 erros seguidos = 30 s bloqueado.
import { useEffect, useState } from 'react';
import { call, useLive, useStatus } from '../api';

const LEVELS = [
  { key: 'User', name: 'Usuário', bit: 1, lockedBit: 0, desc: 'Trava o computador, os menus e/ou a partida do motor.' },
  { key: 'Tuner', name: 'Preparador', bit: 2, lockedBit: 64, desc: 'Protege o ajuste. Também libera a senha do usuário.' },
  { key: 'Maintenance', name: 'Manutenção', bit: 4, lockedBit: 128, desc: 'Para a oficina mexer sem ver o ajuste.' },
] as const;
const LOCKS: [number, string][] = [[1, 'Computador'], [2, 'Menus da tela'], [4, 'Partida do motor']];
const RESULT: Record<number, string> = { 1: 'Feito.', 2: 'Senha errada.', 3: 'Muitas tentativas erradas. Espere', 4: 'Senha inválida.' };

export function Senhas() {
  const s = useStatus();
  const v = useLive(['pinStatus', 'pinLastResult', 'pinLockoutLeft']);
  const [level, setLevel] = useState<(typeof LEVELS)[number]['key']>('User');
  const [mode, setMode] = useState<'liberar' | 'trocar'>('liberar');
  const [entry, setEntry] = useState('');
  const [newPin, setNewPin] = useState('');
  const [field, setField] = useState<'entry' | 'new'>('entry');
  const [locks, setLocks] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (s.state === 'conectado') call<{ ecuPasswords_userLocks: number }>('constants', { names: ['ecuPasswords_userLocks'] }).then((c) => setLocks(c.ecuPasswords_userLocks ?? 0), () => undefined);
  }, [s.state]);

  if (s.state !== 'conectado') return <main className="screen"><div className="notice err">Conecte na ECU para ver as senhas.</div></main>;
  const st = v.pinStatus ?? 0;
  const L = LEVELS.find((x) => x.key === level)!;
  const has = !!(st & L.bit);
  const locked = level === 'User' ? !!(st & (8 | 16 | 32)) : !!(st & L.lockedBit);

  async function send(action: string, extra: Record<string, number> = {}) {
    setBusy(true);
    try {
      await call('password', { action, entry: Number(entry || 0), ...extra });
      setSent(true); setEntry(''); setNewPin('');
    } catch { /* o resultado aparece pelo pinLastResult */ }
    finally { setBusy(false); }
  }
  const press = (k: string) => {
    const set = field === 'entry' ? setEntry : setNewPin;
    if (k === '⌫') set((p) => p.slice(0, -1)); else if (k === 'C') set(''); else set((p) => (p.length < 8 ? p + k : p));
  };
  const box = (label: string, val: string, f: 'entry' | 'new') => (
    <button className="card" onClick={() => setField(f)} style={{ padding: '8px 12px', textAlign: 'left', borderWidth: 2, borderColor: field === f ? 'var(--amber)' : undefined, cursor: 'pointer' }}>
      <span className="label">{label}</span>
      <div className="num" style={{ fontSize: 30, letterSpacing: 6, minHeight: 36 }}>{'•'.repeat(val.length) || ' '}</div>
    </button>
  );
  const result = sent && v.pinLastResult ? `${RESULT[v.pinLastResult] ?? ''}${v.pinLastResult === 3 ? ` ${v.pinLockoutLeft ?? ''} s.` : ''}` : '';

  return (
    <main className="screen" style={{ flexDirection: 'row', gap: 12, paddingTop: 10 }}>
      <section style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {LEVELS.map((x) => {
          const h = !!(st & x.bit);
          const lk = x.key === 'User' ? !!(st & (8 | 16 | 32)) : !!(st & x.lockedBit);
          return (
            <button key={x.key} className="card" onClick={() => { setLevel(x.key); setSent(false); setEntry(''); setNewPin(''); setField('entry'); }}
              style={{ padding: '10px 14px', textAlign: 'left', cursor: 'pointer', borderWidth: 2, borderColor: level === x.key ? 'var(--amber)' : undefined }}>
              <div className="num" style={{ fontSize: 22 }}>{x.name}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: !h ? 'var(--muted)' : lk ? 'var(--red)' : 'var(--green)' }}>{!h ? 'Sem senha' : lk ? 'Travado' : 'Liberado'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{x.desc}</div>
            </button>
          );
        })}
        <span style={{ flexGrow: 1 }} />
        <button className="btn" style={{ height: 50 }} disabled={busy} onClick={() => send('lockAll')}>Travar tudo agora</button>
      </section>

      <section className="card" style={{ flexGrow: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {(['liberar', 'trocar'] as const).map((m) => (
            <button key={m} className="btn" style={{ height: 44, borderWidth: 2, borderColor: mode === m ? 'var(--amber)' : undefined }} onClick={() => { setMode(m); setField('entry'); setSent(false); }}>
              {m === 'liberar' ? 'Liberar' : has ? 'Trocar ou tirar a senha' : 'Criar senha'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexGrow: 1, minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(mode === 'liberar' || has) && box(mode === 'liberar' ? `Senha de ${L.name.toLowerCase()}` : 'Senha atual', entry, 'entry')}
            {mode === 'trocar' && box('Senha nova (vazia = tirar a senha)', newPin, 'new')}
            {mode === 'trocar' && level === 'User' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="label">A senha de usuário trava</span>
                {LOCKS.map(([bit, t]) => (
                  <button key={bit} className="btn" style={{ height: 40, justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', borderColor: locks & bit ? 'var(--amber)' : undefined }}
                    onClick={() => setLocks((p) => p ^ bit)}><span>{locks & bit ? '☑' : '☐'}</span>{t}</button>
                ))}
              </div>
            )}
            <span style={{ flexGrow: 1 }} />
            {result && <div className={`notice ${v.pinLastResult === 1 ? 'ok' : 'err'}`}>{result}</div>}
            {!result && locked && <div className="notice err">{L.name}: travado.</div>}
            <button className="btn primary" style={{ height: 54, fontSize: 18 }} disabled={busy || (mode === 'liberar' && !entry)}
              onClick={() => (mode === 'liberar' ? send(`unlock${level}`) : send(`set${level}`, { newPin: Number(newPin || 0), locks }))}>
              {mode === 'liberar' ? 'Liberar' : newPin ? 'Salvar a senha' : 'Tirar a senha'}
            </button>
          </div>
          <div style={{ width: 260, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '1fr', gap: 6 }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
              <button key={k} className="btn" style={{ fontSize: 26 }} onClick={() => press(k)}>{k}</button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
