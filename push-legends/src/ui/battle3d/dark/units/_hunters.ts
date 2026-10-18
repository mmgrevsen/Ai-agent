import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from '../../../art/darkArt';
import { K, shade, shapeFrom, taperTube, type V } from '../../../base3d/sculpt';
import { glowMaterial } from '../../../base3d/style';
import { addMesh, newRig, pivot, type Rig } from '../../rig';
import { cbox, frustumGeo, HEAD_R, HEAD_Y, metal } from '../parts';

/**
 * Shared anatomy for the lean, cloth-and-leather humanoids (rangers, marksman, assassin, sapper,
 * surgeon): tapered limbs instead of boxes, coat skirts hung on the legs so they swing with the
 * stride, open hoods with a shadowed face, straps, quivers and merged glow meshes.
 *
 * Same conventions as parts.ts (feet at y 0, facing +z, right hand = +x, hips y 1.0, shoulders
 * y 1.56, neck pivot y 1.66, head centre y 1.81) so the battle animations drive these rigs exactly
 * like `warrior()`.
 */

export const SHADOW = '#08080a';
export const NECK_Y = 1.66;
export const HR = HEAD_R;
export const HY = HEAD_Y;

const rnd = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
};

// --- Rig skeleton ----------------------------------------------------------------------------------

export interface HunterOpts {
  attack: Rig['attack'];
  /** Width factor (0.9 lean, 1 normal, 1.15 stocky). */
  bulk?: number;
  /** Height factor applied to the whole frame. */
  tall?: number;
  /** Head pivot pushed forward of the shoulders (hunched, predatory). */
  neckZ?: number;
  /** Shoulder pivot distance from the spine before bulk (default 0.25). */
  shoulder?: number;
}

/** Pivot tree and kits for one humanoid; draw into the kits, then call finish(). */
export class Hunter {
  readonly rig: Rig;
  readonly b: number;
  readonly tall: number;
  readonly frame: THREE.Group;
  readonly neck: THREE.Group;
  readonly headGroup: THREE.Group;
  /** Body frame kit (hips y 1.0, shoulders y 1.56). */
  readonly torso = new K();
  /** Head kit (head centre at (0, HY, 0)). */
  readonly head = new K();
  readonly armR = new K();
  readonly armL = new K();
  readonly legR = new K();
  readonly legL = new K();
  readonly handR: THREE.Group;
  readonly handL: THREE.Group;
  readonly legX: number;
  readonly shoulderX: number;
  private readonly kits: [THREE.Object3D, K][] = [];

  constructor(o: HunterOpts) {
    this.rig = newRig('biped', o.attack);
    this.b = o.bulk ?? 1;
    this.tall = o.tall ?? 1;
    this.frame = pivot(this.rig.body, 0, 0, 0);
    this.frame.scale.setScalar(this.tall);
    this.neck = pivot(this.frame, 0, NECK_Y, o.neckZ ?? 0);
    this.rig.neck = this.neck;
    this.headGroup = pivot(this.neck, 0, -NECK_Y, 0);
    this.rig.head = this.headGroup;
    this.legX = 0.11 * this.b;
    this.shoulderX = (o.shoulder ?? 0.25) * this.b;
    for (const s of [-1, 1]) {
      const lp = pivot(this.frame, s * this.legX, 1.0, 0);
      this.rig.legs.push(lp);
      this.kits.push([lp, s > 0 ? this.legR : this.legL]);
    }
    const ar = pivot(this.frame, this.shoulderX, 1.56, 0);
    const al = pivot(this.frame, -this.shoulderX, 1.56, 0);
    this.rig.armR = ar;
    this.rig.armL = al;
    this.handR = pivot(ar, 0, -0.66, 0.03);
    this.handL = pivot(al, 0, -0.66, 0.03);
    this.kits.push([this.frame, this.torso], [this.headGroup, this.head], [ar, this.armR], [al, this.armL]);
  }

  leg(s: number): K {
    return s > 0 ? this.legR : this.legL;
  }

  arm(s: number): K {
    return s > 0 ? this.armR : this.armL;
  }

  hand(s: number): THREE.Group {
    return s > 0 ? this.handR : this.handL;
  }

  /** A new kit on its own (rotated) pivot under `parent`; meshed by finish(). */
  kit(parent: THREE.Object3D, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): { g: THREE.Group; k: K } {
    const g = pivot(parent, x, y, z);
    g.rotation.set(rx, ry, rz);
    const k = new K();
    this.kits.push([g, k]);
    return { g, k };
  }

  /** Cape pivot (swung by the battle animation) with its kit. */
  cape(x: number, y: number, z: number): K {
    const cp = pivot(this.frame, x, y, z);
    this.rig.cape = cp;
    const k = new K();
    this.kits.push([cp, k]);
    return k;
  }

  finish(top: number): Rig {
    for (const [p, k] of this.kits) if (!k.empty) addMesh(this.rig, p, k);
    this.rig.height = top * this.tall + 0.05;
    return this.rig;
  }
}

// --- Geometry helpers ------------------------------------------------------------------------------

/** Lathe over part of the circle (phi from +z towards +x), optionally with a torn bottom edge. */
export function latheArc(profile: [number, number][], seg: number, phiStart = 0, phiLen = Math.PI * 2, tatter = 0, seed = 1): THREE.BufferGeometry {
  const geo = new THREE.LatheGeometry(
    profile.map(([x, y]) => new THREE.Vector2(x, y)),
    seg,
    phiStart,
    phiLen,
  );
  if (tatter > 0) {
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const r = rnd(seed);
    const n = profile.length;
    const cuts = Array.from({ length: seg + 1 }, () => r());
    if (phiLen >= Math.PI * 2 - 1e-3) cuts[seg] = cuts[0]!;
    for (let i = 0; i <= seg; i++) {
      const c = cuts[i]!;
      p.setY(i * n, p.getY(i * n) + c * tatter);
      if (n > 2) p.setY(i * n + 1, p.getY(i * n + 1) + c * tatter * 0.3);
    }
    geo.computeVertexNormals();
  }
  return geo;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _d = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

/** Adds a geometry built along +y (length given) so that it spans from a to b. */
export function span(k: K, a: V, b: V, make: (len: number) => THREE.BufferGeometry, hex: string, roll = 0): K {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = Math.max(1e-4, _d.length());
  _d.multiplyScalar(1 / len);
  _q.setFromUnitVectors(_up, _d);
  if (roll) _q.multiply(_q2.setFromAxisAngle(_up, roll));
  _e.setFromQuaternion(_q, 'XYZ');
  return k.add(make(len), hex, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, _e.x, _e.y, _e.z);
}

/** Flat strap (w wide, t thick) from a to b. */
export function strap(k: K, a: V, b: V, w: number, t: number, hex: string, roll = 0): K {
  return span(k, a, b, (l) => new THREE.BoxGeometry(w, l, t), hex, roll);
}

/** Round rod from a to b (shafts, chains, tubes). */
export function rod(k: K, a: V, b: V, r: number, hex: string, seg = 6, r2 = r): K {
  return span(k, a, b, (l) => new THREE.CylinderGeometry(r2, r, l, seg), hex);
}

/** A chain of strap segments through several points (belts across the chest, cords). */
export function strapPath(k: K, pts: V[], w: number, t: number, hex: string): K {
  for (let i = 1; i < pts.length; i++) strap(k, pts[i - 1]!, pts[i]!, w, t, hex);
  return k;
}

export type GlowPart = [THREE.BufferGeometry, number, number, number, number?, number?, number?];

/** Several glowing pieces merged into ONE unlit mesh (one draw call) under `parent`. */
export function glow(parent: THREE.Object3D, hex: string, lum: number, parts: GlowPart[]): THREE.Mesh {
  const geos = parts.map(([g, x, y, z, rx = 0, ry = 0, rz = 0]) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    for (const key of Object.keys(n.attributes)) if (key !== 'position' && key !== 'normal') n.deleteAttribute(key);
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    n.applyMatrix4(_m.compose(_p, _q, _s));
    return n;
  });
  const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos)!;
  const mesh = new THREE.Mesh(merged, glowMaterial(hex, lum));
  parent.add(mesh);
  return mesh;
}

// --- Anatomy ---------------------------------------------------------------------------------------

/** Torso radius profile [radius, y] of the bare body (scaled by bulk; depth is 0.66 of width). */
const TORSO: [number, number][] = [
  [0.14, 0.93],
  [0.15, 1.03],
  [0.142, 1.14],
  [0.158, 1.27],
  [0.184, 1.41],
  [0.194, 1.5],
  [0.172, 1.58],
  [0.09, 1.645],
];
export const TORSO_DEPTH = 0.66;

export function torsoR(y: number): number {
  if (y <= TORSO[0]![1]) return TORSO[0]![0];
  for (let i = 1; i < TORSO.length; i++) {
    const [r1, y1] = TORSO[i]!;
    const [r0, y0] = TORSO[i - 1]!;
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return TORSO[TORSO.length - 1]![0];
}

/** z of the front surface of the bare torso at height y (for placing straps and plates). */
export function chestZ(b: number, y: number, grow = 0): number {
  return torsoR(y) * b * TORSO_DEPTH + grow;
}

/** Pelvis, waist, chest and neck: the base everything else is layered over. */
export function torsoBase(k: K, b: number, o: { shirt: string; trousers: string; neck?: string }): void {
  k.add(frustumGeo(0.29 * b, 0.2, 0.19 * b, 1.08, 1.05), o.trousers, 0, 1.0, 0);
  k.lathe(
    TORSO.map(([r, y]) => [r * b, y]),
    0,
    0,
    0,
    o.shirt,
    10,
    1,
    TORSO_DEPTH,
  );
  k.add(new THREE.CylinderGeometry(0.046, 0.054, 0.14, 8), o.neck ?? PAL.cloth, 0, 1.69, 0.005);
}

/**
 * A layer that follows the torso between y0 and y1, `grow` thicker (jerkins, coats, brigandines).
 * flare widens the bottom; phiStart/phiLen leave an opening (phi 0 = front).
 */
export function shell(
  k: K,
  b: number,
  hex: string,
  y0: number,
  y1: number,
  grow = 0.025,
  o: { seg?: number; flare?: number; phiStart?: number; phiLen?: number; tatter?: number; seed?: number; z?: number } = {},
): K {
  const pts: [number, number][] = [];
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const y = y0 + ((y1 - y0) * i) / steps;
    pts.push([(torsoR(y) * b + grow) * (1 + (o.flare ?? 0) * (1 - i / steps)), y]);
  }
  const rm = 0.18 * b;
  const sz = (rm * TORSO_DEPTH + grow) / (rm + grow);
  return k.add(latheArc(pts, o.seg ?? 10, o.phiStart ?? 0, o.phiLen ?? Math.PI * 2, o.tatter ?? 0, o.seed ?? 3), hex, 0, 0, o.z ?? 0, 0, 0, 0, 1, 1, sz);
}

export interface LegLook {
  trousers: string;
  boot: string;
  sole?: string;
  /** Knee bend in radians (thigh forward, shin back); feet stay under the hip. */
  bend?: number;
  /** Boot cuff colour, or null for none. */
  cuff?: string | null;
}

/** Thigh, knee, calf in a tall boot and an angular foot, in a leg pivot kit (hip at 0, sole −1). */
export function legBase(k: K, b: number, o: LegLook): { knee: V; ankle: V; bend: number; shin: V } {
  const bend = o.bend ?? 0.05;
  const c = Math.cos(bend);
  const s = Math.sin(bend);
  const lt = 0.47 / c;
  const ls = 0.455 / c;
  const w = Math.sqrt(b);
  k.lathe(
    [
      [0.058 * w, -lt],
      [0.068 * w, -lt * 0.82],
      [0.084 * w, -lt * 0.45],
      [0.09 * w, -lt * 0.15],
      [0.082 * w, 0.05],
    ],
    0,
    0,
    0,
    o.trousers,
    8,
    1,
    0.92,
    -bend,
  );
  const knee: V = [0, -lt * c, lt * s];
  k.ball(0.058 * w, 0, knee[1], knee[2] + 0.004, o.trousers, 1, 1, 1, 8);
  k.lathe(
    [
      [0.045 * w, -ls],
      [0.05 * w, -ls * 0.86],
      [0.063 * w, -ls * 0.56],
      [0.066 * w, -ls * 0.36],
      [0.06 * w, -ls * 0.12],
      [0.062 * w, 0.0],
    ],
    knee[0],
    knee[1],
    knee[2],
    o.boot,
    8,
    1,
    0.95,
    bend,
  );
  const ankle: V = [0, knee[1] - ls * c, knee[2] - ls * s];
  const shin: V = [0, -c, -s];
  if (o.cuff !== null) k.add(new THREE.CylinderGeometry(0.08 * w, 0.066 * w, 0.1, 8, 1, true), o.cuff ?? shade(o.boot, 0.1), 0, knee[1] - 0.07 * c, knee[2] - 0.07 * s + 0.004, bend - 0.12, 0, 0);
  const fz = ankle[2] + 0.04;
  k.add(frustumGeo(0.1 * w, 0.085, 0.25, 0.8, 0.66), o.boot, 0, -0.955, fz);
  k.add(new THREE.ConeGeometry(0.05 * w, 0.09, 4), o.boot, 0, -0.965, fz + 0.15, Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.55);
  cbox(k, 0.104 * w, 0.024, 0.27, 0, -0.988, fz + 0.012, o.sole ?? PAL.leatherDark);
  return { knee, ankle, bend, shin };
}

/** Point along the shin: t = 0 at the knee, 1 at the ankle; `out` pushes it forward (+z). */
export function onShin(l: { knee: V; ankle: V }, t: number, out = 0): V {
  return [0, l.knee[1] + (l.ankle[1] - l.knee[1]) * t, l.knee[2] + (l.ankle[2] - l.knee[2]) * t + out];
}

export interface ArmLook {
  sleeve: string;
  glove: string;
  forearm?: string;
  /** Glove cuff width factor (gauntlet flare). */
  cuff?: number;
}

/** Deltoid, upper arm, elbow, forearm and a gloved hand in an arm pivot kit (wrist at y −0.6). */
export function armBase(k: K, s: number, b: number, o: ArmLook): void {
  const w = Math.sqrt(b);
  const fa = o.forearm ?? o.sleeve;
  k.ball(0.074 * w, s * 0.008, -0.025, 0, o.sleeve, 1, 1.05, 1.05, 8);
  k.lathe(
    [
      [0.047 * w, -0.33],
      [0.051 * w, -0.26],
      [0.058 * w, -0.13],
      [0.064 * w, -0.04],
    ],
    0,
    0,
    0,
    o.sleeve,
    8,
    1,
    0.95,
  );
  k.ball(0.047 * w, 0, -0.33, -0.004, fa, 1, 1, 1, 7);
  k.lathe(
    [
      [0.035 * w, -0.585],
      [0.042 * w, -0.5],
      [0.05 * w, -0.41],
      [0.047 * w, -0.34],
    ],
    0,
    0,
    0,
    fa,
    8,
    1,
    0.9,
  );
  hand(k, s, w, o.glove, o.cuff ?? 1);
}

/** Gloved hand closed around a grip (palm faces inwards), with a flared cuff. */
export function hand(k: K, s: number, w: number, hex: string, cuff = 1): void {
  k.add(frustumGeo(0.085 * w * cuff, 0.07, 0.08 * w * cuff, 1.2, 1.15), shade(hex, 0.05), 0, -0.57, 0);
  k.add(frustumGeo(0.036 * w, 0.085, 0.072 * w, 0.85, 1.05), hex, 0, -0.645, 0.006);
  cbox(k, 0.044 * w, 0.052, 0.07 * w, -s * 0.006, -0.705, 0.014, shade(hex, -0.12), 0.3, 0, 0);
  cbox(k, 0.024, 0.05, 0.026, -s * 0.016, -0.655, 0.046 * w, hex, 0.5, 0, -s * 0.35);
}

/**
 * Half of a coat skirt hung on a leg pivot, so the coat parts and swings with the stride.
 * profile: [radius, y] bottom → top in leg coordinates (hip at 0), around the body's centre line.
 */
export function skirtHalf(
  k: K,
  s: number,
  legX: number,
  hex: string,
  profile: [number, number][],
  o: { frontGap?: number; backGap?: number; seg?: number; tatter?: number; seed?: number; depth?: number } = {},
): K {
  const gf = o.frontGap ?? 0.3;
  const gb = o.backGap ?? 0.12;
  const len = Math.PI - gf - gb;
  const start = s > 0 ? gf : Math.PI + gb;
  return k.add(latheArc(profile, o.seg ?? 7, start, len, o.tatter ?? 0.1, (o.seed ?? 5) + (s > 0 ? 0 : 7)), hex, -s * legX, 0, 0, 0, 0, 0, 1, 1, o.depth ?? 0.8);
}

/**
 * Low-poly torn cloth strip (scarf tails, sash ends, tassels): top edge at y 0, hanging down,
 * single-sided (the rig material is double-sided).
 */
export function ragGeoN(w: number, h: number, seed = 1, cols = 3, rows = 4, depth = 0.015): THREE.BufferGeometry {
  const r = rnd(seed * 7 + 1);
  const geo = new THREE.PlaneGeometry(w, h, cols, rows);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const cut = Array.from({ length: cols + 1 }, () => r());
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const py = p.getY(i);
    const down = (h / 2 - py) / h;
    const col = Math.round(((px + w / 2) / w) * cols);
    const c = cut[col]!;
    p.setY(i, py + (down > 0.99 ? c * h * 0.22 : 0));
    p.setX(i, px * (1 - down * 0.2));
    p.setZ(i, Math.sin((px / w) * Math.PI * 2 + c * 2) * depth * (0.3 + down) - down * 0.04);
  }
  geo.computeVertexNormals();
  geo.translate(0, -h / 2, 0);
  return geo;
}

/** Torn cloth mantle over the shoulders (on the torso). */
export function mantle(k: K, b: number, hex: string, o: { bottom?: number; width?: number; tatter?: number; seed?: number; seg?: number } = {}): K {
  const y0 = o.bottom ?? 1.27;
  const w = (o.width ?? 0.34) * b;
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
      0,
      Math.PI * 2,
      o.tatter ?? 0.1,
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

// --- Heads -----------------------------------------------------------------------------------------

export interface HoodLook {
  cloth: string;
  /** Rolled front edge colour. */
  edge?: string;
  /** Half-angle of the face opening (radians). */
  open?: number;
  /** Length of the point hanging down the back (0 = none). */
  tail?: number;
  /** Close the hood under the face with a wrap (mask wearers). */
  wrap?: string | null;
  /** Overall size. */
  size?: number;
  /** Pulls the hood forward over the face (deeper shadow, recessed mask). */
  forward?: number;
  /** z of the shadowed face (move back when a mask sits in the opening). */
  faceZ?: number;
  /** Forward tilt of the rolled front edge. */
  overhang?: number;
}

/**
 * Deep hood open at the front over a face of pure shadow; masks and eyes go into the opening
 * (front at about z = 0.9·HR). Returns the top of the hood.
 */
export function hood(k: K, o: HoodLook): number {
  const r = HR * (o.size ?? 1);
  const open = o.open ?? 0.85;
  const fw = (o.forward ?? 0) * HR;
  k.ball(HR * 0.96, 0, HY - HR * 0.02, (o.faceZ ?? 0.06) * HR, SHADOW, 1, 1.12, 1, 10);
  const prof: [number, number][] = [
    [r * 1.55, -r * 1.3],
    [r * 1.45, -r * 0.65],
    [r * 1.33, r * 0.15],
    [r * 1.12, r * 0.78],
    [r * 0.62, r * 1.28],
    [0.001, r * 1.46],
  ];
  k.add(latheArc(prof, 10, open, Math.PI * 2 - open * 2), o.cloth, 0, HY, -r * 0.14 + fw, 0, 0, 0, 0.94, 1, 1.1);
  // Rolled, overhanging front edge around the face
  const edge = o.edge ?? shade(o.cloth, -0.18);
  k.add(new THREE.TorusGeometry(r * 1.0, r * 0.1, 5, 12, Math.PI + 0.9), edge, 0, HY + r * 0.02, r * 0.68 + fw, o.overhang ?? 0.32, 0, -0.45, 1, 1.28, 1);
  if (o.wrap !== null && o.wrap !== undefined) {
    k.add(
      latheArc(
        [
          [r * 1.5, -r * 1.32],
          [r * 1.32, -r * 0.95],
          [r * 1.02, -r * 0.42],
        ],
        10,
      ),
      o.wrap,
      0,
      HY,
      0.0,
      0,
      0,
      0,
      0.94,
      1,
      1.0,
    );
  }
  const tail = o.tail ?? 0.6;
  if (tail > 0)
    k.curve(
      [
        [0, HY + r * 1.25, -r * 0.55],
        [0, HY + r * 1.2, -r * (0.9 + tail)],
        [0, HY + r * (0.9 - tail * 0.6), -r * (1.25 + tail * 0.9)],
      ],
      r * 0.3,
      0.008,
      o.cloth,
      6,
    );
  return HY + r * 1.46;
}

// --- Gear ------------------------------------------------------------------------------------------

/** Arrow or bolt from the nock (a) to the head (b): shaft, steel head and fletching. */
export function arrow(k: K, a: V, b: V, o: { shaft?: string; head?: string; fletch?: string; r?: number; headLen?: number } = {}): void {
  const r = o.r ?? 0.007;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const hl = o.headLen ?? 0.08;
  const t = 1 - hl / len;
  const neck: V = [a[0] + dx * t, a[1] + dy * t, a[2] + dz * t];
  rod(k, a, neck, r, o.shaft ?? PAL.wood, 4);
  span(k, neck, b, (l) => new THREE.ConeGeometry(r * 3.2, l, 4).rotateY(Math.PI / 4), o.head ?? PAL.steel);
  const f = 0.12 / len;
  const f1: V = [a[0] + dx * f, a[1] + dy * f, a[2] + dz * f];
  for (const roll of [0, Math.PI / 1.5, -Math.PI / 1.5]) span(k, a, f1, (l) => new THREE.BoxGeometry(r * 5, l, 0.003).translate(r * 2.6, 0, 0), o.fletch ?? PAL.boneDark, roll);
}

/** Small studs (rivets) in a grid on a plane facing +z (8 triangles each). */
export function studs(k: K, hex: string, xs: number[], ys: number[], z: (x: number, y: number) => number, r = 0.011): void {
  for (const x of xs) for (const y of ys) k.add(new THREE.OctahedronGeometry(r), hex, x, y, z(x, y), 0, 0, 0, 1, 1, 0.6);
}

/** Cheap strap band around a limb or shaft (open 8-sided ring, 16 triangles; k.ring costs 240). */
export function band(k: K, r: number, w: number, x: number, y: number, z: number, hex: string, rx = 0, ry = 0, rz = 0, seg = 8): K {
  return k.add(new THREE.CylinderGeometry(r, r, w, seg, 1, true), hex, x, y, z, rx, ry, rz);
}

/** Low-poly torus (rims, rolled edges). */
export function hoop(k: K, r: number, tube: number, x: number, y: number, z: number, hex: string, rx = Math.PI / 2, ry = 0, rz = 0, seg = 10, arc = Math.PI * 2): K {
  return k.add(new THREE.TorusGeometry(r, tube, 4, seg, arc), hex, x, y, z, rx, ry, rz);
}

/** Blend two palette colours. */
export function mix(a: string, b: string, t: number): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

/** Thin dark gouge on a surface (battle damage). */
export function gouge(k: K, x: number, y: number, z: number, len: number, rz: number, ry = 0): void {
  cbox(k, len, 0.009, 0.008, x, y, z, PAL.void, 0, ry, rz);
}

// --- Dark ornate plate (client reference set) ----------------------------------------------------
// Glossy near-black plate with gold inlay, sculpted pointed visors, crescent pauldrons and heavy
// capes. Metal at level >= 0.6 also gets the shader's engraved filigree, so ONYX reads as ornate.

/** Near-black glossy plate. */
export const ONYX = metal('#24262d', 0.74);
/** Raised ridges and plate edges (a touch lighter so the forms read). */
export const ONYX_HI = metal('#4c505b', 0.8);
/** Recessed under-plates. */
export const ONYX_DK = metal('#17181d', 0.66);
export const GILT = PAL.gold;
export const GILT_HI = PAL.goldLight;

/** Surface sampled as f(phi, t): phi 0 = front (+z) turning towards +x, t 0 → 1 bottom → top. */
export type Surf = (phi: number, t: number) => V;

/** Grid mesh of a sampled surface (outward faces when f winds like a lathe). */
export function surfGeo(f: Surf, nPhi: number, nT: number, phi0 = 0, phiLen = Math.PI * 2, t0 = 0, t1 = 1): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nT; j++) for (let i = 0; i <= nPhi; i++) pos.push(...f(phi0 + (phiLen * i) / nPhi, t0 + ((t1 - t0) * j) / nT));
  const row = nPhi + 1;
  for (let j = 0; j < nT; j++)
    for (let i = 0; i < nPhi; i++) {
      const a = j * row + i;
      const b = a + row;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A point on a surface pushed `out` along its rough outward direction. */
export function onSurf(f: Surf, phi: number, t: number, out = 0): V {
  const p = f(phi, t);
  return [p[0] + Math.sin(phi) * out, p[1], p[2] + Math.cos(phi) * out];
}

/** Thin tube through points with few segments (inlay lines, piping): far cheaper than K.curve. */
export function line(k: K, pts: V[], r: number, hex: string, radial = 3, r1 = r * 0.8): K {
  return k.add(taperTube(pts, r, r1, radial, Math.max(3, (pts.length - 1) * 3)), hex, 0, 0, 0);
}

/** Thin raised line following a surface (gold inlay, ridges). pts: [phi, t]. */
export function surfLine(k: K, f: Surf, pts: [number, number][], r: number, hex: string, out = 0.003, radial = 3): K {
  return line(
    k,
    pts.map(([p, t]) => onSurf(f, p, t, out + r * 0.5)),
    r,
    hex,
    radial,
  );
}

function interp(prof: [number, number][], t: number): number {
  if (t <= prof[0]![0]) return prof[0]![1];
  for (let i = 1; i < prof.length; i++) {
    const [t1, v1] = prof[i]!;
    const [t0, v0] = prof[i - 1]!;
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return prof[prof.length - 1]![1];
}

export interface HelmLook {
  /** Size factor on the head radius. */
  size?: number;
  /** Forward projection of the pointed visor (in head radii). */
  keel?: number;
  /** Height (t) of the visor point. */
  keelT?: number;
  /** Swept-back spire at the crown (in head radii): tall pointed helms. */
  peak?: number;
  /** Bottom front pulled down into a pointed chin guard. */
  chin?: number;
  /** Sideways flattening of the cheeks (angular face). */
  cheek?: number;
  /** z offset of the whole helm. */
  z?: number;
  /** Radius profile [t, r] in head radii, bottom (t 0) → top (t 1). */
  profile?: [number, number][];
}

const HELM_PROFILE: [number, number][] = [
  [0, 0.88],
  [0.14, 1.0],
  [0.34, 1.07],
  [0.55, 1.08],
  [0.72, 0.99],
  [0.86, 0.74],
  [0.95, 0.42],
  [1, 0.04],
];

/** Sculpted closed helm with a pointed visor ridge (head centre at HY): returns its surface. */
export function visorSurf(o: HelmLook = {}): Surf {
  const R = HR * (o.size ?? 1);
  const keel = o.keel ?? 0.5;
  const kt = o.keelT ?? 0.4;
  const peak = o.peak ?? 0;
  const chin = o.chin ?? 0.25;
  const cheek = o.cheek ?? 0.12;
  const prof = o.profile ?? HELM_PROFILE;
  const z0 = o.z ?? 0;
  return (phi, t) => {
    const rr = interp(prof, t) * R;
    const c = Math.cos(phi);
    const front = Math.max(0, c);
    const f5 = front ** 5;
    const bump = Math.exp(-(((t - kt) / 0.26) ** 2));
    let y = HY + R * (-1.12 + 2.42 * t);
    let z = rr * c * 1.06 + R * keel * f5 * bump + z0;
    const x = rr * Math.sin(phi) * (1 - cheek * front);
    if (t < 0.22) y -= R * chin * front ** 6 * (1 - t / 0.22);
    if (t > 0.55 && peak > 0) {
      const u = ((t - 0.55) / 0.45) ** 2;
      y += R * peak * u;
      z -= R * peak * 0.45 * u;
    }
    return [x, y, z];
  };
}

/** Two angled glowing eye slits on a helm surface (V-shaped, outer ends raised). */
export function slitEyes(parent: THREE.Object3D, k: K, f: Surf, hex: string, o: { phi?: number; t?: number; w?: number; h?: number; tilt?: number; lum?: number } = {}): THREE.Mesh {
  const phi = o.phi ?? 0.42;
  const t = o.t ?? 0.52;
  const w = o.w ?? HR * 0.5;
  const h = o.h ?? HR * 0.065;
  const tilt = o.tilt ?? 0.32;
  const parts: GlowPart[] = [];
  for (const s of [-1, 1]) {
    const p = onSurf(f, s * phi, t, 0.004);
    const q = onSurf(f, s * phi, t, 0.001);
    cbox(k, w * 1.12, h * 2.1, 0.012, q[0], q[1], q[2], SHADOW, 0, s * phi, -s * tilt);
    parts.push([new THREE.BoxGeometry(w, h, 0.006), p[0], p[1], p[2], 0, s * phi, -s * tilt]);
  }
  return glow(parent, hex, o.lum ?? 6, parts);
}

/** Swept blade crest standing on the helm's midline; shape x runs backwards, y up. */
export function crest(k: K, pts: [number, number][], y: number, z: number, hex: string, thick = 0.012): K {
  return k.plate(shapeFrom(pts), thick, thick * 0.4, 0, y, z, hex, 0, Math.PI / 2, 0);
}

export interface PauldronLook {
  r?: number;
  lames?: number;
  plate?: string;
  hi?: string;
  trim?: string;
  /** Crescent horn length (0 = none). */
  horn?: number;
  /** Small spikes along the lower lame. */
  spikes?: number;
  /** Extra outward tilt. */
  tilt?: number;
}

/** Layered crescent pauldron with gold-edged lames and a swept horn, drawn into an arm kit. */
export function crescentPauldron(k: K, s: number, o: PauldronLook = {}): void {
  const r0 = o.r ?? 0.15;
  const n = o.lames ?? 3;
  const plate = o.plate ?? ONYX;
  const hi = o.hi ?? ONYX_HI;
  const trim = o.trim ?? GILT;
  const th = Math.PI * 0.42;
  for (let i = 0; i < n; i++) {
    const r = r0 * (1 - i * 0.07);
    const x = s * (0.035 + i * 0.016);
    const y = 0.05 - i * 0.062;
    const rz = -s * (0.32 + i * 0.13 + (o.tilt ?? 0));
    const sc: [number, number, number] = [1.12, 0.62, 1.2];
    k.add(new THREE.SphereGeometry(r, 14, 3, 0, Math.PI * 2, 0, th), i % 2 ? hi : plate, x, y, 0, 0, 0, rz, ...sc);
    const rim = new THREE.TorusGeometry(r * Math.sin(th), 0.0065 / sc[1], 3, 12).rotateX(Math.PI / 2).translate(0, r * Math.cos(th), 0);
    k.add(rim, trim, x, y, 0, 0, 0, rz, ...sc);
  }
  // Raised ridge over the top cop
  k.add(new THREE.ConeGeometry(0.02, r0 * 2.0, 4), hi, s * 0.06, 0.1, 0, Math.PI / 2, 0, -s * 0.3, 1, 1, 0.4);
  const horn = o.horn ?? 0.3;
  if (horn > 0) {
    const h = horn;
    line(
      k,
      [
        [s * 0.07, 0.09, -0.01],
        [s * (0.1 + h * 0.4), 0.12 + h * 0.2, -0.03],
        [s * (0.12 + h * 0.62), 0.12 + h * 0.62, -0.04],
        [s * (0.08 + h * 0.5), 0.12 + h * 1.0, -0.03],
      ],
      0.028,
      hi,
      5,
      0.002,
    );
    line(
      k,
      [
        [s * 0.09, 0.07, -0.07],
        [s * (0.12 + h * 0.4), 0.08 + h * 0.15, -0.1],
        [s * (0.13 + h * 0.5), 0.08 + h * 0.5, -0.11],
      ],
      0.02,
      plate,
      4,
      0.002,
    );
  }
  const sp = o.spikes ?? 0;
  for (let i = 0; i < sp; i++) {
    const a = -0.9 + (1.8 * i) / Math.max(1, sp - 1);
    k.add(new THREE.ConeGeometry(0.014, 0.09, 4), hi, s * (0.14 + Math.cos(a) * 0.02), -0.06, Math.sin(a) * 0.13, Math.sin(a) * 0.5, 0, -s * 1.9);
  }
}

/** Point on the torso surface at (x, y), `grow` outside the bare body (front if z >= 0). */
export function onTorso(b: number, x: number, y: number, grow = 0, back = false): V {
  const rx = torsoR(y) * b + grow;
  const rm = 0.18 * b;
  const sz = (rm * TORSO_DEPTH + grow) / (rm + grow);
  const u = Math.min(0.98, Math.abs(x) / rx);
  const z = rx * sz * Math.sqrt(1 - u * u);
  return [x, y, back ? -z : z];
}

/** Gold inlay line across the torso front through (x, y) points. */
export function torsoLine(k: K, b: number, pts: [number, number][], grow: number, r = 0.0035, hex: string = GILT, back = false): K {
  return line(
    k,
    pts.map(([x, y]) => onTorso(b, x, y, grow + r * 0.6, back)),
    r,
    hex,
  );
}

export interface CuirassLook {
  plate?: string;
  hi?: string;
  dark?: string;
  trim?: string;
  /** Top and bottom of the breastplate. */
  y0?: number;
  y1?: number;
  grow?: number;
  /** Abdominal lames under the breastplate. */
  lames?: number;
  /** Gold chevron inlays down the chest. */
  chevrons?: number;
  /** Plate back as well as front. */
  back?: boolean;
}

/** Fitted, glossy black breastplate with a medial ridge, gold inlay and stepped lames. */
export function cuirass(t: K, b: number, o: CuirassLook = {}): { grow: number } {
  const plate = o.plate ?? ONYX;
  const hi = o.hi ?? ONYX_HI;
  const dark = o.dark ?? ONYX_DK;
  const trim = o.trim ?? GILT;
  const y0 = o.y0 ?? 1.3;
  const y1 = o.y1 ?? 1.6;
  const g = o.grow ?? 0.032;
  shell(t, b, plate, y0, y1, g, { seg: 20, phiStart: o.back ? 0 : -1.5, phiLen: o.back ? Math.PI * 2 : 3.0 });
  // Medial ridge
  t.add(frustumGeo(0.024, y1 - y0 - 0.04, 0.03, 0.45, 0.6), hi, 0, (y0 + y1) / 2 - 0.01, onTorso(b, 0, (y0 + y1) / 2, g)[2] + 0.004);
  // Gold edge along the bottom of the breastplate (pointed down at the centre)
  torsoLine(
    t,
    b,
    [
      [-0.17 * b, y0 + 0.05],
      [-0.08 * b, y0 + 0.01],
      [0, y0 - 0.02],
      [0.08 * b, y0 + 0.01],
      [0.17 * b, y0 + 0.05],
    ],
    g,
    0.005,
    trim,
  );
  for (let i = 0; i < (o.chevrons ?? 2); i++) {
    const yy = y0 + 0.08 + i * 0.085;
    const w = (0.12 - i * 0.012) * b;
    torsoLine(t, b, [[-w, yy + 0.07], [-w * 0.5, yy + 0.03], [-0.012, yy]], g, 0.0032, trim);
    torsoLine(t, b, [[w, yy + 0.07], [w * 0.5, yy + 0.03], [0.012, yy]], g, 0.0032, trim);
  }
  const n = o.lames ?? 3;
  for (let i = 0; i < n; i++) {
    const ya = y0 - 0.02 - (i + 1) * 0.062;
    shell(t, b, i % 2 ? dark : hi, ya, ya + 0.07, g - 0.004 + i * 0.002, { seg: 14, phiStart: -1.25, phiLen: 2.5 });
    torsoLine(t, b, [[-0.14 * b, ya + 0.004], [0, ya - 0.004], [0.14 * b, ya + 0.004]], g + i * 0.002, 0.0028, trim);
  }
  return { grow: g };
}

/** Steel collar (gorget) rising around the throat, with a gold rim. */
export function gorget(t: K, hex: string = ONYX, trim: string = GILT, h = 0.1, r = 0.12): void {
  t.add(new THREE.CylinderGeometry(r * 0.82, r * 1.15, h, 16, 1, true), hex, 0, 1.6 + h / 2, 0.0, 0, 0, 0, 1, 1, 0.92);
  hoop(t, r * 0.82, 0.006, 0, 1.6 + h, 0, trim, Math.PI / 2, 0, 0, 12);
}

export interface PlateLimbLook {
  plate?: string;
  hi?: string;
  trim?: string;
  /** Spike projecting from the elbow / knee. */
  spike?: number;
}

/** Couter with a back spike, flared vambrace with gold rims (arm kit, wrist at y −0.6). */
export function plateForearm(k: K, s: number, o: PlateLimbLook = {}): void {
  const plate = o.plate ?? ONYX;
  const hi = o.hi ?? ONYX_HI;
  const trim = o.trim ?? GILT;
  k.lathe(
    [
      [0.044, -0.6],
      [0.05, -0.52],
      [0.058, -0.42],
      [0.064, -0.37],
    ],
    0,
    0,
    0,
    plate,
    12,
    1,
    0.92,
  );
  hoop(k, 0.046, 0.005, 0, -0.595, 0, trim, Math.PI / 2, 0, 0, 8);
  hoop(k, 0.064, 0.005, 0, -0.372, 0, trim, Math.PI / 2, 0, 0, 8);
  // Flared, pointed upper edge on the outside of the vambrace
  k.add(new THREE.ConeGeometry(0.03, 0.12, 4), hi, s * 0.045, -0.35, -0.01, 0, 0, -s * 0.25, 1, 1, 0.35);
  // Couter (elbow cop) with a spike
  k.add(new THREE.SphereGeometry(0.06, 10, 3, 0, Math.PI * 2, 0, Math.PI * 0.5), hi, 0, -0.33, -0.015, -Math.PI / 2 - 0.25, 0, 0, 1, 1, 0.8);
  if ((o.spike ?? 0.1) > 0) k.add(new THREE.ConeGeometry(0.018, o.spike ?? 0.1, 5), plate, 0, -0.33, -0.08, -Math.PI / 2 - 0.5, 0, 0);
}

/** Pointed knee cop, cuisse plate and shin greave following a legBase leg. */
export function plateLeg(k: K, l: { knee: V; ankle: V; bend: number }, o: PlateLimbLook & { thigh?: boolean; greave?: boolean } = {}): void {
  const plate = o.plate ?? ONYX;
  const hi = o.hi ?? ONYX_HI;
  const trim = o.trim ?? GILT;
  if (o.thigh !== false) {
    k.add(frustumGeo(0.15, 0.3, 0.05, 0.85, 1, 0.0), plate, 0, l.knee[1] * 0.45, 0.07, -l.bend * 0.6, 0, 0);
    hoop(k, 0.075, 0.0045, 0, l.knee[1] * 0.45 - 0.15, 0.072, trim, Math.PI / 2 - l.bend, 0, 0, 10, Math.PI);
  }
  // Knee: rounded cop with a forward spike and side wings
  k.add(new THREE.SphereGeometry(0.066, 10, 3, 0, Math.PI * 2, 0, Math.PI * 0.5), hi, 0, l.knee[1], l.knee[2] + 0.035, Math.PI / 2 - 0.1, 0, 0, 1, 1, 0.75);
  k.add(new THREE.ConeGeometry(0.022, o.spike ?? 0.08, 5), plate, 0, l.knee[1] + 0.005, l.knee[2] + 0.1, Math.PI / 2 - 0.15, 0, 0);
  if (o.greave !== false) {
    const top = onShin(l, 0.1, 0.045);
    const bot = onShin(l, 0.92, 0.03);
    k.add(
      surfGeo(
        (phi, t) => {
          const r = 0.07 - t * 0.0 + (1 - t) * 0.0;
          const y = bot[1] + (top[1] - bot[1]) * t;
          const zc = bot[2] + (top[2] - bot[2]) * t - 0.035;
          const rr = r * (0.82 + 0.18 * Math.sin(Math.PI * (0.25 + 0.6 * t)));
          return [Math.sin(phi) * rr, y, zc + Math.cos(phi) * rr * 1.05];
        },
        8,
        3,
        -1.45,
        2.9,
      ),
      plate,
      0,
      0,
      0,
    );
    k.add(frustumGeo(0.014, top[1] - bot[1], 0.012, 0.4), hi, 0, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2 + 0.04, l.bend, 0, 0);
  }
}

/**
 * Torn, folded cloth hanging from its top edge (like parts.ragGeo) but single-sided: the rig
 * material renders both faces, so this costs half the triangles.
 */
export function capeGeo(w: number, h: number, o: { folds?: number; depth?: number; flare?: number; tatter?: number; seed?: number; curl?: number; cols?: number; rows?: number } = {}): THREE.BufferGeometry {
  const { folds = 3, depth = 0.04, flare = 0.15, tatter = 0.18, seed = 7, curl = 0.1, cols = 14, rows = 7 } = o;
  const r = rnd(seed);
  const geo = new THREE.PlaneGeometry(w, h, cols, rows);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const cut: number[] = Array.from({ length: cols + 1 }, () => r());
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const py = p.getY(i);
    const down = (h / 2 - py) / h;
    const col = Math.round(((px + w / 2) / w) * cols);
    const tear = down > 0.7 ? Math.pow((down - 0.7) / 0.3, 1.5) * tatter * h * (0.3 + cut[col]! * 1.2) : 0;
    p.setX(i, px * (1 + flare * down));
    p.setY(i, py + tear);
    p.setZ(i, Math.sin((px / w) * Math.PI * 2 * folds + cut[col]! * 0.6) * depth * (0.3 + down) - down * curl);
  }
  geo.computeVertexNormals();
  geo.translate(0, -h / 2, 0);
  geo.deleteAttribute('uv');
  return geo;
}

/** Heavy, layered, tattered cloak hung from the cape pivot (top centre). */
export function heavyCape(k: K, w: number, h: number, hex: string, o: { seed?: number; inner?: string | null; tatter?: number; folds?: number; collar?: string | null } = {}): void {
  const seed = o.seed ?? 31;
  k.add(capeGeo(w, h, { folds: o.folds ?? 4, depth: 0.06, flare: 0.5, tatter: o.tatter ?? 0.34, seed, curl: 0.2, cols: 16, rows: 8 }), hex, 0, 0, 0);
  if (o.inner !== null) k.add(capeGeo(w * 0.86, h * 0.82, { folds: 3, depth: 0.05, flare: 0.4, tatter: 0.4, seed: seed + 5, curl: 0.12, cols: 12, rows: 6 }), o.inner ?? shade(hex, -0.25), 0, -0.02, 0.025);
  if (o.collar) k.add(new THREE.CylinderGeometry(w * 0.42, w * 0.5, 0.08, 12, 1, true, Math.PI * 0.6, Math.PI * 0.8), o.collar, 0, -0.01, 0.1, 0, 0, 0, 1, 1, 0.6);
}

/** Flat glowing sigil (chest emblems, rune marks) built from a list of strokes in its plane. */
export function sigilParts(strokes: [number, number, number, number][], w: number, x: number, y: number, z: number, ry = 0, rx = 0): GlowPart[] {
  return strokes.map(([ax, ay, bx, by]) => {
    const len = Math.hypot(bx - ax, by - ay);
    const g = new THREE.BoxGeometry(w, len, 0.004);
    g.rotateZ(Math.atan2(-(bx - ax), by - ay));
    g.translate((ax + bx) / 2, (ay + by) / 2, 0);
    g.rotateX(rx);
    g.rotateY(ry);
    return [g, x, y, z] as GlowPart;
  });
}
