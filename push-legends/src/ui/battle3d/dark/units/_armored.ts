import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { K, shapeFrom, shade } from '../../../base3d/sculpt';
import { addGlow, addMesh, newRig, pivot, type Rig } from '../../rig';
import { capGeo, cbox, frustumGeo, HEAD_Y, metal, prismGeo, ragGeo } from '../parts';

/**
 * Heavy plate knights (Blackguard, Bulwark, Fallen Oath, the hero). A sculpted alternative to
 * parts.warrior(): faceted cuirass with a keel, layered faulds and tassets, shaped cuisses and
 * greaves, articulated sabatons, couters and gauntlets. Helmets, pauldrons, weapons and shields are
 * supplied per unit so every knight keeps its own silhouette.
 *
 * Same rig conventions as warrior(): feet at y 0, facing +z, right hand +x, hips (leg pivots) at
 * y 1.0, shoulders (arm pivots) at y 1.56, neck pivot y 1.66, head centre HEAD_Y. Weapons are built
 * along +y from the grip and the hand group turns them forward.
 * Low segment counts throughout (6-10): every unit is instanced many times on phones.
 */

// --- Small helpers ----------------------------------------------------------------------------------

/** A lighter (+) or darker (−) variant of a metal colour, registered as metal. */
export function mtl(hex: string, amt: number, level = 0.75): string {
  return metal(shade(hex, amt), level);
}

/** Low-poly torus (bands, rims, rings). */
export function band(k: K, r: number, t: number, x: number, y: number, z: number, hex: string, rx = Math.PI / 2, ry = 0, rz = 0, seg = 10, arc = Math.PI * 2): K {
  return k.add(new THREE.TorusGeometry(r, t, 4, seg, arc), hex, x, y, z, rx, ry, rz);
}

/** Rivet / stud head. */
export function rivet(k: K, x: number, y: number, z: number, hex: string, r = 0.011): K {
  return k.add(new THREE.OctahedronGeometry(r, 0), hex, x, y, z, 0, 0, 0, 1, 1, 0.7);
}

/** Bright bare-metal scratch (on dark plate) along the surface at (x, y, z). */
export function scratch(k: K, len: number, x: number, y: number, z: number, rz: number, ry = 0, hex: string = PAL.steelLight): K {
  return cbox(k, len, 0.005, 0.006, x, y, z, hex, 0, ry, rz);
}

/** Dark gouge cut into the plate. */
export function gouge(k: K, len: number, x: number, y: number, z: number, rz: number, ry = 0): K {
  return cbox(k, len, 0.011, 0.008, x, y, z, PAL.void, 0, ry, rz);
}

/** Flat-shaded copy (crisp facets on angular plate). */
export function flat(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.computeVertexNormals();
  return g;
}

/**
 * Part of a lathed surface: profile [radius, y] bottom → top swept from phiC − half to phiC + half
 * (phi 0 = +z front, +PI/2 = +x). sz squashes the depth; `peak` lowers the top edge towards the
 * sides (pointed plackarts and lames); `dip` does the same to the bottom edge.
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

const scaleP = (prof: [number, number][], s: number): [number, number][] => prof.map(([r, y]) => [r * s, y]);

/** Radius of a [radius, y] profile at height y (linear). */
export function profR(prof: [number, number][], y: number): number {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1]!;
    const [r1, y1] = prof[i]!;
    if (y <= y1) return r0 + ((r1 - r0) * Math.max(0, y - y0)) / Math.max(1e-6, y1 - y0);
  }
  return prof[prof.length - 1]![0];
}

/** Flat plate fan (poleyn and couter wings), drawn in xy with its root at the origin. */
const FAN = shapeFrom([[0, -0.045], [0.04, -0.06], [0.07, -0.03], [0.075, 0.0], [0.07, 0.03], [0.04, 0.06], [0, 0.045]]);

// --- The knight -------------------------------------------------------------------------------------

export interface PlateColors {
  /** Main plate (registered metal). */
  plate: string;
  /** Blackened under-plate, lames, gauntlets. */
  dark: string;
  /** Edging, rivets, buckles. */
  trim: string;
  /** Mail visible at the joints. */
  mail: string;
  /** Gambeson / undercloth. */
  cloth: string;
  leather: string;
}

export interface KnightSpec {
  /** Width factor: 1 normal, 1.2 heavy, 1.35 hulking. */
  bulk?: number;
  /** Overall height factor (1 = about 2.1 units). */
  tall?: number;
  attack?: Rig['attack'];
  col: PlateColors;
  /** Colour overrides for the arms and the legs (e.g. pale plate over dark limbs). */
  armCol?: Partial<PlateColors>;
  legCol?: Partial<PlateColors>;
  /** Helmet around (0, HEAD_Y, 0) in the head kit (body coordinates); glows go on `glow`. Returns its top y. */
  helm: (k: K, glow: THREE.Object3D) => number;
  /** Shoulder armour in arm-pivot coordinates (s = +1 right arm, −1 left arm). */
  pauldron: (k: K, s: number, b: number) => void;
  /** Right-hand weapon along +y from the grip; glows/spinners go on `g`. */
  weapon: (k: K, g: THREE.Group, rig: Rig) => void;
  /** Left-hand shield facing +z, drawn around the hand pivot (sets rig.shield). */
  shield?: (k: K, g: THREE.Group) => void;
  /** Shield pre-tilt about x (top forward when positive) so it stays upright when raised. */
  shieldTilt?: number;
  /** Left-hand item that is not a shield (drawn in the hand group). */
  offhand?: (k: K, g: THREE.Group) => void;
  cape?: { color: string; w?: number; h?: number; seed?: number; tatter?: number; folds?: number; depth?: number };
  tabard?: { front: string; back?: string | null; len?: number; w?: number; seed?: number; tatter?: number };
  /** Number of fauld lames below the cuirass (default 3). */
  faulds?: number;
  /** Mail skirt showing below the faulds (default true). */
  mailSkirt?: boolean;
  /** Tassets over the thighs (default true). */
  tassets?: boolean;
  /** Arm pivot spread (× 0.26 · bulk). */
  shoulderW?: number;
  /** Bespoke details (draw into the kits, attach glows to the groups). */
  extra?: (p: KnightParts) => void;
}

export interface KnightParts {
  rig: Rig;
  b: number;
  torso: K;
  head: K;
  frame: THREE.Group;
  headGroup: THREE.Group;
  armR: K;
  armL: K;
  legR: K;
  legL: K;
  handR: THREE.Group;
  handL: THREE.Group;
  cape: K | null;
  /** Point on the cuirass surface: a = angle (0 front, +PI/2 right side), y = height, out = offset. */
  onChest: (a: number, y: number, out?: number) => [number, number, number];
  /** Outward angle (ry) for a flat detail placed on the cuirass at angle a. */
  chestYaw: (a: number) => number;
  /** Cuirass radius at height y (before the depth squash CHEST_SZ). */
  chestR: (y: number) => number;
}

/** Cuirass profile [radius, y] (× bulk), from the waist to the collar. */
const CUIRASS: [number, number][] = [
  [0.17, 1.02],
  [0.185, 1.12],
  [0.218, 1.26],
  [0.24, 1.38],
  [0.236, 1.47],
  [0.2, 1.555],
  [0.12, 1.61],
];
const CUIRASS_SZ = 0.76;
/** Depth squash of the cuirass oval. */
export const CHEST_SZ = CUIRASS_SZ;

export const NECK_Y = 1.66;

/** Builds the armoured body and assembles the rig. */
export function knight(spec: KnightSpec): Rig {
  const rig = newRig('biped', spec.attack ?? 'melee');
  const b = spec.bulk ?? 1.15;
  const c = spec.col;
  const frame = pivot(rig.body, 0, 0, 0);
  const tall = spec.tall ?? 1;
  frame.scale.setScalar(tall);
  const tk = new K();
  const hk = new K();
  const neck = pivot(frame, 0, NECK_Y, 0);
  rig.neck = neck;
  const headGroup = pivot(neck, 0, -NECK_Y, 0);
  rig.head = headGroup;

  const prof = scaleP(CUIRASS, b);
  const onChest = (a: number, y: number, out = 0.004): [number, number, number] => {
    const r = profR(prof, y) * 0.94 + out;
    return [Math.sin(a) * r, y, Math.cos(a) * r * CUIRASS_SZ];
  };
  const chestYaw = (a: number) => Math.atan2(Math.sin(a), Math.cos(a) / CUIRASS_SZ);

  torsoKit(tk, b, c, spec, prof);
  const top = spec.helm(hk, headGroup);

  // Legs
  const legKits: K[] = [];
  for (const s of [1, -1]) {
    const lp = pivot(frame, s * 0.122 * b, 1.0, 0);
    const lk = new K();
    legKit(lk, s, b, { ...c, ...spec.legCol }, spec.tassets ?? true);
    legKits.push(lk);
    rig.legs.push(lp);
  }

  // Arms, pauldrons, hands
  const armKits: K[] = [];
  const hands: THREE.Group[] = [];
  const sw = (spec.shoulderW ?? 1) * 0.26 * b;
  for (const s of [1, -1]) {
    const ap = pivot(frame, s * sw, 1.56, 0);
    const ak = new K();
    armKit(ak, s, b, { ...c, ...spec.armCol });
    spec.pauldron(ak, s, b);
    const hand = pivot(ap, 0, -0.66, 0.03);
    armKits.push(ak);
    hands.push(hand);
    if (s === 1) rig.armR = ap;
    else rig.armL = ap;
  }
  const [handR, handL] = hands as [THREE.Group, THREE.Group];

  // Weapon
  const wg = pivot(handR, 0, 0, 0);
  wg.rotation.x = 1.05;
  const wk = new K();
  spec.weapon(wk, wg, rig);
  if (!wk.empty) addMesh(rig, wg, wk);

  // Shield or off-hand
  if (spec.shield) {
    rig.shield = true;
    const sg = pivot(handL, 0, 0, 0);
    sg.rotation.x = spec.shieldTilt ?? 0.3;
    const sk = new K();
    spec.shield(sk, sg);
    addMesh(rig, sg, sk);
  } else if (spec.offhand) {
    const og = pivot(handL, 0, 0, 0);
    const ok = new K();
    spec.offhand(ok, og);
    if (!ok.empty) addMesh(rig, og, ok);
  }

  // Cape
  let capeKit: K | null = null;
  if (spec.cape) {
    const cp = pivot(frame, 0, 1.585, -0.2 * b - 0.014);
    capeKit = new K();
    const cs = spec.cape;
    capeKit.add(
      ragGeo((cs.w ?? 0.58) * b, cs.h ?? 1.4, { folds: cs.folds ?? 3, depth: cs.depth ?? 0.05, flare: 0.4, tatter: cs.tatter ?? 0.3, seed: cs.seed ?? 31, curl: 0.16 }),
      cs.color,
      0,
      0,
      0,
    );
    rig.cape = cp;
  }

  const [legR, legL] = legKits as [K, K];
  const [armR, armL] = armKits as [K, K];
  spec.extra?.({ rig, b, torso: tk, head: hk, frame, headGroup, armR, armL, legR, legL, handR, handL, cape: capeKit, onChest, chestYaw, chestR: (y) => profR(prof, y) });

  addMesh(rig, frame, tk);
  addMesh(rig, headGroup, hk);
  rig.legs.forEach((lp, i) => addMesh(rig, lp, legKits[i]!));
  addMesh(rig, rig.armR!, armR);
  addMesh(rig, rig.armL!, armL);
  if (capeKit && rig.cape) addMesh(rig, rig.cape, capeKit);
  rig.height = (top + 0.04) * tall;
  return rig;
}

// --- Body parts -------------------------------------------------------------------------------------

function torsoKit(k: K, b: number, c: PlateColors, spec: KnightSpec, prof: [number, number][]): void {
  const hi = mtl(c.plate, 0.18);
  // Padded core so no gap ever shows (waist, under the arms)
  k.add(prismGeo(0.16 * b, 0.5, 8, 1.2), c.cloth, 0, 1.25, 0, 0, 0, 0, 1, 1, 0.8);
  // Cuirass: faceted oval with a keel down the front and the spine
  k.lathe(prof, 0, 0, 0.008, c.plate, 8, 1, CUIRASS_SZ);
  // Keel highlight
  const fz = (y: number) => profR(prof, y) * CUIRASS_SZ + 0.012;
  for (const [y0, y1] of [
    [1.06, 1.3],
    [1.3, 1.5],
  ] as const) {
    const zm = (fz(y0) + fz(y1)) / 2;
    cbox(k, 0.012, y1 - y0 + 0.01, 0.012, 0, (y0 + y1) / 2, zm, hi, Math.atan2(fz(y0) - fz(y1), y1 - y0));
  }
  // Plackart: a pointed plate over the belly, in the darker steel
  k.add(shellGeo(scaleP([[0.19, 1.04], [0.205, 1.14], [0.228, 1.27]], b), 0, 0.95, 6, CUIRASS_SZ * 1.04, 0.1), c.dark, 0, 0, 0.012);
  // Arm openings: dark gussets under the shoulders
  for (const s of [-1, 1]) k.ball(0.075 * b, s * 0.2 * b, 1.46, 0, c.mail, 0.8, 1, 1, 6);
  // Gorget: two lames round the neck
  k.lathe(scaleP([[0.17, 1.55], [0.155, 1.6], [0.1, 1.66], [0.088, 1.68]], b), 0, 0, 0, c.dark, 8, 1, 0.92);
  k.lathe(scaleP([[0.098, 1.63], [0.09, 1.7], [0.08, 1.73]], b), 0, 0, 0, c.plate, 8, 1, 0.95);
  // Faulds: lames stepping out over the hips
  const nf = spec.faulds ?? 3;
  for (let i = 0; i < nf; i++) {
    const y = 1.07 - i * 0.065;
    k.add(shellGeo(scaleP([[0.212 + i * 0.016, y - 0.085], [0.185 + i * 0.016, y]], b), 0, Math.PI, 8, 0.82), i % 2 ? c.dark : c.plate, 0, 0, 0);
  }
  // Mail skirt
  if (spec.mailSkirt ?? true) k.lathe(scaleP([[0.235, 0.8], [0.22, 0.9], [0.19, 1.0]], b), 0, 0, 0, c.mail, 8, 1, 0.84);
  // Sword belt with an iron buckle
  k.lathe(scaleP([[0.196, 1.04], [0.198, 1.09]], b), 0, 0, 0, c.leather, 8, 1, 0.83);
  cbox(k, 0.07, 0.065, 0.025, 0, 1.065, 0.165 * b, c.trim);
  cbox(k, 0.035, 0.035, 0.03, 0, 1.065, 0.168 * b, c.leather);
  // Backplate spine ridge and straps
  cbox(k, 0.014, 0.4, 0.014, 0, 1.3, -profR(prof, 1.3) * CUIRASS_SZ - 0.006, hi);
  // Rivets along the breastplate edges
  for (const s of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const a = s * 0.95;
      const y = 1.22 + i * 0.1;
      const r = profR(prof, y) * 0.95 + 0.006;
      rivet(k, Math.sin(a) * r, y, Math.cos(a) * r * CUIRASS_SZ, c.trim);
    }
  // Battle damage: a dent, gouges and bright scratches across the plate
  const ch = (a: number, y: number): [number, number, number] => {
    const r = profR(prof, y) * 0.93 + 0.008;
    return [Math.sin(a) * r, y, Math.cos(a) * r * CUIRASS_SZ];
  };
  const yaw = (a: number) => Math.atan2(Math.sin(a), Math.cos(a) / CUIRASS_SZ);
  {
    const [x, y, z] = ch(0.38, 1.4);
    gouge(k, 0.11, x, y, z, 0.55, yaw(0.38));
  }
  {
    const [x, y, z] = ch(-0.42, 1.31);
    scratch(k, 0.09, x, y, z, -0.35, yaw(-0.42));
  }
  {
    const [x, y, z] = ch(0.2, 1.22);
    scratch(k, 0.07, x, y, z, 0.2, yaw(0.2));
  }
  {
    const [x, y, z] = ch(-0.25, 1.44);
    k.ball(0.028, x, y, z - 0.004, mtl(c.plate, -0.35), 1, 0.7, 0.35, 6);
  }
  // Tabard (front and back panels)
  if (spec.tabard) {
    const t = spec.tabard;
    const len = t.len ?? 0.62;
    const w = (t.w ?? 0.26) * b;
    k.add(ragGeo(w, len, { folds: 2, depth: 0.012, flare: 0.3, tatter: t.tatter ?? 0.35, seed: t.seed ?? 13, curl: 0.03 }), t.front, 0, 1.06, 0.19 * b);
    if (t.back !== null) k.add(ragGeo(w * 1.1, len * 1.05, { folds: 2, depth: 0.012, flare: 0.3, tatter: t.tatter ?? 0.35, seed: (t.seed ?? 13) + 4, curl: -0.03 }), t.back ?? shade(t.front, -0.15), 0, 1.06, -0.17 * b);
  }
}

/** Arm from the shoulder pivot to the wrist (y −0.6) and the armoured fist around the hand pivot. */
function armKit(k: K, s: number, b: number, c: PlateColors): void {
  const w = 0.074 * Math.sqrt(b);
  const hi = mtl(c.plate, 0.18);
  // Mail sleeve under the plate
  k.add(prismGeo(w * 0.92, 0.36, 6), c.mail, 0, -0.16, 0);
  // Rerebrace
  k.lathe([[w * 1.02, -0.31], [w * 1.12, -0.2], [w * 1.08, -0.1]], 0, 0, 0, c.plate, 8);
  // Couter: cup on the elbow with a fan on the outside
  k.add(capGeo(w * 1.28, Math.PI * 0.5, 8, 3), c.plate, 0, -0.33, -0.012, -Math.PI / 2 - 0.25, 0, 0);
  k.plate(FAN, 0.01, 0.004, s * w * 1.05, -0.33, -0.01, c.dark, 0, s * Math.PI / 2, 0, 0.95);
  // Vambrace with a ridge
  k.lathe([[w * 0.98, -0.585], [w * 1.04, -0.5], [w * 1.12, -0.41], [w * 1.04, -0.35]], 0, 0, 0, c.plate, 8);
  cbox(k, 0.01, 0.2, 0.01, 0, -0.47, w * 1.1, hi, -0.06);
  // Gauntlet: flared cuff, knuckle plate, curled fingers and thumb
  k.lathe([[w * 0.95, -0.61], [w * 1.38, -0.5]], 0, 0, 0, c.dark, 8);
  k.add(frustumGeo(w * 1.55, 0.095, w * 1.15, 0.9, 0.85), c.dark, 0, -0.655, 0.008);
  k.add(frustumGeo(w * 1.5, 0.026, w * 0.35, 1), c.plate, 0, -0.69, w * 0.55);
  k.add(frustumGeo(w * 1.4, 0.075, w * 1.25, 0.9, 0.8), shade(c.dark, -0.2), 0, -0.735, 0.03, 0.35, 0, 0);
  cbox(k, w * 0.42, 0.08, w * 0.42, -s * w * 0.78, -0.69, w * 0.5, c.dark, 0.35, 0, s * 0.35);
}

/** Leg from the hip pivot to the sole (y −1.0). s = +1 right, −1 left (outer side = s·x). */
function legKit(k: K, s: number, b: number, c: PlateColors, tassets: boolean): void {
  const lb = Math.sqrt(b);
  const hi = mtl(c.plate, 0.18);
  // Padded hose / mail under the plate (fills the knee and hip gaps)
  k.add(prismGeo(0.072 * lb, 0.62, 6, 1.15), c.mail, 0, -0.38, 0);
  // Cuisse
  k.lathe(scaleP([[0.074, -0.47], [0.094, -0.36], [0.104, -0.2], [0.1, -0.05], [0.082, 0.04]], lb), 0, 0, 0.006, c.plate, 8, 1, 1.06);
  cbox(k, 0.01, 0.36, 0.01, 0, -0.25, 0.104 * lb * 1.06 + 0.004, hi, 0.06);
  // Poleyn: knee cop, side fan and lames
  k.lathe(scaleP([[0.078, -0.455], [0.083, -0.43]], lb), 0, 0, 0.008, c.dark, 8, 1, 1.05);
  k.add(capGeo(0.074 * lb, Math.PI * 0.5, 8, 3), mtl(c.plate, 0.08), 0, -0.505, 0.045 * lb, Math.PI / 2 - 0.1, 0, 0, 1, 1, 0.75);
  k.plate(FAN, 0.01, 0.004, s * 0.062 * lb, -0.51, 0.012, c.dark, 0, s * -Math.PI / 2 + Math.PI, 0, 1.05);
  k.lathe(scaleP([[0.072, -0.585], [0.077, -0.56]], lb), 0, 0, 0.006, c.dark, 8, 1, 1.05);
  // Greave with a calf swell and a front ridge
  k.lathe(scaleP([[0.054, -0.935], [0.06, -0.86], [0.075, -0.74], [0.078, -0.66], [0.068, -0.57]], lb), 0, 0, 0, c.plate, 8, 1, 1.1);
  cbox(k, 0.01, 0.3, 0.01, 0, -0.75, 0.078 * lb * 1.1 + 0.002, hi, -0.08);
  // Sabaton: sole, instep and overlapping lames ending in a blunt point
  k.add(frustumGeo(0.105 * lb, 0.045, 0.27, 0.9, 0.92), shade(c.dark, -0.25), 0, -0.977, 0.05);
  k.add(frustumGeo(0.1 * lb, 0.07, 0.11, 0.85, 0.7), c.dark, 0, -0.93, 0.0);
  for (let i = 0; i < 3; i++) k.add(frustumGeo((0.1 - i * 0.006) * lb, 0.026, 0.065, 0.85, 0.75), i % 2 ? c.dark : c.plate, 0, -0.935 - i * 0.012, 0.06 + i * 0.045, 0.35);
  k.add(new THREE.ConeGeometry(0.045 * lb, 0.09, 4), c.plate, 0, -0.965, 0.2, Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.5);
  // Tassets hanging from the faulds over the front and outside of the thigh
  if (tassets) {
    for (let i = 0; i < 2; i++) {
      const y = -0.02 - i * 0.075;
      k.add(shellGeo(scaleP([[0.13 + i * 0.008, y - 0.1], [0.115 + i * 0.008, y]], lb), s * 0.45, 1.05, 5, 0.95, 0, 0.03), i % 2 ? c.dark : c.plate, 0, 0, 0.01);
    }
    rivet(k, s * 0.03, -0.05, 0.12 * lb, c.trim);
  }
}

// --- Shared pauldron --------------------------------------------------------------------------------

export interface PauldronSpec {
  /** Cop radius. */
  size: number;
  lames: number;
  plate: string;
  dark: string;
  trim: string;
  /** Raised neck guard height (0 = none). */
  haute?: number;
  /** Outward tilt of the cop (radians). */
  tilt?: number;
  /** Width/height/depth stretch of the cop. */
  stretch?: [number, number, number];
  /** Rivets along the edge. */
  rivets?: number;
  /** Flat-shaded (crisp facets). */
  facet?: boolean;
}

/** Hoop round the y axis (rims, cuffs, rolled edges); unlike a torus it tilts correctly with rz. */
export function hoop(k: K, r: number, t: number, x: number, y: number, z: number, hex: string, rx = 0, ry = 0, rz = 0, seg = 10, sx = 1, sz = 1): K {
  const g = new THREE.LatheGeometry([new THREE.Vector2(r, -t), new THREE.Vector2(r + t, 0), new THREE.Vector2(r, t), new THREE.Vector2(r - t * 0.5, 0), new THREE.Vector2(r, -t)], seg);
  return k.add(g, hex, x, y, z, rx, ry, rz, sx, 1, sz);
}

/**
 * Spaulder: a domed cop tilted out over the shoulder joint (its brim slopes down the outside of
 * the arm) and lames hugging the upper arm below it. s = +1 right, −1 left.
 */
export function spaulder(k: K, s: number, p: PauldronSpec): void {
  const R = p.size;
  const tilt = p.tilt ?? 0.55;
  const [sx, sy, sz] = p.stretch ?? [1.0, 0.92, 1.12];
  const cx = s * 0.03;
  const cy = -0.03;
  const cop = capGeo(R, Math.PI * 0.5, 8, 3);
  k.add(p.facet ? flat(cop) : cop, p.plate, cx, cy, 0, 0, 0, -s * tilt, sx, sy, sz);
  // Rolled brim
  hoop(k, R * sx * 0.99, 0.012, cx, cy, 0, p.trim, 0, 0, -s * tilt, 10, 1, sz / sx);
  // Lames stepping down the outside of the upper arm
  for (let i = 0; i < p.lames; i++) {
    const y = -0.06 - i * 0.052;
    const rl = R * 0.82 - i * 0.01;
    const g = shellGeo(
      [
        [rl * 1.07, y - 0.072],
        [rl * 0.97, y - 0.03],
        [rl * 0.9, y],
      ],
      s * Math.PI / 2,
      1.6,
      7,
      1.08,
    );
    k.add(p.facet ? flat(g) : g, i % 2 ? p.plate : p.dark, s * (0.018 + i * 0.004), 0, 0, 0, 0, -s * (0.08 + i * 0.03));
  }
  // Neck guard rising from the inner edge
  if (p.haute) k.add(frustumGeo(0.022, p.haute, R * 1.25, 0.8, 0.8), p.dark, -s * (R * 0.5), 0.03 + p.haute * 0.5, 0, 0, 0, -s * 0.1);
  // Rivets round the brim
  const n = p.rivets ?? 3;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n - 0.5) * 2.2;
    const lx = Math.cos(a) * R * sx * 0.93;
    const lz = Math.sin(a) * R * sz * 0.93;
    rivet(k, cx + s * (lx * ct) + s * 0.004, cy - lx * st + 0.02, lz, p.trim, 0.012);
  }
}

/** Top of a spaulder's cop in arm-pivot coordinates (for ridges and flutes laid over it). */
export function copTop(p: PauldronSpec, s: number): [number, number] {
  const tilt = p.tilt ?? 0.55;
  const sy = (p.stretch ?? [1.0, 0.92, 1.12])[1];
  return [s * 0.03 + s * p.size * sy * Math.sin(tilt), -0.03 + p.size * sy * Math.cos(tilt)];
}

// --- Shared weapon parts ----------------------------------------------------------------------------

/** Leather-wrapped grip from y0 to y1. */
export function grip(k: K, y0: number, y1: number, r: number, hex: string): void {
  k.add(prismGeo(r, y1 - y0, 6), hex, 0, (y0 + y1) / 2, 0);
  const n = Math.max(1, Math.round((y1 - y0) / 0.06));
  for (let i = 0; i < n; i++) band(k, r * 1.05, r * 0.22, 0, y0 + (i + 0.5) * ((y1 - y0) / n), 0, shade(hex, -0.35), Math.PI / 2 + 0.25, 0, 0, 6);
}

/** Face-plate eye slit (w > 0 draws the dark slot) with two glowing eyes behind it (in the head group). */
export function eyeSlit(k: K, glow: THREE.Object3D, hex: string | null, y: number, z: number, w: number, h: number, gap: number, lum = 4, rz = 0, gw = w * 0.26): void {
  if (w > 0) cbox(k, w, h, 0.03, 0, y, z, '#060607');
  if (!hex) return;
  for (const sx of [-1, 1]) addGlow(glow, new THREE.BoxGeometry(gw, h * 0.55, 0.01), hex, sx * gap, y, z + 0.012, lum).rotation.z = -sx * rz;
}

export { HEAD_Y };
