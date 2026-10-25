import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from '../../../art/darkArt';
import { K, shade, shapeFrom, taperTube, type V } from '../../../base3d/sculpt';
import { addGlow, addMesh, newRig, pivot, type Rig } from '../../rig';
import { capGeo, cbox, frustumGeo, metal, prismGeo, ragGeo } from '../parts';

/**
 * Shared pieces for the enemy army (enemies.ts): the per-world dark look (blackened plate tinted by
 * the world, one vivid glow), a lean plate-armoured humanoid body, lofted creature limbs, sharp
 * layered pauldrons, glowing inlays batched into one mesh per colour, and per-world dressing
 * (rot and moss, frost and icicles, embers, grave bones, violet crystal).
 *
 * Rig conventions match parts.warrior(): feet at y 0, facing +z, right hand +x, hips y 1.0,
 * shoulders y 1.56, neck pivot y 1.66, head centre HEAD_Y (1.81). Weapons are built along +y from
 * the grip and the hand group turns them forward.
 */

export const SHADOW = '#060607';

// --- World look -------------------------------------------------------------------------------------

export type Dress = 'rot' | 'frost' | 'ember' | 'grave' | 'crystal';

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
}

export interface Look {
  world: number;
  dress: Dress;
  /** Main plate (glossy blackened steel, registered metal). */
  plate: string;
  /** Lighter plate for ridges and keels. */
  plateHi: string;
  /** Blackened under-plate, lames, gauntlets. */
  dark: string;
  /** Raised trim on the edges (worn steel or gold). */
  edge: string;
  mail: string;
  cloth: string;
  clothDark: string;
  leather: string;
  /** Creature hide. */
  hide: string;
  bone: string;
  /** The one vivid accent: eyes, runes, cracks. */
  glow: string;
  /** White-hot core of the glow. */
  hot: string;
}

export function mix(a: string, b: string, t: number): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

/** A lighter (+) or darker (−) metal variant, registered as metal. */
export function mtl(hex: string, amt: number, level = 0.75): string {
  return metal(shade(hex, amt), level);
}

const WORLD_BASE: { dress: Dress; plate: string; dark: string; edge: string; edgeLevel: number; cloth: string; leather: string; hide: string; bone: string; glow: string; hot: string }[] = [
  // Verdant Wilds: rotting forest, moss-stained iron, toxic green
  { dress: 'rot', plate: '#2b2f2a', dark: '#161915', edge: '#7a7f6c', edgeLevel: 0.82, cloth: '#1f241a', leather: '#2a2219', hide: '#34362c', bone: '#b3a888', glow: '#86ff2e', hot: '#e4ffb8' },
  // Frostfang Tundra: rime-grey steel, icy blue
  { dress: 'frost', plate: '#2c333c', dark: '#171b21', edge: '#a7b8c8', edgeLevel: 0.9, cloth: '#1b212a', leather: '#2a2a2e', hide: '#3b424b', bone: '#d3d8d8', glow: '#5fd2ff', hot: '#e2f8ff' },
  // Emberforge Kingdom: charred steel and gold, ember orange
  { dress: 'ember', plate: '#2e2a27', dark: '#181514', edge: PAL.gold, edgeLevel: 0.9, cloth: '#2b1210', leather: '#2b1d16', hide: '#2a2321', bone: '#a89a80', glow: '#ff4d12', hot: '#ffd08a' },
  // Shattered Bastion: grave steel, bone, spectral green
  { dress: 'grave', plate: '#2f3134', dark: '#18191c', edge: '#8e959c', edgeLevel: 0.85, cloth: '#24201c', leather: '#2b231c', hide: '#3c3833', bone: PAL.bone, glow: '#3dffa2', hot: '#d4ffec' },
  // Umbral Crystal Depths: violet-black steel and gold, violet light
  { dress: 'crystal', plate: '#28232f', dark: '#16131b', edge: PAL.goldLight, edgeLevel: 0.9, cloth: '#1d1526', leather: '#241c26', hide: '#241f2c', bone: '#b8aec4', glow: '#b84dff', hot: '#f0d2ff' },
];

/** The dark look of a world, lightly tinted by its enemy palette. */
export function worldLook(world: number, p: Palette): Look {
  const w = WORLD_BASE[Math.max(0, Math.min(4, Math.round(world) || 0))]!;
  const plate = metal(mix(mix(w.plate, PAL.gunmetal, 0.2), p.primary, 0.05), 0.74);
  const cloth = shade(mix(w.cloth, p.secondary, 0.08), 0.06);
  return {
    world,
    dress: w.dress,
    plate,
    plateHi: mtl(plate, 0.22, 0.82),
    dark: metal(mix(w.dark, p.secondary, 0.04), 0.64),
    edge: metal(w.edge, w.edgeLevel),
    mail: metal('#3a3c40', 0.6),
    cloth,
    clothDark: shade(cloth, -0.35),
    leather: w.leather,
    hide: mix(w.hide, p.primary, 0.06),
    bone: w.bone,
    glow: mix(w.glow, p.accent, 0.15),
    hot: w.hot,
  };
}

// --- Geometry helpers -------------------------------------------------------------------------------

/** Faceted copy (flat normals) for crisp, sharp plate. */
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

/** Applies a placement to a geometry and returns it. */
export function xf(geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  geo.applyMatrix4(_m);
  return geo;
}

const UP = new THREE.Vector3(0, 1, 0);
const vec = (v: V): THREE.Vector3 => new THREE.Vector3(v[0], v[1], v[2]);

/** Cone from base point a to tip b (spikes, claws, teeth, horns). */
export function spikeAB(a: V, b: V, r: number, seg = 5, flatten = 1): THREE.BufferGeometry {
  const A = vec(a);
  const B = vec(b);
  const len = Math.max(0.001, A.distanceTo(B));
  const g = new THREE.ConeGeometry(r, len, seg, 1);
  g.translate(0, len / 2, 0);
  g.scale(1, 1, flatten);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, B.sub(A).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(A, q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Thin tube through points (trim, inlay, veins, string). */
export function lineGeo(points: V[], r: number, radial = 3, r1 = r): THREE.BufferGeometry {
  return taperTube(points, r, r1, radial, Math.max(2, (points.length - 1) * 2));
}

/**
 * Tube along a smooth curve with an elliptical cross-section that changes along its length
 * (creature bodies, necks, limbs, tails). rad = [[width, height], ...] spread evenly from start to
 * end. The width axis stays horizontal for mostly horizontal curves (x for vertical ones).
 */
export function loftGeo(pts: V[], rad: [number, number][], radial = 10, steps = 12, caps = true): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map(vec));
  const dir = vec(pts[pts.length - 1]!).sub(vec(pts[0]!)).normalize();
  const ref = Math.abs(dir.y) > 0.7 ? new THREE.Vector3(0, 0, 1) : UP;
  const pos: number[] = [];
  const idx: number[] = [];
  const ring = radial + 1;
  const sample = (t: number): [number, number] => {
    const f = t * (rad.length - 1);
    const i = Math.min(rad.length - 2, Math.floor(f));
    const u = f - i;
    if (rad.length === 1) return rad[0]!;
    const a = rad[i]!;
    const b = rad[i + 1]!;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  };
  const centres: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = curve.getPointAt(t);
    const T = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(T, ref);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const nrm = new THREE.Vector3().crossVectors(side, T).normalize();
    const [rx, ry] = sample(t);
    centres.push(p);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a) * rx;
      const s = Math.sin(a) * ry;
      pos.push(p.x + side.x * c + nrm.x * s, p.y + side.y * c + nrm.y * s, p.z + side.z * c + nrm.z * s);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j;
      const b = a + ring;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  if (caps) {
    for (const [i, flip] of [
      [0, true],
      [steps, false],
    ] as const) {
      const c = pos.length / 3;
      const p = centres[i]!;
      pos.push(p.x, p.y, p.z);
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

/**
 * Part of a lathed surface: profile [radius, y] swept from phiC − half to phiC + half (phi 0 = +z
 * front, +PI/2 = +x). sz squashes the depth; `peak` lowers the top edge towards the sides
 * (pointed plates), `dip` raises the bottom edge towards the sides.
 */
export function shellGeo(profile: [number, number][], phiC: number, half: number, seg = 6, sz = 1, peak = 0, dip = 0): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)),
    seg,
    phiC - half,
    half * 2,
  );
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const ys = profile.map((q) => q[1]);
  const yMax = Math.max(...ys);
  const yMin = Math.min(...ys);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    let d = Math.atan2(x, z) - phiC;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const f = Math.min(1, Math.abs(d) / half);
    if (peak && Math.abs(y - yMax) < 1e-6) p.setY(i, y - peak * f);
    if (dip && Math.abs(y - yMin) < 1e-6) p.setY(i, y + dip * f);
    p.setZ(i, z * sz);
  }
  g.computeVertexNormals();
  return g;
}

/** Revolved profile as a geometry ([radius, y] bottom → top). */
export function latheGeo(profile: [number, number][], seg = 12, phiStart = 0, phiLen = Math.PI * 2): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)),
    seg,
    phiStart,
    phiLen,
  );
}

/** Radius of a [radius, y] profile at height y. */
export function profR(prof: [number, number][], y: number): number {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1]!;
    const [r1, y1] = prof[i]!;
    if (y <= y1) return r0 + ((r1 - r0) * Math.max(0, y - y0)) / Math.max(1e-6, y1 - y0);
  }
  return prof[prof.length - 1]![0];
}

/** Elliptical arc of points round the y axis. */
export function arcPts(r: number, y: number, phiC: number, half: number, sz: number, seg = 10, dropSides = 0): V[] {
  const pts: V[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const a = phiC - half + t * half * 2;
    pts.push([Math.sin(a) * r, y - dropSides * Math.abs(t - 0.5) * 2, Math.cos(a) * r * sz]);
  }
  return pts;
}

/** Bevelled flat plate in the xy plane (blades, shield faces), centred on its thickness. */
export function plateGeo(shape: THREE.Shape, depth: number, bevel = 0.006, curve = 6): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: curve });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Thin unbevelled extrusion of a shape (glowing inlays seen on both faces of a blade). */
export function slabGeo(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/**
 * Crescent horn or curved blade: a tapered tube flattened along one axis, so it reads as a
 * sharp edge one way and a crescent the other.
 */
export function crescentGeo(points: V[], r0: number, r1: number, flatAxis: 'x' | 'y' | 'z', flatten = 0.4, radial = 5): THREE.BufferGeometry {
  const g = taperTube(points, r0, r1, radial, 10);
  const c = points[0]!;
  g.translate(-c[0], -c[1], -c[2]);
  g.scale(flatAxis === 'x' ? flatten : 1, flatAxis === 'y' ? flatten : 1, flatAxis === 'z' ? flatten : 1);
  g.translate(c[0], c[1], c[2]);
  return g;
}

/** Jagged polyline from a to b (cracks, lightning veins). */
export function jagged(a: V, b: V, n: number, amp: number, seed: number): V[] {
  const r = rnd(seed);
  const out: V[] = [a];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    out.push([a[0] + (b[0] - a[0]) * t + (r() - 0.5) * amp, a[1] + (b[1] - a[1]) * t + (r() - 0.5) * amp, a[2] + (b[2] - a[2]) * t + (r() - 0.5) * amp * 0.3]);
  }
  out.push(b);
  return out;
}

/** Deterministic pseudo-random sequence. */
export function rnd(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Two-sided torn hanging cloth (top edge at y 0), lighter than parts.ragGeo. */
export function clothGeo(w: number, h: number, o: { cols?: number; rows?: number; folds?: number; depth?: number; flare?: number; tatter?: number; seed?: number; curl?: number } = {}): THREE.BufferGeometry {
  const { cols = 8, rows = 5, folds = 2, depth = 0.015, flare = 0.3, tatter = 0.35, seed = 13, curl = 0 } = o;
  const r = rnd(seed);
  const cut = Array.from({ length: cols + 1 }, () => r());
  const front = new THREE.PlaneGeometry(w, h, cols, rows);
  const p = front.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const py = p.getY(i);
    const down = (h / 2 - py) / h;
    const col = Math.round(((px + w / 2) / w) * cols);
    const tear = down > 0.6 ? Math.pow((down - 0.6) / 0.4, 1.4) * tatter * h * (0.25 + cut[col]! * 1.2) : 0;
    p.setXYZ(i, px * (1 + flare * down), py + tear, Math.sin((px / w) * Math.PI * 2 * folds + cut[col]! * 0.8) * depth * (0.3 + down) - down * curl);
  }
  front.translate(0, -h / 2, 0);
  front.computeVertexNormals();
  return front;
}

// --- Glows ------------------------------------------------------------------------------------------

/** Collects glowing pieces per parent and colour; flush() adds one unlit mesh for each. */
export class Glows {
  private sets = new Map<string, { parent: THREE.Object3D; hex: string; lum: number; geos: THREE.BufferGeometry[] }>();
  private ids = new WeakMap<THREE.Object3D, number>();
  private next = 1;
  add(parent: THREE.Object3D, hex: string, lum: number, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): this {
    let id = this.ids.get(parent);
    if (!id) {
      id = this.next++;
      this.ids.set(parent, id);
    }
    const key = `${id}|${hex}|${lum}`;
    let set = this.sets.get(key);
    if (!set) {
      set = { parent, hex, lum, geos: [] };
      this.sets.set(key, set);
    }
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    xf(g, x, y, z, rx, ry, rz, sx, sy, sz);
    set.geos.push(g);
    return this;
  }
  flush(): void {
    for (const s of this.sets.values()) {
      if (!s.geos.length) continue;
      const merged = mergeGeometries(s.geos, false)!;
      s.geos.forEach((g) => g.dispose());
      addGlow(s.parent, merged, s.hex, 0, 0, 0, s.lum);
    }
    this.sets.clear();
  }
}

// --- Small details ----------------------------------------------------------------------------------

export function rivet(k: K, x: number, y: number, z: number, hex: string, r = 0.011): K {
  return k.add(new THREE.OctahedronGeometry(r, 0), hex, x, y, z, 0, 0, 0, 1, 1, 0.7);
}

export function gouge(k: K, len: number, x: number, y: number, z: number, rz: number, ry = 0): K {
  return cbox(k, len, 0.01, 0.008, x, y, z, PAL.void, 0, ry, rz);
}

export function scratch(k: K, len: number, x: number, y: number, z: number, rz: number, ry = 0, hex: string = PAL.steelLight): K {
  return cbox(k, len, 0.005, 0.006, x, y, z, hex, 0, ry, rz);
}

/** Low-poly torus (bands, rims). */
export function band(k: K, r: number, t: number, x: number, y: number, z: number, hex: string, rx = Math.PI / 2, ry = 0, rz = 0, seg = 10, arc = Math.PI * 2): K {
  return k.add(new THREE.TorusGeometry(r, t, 4, seg, arc), hex, x, y, z, rx, ry, rz);
}

/** Leather-wrapped grip along y. */
export function grip(k: K, y0: number, y1: number, r: number, hex: string): void {
  k.add(prismGeo(r, y1 - y0, 6), hex, 0, (y0 + y1) / 2, 0);
  const n = Math.max(1, Math.round((y1 - y0) / 0.07));
  for (let i = 0; i < n; i++) k.add(new THREE.TorusGeometry(r * 1.06, r * 0.25, 3, 6), shade(hex, -0.35), 0, y0 + (i + 0.5) * ((y1 - y0) / n), 0, Math.PI / 2 + 0.25, 0, 0);
}

/** Small cracked skull (belt trophies, bone dressing), facing +z. */
export function skull(k: K, x: number, y: number, z: number, sc: number, bone: string, ry = 0, rx = 0): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (dx: number, dy: number, dz: number): [number, number, number] => [x + (dx * c + dz * s) * sc, y + dy * sc, z + (-dx * s + dz * c) * sc];
  k.ball(0.05 * sc, ...at(0, 0.012, 0), bone, 0.92, 1, 1.05, 8);
  k.add(frustumGeo(0.06 * sc, 0.035 * sc, 0.05 * sc, 1.15), shade(bone, -0.15), ...at(0, -0.035, 0.012), rx, ry, 0);
  for (const sx of [-1, 1]) k.ball(0.014 * sc, ...at(sx * 0.019, 0.006, 0.043), SHADOW, 1, 1.1, 0.6, 5);
  k.add(new THREE.ConeGeometry(0.007 * sc, 0.014 * sc, 3), SHADOW, ...at(0, -0.016, 0.047), Math.PI, ry, 0);
}

// --- Per-world dressing -----------------------------------------------------------------------------

/**
 * World dressing clustered around (x, y, z) on a surface whose outward direction is `out`
 * (unit-ish vector): moss and fungus, frost crust and icicles, ember cracks, bone, crystal shards.
 * `size` scales the cluster (1 ≈ a pauldron).
 */
export function dressAt(k: K, gl: Glows, parent: THREE.Object3D, L: Look, x: number, y: number, z: number, out: V, size = 1, seed = 1): void {
  const r = rnd(seed * 31 + L.world);
  const o = new THREE.Vector3(...out).normalize();
  const sz = size;
  switch (L.dress) {
    case 'rot': {
      // Clumps of dark moss and a shelf fungus, with a few strands of hanging moss
      for (let i = 0; i < 3; i++) {
        const j = (r() - 0.5) * 0.08 * sz;
        k.ball(0.028 * sz * (0.8 + r() * 0.5), x + o.x * 0.01 + j, y + o.y * 0.01 + (r() - 0.5) * 0.04 * sz, z + o.z * 0.01 + (r() - 0.5) * 0.06 * sz, i % 2 ? '#2e3a1d' : '#3b4824', 1.3, 0.6, 1.2, 6);
      }
      for (let i = 0; i < 2; i++) {
        const hx = x + (r() - 0.5) * 0.08 * sz;
        const hz = z + (r() - 0.5) * 0.06 * sz;
        const len = (0.07 + r() * 0.08) * sz;
        k.add(lineGeo([[hx, y, hz], [hx + o.x * 0.012, y - len * 0.5, hz + o.z * 0.012], [hx + o.x * 0.006, y - len, hz + o.z * 0.006]], 0.007 * sz, 3, 0.002), '#2a331b', 0, 0, 0);
      }
      k.add(new THREE.CylinderGeometry(0.03 * sz, 0.012 * sz, 0.012 * sz, 7), '#5b4a33', x + o.x * 0.02, y + 0.02 * sz, z + o.z * 0.02, 0.3 * o.z, 0, -0.3 * o.x);
      break;
    }
    case 'frost': {
      // Rime crust and icicles hanging off the lower edge
      for (let i = 0; i < 3; i++) k.ball(0.026 * sz * (0.8 + r() * 0.5), x + (r() - 0.5) * 0.08 * sz + o.x * 0.01, y + (r() - 0.3) * 0.03 * sz, z + (r() - 0.5) * 0.06 * sz + o.z * 0.01, '#c9dbe6', 1.4, 0.45, 1.2, 6);
      for (let i = 0; i < 3; i++) {
        const ix = x + (r() - 0.5) * 0.1 * sz + o.x * 0.015;
        const iz = z + (r() - 0.5) * 0.08 * sz + o.z * 0.015;
        const len = (0.05 + r() * 0.07) * sz;
        k.add(new THREE.ConeGeometry(0.009 * sz, len, 4), metal('#a9c9dc', 0.5), ix, y - 0.02 * sz - len / 2, iz, Math.PI, 0, 0);
      }
      break;
    }
    case 'ember': {
      // Molten cracks burning through the scorched plate and a few hot rivets
      const a: V = [x + o.x * 0.008, y + 0.03 * sz, z + o.z * 0.008];
      const b: V = [x + o.x * 0.008 + (r() - 0.5) * 0.04 * sz, y - 0.05 * sz, z + o.z * 0.008 + (r() - 0.5) * 0.04 * sz];
      gl.add(parent, L.glow, 3.2, lineGeo(jagged(a, b, 4, 0.03 * sz, seed), 0.0045 * sz, 3));
      gl.add(parent, L.hot, 4, new THREE.OctahedronGeometry(0.008 * sz), x + o.x * 0.012 + 0.02 * sz, y - 0.01 * sz, z + o.z * 0.012);
      k.ball(0.02 * sz, x + o.x * 0.006, y - 0.04 * sz, z + o.z * 0.006, '#120c0a', 1.4, 0.5, 1.2, 5);
      break;
    }
    case 'grave': {
      // A bone spike and a cracked skull trophy
      k.add(spikeAB([x, y, z], [x + o.x * 0.09 * sz, y + 0.05 * sz, z + o.z * 0.09 * sz], 0.013 * sz, 4), L.bone, 0, 0, 0);
      skull(k, x + o.x * 0.04 * sz, y - 0.05 * sz, z + o.z * 0.04 * sz, 0.6 * sz, L.bone, Math.atan2(o.x, o.z));
      break;
    }
    case 'crystal': {
      // Dark crystal shards growing out of the armour, lit from within
      for (let i = 0; i < 3; i++) {
        const len = (0.07 + r() * 0.08) * sz;
        const d: V = [o.x + (r() - 0.5) * 0.9, Math.max(0.3, o.y + 0.6 + r() * 0.4), o.z + (r() - 0.5) * 0.9];
        const base: V = [x + (r() - 0.5) * 0.05 * sz, y, z + (r() - 0.5) * 0.05 * sz];
        const n = new THREE.Vector3(...d).normalize().multiplyScalar(len);
        k.add(spikeAB(base, [base[0] + n.x, base[1] + n.y, base[2] + n.z], 0.018 * sz, 4), metal('#2a1d3c', 0.5), 0, 0, 0);
        gl.add(parent, L.glow, 3, spikeAB([base[0] + n.x * 0.1, base[1] + n.y * 0.1, base[2] + n.z * 0.1], [base[0] + n.x * 0.75, base[1] + n.y * 0.75, base[2] + n.z * 0.75], 0.008 * sz, 3));
      }
      break;
    }
  }
}

// --- Pauldron ---------------------------------------------------------------------------------------

export interface PauldronSpec {
  size: number;
  lames: number;
  plate: string;
  dark: string;
  edge: string | null;
  tilt?: number;
  /** Crescent horns sweeping up off the cop (length; 0 = none). */
  horns?: number;
  /** Spikes along the outer brim. */
  spikes?: number;
  spikeLen?: number;
  /** Raised neck guard height. */
  haute?: number;
}

/**
 * Sharp layered pauldron: faceted cop over the shoulder, pointed lames stepping down the arm with a
 * raised edge, crescent horns and spikes. Arm-pivot coordinates; s = +1 right, −1 left.
 */
export function pauldron(k: K, s: number, p: PauldronSpec): void {
  const R = p.size;
  const tilt = p.tilt ?? 0.45;
  const cx = s * 0.035;
  const cy = -0.02;
  k.add(flat(capGeo(R, Math.PI * 0.5, 10, 4)), p.plate, cx, cy, 0, 0, 0, -s * tilt, 1.05, 0.8, 1.2);
  k.add(flat(capGeo(R * 0.76, Math.PI * 0.34, 9, 2)), p.dark, cx + s * R * 0.14, cy + R * 0.22, 0, 0, 0, -s * (tilt + 0.12), 1.05, 1.0, 1.12);
  if (p.edge) k.add(new THREE.TorusGeometry(R * 1.04, 0.008, 3, 14), p.edge, cx, cy, 0, Math.PI / 2, -s * tilt, 0, 1, 1.18, 1);
  for (let i = 0; i < p.lames; i++) {
    const y = -0.07 - i * 0.055;
    const rl = R * 0.86 - i * 0.008;
    const half = 1.5;
    const g = shellGeo(
      [
        [rl * 1.1, y - 0.075],
        [rl * 0.99, y - 0.03],
        [rl * 0.92, y + 0.035],
      ],
      (s * Math.PI) / 2,
      half,
      8,
      1.1,
      0.05,
      -0.025,
    );
    const ox = s * (0.025 + i * 0.006);
    const lean = -s * (0.1 + i * 0.035);
    k.add(flat(g), i % 2 ? p.plate : p.dark, ox, 0, 0, 0, 0, lean);
    if (p.edge && i === p.lames - 1) {
      const pts: V[] = [];
      for (let j = 0; j <= 8; j++) {
        const a = (s * Math.PI) / 2 - half + (j / 8) * half * 2;
        const f = Math.abs(j / 8 - 0.5) * 2;
        pts.push([Math.sin(a) * rl * 1.105, y - 0.075 + 0.025 * f, Math.cos(a) * rl * 1.105 * 1.1]);
      }
      k.add(lineGeo(pts, 0.006), p.edge, ox, 0, 0, 0, 0, lean);
    }
  }
  const tx = cx + s * R * 0.45;
  const ty = cy + R * 0.55;
  if (p.horns) {
    // Crescent horns: a big one and a smaller one behind it, sweeping up and outward
    for (const [sc, dz] of [
      [1, 0.03],
      [0.6, -0.08],
    ] as const) {
      const l = p.horns * sc;
      k.add(
        crescentGeo(
          [
            [tx, ty - 0.02, dz],
            [tx + s * l * 0.38, ty + l * 0.25, dz - 0.01],
            [tx + s * l * 0.42, ty + l * 0.66, dz - 0.03],
            [tx + s * l * 0.12, ty + l, dz - 0.05],
          ],
          0.034 * Math.sqrt(sc),
          0.002,
          'z',
          0.42,
          5,
        ),
        p.dark,
        0,
        0,
        0,
      );
    }
  }
  if (p.spikes) {
    const L = p.spikeLen ?? 0.15;
    for (let i = 0; i < p.spikes; i++) {
      const a = ((i + 0.5) / p.spikes - 0.5) * 1.9;
      const bz = Math.sin(a) * R * 0.9;
      const bx = cx + s * R * 0.62;
      const by = cy + R * 0.42;
      k.add(spikeAB([bx, by, bz], [bx + s * L * 0.75, by + L * 0.65, bz * 1.25], 0.022, 5), p.dark, 0, 0, 0);
    }
  }
  if (p.haute) k.add(flat(frustumGeo(0.022, p.haute, R * 1.3, 0.6, 0.8)), p.dark, cx - s * R * 0.45, cy + p.haute * 0.45 + 0.02, 0, 0, 0, -s * 0.12);
}

// --- Humanoid body ----------------------------------------------------------------------------------

export const NECK_Y = 1.66;

/** Cuirass profile [radius, y] (× bulk): broad chest over a narrow waist. */
const CHEST: [number, number][] = [
  [0.165, 1.0],
  [0.172, 1.1],
  [0.208, 1.24],
  [0.24, 1.37],
  [0.238, 1.46],
  [0.2, 1.55],
  [0.118, 1.61],
];
export const CHEST_SZ = 0.74;

export interface FiendOpts {
  attack: Rig['attack'];
  bulk?: number;
  tall?: number;
  look: Look;
  /** Arm pivot spread (× 0.26 · bulk). */
  shoulder?: number;
}

/**
 * A lean, armoured humanoid for the enemy troops. The constructor sets up the pivots; the body
 * parts are drawn by chest(), arms() and legs(), the unit adds its own helm, pauldrons, weapons
 * and details into the kits, and finish() meshes everything.
 */
export class Fiend {
  readonly rig: Rig;
  readonly b: number;
  readonly tall: number;
  readonly L: Look;
  readonly frame: THREE.Group;
  readonly neck: THREE.Group;
  readonly headGroup: THREE.Group;
  readonly torso = new K();
  readonly head = new K();
  readonly armR = new K();
  readonly armL = new K();
  readonly legR = new K();
  readonly legL = new K();
  readonly handR: THREE.Group;
  readonly handL: THREE.Group;
  readonly gl = new Glows();
  readonly prof: [number, number][];
  private kits: [THREE.Object3D, K][] = [];

  constructor(o: FiendOpts) {
    this.rig = newRig('biped', o.attack);
    this.b = o.bulk ?? 1;
    this.tall = o.tall ?? 1;
    this.L = o.look;
    this.frame = pivot(this.rig.body, 0, 0, 0);
    this.frame.scale.setScalar(this.tall);
    this.neck = pivot(this.frame, 0, NECK_Y, 0);
    this.rig.neck = this.neck;
    this.headGroup = pivot(this.neck, 0, -NECK_Y, 0);
    this.rig.head = this.headGroup;
    this.prof = CHEST.map(([r, y]) => [r * this.b, y]);
    for (const s of [1, -1]) {
      const lp = pivot(this.frame, s * 0.118 * this.b, 1.0, 0);
      this.rig.legs.push(lp);
      this.kits.push([lp, s > 0 ? this.legR : this.legL]);
    }
    const sw = (o.shoulder ?? 1) * 0.26 * this.b;
    const ar = pivot(this.frame, sw, 1.56, 0);
    const al = pivot(this.frame, -sw, 1.56, 0);
    this.rig.armR = ar;
    this.rig.armL = al;
    this.handR = pivot(ar, 0, -0.66, 0.03);
    this.handL = pivot(al, 0, -0.66, 0.03);
    this.kits.push([this.frame, this.torso], [this.headGroup, this.head], [ar, this.armR], [al, this.armL]);
  }

  arm(s: number): K {
    return s > 0 ? this.armR : this.armL;
  }

  leg(s: number): K {
    return s > 0 ? this.legR : this.legL;
  }

  /** A new kit on its own pivot (weapons, shields, quivers). */
  kit(parent: THREE.Object3D, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): { g: THREE.Group; k: K } {
    const g = pivot(parent, x, y, z);
    g.rotation.set(rx, ry, rz);
    const k = new K();
    this.kits.push([g, k]);
    return { g, k };
  }

  /** Point on the cuirass: a = angle (0 front, +PI/2 right), y = height. */
  onChest(a: number, y: number, out = 0.004): V {
    const r = profR(this.prof, y) + out;
    return [Math.sin(a) * r, y, Math.cos(a) * r * CHEST_SZ];
  }

  /** Outward yaw of the cuirass surface at angle a. */
  chestYaw(a: number): number {
    return Math.atan2(Math.sin(a), Math.cos(a) / CHEST_SZ);
  }

  /** Glowing piece on a group. */
  glow(parent: THREE.Object3D, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, lum = 4, hex = this.L.glow, rx = 0, ry = 0, rz = 0): void {
    this.gl.add(parent, hex, lum, geo, x, y, z, rx, ry, rz);
  }

  /**
   * Cuirass with layered pectoral plates and a keel, pointed plackart, gorget, faulds with raised
   * edges, belt and an optional mail skirt. kind 'leather' draws a studded jerkin instead.
   */
  chest(o: { kind?: 'plate' | 'leather'; faulds?: number; mailSkirt?: boolean; lines?: boolean } = {}): void {
    const k = this.torso;
    const b = this.b;
    const L = this.L;
    const kind = o.kind ?? 'plate';
    const prof = this.prof;
    const main = kind === 'plate' ? L.plate : L.leather;
    const under = kind === 'plate' ? L.dark : shade(L.leather, -0.35);
    k.add(prismGeo(0.16 * b, 0.5, 8, 1.2), L.clothDark, 0, 1.25, 0, 0, 0, 0, 1, 1, 0.8);
    k.add(latheGeo(prof, 14), main, 0, 0, 0.006, 0, 0, 0, 1, 1, CHEST_SZ);
    if (kind === 'plate') {
      // Pectoral plates layered over the cuirass, each with a raised lower edge
      for (const s of [-1, 1]) {
        const pp: [number, number][] = [
          [0.215 * b, 1.3],
          [0.243 * b, 1.38],
          [0.236 * b, 1.47],
          [0.2 * b, 1.54],
        ];
        const phiC = s * 0.52;
        const half = 0.62;
        k.add(shellGeo(pp, phiC, half, 7, CHEST_SZ * 1.04, 0, 0.035), s > 0 ? L.plate : mtl(L.plate, -0.08), 0, 0, 0.012);
        if (o.lines ?? true) {
          const line: V[] = [];
          for (let j = 0; j <= 7; j++) {
            const a = phiC - half + (j / 7) * half * 2;
            const f = Math.min(1, Math.abs(a - phiC) / half);
            const y = 1.3 + 0.035 * f + 0.004;
            const r = profR(pp, y) + 0.004;
            line.push([Math.sin(a) * r, y, Math.cos(a) * r * CHEST_SZ * 1.04 + 0.012]);
          }
          k.add(lineGeo(line, 0.0055), L.edge, 0, 0, 0);
        }
      }
      // Keel down the centre and a pointed plackart over the belly
      k.add(lineGeo([this.onChest(0, 1.06, 0.022), this.onChest(0, 1.26, 0.028), this.onChest(0, 1.4, 0.032), this.onChest(0, 1.52, 0.022)], 0.009, 4), L.plateHi, 0, 0, 0);
      k.add(shellGeo([[0.19 * b, 1.03], [0.2 * b, 1.13], [0.222 * b, 1.27]], 0, 0.95, 6, CHEST_SZ * 1.06, 0.11), under, 0, 0, 0.012);
      // Rivets
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) rivet(this.torso, ...this.onChest(s * 0.98, 1.2 + i * 0.1, 0.01), L.edge);
      // Damage
      {
        const [x, y, z] = this.onChest(0.4, 1.42, 0.02);
        gouge(k, 0.1, x, y, z, 0.55, this.chestYaw(0.4));
        const [x2, y2, z2] = this.onChest(-0.35, 1.22, 0.015);
        scratch(k, 0.08, x2, y2, z2, -0.4, this.chestYaw(-0.35));
      }
    } else {
      // Jerkin: overlapping leather plates, a diagonal strap with studs
      for (let i = 0; i < 3; i++) {
        const y = 1.12 + i * 0.12;
        k.add(shellGeo([[profR(prof, y) + 0.01, y], [profR(prof, y + 0.12) + 0.01, y + 0.12]], 0, Math.PI, 12, CHEST_SZ, 0, 0), i % 2 ? main : shade(main, -0.2), 0, 0, 0.006);
      }
    }
    // Gorget lames
    k.add(latheGeo([[0.17 * b, 1.55], [0.155 * b, 1.6], [0.1 * b, 1.66], [0.088 * b, 1.68]], 12), under, 0, 0, 0, 0, 0, 0, 1, 1, 0.92);
    k.add(latheGeo([[0.098 * b, 1.63], [0.09 * b, 1.7], [0.08 * b, 1.73]], 12), main, 0, 0, 0, 0, 0, 0, 1, 1, 0.95);
    // Faulds
    const nf = o.faulds ?? 2;
    for (let i = 0; i < nf; i++) {
      const y = 1.06 - i * 0.065;
      const r0 = (0.21 + i * 0.016) * b;
      k.add(shellGeo([[r0, y - 0.085], [(0.183 + i * 0.016) * b, y]], 0, Math.PI, 14, 0.82, 0, i === nf - 1 ? 0.03 : 0), i % 2 ? under : main, 0, 0, 0);
      if (kind === 'plate') k.add(lineGeo(arcPts(r0 + 0.003, y - 0.085, 0, Math.PI, 0.82, 12), 0.005), L.edge, 0, 0, 0);
    }
    if (o.mailSkirt) k.add(latheGeo([[0.23 * b, 0.8], [0.215 * b, 0.9], [0.19 * b, 1.0]], 10), L.mail, 0, 0, 0, 0, 0, 0, 1, 1, 0.84);
    // Belt with a buckle
    k.add(latheGeo([[0.194 * b, 1.04], [0.196 * b, 1.09]], 10), shade(L.leather, -0.2), 0, 0, 0, 0, 0, 0, 1, 1, 0.83);
    cbox(k, 0.06, 0.06, 0.022, 0, 1.065, 0.163 * b, L.edge);
    cbox(k, 0.03, 0.03, 0.026, 0, 1.065, 0.166 * b, SHADOW);
  }

  /** Plate (or leather) arms with couters, vambraces and gauntlets. */
  arms(kind: 'plate' | 'leather' = 'plate'): void {
    const L = this.L;
    for (const s of [1, -1]) {
      const k = this.arm(s);
      const w = 0.072 * Math.sqrt(this.b);
      const main = kind === 'plate' ? L.plate : L.leather;
      const dk = kind === 'plate' ? L.dark : shade(L.leather, -0.35);
      k.add(prismGeo(w * 0.92, 0.36, 6), kind === 'plate' ? L.mail : L.clothDark, 0, -0.16, 0);
      k.add(latheGeo([[w * 1.02, -0.31], [w * 1.12, -0.2], [w * 1.06, -0.1]], 9), main, 0, 0, 0);
      // Couter with a back spike
      k.add(flat(capGeo(w * 1.25, Math.PI * 0.5, 8, 3)), main, 0, -0.33, -0.012, -Math.PI / 2 - 0.25, 0, 0);
      if (kind === 'plate') k.add(spikeAB([0, -0.33, -w * 1.1], [0, -0.3, -w * 1.1 - 0.08], 0.016, 4), dk, 0, 0, 0);
      // Vambrace flaring into a pointed cuff
      k.add(latheGeo([[w * 0.98, -0.585], [w * 1.05, -0.5], [w * 1.12, -0.41], [w * 1.03, -0.35]], 9), main, 0, 0, 0);
      k.add(shellGeo([[w * 1.45, -0.6], [w * 1.1, -0.5]], (s * Math.PI) / 2, 1.3, 6, 1, 0, -0.05), dk, 0, 0, 0);
      if (kind === 'plate') k.add(lineGeo([[0, -0.56, w * 1.12], [0, -0.44, w * 1.18], [0, -0.37, w * 1.08]], 0.006), L.plateHi, 0, 0, 0);
      else for (let i = 0; i < 3; i++) band(k, w * 1.12, 0.007, 0, -0.39 - i * 0.06, 0, dk, Math.PI / 2, 0, 0, 8);
      // Gauntlet: knuckle plate, curled fingers, thumb
      k.add(frustumGeo(w * 1.55, 0.095, w * 1.15, 0.9, 0.85), dk, 0, -0.655, 0.008);
      k.add(frustumGeo(w * 1.5, 0.026, w * 0.35, 1), main, 0, -0.69, w * 0.55);
      k.add(frustumGeo(w * 1.4, 0.075, w * 1.25, 0.9, 0.8), shade(dk, -0.2), 0, -0.735, 0.03, 0.35, 0, 0);
      cbox(k, w * 0.42, 0.08, w * 0.42, -s * w * 0.78, -0.69, w * 0.5, dk, 0.35, 0, s * 0.35);
    }
  }

  /** Plate legs (cuisse, spiked poleyn, greave, pointed sabaton) or leather legs with greaves. */
  legs(kind: 'plate' | 'leather' = 'plate'): void {
    const L = this.L;
    const lb = Math.pow(this.b, 0.75);
    for (const s of [1, -1]) {
      const k = this.leg(s);
      const plate = kind === 'plate';
      const main = plate ? L.plate : shade(L.leather, -0.1);
      k.add(prismGeo(0.07 * lb, 0.62, 6, 1.15), plate ? L.mail : L.clothDark, 0, -0.38, 0);
      k.add(latheGeo([[0.072 * lb, -0.47], [0.092 * lb, -0.36], [0.102 * lb, -0.2], [0.098 * lb, -0.05], [0.08 * lb, 0.04]], 9), main, 0, 0, 0.006, 0, 0, 0, 1, 1, 1.06);
      // Knee cop with a forward spike
      k.add(flat(capGeo(0.075 * lb, Math.PI * 0.5, 8, 3)), plate ? L.plateHi : L.dark, 0, -0.505, 0.045 * lb, Math.PI / 2 - 0.1, 0, 0, 1, 1, 0.8);
      k.add(spikeAB([0, -0.49, 0.1 * lb], [0, -0.46, 0.17 * lb], 0.018, 4), L.dark, 0, 0, 0);
      // Greave with calf swell and a front ridge
      k.add(latheGeo([[0.054 * lb, -0.935], [0.06 * lb, -0.86], [0.075 * lb, -0.74], [0.078 * lb, -0.66], [0.066 * lb, -0.56]], 9), plate ? L.plate : L.dark, 0, 0, 0, 0, 0, 0, 1, 1, 1.1);
      k.add(lineGeo([[0, -0.88, 0.068 * lb], [0, -0.74, 0.088 * lb], [0, -0.6, 0.076 * lb]], 0.006), L.plateHi, 0, 0, 0);
      // Sabaton: sole, instep lames and a pointed toe
      k.add(frustumGeo(0.105 * lb, 0.045, 0.27, 0.9, 0.92), SHADOW, 0, -0.977, 0.05);
      k.add(frustumGeo(0.1 * lb, 0.07, 0.11, 0.85, 0.7), L.dark, 0, -0.93, 0.0);
      for (let i = 0; i < 2; i++) k.add(frustumGeo((0.1 - i * 0.006) * lb, 0.028, 0.07, 0.85, 0.75), i % 2 ? L.dark : main, 0, -0.935 - i * 0.012, 0.07 + i * 0.05, 0.35);
      k.add(new THREE.ConeGeometry(0.045 * lb, 0.11, 4), main, 0, -0.965, 0.21, Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.5);
      // Tasset over the outer thigh
      k.add(flat(shellGeo([[0.13 * lb, -0.13], [0.115 * lb, -0.01]], s * 0.5, 1.0, 5, 0.95, 0, 0.03)), plate ? L.dark : shade(L.leather, -0.2), 0, 0, 0.01);
    }
  }

  /** Long torn cape on the cape pivot, optionally with a heavy mantle over the shoulders. */
  cape(o: { color: string; w?: number; h?: number; seed?: number; tatter?: number; folds?: number; flare?: number; curl?: number; mantle?: boolean; trim?: string | null }): K {
    const b = this.b;
    const cp = pivot(this.frame, 0, 1.585, -0.2 * b - 0.014);
    this.rig.cape = cp;
    const k = new K();
    this.kits.push([cp, k]);
    const w = (o.w ?? 0.6) * b;
    k.add(ragGeo(w, o.h ?? 1.3, { folds: o.folds ?? 3, depth: 0.05, flare: o.flare ?? 0.45, tatter: o.tatter ?? 0.45, seed: o.seed ?? 31, curl: o.curl ?? 0.18 }), o.color, 0, 0, 0);
    if (o.trim) k.add(new THREE.CylinderGeometry(0.015, 0.015, w * 0.96, 6), o.trim, 0, -0.012, 0.006, 0, 0, Math.PI / 2);
    if (o.mantle) {
      this.torso.add(shellGeo([[0.3 * b, 1.36], [0.29 * b, 1.47], [0.25 * b, 1.56], [0.17 * b, 1.63]], Math.PI, 1.75, 12, 0.86, 0, -0.06), o.color, 0, 0, -0.006);
    }
    return k;
  }

  finish(top: number): Rig {
    for (const [p, k] of this.kits) if (!k.empty) addMesh(this.rig, p, k);
    this.gl.flush();
    this.rig.height = top * this.tall + 0.04;
    return this.rig;
  }
}

/** Polygon outline in the xy plane. */
export const shape = shapeFrom;

// --- Extra shaping ----------------------------------------------------------------------------------

/** Sweeps the part of a geometry above y0 forward by k per unit of height (pointed hoods, helms). */
export function sweep(geo: THREE.BufferGeometry, y0: number, k: number): THREE.BufferGeometry {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > y0) p.setZ(i, p.getZ(i) + (y - y0) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Triangle fan from a hub over an open outline (wing membranes, webbing). */
export function fanGeo(hub: V, outline: V[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let i = 0; i < outline.length - 1; i++) pos.push(...hub, ...outline[i]!, ...outline[i + 1]!);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Single triangle. */
export function triGeo(a: V, b: V, c: V): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  g.computeVertexNormals();
  return g;
}

/** Point on a lathed surface of radius r at angle phi (0 = front, +PI/2 = +x), depth × sz. */
export const onLathe = (r: number, phi: number, y: number, sz = 1): V => [Math.sin(phi) * r, y, Math.cos(phi) * r * sz];

export const lerpV = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
