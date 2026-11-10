// Favoritos (manual de referência cap. 22): atalhos para as telas mais usadas, de qualquer menu.
// Toque em "Editar" para escolher; a escolha fica no aparelho da tela.
import { useState } from 'react';
import type { Screen } from '../App';
import { setPrefs, usePrefs } from '../prefs';
import { TILES } from './Menu';
import { SUBMENUS } from './SubMenu';

type Atalho = { go: Screen; label: string; grupo: string };
// Todas as telas que podem virar favorito: menu principal + itens de cada submenu.
const ATALHOS: Atalho[] = [
  ...TILES.filter((t) => t.go && t.go !== ('favoritos' as Screen)).map((t) => ({ go: t.go!, label: t.name, grupo: 'Menu principal' })),
  ...Object.values(SUBMENUS).flatMap((m) => m.items.map((i) => ({ go: i.go, label: i.label, grupo: m.title }))),
];
const porTela = new Map(ATALHOS.map((a) => [a.go, a]));

export function Favoritos({ go }: { go: (s: Screen) => void }) {
  const p = usePrefs();
  const [edit, setEdit] = useState(false);
  const toggle = (s: Screen) => setPrefs({ favorites: p.favorites.includes(s) ? p.favorites.filter((x) => x !== s) : [...p.favorites, s] });
  const favs = p.favorites.map((f) => porTela.get(f)).filter((a): a is Atalho => !!a);
  const grupos = [...new Set(ATALHOS.map((a) => a.grupo))];

  return (
    <main className="screen" style={{ gap: 12, paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flexGrow: 1, fontSize: 14, color: 'var(--muted)' }}>{edit ? 'Toque nas telas para marcar ou desmarcar (★ = favorito).' : favs.length ? 'Toque para abrir.' : 'Nenhum favorito ainda. Toque em Editar.'}</span>
        <button className={`btn ${edit ? 'primary' : ''}`} style={{ height: 46, width: 140 }} onClick={() => setEdit((e) => !e)}>{edit ? 'Pronto' : 'Editar'}</button>
      </div>
      {edit ? (
        <section style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grupos.map((g) => (
            <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="label" style={{ color: 'var(--amber)' }}>{g}</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                {ATALHOS.filter((a) => a.grupo === g).map((a) => {
                  const fav = p.favorites.includes(a.go);
                  return (
                    <button key={a.go + a.label} className="btn" onClick={() => toggle(a.go)}
                      style={{ height: 50, fontSize: 13, justifyContent: 'flex-start', textAlign: 'left', borderWidth: 2, borderColor: fav ? 'var(--amber)' : undefined }}>
                      <span style={{ color: fav ? 'var(--amber)' : 'var(--muted)', fontSize: 18 }}>{fav ? '★' : '☆'}</span>{a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section style={{ flexGrow: 1, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gridAutoRows: 'minmax(0, 104px)', gap: 12, alignContent: 'start' }}>
          {favs.map((a) => (
            <button key={a.go} className="card" onClick={() => go(a.go)}
              style={{ padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, textAlign: 'left', cursor: 'pointer' }}>
              <span className="num" style={{ fontSize: 20, lineHeight: 1.1 }}>{a.label}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{a.grupo}</span>
            </button>
          ))}
        </section>
      )}
    </main>
  );
}
