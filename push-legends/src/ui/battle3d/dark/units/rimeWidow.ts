import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { type K, shade } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { cbox, metal, prismGeo } from '../parts';
import { capelet, crescentGeo, halo, robeLegs, shardGeo, sigil, skull, sleeveArm, sparkGeo, spikedPauldron, visorHood } from './_casters';
import { band, capeGeo, chestZ, glow, type GlowPart, heavyCape, HR, HY, Hunter, latheArc, mix, onTorso, ragGeoN, shell, strapPath, torsoBase, torsoLine } from './_hunters';
import type { UnitDef } from './types';

/**
 * The Rime Widow (card: frost_witch, epic). Gaunt and very tall in layered blue-black mourning
 * robes rimed with frost at the hem: a long dark veil drawn into a hood over a pointed mask of black
 * ice with two cold slits, under a crown of jagged ice shards; black-ice pauldrons bristling with
 * frozen crescents, a bone-ribbed bodice with a glowing frost sigil, a small skull on a bone cord.
 * Her staff of black ice ends in clawed talons round a cold core with shards orbiting it; her empty
 * hand drips frost (she slows whole groups).
 */
const C = {
  robe: '#2c3c4e',
  outer: '#1f2b39',
  rime: '#7f9aab',
  rimeLight: '#b7d0dc',
  veil: '#222d3a',
  bodice: shade(PAL.leatherDark, -0.1),
  bone: PAL.bone,
  boneDark: PAL.boneDark,
  silver: metal(PAL.steelLight, 0.85),
  blackIce: metal('#161f2a', 0.7),
  blackIceHi: metal('#34465a', 0.78),
  ice: metal('#a9cfe0', 0.45),
  iceDeep: metal('#5f8ea8', 0.5),
  glow: PAL.frost,
  core: '#d8f2ff',
  glove: '#161b22',
};

/** Ice shard cluster: n shards fanned from a point (spread in radians) along +y. */
function shards(k: K, x: number, y: number, z: number, n: number, h: number, r: number, spread: number, hex: string, seed = 1, rz0 = 0): void {
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) - 0.5 : 0;
    const hh = h * (1 - Math.abs(t) * 0.9) * (0.85 + ((seed * 7 + i * 3) % 5) * 0.06);
    k.add(shardGeo(r * (0.8 + (i % 2) * 0.3), hh, 4), hex, x, y, z, (((i * 5 + seed) % 3) - 1) * 0.18, i * 0.7, rz0 + t * spread);
  }
}

/** Veil drawn into a hood over a black-ice visor; a crown of ice shards rising over it. */
function veiledHead(h: Hunter): number {
  const k = h.head;
  const r = HR;
  const { top } = visorHood(h, { cloth: C.veil, edge: mix(C.veil, C.rime, 0.35), plate: C.blackIce, hi: C.blackIceHi, trim: C.silver, eye: C.glow, eyeLum: 6, keel: 0.5, size: 1.06, tail: 0, open: 0.7, forward: 0.22 });
  // Long veil train down the back
  k.add(capeGeo(0.3, 0.75, { folds: 3, depth: 0.03, flare: 0.6, tatter: 0.25, seed: 41, curl: 0.06, cols: 8, rows: 5 }), C.veil, 0, HY + r * 0.6, -r * 1.25, 0.25, 0, 0);
  // Crown: a silver circlet carrying nine ice shards, tallest at the front, raked outwards
  const cy = HY + r * 0.95;
  const cr = r * 1.08;
  k.add(new THREE.CylinderGeometry(cr * 0.96, cr, r * 0.16, 12, 1, true), C.silver, 0, cy, 0.0);
  const coreGlow: GlowPart[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const front = (Math.cos(a) + 1) / 2;
    const hh = r * (0.8 + front * 1.6) * (i % 2 ? 0.75 : 1);
    const x = Math.sin(a) * cr;
    const z = Math.cos(a) * cr;
    const tilt = 0.2 + (1 - front) * 0.3;
    k.add(shardGeo(r * 0.15, hh, 4), i % 3 === 0 ? C.ice : C.iceDeep, x, cy, z, Math.cos(a) * tilt, 0, -Math.sin(a) * tilt);
    if (front > 0.7) coreGlow.push([shardGeo(r * 0.05, hh * 0.75, 3), x, cy, z + 0.004, Math.cos(a) * tilt, 0, -Math.sin(a) * tilt]);
  }
  glow(h.headGroup, C.glow, 3, coreGlow);
  // Gem of cold light at the crown's brow
  glow(h.headGroup, C.core, 4, [[new THREE.OctahedronGeometry(r * 0.09, 0), 0, cy + r * 0.02, cr + r * 0.03]]);
  return Math.max(top, cy + r * 2.4);
}

/** Staff of black ice: faceted dark shaft with frozen knots, a clawed head around a cold core. */
function staff(h: Hunter): void {
  const s = h.kit(h.handR, 0, 0, 0.0, 0.85);
  const k = s.k;
  k.add(prismGeo(0.019, 1.76, 6, 0.85), C.blackIce, 0, 0.12, 0);
  for (const [y, n, sd] of [
    [-0.55, 3, 2],
    [0.35, 3, 5],
    [0.64, 3, 8],
  ] as const) {
    k.add(new THREE.OctahedronGeometry(0.034, 0), C.blackIceHi, 0, y, 0, 0, y, 0, 1, 1.6, 1);
    shards(k, 0, y, 0, n, 0.09, 0.014, 2.4, C.iceDeep, sd);
  }
  k.add(new THREE.ConeGeometry(0.02, 0.16, 4), C.blackIceHi, 0, -0.83, 0, Math.PI, 0, 0);
  band(k, 0.024, 0.06, 0, 0.06, 0, C.silver, 0, 0, 0, 6);
  k.add(ragGeoN(0.035, 0.24, 7, 1, 3), C.boneDark, 0.02, 0.05, 0.02, 0, 0.4, 0.1);
  // Clawed head: black-ice crescent talons curling up round the core, crowned by a long ice spike
  const hy = 1.0;
  k.add(new THREE.OctahedronGeometry(0.05, 0), C.blackIce, 0, hy - 0.02, 0, 0, 0, 0, 1, 1.5, 1);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    k.add(crescentGeo(0.3, 0.06, -0.35, 0.012), i % 2 ? C.blackIce : C.blackIceHi, Math.sin(a) * 0.03, hy, Math.cos(a) * 0.03, 0, a + Math.PI / 2, 0.42);
  }
  k.add(shardGeo(0.026, 0.4, 4), C.ice, 0, hy + 0.18, 0);
  // Cold core: a long faceted crystal of light inside the talons, not a round orb
  glow(s.g, C.core, 3.5, [[new THREE.OctahedronGeometry(0.04, 0).scale(1, 2.2, 1), 0, hy + 0.14, 0, 0, 0.4, 0]]);
  glow(s.g, C.glow, 3, [
    [shardGeo(0.009, 0.36, 3), 0, hy + 0.2, 0],
    [shardGeo(0.007, 0.16, 3), 0.02, hy + 0.08, 0.01, 0.3, 0, -0.5],
    [shardGeo(0.007, 0.15, 3), -0.02, hy + 0.08, -0.01, -0.3, 0, 0.55],
  ]);
  halo(s.g, C.glow, 0.13, 0, hy + 0.16, 0, 0.12, 1.6);
  // Shards orbiting the head (spinner)
  const orb = h.kit(s.g, 0, hy + 0.14, 0);
  h.rig.spinners.push(orb.g);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    orb.k.add(shardGeo(0.014, 0.08, 3), C.ice, Math.cos(a) * 0.14, (i - 1) * 0.03, Math.sin(a) * 0.14, 0.4, a, 0.6);
  }
  glow(orb.g, C.glow, 3, [
    [sparkGeo(0.011), Math.cos(1) * 0.16, 0.05, Math.sin(1) * 0.16],
    [sparkGeo(0.009), Math.cos(3) * 0.15, -0.04, Math.sin(3) * 0.15],
  ]);
}

/** The free hand: rime creeping up the forearm, frost mist and shards forming between the fingers. */
function frostHand(h: Hunter): void {
  const k = h.armL;
  shards(k, 0, -0.6, 0.02, 4, 0.08, 0.011, 2.8, C.rimeLight, 4, Math.PI);
  for (const [y, rz] of [
    [-0.44, 0.4],
    [-0.5, -0.5],
  ] as const)
    k.add(shardGeo(0.01, 0.06, 3), C.ice, 0.04 * Math.sign(rz), y, 0.03, 0.3, 0, rz + Math.PI);
  const parts: GlowPart[] = [
    [sparkGeo(0.014), 0.03, -0.78, 0.04],
    [sparkGeo(0.011), -0.04, -0.84, 0.0],
    [sparkGeo(0.009), 0.0, -0.9, 0.06],
    [sparkGeo(0.008), 0.05, -0.95, -0.02],
    [shardGeo(0.007, 0.08, 3), 0, -0.73, 0.02, Math.PI, 0, 0],
  ];
  glow(h.rig.armL!, C.glow, 3.5, parts);
}

function widow(): Rig {
  const h = new Hunter({ attack: 'cast', bulk: 0.86, tall: 1.07, neckZ: 0.035, shoulder: 0.24 });
  const b = h.b;
  const t = h.torso;
  torsoBase(t, b, { shirt: C.robe, trousers: C.robe, neck: C.veil });
  // Dark robe on the chest, a tight black bodice ribbed with bone, a silver-clasped girdle
  shell(t, b, C.robe, 0.94, 1.62, 0.02);
  const g = 0.035;
  shell(t, b, C.bodice, 1.08, 1.5, g, { phiStart: -1.3, phiLen: 2.6, seg: 10 });
  // Black-ice stomacher over the bodice, laced with silver
  for (let i = 0; i < 3; i++) {
    const ya = 1.12 + i * 0.06;
    torsoLine(t, b, [[-0.1 + i * 0.012, ya + 0.03], [0, ya], [0.1 - i * 0.012, ya + 0.03]], g, 0.0035, shade(C.silver, -0.25));
  }
  torsoLine(t, b, [[-0.15, 1.48], [-0.08, 1.4], [0, 1.31], [0.08, 1.4], [0.15, 1.48]], g, 0.004, C.silver);
  // Frost sigil on the breast: a six-armed star of cold light
  const sz = onTorso(b, 0, 1.4, g)[2] + 0.008;
  const st: [number, number, number, number][] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    st.push([-Math.sin(a) * 0.055, -Math.cos(a) * 0.055, Math.sin(a) * 0.055, Math.cos(a) * 0.055]);
  }
  st.push([-0.02, 0.035, 0, 0.055], [0.02, 0.035, 0, 0.055], [-0.02, -0.035, 0, -0.055], [0.02, -0.035, 0, -0.055]);
  sigil(h.frame, C.glow, 4.5, st, 0.008, 0, 1.4, sz, -0.25);
  shell(t, b, shade(C.silver, -0.45), 1.04, 1.08, 0.048);
  t.add(new THREE.OctahedronGeometry(0.03, 0), C.silver, 0, 1.06, chestZ(b, 1.06, 0.065), 0, 0, 0, 1, 1.4, 0.6);
  // Frost-rimed mantle and a fan of ice rising behind the head
  capelet(t, b, mix(C.outer, C.rime, 0.15), { bottom: 1.3, width: 0.34, gap: 0.85, tatter: 0.14, seed: 27, seg: 12 });
  t.add(latheArc([[0.33 * b, 1.3], [0.32 * b, 1.36]], 12, 0.85, Math.PI * 2 - 1.7, 0.08, 28), C.rime, 0, 0, -0.01, 0, 0, 0, 1.01, 1, 0.73);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i / 6 - 0.5) * 2.4;
    const hh = 0.14 + (1 - Math.abs(i / 6 - 0.5) * 2) * 0.16;
    t.add(shardGeo(0.02, hh, 4), i % 2 ? C.iceDeep : C.ice, Math.sin(a) * 0.13, 1.62, Math.cos(a) * 0.11, Math.cos(a) * 0.75, 0, -Math.sin(a) * 0.75);
  }
  // Bone cord from the girdle with a small skull, rimed white
  strapPath(t, [[0.06, 1.05, chestZ(b, 1.05, 0.06)], [0.08, 0.92, chestZ(b, 1.0, 0.07)], [0.08, 0.8, 0.15]], 0.008, 0.008, C.boneDark);
  skull(t, 0.08, 0.75, 0.16, 0.045, C.bone, 0.1, 0.1);

  const top = veiledHead(h);

  robeLegs(h, { inner: C.robe, outer: C.outer, boot: C.glove, hem: C.rime, flare: 0.37, tatter: 0.16, seed: 23, outerGap: 0.36, seg: 9 });

  sleeveArm(h.armR, 1, b, { sleeve: C.outer, glove: C.glove, bell: 0.15, len: 0.48, tatter: 0.14, seed: 8 });
  sleeveArm(h.armL, -1, b, { sleeve: C.outer, glove: C.glove, bell: 0.17, len: 0.52, tatter: 0.16, seed: 11 });
  for (const s of [-1, 1]) h.arm(s).add(latheArc([[0.16, -0.5], [0.15, -0.44]], 8, 0, Math.PI * 2, 0.06, 12 + s), mix(C.outer, C.rime, 0.55), 0.005 * s, 0, -0.01, 0.08, 0, 0, 1.02, 1, 0.92);
  // Black-ice pauldrons bristling with frozen crescents
  for (const s of [-1, 1])
    spikedPauldron(h.arm(s), s, {
      r: 0.135,
      lames: 2,
      plate: C.blackIce,
      hi: C.blackIceHi,
      trim: shade(C.silver, -0.45),
      bladeHex: s > 0 ? C.iceDeep : C.ice,
      blades: [
        [0.24, 0.2, 0.0, -0.2],
        [0.17, 0.35, 0.05, 0.35],
      ],
    });
  for (const s of [-1, 1]) shards(h.arm(s), s * 0.12, 0.02, 0.0, 3, 0.09, 0.012, 1.4, C.rimeLight, 5 + s, -s * 0.9);
  // Long gaunt fingers on the free hand
  for (let i = 0; i < 3; i++) cbox(h.armL, 0.012, 0.08, 0.012, 0.012 - i * 0.013, -0.76, 0.03 + i * 0.004, C.glove, 0.2, 0, 0);
  staff(h);
  frostHand(h);

  // Mourning cloak down the back, frost-rimed along the torn hem
  const ck = h.cape(0, 1.6, -0.15);
  heavyCape(ck, 0.5, 1.58, C.outer, { seed: 51, inner: shade(C.robe, -0.2), tatter: 0.3 });
  ck.add(ragGeoN(0.48, 0.24, 52, 8, 1, 0.03), C.rime, 0, -1.3, -0.2, 0.12, 0, 0);
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
