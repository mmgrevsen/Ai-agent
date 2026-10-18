import * as THREE from 'three';
import { FACTIONS, PAL } from '../../../art/darkArt';
import { K, shade, taperTube, type V } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { cbox, frustumGeo, prismGeo } from '../parts';
import {
  armBase,
  arrow,
  band,
  crescentPauldron,
  crest,
  cuirass,
  GILT,
  glow,
  type GlowPart,
  gouge,
  heavyCape,
  hoop,
  hood,
  HR,
  Hunter,
  HY,
  latheArc,
  legBase,
  mantle,
  ONYX,
  ONYX_DK,
  ONYX_HI,
  onSurf,
  onTorso,
  plateForearm,
  plateLeg,
  rod,
  shell,
  SHADOW,
  skirtHalf,
  slitEyes,
  strapPath,
  surfGeo,
  surfLine,
  torsoBase,
  visorSurf,
} from './_hunters';
import type { UnitDef } from './types';

/**
 * Dread Rangers (card: thornbow_archer, common). A pair of masked hunters in the reference set's
 * language: glossy black plate over near-black leather, sharply pointed visors whose eye slits burn
 * grave-green (one under a deep hood, the other in a tall crested helm), a horned crescent pauldron
 * on the bow arm, a torn half-cloak, a quiver of black arrows and a tall black recurve longbow with
 * glowing runes down its limbs. Lean, upright, disciplined.
 */
const GLOW = FACTIONS.grave.glow;
const C = {
  cloth: '#313732',
  clothDark: PAL.black,
  leather: shade(PAL.leatherDark, 0.1),
  coat: shade(PAL.leatherDark, 0.05),
  strap: shade(PAL.leatherDark, 0.15),
  trousers: PAL.black,
  boot: PAL.leatherDark,
  wood: '#2a2624',
  fletch: PAL.charcoal,
};

/** Tall recurve along +y from the grip: limbs sweep back to the archer, tips recurve forward. */
function longbow(k: K, g: THREE.Object3D): void {
  const runes: GlowPart[] = [];
  for (const sy of [-1, 1]) {
    const pts: V[] = [
      [0, sy * 0.06, 0.0],
      [0, sy * 0.4, -0.06],
      [0, sy * 0.72, -0.13],
      [0, sy * 0.86, -0.12],
      [0, sy * 0.96, -0.03],
    ];
    k.curve(pts, 0.04, 0.016, C.wood, 6);
    // Black plates bound to the limbs with gold, gold-capped spiked tips
    k.add(prismGeo(0.03, 0.26, 5), ONYX_HI, 0, sy * 0.52, -0.09, sy * 0.2, 0, 0);
    band(k, 0.034, 0.014, 0, sy * 0.38, -0.055, GILT, -sy * 0.2, 0, 0, 6);
    band(k, 0.031, 0.014, 0, sy * 0.66, -0.12, GILT, -sy * 0.25, 0, 0, 6);
    k.add(new THREE.ConeGeometry(0.017, 0.15, 4), GILT, 0, sy * 1.02, 0.01, sy > 0 ? -0.5 : Math.PI + 0.5, 0, 0);
    k.add(new THREE.ConeGeometry(0.012, 0.09, 4), ONYX_HI, 0, sy * 0.8, -0.07, sy > 0 ? 0.9 : Math.PI - 0.9, 0, 0);
    // Rune line burning along the back of each limb
    for (const [a, c] of [
      [0.16, 0.26],
      [0.44, 0.54],
    ] as const) {
      const rp: V[] = [
        [0, sy * a, 0.03 - a * 0.2],
        [0, sy * c, 0.03 - c * 0.2],
      ];
      runes.push([taperTube(rp, 0.0045, 0.0045, 3, 2), 0, 0, 0]);
    }
  }
  glow(g, GLOW, 3.5, runes);
  k.add(prismGeo(0.034, 0.2, 6), C.strap, 0, 0, 0);
  band(k, 0.037, 0.012, 0, 0.1, 0, GILT, 0, 0, 0, 6);
  band(k, 0.037, 0.012, 0, -0.1, 0, GILT, 0, 0, 0, 6);
  rod(k, [0, 0.9, -0.12], [0, -0.9, -0.12], 0.0045, PAL.boneDark, 4);
}

/** Pointed visor mask; the hooded hunter's sits deep in the cowl. */
function visor(k: K, glowParent: THREE.Object3D, tall: boolean): number {
  const f = tall ? visorSurf({ keel: 0.55, keelT: 0.38, peak: 0.85, chin: 0.42, cheek: 0.2 }) : visorSurf({ size: 0.94, keel: 0.6, keelT: 0.38, chin: 0.45, cheek: 0.2, z: 0.005 });
  k.add(surfGeo(f, 18, 10), ONYX, 0, 0, 0);
  for (const s of [-1, 1]) {
    surfLine(k, f, [[s * 0.12, 0.72], [s * 0.5, 0.74], [s * 0.95, 0.66]], 0.003, GILT);
    surfLine(k, f, [[s * 0.55, 0.2], [s * 0.9, 0.38], [s * 1.2, 0.5]], 0.0028, GILT);
  }
  surfLine(k, f, [[0, 0.6], [0, 0.78], [0, 0.95]], 0.0035, ONYX_HI);
  slitEyes(glowParent, k, f, GLOW, { phi: 0.4, t: 0.53, w: 0.058, h: 0.009, tilt: 0.38, lum: 6 });
  gouge(k, 0.05, HY + 0.07, 0.12, 0.05, 0.6, 0.35);
  if (!tall) return onSurf(f, 0, 1)[1];
  // Tall helm: swept crest blade and a flared neck guard
  const top = onSurf(f, 0, 1);
  crest(
    k,
    [
      [-0.06, 0],
      [0.0, 0.05],
      [0.1, 0.07],
      [0.22, 0.03],
      [0.14, -0.02],
      [0.04, -0.07],
    ],
    top[1] - 0.05,
    top[2] + 0.02,
    ONYX_HI,
    0.01,
  );
  k.add(latheArc([[HR * 1.45, -HR * 1.3], [HR * 1.2, -HR * 0.95], [HR * 1.05, -HR * 0.6]], 12, Math.PI * 0.55, Math.PI * 0.9), ONYX, 0, HY, -0.01, 0, 0, 0, 1, 1, 1.05);
  return top[1] + 0.03;
}

/** Leather quiver slung across the back, mouth over the right shoulder, black-fletched arrows. */
function quiver(k: K): void {
  const a: V = [-0.13, 0.98, -0.2];
  const top: V = [0.15, 1.62, -0.3];
  rod(k, a, top, 0.056, C.coat, 8, 0.068);
  const d: V = [top[0] - a[0], top[1] - a[1], top[2] - a[2]];
  const L = Math.hypot(...d);
  const u: V = [d[0] / L, d[1] / L, d[2] / L];
  const at = (t: number, ox = 0, oz = 0): V => [a[0] + d[0] * t + ox, a[1] + d[1] * t, a[2] + d[2] * t + oz];
  hoop(k, 0.07, 0.009, ...at(1.0), GILT, Math.PI / 2 - 0.45, 0, -0.42);
  band(k, 0.064, 0.03, ...at(0.2), ONYX, -0.45, 0, -0.42, 8);
  band(k, 0.068, 0.03, ...at(0.62), ONYX, -0.45, 0, -0.42, 8);
  const off: [number, number, number][] = [
    [0.02, 0.0, 0.25],
    [-0.025, 0.015, 0.2],
    [0.0, -0.03, 0.27],
    [0.03, -0.02, 0.17],
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
  // Leather jerkin under a glossy black breastplate
  shell(t, b, C.leather, 0.96, 1.6, 0.016, { seg: 14 });
  const { grow } = cuirass(t, b, { y0: 1.3, y1: 1.58, lames: 2, chevrons: 1, grow: 0.03 });
  gouge(t, 0.06, 1.42, onTorso(b, 0.06, 1.42, grow + 0.004)[2], 0.1, 0.5);
  // Belt, buckle, pouches and a long knife
  shell(t, b, C.strap, 1.06, 1.13, 0.034, { seg: 12 });
  cbox(t, 0.055, 0.055, 0.02, 0, 1.095, onTorso(b, 0, 1.1, 0.045)[2], GILT);
  cbox(t, 0.09, 0.11, 0.06, 0.15, 1.04, 0.1, C.strap, 0, 0.5, 0);
  t.add(frustumGeo(0.045, 0.34, 0.022, 0.55), ONYX, -0.18, 0.95, 0.09, 0, 0.3, -0.25);
  t.add(prismGeo(0.016, 0.1, 5), C.strap, -0.135, 1.15, 0.11, 0, 0, -0.25);
  t.add(new THREE.OctahedronGeometry(0.02), GILT, -0.122, 1.21, 0.115);
  // Baldric for the quiver, front and back
  strapPath(t, [[0.17, 1.56, 0.08], onTorso(b, 0.06, 1.44, grow + 0.012), onTorso(b, -0.08, 1.27, grow + 0.01), [-0.17, 1.1, 0.08]], 0.04, 0.012, C.strap);
  strapPath(t, [[0.17, 1.56, -0.1], [0.02, 1.35, -0.15], [-0.17, 1.1, -0.1]], 0.04, 0.012, C.strap);
  quiver(t);

  const hk = h.head;
  let top: number;
  if (variant === 0) {
    // Deep black hood around the pointed mask, short torn mantle over the shoulders
    hk.ball(HR * 0.9, 0, HY - HR * 0.02, -HR * 0.08, SHADOW, 1, 1.1, 1, 8);
    const ht = hood(hk, { cloth: C.cloth, edge: C.clothDark, wrap: C.clothDark, tail: 0.9, forward: 0.12, faceZ: -0.3, overhang: 0.42 });
    visor(hk, h.headGroup, false);
    top = ht;
    mantle(t, b, C.cloth, { bottom: 1.32, width: 0.33, tatter: 0.14, seed: 4, seg: 14 });
  } else {
    hk.ball(HR * 0.9, 0, HY - HR * 0.02, -HR * 0.06, SHADOW, 1, 1.1, 1, 8);
    top = visor(hk, h.headGroup, true);
    // Hood thrown back, bunched around the neck
    t.add(new THREE.TorusGeometry(0.135, 0.05, 5, 12), C.cloth, 0, 1.64, -0.02, Math.PI / 2 + 0.25, 0, 0, 1, 1, 0.82);
    t.add(latheArc([[0.2, 1.4], [0.19, 1.5], [0.14, 1.64]], 8, Math.PI * 0.6, Math.PI * 0.8, 0.06, 9), C.cloth, 0, 0, -0.06, 0, 0, 0, 1, 1, 0.8);
  }

  // Torn half-cloak hanging from the bow shoulder
  const ck = h.cape(-0.06, 1.6, -0.15);
  heavyCape(ck, 0.46, 1.18, C.cloth, { seed: 12 + variant * 7, inner: C.clothDark, tatter: 0.5, folds: 3 });

  // Legs: split leather coat tails, black plate knees and greaves
  for (const s of [-1, 1]) {
    const k = h.leg(s);
    const l = legBase(k, b, { trousers: C.trousers, boot: C.boot, bend: 0.06, cuff: null });
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
      { frontGap: 0.45, backGap: 0.1, tatter: 0.12, seed: 3 + variant, seg: 8 },
    );
    plateLeg(k, l, { thigh: false, spike: 0.06 });
  }

  // Arms: horned crescent pauldron on the bow arm, leather and a light cop on the drawing arm
  for (const s of [-1, 1]) {
    const k = h.arm(s);
    armBase(k, s, b, { sleeve: C.leather, glove: C.strap, cuff: 1.05 });
    if (s < 0) {
      crescentPauldron(k, s, { r: 0.14, lames: 3, horn: 0.2, spikes: 0 });
      plateForearm(k, s, { spike: 0.06 });
    } else {
      k.add(new THREE.SphereGeometry(0.12, 12, 3, 0, Math.PI * 2, 0, Math.PI * 0.42), ONYX_DK, 0.03, 0.03, 0, 0, 0, -0.35, 1.08, 0.6, 1.12);
      k.add(prismGeo(0.047, 0.18, 8, 1.15), C.strap, 0, -0.48, 0);
      for (let i = 0; i < 2; i++) band(k, 0.056, 0.012, 0, -0.43 - i * 0.08, 0, GILT, 0, 0, 0, 8);
    }
  }

  // Bow in the left hand (vertical when aiming, carried low otherwise), arrow in the right
  const bw = h.kit(h.handL, 0, 0, 0.0, 1.2);
  longbow(bw.k, bw.g);
  const ar = h.kit(h.handR, 0, 0, 0.02);
  arrow(ar.k, [0, 0.14, 0], [0, -0.68, 0], { fletch: C.fletch, head: ONYX_HI });
  glow(ar.g, GLOW, 4, [[new THREE.OctahedronGeometry(0.014), 0, -0.64, 0, 0, 0, 0]]);

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
