import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { K, shade, type V } from '../../../base3d/sculpt';
import { addMesh, newRig, pivot, type Rig } from '../../rig';
import { capGeo, frustumGeo, HEAD_Y, metal, prismGeo } from '../parts';
import {
  Fiend,
  Glows,
  SHADOW,
  band,
  clothGeo,
  crescentGeo,
  dressAt,
  fanGeo,
  flat,
  gouge,
  grip,
  latheGeo,
  lerpV,
  lineGeo,
  loftGeo,
  mix,
  onLathe,
  pauldron,
  plateGeo,
  rivet,
  scratch,
  shape,
  shellGeo,
  skull,
  slabGeo,
  spikeAB,
  sweep,
  triGeo,
  worldLook,
  type Look,
} from './_enemies';

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
}

/**
 * The opposing army, one model per role and world: blackened, glossy plate and dark hide tinted by
 * the world, with one vivid accent glow (eyes, eye slits, runes, sigils, cracks) and per-world
 * dressing (rot and moss, frost and icicles, ember cracks, grave bones, violet crystal).
 *
 *   normal  - Hollow Footsoldier: lean plate, pointed prow visor with a burning eye slit, crested
 *             sallet, a notched cleaver with a rune-lit fuller, torn tabard and half cape.
 *   ranged  - Hooded Cultist Archer: deep pointed hood over a visor mask, crescent horned
 *             pauldrons, a glowing chest sigil, a long split coat and a rune-lit black recurve.
 *   fast    - Carrion Hound (quadruped): gaunt, deep-chested, exposed ribs with glowing cracks,
 *             a horned plate mask with a burning maw, spiked barding along the spine.
 *   armored - Dread Brute: tall pointed great helm with horns, massive horned pauldrons, flanged
 *             maul, spiked kite shield with a burning sigil, heavy mantle and cape.
 *   flying  - Carrion Wraith (flyer): hooded horned skull mask, an open ribcage with a burning
 *             heart, torn bat wings on long finger bones, talons and trailing rags.
 *
 * A tier below the heroes in detail, but threatening: sharp silhouettes, no faces, no cute shapes.
 */
export function enemyUnit(role: string, world: number, p: Palette): Rig {
  const L = worldLook(world, p);
  switch (role) {
    case 'ranged':
      return cultistArcher(L);
    case 'fast':
      return carrionHound(L);
    case 'armored':
      return dreadBrute(L);
    case 'flying':
      return carrionWraith(L);
    default:
      return footsoldier(L);
  }
}

const HY = HEAD_Y;

/** Blade steel: a little brighter than the armour so weapons read at small size. */
const BLADE = metal('#6c727a', 0.86);
const BLADE_EDGE = metal('#a9b1ba', 0.92);

// --- Heads ------------------------------------------------------------------------------------------

/**
 * Narrow glowing eye slits on a faceted prow visor whose seams sit at phi 0 and ±fa: one bar per
 * side on the facet, rising towards the temple, set in a dark recess.
 */
function eyeSlits(k: K, gl: Glows, parent: THREE.Object3D, L: Look, r: number, sz: number, fa: number, y: number, o: { t0?: number; t1?: number; rise?: number; w?: number; lum?: number } = {}): void {
  const { t0 = 0.14, t1 = 0.78, rise = 0.024, w = 0.0072, lum = 6 } = o;
  for (const s of [-1, 1]) {
    const A = onLathe(r, 0, y, sz);
    const B = onLathe(r, s * fa, y, sz);
    const out = (v: V, f: number): V => [v[0] * f, v[1], v[2] * f];
    const a = lerpV(A, B, t0);
    const b = lerpV(A, B, t1);
    a[1] -= rise / 2;
    b[1] += rise / 2;
    k.add(lineGeo([out(a, 1.0), out(b, 1.0)], w * 1.9, 4), SHADOW, 0, 0, 0);
    gl.add(parent, L.glow, lum, lineGeo([out(a, 1.02), out(b, 1.02)], w, 4));
  }
}

/** Raised trim along the seams of a faceted lathe band (brows, visor edges). */
function facetLine(r: number, y: number, sz: number, phis: number[], f = 1.02): V[] {
  return phis.map((a) => onLathe(r * f, a, y, sz));
}

/** Crested sallet with a faceted prow visor and a burning eye slit (footsoldier). */
function sallet(F: Fiend): number {
  const k = F.head;
  const L = F.L;
  const g = F.headGroup;
  k.ball(0.11, 0, HY, 0, SHADOW, 1, 1.05, 1.05, 10);
  // Helm skull, swept back into a flared tail
  const dome: [number, number][] = [
    [0.132, 1.75],
    [0.142, 1.81],
    [0.138, 1.87],
    [0.12, 1.925],
    [0.085, 1.962],
    [0.035, 1.985],
    [0.002, 1.99],
  ];
  k.add(latheGeo(dome, 14), L.plate, 0, 0, -0.012, 0, 0, 0, 0.94, 1, 1.12);
  k.add(shellGeo([[0.19, 1.65], [0.16, 1.71], [0.142, 1.78]], Math.PI, 1.65, 12, 1.12, 0, 0.07), L.dark, 0, 0, -0.012, 0, 0, 0, 0.94, 1, 1);
  k.add(lineGeo(facetLine(0.19, 1.65, 1.05, [Math.PI - 1.5, Math.PI - 0.75, Math.PI, Math.PI + 0.75, Math.PI + 1.5], 1.0), 0.006), L.edge, 0, -0.005, -0.012);
  // Prow visor: four flat facets meeting in a sharp keel
  const FA = 0.7;
  const SZ = 1.3;
  const vp: [number, number][] = [
    [0.1, 1.65],
    [0.138, 1.7],
    [0.15, 1.77],
    [0.149, 1.84],
    [0.136, 1.878],
  ];
  k.add(flat(shellGeo(vp, 0, FA * 2, 4, SZ)), L.plate, 0, 0, 0);
  k.add(lineGeo(vp.map(([r, y]) => onLathe(r + 0.004, 0, y, SZ)), 0.0075, 4), L.plateHi, 0, 0, 0);
  k.add(lineGeo(facetLine(0.136, 1.878, SZ, [-1.4, -0.7, 0, 0.7, 1.4]), 0.0065), L.edge, 0, 0, 0);
  k.add(lineGeo(facetLine(0.1, 1.65, SZ, [-1.4, -0.7, 0, 0.7, 1.4]), 0.006), L.edge, 0, 0, 0);
  eyeSlits(k, F.gl, g, L, 0.1495, SZ, FA, 1.808, { w: 0.009, lum: 7 });
  // Breaths punched in the right cheek
  for (let i = 0; i < 3; i++) {
    const p = lerpV(onLathe(0.142, 0, 1.72 + i * 0.022, SZ), onLathe(0.142, 0.7, 1.72 + i * 0.022, SZ), 0.55);
    k.add(new THREE.BoxGeometry(0.022, 0.006, 0.01), SHADOW, p[0] * 1.02, p[1], p[2] * 1.02, 0, 0.45, 0);
  }
  // Low comb crest
  const comb = shape([
    [-0.1, 0],
    [0.2, 0],
    [0.26, 0.03],
    [0.12, 0.075],
    [-0.02, 0.07],
    [-0.12, 0.03],
  ]);
  k.add(plateGeo(comb, 0.016, 0.004), L.dark, 0, 1.955, 0.0, 0, Math.PI / 2, 0);
  k.add(lineGeo([[0, 2.03, 0.12], [0, 2.03, -0.03], [0, 1.99, -0.2]], 0.005), L.edge, 0, 0, 0);
  gouge(k, 0.06, 0.08, 1.88, 0.1, 0.5, 0.6);
  scratch(k, 0.05, -0.09, 1.79, 0.13, -0.3, -0.6);
  return 2.03;
}

/** Tall pointed great helm with a T-slit, jutting chin and blackened horns (brute). */
function greatHelm(F: Fiend): number {
  const k = F.head;
  const L = F.L;
  const g = F.headGroup;
  k.ball(0.11, 0, HY, 0, SHADOW, 1, 1.05, 1.05, 10);
  const SZ = 1.1;
  const prof: [number, number][] = [
    [0.142, 1.655],
    [0.155, 1.71],
    [0.158, 1.79],
    [0.152, 1.86],
    [0.13, 1.93],
    [0.085, 2.0],
    [0.035, 2.07],
    [0.002, 2.13],
  ];
  k.add(flat(latheGeo(prof, 8)), L.plate, 0, 0, 0, 0, 0, 0, 1, 1, SZ);
  // Keel and seam ridges
  k.add(lineGeo(prof.map(([r, y]) => onLathe(r + 0.006, 0, y, SZ)), 0.009, 4), L.plateHi, 0, 0, 0);
  for (const s of [-1, 1]) k.add(lineGeo(prof.slice(2).map(([r, y]) => onLathe(r + 0.004, s * Math.PI * 0.5, y, SZ)), 0.006, 4), L.edge, 0, 0, 0);
  // Brow band and lower rim
  k.add(lineGeo(facetLine(0.158, 1.835, SZ, [-Math.PI * 0.75, -Math.PI * 0.5, -Math.PI * 0.25, 0, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75]), 0.008), L.edge, 0, 0, 0);
  band(k, 0.15, 0.012, 0, 1.66, 0, L.dark, Math.PI / 2, 0, 0, 8);
  // Jutting chin guard
  k.add(flat(shellGeo([[0.11, 1.6], [0.168, 1.67], [0.168, 1.74]], 0, 1.2, 4, 1.32, 0, 0.03)), L.dark, 0, 0, 0);
  eyeSlits(k, F.gl, g, L, 0.158, SZ, Math.PI / 4, 1.795, { t0: 0.06, t1: 0.92, rise: 0.012, w: 0.008, lum: 6.5 });
  // Vertical slit under the eye bar
  k.add(lineGeo([onLathe(0.162, 0, 1.78, SZ), onLathe(0.162, 0, 1.7, SZ)], 0.008, 4), SHADOW, 0, 0, 0);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) rivet(k, ...onLathe(0.162, s * (0.55 + i * 0.18), 1.7, SZ), L.edge, 0.009);
  // Horns sweeping out, up and forward
  const horn = shade(L.bone, -0.55);
  for (const s of [-1, 1]) {
    k.add(
      crescentGeo(
        [
          [s * 0.13, 1.88, -0.01],
          [s * 0.26, 1.9, -0.04],
          [s * 0.34, 2.02, 0.0],
          [s * 0.31, 2.18, 0.1],
        ],
        0.04,
        0.003,
        'z',
        0.7,
        6,
      ),
      horn,
      0,
      0,
      0,
    );
    band(k, 0.036, 0.008, s * 0.15, 1.885, -0.01, L.edge, 0, 0, Math.PI / 2 - s * 0.2, 8);
  }
  gouge(k, 0.07, -0.09, 1.9, 0.12, -0.6, -0.6);
  scratch(k, 0.06, 0.1, 1.74, 0.12, 0.4, 0.6);
  return 2.18;
}

/**
 * Deep hood swept into a forward point, shadowed inside, around a small prow visor mask with
 * glowing eyes. Built round the head centre HY in `k`; glows go on `parent`.
 */
function hood(k: K, gl: Glows, parent: THREE.Object3D, L: Look, o: { cloth: string; mask: string; horns?: number; skullMask?: boolean }): number {
  k.ball(0.11, 0, HY, 0, SHADOW, 1, 1.05, 1.05, 10);
  const prof: [number, number][] = [
    [0.225, 1.6],
    [0.21, 1.68],
    [0.194, 1.78],
    [0.176, 1.86],
    [0.145, 1.93],
    [0.095, 1.985],
    [0.035, 2.025],
    [0.001, 2.035],
  ];
  const open = 0.64;
  const SY = 1.8;
  const SK = 0.95;
  k.add(sweep(shellGeo(prof, Math.PI, Math.PI - open, 16, 1.12), SY, SK), o.cloth, 0, 0, -0.012);
  // Shadowed lining so the opening reads as a deep black void
  k.add(sweep(shellGeo(prof.map(([r, y]) => [r * 0.9, y - 0.01]), Math.PI, Math.PI - open + 0.05, 14, 1.1), SY, SK), SHADOW, 0, 0, -0.012);
  // Raised edge along the opening
  for (const s of [-1, 1]) {
    const pts: V[] = prof.slice(0, 6).map(([r, y]) => {
      const p = onLathe(r + 0.004, s * open, y, 1.12);
      return [p[0], y, p[2] - 0.012 + Math.max(0, y - SY) * SK];
    });
    k.add(lineGeo(pts, 0.007, 4), L.edge, 0, 0, 0);
  }
  // Mask: small faceted prow visor, recessed
  const SZ = 1.32;
  const FA = 0.62;
  const mp: [number, number][] = [
    [0.07, 1.68],
    [0.102, 1.73],
    [0.116, 1.8],
    [0.112, 1.86],
    [0.088, 1.9],
  ];
  k.add(flat(shellGeo(mp, 0, FA * 2, 4, SZ, 0, 0)), o.mask, 0, 0, 0);
  k.add(lineGeo(mp.map(([r, y]) => onLathe(r + 0.003, 0, y, SZ)), 0.005, 4), o.skullMask ? shade(o.mask, -0.4) : L.plateHi, 0, 0, 0);
  if (o.skullMask) {
    // Bone mask: cracked, with teeth scored into the jaw
    for (let i = -2; i <= 2; i++) {
      const p = onLathe(0.103, i * 0.12, 1.715, SZ);
      k.add(new THREE.BoxGeometry(0.004, 0.026, 0.006), SHADOW, p[0], p[1], p[2] + 0.002, 0, i * 0.12, 0);
    }
  }
  eyeSlits(k, gl, parent, L, 0.116, SZ, FA, 1.81, { t0: 0.16, t1: 0.82, rise: 0.02, w: 0.0065, lum: 6.5 });
  if (o.horns) {
    for (const s of [-1, 1])
      k.add(
        crescentGeo(
          [
            [s * 0.16, 1.9, -0.04],
            [s * 0.25, 1.97, -0.08],
            [s * 0.28, 2.05 + o.horns * 0.3, -0.04],
            [s * 0.21, 2.05 + o.horns, 0.04],
          ],
          0.034,
          0.003,
          'z',
          0.55,
          5,
        ),
        L.dark,
        0,
        0,
        0,
      );
  }
  return 2.04 + (o.horns ?? 0);
}

/** Flat glowing sigil (diamond with swept arms) facing +z. */
function sigilShape(sz: number) {
  return shape(
    (
      [
        [0, 1],
        [0.16, 0.32],
        [0.62, 0.48],
        [0.24, 0.02],
        [0.36, -0.52],
        [0, -0.26],
        [-0.36, -0.52],
        [-0.24, 0.02],
        [-0.62, 0.48],
        [-0.16, 0.32],
      ] as [number, number][]
    ).map(([x, y]) => [x * sz, y * sz] as [number, number]),
  );
}

// --- Normal: Hollow Footsoldier ---------------------------------------------------------------------

function footsoldier(L: Look): Rig {
  const F = new Fiend({ attack: 'melee', bulk: 1.0, look: L });
  F.chest({ faulds: 2, mailSkirt: true });
  F.arms('plate');
  F.legs('plate');
  const top = sallet(F);
  // Asymmetric pauldrons: heavy spiked plate on the sword arm, lighter on the left
  pauldron(F.armR, 1, { size: 0.15, lames: 3, plate: L.plate, dark: L.dark, edge: L.edge, spikes: 3, spikeLen: 0.15, haute: 0.1 });
  pauldron(F.armL, -1, { size: 0.13, lames: 2, plate: L.plate, dark: L.dark, edge: L.edge, tilt: 0.55 });
  dressAt(F.armR, F.gl, F.rig.armR!, L, 0.1, 0.06, 0.02, [1, 0.5, 0.2], 0.9, 1);
  dressAt(F.torso, F.gl, F.frame, L, -0.15, 1.42, 0.13, [-0.5, 0.2, 1], 0.7, 2);
  // Torn tabard over the faulds and a ragged half cape
  F.torso.add(clothGeo(0.2, 0.52, { folds: 1, tatter: 0.55, seed: 5, flare: 0.25, depth: 0.012 }), L.cloth, 0, 1.03, 0.19);
  F.torso.add(clothGeo(0.2, 0.4, { folds: 1, tatter: 0.6, seed: 9, flare: 0.2, depth: 0.012 }), L.clothDark, 0, 1.03, -0.17, 0, Math.PI, 0);
  F.cape({ color: L.clothDark, w: 0.46, h: 1.05, tatter: 0.65, seed: 11, folds: 2 });
  // Trophy skull on the hip
  skull(F.torso, -0.2, 0.97, 0.06, 1.0, L.bone, -0.9);
  // Notched cleaver with a rune-lit fuller
  const { g, k } = F.kit(F.handR, 0, 0, 0, 1.05);
  grip(k, -0.1, 0.12, 0.022, L.leather);
  k.add(new THREE.OctahedronGeometry(0.034), L.dark, 0, -0.13, 0, 0, 0, 0, 1, 1.5, 1);
  k.add(flat(frustumGeo(0.19, 0.045, 0.05, 0.6)), L.dark, 0, 0.14, 0);
  for (const s of [-1, 1]) k.add(spikeAB([s * 0.08, 0.15, 0], [s * 0.15, 0.24, 0], 0.016, 4), L.dark, 0, 0, 0);
  const blade = shape([
    [-0.042, 0],
    [0.048, 0],
    [0.07, 0.24],
    [0.055, 0.29],
    [0.082, 0.34],
    [0.098, 0.6],
    [0.05, 0.74],
    [-0.01, 0.8],
    [-0.042, 0.7],
    [-0.034, 0.46],
    [-0.05, 0.42],
    [-0.038, 0.2],
  ]);
  k.add(plateGeo(blade, 0.014, 0.004), BLADE, 0, 0.16, 0);
  k.add(lineGeo([[0.05, 0.17, 0], [0.072, 0.4, 0], [0.1, 0.76, 0], [0.05, 0.9, 0], [-0.01, 0.96, 0]], 0.0055, 3), BLADE_EDGE, 0, 0, 0);
  const fuller = shape([
    [-0.007, 0.05],
    [0.007, 0.05],
    [0.012, 0.46],
    [0.0, 0.54],
    [-0.012, 0.46],
  ]);
  F.glow(g, slabGeo(fuller, 0.03), 0.012, 0.16, 0, 4.5);
  return F.finish(top);
}

// --- Ranged: Hooded Cultist Archer ------------------------------------------------------------------

function cultistArcher(L: Look): Rig {
  const F = new Fiend({ attack: 'bow', bulk: 0.94, look: L });
  F.chest({ kind: 'leather', faulds: 1 });
  F.arms('leather');
  F.legs('leather');
  const k = F.torso;
  const top = hood(F.head, F.gl, F.headGroup, L, { cloth: L.cloth, mask: L.dress === 'grave' ? L.bone : L.plate, skullMask: L.dress === 'grave', horns: 0 });
  // Blackened breastplate over the jerkin with a burning sigil
  k.add(shellGeo([[0.2, 1.24], [0.235, 1.34], [0.232, 1.45], [0.19, 1.54]], 0, 1.05, 10, 0.8, 0, 0.05), L.plate, 0, 0, 0.012);
  k.add(lineGeo(arcPtsFront(0.2, 1.245, 1.05, 0.8, 0.05), 0.0055), L.edge, 0, 0, 0.012);
  F.glow(F.frame, slabGeo(sigilShape(0.075), 0.012), 0, 1.4, 0.205, 5);
  F.glow(F.frame, lineGeo([[0, 1.3, 0.19], [0, 1.24, 0.17]], 0.005, 3), 0, 0, 0, 4);
  // Shoulder capelet and a long coat split at the front (hung on the hips, legs show through)
  k.add(shellGeo([[0.3, 1.36], [0.28, 1.46], [0.22, 1.56], [0.13, 1.63]], Math.PI, 2.1, 14, 0.9, 0, -0.08), L.cloth, 0, 0, -0.01);
  k.add(clothGeo(0.42, 0.88, { folds: 2, tatter: 0.5, seed: 21, flare: 0.35, depth: 0.025 }), L.cloth, 0, 1.08, -0.15, 0.06, Math.PI, 0);
  for (const s of [-1, 1]) k.add(clothGeo(0.2, 0.8, { folds: 1, tatter: 0.55, seed: 23 + s, flare: 0.3, depth: 0.02 }), shade(L.cloth, -0.15), s * 0.17, 1.08, 0.02, 0.05, s * 1.25, 0);
  k.add(clothGeo(0.12, 0.42, { folds: 1, tatter: 0.4, seed: 27, flare: 0.2, depth: 0.01 }), L.clothDark, 0, 1.03, 0.175);
  F.glow(F.frame, lineGeo([[0, 1.0, 0.182], [0, 0.82, 0.19], [0, 0.72, 0.2]], 0.004, 3), 0, 0, 0, 3);
  // Belt skull and bone charms
  skull(k, 0.13, 0.98, 0.15, 1.05, L.bone, 0.5);
  for (const s of [-1, 1]) k.add(spikeAB([s * 0.19, 1.04, 0.08], [s * 0.22, 0.9, 0.1], 0.012, 4), L.bone, 0, 0, 0);
  // Crescent horned pauldrons, the bow arm heavier
  pauldron(F.armL, -1, { size: 0.13, lames: 2, plate: L.plate, dark: L.dark, edge: L.edge, horns: 0.3, tilt: 0.5 });
  pauldron(F.armR, 1, { size: 0.115, lames: 1, plate: L.plate, dark: L.dark, edge: L.edge, horns: 0.2, tilt: 0.5 });
  dressAt(F.armL, F.gl, F.rig.armL!, L, -0.1, 0.06, 0.0, [-1, 0.5, 0.2], 0.8, 3);
  // Quiver of black arrows across the back
  const q = F.kit(F.frame, 0.1, 1.3, -0.2, -0.25, 0, -0.35);
  q.k.add(prismGeo(0.055, 0.5, 7, 1.15), L.leather, 0, 0, 0);
  band(q.k, 0.064, 0.008, 0, 0.22, 0, L.edge, Math.PI / 2, 0, 0, 8);
  band(q.k, 0.06, 0.008, 0, -0.2, 0, L.edge, Math.PI / 2, 0, 0, 8);
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.018;
    const z = ((i * 7) % 3 - 1) * 0.018;
    q.k.add(prismGeo(0.004, 0.16, 3), PAL.wood, x, 0.32, z);
    q.k.add(new THREE.ConeGeometry(0.016, 0.07, 3), PAL.charcoal, x, 0.38, z, 0, i, 0, 1, 1, 0.3);
  }
  // Black recurve bow held in the left hand, runes burning along the limbs
  const bw = F.kit(F.handL, 0, 0, 0, 1.2);
  const bk = bw.k;
  for (const sy of [-1, 1]) {
    const pts: V[] = [
      [0, sy * 0.06, 0],
      [0, sy * 0.38, -0.06],
      [0, sy * 0.68, -0.12],
      [0, sy * 0.84, -0.1],
      [0, sy * 0.93, -0.02],
    ];
    bk.curve(pts, 0.036, 0.014, '#1d1a19', 6);
    bk.add(prismGeo(0.027, 0.22, 5), L.dark, 0, sy * 0.5, -0.085, sy * 0.2, 0, 0);
    bk.add(new THREE.ConeGeometry(0.016, 0.13, 4), L.edge, 0, sy * 0.98, 0.0, sy > 0 ? -0.5 : Math.PI + 0.5, 0, 0);
    bk.add(spikeAB([0, sy * 0.72, -0.13], [0, sy * 0.8, -0.24], 0.012, 4), L.dark, 0, 0, 0);
    F.glow(bw.g, lineGeo([[0, sy * 0.16, -0.0], [0, sy * 0.32, -0.035]], 0.0045, 3), 0, 0, 0, 4);
    F.glow(bw.g, lineGeo([[0, sy * 0.44, -0.08], [0, sy * 0.6, -0.11]], 0.0045, 3), 0, 0, 0, 4);
  }
  bk.add(prismGeo(0.032, 0.18, 6), L.leather, 0, 0, 0);
  band(bk, 0.035, 0.009, 0, 0.09, 0, L.edge, 0, 0, 0, 6);
  band(bk, 0.035, 0.009, 0, -0.09, 0, L.edge, 0, 0, 0, 6);
  bk.add(lineGeo([[0, 0.92, -0.04], [0, -0.92, -0.04]], 0.004, 3), PAL.boneDark, 0, 0, 0);
  return F.finish(top);
}

/** Front arc of points along a lathe band's lower edge (dip rises towards the sides). */
function arcPtsFront(r: number, y: number, half: number, sz: number, dip: number): V[] {
  const pts: V[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = -half + (i / 10) * half * 2;
    const f = Math.abs(a) / half;
    pts.push([Math.sin(a) * (r + 0.004), y + dip * f, Math.cos(a) * (r + 0.004) * sz]);
  }
  return pts;
}

// --- Armored: Dread Brute ---------------------------------------------------------------------------

function dreadBrute(L: Look): Rig {
  const F = new Fiend({ attack: 'melee', bulk: 1.3, tall: 1.06, look: L, shoulder: 1.04 });
  F.rig.shield = true;
  F.rig.presence = 1.12;
  F.chest({ faulds: 3, mailSkirt: true });
  F.arms('plate');
  F.legs('plate');
  const top = greatHelm(F);
  const k = F.torso;
  // Burning sigil cracked into the breastplate
  F.glow(F.frame, slabGeo(sigilShape(0.085), 0.012), 0, 1.4, F.onChest(0, 1.4, 0.04)[2], 3.5);
  rivet(k, 0, 1.52, F.onChest(0, 1.52, 0.03)[2], L.edge, 0.016);
  // Massive horned, spiked pauldrons
  for (const s of [1, -1]) {
    pauldron(F.arm(s), s, { size: 0.2, lames: 3, plate: L.plate, dark: L.dark, edge: L.edge, horns: 0.3, spikes: 3, spikeLen: 0.16, haute: 0.13, tilt: 0.4 });
    dressAt(F.arm(s), F.gl, s > 0 ? F.rig.armR! : F.rig.armL!, L, s * 0.13, 0.07, 0.04, [s, 0.5, 0.25], 1.1, 4 + s);
  }
  // Chains and a skull across the belly
  skull(k, 0.0, 1.0, F.onChest(0, 1.0, 0.07)[2] + 0.01, 1.25, L.bone);
  // Heavy mantle and a long torn cape
  F.cape({ color: L.clothDark, w: 0.62, h: 1.45, tatter: 0.45, seed: 41, mantle: true, trim: L.edge, folds: 3 });
  // Flanged maul
  const m = F.kit(F.handR, 0, 0, 0, 1.05);
  grip(m.k, -0.12, 0.2, 0.026, L.leather);
  m.k.add(prismGeo(0.024, 0.62, 6), L.dark, 0, 0.5, 0);
  m.k.add(new THREE.OctahedronGeometry(0.045), L.dark, 0, -0.15, 0, 0, 0, 0, 1, 1.4, 1);
  m.k.add(prismGeo(0.06, 0.24, 6), L.plate, 0, 0.88, 0);
  band(m.k, 0.064, 0.012, 0, 0.77, 0, L.edge, Math.PI / 2, 0, 0, 6);
  band(m.k, 0.064, 0.012, 0, 0.99, 0, L.edge, Math.PI / 2, 0, 0, 6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const fl = shape([
      [0, -0.12],
      [0.1, -0.08],
      [0.13, 0.02],
      [0.08, 0.12],
      [0, 0.13],
    ]);
    m.k.add(plateGeo(fl, 0.018, 0.004), i % 2 ? BLADE : L.plateHi, Math.sin(a) * 0.04, 0.88, Math.cos(a) * 0.04, 0, a - Math.PI / 2, 0);
  }
  m.k.add(new THREE.ConeGeometry(0.035, 0.2, 4), BLADE, 0, 1.08, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    F.glow(m.g, lineGeo([[Math.sin(a) * 0.062, 0.8, Math.cos(a) * 0.062], [Math.sin(a + 0.25) * 0.062, 0.88, Math.cos(a + 0.25) * 0.062], [Math.sin(a) * 0.062, 0.96, Math.cos(a) * 0.062]], 0.005, 3), 0, 0, 0, 4.5);
  }
  // Spiked kite shield with a burning sigil
  const sh = F.kit(F.handL, 0.05, -0.04, 0.17);
  const kite = (w: number, h: number) =>
    shape([
      [-w, h * 0.42],
      [-w * 0.45, h * 0.5],
      [0, h * 0.44],
      [w * 0.45, h * 0.5],
      [w, h * 0.42],
      [w * 1.02, -h * 0.05],
      [w * 0.6, -h * 0.32],
      [0, -h * 0.5],
      [-w * 0.6, -h * 0.32],
      [-w * 1.02, -h * 0.05],
    ]);
  sh.k.add(plateGeo(kite(0.29, 1.0), 0.045, 0.012), L.dark, 0, 0, 0);
  sh.k.add(plateGeo(kite(0.25, 0.9), 0.03, 0.01), L.plate, 0, 0.0, 0.03);
  sh.k.add(lineGeo([[0, 0.39, 0.05], [0, 0.0, 0.06], [0, -0.4, 0.05]], 0.012, 4), L.plateHi, 0, 0, 0);
  const rim: V[] = [
    [-0.25, 0.378, 0.047],
    [-0.11, 0.45, 0.047],
    [0, 0.396, 0.047],
    [0.11, 0.45, 0.047],
    [0.25, 0.378, 0.047],
    [0.255, -0.045, 0.047],
    [0.15, -0.288, 0.047],
    [0, -0.45, 0.047],
    [-0.15, -0.288, 0.047],
    [-0.255, -0.045, 0.047],
    [-0.25, 0.378, 0.047],
  ];
  sh.k.add(lineGeo(rim, 0.007, 3), L.edge, 0, 0, 0);
  for (const [x, y] of [
    [-0.27, 0.42],
    [0.27, 0.42],
    [0.0, -0.5],
  ] as const)
    sh.k.add(spikeAB([x, y, 0.02], [x * 1.25, y + (y > 0 ? 0.1 : -0.12), 0.08], 0.024, 4), L.dark, 0, 0, 0);
  sh.k.add(spikeAB([0, 0.0, 0.06], [0, 0.0, 0.2], 0.04, 5), L.plateHi, 0, 0, 0);
  band(sh.k, 0.05, 0.01, 0, 0, 0.06, L.edge, 0, 0, 0, 8);
  F.glow(sh.g, slabGeo(sigilShape(0.085), 0.012), 0, 0.19, 0.05, 2.6);
  for (const [x0, y0, x1, y1] of [
    [-0.08, -0.12, -0.16, -0.24],
    [0.07, 0.1, 0.18, 0.28],
  ] as const)
    sh.k.add(lineGeo([[x0, y0, 0.05], [x1, y1, 0.05]], 0.006, 3), SHADOW, 0, 0, 0);
  dressAt(sh.k, F.gl, sh.g, L, -0.18, 0.28, 0.06, [0, 0.3, 1], 0.9, 9);
  return F.finish(top);
}

// --- Fast: Carrion Hound ----------------------------------------------------------------------------

function carrionHound(L: Look): Rig {
  const rig = newRig('quad', 'melee');
  // Body built at a reference size, then widened and lowered so the hound is heavy and low-slung
  const body = pivot(rig.body, 0, -0.27, 0);
  body.scale.set(1.22, 1.12, 1);
  const gl = new Glows();
  const k = new K();
  const hide = mix(L.hide, '#000000', 0.15);
  const hideDk = shade(L.hide, -0.45);
  const bone = shade(L.bone, -0.18);
  const sinew = mix('#3a1715', L.hide, 0.4);

  // Torso: bony haunches, tucked waist, deep keel of a chest
  const spine: V[] = [
    [0, 0.83, -0.6],
    [0, 0.86, -0.4],
    [0, 0.81, -0.08],
    [0, 0.86, 0.24],
    [0, 0.96, 0.46],
  ];
  const rad: [number, number][] = [
    [0.1, 0.1],
    [0.15, 0.16],
    [0.11, 0.12],
    [0.17, 0.26],
    [0.125, 0.16],
  ];
  k.add(loftGeo(spine, rad, 12, 16), hide, 0, 0, 0);
  // Rounded rump over the end of the body tube
  k.ball(0.105, 0, 0.84, -0.57, hide, 1, 1, 0.75, 10);
  // Approximate body section at depth z (for placing ribs and plates)
  const at = (z: number): { y: number; w: number; h: number } => {
    let i = 0;
    while (i < spine.length - 2 && spine[i + 1]![2] < z) i++;
    const z0 = spine[i]![2];
    const z1 = spine[i + 1]![2];
    const t = Math.max(0, Math.min(1, (z - z0) / (z1 - z0)));
    return { y: spine[i]![1] + (spine[i + 1]![1] - spine[i]![1]) * t, w: rad[i]![0] + (rad[i + 1]![0] - rad[i]![0]) * t, h: rad[i]![1] + (rad[i + 1]![1] - rad[i]![1]) * t };
  };
  // Exposed ribs with glowing cracks between them
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z = -0.06 + i * 0.065;
      const c = at(z);
      const pts: V[] = [];
      for (let j = 0; j <= 5; j++) {
        const a = 1.2 - j * 0.48;
        pts.push([s * c.w * Math.cos(a) * 1.04, c.y + c.h * Math.sin(a) * 1.04, z + j * 0.012]);
      }
      k.add(lineGeo(pts, 0.014, 4, 0.009), bone, 0, 0, 0);
      if (i === 1 || i === 3) {
        const zc = z + 0.032;
        const cc = at(zc);
        const gp: V[] = [];
        for (let j = 0; j <= 4; j++) {
          const a = 0.7 - j * 0.38;
          gp.push([s * cc.w * Math.cos(a) * 1.01, cc.y + cc.h * Math.sin(a) * 1.01, zc + j * 0.01]);
        }
        gl.add(body, L.glow, 3.5, lineGeo(gp, 0.006, 3));
      }
    }
  }
  // Spiked plate barding down the spine
  for (let i = 0; i < 6; i++) {
    const z = 0.36 - i * 0.16;
    const c = at(z);
    const big = i < 2 ? 1.2 : 1 - i * 0.07;
    k.add(flat(capGeo(0.12 * big, Math.PI * 0.42, 7, 2)), i % 2 ? L.dark : L.plate, 0, c.y + c.h * 0.72, z, -0.28, 0, 0, 1.25 * (c.w / 0.13), 0.55, 0.85);
    k.add(spikeAB([0, c.y + c.h * 0.95, z], [0, c.y + c.h + 0.12 * big, z - 0.1], 0.024 * big, 4), L.dark, 0, 0, 0);
    if (i < 3) for (const s of [-1, 1]) k.add(spikeAB([s * c.w * 0.75, c.y + c.h * 0.7, z], [s * (c.w + 0.08), c.y + c.h + 0.02, z - 0.08], 0.014, 4), L.dark, 0, 0, 0);
  }
  k.add(lineGeo([[0, 1.06, 0.4], [0, 1.03, 0.0], [0, 1.0, -0.4]], 0.006, 3), L.edge, 0, 0, 0);
  // Torn cloth draped over the haunches
  for (const s of [-1, 1]) k.add(clothGeo(0.32, 0.26, { folds: 1, tatter: 0.6, seed: 50 + s, flare: 0.1, depth: 0.012 }), L.cloth, s * 0.15, 0.98, -0.32, 0, s * Math.PI / 2, s * 0.25);
  dressAt(k, gl, body, L, 0.06, 1.09, 0.32, [0.4, 1, 0.2], 1.0, 7);
  // Neck
  k.add(loftGeo([[0, 0.9, 0.38], [0, 0.98, 0.56], [0, 1.02, 0.68]], [[0.12, 0.15], [0.1, 0.12], [0.085, 0.1]], 10, 6), hide, 0, 0, 0);
  for (let i = 0; i < 3; i++) k.add(spikeAB([0, 1.08 - i * 0.03, 0.62 - i * 0.1], [0, 1.18 - i * 0.03, 0.5 - i * 0.1], 0.018, 4), L.dark, 0, 0, 0);
  // Tail of bare vertebrae
  const tail: V[] = [
    [0, 0.84, -0.56],
    [0, 0.88, -0.74],
    [0, 0.8, -0.92],
    [0, 0.66, -1.04],
  ];
  k.add(loftGeo(tail, [[0.05, 0.05], [0.035, 0.035], [0.022, 0.022], [0.008, 0.008]], 7, 8), hideDk, 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const p = tail[Math.min(3, i)]!;
    k.add(spikeAB([p[0], p[1] + 0.02, p[2]], [p[0], p[1] + 0.08 - i * 0.012, p[2] - 0.05], 0.014, 4), bone, 0, 0, 0);
  }
  addMesh(rig, body, k);

  // Head on the neck pivot: horned plate mask over a long skull, jaws full of teeth, burning maw
  const neck = pivot(body, 0, 1.0, 0.66);
  neck.scale.set(1.2 / 1.2, 1.2 / 1.1, 1.2);
  rig.neck = neck;
  rig.head = neck;
  const hk = new K();
  hk.add(loftGeo([[0, 0.02, -0.04], [0, 0.03, 0.1], [0, -0.01, 0.27], [0, -0.03, 0.37]], [[0.095, 0.095], [0.09, 0.085], [0.058, 0.05], [0.04, 0.032]], 10, 8), hideDk, 0, 0, 0);
  // Lower jaw hanging open
  hk.add(loftGeo([[0, -0.05, 0.0], [0, -0.1, 0.18], [0, -0.13, 0.32]], [[0.07, 0.04], [0.05, 0.03], [0.032, 0.02]], 8, 6), sinew, 0, 0, 0);
  // Teeth
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = 0.12 + i * 0.05;
      const x = s * (0.05 - i * 0.004);
      hk.add(spikeAB([x, -0.025 - i * 0.006, z], [x * 0.9, -0.085 - i * 0.006, z + 0.01], 0.008, 3), L.bone, 0, 0, 0);
      hk.add(spikeAB([x * 0.85, -0.1 - i * 0.008, z], [x * 0.8, -0.06 - i * 0.007, z + 0.008], 0.007, 3), L.bone, 0, 0, 0);
    }
    hk.add(spikeAB([s * 0.03, -0.04, 0.34], [s * 0.028, -0.12, 0.36], 0.012, 4), L.bone, 0, 0, 0);
  }
  gl.add(neck, L.glow, 3, new THREE.BoxGeometry(0.05, 0.02, 0.2), 0, -0.065, 0.2, 0.18, 0, 0);
  // Plate mask over the skull and snout
  hk.add(flat(capGeo(0.115, Math.PI * 0.5, 8, 3)), L.plate, 0, 0.03, 0.12, -0.1, 0, 0, 0.95, 0.55, 2.0);
  hk.add(lineGeo([[0, 0.1, -0.08], [0, 0.095, 0.1], [0, 0.05, 0.3], [0, 0.02, 0.36]], 0.008, 4), L.plateHi, 0, 0, 0);
  for (const s of [-1, 1]) {
    // Brow spikes over the eyes and long horns swept back
    hk.add(spikeAB([s * 0.065, 0.07, 0.12], [s * 0.1, 0.13, 0.04], 0.022, 4), L.dark, 0, 0, 0);
    hk.add(
      crescentGeo(
        [
          [s * 0.07, 0.08, 0.02],
          [s * 0.14, 0.13, -0.08],
          [s * 0.17, 0.15, -0.22],
          [s * 0.13, 0.22, -0.33],
        ],
        0.03,
        0.003,
        'x',
        0.6,
        5,
      ),
      shade(L.bone, -0.5),
      0,
      0,
      0,
    );
    // Ragged ears flattened back
    hk.add(spikeAB([s * 0.07, 0.05, -0.02], [s * 0.11, 0.08, -0.15], 0.03, 3, 0.4), hideDk, 0, 0, 0);
    // Slanted burning eyes
    gl.add(neck, L.glow, 6.5, lineGeo([[s * 0.068, 0.035, 0.16], [s * 0.078, 0.05, 0.11]], 0.008, 4));
  }
  addMesh(rig, neck, hk);

  // Legs: front pair straight and clawed, hind pair digitigrade
  const legs: [number, number, boolean][] = [
    [-0.155, 0.34, true],
    [0.155, 0.34, true],
    [-0.145, -0.42, false],
    [0.145, -0.42, false],
  ];
  for (const [x, z, front] of legs) {
    const s = Math.sign(x);
    const lp = pivot(rig.body, x, 0.6, z);
    const lg = pivot(lp, 0, 0, 0);
    lg.scale.set(1.4, 0.73, 1.3);
    const lk = new K();
    const pts: V[] = front
      ? [
          [0, 0.06, 0.0],
          [0, -0.3, -0.05],
          [0, -0.6, 0.0],
          [0, -0.76, 0.04],
        ]
      : [
          [0, 0.06, 0.02],
          [0, -0.24, 0.1],
          [0, -0.5, -0.08],
          [0, -0.76, 0.0],
        ];
    const lr: [number, number][] = front
      ? [
          [0.07, 0.09],
          [0.05, 0.06],
          [0.034, 0.04],
          [0.034, 0.034],
        ]
      : [
          [0.085, 0.12],
          [0.06, 0.075],
          [0.034, 0.038],
          [0.032, 0.032],
        ];
    lk.add(loftGeo(pts, lr, 8, 10), hide, 0, 0, 0);
    // Paw and claws
    lk.add(loftGeo([[0, -0.77, -0.01], [0, -0.79, 0.1]], [[0.045, 0.03], [0.038, 0.02]], 7, 2), hideDk, 0, 0, 0);
    for (let i = -1; i <= 1; i++) lk.add(spikeAB([i * 0.025, -0.79, 0.09], [i * 0.035, -0.81, 0.17], 0.011, 4), L.bone, 0, 0, 0);
    if (front) {
      // Shoulder plate with a spike and an elbow spur
      lk.add(flat(capGeo(0.1, Math.PI * 0.45, 7, 2)), L.plate, s * 0.02, -0.02, 0.0, 0, 0, -s * 1.2, 1, 0.6, 1.2);
      lk.add(spikeAB([s * 0.08, 0.0, 0.0], [s * 0.16, 0.1, -0.06], 0.02, 4), L.dark, 0, 0, 0);
      lk.add(spikeAB([0, -0.3, -0.09], [0, -0.26, -0.2], 0.018, 4), bone, 0, 0, 0);
      lk.add(lineGeo([[s * 0.06, -0.38, 0.0], [s * 0.05, -0.5, 0.02]], 0.01, 4, 0.006), L.plate, 0, 0, 0);
    } else {
      lk.add(spikeAB([0, -0.5, -0.1], [0, -0.46, -0.2], 0.016, 4), bone, 0, 0, 0);
      lk.add(flat(capGeo(0.1, Math.PI * 0.45, 7, 2)), L.dark, s * 0.03, -0.05, 0.03, 0, 0, -s * 1.3, 1, 0.6, 1.3);
    }
    addMesh(rig, lg, lk);
    rig.legs.push(lp);
  }
  gl.flush();
  rig.height = 1.06;
  return rig;
}

// --- Flying: Carrion Wraith -------------------------------------------------------------------------

function carrionWraith(L: Look): Rig {
  const rig = newRig('flyer', 'melee');
  const body = rig.body;
  const gl = new Glows();
  const k = new K();
  const hide = mix(L.hide, '#000000', 0.2);
  const bone = shade(L.bone, -0.15);
  const membrane = mix(shade(L.hide, -0.1), L.cloth, 0.45);

  // Burning heart inside an open ribcage
  gl.add(body, L.glow, 2.2, new THREE.SphereGeometry(0.075, 10, 8), 0, 0.07, 0.02, 0, 0, 0, 1, 1.25, 0.9);
  gl.add(body, L.hot, 4, new THREE.SphereGeometry(0.03, 8, 6), 0, 0.07, 0.05);
  k.ball(0.1, 0, 0.07, -0.05, SHADOW, 1.1, 1.3, 0.7, 8);
  // Spine and ribs
  k.add(lineGeo([[0, -0.3, -0.12], [0, -0.1, -0.08], [0, 0.1, -0.06], [0, 0.26, 0.04]], 0.024, 5, 0.02), hide, 0, 0, 0);
  for (let i = 0; i < 5; i++) {
    const y = -0.04 + i * 0.055;
    const w = 0.115 + Math.sin((i / 4) * Math.PI) * 0.025;
    for (const s of [-1, 1]) k.add(lineGeo([[0, y, -0.075], [s * w, y + 0.005, -0.03], [s * (w + 0.01), y - 0.02, 0.05], [s * 0.05, y - 0.045, 0.12]], 0.011, 4, 0.008), bone, 0, 0, 0);
  }
  k.add(lineGeo([[0, 0.2, 0.1], [0, 0.04, 0.13], [0, -0.06, 0.11]], 0.012, 4), bone, 0, 0, 0);
  // Pelvis and gaunt belly
  k.add(loftGeo([[0, -0.36, -0.1], [0, -0.22, -0.07], [0, -0.08, -0.04]], [[0.09, 0.07], [0.07, 0.06], [0.05, 0.05]], 8, 5), hide, 0, 0, 0);
  // Hunched shoulders under a torn mantle
  k.add(loftGeo([[-0.17, 0.2, -0.02], [0, 0.25, 0.0], [0.17, 0.2, -0.02]], [[0.05, 0.05], [0.08, 0.07], [0.05, 0.05]], 8, 6), hide, 0, 0, 0);
  k.add(shellGeo([[0.22, 0.06], [0.2, 0.16], [0.15, 0.25], [0.08, 0.31]], Math.PI, 1.7, 12, 0.9, 0, -0.05), L.cloth, 0, 0, -0.02);
  for (let i = 0; i < 3; i++) k.add(clothGeo(0.16 + i * 0.03, 0.7 - i * 0.14, { folds: 1, tatter: 0.7, seed: 60 + i, flare: 0.35, depth: 0.015 }), i ? shade(L.cloth, -0.2) : L.cloth, (i - 1) * 0.09, -0.2, -0.1 - i * 0.02, 0.9 + i * 0.15, Math.PI, (i - 1) * 0.15);
  dressAt(k, gl, body, L, 0.12, 0.24, -0.02, [0.6, 1, 0], 0.8, 8);
  // Dangling legs with hooked talons
  for (const s of [-1, 1]) {
    const pts: V[] = [
      [s * 0.07, -0.33, -0.08],
      [s * 0.1, -0.45, 0.04],
      [s * 0.08, -0.6, -0.04],
      [s * 0.07, -0.68, 0.0],
    ];
    k.add(loftGeo(pts, [[0.06, 0.065], [0.042, 0.045], [0.028, 0.028], [0.024, 0.024]], 7, 8), hide, 0, 0, 0);
    for (let i = -1; i <= 1; i++) k.add(crescentGeo([[s * 0.07, -0.68, 0.0], [s * 0.07 + i * 0.03, -0.7, 0.06], [s * 0.07 + i * 0.04, -0.76, 0.08]], 0.012, 0.002, 'x', 0.7, 4), bone, 0, 0, 0);
    k.add(crescentGeo([[s * 0.07, -0.68, -0.01], [s * 0.07, -0.72, -0.06], [s * 0.07, -0.77, -0.05]], 0.011, 0.002, 'x', 0.7, 4), bone, 0, 0, 0);
  }
  addMesh(rig, body, k);

  // Head: horned hood over a skull mask (hood() is built round HY; scaled into place)
  const neck = pivot(body, 0, 0.27, 0.07);
  rig.neck = neck;
  const sc = 0.8;
  const hg = pivot(neck, 0, -HY * sc + 0.12, 0.02);
  hg.scale.setScalar(sc);
  rig.head = hg;
  const hk = new K();
  hood(hk, gl, hg, L, { cloth: L.cloth, mask: bone, skullMask: true, horns: 0.12 });
  addMesh(rig, hg, hk);

  // Wings: long finger bones, torn membrane; the left wing mirrors the right
  for (const s of [1, -1]) {
    const wp = pivot(body, s * 0.15, 0.2, -0.03);
    const wk = new K();
    const R: V = [0, 0, 0];
    const A: V = [0.32, 0.1, -0.06];
    const W: V = [0.68, 0.24, -0.1];
    const tips: V[] = [
      [1.3, 0.42, -0.22],
      [1.26, 0.02, -0.32],
      [1.02, -0.34, -0.34],
      [0.62, -0.5, -0.24],
    ];
    const B: V = [0.06, -0.3, -0.05];
    wk.add(loftGeo([R, A], [[0.035, 0.035], [0.024, 0.026]], 6, 3), hide, 0, 0, 0);
    wk.add(loftGeo([A, W], [[0.024, 0.026], [0.018, 0.02]], 6, 3), hide, 0, 0, 0);
    wk.ball(0.03, ...A, bone, 1, 1, 1, 6);
    wk.ball(0.028, ...W, bone, 1, 1, 1, 6);
    // Hooked thumb claw at the wrist
    wk.add(crescentGeo([W, [W[0] + 0.04, W[1] + 0.1, W[2] + 0.04], [W[0] - 0.01, W[1] + 0.16, W[2] + 0.08]], 0.016, 0.002, 'x', 0.7, 4), bone, 0, 0, 0);
    // Finger bones and a torn, scalloped membrane between them
    // Each finger bows backwards; the membrane billows between them and is cut in deep scallops
    const knuckle = (t: V, i: number): V => {
      const m = lerpV(W, t, 0.5);
      return [m[0], m[1] + 0.05 - i * 0.012, m[2] - 0.06];
    };
    const outline: V[] = [A];
    tips.forEach((t, i) => {
      const kn = knuckle(t, i);
      wk.add(lineGeo([W, kn, t], 0.016, 4, 0.003), hide, 0, 0, 0);
      wk.ball(0.016, ...kn, bone, 1, 1, 1, 5);
      outline.push(t);
      const next = i < tips.length - 1 ? tips[i + 1]! : B;
      const scallop = lerpV(lerpV(t, next, 0.5), W, 0.17 + ((i * 37) % 3) * 0.04);
      // Two-step torn edge: a notch either side of the scallop
      outline.push(lerpV(lerpV(t, next, 0.22), W, 0.05));
      outline.push([scallop[0], scallop[1], scallop[2] - 0.05]);
      outline.push(lerpV(lerpV(t, next, 0.78), W, 0.04));
      if (i < tips.length - 1) {
        // Fill the inner part of the membrane right up to the bowed finger
        wk.add(triGeo(W, kn, knuckle(next, i + 1)), membrane, 0, 0, 0);
      }
    });
    outline.push(B);
    wk.add(fanGeo(W, outline), membrane, 0, 0, 0);
    wk.add(triGeo(A, B, R), membrane, 0, 0, 0);
    // Faint glowing veins along two fingers
    for (const i of [0, 2]) gl.add(wp, L.glow, 2.2, lineGeo([lerpV(W, tips[i]!, 0.12), lerpV(W, tips[i]!, 0.7)], 0.004, 3), 0, 0.006, 0.004);
    addMesh(rig, wp, wk);
    if (s < 0) wp.scale.x = -1;
    rig.wings.push(wp);
  }
  gl.flush();
  rig.height = 1.2;
  return rig;
}
