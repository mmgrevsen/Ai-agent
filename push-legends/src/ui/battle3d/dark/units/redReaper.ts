import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { K, shade, shapeFrom } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { cbox, frustumGeo, prismGeo } from '../parts';
import { armBase, band, chestZ, glow, gouge, HR, HY, hood, Hunter, latheArc, legBase, mantle, onShin, ragGeoN, shell, strapPath, torsoBase } from './_hunters';
import type { UnitDef } from './types';

/**
 * The Red Reaper (card: shade_assassin, epic). Lean and coiled: knees bent, head pushed forward
 * under a deep charcoal hood that hides a featureless blackened face plate with one thin crimson
 * slit. Layered black-steel lames over a tight dark suit, bladed vambraces, a bandolier of throwing
 * knives, and two long hooked blades. Crimson is kept to the scarf, the sash and the blade grooves.
 */
const C = {
  suit: shade(PAL.charcoal, 0.12),
  hood: shade(PAL.charcoal, 0.05),
  hoodDark: PAL.black,
  leather: PAL.leatherDark,
  plate: PAL.blackSteel,
  plateHi: PAL.gunmetal,
  blade: PAL.steel,
  edge: PAL.steelLight,
  crimson: PAL.crimson,
  blood: PAL.blood,
  glow: PAL.eyeRed,
};

/** Long hooked blade along +y from the grip; the hook curls towards the cut (+z of the hand). */
const HOOK = shapeFrom([
  [-0.022, 0],
  [-0.032, 0.3],
  [-0.024, 0.55],
  [0.02, 0.68],
  [0.09, 0.75],
  [0.17, 0.755],
  [0.24, 0.7],
  [0.285, 0.58],
  [0.245, 0.63],
  [0.185, 0.665],
  [0.115, 0.655],
  [0.06, 0.6],
  [0.034, 0.46],
  [0.026, 0.25],
  [0.022, 0],
]);

function hookBlade(k: K): void {
  // Wrapped grip, knuckle spur and a pommel spike
  k.add(prismGeo(0.02, 0.2, 6), C.leather, 0, -0.02, 0);
  band(k, 0.023, 0.02, 0, 0.04, 0, C.crimson, 0, 0, 0, 6);
  band(k, 0.023, 0.02, 0, -0.07, 0, C.crimson, 0, 0, 0, 6);
  k.add(frustumGeo(0.05, 0.035, 0.12, 0.8), C.plate, 0, 0.1, 0.0);
  k.add(new THREE.ConeGeometry(0.018, 0.12, 4), C.plateHi, 0, -0.17, 0, Math.PI, 0, 0);
  k.add(new THREE.ConeGeometry(0.014, 0.1, 4), C.plateHi, 0, 0.1, -0.09, -Math.PI / 2 - 0.4, 0, 0);
  // Blade (ry −π/2 turns the hook from +x to +z), dark spine and a crimson blood groove
  k.plate(HOOK, 0.01, 0.005, 0, 0.11, 0, C.blade, 0, -Math.PI / 2, 0);
  k.add(frustumGeo(0.008, 0.42, 0.02, 0.5), C.crimson, 0, 0.36, 0.0, 0, 0, 0);
  k.add(frustumGeo(0.016, 0.5, 0.014, 0.6), C.plate, 0, 0.36, -0.024, 0.04, 0, 0);
}

/** Featureless faceted face plate with one thin glowing slit. */
function facePlate(k: K, glowParent: THREE.Object3D): void {
  const r = HR;
  k.add(new THREE.SphereGeometry(r * 0.9, 6, 4, Math.PI / 2 - 0.9, 1.8, Math.PI * 0.26, Math.PI * 0.56), C.plate, 0, HY - r * 0.05, r * 0.04, 0, 0, 0, 1, 1.15, 1);
  k.add(new THREE.ConeGeometry(r * 0.4, r * 0.55, 4), C.plate, 0, HY - r * 0.92, r * 0.58, Math.PI, Math.PI / 4, 0, 1, 1, 0.5);
  k.add(frustumGeo(r * 0.12, r * 1.2, r * 0.12, 0.4, 0.5), C.plateHi, 0, HY - r * 0.15, r * 0.9);
  cbox(k, r * 1.2, r * 0.07, r * 0.1, 0, HY + r * 0.08, r * 0.86, PAL.void);
  gouge(k, -r * 0.3, HY - r * 0.4, r * 0.85, r * 0.4, 0.9);
  glow(glowParent, C.glow, 5, [[new THREE.BoxGeometry(r * 0.95, r * 0.035, 0.01), 0, HY + r * 0.08, r * 0.92]]);
}

/** Overlapping angular shoulder lames with crimson-edged rims (drawn into the arm kit). */
function shoulderLames(k: K, s: number): void {
  for (let i = 0; i < 3; i++) {
    const y = 0.06 - i * 0.065;
    const w = 0.2 - i * 0.02;
    k.add(frustumGeo(w, 0.03, 0.2 - i * 0.015, 0.7, 0.9), i % 2 ? C.plateHi : C.plate, s * (0.04 + i * 0.012), y, 0, 0, 0, -s * (0.35 + i * 0.1));
    k.add(frustumGeo(w * 1.02, 0.008, 0.012, 1), i === 0 ? C.blood : C.crimson, s * (0.04 + i * 0.012 + Math.cos(0.55 + i * 0.12) * w * 0.5), y - Math.sin(0.55 + i * 0.12) * w * 0.5, 0.0, 0, Math.PI / 2, -s * (0.55 + i * 0.12) - s * Math.PI / 2);
  }
  k.add(new THREE.ConeGeometry(0.02, 0.12, 4), C.plateHi, s * 0.1, 0.1, -0.04, -0.3, 0, -s * 0.9);
  gouge(k, s * 0.06, 0.07, 0.07, 0.08, -s * 0.5, -s * 0.3);
}

function reaper(): Rig {
  const h = new Hunter({ attack: 'melee', bulk: 0.9, neckZ: 0.035 });
  const b = h.b;
  const t = h.torso;
  torsoBase(t, b, { shirt: C.suit, trousers: C.suit, neck: C.hoodDark });
  // Layered armour: chest plate, stepped abdominal lames, a raised gorget hiding the throat
  shell(t, b, C.plate, 1.3, 1.56, 0.03, { phiStart: -1.25, phiLen: 2.5, seg: 8 });
  for (let i = 0; i < 3; i++) shell(t, b, i % 2 ? C.plateHi : C.plate, 1.22 - i * 0.065, 1.29 - i * 0.065, 0.026 + i * 0.004, { phiStart: -1.0, phiLen: 2.0, seg: 6 });
  t.add(frustumGeo(0.03, 0.24, 0.03, 0.5), C.plateHi, 0, 1.43, chestZ(b, 1.43, 0.05));
  gouge(t, 0.06, 1.47, chestZ(b, 1.47, 0.045), 0.1, 0.6);
  gouge(t, -0.08, 1.37, chestZ(b, 1.37, 0.045), 0.07, -0.4);
  t.add(latheArc([[0.13, 1.56], [0.12, 1.66], [0.13, 1.74]], 8, -1.2, 2.4), C.plate, 0, 0, 0.01, 0, 0, 0, 1, 1, 0.9);
  // Spine plates down the back
  for (let i = 0; i < 4; i++) t.add(frustumGeo(0.1 - i * 0.01, 0.06, 0.03, 0.8), i % 2 ? C.plateHi : C.plate, 0, 1.5 - i * 0.08, -chestZ(b, 1.5 - i * 0.08, 0.02), -0.1);
  // Bandolier of throwing knives across the chest
  const strapPts: [number, number, number][] = [
    [-0.16, 1.55, 0.06],
    [-0.05, 1.42, chestZ(b, 1.42, 0.05)],
    [0.08, 1.26, chestZ(b, 1.26, 0.045)],
    [0.16, 1.12, 0.07],
  ];
  strapPath(t, strapPts, 0.04, 0.012, C.leather);
  for (let i = 0; i < 4; i++) {
    const f = 0.15 + i * 0.22;
    const x = -0.13 + f * 0.27;
    const y = 1.51 - f * 0.37;
    t.add(new THREE.ConeGeometry(0.012, 0.11, 4), C.edge, x, y + 0.06, chestZ(b, y, 0.065), 0, Math.PI / 4, -0.7, 1, 1, 0.3);
    cbox(t, 0.016, 0.03, 0.016, x - 0.02, y, chestZ(b, y, 0.06), C.leather, 0, 0, -0.7);
  }
  // Belt with a crimson sash knotted at the left hip
  shell(t, b, C.leather, 1.06, 1.13, 0.03);
  shell(t, b, C.crimson, 1.0, 1.07, 0.035, { seg: 10 });
  t.add(new THREE.OctahedronGeometry(0.04), C.blood, -0.14, 1.03, 0.07);
  t.add(ragGeoN(0.06, 0.34, 3), C.crimson, -0.16, 1.02, 0.07, 0.05, -0.6, 0.1);
  t.add(ragGeoN(0.05, 0.26, 4), C.blood, -0.12, 1.02, 0.09, 0.08, -0.4, -0.05);

  // Head: deep hood over the face plate, long point down the back
  const hk = h.head;
  const top = hood(hk, { cloth: C.hood, edge: C.hoodDark, wrap: C.hoodDark, tail: 1.0, forward: 0.16, faceZ: -0.1, overhang: 0.5, open: 0.8 });
  facePlate(hk, h.headGroup);
  // Short torn cowl falling from the hood over the chest and back (reads as cloth, not a helm)
  mantle(t, b, C.hood, { bottom: 1.4, width: 0.27, tatter: 0.14, seed: 8, seg: 9 });
  hk.add(latheArc([[HR * 0.97, -HR * 0.1], [HR * 1.05, HR * 0.5]], 10, 0.8, Math.PI * 2 - 1.6), C.crimson, 0, HY, HR * 0.12, 0, 0, 0, 0.94, 1, 1.1);

  // Crimson scarf wound at the throat, two torn tails streaming behind (the cape pivot)
  t.add(new THREE.TorusGeometry(0.115, 0.04, 4, 10), C.crimson, 0, 1.63, -0.01, Math.PI / 2 + 0.2, 0, 0, 1, 1, 0.85);
  const ck = h.cape(0, 1.6, -0.12);
  ck.add(ragGeoN(0.13, 0.95, 5), C.crimson, -0.05, 0, 0, 0.1, 0, 0.06);
  ck.add(ragGeoN(0.1, 0.75, 6), C.blood, 0.06, -0.02, 0.01, 0.12, 0, -0.08);

  // Legs: coiled crouch, plated tassets and knees, wrapped shins, soft boots
  for (const s of [-1, 1]) {
    const k = h.leg(s);
    const l = legBase(k, b, { trousers: C.suit, boot: C.leather, bend: 0.16, cuff: null });
    for (let i = 0; i < 3; i++) k.add(frustumGeo(0.16 - i * 0.01, 0.075, 0.025, 1.1, 1), i % 2 ? C.plateHi : C.plate, s * 0.035, 0.0 - i * 0.065, 0.09 - i * 0.008, -0.14 - i * 0.02, s * 0.35, 0);
    k.add(frustumGeo(0.09, 0.09, 0.03, 0.7), C.plate, 0, l.knee[1] + 0.01, l.knee[2] + 0.06, -0.1, 0, 0);
    k.add(new THREE.ConeGeometry(0.018, 0.09, 4), C.plateHi, 0, l.knee[1] - 0.02, l.knee[2] + 0.1, Math.PI / 2 + 0.3, 0, 0);
    for (let i = 0; i < 4; i++) band(k, 0.064 - i * 0.004, 0.022, ...onShin(l, 0.2 + i * 0.17), shade(C.suit, -0.25), l.bend + (i % 2 ? 0.15 : -0.15), 0, 0, 7);
    k.add(frustumGeo(0.07, 0.24, 0.022, 1.2), C.plate, ...onShin(l, 0.45, 0.056), l.bend, 0, 0);
  }

  // Arms: tight sleeves, angular layered shoulders, plated vambraces with backswept blade fins
  for (const s of [-1, 1]) {
    const k = h.arm(s);
    armBase(k, s, b, { sleeve: C.suit, glove: C.leather, cuff: 1.1 });
    shoulderLames(k, s);
    k.add(prismGeo(0.05, 0.22, 6, 1.2), C.plate, 0, -0.47, 0);
    k.add(frustumGeo(0.012, 0.2, 0.06, 0.4, 0.3), C.edge, s * 0.05, -0.44, -0.02, 0.25, 0, -s * 0.12);
    band(k, 0.054, 0.018, 0, -0.38, 0, C.crimson, 0, 0, 0, 6);
    for (let i = 0; i < 3; i++) cbox(k, 0.012, 0.02, 0.016, -s * 0.0 + (i - 1) * 0.0, -0.69, 0.04, C.plateHi);
  }

  // Twin hooked blades
  hookBlade(h.kit(h.handR, 0, 0, 0, 1.1).k);
  hookBlade(h.kit(h.handL, 0, 0, 0, 1.1).k);
  return h.finish(top);
}

export const redReaper: UnitDef = {
  build: reaper,
  portrait: {
    pose: (rig) => {
      rig.armR!.rotation.set(-2.3, 0, 0.35);
      rig.armL!.rotation.set(-0.7, 0, -0.55);
      rig.body.rotation.set(0.12, 0.25, 0);
      rig.legs[0]!.rotation.x = 0.4;
      rig.legs[1]!.rotation.x = -0.3;
      rig.neck!.rotation.set(0.12, -0.2, 0);
    },
    from: 0.3,
    to: 1.0,
    yaw: 0.4,
    faction: 'blood',
  },
};
