import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { K, shade, type V } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { capGeo, cbox, metal, prismGeo } from '../parts';
import { armBase, band, chestZ, glow, gouge, hoop, HR, HY, Hunter, latheArc, legBase, mix, onShin, rod, shell, SHADOW, skirtHalf, strapPath, torsoBase } from './_hunters';
import type { UnitDef } from './types';

/**
 * Blackpowder Sapper (card: powder_bombardier, common). A stocky, soot-blackened bomb-thrower:
 * an iron pot helm over a leather gas mask with round smoked lenses and twin brass filters, a
 * scorched leather apron, a bandolier of iron bombs, a powder keg strapped on the back with a coil
 * of slow-match, heavy gauntlets, and a lit bomb in the throwing hand.
 */
const BRASS = metal(shade(PAL.gold, -0.2), 0.8);
const C = {
  coat: shade(PAL.leather, 0.12),
  apron: mix(shade(PAL.leather, 0.22), PAL.ash, 0.35),
  soot: PAL.charcoal,
  burnt: PAL.black,
  padding: PAL.cloth,
  trousers: shade(PAL.cloth, 0.08),
  boot: PAL.leatherDark,
  glove: shade(PAL.leatherDark, 0.1),
  iron: PAL.iron,
  ironDark: PAL.blackSteel,
  bomb: shade(PAL.black, 0.15),
  wood: shade(PAL.wood, 0.28),
  rope: PAL.boneDark,
  glow: PAL.fire,
};

/** Round iron bomb with a riveted band and a fuse socket (centre at c). */
function bomb(k: K, c: V, r: number, fuse = true): void {
  k.ball(r, c[0], c[1], c[2], C.bomb, 1, 1, 1, 8);
  band(k, r * 1.02, r * 0.3, c[0], c[1], c[2], C.ironDark, 0.4, 0, 0.2, 8);
  k.add(prismGeo(r * 0.32, r * 0.4, 6), C.ironDark, c[0], c[1] + r * 1.05, c[2]);
  if (fuse) rod(k, [c[0], c[1] + r * 1.2, c[2]], [c[0] + r * 0.3, c[1] + r * 1.7, c[2] + r * 0.1], r * 0.08, C.rope, 3);
}

/** Leather gas mask with smoked lenses and twin filters, under an iron pot helm. */
function gasMask(k: K, glowParent: THREE.Object3D): number {
  const r = HR;
  // Tight leather hood with a neck drape
  k.ball(r * 1.04, 0, HY + r * 0.02, -r * 0.02, C.coat, 1, 1.08, 1.05, 10);
  k.add(latheArc([[r * 1.5, -r * 1.45], [r * 1.25, -r * 0.9], [r * 1.0, -r * 0.4]], 10, 0, Math.PI * 2, 0.06, 2), shade(C.coat, -0.1), 0, HY, 0, 0, 0, 0, 1, 1, 1.0);
  // Mask face: blackened leather plate with seams
  k.add(new THREE.SphereGeometry(r * 1.0, 8, 5, Math.PI / 2 - 1.0, 2.0, Math.PI * 0.32, Math.PI * 0.5), C.soot, 0, HY - r * 0.05, r * 0.12, 0, 0, 0, 1, 1.05, 1);
  // Round lenses in brass rims, dull fire behind smoked glass
  for (const sx of [-1, 1]) {
    k.add(new THREE.CylinderGeometry(r * 0.27, r * 0.3, r * 0.22, 10), BRASS, sx * r * 0.38, HY + r * 0.12, r * 0.98, Math.PI / 2, 0, 0);
    k.add(new THREE.CircleGeometry(r * 0.21, 10), SHADOW, sx * r * 0.38, HY + r * 0.12, r * 1.1);
  }
  glow(glowParent, C.glow, 2.6, [
    [new THREE.CircleGeometry(r * 0.16, 8), r * 0.38, HY + r * 0.12, r * 1.11],
    [new THREE.CircleGeometry(r * 0.16, 8), -r * 0.38, HY + r * 0.12, r * 1.11],
  ]);
  // Respirator snout and two filter canisters angled down and out
  rod(k, [0, HY - r * 0.35, r * 0.85], [0, HY - r * 0.62, r * 1.4], r * 0.3, C.soot, 8, r * 0.22);
  k.add(new THREE.CylinderGeometry(r * 0.24, r * 0.24, r * 0.1, 8), BRASS, 0, HY - r * 0.64, r * 1.43, Math.PI / 2 + 0.45, 0, 0);
  for (const sx of [-1, 1]) {
    const a: V = [sx * r * 0.25, HY - r * 0.55, r * 1.1];
    const b: V = [sx * r * 0.85, HY - r * 0.95, r * 0.95];
    rod(k, a, b, r * 0.2, C.ironDark, 8, r * 0.24);
    k.add(new THREE.CylinderGeometry(r * 0.26, r * 0.26, r * 0.08, 8), BRASS, ...b, 0, 0, sx * 0.9);
  }
  // Strap round the head
  hoop(k, r * 1.07, r * 0.07, 0, HY + r * 0.12, -r * 0.05, PAL.leatherDark, Math.PI / 2, 0, 0, 10);
  // Iron pot helm with a rolled rim, dented
  k.add(capGeo(r * 1.16, Math.PI * 0.5, 8, 4), C.iron, 0, HY + r * 0.25, -r * 0.02, -0.08, 0, 0, 1, 0.92, 1.05);
  hoop(k, r * 1.2, r * 0.08, 0, HY + r * 0.27, -r * 0.02, C.ironDark, Math.PI / 2 - 0.08, 0, 0, 10);
  gouge(k, r * 0.3, HY + r * 0.85, r * 0.7, r * 0.4, 0.5, 0.0);
  cbox(k, r * 0.5, r * 0.15, r * 0.3, -r * 0.4, HY + r * 0.9, r * 0.4, C.soot, -0.6, 0, 0.3);
  return HY + r * 1.35;
}

/** Wooden powder keg strapped to the back, with a coil of slow-match and a fuse bag. */
function keg(k: K, b: number): void {
  const z = -0.34;
  k.lathe(
    [
      [0.14, 1.02],
      [0.175, 1.16],
      [0.185, 1.3],
      [0.175, 1.44],
      [0.14, 1.58],
    ],
    0,
    0,
    z,
    C.wood,
    8,
  );
  k.add(new THREE.CircleGeometry(0.14, 8), shade(C.wood, -0.25), 0, 1.58, z, -Math.PI / 2, 0, 0);
  for (const y of [1.08, 1.3, 1.52]) band(k, y === 1.3 ? 0.19 : 0.165, 0.035, 0, y, z, C.ironDark, 0, 0, 0, 8);
  k.add(new THREE.TorusGeometry(0.1, 0.022, 4, 10), C.rope, 0.0, 1.6, z, Math.PI / 2, 0, 0);
  k.add(new THREE.TorusGeometry(0.075, 0.02, 4, 10), shade(C.rope, -0.2), 0.0, 1.64, z, Math.PI / 2, 0, 0);
  cbox(k, 0.06, 0.04, 0.04, 0.06, 1.42, z - 0.15, C.soot);
  // Straps holding it on
  for (const sx of [-1, 1]) {
    strapPath(k, [[sx * 0.13, 1.58, -0.12], [sx * 0.17, 1.6, 0.0], [sx * 0.14, 1.52, chestZ(b, 1.52, 0.04)]], 0.045, 0.012, PAL.leatherDark);
  }
  band(k, 0.24, 0.05, 0, 1.22, -0.05, PAL.leatherDark, 0, 0, 0, 10);
  // Side satchel of fuses
  cbox(k, 0.1, 0.14, 0.08, -0.2, 1.02, -0.12, C.coat, 0, -0.4, 0);
}

function sapperRig(): Rig {
  const h = new Hunter({ attack: 'throw', bulk: 1.12, neckZ: 0.02 });
  const b = h.b;
  const t = h.torso;
  torsoBase(t, b, { shirt: C.padding, trousers: C.trousers, neck: C.coat });
  // Quilted gambeson under a heavy leather coat, scorched apron bib on the front
  shell(t, b, C.coat, 0.96, 1.6, 0.025);
  shell(t, b, C.apron, 1.02, 1.5, 0.045, { phiStart: -1.0, phiLen: 2.0, seg: 6 });
  for (const [x, y, w, rz] of [[0.08, 1.38, 0.1, 0.4], [-0.06, 1.2, 0.12, -0.2], [0.02, 1.1, 0.08, 0.9]] as const) cbox(t, w, w * 0.6, 0.01, x, y, chestZ(b, y, 0.055), C.soot, 0, 0, rz);
  for (const sx of [-1, 1]) strapPath(t, [[sx * 0.11, 1.5, chestZ(b, 1.5, 0.05)], [sx * 0.12, 1.62, 0.04], [sx * 0.1, 1.6, -0.12]], 0.03, 0.01, PAL.leatherDark);
  // Bandolier of bombs across the chest
  const bp: V[] = [
    [0.19, 1.56, 0.07],
    [0.07, 1.42, chestZ(b, 1.42, 0.06)],
    [-0.08, 1.25, chestZ(b, 1.25, 0.06)],
    [-0.2, 1.1, 0.08],
  ];
  strapPath(t, bp, 0.05, 0.014, PAL.leatherDark);
  for (let i = 0; i < 3; i++) {
    const f = 0.18 + i * 0.3;
    const x = 0.17 - f * 0.36;
    const y = 1.53 - f * 0.42;
    bomb(t, [x, y, chestZ(b, y, 0.1)], 0.045, false);
  }
  // Belt with hanging bombs and pouches
  shell(t, b, PAL.leatherDark, 1.04, 1.11, 0.04);
  cbox(t, 0.07, 0.07, 0.02, 0, 1.075, chestZ(b, 1.08, 0.05), C.iron);
  bomb(t, [0.22, 0.96, 0.08], 0.055, false);
  bomb(t, [0.26, 0.98, -0.04], 0.05, false);
  cbox(t, 0.1, 0.11, 0.07, -0.2, 1.0, 0.07, C.coat, 0, -0.5, 0);
  keg(t, b);

  const hk = h.head;
  const top = gasMask(hk, h.headGroup);

  // Legs: scorched apron flaps (front only) swing with the stride, padded trousers, heavy boots
  for (const s of [-1, 1]) {
    const k = h.leg(s);
    const l = legBase(k, b, { trousers: C.trousers, boot: C.boot, bend: 0.08, cuff: shade(C.boot, 0.15) });
    skirtHalf(
      k,
      s,
      h.legX,
      C.apron,
      [
        [0.24, -0.58],
        [0.215, -0.3],
        [0.19, -0.02],
        [0.18, 0.06],
      ],
      { frontGap: 0.05, backGap: Math.PI - 1.05, tatter: 0.12, seed: 31, seg: 4 },
    );
    skirtHalf(
      k,
      s,
      h.legX,
      C.coat,
      [
        [0.25, -0.42],
        [0.22, -0.2],
        [0.19, 0.0],
        [0.175, 0.07],
      ],
      { frontGap: 1.15, backGap: 0.1, tatter: 0.1, seed: 33, seg: 5 },
    );
    k.add(capGeo(0.07, Math.PI * 0.5, 7, 3), shade(C.boot, 0.1), 0, l.knee[1], l.knee[2] + 0.04, Math.PI / 2 - 0.1, 0, 0, 1, 1, 0.75);
    band(k, 0.068, 0.03, ...onShin(l, 0.35), PAL.leatherDark, l.bend);
    band(k, 0.064, 0.03, ...onShin(l, 0.7), PAL.leatherDark, l.bend);
    k.add(capGeo(0.06, Math.PI * 0.5, 6, 3), C.iron, 0, -0.95, l.ankle[2] + 0.17, Math.PI / 2 - 0.6, 0, 0, 1, 1, 0.7);
    cbox(k, 0.06, 0.05, 0.01, s * 0.02, -0.3, 0.1, C.soot, -0.1, 0, 0.6);
  }

  // Arms: padded sleeves, leather shoulder guards, heavy gauntlets
  for (const s of [-1, 1]) {
    const k = h.arm(s);
    armBase(k, s, b, { sleeve: C.coat, glove: C.glove, forearm: C.coat, cuff: 1.5 });
    k.add(capGeo(0.13, Math.PI * 0.5, 7, 3), shade(C.coat, -0.2), s * 0.02, 0.0, 0, 0, 0, -s * 0.3, 1.05, 0.7, 1.1);
    band(k, 0.067, 0.03, 0, -0.18, 0, PAL.leatherDark, 0, 0, 0, 7);
    cbox(k, 0.05, 0.06, 0.01, s * 0.03, -0.45, 0.05, C.soot, 0, 0, 0.5);
  }

  // Lit bomb in the throwing hand, a smouldering slow-match baton in the other
  const bk = h.kit(h.handR, 0, -0.07, 0.04);
  bomb(bk.k, [0, -0.03, 0], 0.095);
  glow(bk.g, C.glow, 6, [
    [new THREE.OctahedronGeometry(0.022), 0.03, 0.135, 0.01],
    [new THREE.OctahedronGeometry(0.012), 0.05, 0.16, 0.0],
  ]);
  const mk = h.kit(h.handL, 0, 0, 0.02, 1.0);
  mk.k.add(prismGeo(0.016, 0.34, 5), C.wood, 0, 0.08, 0);
  for (let i = 0; i < 3; i++) band(mk.k, 0.022, 0.02, 0, 0.12 + i * 0.04, 0, C.rope, 0, 0, 0, 5);
  mk.k.add(new THREE.ConeGeometry(0.02, 0.05, 5), C.burnt, 0, 0.27, 0);
  glow(mk.g, C.glow, 4, [[new THREE.OctahedronGeometry(0.014), 0, 0.3, 0]]);
  return h.finish(top);
}

export const sapper: UnitDef = {
  build: sapperRig,
  portrait: {
    pose: (rig) => {
      rig.armR!.rotation.set(-2.55, 0, 0.35);
      rig.armL!.rotation.set(-0.85, 0, -0.35);
      rig.body.rotation.set(0.04, -0.25, 0);
      rig.legs[0]!.rotation.x = 0.3;
      rig.legs[1]!.rotation.x = -0.25;
      rig.neck!.rotation.set(0.0, 0.18, 0);
    },
    from: 0.3,
    to: 1.0,
    yaw: 0.5,
    faction: 'ash',
  },
};
