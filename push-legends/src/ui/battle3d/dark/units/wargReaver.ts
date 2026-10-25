import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { K, shapeFrom, type V } from '../../../base3d/sculpt';
import { addMesh, newRig, pivot, type Rig } from '../../rig';
import { metal } from '../parts';
import { along, chunkGeo, framePortraitOn, GlowBatch, lumpGeo, put, ragLite, segLine, SHADOW, spikeAB, Spine, table, tube, xf } from './_creatures';
import type { UnitDef } from './types';

/**
 * Warg Reaver (card: wolf_rider, common). A lean, scarred warg built for the charge: high hackled
 * shoulders, a tucked belly, long digitigrade legs, a low-slung head with its jaws pulled back over
 * yellowed fangs and a riveted iron chanfron with swept horns. Ragged fur bristles along its spine.
 * On its back a brutal raider in a wolf-pelt hood and iron mask, spiked crescent pauldrons and a
 * crimson saddle cloth, swinging a long bearded axe whose edge burns with an ember rune.
 * Accent: ember orange (eyes, axe rune).
 */
const FUR = '#4b433c';
const FUR_DK = '#2b2622';
const FUR_HI = '#70645a';
const FUR_TIP = '#978a7b';
const GUM = '#3e1013';
const TOOTH = PAL.bone;
const CLAW = PAL.boneDark;
const SCAR = '#7a6a62';
const IRON = metal('#2d3036', 0.72);
const IRON_DK = metal('#1b1c21', 0.62);
const STEEL = metal('#7d858e', 0.85);
const GOLD = PAL.gold;
const LEATHER = PAL.leather;
const LEATHER_DK = PAL.leatherDark;
const CLOTH = '#4a1014';
const EMBER = '#ff7a24';
const EYE = '#ff8a2a';

/** Tuft of ragged fur: a flattened cone from p along dir. */
function tuft(k: K, p: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, hex: string, roll = 0): void {
  const g = new THREE.ConeGeometry(r, len, 4, 1);
  g.translate(0, len / 2, 0);
  put(k, along(g, p, dir, roll, 1, 1, 0.45), hex);
}

/** A leg along a smooth spine with a clawed paw at its end (pivot-local). */
function legKit(k: K, pts: V[], rows: [number, number, number][], seed: number): void {
  const sp = new Spine(pts, (u) => table(u, rows), 24);
  put(k, sp.geo({ radial: 8, steps: 10, noise: 0.05, seed }), FUR);
  // Ragged fur at the back of the upper leg
  for (let i = 0; i < 3; i++) {
    const u = 0.08 + i * 0.09;
    tuft(k, sp.point(u, Math.PI + 0.3, -0.01), sp.normal(u, Math.PI).add(new THREE.Vector3(0, -0.6, -0.4)), 0.13, 0.04, i % 2 ? FUR_HI : FUR_DK, i);
  }
  const end = pts[pts.length - 1]!;
  // Paw and claws
  put(k, xf(lumpGeo(0.075, seed + 3, 0.12, 1), end[0], end[1] - 0.02, end[2] + 0.04, 0, 0, 0, 1.0, 0.6, 1.35), FUR_DK);
  for (let i = 0; i < 4; i++) {
    const x = end[0] + (i - 1.5) * 0.038;
    put(k, spikeAB([x, end[1] - 0.03, end[2] + 0.1], [x + (i - 1.5) * 0.01, end[1] - 0.07, end[2] + 0.19], 0.014, 4), CLAW);
  }
}

function headKit(k: K, gb: GlowBatch): void {
  // Pivot-local: the head points along +z from the neck joint, held low
  const skull = new Spine(
    [
      [0, 0.04, -0.02],
      [0, 0.04, 0.16],
      [0, 0.0, 0.36],
      [0, -0.03, 0.52],
    ],
    (u) => table(u, [
      [0, 0.12, 0.12],
      [0.3, 0.13, 0.11],
      [0.65, 0.075, 0.075],
      [1, 0.04, 0.045],
    ]),
    24,
  );
  put(k, skull.geo({ radial: 10, steps: 10, keel: 0.15, seed: 3 }), FUR);
  // Black nose
  k.ball(0.035, 0, -0.01, 0.53, SHADOW, 1.2, 0.8, 1);
  // Lower jaw dropped open
  const jaw = new Spine(
    [
      [0, -0.06, 0.06],
      [0, -0.13, 0.26],
      [0, -0.19, 0.44],
    ],
    (u) => table(u, [
      [0, 0.09, 0.05],
      [0.5, 0.065, 0.035],
      [1, 0.035, 0.025],
    ]),
    16,
  );
  put(k, jaw.geo({ radial: 10, steps: 8, seed: 4 }), FUR_DK);
  // Gums and throat inside the mouth
  put(k, xf(lumpGeo(0.1, 5, 0.05, 0), 0, -0.07, 0.26, -0.15, 0, 0, 0.55, 0.32, 1.9), GUM);
  // Upper teeth along the jaw edge and long fangs
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const u = 0.42 + i * 0.1;
      const p = skull.point(u, -Math.PI / 2 + s * 0.75, -0.004);
      put(k, spikeAB(p, [p.x, p.y - 0.045, p.z + 0.005], 0.011, 3), TOOTH);
    }
    const f = skull.point(0.9, -Math.PI / 2 + s * 0.6, -0.005);
    put(k, spikeAB(f, [f.x + s * 0.005, f.y - 0.11, f.z + 0.02], 0.018, 5), TOOTH);
    for (let i = 0; i < 4; i++) {
      const u = 0.35 + i * 0.17;
      const p = jaw.point(u, Math.PI / 2 - s * 0.75, -0.004);
      put(k, spikeAB(p, [p.x, p.y + 0.04, p.z - 0.004], 0.01, 3), TOOTH);
    }
    const lf = jaw.point(0.88, Math.PI / 2 - s * 0.55, -0.004);
    put(k, spikeAB(lf, [lf.x, lf.y + 0.075, lf.z - 0.01], 0.015, 5), TOOTH);
    // Snarl: wrinkled lip pulled back
    tube(k, [skull.point(0.45, -0.25 * s - (s < 0 ? Math.PI : 0), 0).toArray() as V, skull.point(0.7, -0.4 * s - (s < 0 ? Math.PI : 0), 0).toArray() as V, skull.point(0.92, -0.5 * s - (s < 0 ? Math.PI : 0), 0).toArray() as V], 0.012, 0.006, FUR_DK, 4);
    // Torn ears swept back
    const ear = new THREE.ConeGeometry(0.05, s > 0 ? 0.16 : 0.12, 4, 1);
    ear.translate(0, s > 0 ? 0.08 : 0.06, 0);
    put(k, along(ear, [s * 0.075, 0.12, 0.02], [s * 0.35, 0.55, -0.75], s * 0.4, 1, 1, 0.4), FUR_HI);
    // Heavy brow over burning eye slits
    k.add(new THREE.BoxGeometry(0.075, 0.026, 0.05), FUR_DK, s * 0.075, 0.085, 0.22, 0.2, s * 0.45, s * 0.35);
    k.add(new THREE.BoxGeometry(0.06, 0.02, 0.02), SHADOW, s * 0.08, 0.065, 0.235, 0, s * 0.55, s * 0.28);
    gb.add(new THREE.BoxGeometry(0.055, 0.016, 0.012), s * 0.081, 0.065, 0.243, 0, s * 0.55, s * 0.28);
    // Scars raked across the muzzle
    k.add(segLine([skull.point(0.38, 0.5 * s + (s < 0 ? Math.PI : 0), 0.004), skull.point(0.55, 0.15 * s + (s < 0 ? Math.PI : 0), 0.004), skull.point(0.66, -0.15 * s + (s < 0 ? Math.PI : 0), 0.004)], 0.005, 0.003, 3), SCAR, 0, 0, 0);
  }
  // Riveted iron chanfron over the skull and the bridge of the muzzle
  put(k, skull.geo({ u0: 0.05, u1: 0.78, radial: 8, steps: 8, arc: [0.55, Math.PI - 0.55], out: 0.016, keel: 0.3 }), IRON);
  put(k, skull.geo({ u0: 0.05, u1: 0.78, radial: 2, steps: 8, arc: [0.5, 0.62], out: 0.02 }), GOLD);
  put(k, skull.geo({ u0: 0.05, u1: 0.78, radial: 2, steps: 8, arc: [Math.PI - 0.62, Math.PI - 0.5], out: 0.02 }), GOLD);
  for (let i = 0; i < 3; i++) {
    const p = skull.point(0.18 + i * 0.2, Math.PI / 2, 0.02);
    put(k, spikeAB(p, [p.x, p.y + 0.07 - i * 0.015, p.z - 0.04], 0.018, 4), IRON_DK);
  }
  // Swept horns from the back of the plate
  for (const s of [-1, 1]) {
    tube(k, 
      [
        [s * 0.07, 0.13, 0.08],
        [s * 0.14, 0.2, -0.04],
        [s * 0.17, 0.22, -0.2],
        [s * 0.15, 0.3, -0.3],
      ],
      0.026,
      0.004,
      IRON_DK,
      5,
    );
    k.ball(0.014, s * 0.09, 0.11, 0.2, GOLD, 1, 1, 1, 5);
  }
}

/** The raider (rider-local: hips at the origin, facing +z). */
function riderKit(k: K, gb: GlowBatch): void {
  const torso = new Spine(
    [
      [0, 0, 0],
      [0, 0.26, 0.03],
      [0, 0.5, -0.01],
    ],
    (u) => table(u, [
      [0, 0.16, 0.12],
      [0.55, 0.22, 0.15],
      [1, 0.23, 0.13],
    ]),
    16,
  );
  put(k, torso.geo({ radial: 12, steps: 8 }), LEATHER);
  // Blackened iron breastplate with a gold-edged ridge
  put(k, torso.geo({ u0: 0.3, u1: 0.95, radial: 8, steps: 6, arc: [0.25, Math.PI - 0.25], out: 0.018, keel: 0.0 }), IRON);
  k.add(new THREE.CylinderGeometry(0.008, 0.012, 0.3, 4), GOLD, 0, 0.36, 0.15, -0.05, 0, 0);
  // Belt with a skull buckle
  k.add(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 12), LEATHER_DK, 0, 0.06, 0.0, 0, 0, 0, 1, 1, 0.75);
  k.ball(0.03, 0, 0.06, 0.13, TOOTH, 1, 1.1, 0.8, 8);
  for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.012, 0.01, 0.01), SHADOW, s * 0.012, 0.067, 0.153);
  // Seated legs along the warg's flanks
  for (const s of [-1, 1]) {
    const leg = new Spine(
      [
        [s * 0.1, 0.0, 0.0],
        [s * 0.23, -0.04, 0.22],
        [s * 0.27, -0.24, 0.24],
        [s * 0.28, -0.42, 0.2],
      ],
      (u) => table(u, [
        [0, 0.08, 0.08],
        [0.5, 0.06, 0.06],
        [1, 0.05, 0.05],
      ]),
      16,
    );
    put(k, leg.geo({ radial: 7, steps: 8 }), LEATHER_DK);
    // Iron knee cop and boot
    k.add(new THREE.SphereGeometry(0.06, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), IRON, s * 0.245, -0.07, 0.27, Math.PI / 2 - 0.4, 0, 0);
    put(k, xf(lumpGeo(0.06, 20 + s, 0.08, 0), s * 0.285, -0.44, 0.24, 0, 0, 0, 0.9, 0.8, 1.6), IRON_DK);
  }
  // Fur mantle heaped over the shoulders
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * Math.PI * 1.4 - Math.PI * 0.2;
    const p = new THREE.Vector3(Math.cos(a) * 0.17, 0.52, -Math.sin(a) * 0.1 - 0.02);
    tuft(k, p, new THREE.Vector3(Math.cos(a) * 0.6, -0.4, -Math.sin(a) * 0.5 - 0.3), 0.16, 0.06, i % 2 ? FUR_HI : FUR_TIP, i);
  }
  put(k, xf(lumpGeo(0.17, 31, 0.15, 1), 0, 0.52, -0.04, 0, 0, 0, 1.45, 0.45, 0.9), FUR_HI);
  // Head: a crested black iron helm with a jutting pointed visor, one narrow ember slit and
  // horns hooking forward; the wolf pelt is worn as a cowl behind it
  const hy = 0.72;
  k.ball(0.1, 0, hy, 0.0, SHADOW, 1, 1.05, 1.05, 7);
  k.lathe(
    [
      [0.118, -0.11],
      [0.128, -0.02],
      [0.12, 0.06],
      [0.09, 0.12],
      [0.04, 0.165],
      [0.001, 0.18],
    ],
    0,
    hy,
    -0.01,
    IRON,
    10,
    0.95,
    1.12,
  );
  // Raised crest running front to back, gold-edged
  const crest = shapeFrom([
    [-0.15, 0],
    [-0.12, 0.06],
    [-0.02, 0.1],
    [0.08, 0.13],
    [0.13, 0.07],
    [0.14, 0],
  ]);
  k.plate(crest, 0.022, 0.004, 0, hy + 0.12, -0.02, IRON_DK, 0, -Math.PI / 2, 0);
  k.add(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 4), GOLD, 0, hy + 0.19, -0.02, Math.PI / 2 - 0.25, 0, 0);
  // Pointed visor jutting forward like a beak, cheek guards flaring down
  k.add(new THREE.ConeGeometry(0.105, 0.2, 4, 1), IRON_DK, 0, hy - 0.035, 0.11, Math.PI / 2 + 0.12, Math.PI / 4, 0, 1, 1, 0.7);
  for (const sd of [-1, 1]) put(k, xf(chunkGeo(0.03, 0.15, 0.13, 70 + sd, { chamfer: 0.5, jitter: 0.02, top: 1.4 }), sd * 0.11, hy - 0.07, 0.04, 0.15, sd * 0.25, sd * 0.12), IRON);
  k.add(new THREE.BoxGeometry(0.16, 0.022, 0.03), SHADOW, 0, hy + 0.025, 0.115, 0.1, 0, 0);
  gb.add(new THREE.BoxGeometry(0.14, 0.011, 0.01), 0, hy + 0.025, 0.133, 0.1, 0, 0);
  k.add(new THREE.TorusGeometry(0.126, 0.008, 3, 14), GOLD, 0, hy + 0.035, -0.01, Math.PI / 2, 0, 0, 0.95, 1.12, 1);
  // Horns: thick at the temples, hooking forward
  for (const sd of [-1, 1]) {
    tube(k, [[sd * 0.11, hy + 0.06, -0.02], [sd * 0.21, hy + 0.1, -0.04], [sd * 0.27, hy + 0.2, 0.02], [sd * 0.25, hy + 0.3, 0.12]], 0.032, 0.004, TOOTH, 5, 6);
    k.add(new THREE.TorusGeometry(0.034, 0.008, 3, 8), IRON_DK, sd * 0.13, hy + 0.065, -0.025, 0, Math.PI / 2, 0);
  }
  // Wolf pelt cowl: hide draped behind the helm and down the back, ragged at the edges
  k.add(new THREE.LatheGeometry([[0.17, -0.2], [0.17, -0.06], [0.155, 0.05], [0.12, 0.13], [0.06, 0.18]].map(([r, y]) => new THREE.Vector2(r, y)), 10, Math.PI * 0.55, Math.PI * 0.9), FUR, 0, hy, -0.04);
  for (let i = 0; i < 6; i++) tuft(k, new THREE.Vector3((i - 2.5) * 0.06, hy - 0.02, -0.17), new THREE.Vector3((i - 2.5) * 0.18, -1, -0.3), 0.2, 0.05, i % 2 ? FUR_HI : FUR_TIP, i);
  for (const sd of [-1, 1]) put(k, spikeAB([sd * 0.08, hy + 0.15, -0.12], [sd * 0.12, hy + 0.27, -0.18], 0.03, 4, 0.4), FUR_HI);
}

/** Arm from the shoulder pivot down to the hand (y −0.56); s = +1 right. */
function riderArm(k: K, s: number): void {
  const arm = new Spine(
    [
      [0, 0, 0],
      [s * 0.02, -0.26, -0.01],
      [0, -0.52, 0.02],
    ],
    (u) => table(u, [
      [0, 0.065, 0.065],
      [0.5, 0.05, 0.05],
      [1, 0.042, 0.042],
    ]),
    12,
  );
  put(k, arm.geo({ radial: 8, steps: 6 }), LEATHER_DK);
  // Iron bracer and gauntlet
  k.add(new THREE.CylinderGeometry(0.052, 0.058, 0.2, 8), IRON, 0, -0.42, 0.01);
  k.add(new THREE.TorusGeometry(0.056, 0.006, 3, 8), GOLD, 0, -0.33, 0.01, Math.PI / 2, 0, 0);
  put(k, xf(lumpGeo(0.055, 40 + s, 0.1, 0), 0, -0.57, 0.02, 0, 0, 0, 0.9, 1.1, 1.0), IRON_DK);
  // Spiked crescent pauldron
  k.add(new THREE.SphereGeometry(0.11, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), IRON, s * 0.02, 0.0, 0, 0, 0, -s * 0.3, 1.15, 0.8, 1.2);
  k.add(new THREE.TorusGeometry(0.115, 0.007, 3, 12), GOLD, s * 0.02, 0.0, 0, Math.PI / 2, 0, -s * 0.3);
  k.add(new THREE.SphereGeometry(0.1, 8, 2, 0, Math.PI * 2, 0, Math.PI * 0.4), IRON_DK, s * 0.04, -0.06, 0, 0, 0, -s * 0.45, 1.1, 0.6, 1.15);
  tube(k, 
    [
      [s * 0.06, 0.05, 0.04],
      [s * 0.15, 0.1, 0.0],
      [s * 0.22, 0.16, -0.06],
      [s * 0.24, 0.24, -0.1],
    ],
    0.024,
    0.003,
    IRON_DK,
    5,
  );
  tube(k, 
    [
      [s * 0.07, 0.03, -0.06],
      [s * 0.16, 0.05, -0.1],
      [s * 0.23, 0.1, -0.16],
    ],
    0.018,
    0.003,
    IRON_DK,
    5,
  );
}

/** Long bearded axe along +y from the grip. */
function axeKit(k: K, gb: GlowBatch): void {
  k.add(new THREE.CylinderGeometry(0.018, 0.022, 1.0, 6), PAL.wood, 0, 0.32, 0);
  for (let i = 0; i < 4; i++) k.add(new THREE.TorusGeometry(0.022, 0.006, 3, 6), LEATHER_DK, 0, -0.1 + i * 0.045, 0, Math.PI / 2, 0, 0);
  k.add(new THREE.OctahedronGeometry(0.03), IRON_DK, 0, -0.2, 0, 0, 0, 0, 1, 1.4, 1);
  // Bearded blade: a long crescent edge hooking down below the socket
  const blade = shapeFrom([
    [0.0, 0.07],
    [0.1, 0.1],
    [0.2, 0.17],
    [0.27, 0.13],
    [0.29, 0.0],
    [0.27, -0.14],
    [0.21, -0.26],
    [0.14, -0.3],
    [0.1, -0.2],
    [0.06, -0.08],
    [0.0, -0.05],
  ]);
  k.plate(blade, 0.022, 0.006, 0.015, 0.74, 0, STEEL);
  // Notches hacked into the edge
  for (const [y, x] of [
    [0.06, 0.285],
    [-0.1, 0.27],
  ] as const)
    k.add(new THREE.BoxGeometry(0.03, 0.012, 0.04), SHADOW, 0.015 + x, 0.74 + y, 0, 0, 0, 0.4);
  // Dark socket and a back spike
  k.add(new THREE.CylinderGeometry(0.032, 0.032, 0.18, 6), IRON_DK, 0, 0.76, 0);
  put(k, spikeAB([-0.02, 0.76, 0], [-0.17, 0.72, 0], 0.03, 4), IRON_DK);
  put(k, spikeAB([0, 0.84, 0], [0, 0.96, 0], 0.022, 4), IRON_DK);
  // Ember rune burning along the edge
  const e: V[] = [
    [0.21, 0.88, 0],
    [0.255, 0.8, 0],
    [0.265, 0.68, 0],
    [0.23, 0.55, 0],
  ];
  for (const z of [-0.016, 0.016]) gb.add(segLine(e.map((q) => [q[0], q[1], z] as V), 0.006, 0.004, 3));
}

function build(): Rig {
  const rig = newRig('quad', 'melee');
  const body = rig.body;
  const k = new K();
  const gb = new GlowBatch();

  // --- The warg --------------------------------------------------------------------------------
  // Spine from the rump to the withers: deep chest, tucked belly, shoulders higher than the hips
  const sp = new Spine(
    [
      [0, 0.86, -0.68],
      [0, 0.9, -0.28],
      [0, 0.88, 0.14],
      [0, 0.99, 0.5],
    ],
    (u) => table(u, [
      [0, 0.2, 0.21],
      [0.15, 0.23, 0.23],
      [0.42, 0.18, 0.17],
      [0.72, 0.27, 0.32],
      [1, 0.22, 0.24],
    ]),
    40,
  );
  put(k, sp.geo({ radial: 12, steps: 14, keel: 0.12, noise: 0.05, seed: 11 }), FUR);
  // Neck reaching forward and down to the head
  const nk = new Spine(
    [
      [0, 0.97, 0.38],
      [0, 1.05, 0.62],
      [0, 1.01, 0.82],
    ],
    (u) => table(u, [
      [0, 0.21, 0.24],
      [1, 0.14, 0.15],
    ]),
    16,
  );
  put(k, nk.geo({ radial: 12, steps: 8, noise: 0.06, seed: 12 }), FUR);
  // Hackles: ragged fur bristling along the spine and the neck
  for (let i = 0; i < 14; i++) {
    const u = 0.3 + i * 0.05;
    const s = u < 1 ? sp : nk;
    const uu = u < 1 ? u : (u - 1) * 2.4;
    const p = s.point(Math.min(1, uu), Math.PI / 2 + (i % 2 ? 0.25 : -0.25), -0.02);
    const dir = s.frame(Math.min(1, uu)).t.multiplyScalar(-0.9).add(new THREE.Vector3((i % 2 ? 0.25 : -0.25), 0.75, 0));
    tuft(k, p, dir, 0.16 + (i % 3) * 0.05, 0.05, i % 3 === 0 ? FUR_TIP : i % 2 ? FUR_HI : FUR_DK, i);
  }
  // Mane on the sides of the neck and fringe under the chest
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const p = nk.point(0.15 + i * 0.17, s > 0 ? 0.2 : Math.PI - 0.2, -0.02);
      tuft(k, p, new THREE.Vector3(s * 0.6, 0.1, -0.8), 0.15, 0.05, i % 2 ? FUR_HI : FUR_TIP, i);
    }
    for (let i = 0; i < 4; i++) {
      const p = sp.point(0.62 + i * 0.07, -Math.PI / 2 + s * 0.4, -0.02);
      tuft(k, p, new THREE.Vector3(s * 0.2, -1, -0.35), 0.14, 0.045, i % 2 ? FUR_DK : FUR_HI, i);
    }
    // Ribs showing through the lean flank, and scars
    for (let i = 0; i < 3; i++) tube(k, [sp.point(0.5 + i * 0.06, s > 0 ? 0.55 : Math.PI - 0.55, 0.0).toArray() as V, sp.point(0.53 + i * 0.06, s > 0 ? 0 : Math.PI, 0.008).toArray() as V, sp.point(0.55 + i * 0.06, s > 0 ? -0.5 : Math.PI + 0.5, 0).toArray() as V], 0.012, 0.008, FUR_DK, 4, 4);
    k.add(segLine([sp.point(0.18, s > 0 ? 0.6 : Math.PI - 0.6, 0.006), sp.point(0.27, s > 0 ? 0.1 : Math.PI - 0.1, 0.006), sp.point(0.33, s > 0 ? -0.2 : Math.PI + 0.2, 0.006)], 0.007, 0.004, 3), SCAR, 0, 0, 0);
  }
  // Tail: ragged and drooping
  const tail = new Spine(
    [
      [0, 0.96, -0.72],
      [0, 0.88, -0.98],
      [0, 0.68, -1.14],
      [0, 0.5, -1.18],
    ],
    (u) => table(u, [
      [0, 0.07, 0.07],
      [0.5, 0.055, 0.055],
      [1, 0.015, 0.015],
    ]),
    16,
  );
  put(k, tail.geo({ radial: 7, steps: 8, noise: 0.1, seed: 13 }), FUR_DK);
  for (let i = 0; i < 6; i++) {
    const u = 0.2 + i * 0.13;
    tuft(k, tail.point(u, (i * 2.1) % (Math.PI * 2), -0.01), tail.frame(u).t.add(tail.normal(u, (i * 2.1) % (Math.PI * 2)).multiplyScalar(0.6)), 0.14, 0.04, i % 2 ? FUR_HI : FUR_TIP, i);
  }
  // Spiked iron collar at the base of the neck
  k.add(new THREE.TorusGeometry(0.19, 0.03, 4, 12), IRON, 0, 1.01, 0.62, -0.25, 0, 0, 1, 1.15, 1);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const p: V = [Math.cos(a) * 0.2, 1.01 + Math.sin(a) * 0.23 * Math.cos(0.25), 0.62 + Math.sin(a) * 0.23 * Math.sin(0.25)];
    put(k, spikeAB(p, [Math.cos(a) * 0.31, p[1] + Math.sin(a) * 0.12, p[2] + 0.02], 0.02, 4), IRON_DK);
  }
  // Iron chest plate over the breastbone
  put(k, sp.geo({ u0: 0.74, u1: 0.98, radial: 6, steps: 4, arc: [-Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9], out: 0.025 }), IRON);
  // Saddle: leather seat, iron rim, crimson cloth hanging down both flanks with a hide skull trophy
  put(k, sp.geo({ u0: 0.48, u1: 0.72, radial: 8, steps: 4, arc: [0.15, Math.PI - 0.15], out: 0.025 }), LEATHER_DK);
  k.add(new THREE.TorusGeometry(0.1, 0.02, 4, 10, Math.PI), IRON, 0, 1.11, 0.24, 0, 0, 0, 1.4, 1, 1);
  k.add(new THREE.TorusGeometry(0.1, 0.02, 4, 10, Math.PI), IRON, 0, 1.09, -0.17, 0, 0, 0, 1.6, 1, 1);
  for (const s of [-1, 1]) {
    const p = sp.point(0.6, s > 0 ? 0.35 : Math.PI - 0.35, 0.03);
    put(k, xf(xf(ragLite(0.38, 0.36, { seed: 7 + s, tatter: 0.35 }), 0, 0, 0, -0.3), p.x, p.y, p.z, 0, (s * Math.PI) / 2, 0), CLOTH);
    put(k, xf(xf(new THREE.BoxGeometry(0.4, 0.025, 0.012), 0, -0.01, 0.006, -0.3), p.x, p.y, p.z, 0, (s * Math.PI) / 2, 0), GOLD);
  }
  k.ball(0.05, -0.28, 0.75, -0.08, TOOTH, 1, 1.1, 1.2, 8);
  for (const z of [-0.02, 0.02]) k.add(new THREE.BoxGeometry(0.02, 0.022, 0.02), SHADOW, -0.325, 0.765, -0.08 + z * 1.4);

  // --- Head on the neck pivot ------------------------------------------------------------------
  const neck = pivot(body, 0, 1.02, 0.8);
  rig.neck = neck;
  rig.head = neck;
  neck.rotation.x = 0.12;
  neck.scale.setScalar(1.28);
  const hk = new K();
  const hg = new GlowBatch();
  headKit(hk, hg);
  addMesh(rig, neck, hk);
  hg.flush(neck, EYE, 7);

  // --- Legs: front pair straight and long, hind pair bent at the hock --------------------------
  const legDefs: [number, number, number, boolean][] = [
    [-0.16, 0.88, 0.34, true],
    [0.16, 0.88, 0.34, true],
    [-0.16, 0.86, -0.52, false],
    [0.16, 0.86, -0.52, false],
  ];
  legDefs.forEach(([x, y, z, front], i) => {
    const lp = pivot(body, x, y, z);
    const lk = new K();
    const s = Math.sign(x);
    if (front)
      legKit(
        lk,
        [
          [s * 0.02, 0.04, -0.02],
          [s * 0.03, -0.31, -0.07],
          [s * 0.01, -0.67, 0.0],
          [0, -0.82, 0.04],
        ],
        [
          [0, 0.15, 0.17],
          [0.35, 0.095, 0.1],
          [0.75, 0.055, 0.06],
          [1, 0.055, 0.055],
        ],
        50 + i,
      );
    else
      legKit(
        lk,
        [
          [s * 0.02, 0.02, 0.03],
          [s * 0.03, -0.26, 0.14],
          [s * 0.02, -0.54, -0.11],
          [0, -0.8, -0.04],
        ],
        [
          [0, 0.18, 0.2],
          [0.35, 0.11, 0.115],
          [0.7, 0.055, 0.06],
          [1, 0.05, 0.05],
        ],
        60 + i,
      );
    addMesh(rig, lp, lk);
    rig.legs.push(lp);
  });

  // --- The raider ------------------------------------------------------------------------------
  const rider = pivot(body, 0, 1.13, -0.04);
  rider.rotation.x = 0.18;
  rider.scale.setScalar(0.8);
  const rk = new K();
  riderKit(rk, gb);
  for (const s of [1, -1]) {
    const ap = pivot(rider, s * 0.25, 0.47, 0);
    const ak = new K();
    riderArm(ak, s);
    addMesh(rig, ap, ak);
    const hand = pivot(ap, 0, -0.58, 0.02);
    if (s === 1) {
      rig.armR = ap;
      const wg = pivot(hand, 0, 0, 0);
      wg.rotation.x = 1.05;
      const wk = new K();
      const wgb = new GlowBatch();
      axeKit(wk, wgb);
      addMesh(rig, wg, wk);
      wgb.flush(wg, EMBER, 5);
    } else {
      rig.armL = ap;
      // Reins of chain running to the collar
      const ck = new K();
      for (let i = 0; i < 4; i++) ck.add(new THREE.TorusGeometry(0.022, 0.006, 3, 6), IRON_DK, 0, -0.02 - i * 0.035, 0.03 + i * 0.03, 0, i % 2 ? Math.PI / 2 : 0, 0);
      addMesh(rig, hand, ck);
    }
  }
  addMesh(rig, rider, rk);
  gb.flush(rider, EYE, 7);

  addMesh(rig, body, k);
  rig.height = 1.95;
  rig.presence = 1.2;
  return rig;
}

export const wargReaver: UnitDef = {
  build,
  portrait: {
    faction: 'wild',
    from: 0,
    to: 1,
    yaw: 0.55,
    pose: (rig) => {
      rig.armR?.rotation.set(-2.5, 0, 0.25);
      rig.armL?.rotation.set(-0.6, 0, -0.2);
      rig.neck?.rotation.set(0.05, -0.25, 0);
      rig.legs.forEach((l, i) => (l.rotation.x = [0.35, -0.2, -0.3, 0.25][i]!));
      rig.body.rotation.x = -0.06;
      // Close on the snarling head and the raider; the hindquarters run out of the shot
      const rider = rig.armR?.parent;
      if (rig.neck && rider) framePortraitOn(rig, [rig.neck, rider], [0.15, 0.35, 0.05]);
    },
  },
};
