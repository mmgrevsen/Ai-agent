import type { BuildingId } from '../../core/content/buildings';
import { getItem } from '../../core/content/equipment';
import { getPet } from '../../core/content/pets';
import { getWorld } from '../../core/content/worlds';
import { circle, ellipse, glow, line, OUTLINE, paint, poly, rr, shade, type Ctx } from './draw';

// --- World backgrounds ---------------------------------------------------------------------------

/** Paints a parallax world background. `scroll` shifts the far layers slightly for depth. */
export function drawWorldBackground(ctx: Ctx, world: number, w: number, h: number, groundY: number, t: number, scroll = 0): void {
  const def = getWorld(world);
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, def.sky[0]);
  sky.addColorStop(1, def.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, groundY + 2);

  // Sun / moon / glow
  if (world === 2) glow(ctx, w * 0.75, groundY * 0.35, w * 0.35, '#e74c3c', 0.35);
  else if (world === 4) glow(ctx, w * 0.5, groundY * 0.4, w * 0.4, '#48c9b0', 0.25);
  else {
    circle(ctx, w * 0.8, groundY * 0.25, 18);
    ctx.fillStyle = world === 3 ? 'rgba(236,240,241,0.6)' : 'rgba(255,250,220,0.9)';
    ctx.fill();
  }

  // Drifting clouds (or ash/crystal motes in darker worlds)
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 137 + t * (6 + i * 2) + world * 40) % (w + 160)) - 80;
    const cy = groundY * (0.12 + ((i * 53) % 40) / 100);
    if (world === 2 || world === 4) {
      glow(ctx, cx, cy, 30 + i * 4, world === 2 ? '#e67e22' : '#a569bd', 0.12);
      continue;
    }
    ctx.fillStyle = world === 3 ? 'rgba(200,210,220,0.25)' : 'rgba(255,255,255,0.75)';
    for (const [dx, dy, r] of [
      [0, 0, 16],
      [18, -6, 20],
      [38, 0, 15],
      [18, 6, 14],
    ] as const) {
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, r * (0.8 + (i % 3) * 0.2), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Far hills / mountains
  const far = shade(def.groundDark, world === 1 ? 0.35 : 0.15);
  ctx.fillStyle = far;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  for (let x = 0; x <= w + 40; x += 40) {
    const peak = world === 1 || world === 2 ? 0.55 : 0.3;
    const yy = groundY - h * (0.12 + peak * 0.5 * (0.5 + 0.5 * Math.sin((x + scroll * 0.2) * 0.013 + world)));
    ctx.lineTo(x, yy);
  }
  ctx.lineTo(w, groundY);
  ctx.closePath();
  ctx.fill();

  // Mid layer details per world
  for (let i = 0; i < 9; i++) {
    const x = ((i * 97 + world * 31 - scroll * 0.5) % (w + 60)) - 30;
    const base = groundY + 2;
    if (world === 0) {
      line(ctx, x, base, x, base - 46, '#5d4037', 6);
      circle(ctx, x, base - 52, 18);
      paint(ctx, i % 2 ? '#2e7d32' : '#388e3c', 0);
      glow(ctx, x + 10, base - 8, 6, '#c6ff00', 0.4 + 0.2 * Math.sin(t * 2 + i));
    } else if (world === 1) {
      poly(ctx, [
        [x - 14, base],
        [x, base - 50],
        [x + 14, base],
      ]);
      paint(ctx, '#d6eaf8', 0);
      poly(ctx, [
        [x - 9, base - 20],
        [x, base - 50],
        [x + 9, base - 20],
      ]);
      paint(ctx, '#ffffff', 0);
    } else if (world === 2) {
      rr(ctx, x - 10, base - 40, 20, 40, 2);
      paint(ctx, '#2c1f1c', 0);
      glow(ctx, x, base - 30, 10, '#e67e22', 0.4 + 0.2 * Math.sin(t * 3 + i));
    } else if (world === 3) {
      rr(ctx, x - 8, base - 34 - (i % 3) * 8, 16, 34 + (i % 3) * 8, 1);
      paint(ctx, '#4d5656', 0);
      for (let k = 0; k < 3; k++) ctx.fillRect(x - 8 + k * 6, base - 38 - (i % 3) * 8, 4, 4);
    } else {
      poly(ctx, [
        [x - 8, base],
        [x - 2, base - 40 - (i % 3) * 10],
        [x + 8, base],
      ]);
      paint(ctx, i % 2 ? '#6c3483' : '#48c9b0', 0);
      glow(ctx, x - 2, base - 25, 12, '#48c9b0', 0.25);
    }
  }

  // Ground
  const ground = ctx.createLinearGradient(0, groundY, 0, h);
  ground.addColorStop(0, def.ground);
  ground.addColorStop(1, def.groundDark);
  ctx.fillStyle = ground;
  ctx.fillRect(0, groundY, w, h - groundY);
  ctx.fillStyle = shade(def.ground, 0.15);
  ctx.fillRect(0, groundY, w, 3);
  // Ground speckles
  ctx.fillStyle = shade(def.groundDark, -0.15);
  for (let i = 0; i < 30; i++) {
    const x = (i * 53) % w;
    const y = groundY + 8 + ((i * 37) % Math.max(1, h - groundY - 10));
    ctx.fillRect(x, y, 3, 2);
  }
}

/** The player's gate on the left and the enemy portal on the right. */
export function drawBattleProps(ctx: Ctx, world: number, leftX: number, rightX: number, groundY: number, t: number): void {
  // Player gate
  rr(ctx, leftX - 22, groundY - 70, 26, 70, 3);
  paint(ctx, '#8d6e63');
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(leftX - 22 + i * 9, groundY - 76, 6, 8);
  }
  line(ctx, leftX - 6, groundY - 70, leftX - 6, groundY - 104, '#5d4037', 2.5);
  poly(ctx, [
    [leftX - 6, groundY - 104],
    [leftX + 16 + Math.sin(t * 4) * 2, groundY - 98],
    [leftX - 6, groundY - 90],
  ]);
  paint(ctx, '#f4d03f', 1.2);
  // Enemy portal
  const accent = getWorld(world).accent;
  glow(ctx, rightX, groundY - 34, 46, accent, 0.35 + Math.sin(t * 3) * 0.1);
  ellipse(ctx, rightX, groundY - 34, 16, 34);
  paint(ctx, shade(accent, -0.55), 3, shade(accent, -0.2));
  ellipse(ctx, rightX, groundY - 34, 10 + Math.sin(t * 5) * 2, 26);
  ctx.fillStyle = shade(accent, 0.1);
  ctx.globalAlpha *= 0.6;
  ctx.fill();
  ctx.globalAlpha /= 0.6;
}

// --- Buildings -----------------------------------------------------------------------------------

const BUILDING_COLORS: Record<BuildingId, { wall: string; roof: string; accent: string }> = {
  castle: { wall: '#d5d8dc', roof: '#2e4053', accent: '#f4d03f' },
  gold_mine: { wall: '#8d6e63', roof: '#5d4037', accent: '#f1c40f' },
  barracks: { wall: '#cd6155', roof: '#78281f', accent: '#f5b041' },
  academy: { wall: '#aed6f1', roof: '#1f618d', accent: '#f7dc6f' },
  blacksmith: { wall: '#7f8c8d', roof: '#424949', accent: '#e67e22' },
  training_grounds: { wall: '#d7bde2', roof: '#6c3483', accent: '#58d68d' },
  treasury: { wall: '#f9e79f', roof: '#b7950b', accent: '#ffffff' },
  pet_sanctuary: { wall: '#a9dfbf', roof: '#1e8449', accent: '#f5b7b1' },
  guild_hall: { wall: '#f5cba7', roof: '#935116', accent: '#5dade2' },
};

/** Draws a building whose size and decoration grow with its level. (cx, baseY) is the bottom centre. */
export function drawBuilding(ctx: Ctx, id: BuildingId, level: number, cx: number, baseY: number, scale: number, t: number): void {
  const c = BUILDING_COLORS[id];
  ctx.save();
  ctx.translate(cx, baseY);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ellipse(ctx, 0, 0, 40, 7);
  ctx.fill();
  if (level <= 0) {
    // Construction site
    rr(ctx, -26, -8, 52, 8, 2);
    paint(ctx, '#a1887f');
    line(ctx, -20, -8, -20, -40, '#8d6e63', 3);
    line(ctx, 20, -8, 20, -40, '#8d6e63', 3);
    line(ctx, -24, -36, 24, -36, '#8d6e63', 3);
    rr(ctx, -10, -24, 20, 14, 2);
    paint(ctx, '#bcaaa4');
    ctx.restore();
    return;
  }
  const tier = Math.min(4, Math.floor(level / 5));
  const wide = 34 + tier * 4;
  const tall = 30 + tier * 7;
  if (id === 'castle') {
    for (const sx of [-1, 1]) {
      rr(ctx, sx * (wide - 6) - 9, -tall - 22, 18, tall + 22, 2);
      paint(ctx, shade(c.wall, -0.08));
      poly(ctx, [
        [sx * (wide - 6) - 12, -tall - 22],
        [sx * (wide - 6) + 12, -tall - 22],
        [sx * (wide - 6), -tall - 42],
      ]);
      paint(ctx, c.roof);
    }
    rr(ctx, -wide + 6, -tall, (wide - 6) * 2, tall, 3);
    paint(ctx, c.wall);
    rr(ctx, -8, -16, 16, 16, 7);
    paint(ctx, '#5d4037');
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = c.wall;
      ctx.fillRect(-wide + 8 + i * ((wide * 2 - 18) / 4), -tall - 6, 7, 7);
    }
    line(ctx, 0, -tall - 6, 0, -tall - 34, '#5d4037', 2);
    poly(ctx, [
      [0, -tall - 34],
      [16 + Math.sin(t * 3) * 2, -tall - 29],
      [0, -tall - 24],
    ]);
    paint(ctx, c.accent, 1);
  } else {
    rr(ctx, -wide / 2 - 8, -tall, wide + 16, tall, 3);
    paint(ctx, c.wall);
    poly(ctx, [
      [-wide / 2 - 14, -tall],
      [wide / 2 + 14, -tall],
      [0, -tall - 22 - tier * 3],
    ]);
    paint(ctx, c.roof);
    rr(ctx, -6, -14, 12, 14, 5);
    paint(ctx, shade(c.roof, -0.2));
    // windows by tier
    for (let i = 0; i <= tier; i++) {
      rr(ctx, -wide / 2 + 2 + i * 10, -tall + 8, 6, 6, 1);
      paint(ctx, c.accent, 1);
    }
    drawBuildingEmblem(ctx, id, c, tall, t);
  }
  if (tier >= 2) glow(ctx, 0, -tall / 2, wide * 1.2, c.accent, 0.12 + 0.04 * Math.sin(t * 2));
  ctx.restore();
}

function drawBuildingEmblem(ctx: Ctx, id: BuildingId, c: { wall: string; roof: string; accent: string }, tall: number, t: number): void {
  const y = -tall - 8;
  switch (id) {
    case 'gold_mine':
      for (let i = 0; i < 3; i++) {
        circle(ctx, 22 + i * 5, -4 - (i % 2) * 4, 3.5);
        paint(ctx, '#f1c40f', 1);
      }
      break;
    case 'barracks':
      line(ctx, -4, y, 4, y - 10, '#bdc3c7', 2.5);
      line(ctx, 4, y, -4, y - 10, '#bdc3c7', 2.5);
      break;
    case 'academy':
      rr(ctx, -6, y - 8, 12, 8, 1);
      paint(ctx, c.accent, 1);
      break;
    case 'blacksmith':
      glow(ctx, 18, -8, 10 + Math.sin(t * 8) * 2, '#e67e22', 0.7);
      rr(ctx, 12, -8, 12, 6, 1);
      paint(ctx, '#424949', 1);
      break;
    case 'training_grounds':
      line(ctx, 22, 0, 22, -26, '#8d6e63', 3);
      circle(ctx, 22, -28, 6);
      paint(ctx, '#e74c3c', 1.2);
      break;
    case 'treasury':
      circle(ctx, 0, y - 4, 6);
      paint(ctx, '#f1c40f', 1.2);
      break;
    case 'pet_sanctuary':
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(-3, y - 4, 3.5, 0, Math.PI * 2);
      ctx.arc(3, y - 4, 3.5, 0, Math.PI * 2);
      ctx.moveTo(-6.5, y - 3);
      ctx.lineTo(0, y + 4);
      ctx.lineTo(6.5, y - 3);
      ctx.fill();
      break;
    case 'guild_hall':
      line(ctx, 0, y, 0, y - 16, '#5d4037', 2);
      poly(ctx, [
        [0, y - 16],
        [12, y - 12],
        [0, y - 8],
      ]);
      paint(ctx, c.accent, 1);
      break;
    default:
      break;
  }
}

// --- Items & pets ----------------------------------------------------------------------------------

export function drawItemIcon(ctx: Ctx, defId: string, cx: number, cy: number, size: number): void {
  const def = getItem(defId);
  const p = def.palette;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 40, size / 40);
  switch (def.kind) {
    case 'Sword':
    case 'Greatsword':
      ctx.rotate(-Math.PI / 4);
      rr(ctx, -3, -18, 6, 26, 2);
      paint(ctx, p.primary);
      rr(ctx, -9, 7, 18, 4, 2);
      paint(ctx, p.secondary);
      rr(ctx, -2.5, 11, 5, 8, 2);
      paint(ctx, '#6e4b2a');
      break;
    case 'Axe':
      ctx.rotate(-Math.PI / 6);
      line(ctx, 0, 16, 0, -14, '#6e4b2a', 4);
      poly(ctx, [
        [0, -14],
        [14, -18],
        [14, 0],
        [0, -4],
      ]);
      paint(ctx, p.secondary);
      break;
    case 'Hammer':
      ctx.rotate(-Math.PI / 6);
      line(ctx, 0, 16, 0, -10, '#6e4b2a', 4);
      rr(ctx, -12, -18, 24, 12, 3);
      paint(ctx, p.primary);
      break;
    case 'Spear':
      ctx.rotate(-Math.PI / 4);
      line(ctx, 0, 18, 0, -10, '#6e4b2a', 3);
      poly(ctx, [
        [-5, -10],
        [0, -22],
        [5, -10],
      ]);
      paint(ctx, p.secondary);
      break;
    case 'Helmet':
    case 'Crown':
      if (def.kind === 'Crown') {
        poly(ctx, [
          [-14, 8],
          [14, 8],
          [16, -10],
          [8, -2],
          [0, -14],
          [-8, -2],
          [-16, -10],
        ]);
        paint(ctx, p.primary);
      } else {
        ctx.beginPath();
        ctx.arc(0, 4, 15, Math.PI, 0);
        ctx.lineTo(15, 10);
        ctx.lineTo(-15, 10);
        ctx.closePath();
        paint(ctx, p.primary);
        line(ctx, 0, -10, 0, 8, p.secondary, 2);
      }
      break;
    case 'Armor':
      poly(ctx, [
        [-14, -14],
        [-6, -16],
        [0, -10],
        [6, -16],
        [14, -14],
        [12, 16],
        [-12, 16],
      ]);
      paint(ctx, p.primary);
      line(ctx, 0, -10, 0, 14, p.secondary, 2);
      break;
    case 'Gloves':
    case 'Gauntlets':
      rr(ctx, -10, -12, 20, 22, 6);
      paint(ctx, p.primary);
      rr(ctx, -10, 6, 20, 8, 3);
      paint(ctx, p.secondary);
      break;
    case 'Boots':
    case 'Greaves':
      poly(ctx, [
        [-8, -16],
        [4, -16],
        [4, 6],
        [16, 8],
        [16, 16],
        [-8, 16],
      ]);
      paint(ctx, p.primary);
      break;
    case 'Banner':
      line(ctx, -10, 18, -10, -18, '#6e4b2a', 3);
      poly(ctx, [
        [-10, -18],
        [14, -14],
        [8, -4],
        [14, 4],
        [-10, 2],
      ]);
      paint(ctx, p.primary);
      break;
    default:
      circle(ctx, 0, 0, 14);
      paint(ctx, p.primary);
      circle(ctx, 0, 0, 7);
      paint(ctx, p.accent, 1);
      break;
  }
  ctx.restore();
}

export function drawPet(ctx: Ctx, petId: string, cx: number, baseY: number, size: number, t: number): void {
  const def = getPet(petId);
  const p = def.palette;
  ctx.save();
  ctx.translate(cx, baseY);
  ctx.scale(size / 40, size / 40);
  const bob = Math.sin(t * 3) * 1.5;
  ctx.translate(0, bob);
  switch (petId) {
    case 'ember_fox':
      ellipse(ctx, 0, -10, 13, 8);
      paint(ctx, p.primary);
      ctx.beginPath();
      ctx.moveTo(-12, -12);
      ctx.quadraticCurveTo(-26, -24 + Math.sin(t * 4) * 3, -18, -30);
      ctx.strokeStyle = p.primary;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.stroke();
      circle(ctx, 11, -18, 8);
      paint(ctx, p.primary);
      poly(ctx, [
        [5, -24],
        [7, -34],
        [11, -25],
      ]);
      paint(ctx, p.primary, 1.2);
      poly(ctx, [
        [12, -25],
        [16, -34],
        [17, -23],
      ]);
      paint(ctx, p.primary, 1.2);
      circle(ctx, 14, -16, 3.5);
      paint(ctx, p.secondary, 0);
      break;
    case 'pebble_golem':
      rr(ctx, -12, -26, 24, 22, 7);
      paint(ctx, p.primary);
      circle(ctx, 0, -32, 8);
      paint(ctx, p.secondary);
      glow(ctx, 2, -33, 5, p.accent, 0.9);
      break;
    case 'sparkwing':
      ellipse(ctx, 0, -14, 12, 9);
      paint(ctx, p.primary);
      poly(ctx, [
        [-2, -20],
        [-14, -34 + Math.sin(t * 12) * 3],
        [-8, -16],
      ]);
      paint(ctx, p.secondary, 1.2);
      circle(ctx, 11, -22, 7);
      paint(ctx, p.primary);
      if (Math.sin(t * 2) > 0.6) glow(ctx, 20, -22, 6, '#f39c12', 0.8);
      break;
    case 'moonmoth':
      ctx.translate(0, -16);
      for (const s of [-1, 1]) {
        ellipse(ctx, s * 10, -4, 10, 14, s * 0.4 + Math.sin(t * 8) * 0.15 * s);
        paint(ctx, p.primary);
      }
      ellipse(ctx, 0, 0, 5, 10);
      paint(ctx, p.secondary);
      glow(ctx, 0, -4, 16, p.accent, 0.4);
      break;
    default:
      ellipse(ctx, 0, -10, 12, 8);
      paint(ctx, p.primary);
      circle(ctx, 10, -18, 8);
      paint(ctx, p.primary);
      circle(ctx, 13, -19, 1.6);
      ctx.fillStyle = OUTLINE;
      ctx.fill();
      glow(ctx, 0, -10, 18, p.secondary, 0.25);
      break;
  }
  ctx.restore();
}
