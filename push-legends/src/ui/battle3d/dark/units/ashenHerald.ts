import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { K, shade, taperTube, type V } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { capGeo, cbox, frustumGeo, metal, prismGeo, ragGeo, rune } from '../parts';
import { crackGeo, flameGeo, halo, helix, robeLegs, sleeveArm, sparkGeo, chain } from './_casters';
import { armBase, band, chestZ, glow, type GlowPart, gouge, HR, HY, hood, Hunter, latheArc, mantle, mix, ragGeoN, rod, shell, SHADOW, torsoBase } from './_hunters';
import type { UnitDef } from './types';

/**
 * The Ashen Herald (card: ember_mage, rare). A tall, sinister mage in layered black robes with a
 * burnt grey hem and a dark crimson under-robe, scorched black-steel plates (a cracked breastplate,
 * a heavy layered pauldron on the casting arm), a deep pointed cowl over a scorched iron jaw mask
 * with two ember eyes. Dark crimson and orange fire spirals around his right gauntlet only; burnt
 * parchment edicts hang from the belt and a chained grimoire swings at his hip.
 */
const C = {
  robe: shade(PAL.charcoal, 0.06),
  outer: mix(PAL.black, PAL.charcoal, 0.4),
  inner: mix(PAL.crimson, PAL.charcoal, 0.35),
  hem: shade(PAL.ash, -0.25),
  plate: metal(mix(PAL.blackSteel, PAL.leatherDark, 0.25), 0.6),
  plateHi: PAL.gunmetal,
  iron: PAL.iron,
  scorch: shade(PAL.ash, -0.45),
  leather: PAL.leatherDark,
  parchment: PAL.boneDark,
  bone: PAL.bone,
  // Fire: dark crimson outer flames, orange tongues, a hot core
  crimson: '#c01d16',
  fire: PAL.fire,
  core: '#ffc46b',
};

/** Deep pointed cowl, scorched iron jaw mask with breathing slots, two narrow ember eyes. */
function cowlHead(h: Hunter): number {
  const k = h.head;
  const r = HR;
  const top = hood(k, { cloth: C.outer, edge: shade(C.outer, 0.12), open: 0.78, tail: 0.75, size: 1.08, forward: 0.28, faceZ: 0.02, overhang: 0.42 });
  // Pointed peak: the cowl rises into a stiff, slightly forward-hooked point
  k.curve(
    [
      [0, top - r * 0.35, -r * 0.1],
      [0, top + r * 0.25, -r * 0.05],
      [0, top + r * 0.62, r * 0.18],
    ],
    r * 0.42,
    0.006,
    C.outer,
    6,
  );
  // Jaw mask: curved scorched iron plate over the lower face, raised centre ridge, vertical slots
  k.add(new THREE.SphereGeometry(r * 0.98, 8, 4, Math.PI / 2 - 0.95, 1.9, Math.PI * 0.5, Math.PI * 0.32), C.plate, 0, HY + r * 0.02, r * 0.16, 0, 0, 0, 1, 1.1, 1);
  cbox(k, r * 0.08, r * 0.62, r * 0.08, 0, HY - r * 0.42, r * 1.06, C.plateHi, -0.35, 0, 0);
  for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) cbox(k, r * 0.05, r * 0.3, r * 0.05, sx * r * (0.2 + i * 0.16), HY - r * 0.42, r * 1.02 - i * r * 0.06, SHADOW, -0.3, sx * (0.25 + i * 0.25), 0);
  k.add(new THREE.OctahedronGeometry(r * 0.06), C.iron, r * 0.62, HY - r * 0.12, r * 0.84);
  k.add(new THREE.OctahedronGeometry(r * 0.06), C.iron, -r * 0.62, HY - r * 0.12, r * 0.84);
  gouge(k, r * 0.3, HY - r * 0.25, r * 1.0, r * 0.35, 0.6, 0.3);
  // Ember eyes: two thin slanted slits deep in the shadow above the mask
  glow(h.headGroup, C.fire, 4.5, [
    [new THREE.BoxGeometry(r * 0.26, r * 0.07, 0.01), r * 0.3, HY + r * 0.08, r * 0.96, 0, 0.35, -0.22],
    [new THREE.BoxGeometry(r * 0.26, r * 0.07, 0.01), -r * 0.3, HY + r * 0.08, r * 0.96, 0, -0.35, 0.22],
  ]);
  return top + r * 0.62;
}

/** Heavy layered pauldron of scorched black steel on the casting shoulder, with ember cracks. */
function pauldron(h: Hunter, k: K, s: number): void {
  const b = h.b;
  const x = s * 0.03;
  // Main dome and three lames below it, tilted outwards
  k.add(capGeo(0.15 * b, 1.25, 8, 4), C.plate, x, 0.02, 0, 0, 0, -s * 0.3, 1.05, 0.85, 1.05);
  for (let i = 0; i < 3; i++) {
    const y = -0.05 - i * 0.055;
    const rr = (0.158 - i * 0.008) * b;
    k.add(latheArc([[rr, y - 0.05], [rr * 0.96, y + 0.02]], 8, -Math.PI * 0.85, Math.PI * 1.7), i % 2 ? C.plate : shade(C.plate, 0.08), x + s * (0.02 + i * 0.012), 0, 0, 0, 0, -s * (0.3 + i * 0.05), 1.02, 1, 1);
  }
  // Raised flange towards the neck and two blunt spikes
  k.add(frustumGeo(0.03, 0.1, 0.22, 0.6, 0.8), C.plateHi, -s * 0.06, 0.12, 0, 0, 0, s * 0.25);
  k.add(new THREE.ConeGeometry(0.026, 0.13, 4), C.plateHi, x + s * 0.05, 0.16, -0.03, -0.2, 0, -s * 0.55);
  k.add(new THREE.ConeGeometry(0.022, 0.1, 4), C.plateHi, x + s * 0.09, 0.11, 0.06, 0.3, 0, -s * 0.8);
  // Scorch marks, gouges, rivets
  k.add(new THREE.SphereGeometry(0.06, 6, 4), C.scorch, x + s * 0.07, 0.09, 0.07, 0, 0, 0, 1, 0.35, 1);
  gouge(k, x + s * 0.06, 0.07, 0.115, 0.08, 0.7, 0.4);
  gouge(k, x + s * 0.11, -0.02, 0.1, 0.06, -0.4, 0.6);
  for (let i = 0; i < 4; i++) {
    const a = -0.9 + i * 0.6;
    k.add(new THREE.OctahedronGeometry(0.011), C.iron, x + Math.sin(a) * 0.15 * b, -0.04, Math.cos(a) * 0.15 * b);
  }
  // Burnt edict pinned to the pauldron
  k.add(ragGeoN(0.06, 0.2, 4, 2, 3), C.parchment, x + s * 0.14, -0.02, 0.09, 0, s * 0.9, s * 0.12);
  cbox(k, 0.03, 0.03, 0.02, x + s * 0.145, -0.01, 0.095, C.inner, 0, s * 0.9, 0);
  // Heat cracks glowing through the plate
  glow(h.rig.armR!, C.crimson, 2.6, [
    [crackGeo([x + s * 0.02, 0.135, 0.06], [x + s * 0.13, 0.03, 0.08], 3, 0.004), 0, 0, 0],
    [crackGeo([x + s * 0.13, 0.03, 0.08], [x + s * 0.16, -0.08, 0.02], 8, 0.0035), 0, 0, 0],
  ]);
}

/**
 * Fire spiralling around the right gauntlet: two dark crimson strands and an orange one coil up
 * the forearm on a spinner (they crawl round the arm), orange tongues lick off the fist, a hot core
 * glows at the knuckles and embers drift around it.
 */
function fireHand(h: Hunter): void {
  const sp = h.kit(h.handR, 0, 0, 0.01);
  h.rig.spinners.push(sp.g);
  const strands: GlowPart[] = [];
  for (const ph of [0, Math.PI]) strands.push([tube(helix(0.3, -0.13, 0.085, 0.05, 1.75, ph, 14), 0.02, 0.005), 0, 0, 0]);
  glow(sp.g, C.crimson, 3.2, strands);
  glow(sp.g, C.fire, 4.5, [
    [tube(helix(0.22, -0.16, 0.07, 0.035, 1.5, Math.PI / 2, 12), 0.012, 0.003), 0, 0, 0],
    [sparkGeo(0.016), 0.11, 0.12, 0.03],
    [sparkGeo(0.012), -0.1, 0.2, -0.04],
    [sparkGeo(0.014), 0.05, -0.2, 0.09],
  ]);
  // Static flames: tongues licking up off the fist (up in the casting pose and at rest)
  const fk = h.kit(h.handR, 0, 0, 0.01);
  const tongues: GlowPart[] = [];
  const outer: GlowPart[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const tilt = 0.25 + (i % 3) * 0.45;
    const dir: V = [Math.cos(a) * 0.35, Math.cos(tilt), Math.sin(tilt) + Math.sin(a) * 0.25];
    const n = Math.hypot(...dir);
    const d: V = [dir[0] / n, dir[1] / n, dir[2] / n];
    const p: V = [Math.cos(a) * 0.04, -0.06 + (i % 2) * 0.05, 0.03 + Math.sin(a) * 0.04];
    (i % 2 ? outer : tongues).push([flameGeo(p, d, 0.12 + (i % 3) * 0.05, 0.022, 11 + i), 0, 0, 0]);
  }
  glow(fk.g, C.fire, 4, tongues);
  glow(fk.g, C.crimson, 3, outer);
  glow(fk.g, C.core, 6, [[new THREE.IcosahedronGeometry(0.034, 0), 0, -0.085, 0.045]]);
  halo(fk.g, C.fire, 0.15, 0, -0.03, 0.04, 0.16, 1.2);
  halo(fk.g, C.crimson, 0.24, 0, 0.04, 0.03, 0.08, 1.4);
}

/** A spiral strand of fire: a tapered tube through the helix points. */
function tube(pts: V[], r0: number, r1: number): THREE.BufferGeometry {
  return taperTube(pts, r0, r1, 4, pts.length * 2);
}

function herald(): Rig {
  const h = new Hunter({ attack: 'cast', bulk: 1.0, tall: 1.03, neckZ: 0.025 });
  const b = h.b;
  const t = h.torso;
  torsoBase(t, b, { shirt: C.inner, trousers: C.robe, neck: C.outer });
  // Crimson under-robe on the chest, black outer robe open down the front
  shell(t, b, C.inner, 0.94, 1.6, 0.018);
  shell(t, b, C.outer, 0.94, 1.62, 0.04, { phiStart: 0.42, phiLen: Math.PI * 2 - 0.84, flare: 0.08 });
  // Scorched breastplate over the upper chest: cracked, gouged and riveted
  shell(t, b, C.plate, 1.26, 1.58, 0.055, { phiStart: -0.95, phiLen: 1.9, seg: 6 });
  t.add(frustumGeo(0.03, 0.26, 0.03, 0.6), C.plateHi, 0, 1.42, chestZ(b, 1.42, 0.07), -0.12, 0, 0);
  t.add(new THREE.SphereGeometry(0.07, 6, 4), C.scorch, -0.08, 1.46, chestZ(b, 1.46, 0.045), 0, 0, 0, 1, 0.8, 0.3);
  gouge(t, 0.09, 1.38, chestZ(b, 1.38, 0.064), 0.09, 0.5, 0.4);
  gouge(t, -0.05, 1.33, chestZ(b, 1.33, 0.062), 0.07, -0.3, -0.3);
  for (const sx of [-1, 1]) for (const y of [1.3, 1.52]) t.add(new THREE.OctahedronGeometry(0.011), C.iron, sx * 0.13, y, chestZ(b, y, 0.035));
  glow(h.frame, C.crimson, 2.4, [
    [crackGeo([0.02, 1.53, chestZ(b, 1.53, 0.062)], [0.1, 1.36, chestZ(b, 1.36, 0.066)], 5, 0.0045), 0, 0, 0],
    [crackGeo([0.1, 1.36, chestZ(b, 1.36, 0.066)], [0.05, 1.28, chestZ(b, 1.28, 0.062)], 9, 0.0035, 3), 0, 0, 0],
  ]);
  // Gorget of scorched plate with a jagged top edge
  t.add(latheArc([[0.13, 1.56], [0.12, 1.64], [0.105, 1.71]], 8, 0, Math.PI * 2, -0.04, 5), C.plate, 0, 0, 0.01, 0, 0, 0, 1, 1, 0.9);
  // Belt, iron buckle, burnt parchment edicts and a crimson tabard strip
  shell(t, b, C.leather, 1.02, 1.1, 0.05);
  cbox(t, 0.07, 0.07, 0.02, 0, 1.06, chestZ(b, 1.06, 0.065), C.iron);
  t.add(ragGeo(0.13, 0.62, { folds: 2, depth: 0.02, flare: 0.25, tatter: 0.22, seed: 13 }), C.inner, 0, 1.04, chestZ(b, 1.04, 0.06));
  for (const [x, len, rz, seed] of [
    [0.13, 0.26, 0.1, 3],
    [-0.11, 0.2, -0.12, 6],
    [0.19, 0.16, 0.25, 9],
  ] as const)
    t.add(ragGeoN(0.055, len, seed, 2, 3), C.parchment, x, 1.04, chestZ(b, 1.04, 0.075), 0.08, 0, rz);
  for (const x of [0.13, -0.11, 0.19]) cbox(t, 0.025, 0.025, 0.015, x, 1.04, chestZ(b, 1.04, 0.08), C.inner);
  // Grimoire chained to the left hip, iron-cornered, a smouldering sigil on the cover
  const gx = -0.25;
  chain(t, [[-0.17, 1.05, 0.08], [-0.24, 0.92, 0.09]], 0.035, C.iron);
  cbox(t, 0.15, 0.19, 0.05, gx, 0.82, 0.07, C.leather, 0.05, -0.45, -0.08);
  cbox(t, 0.155, 0.17, 0.04, gx - 0.008, 0.82, 0.07, C.parchment, 0.05, -0.45, -0.08);
  for (const [dx, dy] of [[-0.065, 0.085], [0.065, 0.085], [-0.065, -0.085], [0.065, -0.085]] as const) cbox(t, 0.03, 0.03, 0.055, gx + dx * 0.9, 0.82 + dy, 0.07 - dx * 0.4, C.iron, 0.05, -0.45, -0.08);
  rune(h.frame, C.fire, gx + 0.012, 0.82, 0.098, 0.035, 0.1, 2.5).rotation.y = -0.45;
  // Ragged black mantle over the shoulders, a high scorched collar behind the head
  mantle(t, b, C.outer, { bottom: 1.3, width: 0.35, tatter: 0.12, seed: 21, seg: 10 });
  t.add(latheArc([[0.17, 1.58], [0.18, 1.72], [0.21, 1.86]], 8, Math.PI * 0.62, Math.PI * 0.76, -0.06, 4), C.outer, 0, 0, -0.02, 0, 0, 0, 1, 1, 0.9);

  const top = cowlHead(h);

  robeLegs(h, { inner: C.robe, outer: C.outer, boot: C.leather, hem: C.hem, flare: 0.34, tatter: 0.14, seed: 17, outerGap: 0.5 });

  // Left arm: wide torn black sleeve, dark glove with iron talons
  sleeveArm(h.armL, -1, b, { sleeve: C.outer, glove: C.leather, bell: 0.16, len: 0.52, tatter: 0.12, seed: 4 });
  for (let i = 0; i < 3; i++) h.armL.add(new THREE.ConeGeometry(0.008, 0.05, 4), C.iron, 0.012 - i * 0.012, -0.745, 0.03 + i * 0.006, 0.25, 0, 0);
  // Right (casting) arm: short burnt sleeve, scorched vambrace and gauntlet, heavy pauldron
  const k = h.armR;
  armBase(k, 1, b, { sleeve: C.outer, glove: C.plate, forearm: C.leather, cuff: 1.35 });
  k.add(latheArc([[0.12, -0.3], [0.1, -0.2], [0.085, 0.0]], 8, 0, Math.PI * 2, 0.08, 7), C.outer, 0.005, 0, 0);
  k.add(prismGeo(0.056, 0.2, 6, 1.18), C.plate, 0, -0.47, 0);
  band(k, 0.064, 0.025, 0, -0.39, 0, C.plateHi, 0, 0, 0, 6);
  k.add(new THREE.SphereGeometry(0.03, 5, 3), C.scorch, 0.03, -0.46, 0.04, 0, 0, 0, 1, 1, 0.5);
  for (let i = 0; i < 4; i++) k.add(new THREE.ConeGeometry(0.009, 0.055, 4), C.plateHi, 0.022 - i * 0.015, -0.75, 0.035, 0.3, 0, 0);
  rod(k, [0, -0.62, -0.045], [0, -0.36, -0.06], 0.012, C.plateHi, 4);
  glow(h.rig.armR!, C.fire, 3, [
    [crackGeo([0.03, -0.38, 0.05], [0.04, -0.55, 0.045], 21, 0.004), 0, 0, 0],
    [crackGeo([-0.04, -0.42, 0.04], [-0.02, -0.56, 0.05], 23, 0.0035), 0, 0, 0],
  ]);
  pauldron(h, k, 1);
  fireHand(h);

  // Long tattered outer robe hanging down the back (swings as a cape)
  const ck = h.cape(0, 1.6, -0.17);
  ck.add(ragGeo(0.5, 1.45, { folds: 3, depth: 0.05, flare: 0.4, tatter: 0.2, seed: 33, curl: 0.12 }), C.outer, 0, 0, 0, 0.06, 0, 0);
  ck.add(ragGeo(0.46, 0.3, { folds: 3, depth: 0.03, flare: 0.3, tatter: 0.3, seed: 34 }), C.hem, 0, -1.12, -0.07, 0.12, 0, 0);
  rod(ck, [-0.18, -0.02, 0.02], [0.18, -0.02, 0.02], 0.012, C.iron, 4);

  const rig = h.finish(top);
  rig.height = Math.max(rig.height, 2.18);
  return rig;
}

export const ashenHerald: UnitDef = {
  build: herald,
  portrait: {
    pose: (rig) => {
      rig.armR!.rotation.set(-1.35, 0, 0.25);
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
