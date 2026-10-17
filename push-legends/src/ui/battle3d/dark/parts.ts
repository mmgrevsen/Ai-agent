import * as THREE from 'three';
import { registerMetal } from '../../base3d/kit';
import { K, shapeFrom, shade, type V } from '../../base3d/sculpt';
import { PAL } from '../../art/darkArt';
import { addGlow, addMesh, newRig, pivot, type Rig } from '../rig';

/**
 * Dark-fantasy parts library: angular plate armour, helmets with visor slits, deep hoods with
 * glowing eyes, tattered cloth, heavy weapons and shields, and `warrior()`, a realistically
 * proportioned humanoid (about seven heads tall) assembled from them.
 *
 * Conventions (local units, feet at y = 0, facing +z, right hand = +x):
 *   hips y 1.0, shoulders y 1.56, neck pivot y 1.66, head centre y 1.81 (radius 0.125)
 *   arm pivots at x ±0.26·bulk, hand pivot 0.62 below the shoulder, legs pivot at x ±0.12·bulk
 *   weapons are modelled along +y from the grip; the hand pivot turns them forward.
 * Everything visible goes through Kit (vertex colours, one draw call per part); glows use addGlow.
 */

// --- Metals -----------------------------------------------------------------------------------------
// Bright steel reads as polished metal; blackened steel and iron are duller and rougher.
// Levels stay below 1 so worn steel keeps some diffuse colour and never turns into a black mirror.
registerMetal(PAL.steelLight, 0.9);
registerMetal(PAL.steel, 0.8);
registerMetal(PAL.gunmetal, 0.7);
registerMetal(PAL.blackSteel, 0.6);
registerMetal(PAL.iron, 0.55);
registerMetal(PAL.gold, 0.9);
registerMetal(PAL.goldLight, 0.9);

/** Declares an extra colour as metal (0..1 how metallic). */
export const metal = (hex: string, level = 0.9): string => {
  registerMetal(hex, level);
  return hex;
};

/** Box centred on (x, y, z) with a rotation (Kit.box rests on y). */
export function cbox(k: K, w: number, h: number, d: number, x: number, y: number, z: number, hex: string, rx = 0, ry = 0, rz = 0): K {
  return k.add(new THREE.BoxGeometry(w, h, d), hex, x, y, z, rx, ry, rz);
}

const rnd = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

// --- Geometry helpers -------------------------------------------------------------------------------

/** Box tapering towards the top (top/topD scale the top face); `lean` pushes the top forward. */
export function frustumGeo(w: number, h: number, d: number, top = 1, topD = top, lean = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 1, 2, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + h / 2) / h;
    p.setX(i, p.getX(i) * (1 + (top - 1) * t));
    p.setZ(i, p.getZ(i) * (1 + (topD - 1) * t) + lean * t);
  }
  g.computeVertexNormals();
  return g;
}

/** Faceted prism (n sides) tapering to `top`: helmets, vambraces, greaves. */
export function prismGeo(r: number, h: number, n = 8, top = 1): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r * top, r, h, n, 1);
}

/** Sphere cap (curved plate): pauldrons, couters, poleyns, helmet domes. */
export function capGeo(r: number, theta = Math.PI / 2, wSeg = 12, hSeg = 6): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, wSeg, hSeg, 0, Math.PI * 2, 0, theta);
}

/** Two-sided hanging cloth with folds and a torn, uneven hem. Top edge at y. */
export function ragGeo(w: number, h: number, opts: { folds?: number; depth?: number; flare?: number; tatter?: number; seed?: number; curl?: number } = {}): THREE.BufferGeometry {
  const { folds = 3, depth = 0.04, flare = 0.15, tatter = 0.18, seed = 7, curl = 0.1 } = opts;
  const r = rnd(seed);
  const cols = 14;
  const geo = new THREE.PlaneGeometry(w, h, cols, 7);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const cut: number[] = Array.from({ length: cols + 1 }, () => r());
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const py = p.getY(i);
    const down = (h / 2 - py) / h;
    const col = Math.round(((px + w / 2) / w) * cols);
    // Torn hem: the lowest rows are pulled up by a jagged amount per column
    const tear = down > 0.7 ? Math.pow((down - 0.7) / 0.3, 1.5) * tatter * h * (0.3 + cut[col]! * 1.2) : 0;
    p.setX(i, px * (1 + flare * down));
    p.setY(i, py + tear);
    p.setZ(i, Math.sin((px / w) * Math.PI * 2 * folds + cut[col]! * 0.6) * depth * (0.3 + down) - down * curl);
  }
  geo.computeVertexNormals();
  geo.translate(0, -h / 2, 0);
  return twoSided(geo);
}

/** Lathed shape whose bottom edge is torn (robes, cowls, skirts). profile: [radius, y] bottom → top. */
export function tornLatheGeo(profile: [number, number][], seg = 18, tatter = 0.12, seed = 3): THREE.BufferGeometry {
  const geo = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const r = rnd(seed);
  const cuts = Array.from({ length: seg + 1 }, () => r());
  cuts[seg] = cuts[0]!;
  const n = profile.length;
  for (let i = 0; i <= seg; i++) {
    const idx = i * n;
    p.setY(idx, p.getY(idx) + cuts[i]! * tatter);
    if (n > 2) p.setY(idx + 1, p.getY(idx + 1) + cuts[i]! * tatter * 0.35);
  }
  geo.computeVertexNormals();
  return geo;
}

function twoSided(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const back = geo.clone();
  const idx = back.getIndex()!;
  const arr = idx.array as Uint16Array | Uint32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const t = arr[i]!;
    arr[i] = arr[i + 2]!;
    arr[i + 2] = t;
  }
  const n = back.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  back.translate(0, 0, -0.01);
  const merged = new THREE.BufferGeometry();
  const a = geo.toNonIndexed();
  const b = back.toNonIndexed();
  const pos = new Float32Array([...(a.getAttribute('position').array as Float32Array), ...(b.getAttribute('position').array as Float32Array)]);
  const nor = new Float32Array([...(a.getAttribute('normal').array as Float32Array), ...(b.getAttribute('normal').array as Float32Array)]);
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return merged;
}

/** Shapes for flat parts (blades, shields), drawn in the xy plane. */
export const SHAPES = {
  greatswordBlade: (len: number, w: number) => shapeFrom([[-w, 0], [w, 0], [w * 0.92, len * 0.82], [w * 0.4, len * 0.96], [0, len], [-w * 0.4, len * 0.96], [-w * 0.92, len * 0.82]]),
  /** Blade with a broken, notched edge on one side. */
  notchedBlade: (len: number, w: number) =>
    shapeFrom([[-w, 0], [w, 0], [w * 0.95, len * 0.3], [w * 0.7, len * 0.34], [w * 0.92, len * 0.4], [w * 0.88, len * 0.72], [w * 0.6, len * 0.76], [w * 0.8, len * 0.8], [0, len], [-w * 0.85, len * 0.84], [-w * 0.95, len * 0.5]]),
  falchion: (len: number, w: number) => shapeFrom([[-w * 0.6, 0], [w * 0.6, 0], [w * 1.3, len * 0.7], [w * 0.9, len * 0.95], [0, len], [-w * 0.6, len * 0.6]]),
  hook: (len: number, w: number) =>
    shapeFrom([[-w * 0.5, 0], [w * 0.5, 0], [w * 0.6, len * 0.55], [w * 1.6, len * 0.8], [w * 2.6, len * 0.78], [w * 3.2, len * 0.62], [w * 2.6, len * 0.9], [w * 1.4, len * 1.0], [0, len * 0.9], [-w * 0.55, len * 0.6]]),
  axeHead: (r: number) => shapeFrom([[0, -r * 0.25], [r * 0.5, -r * 0.55], [r * 1.0, -r * 0.9], [r * 1.15, -r * 0.2], [r * 1.18, r * 0.2], [r * 1.0, r * 0.9], [r * 0.5, r * 0.55], [0, r * 0.25]]),
  scytheBlade: (len: number) => shapeFrom([[0, 0], [len * 0.15, 0.06], [len * 0.55, 0.1], [len * 0.95, -0.05], [len, -0.16], [len * 0.7, -0.06], [len * 0.35, -0.04], [0, -0.07]]),
  heater: (w: number, h: number) => shapeFrom([[-w, h * 0.5], [w, h * 0.5], [w, h * 0.05], [w * 0.75, -h * 0.25], [0, -h * 0.5], [-w * 0.75, -h * 0.25], [-w, h * 0.05]]),
  tower: (w: number, h: number) => shapeFrom([[-w, h * 0.5], [-w * 0.6, h * 0.56], [w * 0.6, h * 0.56], [w, h * 0.5], [w, -h * 0.4], [0, -h * 0.52], [-w, -h * 0.4]]),
  spikeLeaf: (len: number, w: number) => shapeFrom([[-w, 0], [w, 0], [0, len]]),
};

// --- Heads ------------------------------------------------------------------------------------------

export type HelmKind = 'greathelm' | 'sallet' | 'hounskull' | 'barbute' | 'horned' | 'crowned' | 'hood' | 'cowl' | 'plague' | 'skull' | 'witch' | 'warcap' | 'beast';

export interface HeadSpec {
  helm: HelmKind;
  metal: string;
  dark: string;
  cloth: string;
  trim: string;
  eyes: string | null;
  /** Visible face colour where a helm leaves it uncovered (hood shadow is always dark). */
  skin?: string;
  crest?: string | null;
}

/**
 * Builds a concealed head around (0, hy, 0) of radius r into `k`; glowing eyes go on `glowParent`.
 * Returns the top of the head gear.
 */
export function head(k: K, glowParent: THREE.Object3D, s: HeadSpec, hy: number, r: number): number {
  const { metal: m, dark: d, cloth: c, trim: t } = s;
  const shadow = '#08080a';
  const eyes = (y: number, z: number, gap: number, w = 0.05, h = 0.012, lum = 5) => {
    if (!s.eyes) return;
    for (const x of [-gap, gap]) addGlow(glowParent, new THREE.BoxGeometry(w, h, 0.01), s.eyes, x, y, z, lum);
  };
  // Skull-shaped base under every helm (fills gaps at the neck)
  k.ball(r * 0.92, 0, hy, 0, shadow, 1, 1.05, 1.05, 12);
  let top = hy + r;
  switch (s.helm) {
    case 'greathelm':
    case 'horned':
    case 'crowned': {
      // Flat-topped, faceted bucket helm with a narrow cross-shaped visor slit
      k.add(prismGeo(r * 1.08, r * 2.1, 10, 0.94), m, 0, hy + r * 0.05, 0);
      k.add(capGeo(r * 1.02, Math.PI * 0.32, 10, 3), m, 0, hy + r * 0.95, 0, 0, 0, 0, 1, 0.5, 1);
      k.add(frustumGeo(r * 0.12, r * 2.0, r * 0.12, 0.7), d, 0, hy + r * 0.1, r * 1.04);
      cbox(k, r * 1.5, r * 0.11, r * 0.1, 0, hy + r * 0.12, r * 1.02, shadow);
      cbox(k, r * 0.08, r * 0.6, r * 0.1, 0, hy - r * 0.45, r * 1.03, shadow);
      for (let i = 0; i < 6; i++) cbox(k, r * 0.07, r * 0.07, r * 0.06, r * 0.3 + (i % 3) * r * 0.16, hy - r * 0.3 - Math.floor(i / 3) * r * 0.2, r * 1.0, shadow);
      k.ring(r * 1.09, r * 0.05, 0, hy + r * 0.62, 0, t);
      k.ring(r * 1.04, r * 0.05, 0, hy - r * 0.95, 0, d);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        k.ball(r * 0.05, Math.sin(a) * r * 1.1, hy + r * 0.62, Math.cos(a) * r * 1.1, t, 1, 1, 1, 6);
      }
      eyes(hy + r * 0.12, r * 1.08, r * 0.34, r * 0.5, r * 0.06);
      top = hy + r * 1.3;
      if (s.helm === 'horned') {
        for (const sx of [-1, 1])
          k.curve(
            [
              [sx * r * 0.95, hy + r * 0.6, 0],
              [sx * r * 1.7, hy + r * 1.0, -r * 0.2],
              [sx * r * 2.0, hy + r * 1.8, r * 0.1],
              [sx * r * 1.7, hy + r * 2.6, r * 0.5],
            ],
            r * 0.22,
            r * 0.02,
            PAL.boneDark,
            8,
          );
        top = hy + r * 2.4;
      }
      if (s.helm === 'crowned') {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          k.spike(r * 0.12, r * (i % 2 ? 0.55 : 0.9), Math.sin(a) * r, hy + r * 1.45 + (i % 2 ? 0 : r * 0.18), Math.cos(a) * r, t, 0, 0, 0, 4);
        }
        top = hy + r * 2.1;
      }
      break;
    }
    case 'sallet': {
      // Rounded war hat sweeping into a long tail, with a visor and a chin bevor
      k.add(capGeo(r * 1.12, Math.PI * 0.55, 14, 6), m, 0, hy - r * 0.05, -r * 0.08, 0, 0, 0, 1, 1.05, 1.25);
      k.add(frustumGeo(r * 1.5, r * 0.6, r * 1.2, 1.1, 1.0, -r * 0.1), m, 0, hy - r * 0.55, -r * 0.55, -0.35);
      k.add(frustumGeo(r * 1.9, r * 0.9, r * 0.5, 0.9, 1, 0), d, 0, hy - r * 0.6, r * 0.75, 0.15);
      cbox(k, r * 1.6, r * 0.12, r * 0.2, 0, hy + r * 0.15, r * 1.0, shadow);
      k.add(frustumGeo(r * 0.1, r * 1.2, r * 0.25, 0.8), m, 0, hy + r * 0.7, -r * 0.1);
      eyes(hy + r * 0.15, r * 1.08, r * 0.34, r * 0.45, r * 0.07);
      top = hy + r * 1.15;
      break;
    }
    case 'hounskull': {
      // Pointed "pig-face" visor, sinister in profile
      k.add(capGeo(r * 1.06, Math.PI * 0.6, 12, 6), m, 0, hy, 0, 0, 0, 0, 1, 1.1, 1.05);
      k.add(new THREE.ConeGeometry(r * 0.85, r * 1.6, 8), m, 0, hy - r * 0.05, r * 0.9, Math.PI / 2, 0, 0, 1, 1, 0.75);
      for (const sx of [-1, 1]) cbox(k, r * 0.55, r * 0.07, r * 0.4, sx * r * 0.36, hy + r * 0.18, r * 1.1, shadow, -sx * 0.4);
      for (let i = 0; i < 5; i++) k.ball(r * 0.05, (i - 2) * r * 0.12, hy - r * 0.35, r * 1.35 - Math.abs(i - 2) * r * 0.05, shadow, 1, 1, 1, 6);
      k.add(prismGeo(r * 0.95, r * 0.6, 10), d, 0, hy - r * 0.95, 0);
      eyes(hy + r * 0.18, r * 1.25, r * 0.36, r * 0.35, r * 0.06);
      top = hy + r * 1.1;
      break;
    }
    case 'barbute': {
      // Close helm with a T-shaped opening; the face inside is pure shadow
      k.add(capGeo(r * 1.08, Math.PI * 0.62, 14, 7), m, 0, hy + r * 0.05, 0, 0, 0, 0, 1, 1.12, 1.06);
      k.add(prismGeo(r * 1.04, r * 1.0, 14, 1.02), m, 0, hy - r * 0.55, 0);
      cbox(k, r * 1.2, r * 0.18, r * 0.3, 0, hy + r * 0.12, r * 0.92, shadow);
      cbox(k, r * 0.36, r * 0.9, r * 0.3, 0, hy - r * 0.35, r * 0.92, shadow);
      k.add(frustumGeo(r * 0.12, r * 1.4, r * 0.14, 0.6), d, 0, hy + r * 0.6, r * 0.55, -0.6);
      eyes(hy + r * 0.12, r * 1.0, r * 0.3, r * 0.35, r * 0.08);
      top = hy + r * 1.15;
      break;
    }
    case 'warcap': {
      // Open iron cap with nasal bar over a scarred, shadowed face
      k.ball(r * 0.95, 0, hy - r * 0.05, r * 0.05, s.skin ?? PAL.skinPale, 0.95, 1.05, 1);
      k.add(capGeo(r * 1.04, Math.PI * 0.5, 12, 5), m, 0, hy + r * 0.12, 0, 0, 0, 0, 1, 1.05, 1.02);
      cbox(k, r * 0.14, r * 0.85, r * 0.12, 0, hy - r * 0.05, r * 1.0, d);
      cbox(k, r * 1.1, r * 0.1, r * 0.25, 0, hy + r * 0.05, r * 0.82, shadow);
      k.ball(r * 0.55, 0, hy - r * 0.6, r * 0.35, PAL.ash, 1.2, 0.8, 1);
      eyes(hy + r * 0.05, r * 0.98, r * 0.32, r * 0.22, r * 0.05, 3);
      top = hy + r * 1.1;
      break;
    }
    case 'hood':
    case 'cowl': {
      // Deep pointed hood: the face is darkness with two eyes
      const deep = s.helm === 'hood' ? 1 : 0.85;
      k.lathe(
        [
          [r * 1.35, -r * 1.05],
          [r * 1.4, -r * 0.4],
          [r * 1.3, r * 0.35],
          [r * 0.95, r * 0.95],
          [r * 0.35, r * 1.3],
          [0.001, r * 1.45],
        ],
        0,
        hy,
        -r * 0.3,
        c,
        14,
        1,
        1.1,
      );
      k.curve(
        [
          [0, hy + r * 1.2, -r * 0.6],
          [0, hy + r * 1.3, -r * 1.2],
          [0, hy + r * 0.8, -r * 1.7],
        ],
        r * 0.3,
        0.01,
        c,
        8,
      );
      k.ball(r * 1.0 * deep, 0, hy - r * 0.05, r * 0.45, shadow, 1, 1.15, 0.6);
      k.ring(r * 1.05, r * 0.12, 0, hy - r * 0.05, r * 0.55, shade(c, -0.25), 0.15, 0, 0);
      if (s.helm === 'cowl') k.add(frustumGeo(r * 1.6, r * 0.9, r * 0.6, 0.85), shade(c, -0.15), 0, hy - r * 0.65, r * 0.65, -0.1);
      eyes(hy + r * 0.1, r * 0.95, r * 0.3, r * 0.22, r * 0.07, 6);
      top = hy + r * 1.45;
      break;
    }
    case 'witch': {
      // Tall, bent hood with a veil of tattered cloth over the face
      k.lathe(
        [
          [r * 1.3, -r * 0.9],
          [r * 1.35, -r * 0.2],
          [r * 1.15, r * 0.6],
          [r * 0.6, r * 1.4],
          [0.001, r * 1.8],
        ],
        0,
        hy,
        -r * 0.25,
        c,
        14,
      );
      k.curve(
        [
          [0, hy + r * 1.6, -r * 0.3],
          [r * 0.2, hy + r * 2.4, -r * 0.8],
          [r * 0.6, hy + r * 2.7, -r * 1.4],
        ],
        r * 0.35,
        0.01,
        c,
        8,
      );
      k.ball(r * 0.95, 0, hy, r * 0.4, shadow, 1, 1.1, 0.6);
      k.add(ragGeo(r * 1.6, r * 1.3, { folds: 4, depth: 0.01, flare: 0.1, tatter: 0.4, seed: 11, curl: 0.02 }), shade(c, -0.2), 0, hy - r * 0.1, r * 0.95);
      eyes(hy + r * 0.18, r * 1.0, r * 0.28, r * 0.2, r * 0.06, 6);
      top = hy + r * 2.6;
      break;
    }
    case 'plague': {
      // Leather mask with a long beak and dull glass eyes under a wide hat
      k.ball(r * 1.0, 0, hy, 0, c, 1, 1.05, 1.05, 12);
      k.add(new THREE.ConeGeometry(r * 0.38, r * 1.7, 8), shade(c, 0.08), 0, hy - r * 0.35, r * 1.35, Math.PI / 2 + 0.45, 0, 0);
      for (const sx of [-1, 1]) {
        k.ring(r * 0.2, r * 0.05, sx * r * 0.38, hy + r * 0.15, r * 0.9, PAL.iron, 0, 0, 0);
      }
      k.lathe([[r * 1.9, -0.01], [r * 1.85, r * 0.08], [r * 1.05, r * 0.06], [r * 0.95, r * 0.1]], 0, hy + r * 0.55, 0, c, 18);
      k.lathe([[r * 1.0, 0], [r * 0.98, r * 0.7], [r * 0.85, r * 0.85], [0.001, r * 0.88]], 0, hy + r * 0.6, 0, shade(c, -0.1), 14);
      k.ring(r * 1.0, r * 0.06, 0, hy + r * 0.75, 0, PAL.blood);
      if (s.eyes) for (const sx of [-1, 1]) addGlow(glowParent, new THREE.CircleGeometry(r * 0.17, 10), s.eyes, sx * r * 0.38, hy + r * 0.15, r * 0.93, 2.5);
      top = hy + r * 1.5;
      break;
    }
    case 'skull': {
      // Undead: cracked bone skull with burning sockets and a hanging jaw
      k.ball(r * 0.98, 0, hy + r * 0.08, 0, PAL.bone, 0.95, 1.05, 1.05, 12);
      k.add(frustumGeo(r * 1.05, r * 0.55, r * 0.9, 1.1), PAL.boneDark, 0, hy - r * 0.65, r * 0.15);
      for (const sx of [-1, 1]) k.ball(r * 0.27, sx * r * 0.36, hy + r * 0.1, r * 0.78, shadow, 1, 1, 0.6, 8);
      k.add(new THREE.ConeGeometry(r * 0.12, r * 0.25, 3), shadow, 0, hy - r * 0.2, r * 0.92, Math.PI, 0, 0);
      for (let i = -2; i <= 2; i++) cbox(k, r * 0.12, r * 0.18, r * 0.08, i * r * 0.15, hy - r * 0.48, r * 0.86, PAL.bone);
      cbox(k, r * 0.04, r * 0.5, r * 0.04, r * 0.35, hy + r * 0.6, r * 0.8, shadow, 0, 0, 0.5);
      if (s.eyes) for (const sx of [-1, 1]) addGlow(glowParent, new THREE.SphereGeometry(r * 0.1, 8, 6), s.eyes, sx * r * 0.36, hy + r * 0.1, r * 0.86, 6);
      top = hy + r * 1.1;
      break;
    }
    case 'beast': {
      // Brutish head: heavy brow, jaw with tusks, small burning eyes
      const skin = s.skin ?? PAL.skinGrey;
      k.ball(r * 1.05, 0, hy, 0, skin, 1.1, 1.0, 1.1, 12);
      k.add(frustumGeo(r * 1.6, r * 0.75, r * 1.2, 0.85), shade(skin, -0.1), 0, hy - r * 0.55, r * 0.35);
      cbox(k, r * 1.7, r * 0.3, r * 0.5, 0, hy + r * 0.25, r * 0.75, shade(skin, -0.2));
      for (const sx of [-1, 1]) k.spike(r * 0.12, r * 0.6, sx * r * 0.5, hy - r * 0.2, r * 1.0, PAL.bone, -0.3, 0, -sx * 0.2, 5);
      cbox(k, r * 1.2, r * 0.08, r * 0.2, 0, hy - r * 0.62, r * 0.98, shadow);
      eyes(hy + r * 0.08, r * 1.0, r * 0.38, r * 0.18, r * 0.07, 6);
      top = hy + r * 1.05;
      break;
    }
  }
  if (s.crest) {
    // Horsehair crest / torn plume running back over the helm
    k.curve(
      [
        [0, top - r * 0.1, r * 0.4],
        [0, top + r * 0.35, -r * 0.2],
        [0, top + r * 0.1, -r * 1.2],
        [0, top - r * 0.8, -r * 1.8],
      ],
      r * 0.2,
      r * 0.05,
      s.crest,
      7,
    );
  }
  return top;
}

// --- Body -------------------------------------------------------------------------------------------

export type ArmorKind = 'plate' | 'leather' | 'robe' | 'mail';
export type PauldronKind = 'none' | 'plate' | 'layered' | 'spiked' | 'fur' | 'bone';

export interface BodyColors {
  metal: string;
  dark: string;
  cloth: string;
  leather: string;
  trim: string;
}

/** Torso from waist (y 1.0) to shoulders (y 1.6), in the body frame. */
export function torso(k: K, kind: ArmorKind, b: number, col: BodyColors, opts: { tabard?: string | null; skirt?: boolean; emblem?: boolean } = {}): void {
  const { metal: m, dark: d, cloth: c, leather: l, trim: t } = col;
  // Undershirt / gambeson base so gaps never show through
  k.add(frustumGeo(0.42 * b, 0.62, 0.26 * b, 1.1, 1.05), kind === 'robe' ? c : PAL.cloth, 0, 1.3, 0);
  if (kind === 'plate' || kind === 'mail') {
    // Breastplate with a central ridge, plackart, faulds and a high gorget
    k.add(frustumGeo(0.44 * b, 0.36, 0.3 * b, 1.18, 1.05, 0.02), m, 0, 1.43, 0.015);
    k.add(frustumGeo(0.05, 0.36, 0.05, 0.6, 1, 0.02), shade(m, 0.15), 0, 1.43, 0.17 * b);
    k.add(frustumGeo(0.4 * b, 0.16, 0.28 * b, 1.08), d, 0, 1.2, 0.01);
    for (let i = 0; i < 3; i++) k.add(frustumGeo((0.46 + i * 0.03) * b, 0.07, (0.31 + i * 0.02) * b, 0.95), i % 2 ? d : m, 0, 1.1 - i * 0.065, 0);
    k.add(prismGeo(0.12 * b, 0.12, 10, 0.85), m, 0, 1.64, 0);
    k.add(frustumGeo(0.5 * b, 0.08, 0.32 * b, 0.8), d, 0, 1.6, 0);
    // Battle damage: a dent and gouges across the plate
    cbox(k, 0.12, 0.012, 0.01, 0.06, 1.48, 0.185 * b, PAL.void, 0, 0, 0.5);
    cbox(k, 0.08, 0.01, 0.01, -0.08, 1.36, 0.19 * b, PAL.void, 0, 0, -0.3);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) k.ball(0.012, sx * 0.19 * b, 1.3 + i * 0.09, 0.15 * b, t, 1, 1, 1, 5);
    if (kind === 'mail' || opts.skirt) {
      k.add(prismGeo(0.27 * b, 0.32, 14, 0.88), shade(PAL.iron, 0.1), 0, 0.88, 0);
    }
  } else if (kind === 'leather') {
    // Layered leather jerkin with straps, studs and a steel gorget
    k.add(frustumGeo(0.42 * b, 0.5, 0.28 * b, 1.12, 1.02, 0.01), l, 0, 1.33, 0.01);
    k.add(frustumGeo(0.44 * b, 0.12, 0.3 * b, 1.0), shade(l, -0.3), 0, 1.13, 0);
    cbox(k, 0.06, 0.6, 0.31 * b, 0.06, 1.35, 0, shade(l, -0.4), 0, 0, 0.55);
    for (let i = 0; i < 4; i++) k.ball(0.014, 0.06 + Math.sin(0.55) * (i - 1.5) * 0.12, 1.35 + Math.cos(0.55) * (i - 1.5) * 0.12, 0.16 * b, m, 1, 1, 1, 5);
    k.add(prismGeo(0.12 * b, 0.1, 10, 0.85), m, 0, 1.64, 0);
    k.add(prismGeo(0.27 * b, 0.36, 12, 0.9), shade(l, -0.15), 0, 0.88, 0);
  } else {
    // Robe: layered, scorched and torn at the hem, down to the ground
    k.add(tornLatheGeo([[0.42 * b, 0], [0.4 * b, 0.25], [0.3 * b, 0.75], [0.25 * b, 1.1], [0.2 * b, 1.6]], 18, 0.16, 5), c, 0, 0, 0);
    k.add(tornLatheGeo([[0.34 * b, 0.55], [0.3 * b, 0.8], [0.26 * b, 1.15]], 16, 0.14, 9), shade(c, -0.2), 0, 0.02, 0);
    k.add(frustumGeo(0.42 * b, 0.32, 0.28 * b, 1.15, 1.05), shade(c, 0.06), 0, 1.45, 0);
    k.add(frustumGeo(0.44 * b, 0.1, 0.3 * b, 1.0), l, 0, 1.12, 0);
  }
  // Belt with an iron buckle and a pouch
  k.add(prismGeo(0.24 * b, 0.06, 14), shade(l, -0.2), 0, 1.14, 0);
  cbox(k, 0.07, 0.07, 0.03, 0, 1.14, 0.25 * b, d);
  cbox(k, 0.1, 0.12, 0.07, 0.2 * b, 1.06, 0.12 * b, shade(l, -0.1), 0, 0.6, 0);
  if (opts.tabard) {
    k.add(ragGeo(0.28 * b, 0.62, { folds: 2, depth: 0.012, flare: 0.25, tatter: 0.35, seed: 13, curl: 0.04 }), opts.tabard, 0, 1.12, 0.27 * b);
    k.add(ragGeo(0.3 * b, 0.6, { folds: 2, depth: 0.012, flare: 0.25, tatter: 0.3, seed: 17, curl: -0.04 }), shade(opts.tabard, -0.15), 0, 1.12, -0.24 * b);
    if (opts.emblem) k.add(frustumGeo(0.08, 0.1, 0.01, 0.2), t, 0, 0.95, 0.29 * b);
  }
}

/** Shoulder armour drawn into an arm kit (follows the arm when it swings). s = +1 right, −1 left. */
export function pauldron(k: K, kind: PauldronKind, s: number, b: number, col: BodyColors): void {
  if (kind === 'none') return;
  const { metal: m, dark: d, trim: t } = col;
  const x = s * 0.03;
  if (kind === 'fur') {
    k.ball(0.17 * b, x, 0.02, 0, PAL.ash, 1.2, 0.8, 1.2, 10);
    for (let i = 0; i < 6; i++) k.spike(0.05, 0.16, x + s * 0.1, -0.02 - i * 0.02, -0.12 + i * 0.05, shade(PAL.ash, -0.2), 0.4, 0, s * 1.8, 4);
    return;
  }
  if (kind === 'bone') {
    k.add(capGeo(0.16 * b, Math.PI * 0.5, 10, 5), PAL.boneDark, x, 0.02, 0, 0, 0, -s * 0.5, 1.2, 0.8, 1.2);
    for (let i = 0; i < 3; i++) k.spike(0.03, 0.2, x + s * 0.05, 0.12, -0.08 + i * 0.08, PAL.bone, 0, 0, -s * 0.6, 5);
    return;
  }
  // Shoulder cop hugging the joint, with lames stepping down the upper arm (no flared "wings")
  const lames = kind === 'layered' ? 4 : 3;
  k.add(capGeo(0.15 * b, Math.PI * 0.5, 10, 5), m, x + s * 0.015, 0.03, 0, 0, 0, -s * 0.22, 1.12, 0.78, 1.18);
  for (let i = 1; i < lames; i++) {
    const w = (0.135 - i * 0.008) * b;
    k.add(capGeo(w, Math.PI * 0.42, 10, 3), i % 2 ? d : m, x + s * (0.025 + i * 0.006), 0.03 - i * 0.055, 0, 0, 0, -s * (0.3 + i * 0.05), 1.1, 0.55, 1.15);
  }
  // Raised neck guard (haute-piece) and a trim edge
  k.add(frustumGeo(0.025, 0.1, 0.2 * b, 0.7), d, x - s * 0.07, 0.12, 0, 0, 0, -s * 0.12);
  k.ring(0.15 * b, 0.01, x + s * 0.015, 0.01, 0, t, Math.PI / 2, 0, -s * 0.22);
  if (kind === 'spiked') for (let i = 0; i < 3; i++) k.spike(0.03, 0.22, x + s * 0.12, 0.12 - i * 0.02, -0.1 + i * 0.1, d, 0, 0, -s * 0.9, 5);
}

/** Arm from the shoulder pivot down to the wrist (y −0.6), with a gauntlet. */
export function arm(k: K, kind: ArmorKind, s: number, b: number, col: BodyColors): void {
  const { metal: m, dark: d, cloth: c, leather: l } = col;
  const wide = 0.075 * Math.sqrt(b);
  if (kind === 'robe') {
    // Wide torn sleeve over a wrapped forearm
    k.add(tornLatheGeo([[wide * 2.1, -0.52], [wide * 1.6, -0.32], [wide * 1.1, 0.02]], 10, 0.08, 21 + s), c, 0, 0, 0);
    k.add(prismGeo(wide * 0.8, 0.22, 8, 1.1), PAL.leatherDark, 0, -0.52, 0);
  } else {
    k.add(prismGeo(wide, 0.3, 8, 1.1), kind === 'leather' ? l : PAL.cloth, 0, -0.15, 0);
    // Elbow cop / leather pad
    k.add(capGeo(wide * 1.25, Math.PI * 0.55, 8, 4), kind === 'leather' ? shade(l, -0.2) : m, 0, -0.31, -0.01, -Math.PI / 2 - 0.3, 0, 0);
    // Vambrace
    k.add(prismGeo(wide * 1.05, 0.25, 8, 1.15), kind === 'leather' ? shade(l, -0.15) : m, 0, -0.45, 0);
    if (kind !== 'leather') k.add(frustumGeo(0.02, 0.2, 0.02, 0.5), shade(m, 0.2), 0, -0.45, wide * 1.05);
    else for (let i = 0; i < 3; i++) k.ring(wide * 1.12, 0.008, 0, -0.38 - i * 0.06, 0, d);
  }
  // Gauntlet: angular back plate, cuff and fingers (no round "mitten" hands)
  const g = kind === 'leather' || kind === 'robe' ? shade(l, -0.25) : d;
  k.add(frustumGeo(wide * 2.0, 0.07, wide * 1.6, 0.9), kind === 'robe' ? PAL.leatherDark : m, 0, -0.58, 0);
  k.add(frustumGeo(wide * 1.5, 0.11, wide * 1.15, 0.85, 0.9), g, 0, -0.67, 0.01);
  cbox(k, wide * 0.4, 0.08, wide * 0.4, -s * wide * 0.8, -0.65, wide * 0.6, g, 0.3, 0, s * 0.4);
}

/** Leg from the hip pivot down to the sole (y −1.0). */
export function leg(k: K, kind: ArmorKind, b: number, col: BodyColors): void {
  const { metal: m, dark: d, leather: l } = col;
  const lb = Math.sqrt(b);
  if (kind === 'robe') return;
  const plate = kind === 'plate' || kind === 'mail';
  // Thigh (cuisse or leather) and knee cop with a side wing
  k.add(prismGeo(0.095 * lb, 0.46, 8, 1.15), plate ? m : l, 0, -0.24, 0.005);
  k.add(capGeo(0.085 * lb, Math.PI * 0.55, 8, 4), plate ? shade(m, 0.08) : shade(l, -0.25), 0, -0.5, 0.03, Math.PI / 2 - 0.2, 0, 0, 1, 1, 1);
  if (plate) k.add(frustumGeo(0.02, 0.12, 0.1, 0.4), d, 0.085 * lb, -0.5, 0.0, 0, 0, 0.15);
  // Greave / boot shaft
  k.add(prismGeo(0.072 * lb, 0.4, 8, 1.2), plate ? m : shade(l, -0.3), 0, -0.73, 0.0);
  if (plate) k.add(frustumGeo(0.02, 0.36, 0.02, 0.5), shade(m, 0.2), 0, -0.73, 0.08 * lb);
  // Sabaton: articulated, pointed steel shoe (or heavy boot)
  k.add(frustumGeo(0.13 * lb, 0.07, 0.26, 0.85, 0.9), plate ? d : PAL.leatherDark, 0, -0.96, 0.05);
  if (plate) for (let i = 0; i < 3; i++) k.add(frustumGeo(0.12 * lb, 0.025, 0.06, 0.9), m, 0, -0.92 + i * 0.012, 0.09 + i * 0.05);
  k.add(new THREE.ConeGeometry(0.05 * lb, 0.1, 4), plate ? m : PAL.leatherDark, 0, -0.95, 0.2, Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.55);
}

// --- Weapons and shields ----------------------------------------------------------------------------

export type WeaponKind = 'greatsword' | 'longsword' | 'falchion' | 'hookblade' | 'longbow' | 'crossbow' | 'staff' | 'warhammer' | 'greataxe' | 'scythe' | 'mace' | 'flail' | 'bomb' | 'lantern' | 'claws' | 'halberd' | 'none';

export interface WeaponColors {
  metal: string;
  dark: string;
  grip: string;
  trim: string;
  glow: string;
}

/**
 * Builds a weapon along +y from the grip into `k`; glows are added to `g` (the weapon group).
 * Returns spinner objects (burning orbs) for the rig.
 */
export function weapon(k: K, g: THREE.Object3D, kind: WeaponKind, col: WeaponColors): THREE.Object3D[] {
  const { metal: m, dark: d, grip: gr, trim: t, glow } = col;
  const spin: THREE.Object3D[] = [];
  const wrap = (y0: number, y1: number, r: number) => {
    k.add(prismGeo(r, y1 - y0, 6), gr, 0, (y0 + y1) / 2, 0);
    for (let y = y0 + 0.03; y < y1; y += 0.05) k.ring(r * 1.08, r * 0.25, 0, y, 0, shade(gr, -0.3));
  };
  switch (kind) {
    case 'greatsword':
    case 'longsword': {
      const big = kind === 'greatsword';
      const len = big ? 1.25 : 0.9;
      wrap(-0.1, big ? 0.28 : 0.16, 0.024);
      k.add(new THREE.OctahedronGeometry(0.045), d, 0, -0.14, 0, 0, 0, 0, 1, 1.4, 1);
      // Angular crossguard with down-swept quillons
      k.add(frustumGeo(big ? 0.42 : 0.3, 0.05, 0.05, 0.6), d, 0, big ? 0.3 : 0.18, 0);
      for (const sx of [-1, 1]) k.add(new THREE.ConeGeometry(0.025, 0.1, 4), d, sx * (big ? 0.23 : 0.17), big ? 0.27 : 0.15, 0, 0, 0, sx * 2.4);
      const base = big ? 0.33 : 0.21;
      k.plate(SHAPES.notchedBlade(len, big ? 0.07 : 0.05), 0.012, 0.01, 0, base, 0, m);
      k.add(frustumGeo(big ? 0.035 : 0.025, len * 0.75, 0.03, 0.5), shade(m, -0.35), 0, base + len * 0.4, 0);
      break;
    }
    case 'falchion':
      wrap(-0.08, 0.12, 0.022);
      k.add(frustumGeo(0.18, 0.04, 0.04, 0.7), d, 0, 0.14, 0);
      k.plate(SHAPES.falchion(0.62, 0.05), 0.012, 0.008, 0, 0.16, 0, m);
      break;
    case 'hookblade':
      wrap(-0.08, 0.14, 0.02);
      k.add(new THREE.OctahedronGeometry(0.03), d, 0, -0.1, 0, 0, 0, 0, 1, 1.5, 1);
      k.plate(SHAPES.hook(0.55, 0.04), 0.01, 0.006, 0, 0.14, 0, m);
      k.add(frustumGeo(0.012, 0.2, 0.02, 0.4), PAL.bloodBright, 0.02, 0.4, 0.008, 0, 0, -0.3);
      break;
    case 'longbow': {
      // Tall, angular recurve of dark wood with steel-capped tips and a taut string
      const pts = (sx: number): V[] => [
        [0, 0, 0],
        [0, sx * 0.35, 0.1],
        [0, sx * 0.72, 0.06],
        [0, sx * 0.86, -0.06],
      ];
      for (const sx of [-1, 1]) {
        k.curve(pts(sx), 0.035, 0.016, gr, 6);
        k.add(new THREE.ConeGeometry(0.022, 0.12, 4), m, 0, sx * 0.9, -0.08, sx > 0 ? -0.6 : Math.PI + 0.6, 0, 0);
      }
      k.add(prismGeo(0.032, 0.18, 6), PAL.leatherDark, 0, 0, 0.01);
      k.add(new THREE.CylinderGeometry(0.004, 0.004, 1.72, 4), PAL.bone, 0, 0, -0.07);
      break;
    }
    case 'crossbow':
      k.add(frustumGeo(0.06, 0.62, 0.07, 0.8), gr, 0, 0.2, 0);
      k.curve(
        [
          [-0.32, 0.42, -0.04],
          [0, 0.48, 0.02],
          [0.32, 0.42, -0.04],
        ],
        0.025,
        0.025,
        d,
        6,
      );
      cbox(k, 0.03, 0.18, 0.05, 0, 0.0, 0.03, m);
      k.add(new THREE.CylinderGeometry(0.004, 0.004, 0.64, 4), PAL.bone, 0, 0.36, -0.03, 0, 0, Math.PI / 2);
      break;
    case 'staff': {
      // Gnarled black staff with an iron cage holding unnatural fire
      k.curve(
        [
          [0, -0.55, 0],
          [0.03, 0.1, 0.02],
          [-0.03, 0.75, -0.02],
          [0, 1.1, 0],
        ],
        0.032,
        0.026,
        gr,
        6,
      );
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        k.curve(
          [
            [Math.cos(a) * 0.03, 1.08, Math.sin(a) * 0.03],
            [Math.cos(a) * 0.14, 1.22, Math.sin(a) * 0.14],
            [Math.cos(a) * 0.09, 1.42, Math.sin(a) * 0.09],
            [Math.cos(a + 0.6) * 0.02, 1.5, Math.sin(a + 0.6) * 0.02],
          ],
          0.014,
          0.006,
          d,
          5,
        );
      }
      k.ring(0.045, 0.012, 0, 0.98, 0, t);
      const orb = addGlow(g, new THREE.IcosahedronGeometry(0.07, 1), glow, 0, 1.27, 0, 5);
      spin.push(orb);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.22, depthWrite: false }));
      halo.position.set(0, 1.27, 0);
      g.add(halo);
      break;
    }
    case 'warhammer':
      k.add(prismGeo(0.026, 1.05, 6), gr, 0, 0.3, 0);
      for (let i = 0; i < 3; i++) k.ring(0.03, 0.008, 0, -0.1 + i * 0.05, 0, d);
      k.add(frustumGeo(0.14, 0.16, 0.3, 0.9, 0.9), d, 0, 0.88, 0);
      k.add(frustumGeo(0.15, 0.04, 0.32, 1), m, 0, 0.96, 0);
      k.add(new THREE.ConeGeometry(0.05, 0.22, 4), m, 0, 0.88, -0.25, -Math.PI / 2, 0, 0);
      k.add(new THREE.ConeGeometry(0.04, 0.2, 4), m, 0, 1.05, 0);
      break;
    case 'greataxe':
      k.add(prismGeo(0.026, 1.2, 6), gr, 0, 0.35, 0);
      for (let i = 0; i < 4; i++) k.ring(0.03, 0.008, 0, -0.15 + i * 0.05, 0, d);
      k.plate(SHAPES.axeHead(0.26), 0.02, 0.01, 0.02, 0.85, 0, m, 0, 0, 0);
      k.plate(SHAPES.axeHead(0.2), 0.02, 0.01, -0.02, 0.85, 0, d, 0, Math.PI, 0);
      k.add(new THREE.ConeGeometry(0.03, 0.18, 4), m, 0, 1.03, 0);
      break;
    case 'halberd':
      k.add(prismGeo(0.022, 1.6, 6), gr, 0, 0.45, 0);
      k.plate(SHAPES.axeHead(0.18), 0.018, 0.008, 0.02, 1.08, 0, m);
      k.add(new THREE.ConeGeometry(0.035, 0.35, 4), m, 0, 1.38, 0);
      k.add(new THREE.ConeGeometry(0.025, 0.16, 4), d, -0.08, 1.08, 0, 0, 0, Math.PI / 2);
      break;
    case 'scythe':
      k.add(prismGeo(0.022, 1.5, 6), gr, 0, 0.4, 0);
      k.plate(SHAPES.scytheBlade(0.75), 0.012, 0.006, 0, 1.12, 0, m, 0, 0, 0);
      break;
    case 'mace':
    case 'flail':
      wrap(-0.08, 0.2, 0.024);
      k.add(prismGeo(0.02, 0.35, 6), d, 0, 0.36, 0);
      k.add(new THREE.IcosahedronGeometry(0.09, 0), d, 0, 0.6, 0);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        k.add(new THREE.ConeGeometry(0.022, 0.1, 4), m, Math.cos(a) * 0.09, 0.6 + (i % 2 ? 0.04 : -0.04), Math.sin(a) * 0.09, Math.sin(a) * 1.5, 0, -Math.cos(a) * 1.5);
      }
      break;
    case 'bomb':
      k.ball(0.13, 0, 0.1, 0, PAL.black, 1, 1, 1, 12);
      k.ring(0.132, 0.012, 0, 0.1, 0, d, 0.4);
      k.add(prismGeo(0.04, 0.06, 8), d, 0, 0.24, 0);
      addGlow(g, new THREE.OctahedronGeometry(0.03), glow, 0.04, 0.3, 0.02, 6);
      break;
    case 'lantern':
      // Iron censer on a chain, burning with sickly light
      k.add(prismGeo(0.012, 0.3, 4), d, 0, 0.1, 0);
      k.add(prismGeo(0.07, 0.14, 6, 0.8), d, 0, -0.12, 0);
      k.add(new THREE.ConeGeometry(0.08, 0.08, 6), d, 0, -0.01, 0);
      addGlow(g, new THREE.IcosahedronGeometry(0.045, 1), glow, 0, -0.12, 0, 4);
      break;
    case 'claws':
      for (const sx of [-1, 0, 1])
        k.curve(
          [
            [sx * 0.04, 0, 0.03],
            [sx * 0.05, 0.16, 0.08],
            [sx * 0.04, 0.3, 0.0],
          ],
          0.02,
          0.003,
          PAL.bone,
          5,
        );
      break;
    case 'none':
      break;
  }
  return spin;
}

export type ShieldKind = 'heater' | 'tower' | 'round' | 'spiked' | null;

/** Shield on the left forearm, facing forward. */
export function shield(k: K, kind: ShieldKind, col: { face: string; metal: string; dark: string; trim: string }): void {
  if (!kind) return;
  const { face, metal: m, dark: d, trim: t } = col;
  if (kind === 'round') {
    k.add(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 14), face, 0.06, 0.0, 0.16, Math.PI / 2, 0, 0);
    k.ring(0.34, 0.025, 0.06, 0, 0.16, d, 0, 0, 0);
    k.add(capGeo(0.09, Math.PI / 2, 8, 4), m, 0.06, 0, 0.19, Math.PI / 2, 0, 0);
    for (let i = 0; i < 4; i++) cbox(k, 0.03, 0.62, 0.02, 0.06, 0, 0.19, d, 0, 0, (i * Math.PI) / 4);
    return;
  }
  const tall = kind === 'tower' ? 1.25 : 0.82;
  const shape = kind === 'tower' ? SHAPES.tower(0.33, tall) : SHAPES.heater(0.3, tall);
  k.plate(shape, 0.06, 0.02, 0.05, -0.1, 0.16, d, 0, 0, 0, 1.06);
  k.plate(shape, 0.07, 0.015, 0.05, -0.1, 0.19, face);
  // Iron bands, a central boss and battle scars
  k.add(frustumGeo(0.05, tall * 0.85, 0.02, 0.8), m, 0.05, -0.1, 0.235);
  k.add(frustumGeo(0.5, 0.04, 0.02, 1), m, 0.05, -0.02, 0.235);
  k.add(capGeo(0.07, Math.PI / 2, 8, 4), t, 0.05, -0.02, 0.24, Math.PI / 2, 0, 0);
  cbox(k, 0.18, 0.012, 0.01, 0.12, 0.14, 0.24, PAL.void, 0, 0, 0.6);
  cbox(k, 0.12, 0.012, 0.01, -0.02, -0.28, 0.24, PAL.void, 0, 0, -0.4);
  if (kind === 'spiked' || kind === 'tower') for (const [x, y] of [[-0.18, 0.3], [0.28, 0.3], [0.05, -0.55]] as const) k.add(new THREE.ConeGeometry(0.03, 0.12, 4), m, x, y, 0.25, Math.PI / 2, 0, 0);
}

// --- Capes ------------------------------------------------------------------------------------------

/** Long torn cape hanging from the cape pivot (top centre). */
export function cape(k: K, w: number, h: number, color: string, trim: string | null, seed = 31): void {
  k.add(ragGeo(w, h, { folds: 3, depth: 0.05, flare: 0.35, tatter: 0.28, seed, curl: 0.18 }), color, 0, 0, 0);
  if (trim) k.add(frustumGeo(w * 0.95, 0.05, 0.06, 1), trim, 0, -0.02, 0.02);
}

// --- Warrior ----------------------------------------------------------------------------------------

export interface WarriorSpec {
  attack?: Rig['attack'];
  /** Width factor: 0.9 lean, 1 normal, 1.15 heavy, 1.3 brute. */
  bulk?: number;
  /** Overall height factor (1 = about 2.1 units). */
  tall?: number;
  armor: ArmorKind;
  head: HeadSpec;
  colors: BodyColors;
  pauldrons?: PauldronKind;
  weapon: WeaponKind;
  weaponColors?: Partial<WeaponColors>;
  /** Second weapon in the left hand (dual wielding) instead of a shield. */
  offhand?: WeaponKind | null;
  shield?: ShieldKind;
  shieldFace?: string;
  cape?: string | null;
  tabard?: string | null;
  emblem?: boolean;
  skirt?: boolean;
  /** Bespoke details: draw into the torso/head kits or attach glows to the groups. */
  extra?: (parts: WarriorParts) => void;
}

export interface WarriorParts {
  rig: Rig;
  /** Torso kit in body-frame coordinates (hips y 1.0, shoulders y 1.56). */
  torso: K;
  /** Head kit (head centre at (0, HEAD_Y, 0) in the head group). */
  head: K;
  frame: THREE.Group;
  headGroup: THREE.Group;
  handR: THREE.Group;
  handL: THREE.Group;
  armRKit: K;
  armLKit: K;
  capeKit: K | null;
}

export const HEAD_Y = 1.81;
export const HEAD_R = 0.125;
const NECK_Y = 1.66;

/** A realistically proportioned armoured humanoid built from the parts above. */
export function warrior(spec: WarriorSpec): Rig {
  const rig = newRig('biped', spec.attack ?? 'melee');
  const b = spec.bulk ?? 1;
  const col = spec.colors;
  const frame = pivot(rig.body, 0, 0, 0);
  frame.scale.setScalar(spec.tall ?? 1);
  const k = new K();
  const hk = new K();
  const neck = pivot(frame, 0, NECK_Y, 0);
  rig.neck = neck;
  const headGroup = pivot(neck, 0, -NECK_Y, 0);
  rig.head = headGroup;

  torso(k, spec.armor, b, col, { tabard: spec.tabard, skirt: spec.skirt, emblem: spec.emblem });
  // Neck and head
  k.add(prismGeo(0.06 * b, 0.12, 8), PAL.cloth, 0, 1.68, 0);
  const top = head(hk, headGroup, spec.head, HEAD_Y, HEAD_R);

  // Legs
  if (spec.armor !== 'robe') {
    for (const s of [-1, 1]) {
      const lp = pivot(frame, s * 0.12 * b, 1.0, 0);
      const lk = new K();
      leg(lk, spec.armor, b, col);
      addMesh(rig, lp, lk);
      rig.legs.push(lp);
    }
  }

  // Arms with pauldrons, gauntlets and hands holding the weapons
  const wcol: WeaponColors = { metal: PAL.steel, dark: PAL.blackSteel, grip: PAL.leatherDark, trim: col.trim, glow: PAL.ember, ...spec.weaponColors };
  let armRKit: K | null = null;
  let armLKit: K | null = null;
  let handR: THREE.Group | null = null;
  let handL: THREE.Group | null = null;
  for (const s of [1, -1]) {
    const ap = pivot(frame, s * 0.26 * b, 1.56, 0);
    const ak = new K();
    arm(ak, spec.armor, s, b, col);
    pauldron(ak, spec.pauldrons ?? 'none', s, b, col);
    const hand = pivot(ap, 0, -0.66, 0.03);
    if (s === 1) {
      rig.armR = ap;
      armRKit = ak;
      handR = hand;
      const wg = pivot(hand, 0, 0, 0);
      wg.rotation.x = 1.05;
      const wk = new K();
      rig.spinners.push(...weapon(wk, wg, spec.weapon, wcol));
      if (!wk.empty) addMesh(rig, wg, wk);
    } else {
      rig.armL = ap;
      armLKit = ak;
      handL = hand;
      const sk = new K();
      if (spec.offhand) {
        const wg = pivot(hand, 0, 0, 0);
        wg.rotation.x = 1.05;
        rig.spinners.push(...weapon(sk, wg, spec.offhand, wcol));
        if (!sk.empty) addMesh(rig, wg, sk);
      } else if (spec.shield) {
        rig.shield = true;
        shield(sk, spec.shield, { face: spec.shieldFace ?? col.dark, metal: col.metal, dark: col.dark, trim: col.trim });
        addMesh(rig, hand, sk);
      } else if (spec.weapon === 'longbow') {
        // The bow is held in the left hand; the right hand draws the string
        const wg = pivot(hand, 0, 0, 0.02);
        const bk = new K();
        weapon(bk, wg, 'longbow', wcol);
        addMesh(rig, wg, bk);
      }
    }
  }

  let capeKit: K | null = null;
  if (spec.cape) {
    const cp = pivot(frame, 0, 1.6, -0.17 * b);
    capeKit = new K();
    cape(capeKit, 0.62 * b, 1.4, spec.cape, null);
    rig.cape = cp;
  }

  spec.extra?.({ rig, torso: k, head: hk, frame, headGroup, handR: handR!, handL: handL!, armRKit: armRKit!, armLKit: armLKit!, capeKit });

  addMesh(rig, frame, k);
  addMesh(rig, headGroup, hk);
  addMesh(rig, rig.armR!, armRKit!);
  addMesh(rig, rig.armL!, armLKit!);
  if (capeKit && rig.cape) addMesh(rig, rig.cape, capeKit);
  rig.height = top * (spec.tall ?? 1) + 0.05;
  return rig;
}

/** Glowing rune sigil (flat), e.g. on golems, shields and robes. */
export function rune(parent: THREE.Object3D, hex: string, x: number, y: number, z: number, size = 0.08, rot = 0, lum = 4): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(0, size);
  s.lineTo(size * 0.3, 0);
  s.lineTo(size * 0.75, size * 0.1);
  s.lineTo(size * 0.2, -size * 0.2);
  s.lineTo(size * 0.4, -size);
  s.lineTo(0, -size * 0.35);
  s.lineTo(-size * 0.4, -size);
  s.lineTo(-size * 0.2, -size * 0.2);
  s.lineTo(-size * 0.75, size * 0.1);
  s.lineTo(-size * 0.3, 0);
  s.closePath();
  const m = addGlow(parent, new THREE.ShapeGeometry(s), hex, x, y, z, lum);
  m.rotation.z = rot;
  return m;
}
