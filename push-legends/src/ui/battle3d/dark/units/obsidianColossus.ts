import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { K, shapeFrom, type V } from '../../../base3d/sculpt';
import { addGlow, addMesh, newRig, pivot, type Rig } from '../../rig';
import { metal } from '../parts';
import { chunkGeo, GlowBatch, jag2, lumpGeo, put, segLine, SHADOW, spikeAB, Surface, xf } from './_creatures';
import type { UnitDef } from './types';

/**
 * The Obsidian Colossus (card: bastion_golem, epic). An enormous, hunched construct of fractured
 * glassy black stone bound in ancient forged iron: boulder-heavy pectorals split by a molten seam,
 * a furnace sigil burning in its chest, crowns of obsidian crystal bursting from its shoulders and
 * back, gorilla-long arms ending in spiked fists, and a crested iron mask sunk low between the
 * shoulders with one narrow slit of magma for eyes. Molten light leaks from cracks and joints.
 * Accent: magma orange. Drawn 1.6x larger than troops.
 */
const ST = metal('#2b2830', 0.42);
const ST_DK = '#18161b';
const ST_HI = metal('#4a4450', 0.46);
const IRON = metal('#2c2e34', 0.72);
const IRON_DK = metal('#1a1b20', 0.62);
const GOLD = PAL.gold;
const MAGMA = '#ff4a12';
const CORE = '#7a1404';
const JOINT = '#b82a06';
const EYE = '#ff6a1f';
const SIZE = 0.86;

/** Rock lump placed in kit space; optionally remembered for crack projection. */
function rock(k: K, r: number, seed: number, at: [number, number, number], sc: [number, number, number], hex: string, rot: [number, number, number] = [0, 0, 0], surf?: Surface, jit = 0.17, detail = 1): void {
  const g = xf(lumpGeo(r, seed, jit, detail), at[0], at[1], at[2], rot[0], rot[1], rot[2], sc[0], sc[1], sc[2]);
  put(k, surf ? surf.add(g) : g, hex);
}

/** Obsidian crystal cluster bursting from a point (shoulders, back). */
function crystals(k: K, base: V, dirs: [number, number, number, number][], hexes: string[]): void {
  dirs.forEach(([dx, dy, dz, r], i) => {
    put(k, spikeAB(base, [base[0] + dx, base[1] + dy, base[2] + dz], r, 5, 0.75), hexes[i % hexes.length]!);
  });
}

/** Crack lines are projected once per part and reused by every later build. */
const memo = new Map<string, THREE.BufferGeometry>();
function cracks(key: string, surf: Surface, make: (s: Surface) => THREE.Vector3[][]): THREE.BufferGeometry | null {
  let g = memo.get(key);
  if (!g) {
    const lines = make(surf).filter((l) => l.length > 1);
    if (!lines.length) return null;
    const parts = lines.map((l, i) => segLine(l, i % 3 === 0 ? 0.014 : 0.01, 0.005, 3));
    g = parts.length === 1 ? parts[0]! : mergeAll(parts);
    memo.set(key, g);
  }
  surf.dispose();
  return g.clone();
}
function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const gb = new GlowBatch();
  const holder = new THREE.Group();
  parts.forEach((p) => gb.add(p));
  const m = gb.flush(holder, MAGMA)!;
  return m.geometry;
}

function head(k: K, glow: THREE.Object3D): void {
  // Head centre relative to the neck pivot
  const hy = 0.16;
  const hz = 0.14;
  const gb = new GlowBatch();
  // Stone skull, heavy and wedge-shaped
  rock(k, 0.2, 41, [0, hy, hz - 0.05], [1.0, 0.85, 1.0], ST_DK);
  // Forged iron mask: wide at the brow, narrowing to a pointed chin
  k.add(new THREE.CylinderGeometry(0.18, 0.06, 0.32, 6, 1), IRON, 0, hy - 0.04, hz + 0.1, 0.14, Math.PI / 6, 0, 1, 1, 0.66);
  k.add(new THREE.CylinderGeometry(0.01, 0.018, 0.3, 4), GOLD, 0, hy - 0.04, hz + 0.215, 0.14, Math.PI / 4, 0);
  // Cheek guards sweeping back
  for (const s of [-1, 1]) put(k, xf(chunkGeo(0.08, 0.22, 0.24, 43 + s, { chamfer: 0.5, jitter: 0.02, top: 0.6 }), s * 0.16, hy - 0.05, hz + 0.02, 0.1, s * 0.35, s * 0.14), IRON_DK);
  // Frowning brow plates meeting in a V over the slit
  for (const s of [-1, 1]) put(k, xf(chunkGeo(0.18, 0.07, 0.1, 47 + s, { chamfer: 0.45, jitter: 0.02 }), s * 0.09, hy + 0.075, hz + 0.19, 0.2, s * 0.35, s * 0.3), IRON_DK);
  // The slit: black gap with magma burning inside
  for (const s of [-1, 1]) {
    k.add(new THREE.BoxGeometry(0.12, 0.03, 0.03), SHADOW, s * 0.068, hy + 0.025, hz + 0.205, 0, s * 0.35, s * 0.22);
    gb.add(new THREE.BoxGeometry(0.105, 0.018, 0.01), s * 0.068, hy + 0.025, hz + 0.224, 0, s * 0.35, s * 0.22);
  }
  // Serrated crest of obsidian running from the brow over the crown
  const crest = shapeFrom([
    [-0.24, 0],
    [-0.2, 0.08],
    [-0.13, 0.06],
    [-0.07, 0.2],
    [0.0, 0.12],
    [0.07, 0.3],
    [0.13, 0.14],
    [0.21, 0.22],
    [0.25, 0],
  ]);
  k.plate(crest, 0.045, 0, 0, hy + 0.11, hz - 0.03, ST_HI, 0, -Math.PI / 2, 0);
  // Two short horns of obsidian thrusting forward from the temples
  for (const s of [-1, 1]) k.curve([[s * 0.15, hy + 0.08, hz], [s * 0.26, hy + 0.14, hz + 0.02], [s * 0.3, hy + 0.24, hz + 0.12]], 0.04, 0.006, ST_HI, 5);
  // Jagged stone jaw jutting under the mask
  put(k, xf(chunkGeo(0.26, 0.1, 0.2, 49, { chamfer: 0.5, jitter: 0.08, top: 1.3 }), 0, hy - 0.2, hz + 0.05, 0.2, 0, 0), ST);
  gb.flush(glow, EYE, 5);
}

function armKit(k: K, gb: GlowBatch, glow: THREE.Object3D, s: number): void {
  const surf = new Surface();
  const top = new Surface();
  // Shoulder boulder bound by an iron band
  rock(k, 0.38, 60 + s, [s * 0.05, 0.06, 0], [1.15, 0.85, 1.05], ST, [0.3, 0.2 * s, 0], top);
  k.add(new THREE.TorusGeometry(0.4, 0.035, 4, 14, Math.PI * 1.1), IRON, s * 0.09, 0.02, 0, 0, Math.PI / 2, -0.2);
  k.add(new THREE.TorusGeometry(0.415, 0.01, 3, 14, Math.PI * 1.1), GOLD, s * 0.1, 0.02, 0, 0, Math.PI / 2, -0.2);
  // Forged iron shoulder plate on the outer face with a rune
  put(k, xf(chunkGeo(0.08, 0.32, 0.38, 62 + s, { chamfer: 0.5, jitter: 0.02, top: 0.7 }), s * 0.42, -0.02, 0.0, 0, 0, -s * 0.25), IRON);
  gb.add(segLine([[s * 0.475, 0.09, 0.04], [s * 0.485, -0.03, -0.02], [s * 0.475, -0.12, 0.05]], 0.011));
  gb.add(segLine([[s * 0.475, -0.02, -0.09], [s * 0.485, -0.04, 0.09]], 0.009));
  // Crown of obsidian crystals bursting up and outwards
  crystals(
    k,
    [s * 0.1, 0.22, -0.02],
    [
      [s * 0.12, 0.62, -0.06, 0.09],
      [s * 0.34, 0.42, 0.04, 0.075],
      [s * 0.02, 0.46, -0.26, 0.075],
      [s * 0.42, 0.2, -0.16, 0.06],
      [-s * 0.08, 0.34, 0.14, 0.055],
    ],
    [ST_HI, ST, ST_HI, ST, ST_DK],
  );
  // Upper arm
  rock(k, 0.24, 64 + s, [s * 0.02, -0.44, 0], [0.9, 1.35, 0.95], ST_DK, [0, 0, 0], surf);
  // Molten elbow under a stone cap
  addGlow(glow, new THREE.SphereGeometry(0.12, 8, 6), JOINT, s * 0.02, -0.72, 0.0, 1.8);
  rock(k, 0.17, 66 + s, [s * 0.03, -0.73, -0.08], [1, 1, 1], ST);
  // Massive forearm, wider towards the fist, in an ancient iron bracer with burning runes
  rock(k, 0.3, 68 + s, [s * 0.02, -1.02, 0.03], [0.92, 1.15, 0.95], ST, [0, 0.4, 0], surf);
  k.add(new THREE.CylinderGeometry(0.3, 0.32, 0.26, 8, 1), IRON, s * 0.02, -1.0, 0.03, 0, Math.PI / 8, 0);
  for (const y of [-0.875, -1.125]) k.add(new THREE.TorusGeometry(y > -1 ? 0.302 : 0.322, 0.014, 3, 8), GOLD, s * 0.02, y, 0.03, Math.PI / 2, 0, Math.PI / 8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.ball(0.02, s * 0.02 + Math.sin(a) * 0.315, -1.0, 0.03 + Math.cos(a) * 0.315, GOLD, 1, 1, 1, 5);
  }
  const rx = s * 0.02 + s * 0.31;
  gb.add(segLine([[rx, -0.92, 0.0], [rx + s * 0.01, -1.0, 0.1], [rx, -1.08, 0.0]], 0.012));
  gb.add(segLine([[rx, -1.0, -0.09], [rx + s * 0.01, -1.0, 0.1]], 0.009));
  const fz = 0.03 + 0.315;
  gb.add(segLine([[s * 0.02, -0.92, fz], [s * 0.02 + 0.06, -1.0, fz], [s * 0.02, -1.08, fz], [s * 0.02 - 0.06, -1.0, fz], [s * 0.02, -0.92, fz]], 0.011));
  // Molten wrist and a huge fist with obsidian knuckle spikes
  addGlow(glow, new THREE.SphereGeometry(0.15, 8, 6), JOINT, s * 0.02, -1.25, 0.04, 1.7);
  rock(k, 0.27, 70 + s, [s * 0.02, -1.42, 0.07], [1.0, 0.82, 1.05], ST_DK, [0, 0.3, 0]);
  for (let i = 0; i < 4; i++) rock(k, 0.085, 72 + i + s * 5, [s * 0.02 + (i - 1.5) * 0.11, -1.56, 0.27], [1, 0.85, 1], ST_HI, [0, 0, 0], undefined, 0.2, 0);
  for (let i = 0; i < 3; i++) put(k, spikeAB([s * 0.02 + (i - 1) * 0.12, -1.47, 0.28], [s * 0.02 + (i - 1) * 0.16, -1.52, 0.5], 0.042, 4), ST_HI);
  // Magma seams projected onto the outer face of the arm
  const c = cracks(`arm${s}`, surf, (sf) => [
    sf.project(jag2([0.05, -0.28], [-0.04, -0.62], 4, 0.06, 75 + s), s > 0 ? 'x' : '-x'),
    sf.project(jag2([-0.1, -1.2], [0.12, -1.3], 3, 0.05, 77 + s), s > 0 ? 'x' : '-x'),
    sf.project(jag2([0.1, -0.3], [0.14, -0.58], 3, 0.05, 79 + s), 'z'),
  ]);
  if (c) gb.add(c);
  // Seams across the top of the shoulder (seen from the battle camera above)
  const ct = cracks(`sh${s}`, top, (sf) => [sf.project(jag2([-s * 0.22, 0.24], [s * 0.34, -0.2], 5, 0.07, 91 + s), 'y'), sf.project(jag2([s * 0.1, 0.0], [s * 0.05, -0.36], 3, 0.06, 93 + s), 'y')]);
  if (ct) gb.add(ct);
}

function legKit(k: K, gb: GlowBatch, glow: THREE.Object3D, s: number): void {
  const surf = new Surface();
  rock(k, 0.25, 80 + s, [0, -0.25, 0], [0.95, 1.05, 1.0], ST_DK, [0, 0, 0], surf);
  addGlow(glow, new THREE.SphereGeometry(0.09, 8, 6), JOINT, 0, -0.52, 0.04, 1.6);
  rock(k, 0.13, 81 + s, [0, -0.53, -0.1], [1.1, 1, 1], ST_DK, [0, 0, 0], undefined, 0.2, 0);
  // Forged knee plate with a spike
  k.add(new THREE.SphereGeometry(0.16, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), IRON, 0, -0.52, 0.12, Math.PI / 2 - 0.15, 0, 0, 1, 1, 0.7);
  k.add(new THREE.TorusGeometry(0.16, 0.012, 3, 12), GOLD, 0, -0.52, 0.13, -0.15, 0, 0);
  put(k, spikeAB([0, -0.5, 0.22], [s * 0.03, -0.43, 0.4], 0.045, 4), ST_HI);
  rock(k, 0.23, 82 + s, [0, -0.74, 0.0], [0.95, 1.0, 1.0], ST, [0, 0.5, 0], surf);
  // Iron greave band
  k.add(new THREE.CylinderGeometry(0.235, 0.245, 0.11, 8, 1), IRON_DK, 0, -0.7, 0.0, 0, Math.PI / 8, 0);
  // Broad foot with stone toes
  put(k, xf(chunkGeo(0.48, 0.2, 0.62, 84 + s, { top: 0.82, chamfer: 0.55, jitter: 0.05 }), 0, -0.91, 0.08), ST_DK);
  for (let i = 0; i < 3; i++) rock(k, 0.09, 86 + i + s * 4, [(i - 1) * 0.15, -0.95, 0.38], [1, 0.7, 1.2], ST, [0, 0, 0], undefined, 0.22, 0);
  const c = cracks(`leg${s}`, surf, (sf) => [sf.project(jag2([s * 0.12, -0.12], [s * 0.04, -0.4], 4, 0.05, 88 + s), 'z'), sf.project(jag2([s * 0.1, -0.62], [s * 0.14, -0.86], 3, 0.04, 90 + s), 'z')]);
  if (c) gb.add(c);
}

function build(): Rig {
  const rig = newRig('biped', 'melee');
  rig.presence = 1.6;
  const frame = pivot(rig.body, 0, 0, 0);
  frame.scale.setScalar(SIZE);
  const k = new K();
  const gb = new GlowBatch();
  const surf = new Surface();
  const back = new Surface();

  // Molten core glimpsed between the stone (waist and the chest seam)
  addGlow(frame, new THREE.SphereGeometry(0.34, 12, 8), CORE, 0, 1.38, 0.0, 1.0).scale.set(1.0, 0.75, 0.75);
  addGlow(frame, new THREE.BoxGeometry(0.14, 0.5, 0.3), CORE, 0, 1.9, 0.24, 1.2);

  // Pelvis and segmented abdomen (gaps show the core)
  rock(k, 0.44, 1, [0, 1.06, 0], [1.0, 0.55, 0.72], ST_DK);
  for (let i = 0; i < 2; i++) rock(k, 0.32 - i * 0.02, 2 + i, [0, 1.27 + i * 0.17, 0.04 + i * 0.03], [1.1 + i * 0.12, 0.42, 0.78], i ? ST : ST_DK, [0.1, 0, 0], surf);

  // Huge chest boulder with two glossy pectoral masses split by the molten seam
  rock(k, 0.62, 9, [0, 1.86, -0.04], [1.22, 0.74, 0.78], ST_DK, [0, 0, 0], back);
  for (const s of [-1, 1]) rock(k, 0.4, 10 + s, [s * 0.37, 1.9, 0.2], [0.92, 0.78, 0.64], ST, [-0.1, s * 0.25, -s * 0.1], surf, 0.12);
  // Collar-bone slabs bridging to the shoulders
  for (const s of [-1, 1]) put(k, xf(chunkGeo(0.5, 0.16, 0.42, 12 + s, { chamfer: 0.5, jitter: 0.07 }), s * 0.48, 2.2, 0.0, 0, 0, -s * 0.28), ST);
  // Hunched back: a ridge of fractured stone climbing behind the head
  rock(k, 0.55, 30, [0, 2.06, -0.3], [1.1, 0.72, 0.72], ST_DK, [-0.3, 0, 0], back);
  rock(k, 0.4, 31, [0, 1.56, -0.26], [1.15, 0.7, 0.75], ST, [0.15, 0, 0], back);
  // Obsidian spires bursting from the back
  crystals(
    k,
    [0, 2.2, -0.38],
    [
      [-0.3, 0.52, -0.28, 0.095],
      [0.32, 0.58, -0.24, 0.105],
      [0.02, 0.66, -0.42, 0.1],
      [-0.52, 0.26, -0.3, 0.075],
      [0.54, 0.3, -0.26, 0.075],
      [0.14, 0.3, -0.56, 0.065],
    ],
    [ST_HI, ST, ST_HI, ST, ST_DK, ST],
  );

  // High forged collar wrapping the back and sides of the sunken head
  k.add(new THREE.TorusGeometry(0.33, 0.075, 5, 12, Math.PI * 1.25), IRON, 0, 2.24, 0.2, Math.PI / 2 + 0.35, 0, Math.PI * 0.875);
  k.add(new THREE.TorusGeometry(0.35, 0.014, 3, 12, Math.PI * 1.25), GOLD, 0, 2.29, 0.19, Math.PI / 2 + 0.35, 0, Math.PI * 0.875);
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * 0.1 + (i / 4) * Math.PI * 0.8;
    put(k, spikeAB([Math.cos(a) * 0.31, 2.3, 0.15 - Math.sin(a) * 0.31], [Math.cos(a) * 0.44, 2.56 - Math.abs(i - 2) * 0.05, 0.1 - Math.sin(a) * 0.46], 0.04, 4), IRON_DK);
  }

  // Furnace sigil in the chest seam: an iron ring holding a burning rune
  const sy = 1.9;
  const sz = 0.5;
  k.add(new THREE.TorusGeometry(0.13, 0.03, 5, 14), IRON, 0, sy, sz, 0.06, 0, 0);
  k.add(new THREE.TorusGeometry(0.162, 0.011, 3, 14), GOLD, 0, sy, sz - 0.005, 0.06, 0, 0);
  k.add(new THREE.CircleGeometry(0.12, 12), SHADOW, 0, sy, sz - 0.015, 0.06, 0, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.ball(0.022, Math.cos(a) * 0.13, sy + Math.sin(a) * 0.13, sz + 0.02, GOLD, 1, 1, 1, 5);
  }
  const z0 = sz + 0.005;
  gb.add(segLine([[0, sy + 0.1, z0], [0.06, sy, z0], [0, sy - 0.1, z0], [-0.06, sy, z0], [0, sy + 0.1, z0]], 0.011));
  gb.add(segLine([[0, sy + 0.13, z0], [0, sy - 0.13, z0]], 0.009));
  addGlow(frame, new THREE.OctahedronGeometry(0.035, 0), EYE, 0, sy, z0 + 0.005, 5);
  // Iron belt and hanging plates over the hips
  k.add(new THREE.CylinderGeometry(0.46, 0.46, 0.07, 10, 1), IRON, 0, 1.12, 0.0, 0, 0, 0, 1, 1, 0.7);
  for (const s of [-1, 0, 1]) put(k, xf(chunkGeo(0.22, 0.26, 0.05, 40 + s, { chamfer: 0.4, jitter: 0.02, top: 1.2 }), s * 0.27, 0.94, 0.3 - Math.abs(s) * 0.04, 0.1, s * 0.3, 0), IRON_DK);

  // Magma cracks projected onto the chest, belly and back
  const c = cracks('torso', surf, (sf) => [
    sf.project(jag2([-0.06, 2.12], [-0.3, 1.86], 3, 0.06, 21), 'z', 0.008, 2),
    sf.project(jag2([-0.3, 1.86], [-0.6, 1.62], 3, 0.06, 22), 'z', 0.008, 2),
    sf.project(jag2([-0.3, 1.86], [-0.2, 1.6], 2, 0.05, 26), 'z', 0.008, 2),
    sf.project(jag2([0.5, 2.1], [0.36, 1.92], 2, 0.05, 23), 'z', 0.008, 2),
    sf.project(jag2([0.12, 1.36], [0.2, 1.18], 2, 0.04, 25), 'z', 0.008, 2),
  ]);
  if (c) gb.add(c);
  const cb = cracks('back', back, (sf) => [sf.project(jag2([0.45, 1.75], [-0.42, 2.14], 6, 0.07, 33), '-z'), sf.project(jag2([-0.1, 1.95], [0.22, 1.5], 4, 0.06, 34), '-z'), sf.project(jag2([-0.55, -0.18], [0.5, -0.42], 6, 0.08, 35), 'y'), sf.project(jag2([0.05, -0.3], [-0.12, -0.75], 3, 0.06, 36), 'y')]);
  if (cb) gb.add(cb);

  // Head sunk low and forward between the shoulders
  const neck = pivot(frame, 0, 2.04, 0.3);
  rig.neck = neck;
  const headGroup = pivot(neck, 0, 0, 0);
  headGroup.scale.setScalar(1.32);
  rig.head = headGroup;
  const hk = new K();
  head(hk, headGroup);
  addMesh(rig, headGroup, hk);

  // Arms: long and heavy, fists hanging near the knees
  for (const s of [1, -1]) {
    const ap = pivot(frame, s * 0.9, 2.1, 0.04);
    const ak = new K();
    const ag = new GlowBatch();
    armKit(ak, ag, ap, s);
    if (s === -1) {
      // A broken chain still hanging from the left bracer
      for (let i = 0; i < 4; i++) ak.add(new THREE.TorusGeometry(0.045, 0.012, 3, 6), IRON_DK, -0.34, -1.12 - i * 0.075, 0.03, 0, i % 2 ? Math.PI / 2 : 0, 0);
    }
    addMesh(rig, ap, ak);
    ag.flush(ap, MAGMA, 3.2);
    if (s === 1) rig.armR = ap;
    else rig.armL = ap;
  }

  // Legs: short, thick pillars
  for (const s of [-1, 1]) {
    const lp = pivot(frame, s * 0.37, 1.0, 0);
    const lk = new K();
    const lg = new GlowBatch();
    legKit(lk, lg, lp, s);
    addMesh(rig, lp, lk);
    lg.flush(lp, MAGMA, 3.2);
    rig.legs.push(lp);
  }

  addMesh(rig, frame, k);
  gb.flush(frame, MAGMA, 3.2);
  rig.height = 2.86 * SIZE;
  return rig;
}

export const obsidianColossus: UnitDef = {
  build,
  portrait: {
    faction: 'ash',
    from: 0.28,
    to: 1.04,
    yaw: 0.4,
    pose: (rig) => {
      rig.armR?.rotation.set(-0.75, 0, 0.3);
      rig.armL?.rotation.set(-0.3, 0, -0.32);
      rig.legs.forEach((l, i) => (l.rotation.x = i === 0 ? 0.2 : -0.18));
      rig.body.rotation.x = 0.08;
      rig.neck?.rotation.set(0.12, -0.12, 0);
    },
  },
};
