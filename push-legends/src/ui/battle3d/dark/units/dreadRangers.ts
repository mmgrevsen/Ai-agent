import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { K, shade, type V } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { capGeo, cbox, frustumGeo, prismGeo } from '../parts';
import { armBase, arrow, band, chestZ, glow, gouge, hoop, HR, HY, hood, Hunter, latheArc, legBase, mantle, mix, onShin, rod, shell, SHADOW, skirtHalf, strapPath, studs, torsoBase } from './_hunters';
import type { UnitDef } from './types';

/**
 * Dread Rangers (card: thornbow_archer, common). A pair of masked hunters: deep weathered hoods
 * over faceted bone masks with thin sickly-green eye slits, riveted brigandine over dark leather,
 * a single scarred steel pauldron on the bow arm, split coat tails, a quiver of black-fletched
 * arrows on the back and a tall, spiked recurve longbow. Lean, upright, disciplined.
 */
const C = {
  // Weathered grey cloth; the grave-green accent lives only in the eyes
  cloth: mix(shade(PAL.ash, 0.08), PAL.iron, 0.45),
  clothDark: shade(PAL.ash, -0.32),
  leather: shade(PAL.leather, 0.16),
  coat: shade(PAL.leather, 0.04),
  strap: PAL.leatherDark,
  trousers: PAL.charcoal,
  boot: PAL.leatherDark,
  plate: PAL.gunmetal,
  plateDark: PAL.blackSteel,
  rivet: PAL.steel,
  bone: PAL.bone,
  wood: shade(PAL.wood, -0.25),
  fletch: PAL.charcoal,
  glow: PAL.toxic,
};

/** Tall recurve along +y from the grip: limbs sweep back to the archer, tips recurve forward. */
function longbow(k: K): void {
  for (const sy of [-1, 1]) {
    const pts: V[] = [
      [0, sy * 0.06, 0.0],
      [0, sy * 0.4, -0.06],
      [0, sy * 0.72, -0.13],
      [0, sy * 0.86, -0.12],
      [0, sy * 0.95, -0.04],
    ];
    k.curve(pts, 0.03, 0.012, C.wood, 5);
    // Bone plates bound to the limbs, steel-capped spiked tips
    k.add(prismGeo(0.025, 0.18, 5), C.bone, 0, sy * 0.5, -0.085, sy * 0.2, 0, 0);
    band(k, 0.033, 0.03, 0, sy * 0.36, -0.05, C.strap, -sy * 0.2, 0, 0, 6);
    band(k, 0.03, 0.03, 0, sy * 0.66, -0.12, C.strap, -sy * 0.25, 0, 0, 6);
    k.add(new THREE.ConeGeometry(0.017, 0.14, 4), C.rivet, 0, sy * 1.0, -0.0, sy > 0 ? -0.5 : Math.PI + 0.5, 0, 0);
  }
  k.add(prismGeo(0.034, 0.2, 6), C.strap, 0, 0, 0);
  band(k, 0.037, 0.02, 0, 0.09, 0, PAL.leather, 0, 0, 0, 6);
  band(k, 0.037, 0.02, 0, -0.09, 0, PAL.leather, 0, 0, 0, 6);
  rod(k, [0, 0.87, -0.12], [0, -0.87, -0.12], 0.0045, PAL.boneDark, 4);
}

/** Faceted bone face plate recessed in the hood: flat brow, sharp cheekbones, pointed chin, no mouth. */
function boneMask(k: K, glowParent: THREE.Object3D): void {
  const r = HR;
  const bone = PAL.boneDark;
  const z0 = r * 0.06;
  k.add(new THREE.SphereGeometry(r * 0.9, 6, 4, Math.PI / 2 - 0.9, 1.8, Math.PI * 0.3, Math.PI * 0.42), bone, 0, HY - r * 0.02, z0, 0, 0, 0, 1, 1.12, 1);
  // Pointed chin and a hard ridge down the nose
  k.add(new THREE.ConeGeometry(r * 0.42, r * 0.6, 4), shade(bone, -0.12), 0, HY - r * 0.82, z0 + r * 0.62, Math.PI, Math.PI / 4, 0, 1, 1, 0.55);
  k.add(frustumGeo(r * 0.16, r * 0.95, r * 0.14, 0.4, 0.45), C.bone, 0, HY - r * 0.12, z0 + r * 0.9);
  // Soot-dark band across the eyes, like a visor
  k.add(new THREE.SphereGeometry(r * 0.915, 6, 1, Math.PI / 2 - 0.85, 1.7, Math.PI * 0.4, Math.PI * 0.09), shade(bone, -0.55), 0, HY - r * 0.02, z0, 0, 0, 0, 1, 1.12, 1);
  for (const sx of [-1, 1]) {
    cbox(k, r * 0.46, r * 0.11, r * 0.1, sx * r * 0.33, HY + r * 0.08, z0 + r * 0.82, SHADOW, 0, -sx * 0.4, sx * 0.3);
    // Sunken cheek planes
    cbox(k, r * 0.05, r * 0.5, r * 0.06, sx * r * 0.36, HY - r * 0.4, z0 + r * 0.74, shade(bone, -0.45), 0, -sx * 0.45, -sx * 0.3);
  }
  gouge(k, r * 0.2, HY + r * 0.42, z0 + r * 0.84, r * 0.35, -0.9);
  glow(glowParent, C.glow, 5, [
    [new THREE.BoxGeometry(r * 0.26, r * 0.05, 0.01), r * 0.33, HY + r * 0.08, z0 + r * 0.88, 0, -0.4, 0.3],
    [new THREE.BoxGeometry(r * 0.26, r * 0.05, 0.01), -r * 0.33, HY + r * 0.08, z0 + r * 0.88, 0, 0.4, -0.3],
  ]);
}

/** Second hunter of the pair: an angular blackened helm with a jutting brow, hood thrown back. */
function angularHelm(k: K, t: K): number {
  const r = HR;
  k.add(capGeo(r * 1.08, Math.PI * 0.56, 8, 4), C.plate, 0, HY + r * 0.02, -r * 0.04, 0, Math.PI / 8, 0, 1, 1.18, 1.1);
  // Sharp brow peak over the eyes and a ridge running back over the skull
  k.add(new THREE.ConeGeometry(r * 0.95, r * 0.9, 4), C.plateDark, 0, HY + r * 0.3, r * 0.62, Math.PI / 2 + 0.35, Math.PI / 4, 0, 1.25, 1, 0.28);
  k.add(frustumGeo(r * 0.12, r * 0.22, r * 2.0, 0.5, 0.9), C.plateDark, 0, HY + r * 1.18, -r * 0.1, 0.12);
  // Cheek plates closing towards the chin and a flared neck guard
  for (const sx of [-1, 1]) {
    k.add(frustumGeo(r * 0.14, r * 1.0, r * 0.95, 0.9, 1.2), C.plate, sx * r * 0.88, HY - r * 0.38, r * 0.12, 0.1, 0, sx * 0.16);
    gouge(k, sx * r * 0.96, HY - r * 0.25, r * 0.3, r * 0.4, sx * 0.7, sx * 1.4);
  }
  k.add(frustumGeo(r * 1.7, r * 0.55, r * 0.5, 0.8, 0.6, r * 0.2), C.plateDark, 0, HY - r * 0.75, -r * 0.82, -0.5);
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) k.add(new THREE.OctahedronGeometry(r * 0.06), C.rivet, sx * r * 0.62 * Math.cos(i * 0.5), HY + r * 0.15, r * 0.7 * Math.cos(i * 0.7) - r * 0.12);
  // Hood thrown back, bunched around the neck and hanging down the back
  t.add(new THREE.TorusGeometry(0.135, 0.055, 5, 10), C.cloth, 0, 1.64, -0.02, Math.PI / 2 + 0.25, 0, 0, 1, 1, 0.82);
  t.add(latheArc([[0.2, 1.4], [0.19, 1.5], [0.14, 1.64]], 8, Math.PI * 0.6, Math.PI * 0.8, 0.06, 9), C.cloth, 0, 0, -0.06, 0, 0, 0, 1, 1, 0.8);
  return HY + r * 1.32;
}

/** Leather quiver slung across the back, mouth over the right shoulder, black-fletched arrows. */
function quiver(k: K): void {
  const a: V = [-0.13, 0.98, -0.2];
  const top: V = [0.15, 1.62, -0.3];
  rod(k, a, top, 0.056, C.leather, 7, 0.068);
  const d: V = [top[0] - a[0], top[1] - a[1], top[2] - a[2]];
  const L = Math.hypot(...d);
  const u: V = [d[0] / L, d[1] / L, d[2] / L];
  const at = (t: number, ox = 0, oz = 0): V => [a[0] + d[0] * t + ox, a[1] + d[1] * t, a[2] + d[2] * t + oz];
  hoop(k, 0.07, 0.011, ...at(1.0), C.plateDark, Math.PI / 2 - 0.45, 0, -0.42);
  band(k, 0.062, 0.03, ...at(0.2), C.strap, -0.45, 0, -0.42, 7);
  band(k, 0.066, 0.03, ...at(0.62), C.strap, -0.45, 0, -0.42, 7);
  const off: [number, number, number][] = [
    [0.02, 0.0, 0.25],
    [-0.025, 0.015, 0.2],
    [0.0, -0.03, 0.27],
    [0.03, -0.02, 0.17],
    [-0.02, -0.025, 0.22],
  ];
  for (const [ox, oz, out] of off) {
    const nock: V = [top[0] + u[0] * out + ox, top[1] + u[1] * out, top[2] + u[2] * out + oz];
    arrow(k, nock, at(0.75, ox, oz), { fletch: C.fletch, headLen: 0.001 });
  }
}

function ranger(variant: number): Rig {
  const h = new Hunter({ attack: 'bow', bulk: 0.96 });
  const b = h.b;
  const t = h.torso;
  torsoBase(t, b, { shirt: C.leather, trousers: C.trousers, neck: C.clothDark });
  // Leather jerkin with a riveted brigandine panel over the chest
  shell(t, b, C.leather, 0.96, 1.6, 0.016);
  shell(t, b, C.plateDark, 1.18, 1.52, 0.034, { phiStart: -1.05, phiLen: 2.1, seg: 8 });
  const ys = [1.24, 1.32, 1.4, 1.48];
  studs(t, C.rivet, [-0.13, -0.065, 0.065, 0.13], ys, (x, y) => Math.sqrt(Math.max(0, chestZ(b, y, 0.04) ** 2 - (x * 0.66) ** 2)), 0.01);
  gouge(t, 0.05, 1.36, chestZ(b, 1.36, 0.045), 0.1, 0.5);
  // Belt, buckle, pouches and a long knife
  shell(t, b, C.strap, 1.06, 1.13, 0.03, { seg: 10 });
  cbox(t, 0.06, 0.06, 0.02, 0, 1.095, chestZ(b, 1.1, 0.04), C.plate);
  cbox(t, 0.09, 0.11, 0.06, 0.15, 1.04, 0.1, C.strap, 0, 0.5, 0);
  cbox(t, 0.07, 0.09, 0.05, 0.2, 1.05, -0.02, C.leather, 0, 1.2, 0);
  t.add(frustumGeo(0.045, 0.34, 0.022, 0.55), C.strap, -0.18, 0.95, 0.09, 0, 0.3, -0.25);
  t.add(prismGeo(0.016, 0.1, 5), C.bone, -0.135, 1.15, 0.11, 0, 0, -0.25);
  t.add(new THREE.OctahedronGeometry(0.02), C.plate, -0.122, 1.21, 0.115);
  // Baldric for the quiver, front and back
  strapPath(t, [[0.17, 1.56, 0.08], [0.06, 1.42, chestZ(b, 1.42, 0.045)], [-0.08, 1.25, chestZ(b, 1.25, 0.04)], [-0.17, 1.1, 0.08]], 0.045, 0.012, C.strap);
  strapPath(t, [[0.17, 1.56, -0.1], [0.02, 1.35, -0.15], [-0.17, 1.1, -0.1]], 0.045, 0.012, C.strap);
  // Shoulder mantle and the deep hood
  mantle(t, b, C.cloth, { bottom: 1.3, width: 0.33, tatter: 0.12, seed: 4 + variant });
  quiver(t);

  const hk = h.head;
  let top: number;
  if (variant === 0) top = hood(hk, { cloth: C.cloth, wrap: C.clothDark, tail: 0.75, forward: 0.14, faceZ: -0.06, overhang: 0.45 });
  else {
    hk.ball(HR * 0.96, 0, HY - HR * 0.02, -HR * 0.06, SHADOW, 1, 1.12, 1, 10);
    top = angularHelm(hk, t);
  }
  boneMask(hk, h.headGroup);

  // Legs with split coat tails that swing with the stride, steel shin plates over tall boots
  for (const s of [-1, 1]) {
    const k = h.leg(s);
    const l = legBase(k, b, { trousers: C.trousers, boot: C.boot, bend: 0.06 });
    skirtHalf(
      k,
      s,
      h.legX,
      C.coat,
      [
        [0.25, -0.56],
        [0.22, -0.32],
        [0.19, -0.06],
        [0.165, 0.08],
      ],
      { frontGap: 0.45, backGap: 0.1, tatter: 0.1, seed: 3 + variant },
    );
    k.add(frustumGeo(0.08, 0.3, 0.025, 1.25), C.plate, ...onShin(l, 0.42, 0.058), l.bend, 0, 0);
    gouge(k, 0, onShin(l, 0.35)[1], onShin(l, 0.35, 0.075)[2], 0.05, 0.6 * s);
    k.add(capGeo(0.058, Math.PI * 0.5, 7, 3), C.plateDark, 0, l.knee[1], l.knee[2] + 0.04, Math.PI / 2 - 0.1, 0, 0, 1, 1, 0.7);
    band(k, 0.058, 0.025, ...onShin(l, 0.78), C.strap, l.bend);
  }

  // Arms: steel pauldron and vambrace on the bow arm, leather on the drawing arm
  for (const s of [-1, 1]) {
    const k = h.arm(s);
    armBase(k, s, b, { sleeve: C.leather, glove: C.strap, cuff: 1.05 });
    if (s < 0) {
      k.add(capGeo(0.13, Math.PI * 0.5, 8, 4), C.plate, -0.02, 0.0, 0, 0, 0, 0.32, 1.05, 0.78, 1.12);
      k.add(capGeo(0.118, Math.PI * 0.42, 8, 3), C.plateDark, -0.03, -0.065, 0, 0, 0, 0.45, 1.05, 0.55, 1.1);
      hoop(k, 0.13, 0.009, -0.02, 0.0, 0, C.rivet, Math.PI / 2, 0, 0.32, 12);
      gouge(k, -0.09, 0.03, 0.06, 0.07, 0.8, 0.5);
      k.add(prismGeo(0.047, 0.2, 7, 1.18), C.plate, 0, -0.47, 0);
      k.add(frustumGeo(0.016, 0.18, 0.02, 0.5), C.rivet, 0, -0.47, 0.055);
    } else {
      k.add(prismGeo(0.047, 0.18, 7, 1.15), C.strap, 0, -0.48, 0);
      for (let i = 0; i < 2; i++) band(k, 0.056, 0.02, 0, -0.43 - i * 0.08, 0, C.plateDark);
    }
  }

  // Bow in the left hand (vertical when aiming, carried low otherwise), arrow in the right
  longbow(h.kit(h.handL, 0, 0, 0.0, 1.2).k);
  arrow(h.kit(h.handR, 0, 0, 0.02).k, [0, 0.14, 0], [0, -0.68, 0], { fletch: C.fletch });

  return h.finish(top);
}

let built = 0;

export const dreadRangers: UnitDef = {
  build: () => ranger(built++ % 2),
  portrait: {
    pose: (rig) => {
      rig.armL!.rotation.set(-1.45, 0, -0.08);
      rig.armR!.rotation.set(-1.3, 0, 0.3);
      rig.body.rotation.y = 0.32;
      rig.legs[0]!.rotation.x = 0.22;
      rig.legs[1]!.rotation.x = -0.18;
      rig.neck!.rotation.set(0.04, -0.28, 0);
    },
    from: 0.36,
    to: 1.03,
    yaw: 0.38,
    faction: 'grave',
  },
};
