import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { shapeFrom, type K } from '../../../base3d/sculpt';
import { addGlow, type Rig } from '../../rig';
import { cbox, frustumGeo, HEAD_R, HEAD_Y, metal, prismGeo } from '../parts';
import { band, bladedPauldron, chestLines, clothGeo, finGeo, flat, GlowBatch, gouge, grip, knight, lineGeo, mtl, rivet, scratch, shellGeo, type KnightParts } from './_armored';
import type { UnitDef } from './types';

/**
 * The Fallen Oath (card: dawn_paladin, rare). A paladin whose vow broke: pale, tarnished steel over
 * glossy black armour, a tall severe helm whose pointed visor burns crimson along its edges and
 * weeps crimson light, a broken sunburst crown with a ring of blood-red fire behind the head,
 * crescent-horned pauldrons, a sun-flanged mace and a great kite shield whose gilded sun is split
 * by glowing crimson cracks. Accent: crimson, with the last of the gold.
 */
const PALE = metal('#7c776d', 0.72);
const PALE_HI = mtl(PALE, 0.25, 0.8);
const DARK = metal('#222328', 0.66);
const DARKER = metal('#141418', 0.6);
const GOLD = PAL.gold;
const SHADOW = '#060607';
const HOLY = PAL.holy;
const CRIMSON = '#ff2a4a';
/** Glow strengths: tears and chest crack, the shield's cracks (read at battle scale). */
const FAINT = 2.2;
const CRACK = 3;
const SHIELD_FACE = mtl(PALE, -0.08, 0.78);
const TARNISH = mtl(PALE, -0.4, 0.6);

function sorrowHelm(k: K, glow: THREE.Object3D): number {
  const r = HEAD_R;
  const hy = HEAD_Y;
  k.ball(r * 0.9, 0, hy, 0, '#08080a', 1, 1.05, 1.05, 8);
  // Tall, severe skull rising to a sharp point
  const prof: [number, number][] = [
    [1.0, -1.05],
    [1.08, -0.4],
    [1.08, 0.3],
    [0.92, 0.88],
    [0.55, 1.42],
    [0.22, 1.85],
    [0.01, 2.15],
  ];
  k.add(flat(new THREE.LatheGeometry(prof.map(([a, y]) => new THREE.Vector2(a * r, hy + y * r)), 12)), PALE, 0, 0, 0, 0, 0, 0, 1, 1, 1.06);
  // Blackened blade crest from the brow over the crown
  k.add(finGeo(shapeFrom([[-r * 0.9, r * 0.6], [-r * 0.5, r * 1.15], [0, r * 1.75], [r * 0.5, r * 1.45], [r * 1.25, r * 1.15], [r * 0.8, r * 0.7], [0, r * 0.9]]), 0.02, 0, hy + r * 0.25, -r * 0.05, 0, 0.004), DARK, 0, 0, 0);
  // Pointed visor: a glossy black mask peaked at the brow and drawn to a point at the chin,
  // burning crimson along its upper edges
  const top = r * 0.48;
  const peak = r * 0.34;
  const half = 0.92;
  const VR = r * 1.13;
  const VZ = 1.12;
  k.add(flat(shellGeo([[r * 0.88, hy - r * 1.2], [r * 1.12, hy - r * 0.62], [r * 1.16, hy - r * 0.05], [VR, hy + top]], 0, half, 12, VZ, peak, r * 0.6)), DARK, 0, 0, 0);
  k.add(flat(frustumGeo(0.014, r * 1.0, r * 0.12, 0.5, 0.5)), DARKER, 0, hy - r * 0.62, r * 1.28, -0.2, 0, 0);
  const gb = new GlowBatch();
  for (const sd of [-1, 1]) {
    const edge: [number, number, number][] = [];
    const gild: [number, number, number][] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const a = sd * t * half * 0.96;
      const y = hy + top - peak * t;
      edge.push([Math.sin(a) * VR * 1.01, y - r * 0.07, Math.cos(a) * VR * VZ * 1.015]);
      gild.push([Math.sin(a) * VR * 1.0, y + r * 0.06, Math.cos(a) * VR * VZ * 0.99]);
    }
    gb.add(lineGeo(edge, 0.0032), 0, 0, 0);
    k.add(lineGeo(gild, 0.004), GOLD, 0, 0, 0);
    // A brighter eye where the edge burns hottest
    gb.add(new THREE.BoxGeometry(r * 0.36, r * 0.07, 0.008), sd * r * 0.38, hy + top - peak * 0.42 - r * 0.07, VR * VZ * Math.cos(0.38) + 0.004, 0, sd * 0.38, -sd * 0.42);
  }
  // Breaths in the lower mask
  for (let i = 0; i < 4; i++) cbox(k, r * 0.05, r * 0.22, 0.02, (i < 2 ? -1 : 1) * r * (0.22 + (i % 2) * 0.13), hy - r * 0.5, r * 1.24 - (i % 2) * r * 0.04, SHADOW, -0.2, (i < 2 ? -1 : 1) * 0.3, 0);
  // Gorget lames under the helm
  k.lathe([[r * 1.12, hy - r * 1.3], [r * 1.05, hy - r * 1.02]], 0, 0, 0, DARK, 8, 1, 1.06);
  scratch(k, r * 0.6, r * 0.5, hy + r * 0.75, r * 0.82, 0.6, 0.6, '#d8d2c2');
  gouge(k, r * 0.5, -r * 0.55, hy - r * 0.35, r * 0.98, -0.5, -0.5);

  // Broken sunburst crown behind the head: tarnished gold rays round a cracked halo
  const hz = -r * 0.95;
  const hyc = hy + r * 0.55;
  const R = r * 1.55;
  band(k, R, 0.009, 0, hyc, hz, GOLD, 0, 0, 0.5, 11, Math.PI * 1.62);
  band(k, R * 0.72, 0.006, 0, hyc, hz, DARK, 0, 0, 2.3, 7, Math.PI * 1.3);
  const broken = new Set([3, 8, 9]);
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2;
    if (Math.abs(Math.sin(a / 2)) > 0.93) continue; // gap under the head
    const len = broken.has(i) ? r * 0.35 : i % 2 ? r * 0.9 : r * 1.35;
    const rr = R + len / 2 - r * 0.15;
    k.add(new THREE.ConeGeometry(r * 0.07, len, 4), GOLD, Math.sin(a) * rr, hyc + Math.cos(a) * rr, hz - 0.004, 0, 0, -a, 1, 1, 0.35);
  }
  // A ring of blood-red fire inside the broken crown
  gb.add(new THREE.TorusGeometry(R * 0.86, 0.006, 3, 18, Math.PI * 1.25), 0, hyc, hz + 0.004, 0, 0, 1.0);
  gb.flush(glow, CRIMSON, 4);
  return hy + r * 2.15;
}

const RAY = shapeFrom([[0, -0.085], [0.04, -0.05], [0.085, 0], [0.04, 0.05], [0, 0.085]]);

function sunMace(k: K, g: THREE.Group, rig: Rig): void {
  grip(k, -0.12, 0.22, 0.024, PAL.leatherDark);
  k.add(new THREE.OctahedronGeometry(0.035, 0), GOLD, 0, -0.15, 0, 0, 0, 0, 1, 1.4, 1);
  for (const y of [0.24, 0.48]) band(k, 0.03, 0.009, 0, y, 0, GOLD, Math.PI / 2, 0, 0, 6);
  k.add(prismGeo(0.02, 0.5, 6), DARK, 0, 0.48, 0);
  // Sun head: dark core, eight pale flanges like rays, crowned with a spike
  k.add(prismGeo(0.04, 0.2, 8), DARKER, 0, 0.82, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.plate(RAY, 0.016, 0, Math.sin(a) * 0.03, 0.82, Math.cos(a) * 0.03, i % 2 ? PALE : PALE_HI, 0, a - Math.PI / 2, 0, 1.15);
  }
  band(k, 0.045, 0.01, 0, 0.71, 0, GOLD, Math.PI / 2, 0, 0, 8);
  band(k, 0.045, 0.01, 0, 0.93, 0, GOLD, Math.PI / 2, 0, 0, 8);
  k.add(new THREE.ConeGeometry(0.03, 0.14, 6), PALE, 0, 1.0, 0);
  // Smouldering gold-crimson heart inside the head
  const core = addGlow(g, new THREE.OctahedronGeometry(0.034, 0), CRIMSON, 0, 0.82, 0, 4);
  core.scale.set(1, 1.6, 1);
  rig.spinners.push(core);
}

function kiteShield(k: K, g: THREE.Group): void {
  const w = 0.34;
  const h = 1.02;
  const kite = shapeFrom([
    [-w, h * 0.42],
    [-w * 0.55, h * 0.5],
    [w * 0.55, h * 0.5],
    [w, h * 0.42],
    [w * 0.94, h * 0.02],
    [w * 0.55, -h * 0.28],
    [0, -h * 0.5],
    [-w * 0.55, -h * 0.28],
    [-w * 0.94, h * 0.02],
  ]);
  const cx = 0.08;
  const cy = -0.12;
  // Blackened border, a thin gilded line, then the pale tarnished face
  k.plate(kite, 0.05, 0.02, cx, cy, 0.16, DARK, 0, 0, 0, 1.08);
  k.plate(kite, 0.05, 0, cx, cy + 0.004, 0.176, GOLD, 0, 0, 0, 1.03);
  k.plate(kite, 0.06, 0.012, cx, cy, 0.186, SHIELD_FACE);
  // Tarnish: dark streaks of old soot and blood running down from the emblem
  for (const [x, y, h, rot] of [[-0.15, -0.05, 0.36, 0.08], [0.2, 0.0, 0.3, -0.06], [-0.05, -0.32, 0.22, 0.03]] as const)
    cbox(k, 0.05, h, 0.004, cx + x, cy + y, 0.234, TARNISH, 0, 0, rot);
  // Raised keel and gilded edge strips
  k.add(frustumGeo(0.03, h * 0.9, 0.022, 0.5), PALE_HI, cx, cy - 0.04, 0.228);
  // The sun emblem: gold disc with sixteen rays, split by the broken oath
  const ey = cy + 0.16;
  k.add(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 12), GOLD, cx, ey, 0.232, Math.PI / 2, 0, 0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const len = i % 2 ? 0.08 : 0.13;
    const rr = 0.075 + len / 2;
    k.add(new THREE.ConeGeometry(0.018, len, 3), GOLD, cx + Math.sin(a) * rr, ey + Math.cos(a) * rr, 0.231, 0, 0, -a, 1, 1, 0.25);
  }
  // The last gold light, dimming at the heart of the sun
  addGlow(g, new THREE.CylinderGeometry(0.03, 0.03, 0.01, 10), HOLY, cx, ey, 0.238, 1.4).rotation.x = Math.PI / 2;
  // Crimson cracks through the emblem and deep scars
  const crack: [number, number, number, number][] = [
    [0.0, 0.2, 0.13, 0.3],
    [0.04, 0.08, 0.12, -0.5],
    [0.0, -0.04, 0.14, 0.35],
    [0.05, -0.16, 0.12, -0.25],
    [-0.04, 0.12, 0.08, 1.1],
  ];
  const cg = new GlowBatch();
  for (const [x, y, len, rot] of crack) {
    cbox(k, 0.016, len, 0.008, cx + x, cy + y + 0.16, 0.236, SHADOW, 0, 0, rot);
    cg.add(new THREE.BoxGeometry(0.007, len * 0.95, 0.004), cx + x, cy + y + 0.16, 0.242, 0, 0, rot);
  }
  cg.flush(g, CRIMSON, CRACK);
  gouge(k, 0.16, cx - 0.16, cy - 0.12, 0.236, 0.7);
  gouge(k, 0.12, cx + 0.18, cy + 0.32, 0.236, -0.4);
  scratch(k, 0.18, cx + 0.12, cy - 0.25, 0.236, 0.5, 0, '#d8d2c2');
  for (const [x, y] of [[-0.27, 0.36], [0.27, 0.36], [0, -0.42], [-0.25, -0.02], [0.25, -0.02]] as const) rivet(k, cx + x * 1.02, cy + y, 0.232, GOLD, 0.012);
}

export const fallenOath: UnitDef = {
  build: () =>
    knight({
      bulk: 1.14,
      tall: 1.04,
      col: { plate: PALE, dark: DARK, trim: GOLD, mail: DARKER, cloth: PAL.charcoal, leather: PAL.leatherDark },
      armCol: { plate: DARK, dark: DARKER },
      legCol: { dark: DARKER },
      helm: sorrowHelm,
      pauldron: (k, s) => bladedPauldron(k, s, { size: 0.18, lames: 3, plate: PALE, dark: DARK, edge: GOLD, horns: 0.32, point: 0.03, haute: 0.11 }),
      weapon: sunMace,
      shield: kiteShield,
      shieldTilt: 0.12,
      shieldOffset: [0.1, 0.14],
      cape: { color: '#6b6151', w: 0.7, h: 1.6, seed: 57, tatter: 0.42, folds: 4, depth: 0.07, flare: 0.6, curl: 0.24, mantle: true, trim: GOLD },
      edge: GOLD,
      tabard: { front: '#a49678', back: PAL.boneDark, len: 0.82, w: 0.27, seed: 23, tatter: 0.45 },
      extra: (p: KnightParts) => {
        chestLines(p, GOLD, { v: false, abs: false });
        // Gold sun on the breastplate, cracked through with crimson light
        const [x, y, z] = p.onChest(0, 1.38, 0.012);
        const yaw = p.chestYaw(0);
        p.torso.add(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 10), GOLD, x, y, z, Math.PI / 2 - 0.12, yaw, 0);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          p.torso.add(new THREE.ConeGeometry(0.014, 0.06, 3), GOLD, x + Math.sin(a) * 0.075, y + Math.cos(a) * 0.075, z - 0.002, 0, 0, -a, 1, 1, 0.3);
        }
        addGlow(p.frame, new THREE.BoxGeometry(0.006, 0.12, 0.004), CRIMSON, x + 0.008, y - 0.01, z + 0.01, FAINT).rotation.z = 0.4;
        // Bloodied stripe down the bone tabard
        p.torso.add(clothGeo(0.06 * p.b, 0.74, { cols: 2, rows: 5, folds: 1, depth: 0.006, flare: 0.25, tatter: 0.45, seed: 61, curl: -0.02 }), PAL.crimson, 0, 1.055, p.tabardZ + 0.01);
        // A broken sun medallion on a chain at the belt
        for (let i = 0; i < 4; i++) band(p.torso, 0.012, 0.004, 0.16 * p.b, 1.02 - i * 0.022, 0.12 * p.b, GOLD, 0, i * 1.2, 0, 6);
        p.torso.add(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 8, 1, false, 0, Math.PI * 1.4), GOLD, 0.16 * p.b, 0.92, 0.125 * p.b, Math.PI / 2, 0, 0);
        // Gold-trimmed gauntlet cuffs and knee cops
        for (const ak of [p.armR, p.armL]) band(ak, 0.1, 0.008, 0, -0.505, 0, GOLD, Math.PI / 2, 0, 0, 8);
        for (const lk of [p.legR, p.legL]) rivet(lk, 0, -0.5, 0.11, GOLD, 0.016);
        // Old blood darkening the lower greaves
        for (const lk of [p.legR, p.legL]) lk.add(prismGeo(0.072, 0.12, 8, 1.15), mtl(PALE, -0.45), 0, -0.86, 0);
        // Tarnish streaks on the breastplate
        for (const [a, yy] of [[0.5, 1.3], [-0.6, 1.24]] as const) {
          const [sx, sy, sz] = p.onChest(a, yy, 0.006);
          cbox(p.torso, 0.012, 0.16, 0.006, sx, sy, sz, mtl(PALE, -0.3), 0, p.chestYaw(a), 0.05);
        }
      },
    }),
  portrait: { from: 0.28, to: 1.04, yaw: 0.42, faction: 'blood' },
};
