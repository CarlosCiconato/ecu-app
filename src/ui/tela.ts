import { useEffect, useState } from 'react';

// A tela é desenhada com 600 px de altura. Em telas mais largas que 1024×600 (celular deitado),
// a largura cresce para ocupar a tela toda, sem faixas pretas dos lados.
function medir() {
  const w = window.innerWidth, h = window.innerHeight;
  const largura = Math.round(Math.min(1400, Math.max(1024, (600 * w) / h)));
  return { largura, scale: Math.min(w / largura, h / 600) };
}
export function useTela() {
  const [t, setT] = useState(medir);
  useEffect(() => {
    const f = () => setT(medir());
    window.addEventListener('resize', f);
    window.addEventListener('orientationchange', f);
    return () => { window.removeEventListener('resize', f); window.removeEventListener('orientationchange', f); };
  }, []);
  return t;
}
