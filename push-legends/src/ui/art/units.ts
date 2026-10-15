import { COSMETIC_BY_ID } from '../../core/content/cosmetics';
import type { EnemyRole, Palette } from '../../core/content/types';
import { BOSS_BY_ID, getWorld } from '../../core/content/worlds';
import { circle, ellipse, glow, line, OUTLINE, paint, poly, rr, shade, shadow, type Ctx } from './draw';

/** Everything a sprite needs to animate. Units are drawn with feet at (x, y). */
export interface DrawOpts {
  t: number;
  facing: 1 | -1;
  /** 0..1 progress of the current attack swing (0 = idle). */
  attack: number;
  /** 0..1 white hit flash. */
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

type Weapon = 'bow' | 'longbow' | 'sword_shield' | 'staff_fire' | 'staff_ice' | 'staff_storm' | 'hammer' | 'daggers' | 'vial' | 'bomb' | 'axe' | 'tower_shield' | 'club' | 'orb' | 'greatsword' | 'none';
type Head = 'hood' | 'helmet' | 'wizard' | 'crown' | 'horns' | 'cap' | 'goggles' | 'hair' | 'skull' | 'crystal' | 'none';

interface Look {
  skin: string;
  body: string;
  trim: string;
  legs: string;
  head: Head;
  headColor: string;
  weapon: Weapon;
  weaponColor: string;
  cape?: string;
  bulk?: number;
  height?: number;
  cross?: boolean;
}

const SKIN = '#f2c79b';

const CARD_LOOKS: Record<string, Look> = {
  thornbow_archer: { skin: SKIN, body: '#3f8f4a', trim: '#d9f2a0', legs: '#6b4a2b', head: 'hood', headColor: '#2f6b38', weapon: 'bow', weaponColor: '#8a5a2b' },
  oakshield_knight: { skin: SKIN, body: '#4a6fb5', trim: '#f2c14e', legs: '#34405a', head: 'helmet', headColor: '#c9ced9', weapon: 'sword_shield', weaponColor: '#e5e8ee', cape: '#2f4f8f', bulk: 1.15 },
  field_medic: { skin: '#e0b088', body: '#f1ede2', trim: '#c0392b', legs: '#7f8c8d', head: 'cap', headColor: '#f1ede2', weapon: 'vial', weaponColor: '#7bd389', cross: true },
  powder_bombardier: { skin: '#d9a679', body: '#6e5440', trim: '#f9e79f', legs: '#3e2f25', head: 'goggles', headColor: '#5b4a3a', weapon: 'bomb', weaponColor: '#2c2c2c' },
  ember_mage: { skin: SKIN, body: '#b03a2e', trim: '#f39c12', legs: '#7b241c', head: 'wizard', headColor: '#922b21', weapon: 'staff_fire', weaponColor: '#6e2c00' },
  hawkeye_ranger: { skin: '#c99872', body: '#2e5e3e', trim: '#c8e6c9', legs: '#4a3520', head: 'hood', headColor: '#1e3d28', weapon: 'longbow', weaponColor: '#6b4f2a', cape: '#1e3d28' },
  dawn_paladin: { skin: SKIN, body: '#f4d03f', trim: '#ffffff', legs: '#b7950b', head: 'crown', headColor: '#f39c12', weapon: 'hammer', weaponColor: '#fdfefe', cape: '#fdfefe', bulk: 1.1 },
  frost_witch: { skin: '#f5e3d3', body: '#5dade2', trim: '#d6eaf8', legs: '#1b4f72', head: 'wizard', headColor: '#2e86c1', weapon: 'staff_ice', weaponColor: '#1b4f72' },
  aegis_guardian: { skin: '#d9a679', body: '#1f618d', trim: '#f5b041', legs: '#154360', head: 'helmet', headColor: '#f5b041', weapon: 'tower_shield', weaponColor: '#1f618d', bulk: 1.3 },
  shade_assassin: { skin: '#d7bde2', body: '#2c2c54', trim: '#8e44ad', legs: '#1b1b3a', head: 'hood', headColor: '#4a235a', weapon: 'daggers', weaponColor: '#e8daef', cape: '#4a235a' },
  storm_adept: { skin: SKIN, body: '#5b2c6f', trim: '#f7dc6f', legs: '#3b1d48', head: 'hair', headColor: '#f7dc6f', weapon: 'staff_storm', weaponColor: '#2c2c54' },
  wolf_rider: { skin: SKIN, body: '#b5462f', trim: '#e8d3a8', legs: '#6b3a2b', head: 'helmet', headColor: '#7a6a58', weapon: 'axe', weaponColor: '#bdc3c7' },
};

// --- Humanoid ----------------------------------------------------------------------------------

function weaponSwing(attack: number): number {
  if (attack <= 0) return 0;
  return Math.sin(Math.min(1, attack) * Math.PI) * 1.2;
}

function drawHumanoid(ctx: Ctx, look: Look, o: DrawOpts, seated = false): void {
  const bulk = look.bulk ?? 1;
  const h = look.height ?? 1;
  const walk = o.moving ? Math.sin(o.t * 12) : 0;
  const bob = o.moving ? Math.abs(Math.sin(o.t * 12)) * 1.2 : Math.sin(o.t * 2.5) * 0.5;
  const swing = weaponSwing(o.attack);
  ctx.save();
  ctx.translate(0, -bob);
  ctx.scale(1, h);

  // Cape (behind)
  if (look.cape) {
    poly(ctx, [
      [-5 * bulk, -26],
      [5 * bulk, -26],
      [7 * bulk + walk, -6],
      [-10 * bulk - Math.abs(walk) * 2, -5],
    ]);
    paint(ctx, look.cape, 1.2);
  }
  // Legs
  if (!seated) {
    rr(ctx, -5.5 * bulk, -11, 4.5, 11 + walk * 1.5, 2);
    paint(ctx, look.legs, 1.2);
    rr(ctx, 1 * bulk, -11, 4.5, 11 - walk * 1.5, 2);
    paint(ctx, shade(look.legs, -0.15), 1.2);
  }
  // Back arm / shield arm
  if (look.weapon === 'sword_shield' || look.weapon === 'tower_shield') {
    const big = look.weapon === 'tower_shield';
    rr(ctx, 4 * bulk - (big ? 2 : 0), big ? -30 : -25, big ? 9 : 7, big ? 24 : 13, 3);
    paint(ctx, look.weaponColor, 1.5);
    rr(ctx, 5.5 * bulk - (big ? 2 : 0), big ? -26 : -22, big ? 5 : 3.5, big ? 16 : 7, 1.5);
    paint(ctx, look.trim, 0);
  }
  // Body
  rr(ctx, -8 * bulk, -27, 16 * bulk, 17, 5);
  paint(ctx, look.body);
  rr(ctx, -8 * bulk, -15, 16 * bulk, 3, 1);
  paint(ctx, look.trim, 0);
  if (look.cross) {
    ctx.fillStyle = look.trim;
    ctx.fillRect(-1.5, -24, 3, 9);
    ctx.fillRect(-4.5, -21, 9, 3);
  }
  // Head
  circle(ctx, 0, -33, 7.5);
  paint(ctx, look.skin);
  drawHead(ctx, look);
  if (look.head !== 'skull') {
    ctx.fillStyle = OUTLINE;
    circle(ctx, 3.5, -33.5, 1.2);
    ctx.fill();
  }
  // Front arm + weapon
  ctx.save();
  ctx.translate(2, -22);
  ctx.rotate(-0.3 - swing);
  rr(ctx, -2, -2, 9, 4, 2);
  paint(ctx, shade(look.body, -0.1), 1.2);
  ctx.translate(8, 0);
  drawWeapon(ctx, look, o, swing);
  ctx.restore();
  ctx.restore();
}

function drawHead(ctx: Ctx, look: Look): void {
  const c = look.headColor;
  switch (look.head) {
    case 'hood':
      ctx.beginPath();
      ctx.arc(0, -33, 9, Math.PI * 0.95, Math.PI * 2.3);
      ctx.lineTo(-8, -26);
      ctx.closePath();
      paint(ctx, c);
      break;
    case 'helmet':
      ctx.beginPath();
      ctx.arc(0, -34, 8.3, Math.PI, 0);
      ctx.lineTo(8.3, -31);
      ctx.lineTo(-8.3, -31);
      ctx.closePath();
      paint(ctx, c);
      line(ctx, 2, -32, 8, -32, OUTLINE, 1.4);
      break;
    case 'wizard':
      poly(ctx, [
        [-10, -37],
        [10, -37],
        [3, -55],
        [-2, -50],
      ]);
      paint(ctx, c);
      rr(ctx, -10, -39, 20, 3.5, 1.5);
      paint(ctx, shade(c, 0.3), 1);
      break;
    case 'crown':
      poly(ctx, [
        [-7, -38],
        [7, -38],
        [8, -45],
        [4, -41],
        [0, -46],
        [-4, -41],
        [-8, -45],
      ]);
      paint(ctx, c, 1.2);
      break;
    case 'horns':
      poly(ctx, [
        [-6, -38],
        [-10, -47],
        [-3, -40],
      ]);
      paint(ctx, c, 1.2);
      poly(ctx, [
        [5, -39],
        [9, -48],
        [2, -40],
      ]);
      paint(ctx, c, 1.2);
      break;
    case 'cap':
      ctx.beginPath();
      ctx.arc(0, -35, 7.8, Math.PI, 0);
      ctx.closePath();
      paint(ctx, c, 1.2);
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(-1, -41, 2, 5);
      ctx.fillRect(-2.5, -39.5, 5, 2);
      break;
    case 'goggles':
      ctx.beginPath();
      ctx.arc(0, -35, 7.8, Math.PI, 0);
      ctx.closePath();
      paint(ctx, c, 1.2);
      circle(ctx, 4, -34, 2.6);
      paint(ctx, '#f9e79f', 1.2);
      break;
    case 'hair':
      ctx.beginPath();
      ctx.arc(0, -35, 8, Math.PI * 0.9, Math.PI * 2.05);
      ctx.lineTo(-6, -30);
      ctx.closePath();
      paint(ctx, c, 1.2);
      break;
    case 'skull':
      ctx.fillStyle = OUTLINE;
      circle(ctx, 3.2, -33.5, 2);
      ctx.fill();
      circle(ctx, -1.5, -33.5, 1.8);
      ctx.fill();
      ctx.fillRect(-1, -29, 5, 1.2);
      break;
    case 'crystal':
      for (const [x, hgt] of [
        [-4, 9],
        [1, 12],
        [5, 8],
      ] as const) {
        poly(ctx, [
          [x - 2.5, -38],
          [x + 2.5, -38],
          [x, -38 - hgt],
        ]);
        paint(ctx, c, 1);
      }
      break;
    default:
      break;
  }
}

function drawWeapon(ctx: Ctx, look: Look, o: DrawOpts, swing: number): void {
  const w = look.weaponColor;
  switch (look.weapon) {
    case 'bow':
    case 'longbow': {
      const s = look.weapon === 'longbow' ? 1.35 : 1;
      ctx.beginPath();
      ctx.arc(-2, 0, 10 * s, -Math.PI / 2.2, Math.PI / 2.2);
      ctx.strokeStyle = w;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      const pull = o.attack > 0 ? (1 - o.attack) * 4 : 0;
      line(ctx, 0, -9.5 * s, -3 - pull, 0, '#ecf0f1', 0.8);
      line(ctx, -3 - pull, 0, 0, 9.5 * s, '#ecf0f1', 0.8);
      break;
    }
    case 'sword_shield':
    case 'greatsword': {
      const len = look.weapon === 'greatsword' ? 22 : 15;
      ctx.save();
      ctx.rotate(-1.1 + swing * 0.8);
      rr(ctx, 0, -1.8, len, 3.6, 1.5);
      paint(ctx, w, 1.2);
      rr(ctx, -2, -4, 3, 8, 1);
      paint(ctx, look.trim, 1);
      ctx.restore();
      break;
    }
    case 'axe':
      ctx.save();
      ctx.rotate(-1.2 + swing);
      line(ctx, 0, 0, 14, 0, '#6e4b2a', 2.6);
      poly(ctx, [
        [10, -1],
        [16, -7],
        [17, 4],
      ]);
      paint(ctx, w, 1.2);
      ctx.restore();
      break;
    case 'hammer':
    case 'club':
      ctx.save();
      ctx.rotate(-1.3 + swing);
      line(ctx, 0, 0, 13, 0, look.weapon === 'club' ? shade(w, -0.3) : '#8d6e63', 2.6);
      rr(ctx, 11, -5, 7, 10, 2);
      paint(ctx, w, 1.3);
      ctx.restore();
      break;
    case 'staff_fire':
    case 'staff_ice':
    case 'staff_storm':
    case 'orb': {
      line(ctx, 0, 10, 0, -16, w, 2.4);
      const orb = look.weapon === 'staff_fire' ? '#f39c12' : look.weapon === 'staff_ice' ? '#aed6f1' : look.weapon === 'staff_storm' ? '#f7dc6f' : look.trim;
      glow(ctx, 0, -18, 8 + Math.sin(o.t * 6) * 1.5, orb, 0.7);
      circle(ctx, 0, -18, 3.4);
      paint(ctx, orb, 1.1);
      break;
    }
    case 'daggers':
      ctx.save();
      ctx.rotate(-0.6 + swing * 1.3);
      poly(ctx, [
        [0, -1.5],
        [10, 0],
        [0, 1.5],
      ]);
      paint(ctx, w, 1);
      ctx.restore();
      break;
    case 'vial':
      rr(ctx, -2, -6, 5, 8, 2);
      paint(ctx, w, 1.1);
      break;
    case 'bomb':
      circle(ctx, 2, -1, 4.5);
      paint(ctx, w, 1.2);
      line(ctx, 4, -5, 6, -8, '#f9e79f', 1.2);
      glow(ctx, 6, -8, 3 + Math.sin(o.t * 20), '#f39c12', 0.9);
      break;
    case 'tower_shield':
      line(ctx, 0, 0, 10, -4, '#bdc3c7', 2);
      break;
    default:
      break;
  }
}

// --- Creatures ---------------------------------------------------------------------------------

function drawBeast(ctx: Ctx, body: string, dark: string, accent: string, o: DrawOpts, size = 1): void {
  const run = o.moving ? o.t * 16 : 0;
  ctx.save();
  ctx.scale(size, size);
  const lift = o.moving ? Math.abs(Math.sin(run)) * 2 : 0;
  ctx.translate(0, -lift);
  // legs
  for (const [lx, ph] of [
    [-9, 0],
    [-5, Math.PI],
    [6, Math.PI / 2],
    [10, (Math.PI * 3) / 2],
  ] as const) {
    const sw = Math.sin(run + ph) * 3;
    line(ctx, lx, -9, lx + sw, 0, dark, 3.2);
  }
  // tail
  ctx.beginPath();
  ctx.moveTo(-13, -13);
  ctx.quadraticCurveTo(-21, -18 + Math.sin(o.t * 8) * 3, -20, -24);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.stroke();
  ellipse(ctx, 0, -13, 14, 7);
  paint(ctx, body);
  // head
  const bite = weaponSwing(o.attack) * 3;
  ellipse(ctx, 14 + bite, -18, 7, 5.5, -0.2);
  paint(ctx, body);
  poly(ctx, [
    [17 + bite, -17],
    [24 + bite, -15],
    [17 + bite, -13],
  ]);
  paint(ctx, shade(body, -0.1), 1.2);
  poly(ctx, [
    [10 + bite, -22],
    [12 + bite, -29],
    [15 + bite, -22],
  ]);
  paint(ctx, dark, 1.2);
  ctx.fillStyle = accent;
  circle(ctx, 16 + bite, -20, 1.5);
  ctx.fill();
  ctx.restore();
}

function drawFlyer(ctx: Ctx, body: string, wing: string, accent: string, o: DrawOpts, kind: 'bat' | 'moth' | 'wisp'): void {
  const flap = Math.sin(o.t * 18);
  ctx.save();
  ctx.translate(0, -22 + Math.sin(o.t * 4) * 2);
  if (kind === 'wisp') {
    glow(ctx, 0, 0, 16, accent, 0.5);
    for (let i = 0; i < 3; i++) {
      ellipse(ctx, -6 - i * 4, Math.sin(o.t * 6 + i) * 2, 5 - i, 3 - i * 0.6);
      paint(ctx, body, 0);
    }
  }
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(1, side);
    ctx.rotate(flap * 0.5 * side * (kind === 'moth' ? 0.6 : 1));
    if (kind === 'moth') {
      ellipse(ctx, -2, -10, 6, 10, -0.4);
      paint(ctx, wing, 1.2);
      circle(ctx, -3, -11, 2.2);
      paint(ctx, accent, 0);
    } else {
      poly(ctx, [
        [0, -2],
        [-8, -15],
        [-14, -8],
        [-18, -12],
        [-16, -1],
      ]);
      paint(ctx, wing, 1.2);
    }
    ctx.restore();
  }
  ellipse(ctx, 0, 0, 8, 6);
  paint(ctx, body);
  ctx.fillStyle = accent;
  circle(ctx, 4, -1.5, 1.6);
  ctx.fill();
  ctx.restore();
}

function drawGolemShape(ctx: Ctx, stone: string, dark: string, eye: string, o: DrawOpts, crystals = false): void {
  const step = o.moving ? Math.sin(o.t * 6) * 1.5 : 0;
  const swing = weaponSwing(o.attack);
  rr(ctx, -10, -12, 8, 12 + step, 2);
  paint(ctx, dark);
  rr(ctx, 2, -12, 8, 12 - step, 2);
  paint(ctx, dark);
  rr(ctx, -14, -36, 28, 26, 6);
  paint(ctx, stone);
  rr(ctx, -9, -48, 18, 14, 5);
  paint(ctx, shade(stone, 0.1));
  ctx.fillStyle = eye;
  glow(ctx, 3, -42, 6, eye, 0.8);
  rr(ctx, -2, -44, 9, 3, 1.5);
  ctx.fillStyle = eye;
  ctx.fill();
  if (crystals) {
    for (const [x, hh] of [
      [-8, 10],
      [-1, 14],
      [6, 9],
    ] as const) {
      poly(ctx, [
        [x - 3, -48],
        [x + 3, -48],
        [x, -48 - hh],
      ]);
      paint(ctx, eye, 1);
    }
  }
  ctx.save();
  ctx.translate(12, -30);
  ctx.rotate(-0.4 - swing);
  rr(ctx, -3, -3, 16, 9, 3);
  paint(ctx, shade(stone, -0.1));
  ctx.restore();
  rr(ctx, -18, -32, 7, 16, 3);
  paint(ctx, shade(stone, -0.15));
  // cracks
  line(ctx, -6, -30, -2, -22, shade(stone, -0.35), 1.2);
  line(ctx, 4, -20, 8, -27, shade(stone, -0.35), 1.2);
}

function drawPhoenix(ctx: Ctx, o: DrawOpts): void {
  const flap = Math.sin(o.t * 10);
  ctx.save();
  ctx.translate(0, -28 + Math.sin(o.t * 3) * 2);
  glow(ctx, 0, 0, 26, '#f39c12', 0.45);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(1, side);
    ctx.rotate(flap * 0.45 * side);
    poly(ctx, [
      [-2, -2],
      [-6, -22],
      [-14, -18],
      [-20, -24],
      [-22, -10],
      [-12, -2],
    ]);
    paint(ctx, side > 0 ? '#e74c3c' : '#f5b041', 1.3);
    ctx.restore();
  }
  // tail flames
  for (let i = 0; i < 3; i++) {
    poly(ctx, [
      [-8, 0],
      [-24 - i * 3, -4 + i * 4 + Math.sin(o.t * 12 + i) * 2],
      [-10, 4],
    ]);
    paint(ctx, i === 1 ? '#f9e79f' : '#e67e22', 0);
  }
  ellipse(ctx, 0, 0, 11, 7);
  paint(ctx, '#e74c3c');
  circle(ctx, 10, -5, 5.5);
  paint(ctx, '#f5b041');
  poly(ctx, [
    [14, -6],
    [20, -4],
    [14, -2],
  ]);
  paint(ctx, '#f9e79f', 1);
  poly(ctx, [
    [8, -10],
    [6, -18],
    [11, -11],
  ]);
  paint(ctx, '#f9e79f', 1);
  ctx.fillStyle = OUTLINE;
  circle(ctx, 11.5, -6, 1.2);
  ctx.fill();
  ctx.restore();
}

function drawDragon(ctx: Ctx, main: string, wing: string, accent: string, o: DrawOpts, size = 1): void {
  const flap = Math.sin(o.t * 6);
  ctx.save();
  ctx.scale(size, size);
  ctx.translate(0, -30 + Math.sin(o.t * 2.5) * 2);
  glow(ctx, 0, 0, 30, accent, 0.35);
  // far wing
  ctx.save();
  ctx.rotate(-0.2 + flap * 0.35);
  poly(ctx, [
    [-4, -4],
    [-14, -30],
    [-22, -26],
    [-30, -32],
    [-28, -12],
  ]);
  paint(ctx, shade(wing, -0.2), 1.3);
  ctx.restore();
  // tail
  ctx.beginPath();
  ctx.moveTo(-10, 2);
  ctx.quadraticCurveTo(-28, 10 + Math.sin(o.t * 4) * 4, -38, 0);
  ctx.strokeStyle = main;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.stroke();
  ellipse(ctx, 0, 0, 16, 9);
  paint(ctx, main);
  ellipse(ctx, 2, 4, 11, 4);
  paint(ctx, shade(main, 0.4), 0);
  // neck + head
  ctx.beginPath();
  ctx.moveTo(10, -4);
  ctx.quadraticCurveTo(18, -14, 22, -16);
  ctx.strokeStyle = main;
  ctx.lineWidth = 7;
  ctx.stroke();
  ellipse(ctx, 25, -17, 8, 5.5, 0.15);
  paint(ctx, main);
  poly(ctx, [
    [21, -21],
    [17, -30],
    [24, -22],
  ]);
  paint(ctx, accent, 1);
  ctx.fillStyle = '#fdfefe';
  circle(ctx, 27, -19, 1.6);
  ctx.fill();
  if (o.attack > 0) glow(ctx, 36, -16, 10 * weaponSwing(o.attack) + 2, accent, 0.9);
  // near wing
  ctx.save();
  ctx.rotate(0.15 - flap * 0.4);
  poly(ctx, [
    [-2, -6],
    [-10, -34],
    [-20, -28],
    [-28, -36],
    [-26, -12],
  ]);
  paint(ctx, wing, 1.3);
  ctx.restore();
  ctx.restore();
}

// --- Bosses ------------------------------------------------------------------------------------

function drawTreant(ctx: Ctx, p: Palette, o: DrawOpts): void {
  const sway = Math.sin(o.t * 1.5) * 2;
  const swing = weaponSwing(o.attack);
  for (const lx of [-12, 4]) {
    rr(ctx, lx, -16, 10, 16, 3);
    paint(ctx, shade(p.primary, -0.2));
  }
  rr(ctx, -18, -64, 36, 52, 10);
  paint(ctx, p.primary);
  for (let i = 0; i < 4; i++) line(ctx, -10 + i * 7, -58, -12 + i * 7, -20, shade(p.primary, -0.3), 1.5);
  // canopy
  for (const [cx, cy, r] of [
    [-14, -72, 16],
    [8, -78, 18],
    [20, -66, 13],
    [-4, -86, 14],
  ] as const) {
    circle(ctx, cx + sway, cy, r);
    paint(ctx, p.secondary);
  }
  // glowing face
  glow(ctx, 4, -48, 12, p.accent, 0.6);
  ctx.fillStyle = p.accent;
  circle(ctx, -2, -50, 2.6);
  ctx.fill();
  circle(ctx, 8, -50, 2.6);
  ctx.fill();
  rr(ctx, -3, -40, 13, 4, 2);
  ctx.fillStyle = '#1b1b1b';
  ctx.fill();
  // branch arm
  ctx.save();
  ctx.translate(14, -46);
  ctx.rotate(-0.2 - swing * 0.9);
  line(ctx, 0, 0, 26, 6, shade(p.primary, -0.1), 6);
  line(ctx, 20, 5, 30, -3, shade(p.primary, -0.1), 3);
  ctx.restore();
}

function drawIceQueen(ctx: Ctx, p: Palette, o: DrawOpts): void {
  const wave = Math.sin(o.t * 3);
  // serpent coils
  for (let i = 0; i < 5; i++) {
    ellipse(ctx, -24 + i * 9, -8 - Math.sin(o.t * 3 + i) * 2, 9, 7);
    paint(ctx, i % 2 ? p.primary : shade(p.primary, -0.1));
  }
  // torso
  rr(ctx, 6, -52, 18, 44, 8);
  paint(ctx, p.primary);
  ellipse(ctx, 15, -30, 6, 14);
  paint(ctx, shade(p.primary, 0.4), 0);
  // head and crown
  ellipse(ctx, 20, -60, 10, 8, 0.2);
  paint(ctx, p.primary);
  poly(ctx, [
    [12, -66],
    [14, -82],
    [18, -70],
    [22, -86],
    [25, -70],
    [30, -80],
    [29, -64],
  ]);
  paint(ctx, p.accent, 1.3);
  glow(ctx, 25, -61, 7, '#5dade2', 0.8);
  ctx.fillStyle = '#1b4f72';
  circle(ctx, 25, -61, 1.8);
  ctx.fill();
  // wings of ice
  ctx.save();
  ctx.translate(8, -48);
  ctx.rotate(-0.3 + wave * 0.1);
  poly(ctx, [
    [0, 0],
    [-26, -30],
    [-18, -8],
    [-32, -12],
    [-10, 6],
  ]);
  paint(ctx, shade(p.secondary, 0.5), 1.3);
  ctx.restore();
  if (o.attack > 0) glow(ctx, 34, -58, 14 * weaponSwing(o.attack), '#d6eaf8', 0.9);
}

function drawTitan(ctx: Ctx, p: Palette, o: DrawOpts): void {
  drawGolemShape(ctx, p.primary, shade(p.primary, -0.3), p.secondary, o);
  // lava cracks and glow
  glow(ctx, 0, -26, 20, p.secondary, 0.35 + Math.sin(o.t * 4) * 0.1);
  line(ctx, -10, -32, -4, -18, p.secondary, 2);
  line(ctx, 2, -34, 9, -20, p.secondary, 2);
  line(ctx, -2, -46, 3, -38, p.accent, 1.5);
}

function drawLich(ctx: Ctx, p: Palette, o: DrawOpts): void {
  const float = Math.sin(o.t * 2) * 2;
  ctx.save();
  ctx.translate(0, float);
  // robe
  poly(ctx, [
    [-16, -4],
    [16, -4],
    [10, -50],
    [-10, -50],
  ]);
  paint(ctx, p.primary);
  for (let i = -12; i <= 12; i += 6) line(ctx, i, -4, i + Math.sin(o.t * 5 + i) * 2, 2, shade(p.primary, -0.2), 3);
  // skull
  circle(ctx, 0, -58, 9.5);
  paint(ctx, p.secondary);
  ctx.fillStyle = OUTLINE;
  circle(ctx, -3, -59, 2.6);
  ctx.fill();
  circle(ctx, 4, -59, 2.6);
  ctx.fill();
  glow(ctx, 4, -59, 5, p.accent, 0.9);
  // crown
  poly(ctx, [
    [-9, -64],
    [9, -64],
    [11, -74],
    [5, -68],
    [0, -76],
    [-5, -68],
    [-11, -74],
  ]);
  paint(ctx, '#d4ac0d', 1.3);
  // staff
  const swing = weaponSwing(o.attack);
  ctx.save();
  ctx.translate(14, -36);
  ctx.rotate(-0.15 - swing * 0.5);
  line(ctx, 0, 30, 0, -26, '#4d4d4d', 3);
  glow(ctx, 0, -30, 10, p.accent, 0.8);
  circle(ctx, 0, -30, 4);
  paint(ctx, p.accent, 1.2);
  ctx.restore();
  ctx.restore();
}

function drawCrystalHeart(ctx: Ctx, p: Palette, o: DrawOpts): void {
  ctx.save();
  ctx.translate(0, -44 + Math.sin(o.t * 2) * 3);
  glow(ctx, 0, 0, 44, p.secondary, 0.35);
  for (let i = 0; i < 5; i++) {
    const a = o.t * 1.2 + (i * Math.PI * 2) / 5;
    ctx.save();
    ctx.translate(Math.cos(a) * 30, Math.sin(a) * 14);
    poly(ctx, [
      [0, -7],
      [4, 0],
      [0, 7],
      [-4, 0],
    ]);
    paint(ctx, i % 2 ? p.secondary : p.accent, 1);
    ctx.restore();
  }
  poly(ctx, [
    [0, -26],
    [18, -6],
    [12, 18],
    [-12, 18],
    [-18, -6],
  ]);
  paint(ctx, p.primary, 2);
  poly(ctx, [
    [0, -26],
    [6, -4],
    [0, 18],
    [-6, -4],
  ]);
  paint(ctx, shade(p.primary, 0.35), 0);
  glow(ctx, 0, -2, 10 + Math.sin(o.t * 5) * 2, p.accent, 0.9);
  ctx.restore();
}

function drawBigBrute(ctx: Ctx, p: Palette, o: DrawOpts, kind: 'troll' | 'yeti' | 'overseer' | 'warden' | 'shardmaw'): void {
  const look: Look =
    kind === 'troll'
      ? { skin: p.primary, body: p.secondary, trim: p.accent, legs: shade(p.secondary, -0.2), head: 'horns', headColor: shade(p.accent, -0.3), weapon: 'club', weaponColor: '#795548', bulk: 1.5 }
      : kind === 'yeti'
        ? { skin: '#d6eaf8', body: p.primary, trim: p.accent, legs: p.primary, head: 'hair', headColor: '#ffffff', weapon: 'none', weaponColor: '#fff', bulk: 1.6 }
        : kind === 'overseer'
          ? { skin: '#a04000', body: p.primary, trim: p.secondary, legs: shade(p.primary, -0.2), head: 'helmet', headColor: p.primary, weapon: 'hammer', weaponColor: p.secondary, bulk: 1.45, cape: '#922b21' }
          : kind === 'warden'
            ? { skin: '#d5dbdb', body: p.secondary, trim: p.accent, legs: p.secondary, head: 'skull', headColor: p.primary, weapon: 'orb', weaponColor: '#4d4d4d', bulk: 1.3, cape: p.primary }
            : { skin: p.primary, body: p.primary, trim: p.secondary, legs: shade(p.primary, -0.2), head: 'crystal', headColor: p.secondary, weapon: 'none', weaponColor: '#fff', bulk: 1.5 };
  if (kind === 'shardmaw') {
    drawBeast(ctx, p.primary, shade(p.primary, -0.3), p.accent, o, 1.6);
    for (let i = 0; i < 4; i++) {
      poly(ctx, [
        [-14 + i * 8, -30],
        [-10 + i * 8, -30],
        [-12 + i * 8, -42 - (i % 2) * 5],
      ]);
      paint(ctx, p.secondary, 1);
    }
    return;
  }
  drawHumanoid(ctx, look, o);
}

// --- Public entry points -----------------------------------------------------------------------

function enemyLook(role: EnemyRole, world: number): Look {
  const w = getWorld(world);
  const p = w.enemyPalette;
  const skeleton = world === 3;
  const crystal = world === 4;
  const skin = skeleton ? '#e8e4d8' : crystal ? '#c39bd3' : world === 1 ? '#aed6f1' : world === 2 ? '#e59866' : '#9ccc65';
  const head: Head = skeleton ? 'skull' : crystal ? 'crystal' : 'horns';
  if (role === 'ranged') return { skin, body: p.secondary, trim: p.accent, legs: shade(p.secondary, -0.2), head: skeleton ? 'skull' : 'hood', headColor: shade(p.secondary, -0.1), weapon: 'orb', weaponColor: '#5d4037', height: 0.92 };
  if (role === 'armored') return { skin, body: shade(p.primary, -0.25), trim: p.accent, legs: shade(p.secondary, -0.3), head: skeleton ? 'skull' : 'helmet', headColor: '#7f8c8d', weapon: 'sword_shield', weaponColor: '#95a5a6', bulk: 1.35 };
  return { skin, body: p.primary, trim: p.accent, legs: p.secondary, head, headColor: shade(p.accent, -0.2), weapon: 'club', weaponColor: shade(p.secondary, 0.2), height: 0.85 };
}

export function drawSprite(ctx: Ctx, key: SpriteKey, x: number, y: number, o: DrawOpts): void {
  ctx.save();
  ctx.translate(x, y);
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  const s = o.scale;
  const flying = (key.type === 'enemy' && key.role === 'flying') || (key.type === 'card' && (key.id === 'phoenix_warden' || key.id === 'aurora_drake')) || (key.type === 'boss' && key.id === 'nyxara');
  shadow(ctx, 0, 0, (key.type === 'boss' ? 26 : 12) * s * (flying ? 0.7 : 1));
  if (o.elite) glow(ctx, 0, -22 * s, 30 * s, '#f4d03f', 0.35 + Math.sin(o.t * 4) * 0.1);
  if (key.type === 'hero') {
    const aura = COSMETIC_BY_ID.get(key.aura);
    if (aura && aura.color !== 'transparent') glow(ctx, 0, -22 * s, 32 * s, aura.color, 0.4 + Math.sin(o.t * 3) * 0.12);
  }
  ctx.scale(s * o.facing, s);
  switch (key.type) {
    case 'card':
      drawCard(ctx, key.id, o);
      break;
    case 'hero': {
      const cape = COSMETIC_BY_ID.get(key.cape);
      drawHumanoid(
        ctx,
        { skin: SKIN, body: '#7d5ba6', trim: '#f4d03f', legs: '#3b2a5c', head: 'hair', headColor: '#6e2c00', weapon: 'greatsword', weaponColor: '#ecf0f1', cape: cape?.color ?? '#c0392b', bulk: 1.15, height: 1.08 },
        o,
      );
      break;
    }
    case 'enemy':
      drawEnemy(ctx, key.role, key.world, o);
      break;
    case 'boss':
      drawBoss(ctx, key.id, o);
      break;
  }
  if (o.hit > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(255,255,255,${0.75 * o.hit})`;
    ctx.fillRect(-80, -140, 160, 150);
  }
  ctx.restore();
}

function drawCard(ctx: Ctx, id: string, o: DrawOpts): void {
  if (id === 'bastion_golem') return drawGolemShape(ctx, '#95a5a6', '#566573', '#5dade2', o);
  if (id === 'phoenix_warden') return drawPhoenix(ctx, o);
  if (id === 'aurora_drake') return drawDragon(ctx, '#48c9b0', '#a569bd', '#e8f8f5', o);
  if (id === 'wolf_rider') {
    drawBeast(ctx, '#8d7b68', '#5d4e3f', '#f1c40f', o, 1.1);
    ctx.save();
    ctx.translate(-2, -14);
    ctx.scale(0.85, 0.85);
    drawHumanoid(ctx, CARD_LOOKS.wolf_rider!, { ...o, moving: false }, true);
    ctx.restore();
    return;
  }
  const look = CARD_LOOKS[id];
  if (look) drawHumanoid(ctx, look, o);
}

function drawEnemy(ctx: Ctx, role: EnemyRole, world: number, o: DrawOpts): void {
  const w = getWorld(world);
  const p = w.enemyPalette;
  if (role === 'fast') {
    const fur = world === 1 ? '#ecf0f1' : world === 2 ? '#7b241c' : world === 3 ? '#839192' : world === 4 ? '#4a235a' : '#a1887f';
    return drawBeast(ctx, fur, shade(fur, -0.35), p.accent, o, 0.9);
  }
  if (role === 'flying') return drawFlyer(ctx, p.primary, shade(p.secondary, 0.1), p.accent, o, world === 0 ? 'moth' : world === 1 ? 'wisp' : 'bat');
  if (role === 'armored' && world === 4) return drawGolemShape(ctx, '#7d3c98', '#4a235a', '#48c9b0', o, true);
  drawHumanoid(ctx, enemyLook(role, world), o);
}

const BOSS_DRAW: Record<string, (ctx: Ctx, p: Palette, o: DrawOpts) => void> = {
  treant: drawTreant,
  ice_queen: drawIceQueen,
  magma_titan: drawTitan,
  lich_king: drawLich,
  crystal_heart: drawCrystalHeart,
  troll: (c, p, o) => drawBigBrute(c, p, o, 'troll'),
  yeti: (c, p, o) => drawBigBrute(c, p, o, 'yeti'),
  overseer: (c, p, o) => drawBigBrute(c, p, o, 'overseer'),
  warden: (c, p, o) => drawBigBrute(c, p, o, 'warden'),
  shardmaw: (c, p, o) => drawBigBrute(c, p, o, 'shardmaw'),
};


function drawBoss(ctx: Ctx, id: string, o: DrawOpts): void {
  const def = BOSS_BY_ID.get(id);
  if (!def) return;
  (BOSS_DRAW[def.sprite] ?? drawTreant)(ctx, def.palette, o);
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
