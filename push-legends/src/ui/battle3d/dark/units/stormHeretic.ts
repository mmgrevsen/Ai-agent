import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { type K, shade, type V } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { capGeo, cbox, frustumGeo, metal, prismGeo, ragGeo } from '../parts';
import { boltGeo, chain, halo, jag, robeLegs, sleeveArm, sparkGeo } from './_casters';
import { armBase, band, chestZ, glow, type GlowPart, gouge, hoop, HR, HY, hood, Hunter, latheArc, mantle, ragGeoN, rod, shell, strap, torsoBase } from './_hunters';
import type { UnitDef } from './types';

/**
 * The Storm Heretic (card: storm_adept, epic). A hunched, heavy-shouldered heretic in a deep slate
 * hood and storm-grey robes, bound in the chains of the order he betrayed: an iron penance collar,
 * a crude riveted breastplate, a layered iron pauldron, a broken shackle on his free wrist. His
 * lightning rod is a black iron staff wound with copper, ending in three hooked prongs that hold a
 * caged storm; pale-blue arcs jump between the prongs and crawl along his chains.
 */
const COPPER = metal(shade(PAL.gold, -0.2), 0.85);
const C = {
  hood: '#262a3a',
  hoodEdge: '#1a1d29',
  robe: '#2c3040',
  outer: '#1c1f2b',
  hem: shade(PAL.ash, -0.3),
  iron: PAL.iron,
  ironDark: PAL.blackSteel,
  ironHi: PAL.gunmetal,
  chain: PAL.gunmetal,
  leather: PAL.leatherDark,
  wrap: PAL.boneDark,
  copper: COPPER,
  glow: PAL.storm,
  core: '#eef4ff',
};

/** Deep hood, a riveted iron penance band across the brow, two pale eyes in the shadow. */
function hoodedHead(h: Hunter): number {
  const k = h.head;
  const r = HR;
  const top = hood(k, { cloth: C.hood, edge: C.hoodEdge, open: 0.72, tail: 0.35, size: 1.14, forward: 0.4, faceZ: -0.05, overhang: 0.5, wrap: C.hoodEdge });
  // Penance band: an iron strap across the brow, riveted, with a hanging chain at each side
  k.add(new THREE.CylinderGeometry(r * 1.2, r * 1.22, r * 0.26, 10, 1, true, -1.2, 2.4), C.iron, 0, HY + r * 0.42, r * 0.05);
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.45;
    k.add(new THREE.OctahedronGeometry(r * 0.07), C.ironHi, Math.sin(a) * r * 1.24, HY + r * 0.42, Math.cos(a) * r * 1.24 + r * 0.05);
  }
  gouge(k, r * 0.3, HY + r * 0.46, r * 1.25, r * 0.4, 0.2, 0.25);
  glow(h.headGroup, C.glow, 4.5, [
    [new THREE.BoxGeometry(r * 0.2, r * 0.07, 0.01), r * 0.26, HY + r * 0.02, r * 0.86, 0, 0.3, -0.15],
    [new THREE.BoxGeometry(r * 0.2, r * 0.07, 0.01), -r * 0.26, HY + r * 0.02, r * 0.86, 0, -0.3, 0.15],
  ]);
  return top;
}

/** Layered iron pauldron (left shoulder): a riveted dome over three lames, gouged. */
function ironPauldron(k: K, s: number, b: number): void {
  const x = s * 0.03;
  k.add(capGeo(0.155 * b, 1.3, 8, 4), C.iron, x, 0.02, 0, 0, 0, -s * 0.35, 1.05, 0.8, 1.05);
  for (let i = 0; i < 3; i++) {
    const y = -0.05 - i * 0.05;
    const rr = (0.165 - i * 0.01) * b;
    k.add(latheArc([[rr, y - 0.05], [rr * 0.95, y + 0.02]], 8, -Math.PI * 0.8, Math.PI * 1.6), i % 2 ? C.ironDark : C.iron, x + s * (0.02 + i * 0.012), 0, 0, 0, 0, -s * (0.35 + i * 0.05), 1, 1, 1);
  }
  for (let i = 0; i < 5; i++) {
    const a = -1.2 + i * 0.6;
    k.add(new THREE.OctahedronGeometry(0.012), C.ironHi, x + Math.sin(a) * 0.15 * b * s, 0.02, Math.cos(a) * 0.15 * b);
  }
  hoop(k, 0.06, 0.012, x + s * 0.08, 0.08, 0.03, C.ironHi, 0.3, 0, -s * 0.7, 6);
  gouge(k, x + s * 0.07, 0.06, 0.11, 0.09, 0.5, 0.5);
  gouge(k, x + s * 0.12, -0.04, 0.09, 0.07, -0.6, 0.7);
}

/**
 * Lightning rod: black iron shaft wound with copper, an iron collar, three hooked prongs around a
 * caged storm core; arcs leap between the prongs and the core (on a spinner) and down the shaft.
 */
function lightningRod(h: Hunter): void {
  const s = h.kit(h.handR, 0, 0, 0.0, 0.9);
  const k = s.k;
  k.add(prismGeo(0.021, 1.78, 6, 0.85), C.ironDark, 0, 0.12, 0);
  // Copper windings, iron bands, a grip of leather and an iron spike at the foot
  for (const y of [0.42, 0.5, 0.58, 0.66]) band(k, 0.024, 0.03, 0, y, 0, C.copper, 0, 0, 0, 6);
  for (const y of [-0.3, 0.25]) band(k, 0.026, 0.035, 0, y, 0, C.iron, 0, 0, 0, 6);
  k.add(prismGeo(0.025, 0.22, 6), C.leather, 0, 0.0, 0);
  k.add(new THREE.ConeGeometry(0.024, 0.18, 4), C.ironHi, 0, -0.85, 0, Math.PI, 0, 0);
  k.add(ragGeoN(0.04, 0.26, 9, 1, 3), C.wrap, 0.02, 0.74, 0.02, 0, 0.6, 0.1);
  // Collar and three hooked prongs
  const hy = 1.0;
  k.add(frustumGeo(0.07, 0.07, 0.07, 1.25), C.iron, 0, hy - 0.02, 0, 0, Math.PI / 4, 0);
  const tips: V[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const pts: V[] = [
      [cx * 0.03, hy + 0.02, cz * 0.03],
      [cx * 0.1, hy + 0.12, cz * 0.1],
      [cx * 0.1, hy + 0.27, cz * 0.1],
      [cx * 0.04, hy + 0.38, cz * 0.04],
    ];
    k.curve(pts, 0.016, 0.005, i ? C.ironDark : C.ironHi, 5);
    band(k, 0.019, 0.03, cx * 0.1, hy + 0.17, cz * 0.1, C.copper, 0, 0, 0, 5);
    tips.push([cx * 0.04, hy + 0.38, cz * 0.04]);
  }
  // A short chain looped round the collar, a weight hanging from it
  chain(k, [[0.04, hy - 0.02, 0.04], [0.07, hy - 0.14, 0.05], [0.06, hy - 0.26, 0.05]], 0.035, C.chain, 0.005);
  k.add(new THREE.OctahedronGeometry(0.022, 0), C.iron, 0.06, hy - 0.3, 0.05);
  // The caged storm
  const cy = hy + 0.2;
  glow(s.g, C.core, 6, [[new THREE.IcosahedronGeometry(0.035, 0), 0, cy, 0]]);
  halo(s.g, C.glow, 0.16, 0, cy, 0, 0.2, 1.1);
  halo(s.g, C.glow, 0.3, 0, cy, 0, 0.06, 1.2);
  const sp = h.kit(s.g, 0, 0, 0);
  h.rig.spinners.push(sp.g);
  const arcs: GlowPart[] = [];
  tips.forEach((tp, i) => arcs.push([boltGeo(jag([0, cy, 0], tp, 4, 0.03, 3 + i), 0.0045, 0.002), 0, 0, 0]));
  arcs.push([boltGeo(jag(tips[0]!, tips[1]!, 4, 0.03, 9), 0.0035), 0, 0, 0]);
  arcs.push([boltGeo(jag([0, cy, 0], [0.16, cy + 0.12, 0.05], 5, 0.04, 12), 0.004, 0.0015), 0, 0, 0]);
  arcs.push([boltGeo(jag([0, cy, 0], [-0.13, cy - 0.06, 0.1], 4, 0.035, 14), 0.0035, 0.0015), 0, 0, 0]);
  glow(sp.g, C.glow, 5, arcs);
  // Arc crawling down the copper windings
  glow(s.g, C.glow, 4, [[boltGeo(jag([0.03, hy - 0.05, 0.0], [0.028, 0.4, 0.01], 7, 0.03, 21), 0.003, 0.0015), 0, 0, 0]]);
}

/** Broken shackle on the free wrist with dangling links; sparks jumping between the fingers. */
function shackleHand(h: Hunter): void {
  const k = h.armL;
  k.add(new THREE.CylinderGeometry(0.058, 0.058, 0.06, 6), C.iron, 0, -0.53, 0);
  k.add(new THREE.OctahedronGeometry(0.014), C.ironHi, -0.06, -0.53, 0);
  chain(k, [[0.0, -0.56, 0.055], [0.01, -0.7, 0.07], [-0.01, -0.84, 0.06]], 0.035, C.chain, 0.0055);
  const parts: GlowPart[] = [
    [boltGeo(jag([0.02, -0.7, 0.05], [-0.03, -0.8, 0.03], 3, 0.02, 31), 0.003, 0.0015), 0, 0, 0],
    [boltGeo(jag([-0.02, -0.68, 0.05], [0.0, -0.84, 0.07], 4, 0.025, 33), 0.003, 0.0012), 0, 0, 0],
    [sparkGeo(0.01), 0.0, -0.84, 0.07],
  ];
  glow(h.rig.armL!, C.glow, 4.5, parts);
  halo(h.rig.armL!, C.glow, 0.08, 0, -0.76, 0.05, 0.12);
}

function heretic(): Rig {
  const h = new Hunter({ attack: 'cast', bulk: 1.08, tall: 1.0, neckZ: 0.055 });
  const b = h.b;
  const t = h.torso;
  torsoBase(t, b, { shirt: C.robe, trousers: C.robe, neck: C.hoodEdge });
  shell(t, b, C.robe, 0.94, 1.62, 0.02);
  // Crude riveted breastplate on leather straps, cracked by lightning
  shell(t, b, C.iron, 1.2, 1.55, 0.05, { phiStart: -1.0, phiLen: 2.0, seg: 6 });
  t.add(frustumGeo(0.025, 0.3, 0.025, 0.7), C.ironHi, 0, 1.37, chestZ(b, 1.37, 0.065), -0.1, 0, 0);
  for (const sx of [-1, 1]) for (const y of [1.25, 1.38, 1.5]) t.add(new THREE.OctahedronGeometry(0.012), C.ironHi, sx * 0.14, y, chestZ(b, y, 0.03));
  gouge(t, 0.08, 1.45, chestZ(b, 1.45, 0.062), 0.1, 0.6, 0.4);
  gouge(t, -0.07, 1.3, chestZ(b, 1.3, 0.06), 0.08, -0.4, -0.4);
  t.add(new THREE.SphereGeometry(0.05, 6, 4), shade(C.ironDark, -0.4), 0.06, 1.33, chestZ(b, 1.33, 0.05), 0, 0, 0, 1, 1, 0.3);
  for (const sx of [-1, 1]) strap(t, [sx * 0.17, 1.52, 0.02], [sx * 0.19, 1.22, 0.04], 0.035, 0.012, C.leather);
  // Leather belt over a tattered outer robe panel, and a front tabard of storm-grey cloth
  shell(t, b, C.leather, 1.0, 1.1, 0.05);
  cbox(t, 0.075, 0.065, 0.02, 0, 1.05, chestZ(b, 1.05, 0.07), C.iron);
  t.add(ragGeo(0.2, 0.7, { folds: 2, depth: 0.025, flare: 0.25, tatter: 0.25, seed: 61 }), C.outer, 0, 1.03, chestZ(b, 1.03, 0.065));
  // Penance collar (heavy iron ring) with a chain hanging down the chest and across the body
  t.add(new THREE.CylinderGeometry(0.15, 0.17, 0.08, 8), C.iron, 0, 1.62, 0.0);
  hoop(t, 0.16, 0.014, 0, 1.66, 0.0, C.ironHi, Math.PI / 2, 0, 0, 8);
  chain(t, [[0.02, 1.6, chestZ(b, 1.6, 0.08)], [0.0, 1.5, chestZ(b, 1.5, 0.09)], [-0.06, 1.4, chestZ(b, 1.4, 0.1)]], 0.04, C.chain, 0.007);
  chain(
    t,
    [
      [0.21, 1.5, 0.08],
      [0.12, 1.32, chestZ(b, 1.32, 0.085)],
      [-0.04, 1.16, chestZ(b, 1.16, 0.075)],
      [-0.2, 1.06, 0.1],
      [-0.23, 0.9, 0.06],
    ],
    0.04,
    C.chain,
    0.007,
  );
  chain(t, [[0.2, 1.5, -0.06], [0.0, 1.3, -0.15], [-0.2, 1.06, -0.1]], 0.045, C.chain, 0.007);
  t.add(new THREE.OctahedronGeometry(0.03, 0), C.iron, -0.23, 0.86, 0.06, 0, 0, 0, 1, 1.3, 1);
  glow(h.frame, C.glow, 3, [
    [boltGeo(jag([0.12, 1.33, chestZ(b, 1.33, 0.1)], [-0.02, 1.17, chestZ(b, 1.17, 0.095)], 5, 0.025, 41), 0.003, 0.0015), 0, 0, 0],
    [boltGeo(jag([0.05, 1.52, chestZ(b, 1.52, 0.075)], [-0.03, 1.42, chestZ(b, 1.42, 0.075)], 3, 0.015, 43), 0.0028), 0, 0, 0],
  ]);
  // Hooded short cape over the shoulders
  mantle(t, b, C.hood, { bottom: 1.26, width: 0.37, tatter: 0.14, seed: 63, seg: 10 });

  const top = hoodedHead(h);

  robeLegs(h, { inner: C.robe, outer: C.outer, boot: C.leather, hem: C.hem, flare: 0.33, tatter: 0.16, seed: 67, outerGap: 0.55, lift: 0.08, innerGap: 0.14 });
  // Iron-shod boots with bone-white bindings glimpsed under the robe
  for (const s of [-1, 1]) {
    const k = h.leg(s);
    k.add(frustumGeo(0.105, 0.04, 0.12, 0.9), C.iron, 0, -0.93, 0.13);
    band(k, 0.066, 0.03, 0, -0.82, 0.03, C.wrap, 0.05);
  }

  // Right arm: robe sleeve rolled back, iron bracer, copper-wired glove
  armBase(h.armR, 1, b, { sleeve: C.robe, glove: C.leather, forearm: C.leather, cuff: 1.25 });
  h.armR.add(latheArc([[0.12, -0.32], [0.1, -0.22], [0.085, 0.02]], 8, 0, Math.PI * 2, 0.08, 71), C.hood, 0.005, 0, 0);
  h.armR.add(prismGeo(0.056, 0.17, 6, 1.15), C.iron, 0, -0.47, 0);
  for (const y of [-0.42, -0.5]) band(h.armR, 0.06, 0.012, 0, y, 0, C.copper, 0, 0, 0, 6);
  // Left arm: wide torn sleeve over the shackled wrist, heavy pauldron
  sleeveArm(h.armL, -1, b, { sleeve: C.robe, glove: C.leather, bell: 0.15, len: 0.42, tatter: 0.14, seed: 73 });
  ironPauldron(h.armL, -1, b);
  // Chains wound round the upper arm
  for (const y of [-0.16, -0.22]) hoop(h.armL, 0.07, 0.008, 0, y, 0, C.chain, Math.PI / 2 + 0.1, 0, 0, 7);

  lightningRod(h);
  shackleHand(h);

  // Back: a torn storm-grey cloak dragged behind, with a chain across it
  const ck = h.cape(0, 1.58, -0.18);
  ck.add(ragGeo(0.56, 1.3, { folds: 3, depth: 0.05, flare: 0.35, tatter: 0.25, seed: 77, curl: 0.12 }), C.outer, 0, 0, 0, 0.06, 0, 0);
  ck.add(ragGeo(0.5, 0.3, { folds: 3, depth: 0.03, flare: 0.25, tatter: 0.3, seed: 78 }), C.hem, 0, -1.0, -0.06, 0.12, 0, 0);
  chain(ck, [[-0.22, -0.05, 0.03], [0.0, -0.18, -0.01], [0.22, -0.08, 0.03]], 0.045, C.chain, 0.007);
  rod(ck, [-0.2, -0.02, 0.02], [0.2, -0.02, 0.02], 0.012, C.iron, 4);
  return h.finish(top + 0.02);
}

export const stormHeretic: UnitDef = {
  build: heretic,
  portrait: {
    pose: (rig) => {
      rig.armR!.rotation.set(-1.15, 0, 0.2);
      rig.armL!.rotation.set(-0.7, 0, -0.3);
      rig.body.rotation.y = 0.1;
      rig.legs[0]!.rotation.x = 0.18;
      rig.legs[1]!.rotation.x = -0.12;
      rig.neck!.rotation.set(0.18, -0.1, 0);
    },
    from: 0.34,
    to: 1.04,
    yaw: 0.42,
    faction: 'storm',
  },
};
