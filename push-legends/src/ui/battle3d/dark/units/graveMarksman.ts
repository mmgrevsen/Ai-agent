import * as THREE from 'three';
import { FACTIONS, PAL } from '../../../art/darkArt';
import { K, shade, shapeFrom, taperTube, type V } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { cbox, frustumGeo, metal } from '../parts';
import {
  armBase,
  arrow,
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
  HR,
  Hunter,
  HY,
  latheArc,
  legBase,
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
  surfGeo,
  surfLine,
  torsoBase,
  torsoLine,
  visorSurf,
} from './_hunters';
import type { UnitDef } from './types';

/**
 * Grave Marksman (card: hawkeye_ranger, rare). A patient sniper in ornate black plate: a crested,
 * sculpted helm with one narrow ember-red eye slit and a gold sighting monocle over the right eye,
 * layered spiked pauldrons, a long black greatcoat lined in crimson, a heavy cloak, and a long
 * black-steel arbalest whose prod carries burning runes and whose loaded bolt glows at the tip.
 */
const GLOW = FACTIONS.iron.glow;
const BRASS = metal(shade(PAL.gold, -0.1), 0.88);
const C = {
  coat: shade(PAL.leatherDark, 0.08),
  coatHi: PAL.leatherDark,
  lining: PAL.crimson,
  trousers: PAL.black,
  boot: PAL.leatherDark,
  cloth: PAL.black,
  cloak: '#36373f',
  wood: '#1a1716',
  steel: PAL.steel,
};

/** Heavy arbalest along +y from the trigger grip; the bolt groove (top) faces −z. */
function arbalest(k: K, g: THREE.Object3D): void {
  // Black tiller and butt with gold fittings
  k.add(frustumGeo(0.05, 0.86, 0.075, 0.75, 0.8), C.wood, 0, 0.2, 0.005);
  k.add(frustumGeo(0.07, 0.22, 0.11, 0.7, 0.75), ONYX_DK, 0, -0.28, 0.02);
  for (const y of [-0.12, 0.3, 0.52]) band(k, 0.046, 0.022, 0, y, 0.005, GILT, 0, 0, 0, 6);
  // Recurved black-steel prod with gold-capped tips, spanned string, stirrup at the nose
  const prod: V[] = [
    [-0.52, 0.45, 0.02],
    [-0.42, 0.53, -0.0],
    [-0.22, 0.585, -0.01],
    [0, 0.6, -0.01],
    [0.22, 0.585, -0.01],
    [0.42, 0.53, -0.0],
    [0.52, 0.45, 0.02],
  ];
  k.curve(prod, 0.032, 0.03, ONYX_HI, 6);
  const runes: GlowPart[] = [];
  for (const sx of [-1, 1]) {
    k.add(new THREE.ConeGeometry(0.022, 0.1, 4), GILT, sx * 0.54, 0.42, 0.03, 0, 0, sx * 2.5);
    rod(k, [sx * 0.5, 0.45, -0.01], [0, 0.2, -0.045], 0.004, PAL.boneDark, 3);
    runes.push([taperTube([[sx * 0.08, 0.605, 0.012], [sx * 0.22, 0.592, 0.012], [sx * 0.38, 0.55, 0.018]], 0.0065, 0.004, 3, 6), 0, 0, 0]);
  }
  k.add(frustumGeo(0.1, 0.08, 0.06, 0.8), ONYX, 0, 0.6, 0);
  hoop(k, 0.055, 0.009, 0, 0.7, 0.0, ONYX_HI, 0, 0, 0, 8);
  // Loaded bolt in the groove with a glowing head
  arrow(k, [0, 0.2, -0.05], [0, 0.84, -0.05], { r: 0.009, shaft: PAL.boneDark, head: ONYX_HI, fletch: C.lining, headLen: 0.09 });
  runes.push([new THREE.OctahedronGeometry(0.018), 0, 0.82, -0.05]);
  glow(g, GLOW, 5, runes);
  // Trigger lever, rear sight and a windlass hub
  rod(k, [0, 0.04, 0.05], [0, -0.22, 0.055], 0.008, ONYX, 4);
  k.add(frustumGeo(0.012, 0.06, 0.012, 0.5), GILT, 0, 0.12, -0.065);
  k.add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8), ONYX, 0.045, -0.12, 0.0, 0, 0, Math.PI / 2);
  rod(k, [0.06, -0.12, 0], [0.06, -0.2, 0.06], 0.006, ONYX, 4);
}

/** Crested, sculpted helm with one narrow burning slit and a gold monocle. */
function helm(k: K, glowParent: THREE.Object3D): number {
  const f = visorSurf({ size: 1.04, keel: 0.32, keelT: 0.35, peak: 0.3, chin: 0.3, cheek: 0.12 });
  k.add(surfGeo(f, 18, 10), ONYX, 0, 0, 0);
  // Brow band and a flared, layered neck guard
  k.add(surfGeo((p, t) => onSurf(f, p, t, 0.007), 16, 1, -1.9, 3.8, 0.6, 0.66), ONYX_HI, 0, 0, 0);
  for (let i = 0; i < 2; i++) k.add(latheArc([[HR * (1.5 - i * 0.12), -HR * (1.3 - i * 0.25)], [HR * (1.18 - i * 0.08), -HR * (0.85 - i * 0.25)], [HR * 1.05, -HR * (0.5 - i * 0.25)]], 12, Math.PI * 0.5, Math.PI), i ? ONYX_HI : ONYX, 0, HY, -0.01, 0, 0, 0, 1, 1, 1.05);
  for (const s of [-1, 1]) {
    surfLine(k, f, [[s * 0.2, 0.68], [s * 0.6, 0.7], [s * 1.0, 0.64], [s * 1.5, 0.6]], 0.003, GILT);
    surfLine(k, f, [[s * 0.4, 0.25], [s * 0.7, 0.4], [s * 0.85, 0.55]], 0.0028, GILT);
    surfLine(k, f, [[s * 0.25, 0.78], [s * 0.4, 0.88], [s * 0.3, 0.97]], 0.0028, GILT);
  }
  // Narrow eye slit across the face: dark recess and a single thin burning line
  const slit: GlowPart[] = [];
  for (let i = -3; i <= 3; i++) {
    const p = onSurf(f, i * 0.16, 0.53, 0.002);
    cbox(k, 0.038, 0.016, 0.01, p[0], p[1], p[2], SHADOW, 0, i * 0.16, 0);
    if (Math.abs(i) <= 2) slit.push([new THREE.BoxGeometry(0.036, Math.abs(i) === 1 ? 0.008 : 0.005, 0.004), ...onSurf(f, i * 0.16, 0.53, 0.006), 0, i * 0.16, 0]);
  }
  // Sighting monocle on a hinge arm over the right eye, lens burning
  const mp = onSurf(f, 0.32, 0.53, 0.02);
  rod(k, [mp[0], mp[1], mp[2] - 0.01], [mp[0], mp[1], mp[2] + 0.05], 0.018, BRASS, 8, 0.02);
  band(k, 0.022, 0.012, mp[0], mp[1], mp[2] + 0.05, ONYX, Math.PI / 2, 0, 0, 8);
  rod(k, [mp[0] + 0.01, mp[1] + 0.02, mp[2]], [0.12, mp[1] + 0.05, 0.02], 0.006, BRASS, 4);
  slit.push([new THREE.CircleGeometry(0.014, 8), mp[0], mp[1], mp[2] + 0.062, 0, 0, 0]);
  glow(glowParent, GLOW, 5, slit);
  // Sculpted crest: three swept blades rising from the crown
  const top = onSurf(f, 0, 1);
  crest(
    k,
    [
      [-0.16, -0.06],
      [-0.1, 0.03],
      [0.0, 0.085],
      [0.12, 0.09],
      [0.24, 0.04],
      [0.3, -0.04],
      [0.18, 0.0],
      [0.04, -0.07],
    ],
    top[1] - 0.03,
    top[2] + 0.03,
    ONYX_HI,
    0.014,
  );
  k.add(taperTube([[0, top[1] - 0.06, top[2] + 0.19], [0, top[1] + 0.06, top[2] + 0.06], [0, top[1] + 0.06, top[2] - 0.12], [0, top[1] - 0.04, top[2] - 0.3]], 0.008, 0.004, 3, 10), GILT_HI, 0, 0, 0);
  for (const s of [-1, 1]) k.plate(shapeFrom([[-0.04, -0.03], [0.04, 0.045], [0.18, 0.035], [0.08, -0.03]]), 0.008, 0.003, s * 0.035, top[1] - 0.08, top[2] - 0.01, ONYX, 0, Math.PI / 2 + s * 0.14, 0);
  gouge(k, -0.06, HY + 0.07, 0.125, 0.05, 0.6, -0.4);
  return top[1] + 0.09;
}

function marksman(): Rig {
  const h = new Hunter({ attack: 'bow', bulk: 1.02 });
  const b = h.b;
  const t = h.torso;
  torsoBase(t, b, { shirt: C.coat, trousers: C.trousers, neck: C.cloth });
  shell(t, b, C.coat, 0.96, 1.6, 0.018, { seg: 14 });
  const { grow } = cuirass(t, b, { y0: 1.3, y1: 1.6, lames: 3, chevrons: 2, back: true, grow: 0.034 });
  gorget(t, ONYX, GILT, 0.1, 0.12);
  for (const s of [-1, 1]) torsoLine(t, b, [[s * 0.04, 1.56], [s * 0.12, 1.46], [s * 0.15, 1.34]], grow, 0.003, GILT, true);
  gouge(t, 0.07, 1.46, onTorso(b, 0.07, 1.46, grow + 0.005)[2], 0.12, 0.55);
  gouge(t, -0.06, 1.36, onTorso(b, -0.06, 1.36, grow + 0.005)[2], 0.09, -0.4);
  // Belt with a bolt case on the right hip and a cranequin on the left
  shell(t, b, C.coatHi, 1.06, 1.13, 0.038, { seg: 14 });
  cbox(t, 0.06, 0.06, 0.02, 0, 1.095, onTorso(b, 0, 1.1, 0.05)[2], GILT);
  cbox(t, 0.1, 0.24, 0.08, 0.2, 0.96, 0.03, ONYX_DK, 0, 0, -0.08);
  for (let i = 0; i < 4; i++) arrow(t, [0.17 + i * 0.02, 1.13 + (i % 2) * 0.03, 0.01 + (i % 2) * 0.03], [0.17 + i * 0.02, 0.98, 0.02], { r: 0.006, fletch: i % 2 ? C.lining : PAL.boneDark, headLen: 0.001 });
  t.add(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), ONYX, -0.2, 0.98, 0.06, 0, 0, Math.PI / 2 - 0.2);
  rod(t, [-0.2, 0.98, 0.06], [-0.24, 0.8, 0.1], 0.008, ONYX, 4);

  const top = helm(h.head, h.headGroup);

  // Heavy cloak with a crimson lining
  const ck = h.cape(0, 1.6, -0.17);
  heavyCape(ck, 0.66, 1.45, C.cloak, { seed: 52, inner: C.lining, tatter: 0.36 });

  // Legs: long greatcoat lined in crimson, black plate knees and greaves
  for (const s of [-1, 1]) {
    const k = h.leg(s);
    const l = legBase(k, b, { trousers: C.trousers, boot: C.boot, bend: 0.05, cuff: null });
    skirtHalf(
      k,
      s,
      h.legX,
      C.coat,
      [
        [0.28, -0.76],
        [0.24, -0.42],
        [0.19, -0.06],
        [0.168, 0.08],
      ],
      { frontGap: 0.38, backGap: 0.06, tatter: 0.1, seed: 21, seg: 9 },
    );
    skirtHalf(
      k,
      s,
      h.legX,
      C.lining,
      [
        [0.27, -0.72],
        [0.232, -0.42],
        [0.182, -0.06],
        [0.16, 0.06],
      ],
      { frontGap: 0.16, backGap: 0.5, tatter: 0.06, seed: 23, seg: 4 },
    );
    plateLeg(k, l, { thigh: false, spike: 0.07 });
  }

  // Arms: heavy layered spiked pauldrons, spiked couters, black gauntlets
  for (const s of [-1, 1]) {
    const k = h.arm(s);
    armBase(k, s, b, { sleeve: C.coat, glove: ONYX_DK, forearm: C.coat, cuff: 1.3 });
    crescentPauldron(k, s, { r: 0.158, lames: 4, horn: s < 0 ? 0.14 : 0.0, spikes: 3 });
    plateForearm(k, s, { spike: 0.08 });
  }

  // Arbalest in the right hand: hangs across the shins at rest, levels at the target when firing
  const wk = h.kit(h.handR, 0, -0.01, 0.0, 2.8, 0, 0.3);
  arbalest(wk.k, wk.g);
  return h.finish(top);
}

export const graveMarksman: UnitDef = {
  build: marksman,
  portrait: {
    pose: (rig) => {
      rig.armR!.rotation.set(-1.38, 0, 0.05);
      rig.armL!.rotation.set(-1.25, 0, 0.42);
      rig.body.rotation.y = 0.3;
      rig.legs[0]!.rotation.x = 0.25;
      rig.legs[1]!.rotation.x = -0.2;
      rig.neck!.rotation.set(0.06, -0.22, 0);
    },
    from: 0.34,
    to: 1.03,
    yaw: 0.42,
    faction: 'iron',
  },
};
