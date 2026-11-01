import * as THREE from 'three';
import { K, type V } from '../../../base3d/sculpt';
import { addGlow, addMesh, newRig, pivot, type Rig } from '../../rig';
import { flat, GlowBatch, lumpGeo, put, ragLite, rnd, spikeAB, Spine, table, tube, xf } from './_creatures';
import type { Palette } from './enemies';

/**
 * Shared toolkit for the world bosses and mini-bosses (bossesA / bossesB): colour helpers that
 * turn a world palette into one vivid accent glow and near-black tinted materials, lofted limbs,
 * claws, horns, thorn and crystal clusters, torn cloth and a small scaffold for the rig.
 *
 * Bosses are modelled at their final size (feet at y = 0, facing +z, about 3–4 units tall); the
 * battle view scales them itself.
 */

export { GlowBatch, put, spikeAB, Spine, table, tube, xf, lumpGeo, ragLite, flat, rnd };

const HSL = { h: 0, s: 0, l: 0 };
const hsl = (hex: string): { h: number; s: number; l: number } => {
  new THREE.Color(hex).getHSL(HSL, THREE.SRGBColorSpace);
  return { ...HSL };
};
const fromHsl = (h: number, s: number, l: number): string => '#' + new THREE.Color().setHSL(h, s, l, THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace);

/**
 * The boss's single accent glow: the most saturated colour of the world palette pushed to a vivid,
 * bright tone (pale or grey palettes fall back to `fallback`).
 */
export function accentGlow(p: Palette, fallback: string, light = 0.58, prefer?: keyof Palette): string {
  const keys: (keyof Palette)[] = prefer ? [prefer] : ['accent', 'secondary', 'primary'];
  let best: { h: number; s: number; l: number } | null = null;
  let score = 0.12;
  for (const key of keys) {
    const c = hsl(p[key]);
    const sc = c.s * (1 - Math.abs(c.l - 0.5) * 1.1);
    if (sc > score) {
      score = sc;
      best = c;
    }
  }
  if (!best) {
    if (prefer) return accentGlow(p, fallback, light);
    return fallback;
  }
  return fromHsl(best.h, Math.max(0.88, best.s), light);
}

/** Near-black colour carrying the hue of `hex` (s saturation, l lightness, both 0..1). */
export function dusk(hex: string, l = 0.1, s = 0.3): string {
  return fromHsl(hsl(hex).h, s, l);
}

/** Same hue, other saturation/lightness. */
export function retone(hex: string, l: number, s?: number): string {
  const c = hsl(hex);
  return fromHsl(c.h, s ?? c.s, l);
}

// --- Geometry ---------------------------------------------------------------------------------------

/** A lofted limb or body along a smooth spine; rows are [u, half-width, half-height]. Returns the spine. */
export function loft(k: K, pts: V[], rows: [number, number, number][], hex: string, o: { radial?: number; steps?: number; noise?: number; seed?: number; keel?: number } = {}): Spine {
  const sp = new Spine(pts, (u) => table(u, rows), 32);
  put(k, sp.geo({ radial: o.radial ?? 10, steps: o.steps ?? 10, noise: o.noise ?? 0, seed: o.seed ?? 1, keel: o.keel ?? 0 }), hex);
  return sp;
}

const v3 = (p: V | THREE.Vector3): THREE.Vector3 => (p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(...p));

/** A curved, hooked claw or talon from `a` along `dir`, bending towards `bend`. */
export function claw(k: K, a: V | THREE.Vector3, dir: V, len: number, r: number, hex: string, bend: V = [0, -1, 0], hook = 0.35): void {
  const A = v3(a);
  const d = new THREE.Vector3(...dir).normalize();
  const b = new THREE.Vector3(...bend).normalize();
  const p1 = A.clone().addScaledVector(d, len * 0.4).addScaledVector(b, len * hook * 0.15);
  const p2 = A.clone().addScaledVector(d, len * 0.75).addScaledVector(b, len * hook * 0.45);
  const p3 = A.clone().addScaledVector(d, len).addScaledVector(b, len * hook);
  tube(k, [A, p1, p2, p3], r, 0.003, hex, 5, 6);
}

/** Horn along a curve of points (base first), ridged by a second thinner tube. */
export function horn(k: K, pts: V[], r: number, hex: string, ridge?: string): void {
  tube(k, pts, r, 0.004, hex, 7, 10);
  if (ridge) {
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i]!;
      k.add(new THREE.TorusGeometry(r * (1 - i / pts.length) * 1.02, r * 0.12, 3, 8), ridge, p[0], p[1], p[2], Math.PI / 2, 0, 0);
    }
  }
}

/** Faceted crystal shard from `a` to `b` (hexagonal prism with a pointed tip). */
export function shardGeo(a: V | THREE.Vector3, b: V | THREE.Vector3, r: number, sides = 5): THREE.BufferGeometry {
  const A = v3(a);
  const B = v3(b);
  const len = A.distanceTo(B);
  const prof: [number, number][] = [
    [r * 0.55, 0],
    [r, len * 0.12],
    [r * 0.9, len * 0.7],
    [0.0005, len],
  ];
  const g = new THREE.LatheGeometry(
    prof.map(([x, y]) => new THREE.Vector2(x, y)),
    sides,
  );
  const dir = B.sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyQuaternion(q);
  g.translate(A.x, A.y, A.z);
  return flat(g);
}

/** Cluster of crystal shards bursting from `base`; dirs are [dx, dy, dz, radius]. */
export function crystalCluster(k: K, base: V, dirs: [number, number, number, number][], hexes: string[], glow?: { gb: GlowBatch; every: number }): void {
  dirs.forEach(([dx, dy, dz, r], i) => {
    const tip: V = [base[0] + dx, base[1] + dy, base[2] + dz];
    if (glow && i % glow.every === glow.every - 1) glow.gb.add(shardGeo(base, tip, r * 0.8, 4));
    else put(k, shardGeo(base, tip, r, 5), hexes[i % hexes.length]!);
  });
}

/** Ring of thorn spikes around a centre (crowns, collars, maws). Spikes point along out + tilt. */
export function thornRing(k: K, c: V, radius: number, n: number, len: number, r: number, hex: string, o: { tilt?: number; arc?: [number, number]; jitter?: number; seed?: number; yScale?: number } = {}): void {
  const { tilt = 0.6, arc = [0, Math.PI * 2], jitter = 0.25, seed = 3, yScale = 1 } = o;
  const rr = rnd(seed);
  for (let i = 0; i < n; i++) {
    const a = arc[0] + ((arc[1] - arc[0]) * (i + 0.5)) / n;
    const L = len * (1 - jitter / 2 + rr() * jitter);
    const base: V = [c[0] + Math.sin(a) * radius, c[1], c[2] + Math.cos(a) * radius];
    const tip: V = [base[0] + Math.sin(a) * L * Math.cos(tilt), base[1] + L * Math.sin(tilt) * yScale, base[2] + Math.cos(a) * L * Math.cos(tilt)];
    put(k, spikeAB(base, tip, r, 4), hex);
  }
}

/** Torn hanging cloth panel: top edge centred at p, facing yaw (0 = +z), tilted back by `tilt`. */
export function rag(k: K, w: number, h: number, p: V, yaw: number, hex: string, seed = 3, tilt = 0, tatter = 0.35): void {
  put(k, xf(xf(ragLite(w, h, { seed, tatter, cols: 6, rows: 4, depth: 0.03, flare: 0.25 }), 0, 0, 0, tilt), p[0], p[1], p[2], 0, yaw, 0), hex);
}

/** Two glowing eyes (slanted slits) centred at (0, y, z). */
export function eyes(gb: GlowBatch, y: number, z: number, gap: number, w: number, h: number, slant = 0.25, yaw = 0.3): void {
  for (const s of [-1, 1]) gb.add(new THREE.BoxGeometry(w, h, w * 0.4), s * gap, y, z, 0, s * yaw, -s * slant);
}

/** Glowing sphere eye (round, burning). */
export function orbEyes(gb: GlowBatch, y: number, z: number, gap: number, r: number): void {
  for (const s of [-1, 1]) gb.add(new THREE.SphereGeometry(r, 8, 6), s * gap, y, z);
}

// --- Rig scaffold -----------------------------------------------------------------------------------

export interface BossBuild {
  rig: Rig;
  frame: THREE.Group;
  k: K;
  gb: GlowBatch;
}

export function bossRig(kind: Rig['kind'], attack: Rig['attack'] = 'melee'): BossBuild {
  const rig = newRig(kind, attack);
  const frame = pivot(rig.body, 0, 0, 0);
  return { rig, frame, k: new K(), gb: new GlowBatch() };
}

/** Adds a kit (and an optional glow batch) to a pivot. */
export function attach(rig: Rig, parent: THREE.Object3D, k: K, gb?: GlowBatch, glow?: string, lum = 4.5): void {
  if (!k.empty) addMesh(rig, parent, k);
  if (gb && glow) gb.flush(parent, glow, lum);
}

/** Soft additive halo (fake light spill around a glowing part). */
export function halo(parent: THREE.Object3D, hex: string, r: number, x: number, y: number, z: number, opacity = 0.18): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export { addGlow, addMesh, pivot };
