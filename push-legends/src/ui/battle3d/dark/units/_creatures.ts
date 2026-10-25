import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { taperTube, type K, type V } from '../../../base3d/sculpt';
import { addGlow } from '../../rig';

/**
 * Shared sculpting helpers for the creature models (Obsidian Colossus, Warg Reaver, Pyre Phoenix,
 * Void Wyrm): lofted bodies along a curved spine, chipped stone blocks and faceted rock, parts
 * oriented along a direction (spikes, teeth, scales), jagged glowing cracks, flame tongues,
 * feathers and torn wing membranes, plus a batch that merges many glowing bits into one mesh.
 */

export const SHADOW = '#060607';

/** Deterministic pseudo-random sequence. */
export function rnd(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Hash of a position (same input → same value, keeps shared vertices welded when jittered). */
export function hash3(x: number, y: number, z: number, seed = 0): number {
  const h = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 997) * 78.233 + Math.round(z * 997) * 37.719 + seed * 4.13) * 43758.5453;
  return h - Math.floor(h);
}

/** Faceted copy (flat normals). */
export function flat(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.computeVertexNormals();
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Applies a placement (position, rotation, scale) to a geometry and returns it. */
export function xf(geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  geo.applyMatrix4(_m);
  return geo;
}

const vec = (v: V | THREE.Vector3): THREE.Vector3 => (v instanceof THREE.Vector3 ? v.clone() : new THREE.Vector3(v[0], v[1], v[2]));

/**
 * Places a geometry modelled along +y (cones, spikes, teeth) at p, pointing along dir, rolled
 * about that axis. Returns the geometry.
 */
export function along(geo: THREE.BufferGeometry, p: V | THREE.Vector3, dir: V | THREE.Vector3, roll = 0, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const d = vec(dir).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d);
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, roll));
  _m.compose(vec(p), q, _s.set(sx, sy, sz));
  geo.applyMatrix4(_m);
  return geo;
}

/**
 * Places a part modelled along +y with its face towards +z (feathers, blades) at p: +y along
 * yDir, +z as close to `up` as possible. Uniform scale s.
 */
export function orient(geo: THREE.BufferGeometry, p: V | THREE.Vector3, yDir: V | THREE.Vector3, up: V | THREE.Vector3 = [0, 1, 0], s = 1): THREE.BufferGeometry {
  const Y = vec(yDir).normalize();
  const X = new THREE.Vector3().crossVectors(Y, vec(up));
  if (X.lengthSq() < 1e-8) X.set(1, 0, 0);
  X.normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  const m = new THREE.Matrix4().makeBasis(X, Y, Z).scale(new THREE.Vector3(s, s, s)).setPosition(vec(p));
  geo.applyMatrix4(m);
  return geo;
}

/** Spike (cone) from base point a to tip b. */
export function spikeAB(a: V | THREE.Vector3, b: V | THREE.Vector3, r: number, seg = 5, flatten = 1): THREE.BufferGeometry {
  const A = vec(a);
  const B = vec(b);
  const len = A.distanceTo(B);
  const g = new THREE.ConeGeometry(r, len, seg, 1);
  g.translate(0, len / 2, 0);
  return along(g, A, B.sub(A), 0, 1, 1, flatten);
}

/** Many glowing pieces merged into one unlit mesh (one draw call). */
export class GlowBatch {
  private geos: THREE.BufferGeometry[] = [];
  get size(): number {
    return this.geos.length;
  }
  add(geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    xf(g, x, y, z, rx, ry, rz, sx, sy, sz);
    this.geos.push(g);
    return this;
  }
  flush(parent: THREE.Object3D, hex: string, lum = 4): THREE.Mesh | null {
    if (!this.geos.length) return null;
    const merged = mergeGeometries(this.geos, false)!;
    this.geos.forEach((g) => g.dispose());
    this.geos = [];
    return addGlow(parent, merged, hex, 0, 0, 0, lum);
  }
}

/**
 * Chipped stone block (or forged slab): a box with bevelled corners, an optional taper and a
 * deterministic jitter so every block is irregular. Faceted.
 */
export function chunkGeo(w: number, h: number, d: number, seed: number, o: { chamfer?: number; jitter?: number; top?: number; topD?: number; lean?: number; seg?: number } = {}): THREE.BufferGeometry {
  const { chamfer = 0.35, jitter = 0.06, top = 1, topD = top, lean = 0, seg = 2 } = o;
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const m = Math.min(w, h, d);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const ext = (Math.abs(x) > w / 2 - 1e-4 ? 1 : 0) + (Math.abs(y) > h / 2 - 1e-4 ? 1 : 0) + (Math.abs(z) > d / 2 - 1e-4 ? 1 : 0);
    const k = ext === 3 ? 1 - chamfer * 0.5 : ext === 2 ? 1 - chamfer * 0.22 : 1;
    x *= k;
    y *= k;
    z *= k;
    const jx = (hash3(x, y, z, seed) - 0.5) * jitter * m * 2;
    const jy = (hash3(y, z, x, seed + 1) - 0.5) * jitter * m * 2;
    const jz = (hash3(z, x, y, seed + 2) - 0.5) * jitter * m * 2;
    const t = (y + h / 2) / h;
    p.setXYZ(i, (x + jx) * (1 + (top - 1) * t), y + jy, (z + jz) * (1 + (topD - 1) * t) + lean * t);
  }
  return flat(g);
}

/** Faceted rock lump (icosahedron with radial jitter). */
export function lumpGeo(r: number, seed: number, jitter = 0.18, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + (hash3(x, y, z, seed) - 0.5) * jitter * 2;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  return flat(g);
}

interface Frame {
  p: THREE.Vector3;
  t: THREE.Vector3;
  s: THREE.Vector3;
  n: THREE.Vector3;
}

/**
 * A smooth spine (Catmull-Rom curve through points) with twist-free frames and an elliptical
 * section per position: `sec(t)` → [half-width, half-height]. Bodies, necks and tails are lofted
 * along it, and details are placed on its surface with `point()`.
 * Frame axes: s = sideways (+x for a spine running along +z), n = "up" of the section.
 */
export class Spine {
  readonly curve: THREE.CatmullRomCurve3;
  private frames: Frame[] = [];
  constructor(
    pts: V[],
    readonly sec: (t: number) => [number, number],
    samples = 64,
  ) {
    this.curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
    let prevT: THREE.Vector3 | null = null;
    let s = new THREE.Vector3();
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const p = this.curve.getPointAt(u);
      const t = this.curve.getTangentAt(u).normalize();
      if (!prevT) {
        s = new THREE.Vector3().crossVectors(UP, t);
        if (s.lengthSq() < 1e-6) s.set(1, 0, 0);
        s.normalize();
      } else {
        const axis = new THREE.Vector3().crossVectors(prevT, t);
        const sin = axis.length();
        if (sin > 1e-6) s.applyAxisAngle(axis.normalize(), Math.asin(Math.min(1, sin)));
        // keep orthogonal
        s.sub(t.clone().multiplyScalar(s.dot(t))).normalize();
      }
      const n = new THREE.Vector3().crossVectors(t, s).normalize();
      this.frames.push({ p, t, s: s.clone(), n });
      prevT = t;
    }
  }

  frame(u: number): Frame {
    const f = Math.max(0, Math.min(1, u)) * (this.frames.length - 1);
    const i = Math.min(this.frames.length - 2, Math.floor(f));
    const k = f - i;
    const a = this.frames[i]!;
    const b = this.frames[i + 1]!;
    return {
      p: a.p.clone().lerp(b.p, k),
      t: a.t.clone().lerp(b.t, k).normalize(),
      s: a.s.clone().lerp(b.s, k).normalize(),
      n: a.n.clone().lerp(b.n, k).normalize(),
    };
  }

  /** Surface point at spine position u and angle a (0 = side +s, π/2 = top +n), pushed out by `out`. */
  point(u: number, a: number, out = 0): THREE.Vector3 {
    const f = this.frame(u);
    const [rx, ry] = this.sec(u);
    return f.p.add(f.s.multiplyScalar(Math.cos(a) * (rx + out))).add(f.n.multiplyScalar(Math.sin(a) * (ry + out)));
  }

  /** Outward surface direction at (u, a). */
  normal(u: number, a: number): THREE.Vector3 {
    const f = this.frame(u);
    const [rx, ry] = this.sec(u);
    return f.s.multiplyScalar(Math.cos(a) / Math.max(1e-3, rx)).add(f.n.multiplyScalar(Math.sin(a) / Math.max(1e-3, ry))).normalize();
  }

  /**
   * Lofted surface between u0 and u1. keel sharpens the top into a ridge, flare(u) scales the
   * section (overlapping armour bands), noise roughens it (fur, rock). Caps close the ends.
   */
  geo(o: { u0?: number; u1?: number; radial?: number; steps?: number; keel?: number; belly?: number; flare?: (u: number) => number; noise?: number; seed?: number; caps?: boolean; scale?: number; out?: number; arc?: [number, number] } = {}): THREE.BufferGeometry {
    const { u0 = 0, u1 = 1, radial = 12, steps = 16, keel = 0, belly = 0, flare, noise = 0, seed = 1, scale = 1, out = 0, arc } = o;
    const caps = (o.caps ?? true) && !arc;
    const pos: number[] = [];
    const idx: number[] = [];
    const ring = radial + 1;
    for (let i = 0; i <= steps; i++) {
      const u = u0 + ((u1 - u0) * i) / steps;
      const f = this.frame(u);
      const [rx0, ry0] = this.sec(u);
      const fl = (flare ? flare(u) : 1) * scale;
      for (let j = 0; j <= radial; j++) {
        const a = arc ? arc[0] + ((arc[1] - arc[0]) * j) / radial : (j / radial) * Math.PI * 2 - Math.PI / 2;
        const sn = Math.sin(a);
        let k = 1 + keel * Math.pow(Math.max(0, sn), 6) - belly * Math.pow(Math.max(0, -sn), 2) * 0.3;
        if (noise) k *= 1 + (hash3(i, arc ? j : j % radial, 0, seed) - 0.5) * noise * 2;
        const rx = rx0 * fl * k + out;
        const ry = ry0 * fl * k + out;
        pos.push(f.p.x + f.s.x * Math.cos(a) * rx + f.n.x * sn * ry, f.p.y + f.s.y * Math.cos(a) * rx + f.n.y * sn * ry, f.p.z + f.s.z * Math.cos(a) * rx + f.n.z * sn * ry);
      }
    }
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < radial; j++) {
        const a = i * ring + j;
        const b = a + ring;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    if (caps) {
      for (const [i, flip] of [
        [0, true],
        [steps, false],
      ] as const) {
        const c = pos.length / 3;
        const f = this.frame(u0 + ((u1 - u0) * i) / steps);
        pos.push(f.p.x, f.p.y, f.p.z);
        for (let j = 0; j < radial; j++) {
          const a = i * ring + j;
          if (flip) idx.push(c, a + 1, a);
          else idx.push(c, a, a + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
}

/** Linear interpolation in a table of rows [u, a, b] sorted by u (spine sections). */
export function table(u: number, rows: [number, number, number][]): [number, number] {
  if (u <= rows[0]![0]) return [rows[0]![1], rows[0]![2]];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    if (u <= r[0]) {
      const p = rows[i - 1]!;
      const t = (u - p[0]) / (r[0] - p[0]);
      return [p[1] + (r[1] - p[1]) * t, p[2] + (r[2] - p[2]) * t];
    }
  }
  const l = rows[rows.length - 1]!;
  return [l[1], l[2]];
}

/** Jagged polyline from a to b (cracks, lightning, scars). */
export function jagged(a: V, b: V, n: number, amp: number, seed: number): V[] {
  const r = rnd(seed);
  const pts: V[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const e = i === 0 || i === n ? 0 : amp;
    pts.push([a[0] + (b[0] - a[0]) * t + (r() - 0.5) * e, a[1] + (b[1] - a[1]) * t + (r() - 0.5) * e, a[2] + (b[2] - a[2]) * t + (r() - 0.5) * e]);
  }
  return pts;
}

/** Polyline of thin straight segments (cracks, runes, inlay); tapers from r0 to r1. */
export function segLine(pts: (V | THREE.Vector3)[], r0: number, r1 = r0, radial = 4): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = vec(pts[i]!);
    const b = vec(pts[i + 1]!);
    const len = a.distanceTo(b);
    if (len < 1e-4) continue;
    const ra = r0 + ((r1 - r0) * i) / (pts.length - 1);
    const rb = r0 + ((r1 - r0) * (i + 1)) / (pts.length - 1);
    const g = new THREE.CylinderGeometry(rb, ra, len + Math.min(ra, rb) * 1.5, radial, 1, true);
    g.translate(0, len / 2, 0);
    geos.push(along(g, a, b.clone().sub(a)).toNonIndexed());
  }
  const m = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  m.computeVertexNormals();
  return m;
}

/** Wavy flame tongue from p along dir (glow). */
export function flameGeo(p: V, dir: V, len: number, r: number, seed: number, wave = 0.18): THREE.BufferGeometry {
  const rr = rnd(seed);
  const d = new THREE.Vector3(...dir).normalize();
  const side = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
  const up2 = new THREE.Vector3().crossVectors(side, d).normalize();
  const pts: V[] = [];
  const ph = rr() * 6;
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const w = Math.sin(ph + t * 5) * wave * len * t;
    const w2 = Math.cos(ph * 1.3 + t * 4) * wave * 0.6 * len * t;
    pts.push([p[0] + d.x * len * t + side.x * w + up2.x * w2, p[1] + d.y * len * t + side.y * w + up2.y * w2, p[2] + d.z * len * t + side.z * w + up2.z * w2]);
  }
  return taperTube(pts, r, 0.002, 4, 6);
}

/**
 * Curved feather vane with a raised shaft, modelled along +y from its root (length len, half-width
 * w, droop bends it towards −z). Single-sided surface (the rig material is double-sided).
 */
export function featherGeo(len: number, w: number, o: { droop?: number; seed?: number; rows?: number; ragged?: number; tipW?: number } = {}): THREE.BufferGeometry {
  const { droop = 0.1, seed = 1, rows = 6, ragged = 0.25, tipW = 0.3 } = o;
  const r = rnd(seed);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = t * len;
    const z = -droop * len * t * t;
    // width: narrow at the root, widest at 40%, tapering to a ragged point
    const prof = t < 0.35 ? 0.45 + (t / 0.35) * 0.55 : 1 - Math.pow((t - 0.35) / 0.65, 1.6) * (1 - tipW);
    const rag = i > 1 && i < rows ? 1 - r() * ragged : 1;
    const ww = w * prof * (i === rows ? 0.05 : 1);
    pos.push(-ww * rag, y - ww * 0.15, z - ww * 0.1, 0, y, z + w * 0.12, ww * (i > 1 && i < rows ? 1 - r() * ragged : 1), y - ww * 0.2, z - ww * 0.1);
  }
  for (let i = 0; i < rows; i++) {
    const a = i * 3;
    const b = a + 3;
    idx.push(a, b, a + 1, b, b + 1, a + 1, a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Edge of a feather from featherGeo as a polyline (for glowing ember edges). side +1/−1. */
export function featherEdge(len: number, w: number, side: number, t0: number, droop = 0.1, tipW = 0.3, n = 4): V[] {
  const pts: V[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((1 - t0) * i) / n;
    const prof = t < 0.35 ? 0.45 + (t / 0.35) * 0.55 : 1 - Math.pow((t - 0.35) / 0.65, 1.6) * (1 - tipW);
    const ww = w * prof * (t > 0.99 ? 0.05 : 1);
    pts.push([side * ww, t * len - ww * 0.18, -droop * len * t * t - ww * 0.1]);
  }
  return pts;
}

/**
 * Torn membrane stretched between bone lines that start near a common root (dragon and bat
 * wings). Between neighbouring lines the trailing edge sags into a scallop; tatter cuts ragged
 * notches and a few holes.
 */
export function membraneGeo(lines: V[][], o: { scallop?: number; tatter?: number; holes?: number; seed?: number; cols?: number; rows?: number; sag?: number } = {}): THREE.BufferGeometry {
  const { scallop = 0.3, tatter = 0.12, holes = 0.12, seed = 5, cols = 4, rows = 6, sag = 0.04 } = o;
  const r = rnd(seed);
  const curves = lines.map((l) => new THREE.CatmullRomCurve3(l.map((q) => new THREE.Vector3(...q))));
  const pos: number[] = [];
  for (let g = 0; g < curves.length - 1; g++) {
    const A = curves[g]!;
    const B = curves[g + 1]!;
    const colLen: number[] = [];
    for (let j = 0; j <= cols; j++) {
      const u = j / cols;
      const edge = j === 0 || j === cols ? 1 : 1 - scallop * Math.sin(Math.PI * u) - r() * tatter;
      colLen.push(Math.max(0.15, edge));
    }
    const P = (j: number, i: number): THREE.Vector3 => {
      const u = j / cols;
      const v = (i / rows) * colLen[j]!;
      const a = A.getPointAt(Math.min(1, v));
      const b = B.getPointAt(Math.min(1, v));
      const p = a.lerp(b, u);
      p.y -= Math.sin(Math.PI * u) * sag * (0.3 + v);
      return p;
    };
    for (let j = 0; j < cols; j++)
      for (let i = 0; i < rows; i++) {
        // tears near the trailing edge and the odd hole inside
        const nearEdge = i >= rows - 2;
        if ((nearEdge && r() < holes) || (!nearEdge && i > 1 && r() < holes * 0.25)) continue;
        const p00 = P(j, i);
        const p10 = P(j + 1, i);
        const p01 = P(j, i + 1);
        const p11 = P(j + 1, i + 1);
        pos.push(p00.x, p00.y, p00.z, p01.x, p01.y, p01.z, p10.x, p10.y, p10.z, p10.x, p10.y, p10.z, p01.x, p01.y, p01.z, p11.x, p11.y, p11.z);
      }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Collects placed geometry so lines can be projected onto it: cracks, runes and scars that hug a
 * faceted rock or a curved hide exactly. Rays are cast along `dir` from far away.
 */
export class Surface {
  private meshes: THREE.Mesh[] = [];
  private static mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  /** Remembers a copy of geo (already in kit space) and returns geo unchanged. */
  add(geo: THREE.BufferGeometry): THREE.BufferGeometry {
    const m = new THREE.Mesh(geo.clone(), Surface.mat);
    m.updateMatrixWorld(true);
    this.meshes.push(m);
    return geo;
  }
  /**
   * Projects a polyline given in the plane across `dir` (for dir −z: [x, y] pairs) onto the
   * collected surface, subdividing so it follows facets; points that miss are dropped.
   */
  project(pts: [number, number][], dir: 'z' | '-z' | 'x' | '-x' | 'y', out = 0.008, sub = 2): THREE.Vector3[] {
    const ray = new THREE.Raycaster();
    const d = dir === 'z' ? new THREE.Vector3(0, 0, -1) : dir === '-z' ? new THREE.Vector3(0, 0, 1) : dir === 'x' ? new THREE.Vector3(-1, 0, 0) : dir === '-x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, -1, 0);
    const res: THREE.Vector3[] = [];
    const origin = (a: number, b: number): THREE.Vector3 =>
      dir === 'z' ? new THREE.Vector3(a, b, 20) : dir === '-z' ? new THREE.Vector3(a, b, -20) : dir === 'x' ? new THREE.Vector3(20, b, a) : dir === '-x' ? new THREE.Vector3(-20, b, a) : new THREE.Vector3(a, 20, b);
    for (let i = 0; i < pts.length; i++) {
      const steps = i === pts.length - 1 ? 1 : sub;
      for (let j = 0; j < steps; j++) {
        const a = pts[i]!;
        const b = pts[Math.min(pts.length - 1, i + 1)]!;
        const t = j / sub;
        ray.set(origin(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), d);
        const hit = ray.intersectObjects(this.meshes, false)[0];
        if (!hit) continue;
        const n = hit.face ? hit.face.normal.clone() : d.clone().negate();
        if (n.dot(d) > 0) n.negate();
        res.push(hit.point.clone().add(n.multiplyScalar(out)));
      }
    }
    return res;
  }
  dispose(): void {
    this.meshes.forEach((m) => m.geometry.dispose());
    this.meshes = [];
  }
}

/** Jagged 2D polyline (for Surface.project). */
export function jag2(a: [number, number], b: [number, number], n: number, amp: number, seed: number): [number, number][] {
  return jagged([a[0], a[1], 0], [b[0], b[1], 0], n, amp, seed).map((q) => [q[0], q[1]]);
}

/** Light tapered tube along a smooth curve (horns, ribs, lips, claws); cheaper than K.curve. */
export function tube(k: K, pts: (V | THREE.Vector3)[], r0: number, r1: number, hex: string, radial = 5, steps = 6): K {
  return k.add(
    taperTube(
      pts.map((p) => (p instanceof THREE.Vector3 ? (p.toArray() as V) : p)),
      r0,
      r1,
      radial,
      steps,
    ),
    hex,
    0,
    0,
    0,
  );
}

/**
 * Cheap hanging cloth (single surface; the rig material is double-sided): top edge at y = 0,
 * hanging down −y, a few folds and a torn, uneven hem.
 */
export function ragLite(w: number, h: number, o: { cols?: number; rows?: number; seed?: number; tatter?: number; depth?: number; flare?: number; curl?: number } = {}): THREE.BufferGeometry {
  const { cols = 6, rows = 3, seed = 3, tatter = 0.3, depth = 0.02, flare = 0.2, curl = 0.05 } = o;
  const r = rnd(seed);
  const cut = Array.from({ length: cols + 1 }, () => r());
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const down = i / rows;
    for (let j = 0; j <= cols; j++) {
      const u = j / cols - 0.5;
      const tear = i === rows ? cut[j]! * tatter * h : 0;
      pos.push(u * w * (1 + flare * down), -down * h + tear, Math.sin(u * Math.PI * 4 + cut[j]! * 2) * depth * (0.3 + down) - curl * down * down);
    }
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + cols + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Adds geometry to a kit as-is (already placed in kit space). */
export function put(k: K, geo: THREE.BufferGeometry, hex: string): K {
  return k.add(geo, hex, 0, 0, 0);
}

/** Total triangles of all meshes under an object (budget checks while developing). */
export function triangles(obj: THREE.Object3D): number {
  let n = 0;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  return n;
}

/**
 * Card portraits frame creatures on their whole bounding box, so spread wings and long tails
 * shrink them to a speck. Call from a portrait pose: the frame is set to the posed bounds of the
 * given parts (head, chest...) grown by `pad` (x, below, above), and everything else may leave
 * the frame like a close-up painting. Only affects that portrait instance (it is built for the
 * shot and disposed); geometry bounding boxes are not used for rendering or culling.
 */
export function framePortraitOn(rig: { root: THREE.Object3D }, parts: THREE.Object3D[], pad: [number, number, number] = [0.3, 0.3, 0.2]): void {
  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const p of parts) box.expandByObject(p, true);
  if (box.isEmpty()) return;
  box.min.x -= pad[0];
  box.max.x += pad[0];
  box.min.y -= pad[1];
  box.max.y += pad[2];
  rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.boundingBox = new THREE.Box3().makeEmpty();
  });
  // An invisible marker card holds the frame (root space: the pose runs before the portrait
  // yaw). It is flat so the yaw does not widen the framed area.
  const size = box.getSize(new THREE.Vector3());
  const marker = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, 0.02));
  marker.visible = false;
  marker.position.copy(box.getCenter(new THREE.Vector3()));
  rig.root.add(marker);
}
