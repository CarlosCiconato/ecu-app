// Arrastar o dedo sobre uma grade de células (mapas, curvas).
// No celular o toque fica preso na célula onde começou e o navegador tenta rolar a tela;
// aqui ouvimos a janela inteira até o dedo sair, achamos a célula embaixo do dedo e não deixamos rolar.
export function arrastarDedo(seletor: string, naCelula: (el: HTMLElement) => void) {
  const achar = (x: number, y: number) => {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>(seletor);
    if (el) naCelula(el);
  };
  const tmove = (e: TouchEvent) => { e.preventDefault(); const t = e.touches[0]; if (t) achar(t.clientX, t.clientY); };
  const pmove = (e: PointerEvent) => { if (e.pointerType !== 'mouse') achar(e.clientX, e.clientY); };
  const fim = () => {
    window.removeEventListener('touchmove', tmove);
    window.removeEventListener('pointermove', pmove);
    for (const t of ['touchend', 'touchcancel', 'pointerup', 'pointercancel']) window.removeEventListener(t, fim);
  };
  window.addEventListener('touchmove', tmove, { passive: false });
  window.addEventListener('pointermove', pmove);
  for (const t of ['touchend', 'touchcancel', 'pointerup', 'pointercancel']) window.addEventListener(t, fim);
}
