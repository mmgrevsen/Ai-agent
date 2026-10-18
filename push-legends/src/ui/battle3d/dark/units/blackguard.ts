import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import type { K } from '../../../base3d/sculpt';
import { capGeo, cbox, frustumGeo, HEAD_R, HEAD_Y, prismGeo, SHAPES } from '../parts';
import { band, eyeSlit, flat, gouge, grip, knight, mtl, rivet, scratch, spaulder, type KnightParts } from './_armored';
import type { UnitDef } from './types';

/**
 * The Blackguard (card: oakshield_knight, common). Battered gunmetal plate, a flat-topped
 * greathelm with a burning cross slit, crimson cloth, a long notched greatsword and a crimson
 * heater shield with an arrow still stuck in it. Broad, grounded, heavy.
 */
const M = PAL.gunmetal;
const D = PAL.blackSteel;
const T = PAL.iron;
const DENT = mtl(M, -0.4);
const FULLER = mtl(PAL.steel, -0.45);

function greathelm(k: K, glow: THREE.Object3D): number {
  const r = HEAD_R * 1.06;
  const hy = HEAD_Y;
  k.ball(r * 0.9, 0, hy, 0, '#08080a', 1, 1.05, 1.05, 8);
  // Octagonal bucket tapering to the crown, with a medial ridge down the face
  k.add(flat(prismGeo(r * 1.08, r * 2.2, 8, 0.92)), M, 0, hy + r * 0.02, 0, 0, 0, 0, 1, 1, 1.04);
  k.add(flat(capGeo(r * 1.22, Math.PI * 0.3, 8, 2)), M, 0, hy + r * 0.8, 0, 0, 0, 0, 1, 0.45, 1.04);
  // Brow band riveted over the slit, lower rim flaring onto the gorget
  k.lathe([[r * 1.12, hy + r * 0.2], [r * 1.1, hy + r * 0.4]], 0, 0, 0, D, 8, 1, 1.04);
  k.lathe([[r * 1.14, hy - r * 1.12], [r * 1.07, hy - r * 0.92]], 0, 0, 0, D, 8, 1, 1.04);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    rivet(k, Math.sin(a) * r * 1.07, hy + r * 0.3, Math.cos(a) * r * 1.07 * 1.04, T, 0.009);
  }
  // Eye slit across both faces of the ridge, ember eyes in the dark
  const fr = r * 1.08 * Math.cos(Math.PI / 8);
  for (const s of [-1, 1]) {
    const a = s * Math.PI / 8;
    cbox(k, r * 0.78, r * 0.11, 0.02, Math.sin(a) * fr, hy + r * 0.1, Math.cos(a) * fr * 1.04, '#060607', 0, a, 0);
  }
  eyeSlit(k, glow, PAL.ember, hy + r * 0.1, r * 0.99, 0, r * 0.08, r * 0.32, 3.2, 0, r * 0.26);
  // Low riveted comb front to back over the flat crown (sharpens the silhouette)
  k.add(flat(frustumGeo(0.026, r * 0.3, r * 2.1, 0.4, 0.72)), D, 0, hy + r * 1.27, 0);
  // Vertical reinforcement down the ridge (cross-shaped visor)
  cbox(k, r * 0.12, r * 1.25, r * 0.08, 0, hy - r * 0.35, r * 1.1, D);
  cbox(k, r * 0.07, r * 0.55, r * 0.06, 0, hy - r * 0.45, r * 1.15, '#060607');
  // Breaths on the right cheek
  const ca = Math.PI * 0.375;
  for (let i = 0; i < 6; i++) cbox(k, r * 0.08, r * 0.08, 0.02, Math.sin(ca) * fr + Math.cos(ca) * (i % 3) * r * 0.16 * 0.4, hy - r * 0.3 - Math.floor(i / 3) * r * 0.2, Math.cos(ca) * fr * 1.04 - Math.sin(ca) * (i % 3) * r * 0.06, '#060607', 0, ca, 0);
  // Damage: a dent over the left eye, a gouge and scratches
  k.ball(r * 0.22, -r * 0.62, hy + r * 0.62, r * 0.76, DENT, 1, 0.7, 0.4, 6);
  gouge(k, r * 0.7, r * 0.55, hy + r * 0.75, r * 0.85, 0.5, 0.6);
  scratch(k, r * 0.6, -r * 0.4, hy - r * 0.6, r * 0.98, -0.4, -0.35);
  return hy + r * 1.42;
}

function greatsword(k: K): void {
  grip(k, -0.1, 0.28, 0.024, PAL.leatherDark);
  // Faceted wheel pommel
  k.add(flat(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 8)), D, 0, -0.14, 0, 0, 0, Math.PI / 2);
  // Angular crossguard with down-swept quillons and a ricasso block
  k.add(frustumGeo(0.42, 0.045, 0.05, 0.62), D, 0, 0.3, 0);
  for (const sx of [-1, 1]) k.add(new THREE.ConeGeometry(0.024, 0.11, 4), D, sx * 0.23, 0.27, 0, 0, 0, sx * 2.4);
  k.add(frustumGeo(0.1, 0.09, 0.026, 0.85), D, 0, 0.365, 0);
  // Long notched blade with a dark fuller
  k.plate(SHAPES.notchedBlade(1.25, 0.072), 0.014, 0.008, 0, 0.33, 0, PAL.steel);
  k.add(frustumGeo(0.03, 0.95, 0.034, 0.4), FULLER, 0, 0.83, 0);
}

function heater(k: K): void {
  const shape = SHAPES.heater(0.31, 0.86);
  // Blackened rim behind a crimson painted face
  k.plate(shape, 0.05, 0.022, 0.07, -0.08, 0.16, D, 0, 0, 0, 1.07);
  k.plate(shape, 0.06, 0.012, 0.07, -0.08, 0.186, PAL.crimson);
  // Iron straps, a central boss and rivets
  k.add(frustumGeo(0.05, 0.74, 0.022, 0.75), T, 0.07, -0.1, 0.228);
  k.add(frustumGeo(0.56, 0.045, 0.022, 1), T, 0.07, 0.08, 0.228);
  k.add(flat(capGeo(0.07, Math.PI / 2, 8, 3)), M, 0.07, 0.08, 0.232, Math.PI / 2, 0, 0);
  for (const [x, y] of [[-0.18, 0.08], [0.32, 0.08], [0.07, 0.3], [0.07, -0.38]] as const) rivet(k, x, y, 0.24, PAL.steel, 0.013);
  // Paint scraped to the steel, deep gouges
  scratch(k, 0.16, 0.2, 0.22, 0.236, 0.6, 0, PAL.boneDark);
  scratch(k, 0.12, -0.08, -0.2, 0.236, -0.5, 0, PAL.boneDark);
  gouge(k, 0.18, 0.14, -0.06, 0.238, -0.7);
  gouge(k, 0.1, -0.05, 0.2, 0.238, 0.3);
  // A broken arrow lodged in the face
  k.add(new THREE.CylinderGeometry(0.006, 0.006, 0.24, 4), PAL.wood, 0.22, -0.12, 0.33, 1.25, 0, 0.3);
  for (let i = 0; i < 2; i++) cbox(k, 0.004, 0.06, 0.03, 0.235, -0.155, 0.44, PAL.boneDark, 1.25, i * Math.PI / 2, 0.3);
}

export const blackguard: UnitDef = {
  build: () =>
    knight({
      bulk: 1.2,
      col: { plate: M, dark: D, trim: T, mail: PAL.iron, cloth: PAL.cloth, leather: PAL.leatherDark },
      helm: greathelm,
      pauldron: (k, s) => spaulder(k, s, { size: 0.165, lames: 3, plate: M, dark: D, trim: T, haute: 0.1, rivets: 3, facet: true }),
      weapon: (k) => greatsword(k),
      shield: heater,
      shieldTilt: 0.15,
      shieldOffset: [0.1, 0.12],
      // A short ragged war-cloak (the Fallen Oath and the hero wear long ones)
      cape: { color: PAL.crimson, w: 0.56, h: 1.08, seed: 34, tatter: 0.55, folds: 3 },
      tabard: { front: PAL.blood, back: PAL.crimson, len: 0.62 },
      extra: (p: KnightParts) => {
        // Chain hanging from the belt
        for (let i = 0; i < 5; i++) band(p.torso, 0.017, 0.005, -0.17 * p.b, 1.03 - i * 0.028, 0.13 * p.b, T, 0, i * 0.9, 0, 6);
        // Broken arrow shaft in the left pauldron
        p.armL.add(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 4), PAL.wood, -0.1, 0.12, 0.05, 0.4, 0, 0.9);
        cbox(p.armL, 0.004, 0.05, 0.026, -0.2, 0.19, 0.1, PAL.boneDark, 0.4, 0, 0.9);
        // A sword slash across the breastplate
        const [x, y, z] = p.onChest(-0.15, 1.33, 0.006);
        gouge(p.torso, 0.2, x, y, z, 0.7, p.chestYaw(-0.15));
        // Crimson cloth wound round the right vambrace
        band(p.armR, 0.088, 0.016, 0, -0.43, 0, PAL.crimson, Math.PI / 2 + 0.2, 0, 0, 8);
      },
    }),
  portrait: { from: 0.3, to: 1.05, yaw: 0.5, faction: 'iron' },
};
