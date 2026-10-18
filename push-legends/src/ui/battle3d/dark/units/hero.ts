import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { shapeFrom, type K } from '../../../base3d/sculpt';
import { addGlow, type Rig } from '../../rig';
import { cbox, frustumGeo, HEAD_R, HEAD_Y, metal, SHAPES } from '../parts';
import { band, copTop, eyeSlit, flat, gouge, grip, knight, mtl, rivet, scratch, shellGeo, spaulder, type KnightParts } from './_armored';

/**
 * The player's Legend: a dark knight-captain. Gunmetal plate edged in muted gold, an armet with
 * a sharp sparrow-beak visor and a swept crest trailing a plume in the cape colour, a high fur
 * collar, a chain of office and a long hand-and-a-half sword. `goldsword` gives the blade gilded
 * furniture and a blackened edge with an ember burning down the fuller.
 */
const M = metal('#6a7078', 0.5);
const D = metal('#3a3e44', 0.45);
const GOLD = PAL.gold;
const GOLD_HI = PAL.goldLight;
const SHADOW = '#060607';
const BLACK_BLADE = metal('#2a2c31', 0.65);
const FULLER = mtl(PAL.steel, -0.45);
const FUR = '#3a3531';
const FUR_TIP = PAL.ashLight;

const CREST = shapeFrom([
  [-0.1, 0],
  [0.12, 0],
  [0.15, 0.03],
  [0.06, 0.075],
  [-0.06, 0.11],
  [-0.17, 0.09],
  [-0.2, 0.05],
]);

function captainHelm(k: K, glow: THREE.Object3D, plume: string): number {
  const r = HEAD_R;
  const hy = HEAD_Y;
  k.ball(r * 0.9, 0, hy, 0, '#08080a', 1, 1.05, 1.05, 8);
  // Rounded skull swept a little to the back, cheek plates closing under the visor
  k.lathe([[r * 1.06, hy - r * 0.25], [r * 1.09, hy + r * 0.25], [r * 0.96, hy + r * 0.8], [r * 0.55, hy + r * 1.14], [0.002, hy + r * 1.24]], 0, 0, -r * 0.05, M, 8, 1, 1.12);
  k.lathe([[r * 0.98, hy - r * 1.08], [r * 1.07, hy - r * 0.6], [r * 1.07, hy - r * 0.2]], 0, 0, -r * 0.03, M, 8, 1, 1.08);
  // Sparrow-beak visor: a sharp ridged prow under the eye slit
  k.add(flat(new THREE.ConeGeometry(r * 0.82, r * 1.35, 4)), D, 0, hy - r * 0.16, r * 0.95, Math.PI / 2, 0, 0, 1, 1, 0.66);
  cbox(k, r * 0.04, r * 0.62, r * 0.04, 0, hy - r * 0.02, r * 1.3, GOLD, -1.15, 0, 0);
  // Gilded brow band, eye slit with embers
  k.lathe([[r * 1.12, hy + r * 0.3], [r * 1.11, hy + r * 0.42]], 0, 0, -r * 0.05, GOLD, 8, 1, 1.12);
  cbox(k, r * 1.45, r * 0.1, r * 0.4, 0, hy + r * 0.24, r * 0.9, SHADOW);
  eyeSlit(k, glow, PAL.ember, hy + r * 0.24, r * 1.08, 0, r * 0.1, r * 0.3, 5, 0, r * 0.36);
  // Breaths in the beak
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) cbox(k, r * 0.06, r * 0.18, 0.02, s * r * (0.22 + i * 0.12), hy - r * 0.3, r * (1.05 - i * 0.16), SHADOW, 0, s * 0.75, 0);
  // Visor pivots
  for (const s of [-1, 1]) rivet(k, s * r * 1.1, hy + r * 0.05, -r * 0.05, GOLD, 0.016);
  // Swept crest down the crown, gilded rivets
  k.plate(CREST, 0.02, 0.004, 0, hy + r * 0.98, -r * 0.1, D, 0, Math.PI / 2, 0, 1.55);
  for (let i = 0; i < 3; i++) rivet(k, 0.016, hy + r * 1.15 + i * 0.01, r * 0.45 - i * r * 0.7, GOLD, 0.009);
  // Plume in the cape colour, flowing back from the crest
  k.curve(
    [
      [0, hy + r * 1.85, -r * 0.7],
      [0, hy + r * 1.75, -r * 1.6],
      [0, hy + r * 1.1, -r * 2.5],
      [0, hy + r * 0.15, -r * 2.9],
    ],
    r * 0.27,
    r * 0.06,
    plume,
    6,
  );
  // Lower rim and battle damage
  k.lathe([[r * 1.12, hy - r * 1.2], [r * 1.04, hy - r * 1.0]], 0, 0, -r * 0.03, D, 8, 1, 1.08);
  scratch(k, r * 0.6, r * 0.55, hy + r * 0.62, r * 0.8, 0.5, 0.65);
  gouge(k, r * 0.4, -r * 0.6, hy + r * 0.05, r * 0.85, -0.3, -0.7);
  return hy + r * 2.1;
}

function bastardSword(k: K, g: THREE.Group, gold: boolean): void {
  const guard = gold ? GOLD : D;
  grip(k, -0.1, 0.24, 0.024, PAL.leatherDark);
  if (gold) for (const y of [-0.06, 0.2]) band(k, 0.027, 0.006, 0, y, 0, GOLD_HI, Math.PI / 2, 0, 0, 6);
  // Faceted scent-stopper pommel
  k.add(flat(new THREE.OctahedronGeometry(0.044, 0)), guard, 0, -0.155, 0, 0, Math.PI / 4, 0, 1, 1.35, 1);
  // Long crossguard with down-swept quillons and a central langet
  k.add(frustumGeo(0.48, 0.04, 0.046, 0.55), guard, 0, 0.26, 0);
  for (const sx of [-1, 1]) k.add(new THREE.ConeGeometry(0.022, 0.12, 4), guard, sx * 0.26, 0.23, 0, 0, 0, sx * 2.35);
  k.add(frustumGeo(0.07, 0.11, 0.032, 0.55), guard, 0, 0.32, 0);
  // Blade with a dark fuller
  k.plate(SHAPES.greatswordBlade(1.14, 0.062), 0.013, 0.008, 0, 0.29, 0, gold ? BLACK_BLADE : PAL.steelLight);
  k.add(frustumGeo(0.024, 0.8, 0.034, 0.5), gold ? '#120c0a' : FULLER, 0, 0.72, 0);
  if (gold) {
    // An ember burning down the fuller and in the pommel
    addGlow(g, new THREE.BoxGeometry(0.009, 0.74, 0.036), PAL.ember, 0, 0.71, 0, 3.2);
    addGlow(g, new THREE.OctahedronGeometry(0.016, 0), PAL.ember, 0, -0.155, 0.034, 3);
    // Gilded edge bevel near the guard
    for (const sx of [-1, 1]) cbox(k, 0.008, 0.26, 0.03, sx * 0.058, 0.43, 0, GOLD_HI, 0, 0, -sx * 0.02);
  }
}

/** Desaturates (desat 0..1) and darkens (dark 0..1) a colour in linear space. */
function weather(hex: string, dark: number, desat: number): string {
  const c = new THREE.Color(hex);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  c.lerp(new THREE.Color(l, l, l), desat).multiplyScalar(1 - dark);
  return '#' + c.getHexString();
}

/** The player's Legend. `capeColor` is the equipped cosmetic; `sword` the unlocked blade. */
export function buildHero(capeColor: string, sword: 'sword' | 'goldsword'): Rig {
  // The cosmetic colour, weathered (desaturated, darkened) so it sits in the dark palette but
  // keeps its hue; the tabard is a much darker dye of the same colour
  const cape = weather(capeColor, 0.4, 0.3);
  const tabard = weather(capeColor, 0.85, 0.5);
  return knight({
    bulk: 1.2,
    col: { plate: M, dark: D, trim: GOLD, mail: PAL.iron, cloth: PAL.charcoal, leather: PAL.leatherDark },
    helm: (k, glow) => captainHelm(k, glow, cape),
    pauldron: (k, s) => {
      const left = s < 0;
      const ps = { size: left ? 0.185 : 0.17, lames: 4, plate: M, dark: D, trim: GOLD, haute: left ? 0.17 : 0.11, rivets: 3, facet: true };
      spaulder(k, s, ps);
      // Gilded flutes over the cop
      const [tx, ty] = copTop(ps, s);
      for (const d of [-0.06, 0, 0.06]) k.add(frustumGeo(0.011, 0.011, 0.26, 1, 0.8), d === 0 ? GOLD_HI : GOLD, tx, ty + 0.004, d, 0, 0, -s * 0.55);
    },
    weapon: (k, g) => bastardSword(k, g, sword === 'goldsword'),
    cape: { color: cape, w: 0.66, h: 1.58, seed: 77, tatter: 0.22, folds: 4, depth: 0.028 },
    tabard: { front: tabard, back: tabard, len: 0.68, w: 0.27, seed: 19, tatter: 0.25 },
    extra: (p: KnightParts) => {
      const b = p.b;
      // High fur collar round the back of the neck and over the shoulders
      p.torso.add(shellGeo([[0.27 * b, 1.5], [0.245 * b, 1.6], [0.17 * b, 1.71], [0.115 * b, 1.77]], Math.PI, 1.35, 9, 0.98, 0, 0.05), FUR, 0, 0, -0.01);
      for (let i = 0; i < 11; i++) {
        const a = Math.PI + (i / 10 - 0.5) * 2.5;
        const rr = 0.255 * b;
        p.torso.add(new THREE.ConeGeometry(0.045, 0.09 + (i % 3) * 0.03, 4), i % 2 ? FUR : FUR_TIP, Math.sin(a) * rr, 1.48 + (i % 3) * 0.014, Math.cos(a) * rr * 0.98, Math.PI + Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
      }
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6 - 0.5) * 2.1;
        const rr = 0.2 * b;
        p.torso.add(new THREE.ConeGeometry(0.04, 0.08 + (i % 2) * 0.03, 4), i % 2 ? FUR : FUR_TIP, Math.sin(a) * rr, 1.71, Math.cos(a) * rr * 0.98, 0.5 * Math.cos(a), 0, -0.5 * Math.sin(a));
      }
      // The captain's sigil embroidered in gold on the cape: a ring pierced by a sword
      if (p.cape) {
        const ck = p.cape;
        const z = -0.075;
        ck.add(new THREE.TorusGeometry(0.085, 0.011, 3, 14), GOLD, 0, -0.36, z);
        cbox(ck, 0.022, 0.34, 0.006, 0, -0.38, z - 0.004, GOLD_HI);
        cbox(ck, 0.11, 0.02, 0.006, 0, -0.26, z - 0.004, GOLD_HI);
        ck.add(new THREE.ConeGeometry(0.018, 0.05, 3), GOLD_HI, 0, -0.575, z - 0.004, Math.PI, 0, 0, 1, 1, 0.3);
        // Gilded hem along the top edge
        cbox(ck, 0.6 * b, 0.035, 0.03, 0, -0.02, 0.0, GOLD);
      }
      // Chain of office across the chest with a gilded pendant
      for (let i = 0; i < 11; i++) {
        const t = i / 10;
        const a = (t - 0.5) * 1.7;
        const y = 1.37 + 0.17 * Math.pow(2 * t - 1, 2);
        const [x, yy, z] = p.onChest(a, y, 0.014);
        cbox(p.torso, 0.026, 0.016, 0.01, x, yy, z, i % 2 ? GOLD : GOLD_HI, 0, p.chestYaw(a), (t - 0.5) * 1.2);
      }
      {
        const [x, y, z] = p.onChest(0, 1.32, 0.02);
        p.torso.add(new THREE.CylinderGeometry(0.034, 0.034, 0.012, 8), GOLD, x, y, z, Math.PI / 2 - 0.1, 0, 0);
        p.torso.add(new THREE.OctahedronGeometry(0.016, 0), PAL.blood, x, y, z + 0.01, 0, 0, 0, 1, 1.3, 0.6);
      }
      // Cape clasps
      for (const s of [-1, 1]) {
        const [x, y, z] = p.onChest(s * 1.05, 1.53, 0.012);
        p.torso.add(new THREE.CylinderGeometry(0.03, 0.03, 0.014, 8), GOLD, x, y, z, Math.PI / 2, p.chestYaw(s * 1.05), 0);
      }
      // Gilded edges on the gauntlet cuffs, couters and knees
      for (const ak of [p.armR, p.armL]) band(ak, 0.105, 0.008, 0, -0.505, 0, GOLD, Math.PI / 2, 0, 0, 8);
      for (const lk of [p.legR, p.legL]) rivet(lk, 0, -0.5, 0.11, GOLD, 0.017);
      // A rondel dagger at the back of the right hip
      p.torso.add(frustumGeo(0.03, 0.26, 0.03, 0.6), PAL.leatherDark, 0.2 * b, 0.94, -0.12 * b, -0.5, 0, 0.25);
      p.torso.add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 8), GOLD, 0.21 * b, 1.08, -0.05 * b, 0.5, 0, 0.3);
      // Old wounds in the plate
      const [x, y, z] = p.onChest(0.32, 1.25, 0.006);
      gouge(p.torso, 0.16, x, y, z, -0.55, p.chestYaw(0.32));
    },
  });
}
