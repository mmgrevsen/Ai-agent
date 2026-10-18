import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { K, shade, shapeFrom } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { cbox, frustumGeo, metal, prismGeo } from '../parts';
import {
  armBase,
  band,
  crescentPauldron,
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
  line,
  mantle,
  ONYX,
  ONYX_DK,
  ONYX_HI,
  onTorso,
  plateForearm,
  plateLeg,
  rod,
  shell,
  SHADOW,
  sigilParts,
  skirtHalf,
  strapPath,
  torsoBase,
} from './_hunters';
import type { UnitDef } from './types';

/**
 * Plague Surgeon (card: field_medic, common). A gaunt hooded figure in the wraith-knight mould:
 * a deep pointed black hood over a black-iron beaked mask whose round lenses burn sickly green,
 * horned crescent pauldrons with spikes, a glowing sigil on the breastplate, a skull at the belt,
 * long layered and tattered coat and cloak, a bandolier of glowing vials, an iron censer of green
 * fire swinging from one hand and a bone saw in the other. His cures burn.
 */
const GLOW = PAL.toxic;
const BRASS = metal(shade(PAL.gold, -0.2), 0.85);
const C = {
  coat: PAL.leatherDark,
  robe: shade(PAL.ash, -0.22),
  cloth: '#2a332b',
  beak: PAL.boneDark,
  trousers: PAL.black,
  boot: PAL.leatherDark,
  glove: ONYX_DK,
  saw: PAL.gunmetal,
  bone: PAL.bone,
  glass: '#1d2a1a',
};

const SAW = shapeFrom(
  (() => {
    const pts: [number, number][] = [
      [-0.03, 0],
      [-0.035, 0.34],
      [0.0, 0.36],
    ];
    for (let i = 0; i < 9; i++) {
      const y = 0.34 - i * 0.035;
      pts.push([0.045, y], [0.03, y - 0.018]);
    }
    pts.push([0.03, 0]);
    return pts;
  })(),
);

/** Deep pointed hood over a black-iron beaked mask with burning green lenses. */
function beakedHead(k: K, glowParent: THREE.Object3D): number {
  const r = HR;
  const top = hood(k, { cloth: C.cloth, edge: PAL.void, wrap: C.cloth, tail: 1.3, forward: 0.18, faceZ: -0.2, overhang: 0.5, size: 1.06 });
  // Tall point of the hood standing up and back (wraith silhouette)
  k.curve(
    [
      [0, HY + r * 1.2, -r * 0.2],
      [0, HY + r * 1.75, -r * 0.55],
      [0, HY + r * 2.0, -r * 1.1],
    ],
    r * 0.42,
    0.006,
    C.cloth,
    7,
  );
  // Mask face plate with a medial ridge
  k.add(new THREE.SphereGeometry(r * 0.94, 12, 5, Math.PI / 2 - 0.95, 1.9, Math.PI * 0.22, Math.PI * 0.58), ONYX, 0, HY - r * 0.04, r * 0.08, 0, 0, 0, 1, 1.08, 1);
  line(k, [[0, HY + r * 0.75, r * 0.78], [0, HY + r * 0.4, r * 1.0], [0, HY + r * 0.05, r * 1.06]], 0.006, ONYX_HI);
  // Long curved iron beak with a gold seam and breathing holes
  k.curve(
    [
      [0, HY - r * 0.2, r * 0.7],
      [0, HY - r * 0.42, r * 1.45],
      [0, HY - r * 0.85, r * 2.2],
      [0, HY - r * 1.45, r * 2.65],
    ],
    r * 0.4,
    r * 0.02,
    C.beak,
    8,
  );
  line(
    k,
    [
      [0, HY - r * 0.0, r * 0.98],
      [0, HY - r * 0.15, r * 1.6],
      [0, HY - r * 0.6, r * 2.3],
      [0, HY - r * 1.3, r * 2.66],
    ],
    0.004,
    GILT,
  );
  for (const sx of [-1, 1]) k.add(new THREE.OctahedronGeometry(r * 0.05), SHADOW, sx * r * 0.12, HY - r * 0.42, r * 1.62);
  hoop(k, r * 0.32, r * 0.05, 0, HY - r * 0.36, r * 1.18, GILT, 0.4, 0, 0, 10);
  // Round lenses in brass rims burning green
  const lens: GlowPart[] = [];
  for (const sx of [-1, 1]) {
    k.add(new THREE.CylinderGeometry(r * 0.24, r * 0.27, r * 0.2, 12), BRASS, sx * r * 0.4, HY + r * 0.12, r * 0.88, Math.PI / 2, 0, 0);
    k.add(new THREE.CircleGeometry(r * 0.2, 10), SHADOW, sx * r * 0.4, HY + r * 0.12, r * 0.985);
    lens.push([new THREE.CircleGeometry(r * 0.16, 10), sx * r * 0.4, HY + r * 0.12, r * 0.995]);
  }
  glow(glowParent, GLOW, 6, lens);
  return Math.max(top, HY + r * 2.1);
}

/** Iron censer cage with green fire, hanging on a short chain (spins slowly). */
function censer(h: Hunter): void {
  const ck = h.kit(h.handR, 0, -0.02, 0.03);
  for (let i = 0; i < 4; i++) ck.k.add(new THREE.TorusGeometry(0.014, 0.004, 3, 6), ONYX_HI, 0, -0.03 - i * 0.045, 0, 0, i * 1.57, 0);
  const sp = h.kit(ck.g, 0, -0.23, 0);
  const k = sp.k;
  k.add(new THREE.ConeGeometry(0.08, 0.1, 6), ONYX, 0, 0.0, 0);
  k.add(new THREE.ConeGeometry(0.02, 0.06, 4), GILT, 0, 0.07, 0);
  k.add(new THREE.CylinderGeometry(0.05, 0.068, 0.03, 6), ONYX_HI, 0, -0.19, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    rod(k, [Math.cos(a) * 0.064, -0.04, Math.sin(a) * 0.064], [Math.cos(a) * 0.072, -0.18, Math.sin(a) * 0.072], 0.006, ONYX, 3);
  }
  band(k, 0.077, 0.012, 0, -0.1, 0, GILT, 0, 0, 0, 8);
  k.add(new THREE.ConeGeometry(0.02, 0.08, 4), ONYX_HI, 0, -0.25, 0, Math.PI, 0, 0);
  glow(sp.g, GLOW, 6, [[new THREE.IcosahedronGeometry(0.045, 0), 0, -0.1, 0]]);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6), new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.18, depthWrite: false }));
  halo.position.set(0, -0.1, 0);
  sp.g.add(halo);
  h.rig.spinners.push(sp.g);
}

/** Bone skull hanging at the belt. */
function skull(k: K, x: number, y: number, z: number): void {
  k.ball(0.05, x, y, z, C.bone, 0.95, 1.0, 1.05, 10);
  k.add(frustumGeo(0.05, 0.03, 0.045, 1.1), PAL.boneDark, x, y - 0.045, z + 0.01);
  for (const sx of [-1, 1]) k.ball(0.014, x + sx * 0.018, y + 0.004, z + 0.042, SHADOW, 1, 1, 0.6, 6);
  k.add(new THREE.ConeGeometry(0.007, 0.014, 3), SHADOW, x, y - 0.02, z + 0.048, Math.PI, 0, 0);
}

function surgeon(): Rig {
  const h = new Hunter({ attack: 'throw', bulk: 0.95, tall: 1.04, neckZ: 0.03 });
  const b = h.b;
  const t = h.torso;
  torsoBase(t, b, { shirt: C.coat, trousers: C.trousers, neck: C.cloth });
  shell(t, b, C.coat, 0.96, 1.6, 0.022, { seg: 14 });
  // Black breastplate with a green-burning sigil (a rod pierced by a crescent)
  const { grow } = cuirass(t, b, { y0: 1.3, y1: 1.58, lames: 2, chevrons: 1, grow: 0.034 });
  const sz = onTorso(b, 0, 1.44, grow)[2] + 0.012;
  const sig: GlowPart[] = sigilParts(
    [
      [0, 0.08, 0, -0.08],
      [-0.045, 0.035, 0, 0.0],
      [0.045, 0.035, 0, 0.0],
      [-0.03, -0.03, 0.03, -0.03],
      [-0.045, 0.035, -0.03, 0.07],
      [0.045, 0.035, 0.03, 0.07],
    ],
    0.007,
    0,
    1.44,
    sz,
  );
  // Belt, skull, vial bandolier
  shell(t, b, PAL.leatherDark, 1.05, 1.12, 0.042, { seg: 14 });
  cbox(t, 0.055, 0.055, 0.02, 0, 1.085, onTorso(b, 0, 1.09, 0.052)[2], GILT);
  skull(t, 0.13, 0.98, onTorso(b, 0.13, 1.05, 0.06)[2] + 0.02);
  strapPath(t, [[-0.18, 1.56, 0.06], onTorso(b, -0.06, 1.42, grow + 0.012), onTorso(b, 0.08, 1.24, grow + 0.012), [0.18, 1.1, 0.07]], 0.04, 0.012, PAL.leatherDark);
  for (let i = 0; i < 3; i++) {
    const x = -0.12 + i * 0.075;
    const y = 1.485 - i * 0.095;
    const z = onTorso(b, x, y, grow + 0.035)[2];
    if (Math.abs(x) < 0.06 && Math.abs(y - 1.44) < 0.08) continue;
    t.add(new THREE.CylinderGeometry(0.016, 0.016, 0.07, 6), C.glass, x, y, z, 0, 0, -0.6);
    t.add(new THREE.CylinderGeometry(0.01, 0.01, 0.02, 5), PAL.boneDark, x + Math.sin(0.6) * 0.045, y + Math.cos(0.6) * 0.045, z, 0, 0, -0.6);
    sig.push([new THREE.CylinderGeometry(0.011, 0.011, 0.045, 5), x, y, z + 0.006, 0, 0, -0.6]);
  }
  // Satchel and hanging tools at the left hip
  cbox(t, 0.13, 0.15, 0.08, -0.22, 0.98, 0.04, C.coat, 0, -0.5, 0);
  cbox(t, 0.13, 0.05, 0.085, -0.22, 1.05, 0.045, ONYX, 0, -0.5, 0);
  rod(t, [-0.15, 1.05, 0.12], [-0.13, 0.86, 0.15], 0.006, C.saw, 4);
  t.add(new THREE.SphereGeometry(0.045, 8, 6), C.glass, 0.23, 0.98, 0.0);
  sig.push([new THREE.SphereGeometry(0.032, 6, 4), 0.23, 0.975, 0.012]);
  glow(h.frame, GLOW, 4.5, sig);
  // Layered torn mantle over the shoulders
  mantle(t, b, C.cloth, { bottom: 1.3, width: 0.36, tatter: 0.16, seed: 17, seg: 11 });
  gouge(t, -0.07, 1.36, onTorso(b, -0.07, 1.36, grow + 0.005)[2], 0.09, -0.5);

  const top = beakedHead(h.head, h.headGroup);

  // Heavy tattered cloak
  const ck = h.cape(0, 1.6, -0.17);
  heavyCape(ck, 0.66, 1.62, C.cloth, { seed: 61, inner: C.robe, tatter: 0.5, folds: 5 });

  // Long coat over a torn robe, both to the ankles and parting with every stride
  for (const s of [-1, 1]) {
    const k = h.leg(s);
    const l = legBase(k, b, { trousers: C.trousers, boot: C.boot, bend: 0.05, cuff: null });
    skirtHalf(
      k,
      s,
      h.legX,
      C.robe,
      [
        [0.27, -0.94],
        [0.24, -0.55],
        [0.19, -0.08],
        [0.16, 0.06],
      ],
      { frontGap: 0.1, backGap: 0.3, tatter: 0.18, seed: 43, seg: 7 },
    );
    skirtHalf(
      k,
      s,
      h.legX,
      C.coat,
      [
        [0.31, -0.86],
        [0.27, -0.52],
        [0.2, -0.08],
        [0.168, 0.08],
      ],
      { frontGap: 0.4, backGap: 0.05, tatter: 0.2, seed: 41, seg: 9 },
    );
    plateLeg(k, l, { thigh: false, greave: false, spike: 0.05 });
  }

  // Arms: horned, spiked crescent pauldrons; plated forearms, long black gloves
  for (const s of [-1, 1]) {
    const k = h.arm(s);
    armBase(k, s, b, { sleeve: C.coat, glove: C.glove, forearm: C.coat, cuff: 1.25 });
    crescentPauldron(k, s, { r: 0.15, lames: 3, horn: 0.34, spikes: 3 });
    plateForearm(k, s, { spike: 0.07 });
    k.add(latheArc([[0.1, -0.5], [0.085, -0.4], [0.068, -0.3]], 10, 0, Math.PI * 2, 0.06, 5 + s), C.cloth, 0, 0, 0);
  }

  censer(h);
  // Bone saw in the left hand, carried point-down
  const sk = h.kit(h.handL, 0, 0, 0.01, 2.45);
  sk.k.add(prismGeo(0.02, 0.15, 6, 0.85), C.bone, 0, 0.0, 0);
  sk.k.add(new THREE.OctahedronGeometry(0.026), C.bone, 0, -0.09, 0);
  sk.k.add(frustumGeo(0.08, 0.03, 0.035, 1), ONYX_HI, 0, 0.085, 0);
  sk.k.plate(SAW, 0.008, 0.003, 0, 0.1, 0, C.saw, 0, Math.PI / 2, 0);
  sk.k.add(frustumGeo(0.01, 0.2, 0.012, 1), shade(PAL.blood, -0.2), 0, 0.25, 0.012);
  return h.finish(top);
}

export const plagueSurgeon: UnitDef = {
  build: surgeon,
  portrait: {
    pose: (rig) => {
      rig.armR!.rotation.set(-0.55, 0, 0.35);
      rig.armL!.rotation.set(-0.5, 0, -0.25);
      rig.body.rotation.y = 0.15;
      rig.legs[0]!.rotation.x = 0.2;
      rig.legs[1]!.rotation.x = -0.15;
      rig.neck!.rotation.set(0.2, -0.2, 0);
    },
    from: 0.38,
    to: 1.02,
    yaw: 0.45,
    faction: 'grave',
  },
};
