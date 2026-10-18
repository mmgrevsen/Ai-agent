import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { K, shade, shapeFrom, taperTube, type V } from '../../../base3d/sculpt';
import { metal } from '../parts';
import { armBase, glow, type GlowPart, HR, hood, latheArc, legBase, SHADOW, skirtHalf, slitEyes, span, surfGeo, surfLine, visorSurf, type Hunter } from './_hunters';

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
  /** Radial segments per half (default 7; more = smoother hem). */
  seg?: number;
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
      { frontGap: o.innerGap ?? 0.06, backGap: 0.02, tatter: o.tatter ?? 0.12, seed: o.seed ?? 5, seg: o.seg ?? 7, depth: 0.82 },
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
        { frontGap: outerHem ? (o.outerGap ?? 0.42) + 0.01 : (o.innerGap ?? 0.06) + 0.01, backGap: 0.03, tatter: (o.tatter ?? 0.12) * 1.6, seed: (o.seed ?? 5) + 11, seg: o.seg ?? 7, depth: outerHem ? 0.865 : 0.825 },
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
        { frontGap: o.outerGap ?? 0.42, backGap: 0.04, tatter: (o.tatter ?? 0.12) * 1.5, seed: (o.seed ?? 5) + 3, seg: o.seg ?? 7, depth: 0.86 },
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

// --- Wraith-knight armour (client reference set: hooded, spiked, glowing sigils) -----------------------

/** Glossy near-black caster plate (registered as metal: the shader adds engraved filigree). */
export const CPLATE = metal('#25262d', 0.74);
/** Raised ridges and plate edges. */
export const CPLATE_HI = metal('#4b4f59', 0.8);
/** Recessed under-plates. */
export const CPLATE_DK = metal('#17181d', 0.66);

export interface VisorHoodLook {
  cloth: string;
  edge?: string;
  /** Visor plate colours. */
  plate: string;
  hi: string;
  /** Edge trim on the visor (default muted gold). */
  trim?: string;
  /** Glowing eye slits. */
  eye: string;
  eyeLum?: number;
  /** Forward projection of the pointed visor (head radii). */
  keel?: number;
  /** Rise of the hood's pointed peak (head radii, 0 = rounded hood). */
  peak?: number;
  /** Forward hook of the peak. */
  hook?: number;
  size?: number;
  open?: number;
  tail?: number;
  forward?: number;
}

/**
 * Deep hood over a sharply pointed closed visor with two narrow glowing slits (the wraith knight's
 * face): the visor sits back in the hood's shadow, its keel catching the light. Returns the top.
 */
export function visorHood(h: Hunter, o: VisorHoodLook): { top: number; surf: (phi: number, t: number) => V } {
  const k = h.head;
  const r = HR;
  const size = o.size ?? 1.1;
  let top = hood(k, { cloth: o.cloth, edge: o.edge, open: o.open ?? 0.74, tail: o.tail ?? 0.5, size, forward: o.forward ?? 0.3, faceZ: -0.15, overhang: 0.42 });
  const f = visorSurf({ size: 0.9, keel: o.keel ?? 0.55, keelT: 0.42, chin: 0.55, cheek: 0.22, z: 0.0 });
  k.add(surfGeo(f, 10, 7, -1.45, 2.9, 0.02, 0.86), o.plate, 0, 0, 0);
  // Medial ridge down the keel and a brow ridge over the slits
  surfLine(k, f, [[0, 0.05], [0, 0.3], [0, 0.45], [0, 0.82]], 0.007, o.hi, 0.001);
  for (const s of [-1, 1]) surfLine(k, f, [[s * 0.08, 0.64], [s * 0.45, 0.6], [s * 0.8, 0.66]], 0.005, o.hi, 0.001);
  // Gold edging round the visor's face so its pointed shape reads inside the hood's shadow
  for (const s of [-1, 1]) surfLine(k, f, [[s * 0.05, 0.04], [s * 0.6, 0.12], [s * 1.05, 0.34], [s * 1.2, 0.62], [s * 0.9, 0.84], [s * 0.05, 0.86]], 0.0045, o.trim ?? '#8f7130', 0.001);
  slitEyes(h.headGroup, k, f, o.eye, { phi: 0.36, t: 0.53, w: r * 0.42, h: r * 0.07, tilt: 0.38, lum: o.eyeLum ?? 6 });
  const peak = o.peak ?? 0;
  if (peak > 0) {
    const hook = o.hook ?? 0.3;
    const R = r * size;
    k.add(
      taperTube(
        [
          [0, top - R * 0.5, -R * 0.2],
          [0, top + R * peak * 0.35, -R * 0.12],
          [0, top + R * peak * 0.75, R * hook * 0.4],
          [0, top + R * peak, R * hook],
        ],
        R * 0.5,
        0.004,
        6,
        8,
      ),
      o.cloth,
      0,
      0,
      0,
      0,
      0,
      0,
      0.85,
      1,
      1,
    );
    top += R * peak;
  }
  return { top, surf: f };
}

/** Crescent blade outline in its plane: grows along +y, bends towards +x, pointed tip. */
export function crescentShape(len: number, w: number, bend: number, n = 7): THREE.Shape {
  const spine: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    spine.push([bend * len * t * t, len * t]);
  }
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = spine[i]!;
    const q = spine[Math.min(n, i + 1)]!;
    const pr = spine[Math.max(0, i - 1)]!;
    let dx = q[0] - pr[0];
    let dy = q[1] - pr[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const ww = (w / 2) * Math.pow(1 - t, 0.75);
    outer.push([p[0] + dy * ww, p[1] - dx * ww]);
    inner.push([p[0] - dy * ww, p[1] + dx * ww]);
  }
  return shapeFrom([...outer, ...inner.slice(0, n).reverse()]);
}

/** Bevelled crescent blade (pauldron horns, crown points, staff hooks). */
export function crescentGeo(len: number, w: number, bend: number, thick = 0.01): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(crescentShape(len, w, bend), { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.45, bevelSize: thick * 0.45, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -thick / 2);
  g.deleteAttribute('uv');
  return g;
}

export interface SpikedPauldronLook {
  r?: number;
  lames?: number;
  plate: string;
  hi: string;
  trim?: string | null;
  /** Crescent blades sweeping up off the top cop: [length, bend, x offset, roll] each. */
  blades?: [number, number, number, number][];
  bladeHex?: string;
  /** Short thorns along the lowest lame. */
  thorns?: number;
  tilt?: number;
}

/**
 * Layered pauldron of overlapping curved lames (gold-rimmed) crowned with crescent blades that
 * sweep up and out (the wraith knight's horned shoulders). Drawn into an arm kit.
 */
export function spikedPauldron(k: K, s: number, o: SpikedPauldronLook): void {
  const r0 = o.r ?? 0.15;
  const n = o.lames ?? 3;
  const th = Math.PI * 0.42;
  for (let i = 0; i < n; i++) {
    const r = r0 * (1 - i * 0.07);
    const x = s * (0.035 + i * 0.018);
    const y = 0.05 - i * 0.06;
    const rz = -s * (0.32 + i * 0.14 + (o.tilt ?? 0));
    const sc: [number, number, number] = [1.12, 0.62, 1.2];
    k.add(new THREE.SphereGeometry(r, 12, 3, 0, Math.PI * 2, 0, th), i % 2 ? o.hi : o.plate, x, y, 0, 0, 0, rz, ...sc);
    if (o.trim !== null) {
      const rim = new THREE.TorusGeometry(r * Math.sin(th), 0.006 / sc[1], 3, 11).rotateX(Math.PI / 2).translate(0, r * Math.cos(th), 0);
      k.add(rim, o.trim ?? '#8f7130', x, y, 0, 0, 0, rz, ...sc);
    }
  }
  // Ridge over the top cop
  k.add(new THREE.ConeGeometry(0.02, r0 * 1.9, 4), o.hi, s * 0.06, 0.1, 0, Math.PI / 2, 0, -s * 0.32, 1, 1, 0.4);
  for (const [len, bend, dx, roll] of o.blades ?? []) {
    k.add(crescentGeo(len, len * 0.22, bend, 0.012), o.bladeHex ?? o.hi, s * (0.08 + dx), 0.08, -0.02 - dx * 0.3, roll, s > 0 ? 0 : Math.PI, -0.25);
  }
  for (let i = 0; i < (o.thorns ?? 0); i++) {
    const a = -0.9 + (1.8 * i) / Math.max(1, (o.thorns ?? 1) - 1);
    k.add(new THREE.ConeGeometry(0.013, 0.08, 4), o.hi, s * (0.15 + Math.cos(a) * 0.02), -0.07, Math.sin(a) * 0.13, Math.sin(a) * 0.5, 0, -s * 1.9);
  }
}

/** Glowing sigil from strokes [ax, ay, bx, by] in a plane facing +z (merged glow). */
export function sigil(parent: THREE.Object3D, hex: string, lum: number, strokes: [number, number, number, number][], w: number, x: number, y: number, z: number, rx = 0): THREE.Mesh {
  const parts: GlowPart[] = strokes.map(([ax, ay, bx, by]) => {
    const len = Math.hypot(bx - ax, by - ay);
    const g = new THREE.BoxGeometry(w, len + w * 0.6, 0.004);
    g.rotateZ(Math.atan2(-(bx - ax), by - ay));
    g.translate((ax + bx) / 2, (ay + by) / 2, 0);
    g.rotateX(rx);
    return [g, x, y, z] as GlowPart;
  });
  return glow(parent, hex, lum, parts);
}

/** Small bone skull (belt trophies): cranium, cheekbones, jaw and black eye sockets. */
export function skull(k: K, x: number, y: number, z: number, sc: number, bone: string, rx = 0, ry = 0): void {
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  const at = (dx: number, dy: number, dz: number): V => [x + dx * c + dz * sn, y + dy * Math.cos(rx) - dz * Math.sin(rx), z - dx * sn + dz * c];
  k.add(new THREE.SphereGeometry(sc, 8, 6), bone, ...at(0, sc * 0.2, 0), rx, ry, 0, 0.88, 0.95, 1);
  k.add(new THREE.BoxGeometry(sc * 1.1, sc * 0.55, sc * 0.9), shade(bone, -0.1), ...at(0, -sc * 0.45, sc * 0.12), rx, ry, 0);
  k.add(new THREE.BoxGeometry(sc * 0.8, sc * 0.35, sc * 0.7), shade(bone, -0.2), ...at(0, -sc * 0.85, sc * 0.1), rx, ry, 0);
  for (const s of [-1, 1]) k.add(new THREE.SphereGeometry(sc * 0.26, 5, 4), SHADOW, ...at(s * sc * 0.34, -sc * 0.12, sc * 0.72), rx, ry, 0, 1, 0.85, 0.6);
  k.add(new THREE.ConeGeometry(sc * 0.12, sc * 0.25, 3), SHADOW, ...at(0, -sc * 0.42, sc * 0.6), rx + Math.PI, ry, 0);
}

/**
 * Torn shoulder capelet open at the front (unlike a full mantle) so the breastplate and its sigil
 * show between the two halves, as in the wraith-knight reference. On the torso kit.
 */
export function capelet(k: K, b: number, hex: string, o: { bottom?: number; width?: number; gap?: number; tatter?: number; seed?: number; seg?: number } = {}): K {
  const y0 = o.bottom ?? 1.27;
  const w = (o.width ?? 0.35) * b;
  const gap = o.gap ?? 0.9;
  return k.add(
    latheArc(
      [
        [w, y0],
        [w * 0.97, y0 + 0.1],
        [w * 0.86, 1.5],
        [w * 0.62, 1.6],
        [0.1, 1.68],
      ],
      o.seg ?? 12,
      gap,
      Math.PI * 2 - gap * 2,
      o.tatter ?? 0.12,
      o.seed ?? 11,
    ),
    hex,
    0,
    0,
    -0.01,
    0,
    0,
    0,
    1,
    1,
    0.72,
  );
}

/** Glowing seam along the torn hem of a robe half on a leg pivot (smouldering or frost-lit edge). */
export function hemGlow(h: Hunter, hex: string, lum: number, o: { r: number; y: number; gap?: number; depth?: number; seed?: number; w?: number }): void {
  h.rig.legs.forEach((leg, li) => {
    const s = li === 0 ? -1 : 1;
    const gf = o.gap ?? 0.45;
    const start = s > 0 ? gf : Math.PI + 0.05;
    const len = Math.PI - gf - 0.05;
    const r = rnd((o.seed ?? 3) + li * 13);
    const pts: V[] = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const phi = start + (len * i) / n;
      const y = o.y + (r() - 0.3) * 0.05;
      pts.push([-s * h.legX + Math.sin(phi) * o.r, y, Math.cos(phi) * o.r * (o.depth ?? 0.86)]);
    }
    glow(leg, hex, lum, [[boltGeo(pts, o.w ?? 0.006, (o.w ?? 0.006) * 0.6), 0, 0, 0]]);
  });
}
