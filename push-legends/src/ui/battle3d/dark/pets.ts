import * as THREE from 'three';
import { PAL } from '../../art/darkArt';
import { K, shapeFrom } from '../../base3d/sculpt';
import { addMesh, newRig, pivot, type Rig } from '../rig';
import { GlowBatch, lumpGeo, put, SHADOW, xf } from './units/_creatures';

/**
 * Pets in the dark style: small companions that read at a glance by silhouette and one glowing
 * accent that matches what they do (ember, rune, flame, moonlight, frost). The same models stand in
 * the sanctuary, follow the hero in battle and are baked for the pet art. They face +z; the root
 * sits on the ground. `height` is about half a soldier, so they stay companions, not troops.
 */

export const PET_GLOW: Record<string, string> = {
  ember_fox: '#ff7a24',
  pebble_golem: '#5fc8ff',
  sparkwing: '#ffb040',
  moonmoth: '#c9a2ff',
  frostpup: '#8fe6ff',
};

const EYE_DARK = '#1a1216';

/** Four legs on pivots at the hips (so the battle walk cycle swings them). */
function legs(rig: Rig, body: THREE.Object3D, hex: string, paw: string, pts: { x: number; z: number }[], hip: number, len: number, r: number): void {
  for (const p of pts) {
    const lp = pivot(body, p.x, hip, p.z);
    const k = new K();
    k.pill(r, len - r * 2, 0, -len / 2, 0, hex);
    k.ball(r * 1.25, 0, -len + r * 0.6, r * 0.5, paw, 1, 0.6, 1.4);
    addMesh(rig, lp, k);
    rig.legs.push(lp);
  }
}

/** A pointed ear: an outer triangle and a glowing (or pale) inner one. */
function ear(k: K, x: number, y: number, z: number, side: number, hex: string, inner: string, gb: GlowBatch | null, h = 0.2): void {
  k.plate(shapeFrom([[-0.07, 0], [0.07, 0], [0.012, h]]), 0.035, 0.012, x, y, z, hex, -0.15, 0, -side * 0.28);
  const g = new THREE.ShapeGeometry(shapeFrom([[-0.04, 0.02], [0.04, 0.02], [0.008, h * 0.72]]));
  if (gb) gb.add(g, x, y, z + 0.024, -0.15, 0, -side * 0.28);
  else k.plate(shapeFrom([[-0.04, 0.02], [0.04, 0.02], [0.008, h * 0.72]]), 0.005, 0, x, y, z + 0.022, inner, -0.15, 0, -side * 0.28);
}

/** Glowing eyes (with a dark socket so they read from far away). */
function eyes(k: K, gb: GlowBatch, x: number, y: number, z: number, r: number): void {
  for (const s of [-1, 1]) {
    k.ball(r * 1.35, s * x, y, z - r * 0.3, EYE_DARK, 1, 0.8, 0.6);
    gb.add(new THREE.SphereGeometry(r, 8, 6), s * x, y, z, 0, 0, 0, 1, 0.75, 0.6);
  }
}

// --- Ember Fox -----------------------------------------------------------------------------------

function emberFox(): Rig {
  const rig = newRig('quad', 'melee');
  const glow = PET_GLOW.ember_fox!;
  const FUR = '#8a3a1a';
  const FUR_DK = '#2a1610';
  const CHEST = '#c9b8a6';
  const k = new K();
  const gb = new GlowBatch();
  // Lean body, deep chest
  k.pill(0.17, 0.36, 0, 0.42, -0.02, FUR, Math.PI / 2);
  k.ball(0.15, 0, 0.4, 0.16, CHEST, 0.9, 1, 0.9);
  // Charred back stripe and cinder flecks
  k.ball(0.12, 0, 0.55, -0.05, FUR_DK, 0.9, 0.35, 1.9);
  for (let i = 0; i < 5; i++) gb.add(new THREE.SphereGeometry(0.018, 5, 4), (i % 2 ? 1 : -1) * 0.1, 0.5 + (i % 3) * 0.03, -0.18 + i * 0.07);
  legs(rig, rig.body, FUR_DK, '#140c0a', [{ x: -0.09, z: 0.17 }, { x: 0.09, z: 0.17 }, { x: -0.09, z: -0.2 }, { x: 0.09, z: -0.2 }], 0.36, 0.34, 0.045);
  // Head on a neck pivot
  const neck = pivot(rig.body, 0, 0.56, 0.24);
  rig.neck = neck;
  const hk = new K();
  hk.ball(0.15, 0, 0.06, 0.04, FUR);
  hk.ball(0.12, 0, 0.0, 0.1, CHEST, 1.05, 0.7, 0.9);
  // Long narrow muzzle
  hk.lathe([[0.075, 0], [0.055, 0.1], [0.02, 0.19], [0.001, 0.2]], 0, 0.02, 0.15, FUR, 10, 1, 0.85, Math.PI / 2);
  hk.ball(0.028, 0, 0.03, 0.35, SHADOW);
  const hg = new GlowBatch();
  eyes(hk, hg, 0.065, 0.1, 0.15, 0.022);
  for (const s of [-1, 1]) ear(hk, s * 0.085, 0.16, 0.0, s, FUR_DK, glow, hg, 0.22);
  // Cheek ruff
  for (const s of [-1, 1]) hk.spike(0.05, 0.12, s * 0.14, -0.02, 0.02, CHEST, 0, 0, s * 1.9, 5);
  addMesh(rig, neck, hk);
  hg.flush(neck, glow, 2.2);
  // Huge brush tail that burns at the tip
  const tail = pivot(rig.body, 0, 0.5, -0.26);
  const tk = new K();
  tk.curve([[0, 0, 0], [0, 0.12, -0.2], [0, 0.32, -0.34], [0, 0.52, -0.3]], 0.07, 0.11, FUR, 8);
  tk.ball(0.12, 0, 0.55, -0.28, FUR_DK, 1, 1.1, 1);
  const tg = new GlowBatch();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    tg.add(new THREE.ConeGeometry(0.045, 0.2, 5), Math.cos(a) * 0.06, 0.68, -0.28 + Math.sin(a) * 0.06, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
  }
  tg.add(new THREE.SphereGeometry(0.08, 8, 6), 0, 0.6, -0.28);
  addMesh(rig, tail, tk);
  tg.flush(tail, glow, 2.7);
  rig.cape = tail;
  addMesh(rig, rig.body, k);
  gb.flush(rig.body, glow, 1.8);
  rig.height = 0.95;
  return rig;
}

// --- Pebble (stone golem) ------------------------------------------------------------------------

function pebbleGolem(): Rig {
  const rig = newRig('biped', 'melee');
  const glow = PET_GLOW.pebble_golem!;
  const STONE = '#5e6168';
  const STONE_DK = '#383a40';
  const MOSS = '#3f5a2c';
  const k = new K();
  const gb = new GlowBatch();
  // Boulder body, slightly hunched, with a glowing rune crack across the chest
  put(k, xf(lumpGeo(0.3, 11, 0.16, 1), 0, 0.5, 0, 0, 0, 0, 1.05, 0.95, 0.9), STONE);
  put(k, xf(lumpGeo(0.17, 12, 0.2, 1), 0.12, 0.72, -0.12), STONE_DK);
  put(k, xf(lumpGeo(0.15, 13, 0.2, 1), -0.15, 0.7, -0.08), STONE_DK);
  gb.add(new THREE.BoxGeometry(0.03, 0.2, 0.02), 0, 0.5, 0.27, 0, 0, 0.35);
  gb.add(new THREE.BoxGeometry(0.025, 0.12, 0.02), 0.05, 0.42, 0.27, 0, 0, -0.6);
  gb.add(new THREE.OctahedronGeometry(0.05, 0), 0, 0.6, 0.27);
  // Moss on the shoulders and a sprouting fern
  k.ball(0.11, -0.2, 0.75, 0.0, MOSS, 1.3, 0.35, 1.1);
  k.ball(0.08, 0.18, 0.8, 0.02, MOSS, 1.3, 0.3, 1);
  k.curve([[-0.18, 0.78, 0], [-0.22, 0.92, 0.02], [-0.18, 1.02, 0.06]], 0.012, 0.004, '#5d7f3a', 4);
  k.ball(0.035, -0.18, 1.02, 0.07, '#6f9445', 1.4, 0.6, 1);
  // Head: a smaller stone sunk between the shoulders, two rune eyes
  const neck = pivot(rig.body, 0, 0.78, 0.08);
  rig.neck = neck;
  const hk = new K();
  put(hk, xf(lumpGeo(0.15, 14, 0.14, 1), 0, 0.06, 0.02, 0, 0, 0, 1.1, 0.85, 1), STONE);
  hk.rbox(0.26, 0.04, 0.12, 0.01, 0, 0.13, 0.04, STONE_DK);
  const hg = new GlowBatch();
  eyes(hk, hg, 0.06, 0.06, 0.15, 0.025);
  addMesh(rig, neck, hk);
  hg.flush(neck, glow, 2.2);
  // Stubby stone legs and big fists
  for (const s of [-1, 1]) {
    const lp = pivot(rig.body, s * 0.13, 0.26, 0);
    const lk = new K();
    put(lk, xf(lumpGeo(0.1, 20 + s, 0.15, 1), 0, -0.13, 0.02, 0, 0, 0, 1, 1.2, 1.1), STONE_DK);
    addMesh(rig, lp, lk);
    rig.legs.push(lp);
    const ap = pivot(rig.body, s * 0.3, 0.62, 0.02);
    const ak = new K();
    put(ak, xf(lumpGeo(0.08, 30 + s, 0.15, 1), 0, -0.1, 0), STONE);
    put(ak, xf(lumpGeo(0.12, 40 + s, 0.16, 1), 0, -0.3, 0.03), STONE_DK);
    const ag = new GlowBatch();
    ag.add(new THREE.BoxGeometry(0.02, 0.1, 0.02), s * 0.05, -0.3, 0.13);
    addMesh(rig, ap, ak);
    ag.flush(ap, glow, 1.8);
    if (s > 0) rig.armR = ap;
    else rig.armL = ap;
  }
  addMesh(rig, rig.body, k);
  gb.flush(rig.body, glow, 2.2);
  rig.height = 1.05;
  return rig;
}

// --- Sparkwing (baby dragon) ---------------------------------------------------------------------

function sparkwing(): Rig {
  const rig = newRig('quad', 'cast');
  const glow = PET_GLOW.sparkwing!;
  const SCALE = '#5a1418';
  const SCALE_DK = '#2a0a0d';
  const BELLY = '#b9883f';
  const HORN = PAL.bone;
  const k = new K();
  const gb = new GlowBatch();
  k.pill(0.15, 0.26, 0, 0.4, -0.02, SCALE, Math.PI / 2);
  // Ribbed belly that glows from the fire inside
  for (let i = 0; i < 4; i++) k.ball(0.1, 0, 0.32, 0.1 - i * 0.08, BELLY, 1, 0.55, 0.45);
  gb.add(new THREE.SphereGeometry(0.05, 8, 6), 0, 0.3, 0.12, 0, 0, 0, 1, 0.6, 0.6);
  // Spine ridge
  for (let i = 0; i < 6; i++) k.spike(0.03, 0.08 - i * 0.006, 0, 0.56 - i * 0.012, 0.12 - i * 0.07, SCALE_DK, -0.4, 0, 0, 4);
  legs(rig, rig.body, SCALE, SCALE_DK, [{ x: -0.1, z: 0.13 }, { x: 0.1, z: 0.13 }, { x: -0.1, z: -0.15 }, { x: 0.1, z: -0.15 }], 0.33, 0.3, 0.045);
  // Head with swept horns and a glowing mouth
  const neck = pivot(rig.body, 0, 0.55, 0.2);
  rig.neck = neck;
  const hk = new K();
  hk.curve([[0, -0.05, -0.04], [0, 0.04, 0.04], [0, 0.1, 0.08]], 0.075, 0.08, SCALE, 8);
  hk.ball(0.13, 0, 0.13, 0.12, SCALE);
  hk.lathe([[0.08, 0], [0.065, 0.1], [0.035, 0.16], [0.001, 0.17]], 0, 0.1, 0.18, SCALE, 10, 1.1, 0.8, Math.PI / 2);
  for (const s of [-1, 1]) {
    hk.curve([[s * 0.07, 0.2, 0.07], [s * 0.1, 0.3, 0.0], [s * 0.12, 0.34, -0.12]], 0.025, 0.004, HORN, 6);
    hk.spike(0.02, 0.06, s * 0.12, 0.1, 0.06, SCALE_DK, 0, 0, s * 1.5, 4);
  }
  const hg = new GlowBatch();
  eyes(hk, hg, 0.07, 0.17, 0.2, 0.022);
  hg.add(new THREE.BoxGeometry(0.1, 0.012, 0.12), 0, 0.07, 0.27);
  addMesh(rig, neck, hk);
  hg.flush(neck, glow, 2.7);
  // Bat wings: bony fingers with a dark membrane
  for (const s of [-1, 1]) {
    const wp = pivot(rig.body, s * 0.11, 0.55, 0.06);
    const wk = new K();
    const span = 0.5;
    wk.curve([[0, 0, 0], [s * span * 0.45, 0.16, -0.02], [s * span, 0.2, -0.12]], 0.022, 0.01, SCALE_DK, 5);
    wk.plate(shapeFrom([[0, 0], [span * 0.45, 0.16], [span, 0.2], [span * 0.78, -0.02], [span * 0.5, -0.06], [span * 0.25, -0.12], [0.02, -0.12]]), 0.008, 0, 0, 0, -0.04, '#3a0e12', 0, s > 0 ? 0 : Math.PI, 0);
    addMesh(rig, wp, wk);
    wp.rotation.z = s * 0.25;
    rig.wings.push(wp);
  }
  // Tail with a flame-tipped barb
  const tail = pivot(rig.body, 0, 0.42, -0.2);
  const tk = new K();
  tk.curve([[0, 0, 0], [0, -0.06, -0.2], [0, 0.0, -0.38], [0, 0.1, -0.48]], 0.06, 0.015, SCALE, 7);
  tk.spike(0.04, 0.09, 0, 0.12, -0.5, HORN, -0.8, 0, 0, 4);
  addMesh(rig, tail, tk);
  rig.cape = tail;
  addMesh(rig, rig.body, k);
  gb.flush(rig.body, glow, 2.2);
  rig.height = 0.95;
  return rig;
}

// --- Moonmoth ------------------------------------------------------------------------------------

function moonmoth(): Rig {
  const rig = newRig('float', 'cast');
  const glow = PET_GLOW.moonmoth!;
  const FUZZ = '#d8cfc0';
  const FUZZ_DK = '#5b4a5e';
  const WING = '#3b2f4a';
  const WING_EDGE = '#b8a9c9';
  const k = new K();
  const gb = new GlowBatch();
  // Hovering: the body floats above the ground
  k.ball(0.12, 0, 0.72, 0.03, FUZZ, 1, 1.05, 1);
  k.pill(0.09, 0.22, 0, 0.6, -0.14, FUZZ_DK, Math.PI / 2 + 0.5);
  for (let i = 0; i < 3; i++) k.ring(0.085 - i * 0.012, 0.012, 0, 0.62 - i * 0.05, -0.12 - i * 0.07, FUZZ, Math.PI / 2 + 0.5);
  // Fluffy collar
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.spike(0.035, 0.08, Math.cos(a) * 0.1, 0.66, 0.05 + Math.sin(a) * 0.06, FUZZ, Math.PI / 2, 0, -Math.cos(a) * 1.2, 4);
  }
  const neck = pivot(rig.body, 0, 0.78, 0.08);
  rig.neck = neck;
  const hk = new K();
  hk.ball(0.08, 0, 0.02, 0.02, FUZZ);
  const hg = new GlowBatch();
  eyes(hk, hg, 0.05, 0.04, 0.08, 0.03);
  // Feathery antennae
  for (const s of [-1, 1]) {
    hk.curve([[s * 0.03, 0.08, 0.05], [s * 0.1, 0.2, 0.08], [s * 0.18, 0.26, 0.02]], 0.008, 0.004, FUZZ_DK, 4);
    for (let i = 0; i < 5; i++) hk.spike(0.008, 0.05, s * (0.06 + i * 0.025), 0.15 + i * 0.022, 0.07, FUZZ, 0.4, 0, s * 0.8, 3);
  }
  addMesh(rig, neck, hk);
  hg.flush(neck, glow, 2.7);
  // Four broad wings with glowing moon-spots
  for (const s of [-1, 1]) {
    const wp = pivot(rig.body, s * 0.06, 0.72, 0.0);
    const wk = new K();
    const wg = new GlowBatch();
    const up = [[0, 0], [0.18, 0.2], [0.42, 0.3], [0.52, 0.18], [0.46, 0.02], [0.22, -0.04]] as [number, number][];
    const lo = [[0, -0.02], [0.2, -0.06], [0.34, -0.2], [0.26, -0.32], [0.1, -0.22]] as [number, number][];
    wk.plate(shapeFrom(up), 0.008, 0, 0, 0, 0, WING, 0, s > 0 ? 0 : Math.PI, 0);
    wk.plate(shapeFrom(lo), 0.008, 0, 0, 0, -0.01, WING, 0, s > 0 ? 0 : Math.PI, 0);
    // Pale edges
    wk.curve([[0, 0, 0.006], [s * 0.18, 0.2, 0.006], [s * 0.42, 0.3, 0.006], [s * 0.52, 0.18, 0.006], [s * 0.46, 0.02, 0.006]], 0.012, 0.012, WING_EDGE, 4);
    wg.add(new THREE.CircleGeometry(0.06, 14), s * 0.33, 0.15, 0.007);
    wg.add(new THREE.CircleGeometry(0.035, 12), s * 0.2, -0.16, 0.007);
    addMesh(rig, wp, wk);
    wg.flush(wp, glow, 1.8);
    wp.rotation.y = -s * 0.35;
    rig.wings.push(wp);
  }
  // A faint glow under it, like moonlight dust
  gb.add(new THREE.SphereGeometry(0.03, 6, 5), 0.05, 0.42, 0.05);
  gb.add(new THREE.SphereGeometry(0.02, 6, 5), -0.07, 0.34, -0.04);
  gb.add(new THREE.SphereGeometry(0.018, 6, 5), 0.02, 0.24, 0.02);
  addMesh(rig, rig.body, k);
  gb.flush(rig.body, glow, 1.8);
  rig.spinners.push(rig.body);
  rig.height = 1.05;
  return rig;
}

// --- Frostpup ------------------------------------------------------------------------------------

function frostpup(): Rig {
  const rig = newRig('quad', 'cast');
  const glow = PET_GLOW.frostpup!;
  const FUR = '#8a98a6';
  const FUR_DK = '#3d4752';
  const FUR_LT = '#b9c6d2';
  const ICE = '#a8e8ff';
  const k = new K();
  const gb = new GlowBatch();
  // Chunky pup: round chest, big paws, thick ruff
  k.pill(0.17, 0.26, 0, 0.38, -0.03, FUR, Math.PI / 2);
  k.ball(0.17, 0, 0.4, 0.13, FUR_LT, 1, 1, 0.9);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI;
    k.spike(0.05, 0.12, Math.cos(a) * 0.15, 0.5 + Math.sin(a) * 0.03, 0.16, FUR_LT, 0.9, 0, -Math.cos(a) * 1.1, 4);
  }
  // Ice crystals growing out of the back
  for (let i = 0; i < 5; i++) {
    const z = 0.08 - i * 0.08;
    const h = 0.16 - Math.abs(i - 1.5) * 0.03;
    k.gem(0.035, (i % 2 ? 0.04 : -0.04), 0.56 + h * 0.3, z, ICE, h / 0.07);
    gb.add(new THREE.OctahedronGeometry(0.018, 0), (i % 2 ? 0.04 : -0.04), 0.58 + h * 0.4, z, 0, 0, 0, 1, 2.2, 1);
  }
  legs(rig, rig.body, FUR, FUR_LT, [{ x: -0.1, z: 0.14 }, { x: 0.1, z: 0.14 }, { x: -0.1, z: -0.17 }, { x: 0.1, z: -0.17 }], 0.32, 0.3, 0.06);
  const neck = pivot(rig.body, 0, 0.55, 0.22);
  rig.neck = neck;
  const hk = new K();
  hk.ball(0.16, 0, 0.06, 0.02, FUR);
  hk.ball(0.12, 0, 0.0, 0.1, FUR_LT, 1.05, 0.75, 0.9);
  hk.lathe([[0.075, 0], [0.06, 0.07], [0.03, 0.12], [0.001, 0.13]], 0, 0.0, 0.16, FUR_LT, 10, 1, 0.85, Math.PI / 2);
  hk.ball(0.03, 0, 0.02, 0.29, SHADOW);
  // Dark mask around the eyes like a husky
  hk.ball(0.1, 0, 0.11, 0.06, FUR_DK, 1.4, 0.5, 1);
  const hg = new GlowBatch();
  eyes(hk, hg, 0.065, 0.1, 0.15, 0.026);
  for (const s of [-1, 1]) ear(hk, s * 0.1, 0.15, 0.0, s, FUR_DK, FUR_LT, null, 0.18);
  // Frosty breath
  hg.add(new THREE.SphereGeometry(0.025, 6, 5), 0, 0.0, 0.34);
  addMesh(rig, neck, hk);
  hg.flush(neck, glow, 2.2);
  const tail = pivot(rig.body, 0, 0.48, -0.2);
  const tk = new K();
  tk.curve([[0, 0, 0], [0, 0.12, -0.08], [0, 0.22, -0.02], [0, 0.24, 0.06]], 0.06, 0.04, FUR_LT, 7);
  addMesh(rig, tail, tk);
  rig.cape = tail;
  addMesh(rig, rig.body, k);
  gb.flush(rig.body, glow, 1.8);
  rig.height = 0.9;
  return rig;
}

const BUILDERS: Record<string, () => Rig> = { ember_fox: emberFox, pebble_golem: pebbleGolem, sparkwing, moonmoth, frostpup };

/** The pet's 3D model (falls back to the fox for an unknown id). */
export function buildPet(petId: string): Rig {
  const rig = (BUILDERS[petId] ?? emberFox)();
  rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });
  return rig;
}
