import * as THREE from 'three';
import type { BuildingId } from '../../core/content/buildings';
import { humanoid } from '../battle3d/units3d';
import { Kit } from './kit';
import type { Plot } from './layout';
import { bakeGroundAO } from './render';
import { K, shade, shapeFrom, star } from './sculpt';
import { addOutlines, glowMaterial, toonMaterial } from './style';

/**
 * Base buildings and props, sculpted in code. Every building is assembled from architectural
 * pieces (stone block walls, shingled roofs, timber frames, arched doors, framed windows, chimneys,
 * cloth banners) and visibly grows through 5 tiers. Glowing parts (windows, forges, gold, magic)
 * feed the bloom pass.
 */
export const C = {
  sand: '#efc07a',
  pad: '#d9cfbd',
  padEdge: '#b5aa97',
  road: '#d8cbb8',
  roadEdge: '#b9a68c',
  grass: '#7cc35a',
  grassDark: '#5fa648',
  stone: '#ddd5c7',
  stoneDark: '#b3a999',
  mortar: '#9d9384',
  wood: '#b07c45',
  woodDark: '#6e4a2a',
  plaster: '#f3e6cf',
  red: '#e0574f',
  blue: '#3f72dc',
  purple: '#8150cf',
  green: '#2f9e6b',
  slate: '#5f6876',
  gold: '#f5c542',
  iron: '#4d535c',
  steel: '#c9d1da',
  skin: '#f2c79b',
  white: '#f7f4ee',
  leaf: '#4caf50',
  leafDark: '#2e7d32',
  water: '#5ec8f2',
  glass: '#2e3a66',
};

export type Animator = (t: number, dt: number) => void;

export interface PlotInfo {
  level: number;
  tier: number;
  unlocked: boolean;
  upgrading: boolean;
  /** 0..1 how full the gold mine is. */
  mineFill: number;
  pets: string[];
  petColors: Record<string, string>;
  soldierColors: string[];
}

export interface BuiltPlot {
  group: THREE.Group;
  animators: Animator[];
}

/** Toon material for buildings: double-sided because roofs, cloth and lathed parts are open. */
const BUILD_MAT = (() => {
  const m = toonMaterial(0.32);
  m.side = THREE.DoubleSide;
  m.userData.shared = true;
  return m;
})();

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const jitter = (rand: () => number, hex: string, amt = 0.07) => shade(hex, (rand() - 0.5) * amt * 2);

// --- Architecture pieces -------------------------------------------------------------------------

/** Staggered stone blocks on a vertical wall face. axis 'z' = face toward +z/-z, 'x' = toward ±x. */
function bricks(k: K, rand: () => number, axis: 'x' | 'z', sign: 1 | -1, cx: number, y0: number, face: number, w: number, h: number, hex: string, bw = 0.95, bh = 0.46): void {
  const rows = Math.max(1, Math.round(h / bh));
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let u = -w / 2 - off; u < w / 2; u += bw) {
      const a = Math.max(-w / 2, u);
      const b = Math.min(w / 2, u + bw);
      if (b - a < 0.15) continue;
      const len = b - a - 0.07;
      const c = cx + (a + b) / 2;
      const y = y0 + r * rh + 0.035;
      const col = jitter(rand, hex, 0.06);
      if (axis === 'z') k.box(len, rh - 0.07, 0.1, c, y, face + sign * 0.03, col);
      else k.box(0.1, rh - 0.07, len, face + sign * 0.03, y, c, col);
    }
  }
}

/** A stone wall block with a mortar core and block facing on the front and both sides. */
function stoneBox(k: K, rand: () => number, w: number, h: number, d: number, x: number, y: number, z: number, hex = C.stone, back = false): void {
  k.box(w, h, d, x, y, z, C.mortar);
  bricks(k, rand, 'z', 1, x, y, z + d / 2, w, h, hex);
  if (back) bricks(k, rand, 'z', -1, x, y, z - d / 2, w, h, hex);
  bricks(k, rand, 'x', 1, z, y, x + w / 2, d, h, hex);
  bricks(k, rand, 'x', -1, z, y, x - w / 2, d, h, hex);
}

/** Battlement merlons along the front edge (and optionally the sides) of a wall top. */
function merlons(k: K, w: number, d: number, x: number, y: number, z: number, hex = C.stone, sides = true): void {
  k.rbox(w + 0.2, 0.22, d + 0.2, 0.06, x, y + 0.11, z, shade(hex, -0.12));
  const n = Math.max(2, Math.round(w / 0.95));
  for (let i = 0; i < n; i++) k.rbox(0.55, 0.6, 0.38, 0.08, x - w / 2 + (w / n) * (i + 0.5), y + 0.52, z + d / 2 - 0.12, hex);
  if (sides) {
    const m = Math.max(2, Math.round(d / 0.95));
    for (let i = 0; i < m; i++) {
      for (const s of [-1, 1]) k.rbox(0.38, 0.6, 0.55, 0.08, x + s * (w / 2 - 0.12), y + 0.52, z - d / 2 + (d / m) * (i + 0.5), hex);
    }
  }
}

/** Gable roof covered in rows of overlapping shingles. Ridge along x (or z when alongZ). */
function gableRoof(k: K, w: number, d: number, h: number, x: number, y: number, z: number, hex: string, alongZ = false, rows = 5, gable = C.plaster): void {
  const span = alongZ ? w : d;
  const len = (alongZ ? d : w) + 0.5;
  const half = span / 2 + 0.35;
  const a = Math.atan2(h, half);
  const L = Math.hypot(h, half);
  // Gable ends (triangles) under the shingles
  k.roof(alongZ ? w : w, h * 0.96, alongZ ? d : d, x, y, z, gable, alongZ);
  for (const side of [-1, 1]) {
    for (let i = 0; i < rows; i++) {
      const t = (i + 0.5) / rows;
      const off = half * (1 - t) * side;
      const yy = y + h * t + 0.06 + i * 0.012;
      const col = i % 2 ? hex : shade(hex, -0.08);
      const slab = new THREE.BoxGeometry(alongZ ? (L / rows) * 1.3 : len, 0.13, alongZ ? len : (L / rows) * 1.3);
      if (alongZ) k.add(slab, col, x + off, yy, z, 0, 0, -side * a);
      else k.add(slab, col, x, yy, z + off, side * a, 0, 0);
    }
  }
  // Ridge cap and eave trims
  if (alongZ) k.tube(0.13, 0.13, len + 0.1, x, y + h + 0.12, z, shade(hex, -0.25), Math.PI / 2, 0, 0, 8);
  else k.tube(0.13, 0.13, len + 0.1, x, y + h + 0.12, z, shade(hex, -0.25), 0, 0, Math.PI / 2, 8);
}

/** Round tower roof made of stacked shingle rings, with a finial. */
function coneRoof(k: K, r: number, h: number, x: number, y: number, z: number, hex: string, finial = C.gold, rings = 4): void {
  const rh = h / rings;
  for (let i = 0; i < rings; i++) {
    const rb = r * (1 - i / rings) + 0.12;
    const rt = Math.max(0.04, r * (1 - (i + 1) / rings) * 0.98);
    k.tube(rt, rb, rh * 1.2, x, y + i * rh + rh * 0.6, z, i % 2 ? hex : shade(hex, -0.09), 0, 0, 0, 16);
  }
  k.ring(r + 0.1, 0.09, x, y + 0.05, z, shade(hex, -0.3));
  k.tube(0.05, 0.07, 0.7, x, y + h + 0.3, z, C.iron, 0, 0, 0, 6);
  k.ball(0.17, x, y + h + 0.2, z, finial);
  k.spike(0.08, 0.4, x, y + h + 0.8, z, finial, 0, 0, 0, 6);
}

/** Stone tower with block rings, corbels, battlements, arrow slits and a cone roof. */
function tower(k: K, rand: () => number, x: number, z: number, r: number, h: number, y: number, roofHex: string, finial = C.gold, gold = false): void {
  k.lathe([[r * 1.08, 0], [r, 0.4], [r * 0.96, h]], x, y, z, C.mortar, 18);
  const rows = Math.round(h / 0.5);
  const segs = Math.max(8, Math.round((Math.PI * 2 * r) / 0.9));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segs; j++) {
      const a = ((j + (i % 2) * 0.5) / segs) * Math.PI * 2;
      if (Math.sin(a) < -0.45) continue; // hidden back side
      const rr = r * (1 - (0.04 * i) / rows) + 0.02;
      k.box((Math.PI * 2 * rr) / segs - 0.07, h / rows - 0.07, 0.12, x + Math.cos(a) * rr, y + i * (h / rows) + 0.035, z + Math.sin(a) * rr, jitter(rand, C.stone, 0.06), Math.PI / 2 - a);
    }
  }
  // Corbels and battlements
  k.tube(r * 1.2, r * 1.0, 0.4, x, y + h + 0.2, z, C.stoneDark, 0, 0, 0, 18);
  for (let j = 0; j < segs; j++) {
    const a = (j / segs) * Math.PI * 2;
    k.box(0.2, 0.32, 0.2, x + Math.cos(a) * r * 1.02, y + h - 0.3, z + Math.sin(a) * r * 1.02, C.stoneDark, Math.PI / 2 - a);
  }
  for (let j = 0; j < segs; j += 1) {
    if (j % 2) continue;
    const a = (j / segs) * Math.PI * 2;
    k.rbox(0.45, 0.55, 0.45, 0.07, x + Math.cos(a) * r * 1.1, y + h + 0.68, z + Math.sin(a) * r * 1.1, C.stone, 0, Math.PI / 2 - a);
  }
  // Arrow slits facing the camera
  for (let i = 1; i <= Math.floor(h / 2.4); i++) k.rbox(0.18, 0.7, 0.1, 0.04, x, y + i * 2.2, z + r + 0.04, C.glass);
  if (gold) k.ring(r * 1.13, 0.07, x, y + h * 0.55, z, C.gold);
  coneRoof(k, r * 1.3, r * 1.7, x, y + h + 0.42, z, roofHex, finial);
}

/** Arched window facing +z (or +x when side) with frame, mullions, sill and glass. */
function windowAt(k: K, x: number, y: number, z: number, w: number, h: number, frame: string, glass = C.glass, side = false): void {
  const ry = side ? Math.PI / 2 : 0;
  const plateZ = (dz: number) => (side ? [x + dz, z] : [x, z + dz]) as [number, number];
  const [fx, fz] = plateZ(0.02);
  k.rbox(w + 0.16, h + 0.12, 0.1, 0.04, fx, y + h / 2, fz, frame, 0, ry, 0);
  k.add(new THREE.CylinderGeometry(w / 2 + 0.08, w / 2 + 0.08, 0.1, 12, 1, false, -Math.PI / 2, Math.PI), frame, fx, y + h, fz, Math.PI / 2, ry, 0);
  const [gx, gz] = plateZ(0.07);
  k.rbox(w, h, 0.05, 0.02, gx, y + h / 2, gz, glass, 0, ry, 0);
  k.add(new THREE.CylinderGeometry(w / 2, w / 2, 0.05, 12, 1, false, -Math.PI / 2, Math.PI), glass, gx, y + h, gz, Math.PI / 2, ry, 0);
  const [mx, mz] = plateZ(0.1);
  k.rbox(0.05, h + w / 2 - 0.05, 0.04, 0.01, mx, y + (h + w / 2) / 2, mz, frame, 0, ry, 0);
  k.rbox(w, 0.05, 0.04, 0.01, mx, y + h * 0.55, mz, frame, 0, ry, 0);
  const [hx, hz] = plateZ(0.11);
  k.rbox(w * 0.22, h * 0.3, 0.02, 0.01, side ? hx : hx - w * 0.22, y + h * 0.72, side ? hz - w * 0.22 : hz, '#9fb6ff', 0, ry, 0);
  const [sx, sz] = plateZ(0.12);
  k.rbox(w + 0.3, 0.1, 0.22, 0.03, sx, y - 0.04, sz, shade(frame, -0.15), 0, ry, 0);
}

/** Arched plank door facing +z with iron bands, ring handle and stone arch. */
function door(k: K, x: number, y: number, z: number, w: number, h: number, wood = '#7a4a26', arch = C.stoneDark): void {
  const n = 3;
  for (let i = 0; i < n; i++) k.rbox(w / n - 0.03, h, 0.1, 0.02, x - w / 2 + (w / n) * (i + 0.5), y + h / 2, z + 0.03, i % 2 ? wood : shade(wood, -0.08));
  k.add(new THREE.CylinderGeometry(w / 2, w / 2, 0.1, 14, 1, false, -Math.PI / 2, Math.PI), shade(wood, -0.05), x, y + h, z + 0.03, Math.PI / 2, 0, 0);
  for (const yy of [0.25, 0.7]) k.rbox(w + 0.04, 0.07, 0.05, 0.02, x, y + h * yy, z + 0.09, C.iron);
  k.ring(0.09, 0.025, x + w * 0.28, y + h * 0.5, z + 0.12, C.gold, 0, 0, 0);
  k.add(new THREE.TorusGeometry(w / 2 + 0.12, 0.13, 6, 16, Math.PI), arch, x, y + h, z + 0.05, 0, 0, 0);
  for (const s of [-1, 1]) k.rbox(0.26, h, 0.26, 0.05, x + s * (w / 2 + 0.12), y + h / 2, z + 0.05, arch);
}

/** Plaster wall with dark timber beams on its front face (centre x, base y, front z). */
function timberFront(k: K, w: number, h: number, x: number, y: number, z: number, beam = C.woodDark): void {
  const t = 0.16;
  for (const u of [-w / 2 + t / 2, 0, w / 2 - t / 2]) k.box(t, h, 0.08, x + u, y, z + 0.02, beam);
  k.box(w, t, 0.08, x, y + h - t, z + 0.02, beam);
  k.box(w, t, 0.08, x, y + h * 0.48, z + 0.02, beam);
  for (const s of [-1, 1]) {
    const len = Math.hypot(w / 2 - t, h * 0.48);
    k.add(new THREE.BoxGeometry(t, len, 0.07), beam, x + (s * w) / 4, y + h * 0.24, z + 0.02, 0, 0, s * Math.atan2(w / 2 - t, h * 0.48));
  }
}

function chimney(k: K, rand: () => number, x: number, y: number, z: number, h: number): void {
  stoneBox(k, rand, 0.9, h, 0.9, x, y, z, '#b9b0a4');
  k.rbox(1.15, 0.22, 1.15, 0.05, x, y + h + 0.1, z, C.stoneDark);
  k.box(0.6, 0.2, 0.6, x, y + h + 0.2, z, '#2a2420');
}

/** Hanging cloth banner on a rod with a gold star. */
function clothBanner(k: K, x: number, y: number, z: number, hex: string, w = 0.9, h = 1.5, emblem: string | null = C.gold): void {
  k.tube(0.05, 0.05, w + 0.3, x, y, z, C.woodDark, 0, 0, Math.PI / 2, 6);
  for (const s of [-1, 1]) k.ball(0.07, x + s * (w / 2 + 0.15), y, z, C.gold);
  k.cloth(w, h, x, y - 0.02, z + 0.04, hex, 2, 0.04, 0.1);
  k.plate(shapeFrom([[-w / 2, 0], [w / 2, 0], [0, -0.35]]), 0.02, 0.01, x, y - h + 0.02, z + 0.06, hex);
  k.rbox(w + 0.02, 0.08, 0.04, 0.02, x, y - h * 0.15, z + 0.08, C.gold);
  if (emblem) k.plate(star(w * 0.22, w * 0.1), 0.03, 0.01, x, y - h * 0.5, z + 0.1, emblem);
}

/** Post-mounted torch with a flickering glowing flame. */
function torch(k: Kit, g: THREE.Group, x: number, z: number, animators: Animator[], h = 1.6, y = 0): void {
  k.cyl(0.07, 0.1, h, x, y, z, C.woodDark, 6);
  k.cyl(0.16, 0.1, 0.25, x, y + h - 0.05, z, C.iron, 8);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 7), glowMaterial('#ffb347', 3.2));
  flame.position.set(x, y + h + 0.35, z);
  g.add(flame);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glowMaterial('#fff0b3', 4));
  core.position.set(x, y + h + 0.24, z);
  g.add(core);
  const seed = x * 3.1 + z;
  animators.push((t) => {
    const s = 0.85 + 0.25 * Math.sin(t * 13 + seed) + 0.1 * Math.sin(t * 31 + seed);
    flame.scale.set(s, s * 1.25, s);
    flame.rotation.z = Math.sin(t * 7 + seed) * 0.15;
  });
}

/** Hanging lantern with a glowing core. */
function lantern(k: K, g: THREE.Group, x: number, y: number, z: number, hex = '#ffd27a'): void {
  k.tube(0.16, 0.2, 0.1, x, y + 0.36, z, C.iron, 0, 0, 0, 8);
  k.spike(0.2, 0.22, x, y + 0.52, z, C.iron, 0, 0, 0, 8);
  for (let i = 0; i < 4; i++) k.box(0.04, 0.5, 0.04, x + Math.cos(i * 1.57 + 0.78) * 0.15, y - 0.2, z + Math.sin(i * 1.57 + 0.78) * 0.15, C.iron);
  k.tube(0.2, 0.16, 0.08, x, y - 0.22, z, C.iron, 0, 0, 0, 8);
  const lamp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), glowMaterial(hex, 3));
  lamp.position.set(x, y + 0.06, z);
  g.add(lamp);
}

// --- Props ---------------------------------------------------------------------------------------

/** Stylised tree: tapered trunk with roots and a cluster of faceted foliage puffs (or a pine). */
export function tree(k: Kit, x: number, z: number, s = 1, pine = false): void {
  k.add(new THREE.CylinderGeometry(0.2 * s, 0.34 * s, 1.5 * s, 7), C.woodDark, x, 0.75 * s, z);
  for (let i = 0; i < 3; i++) k.add(new THREE.ConeGeometry(0.14 * s, 0.6 * s, 5), C.woodDark, x + Math.cos(i * 2.1) * 0.28 * s, 0.12 * s, z + Math.sin(i * 2.1) * 0.28 * s, Math.sin(i * 2.1) * 1.1, 0, -Math.cos(i * 2.1) * 1.1);
  if (pine) {
    for (let i = 0; i < 4; i++) k.add(new THREE.ConeGeometry((1.45 - i * 0.28) * s, 1.3 * s, 8), i % 2 ? C.leafDark : '#2f8a3c', x, (1.4 + i * 0.75) * s, z);
    return;
  }
  const puffs: [number, number, number, number, string][] = [
    [0, 2.35, 0, 1.15, C.leaf],
    [0.7, 2.0, 0.2, 0.8, '#43a047'],
    [-0.65, 2.05, -0.1, 0.85, '#3d9b40'],
    [0.2, 2.95, -0.2, 0.75, '#66bb6a'],
    [-0.2, 2.2, 0.6, 0.7, '#57b05a'],
  ];
  for (const [dx, dy, dz, r, hex] of puffs) k.add(new THREE.IcosahedronGeometry(r * s, 1), hex, x + dx * s, dy * s, z + dz * s);
}

function barrel(k: Kit, x: number, z: number, s = 1): void {
  k.add(new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(0.34 * s, 0), new THREE.Vector2(0.42 * s, 0.45 * s), new THREE.Vector2(0.34 * s, 0.9 * s), new THREE.Vector2(0.001, 0.9 * s)], 12), C.wood, x, 0, z);
  for (const y of [0.15, 0.75]) k.add(new THREE.TorusGeometry(0.37 * s, 0.035 * s, 5, 16), C.iron, x, y * s, z, Math.PI / 2, 0, 0);
  k.add(new THREE.TorusGeometry(0.42 * s, 0.035 * s, 5, 16), C.iron, x, 0.45 * s, z, Math.PI / 2, 0, 0);
}

function crate(k: Kit, x: number, z: number, s = 0.8, ry = 0): void {
  k.box(s, s, s, x, 0, z, C.wood, ry);
  k.box(s * 1.04, s * 0.12, s * 1.04, x, s * 0.88, z, C.woodDark, ry);
  k.box(s * 1.04, s * 0.12, s * 1.04, x, 0, z, C.woodDark, ry);
  k.add(new THREE.BoxGeometry(s * 0.12, s * 1.25, s * 1.02), C.woodDark, x, s / 2, z, 0, ry, Math.PI / 4);
}

function banner(k: Kit, x: number, z: number, hex: string, h = 3): void {
  k.cyl(0.07, 0.08, h, x, 0, z, C.woodDark, 6);
  k.sphere(0.13, x, h + 0.05, z, C.gold, 1);
  k.box(1.0, 0.08, 0.08, x + 0.5, h - 0.25, z, C.woodDark);
  k.box(0.9, 1.4, 0.05, x + 0.5, h - 1.7, z, hex);
  k.add(new THREE.ConeGeometry(0.45, 0.35, 3), hex, x + 0.5, h - 1.85, z, Math.PI, 0, 0, 1, 1, 0.12);
  k.box(0.9, 0.1, 0.07, x + 0.5, h - 0.6, z, C.gold);
}

function dummy(k: K, x: number, z: number): void {
  k.tube(0.07, 0.08, 1.9, x, 0.95, z, C.woodDark, 0, 0, 0, 6);
  k.lathe([[0.25, 0], [0.38, 0.35], [0.36, 0.7], [0.2, 0.85]], x, 0.55, z, '#d8b77a', 12);
  for (const y of [0.75, 1.15]) k.ring(0.37, 0.03, x, y, z, '#8a6a3a');
  k.ball(0.26, x, 1.65, z, '#d8b77a');
  k.tube(0.06, 0.06, 1.3, x, 1.25, z, C.woodDark, 0, 0, Math.PI / 2, 6);
  k.tube(0.2, 0.2, 0.03, x, 1.0, z + 0.36, C.red, Math.PI / 2, 0, 0, 14);
  k.tube(0.1, 0.1, 0.04, x, 1.0, z + 0.37, '#ffffff', Math.PI / 2, 0, 0, 12);
}

// --- Plot bases, building sites and scaffolding --------------------------------------------------

/** Stone-paved foundation with a curb, filling the plot. */
function plotBase(k: K, rand: () => number, plot: Plot, hex = C.pad, curb = C.padEdge, y = 0): void {
  k.rbox(plot.w, 0.24, plot.d, 0.08, 0, y, 0, curb);
  const tile = 1.15;
  const nx = Math.floor((plot.w - 0.5) / tile);
  const nz = Math.floor((plot.d - 0.5) / tile);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      k.box(tile - 0.08, 0.06, tile - 0.08, -((nx - 1) * tile) / 2 + i * tile, y + 0.12, -((nz - 1) * tile) / 2 + j * tile, jitter(rand, hex, 0.05));
    }
  }
}

function emptyPlot(k: K, g: THREE.Group, plot: Plot, unlocked: boolean, rand: () => number): void {
  k.rbox(plot.w, 0.2, plot.d, 0.08, 0, 0, 0, unlocked ? '#c9a36a' : '#a99a86');
  for (let i = 0; i < 14; i++) k.rock(0.2 + rand() * 0.25, (rand() - 0.5) * (plot.w - 1.5), 0.08, (rand() - 0.5) * (plot.d - 1.5), shade('#a0784a', (rand() - 0.5) * 0.2), rand() * 3, 0.5);
  // Stakes with a rope boundary
  const corners: [number, number][] = [
    [-plot.w / 2 + 0.6, -plot.d / 2 + 0.6],
    [plot.w / 2 - 0.6, -plot.d / 2 + 0.6],
    [plot.w / 2 - 0.6, plot.d / 2 - 0.6],
    [-plot.w / 2 + 0.6, plot.d / 2 - 0.6],
  ];
  for (const [x, z] of corners) {
    k.tube(0.06, 0.08, 1.0, x, 0.6, z, C.wood, 0, 0, 0, 6);
    k.spike(0.09, 0.15, x, 1.15, z, C.wood, 0, 0, 0, 6);
  }
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i]!;
    const [bx, bz] = corners[(i + 1) % 4]!;
    k.curve([[ax, 0.95, az], [(ax + bx) / 2, 0.78, (az + bz) / 2], [bx, 0.95, bz]], 0.025, 0.025, '#e8d29a', 4);
  }
  if (unlocked) {
    // "Build here" signpost with a hammer emblem
    const z = plot.d / 2 - 1.4;
    k.tube(0.07, 0.08, 1.6, 0, 0.9, z, C.woodDark, 0, 0, 0, 6);
    k.rbox(1.9, 0.9, 0.12, 0.08, 0, 1.55, z + 0.05, C.wood);
    k.rbox(1.7, 0.7, 0.06, 0.06, 0, 1.55, z + 0.12, '#f5d38a');
    k.rbox(0.12, 0.5, 0.05, 0.02, 0.05, 1.5, z + 0.17, C.woodDark, 0, 0, -0.6);
    k.rbox(0.4, 0.2, 0.06, 0.04, -0.12, 1.7, z + 0.18, C.iron, 0, 0, -0.6);
    for (let i = 0; i < 3; i++) k.rbox(1.0, 0.12, 0.3, 0.03, 2.4, 0.18 + i * 0.13, 1.2 + (i % 2) * 0.1, C.wood, 0, 0.3 + i * 0.2, 0);
    k.rock(0.5, -2.4, 0.1, 1.0, '#c9c1b2', 0.4, 0.8);
    k.rock(0.4, -1.8, 0.1, 1.6, '#bdb5a8', 1.4, 0.8);
  } else {
    // Locked: a stone plinth with a big padlock and chains
    k.rbox(1.6, 1.2, 1.0, 0.12, 0, 0.7, 0, C.stoneDark);
    k.rbox(1.8, 0.2, 1.2, 0.06, 0, 0.18, 0, shade(C.stoneDark, -0.1));
    k.rbox(0.8, 0.65, 0.35, 0.12, 0, 1.75, 0.12, '#c9a227');
    k.add(new THREE.TorusGeometry(0.26, 0.07, 8, 16, Math.PI), C.steel, 0, 2.05, 0.12, 0, 0, 0);
    k.ball(0.07, 0, 1.72, 0.3, '#3a2a10');
    for (const s of [-1, 1]) k.curve([[s * 0.8, 1.2, 0.5], [s * 0.4, 1.4, 0.55], [0, 1.6, 0.4]], 0.05, 0.05, C.iron, 5);
  }
  void g;
}

function scaffolding(k: K, g: THREE.Group, plot: Plot, animators: Animator[]): void {
  const w = Math.min(plot.w - 1, 7);
  const d = Math.min(plot.d - 1, 6);
  const h = 5;
  const pole = '#d9b36b';
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    k.tube(0.09, 0.09, h, (sx * w) / 2, h / 2, (sz * d) / 2, pole, 0, 0, 0, 6);
  }
  for (const y of [1.7, 3.4]) {
    k.rbox(w + 0.3, 0.1, 0.5, 0.03, 0, y, d / 2, '#c99a55');
    k.rbox(0.5, 0.1, d + 0.3, 0.03, w / 2, y, 0, '#c99a55');
    k.tube(0.05, 0.05, w, 0, y + 0.9, d / 2 + 0.2, pole, 0, 0, Math.PI / 2, 5);
  }
  for (const s of [-1, 1]) k.tube(0.05, 0.05, Math.hypot(w, 1.7), 0, 0.85, d / 2, pole, 0, 0, s * Math.atan2(w, 1.7), 5);
  crate(k, -w / 2 - 0.6, d / 2 + 0.6, 0.8, 0.4);
  crate(k, -w / 2 - 0.4, d / 2 - 0.4, 0.6, 0.1);
  for (let i = 0; i < 3; i++) k.rbox(0.9, 0.3, 0.45, 0.06, w / 2 + 0.9, 0.15 + i * 0.3, d / 2 + 0.4, '#c9c1b2', 0, i * 0.4, 0);
  // Crane with a swinging arm
  const cx = w / 2 + 0.6;
  const cz = -d / 2;
  k.rbox(0.35, 7, 0.35, 0.05, cx, 3.5, cz, '#f0b429');
  for (let i = 0; i < 6; i++) k.tube(0.03, 0.03, 0.5, cx, 0.6 + i * 1.1, cz + 0.18, '#c98d1a', 0, 0, Math.PI / 4, 4);
  const armK = new K();
  armK.rbox(5, 0.3, 0.3, 0.05, -2, 0, 0, '#f0b429').rbox(1, 0.5, 0.5, 0.05, 0.8, 0, 0, '#7f8796');
  armK.tube(0.02, 0.02, 1.4, -4.2, -0.75, 0, C.iron, 0, 0, 0, 4).rbox(0.6, 0.4, 0.6, 0.05, -4.2, -1.6, 0, C.wood);
  const arm = armK.build(true, BUILD_MAT);
  arm.position.set(cx, 7, cz);
  g.add(arm);
  animators.push((t) => {
    arm.rotation.y = Math.sin(t * 0.6) * 0.9;
  });
}

// --- Units for the base --------------------------------------------------------------------------

/** A soldier lying in the push-up position (a full character rig rotated face-down). */
function pushupSoldier(body: string, helmet: string): THREE.Group {
  const rig = humanoid({ body, legs: '#4a4f5c', skin: '#f6c9a0', head: 'helm', headColor: helmet, weapon: 'none', mood: 'brave' });
  rig.root.rotation.x = Math.PI / 2;
  if (rig.armR) rig.armR.rotation.x = -Math.PI / 2;
  if (rig.armL) rig.armL.rotation.x = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(rig.root);
  rig.root.position.set(0, 0.45, -1.1);
  addOutlines(rig.root, 0.02, (m) => m.material === rig.material);
  return holder;
}

/** Sculpted pets for the sanctuary. */
function petModel(petId: string, hex: string): THREE.Mesh {
  const k = new K();
  if (petId === 'moonmoth') {
    k.ball(0.22, 0, 0.9, 0, '#f2ead7', 1, 1.2, 1);
    k.ball(0.18, 0, 1.15, 0.12, hex);
    for (const s of [-1, 1]) {
      k.ball(0.5, s * 0.5, 0.95, 0, '#e8d8ff', 1, 0.06, 0.8);
      k.ball(0.18, s * 0.6, 0.97, 0.05, hex, 1, 0.08, 1);
      k.curve([[s * 0.06, 1.28, 0.15], [s * 0.15, 1.45, 0.2], [s * 0.25, 1.5, 0.15]], 0.02, 0.01, '#5b4a3a', 4);
      k.ball(0.05, s * 0.07, 1.18, 0.28, '#1a1030');
    }
  } else if (petId === 'pebble_golem') {
    k.add(new THREE.DodecahedronGeometry(0.4, 0), hex, 0, 0.42, 0);
    k.add(new THREE.DodecahedronGeometry(0.3, 0), shade(hex, 0.12), 0, 0.92, 0.05);
    for (const s of [-1, 1]) {
      k.add(new THREE.DodecahedronGeometry(0.16, 0), shade(hex, -0.1), s * 0.45, 0.45, 0.05);
      k.ball(0.05, s * 0.1, 0.96, 0.3, '#5dade2');
    }
    k.ball(0.09, 0.15, 1.18, -0.05, '#6aa84f', 1.2, 0.5, 1);
  } else {
    // Four-legged critters: fox, pup, sparkwing hatchling
    const belly = petId === 'ember_fox' ? '#fdfefe' : shade(hex, 0.3);
    k.pill(0.24, 0.4, 0, 0.38, 0, hex, Math.PI / 2);
    k.ball(0.2, 0, 0.36, 0.1, belly, 0.9, 0.85, 1);
    k.ball(0.25, 0, 0.62, 0.38, hex);
    k.lathe([[0.12, 0], [0.09, 0.12], [0.001, 0.2]], 0, 0.58, 0.55, belly, 10, 1, 1, Math.PI / 2);
    k.ball(0.04, 0, 0.6, 0.76, '#1a1030');
    for (const s of [-1, 1]) {
      k.plate(shapeFrom([[-0.08, 0], [0.08, 0], [0.01, 0.22]]), 0.04, 0.015, s * 0.14, 0.82, 0.32, hex, -0.2, 0, -s * 0.25);
      k.ball(0.05, s * 0.1, 0.68, 0.58, '#1a1030');
      k.ball(0.02, s * 0.1 - 0.02, 0.7, 0.62, '#ffffff');
    }
    for (const [x, z] of [
      [-0.13, 0.2],
      [0.13, 0.2],
      [-0.13, -0.2],
      [0.13, -0.2],
    ] as const)
      k.pill(0.06, 0.14, x, 0.12, z, hex);
    if (petId === 'ember_fox') k.curve([[0, 0.45, -0.3], [0, 0.7, -0.6], [0, 0.6, -0.85]], 0.13, 0.05, hex, 7).ball(0.08, 0, 0.58, -0.88, '#fdfefe');
    else k.curve([[0, 0.45, -0.3], [0, 0.6, -0.5]], 0.05, 0.02, hex, 5);
    if (petId === 'sparkwing') for (const s of [-1, 1]) k.plate(shapeFrom([[0, 0], [0.4, 0.15], [0.3, -0.1]]), 0.02, 0.01, s * 0.2, 0.55, -0.05, '#f5b041', -Math.PI / 2, 0, s > 0 ? 0 : Math.PI);
  }
  const m = k.build(true, BUILD_MAT);
  addOutlines(m, 0.015, () => true);
  m.userData.noOutline = true;
  return m;
}

// --- Buildings -----------------------------------------------------------------------------------

type Builder = (k: K, g: THREE.Group, plot: Plot, info: PlotInfo, anim: Animator[], rand: () => number) => void;

function flagTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 80;
  const x = c.getContext('2d')!;
  x.fillStyle = '#6a3fb5';
  x.fillRect(0, 0, 128, 80);
  x.fillStyle = '#f5c542';
  x.fillRect(0, 0, 128, 8);
  x.fillRect(0, 72, 128, 8);
  x.strokeStyle = '#f5c542';
  x.lineWidth = 7;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(40, 62);
  x.lineTo(88, 18);
  x.moveTo(88, 62);
  x.lineTo(40, 18);
  x.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A waving cloth flag on top of a pole at (x, y, z). */
export function flag(g: THREE.Group, x: number, y: number, z: number, animators: Animator[], w = 2.4, h = 1.5): void {
  const geo = new THREE.PlaneGeometry(w, h, 12, 4);
  geo.translate(w / 2, 0, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: flagTexture(), side: THREE.DoubleSide }));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  const base = (geo.getAttribute('position').array as Float32Array).slice();
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  animators.push((t) => {
    for (let i = 0; i < pos.count; i++) {
      const px = base[i * 3]!;
      pos.setZ(i, Math.sin(px * 2.2 - t * 5) * 0.18 * (px / w));
    }
    pos.needsUpdate = true;
  });
}

const castle: Builder = (k, g, plot, info, anim, rand) => {
  const t = info.tier;
  const roofHex = t >= 3 ? C.purple : C.blue;
  const gold = t >= 4;
  // Foundation and front steps
  k.rbox(plot.w - 0.4, 0.5, plot.d - 0.4, 0.1, 0, 0.25, 0, C.stoneDark);
  plotBase(k, rand, { ...plot, w: plot.w - 1.2, d: plot.d - 1.2 }, '#cfc6b6', C.stoneDark, 0.38);
  for (let i = 0; i < 3; i++) k.rbox(3.6 - i * 0.4, 0.18, 0.6, 0.05, 0, 0.09 + i * 0.18, plot.d / 2 - 0.1 - i * 0.45, C.stone);
  const y0 = 0.5;
  // Keep
  const keepH = 5 + t * 0.8;
  stoneBox(k, rand, 7, keepH, 5, 0, y0, -1.8);
  merlons(k, 7, 5, 0, y0 + keepH, -1.8);
  const winRows = 1 + Math.floor(t / 2);
  for (let r = 0; r < winRows; r++) for (let i = 0; i < 3; i++) windowAt(k, -2.2 + i * 2.2, y0 + 1.6 + r * 1.9, 0.72, 0.55, 0.8, gold ? C.gold : C.woodDark);
  for (const s of [-1, 1]) clothBanner(k, s * 3.0, y0 + keepH - 0.3, 0.75, C.purple, 0.8, 2.2);
  if (t >= 2) {
    stoneBox(k, rand, 4, 2.6, 3, 0, y0 + keepH, -2.2, '#e6dfd2');
    windowAt(k, 0, y0 + keepH + 0.7, -0.68, 0.6, 0.9, gold ? C.gold : C.woodDark);
    gableRoof(k, 4.2, 3.2, 2, 0, y0 + keepH + 2.6, -2.2, roofHex, false, 5, '#e6dfd2');
  }
  // Towers: two at the front, four from tier 1, a tall rear tower from tier 3
  const towers: [number, number, number, number][] = [
    [-5.8, 3.4, 1.35, 5.5 + t * 0.8],
    [5.8, 3.4, 1.35, 5.5 + t * 0.8],
  ];
  if (t >= 1) towers.push([-5.8, -4.4, 1.2, 6 + t * 0.8], [5.8, -4.4, 1.2, 6 + t * 0.8]);
  if (t >= 3) towers.push([0, -5.2, 1.4, 9 + t]);
  for (const [x, z, r, h] of towers) tower(k, rand, x, z, r, h, y0, roofHex, gold || t >= 2 ? C.gold : C.steel, gold);
  // Curtain walls and gatehouse
  for (const s of [-1, 1]) {
    stoneBox(k, rand, 2.8, 3.2, 1.0, s * 3.2, y0, 3.4);
    merlons(k, 2.8, 1.0, s * 3.2, y0 + 3.2, 3.4, C.stone, false);
  }
  stoneBox(k, rand, 3.8, 4.4, 2.0, 0, y0, 3.3);
  merlons(k, 3.8, 2.0, 0, y0 + 4.4, 3.3);
  door(k, 0, y0, 4.3, 1.7, 2.1, '#6b3f1f');
  for (let i = 0; i < 5; i++) k.rbox(0.07, 0.6, 0.07, 0.02, -0.7 + i * 0.35, y0 + 2.75, 4.42, C.iron);
  k.plate(shapeFrom([[-0.55, 0.45], [0.55, 0.45], [0.55, -0.1], [0, -0.55], [-0.55, -0.1]]), 0.08, 0.03, 0, y0 + 3.55, 4.35, gold ? C.gold : C.blue);
  k.plate(star(0.3, 0.13), 0.04, 0.02, 0, y0 + 3.55, 4.42, C.gold);
  for (const s of [-1, 1]) clothBanner(k, s * 1.55, y0 + 4.1, 4.35, C.purple, 0.55, 1.6, null);
  // Flag on the keep
  const top = y0 + keepH + (t >= 2 ? 4.8 : 0.5);
  k.tube(0.07, 0.08, 3, 0, top + 1.5, -1.8, C.white, 0, 0, 0, 6);
  k.ball(0.16, 0, top + 3.05, -1.8, C.gold);
  flag(g, 0.06, top + 2.3, -1.8, anim, 2.4, 1.5);
  torch(k, g, -1.3, 4.9, anim, 1.6, 0.5);
  torch(k, g, 1.3, 4.9, anim, 1.6, 0.5);
  if (gold) for (const s of [-1, 1]) k.gem(0.3, s * 3.5, y0 + keepH + 1.1, 0.7, '#e74c3c');
};

const goldMine: Builder = (k, g, plot, info, anim, rand) => {
  const t = info.tier;
  k.rbox(plot.w, 0.24, plot.d, 0.08, 0, 0, 0, '#b88b55');
  for (let i = 0; i < 22; i++) k.rock(0.15 + rand() * 0.2, (rand() - 0.5) * (plot.w - 1), 0.1, (rand() - 0.5) * (plot.d - 1), '#a07a4a', rand() * 3, 0.5);
  // Rocky hill of faceted boulders
  const rocks: [number, number, number, number, string][] = [
    [-1.6, 1.7, -2.8, 2.6, '#9c8b7a'],
    [2.0, 1.5, -3.0, 2.3, '#8a7a6a'],
    [-4.1, 1.0, -2.2, 1.6, '#a89584'],
    [4.3, 0.9, -1.8, 1.4, '#9c8b7a'],
    [0.2, 3.3, -3.3, 1.7, '#b0a090'],
    [-2.8, 2.9, -3.4, 1.3, '#968574'],
    [3.0, 2.8, -3.6, 1.2, '#a3927f'],
  ];
  for (const [x, y, z, r, hex] of rocks) k.add(new THREE.DodecahedronGeometry(r, 0), hex, x, y, z, rand(), rand(), rand(), 1, 0.85, 0.9);
  for (let i = 0; i < 6; i++) k.add(new THREE.DodecahedronGeometry(0.35 + rand() * 0.3, 0), '#7d6d5d', -5 + rand() * 10, 0.25, -0.8 + rand() * 1.2 - 1.2);
  // Glowing gold veins in the rock
  const veins = 4 + t * 2;
  for (let i = 0; i < veins; i++) {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 + rand() * 0.12, 0), glowMaterial('#ffd34d', 2.6));
    gem.position.set(-4 + rand() * 8, 1.0 + rand() * 2.6, -1.6 - rand() * 0.6);
    gem.rotation.set(rand() * 3, rand() * 3, 0);
    g.add(gem);
  }
  // Mine entrance with a timber frame
  k.rbox(2.6, 2.4, 1.2, 0.3, 0, 1.2, -1.0, '#1f1712');
  k.add(new THREE.CylinderGeometry(1.3, 1.3, 1.2, 14, 1, false, -Math.PI / 2, Math.PI), '#1f1712', 0, 2.4, -1.0, Math.PI / 2, 0, 0);
  for (const s of [-1, 1]) {
    k.rbox(0.32, 2.8, 0.32, 0.05, s * 1.4, 1.4, -0.4, C.wood);
    k.add(new THREE.BoxGeometry(0.18, 1.0, 0.18), C.woodDark, s * 1.05, 2.45, -0.38, 0, 0, s * 0.8);
  }
  k.rbox(3.4, 0.36, 0.4, 0.05, 0, 2.9, -0.4, C.wood);
  k.rbox(1.8, 0.6, 0.1, 0.04, 0, 3.45, -0.3, '#d9b77a');
  k.rbox(0.08, 0.5, 0.04, 0.02, -0.1, 3.45, -0.23, C.woodDark, 0, 0, 0.7);
  k.plate(shapeFrom([[-0.3, 0], [0.3, 0.05], [0.3, -0.05]]), 0.04, 0.01, 0.0, 3.6, -0.22, C.iron, 0, 0, -0.7);
  // Rails with sleepers
  for (const x of [-0.45, 0.45]) k.rbox(0.08, 0.08, 6.2, 0.02, x, 0.22, 2.1, '#8a929c');
  for (let i = 0; i < 9; i++) k.box(1.3, 0.08, 0.22, 0, 0.12, -0.6 + i * 0.75, C.woodDark);
  // Gold piles grow with stored gold
  const piles = Math.round(info.mineFill * 6);
  for (let i = 0; i < piles; i++) {
    const px = 2.4 + (i % 3) * 0.8;
    const pz = 1.6 + Math.floor(i / 3) * 1.0;
    for (let j = 0; j < 5; j++) k.tube(0.16, 0.16, 0.05, px + (j % 2) * 0.12, 0.2 + j * 0.05, pz, C.gold, 0, 0, 0, 10);
    k.gem(0.14, px - 0.2, 0.35, pz + 0.15, '#ffe27a');
    k.ball(0.28, px + 0.3, 0.2, pz - 0.2, '#e8b22a', 1, 0.6, 1);
  }
  // Pickaxes, crates and barrels
  for (const s of [-1, 1]) {
    k.tube(0.04, 0.04, 1.2, -3.2 + s * 0.3, 0.75, 1.0, '#8a5a2b', 0.3, 0, s * 0.2, 6);
    k.add(new THREE.TorusGeometry(0.32, 0.05, 5, 10, Math.PI * 0.8), C.steel, -3.2 + s * 0.42, 1.35, 1.2, 0.3, 0, Math.PI * 0.1 + s * 0.2);
  }
  crate(k, -4.2, 2.2, 0.8, 0.4);
  barrel(k, -4.6, 1.0);
  if (t >= 1) {
    for (const s of [-1, 1]) {
      k.tube(0.06, 0.07, 2.4, s * 1.9, 1.4, 0.2, C.woodDark, 0, 0, 0, 6);
      k.rbox(0.5, 0.06, 0.06, 0.02, s * 1.65, 2.55, 0.2, C.woodDark);
      lantern(k, g, s * 1.45, 2.05, 0.2);
    }
  }
  if (t >= 2) {
    // Hoist with a turning wheel
    for (const x of [-3.6, -2.2]) k.rbox(0.26, 4.2, 0.26, 0.05, x, 2.1, 3.0, C.wood);
    k.rbox(1.9, 0.26, 0.26, 0.05, -2.9, 4.2, 3.0, C.wood);
    k.tube(0.02, 0.02, 2, -2.9, 3.0, 3.0, '#d9c39a', 0, 0, 0, 4);
    k.rbox(0.6, 0.5, 0.6, 0.06, -2.9, 1.8, 3.0, C.woodDark);
    const wk = new K();
    wk.ring(0.6, 0.06, 0, 0, 0, C.woodDark, 0, 0, 0);
    for (let i = 0; i < 4; i++) wk.rbox(0.06, 1.2, 0.06, 0.02, 0, 0, 0, C.wood, 0, 0, i * 0.785);
    const wheel = wk.build(true, BUILD_MAT);
    wheel.position.set(-2.9, 4.2, 3.2);
    g.add(wheel);
    anim.push((time) => (wheel.rotation.z = time * 0.8));
  }
  if (t >= 3) {
    k.rbox(1.6, 1.6, 0.8, 0.25, 3.8, 0.9, -0.9, '#1f1712');
    k.rbox(2.1, 0.28, 0.3, 0.05, 3.8, 1.8, -0.5, C.wood);
    for (const s of [-1, 1]) k.rbox(0.24, 1.8, 0.24, 0.05, 3.8 + s * 0.9, 0.9, -0.5, C.wood);
  }
  // Cart rolling along the rails
  const ck = new K();
  const tub = t >= 4 ? C.gold : '#7a5230';
  ck.lathe([[0.55, 0], [0.7, 0.55]], 0, 0.25, 0, tub, 4, 1, 1.3, 0, Math.PI / 4, 0);
  ck.rbox(0.8, 0.12, 1.05, 0.04, 0, 0.27, 0, shade(tub, -0.2));
  for (const y of [0.4, 0.7]) ck.ring(0.67, 0.025, 0, y, 0, C.iron, Math.PI / 2, Math.PI / 4, 0, Math.PI * 2);
  for (const [x, z] of [
    [-0.5, -0.45],
    [0.5, -0.45],
    [-0.5, 0.45],
    [0.5, 0.45],
  ] as const) {
    ck.tube(0.18, 0.18, 0.08, x, 0.18, z, C.iron, 0, 0, Math.PI / 2, 10);
    ck.ball(0.05, x * 1.1, 0.18, z, C.gold);
  }
  for (let i = 0; i < 6; i++) ck.gem(0.14, (rand() - 0.5) * 0.6, 0.85 + rand() * 0.15, (rand() - 0.5) * 0.8, C.gold);
  const cart = ck.build(true, BUILD_MAT);
  addOutlines(cart, 0.03, () => true);
  cart.userData.noOutline = true;
  cart.position.set(0, 0.1, 2);
  g.add(cart);
  anim.push((time) => {
    cart.position.z = 2.2 + Math.sin(time * 0.7) * 2.4;
  });
};

const academy: Builder = (k, g, plot, info, anim, rand) => {
  const t = info.tier;
  plotBase(k, rand, plot, '#d6d0e4', '#a9a1bf');
  const towerH = 5 + t * 1.1;
  // Wizard tower with a balcony
  k.lathe([[2.0, 0], [1.85, 0.5], [1.65, towerH]], 1.6, 0.2, -1.2, '#b5aecf', 20);
  const rows = Math.round(towerH / 0.55);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < 14; j++) {
      const a = ((j + (i % 2) * 0.5) / 14) * Math.PI * 2;
      if (Math.sin(a) < -0.4) continue;
      const r = 2.0 - (0.35 * i) / rows + 0.02;
      k.box((Math.PI * 2 * r) / 14 - 0.07, towerH / rows - 0.07, 0.1, 1.6 + Math.cos(a) * r, 0.2 + i * (towerH / rows) + 0.03, -1.2 + Math.sin(a) * r, jitter(rand, '#e9e3f5', 0.05), Math.PI / 2 - a);
    }
  }
  const by = 0.2 + towerH * 0.62;
  k.tube(2.25, 2.0, 0.22, 1.6, by, -1.2, C.stoneDark, 0, 0, 0, 20);
  k.ring(2.2, 0.05, 1.6, by + 0.7, -1.2, C.gold);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    if (Math.sin(a) < -0.3) continue;
    k.tube(0.04, 0.04, 0.6, 1.6 + Math.cos(a) * 2.15, by + 0.4, -1.2 + Math.sin(a) * 2.15, C.gold, 0, 0, 0, 5);
  }
  for (let i = 0; i < 3; i++) {
    const a = 0.9 + i * 0.5;
    windowAt(k, 1.6 + Math.cos(a) * 0.15, 1.0 + i * (towerH / 3.4), -1.2 + 1.92, 0.5, 0.75, C.gold, '#7fd3ff');
  }
  coneRoof(k, 2.5, 3.6, 1.6, 0.2 + towerH + 0.1, -1.2, C.blue, C.gold, 5);
  k.plate(star(0.35, 0.15), 0.06, 0.02, 1.6, 0.2 + towerH + 4.5, -1.2, C.gold);
  // Library annex with timber frame and a purple roof
  k.box(4.2, 1.0, 3.2, -3.0, 0.2, -0.8, '#b9b0a4');
  bricks(k, rand, 'z', 1, -3.0, 0.2, 0.8, 4.2, 1.0, '#c9c1b2');
  k.box(4.2, 2.2, 3.2, -3.0, 1.2, -0.8, C.plaster);
  timberFront(k, 4.2, 2.2, -3.0, 1.2, 0.8);
  gableRoof(k, 4.4, 3.4, 1.8, -3.0, 3.4, -0.8, C.purple);
  door(k, -3.0, 0.2, 0.82, 0.9, 1.4, '#6b3f1f', C.woodDark);
  for (const s of [-1, 1]) windowAt(k, -3.0 + s * 1.35, 1.9, 0.83, 0.5, 0.65, C.woodDark, '#7fd3ff');
  chimney(k, rand, -4.3, 3.2, -1.4, 1.6);
  // Books, lectern and scrolls
  for (let i = 0; i < 4; i++) k.rbox(0.7, 0.16, 0.5, 0.03, 4.0 + (i % 2) * 0.05, 0.32 + i * 0.16, 2.8, [C.red, C.blue, C.gold, C.green][i]!, 0, i * 0.2, 0);
  k.tube(0.07, 0.1, 1.0, 3.0, 0.7, 3.4, C.woodDark, 0, 0, 0, 6);
  k.rbox(0.8, 0.06, 0.55, 0.02, 3.0, 1.25, 3.4, C.woodDark, -0.4, 0, 0);
  k.rbox(0.36, 0.03, 0.5, 0.01, 2.8, 1.29, 3.42, '#fdf6e3', -0.4, 0, 0.08);
  k.rbox(0.36, 0.03, 0.5, 0.01, 3.2, 1.29, 3.42, '#fdf6e3', -0.4, 0, -0.08);
  if (t >= 2) {
    // Brass telescope on a tripod
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.curve([[-4.4, 1.3, 2.6], [-4.4 + Math.cos(a) * 0.5, 0.2, 2.6 + Math.sin(a) * 0.5]], 0.04, 0.035, C.woodDark, 4);
    }
    k.lathe([[0.1, 0], [0.14, 0.9], [0.2, 1.4]], -4.4, 1.3, 2.6, C.gold, 12, 1, 1, -0.9, 0.5, 0);
  }
  if (t >= 3) banner(k, 5.0, -3.6, C.blue, 4);
  if (t >= 4) {
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), glowMaterial('#b98eff', 3));
    crystal.position.set(-4.5, 4.4, 2.6);
    crystal.scale.set(1, 1.8, 1);
    g.add(crystal);
    anim.push((time) => {
      crystal.rotation.y = time * 1.2;
      crystal.position.y = 4.4 + Math.sin(time * 1.5) * 0.25;
    });
  }
  tree(k, -5.0, -3.8, 0.75);
  // Glowing orb with orbiting rings above the tower
  const orbY = 0.2 + towerH + 6.0;
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 2), glowMaterial('#9fe7ff', 3.2));
  orb.position.set(1.6, orbY, -1.2);
  g.add(orb);
  const rings = new THREE.Group();
  rings.position.copy(orb.position);
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.85 + i * 0.25, 0.04, 6, 32), glowMaterial(i ? '#ffd34d' : '#9fe7ff', 2.6));
    r.rotation.x = Math.PI / 2 + (i ? 0.5 : -0.4);
    rings.add(r);
  }
  g.add(rings);
  anim.push((time) => {
    orb.position.y = orbY + Math.sin(time * 2) * 0.3;
    rings.position.y = orb.position.y;
    rings.rotation.y = time * 0.9;
    rings.rotation.z = Math.sin(time * 0.7) * 0.3;
  });
};

const barracks: Builder = (k, g, plot, info, anim, rand) => {
  const t = info.tier;
  plotBase(k, rand, plot, '#d2b48a', '#a98a62');
  // Long hall: stone base course, timber upper floor, red shingle roof
  stoneBox(k, rand, 7.6, 1.2, 3.2, -1, 0.2, -2.6, '#c9c1b2');
  k.box(7.6, 1.9, 3.2, -1, 1.4, -2.6, C.plaster);
  timberFront(k, 7.6, 1.9, -1, 1.4, -1.0);
  gableRoof(k, 8.0, 3.6, 2.0, -1, 3.3, -2.6, C.red, false, 6);
  door(k, -1, 0.2, -0.98, 1.0, 1.5, '#6b3f1f', C.woodDark);
  for (const x of [-3.9, -2.4, 0.4, 1.9]) windowAt(k, x, 1.75, -0.97, 0.5, 0.65, C.woodDark);
  chimney(k, rand, 1.6, 3.0, -3.3, 2.2);
  // Tents
  const tents = Math.min(4, 1 + t);
  for (let i = 0; i < tents; i++) {
    const x = -4.2 + i * 2.4;
    const a = i % 2 ? C.white : '#f2e2c4';
    const b = i % 2 ? C.red : C.blue;
    for (let j = 0; j < 4; j++) k.tube(1.15 * (1 - (j + 1) / 4) + 0.02, 1.15 * (1 - j / 4) + 0.06, 0.47, x, 0.45 + j * 0.45, 2.3, j % 2 ? b : a, 0, 0, 0, 8);
    k.tube(0.04, 0.04, 0.6, x, 2.3, 2.3, C.woodDark, 0, 0, 0, 5);
    k.plate(shapeFrom([[0, 0], [0.45, 0.14], [0, 0.28]]), 0.02, 0.01, x + 0.03, 2.4, 2.3, b);
    k.plate(shapeFrom([[-0.32, 0], [0.32, 0], [0, 0.9]]), 0.02, 0.01, x, 0.25, 3.32, '#5b3a1e', -0.2, 0, 0);
  }
  // Weapon rack with swords, spears and a shield
  k.rbox(2.0, 0.14, 0.14, 0.03, 4.3, 1.15, 0, C.woodDark).rbox(0.14, 1.3, 0.14, 0.03, 3.4, 0.85, 0, C.woodDark).rbox(0.14, 1.3, 0.14, 0.03, 5.2, 0.85, 0, C.woodDark);
  for (let i = 0; i < 4; i++) {
    const x = 3.65 + i * 0.42;
    if (i % 2) {
      k.tube(0.03, 0.03, 1.6, x, 1.0, 0.1, C.wood, 0, 0, 0, 5);
      k.spike(0.07, 0.25, x, 1.9, 0.1, C.steel, 0, 0, 0, 4);
    } else {
      k.plate(shapeFrom([[-0.05, 0], [0.05, 0], [0.04, 0.85], [0, 1.0], [-0.04, 0.85]]), 0.01, 0.015, x, 0.5, 0.12, '#e8eef5');
      k.rbox(0.3, 0.05, 0.08, 0.02, x, 0.5, 0.12, C.gold);
    }
  }
  k.tube(0.42, 0.42, 0.08, 4.3, 0.6, 0.35, '#9a6430', Math.PI / 2 + 0.2, 0, 0, 18);
  k.ring(0.42, 0.04, 4.3, 0.6, 0.35, C.iron, 0.2, 0, 0);
  k.dome(0.11, 4.3, 0.6, 0.4, C.gold, 0.6);
  dummy(k, 4.5, 2.7);
  banner(k, 2.9, -0.4, C.red, 3.4);
  if (t >= 2) {
    // Watchtower
    for (const [x, z] of [
      [4.0, -4.0],
      [5.3, -4.0],
      [4.0, -2.7],
      [5.3, -2.7],
    ] as const)
      k.rbox(0.22, 4.4, 0.22, 0.04, x, 2.4, z, C.wood);
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.1, 2.0, 0.1), C.woodDark, 4.65, 1.6, -2.7 + (s < 0 ? -1.3 : 0), 0, 0, s * 0.6);
    k.rbox(1.9, 0.25, 1.9, 0.04, 4.65, 4.5, -3.35, C.woodDark);
    for (let i = 0; i < 5; i++) k.tube(0.03, 0.03, 0.6, 3.8 + i * 0.42, 4.9, -2.45, C.wood, 0, 0, 0, 4);
    k.rbox(1.9, 0.08, 0.08, 0.02, 4.65, 5.2, -2.45, C.wood);
    coneRoof(k, 1.4, 1.1, 4.65, 5.5, -3.35, C.red, C.gold, 2);
  }
  if (t >= 3) banner(k, -5.4, -0.4, C.purple, 3.6);
  if (t >= 4) for (const s of [-1, 1]) clothBanner(k, -1 + s * 2.6, 3.1, -0.9, C.red, 0.7, 1.4);
  // A guard in front of the hall
  const guardRig = humanoid({ body: info.soldierColors[0] ?? C.blue, legs: '#4a4f5c', skin: '#f6c9a0', head: 'helm', headColor: '#cfd6df', weapon: 'sword', shield: 'round', mood: 'brave', mustache: '#7a4a1f' });
  addOutlines(guardRig.root, 0.02, (m) => m.material === guardRig.material);
  guardRig.root.scale.setScalar(0.9);
  guardRig.root.position.set(-2.4, 0.2, -0.2);
  g.add(guardRig.root);
  anim.push((time) => {
    guardRig.root.rotation.y = Math.sin(time * 0.5) * 0.6;
  });
};

const trainingGrounds: Builder = (k, g, plot, info, anim, rand) => {
  const t = info.tier;
  k.rbox(plot.w, 0.24, plot.d, 0.08, 0, 0, 0, '#c99a5f');
  k.rbox(plot.w - 1.6, 0.06, plot.d - 1.8, 0.03, 0, 0.14, 0.2, '#ddb37a');
  for (let i = 0; i < 20; i++) k.rock(0.08 + rand() * 0.1, (rand() - 0.5) * (plot.w - 2), 0.15, (rand() - 0.5) * (plot.d - 2), '#b88b55', rand() * 3, 0.5);
  // Fence with rounded post caps
  const fw = plot.w - 1.0;
  const fd = plot.d - 1.0;
  const posts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) posts.push([-fw / 2 + (fw / 8) * i, -fd / 2]);
  for (let i = 1; i <= 6; i++) posts.push([fw / 2, -fd / 2 + (fd / 6) * i], [-fw / 2, -fd / 2 + (fd / 6) * i]);
  for (let i = 0; i <= 8; i++) if (Math.abs(-fw / 2 + (fw / 8) * i) > 1.4) posts.push([-fw / 2 + (fw / 8) * i, fd / 2]);
  for (const [x, z] of posts) {
    k.tube(0.1, 0.12, 1.0, x, 0.65, z, C.wood, 0, 0, 0, 7);
    k.ball(0.13, x, 1.18, z, C.woodDark);
  }
  for (const y of [0.55, 0.95]) {
    k.rbox(fw, 0.1, 0.08, 0.03, 0, y, -fd / 2, C.wood);
    for (const s of [-1, 1]) k.rbox(0.08, 0.1, fd, 0.03, s * fw / 2, y, 0, C.wood);
    for (const s of [-1, 1]) k.rbox(fw / 2 - 1.4, 0.1, 0.08, 0.03, s * (fw / 4 + 0.7), y, fd / 2, C.wood);
  }
  // Hurdles, climbing frame, rope and weights
  for (const x of [3.2, 4.4]) {
    for (const z of [-2.7, -1.5]) k.tube(0.05, 0.05, 0.8, x, 0.55, z, C.wood, 0, 0, 0, 5);
    for (let s = 0; s < 4; s++) k.tube(0.06, 0.06, 0.32, x, 0.92, -2.55 + s * 0.3, s % 2 ? C.white : C.red, Math.PI / 2, 0, 0, 6);
  }
  for (let i = 0; i < 3; i++) k.tube(0.08, 0.08, 2.8, -4.3 + i * 0.9, 1.55, -2.8, C.wood, 0, 0, 0, 6);
  for (const y of [1.0, 1.8, 2.6]) k.tube(0.06, 0.06, 2.0, -3.4, y, -2.8, C.woodDark, 0, 0, Math.PI / 2, 6);
  k.curve([[-2.5, 2.9, -2.8], [-2.3, 1.6, -2.7], [-2.4, 0.4, -2.6]], 0.05, 0.05, '#d9c39a', 5);
  for (let i = 0; i < 2; i++) {
    k.tube(0.03, 0.03, 0.6, 3.6 + i * 0.8, 0.25, 2.8, C.iron, 0, 0, Math.PI / 2, 5);
    for (const s of [-1, 1]) k.tube(0.14, 0.14, 0.12, 3.6 + i * 0.8 + s * 0.28, 0.25, 2.8, '#2b2b33', 0, 0, Math.PI / 2, 10);
  }
  // Push-up squad on mats: more trainees with every tier
  const count = Math.min(6, 2 + t);
  const colors = info.soldierColors.length ? info.soldierColors : [C.blue, C.red, C.leaf];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 3);
    const x = -1.8 + (i % 3) * 1.8;
    const z = -0.6 + row * 2.4;
    k.rbox(0.9, 0.05, 2.2, 0.02, x, 0.2, z, i % 2 ? '#4f7fe0' : '#e0574f');
    const m = pushupSoldier(colors[i % colors.length]!, i % 3 ? '#cfd6df' : '#8c96a3');
    m.position.set(x, 0.2, z);
    m.rotation.y = Math.PI;
    m.scale.setScalar(0.8);
    g.add(m);
    const phase = i * 0.7;
    anim.push((time) => {
      const p = (Math.sin(time * 3 + phase) + 1) / 2;
      m.rotation.x = -0.06 - p * 0.16;
      m.position.y = 0.2 + p * 0.12;
    });
  }
  // Drill sergeant pacing in front
  const sRig = humanoid({ body: C.purple, legs: '#3a3550', skin: '#e9a77a', head: 'hat', headColor: '#6b4f2a', weapon: 'none', mood: 'angry', mustache: '#3a2414', trim: C.gold });
  addOutlines(sRig.root, 0.02, (m) => m.material === sRig.material);
  sRig.root.position.set(0, 0.2, 3.1);
  g.add(sRig.root);
  anim.push((time) => {
    const x = Math.sin(time * 0.4) * 2.2;
    sRig.root.position.x = x;
    sRig.root.rotation.y = Math.cos(time * 0.4) > 0 ? Math.PI / 2 : -Math.PI / 2;
    const sw = Math.sin(time * 6);
    sRig.legs.forEach((l, j) => (l.rotation.x = (j ? -sw : sw) * 0.5));
    if (sRig.armR) sRig.armR.rotation.x = -1.2 + Math.sin(time * 3) * 0.3;
  });
  // Scoreboard
  k.rbox(1.6, 1.0, 0.12, 0.06, -4.2, 1.5, 3.0, C.woodDark);
  k.rbox(1.4, 0.8, 0.06, 0.04, -4.2, 1.5, 3.07, '#2e4a2e');
  for (let i = 0; i < 3; i++) k.rbox(0.9, 0.06, 0.02, 0.01, -4.2, 1.75 - i * 0.22, 3.11, '#f2ead7');
  for (const s of [-1, 1]) k.tube(0.05, 0.05, 1.0, -4.2 + s * 0.65, 0.6, 3.0, C.woodDark, 0, 0, 0, 5);
};

const blacksmith: Builder = (k, g, plot, info, anim, rand) => {
  const t = info.tier;
  plotBase(k, rand, plot, '#c9c3b8', '#9d968a');
  // Workshop: stone walls, slate roof, open front with an awning
  stoneBox(k, rand, 5.6, 3.2, 4.0, -1.6, 0.2, -2.2, '#bdb5a8');
  k.rbox(2.6, 2.2, 0.12, 0.06, -1.6, 1.3, -0.17, '#2a2420');
  gableRoof(k, 6.0, 4.4, 1.7, -1.6, 3.4, -2.2, C.slate, false, 5, '#bdb5a8');
  k.cloth(4.2, 1.6, -1.6, 3.1, 0.05, '#c0392b', 3, 0.05, 0.05);
  for (const s of [-1, 1]) k.tube(0.07, 0.08, 2.6, -1.6 + s * 2.0, 1.5, 1.3, C.woodDark, 0, 0, 0, 6);
  k.tube(0.06, 0.06, 4.2, -1.6, 2.7, 1.3, C.woodDark, 0, 0, Math.PI / 2, 6);
  // Chimney with smoke
  const chimneyH = 6 + t * 0.6;
  chimney(k, rand, 1.0, 0.2, -3.4, chimneyH);
  if (t >= 2) chimney(k, rand, -4.0, 0.2, -3.4, chimneyH - 1);
  // Forge with glowing coals and flames, and a bellows
  stoneBox(k, rand, 1.8, 1.0, 1.3, 3.2, 0.2, -0.6, '#8e867b');
  const coals = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, 0.9), glowMaterial('#ff7a1a', 2.35));
  coals.position.set(3.2, 1.25, -0.6);
  g.add(coals);
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 6), glowMaterial(i % 2 ? '#ffd34d' : '#ff9a2a', 2.6));
    f.position.set(2.8 + i * 0.4, 1.6, -0.6);
    g.add(f);
    flames.push(f);
  }
  k.lathe([[0.001, 0], [0.32, 0.1], [0.36, 0.4], [0.05, 0.75]], 4.6, 0.85, -0.6, '#7a4a26', 10, 1, 0.6, 0, 0, Math.PI / 2);
  // Anvil with a hammer
  k.rbox(0.5, 0.6, 0.45, 0.06, 1.4, 0.5, 1.6, '#3d4249');
  k.plate(shapeFrom([[-0.55, 0], [0.45, 0], [0.75, 0.12], [0.45, 0.28], [-0.55, 0.28], [-0.65, 0.14]]), 0.38, 0.03, 1.4, 0.8, 1.6, '#4d535c');
  k.tube(0.03, 0.03, 0.6, 1.5, 1.2, 1.6, '#6b4626', 0, 0, 1.2, 5);
  k.rbox(0.22, 0.14, 0.14, 0.03, 1.25, 1.12, 1.6, C.iron);
  // Sword rack, quench barrel, ore and grindstone
  k.rbox(2.2, 0.12, 0.12, 0.03, -3.8, 1.5, 1.5, C.woodDark).rbox(0.12, 1.6, 0.12, 0.03, -4.8, 0.95, 1.5, C.woodDark).rbox(0.12, 1.6, 0.12, 0.03, -2.8, 0.95, 1.5, C.woodDark);
  for (let i = 0; i < 4; i++) {
    const gold = i === 3 && t >= 3;
    k.plate(shapeFrom([[-0.05, 0], [0.05, 0], [0.04, 0.95], [0, 1.12], [-0.04, 0.95]]), 0.01, 0.015, -4.4 + i * 0.5, 0.35, 1.62, gold ? '#ffd34d' : '#e8eef5');
    k.rbox(0.28, 0.05, 0.08, 0.02, -4.4 + i * 0.5, 0.35, 1.62, C.gold);
  }
  barrel(k, 4.5, 1.4);
  k.tube(0.38, 0.38, 0.02, 4.5, 0.86, 1.4, C.water, 0, 0, 0, 12);
  for (let i = 0; i < 5; i++) k.add(new THREE.DodecahedronGeometry(0.22 + rand() * 0.15, 0), i % 2 ? '#6f7f9a' : '#5d6d7e', 4.0 + rand() * 0.9, 0.3, 2.7 + rand() * 0.6);
  const wheelK = new K();
  wheelK.tube(0.45, 0.45, 0.16, 0, 0, 0, '#9a948a', 0, 0, Math.PI / 2, 16);
  wheelK.ring(0.45, 0.04, 0, 0, 0, C.woodDark, 0, Math.PI / 2, 0);
  const wheel = wheelK.build(true, BUILD_MAT);
  wheel.position.set(-0.4, 0.75, 2.6);
  g.add(wheel);
  for (const s of [-1, 1]) k.rbox(0.08, 0.6, 0.08, 0.02, -0.4 + s * 0.15, 0.45, 2.6, C.woodDark);
  if (t >= 4) k.ring(0.3, 0.04, 1.4, 1.1, 1.6, C.gold);
  // Smoke puffs rising from the chimney
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshToonMaterial({ color: '#d8d8d8', transparent: true, opacity: 0.6, depthWrite: false }));
    g.add(p);
    puffs.push(p);
  }
  anim.push((time) => {
    coals.scale.y = 0.8 + 0.25 * Math.abs(Math.sin(time * 5));
    flames.forEach((f, i) => {
      const s = 0.75 + 0.35 * Math.abs(Math.sin(time * 9 + i * 2));
      f.scale.set(s, s * 1.3, s);
    });
    wheel.rotation.x = time * 3;
    puffs.forEach((p, i) => {
      const life = (time * 0.32 + i / puffs.length) % 1;
      p.position.set(1 + Math.sin(life * 6 + i) * 0.35, chimneyH + 0.8 + life * 4.5, -3.4 - life * 1.4);
      p.scale.setScalar(0.5 + life * 1.5);
      (p.material as THREE.MeshToonMaterial).opacity = 0.65 * (1 - life);
    });
  });
};

const treasury: Builder = (k, g, plot, info, anim, rand) => {
  const t = info.tier;
  k.rbox(plot.w, 0.24, plot.d, 0.08, 0, 0, 0, '#cfc6b6');
  // Stepped marble base
  for (let i = 0; i < 3; i++) k.rbox(4.6 - i * 0.3, 0.22, 5.4 - i * 0.3, 0.05, 0, 0.23 + i * 0.22, -1.0, i % 2 ? '#efe8da' : '#e4dccb');
  const y0 = 0.86;
  const h = 3.2 + t * 0.6;
  k.rbox(3.6, h, 3.8, 0.08, 0, y0 + h / 2, -1.6, '#f4eedf');
  for (let i = 0; i < 6; i++) k.rbox(0.05, h - 0.3, 0.04, 0.01, -1.5 + i * 0.6, y0 + h / 2, 0.31, '#e1d8c4');
  // Columns with bases and capitals
  const col = (x: number, z: number) => k.lathe([[0.32, 0], [0.3, 0.14], [0.22, 0.2], [0.2, h - 0.35], [0.28, h - 0.2], [0.34, h - 0.05], [0.34, h]], x, y0, z, '#fbf7ee', 14);
  for (const x of [-1.5, -0.5, 0.5, 1.5]) col(x, 1.0);
  for (const z of [-0.2, -1.6]) for (const s of [-1, 1]) col(s * 1.5, z);
  // Entablature and pediment
  k.rbox(4.0, 0.5, 4.6, 0.05, 0, y0 + h + 0.25, -1.2, '#fbf7ee');
  k.rbox(4.05, 0.14, 4.65, 0.03, 0, y0 + h + 0.18, -1.2, C.gold);
  k.roof(4.0, 1.0, 4.6, 0, y0 + h + 0.5, -1.2, '#f4eedf');
  k.rbox(4.2, 0.12, 0.3, 0.03, 0, y0 + h + 0.55, 1.15, C.gold);
  k.tube(0.32, 0.32, 0.08, 0, y0 + h + 0.88, 1.12, C.gold, Math.PI / 2, 0, 0, 16);
  k.plate(star(0.18, 0.08), 0.04, 0.01, 0, y0 + h + 0.88, 1.18, '#fff3b0');
  // Golden door with studs
  k.rbox(1.3, 2.0, 0.12, 0.05, 0, y0 + 1.0, 0.33, C.gold);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) k.ball(0.05, -0.4 + i * 0.4, y0 + 0.35 + j * 0.45, 0.4, '#c99a1e');
  k.ring(0.12, 0.03, 0.4, y0 + 1.0, 0.42, '#c99a1e', 0, 0, 0);
  if (t >= 2) {
    // Golden dome on a drum
    k.tube(1.3, 1.4, 0.6, 0, y0 + h + 1.1, -1.6, '#fbf7ee', 0, 0, 0, 18);
    k.lathe([[1.35, 0], [1.3, 0.4], [1.0, 0.95], [0.5, 1.3], [0.001, 1.4]], 0, y0 + h + 1.4, -1.6, C.gold, 20);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.curve([[Math.cos(a) * 1.36, y0 + h + 1.45, -1.6 + Math.sin(a) * 1.36], [Math.cos(a) * 1.0, y0 + h + 2.38, -1.6 + Math.sin(a) * 1.0], [Math.cos(a) * 0.05, y0 + h + 2.82, -1.6 + Math.sin(a) * 0.05]], 0.04, 0.03, '#c99a1e', 4);
    }
    k.tube(0.12, 0.16, 0.5, 0, y0 + h + 3.0, -1.6, C.gold, 0, 0, 0, 8);
    k.gem(0.18, 0, y0 + h + 3.45, -1.6, '#e74c3c');
  }
  // Coin piles, chests and gems
  for (let i = 0; i < 2 + t; i++) {
    const px = -1.6 + (i % 3) * 1.6;
    const pz = 2.4 + Math.floor(i / 3) * 1.0;
    k.lathe([[0.55, 0], [0.4, 0.25], [0.15, 0.42], [0.001, 0.45]], px, 0.12, pz, C.gold, 12);
    for (let j = 0; j < 4; j++) k.tube(0.13, 0.13, 0.04, px + 0.4, 0.14 + j * 0.05, pz + 0.2, '#ffd34d', 0, 0, 0, 10);
  }
  const chest = (x: number, z: number) => {
    k.rbox(0.9, 0.5, 0.6, 0.05, x, 0.37, z, C.wood);
    k.add(new THREE.CylinderGeometry(0.3, 0.3, 0.92, 12, 1, false, 0, Math.PI), shade(C.wood, -0.1), x, 0.62, z, 0, 0, Math.PI / 2);
    for (const dx of [-0.32, 0.32]) k.rbox(0.07, 0.82, 0.64, 0.02, x + dx, 0.55, z, C.gold);
    k.rbox(0.14, 0.16, 0.05, 0.02, x, 0.5, z + 0.32, C.gold);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), glowMaterial('#ffd34d', 2.5));
    glow.position.set(x, 0.92, z);
    glow.scale.set(1.6, 0.4, 1);
    g.add(glow);
  };
  chest(1.9, 3.6);
  if (t >= 3) chest(-1.9, 3.6);
  if (t >= 4) {
    k.rbox(0.8, 0.9, 0.8, 0.06, 0, 0.57, 3.7, '#e4dccb');
    const statue = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), glowMaterial('#ffd34d', 2.8));
    statue.position.set(0, 1.6, 3.7);
    statue.scale.set(1, 1.6, 1);
    g.add(statue);
    anim.push((time) => (statue.rotation.y = time));
  }
  void rand;
};

const guildHall: Builder = (k, g, plot, info, anim, rand) => {
  const t = info.tier;
  k.rbox(plot.w, 0.24, plot.d, 0.08, 0, 0, 0, '#cfc6b6');
  for (let i = 0; i < 2; i++) k.rbox(1.8 - i * 0.3, 0.18, 0.5, 0.04, 0, 0.21 + i * 0.18, 1.85 - i * 0.35, C.stone);
  stoneBox(k, rand, 4.2, 1.3, 5.2, 0, 0.2, -1.0, '#c9c1b2');
  k.box(4.2, 2.4, 5.2, 0, 1.5, -1.0, C.plaster);
  timberFront(k, 4.2, 2.4, 0, 1.5, 1.6);
  gableRoof(k, 4.4, 5.6, 3.4, 0, 3.9, -1.0, C.green, true, 7);
  // Round shield emblem on the gable
  k.tube(0.75, 0.75, 0.12, 0, 4.9, 1.75, C.gold, Math.PI / 2, 0, 0, 20);
  k.tube(0.6, 0.6, 0.14, 0, 4.9, 1.77, C.red, Math.PI / 2, 0, 0, 20);
  k.plate(star(0.4, 0.17), 0.05, 0.02, 0, 4.9, 1.86, C.gold);
  door(k, 0, 0.2, 1.62, 1.4, 1.9, '#6b3f1f', C.woodDark);
  for (const s of [-1, 1]) windowAt(k, s * 1.4, 2.0, 1.63, 0.45, 0.65, C.woodDark, '#ffd98a');
  // Banners in a row
  const colors = [C.red, C.blue, C.gold, C.purple, C.leaf];
  const banners = Math.min(5, 1 + t);
  for (let i = 0; i < banners; i++) {
    const x = -1.9 + i * 0.95;
    k.tube(0.05, 0.06, 3.0, x, 1.5, 3.3, C.woodDark, 0, 0, 0, 6);
    k.ball(0.09, x, 3.05, 3.3, C.gold);
    clothBanner(k, x, 2.85, 3.34, colors[i]!, 0.6, 1.3, null);
  }
  torch(k, g, -1.0, 2.2, anim, 1.4, 0.2);
  torch(k, g, 1.0, 2.2, anim, 1.4, 0.2);
  if (t >= 3) {
    // Bell tower on the ridge
    k.rbox(0.9, 1.0, 0.9, 0.05, 0, 7.6, -1.6, C.plaster);
    for (const s of [-1, 1]) for (const z of [-1.95, -1.25]) k.tube(0.06, 0.06, 0.9, s * 0.38, 8.5, z, C.woodDark, 0, 0, 0, 5);
    k.lathe([[0.3, 0], [0.24, 0.12], [0.18, 0.4], [0.001, 0.45]], 0, 8.1, -1.6, C.gold, 12);
    coneRoof(k, 0.75, 0.9, 0, 9.0, -1.6, C.green, C.gold, 2);
  }
};

const petSanctuary: Builder = (k, g, plot, info, anim, rand) => {
  const t = info.tier;
  k.rbox(plot.w, 0.24, plot.d, 0.08, 0, 0, 0, '#8fcf6a');
  for (let i = 0; i < 40; i++) {
    const x = (rand() - 0.5) * (plot.w - 1);
    const z = (rand() - 0.5) * (plot.d - 1);
    k.add(new THREE.ConeGeometry(0.06, 0.32, 4), rand() < 0.5 ? '#6fbf4a' : '#5fa83f', x, 0.28, z, 0, 0, (rand() - 0.5) * 0.4);
  }
  // Picket fence
  const fw = plot.w - 0.8;
  const fd = plot.d - 0.8;
  const picket = (x: number, z: number) => {
    k.rbox(0.16, 0.8, 0.06, 0.02, x, 0.55, z, C.white);
    k.spike(0.1, 0.18, x, 1.03, z, C.white, 0, Math.PI / 4, 0, 4);
  };
  for (let x = -fw / 2; x <= fw / 2 + 0.01; x += 0.4) {
    picket(x, -fd / 2);
    if (Math.abs(x) > 1.2) picket(x, fd / 2);
  }
  for (let z = -fd / 2 + 0.4; z < fd / 2; z += 0.4) for (const s of [-1, 1]) picket(s * fw / 2, z);
  // Pond with stones, lily pads and a flower
  k.lathe([[0.001, 0], [1.8, 0], [1.8, 0.04]], -2.6, 0.13, 1.2, '#4aa8e0', 24);
  k.tube(1.5, 1.5, 0.03, -2.6, 0.18, 1.2, '#7fd3ff', 0, 0, 0, 24);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.add(new THREE.DodecahedronGeometry(0.24, 0), i % 2 ? '#bdb5a8' : '#a99f91', -2.6 + Math.cos(a) * 1.85, 0.22, 1.2 + Math.sin(a) * 1.85);
  }
  for (const [x, z] of [
    [-3.1, 0.8],
    [-2.0, 1.6],
    [-2.9, 1.8],
  ] as const) {
    k.add(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 10, 1, false, 0.3, Math.PI * 1.8), '#4caf50', x, 0.22, z);
  }
  k.ball(0.09, -2.0, 0.3, 1.6, '#ff8ad8');
  // Pet house
  k.rbox(2.2, 1.6, 1.8, 0.12, 3.0, 1.0, -2.6, '#c98a4a');
  for (let i = 0; i < 4; i++) k.rbox(2.24, 0.05, 1.84, 0.01, 3.0, 0.45 + i * 0.35, -2.6, '#a8703a');
  gableRoof(k, 2.4, 2.0, 1.1, 3.0, 1.8, -2.6, C.red, false, 3, '#c98a4a');
  k.add(new THREE.CircleGeometry(0.42, 14, 0, Math.PI), '#3a2a1a', 3.0, 0.62, -1.69, 0, 0, 0);
  k.rbox(0.84, 0.42, 0.04, 0.02, 3.0, 0.41, -1.69, '#3a2a1a');
  k.rbox(0.7, 0.24, 0.05, 0.04, 3.0, 1.55, -1.66, C.gold);
  for (let i = 0; i < 2; i++) k.lathe([[0.18, 0], [0.22, 0.1], [0.2, 0.12]], 1.6 + i * 0.55, 0.13, -1.3, i ? '#4f7fe0' : '#e0574f', 12);
  tree(k, -4.1, -3.0, 0.9);
  if (t >= 1) tree(k, 4.8, 2.9, 0.7, true);
  // Flower beds
  for (let i = 0; i < 8; i++) {
    const x = 0.6 + (i % 4) * 0.5;
    const z = 2.6 + Math.floor(i / 4) * 0.5;
    k.tube(0.015, 0.015, 0.35, x, 0.3, z, '#3d8b37', 0, 0, 0, 4);
    k.ball(0.09, x, 0.5, z, ['#ff8ad8', '#ffe066', '#ffffff', '#b98eff'][i % 4]!);
  }
  if (t >= 2) {
    k.add(new THREE.IcosahedronGeometry(0.6, 1), C.leafDark, 0.5, 0.5, -3.3);
    k.add(new THREE.IcosahedronGeometry(0.5, 1), C.leaf, -0.3, 0.45, -3.5);
  }
  if (t >= 3) {
    k.rbox(1.3, 0.35, 0.6, 0.05, 1.0, 0.3, 3.9, C.woodDark);
    k.rbox(1.1, 0.12, 0.45, 0.03, 1.0, 0.5, 3.9, '#e8a05a');
  }
  if (t >= 4) {
    k.lathe([[0.7, 0], [0.75, 0.3], [0.6, 0.35], [0.15, 0.45], [0.12, 1.0], [0.35, 1.1]], -2.6, 0.18, 1.2, C.stone, 16);
    const water = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), glowMaterial('#9fe7ff', 2.5));
    water.position.set(-2.6, 1.45, 1.2);
    g.add(water);
    anim.push((time) => water.scale.setScalar(0.9 + Math.sin(time * 4) * 0.12));
  }
  info.pets.forEach((petId, i) => {
    const m = petModel(petId, info.petColors[petId] ?? C.white);
    g.add(m);
    const r = 1.4 + (i % 3) * 0.6;
    const speed = 0.35 + i * 0.07;
    const cx = 1 - (i % 2) * 1.6;
    anim.push((time) => {
      const a = time * speed + i * 2;
      const hop = Math.abs(Math.sin(time * 6 + i)) * 0.08;
      m.position.set(cx + Math.cos(a) * r, petId === 'moonmoth' ? 0.5 + Math.sin(time * 3) * 0.3 : 0.15 + hop, 0.2 + Math.sin(a) * r * 0.6);
      m.rotation.y = -a;
    });
  });
};

const BUILDERS: Record<BuildingId, Builder> = {
  castle,
  gold_mine: goldMine,
  academy,
  barracks,
  training_grounds: trainingGrounds,
  blacksmith,
  treasury,
  guild_hall: guildHall,
  pet_sanctuary: petSanctuary,
};

/** Builds a plot (static mesh + animated parts), positioned at the plot centre. */
export function buildPlot(plot: Plot, info: PlotInfo): BuiltPlot {
  const group = new THREE.Group();
  const animators: Animator[] = [];
  const k = new K();
  const rand = seeded(hashStr(plot.id));
  if (info.level <= 0) emptyPlot(k, group, plot, info.unlocked, rand);
  else BUILDERS[plot.id](k, group, plot, info, animators, rand);
  if (info.upgrading) scaffolding(k, group, plot, animators);
  const mesh = k.build(true, BUILD_MAT);
  bakeGroundAO(mesh, 2.2, 0.3);
  group.add(mesh);
  addOutlines(group, 0.035, (m) => m.material === BUILD_MAT && !m.userData.noOutline);
  group.position.set(plot.x, 0, plot.z);
  return { group, animators };
}

/** Siege engines and supplies that decorate the avenue near the gate. */
export function catapult(k: Kit, x: number, z: number, ry: number): void {
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const p = (lx: number, lz: number): [number, number] => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
  const [ax, az] = p(0, 0);
  k.box(1.8, 0.5, 2.8, ax, 0.35, az, C.wood, ry);
  for (const [lx, lz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const [wx, wz] = p(lx, lz);
    k.add(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 12), C.woodDark, wx, 0.42, wz, 0, ry, Math.PI / 2);
    k.add(new THREE.TorusGeometry(0.42, 0.05, 5, 14), C.iron, wx, 0.42, wz, 0, ry + Math.PI / 2, 0);
  }
  const [px, pz] = p(0, 0.5);
  k.box(0.2, 1.4, 0.2, px - 0.5 * cos, 0.85, pz + 0.5 * sin, C.woodDark, ry);
  k.box(0.2, 1.4, 0.2, px + 0.5 * cos, 0.85, pz - 0.5 * sin, C.woodDark, ry);
  const [arx, arz] = p(0, -0.3);
  k.add(new THREE.BoxGeometry(0.22, 0.22, 2.6), C.wood, arx, 1.9, arz, -0.6, ry, 0);
  const [bx, bz] = p(0, -1.4);
  k.box(0.6, 0.35, 0.6, bx, 2.45, bz, C.woodDark, ry);
  k.rock(0.25, bx, 2.6, bz, C.stoneDark);
}

export function cannon(k: Kit, x: number, z: number, ry: number): void {
  k.box(1.2, 0.4, 1.6, x, 0.3, z, C.woodDark, ry);
  k.add(new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(0.42, 0), new THREE.Vector2(0.36, 0.3), new THREE.Vector2(0.3, 2.0), new THREE.Vector2(0.36, 2.15), new THREE.Vector2(0.22, 2.2)], 12), C.iron, x - Math.sin(ry) * 0.6, 1.05, z - Math.cos(ry) * 0.6, Math.PI / 2 - 0.25, ry, 0);
  for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 12), C.wood, x + s * 0.7 * Math.cos(ry), 0.42, z - s * 0.7 * Math.sin(ry), 0, ry, Math.PI / 2);
  for (let i = 0; i < 3; i++) k.sphere(0.25, x + 1.3 * Math.cos(ry) + (i - 1) * 0.3, 0.25, z + 1.3, C.iron, 1);
}

export { barrel, crate, banner, torch, lantern, BUILD_MAT, coneRoof, tower, stoneBox, merlons, seeded };
