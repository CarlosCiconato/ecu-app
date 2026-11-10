// Tema do programa (manual de referência 24.9): escuro, claro 1, claro 2 e cor de destaque à escolha.
import { useState } from 'react';

type T = { tema: 'escuro' | 'claro1' | 'claro2'; destaque: string };
const PADRAO: T = { tema: 'escuro', destaque: '#FF9F1C' };
export function lerTema(): T { try { return { ...PADRAO, ...JSON.parse(localStorage.getItem('tema') ?? '{}') }; } catch { return PADRAO; } }
export function aplicarTema(t: T = lerTema()) {
  const r = document.documentElement;
  if (t.tema === 'escuro') delete r.dataset.tema; else r.dataset.tema = t.tema;
  r.style.setProperty('--amber', t.destaque);
}

export function Tema() {
  const [t, setT] = useState(lerTema());
  const mudar = (p: Partial<T>) => { const n = { ...t, ...p }; setT(n); aplicarTema(n); try { localStorage.setItem('tema', JSON.stringify(n)); } catch { /* sem armazenamento */ } };
  const opc: [T['tema'], string, string[]][] = [
    ['escuro', 'Escuro (padrão)', ['#0E0F11', '#17191C', '#F2F2F0']],
    ['claro1', 'Claro 1', ['#eceef1', '#ffffff', '#16181b']],
    ['claro2', 'Claro 2', ['#1f3247', '#f7f9fc', '#13202e']],
  ];
  return (
    <main className="screen" style={{ gap: 16 }}>
      <span className="label">Tema do programa no computador. A tela do carro não muda.</span>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {opc.map(([id, nome, cores]) => (
          <button key={id} className="card" onClick={() => mudar({ tema: id })}
            style={{ width: 220, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', borderWidth: 2, borderColor: t.tema === id ? 'var(--amber)' : undefined }}>
            <span style={{ display: 'flex', height: 70, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
              {cores.map((c) => <span key={c} style={{ flex: 1, background: c }} />)}
            </span>
            <span className="num" style={{ fontSize: 20 }}>{nome}</span>
          </button>
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="label">Cor de destaque (personalizada)</span>
        <input type="color" value={t.destaque} onChange={(e) => mudar({ destaque: e.target.value })} style={{ width: 60, height: 36, border: 'none', background: 'none' }} />
        <button className="btn" onClick={() => mudar(PADRAO)}>Restaurar padrões</button>
      </label>
    </main>
  );
}
