import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { shade, taperTube, type V } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { cbox, frustumGeo, rune } from '../parts';
import { capelet, CPLATE, CPLATE_DK, CPLATE_HI, crackGeo, flameGeo, halo, helix, hemGlow, robeLegs, sigil, sleeveArm, sparkGeo, spikedPauldron, visorHood } from './_casters';
import { armBase, band, capeGeo, chestZ, glow, type GlowPart, gouge, heavyCape, Hunter, latheArc, mix, onTorso, plateForearm, ragGeoN, rod, shell, torsoBase, torsoLine } from './_hunters';
import type { UnitDef } from './types';

/**
 * The Ashen Herald (card: ember_mage, rare). A tall wraith-mage in layered black robes over a dark
 * crimson under-robe: a deep hood rising into a forward-hooked point over a pointed, scorched black
 * visor with two ember slits; glossy black plate (a gold-edged breastplate burnt with a glowing
 * ember sigil and heat cracks, a towering horned pauldron on the casting arm). Dark crimson and
 * orange fire spirals round his right gauntlet only and flares off the fist; burnt edicts and a
 * chained grimoire hang from the belt, a heavy tattered cloak drags behind.
 */
const C = {
  robe: '#352e2e',
  outer: '#262326',
  inner: mix(PAL.crimson, PAL.blood, 0.25),
  hem: shade(PAL.ash, -0.1),
  plate: CPLATE,
  plateHi: CPLATE_HI,
  plateDk: CPLATE_DK,
  gold: PAL.gold,
  iron: PAL.iron,
  leather: PAL.leatherDark,
  parchment: PAL.boneDark,
  // Fire: dark crimson outer flames, orange tongues, a hot core
  crimson: '#c3180f',
  fire: PAL.fire,
  ember: PAL.ember,
  core: '#ffc46b',
};

/**
 * Fire spiralling round the right gauntlet: crimson and orange strands coil from the elbow down past
 * the fist (on a spinner, so they crawl round the arm), widening into a vortex beyond the knuckles;
 * flame tongues burst outwards off the fist round a white-hot core, embers scatter.
 */
function fireHand(h: Hunter): void {
  const sp = h.kit(h.handR, 0, 0, 0.01);
  sp.g.scale.setScalar(1.25);
  h.rig.spinners.push(sp.g);
  const strands: GlowPart[] = [];
  for (const ph of [0, Math.PI]) strands.push([tube(helix(0.34, -0.12, 0.09, 0.055, 2.0, ph, 14), 0.026, 0.007), 0, 0, 0]);
  // Vortex flaring open beyond the fist
  strands.push([tube(helix(-0.06, -0.3, 0.06, 0.17, 0.9, 1.2, 9), 0.02, 0.003), 0, 0, 0]);
  glow(sp.g, C.crimson, 2.6, strands);
  glow(sp.g, C.fire, 3.2, [
    [tube(helix(0.26, -0.18, 0.075, 0.04, 1.7, Math.PI / 2, 14), 0.014, 0.003), 0, 0, 0],
    [tube(helix(-0.08, -0.32, 0.05, 0.14, 0.8, 4.2, 8), 0.012, 0.002), 0, 0, 0],
    [sparkGeo(0.018), 0.13, 0.12, 0.04],
    [sparkGeo(0.014), -0.12, 0.22, -0.05],
    [sparkGeo(0.016), 0.06, -0.26, 0.11],
    [sparkGeo(0.012), -0.15, -0.18, 0.02],
    [sparkGeo(0.011), 0.18, -0.08, -0.06],
  ]);
  // Static flames: tongues bursting outwards off the fist in every direction
  const fk = h.kit(h.handR, 0, -0.02, 0.01);
  fk.g.scale.setScalar(1.3);
  const tongues: GlowPart[] = [];
  const outer: GlowPart[] = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const up = i % 3 === 0 ? 0.6 : i % 3 === 1 ? -0.5 : 0.1;
    const dir: V = [Math.cos(a), up, Math.sin(a)];
    const l = Math.hypot(...dir);
    const d: V = [dir[0] / l, dir[1] / l, dir[2] / l];
    const p: V = [Math.cos(a) * 0.035, -0.07 + up * 0.03, 0.02 + Math.sin(a) * 0.035];
    (i % 2 ? outer : tongues).push([flameGeo(p, d, 0.15 + (i % 3) * 0.06, 0.03, 11 + i), 0, 0, 0]);
  }
  glow(fk.g, C.fire, 3, tongues);
  glow(fk.g, C.crimson, 2.4, outer);
  glow(fk.g, C.core, 4, [[new THREE.IcosahedronGeometry(0.05, 1), 0, -0.08, 0.035]]);
  halo(fk.g, C.ember, 0.12, 0, -0.07, 0.03, 0.08, 1.1);
}

/** A spiral strand of fire: a tapered tube through the helix points. */
function tube(pts: V[], r0: number, r1: number): THREE.BufferGeometry {
  return taperTube(pts, r0, r1, 4, Math.round(pts.length * 1.3));
}

function herald(): Rig {
  const h = new Hunter({ attack: 'cast', bulk: 1.0, tall: 1.04, neckZ: 0.03 });
  const b = h.b;
  const t = h.torso;
  torsoBase(t, b, { shirt: C.inner, trousers: C.robe, neck: C.outer });
  // Crimson under-robe on the chest, black outer robe open down the front
  shell(t, b, C.inner, 0.94, 1.6, 0.018);
  shell(t, b, C.outer, 0.94, 1.62, 0.04, { phiStart: 0.5, phiLen: Math.PI * 2 - 1.0, flare: 0.08 });
  // Glossy black breastplate: gold-edged, a raised keel, burnt with an ember sigil and heat cracks
  const g = 0.056;
  shell(t, b, C.plate, 1.22, 1.6, g, { phiStart: -1.3, phiLen: 2.6, seg: 14 });
  t.add(frustumGeo(0.028, 0.32, 0.03, 0.4, 0.6), C.plateHi, 0, 1.4, onTorso(b, 0, 1.4, g)[2] + 0.004, -0.06, 0, 0);
  torsoLine(t, b, [[-0.17, 1.27], [-0.08, 1.23], [0, 1.2], [0.08, 1.23], [0.17, 1.27]], g, 0.005, C.gold);
  torsoLine(t, b, [[-0.16, 1.57], [-0.1, 1.5], [-0.03, 1.47]], g, 0.004, C.gold);
  torsoLine(t, b, [[0.16, 1.57], [0.1, 1.5], [0.03, 1.47]], g, 0.004, C.gold);
  shell(t, b, C.plateHi, 1.14, 1.205, g - 0.006, { seg: 10, phiStart: -1.2, phiLen: 2.4 });
  gouge(t, 0.1, 1.48, onTorso(b, 0.1, 1.48, g)[2] + 0.002, 0.08, 0.5, 0.3);
  gouge(t, -0.11, 1.34, onTorso(b, -0.11, 1.34, g)[2] + 0.002, 0.07, -0.3, -0.4);
  const sz = onTorso(b, 0, 1.38, g)[2] + 0.009;
  sigil(
    h.frame,
    C.fire,
    5,
    [
      [0, -0.085, 0, 0.075],
      [-0.055, -0.03, -0.035, 0.055],
      [0.055, -0.03, 0.035, 0.055],
      [-0.055, -0.03, 0.055, -0.03],
      [-0.03, 0.01, 0, 0.035],
      [0.03, 0.01, 0, 0.035],
    ],
    0.009,
    0,
    1.38,
    sz,
    -0.15,
  );
  glow(h.frame, C.crimson, 3, [
    [crackGeo([0.03, 1.32, chestZ(b, 1.32, g + 0.008)], [0.12, 1.26, chestZ(b, 1.26, g + 0.002)], 5, 0.004), 0, 0, 0],
    [crackGeo([-0.03, 1.46, chestZ(b, 1.46, g + 0.008)], [-0.13, 1.53, chestZ(b, 1.53, g)], 9, 0.0035, 3), 0, 0, 0],
  ]);
  // Gorget of black plate with a jagged top edge, gold rim
  t.add(latheArc([[0.13, 1.56], [0.12, 1.64], [0.105, 1.72]], 12, 0, Math.PI * 2, -0.04, 5), C.plate, 0, 0, 0.01, 0, 0, 0, 1, 1, 0.9);
  // Belt, iron buckle, burnt parchment edicts and a long crimson tabard
  shell(t, b, C.leather, 1.02, 1.1, 0.05);
  cbox(t, 0.07, 0.07, 0.02, 0, 1.06, chestZ(b, 1.06, 0.065), C.gold);
  t.add(capeGeo(0.16, 0.86, { folds: 2, depth: 0.02, flare: 0.3, tatter: 0.22, seed: 13, curl: -0.04, cols: 4, rows: 5 }), C.inner, 0, 1.04, chestZ(b, 1.04, 0.06));
  for (const [x, len, rz, seed] of [
    [0.13, 0.26, 0.1, 3],
    [-0.11, 0.2, -0.12, 6],
    [0.19, 0.16, 0.25, 9],
  ] as const)
    t.add(ragGeoN(0.055, len, seed, 2, 3), C.parchment, x, 1.04, chestZ(b, 1.04, 0.075), 0.08, 0, rz);
  for (const x of [0.13, -0.11, 0.19]) cbox(t, 0.025, 0.025, 0.015, x, 1.04, chestZ(b, 1.04, 0.08), C.inner);
  // Grimoire chained to the left hip, iron-cornered, a smouldering sigil on the cover
  const gx = -0.25;
  rod(t, [-0.17, 1.05, 0.08], [-0.24, 0.92, 0.09], 0.006, C.iron, 4);
  cbox(t, 0.15, 0.19, 0.05, gx, 0.82, 0.07, C.leather, 0.05, -0.45, -0.08);
  cbox(t, 0.155, 0.17, 0.04, gx - 0.008, 0.82, 0.07, C.parchment, 0.05, -0.45, -0.08);
  for (const [dx, dy] of [[-0.065, 0.085], [0.065, 0.085], [-0.065, -0.085], [0.065, -0.085]] as const) cbox(t, 0.03, 0.03, 0.055, gx + dx * 0.9, 0.82 + dy, 0.07 - dx * 0.4, C.iron, 0.05, -0.45, -0.08);
  rune(h.frame, C.fire, gx + 0.012, 0.82, 0.098, 0.035, 0.1, 2.5).rotation.y = -0.45;
  // Ragged black mantle, and a high collar flaring up behind the hood in two points
  capelet(t, b, C.outer, { bottom: 1.28, width: 0.37, gap: 0.95, tatter: 0.14, seed: 21, seg: 12 });
  t.add(latheArc([[0.17, 1.58], [0.19, 1.74], [0.24, 1.92]], 10, Math.PI * 0.6, Math.PI * 0.8, -0.1, 4), C.outer, 0, 0, -0.02, 0, 0, 0, 1, 1, 0.9);

  const { top } = visorHood(h, { cloth: C.outer, edge: shade(C.outer, 0.2), plate: C.plate, hi: C.plateHi, eye: C.ember, eyeLum: 7, keel: 0.6, peak: 0.95, hook: 0.5, size: 1.12, tail: 0.5 });

  robeLegs(h, { inner: C.robe, outer: C.outer, boot: C.leather, hem: C.hem, flare: 0.36, tatter: 0.16, seed: 17, outerGap: 0.5, seg: 9 });
  // The burnt hem still smoulders: a ragged ember seam along the outer robe
  hemGlow(h, C.ember, 3.2, { r: 0.36 * 1.11, y: -0.89, gap: 0.52, seed: 5, w: 0.007 });

  // Left arm: wide torn black sleeve, a lighter two-lame pauldron with one blade
  sleeveArm(h.armL, -1, b, { sleeve: C.outer, glove: C.leather, bell: 0.16, len: 0.52, tatter: 0.12, seed: 4 });
  spikedPauldron(h.armL, -1, { r: 0.13, lames: 2, plate: C.plate, hi: C.plateHi, trim: C.gold, blades: [[0.2, 0.25, 0.0, -0.15]] });
  for (let i = 0; i < 3; i++) h.armL.add(new THREE.ConeGeometry(0.008, 0.05, 4), C.iron, 0.012 - i * 0.012, -0.745, 0.03 + i * 0.006, 0.25, 0, 0);
  // Right (casting) arm: black plate vambrace and gauntlet, a towering horned pauldron
  const k = h.armR;
  armBase(k, 1, b, { sleeve: C.outer, glove: C.plate, forearm: C.leather, cuff: 1.35 });
  k.add(latheArc([[0.12, -0.3], [0.1, -0.2], [0.085, 0.0]], 10, 0, Math.PI * 2, 0.08, 7), C.outer, 0.005, 0, 0);
  plateForearm(k, 1, { plate: C.plate, hi: C.plateHi, trim: C.gold, spike: 0.12 });
  for (let i = 0; i < 4; i++) k.add(new THREE.ConeGeometry(0.009, 0.06, 4), C.plateHi, 0.022 - i * 0.015, -0.75, 0.035, 0.3, 0, 0);
  spikedPauldron(k, 1, {
    r: 0.165,
    lames: 3,
    plate: C.plate,
    hi: C.plateHi,
    trim: C.gold,
    thorns: 3,
    blades: [
      [0.36, 0.3, 0.0, -0.1],
      [0.26, 0.42, 0.05, -0.45],
      [0.2, 0.5, 0.07, 0.3],
    ],
  });
  gouge(k, 0.09, 0.06, 0.12, 0.08, 0.7, 0.4);
  glow(h.rig.armR!, C.crimson, 3, [
    [crackGeo([0.05, 0.13, 0.08], [0.15, 0.03, 0.1], 3, 0.0045), 0, 0, 0],
    [crackGeo([0.15, 0.03, 0.1], [0.19, -0.08, 0.03], 8, 0.004), 0, 0, 0],
    [crackGeo([0.03, -0.39, 0.06], [0.04, -0.56, 0.05], 21, 0.004), 0, 0, 0],
  ]);
  fireHand(h);

  // Heavy layered cloak dragging behind, a scorched band along the torn hem
  const ck = h.cape(0, 1.6, -0.17);
  heavyCape(ck, 0.62, 1.5, C.outer, { seed: 33, inner: shade(C.inner, -0.35), tatter: 0.36 });
  ck.add(ragGeoN(0.5, 0.26, 34, 8, 1, 0.03), C.hem, 0, -1.2, -0.17, 0.1, 0, 0);
  rod(ck, [-0.2, -0.02, 0.03], [0.2, -0.02, 0.03], 0.013, C.gold, 5);
  band(ck, 0.03, 0.02, 0, -0.02, 0.05, C.plateHi, Math.PI / 2, 0, 0, 6);

  const rig = h.finish(top);
  rig.height = Math.max(rig.height, 2.2);
  return rig;
}

export const ashenHerald: UnitDef = {
  build: herald,
  portrait: {
    pose: (rig) => {
      rig.armR!.rotation.set(-2.35, 0.2, 0.42);
      rig.armL!.rotation.set(-0.2, 0, -0.2);
      rig.body.rotation.y = -0.1;
      rig.legs[0]!.rotation.x = 0.15;
      rig.legs[1]!.rotation.x = -0.12;
      rig.neck!.rotation.set(0.15, 0.1, 0);
    },
    from: 0.36,
    to: 1.04,
    yaw: 0.4,
    faction: 'ash',
  },
};
