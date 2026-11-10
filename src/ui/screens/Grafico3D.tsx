// Gráfico 3D do mapa (programas profissionais para computador, área 9). Arraste para girar.
import { useEffect, useRef, useState } from 'react';
import { heat } from './MapaInjecao';

export function Grafico3D({ values, rows, cols, live, sel }: { values: number[]; rows: number; cols: number; live?: [number, number]; sel?: [number, number, number, number] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [rot, setRot] = useState({ yaw: -0.7, pitch: 0.95 });
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number }>(undefined);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
    const cy = Math.cos(rot.yaw), sy = Math.sin(rot.yaw), cp = Math.cos(rot.pitch), sp = Math.sin(rot.pitch);
    const S = Math.min(W, H) * 0.85 * zoom;
    const proj = (r: number, c: number, v: number) => {
      const x = c / (cols - 1) - 0.5, y = r / (rows - 1) - 0.5, z = ((v - lo) / span) * 0.55 - 0.2;
      const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
      const up = y1 * sp + z * cp, d = -y1 * cp + z * sp;
      return { X: W / 2 + x1 * S, Y: H / 2 + 8 - up * S * 0.9, d };
    };
    const P = (r: number, c: number) => proj(r, c, values[r * cols + c]);
    const quads: { pts: { X: number; Y: number }[]; d: number; color: string; mark?: string }[] = [];
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < cols - 1; c++) {
        const pts = [P(r, c), P(r, c + 1), P(r + 1, c + 1), P(r + 1, c)];
        const v = (values[r * cols + c] + values[r * cols + c + 1] + values[(r + 1) * cols + c] + values[(r + 1) * cols + c + 1]) / 4;
        const inSel = sel && r >= sel[0] && r < Math.max(sel[1], sel[0] + 1) && c >= sel[2] && c < Math.max(sel[3], sel[2] + 1);
        const isLive = live && (r === live[0] || r === live[0] - 1) && (c === live[1] || c === live[1] - 1);
        quads.push({ pts, d: pts.reduce((a, p) => a + p.d, 0) / 4, color: heat(v, lo, hi), mark: isLive ? '#4CC9F0' : inSel ? '#FF9F1C' : undefined });
      }
    quads.sort((a, b) => a.d - b.d);
    for (const q of quads) {
      g.beginPath();
      q.pts.forEach((p, i) => (i ? g.lineTo(p.X, p.Y) : g.moveTo(p.X, p.Y)));
      g.closePath();
      g.fillStyle = q.color; g.fill();
      g.strokeStyle = q.mark ?? 'rgba(0,0,0,.35)'; g.lineWidth = q.mark ? 2 : 0.6; g.stroke();
    }
  }, [values, rows, cols, rot, zoom, live?.[0], live?.[1], sel?.join()]);

  return (
    <canvas ref={ref} style={{ width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' }} title="Arraste para girar · roda do mouse dá zoom"
      onWheel={(e) => setZoom((z) => Math.max(0.5, Math.min(3, z * (e.deltaY > 0 ? 0.9 : 1.1))))}
      onDoubleClick={() => { setZoom(1); setRot({ yaw: -0.7, pitch: 0.95 }); }}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
        drag.current = { x: e.clientX, y: e.clientY };
        setRot((r) => ({ yaw: r.yaw + dx * 0.01, pitch: Math.max(0.15, Math.min(1.5, r.pitch + dy * 0.01)) }));
      }}
      onPointerUp={() => (drag.current = undefined)} />
  );
}
