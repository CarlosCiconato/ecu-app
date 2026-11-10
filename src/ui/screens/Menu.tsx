import type { Screen } from '../App';

type Tone = { bg: string; fg: string };
const amber: Tone = { bg: '#2A2116', fg: '#FF9F1C' };
const cyan: Tone = { bg: '#14262D', fg: '#4CC9F0' };
const red: Tone = { bg: '#2D1719', fg: '#FF7A7E' };
const grey: Tone = { bg: '#1F2226', fg: '#C9CCD1' };

export const TILES: { tone: Tone; name: string; sub: string; go?: Screen; icon: string }[] = [
  { tone: cyan, name: 'Painel de instrumentos', sub: 'Turbo, lambda, RPM', go: 'painel', icon: 'M3 15a9 9 0 0 1 18 0M12 15l4-5' },
  { tone: amber, name: 'Mapas de injeção', sub: 'Mapa em ms e compensações', go: 'menuInjecao', icon: 'M12 3c3 4.5 5 7.3 5 10a5 5 0 0 1-10 0c0-2.7 2-5.5 5-10z' },
  { tone: amber, name: 'Mapas de ignição', sub: 'Avanço e compensações', go: 'menuIgnicao', icon: 'M13 2 4 14h7l-1 8 9-12h-7z' },
  { tone: red, name: 'Alertas', sub: 'Turbo, óleo, temperatura', go: 'alertas', icon: 'M12 3 2 20h20zM12 10v4M12 17v.5' },
  { tone: grey, name: 'Configuração do motor', sub: 'Motor, fase, bicos, saídas', go: 'menuMotor', icon: 'M4 10h3l2-3h6l2 3h3v7H4zM8 17v2M16 17v2' },
  { tone: grey, name: 'Configuração da interface', sub: 'Unidades, tela, senhas', go: 'menuInterface', icon: 'M4 5h16v11H4zM9 20h6M12 16v4' },
  { tone: grey, name: 'Gerenciador de ajustes', sub: 'Ajustes 1 a 3, mapa padrão', go: 'ajustes', icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7' },
  { tone: grey, name: 'Sensores e calibração', sub: 'TPS, pedal, pressão, sonda', go: 'menuSensores', icon: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4v4M10 10v4' },
  { tone: amber, name: 'Outras funções', sub: 'Turbo, lenta, ventoinha, PWM, CAN', go: 'menuOutras', icon: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { tone: grey, name: 'Funções de arrancada', sub: '2-step e largada', icon: 'M4 21V4M4 4h12l-2 4 2 4H4' },
  { tone: grey, name: 'Favoritos', sub: 'Atalhos mais usados', go: 'favoritos', icon: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z' },
  { tone: cyan, name: 'Diagnóstico', sub: 'Sensores, testes de saídas', go: 'menuDiag', icon: 'M3 12h4l2-5 4 10 2-5h6' },
];

export function Menu({ go }: { go: (s: Screen) => void }) {
  return (
    <main className="screen" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gridTemplateRows: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
      {TILES.map((t) => (
        <button key={t.name} className="card" onClick={() => t.go && go(t.go)} disabled={!t.go}
          style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: t.go ? 'pointer' : 'default', opacity: t.go ? 1 : 0.55 }}>
          <span style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 12, background: t.tone.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={t.tone.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={t.icon} /></svg>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="num" style={{ fontSize: 22, lineHeight: 1.05 }}>{t.name}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.25 }}>{t.go ? t.sub : 'Fica para o fim'}</span>
          </span>
        </button>
      ))}
    </main>
  );
}
