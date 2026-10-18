/**
 * Dark-fantasy 2D unit sprites for the canvas battle renderer (2D fallback and the moments before
 * the 3D scene is ready). They follow the art bible in darkArt.ts: near-black angular silhouettes,
 * a thin rim light on the front edge, concealed faces with small glowing eyes, realistic proportions.
 * Units are drawn with feet at (x, y); scale 1 is the card art scale (a humanoid is ~48 px tall).
 */
import { COSMETIC_BY_ID } from '../../core/content/cosmetics';
import type { EnemyRole } from '../../core/content/types';
import { BOSS_BY_ID, getWorld } from '../../core/content/worlds';
import { FACTIONS, PAL, UNIT_LOOK } from './darkArt';
import { hexToRgb, rgba, type Ctx } from './draw';

export interface DrawOpts {
  t: number;
  facing: 1 | -1;
  /** 0..1 progress of the current attack swing (0 = idle). */
  attack: number;
  /** 0..1 hit flash. */
  hit: number;
  scale: number;
  moving: boolean;
  elite?: boolean;
  alpha?: number;
}

export type SpriteKey =
  | { type: 'card'; id: string }
  | { type: 'hero'; cape: string; aura: string }
  | { type: 'enemy'; role: EnemyRole; world: number; elite: boolean }
  | { type: 'boss'; id: string };

type Head = 'helm' | 'horned' | 'hood' | 'plague' | 'brim' | 'skull' | 'veil' | 'goggles' | 'lich';
type Weapon = 'greatsword' | 'mace' | 'axe' | 'hooks' | 'bow' | 'crossbow' | 'staff' | 'vial' | 'bomb' | 'orb' | 'spear';

interface Body {
  body: string;
  trim: string;
  eye: string;
  head: Head;
  weapon: Weapon;
  rim?: string;
  glow?: string;
  shield?: 'heater' | 'tower';
  cape?: string;
  robe?: boolean;
  plate?: boolean;
  gold?: boolean;
  bulk?: number;
  tall?: number;
}

interface Giant {
  skin: string;
  crack: string;
  eye: string;
  head: 'stone' | 'horns' | 'helm' | 'skull' | 'maw' | 'antlers' | 'tusks';
  arm: 'fists' | 'club' | 'chain';
  spikes?: string;
  h: number;
}

// --- Colour + path helpers ----------------------------------------------------------------------

let FLASH = 0;
const toHex = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
function mix(a: string, b: string, t: number): string {
  if (!a.startsWith('#') || !b.startsWith('#')) return a;
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `#${toHex(A[0] + (B[0] - A[0]) * t)}${toHex(A[1] + (B[1] - A[1]) * t)}${toHex(A[2] + (B[2] - A[2]) * t)}`;
}
const tint = (c: string) => (FLASH > 0 ? mix(c, '#ff8c80', FLASH) : c);
const OUT = '#050507';

function path(ctx: Ctx, p: number[], close = true): void {
  ctx.beginPath();
  ctx.moveTo(p[0]!, p[1]!);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i]!, p[i + 1]!);
  if (close) ctx.closePath();
}
/** Filled polygon with a hairline dark outline (separates overlapping dark parts). */
function shape(ctx: Ctx, p: number[], c: string, outline = 0.7): void {
  path(ctx, p);
  ctx.fillStyle = tint(c);
  ctx.fill();
  if (outline > 0) {
    ctx.lineWidth = outline;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }
}
/** Open polyline stroke (limbs, rims, shafts). */
function seg(ctx: Ctx, p: number[], c: string, w: number, cap: CanvasLineCap = 'round'): void {
  path(ctx, p, false);
  ctx.lineCap = cap;
  ctx.lineWidth = w;
  ctx.strokeStyle = tint(c);
  ctx.stroke();
}
function halo(ctx: Ctx, x: number, y: number, r: number, c: string, a: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(c, a));
  g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
/** Small glowing eye: soft halo plus a hot core. */
function eye(ctx: Ctx, x: number, y: number, c: string, r = 0.8): void {
  halo(ctx, x, y, r * 4.5, c, 0.6);
  ctx.fillStyle = mix(c, '#ffffff', 0.45);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const swingOf = (o: DrawOpts) => (o.attack > 0 ? Math.sin(Math.min(1, o.attack) * Math.PI) : 0);

// --- Unit tables --------------------------------------------------------------------------------

const CARDS: Record<string, Body> = {
  oakshield_knight: { body: PAL.blackSteel, trim: PAL.blood, eye: PAL.ember, head: 'helm', weapon: 'greatsword', shield: 'heater', cape: PAL.crimson, plate: true, bulk: 1.12 },
  thornbow_archer: { body: '#2c312a', trim: '#3c4a30', eye: PAL.toxic, head: 'hood', weapon: 'bow', cape: '#1e241c' },
  field_medic: { body: PAL.leather, trim: '#4a3a2c', eye: PAL.toxic, head: 'plague', weapon: 'vial', glow: PAL.toxic, robe: true },
  wolf_rider: { body: PAL.leatherDark, trim: PAL.ash, eye: PAL.ember, head: 'horned', weapon: 'axe', plate: true },
  powder_bombardier: { body: '#2f2721', trim: PAL.ash, eye: PAL.ember, head: 'goggles', weapon: 'bomb', glow: PAL.ember },
  ember_mage: { body: '#3b3532', trim: PAL.crimson, eye: PAL.ember, head: 'hood', weapon: 'staff', glow: PAL.fire, robe: true },
  hawkeye_ranger: { body: '#26282d', trim: PAL.leather, eye: PAL.ember, head: 'brim', weapon: 'crossbow', robe: true },
  dawn_paladin: { body: '#555b62', trim: PAL.blood, eye: PAL.eyeRed, head: 'helm', weapon: 'mace', cape: PAL.blood, plate: true, gold: true, bulk: 1.1 },
  frost_witch: { body: '#1f2734', trim: '#34475c', eye: PAL.frost, head: 'veil', weapon: 'staff', glow: PAL.frost, robe: true },
  aegis_guardian: { body: '#303338', trim: PAL.crimson, eye: PAL.ember, head: 'horned', weapon: 'spear', shield: 'tower', plate: true, bulk: 1.3 },
  shade_assassin: { body: '#1c1415', trim: PAL.crimson, eye: PAL.eyeRed, head: 'hood', weapon: 'hooks', cape: PAL.crimson },
  storm_adept: { body: '#1f2232', trim: '#2f3652', eye: PAL.storm, head: 'hood', weapon: 'staff', glow: PAL.storm, robe: true },
};
const GOLEM: Giant = { skin: PAL.obsidian, crack: PAL.ember, eye: PAL.fire, head: 'stone', arm: 'fists', h: 1.02 };

const BOSSES: Record<string, Giant | { lord: Body; size: number } | 'heart'> = {
  treant: { skin: '#2a2420', crack: '#9ccf3f', eye: '#c6ff00', head: 'antlers', arm: 'fists', h: 1.62 },
  magma_titan: { skin: PAL.obsidian, crack: PAL.ember, eye: PAL.fire, head: 'horns', arm: 'fists', h: 1.32 },
  troll: { skin: '#2a2e24', crack: '#6e7d4a', eye: '#c6e07a', head: 'tusks', arm: 'club', h: 1.32 },
  yeti: { skin: '#4a5057', crack: '#86d6ff', eye: PAL.frost, head: 'horns', arm: 'fists', h: 1.32 },
  overseer: { skin: '#2b2828', crack: PAL.ember, eye: PAL.ember, head: 'helm', arm: 'chain', h: 1.32 },
  warden: { skin: '#272430', crack: '#58d68d', eye: '#58d68d', head: 'skull', arm: 'chain', h: 1.32 },
  shardmaw: { skin: '#221a2a', crack: PAL.void2, eye: PAL.void2, head: 'maw', arm: 'fists', spikes: '#3a2452', h: 1.32 },
  ice_queen: { lord: { body: '#1d2633', trim: '#3a5068', eye: PAL.frost, rim: FACTIONS.frost.rim, head: 'veil', weapon: 'staff', glow: PAL.frost, robe: true }, size: 1.8 },
  lich_king: { lord: { body: '#221c28', trim: '#3a2a48', eye: '#58d68d', rim: '#9ac8a0', head: 'lich', weapon: 'staff', glow: '#58d68d', robe: true, cape: '#16121a' }, size: 1.66 },
  crystal_heart: 'heart',
};

const rimOf = (id: string) => FACTIONS[UNIT_LOOK[id]?.faction ?? 'iron'].rim;
const isFlying = (k: SpriteKey) => (k.type === 'enemy' && k.role === 'flying') || (k.type === 'card' && (k.id === 'phoenix_warden' || k.id === 'aurora_drake')) || (k.type === 'boss' && BOSS_BY_ID.get(k.id)?.sprite === 'crystal_heart');

/** Enemy colours: the world palette pulled hard towards charcoal; only the eyes keep the accent. */
function worldTones(world: number): { base: string; sec: string; rim: string; eye: string } {
  const p = getWorld(world).enemyPalette;
  const [r, g, b] = hexToRgb(p.accent);
  const eyeC = r + g + b > 690 ? mix(p.primary, '#ffffff', 0.35) : p.accent;
  return { base: mix(p.primary, PAL.charcoal, 0.7), sec: mix(p.secondary, PAL.charcoal, 0.62), rim: mix(p.primary, PAL.steel, 0.55), eye: eyeC };
}

// --- Humanoid -----------------------------------------------------------------------------------

function leg(ctx: Ctx, hx: number, ph: number, c: string): void {
  const fx = hx + ph * 4.5;
  seg(ctx, [hx, -23, hx + ph * 2.4 + 0.9, -11.5, fx, -1.5], c, 3.8, 'butt');
  shape(ctx, [fx - 1.8, -3, fx + 3.4, -1.6, fx + 3.6, 0, fx - 1.8, 0], c, 0.5);
}

function humanoid(ctx: Ctx, b: Body, o: DrawOpts, seated = false): void {
  const k = (b.bulk ?? 1) * 1.08;
  const ph = o.moving ? Math.sin(o.t * 11) : 0;
  const bob = o.moving ? Math.abs(Math.cos(o.t * 11)) * 1.3 : Math.sin(o.t * 2.2) * 0.4;
  const rim = b.rim ?? PAL.steel;
  const dark = mix(b.body, PAL.void, 0.45);
  ctx.save();
  ctx.translate(0, -bob);
  if (b.tall) ctx.scale(1, b.tall);
  ctx.lineJoin = 'miter';
  if (b.cape) {
    const s = (o.moving ? 2.4 : 0.5) * (1 + Math.sin(o.t * 3.1));
    shape(ctx, [3 * k, -37.5, -4.5 * k, -38, -7.5 * k - s * 0.6, -16, -9.5 * k - s, -3, -7 * k - s, -5.5, -5 * k - s * 0.7, -2.5, -2.5 * k, -6, 0, -4.5, 1 * k, -10], b.cape);
  }
  seg(ctx, [-2.4 * k, -35.5, -3.8 * k - ph * 2, -29, -3 * k - ph * 2.5, -24], dark, 2.8);
  if (b.weapon === 'hooks') hook(ctx, -3 * k - ph * 2.5, -24, -0.6 - swingOf(o) * 0.8);
  if (!seated && !b.robe) {
    leg(ctx, -1.4 * k, -ph, dark);
    leg(ctx, 1.4 * k, ph, mix(b.body, PAL.void, 0.22));
  }
  if (b.robe && !seated) {
    shape(ctx, [-4.8 * k, -25, 4.6 * k, -25, 6.4 * k + ph, -0.5, 3.6 * k, 0.3, 1.2, -1.6, -2 * k, 0.3, -6.6 * k + ph * 0.6, -0.5], mix(b.body, PAL.void, 0.12));
    seg(ctx, [4.6 * k, -25, 6.4 * k + ph, -0.5], rim, 0.8);
  }
  // Torso with a rim light down the front edge.
  shape(ctx, [-5 * k, -38.5, 4.6 * k, -38.5, 6 * k, -32.5, 4.2 * k, -23.5, -4.4 * k, -23.5, -5.6 * k, -31.5], b.body);
  seg(ctx, [4.6 * k, -38.3, 6 * k, -32.5, 4.2 * k, -23.8], rim, 0.8);
  const hem = b.robe ? -23.5 : -12.5;
  shape(ctx, [0.6, -34.5, 4.4 * k, -34.5, 3.6 * k, hem, 2.2, hem - 1.6, 0.4, hem], b.trim, 0.5);
  shape(ctx, [-4.5 * k, -26, 4.4 * k, -26, 4.3 * k, -24.2, -4.5 * k, -24.2], PAL.leatherDark, 0);
  if (b.plate) {
    shape(ctx, [-0.6 * k, -40.2, 5.6 * k, -39.6, 7 * k, -35.4, 4.4 * k, -32.4, -0.2, -34], mix(b.body, PAL.steelLight, 0.12));
    seg(ctx, [-0.6 * k, -40.2, 5.6 * k, -39.6, 7 * k, -35.4], b.gold ? PAL.goldLight : rim, 0.8);
  }
  head(ctx, b, o);
  if (b.shield === 'heater') {
    const sx = 5 * k;
    shape(ctx, [sx - 3.6, -35, sx + 3.8, -35, sx + 3.8, -28.5, sx, -22.5, sx - 3.6, -28.5], mix(b.body, PAL.steel, 0.12));
    shape(ctx, [sx - 1.8, -33.3, sx + 2, -33.3, sx + 2, -28.8, sx + 0.1, -25.6, sx - 1.8, -28.8], b.trim, 0);
    seg(ctx, [sx + 3.8, -35, sx + 3.8, -28.5, sx, -22.5], rim, 0.8);
  } else if (b.shield === 'tower') {
    const sx = 4.6 * k;
    shape(ctx, [sx - 2.2, -41, sx + 3, -42.5, sx + 6, -40.5, sx + 6, -7.5, sx + 1, -5.5, sx - 2.2, -7.5], '#2a2d32');
    for (const y of [-36, -24, -12]) seg(ctx, [sx - 1.8, y, sx + 5.6, y - 0.4], '#1a1c20', 1.1, 'butt');
    seg(ctx, [sx + 2, -40.5, sx + 2, -7], PAL.crimson, 1.1, 'butt');
    seg(ctx, [sx + 3, -42.5, sx + 6, -40.5, sx + 6, -7.5], rim, 0.9);
    for (const y of [-38.5, -9.5]) eye(ctx, sx + 4.4, y, PAL.ember, 0.35);
  }
  arm(ctx, b, o, k, ph);
  ctx.restore();
}

/** Arm pose keyframes per weapon: [attack progress, arm angle, weapon tilt]. Angle 0 = arm hanging down, negative = forward. */
const POSE: Record<string, [number, number, number][]> = {
  melee: [[0, -0.35, 0.35], [0.25, -2.6, -1.2], [0.55, -0.9, 1.9], [1, -0.35, 0.35]],
  hooks: [[0, -0.6, 1.2], [0.3, -2.2, -0.4], [0.6, -0.7, 2.3], [1, -0.6, 1.2]],
  ranged: [[0, -1.45, 0], [0.5, -1.55, -0.05], [1, -1.45, 0]],
  cast: [[0, -0.3, 0], [0.5, -1.25, 0.55], [1, -0.3, 0]],
  throw: [[0, -0.75, 0], [0.35, -2.7, -0.6], [0.7, -1.2, 0.6], [1, -0.75, 0]],
  spear: [[0, -1.0, 1.15], [0.5, -1.45, 1.45], [1, -1.0, 1.15]],
};
const POSE_OF: Record<Weapon, string> = { greatsword: 'melee', mace: 'melee', axe: 'melee', hooks: 'hooks', bow: 'ranged', crossbow: 'ranged', staff: 'cast', orb: 'cast', vial: 'throw', bomb: 'throw', spear: 'spear' };

function pose(kind: string, p: number): [number, number] {
  const keys = POSE[kind]!;
  for (let i = 1; i < keys.length; i++) {
    const [p1, a1, t1] = keys[i]!;
    const [p0, a0, t0] = keys[i - 1]!;
    if (p <= p1) {
      const f = (p - p0) / (p1 - p0 || 1);
      return [lerp(a0, a1, f), lerp(t0, t1, f)];
    }
  }
  return [keys[0]![1], keys[0]![2]];
}

function arm(ctx: Ctx, b: Body, o: DrawOpts, k: number, ph: number): void {
  const [a, tilt] = pose(POSE_OF[b.weapon], Math.min(1, o.attack));
  const sx = 2.6 * k + ph * 0.4;
  const sy = -36;
  const hx = sx - Math.sin(a) * 11;
  const hy = sy + Math.cos(a) * 11;
  const ex = sx - Math.sin(a) * 5.5 + 0.8;
  const ey = sy + Math.cos(a) * 5.5;
  seg(ctx, [sx, sy, ex, ey, hx, hy], mix(b.body, PAL.void, 0.15), 3);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(tilt);
  weapon(ctx, b, o);
  ctx.restore();
  seg(ctx, [hx - 0.8, hy - 0.8, hx + 0.8, hy + 0.8], PAL.leatherDark, 2.6);
}

function hook(ctx: Ctx, x: number, y: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  seg(ctx, [0, 2, 0, -3], PAL.leatherDark, 1.6);
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.quadraticCurveTo(1.5, -11, 7, -10.5);
  ctx.quadraticCurveTo(7.5, -8, 5, -7.5);
  ctx.strokeStyle = tint(PAL.steel);
  ctx.lineWidth = 1.4;
  ctx.stroke();
  seg(ctx, [1.2, -7, 4, -10.4, 7, -10.5], PAL.bloodBright, 0.6);
  ctx.restore();
}

/** Weapon at the hand, drawn upright (blade up = -y, forward = +x). */
function weapon(ctx: Ctx, b: Body, o: DrawOpts): void {
  const sw = swingOf(o);
  const g = b.glow ?? b.eye;
  switch (b.weapon) {
    case 'greatsword':
      seg(ctx, [0, 3, 0, -1], PAL.leatherDark, 1.6);
      seg(ctx, [-3, -1.2, 3, -1.2], PAL.iron, 1.3, 'butt');
      shape(ctx, [-1.15, -1.5, 1.15, -1.5, 0.9, -19, 0, -21.5, -0.9, -19], PAL.gunmetal, 0.5);
      seg(ctx, [0.9, -1.5, 0.75, -19, 0, -21.3], PAL.steelLight, 0.5);
      break;
    case 'mace':
      seg(ctx, [0, 3, 0, -10], PAL.iron, 1.5);
      shape(ctx, [-2.6, -10, 0, -16.5, 2.6, -10, 1.6, -9, 0, -8.6, -1.6, -9], b.gold ? PAL.gold : PAL.gunmetal, 0.5);
      seg(ctx, [0, -16.5, 2.6, -10], b.gold ? PAL.goldLight : PAL.steelLight, 0.6);
      break;
    case 'axe':
      seg(ctx, [0, 3, 0, -12.5], PAL.wood, 1.5);
      shape(ctx, [0, -12.5, 4, -15, 5.4, -11.2, 4.4, -7.5, 0, -9.2], PAL.gunmetal, 0.5);
      seg(ctx, [4, -15, 5.4, -11.2, 4.4, -7.5], PAL.steelLight, 0.6);
      break;
    case 'hooks':
      hook(ctx, 0, 0, 0);
      break;
    case 'spear':
      seg(ctx, [0, 7, 0, -17], PAL.iron, 1.4);
      shape(ctx, [-1.4, -17, 0, -23, 1.4, -17, 0, -16], PAL.gunmetal, 0.5);
      break;
    case 'bow': {
      const pull = 1.2 + (o.attack > 0 && o.attack < 0.55 ? sw * 5 : 0);
      ctx.beginPath();
      ctx.moveTo(2, -13);
      ctx.quadraticCurveTo(8, 0, 2, 13);
      ctx.strokeStyle = tint(PAL.black);
      ctx.lineWidth = 1.7;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(2.6, -12);
      ctx.quadraticCurveTo(7.6, 0, 2.6, 12);
      ctx.strokeStyle = rgba(b.eye, 0.35);
      ctx.lineWidth = 0.5;
      ctx.stroke();
      seg(ctx, [2, -13, 2 - pull, 0, 2, 13], PAL.boneDark, 0.4);
      if (pull > 2) seg(ctx, [2 - pull, 0, 10, 0], PAL.bone, 0.6);
      break;
    }
    case 'crossbow':
      shape(ctx, [-7, -1.3, 8, -1.5, 8, 0.6, -2, 1, -5.5, 3.6, -7.5, 1.6], PAL.wood, 0.5);
      seg(ctx, [5.5, -6.5, 7.5, -0.6, 5.5, 5.5], PAL.black, 1.6);
      seg(ctx, [5.5, -6.5, 1 + sw * 2, -0.5, 5.5, 5.5], PAL.boneDark, 0.4);
      if (o.attack < 0.4) seg(ctx, [1, -0.8, 10.5, -0.8], PAL.bone, 0.8);
      break;
    case 'staff': {
      seg(ctx, [0, 11, 0, -18], PAL.wood, 1.5);
      const f = 0.75 + sw * 0.6 + Math.sin(o.t * 9) * 0.1;
      halo(ctx, 0, -20, 7 + sw * 5, g, 0.45 * f);
      if (g === PAL.fire) {
        const fl = Math.sin(o.t * 17) * 0.8;
        shape(ctx, [-2, -18, -1.6 + fl, -22.5, 0, -26 - sw * 2, 1.6 - fl, -22, 2, -18], g, 0);
        shape(ctx, [-0.9, -18.5, 0, -23 - sw, 0.9, -18.5], '#ffd28a', 0);
      } else if (g === PAL.frost) {
        shape(ctx, [0, -26, 2, -21, 0, -17.5, -2, -21], mix(g, '#ffffff', 0.25), 0.5);
        seg(ctx, [-2.4, -18, -3.6, -23, -1.3, -20], '#5fa6c9', 0.8);
      } else if (g === PAL.storm) {
        seg(ctx, [-2.5, -24, -2.2, -18, 2.2, -18, 2.5, -24], PAL.iron, 1);
        if (Math.sin(o.t * 23) > 0.2 || sw > 0) seg(ctx, [0, -19, -1.5, -22, 1, -23.5, -0.5, -27 - sw * 3], '#e6eeff', 0.7);
      } else {
        shape(ctx, [-2.2, -21, -1.6, -24.5, 1.6, -24.5, 2.2, -21, 0, -18.5], PAL.bone, 0.5);
        eye(ctx, 0.6, -22, g, 0.6);
      }
      break;
    }
    case 'orb':
      halo(ctx, 1.5, -2, 6 + sw * 4, g, 0.5);
      ctx.fillStyle = mix(g, '#ffffff', 0.3);
      ctx.beginPath();
      ctx.arc(1.5, -2, 1.8 + sw * 0.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'vial':
      shape(ctx, [-1.6, -1, 1.6, -1, 1.9, -4.5, 0.7, -6, 0.7, -7.5, -0.7, -7.5, -0.7, -6, -1.9, -4.5], '#1e2a1a', 0.5);
      shape(ctx, [-1.5, -1.3, 1.5, -1.3, 1.7, -4, -1.7, -4], g, 0);
      halo(ctx, 0, -3, 5, g, 0.4);
      break;
    case 'bomb': {
      ctx.beginPath();
      ctx.arc(0, -3, 3.3, 0, Math.PI * 2);
      ctx.fillStyle = tint(PAL.black);
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      seg(ctx, [1.8, -5.6, 3.2, -4.5, 2.7, -1.4], PAL.gunmetal, 0.6);
      seg(ctx, [0, -6.3, 0.8, -8.5, 2.4, -9], PAL.boneDark, 0.6);
      eye(ctx, 2.4, -9, Math.sin(o.t * 30) > 0 ? PAL.fire : g, 0.7);
      break;
    }
  }
}

function head(ctx: Ctx, b: Body, o: DrawOpts): void {
  const rim = b.rim ?? PAL.steel;
  const c = mix(b.body, PAL.void, 0.1);
  const flick = 0.85 + Math.sin(o.t * 5.3) * 0.15;
  switch (b.head) {
    case 'helm':
    case 'horned':
      if (b.head === 'horned') {
        shape(ctx, [-2.4, -46.2, -5.2, -50.5, -7.5, -50, -5, -48.8, -3.6, -45], PAL.boneDark, 0.5);
        shape(ctx, [1.4, -46.8, 1.8, -51.5, 0, -53, 0.6, -51, -0.2, -46.5], PAL.boneDark, 0.5);
      }
      shape(ctx, [-3.4, -47, 3.2, -47.4, 4.2, -45, 4.2, -39, 2.6, -37.8, -3.4, -38.2], mix(b.body, PAL.steel, 0.08));
      seg(ctx, [3.2, -47.2, 4.2, -45, 4.2, -39, 2.6, -37.9], b.gold ? PAL.goldLight : rim, 0.8);
      if (b.gold) seg(ctx, [-3, -47.6, 3, -48], PAL.gold, 1.1);
      seg(ctx, [0.9, -43.4, 4.3, -43.4], mix(b.eye, '#ffffff', 0.3), 0.8, 'butt');
      halo(ctx, 3, -43.4, 3.8, b.eye, 0.55 * flick);
      break;
    case 'hood':
    case 'plague':
    case 'veil':
    case 'goggles': {
      if (b.head === 'veil') {
        shape(ctx, [-5.6, -30, -4.6, -44, -1.5, -48.5, 3, -46, 4.8, -41, 5.6, -31, 3, -33, 0, -30.5, -3, -32], mix(b.body, PAL.void, 0.25));
        for (const [x, h] of [[-2.5, 4], [0.2, 5.5], [2.8, 3.6]] as const) shape(ctx, [x - 0.8, -47.5, x, -47.5 - h, x + 0.8, -47.5], mix(b.eye, '#ffffff', 0.35), 0);
      }
      shape(ctx, [-4.4, -37.3, -4.9, -43, -2.4, -47.4, 0.2, -49.6, 3.9, -45.6, 4.7, -41.2, 3.8, -37.6], c);
      seg(ctx, [0.2, -49.4, 3.9, -45.6, 4.7, -41.2, 3.8, -37.8], rim, 0.8);
      shape(ctx, [1.2, -45, 4.1, -44.6, 4.3, -39.8, 2, -38.8], PAL.void, 0);
      if (b.head === 'plague') {
        shape(ctx, [2.2, -44, 10, -39.6, 2.6, -40.4], PAL.bone, 0.5);
        eye(ctx, 3.1, -43, b.eye, 0.85);
      } else if (b.head === 'goggles') {
        shape(ctx, [2.6, -41, 5.6, -40, 5, -38, 2.4, -38.4], PAL.leatherDark, 0.5);
        eye(ctx, 3.3, -43, b.eye, 1);
      } else {
        eye(ctx, 2.6, -42.6, b.eye, 0.55);
        eye(ctx, 3.8, -42.6, b.eye, 0.55);
      }
      break;
    }
    case 'brim':
      shape(ctx, [-3.6, -38, -3.6, -45, 0.6, -45.4, 0.4, -38.4], mix(b.body, PAL.void, 0.2));
      shape(ctx, [0.4, -45.2, 3.9, -45.2, 4.1, -40.2, 2.2, -38.2, 0.4, -39], PAL.bone, 0.5);
      seg(ctx, [1.4, -43, 3.9, -43], PAL.void, 0.9, 'butt');
      eye(ctx, 3, -43, b.eye, 0.5);
      shape(ctx, [-3.2, -45.2, -2.4, -49.5, 2.4, -49.8, 3, -45.4], c);
      seg(ctx, [-6, -45, 7, -45.6], c, 1.4);
      seg(ctx, [2.4, -49.8, 3, -45.6, 7, -45.6], rim, 0.6);
      break;
    case 'skull':
    case 'lich':
      shape(ctx, [-3.4, -46, 0, -48.4, 3.6, -46.4, 4.4, -42, 3.4, -38.6, 0.2, -38, -3.2, -40.5], PAL.boneDark);
      shape(ctx, [1, -40.5, 4, -40.8, 3.4, -38, 1.2, -37.6], mix(PAL.boneDark, PAL.void, 0.3), 0.5);
      shape(ctx, [1.3, -44.5, 3.8, -44.2, 3.6, -42, 1.6, -42], PAL.void, 0);
      eye(ctx, 2.8, -43.2, b.eye, 0.75);
      if (b.head === 'lich') shape(ctx, [-3.6, -46.5, -3.4, -51, -1.8, -48.5, -0.4, -52.5, 1, -48.8, 2.6, -52, 3.8, -46.8], PAL.gold, 0.5);
      break;
  }
}

// --- Beasts, flyers, giants ---------------------------------------------------------------------

function beast(ctx: Ctx, fur: string, eyeC: string, rim: string, o: DrawOpts, k: number): void {
  const ph = o.moving ? o.t * 13 : 0;
  const sw = swingOf(o);
  const dark = mix(fur, PAL.void, 0.4);
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(0, o.moving ? -Math.abs(Math.sin(ph)) * 1.2 : 0);
  const legAt = (x: number, y: number, p: number, c: string) => seg(ctx, [x, y, x + Math.sin(p) * 3 - 1, y + 6, x + Math.sin(p) * 4.5, 0], c, 2.6, 'butt');
  legAt(-9, -11, ph + Math.PI, dark);
  legAt(7, -12, ph, dark);
  shape(ctx, [10, -22.5, 3, -21, -8, -19.5, -13, -15, -14.5, -11, -9, -9.5, 0, -12, 8, -11.5, 12, -15], fur);
  shape(ctx, [-13, -14.5, -20, -18 + Math.sin(o.t * 4) * 1.5, -15, -12], dark, 0.5);
  shape(ctx, [-8, -19.5, -6, -23, -4, -20.4, -1.5, -24.5, 0.6, -21, 3, -26, 5, -22.5, 7.6, -27, 10, -22.5], mix(fur, PAL.void, 0.55), 0.5);
  legAt(-6.5, -10.5, ph, fur);
  legAt(9, -12, ph + Math.PI, fur);
  ctx.save();
  ctx.translate(11, -20);
  ctx.rotate(-sw * 0.35);
  shape(ctx, [-2, -3, 1.5, -6, 3, -5, 10.5, -1.5, 10.5, 0.4, 3, 1.4, -1, 4], fur);
  shape(ctx, [1.5, -5.2, 2, -9.5, 4, -5], dark, 0.5);
  shape(ctx, [2, 1.2, 9.5, 1 + sw * 3.5, 2.2, 4 + sw * 2], dark, 0.5);
  if (sw > 0.1) seg(ctx, [4, 1.2, 4.6, 2.4, 6.5, 1.2, 7.1, 2.4, 8.5, 1.2], PAL.bone, 0.5);
  seg(ctx, [1.5, -6, 3, -5, 10.5, -1.5], rim, 0.7);
  eye(ctx, 5, -3, eyeC, 0.7);
  ctx.restore();
  seg(ctx, [3, -21, -8, -19.5], rim, 0.6);
  ctx.restore();
}

function flyer(ctx: Ctx, body: string, eyeC: string, rim: string, o: DrawOpts): void {
  const sw = swingOf(o);
  const wing = (phase: number, c: string, dx: number) => {
    const f = Math.sin(o.t * 9 + phase);
    const ty = -33 + f * 9;
    shape(ctx, [dx, -22, dx - 2, ty, dx - 8, ty - 3, dx - 7, ty + 4, dx - 14, ty + 2, dx - 11, ty + 8, dx - 18, ty + 9, dx - 9, -17, dx - 3, -17.5], c, 0.6);
    seg(ctx, [dx, -22, dx - 2, ty, dx - 8, ty - 3], rim, 0.6);
  };
  wing(0.6, mix(body, PAL.void, 0.5), -2);
  shape(ctx, [-7, -18, -2, -24, 5, -22.5, 4 + sw * 2, -15, -2, -12.5], body);
  shape(ctx, [-2, -13, -5, -6, -0.5, -10, 1, -5, 2, -13.5], mix(body, PAL.void, 0.3), 0.5);
  shape(ctx, [3, -22, 5, -27.5, 6.6, -23, 10.5 + sw * 2, -20.5, 6.5, -17.5], body);
  eye(ctx, 6.8, -21.4, eyeC, 0.75);
  wing(0, body, 1);
}

function phoenix(ctx: Ctx, o: DrawOpts): void {
  const flap = Math.sin(o.t * 6);
  const sw = swingOf(o);
  halo(ctx, 0, -30, 26, PAL.ember, 0.2);
  for (let i = 0; i < 3; i++) {
    const tt = (o.t * 0.9 + i / 3) % 1;
    eye(ctx, -6 + i * 5 + Math.sin(o.t * 3 + i) * 2, -24 - tt * 26, PAL.fire, 0.45 * (1 - tt));
  }
  const feather = (x: number, y: number, ang: number, len: number, w: number, c: string) => {
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const tx = x + dx * len;
    const ty = y + dy * len;
    shape(ctx, [x - dy * w, y + dx * w, tx, ty, x + dy * w, y - dx * w], c, 0.5);
    seg(ctx, [x + dx * len * 0.6, y + dy * len * 0.6, tx, ty], PAL.fire, 0.9);
  };
  for (const [a, l] of [[2.75, 22], [2.55, 20], [2.95, 18]] as const) feather(-7, -27, a + Math.sin(o.t * 4 + a) * 0.08, l, 1.6, '#1b1210');
  const wing = (k: number, c: string) => {
    for (let i = 0; i < 5; i++) feather(1, -32, -1.45 - i * 0.28 + flap * 0.45 * k, 21 - i * 2, 2.2, c);
  };
  wing(1, '#130e0d');
  shape(ctx, [-9, -27, 0, -35, 7, -34, 5, -25.5, -4, -23.5], '#241917');
  shape(ctx, [5, -33, 9, -38, 11.5, -36.5, 15.5 + sw * 2, -34.5, 10.5, -32.5, 7, -30], '#241917');
  shape(ctx, [8.5, -37.5, 4, -41.5, 6, -38.5, 3, -39, 8, -36], PAL.ember, 0);
  eye(ctx, 10.6, -35.6, PAL.fire, 0.7);
  wing(-0.7, '#2a1b18');
  seg(ctx, [0, -35, 7, -34, 9, -38], FACTIONS.ash.rim, 0.7);
}

function wyrm(ctx: Ctx, o: DrawOpts): void {
  const flap = Math.sin(o.t * 4.5);
  const sw = swingOf(o);
  const sk = '#17131f';
  const rim = FACTIONS.void.rim;
  const wing = (k: number, c: string) => {
    const ty = -56 + flap * 11 * k;
    shape(ctx, [3, -32, 0, ty, -8, ty + 2, -12, ty + 10, -18, ty + 12, -16, ty + 18, -22, ty + 22, -6, -28], c, 0.6);
    seg(ctx, [0, ty, -8, ty + 2], rim, 0.7);
  };
  wing(1, '#0e0b14');
  shape(ctx, [-8, -27, -20, -24, -28, -16, -22, -12 + flap, -24, -18, -14, -21], sk, 0.6);
  shape(ctx, [-10, -26, 0, -34, 9, -31, 6, -23, -6, -21], sk);
  shape(ctx, [6, -32, 9, -40, 12, -43, 15, -41, 12, -38, 9, -30], sk);
  ctx.save();
  ctx.translate(13, -42);
  ctx.rotate(0.2 - sw * 0.3);
  shape(ctx, [-2, -2, 2, -4, 9, -1.5, 9, 0.5, 2, 1.5, -1.5, 2.5], sk);
  shape(ctx, [1, 1.2, 8, 1 + sw * 3, 1.5, 3 + sw * 2], '#0e0b14', 0.5);
  shape(ctx, [0, -2.5, -5, -6.5, 1.5, -4], PAL.boneDark, 0.4);
  seg(ctx, [2, -4, 9, -1.5], rim, 0.6);
  eye(ctx, 4.2, -1.6, PAL.void2, 0.7);
  if (sw > 0.2) halo(ctx, 11, 1, 6 + sw * 6, PAL.void2, 0.5 * sw);
  ctx.restore();
  for (let i = 0; i < 4; i++) eye(ctx, -6 + i * 4, -24.5 + i * -1.6, PAL.void2, 0.35 + 0.15 * Math.sin(o.t * 3 + i));
  wing(-1, '#1c1726');
  seg(ctx, [0, -34, 9, -31], rim, 0.7);
}

function giant(ctx: Ctx, g: Giant, o: DrawOpts): void {
  const ph = o.moving ? Math.sin(o.t * 6) : 0;
  const sw = swingOf(o);
  const dark = mix(g.skin, PAL.void, 0.35);
  const lite = mix(g.skin, PAL.steel, 0.18);
  const rim = mix(g.crack, PAL.bone, 0.4);
  ctx.save();
  ctx.scale(g.h, g.h);
  ctx.translate(0, o.moving ? -Math.abs(ph) * 1.2 : Math.sin(o.t * 1.6) * 0.5);
  ctx.lineJoin = 'miter';
  shape(ctx, [-9, -46, -13, -40, -14.5 + ph, -16, -10 + ph, -12, -8, -40], dark);
  shape(ctx, [-12 + ph, -16, -6 + ph, -16, -5.5 + ph, -9, -12.5 + ph, -9], dark);
  shape(ctx, [-9, -22, -2.5, -22, -3 - ph * 2, 0, -11 - ph * 2, 0], dark);
  shape(ctx, [1.5, -22, 8, -22, 9 + ph * 2, 0, 1 + ph * 2, 0], g.skin);
  if (g.spikes) for (const [x, y, s] of [[-10, -44, 1], [-4, -49, 1.3], [-13, -35, 0.8]] as const) {
    shape(ctx, [x - 2 * s, y + 1, x - 3 * s, y - 9 * s, x + 2 * s, y + 0.5], g.spikes, 0.6);
    seg(ctx, [x - 3 * s, y - 9 * s, x + 2 * s, y + 0.5], g.crack, 0.6);
  }
  shape(ctx, [-12.5, -45, -4, -50.5, 6, -51, 13.5, -45.5, 13, -31, 8.5, -20, -9.5, -20, -14, -31], g.skin);
  seg(ctx, [6, -51, 13.5, -45.5, 13, -31, 8.5, -20.5], rim, 0.9);
  ctx.save();
  ctx.beginPath();
  for (const p of [[-6, -45, -3, -38, -6.5, -32, -2.5, -26], [5, -48, 7.5, -41, 3.5, -35, 7.5, -28], [-3, -38, 3.5, -35]]) {
    ctx.moveTo(p[0]!, p[1]!);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i]!, p[i + 1]!);
  }
  ctx.strokeStyle = tint(g.crack);
  ctx.globalAlpha *= 0.75 + Math.sin(o.t * 2.5) * 0.2;
  ctx.lineWidth = 0.8;
  ctx.shadowColor = g.crack;
  ctx.shadowBlur = 5;
  ctx.stroke();
  ctx.restore();
  halo(ctx, 0, -37, 9, g.crack, 0.25 + sw * 0.3);
  // Head, set low between the shoulders.
  const hx = 6.5;
  const hy = -50;
  if (g.head === 'antlers') {
    seg(ctx, [hx - 2, hy - 2, hx - 5, hy - 12, hx - 9, hy - 16, hx - 5, hy - 12, hx - 3, hy - 18], dark, 1.6, 'butt');
    seg(ctx, [hx + 2, hy - 2, hx + 4, hy - 13, hx + 9, hy - 17, hx + 4, hy - 13, hx + 2, hy - 19], dark, 1.6, 'butt');
  }
  if (g.head === 'horns') shape(ctx, [hx - 3, hy - 3, hx - 7, hy - 10, hx - 9, hy - 9, hx - 5, hy - 1], PAL.boneDark, 0.5);
  shape(ctx, [hx - 4, hy + 4, hx - 4.5, hy - 3, hx, hy - 5.5, hx + 5, hy - 3.5, hx + 5.5, hy + 2, hx + 2, hy + 5], g.head === 'skull' ? PAL.boneDark : lite);
  if (g.head === 'helm') seg(ctx, [hx - 1, hy - 0.5, hx + 5.4, hy - 0.5], PAL.void, 1.4, 'butt');
  if (g.head === 'skull') shape(ctx, [hx - 5.5, hy + 3, hx - 6, hy - 5, hx, hy - 8, hx + 4, hy - 6.5, hx - 1, hy - 5], dark, 0.5);
  if (g.head === 'tusks') shape(ctx, [hx + 2.5, hy + 4, hx + 5.5, hy - 0.5, hx + 4, hy + 4], PAL.bone, 0.4);
  if (g.head === 'maw') {
    shape(ctx, [hx, hy + 2, hx + 9, hy + 1 + sw * 3, hx + 1, hy + 6], dark, 0.5);
    seg(ctx, [hx + 3, hy + 2, hx + 4, hy + 3.5, hx + 5.5, hy + 2, hx + 6.5, hy + 3.4, hx + 8, hy + 1.8], g.crack, 0.5);
  }
  eye(ctx, hx + 3, hy - 0.5, g.eye, 0.85);
  if (g.head !== 'helm') eye(ctx, hx + 0.6, hy - 0.5, g.eye, 0.6);
  // Front arm with a slam on attack.
  ctx.save();
  ctx.translate(10, -45);
  ctx.rotate(-sw * 1.9 - ph * 0.15);
  shape(ctx, [-3.5, -2, 4.5, -2.5, 6.5, 12, 6, 26, 0, 26, -1, 12], g.skin);
  shape(ctx, [-1.5, 25, 7.5, 25, 8, 32, -2, 32], lite);
  seg(ctx, [4.5, -2.5, 6.5, 12, 6, 26], rim, 0.8);
  if (g.arm === 'club') shape(ctx, [2, 30, 5, 28, 11, 46, 6, 50, 1, 46], PAL.wood, 0.6);
  if (g.arm === 'chain') {
    seg(ctx, [3, 31, 4 + Math.sin(o.t * 2) * 2, 38, 3, 44], PAL.iron, 1.2, 'butt');
    shape(ctx, [-1, 44, 3, 41, 7, 44, 5.5, 49, 0.5, 49], PAL.blackSteel, 0.6);
  }
  ctx.restore();
  ctx.restore();
}

function heart(ctx: Ctx, o: DrawOpts): void {
  const y = -48 + Math.sin(o.t * 1.5) * 2;
  const pulse = 0.6 + Math.sin(o.t * 3) * 0.25 + swingOf(o) * 0.4;
  halo(ctx, 0, y, 38, PAL.void2, 0.22 * pulse);
  for (let i = 0; i < 5; i++) {
    const a = o.t * 0.7 + (i / 5) * Math.PI * 2;
    const x = Math.cos(a) * 24;
    const yy = y + Math.sin(a) * 9;
    shape(ctx, [x, yy - 7, x + 3, yy, x, yy + 6, x - 3, yy], '#1b1526', 0.6);
    seg(ctx, [x, yy - 7, x + 3, yy], FACTIONS.void.rim, 0.6);
  }
  shape(ctx, [0, y - 34, 11, y - 10, 9, y + 18, 0, y + 30, -9, y + 18, -11, y - 10], '#140f1c');
  shape(ctx, [-6, y - 24, -16, y - 6, -10, y + 10], '#1d1628', 0.6);
  shape(ctx, [6, y - 24, 16, y - 4, 10, y + 12], '#1d1628', 0.6);
  seg(ctx, [0, y - 34, 11, y - 10, 9, y + 18, 0, y + 30], FACTIONS.void.rim, 0.9);
  halo(ctx, 0, y, 12, PAL.void2, 0.8 * pulse);
  shape(ctx, [0, y - 7, 1.6, y, 0, y + 7, -1.6, y], mix(PAL.void2, '#ffffff', 0.6), 0);
}

// --- Public entry points ------------------------------------------------------------------------

function heroBody(capeId: string): Body {
  const cape = COSMETIC_BY_ID.get(capeId)?.color ?? PAL.crimson;
  return { body: '#3a3f46', trim: mix(cape, PAL.charcoal, 0.45), eye: PAL.ember, rim: '#e6c9a0', head: 'helm', weapon: 'greatsword', cape: mix(cape, PAL.charcoal, 0.55), plate: true, gold: true, bulk: 1.12 };
}

function drawEnemy(ctx: Ctx, role: EnemyRole, world: number, o: DrawOpts): void {
  const c = worldTones(world);
  if (role === 'fast') return beast(ctx, c.base, c.eye, c.rim, o, 0.8);
  if (role === 'flying') return flyer(ctx, c.base, c.eye, c.rim, o);
  if (role === 'armored' && world === 4) return giant(ctx, { skin: c.base, crack: c.eye, eye: c.eye, head: 'maw', arm: 'fists', spikes: c.sec, h: 0.78 }, o);
  const skull = world === 3;
  if (role === 'ranged') return humanoid(ctx, { body: c.sec, trim: c.base, rim: c.rim, eye: c.eye, head: skull ? 'skull' : 'hood', weapon: 'orb', robe: true, tall: 0.95 }, o);
  if (role === 'armored') return humanoid(ctx, { body: c.base, trim: c.sec, rim: c.rim, eye: c.eye, head: 'helm', weapon: 'mace', shield: 'heater', plate: true, bulk: 1.3 }, o);
  humanoid(ctx, { body: c.base, trim: c.sec, rim: c.rim, eye: c.eye, head: skull ? 'skull' : 'horned', weapon: 'axe', tall: 0.94 }, o);
}

function drawCard(ctx: Ctx, id: string, o: DrawOpts): void {
  if (id === 'bastion_golem') return giant(ctx, GOLEM, o);
  if (id === 'phoenix_warden') return phoenix(ctx, o);
  if (id === 'aurora_drake') return wyrm(ctx, o);
  const b = CARDS[id];
  if (!b) return;
  const body = { ...b, rim: rimOf(id) };
  if (id !== 'wolf_rider') return humanoid(ctx, body, o);
  beast(ctx, '#2b2624', PAL.ember, rimOf(id), o, 1.25);
  ctx.save();
  ctx.translate(-2, -15);
  ctx.scale(0.92, 0.92);
  humanoid(ctx, body, { ...o, moving: false }, true);
  ctx.restore();
}

function drawBoss(ctx: Ctx, id: string, o: DrawOpts): void {
  const spec = BOSSES[BOSS_BY_ID.get(id)?.sprite ?? 'troll'] ?? BOSSES.troll!;
  if (spec === 'heart') return heart(ctx, o);
  if ('lord' in spec) {
    ctx.save();
    ctx.scale(spec.size, spec.size);
    humanoid(ctx, spec.lord, o);
    ctx.restore();
    return;
  }
  giant(ctx, spec, o);
}

function crown(ctx: Ctx, y: number, t: number): void {
  shape(ctx, [-4, y + 2, -4.5, y - 3, -2.5, y - 0.5, -1, y - 4.5, 0.6, y - 0.6, 2.4, y - 4, 3.2, y - 0.4, 4.6, y - 3.2, 4.4, y + 2], PAL.blackSteel, 0.6);
  for (const [x, yy] of [[-4.5, -3], [-1, -4.5], [2.4, -4], [4.6, -3.2]] as const) eye(ctx, x, y + yy, PAL.eyeRed, 0.45 + Math.sin(t * 4 + x) * 0.1);
}

export function drawSprite(ctx: Ctx, key: SpriteKey, x: number, y: number, o: DrawOpts): void {
  ctx.save();
  ctx.translate(x, y);
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  const s = o.scale;
  const fly = isFlying(key);
  const big = key.type === 'boss' ? 26 : key.type === 'card' && (key.id === 'bastion_golem' || key.id === 'wolf_rider') ? 17 : 12;
  ctx.fillStyle = `rgba(0,0,0,${fly ? 0.28 : 0.5})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, big * s * (fly ? 0.7 : 1), big * s * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  if (key.type === 'hero') {
    const aura = COSMETIC_BY_ID.get(key.aura);
    if (aura && aura.color !== 'transparent') halo(ctx, 0, -24 * s, 30 * s, mix(aura.color, PAL.charcoal, 0.3), 0.28 + Math.sin(o.t * 3) * 0.08);
  }
  if (o.elite) halo(ctx, 0, -24 * s, 24 * s, PAL.blood, 0.22 + Math.sin(o.t * 4) * 0.06);
  ctx.scale(s * o.facing, s);
  FLASH = Math.max(0, Math.min(1, o.hit)) * 0.7;
  switch (key.type) {
    case 'card':
      drawCard(ctx, key.id, o);
      break;
    case 'hero':
      ctx.scale(1.04, 1.04);
      humanoid(ctx, heroBody(key.cape), o);
      break;
    case 'enemy':
      drawEnemy(ctx, key.role, key.world, o);
      break;
    case 'boss':
      drawBoss(ctx, key.id, o);
      break;
  }
  FLASH = 0;
  if (o.elite) crown(ctx, -spriteHeight(key) + 2, o.t);
  ctx.restore();
}

/** Approximate on-screen height (in sprite units at scale 1) used to place health bars. */
export function spriteHeight(key: SpriteKey): number {
  if (key.type === 'boss') {
    const def = BOSS_BY_ID.get(key.id);
    return def?.sprite === 'treant' ? 100 : def?.sprite === 'ice_queen' ? 88 : 80;
  }
  if (key.type === 'card' && (key.id === 'phoenix_warden' || key.id === 'aurora_drake')) return 60;
  if (key.type === 'card' && key.id === 'bastion_golem') return 62;
  if (key.type === 'enemy' && key.role === 'flying') return 40;
  return 50;
}
