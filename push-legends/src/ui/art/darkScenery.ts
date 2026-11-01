import type { Ctx } from './draw';

/**
 * Dark castle backdrop for 2D banners (home screen, 2D battle fallback): a dusk sky in the world's
 * mood, distant mountains, a gothic castle silhouette with lit windows and drifting embers. Matches
 * the 3D castle-courtyard arenas.
 */
const MOOD: { top: string; low: string; glow: string; window: string }[] = [
  { top: '#1a1416', low: '#5a2e1c', glow: '#ff9a4a', window: '#ffb35c' }, // golden-hour dusk
  { top: '#0e1520', low: '#34485e', glow: '#a8d8ff', window: '#ffcf8a' }, // frost
  { top: '#1a0b08', low: '#5e1a0c', glow: '#ff5a1f', window: '#ff8a3a' }, // forge
  { top: '#0d110f', low: '#2a3a2e', glow: '#7fd6a0', window: '#9cff7a' }, // ruins
  { top: '#0b0812', low: '#2a1544', glow: '#b07aff', window: '#c9a2ff' }, // crystal night
];

export function drawDarkBackdrop(ctx: Ctx, world: number, w: number, h: number, ground: number, t: number): void {
  const m = MOOD[world] ?? MOOD[0]!;
  const sky = ctx.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, m.top);
  sky.addColorStop(1, m.low);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // Low sun / glow on the horizon
  const glow = ctx.createRadialGradient(w * 0.62, ground, 4, w * 0.62, ground, w * 0.55);
  glow.addColorStop(0, `${m.glow}66`);
  glow.addColorStop(1, `${m.glow}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, ground);
  // Mountains
  ctx.fillStyle = 'rgba(12,10,12,0.55)';
  ctx.beginPath();
  ctx.moveTo(0, ground);
  for (let x = 0; x <= w; x += w / 9) ctx.lineTo(x, ground - h * (0.18 + 0.12 * Math.abs(Math.sin(x * 0.021 + world))));
  ctx.lineTo(w, ground);
  ctx.fill();
  // Castle silhouette: curtain wall with battlements, towers with spires, a keep
  ctx.fillStyle = '#0b0a0c';
  const wallTop = ground - h * 0.16;
  ctx.fillRect(0, wallTop, w, ground - wallTop);
  for (let x = 0; x < w; x += 12) ctx.fillRect(x, wallTop - 5, 7, 5);
  const towers = [0.12, 0.34, 0.55, 0.8].map((f) => f * w);
  towers.forEach((tx, i) => {
    const tw = i === 2 ? 34 : 22;
    const th = h * (i === 2 ? 0.55 : 0.36);
    ctx.fillRect(tx - tw / 2, ground - th, tw, th);
    ctx.beginPath();
    ctx.moveTo(tx - tw / 2 - 3, ground - th);
    ctx.lineTo(tx, ground - th - h * (i === 2 ? 0.2 : 0.14));
    ctx.lineTo(tx + tw / 2 + 3, ground - th);
    ctx.fill();
    // Lit windows flicker softly
    ctx.fillStyle = m.window;
    for (let k = 0; k < 2; k++) {
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 2.3 + i * 1.7 + k);
      ctx.fillRect(tx - 2, ground - th + 10 + k * 16, 4, 7);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0b0a0c';
  });
  // Ground
  const g = ctx.createLinearGradient(0, ground, 0, h);
  g.addColorStop(0, '#1a1716');
  g.addColorStop(1, '#0b0a0a');
  ctx.fillStyle = g;
  ctx.fillRect(0, ground, w, h - ground);
  // Embers
  ctx.fillStyle = m.glow;
  for (let i = 0; i < 14; i++) {
    const life = (t * (0.08 + (i % 4) * 0.02) + i * 0.13) % 1;
    ctx.globalAlpha = Math.sin(life * Math.PI) * 0.7;
    ctx.fillRect(((i * 0.377) % 1) * w + Math.sin(t + i) * 6, h - life * h, 2, 2);
  }
  ctx.globalAlpha = 1;
}
