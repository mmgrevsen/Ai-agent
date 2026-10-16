import * as THREE from 'three';
import type { BuildingId } from '../../core/content/buildings';
import { basic, Kit } from './kit';
import type { Plot } from './layout';

/** Toy-like palette shared by all base models. */
export const C = {
  sand: '#efc07a',
  pad: '#f6d39a',
  padEdge: '#d9a866',
  road: '#d8cbb8',
  roadEdge: '#b9a68c',
  grass: '#7cc35a',
  grassDark: '#5fa648',
  stone: '#e3ddd3',
  stoneDark: '#bdb5a8',
  wood: '#b07c45',
  woodDark: '#7a5230',
  red: '#e0574f',
  blue: '#4f7fe0',
  purple: '#8a5cc7',
  gold: '#f5c542',
  iron: '#4d535c',
  steel: '#c9d1da',
  skin: '#f2c79b',
  white: '#f7f4ee',
  leaf: '#4caf50',
  leafDark: '#2e7d32',
  water: '#5ec8f2',
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

// --- Small reusable props ------------------------------------------------------------------------

export function tree(k: Kit, x: number, z: number, s = 1, pine = false): void {
  k.cyl(0.25 * s, 0.32 * s, 1.2 * s, x, 0, z, C.woodDark, 6);
  if (pine) {
    k.cone(1.3 * s, 2.2 * s, x, 1 * s, z, C.leafDark, 7);
    k.cone(1 * s, 1.8 * s, x, 2.1 * s, z, C.leaf, 7);
  } else {
    k.sphere(1.2 * s, x, 2.1 * s, z, C.leaf, 0);
    k.sphere(0.8 * s, x + 0.6 * s, 2.6 * s, z + 0.3 * s, C.leafDark, 0);
  }
}

function barrel(k: Kit, x: number, z: number): void {
  k.cyl(0.38, 0.38, 0.9, x, 0, z, C.wood, 8);
  k.cyl(0.4, 0.4, 0.1, x, 0.2, z, C.iron, 8);
  k.cyl(0.4, 0.4, 0.1, x, 0.65, z, C.iron, 8);
}

function crate(k: Kit, x: number, z: number, s = 0.8, ry = 0): void {
  k.box(s, s, s, x, 0, z, C.wood, ry);
  k.box(s * 1.02, s * 0.12, s * 1.02, x, s * 0.44, z, C.woodDark, ry);
}

function dummy(k: Kit, x: number, z: number): void {
  k.cyl(0.08, 0.08, 1.6, x, 0, z, C.woodDark, 5);
  k.cyl(0.35, 0.35, 0.8, x, 0.6, z, '#d8b77a', 8);
  k.sphere(0.28, x, 1.65, z, '#d8b77a');
  k.box(1.2, 0.12, 0.12, x, 1.2, z, C.woodDark);
}

function banner(k: Kit, x: number, z: number, hex: string, h = 3): void {
  k.cyl(0.07, 0.07, h, x, 0, z, C.woodDark, 5);
  k.box(0.9, 1.3, 0.06, x + 0.5, h - 1.5, z, hex);
  k.sphere(0.12, x, h, z, C.gold);
}

function torch(k: Kit, g: THREE.Group, x: number, z: number, animators: Animator[], h = 1.6): void {
  k.cyl(0.08, 0.1, h, x, 0, z, C.woodDark, 5);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 6), basic('#ffb347'));
  flame.position.set(x, h + 0.2, z);
  g.add(flame);
  const seed = x * 3.1 + z;
  animators.push((t) => {
    const s = 0.85 + 0.25 * Math.sin(t * 13 + seed) + 0.1 * Math.sin(t * 31 + seed);
    flame.scale.set(s, s * 1.2, s);
  });
}

/** Pad, curb and (for unbuilt plots) the construction look shared by every plot. */
function plotBase(k: Kit, plot: Plot, hex = C.pad): void {
  k.box(plot.w, 0.12, plot.d, 0, 0, 0, hex);
  const t = 0.3;
  k.box(plot.w + t, 0.22, t, 0, 0, -plot.d / 2, C.padEdge);
  k.box(plot.w + t, 0.22, t, 0, 0, plot.d / 2, C.padEdge);
  k.box(t, 0.22, plot.d, -plot.w / 2, 0, 0, C.padEdge);
  k.box(t, 0.22, plot.d, plot.w / 2, 0, 0, C.padEdge);
}

function emptyPlot(k: Kit, g: THREE.Group, plot: Plot, unlocked: boolean): void {
  plotBase(k, plot, unlocked ? '#e9c58c' : '#d6c3a5');
  // Dirt mounds and stakes with tape
  k.rock(0.8, -plot.w / 4, 0, 0, '#c99a5f', 0.4, 0.4);
  k.rock(0.6, plot.w / 5, 0, plot.d / 5, '#c99a5f', 1.2, 0.4);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    k.box(0.15, 0.9, 0.15, (sx * plot.w) / 3, 0, (sz * plot.d) / 3, C.wood);
  }
  if (unlocked) {
    // "Build here" sign
    k.box(0.15, 1.4, 0.15, 0, 0, plot.d / 2 - 1.2, C.woodDark);
    k.box(1.8, 0.9, 0.12, 0, 1.2, plot.d / 2 - 1.2, C.gold);
    k.box(0.9, 0.18, 0.13, 0, 1.55, plot.d / 2 - 1.18, C.woodDark);
  } else {
    // Locked: a stone marker with a padlock
    k.box(1.4, 1.2, 0.8, 0, 0, 0, C.stoneDark);
    k.box(0.7, 0.55, 0.3, 0, 1.25, 0.1, C.iron);
    k.cyl(0.25, 0.25, 0.12, 0, 1.75, 0.1, C.iron, 10);
  }
  void g;
}

function scaffolding(k: Kit, g: THREE.Group, plot: Plot, animators: Animator[]): void {
  const w = Math.min(plot.w - 1, 7);
  const d = Math.min(plot.d - 1, 6);
  const h = 5;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    k.box(0.15, h, 0.15, (sx * w) / 2, 0, (sz * d) / 2, '#d9b36b');
  }
  for (const y of [1.7, 3.4]) {
    k.box(w, 0.12, 0.12, 0, y, -d / 2, '#d9b36b');
    k.box(w, 0.12, 0.12, 0, y, d / 2, '#d9b36b');
    k.box(0.12, 0.12, d, -w / 2, y, 0, '#d9b36b');
    k.box(0.12, 0.12, d, w / 2, y, 0, '#d9b36b');
  }
  // Crane with a swinging arm
  const cx = w / 2 + 0.6;
  const cz = -d / 2;
  k.box(0.35, 7, 0.35, cx, 0, cz, '#f0b429');
  const arm = new Kit().box(5, 0.3, 0.3, -2, 0, 0, '#f0b429').box(0.08, 1.4, 0.08, -4.2, -1.4, 0, C.iron).box(0.6, 0.4, 0.6, -4.2, -1.8, 0, C.wood).build();
  arm.position.set(cx, 7, cz);
  g.add(arm);
  animators.push((t) => {
    arm.rotation.y = Math.sin(t * 0.6) * 0.9;
  });
}

// --- Units ---------------------------------------------------------------------------------------

/** A little soldier (merged into one mesh). Origin at the feet. */
export function soldierMesh(body: string, helmet = C.steel, scale = 1, cape?: string): THREE.Mesh {
  const k = new Kit();
  k.box(0.22, 0.55, 0.24, -0.14, 0, 0, '#3a3550');
  k.box(0.22, 0.55, 0.24, 0.14, 0, 0, '#3a3550');
  k.box(0.62, 0.7, 0.4, 0, 0.55, 0, body);
  if (cape) k.box(0.62, 0.8, 0.08, 0, 0.45, -0.24, cape);
  k.sphere(0.3, 0, 1.55, 0, C.skin, 1);
  k.cyl(0.32, 0.34, 0.22, 0, 1.62, 0, helmet, 8);
  k.box(0.08, 0.75, 0.08, 0.42, 0.6, 0.18, C.steel);
  const m = k.build();
  m.scale.setScalar(scale);
  return m;
}

/** A soldier lying in the push-up position; animate by rotating around the feet. */
function pushupMesh(body: string): THREE.Mesh {
  const k = new Kit();
  // Built along +z (head toward +z) at rest height; arms are the vertical boxes at the shoulders.
  k.box(0.5, 0.35, 1.4, 0, 0.25, 0.7, body);
  k.box(0.4, 0.25, 0.9, 0, 0.12, -0.45, '#3a3550');
  k.sphere(0.25, 0, 0.45, 1.55, C.skin, 1);
  k.box(0.12, 0.5, 0.12, -0.28, -0.05, 1.25, C.skin);
  k.box(0.12, 0.5, 0.12, 0.28, -0.05, 1.25, C.skin);
  return k.build();
}

function petMesh(petId: string, hex: string): THREE.Mesh {
  const k = new Kit();
  if (petId === 'moonmoth') {
    k.sphere(0.25, 0, 0.9, 0, hex);
    k.box(0.9, 0.05, 0.6, -0.45, 0.95, 0, '#e8d8ff');
    k.box(0.9, 0.05, 0.6, 0.45, 0.95, 0, '#e8d8ff');
  } else if (petId === 'pebble_golem') {
    k.box(0.7, 0.6, 0.6, 0, 0, 0, hex);
    k.box(0.5, 0.45, 0.45, 0, 0.6, 0.05, '#aab4bd');
    k.box(0.3, 0.1, 0.05, 0, 0.82, 0.28, '#5dade2');
  } else {
    // Four-legged critter (fox, pup, hatchling)
    k.box(0.9, 0.45, 0.45, 0, 0.3, 0, hex);
    for (const [x, z] of [
      [-0.3, -0.15],
      [0.3, -0.15],
      [-0.3, 0.15],
      [0.3, 0.15],
    ]) {
      k.box(0.12, 0.3, 0.12, x, 0, z, hex);
    }
    k.box(0.45, 0.4, 0.4, 0.55, 0.55, 0, hex);
    k.cone(0.12, 0.25, 0.5, 0.95, -0.12, hex, 4);
    k.cone(0.12, 0.25, 0.5, 0.95, 0.12, hex, 4);
    k.box(0.45, 0.15, 0.15, -0.6, 0.5, 0, petId === 'ember_fox' ? '#fdfefe' : hex);
    if (petId === 'sparkwing') {
      k.box(0.1, 0.05, 0.9, 0, 0.6, -0.5, '#f5b041');
      k.box(0.1, 0.05, 0.9, 0, 0.6, 0.5, '#f5b041');
    }
  }
  return k.build();
}

// --- Buildings -----------------------------------------------------------------------------------

type Builder = (k: Kit, g: THREE.Group, plot: Plot, info: PlotInfo, animators: Animator[]) => void;

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
  // Crossed swords emblem
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
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: flagTexture(), side: THREE.DoubleSide }));
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

const castle: Builder = (k, g, plot, info, anim) => {
  const t = info.tier;
  k.box(plot.w - 0.6, 0.35, plot.d - 0.6, 0, 0, 0, C.stoneDark);
  const keepH = 5 + t * 0.9;
  k.box(7, keepH, 5, 0, 0.35, -1.6, C.stone);
  k.crenels(7, 0, 0.35 + keepH, -4.05, C.stone, false, 0.6, 0.5);
  k.crenels(7, 0, 0.35 + keepH, 0.85, C.stone, false, 0.6, 0.5);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) k.box(0.6, 0.9, 0.1, -2 + i * 2, 1.6 + j * 1.8, 0.91, '#3b2a55');
  // Gatehouse and door
  k.box(3.4, 3.6, 1.6, 0, 0.35, 1.5, C.stone);
  k.crenels(3.4, 0, 3.95, 2.25, C.stone, false, 0.5, 0.45);
  k.box(1.7, 2.3, 0.12, 0, 0.35, 2.32, '#5b3a1e');
  k.box(1.9, 0.18, 0.14, 0, 2.65, 2.33, C.gold);
  // Towers: two at first, four from tier 1
  const towers: [number, number][] = [
    [-5.6, 3],
    [5.6, 3],
  ];
  if (t >= 1) towers.push([-5.6, -4.4], [5.6, -4.4]);
  const roofHex = t >= 3 ? C.purple : C.blue;
  for (const [x, z] of towers) {
    const h = 5.5 + t * 0.9;
    k.cyl(1.25, 1.35, h, x, 0.35, z, C.stone, 10);
    k.cyl(1.45, 1.45, 0.45, x, 0.35 + h, z, C.stoneDark, 10);
    k.cone(1.6, 2.6, x, 0.8 + h, z, roofHex, 10);
    if (t >= 2) k.sphere(0.25, x, 3.5 + h, z, C.gold);
    k.box(0.4, 0.8, 0.1, x, 2.4, z + 1.28, '#3b2a55');
  }
  // Curtain walls
  k.box(3.1, 3, 0.8, -3.6, 0.35, 3, C.stone);
  k.box(3.1, 3, 0.8, 3.6, 0.35, 3, C.stone);
  k.crenels(3, -3.6, 3.35, 3, C.stone, false, 0.45, 0.4);
  k.crenels(3, 3.6, 3.35, 3, C.stone, false, 0.45, 0.4);
  if (t >= 2) {
    // Upper keep
    k.box(4, 2.6, 3, 0, 0.35 + keepH, -1.8, C.white);
    k.roof(4.4, 2, 3.4, 0, 2.95 + keepH, -1.8, roofHex);
  }
  if (t >= 4) {
    k.box(7.1, 0.25, 5.1, 0, 0.35 + keepH - 0.6, -1.6, C.gold);
  }
  // Banners on the gatehouse
  k.box(0.7, 1.6, 0.06, -1.3, 1.6, 2.33, C.purple);
  k.box(0.7, 1.6, 0.06, 1.3, 1.6, 2.33, C.purple);
  // Flag on the keep
  const flagTop = 0.35 + keepH + (t >= 2 ? 4.6 : 3);
  k.cyl(0.08, 0.08, flagTop - (0.35 + keepH), 0, 0.35 + keepH, -1.6, C.woodDark, 5);
  flag(g, 0, flagTop - 0.8, -1.6, anim);
  torch(k, g, -1.4, 3.2, anim);
  torch(k, g, 1.4, 3.2, anim);
};

const goldMine: Builder = (k, g, plot, info, anim) => {
  const t = info.tier;
  plotBase(k, plot, '#e2b77a');
  // Rocky hill
  k.rock(2.8, -1.5, 0, -2.6, '#9c8b7a', 0.3, 0.9);
  k.rock(2.4, 2.2, 0, -2.8, '#8a7a6a', 1.1, 0.85);
  k.rock(1.6, -4, 0, -1.8, '#a89584', 2.1, 0.8);
  k.rock(1.4, 4.2, 0, -1.4, '#9c8b7a', 0.7, 0.8);
  k.rock(0.5, -1, 2.7, -2.2, C.gold, 0.4);
  k.rock(0.45, 2.5, 2.4, -2.3, C.gold, 1.6);
  // Entrance
  k.box(2.2, 2.2, 0.6, 0, 0, -0.9, '#2b211a');
  k.box(0.3, 2.4, 0.3, -1.25, 0, -0.6, C.wood);
  k.box(0.3, 2.4, 0.3, 1.25, 0, -0.6, C.wood);
  k.box(2.9, 0.35, 0.35, 0, 2.3, -0.6, C.wood);
  // Rails from the entrance to the front
  k.box(0.1, 0.08, 5.5, -0.45, 0.12, 2, C.iron);
  k.box(0.1, 0.08, 5.5, 0.45, 0.12, 2, C.iron);
  for (let i = 0; i < 7; i++) k.box(1.3, 0.08, 0.2, 0, 0.1, -0.4 + i * 0.85, C.woodDark);
  // Gold piles grow with stored gold
  const piles = Math.round(info.mineFill * 6);
  for (let i = 0; i < piles; i++) k.rock(0.35 + (i % 3) * 0.1, 2.2 + (i % 3) * 0.7, 0.05, 2 + Math.floor(i / 3) * 0.8, C.gold, i);
  if (t >= 1) {
    torch(k, g, -1.7, 0, anim, 2);
    torch(k, g, 1.7, 0, anim, 2);
  }
  if (t >= 2) {
    // Wooden hoist
    k.box(0.25, 4, 0.25, -3.5, 0, 2.5, C.wood).box(0.25, 4, 0.25, -2.3, 0, 2.5, C.wood).box(1.6, 0.25, 0.25, -2.9, 4, 2.5, C.wood);
    k.box(0.5, 0.5, 0.5, -2.9, 2.6, 2.5, C.woodDark);
  }
  if (t >= 3) k.box(1.6, 1.6, 0.5, 3.6, 0, -0.6, '#2b211a').box(2, 0.3, 0.3, 3.6, 1.6, -0.35, C.wood);
  crate(k, -3.5, 0.5);
  barrel(k, -4.3, 1.4);
  // Cart rolling along the rails
  const cart = new Kit()
    .box(1, 0.7, 1.3, 0, 0.25, 0, t >= 4 ? C.gold : C.woodDark)
    .rock(0.35, -0.15, 0.85, 0, C.gold, 0.2)
    .rock(0.3, 0.2, 0.85, 0.3, C.gold, 1.2)
    .cyl(0.2, 0.2, 0.1, -0.55, 0.05, -0.4, C.iron, 8)
    .cyl(0.2, 0.2, 0.1, 0.55, 0.05, -0.4, C.iron, 8)
    .build();
  cart.position.set(0, 0.1, 2);
  g.add(cart);
  anim.push((time) => {
    cart.position.z = 1.8 + Math.sin(time * 0.7) * 2.2;
  });
};

const academy: Builder = (k, g, plot, info, anim) => {
  const t = info.tier;
  plotBase(k, plot);
  const towerH = 5 + t * 1.1;
  k.cyl(1.8, 2, towerH, 1.5, 0.1, -1, '#ece6f7', 10);
  k.cyl(2.1, 2.1, 0.35, 1.5, 0.1 + towerH, -1, C.stoneDark, 10);
  k.cone(2.4, 3.4, 1.5, 0.45 + towerH, -1, C.blue, 10);
  for (let i = 0; i < 3; i++) k.box(0.5, 0.9, 0.1, 1.5, 1.2 + i * 1.6, 0.98, '#7fd3ff');
  // Library annex
  k.box(4, 3, 3.2, -2.6, 0.1, -0.8, '#e8dcc6');
  k.roof(4.4, 1.8, 3.6, -2.6, 3.1, -0.8, C.purple);
  k.box(1, 1.8, 0.1, -2.6, 0.1, 0.82, '#5b3a1e');
  // Books stack and scroll stand
  k.box(0.8, 0.2, 0.6, 3.6, 0, 2.6, C.red).box(0.7, 0.2, 0.55, 3.6, 0.2, 2.6, C.blue).box(0.75, 0.2, 0.58, 3.6, 0.4, 2.6, C.gold);
  if (t >= 2) {
    // Telescope on a tripod
    k.box(0.1, 1.4, 0.1, -4.4, 0, 2.4, C.woodDark).add(new THREE.CylinderGeometry(0.16, 0.22, 1.6, 8), C.gold, -4.2, 1.6, 2.2, 0.8, 0, 0.6);
  }
  if (t >= 3) banner(k, 4.6, -3.2, C.blue, 4);
  tree(k, -4.6, -3.6, 0.8);
  // Glowing orb floating above the tower
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), basic('#9fe7ff'));
  const orbY = 4.6 + towerH;
  orb.position.set(1.5, orbY, -1);
  g.add(orb);
  anim.push((time) => {
    orb.position.y = orbY + Math.sin(time * 2) * 0.3;
    orb.rotation.y = time;
  });
};

const barracks: Builder = (k, g, plot, info, anim) => {
  const t = info.tier;
  plotBase(k, plot);
  k.box(7.5, 2.8, 3.2, -1, 0.1, -2.6, '#d8b48a');
  k.box(7.7, 0.3, 3.4, -1, 0.1, -2.6, C.woodDark);
  k.roof(8, 2, 3.8, -1, 2.9, -2.6, C.red);
  for (let i = 0; i < 4; i++) k.box(0.7, 0.8, 0.1, -3.8 + i * 1.9, 1.3, -0.95, '#5b3a1e');
  // Tents
  const tents = Math.min(4, 1 + t);
  for (let i = 0; i < tents; i++) {
    const x = -4.2 + i * 2.4;
    k.cone(1.15, 1.8, x, 0.1, 2.2, i % 2 ? C.white : '#f2e2c4', 4, Math.PI / 4);
    k.box(0.35, 0.8, 0.05, x, 0.1, 3.02, '#5b3a1e');
  }
  // Weapon rack
  k.box(1.8, 0.15, 0.15, 4.3, 1.1, 0, C.woodDark).box(0.15, 1.2, 0.15, 3.5, 0, 0, C.woodDark).box(0.15, 1.2, 0.15, 5.1, 0, 0, C.woodDark);
  for (let i = 0; i < 4; i++) k.box(0.08, 1.3, 0.08, 3.7 + i * 0.4, 0.2, 0.12, C.steel);
  dummy(k, 4.5, 2.6);
  banner(k, 2.9, -0.6, C.red, 3.4);
  if (t >= 2) {
    // Watchtower
    for (const [x, z] of [
      [4, -3.8],
      [5.3, -3.8],
      [4, -2.5],
      [5.3, -2.5],
    ]) {
      k.box(0.2, 4.2, 0.2, x, 0, z, C.wood);
    }
    k.box(1.8, 0.25, 1.8, 4.65, 4.2, -3.15, C.woodDark);
    k.roof(2, 1, 2, 4.65, 5.4, -3.15, C.red);
  }
  if (t >= 3) banner(k, -5.2, -0.6, C.purple, 3.6);
  // A guard in front of the hall
  const guard = soldierMesh(info.soldierColors[0] ?? C.blue);
  guard.position.set(-1, 0.1, -0.4);
  g.add(guard);
  anim.push((time) => {
    guard.rotation.y = Math.sin(time * 0.5) * 0.6;
  });
};

const trainingGrounds: Builder = (k, g, plot, info, anim) => {
  const t = info.tier;
  plotBase(k, plot, '#e0ad6c');
  k.box(plot.w - 2, 0.14, plot.d - 2.4, 0, 0, 0.2, '#d49b5c');
  k.fence(plot.w - 1.2, plot.d - 1.2, C.wood, C.woodDark, 2.6);
  // Hurdles and climbing frame
  for (const x of [3.2, 4.6]) k.box(0.12, 0.8, 0.12, x, 0, -2.6, C.wood).box(0.12, 0.8, 0.12, x, 0, -1.4, C.wood).box(0.12, 0.12, 1.3, x, 0.8, -2, C.red);
  for (let i = 0; i < 3; i++) k.box(0.15, 2.6, 0.15, -4.3 + i * 0.9, 0, -2.8, C.wood);
  k.box(2, 0.15, 0.15, -3.4, 2.6, -2.8, C.wood);
  k.box(2, 0.12, 0.12, -3.4, 1.8, -2.8, C.wood);
  k.box(2, 0.12, 0.12, -3.4, 1.0, -2.8, C.wood);
  // Push-up squad: more trainees with every tier
  const count = Math.min(6, 2 + t);
  const colors = info.soldierColors.length ? info.soldierColors : [C.blue, C.red, C.leaf];
  for (let i = 0; i < count; i++) {
    const m = pushupMesh(colors[i % colors.length]!);
    const row = Math.floor(i / 3);
    m.position.set(-1.8 + (i % 3) * 1.8, 0.45, -0.4 + row * 2.2);
    m.rotation.y = Math.PI;
    g.add(m);
    const phase = i * 0.7;
    anim.push((time) => {
      // Lean the body around the toes to mimic a push-up.
      const p = (Math.sin(time * 3 + phase) + 1) / 2;
      m.rotation.x = -0.05 - p * 0.28;
      m.position.y = 0.2 + p * 0.25;
    });
  }
  // Drill sergeant
  const sergeant = soldierMesh(C.purple, C.gold, 1.1);
  sergeant.position.set(0, 0.1, 3);
  sergeant.rotation.y = Math.PI;
  g.add(sergeant);
  anim.push((time) => {
    sergeant.position.x = Math.sin(time * 0.4) * 2;
    sergeant.rotation.y = Math.PI + Math.cos(time * 0.4) * 0.8;
  });
  dummy(k, 4.6, 2.6);
};

const blacksmith: Builder = (k, g, plot, info, anim) => {
  const t = info.tier;
  plotBase(k, plot);
  k.box(5.5, 3.2, 4, -1.5, 0.1, -2, '#bfb7ab');
  k.roof(6, 1.6, 4.5, -1.5, 3.3, -2, '#6b6f78');
  k.box(2.4, 2, 0.1, -1.5, 0.1, 0.02, '#2a2420');
  // Chimney
  const chimneyH = 6 + t * 0.6;
  k.box(1, chimneyH, 1, 1, 0.1, -3.2, '#9c948a');
  k.box(1.2, 0.3, 1.2, 1, 0.1 + chimneyH, -3.2, C.stoneDark);
  // Forge, anvil and sword rack outside
  k.box(1.6, 1, 1.2, 3, 0.1, -0.6, '#7d756b');
  const fire = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.8), basic('#ff8a2a'));
  fire.position.set(3, 1.25, -0.6);
  g.add(fire);
  k.box(0.9, 0.3, 0.45, 1.4, 0.75, 1.5, C.iron).box(0.4, 0.75, 0.35, 1.4, 0.1, 1.5, C.iron);
  k.box(2.2, 0.12, 0.12, -3.8, 1.5, 1.5, C.woodDark).box(0.12, 1.6, 0.12, -4.8, 0, 1.5, C.woodDark).box(0.12, 1.6, 0.12, -2.8, 0, 1.5, C.woodDark);
  for (let i = 0; i < 4; i++) k.box(0.1, 1.2, 0.05, -4.4 + i * 0.5, 0.35, 1.6, i === 3 && t >= 3 ? C.gold : C.steel);
  k.rock(0.5, 4.3, 0, 2.6, '#6f7f9a', 0.2).rock(0.4, 3.7, 0, 3, '#5d6d7e', 1.3);
  barrel(k, 4.5, 1.2);
  if (t >= 2) k.box(1, chimneyH - 1, 1, -3.8, 0.1, -3.2, '#9c948a');
  // Smoke puffs rising from the chimney
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), basic('#dcdcdc', 0.6));
    g.add(p);
    puffs.push(p);
  }
  anim.push((time) => {
    fire.scale.y = 0.8 + 0.4 * Math.abs(Math.sin(time * 9));
    puffs.forEach((p, i) => {
      const life = (time * 0.35 + i / puffs.length) % 1;
      p.position.set(1 + Math.sin(life * 6 + i) * 0.3, chimneyH + 0.6 + life * 4, -3.2 - life * 1.2);
      p.scale.setScalar(0.6 + life * 1.4);
      (p.material as THREE.MeshBasicMaterial).opacity = 0.65 * (1 - life);
    });
  });
};

const treasury: Builder = (k, g, plot, info, anim) => {
  const t = info.tier;
  plotBase(k, plot);
  const h = 3.6 + t * 0.6;
  k.box(4, h, 4.6, 0, 0.1, -1.2, '#f1e6c8');
  k.box(4.3, 0.35, 4.9, 0, 0.1 + h, -1.2, C.gold);
  for (const x of [-1.5, -0.5, 0.5, 1.5]) k.cyl(0.22, 0.25, h - 0.4, x, 0.1, 1.25, C.white, 8);
  k.box(4.2, 0.4, 0.6, 0, h - 0.3, 1.25, C.white);
  k.box(1.3, 2, 0.12, 0, 0.1, 1.11, C.gold);
  k.cyl(0.3, 0.3, 0.12, 0, 1.1, 1.18, C.iron, 10);
  if (t >= 2) {
    k.cyl(1.3, 1.5, 0.6, 0, 0.45 + h, -1.2, C.gold, 10);
    k.sphere(1.35, 0, 1.0 + h, -1.2, C.gold, 1);
  }
  // Coin piles and chests in front
  for (let i = 0; i < 2 + t; i++) k.cyl(0.4 - (i % 2) * 0.1, 0.45, 0.25 + (i % 3) * 0.12, -1.5 + (i % 3) * 1.4, 0.1, 2.6 + Math.floor(i / 3) * 0.9, C.gold, 10);
  k.box(0.9, 0.6, 0.6, 1.6, 0.1, 3.4, C.wood).box(0.92, 0.2, 0.62, 1.6, 0.7, 3.4, C.gold);
  void g;
  void anim;
};

const guildHall: Builder = (k, g, plot, info, anim) => {
  const t = info.tier;
  plotBase(k, plot);
  k.box(4, 3.4, 5, 0, 0.1, -1, '#dcc29a');
  k.roof(4.4, 3.2, 5.4, 0, 3.5, -1, '#2f9e6b', true);
  k.box(1.2, 2.1, 0.12, 0, 0.1, 1.52, '#5b3a1e');
  k.add(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 10), C.gold, 0, 3.1, 1.6, Math.PI / 2, 0, 0);
  k.add(new THREE.CylinderGeometry(0.45, 0.45, 0.14, 4), C.red, 0, 3.1, 1.66, Math.PI / 2, 0, 0);
  const colors = [C.red, C.blue, C.gold, C.purple, C.leaf];
  const banners = Math.min(5, 1 + t);
  for (let i = 0; i < banners; i++) banner(k, -1.9 + i * 0.95, 3.2, colors[i]!, 3.2);
  torch(k, g, -1.4, 2, anim);
  torch(k, g, 1.4, 2, anim);
};

const petSanctuary: Builder = (k, g, plot, info, anim) => {
  const t = info.tier;
  plotBase(k, plot, '#9fd77a');
  k.fence(plot.w - 1, plot.d - 1, C.wood, C.woodDark, 2.4);
  k.cyl(1.7, 1.8, 0.12, -2.6, 0.05, 1.2, C.water, 14);
  k.rock(0.4, -4.1, 0, 1.6, C.stoneDark, 0.2).rock(0.35, -1.2, 0, 2.3, C.stoneDark, 1);
  // Pet house
  k.box(2.2, 1.6, 1.8, 3, 0.1, -2.6, C.wood);
  k.roof(2.6, 1.2, 2.2, 3, 1.7, -2.6, C.red);
  k.box(0.7, 0.9, 0.1, 3, 0.1, -1.68, '#3a2a1a');
  tree(k, -4, -3, 0.9);
  if (t >= 1) tree(k, 4.6, 2.8, 0.7, true);
  if (t >= 2) k.sphere(0.6, 0.5, 0.4, -3.2, C.leafDark).sphere(0.5, -0.3, 0.35, -3.4, C.leaf);
  if (t >= 3) k.box(1.2, 0.3, 0.6, 1, 0.1, 2.8, C.woodDark).box(1, 0.2, 0.45, 1, 0.4, 2.8, '#e8a05a');
  info.pets.forEach((petId, i) => {
    const m = petMesh(petId, info.petColors[petId] ?? C.white);
    g.add(m);
    const r = 1.6 + (i % 3) * 0.6;
    const speed = 0.35 + i * 0.07;
    const cx = 1 - (i % 2) * 2;
    anim.push((time) => {
      const a = time * speed + i * 2;
      m.position.set(cx + Math.cos(a) * r, petId === 'moonmoth' ? 0.4 + Math.sin(time * 3) * 0.3 : 0.1, 0.4 + Math.sin(a) * r * 0.6);
      m.rotation.y = -a - Math.PI / 2;
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
  const k = new Kit();
  if (info.level <= 0) emptyPlot(k, group, plot, info.unlocked);
  else BUILDERS[plot.id](k, group, plot, info, animators);
  if (info.upgrading) scaffolding(k, group, plot, animators);
  group.add(k.build());
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
    k.add(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 10), C.woodDark, wx, 0.4, wz, 0, ry, Math.PI / 2);
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
  k.add(new THREE.CylinderGeometry(0.32, 0.42, 2.2, 10), C.iron, x + Math.sin(ry) * 0.4, 1.05, z + Math.cos(ry) * 0.4, Math.PI / 2 - 0.25, ry, 0);
  for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 10), C.wood, x + s * 0.7 * Math.cos(ry), 0.42, z - s * 0.7 * Math.sin(ry), 0, ry, Math.PI / 2);
  for (let i = 0; i < 3; i++) k.sphere(0.25, x + 1.3 * Math.cos(ry) + (i - 1) * 0.3, 0.25, z + 1.3, C.iron);
}

export { barrel, crate, banner, torch };
