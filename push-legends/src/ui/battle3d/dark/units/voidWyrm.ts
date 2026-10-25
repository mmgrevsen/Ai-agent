import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { K, shapeFrom, type V } from '../../../base3d/sculpt';
import { addMesh, newRig, pivot, type Rig } from '../../rig';
import { metal } from '../parts';
import { chunkGeo, framePortraitOn, GlowBatch, jagged, lumpGeo, membraneGeo, put, segLine, SHADOW, spikeAB, Spine, table, tube, xf } from './_creatures';
import type { UnitDef } from './types';

/**
 * The Void Wyrm (card: aurora_drake, mythic). A legend from where the stars went out: a long,
 * lean wyvern of glossy obsidian scale plates with violet void-light burning in every seam, a
 * horned skull-like head (a bone mask over the snout, a crown of swept-back horns, slit eyes of
 * white-hot violet and a throat full of void fire), a ridge of bone spikes from crown to tail, a
 * whip tail ending in a bone glaive, and vast tattered membrane wings on skeletal fingers veined
 * with violet light. Accent: void violet.
 */
const SCALE = metal('#1b1921', 0.5);
const SCALE_HI = metal('#2c2833', 0.52);
const SCALE_DK = '#110f15';
const BELLY = '#2a2430';
const BONE = PAL.bone;
const BONE_DK = PAL.boneDark;
const BONE_SH = '#5e5546';
const HORN = '#3a3430';
const MEMBRANE = '#221a28';
const MEMBRANE_HI = '#2e2236';
const GUM = '#2a0f22';
const VOID = PAL.void2;
const VOID_HOT = '#d9b8ff';

/** Saw-tooth flare: overlapping scale bands along a spine (raised edge towards the tail). */
const bands = (n: number, amp: number, tailUp: boolean) => (u: number) => {
  const f = (u * n) % 1;
  return 1 + amp * (tailUp ? f : 1 - f);
};

/** Glowing seams between scale bands: arcs over the back at band boundaries. */
function seams(gb: GlowBatch, sp: Spine, us: number[], r: number, a0 = 0.2, a1 = Math.PI - 0.2, out = 0.004): void {
  for (const u of us) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) pts.push(sp.point(u, a0 + ((a1 - a0) * i) / 6, out));
    gb.add(segLine(pts, r, r, 3));
  }
}

/** Bone spikes along the top of a spine, swept back (dir −1: towards lower u). */
function ridge(k: K, sp: Spine, us: number[], h: (u: number) => number, back: number, hexes: string[], r = 0.035): void {
  us.forEach((u, i) => {
    const f = sp.frame(u);
    const base = sp.point(u, Math.PI / 2, -0.02);
    const hh = h(u);
    const tip = base.clone().add(f.n.clone().multiplyScalar(hh)).add(f.t.clone().multiplyScalar(back * hh * 0.75));
    put(k, spikeAB(base, tip, r * (0.5 + hh * 1.6), 5, 0.5), hexes[i % hexes.length]!);
  });
}

function headKit(k: K, eye: GlowBatch, gb: GlowBatch): void {
  // Upper skull and a long wedge snout (pivot-local, facing +z): wide and flat, ridged on top
  const skull = new Spine(
    [
      [0, 0.04, -0.1],
      [0, 0.05, 0.1],
      [0, 0.01, 0.34],
      [0, -0.04, 0.6],
    ],
    (u) => table(u, [
      [0, 0.12, 0.1],
      [0.22, 0.13, 0.095],
      [0.55, 0.085, 0.06],
      [1, 0.045, 0.03],
    ]),
    24,
  );
  put(k, skull.geo({ radial: 12, steps: 12, keel: 0.45, belly: 0.5 }), SCALE);
  // Bone nasal ridge and cheek plates: the skull shows through the scales
  put(k, skull.geo({ u0: 0.34, u1: 0.99, radial: 3, steps: 7, arc: [1.3, Math.PI - 1.3], out: 0.01, keel: 0.5 }), BONE_SH);
  // Bone spurs along the cheeks, swept back
  for (const s of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const p = skull.point(0.3 + i * 0.13, s > 0 ? 0.25 : Math.PI - 0.25, -0.01);
      put(k, spikeAB(p, [p.x + s * 0.04, p.y + 0.02, p.z - 0.09], 0.014, 4), i % 2 ? BONE_SH : BONE_DK);
    }
  // Nostril pits
  for (const s of [-1, 1]) k.ball(0.013, s * 0.03, -0.01, 0.585, SHADOW, 1.3, 0.7, 1, 5);
  // Lower jaw hanging open, armoured in plates
  const jaw = new Spine(
    [
      [0, -0.05, -0.06],
      [0, -0.1, 0.18],
      [0, -0.16, 0.4],
      [0, -0.2, 0.53],
    ],
    (u) => table(u, [
      [0, 0.1, 0.05],
      [0.5, 0.068, 0.035],
      [1, 0.028, 0.018],
    ]),
    16,
  );
  put(k, jaw.geo({ radial: 10, steps: 8 }), SCALE_DK);
  put(k, jaw.geo({ u0: 0.1, u1: 0.95, radial: 5, steps: 6, arc: [-Math.PI + 0.6, -0.6], out: 0.006 }), BONE_SH);
  // Gullet: dark gum, void fire breathing deep in the throat
  put(k, xf(lumpGeo(0.07, 31, 0.1, 1), 0, -0.07, 0.14, 0, 0, 0, 1, 0.6, 1.8), GUM);
  gb.add(new THREE.SphereGeometry(0.04, 8, 6), 0, -0.08, 0.16, 0, 0, 0, 0.9, 0.5, 1.8);
  // Teeth: long fangs along both jaws
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const u = 0.28 + i * 0.13;
      const p = skull.point(u, s > 0 ? -0.3 : Math.PI + 0.3, -0.01);
      const len = i === 4 ? 0.08 : 0.042 - i * 0.003;
      put(k, spikeAB(p, [p.x, p.y - len, p.z + 0.008], i === 4 ? 0.014 : 0.01, 4), BONE);
    }
    for (let i = 0; i < 4; i++) {
      const u = 0.3 + i * 0.18;
      const p = jaw.point(u, s > 0 ? 0.5 : Math.PI - 0.5, -0.006);
      put(k, spikeAB(p, [p.x, p.y + 0.035 + (i === 2 ? 0.03 : 0), p.z - 0.004], 0.009, 4), BONE);
    }
  }
  // Brows: heavy angled bone ridges over sunken sockets with narrow slit eyes of void light
  for (const s of [-1, 1]) {
    k.ball(0.035, s * 0.092, 0.06, 0.2, SHADOW, 1.4, 0.55, 1, 8);
    put(k, xf(chunkGeo(0.15, 0.045, 0.13, 12 + s, { chamfer: 0.5, jitter: 0.05, top: 0.75 }), s * 0.09, 0.105, 0.19, 0.2, s * 0.3, s * 0.42), BONE_DK);
    put(k, spikeAB([s * 0.12, 0.11, 0.14], [s * 0.2, 0.15, 0.02], 0.025, 4), BONE_DK);
    eye.add(new THREE.BoxGeometry(0.07, 0.012, 0.012), s * 0.096, 0.066, 0.226, 0, s * 0.5, s * 0.3);
  }
  // Crown: two great horns sweeping back and up, a lower pair flaring out, a crest of spikes
  for (const s of [-1, 1]) {
    tube(k, [[s * 0.08, 0.12, 0.0], [s * 0.17, 0.2, -0.16], [s * 0.22, 0.24, -0.4], [s * 0.18, 0.37, -0.62]], 0.052, 0.004, HORN, 6, 8);
    tube(k, [[s * 0.081, 0.121, -0.02], [s * 0.172, 0.205, -0.17], [s * 0.224, 0.245, -0.4], [s * 0.184, 0.372, -0.62]], 0.031, 0.003, BONE_DK, 4, 8);
    tube(k, [[s * 0.11, 0.0, -0.04], [s * 0.24, -0.02, -0.16], [s * 0.34, 0.05, -0.32]], 0.036, 0.003, BONE_DK, 6, 6);
    // Spiked frill along the jaw hinge
    for (let i = 0; i < 3; i++) put(k, spikeAB([s * 0.1, -0.03 - i * 0.03, -0.04 - i * 0.02], [s * (0.2 + i * 0.02), -0.08 - i * 0.05, -0.18 - i * 0.04], 0.018, 4), i % 2 ? BONE_DK : HORN);
  }
  for (let i = 0; i < 4; i++) put(k, spikeAB([0, 0.13 - i * 0.004, 0.1 - i * 0.07], [0, 0.2 - i * 0.01, 0.0 - i * 0.1], 0.02, 4), i % 2 ? BONE_DK : BONE);
  // Void light leaking through cracks in the bone ridge
  gb.add(segLine(jagged([0.015, 0.06, 0.33], [0.03, 0.035, 0.5], 3, 0.012, 7), 0.0035, 0.002, 3));
  gb.add(segLine(jagged([-0.02, 0.055, 0.38], [-0.045, 0.03, 0.47], 2, 0.01, 9), 0.003, 0.002, 3));
}

/**
 * Right wing in pivot space (+x outwards): skeletal arm and four fingers with torn membrane
 * between them, veined with void light. The left wing mirrors it.
 */
function wingKit(k: K, gb: GlowBatch, seed: number): void {
  const S: V = [0, 0, 0];
  const E: V = [0.5, 0.18, -0.14];
  const W: V = [0.98, 0.24, 0.1];
  const fingers: V[][] = [
    [W, [1.42, 0.26, 0.1], [1.92, 0.16, -0.12]],
    [W, [1.38, 0.18, -0.24], [1.76, 0.06, -0.64]],
    [W, [1.16, 0.12, -0.46], [1.3, 0.0, -1.0]],
    [W, [0.9, 0.1, -0.46], [0.74, -0.02, -0.98]],
  ];
  // Membranes: between the fingers, and from the last finger back to the flank
  const sag = 0.035;
  put(k, membraneGeo(fingers, { scallop: 0.26, tatter: 0.1, holes: 0.14, seed, cols: 4, rows: 6, sag }), MEMBRANE);
  put(k, membraneGeo([[S, E, W, fingers[3]![1], fingers[3]![2]], [S, [0.0, -0.02, -0.32], [0.04, -0.06, -0.7]]], { scallop: 0.22, tatter: 0.08, holes: 0.08, seed: seed + 3, cols: 4, rows: 7, sag: 0.03 }), MEMBRANE_HI);
  // Bones: obsidian with bone-white knuckles and claws
  tube(k, [S, [0.25, 0.12, -0.06], E], 0.06, 0.04, SCALE, 7, 6);
  tube(k, [E, [0.74, 0.24, -0.04], W], 0.042, 0.032, SCALE, 6, 6);
  for (const f of fingers) tube(k, f, 0.026, 0.005, SCALE_HI, 5, 7);
  put(k, xf(lumpGeo(0.07, 5, 0.15, 0), E[0], E[1], E[2]), SCALE_HI);
  put(k, xf(lumpGeo(0.06, 6, 0.15, 0), W[0], W[1], W[2]), SCALE_HI);
  // Elbow spike and the hooked thumb claw at the wrist
  put(k, spikeAB(E, [E[0] - 0.05, E[1] + 0.2, E[2] - 0.2], 0.035, 5), BONE_DK);
  tube(k, [W, [1.02, 0.34, 0.2], [0.98, 0.32, 0.32]], 0.03, 0.003, BONE, 5, 5);
  // Bone spurs along the leading edge
  for (let i = 0; i < 3; i++) {
    const t = 0.3 + i * 0.25;
    const p: V = [S[0] + (E[0] - S[0]) * t, S[1] + (E[1] - S[1]) * t + 0.03, S[2] + (E[2] - S[2]) * t];
    put(k, spikeAB(p, [p[0] - 0.04, p[1] + 0.09, p[2] - 0.1], 0.018, 4), BONE_DK);
  }
  // Talon at each finger tip
  for (const f of fingers.slice(0, 3)) {
    const a = f[1]!;
    const b = f[2]!;
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(d[0]!, d[1]!, d[2]!);
    put(k, spikeAB(b, [b[0] + (d[0]! / l) * 0.12, b[1] + (d[1]! / l) * 0.12 - 0.02, b[2] + (d[2]! / l) * 0.12], 0.014, 4), BONE);
  }
  // Void veins: branching lines of light through each membrane panel
  for (let g = 0; g < fingers.length - 1; g++) {
    const A = new THREE.CatmullRomCurve3(fingers[g]!.map((q) => new THREE.Vector3(...q)));
    const B = new THREE.CatmullRomCurve3(fingers[g + 1]!.map((q) => new THREE.Vector3(...q)));
    const pts: THREE.Vector3[] = [];
    for (let i = 1; i <= 5; i++) {
      const v = (i / 5) * 0.78;
      const u = 0.5 + Math.sin(i * 1.7 + g) * 0.1;
      const p = A.getPointAt(v).lerp(B.getPointAt(v), u);
      p.y -= Math.sin(Math.PI * u) * sag * (0.3 + v);
      pts.push(p);
    }
    gb.add(segLine(pts, 0.007, 0.003, 3));
    // A side branch
    const m = pts[2]!;
    const e = A.getPointAt(0.7).lerp(B.getPointAt(0.7), 0.2);
    e.y -= Math.sin(Math.PI * 0.2) * sag * 1.0;
    gb.add(segLine([m, m.clone().lerp(e, 0.5).add(new THREE.Vector3(0, 0.004, 0.02)), e], 0.005, 0.002, 3));
  }
  // Veins along the arm membrane
  gb.add(segLine([[0.12, 0.02, -0.06], [0.3, 0.04, -0.3], [0.45, 0.03, -0.55], [0.55, 0.0, -0.78]], 0.006, 0.002, 3));
  gb.add(segLine([[0.45, 0.13, -0.14], [0.62, 0.1, -0.4], [0.66, 0.05, -0.7]], 0.005, 0.002, 3));
}

function legKit(k: K, s: number): void {
  // Hind leg folded back under the body, talons hooked
  tube(k, [[0, 0, 0], [s * 0.06, -0.14, 0.06], [s * 0.07, -0.24, -0.04]], 0.085, 0.055, SCALE, 7, 5);
  tube(k, [[s * 0.07, -0.24, -0.04], [s * 0.06, -0.26, -0.2], [s * 0.05, -0.3, -0.34]], 0.05, 0.035, SCALE_DK, 6, 5);
  put(k, xf(lumpGeo(0.045, 40 + s, 0.15, 0), s * 0.05, -0.31, -0.36), SCALE_HI);
  for (let i = 0; i < 3; i++) {
    const x = s * 0.05 + (i - 1) * 0.035;
    tube(k, [[x, -0.31, -0.36], [x + (i - 1) * 0.02, -0.37, -0.4], [x + (i - 1) * 0.025, -0.42, -0.36]], 0.016, 0.002, BONE, 4, 4);
  }
  put(k, spikeAB([s * 0.07, -0.22, -0.06], [s * 0.1, -0.2, -0.2], 0.022, 4), BONE_DK);
}

function build(): Rig {
  const rig = newRig('flyer', 'melee');
  rig.presence = 1.35;
  const body = pivot(rig.body, 0, 0, 0);
  const k = new K();
  const gb = new GlowBatch();
  const deep = new GlowBatch();

  // Torso: tail root (u = 0) to chest (u = 1), a ridge along the back, overlapping scale bands
  const torso = new Spine(
    [
      [0, 0.0, -0.62],
      [0, 0.05, -0.28],
      [0, 0.1, 0.08],
      [0, 0.12, 0.42],
    ],
    (u) => table(u, [
      [0, 0.14, 0.14],
      [0.45, 0.2, 0.22],
      [0.8, 0.21, 0.24],
      [1, 0.17, 0.19],
    ]),
    48,
  );
  put(k, torso.geo({ radial: 12, steps: 22, keel: 0.28, belly: 0.4, flare: bands(7, 0.07, false) }), SCALE);
  // Pale armoured belly plates
  put(k, torso.geo({ u0: 0.08, u1: 0.98, radial: 6, steps: 14, arc: [-Math.PI + 0.75, -0.75], out: 0.01, flare: bands(7, 0.05, false) }), BELLY);
  // Back plates: a row of glossy scutes either side of the spine
  for (let i = 0; i < 7; i++) {
    const u = 0.1 + i * 0.125;
    for (const s of [-1, 1]) {
      const p = torso.point(u, Math.PI / 2 - s * 0.55, 0.0);
      const n = torso.normal(u, Math.PI / 2 - s * 0.55);
      put(k, xf(chunkGeo(0.11, 0.025, 0.14, 50 + i * 2 + s, { chamfer: 0.6, jitter: 0.05, top: 0.7 }), p.x + n.x * 0.01, p.y + n.y * 0.01, p.z, 0, 0, -s * 0.55), i % 2 ? SCALE_HI : SCALE);
    }
  }
  seams(gb, torso, [1, 2, 3, 4, 5, 6].map((i) => i / 7 - 0.004), 0.008);
  // A void wound burning along the flank and chest
  for (const s of [-1, 1]) {
    const pts = [0.35, 0.47, 0.58, 0.7, 0.8].map((u, i) => torso.point(u, s > 0 ? -0.15 + (i % 2) * 0.12 : Math.PI + 0.15 - (i % 2) * 0.12, 0.006));
    deep.add(segLine(pts, 0.01, 0.004, 3));
  }

  // Neck: rising S-curve from the chest to the head pivot
  const neckSp = new Spine(
    [
      [0, 0.1, 0.36],
      [0, 0.2, 0.62],
      [0, 0.38, 0.84],
      [0, 0.5, 1.04],
    ],
    (u) => table(u, [
      [0, 0.17, 0.19],
      [0.5, 0.13, 0.14],
      [1, 0.1, 0.11],
    ]),
    32,
  );
  put(k, neckSp.geo({ radial: 10, steps: 14, keel: 0.3, belly: 0.3, flare: bands(6, 0.08, false) }), SCALE);
  put(k, neckSp.geo({ u0: 0.02, u1: 0.98, radial: 5, steps: 10, arc: [-Math.PI + 0.8, -0.8], out: 0.008, flare: bands(6, 0.06, false) }), BELLY);
  seams(gb, neckSp, [1, 2, 3, 4, 5].map((i) => i / 6 - 0.004), 0.007);

  // Tail: long whip curving away behind, ending in a bone glaive
  const tail = new Spine(
    [
      [0, 0.0, -0.56],
      [0.04, -0.03, -1.0],
      [0.2, -0.08, -1.46],
      [0.14, -0.1, -1.92],
      [-0.1, -0.07, -2.3],
    ],
    (u) => table(u, [
      [0, 0.155, 0.145],
      [0.3, 0.1, 0.095],
      [0.7, 0.05, 0.045],
      [1, 0.018, 0.016],
    ]),
    48,
  );
  put(k, tail.geo({ radial: 8, steps: 24, keel: 0.35, belly: 0.3, flare: bands(10, 0.09, true) }), SCALE);
  seams(gb, tail, [1, 2, 3, 4, 5, 6, 7].map((i) => i / 10 + 0.004), 0.006, 0.3, Math.PI - 0.3);
  const tf = tail.frame(1);
  const tipP = tail.point(1, 0);
  const blade = shapeFrom([
    [0, -0.04],
    [0.13, 0.08],
    [0.09, 0.16],
    [0.05, 0.13],
    [0.0, 0.36],
    [-0.05, 0.13],
    [-0.09, 0.16],
    [-0.13, 0.08],
  ]);
  const yaw = Math.atan2(tf.t.x, tf.t.z);
  k.plate(blade, 0.02, 0.008, tipP.x - tf.s.x * 0.018, tipP.y, tipP.z, BONE_DK, -Math.PI / 2, 0, -yaw + Math.PI, 1);
  deep.add(segLine([tipP.clone().add(tf.t.clone().multiplyScalar(0.02)).setY(tipP.y + 0.016), tipP.clone().add(tf.t.clone().multiplyScalar(0.27)).setY(tipP.y + 0.016)], 0.007, 0.002, 3));

  // Spine ridge of bone spikes from the nape to the tail
  const hexes = [BONE_DK, BONE, BONE_SH];
  ridge(k, neckSp, [0.12, 0.3, 0.48, 0.66, 0.84], (u) => 0.13 - u * 0.05, -1, hexes);
  ridge(k, torso, [0.12, 0.26, 0.4, 0.54, 0.68, 0.82, 0.95], (u) => 0.1 + Math.sin(u * Math.PI) * 0.09, -1, hexes);
  ridge(k, tail, [0.05, 0.14, 0.23, 0.32, 0.42, 0.52, 0.62, 0.72, 0.82], (u) => 0.12 - u * 0.1, 1, hexes, 0.03);
  // Shoulder humps where the wings root, spiked
  for (const s of [-1, 1]) {
    put(k, xf(lumpGeo(0.13, 60 + s, 0.1, 1), s * 0.17, 0.22, 0.26, 0, 0, 0, 1, 0.75, 1.3), SCALE_HI);
    put(k, spikeAB([s * 0.2, 0.3, 0.22], [s * 0.3, 0.52, 0.02], 0.035, 5), BONE_DK);
  }

  // Hind legs (static, tucked)
  for (const s of [-1, 1]) {
    const lk = new K();
    legKit(lk, s);
    const lp = pivot(body, s * 0.17, -0.06, -0.3);
    addMesh(rig, lp, lk);
  }

  // Head on the neck pivot
  const neck = pivot(body, 0, 0.5, 1.04);
  neck.rotation.x = 0.12;
  rig.neck = neck;
  const head = pivot(neck, 0, 0, 0);
  head.scale.setScalar(1.25);
  rig.head = head;
  const hk = new K();
  const eye = new GlowBatch();
  const hg = new GlowBatch();
  headKit(hk, eye, hg);
  addMesh(rig, head, hk);
  eye.flush(head, VOID_HOT, 6);
  hg.flush(head, VOID, 4);

  // Wings: the left mirrors the right
  for (const s of [1, -1]) {
    const wp = pivot(body, s * 0.2, 0.22, 0.28);
    const wk = new K();
    const wg = new GlowBatch();
    wingKit(wk, wg, s > 0 ? 11 : 17);
    addMesh(rig, wp, wk);
    wg.flush(wp, VOID, 3);
    if (s < 0) wp.scale.x = -1;
    wp.rotation.z = s * 0.12;
    rig.wings.push(wp);
  }

  addMesh(rig, body, k);
  gb.flush(body, VOID, 3.2);
  deep.flush(body, VOID, 4.5);
  rig.height = 1.5;
  return rig;
}

export const voidWyrm: UnitDef = {
  build,
  portrait: {
    faction: 'void',
    from: 0,
    to: 1,
    yaw: 0.55,
    pose: (rig) => {
      // Rearing up out of the dark: wings raised, head lowered towards the viewer, jaws open
      // Upright, wings swept forward so they rise behind it like a torn banner facing the viewer
      for (const w of rig.wings) {
        const s = w.position.x > 0 ? 1 : -1;
        w.rotation.set(0, -s * 1.05, s * 0.25);
      }
      rig.body.rotation.x = -1.2;
      rig.body.position.y = 2.1;
      rig.neck?.rotation.set(1.25, -0.3, 0);
      // Frame the head, neck and shoulders; the wings and tail run out of the shot
      if (rig.head && rig.neck) framePortraitOn(rig, [rig.head], [0.3, 0.6, 0.25]);
    },
  },
};
