import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Kit } from '../../base3d/kit';
import { K, shade, shapeFrom } from '../../base3d/sculpt';
import type { ArenaLook } from './look';
import { KIND_PLAIN, KIND_WALL } from './materials';

/**
 * Building blocks of the courtyard. Parts are modelled once in a canonical frame (facing +z,
 * standing on y = 0) with the Kit, tagged with a surface kind, and then stamped (copied with a
 * transform) into a Batch, which merges everything into one mesh = one draw call.
 */

export const IRON = '#2b2826';

export function withKind(geo: THREE.BufferGeometry, kind: number): THREE.BufferGeometry {
  const n = geo.getAttribute('position').count;
  geo.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
  return geo;
}

/** Merges kits (each with its surface kind) into one part geometry. */
export function partOf(...pieces: [Kit, number][]): THREE.BufferGeometry {
  const geos = pieces.filter(([k]) => !k.empty).map(([k, kind]) => withKind(k.build(false).geometry, kind));
  const g = mergeGeometries(geos, false)!;
  geos.forEach((x) => x.dispose());
  return g;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const pv = new THREE.Vector3();
const sv = new THREE.Vector3();

export class Batch {
  private geos: THREE.BufferGeometry[] = [];

  get empty(): boolean {
    return this.geos.length === 0;
  }

  /** Moves a finished kit into the batch with one surface kind. */
  take(k: Kit, kind: number): this {
    if (!k.empty) this.geos.push(withKind(k.build(false).geometry, kind));
    return this;
  }

  /** Stamps a copy of a part at (x, y, z), turned by ry and scaled. */
  put(part: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, s = 1): this {
    const g = part.clone();
    q.setFromAxisAngle(up, ry);
    m4.compose(pv.set(x, y, z), q, sv.set(s, s, s));
    g.applyMatrix4(m4);
    this.geos.push(g);
    return this;
  }

  build(material: THREE.Material, castShadow: boolean): THREE.Mesh {
    const geo = this.geos.length ? mergeGeometries(this.geos, false) : new THREE.BufferGeometry();
    this.geos.forEach((g) => g.dispose());
    this.geos = [];
    const mesh = new THREE.Mesh(geo ?? new THREE.BufferGeometry(), material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** A paving slab: a low box whose top is inset (chamfered edges catch the low sun). */
export function slabGeo(w: number, d: number, h: number, inset: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) <= 0) continue;
    p.setX(i, p.getX(i) * ((w - 2 * inset) / w));
    p.setZ(i, p.getZ(i) * ((d - 2 * inset) / d));
  }
  g.computeVertexNormals();
  return g;
}

/** Pointed (gothic) arch outline, base centred at the origin: straight sides up to `spring`, apex `peak` higher. */
export function archOutline(w: number, spring: number, peak: number, steps = 7): [number, number][] {
  const r = (w * w) / 4 / w + (peak * peak) / w;
  const c = w / 2 - r;
  const a1 = Math.atan2(peak, -c);
  const pts: [number, number][] = [
    [-w / 2, 0],
    [w / 2, 0],
  ];
  for (let i = 0; i <= steps; i++) {
    const a = (a1 * i) / steps;
    pts.push([c + Math.cos(a) * r, spring + Math.sin(a) * r]);
  }
  for (let i = steps - 1; i >= 0; i--) {
    const a = (a1 * i) / steps;
    pts.push([-(c + Math.cos(a) * r), spring + Math.sin(a) * r]);
  }
  return pts;
}

/** Arch-shaped ring (an arch frame): outer arch minus the inner opening, both on the same base. */
export function archFrame(outerW: number, innerW: number, spring: number, outerPeak: number, innerPeak: number): THREE.Shape {
  const s = shapeFrom(archOutline(outerW, spring, outerPeak));
  const hole = new THREE.Path();
  archOutline(innerW, spring, innerPeak).forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)));
  hole.closePath();
  s.holes.push(hole);
  return s;
}

/** Gold sigil of the order (a ring crossed by a long sword-like stroke), facing +z at (x, y, z). */
export function sigilUpright(k: K, x: number, y: number, z: number, r: number, hex: string, t = 0.03): void {
  k.ring(r, r * 0.12, x, y, z, hex, 0);
  k.add(new THREE.BoxGeometry(r * 0.22, r * 3.1, t), hex, x, y + r * 0.2, z);
  k.add(new THREE.BoxGeometry(r * 2.5, r * 0.2, t), hex, x, y, z);
  k.add(new THREE.BoxGeometry(r * 1.0, r * 0.18, t), hex, x, y + r * 1.32, z);
  k.add(new THREE.OctahedronGeometry(r * 0.2, 0), hex, x, y + r * 1.85, z, 0, 0, 0, 1, 1.3, 0.3);
}

/**
 * Hanging banner, rod at y = 0, cloth facing +z: deep red with a muted-gold sigil, a gold trim and
 * a swallow-tailed hem. Total drop is about 1.15 * h.
 */
export function bannerPart(look: ArenaLook, w: number, h: number, worn = false): THREE.BufferGeometry {
  const k = new K();
  const cloth = worn ? shade(look.cloth, -0.25) : look.cloth;
  k.tube(0.06, 0.06, w + 0.5, 0, 0, 0.14, IRON, 0, 0, Math.PI / 2, 6);
  for (const s of [-1, 1]) k.ball(0.1, s * (w / 2 + 0.25), 0, 0.14, look.gold, 1, 1, 1, 8);
  k.cloth(w, h, 0, -0.04, 0.14, cloth, 2, 0.035, 0.05);
  const bw = w * 1.05;
  const tail = h * (worn ? 0.1 : 0.16);
  k.plate(shapeFrom([[-bw / 2, 0], [bw / 2, 0], [bw / 2, -tail], [0, -tail * 0.3], [-bw / 2, -tail]]), 0.03, 0, 0, -h - 0.02, 0.08, shade(cloth, -0.05));
  const fz = 0.17;
  k.add(new THREE.BoxGeometry(w * 0.98, 0.07, 0.025), look.gold, 0, -0.04 - h * 0.08, fz);
  k.add(new THREE.BoxGeometry(w * 1.02, 0.07, 0.025), look.gold, 0, -h + 0.06, 0.1);
  sigilUpright(k, 0, -0.04 - h * 0.47, fz + 0.01, w * 0.24, look.gold);
  return partOf([k, KIND_PLAIN]);
}

/** Stone pillar with an iron fire bowl on top. The flame base sits at BRAZIER_FLAME_Y. */
export const BRAZIER_FLAME_Y = 3.82;
export function brazierPart(look: ArenaLook): THREE.BufferGeometry {
  const p = new K();
  p.box(1.5, 0.35, 1.5, 0, 0, 0, look.stoneDark);
  p.box(1.2, 0.3, 1.2, 0, 0.35, 0, look.stone);
  p.box(0.86, 2.3, 0.86, 0, 0.65, 0, look.stone);
  p.box(1.18, 0.28, 1.18, 0, 2.95, 0, look.stoneDark);
  p.box(0.96, 0.12, 0.96, 0, 3.23, 0, look.stone);
  const b = new K();
  b.lathe([[0.001, 0], [0.26, 0], [0.6, 0.34], [0.74, 0.5], [0.68, 0.54], [0.001, 0.38]], 0, 3.35, 0, IRON, 12);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.add(new THREE.BoxGeometry(0.08, 0.36, 0.08), IRON, Math.cos(a) * 0.55, 3.62, Math.sin(a) * 0.55, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
  }
  b.add(new THREE.DodecahedronGeometry(0.42, 0), '#3a1a10', 0, 3.72, 0, 0, 0.5, 0, 1.2, 0.35, 1.2);
  return partOf([p, KIND_WALL], [b, KIND_PLAIN]);
}

/** Armoured knight statue on a plinth, facing +z, both hands on a great sword planted before him. */
export function statuePart(look: ArenaLook, broken = false): THREE.BufferGeometry {
  const p = new K();
  p.box(2.2, 0.35, 2.2, 0, 0, 0, look.stoneDark);
  p.box(1.8, 1.5, 1.8, 0, 0.35, 0, look.stone);
  p.box(2.05, 0.3, 2.05, 0, 1.85, 0, look.stoneDark);
  const s = new K();
  const c = look.statue;
  const y0 = 2.15;
  for (const sx of [-1, 1]) {
    s.tube(0.15, 0.12, 1.0, sx * 0.22, y0 + 0.55, 0, c, 0, 0, sx * 0.05, 8);
    s.rbox(0.26, 0.16, 0.46, 0.05, sx * 0.24, y0 + 0.08, 0.08, c);
    s.ball(0.12, sx * 0.22, y0 + 0.62, 0.07, c, 1, 1, 1, 8);
    s.ball(0.24, sx * 0.47, y0 + 1.98, 0, c, 1, 0.78, 1.05, 10);
    s.pill(0.1, 0.42, sx * 0.43, y0 + 1.66, 0.12, c, 0.45, 0, -sx * 0.2);
    s.pill(0.09, 0.36, sx * 0.24, y0 + 1.36, 0.36, c, 1.25, 0, -sx * 0.75);
  }
  s.lathe([[0.001, 0], [0.44, 0], [0.36, 0.42], [0.001, 0.42]], 0, y0 + 0.88, 0, c, 10);
  s.lathe([[0.001, 0], [0.33, 0], [0.4, 0.3], [0.47, 0.62], [0.36, 0.8], [0.001, 0.82]], 0, y0 + 1.28, 0, c, 10, 1, 0.75);
  s.ball(0.12, 0, y0 + 1.3, 0.48, c, 1, 1, 1, 8);
  // Great sword, point down (a broken statue holds only the stump of a blade)
  s.box(0.13, broken ? 0.45 : 1.12, 0.05, 0, y0 + (broken ? 0.65 : 0.0), 0.52, c);
  s.box(0.72, 0.08, 0.1, 0, y0 + 1.12, 0.52, c);
  if (!broken) {
    s.tube(0.16, 0.19, 0.36, 0, y0 + 2.28, 0, c, 0, 0, 0, 10);
    s.dome(0.16, 0, y0 + 2.45, 0, c);
    s.rbox(0.05, 0.2, 0.42, 0.02, 0, y0 + 2.6, -0.02, c);
    s.box(0.24, 0.035, 0.03, 0, y0 + 2.28, 0.17, shade(c, -0.55));
  } else s.rock(0.2, 0.55, y0, 0.72, c, 0.6, 0.6);
  s.cloth(0.95, 1.75, 0, y0 + 2.02, -0.3, shade(c, -0.06), 3, 0.05, 0.28);
  return partOf([p, KIND_WALL], [s, KIND_PLAIN]);
}

/** Row of merlons (battlements) along x on a wall top at height y, front face at z. */
export function merlonRow(k: K, x0: number, x1: number, y: number, z: number, hex: string, rand: () => number, ruin = 0, size = 0.75): void {
  const n = Math.max(1, Math.round((x1 - x0) / (size * 1.85)));
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    if (ruin > 0 && rand() < ruin * 0.35) continue;
    const h = ruin > 0 && rand() < ruin * 0.3 ? size * 0.5 : size * 1.25;
    k.box(size, h, size * 0.7, x0 + step * (i + 0.5), y, z - size * 0.35, hex);
  }
}

/** Square gothic tower (footprint w, height h) with battlements, lancet windows and a slate spire. */
export function squareTower(k: K, look: ArenaLook, rand: () => number, x: number, z: number, w: number, h: number, spire: number, ruin = 0): void {
  k.box(w + 0.5, 0.8, w + 0.5, x, 0, z, look.stoneDark);
  k.box(w, h, w, x, 0, z, look.stone);
  k.box(w + 0.6, 0.45, w + 0.6, x, h, z, look.stoneDark);
  // Corbel course and battlements on all four sides
  for (let i = 0; i < 4; i++) {
    const ry = (i * Math.PI) / 2;
    const n = Math.max(2, Math.round(w / 1.3));
    for (let j = 0; j < n; j++) {
      if (ruin > 0 && rand() < ruin * 0.3) continue;
      const u = -w / 2 + (w / n) * (j + 0.5);
      const dx = Math.cos(ry) * u + Math.sin(ry) * (w / 2 + 0.05);
      const dz = -Math.sin(ry) * u + Math.cos(ry) * (w / 2 + 0.05);
      k.box(0.62, 0.8, 0.45, x + dx, h + 0.45, z + dz, look.stone, ry);
    }
  }
  // Lancet windows on the front (+z) face
  for (let yy = h * 0.45; yy < h - 1.5; yy += Math.max(3, h * 0.28)) {
    k.plate(shapeFrom(archOutline(0.62, 1.3, 0.5)), 0.06, 0, x, yy, z + w / 2 + 0.02, '#0e0c0b');
    k.plate(archFrame(0.95, 0.62, 1.3, 0.72, 0.5), 0.14, 0, x, yy, z + w / 2 + 0.05, look.stoneDark);
  }
  if (spire > 0 && ruin < 0.5) {
    k.add(new THREE.ConeGeometry(w * 0.62, spire, 4), look.slate, x, h + 0.45 + spire / 2, z, 0, Math.PI / 4, 0);
    k.add(new THREE.BoxGeometry(0.08, 1.0, 0.08), IRON, x, h + 0.45 + spire + 0.4, z);
    k.add(new THREE.OctahedronGeometry(0.16, 0), look.gold, x, h + 0.45 + spire + 0.95, z, 0, 0, 0, 1, 1.6, 1);
  }
}
