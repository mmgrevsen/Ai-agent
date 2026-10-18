import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { K, shade, taperTube, type V } from '../../../base3d/sculpt';
import { armBase, latheArc, legBase, skirtHalf, span, type Hunter } from './_hunters';

/**
 * Shared pieces for the robed spellcasters (Ashen Herald, Rime Widow, Storm Heretic): ankle-length
 * robes hung on the legs so they part with the stride, wide torn sleeves, and the magic effects
 * (spiralling fire, jagged lightning, ice shards, soft halos). Same rig conventions as _hunters.ts.
 * Glows are merged into one mesh per colour; segment counts stay low (instanced on phones).
 */

const rnd = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
};

// --- Robes ------------------------------------------------------------------------------------------

export interface RobeLook {
  /** Inner robe (almost closed at the front). */
  inner: string;
  /** Outer robe layer, open at the front (null = none). */
  outer?: string | null;
  boot: string;
  /** Hem flare at the ground (radius). */
  flare?: number;
  tatter?: number;
  seed?: number;
  /** Front opening of the outer layer (radians). */
  outerGap?: number;
  /** Ground clearance of the inner hem (0 = touching). */
  lift?: number;
  /** Front opening of the inner layer (radians, default 0.06). */
  innerGap?: number;
  /** Colour of a burnt / frost-rimed band at the hem (null = none). */
  hem?: string | null;
}

/** Ankle-length layered robe in two halves per layer, on the leg pivots. */
export function robeLegs(h: Hunter, o: RobeLook): void {
  const f = o.flare ?? 0.33;
  const lift = o.lift ?? 0.04;
  for (const s of [-1, 1]) {
    const k = h.leg(s);
    legBase(k, h.b, { trousers: shade(o.inner, -0.2), boot: o.boot, bend: 0.04, cuff: null });
    skirtHalf(
      k,
      s,
      h.legX,
      o.inner,
      [
        [f, -0.98 + lift],
        [f * 0.86, -0.62],
        [f * 0.64, -0.2],
        [0.17 * h.b, 0.06],
      ],
      { frontGap: o.innerGap ?? 0.06, backGap: 0.02, tatter: o.tatter ?? 0.12, seed: o.seed ?? 5, seg: 7, depth: 0.82 },
    );
    if (o.hem) {
      // Short ragged band just outside the lowest layer: scorched or frost-rimed hem
      const outerHem = !!o.outer;
      const r0 = outerHem ? f * 1.115 : f * 1.02;
      const y0 = outerHem ? -0.905 : -0.975 + lift;
      skirtHalf(
        k,
        s,
        h.legX,
        o.hem,
        [
          [r0, y0],
          [r0 * 0.965, y0 + 0.1],
          [r0 * 0.93, y0 + 0.17],
        ],
        { frontGap: outerHem ? (o.outerGap ?? 0.42) + 0.01 : (o.innerGap ?? 0.06) + 0.01, backGap: 0.03, tatter: (o.tatter ?? 0.12) * 1.6, seed: (o.seed ?? 5) + 11, seg: 7, depth: outerHem ? 0.865 : 0.825 },
      );
    }
    if (o.outer)
      skirtHalf(
        k,
        s,
        h.legX,
        o.outer,
        [
          [f * 1.1, -0.9],
          [f * 0.96, -0.58],
          [f * 0.72, -0.18],
          [0.19 * h.b, 0.08],
        ],
        { frontGap: o.outerGap ?? 0.42, backGap: 0.04, tatter: (o.tatter ?? 0.12) * 1.5, seed: (o.seed ?? 5) + 3, seg: 7, depth: 0.86 },
      );
  }
}

export interface SleeveLook {
  sleeve: string;
  glove: string;
  forearm?: string;
  /** Opening radius at the cuff. */
  bell?: number;
  /** Length of the sleeve below the shoulder (default 0.5: just past the elbow). */
  len?: number;
  tatter?: number;
  seed?: number;
  cuff?: number;
}

/** Thin arm under a wide, torn bell sleeve hanging from the shoulder. */
export function sleeveArm(k: K, s: number, b: number, o: SleeveLook): void {
  armBase(k, s, b, { sleeve: o.sleeve, glove: o.glove, forearm: o.forearm ?? shade(o.sleeve, -0.2), cuff: o.cuff ?? 1 });
  const bell = o.bell ?? 0.15;
  const len = o.len ?? 0.5;
  k.add(
    latheArc(
      [
        [bell, -len],
        [bell * 0.78, -len * 0.7],
        [0.085 * b, -len * 0.25],
        [0.088 * b, 0.04],
      ],
      8,
      0,
      Math.PI * 2,
      o.tatter ?? 0.1,
      o.seed ?? 9 + s,
    ),
    o.sleeve,
    s * 0.005,
    0,
    -0.01,
    0.08,
    0,
    0,
    1,
    1,
    0.9,
  );
}

// --- Magic --------------------------------------------------------------------------------------------

/** Points on a helix around the y axis from y0 to y1 (radius r0 → r1, `turns` revolutions). */
export function helix(y0: number, y1: number, r0: number, r1: number, turns: number, phase = 0, n = 10): V[] {
  const pts: V[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = phase + t * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * t;
    pts.push([Math.cos(a) * r, y0 + (y1 - y0) * t, Math.sin(a) * r]);
  }
  return pts;
}

/** Jagged polyline from a to b with n kinks of amplitude amp (lightning). */
export function jag(a: V, b: V, n: number, amp: number, seed: number): V[] {
  const r = rnd(seed);
  const pts: V[] = [a];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const fall = Math.sin(t * Math.PI);
    pts.push([a[0] + (b[0] - a[0]) * t + (r() - 0.5) * 2 * amp * fall, a[1] + (b[1] - a[1]) * t + (r() - 0.5) * 2 * amp * fall, a[2] + (b[2] - a[2]) * t + (r() - 0.5) * 2 * amp * fall]);
  }
  pts.push(b);
  return pts;
}

const _up = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

/** Thin straight segments (4-sided) through the points, merged: crisp lightning and cracks. */
export function boltGeo(pts: V[], r0: number, r1 = r0): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = Math.max(1e-4, _d.length());
    _d.multiplyScalar(1 / len);
    _q.setFromUnitVectors(_up, _d);
    const t0 = (i - 1) / (pts.length - 1);
    const t1 = i / (pts.length - 1);
    // A little overlap so the kinks stay closed
    const g = new THREE.CylinderGeometry(r0 + (r1 - r0) * t1, r0 + (r1 - r0) * t0, len * 1.08, 4, 1).toNonIndexed();
    g.deleteAttribute('uv');
    _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    g.applyMatrix4(_m.compose(_p, _q, _s));
    geos.push(g);
  }
  const m = mergeGeometries(geos)!;
  for (const g of geos) g.dispose();
  return m;
}

/** Faceted shard (ice, crystal, obsidian) along +y, base at the origin. */
export function shardGeo(r: number, h: number, sides = 4, lean = 0): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, sides, 1).toNonIndexed();
  g.translate(0, h / 2, 0);
  if (lean) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + (p.getY(i) / h) ** 2 * lean);
  }
  g.computeVertexNormals();
  return g;
}

/** Soft translucent glow sphere (light bleeding from magic), additive and depth-safe. */
export function halo(parent: THREE.Object3D, hex: string, r: number, x: number, y: number, z: number, opacity = 0.2, sy = 1): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 10, 7),
    new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  m.position.set(x, y, z);
  m.scale.set(1, sy, 1);
  parent.add(m);
  return m;
}

// --- Hardware -----------------------------------------------------------------------------------------

/**
 * Iron chain through the points: oval links (36 triangles each) alternating 90° so they interlock.
 * `link` is the link length along the path.
 */
export function chain(k: K, pts: V[], link: number, hex: string, thick = 0.006): void {
  let n = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const d: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    const cnt = Math.max(1, Math.round(len / link));
    for (let j = 0; j < cnt; j++) {
      const t0 = j / cnt;
      const t1 = (j + 1) / cnt;
      const p0: V = [a[0] + d[0] * t0, a[1] + d[1] * t0, a[2] + d[2] * t0];
      const p1: V = [a[0] + d[0] * t1, a[1] + d[1] * t1, a[2] + d[2] * t1];
      const l = len / cnt;
      span(k, p0, p1, () => new THREE.TorusGeometry(l * 0.36, thick, 3, 6).scale(0.62, 1, 1), hex, (n++ % 2) * (Math.PI / 2));
    }
  }
}

/** Flame tongue: a tapered curved tube from p along dir, wavering sideways (glow geometry). */
export function flameGeo(p: V, dir: V, len: number, r: number, seed: number): THREE.BufferGeometry {
  const rr = rnd(seed);
  const pts: V[] = [];
  for (let i = 0; i <= 3; i++) {
    const t = i / 3;
    const w = Math.sin(t * Math.PI) * len * 0.22;
    pts.push([p[0] + dir[0] * len * t + (rr() - 0.5) * w, p[1] + dir[1] * len * t + (rr() - 0.5) * w, p[2] + dir[2] * len * t + (rr() - 0.5) * w]);
  }
  return taperTube(pts, r, 0.002, 4, 6);
}

/** Small faceted spark or ember (glow geometry). */
export function sparkGeo(r: number): THREE.BufferGeometry {
  return new THREE.TetrahedronGeometry(r, 0);
}

/** Glowing crack across a plate: a jagged hairline from a to b (glow geometry). */
export function crackGeo(a: V, b: V, seed: number, w = 0.004, kinks = 4): THREE.BufferGeometry {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return boltGeo(jag(a, b, kinks, len * 0.12, seed), w, w * 0.5);
}
