import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { shapeFrom, type K } from '../../../base3d/sculpt';
import { capGeo, cbox, frustumGeo, HEAD_R, HEAD_Y, metal, SHAPES } from '../parts';
import { band, bladedPauldron, chestLines, finGeo, flat, GlowBatch, gouge, grip, knight, lineGeo, mtl, rivet, scratch, shellGeo, slabGeo, type KnightParts } from './_armored';
import type { UnitDef } from './types';

/**
 * The Blackguard (card: oakshield_knight, common). Glossy blackened plate edged in bright steel, a
 * tall sculpted helm with a serrated crest and a frowning brow over one narrow burning-red slit,
 * layered pauldrons with swept flanges, a long notched greatsword whose core burns like a forge
 * and a blackened heater shield with a crimson field. Broad, grounded, heavy. Accent: blood red.
 */
const M = metal('#2c2f35', 0.72);
const D = metal('#18191d', 0.62);
const EDGE = metal('#8a929b', 0.85);
const T = PAL.iron;
const SHADOW = '#060607';
const RED = '#ff2b2b';
const FIRE = '#ff4318';
const DENT = mtl(M, -0.45, 0.6);

/** Serrated crest running from the brow over the crown (shape x = towards the back). */
const CREST = (r: number) =>
  shapeFrom([
    [-r * 1.0, r * 0.3],
    [-r * 0.95, r * 0.62],
    [-r * 0.62, r * 0.78],
    [-r * 0.5, r * 1.02],
    [-r * 0.2, r * 0.98],
    [-r * 0.02, r * 1.2],
    [r * 0.3, r * 1.08],
    [r * 0.55, r * 1.24],
    [r * 0.82, r * 1.0],
    [r * 1.18, r * 1.02],
    [r * 1.0, r * 0.7],
    [r * 1.08, r * 0.3],
    [r * 0.6, r * 0.6],
    [0, r * 0.7],
    [-r * 0.6, r * 0.55],
  ]);

function helm(k: K, glow: THREE.Object3D): number {
  const r = HEAD_R * 1.04;
  const hy = HEAD_Y;
  const gb = new GlowBatch();
  k.ball(r * 0.9, 0, hy, 0, '#08080a', 1, 1.05, 1.05, 8);
  // Tall rounded skull, faceted
  k.add(
    flat(new THREE.LatheGeometry([[1.04, -0.35], [1.1, 0.2], [1.02, 0.7], [0.76, 1.12], [0.36, 1.42], [0.01, 1.56]].map(([a, y]) => new THREE.Vector2(a! * r, hy + y! * r)), 12)),
    M,
    0,
    0,
    -r * 0.04,
    0,
    0,
    0,
    1,
    1,
    1.12,
  );
  // Visor: a keeled prow jutting forward under the slit into a sharp chin
  k.add(flat(shellGeo([[r * 0.8, hy - r * 1.22], [r * 1.1, hy - r * 0.66], [r * 1.16, hy - r * 0.2], [r * 1.1, hy - r * 0.02]], 0, 1.3, 10, 1.2, 0, r * 0.4)), M, 0, 0, 0);
  k.add(flat(frustumGeo(0.022, r * 1.15, r * 0.22, 0.5, 0.4)), D, 0, hy - r * 0.55, r * 1.3, -0.32, 0, 0);
  // Cheek plates with breaths on the right
  for (const s of [-1, 1]) k.add(flat(shellGeo([[r * 1.08, hy - r * 1.05], [r * 1.15, hy - r * 0.45], [r * 1.13, hy + r * 0.05]], s * 1.05, 0.42, 4, 1.12)), D, 0, 0, 0);
  for (let i = 0; i < 6; i++) cbox(k, r * 0.07, r * 0.07, 0.02, r * (0.45 + (i % 2) * 0.15), hy - r * (0.36 + Math.floor(i / 2) * 0.17), r * (1.2 - (i % 2) * 0.12), SHADOW, 0, 0.6, 0);
  // Frowning brow: two heavy plates angled down to the centre over the slit
  for (const s of [-1, 1]) k.add(flat(frustumGeo(r * 0.92, r * 0.22, r * 0.3, 0.8, 0.6)), D, s * r * 0.42, hy + r * 0.27, r * 1.08, 0.18, s * 0.42, s * 0.24);
  // The slit: one narrow black gap with red fire burning inside it
  for (const s of [-1, 1]) cbox(k, r * 0.6, r * 0.12, 0.03, s * r * 0.35, hy + r * 0.08, r * 1.12, SHADOW, 0, s * 0.4, s * 0.16);
  for (const s of [-1, 1]) gb.add(new THREE.BoxGeometry(r * 0.5, r * 0.06, 0.01), s * r * 0.33, hy + r * 0.085, r * 1.12 + 0.018, 0, s * 0.4, s * 0.16);
  // Serrated crest from the brow over the crown
  k.add(finGeo(CREST(r), 0.024, 0, hy + r * 0.45, -r * 0.1, 0, 0.005, 1.2), D, 0, 0, 0);
  k.add(lineGeo([[0, hy + r * 0.95, r * 1.05], [0, hy + r * 1.38, r * 0.5], [0, hy + r * 1.6, -r * 0.2], [0, hy + r * 1.45, -r * 0.95]], 0.005), EDGE, 0, 0, 0);
  // Engraved steel edging round the visor and the brow band
  k.lathe([[r * 1.13, hy + r * 0.38], [r * 1.11, hy + r * 0.48]], 0, 0, -r * 0.04, EDGE, 12, 1, 1.12);
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * 0.35 + (i / 5) * Math.PI * 1.3;
    rivet(k, Math.sin(a) * r * 1.13, hy + r * 0.43, -r * 0.04 + Math.cos(a) * r * 1.13 * 1.12, T, 0.009);
  }
  // Gorget lames flaring onto the collar
  k.lathe([[r * 1.24, hy - r * 1.3], [r * 1.1, hy - r * 1.02]], 0, 0, 0, D, 12, 1, 1.05);
  k.lathe([[r * 1.13, hy - r * 1.06], [r * 1.02, hy - r * 0.86]], 0, 0, 0, M, 12, 1, 1.06);
  // Damage: a dent over the left eye, a gouge and bright scratches
  k.ball(r * 0.2, -r * 0.6, hy + r * 0.62, r * 0.78, DENT, 1, 0.7, 0.4, 6);
  gouge(k, r * 0.6, r * 0.6, hy + r * 0.72, r * 0.82, 0.5, 0.6);
  scratch(k, r * 0.6, -r * 0.4, hy - r * 0.55, r * 1.05, -0.4, -0.35);
  gb.flush(glow, RED, 6);
  return hy + r * 1.95;
}

function greatsword(k: K, g: THREE.Group): void {
  grip(k, -0.1, 0.28, 0.024, PAL.leatherDark);
  // Faceted wheel pommel with a red stone
  k.add(flat(new THREE.CylinderGeometry(0.046, 0.046, 0.032, 8)), D, 0, -0.14, 0, 0, 0, Math.PI / 2);
  // Swept crossguard: blades curving forward and down, a langet over the ricasso
  k.add(flat(frustumGeo(0.46, 0.05, 0.05, 0.55)), D, 0, 0.3, 0);
  for (const sx of [-1, 1]) k.add(new THREE.ConeGeometry(0.024, 0.14, 4), D, sx * 0.25, 0.26, 0, 0, 0, sx * 2.35);
  k.add(flat(frustumGeo(0.11, 0.1, 0.03, 0.8)), EDGE, 0, 0.37, 0);
  // Long notched blade, blackened, with a burning core
  const len = 1.25;
  const w = 0.075;
  k.plate(SHAPES.notchedBlade(len, w), 0.014, 0.008, 0, 0.33, 0, D);
  const gb = new GlowBatch();
  gb.add(slabGeo(SHAPES.greatswordBlade(len * 0.86, w * 0.42), 0.034), 0, 0.37, 0);
  gb.flush(g, FIRE, 3.4);
  // A brighter glowing seam and the pommel stone
  const hot = new GlowBatch();
  hot.add(new THREE.BoxGeometry(0.008, len * 0.7, 0.038), 0, 0.37 + len * 0.36, 0);
  hot.add(new THREE.OctahedronGeometry(0.018, 0), 0, -0.14, 0.03);
  hot.flush(g, '#ffb070', 4.5);
}

function heater(k: K, g: THREE.Group): void {
  const shape = SHAPES.heater(0.31, 0.86);
  // Blackened steel shield with a sunken crimson field, raised steel edging
  k.plate(shape, 0.05, 0.022, 0.07, -0.08, 0.16, D, 0, 0, 0, 1.07);
  k.plate(shape, 0.05, 0.01, 0.07, -0.06, 0.18, M, 0, 0, 0, 0.98);
  k.plate(shape, 0.05, 0.008, 0.07, -0.04, 0.19, PAL.crimson, 0, 0, 0, 0.8);
  // Pointed boss with a downward blade, iron cross straps, rivets
  k.add(flat(frustumGeo(0.05, 0.62, 0.02, 0.6)), D, 0.07, -0.13, 0.226);
  k.add(flat(frustumGeo(0.48, 0.04, 0.02, 0.9)), D, 0.07, 0.1, 0.226);
  k.add(flat(capGeo(0.075, Math.PI / 2, 8, 3)), M, 0.07, 0.1, 0.232, Math.PI / 2, 0, 0, 1, 1, 1.4);
  k.add(new THREE.ConeGeometry(0.03, 0.12, 4), EDGE, 0.07, 0.1, 0.32, Math.PI / 2, 0, 0);
  for (const [x, y] of [[-0.17, 0.25], [0.31, 0.25], [-0.15, -0.12], [0.29, -0.12], [0.07, -0.45]] as const) rivet(k, x, y, 0.22, EDGE, 0.013);
  // A red rune burning through the crimson under the boss
  const gb = new GlowBatch();
  // A jagged crack burning red through the crimson field
  for (const [x, y, l, rz] of [[0.05, 0.0, 0.12, 0.35], [0.08, -0.11, 0.1, -0.3], [0.05, -0.22, 0.12, 0.45], [0.13, -0.08, 0.07, -1.1], [0.0, -0.3, 0.07, 0.9]] as const) {
    cbox(k, 0.02, l, 0.008, x, y, 0.232, SHADOW, 0, 0, rz);
    gb.add(new THREE.BoxGeometry(0.008, l * 0.92, 0.006), x, y, 0.238, 0, 0, rz);
  }
  gb.flush(g, RED, 2.6);
  // Paint scraped to the steel, deep gouges, a broken arrow
  scratch(k, 0.16, 0.2, 0.22, 0.236, 0.6, 0, PAL.boneDark);
  gouge(k, 0.18, 0.18, -0.26, 0.238, -0.7);
  gouge(k, 0.1, -0.06, 0.2, 0.238, 0.3);
  k.add(new THREE.CylinderGeometry(0.006, 0.006, 0.24, 4), PAL.wood, 0.24, -0.02, 0.33, 1.25, 0, 0.3);
  for (let i = 0; i < 2; i++) cbox(k, 0.004, 0.06, 0.03, 0.255, -0.055, 0.44, PAL.boneDark, 1.25, i * Math.PI / 2, 0.3);
}

export const blackguard: UnitDef = {
  build: () =>
    knight({
      bulk: 1.2,
      col: { plate: M, dark: D, trim: EDGE, mail: PAL.iron, cloth: PAL.cloth, leather: PAL.leatherDark },
      edge: EDGE,
      helm,
      pauldron: (k, s) => bladedPauldron(k, s, { size: 0.19, lames: 3, plate: M, dark: D, edge: EDGE, fin: 0.22, haute: 0.1, point: 0.04, spikes: 2 }),
      weapon: (k, g) => greatsword(k, g),
      shield: heater,
      shieldTilt: 0.15,
      shieldOffset: [0.1, 0.12],
      cape: { color: PAL.crimson, w: 0.64, h: 1.18, seed: 34, tatter: 0.6, folds: 4, depth: 0.06, flare: 0.55, curl: 0.22, mantle: true },
      tabard: { front: PAL.crimson, back: null, len: 0.6, w: 0.22, seed: 15, tatter: 0.45 },
      extra: (p: KnightParts) => {
        chestLines(p, EDGE);
        // Chain hanging from the belt
        for (let i = 0; i < 5; i++) band(p.torso, 0.017, 0.005, -0.17 * p.b, 1.03 - i * 0.028, 0.13 * p.b, T, 0, i * 0.9, 0, 6);
        // Broken arrow shaft in the left pauldron
        p.armL.add(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 4), PAL.wood, -0.1, 0.1, 0.07, 0.4, 0, 0.9);
        cbox(p.armL, 0.004, 0.05, 0.026, -0.2, 0.17, 0.12, PAL.boneDark, 0.4, 0, 0.9);
        // A sword slash across the breastplate
        const [x, y, z] = p.onChest(-0.15, 1.36, 0.006);
        gouge(p.torso, 0.2, x, y, z, 0.7, p.chestYaw(-0.15));
        // Crimson cloth wound round the right vambrace
        band(p.armR, 0.088, 0.016, 0, -0.43, 0, PAL.crimson, Math.PI / 2 + 0.2, 0, 0, 8);
      },
    }),
  portrait: { from: 0.3, to: 1.05, yaw: 0.5, faction: 'iron' },
};
