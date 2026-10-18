/** Dev sheet: every 2D battle sprite (dark style) on a battlefield-like background. */
import { CARDS } from '../core/content/cards';
import { ENEMY_ROLES } from '../core/content/types';
import { WORLDS } from '../core/content/worlds';
import { drawSprite, type SpriteKey } from '../ui/art/darkSprites';

const W = 390;
const params = new URLSearchParams(location.search);
const T = Number(params.get('t') ?? '0.4');
const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const dpr = window.devicePixelRatio || 1;

type Cell = { key: SpriteKey; label: string; attack?: number; hit?: number; moving?: boolean; elite?: boolean; facing?: 1 | -1 };
type Section = { title: string; scale: number; cw: number; ch: number; cells: Cell[] };

const sections: Section[] = [
  { title: 'Cards (scale 1)', scale: 1, cw: 76, ch: 84, cells: CARDS.map((c) => ({ key: { type: 'card', id: c.id }, label: c.id.split('_')[0]! })) },
  {
    title: 'Hero + poses',
    scale: 1,
    cw: 78,
    ch: 84,
    cells: [
      { key: { type: 'hero', cape: 'cape_crimson', aura: 'aura_none' }, label: 'hero crimson' },
      { key: { type: 'hero', cape: 'cape_frost', aura: 'aura_ember' }, label: 'hero frost' },
      { key: { type: 'hero', cape: 'cape_dawn', aura: 'aura_gold' }, label: 'hero dawn', attack: 0.3 },
      { key: { type: 'card', id: 'oakshield_knight' }, label: 'knight atk', attack: 0.5 },
      { key: { type: 'card', id: 'thornbow_archer' }, label: 'archer atk', attack: 0.3 },
      { key: { type: 'card', id: 'shade_assassin' }, label: 'reaper hit', hit: 1 },
      { key: { type: 'card', id: 'ember_mage' }, label: 'mage cast', attack: 0.5 },
      { key: { type: 'card', id: 'wolf_rider' }, label: 'warg atk', attack: 0.5, moving: true },
      { key: { type: 'card', id: 'powder_bombardier' }, label: 'sapper throw', attack: 0.35 },
      { key: { type: 'card', id: 'dawn_paladin' }, label: 'fallen walk', moving: true },
    ],
  },
  ...WORLDS.slice(0, 5).map((_, i): Section => ({
    title: `World ${i} enemies`,
    scale: 1,
    cw: 65,
    ch: 72,
    cells: [
      ...ENEMY_ROLES.map((r): Cell => ({ key: { type: 'enemy', role: r, world: i, elite: false }, label: r, facing: -1 })),
      { key: { type: 'enemy', role: 'normal', world: i, elite: true }, label: 'elite', elite: true, facing: -1 },
    ],
  })),
  { title: 'Bosses (scale 0.75)', scale: 0.75, cw: 95, ch: 110, cells: WORLDS.flatMap((w) => [w.miniBoss, w.boss]).map((b) => ({ key: { type: 'boss', id: b.id }, label: b.sprite, facing: -1 as const })) },
  { title: 'Cards (scale 0.6)', scale: 0.6, cw: 48, ch: 56, cells: CARDS.map((c) => ({ key: { type: 'card', id: c.id }, label: '' })) },
  { title: 'Enemies w0-4 (scale 0.6)', scale: 0.6, cw: 48, ch: 50, cells: WORLDS.slice(0, 5).flatMap((_, i) => ENEMY_ROLES.map((r): Cell => ({ key: { type: 'enemy', role: r, world: i, elite: false }, label: '', facing: -1 }))) },
];

let H = 8;
for (const s of sections) H += 18 + Math.ceil(s.cells.length / Math.floor((W - 8) / s.cw)) * s.ch + 6;
canvas.width = W * dpr;
canvas.height = H * dpr;
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;
ctx.scale(dpr, dpr);
const bg = ctx.createLinearGradient(0, 0, 0, H);
bg.addColorStop(0, '#15161b');
bg.addColorStop(1, '#22191a');
ctx.fillStyle = bg;
ctx.fillRect(0, 0, W, H);

let y = 8;
for (const s of sections) {
  ctx.fillStyle = '#bf9d52';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(s.title, 6, y + 11);
  y += 18;
  const per = Math.floor((W - 8) / s.cw);
  s.cells.forEach((c, i) => {
    const cx = 4 + (i % per) * s.cw + s.cw / 2;
    const top = y + Math.floor(i / per) * s.ch;
    const gy = top + s.ch - 14;
    ctx.fillStyle = 'rgba(60,52,44,0.35)';
    ctx.fillRect(cx - s.cw / 2 + 2, gy - 4, s.cw - 4, 10);
    const fly = (c.key.type === 'enemy' && c.key.role === 'flying') || (c.key.type === 'card' && (c.key.id === 'phoenix_warden' || c.key.id === 'aurora_drake'));
    drawSprite(ctx, c.key, cx, fly ? gy - 6 * s.scale : gy, { t: T + i * 0.13, facing: c.facing ?? 1, attack: c.attack ?? 0, hit: c.hit ?? 0, scale: s.scale, moving: c.moving ?? false, elite: c.elite });
    if (c.label) {
      ctx.fillStyle = '#8a929b';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(c.label, cx, top + s.ch - 2);
      ctx.textAlign = 'left';
    }
  });
  y += Math.ceil(s.cells.length / per) * s.ch + 6;
}
(window as unknown as { __ready: boolean }).__ready = true;
