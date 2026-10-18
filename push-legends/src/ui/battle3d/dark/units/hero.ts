import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { shapeFrom, type K } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { cbox, frustumGeo, HEAD_R, HEAD_Y, metal, SHAPES } from '../parts';
import { band, bladedPauldron, chestLines, flat, GlowBatch, gouge, grip, knight, lineGeo, rivet, scratch, shellGeo, slabGeo, type KnightParts } from './_armored';

/**
 * The player's Legend: a dark knight-captain. Glossy black plate inlaid with thin gold, a tall
 * spired helm with swept blades at the temples and a narrow burning visor, sharp layered
 * pauldrons, a sigil glowing on the breastplate, a heavy cape in the equipped colour and a long
 * sword whose fuller is a line of living rune-light. Accent: violet; with `goldsword` the hilt is
 * muted gold, the blade blackened and the light an ember.
 */
const M = metal('#272a30', 0.74);
const D = metal('#141519', 0.62);
const GOLD = PAL.gold;
const GOLD_HI = PAL.goldLight;
const SHADOW = '#060607';
const VIOLET = '#a64dff';
const EMBER = '#ff6a1a';
const BLACK_BLADE = metal('#24262b', 0.7);

function spireHelm(k: K, glow: THREE.Object3D, accent: string): number {
  const r = HEAD_R * 1.02;
  const hy = HEAD_Y;
  const gb = new GlowBatch();
  k.ball(r * 0.9, 0, hy, 0, '#08080a', 1, 1.05, 1.05, 8);
  // Tall faceted spire
  const prof: [number, number][] = [
    [1.02, -1.0],
    [1.08, -0.4],
    [1.1, 0.15],
    [1.02, 0.62],
    [0.8, 1.02],
    [0.5, 1.42],
    [0.22, 1.92],
    [0.01, 2.5],
  ];
  k.add(flat(new THREE.LatheGeometry(prof.map(([a, y]) => new THREE.Vector2(a * r, hy + y * r)), 10)), M, 0, 0, -r * 0.03, 0, 0, 0, 1, 1, 1.1);
  // Visor: a pointed face plate jutting below the slit, keeled down the middle
  k.add(flat(shellGeo([[r * 0.85, hy - r * 1.15], [r * 1.12, hy - r * 0.62], [r * 1.17, hy - r * 0.18], [r * 1.12, hy - r * 0.03]], 0, 1.2, 10, 1.18, 0, r * 0.45)), D, 0, 0, 0);
  k.add(flat(frustumGeo(0.02, r * 1.05, r * 0.2, 0.5, 0.4)), M, 0, hy - r * 0.55, r * 1.3, -0.3, 0, 0);
  // Brow plate sweeping down to a point between the eyes
  for (const s of [-1, 1]) k.add(flat(frustumGeo(r * 0.95, r * 0.2, r * 0.26, 0.8, 0.6)), D, s * r * 0.42, hy + r * 0.29, r * 1.07, 0.15, s * 0.42, s * 0.2);
  // The slit and its burning eyes
  for (const s of [-1, 1]) cbox(k, r * 0.58, r * 0.12, 0.03, s * r * 0.34, hy + r * 0.1, r * 1.12, SHADOW, 0, s * 0.4, s * 0.12);
  for (const s of [-1, 1]) gb.add(new THREE.BoxGeometry(r * 0.38, r * 0.06, 0.01), s * r * 0.36, hy + r * 0.105, r * 1.12 + 0.018, 0, s * 0.4, s * 0.12);
  // Breaths
  for (let i = 0; i < 4; i++) cbox(k, r * 0.05, r * 0.2, 0.02, (i - 1.5) * r * 0.13, hy - r * 0.55, r * 1.2 - Math.abs(i - 1.5) * r * 0.06, SHADOW, -0.3, (i - 1.5) * 0.3, 0);
  // Gold inlay: brow band, visor edges and a line up the spire
  k.add(flat(new THREE.LatheGeometry([[1.13, 0.4], [1.11, 0.5]].map(([a, y]) => new THREE.Vector2(a! * r, hy + y! * r)), 10)), GOLD, 0, 0, -r * 0.03, 0, 0, 0, 1, 1, 1.1);
  k.add(lineGeo([[0, hy + r * 0.5, r * 1.15], [0, hy + r * 1.05, r * 0.88], [0, hy + r * 1.5, r * 0.55], [0, hy + r * 2.0, r * 0.22]], 0.005), GOLD, 0, 0, 0);
  // Gorget lames
  k.lathe([[r * 1.24, hy - r * 1.32], [r * 1.1, hy - r * 1.02]], 0, 0, 0, D, 12, 1, 1.05);
  k.lathe([[r * 1.12, hy - r * 1.06], [r * 1.02, hy - r * 0.86]], 0, 0, 0, M, 12, 1, 1.06);
  for (const s of [-1, 1]) rivet(k, s * r * 1.12, hy + r * 0.1, -r * 0.05, GOLD, 0.014);
  scratch(k, r * 0.5, r * 0.55, hy + r * 0.72, r * 0.82, 0.5, 0.65);
  gouge(k, r * 0.4, -r * 0.62, hy + r * 0.62, r * 0.8, -0.3, -0.7);
  gb.flush(glow, accent, 6);
  return hy + r * 2.5;
}

function longsword(k: K, g: THREE.Group, gold: boolean, accent: string): void {
  const furn = gold ? GOLD : D;
  grip(k, -0.1, 0.24, 0.024, PAL.leatherDark);
  if (gold) for (const y of [-0.06, 0.2]) band(k, 0.027, 0.006, 0, y, 0, GOLD_HI, Math.PI / 2, 0, 0, 6);
  // Faceted pommel with a glowing stone
  k.add(flat(new THREE.OctahedronGeometry(0.046, 0)), furn, 0, -0.155, 0, 0, Math.PI / 4, 0, 1, 1.35, 1);
  // Winged crossguard: quillons sweeping up towards the blade, a pointed langet
  k.add(flat(frustumGeo(0.44, 0.04, 0.046, 0.55)), furn, 0, 0.26, 0);
  for (const sx of [-1, 1]) k.add(new THREE.ConeGeometry(0.024, 0.16, 4), furn, sx * 0.25, 0.3, 0, 0, 0, -sx * 0.9);
  k.add(new THREE.ConeGeometry(0.04, 0.14, 4), gold ? GOLD_HI : M, 0, 0.35, 0, 0, Math.PI / 4, 0, 1, 1, 0.45);
  // Long blade: steel (or blackened) edges round a fuller of rune light
  const len = 1.22;
  const w = 0.062;
  k.plate(SHAPES.greatswordBlade(len, w), 0.013, 0.008, 0, 0.29, 0, gold ? BLACK_BLADE : PAL.steel);
  const gb = new GlowBatch();
  gb.add(slabGeo(SHAPES.greatswordBlade(len * 0.84, w * 0.36), 0.03), 0, 0.33, 0);
  gb.add(new THREE.OctahedronGeometry(0.017, 0), 0, -0.155, 0.036);
  gb.flush(g, accent, 3.6);
  // Rune notches cut along the light
  for (let i = 0; i < 6; i++) cbox(k, w * 0.7, 0.006, 0.034, 0, 0.42 + i * 0.13, 0, gold ? '#120c0a' : D, 0, 0, i % 2 ? 0.5 : -0.5);
  if (gold) for (const sx of [-1, 1]) cbox(k, 0.008, 0.24, 0.03, sx * 0.056, 0.42, 0, GOLD_HI, 0, 0, -sx * 0.02);
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
  const gold = sword === 'goldsword';
  const accent = gold ? EMBER : VIOLET;
  // The cosmetic colour, weathered (desaturated, darkened) so it sits in the dark palette but
  // keeps its hue; the tabard is a much darker dye of the same colour
  const cape = weather(capeColor, 0.22, 0.2);
  const tabard = weather(capeColor, 0.7, 0.4);
  return knight({
    bulk: 1.22,
    tall: 1.02,
    col: { plate: M, dark: D, trim: GOLD, mail: PAL.iron, cloth: PAL.charcoal, leather: PAL.leatherDark },
    edge: GOLD,
    helm: (k, glow) => spireHelm(k, glow, accent),
    pauldron: (k, s) => bladedPauldron(k, s, { size: s < 0 ? 0.205 : 0.195, lames: 3, plate: M, dark: D, edge: GOLD, fin: 0.27, point: 0.05, haute: 0.12 }),
    weapon: (k, g) => longsword(k, g, gold, accent),
    cape: { color: cape, w: 0.74, h: 1.6, seed: 77, tatter: 0.2, folds: 4, depth: 0.07, flare: 0.6, curl: 0.24, mantle: true, trim: GOLD },
    tabard: { front: tabard, back: null, len: 0.7, w: 0.24, seed: 19, tatter: 0.22 },
    extra: (p: KnightParts) => {
      const b = p.b;
      chestLines(p, GOLD);
      // The captain's sigil burning in the breastplate: a pointed star in a gold setting
      {
        const [x, y, z] = p.onChest(0, 1.4, 0.01);
        const sig = new GlowBatch();
        const star = shapeFrom([[0, 0.075], [0.016, 0.018], [0.045, 0], [0.016, -0.018], [0, -0.06], [-0.016, -0.018], [-0.045, 0], [-0.016, 0.018]]);
        sig.add(slabGeo(star, 0.01), x, y, z + 0.004, -0.15, 0, 0);
        sig.flush(p.frame, accent, 4);
        p.torso.add(flat(new THREE.ExtrudeGeometry(shapeFrom([[0, 0.1], [0.06, 0], [0, -0.085], [-0.06, 0]]), { depth: 0.012, bevelEnabled: false })), GOLD, x, y, z - 0.008, -0.15, 0, 0);
      }
      // The captain's sigil embroidered in gold on the cape: a ring pierced by a sword
      if (p.cape) {
        const ck = p.cape;
        const z = -0.09;
        ck.add(new THREE.TorusGeometry(0.09, 0.011, 3, 14), GOLD, 0, -0.4, z);
        cbox(ck, 0.022, 0.36, 0.006, 0, -0.42, z - 0.004, GOLD_HI);
        cbox(ck, 0.12, 0.02, 0.006, 0, -0.29, z - 0.004, GOLD_HI);
        ck.add(new THREE.ConeGeometry(0.018, 0.05, 3), GOLD_HI, 0, -0.625, z - 0.004, Math.PI, 0, 0, 1, 1, 0.3);
      }
      // Cape clasps
      for (const s of [-1, 1]) {
        const [x, y, z] = p.onChest(s * 1.0, 1.53, 0.016);
        p.torso.add(new THREE.CylinderGeometry(0.032, 0.032, 0.016, 8), GOLD, x, y, z, Math.PI / 2, p.chestYaw(s * 1.0), 0);
      }
      // Gilded edges on the gauntlet cuffs and knee cops
      for (const ak of [p.armR, p.armL]) band(ak, 0.105, 0.008, 0, -0.505, 0, GOLD, Math.PI / 2, 0, 0, 8);
      for (const lk of [p.legR, p.legL]) rivet(lk, 0, -0.5, 0.11, GOLD, 0.017);
      // A rondel dagger at the back of the right hip
      p.torso.add(frustumGeo(0.03, 0.26, 0.03, 0.6), PAL.leatherDark, 0.2 * b, 0.94, -0.12 * b, -0.5, 0, 0.25);
      p.torso.add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 8), GOLD, 0.21 * b, 1.08, -0.05 * b, 0.5, 0, 0.3);
      // Old wounds in the plate
      const [x, y, z] = p.onChest(0.4, 1.25, 0.006);
      gouge(p.torso, 0.14, x, y, z, -0.55, p.chestYaw(0.4));
    },
  });
}
