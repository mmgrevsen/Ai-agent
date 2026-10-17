import type { Ctx } from './draw';
import { FACTIONS, PAL, UNIT_LOOK } from './darkArt';

/**
 * Card art. Every card portrait is rendered from the unit's own 3D battle model (battle3d/portrait.ts),
 * so the card always shows the character that is deployed. three.js is loaded on first use and the
 * portraits are baked one per frame and kept in memory.
 *
 * While a portrait is being baked the card shows its faction backdrop. Without WebGL (or if baking
 * fails) the card shows a dark placeholder that is labelled as such; no other art is substituted.
 */
type Baker = typeof import('../battle3d/portraitBake');

const cache = new Map<string, HTMLCanvasElement>();
const failed = new Set<string>();
const queue: string[] = [];
const listeners = new Set<() => void>();
let baker: Baker | null = null;
let loading: Promise<void> | null = null;
let unavailable = false;
let version = 0;
let pumping = false;
let releaseTimer = 0;

function notify(): void {
  version++;
  for (const l of listeners) l();
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function load(): Promise<void> {
  loading ??= (async () => {
    if (!webglAvailable()) throw new Error('WebGL unavailable');
    baker = await import('../battle3d/portraitBake');
  })().catch(() => {
    unavailable = true;
    queue.length = 0;
    notify();
  });
  return loading;
}

function pump(): void {
  if (pumping) return;
  pumping = true;
  window.clearTimeout(releaseTimer);
  const step = () => {
    const id = queue.shift();
    if (!id || !baker) {
      pumping = false;
      // Free the studio's GPU context once nothing is waiting
      releaseTimer = window.setTimeout(() => baker?.releaseStudio(), 4000);
      return;
    }
    try {
      const art = baker.bakePortrait(id);
      if (art) cache.set(id, art);
      else failed.add(id);
    } catch (e) {
      console.warn('[cards] portrait failed', id, e);
      failed.add(id);
    }
    notify();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * The baked portrait (300 × 400) or null while it is pending or unavailable; queues the bake. Keys:
 * a card id, `full:<cardId>`, `hero:<cape hex>:<sword|goldsword>` or `boss:<boss id>`.
 */
export function cardPortrait(cardId: string): HTMLCanvasElement | null {
  const art = cache.get(cardId);
  if (art) return art;
  if (unavailable || failed.has(cardId) || typeof document === 'undefined') return null;
  if (!queue.includes(cardId)) {
    queue.push(cardId);
    void load().then(() => !unavailable && pump());
  }
  return null;
}

/** True when this card will never get a rendered portrait in this session (no WebGL or a failure). */
export function portraitMissing(cardId: string): boolean {
  return unavailable || failed.has(cardId);
}

export function subscribePortraits(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function portraitVersion(): number {
  return version;
}

/** 0 pending, 1 placeholder (no portrait this session), 2 ready. Pure: safe as a React snapshot. */
export function portraitState(cardId: string): 0 | 1 | 2 {
  return cache.has(cardId) ? 2 : portraitMissing(cardId) ? 1 : 0;
}

/** Faction backdrop shared by the placeholder and the loading state. */
function backdrop(ctx: Ctx, cardId: string, w: number, h: number): void {
  const f = FACTIONS[UNIT_LOOK[cardId]?.faction ?? 'iron'];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, f.bgTop);
  g.addColorStop(1, f.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const v = ctx.createRadialGradient(w / 2, h * 0.55, w * 0.1, w / 2, h * 0.55, w * 0.9);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** A plain standing silhouette so a placeholder still reads as "a unit goes here". */
function silhouette(ctx: Ctx, w: number, h: number): void {
  const cx = w / 2;
  const s = w / 100;
  ctx.fillStyle = 'rgba(8,8,10,0.75)';
  ctx.beginPath();
  ctx.moveTo(cx - 9 * s, h * 0.2);
  ctx.lineTo(cx + 9 * s, h * 0.2);
  ctx.lineTo(cx + 11 * s, h * 0.3);
  ctx.lineTo(cx + 27 * s, h * 0.36);
  ctx.lineTo(cx + 22 * s, h * 0.66);
  ctx.lineTo(cx + 14 * s, h * 0.66);
  ctx.lineTo(cx + 13 * s, h);
  ctx.lineTo(cx - 13 * s, h);
  ctx.lineTo(cx - 14 * s, h * 0.66);
  ctx.lineTo(cx - 22 * s, h * 0.66);
  ctx.lineTo(cx - 27 * s, h * 0.36);
  ctx.lineTo(cx - 11 * s, h * 0.3);
  ctx.closePath();
  ctx.fill();
}

function embers(ctx: Ctx, cardId: string, w: number, h: number, t: number): void {
  const glow = FACTIONS[UNIT_LOOK[cardId]?.faction ?? 'iron'].glow;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const life = (t * (0.11 + (i % 3) * 0.03) + i * 0.137) % 1;
    const x = w * (((i * 0.383) % 1) * 0.9 + 0.05) + Math.sin(t * 1.3 + i) * w * 0.03;
    const y = h * (1 - life);
    ctx.globalAlpha = Math.sin(life * Math.PI) * 0.7;
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, Math.max(1, w / 110), Math.max(1, w / 110));
  }
  ctx.restore();
}

/** Draws a card's art into a w × h (3:4) area. `animate` adds drifting embers over the portrait. */
export function drawCardArt(ctx: Ctx, cardId: string, w: number, h: number, t = 0, animate = false): void {
  const art = cardPortrait(cardId);
  if (art) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(art, 0, 0, w, h);
    if (animate) embers(ctx, cardId, w, h, t);
    return;
  }
  backdrop(ctx, cardId, w, h);
  if (!portraitMissing(cardId)) return;
  silhouette(ctx, w, h);
  if (w >= 40) {
    ctx.fillStyle = PAL.boneDark;
    ctx.font = `700 ${Math.max(7, Math.round(w / 11))}px Cinzel, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PLACEHOLDER', w / 2, h * 0.12);
  }
}

const masked = new Map<string, HTMLCanvasElement>();

/**
 * A portrait whose edges fade out, so a full-body figure can stand in a wider scene (title screens,
 * banners). Draws nothing while the portrait is pending and a plain silhouette if it is unavailable.
 */
export function drawFigure(ctx: Ctx, key: string, x: number, y: number, w: number, h: number): void {
  const art = cardPortrait(key);
  if (!art) {
    if (portraitMissing(key)) silhouette2(ctx, x, y, w, h);
    return;
  }
  const id = `${key}@${Math.round(w)}x${Math.round(h)}`;
  let c = masked.get(id);
  if (!c) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c = document.createElement('canvas');
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const m = c.getContext('2d')!;
    m.drawImage(art, 0, 0, c.width, c.height);
    m.globalCompositeOperation = 'destination-in';
    const gx = m.createLinearGradient(0, 0, c.width, 0);
    gx.addColorStop(0, 'rgba(0,0,0,0)');
    gx.addColorStop(0.22, 'rgba(0,0,0,1)');
    gx.addColorStop(0.78, 'rgba(0,0,0,1)');
    gx.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = gx;
    m.fillRect(0, 0, c.width, c.height);
    const gy = m.createLinearGradient(0, 0, 0, c.height);
    gy.addColorStop(0, 'rgba(0,0,0,0)');
    gy.addColorStop(0.16, 'rgba(0,0,0,1)');
    gy.addColorStop(0.9, 'rgba(0,0,0,1)');
    gy.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = gy;
    m.fillRect(0, 0, c.width, c.height);
    masked.set(id, c);
  }
  ctx.drawImage(c, x, y, w, h);
}

function silhouette2(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.8;
  silhouette(ctx, w, h);
  ctx.restore();
}

/** Dark title-screen backdrop with a line of figures (hero in front). */
export function drawLineup(ctx: Ctx, keys: string[], w: number, h: number, floor: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0d0d10');
  g.addColorStop(floor / h, '#1f1416');
  g.addColorStop(1, '#0b0b0e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const fh = Math.min(floor * 0.95, w * 0.9);
  const fw = fh * 0.75;
  const order = keys.map((k, i) => ({ k, i, side: i - (keys.length - 1) / 2 })).sort((a, b) => Math.abs(b.side) - Math.abs(a.side));
  for (const { k, side } of order) {
    const s = side === 0 ? 1 : 0.82;
    const fx = w / 2 + side * fw * 0.62 - (fw * s) / 2;
    drawFigure(ctx, k, fx, floor - fh * s, fw * s, fh * s);
  }
}
