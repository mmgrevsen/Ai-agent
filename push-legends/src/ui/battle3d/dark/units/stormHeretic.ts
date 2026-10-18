import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { shade, type V } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { cbox, frustumGeo, metal, prismGeo } from '../parts';
import { boltGeo, capelet, chain, CPLATE, CPLATE_DK, CPLATE_HI, halo, jag, robeLegs, sigil, skull, sleeveArm, sparkGeo, spikedPauldron, visorHood } from './_casters';
import { armBase, band, capeGeo, chestZ, glow, type GlowPart, gouge, heavyCape, hoop, HR, HY, Hunter, latheArc, onTorso, plateForearm, ragGeoN, rod, shell, strap, torsoBase, torsoLine } from './_hunters';
import type { UnitDef } from './types';

/**
 * The Storm Heretic (card: storm_adept, epic). A heavy-shouldered heretic in a deep slate hood over
 * a riveted iron penance visor (two pale-blue slits), bound in the chains of the order he betrayed:
 * an iron penance collar, a blackened breastplate branded with a glowing storm sigil, spiked iron
 * pauldrons with chains wound over them, a skull hung at the belt, a broken shackle on his free
 * wrist. His lightning rod is a black iron staff wound with copper, ending in three hooked prongs
 * round a caged storm; pale-blue arcs jump between the prongs and crawl along his chains.
 */
const COPPER = metal(shade(PAL.gold, -0.2), 0.85);
const C = {
  hood: '#323848',
  hoodEdge: '#1e222e',
  robe: '#3c4253',
  outer: '#282c3a',
  hem: shade(PAL.ash, -0.3),
  plate: CPLATE,
  plateHi: CPLATE_HI,
  plateDk: CPLATE_DK,
  iron: PAL.iron,
  ironDark: PAL.blackSteel,
  ironHi: PAL.gunmetal,
  chain: PAL.gunmetal,
  leather: PAL.leatherDark,
  wrap: PAL.boneDark,
  bone: PAL.bone,
  copper: COPPER,
  glow: PAL.storm,
  core: '#f2f6ff',
};

/** Hood over a riveted iron penance visor with a band across the brow and pale eyes. */
function hoodedHead(h: Hunter): number {
  const k = h.head;
  const r = HR;
  const { top } = visorHood(h, { cloth: C.hood, edge: C.hoodEdge, plate: C.ironDark, hi: C.ironHi, trim: C.copper, eye: C.glow, eyeLum: 7, keel: 0.45, size: 1.16, tail: 0.35, open: 0.72, forward: 0.38, peak: 0.45, hook: 0.15 });
  // Penance band: a riveted iron strap round the hood at the brow
  k.add(new THREE.CylinderGeometry(r * 1.27, r * 1.3, r * 0.24, 12, 1, true, -1.25, 2.5), C.iron, 0, HY + r * 0.62, r * 0.05);
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.5;
    k.add(new THREE.OctahedronGeometry(r * 0.07), C.ironHi, Math.sin(a) * r * 1.31, HY + r * 0.62, Math.cos(a) * r * 1.31 + r * 0.05);
  }
  gouge(k, r * 0.4, HY + r * 0.66, r * 1.3, r * 0.4, 0.2, 0.35);
  return top;
}

/**
 * Lightning rod: black iron shaft wound with copper, an iron collar, three hooked prongs around a
 * caged storm core; arcs leap between the prongs and the core (on a spinner) and down the shaft.
 */
function lightningRod(h: Hunter): void {
  const s = h.kit(h.handR, 0, 0, 0.0, 0.9);
  const k = s.k;
  k.add(prismGeo(0.021, 1.8, 6, 0.85), C.ironDark, 0, 0.13, 0);
  for (const y of [0.42, 0.5, 0.58, 0.66]) band(k, 0.024, 0.03, 0, y, 0, C.copper, 0, 0, 0, 6);
  for (const y of [-0.3, 0.25]) band(k, 0.026, 0.035, 0, y, 0, C.iron, 0, 0, 0, 6);
  k.add(prismGeo(0.025, 0.22, 6), C.leather, 0, 0.0, 0);
  k.add(new THREE.ConeGeometry(0.024, 0.18, 4), C.ironHi, 0, -0.85, 0, Math.PI, 0, 0);
  k.add(ragGeoN(0.04, 0.26, 9, 1, 3), C.wrap, 0.02, 0.74, 0.02, 0, 0.6, 0.1);
  // Collar and three hooked prongs
  const hy = 1.02;
  k.add(frustumGeo(0.07, 0.07, 0.07, 1.25), C.iron, 0, hy - 0.02, 0, 0, Math.PI / 4, 0);
  const tips: V[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const pts: V[] = [
      [cx * 0.03, hy + 0.02, cz * 0.03],
      [cx * 0.11, hy + 0.12, cz * 0.11],
      [cx * 0.11, hy + 0.28, cz * 0.11],
      [cx * 0.04, hy + 0.4, cz * 0.04],
    ];
    k.curve(pts, 0.017, 0.005, i ? C.ironDark : C.ironHi, 5);
    band(k, 0.02, 0.03, cx * 0.11, hy + 0.18, cz * 0.11, C.copper, 0, 0, 0, 5);
    tips.push([cx * 0.04, hy + 0.4, cz * 0.04]);
  }
  k.add(new THREE.OctahedronGeometry(0.022, 0), C.iron, 0.06, hy - 0.2, 0.05);
  rod(k, [0.04, hy - 0.02, 0.04], [0.06, hy - 0.18, 0.05], 0.004, C.chain, 4);
  // The caged storm
  const cy = hy + 0.2;
  glow(s.g, C.core, 5, [[new THREE.IcosahedronGeometry(0.04, 0), 0, cy, 0]]);
  halo(s.g, C.glow, 0.16, 0, cy, 0, 0.18, 1.1);
  const sp = h.kit(s.g, 0, 0, 0);
  h.rig.spinners.push(sp.g);
  const arcs: GlowPart[] = [];
  tips.forEach((tp, i) => arcs.push([boltGeo(jag([0, cy, 0], tp, 4, 0.03, 3 + i), 0.005, 0.002), 0, 0, 0]));
  arcs.push([boltGeo(jag(tips[0]!, tips[1]!, 4, 0.03, 9), 0.004), 0, 0, 0]);
  arcs.push([boltGeo(jag([0, cy, 0], [0.2, cy + 0.14, 0.05], 5, 0.045, 12), 0.0045, 0.0015), 0, 0, 0]);
  arcs.push([boltGeo(jag([0, cy, 0], [-0.17, cy - 0.06, 0.12], 5, 0.04, 14), 0.004, 0.0015), 0, 0, 0]);
  arcs.push([boltGeo(jag([0, cy, 0], [-0.05, cy + 0.26, -0.1], 4, 0.04, 16), 0.004, 0.0015), 0, 0, 0]);
  glow(sp.g, C.glow, 4.5, arcs);
  // Arc crawling down the copper windings
  glow(s.g, C.glow, 3.5, [[boltGeo(jag([0.03, hy - 0.05, 0.0], [0.028, 0.4, 0.01], 7, 0.03, 21), 0.0035, 0.0015), 0, 0, 0]]);
}

/** Broken shackle on the free wrist with dangling links; sparks jumping between the fingers. */
function shackleHand(h: Hunter): void {
  const k = h.armL;
  k.add(new THREE.CylinderGeometry(0.06, 0.06, 0.065, 8), C.iron, 0, -0.53, 0);
  k.add(new THREE.OctahedronGeometry(0.014), C.ironHi, -0.062, -0.53, 0);
  chain(k, [[0.0, -0.56, 0.058], [0.01, -0.7, 0.07], [-0.01, -0.82, 0.06]], 0.06, C.chain, 0.006);
  const parts: GlowPart[] = [
    [boltGeo(jag([0.02, -0.7, 0.05], [-0.05, -0.84, 0.03], 4, 0.025, 31), 0.0035, 0.0015), 0, 0, 0],
    [boltGeo(jag([-0.02, -0.68, 0.05], [0.03, -0.88, 0.08], 4, 0.03, 33), 0.0035, 0.0012), 0, 0, 0],
    [sparkGeo(0.011), 0.0, -0.86, 0.07],
  ];
  glow(h.rig.armL!, C.glow, 4, parts);
}

function heretic(): Rig {
  const h = new Hunter({ attack: 'cast', bulk: 1.1, tall: 1.0, neckZ: 0.055 });
  const b = h.b;
  const t = h.torso;
  torsoBase(t, b, { shirt: C.robe, trousers: C.robe, neck: C.hoodEdge });
  shell(t, b, C.robe, 0.94, 1.62, 0.02);
  // Blackened breastplate on leather straps: riveted, gouged, branded with a storm sigil
  const g = 0.05;
  shell(t, b, C.plate, 1.2, 1.56, g, { phiStart: -1.25, phiLen: 2.5, seg: 12 });
  t.add(frustumGeo(0.026, 0.32, 0.026, 0.5, 0.6), C.plateHi, 0, 1.37, onTorso(b, 0, 1.37, g)[2] + 0.002, -0.08, 0, 0);
  torsoLine(t, b, [[-0.18, 1.25], [-0.08, 1.22], [0, 1.2], [0.08, 1.22], [0.18, 1.25]], g, 0.005, C.copper);
  for (const sx of [-1, 1]) for (const y of [1.26, 1.4, 1.52]) t.add(new THREE.OctahedronGeometry(0.012), C.ironHi, sx * 0.16, y, onTorso(b, sx * 0.16, y, g)[2]);
  gouge(t, 0.11, 1.48, onTorso(b, 0.11, 1.48, g)[2] + 0.002, 0.09, 0.6, 0.45);
  gouge(t, -0.1, 1.27, onTorso(b, -0.1, 1.27, g)[2] + 0.002, 0.08, -0.4, -0.45);
  const sz = onTorso(b, 0, 1.38, g)[2] + 0.01;
  // Storm sigil: a forked bolt through a broken ring (an inverted holy symbol)
  sigil(
    h.frame,
    C.glow,
    4,
    [
      [0.015, 0.085, -0.02, 0.01],
      [-0.02, 0.01, 0.02, 0.0],
      [0.02, 0.0, -0.01, -0.085],
      [0.02, 0.0, 0.05, -0.05],
      [-0.065, 0.04, -0.065, -0.03],
      [0.065, 0.04, 0.065, -0.03],
      [-0.065, 0.04, -0.035, 0.07],
      [0.065, -0.03, 0.035, -0.07],
    ],
    0.008,
    0,
    1.38,
    sz,
    -0.12,
  );
  for (const sx of [-1, 1]) strap(t, [sx * 0.17, 1.55, 0.02], [sx * 0.2, 1.22, 0.05], 0.035, 0.012, C.leather);
  // Belt with an iron buckle, a torn front panel, a skull hung from a short chain at the hip
  shell(t, b, C.leather, 1.0, 1.1, 0.05);
  cbox(t, 0.075, 0.065, 0.02, 0, 1.05, chestZ(b, 1.05, 0.07), C.iron);
  t.add(capeGeo(0.2, 0.74, { folds: 2, depth: 0.025, flare: 0.25, tatter: 0.25, seed: 61, curl: -0.04, cols: 4, rows: 5 }), C.outer, 0, 1.03, chestZ(b, 1.03, 0.065));
  rod(t, [0.18, 1.04, 0.11], [0.2, 0.93, 0.13], 0.005, C.chain, 4);
  skull(t, 0.2, 0.87, 0.14, 0.045, C.bone, 0.15, 0.25);
  // Penance collar (heavy iron ring) and the chain of the order wound across the body
  t.add(new THREE.CylinderGeometry(0.15, 0.17, 0.08, 10), C.iron, 0, 1.62, 0.0);
  hoop(t, 0.16, 0.014, 0, 1.66, 0.0, C.ironHi, Math.PI / 2, 0, 0, 10);
  chain(
    t,
    [
      [0.22, 1.5, 0.08],
      [0.12, 1.3, chestZ(b, 1.3, 0.08)],
      [-0.04, 1.15, chestZ(b, 1.15, 0.075)],
      [-0.2, 1.06, 0.1],
    ],
    0.065,
    C.chain,
    0.008,
  );
  glow(h.frame, C.glow, 3, [[boltGeo(jag([0.12, 1.31, chestZ(b, 1.31, 0.1)], [-0.03, 1.16, chestZ(b, 1.16, 0.095)], 5, 0.025, 41), 0.0035, 0.0015), 0, 0, 0]]);
  // Hooded short cape over the shoulders
  capelet(t, b, C.hood, { bottom: 1.24, width: 0.38, gap: 0.9, tatter: 0.14, seed: 63, seg: 12 });

  const top = hoodedHead(h);

  robeLegs(h, { inner: C.robe, outer: C.outer, boot: C.leather, hem: C.hem, flare: 0.33, tatter: 0.16, seed: 67, outerGap: 0.55, lift: 0.08, innerGap: 0.14, seg: 9 });
  // Iron-shod boots glimpsed under the robe
  for (const s of [-1, 1]) h.leg(s).add(frustumGeo(0.105, 0.04, 0.12, 0.9), C.iron, 0, -0.93, 0.13);

  // Right arm: robe sleeve rolled back, black plate vambrace, copper-wired glove
  armBase(h.armR, 1, b, { sleeve: C.robe, glove: C.leather, forearm: C.leather, cuff: 1.25 });
  h.armR.add(latheArc([[0.12, -0.32], [0.1, -0.22], [0.085, 0.02]], 8, 0, Math.PI * 2, 0.08, 71), C.hood, 0.005, 0, 0);
  plateForearm(h.armR, 1, { plate: C.plate, hi: C.plateHi, trim: C.copper, spike: 0.1 });
  spikedPauldron(h.armR, 1, { r: 0.14, lames: 2, plate: C.iron, hi: C.ironHi, trim: C.copper, blades: [[0.2, 0.15, 0, -0.1]] });
  // Left arm: wide torn sleeve over the shackled wrist, a heavy spiked pauldron wound with chain
  sleeveArm(h.armL, -1, b, { sleeve: C.robe, glove: C.leather, bell: 0.15, len: 0.42, tatter: 0.14, seed: 73 });
  spikedPauldron(h.armL, -1, {
    r: 0.17,
    lames: 3,
    plate: C.iron,
    hi: C.ironHi,
    trim: C.copper,
    thorns: 3,
    blades: [
      [0.3, 0.1, 0.0, -0.15],
      [0.22, 0.2, 0.06, 0.3],
    ],
  });
  for (const y of [-0.17, -0.23]) hoop(h.armL, 0.075, 0.009, 0, y, 0, C.chain, Math.PI / 2 + 0.1, 0, 0, 6);

  lightningRod(h);
  shackleHand(h);

  // Back: a heavy torn storm-grey cloak, a chain across it
  const ck = h.cape(0, 1.58, -0.18);
  heavyCape(ck, 0.62, 1.38, C.outer, { seed: 77, inner: C.hoodEdge, tatter: 0.32 });
  ck.add(ragGeoN(0.5, 0.26, 78, 8, 1, 0.03), C.hem, 0, -1.1, -0.17, 0.12, 0, 0);
  rod(ck, [-0.22, -0.02, 0.03], [0.22, -0.02, 0.03], 0.013, C.iron, 5);
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
