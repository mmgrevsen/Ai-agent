import * as THREE from 'three';
import { FACTIONS, PAL } from '../../../art/darkArt';
import { K, shapeFrom, taperTube, type V } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { frustumGeo, metal, prismGeo } from '../parts';
import {
  armBase,
  band,
  crescentPauldron,
  crest,
  cuirass,
  GILT,
  GILT_HI,
  glow,
  type GlowPart,
  gorget,
  gouge,
  heavyCape,
  hoop,
  Hunter,
  legBase,
  mantle,
  ONYX,
  ONYX_DK,
  ONYX_HI,
  onSurf,
  onTorso,
  plateForearm,
  plateLeg,
  ragGeoN,
  shell,
  sigilParts,
  slitEyes,
  strapPath,
  surfGeo,
  surfLine,
  torsoBase,
  torsoLine,
  visorSurf,
} from './_hunters';
import type { UnitDef } from './types';

/**
 * The Red Reaper (card: shade_assassin, epic). Sleek, fitted, glossy black plate laced with thin
 * gold inlay; a sharply pointed visor helm sweeping back into a tall spire, its eye slits and
 * visor edges burning crimson; layered crescent pauldrons; a heavy black cloak lined in blood red;
 * two long black hooked blades whose grooves glow. Lean and coiled, knees bent, head forward.
 */
const GLOW = FACTIONS.blood.glow;
const C = {
  suit: PAL.charcoal,
  cloth: PAL.black,
  cloak: '#3d1118',
  lining: PAL.blood,
  sash: PAL.blood,
  leather: PAL.leatherDark,
  blade: metal('#2b2d34', 0.85),
  edge: PAL.steelLight,
};

/** Long hooked blade in the shape plane (x towards the hook, y up from the guard). */
const HOOK: [number, number][] = [
  [-0.024, 0],
  [-0.034, 0.3],
  [-0.026, 0.56],
  [0.02, 0.7],
  [0.09, 0.77],
  [0.17, 0.775],
  [0.25, 0.71],
  [0.3, 0.58],
  [0.258, 0.64],
  [0.19, 0.678],
  [0.118, 0.668],
  [0.062, 0.61],
  [0.034, 0.46],
  [0.026, 0.25],
  [0.024, 0],
];

function hookBlade(k: K, g: THREE.Object3D): void {
  // Wrapped grip, gold-ringed guard, pommel spike
  k.add(prismGeo(0.02, 0.2, 6), C.leather, 0, -0.02, 0);
  for (const y of [-0.08, 0.0, 0.07]) band(k, 0.023, 0.014, 0, y, 0, GILT, 0, 0, 0, 6);
  k.add(frustumGeo(0.05, 0.035, 0.13, 0.75), ONYX_HI, 0, 0.1, 0);
  k.add(new THREE.ConeGeometry(0.018, 0.13, 4), ONYX_HI, 0, -0.18, 0, Math.PI, 0, 0);
  k.add(new THREE.ConeGeometry(0.014, 0.11, 4), ONYX_HI, 0, 0.1, -0.1, -Math.PI / 2 - 0.4, 0, 0);
  // Black blade (ry −π/2 turns the hook from shape +x to +z), bright honed edge on the cutting side
  k.plate(shapeFrom(HOOK), 0.01, 0.005, 0, 0.11, 0, C.blade, 0, -Math.PI / 2, 0);
  k.curve(
    [
      [0, 0.12, -0.03],
      [0, 0.45, -0.036],
      [0, 0.66, -0.012],
      [0, 0.81, 0.06],
      [0, 0.87, 0.16],
      [0, 0.83, 0.25],
      [0, 0.7, 0.305],
    ],
    0.006,
    0.003,
    C.edge,
    3,
  );
  // Glowing groove following the spine into the hook
  const groove: V[] = [
    [0, 0.17, 0.0],
    [0, 0.45, -0.002],
    [0, 0.63, 0.02],
    [0, 0.73, 0.08],
    [0, 0.75, 0.16],
    [0, 0.7, 0.23],
  ];
  glow(g, GLOW, 5, [[taperTube(groove, 0.0115, 0.006, 4, 12), 0, 0, 0]]);
}

/** Pointed visor helm with a swept spire, crimson eye slits and burning visor edges. */
function helm(k: K, glowParent: THREE.Object3D): number {
  const f = visorSurf({ keel: 0.62, keelT: 0.36, peak: 1.25, chin: 0.5, cheek: 0.2 });
  k.add(surfGeo(f, 18, 11), ONYX, 0, 0, 0);
  // Raised brow plates and cheek ridges
  for (const s of [-1, 1]) {
    k.add(
      surfGeo((phi, t) => onSurf(f, phi, t, 0.006), 5, 2, s > 0 ? 0.08 : -0.85, 0.77, 0.6, 0.74),
      ONYX_HI,
      0,
      0,
      0,
    );
    surfLine(k, f, [[s * 0.1, 0.75], [s * 0.45, 0.78], [s * 0.85, 0.74], [s * 1.3, 0.62]], 0.0032, GILT);
    surfLine(k, f, [[s * 0.5, 0.18], [s * 0.85, 0.33], [s * 1.1, 0.52], [s * 1.4, 0.58]], 0.003, GILT);
    surfLine(k, f, [[s * 0.15, 0.82], [s * 0.3, 0.9], [s * 0.6, 0.96]], 0.0028, GILT);
  }
  // Spire crest: a gold-edged black blade swept back over the crown
  const top = onSurf(f, 0, 1);
  crest(
    k,
    [
      [-0.05, 0],
      [0.02, 0.07],
      [0.12, 0.1],
      [0.26, 0.05],
      [0.2, 0.0],
      [0.1, -0.06],
    ],
    top[1] - 0.06,
    top[2] + 0.02,
    ONYX_HI,
    0.01,
  );
  surfLine(k, f, [[0, 0.62], [0, 0.8], [0, 0.95]], 0.004, GILT_HI);
  // Crimson: eye slits and the burning edges of the visor (the one accent)
  slitEyes(glowParent, k, f, GLOW, { phi: 0.4, t: 0.53, w: 0.06, h: 0.009, tilt: 0.42, lum: 5.5 });
  const edge: GlowPart[] = [];
  for (const s of [-1, 1]) {
    const pts: V[] = [
      [s * 0.18, 0.58],
      [s * 0.42, 0.45],
      [s * 0.62, 0.3],
      [s * 0.7, 0.12],
    ].map(([p, t]) => onSurf(f, p!, t!, 0.004));
    edge.push([taperTube(pts, 0.0032, 0.0018, 3, 8), 0, 0, 0]);
  }
  glow(glowParent, GLOW, 4.5, edge);
  gouge(k, 0.07, 1.9, 0.12, 0.05, 0.7, 0.4);
  return top[1] + 0.06;
}

function reaper(): Rig {
  const h = new Hunter({ attack: 'melee', bulk: 0.9, neckZ: 0.035 });
  const b = h.b;
  const t = h.torso;
  torsoBase(t, b, { shirt: C.suit, trousers: C.suit, neck: C.suit });
  // Fitted black plate front and back, stepped lames, tall gorget
  const { grow } = cuirass(t, b, { y0: 1.3, y1: 1.6, lames: 3, chevrons: 3, back: true, grow: 0.03 });
  gorget(t, ONYX, GILT, 0.11, 0.115);
  // Spine plates and gold tracery on the back
  for (let i = 0; i < 4; i++) {
    const y = 1.52 - i * 0.075;
    t.add(frustumGeo(0.09 - i * 0.01, 0.055, 0.03, 0.75), i % 2 ? ONYX_DK : ONYX_HI, 0, y, onTorso(b, 0, y, grow, true)[2] - 0.008, -0.12);
  }
  for (const s of [-1, 1]) torsoLine(t, b, [[s * 0.03, 1.56], [s * 0.1, 1.48], [s * 0.15, 1.38], [s * 0.12, 1.3]], grow, 0.003, GILT, true);
  gouge(t, 0.06, 1.48, onTorso(b, 0.06, 1.48, grow + 0.004)[2], 0.1, 0.6);
  // Chest sigil: a downward crescent mark glowing faintly
  glow(h.frame, GLOW, 3, sigilParts([[-0.03, 0.025, 0, -0.02], [0.03, 0.025, 0, -0.02], [0, -0.02, 0, -0.05]], 0.006, 0, 1.47, onTorso(b, 0, 1.47, grow)[2] + 0.012));
  // Throwing-knife belt across the chest
  const sp: V[] = [
    [-0.16, 1.56, 0.06],
    onTorso(b, -0.06, 1.44, grow + 0.012),
    onTorso(b, 0.07, 1.27, grow + 0.012),
    [0.16, 1.14, 0.07],
  ];
  strapPath(t, sp, 0.034, 0.01, C.leather);
  for (let i = 0; i < 3; i++) {
    const x = -0.09 + i * 0.065;
    const y = 1.47 - i * 0.085;
    const p = onTorso(b, x, y, grow + 0.025);
    t.add(new THREE.ConeGeometry(0.011, 0.1, 4), C.edge, p[0] + 0.02, p[1] + 0.05, p[2], 0, Math.PI / 4, -0.65, 1, 1, 0.3);
  }
  // Belt with a blood-red sash and tails at the left hip
  shell(t, b, C.leather, 1.07, 1.13, 0.034, { seg: 12 });
  hoop(t, 0.17 * b + 0.035, 0.004, 0, 1.13, 0, GILT, Math.PI / 2, 0, 0, 16);
  shell(t, b, C.sash, 1.0, 1.07, 0.038, { seg: 12 });
  t.add(new THREE.OctahedronGeometry(0.03), GILT, 0, 1.1, onTorso(b, 0, 1.1, 0.04)[2]);
  t.add(ragGeoN(0.06, 0.36, 3), C.sash, -0.15, 1.02, 0.07, 0.05, -0.6, 0.1);
  t.add(ragGeoN(0.05, 0.28, 4), C.lining, -0.11, 1.02, 0.09, 0.08, -0.4, -0.05);
  // Short black mantle over the shoulders under the pauldrons
  mantle(t, b, C.cloak, { bottom: 1.42, width: 0.28, tatter: 0.1, seed: 8, seg: 10 });

  const top = helm(h.head, h.headGroup);

  // Heavy cloak, blood-red lining
  const ck = h.cape(0, 1.6, -0.15);
  heavyCape(ck, 0.6, 1.42, C.cloak, { seed: 44, inner: C.lining, tatter: 0.42 });

  // Legs: coiled crouch, plated thighs, spiked knees, greaves; tassets on the hips
  for (const s of [-1, 1]) {
    const k = h.leg(s);
    const l = legBase(k, b, { trousers: C.suit, boot: C.leather, bend: 0.15, cuff: null });
    plateLeg(k, l, { spike: 0.09 });
    for (let i = 0; i < 2; i++) k.add(frustumGeo(0.15 - i * 0.012, 0.075, 0.022, 1.1, 1), i % 2 ? ONYX_HI : ONYX, s * 0.035, 0.02 - i * 0.065, 0.09 - i * 0.008, -0.14 - i * 0.03, s * 0.35, 0);
    hoop(k, 0.07, 0.004, s * 0.035, -0.095, 0.08, GILT, Math.PI / 2 + 0.17, s * 0.35, 0, 8, Math.PI);
  }

  // Arms: crescent pauldrons, spiked couters, gold-rimmed vambraces with backswept fins
  for (const s of [-1, 1]) {
    const k = h.arm(s);
    armBase(k, s, b, { sleeve: C.suit, glove: ONYX_DK, cuff: 1.15 });
    crescentPauldron(k, s, { r: 0.135, lames: 3, horn: 0.2, spikes: 0 });
    plateForearm(k, s, { spike: 0.09 });
    k.add(frustumGeo(0.01, 0.2, 0.07, 0.3, 0.2), C.edge, s * 0.055, -0.46, -0.03, 0.3, 0, -s * 0.1);
  }

  // Twin hooked blades
  const r = h.kit(h.handR, 0, 0, 0, 1.1);
  hookBlade(r.k, r.g);
  const l = h.kit(h.handL, 0, 0, 0, 1.1);
  hookBlade(l.k, l.g);
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
    to: 1.02,
    yaw: 0.4,
    faction: 'blood',
  },
};
