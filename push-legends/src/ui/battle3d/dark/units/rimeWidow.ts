import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { type K, shade, type V } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { cbox, metal, prismGeo, ragGeo } from '../parts';
import { halo, robeLegs, shardGeo, sleeveArm, sparkGeo } from './_casters';
import { band, chestZ, glow, type GlowPart, HR, HY, Hunter, latheArc, mantle, mix, ragGeoN, shell, strapPath, torsoBase } from './_hunters';
import type { UnitDef } from './types';

/**
 * The Rime Widow (card: frost_witch, epic). Gaunt and very tall in layered blue-black mourning
 * robes rimed with frost at the hem and shoulders, a bone-ribbed bodice, a long dark veil that hides
 * the face completely (only two cold points of light show through) under a crown of jagged ice
 * shards, a fan of ice behind the head, and a staff of black ice whose clawed head cradles a cold
 * blue core with shards orbiting it. Her empty hand drips frost.
 */
const ICE = metal('#a9cfe0', 0.45);
const C = {
  robe: '#1b2530',
  outer: '#111820',
  rime: '#7f9aab',
  rimeLight: '#b7d0dc',
  veil: '#26313d',
  bodice: shade(PAL.leatherDark, -0.1),
  bone: PAL.bone,
  boneDark: PAL.boneDark,
  silver: PAL.steel,
  blackIce: metal('#16202b', 0.55),
  blackIceHi: metal('#2b3a4a', 0.6),
  ice: ICE,
  iceDeep: metal('#5f8ea8', 0.5),
  glow: PAL.frost,
  core: '#d8f2ff',
  glove: '#1a1f26',
};

/** Ice shard cluster: n shards fanned from a point (spread in radians) along +y. */
function shards(k: K, x: number, y: number, z: number, n: number, h: number, r: number, spread: number, hex: string, seed = 1, rz0 = 0): void {
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) - 0.5 : 0;
    const hh = h * (1 - Math.abs(t) * 0.9) * (0.85 + ((seed * 7 + i * 3) % 5) * 0.06);
    k.add(shardGeo(r * (0.8 + (i % 2) * 0.3), hh, 4), hex, x, y, z, ((i * 5 + seed) % 3 - 1) * 0.18, i * 0.7, rz0 + t * spread);
  }
}

/** Long veil over the whole head, the crown of ice shards, cold eyes showing through the veil. */
function veiledHead(h: Hunter): number {
  const k = h.head;
  const r = HR;
  // Head shape under the veil, then the veil itself: closed at the front, torn at the hem
  k.ball(r * 0.95, 0, HY, 0, C.veil, 0.92, 1.12, 1, 10);
  k.add(
    latheArc(
      [
        [r * 1.5, -r * 2.3],
        [r * 1.28, -r * 1.5],
        [r * 1.06, -r * 0.7],
        [r * 1.02, 0],
        [r * 0.92, r * 0.62],
        [r * 0.55, r * 1.04],
        [0.001, r * 1.16],
      ],
      10,
      0,
      Math.PI * 2,
      0.22,
      19,
    ),
    C.veil,
    0,
    HY,
    0,
    0,
    0,
    0,
    0.95,
    1,
    1.02,
  );
  // Darker translucent-looking fold across the face and a long train down the back
  k.add(latheArc([[r * 1.12, -r * 1.2], [r * 1.07, -r * 0.4], [r * 1.05, r * 0.3]], 6, -0.7, 1.4, 0.15, 9), shade(C.veil, -0.35), 0, HY, 0.01, 0, 0, 0, 0.97, 1, 1.04);
  k.add(ragGeo(0.3, 0.9, { folds: 3, depth: 0.03, flare: 0.5, tatter: 0.25, seed: 41, curl: 0.06 }), C.veil, 0, HY + r * 0.8, -r * 1.02, 0.2, 0, 0);
  // Cold eyes: two narrow points of light behind the veil
  glow(h.headGroup, C.glow, 3.2, [
    [new THREE.BoxGeometry(r * 0.2, r * 0.05, 0.006), r * 0.3, HY + r * 0.05, r * 1.035, 0, 0.3, -0.12],
    [new THREE.BoxGeometry(r * 0.2, r * 0.05, 0.006), -r * 0.3, HY + r * 0.05, r * 1.035, 0, -0.3, 0.12],
  ]);
  // Crown: a black-silver circlet with nine ice shards, tallest at the front, raked outwards
  const cy = HY + r * 0.62;
  k.add(new THREE.CylinderGeometry(r * 0.98, r * 1.02, r * 0.18, 9, 1, true), C.blackIceHi, 0, cy, 0);
  const coreGlow: GlowPart[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const front = (Math.cos(a) + 1) / 2;
    const hh = r * (0.75 + front * 1.55) * (i % 2 ? 0.8 : 1);
    const x = Math.sin(a) * r * 0.98;
    const z = Math.cos(a) * r * 0.98;
    // Tilt each shard away from the head (rotate about the tangent)
    const tilt = 0.22 + (1 - front) * 0.25;
    k.add(shardGeo(r * 0.16, hh, 4), i % 3 === 0 ? C.ice : C.iceDeep, x, cy, z, Math.cos(a) * tilt, 0, -Math.sin(a) * tilt);
    if (front > 0.7) coreGlow.push([shardGeo(r * 0.05, hh * 0.7, 3), x * 1.0, cy, z * 1.0 + 0.004, Math.cos(a) * tilt, 0, -Math.sin(a) * tilt]);
  }
  glow(h.headGroup, C.glow, 2.4, coreGlow);
  // Little secondary spikes between the main shards
  for (let i = 0; i < 9; i++) {
    const a = ((i + 0.5) / 9) * Math.PI * 2;
    k.add(shardGeo(r * 0.08, r * 0.4, 3), C.rimeLight, Math.sin(a) * r * 1.0, cy, Math.cos(a) * r * 1.0, Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
  }
  return cy + r * 2.3;
}

/** Staff of black ice: faceted dark shaft with frozen knots, a clawed head around a cold core. */
function staff(h: Hunter): void {
  const s = h.kit(h.handR, 0, 0, 0.0, 0.85);
  const k = s.k;
  k.add(prismGeo(0.019, 1.72, 5, 0.85), C.blackIce, 0, 0.1, 0);
  // Frozen knots and rime along the shaft
  for (const [y, n, sd] of [
    [-0.55, 3, 2],
    [0.35, 4, 5],
    [0.62, 3, 8],
  ] as const) {
    k.add(new THREE.OctahedronGeometry(0.034, 0), C.blackIceHi, 0, y, 0, 0, y, 0, 1, 1.6, 1);
    shards(k, 0, y, 0, n, 0.09, 0.014, 2.4, C.iceDeep, sd);
  }
  k.add(new THREE.ConeGeometry(0.02, 0.14, 4), C.blackIceHi, 0, -0.81, 0, Math.PI, 0, 0);
  band(k, 0.024, 0.06, 0, 0.06, 0, C.silver, 0, 0, 0, 5);
  k.add(ragGeoN(0.035, 0.22, 7, 1, 3), C.boneDark, 0.02, 0.05, 0.02, 0, 0.4, 0.1);
  // Clawed head: black-ice talons curling up around the core, crowned by a long ice spike
  const hy = 0.98;
  k.add(new THREE.OctahedronGeometry(0.05, 0), C.blackIce, 0, hy - 0.02, 0, 0, 0, 0, 1, 1.5, 1);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const lean = 0.55;
    k.add(shardGeo(0.022, 0.26, 4, -0.07), i % 2 ? C.blackIce : C.blackIceHi, Math.sin(a) * 0.03, hy, Math.cos(a) * 0.03, Math.cos(a) * lean, 0, -Math.sin(a) * lean);
  }
  k.add(shardGeo(0.026, 0.36, 4), C.ice, 0, hy + 0.17, 0);
  shards(k, 0, hy + 0.04, 0, 3, 0.16, 0.014, 1.6, C.rimeLight, 3);
  glow(s.g, C.core, 5, [[new THREE.IcosahedronGeometry(0.04, 0), 0, hy + 0.13, 0]]);
  glow(s.g, C.glow, 3, [[shardGeo(0.009, 0.3, 3), 0, hy + 0.2, 0]]);
  halo(s.g, C.glow, 0.15, 0, hy + 0.14, 0, 0.18, 1.2);
  // Shards orbiting the head (spinner)
  const orb = h.kit(s.g, 0, hy + 0.13, 0);
  h.rig.spinners.push(orb.g);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    orb.k.add(shardGeo(0.012, 0.07, 3), C.ice, Math.cos(a) * 0.12, (i - 1) * 0.03, Math.sin(a) * 0.12, 0.4, a, 0.6);
  }
  glow(orb.g, C.glow, 3, [
    [sparkGeo(0.01), Math.cos(1) * 0.15, 0.05, Math.sin(1) * 0.15],
    [sparkGeo(0.008), Math.cos(3) * 0.14, -0.04, Math.sin(3) * 0.14],
  ]);
}

/** The free hand: rime creeping up the forearm, frost forming between the fingers. */
function frostHand(h: Hunter): void {
  const k = h.armL;
  shards(k, 0, -0.6, 0.02, 4, 0.07, 0.01, 2.8, C.rimeLight, 4, Math.PI);
  for (const [y, rz] of [
    [-0.44, 0.4],
    [-0.5, -0.5],
  ] as const)
    k.add(shardGeo(0.01, 0.06, 3), C.ice, 0.04 * Math.sign(rz), y, 0.03, 0.3, 0, rz + Math.PI);
  const parts: GlowPart[] = [
    [sparkGeo(0.012), 0.03, -0.78, 0.04],
    [sparkGeo(0.009), -0.04, -0.82, 0.0],
    [sparkGeo(0.008), 0.0, -0.86, 0.06],
    [shardGeo(0.006, 0.06, 3), 0, -0.73, 0.02, Math.PI, 0, 0],
  ];
  glow(h.rig.armL!, C.glow, 3.5, parts);
  halo(h.rig.armL!, C.glow, 0.11, 0, -0.74, 0.03, 0.14, 1.3);
}

function widow(): Rig {
  const h = new Hunter({ attack: 'cast', bulk: 0.86, tall: 1.06, neckZ: 0.035, shoulder: 0.24 });
  const b = h.b;
  const t = h.torso;
  torsoBase(t, b, { shirt: C.robe, trousers: C.robe, neck: C.veil });
  // Dark robe on the chest, a tight black bodice ribbed with bone, a silver-clasped girdle
  shell(t, b, C.robe, 0.94, 1.62, 0.02);
  shell(t, b, C.bodice, 1.08, 1.46, 0.035, { phiStart: -1.3, phiLen: 2.6, seg: 7 });
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.042;
    const pts: V[] = [];
    for (const y of [1.12, 1.24, 1.36, 1.45]) pts.push([x * (0.85 + (y - 1.12) * 0.6), y, chestZ(b, y, 0.042) - Math.abs(x) * 0.25]);
    strapPath(t, pts, 0.012, 0.01, i === 2 ? C.bone : C.boneDark);
  }
  shell(t, b, shade(C.silver, -0.3), 1.04, 1.08, 0.048);
  t.add(new THREE.OctahedronGeometry(0.03, 0), C.silver, 0, 1.06, chestZ(b, 1.06, 0.065), 0, 0, 0, 1, 1.4, 0.6);
  // Frost-rimed mantle with ice crusting the shoulders, and a fan of ice rising behind the head
  mantle(t, b, mix(C.outer, C.rime, 0.25), { bottom: 1.3, width: 0.34, tatter: 0.14, seed: 27, seg: 10 });
  t.add(latheArc([[0.33 * b, 1.3], [0.32 * b, 1.36]], 10, 0, Math.PI * 2, 0.08, 28), C.rime, 0, 0, -0.01, 0, 0, 0, 1.01, 1, 0.73);
  for (const sx of [-1, 1]) shards(t, sx * 0.17, 1.58, -0.02, 3, 0.08, 0.013, 1.4, C.rimeLight, 5 + sx, -sx * 0.5);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i / 6 - 0.5) * 2.4;
    const hh = 0.12 + (1 - Math.abs(i / 6 - 0.5) * 2) * 0.12;
    t.add(shardGeo(0.018, hh, 4), i % 2 ? C.iceDeep : C.ice, Math.sin(a) * 0.12, 1.62, Math.cos(a) * 0.1, Math.cos(a) * 0.75, 0, -Math.sin(a) * 0.75);
  }
  // Pale rime-cord rosary hanging from the girdle
  strapPath(t, [[0.06, 1.05, chestZ(b, 1.05, 0.06)], [0.08, 0.86, chestZ(b, 1.0, 0.07)], [0.07, 0.7, 0.16]], 0.008, 0.008, C.bone);
  t.add(new THREE.OctahedronGeometry(0.022, 0), C.bone, 0.07, 0.68, 0.16, 0, 0, 0, 1, 1.5, 0.5);

  const top = veiledHead(h);

  robeLegs(h, { inner: C.robe, outer: C.outer, boot: C.glove, hem: C.rime, flare: 0.35, tatter: 0.16, seed: 23, outerGap: 0.36 });

  sleeveArm(h.armR, 1, b, { sleeve: C.outer, glove: C.glove, bell: 0.15, len: 0.48, tatter: 0.14, seed: 8 });
  sleeveArm(h.armL, -1, b, { sleeve: C.outer, glove: C.glove, bell: 0.17, len: 0.52, tatter: 0.16, seed: 11 });
  for (const s of [-1, 1]) h.arm(s).add(latheArc([[0.16, -0.5], [0.15, -0.44]], 8, 0, Math.PI * 2, 0.06, 12 + s), C.rime, 0.005 * s, 0, -0.01, 0.08, 0, 0, 1.02, 1, 0.92);
  // Long gaunt fingers on the free hand
  for (let i = 0; i < 3; i++) cbox(h.armL, 0.012, 0.07, 0.012, 0.012 - i * 0.013, -0.75, 0.03 + i * 0.004, C.glove, 0.2, 0, 0);
  staff(h);
  frostHand(h);

  // Mourning train down the back
  const ck = h.cape(0, 1.6, -0.15);
  ck.add(ragGeo(0.46, 1.52, { folds: 4, depth: 0.05, flare: 0.5, tatter: 0.22, seed: 51, curl: 0.12 }), C.outer, 0, 0, 0, 0.05, 0, 0);
  ck.add(ragGeo(0.5, 0.28, { folds: 4, depth: 0.03, flare: 0.3, tatter: 0.3, seed: 52 }), C.rime, 0, -1.24, -0.08, 0.1, 0, 0);
  return h.finish(top);
}

export const rimeWidow: UnitDef = {
  build: widow,
  portrait: {
    pose: (rig) => {
      rig.armR!.rotation.set(-0.85, 0, 0.12);
      rig.armL!.rotation.set(-0.9, 0, -0.35);
      rig.body.rotation.y = 0.12;
      rig.neck!.rotation.set(0.12, -0.15, 0);
    },
    from: 0.34,
    to: 1.03,
    yaw: 0.4,
    faction: 'frost',
  },
};
