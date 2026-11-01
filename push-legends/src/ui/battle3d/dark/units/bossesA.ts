import * as THREE from 'three';
import { K, type V } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { metal, ragGeo, tornLatheGeo } from '../parts';
import {
  accentGlow,
  addGlow,
  attach,
  bossRig,
  claw,
  crystalCluster,
  dusk,
  eyes,
  flat,
  GlowBatch,
  halo,
  horn,
  loft,
  lumpGeo,
  orbEyes,
  pivot,
  put,
  rag,
  retone,
  rnd,
  shardGeo,
  spikeAB,
  type Spine,
  thornRing,
  tube,
  xf,
} from './_bosses';
import { flameGeo, segLine, SHADOW } from './_creatures';
import type { Palette } from './enemies';

/**
 * World bosses, one per world. Each is near-black (bark, ice, obsidian, rotting velvet, corrupted
 * crystal) with ONE vivid accent glow taken from the world palette:
 *
 *   treant        - Grovemaw: a blighted dead-wood ancient, hunched, its hollow skull-like face split
 *                   by a maw of thorn teeth; an antler crown of dead branches, root claws, root feet.
 *   ice_queen     - Queen Rimeclaw: towering frost revenant, ice-shard crown and collar, gaunt
 *                   skull face, long bone claws, a frozen tattered gown with a long torn train.
 *   magma_titan   - Magmaroth: hunched obsidian lava titan, molten cracks, a caged molten belly,
 *                   volcanic shoulder vents, huge horns and enormous fists.
 *   lich_king     - The Hollow King: crowned lich in rotting royal robes and black-gold plate, skull
 *                   with eye-fire and soul flames, a caged soul-staff with a burning gem.
 *   crystal_heart - Nyxara: a floating corrupted crystal heart with one great slit eye, veins of dark
 *                   flesh and two rings of orbiting shards (kind 'float').
 */
export function bossesA(sprite: string, p: Palette): Rig | null {
  switch (sprite) {
    case 'treant':
      return grovemaw(p);
    case 'ice_queen':
      return rimeclaw(p);
    case 'magma_titan':
      return magmaroth(p);
    case 'lich_king':
      return hollowKing(p);
    case 'crystal_heart':
      return nyxara(p);
    default:
      return null;
  }
}

const FRONT = -Math.PI / 2;

/** Jagged glowing crack wandering over a spine's surface. */
function crack(gb: GlowBatch, sp: Spine, u0: number, a0: number, n: number, du: number, da: number, seed: number, r = 0.01, out = 0.012): void {
  const rr = rnd(seed);
  const pts: THREE.Vector3[] = [];
  let u = u0;
  let a = a0;
  for (let i = 0; i <= n; i++) {
    pts.push(sp.point(Math.max(0, Math.min(1, u)), a, out));
    u += du * (0.6 + rr() * 0.8);
    a += (rr() - 0.5) * da;
  }
  gb.add(segLine(pts, r, r * 0.35, 4));
}

// --- Grovemaw ---------------------------------------------------------------------------------------

/** Dead branch with forks, from `a` along `dir` (recursive). */
function branch(k: K, a: V, dir: V, len: number, r: number, hex: string, depth: number, seed: number): void {
  const rr = rnd(seed);
  const d = new THREE.Vector3(...dir).normalize();
  const bend = new THREE.Vector3(rr() - 0.5, rr() * 0.3, rr() - 0.5).multiplyScalar(0.5);
  const pts: V[] = [];
  for (let i = 0; i <= 3; i++) {
    const t = i / 3;
    const q = new THREE.Vector3(...a).addScaledVector(d, len * t).addScaledVector(bend, len * t * t);
    pts.push([q.x, q.y, q.z]);
  }
  tube(k, pts, r, 0.004, hex, 5, 6);
  if (depth <= 0) return;
  for (let j = 0; j < 2; j++) {
    const t = 0.45 + j * 0.25;
    const at = pts[Math.round(t * 3)]!;
    const nd: V = [d.x + (rr() - 0.5) * 1.4, d.y + 0.3 + rr() * 0.4, d.z + (rr() - 0.5) * 1.0];
    branch(k, at, nd, len * (0.45 + rr() * 0.2), r * 0.5, hex, depth - 1, seed * 7 + j);
  }
}

function grovemaw(p: Palette): Rig {
  const GLOW = accentGlow(p, '#b6ff2a', 0.55);
  const BARK = dusk(p.primary, 0.1, 0.26);
  const BARK_DK = dusk(p.primary, 0.055, 0.25);
  const BARK_HI = dusk(p.primary, 0.18, 0.18);
  const MOSS = dusk(p.secondary, 0.12, 0.42);
  const MOSS_HI = dusk(p.secondary, 0.2, 0.35);
  const THORN = '#4a3e31';
  const { rig, frame, k, gb } = bossRig('biped');

  // Hunched trunk, widest at the shoulders
  const trunk = loft(
    k,
    [
      [0, 1.0, -0.05],
      [0, 1.55, 0.0],
      [0, 2.15, 0.12],
      [0, 2.7, 0.36],
      [0, 3.02, 0.3],
    ],
    [
      [0, 0.36, 0.32],
      [0.3, 0.42, 0.36],
      [0.65, 0.6, 0.46],
      [0.88, 0.52, 0.42],
      [1, 0.24, 0.2],
    ],
    BARK,
    { radial: 14, steps: 14, noise: 0.06, seed: 5 },
  );
  // Bark grain: twisting ridges running up the trunk
  const rr = rnd(11);
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2 + 0.2;
    if (Math.abs(Math.sin(a0) + 1) < 0.35) continue; // keep the face clear
    const pts = [0.04, 0.3, 0.55, 0.8, 0.95].map((u, j) => trunk.point(u, a0 + j * 0.12 * (i % 2 ? 1 : -1) + (rr() - 0.5) * 0.1, 0.01));
    tube(k, pts, 0.045, 0.02, i % 3 ? BARK_DK : BARK_HI, 4, 10);
  }

  // The hollow face: a skull worn into the wood
  const f = trunk.point(0.79, FRONT, 0);
  const fy = f.y;
  const fz = f.z;
  // Sunken face plane, deep sockets with burning eyes, heavy angry brow
  put(k, xf(lumpGeo(0.3, 21, 0.1, 1), 0, fy - 0.05, fz - 0.14, 0, 0, 0, 1.1, 0.95, 0.5), BARK_DK);
  for (const s of [-1, 1]) {
    k.ball(0.105, s * 0.17, fy, fz - 0.02, SHADOW, 1.15, 0.85, 0.55);
    tube(k, [[s * 0.4, fy + 0.2, fz - 0.12], [s * 0.22, fy + 0.13, fz + 0.04], [s * 0.04, fy + 0.04, fz + 0.08]], 0.075, 0.04, BARK_HI, 6, 6);
    put(k, xf(lumpGeo(0.1, 23 + s, 0.15, 0), s * 0.28, fy - 0.17, fz - 0.02, 0, 0, 0, 1.2, 0.8, 0.8), BARK);
  }
  const eg = new GlowBatch();
  orbEyes(eg, fy - 0.005, fz + 0.035, 0.17, 0.045);
  k.add(new THREE.ConeGeometry(0.06, 0.12, 3), SHADOW, 0, fy - 0.13, fz + 0.02, Math.PI, 0, 0, 1, 1, 0.5);
  // The maw: a gaping ring of torn wood lined with thorn teeth, burning inside
  const my = fy - 0.5;
  const mz = trunk.point(0.66, FRONT, 0).z + 0.02;
  k.add(new THREE.TorusGeometry(0.25, 0.075, 6, 16), BARK_DK, 0, my, mz, 0, 0, 0, 1.05, 1.3, 1);
  k.ball(0.23, 0, my, mz - 0.06, SHADOW, 1, 1.3, 0.4);
  addGlow(frame, new THREE.SphereGeometry(0.1, 10, 8), GLOW, 0, my - 0.05, mz - 0.02, 1.4).scale.set(1, 1.4, 0.4);
  for (let i = 0; i < 11; i++) {
    const a = -1.25 + (i / 10) * 2.5;
    const top = i % 2 === 0;
    for (const s of [1, -1]) {
      if (s < 0 && i > 8) continue;
      const bx = Math.sin(a) * 0.25 * 1.05;
      const by = my + s * Math.cos(a) * 0.25 * 1.3;
      const L = (top ? 0.24 : 0.16) * (1 - Math.abs(a) * 0.25);
      put(k, spikeAB([bx, by, mz + 0.02], [bx * 0.55, by - s * L, mz + 0.06], 0.026, 4), THORN);
    }
  }
  // Sap cracks bleeding light from the bark
  crack(gb, trunk, 0.55, FRONT + 0.75, 5, 0.06, 0.5, 31);
  crack(gb, trunk, 0.25, FRONT - 0.8, 5, 0.07, 0.4, 32);
  crack(gb, trunk, 0.35, Math.PI / 2 + 0.2, 6, 0.07, 0.5, 33);
  crack(gb, trunk, 0.1, FRONT + 0.3, 4, 0.06, 0.4, 34, 0.012);

  // Knotted shoulders under heaped moss
  for (const s of [-1, 1]) {
    put(k, xf(lumpGeo(0.36, 40 + s, 0.2, 1), s * 0.6, 2.72, 0.22, 0, 0, 0, 1.15, 0.85, 1.05), BARK);
    put(k, xf(lumpGeo(0.26, 42 + s, 0.25, 1), s * 0.52, 2.98, 0.12, 0, 0, 0, 1.3, 0.55, 1.2), MOSS);
    rag(k, 0.36, 0.7, [s * 0.72, 2.72, 0.05], s * Math.PI / 2, MOSS, 5 + s, 0.1, 0.5);
    rag(k, 0.3, 0.55, [s * 0.32, 2.85, -0.38], Math.PI + s * 0.4, MOSS_HI, 8 + s, 0.15, 0.5);
  }
  // Root mass at the hips
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    put(k, xf(lumpGeo(0.2, 50 + i, 0.25, 0), Math.sin(a) * 0.36, 1.02, Math.cos(a) * 0.28, 0, a, 0, 1.2, 0.8, 1), i % 2 ? BARK_DK : BARK);
  }
  // Antler crown of dead branches tearing out of the head and back
  const crown: [V, V, number, number][] = [
    [[0.12, 2.95, 0.1], [0.5, 1.0, 0.1], 1.0, 0.1],
    [[-0.12, 2.95, 0.1], [-0.5, 1.0, 0.1], 1.0, 0.1],
    [[0.3, 2.85, -0.15], [1.0, 0.8, -0.3], 0.9, 0.09],
    [[-0.3, 2.85, -0.15], [-1.0, 0.8, -0.3], 0.9, 0.09],
    [[0.0, 2.9, -0.2], [0.1, 1.0, -0.6], 0.85, 0.09],
    [[0.45, 2.75, 0.0], [1.0, 0.35, 0.2], 0.7, 0.07],
    [[-0.45, 2.75, 0.0], [-1.0, 0.35, 0.2], 0.7, 0.07],
  ];
  crown.forEach(([a, d, len, r], i) => branch(k, a, d, len, r, i < 2 ? BARK_HI : BARK_DK, 2, 60 + i));
  rag(k, 0.22, 0.6, [0.62, 3.45, 0.18], 0.4, MOSS, 3);
  rag(k, 0.2, 0.5, [-0.7, 3.3, 0.0], -0.6, MOSS_HI, 4);
  // A few thorns jutting from the trunk
  for (let i = 0; i < 9; i++) {
    const u = 0.15 + (i / 9) * 0.7;
    const a = (i * 2.4) % (Math.PI * 2);
    if (Math.abs(Math.sin(a) + 1) < 0.4) continue;
    const b = trunk.point(u, a, -0.02);
    const n = trunk.normal(u, a);
    put(k, spikeAB(b, b.clone().addScaledVector(n, 0.22).add(new THREE.Vector3(0, 0.08, 0)), 0.035, 4), THORN);
  }

  // Legs: thick roots splaying into clawed root feet
  for (const s of [-1, 1]) {
    const lp = pivot(frame, s * 0.32, 1.08, 0);
    const lk = new K();
    loft(
      lk,
      [
        [0, 0.05, 0],
        [s * 0.14, -0.42, 0.18],
        [s * 0.12, -0.98, 0.02],
      ],
      [
        [0, 0.24, 0.24],
        [0.6, 0.17, 0.18],
        [1, 0.21, 0.21],
      ],
      BARK,
      { radial: 9, steps: 7, noise: 0.12, seed: 70 + s },
    );
    for (let i = 0; i < 6; i++) {
      const a = -0.9 + i * 0.5 + (s > 0 ? 0.35 : -0.35);
      const dx = Math.sin(a) * (i === 5 ? 0.6 : 1);
      const dz = Math.cos(a);
      tube(
        lk,
        [
          [s * 0.09, -0.9, 0.02],
          [s * 0.09 + dx * 0.2, -1.0, dz * 0.2],
          [s * 0.09 + dx * 0.42, -1.06, dz * 0.42],
          [s * 0.09 + dx * 0.62, -1.06, dz * 0.6],
        ],
        0.075,
        0.005,
        i % 2 ? BARK_DK : BARK,
        5,
        6,
      );
    }
    attach(rig, lp, lk);
    rig.legs.push(lp);
  }

  // Arms: long gnarled limbs ending in root claws that drag near the ground
  for (const s of [1, -1]) {
    const ap = pivot(frame, s * 0.7, 2.62, 0.25);
    const ak = new K();
    const arm = loft(
      ak,
      [
        [0, 0.05, 0],
        [s * 0.3, -0.48, 0.0],
        [s * 0.38, -0.98, 0.2],
        [s * 0.3, -1.4, 0.4],
      ],
      [
        [0, 0.22, 0.22],
        [0.4, 0.15, 0.15],
        [0.75, 0.12, 0.12],
        [1, 0.14, 0.14],
      ],
      BARK,
      { radial: 9, steps: 10, noise: 0.14, seed: 80 + s },
    );
    put(ak, xf(lumpGeo(0.15, 82 + s, 0.25, 0), s * 0.32, -0.6, -0.02), BARK_DK);
    for (let i = 0; i < 5; i++) {
      const u = 0.15 + i * 0.16;
      const a = s > 0 ? 0.3 - i * 0.6 : Math.PI - 0.3 + i * 0.6;
      const b = arm.point(u, a, -0.02);
      put(ak, spikeAB(b, b.clone().addScaledVector(arm.normal(u, a), 0.18).add(new THREE.Vector3(0, -0.05, 0)), 0.03, 4), THORN);
    }
    // Root claws: four long hooked fingers and a thumb
    const w: V = [s * 0.3, -1.44, 0.4];
    for (let i = 0; i < 4; i++) claw(ak, w, [s * 0.1 + (i - 1.5) * 0.32, -1, 0.4], 0.62 + (i === 1 || i === 2 ? 0.12 : 0), 0.05, i % 2 ? BARK_DK : BARK, [0, 0, 1], 0.45);
    claw(ak, [s * 0.32, -1.38, 0.48], [-s * 0.6, -0.5, 0.7], 0.35, 0.04, BARK_DK, [0, -1, 0], 0.3);
    rag(ak, 0.2, 0.45, [s * 0.3, -0.25, 0.0], s * Math.PI / 2, MOSS, 12 + s, 0.05, 0.5);
    attach(rig, ap, ak);
    if (s === 1) rig.armR = ap;
    else rig.armL = ap;
  }

  // No separate head: the face is part of the trunk; the neck pivot turns the crown
  rig.neck = null;
  rig.head = frame;
  attach(rig, frame, k, gb, GLOW, 3);
  eg.flush(frame, GLOW, 6);
  rig.height = 3.85;
  return rig;
}

// --- Queen Rimeclaw ---------------------------------------------------------------------------------

function rimeclaw(p: Palette): Rig {
  const GLOW = accentGlow(p, '#7fdcff', 0.64);
  const GOWN = dusk(p.secondary, 0.075, 0.38);
  const GOWN_HI = dusk(p.secondary, 0.13, 0.32);
  const ICE = metal(dusk(p.primary, 0.12, 0.3), 0.6);
  const ICE_HI = metal(dusk(p.primary, 0.3, 0.28), 0.65);
  const BONE = retone(p.primary, 0.42, 0.12);
  const SILVER = metal('#5d6670', 0.85);
  const { rig, frame, k, gb } = bossRig('biped');

  // Frozen gown: wide torn hem, an overskirt split at the front, icicles at the belt
  put(k, xf(tornLatheGeo([[0.74, 0], [0.66, 0.14], [0.5, 0.7], [0.4, 1.3], [0.28, 1.78], [0.24, 2.0]], 22, 0.28, 7), 0, 0, -0.08, 0, 0, 0, 1, 1, 1.25), GOWN);
  put(k, tornLatheGeo([[0.66, 0.3], [0.56, 0.75], [0.42, 1.35], [0.33, 1.82], [0.28, 2.0]], 22, 0.5, 13), GOWN_HI);
  // A shard-frost seam down the front, splitting towards the hem
  const seam = (pts: V[]) => gb.add(segLine(pts, 0.011, 0.004, 4));
  const gx = (y: number) => 0.24 + (0.74 - 0.24) * Math.pow(1 - y / 2, 1.4);
  seam([[0, 1.95, 0.29], [0.03, 1.5, gx(1.5) - 0.02], [-0.04, 1.1, gx(1.1) + 0.02], [0.02, 0.7, gx(0.7) + 0.05]]);
  seam([[0.02, 0.7, gx(0.7) + 0.05], [0.22, 0.35, gx(0.35) + 0.06], [0.28, 0.12, 0.7]]);
  seam([[0.02, 0.7, gx(0.7) + 0.05], [-0.18, 0.4, gx(0.4) + 0.05], [-0.3, 0.15, 0.68]]);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    put(k, spikeAB([Math.sin(a) * 0.3, 1.98, Math.cos(a) * 0.3], [Math.sin(a) * 0.36, 1.66 - (i % 3) * 0.1, Math.cos(a) * 0.36], 0.035, 4), ICE_HI);
  }
  k.add(new THREE.TorusGeometry(0.29, 0.035, 4, 16), SILVER, 0, 2.0, 0, Math.PI / 2, 0, 0);

  // Bodice of black ice armour with a narrow waist and a frost gem at the sternum
  const bod = loft(
    k,
    [
      [0, 1.95, 0],
      [0, 2.3, 0.02],
      [0, 2.66, 0.0],
    ],
    [
      [0, 0.22, 0.17],
      [0.45, 0.2, 0.16],
      [1, 0.3, 0.19],
    ],
    ICE,
    { radial: 12, steps: 8 },
  );
  for (const s of [-1, 1]) tube(k, [bod.point(0.05, FRONT + s * 0.2, 0.008), bod.point(0.5, FRONT + s * 0.55, 0.008), bod.point(0.95, FRONT + s * 0.9, 0.008)], 0.014, 0.01, SILVER, 4, 6);
  k.add(new THREE.OctahedronGeometry(0.07, 0), SILVER, 0, 2.4, 0.2, 0, 0, 0, 1, 1.5, 0.6);
  addGlow(frame, new THREE.OctahedronGeometry(0.045, 0), GLOW, 0, 2.4, 0.225, 6).scale.set(1, 1.5, 0.6);

  // High collar of ice shards fanning up behind the head
  for (let i = 0; i < 11; i++) {
    const a = -1.45 + (i / 10) * 2.9;
    const L = 0.55 + Math.cos(a) * 0.35 + (i % 2 ? -0.12 : 0);
    const base: V = [Math.sin(a) * 0.2, 2.62, -0.1 - Math.cos(a) * 0.04];
    const tip: V = [Math.sin(a) * (0.2 + L * 0.7), 2.62 + L * (0.6 + Math.cos(a) * 0.25), -0.1 - L * 0.32];
    put(k, shardGeo(base, tip, 0.065, 5), i % 2 ? ICE_HI : ICE);
  }

  // Head: a gaunt frost-bitten skull with an ice-shard crown
  const neck = pivot(frame, 0, 2.72, 0.02);
  rig.neck = neck;
  rig.head = neck;
  const hk = new K();
  const hg = new GlowBatch();
  hk.add(new THREE.CylinderGeometry(0.05, 0.07, 0.16, 8), BONE, 0, 0.0, 0);
  hk.ball(0.14, 0, 0.2, 0.02, BONE, 0.82, 1.15, 1.0);
  hk.add(new THREE.ConeGeometry(0.1, 0.18, 6), BONE, 0, 0.06, 0.06, Math.PI, 0, 0, 1, 1, 0.8);
  for (const s of [-1, 1]) {
    hk.ball(0.042, s * 0.052, 0.22, 0.115, SHADOW, 1.15, 0.85, 0.7);
    hk.ball(0.03, s * 0.08, 0.13, 0.1, SHADOW, 0.8, 1.3, 0.6);
  }
  orbEyes(hg, 0.22, 0.135, 0.052, 0.017);
  hk.add(new THREE.BoxGeometry(0.07, 0.008, 0.01), SHADOW, 0, 0.07, 0.135);
  for (let i = 0; i < 4; i++) hk.add(new THREE.ConeGeometry(0.006, 0.025, 3), BONE, -0.024 + i * 0.016, 0.062, 0.136, Math.PI, 0, 0);
  // Frozen hair falling behind in torn strands
  for (let i = 0; i < 5; i++) rag(hk, 0.16, 0.85 - (i % 2) * 0.2, [(i - 2) * 0.07, 0.3, -0.08 - Math.abs(i - 2) * 0.01], Math.PI + (i - 2) * 0.25, i % 2 ? GOWN_HI : ICE, 20 + i, 0.25, 0.4);
  // Crown: silver circlet and a ring of ice shards, the front one burning
  hk.add(new THREE.TorusGeometry(0.125, 0.018, 4, 16), SILVER, 0, 0.3, 0.02, Math.PI / 2 - 0.15, 0, 0);
  for (let i = 0; i < 9; i++) {
    const a = -1.7 + (i / 8) * 3.4;
    const L = 0.2 + Math.pow(Math.cos(a / 2), 6) * 0.38 + (i % 2 ? 0 : 0.06);
    const base: V = [Math.sin(a) * 0.12, 0.31 + Math.cos(a) * 0.02, 0.02 + Math.cos(a) * 0.12];
    const tip: V = [Math.sin(a) * (0.12 + L * 0.45), 0.31 + L, 0.02 + Math.cos(a) * 0.12 - L * 0.25];
    if (i === 4) hg.add(shardGeo(base, tip, 0.032, 4));
    else put(hk, shardGeo(base, tip, 0.03, 5), i % 2 ? ICE : ICE_HI);
  }
  attach(rig, neck, hk, hg, GLOW, 5);

  // Shoulders: clusters of ice shards
  // Arms: torn bell sleeves, thin gauntleted forearms and long bone claws
  for (const s of [1, -1]) {
    const ap = pivot(frame, s * 0.34, 2.58, 0);
    const ak = new K();
    crystalCluster(
      ak,
      [s * 0.04, 0.06, 0],
      [
        [s * 0.16, 0.72, -0.05, 0.075],
        [s * 0.42, 0.48, 0.05, 0.065],
        [s * 0.52, 0.16, -0.12, 0.055],
        [s * 0.08, 0.5, -0.26, 0.055],
        [s * 0.3, 0.3, 0.2, 0.045],
      ],
      [ICE_HI, ICE],
    );
    ak.add(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), ICE, s * 0.02, 0.0, 0, 0, 0, -s * 0.3, 1.1, 0.8, 1.1);
    put(ak, tornLatheGeo([[0.24, -0.82], [0.17, -0.5], [0.1, -0.15], [0.09, 0.05]], 12, 0.2, 30 + s), GOWN_HI);
    ak.add(new THREE.CylinderGeometry(0.055, 0.045, 0.5, 7), ICE, 0, -0.85, 0.02);
    for (let i = 0; i < 3; i++) put(ak, spikeAB([s * 0.04, -0.7 - i * 0.12, 0.0], [s * 0.16, -0.62 - i * 0.12, -0.05], 0.018, 4), ICE_HI);
    ak.add(new THREE.BoxGeometry(0.1, 0.1, 0.06), ICE, 0, -1.13, 0.03);
    const w: V = [0, -1.16, 0.03];
    for (let i = 0; i < 4; i++) claw(ak, w, [(i - 1.5) * 0.14 - s * 0.05, -1, 0.25], 0.5 + (i === 1 || i === 2 ? 0.08 : 0), 0.022, i % 2 ? BONE : ICE_HI, [0, 0, 1], 0.45);
    claw(ak, [-s * 0.05, -1.13, 0.06], [-s * 0.5, -0.6, 0.6], 0.25, 0.018, BONE, [0, -1, 0], 0.3);
    attach(rig, ap, ak);
    if (s === 1) rig.armR = ap;
    else rig.armL = ap;
  }

  // Long torn train of the gown
  const cp = pivot(frame, 0, 2.55, -0.2);
  const ck = new K();
  ck.add(ragGeo(0.85, 2.5, { folds: 4, depth: 0.08, flare: 0.5, tatter: 0.4, seed: 41, curl: 1.0 }), GOWN_HI, 0, 0, 0);
  rig.cape = cp;
  attach(rig, cp, ck);

  attach(rig, frame, k, gb, GLOW, 3.5);
  rig.height = 3.6;
  return rig;
}

// --- Magmaroth --------------------------------------------------------------------------------------

function magmaroth(p: Palette): Rig {
  const GLOW = accentGlow(p, '#ff6a1f', 0.55);
  const CORE = retone(GLOW, 0.42);
  const OBS = metal(dusk(p.primary, 0.085, 0.1), 0.5);
  const OBS_HI = metal(dusk(p.primary, 0.17, 0.08), 0.55);
  const OBS_DK = dusk(p.primary, 0.05, 0.1);
  const HORN = '#201a17';
  const { rig, frame, k, gb } = bossRig('biped');

  // Barrel torso of black glass, hunched forward
  const torso = loft(
    k,
    [
      [0, 1.15, -0.1],
      [0, 1.6, -0.02],
      [0, 2.15, 0.1],
      [0, 2.55, 0.18],
    ],
    [
      [0, 0.52, 0.4],
      [0.35, 0.6, 0.44],
      [0.75, 0.84, 0.55],
      [1, 0.66, 0.45],
    ],
    OBS,
    { radial: 14, steps: 12 },
  );
  // Rock plates scattered over the hide
  const rr = rnd(5);
  for (let i = 0; i < 16; i++) {
    const u = 0.15 + rr() * 0.8;
    const a = rr() * Math.PI * 2;
    if (Math.abs(Math.sin(a) + 1) < 0.5 && u < 0.6) continue;
    const q = torso.point(u, a, -0.06);
    put(k, xf(lumpGeo(0.17 + rr() * 0.1, 10 + i, 0.2, 0), q.x, q.y, q.z, rr(), rr(), 0, 1.2, 0.8, 1.0), i % 3 ? OBS_HI : OBS_DK);
  }
  // Molten cracks running over chest and back
  for (let i = 0; i < 6; i++) crack(gb, torso, 0.2 + rr() * 0.6, rr() * Math.PI * 2, 4, 0.05 * (rr() > 0.5 ? 1 : -1), 0.7, 40 + i, 0.012, 0.014);
  // Caged molten belly: the core shows between ribs of obsidian
  addGlow(frame, new THREE.SphereGeometry(0.34, 14, 10), CORE, 0, 1.62, 0.3, 1.2).scale.set(1.1, 0.9, 0.55);
  addGlow(frame, new THREE.SphereGeometry(0.2, 10, 8), GLOW, 0, 1.62, 0.39, 2.2).scale.set(1.1, 0.9, 0.55);
  k.ball(0.38, 0, 1.62, 0.22, SHADOW, 1.15, 0.95, 0.5);
  for (let i = 0; i < 4; i++) {
    const y = 1.36 + i * 0.17;
    const w = 0.42 - Math.abs(i - 1.5) * 0.04;
    for (const s of [-1, 1]) tube(k, [[s * (w + 0.12), y + 0.06, 0.1], [s * w * 0.8, y, 0.44], [s * 0.12, y - 0.03, 0.5]], 0.055, 0.025, OBS_HI, 5, 6);
  }
  // Volcanic vents on the shoulders, smouldering
  for (const s of [-1, 1]) {
    put(k, xf(lumpGeo(0.45, 60 + s, 0.18, 1), s * 0.82, 2.42, 0.02, 0, 0, 0, 1.0, 0.85, 1.0), OBS);
    k.add(new THREE.CylinderGeometry(0.13, 0.3, 0.38, 7, 1, true), OBS_HI, s * 0.95, 2.86, -0.08, 0, 0, -s * 0.3);
    addGlow(frame, new THREE.CylinderGeometry(0.12, 0.12, 0.04, 7), GLOW, s * 1.0, 3.02, -0.08, 2).rotation.z = -s * 0.3;
    gb.add(flameGeo([s * 1.0, 3.02, -0.08], [s * 0.25, 1, -0.1], 0.28, 0.05, 70 + s));
    for (let i = 0; i < 4; i++) put(k, spikeAB([s * (0.7 + i * 0.05), 2.62, -0.25 + i * 0.12], [s * (0.95 + i * 0.12), 3.0 - i * 0.07, -0.3 + i * 0.16], 0.07, 5), i % 2 ? OBS_HI : OBS_DK);
  }
  // Ridge of obsidian spires down the back
  for (let i = 0; i < 7; i++) {
    const u = 0.25 + i * 0.11;
    const b = torso.point(u, Math.PI / 2, -0.05);
    put(k, shardGeo(b, b.clone().add(new THREE.Vector3((i % 2 ? 0.12 : -0.12), 0.42 + Math.sin(u * 3) * 0.2, -0.35)), 0.09, 5), i % 2 ? OBS_HI : OBS);
  }
  // Pelvis and hanging plates
  put(k, xf(lumpGeo(0.45, 3, 0.15, 1), 0, 1.12, -0.04, 0, 0, 0, 1.3, 0.6, 0.9), OBS_DK);

  // Head sunk low between the shoulders: slit eyes, molten jaws, huge horns
  const neck = pivot(frame, 0, 2.5, 0.78);
  neck.scale.setScalar(1.3);
  rig.neck = neck;
  rig.head = neck;
  const hk = new K();
  const hg = new GlowBatch();
  put(hk, xf(lumpGeo(0.3, 80, 0.15, 1), 0, -0.05, -0.25, 0, 0, 0, 1.3, 0.8, 1.1), OBS_DK);
  put(hk, xf(lumpGeo(0.26, 81, 0.12, 1), 0, 0.08, 0.02, 0, 0, 0, 1.05, 0.85, 1.0), OBS);
  for (const s of [-1, 1]) put(hk, xf(lumpGeo(0.13, 82 + s, 0.15, 0), s * 0.13, 0.17, 0.2, 0.3, s * 0.3, s * 0.35, 1.3, 0.5, 0.8), OBS_HI);
  eyes(hg, 0.13, 0.25, 0.1, 0.085, 0.018, 0.3, 0.35);
  for (const s of [-1, 1]) hk.add(new THREE.BoxGeometry(0.12, 0.035, 0.03), SHADOW, s * 0.1, 0.12, 0.235, 0, s * 0.35, -s * 0.3);
  // Open jaws with a burning throat
  hg.add(new THREE.SphereGeometry(0.07, 8, 6), 0, -0.08, 0.2, 0, 0, 0, 1.3, 0.4, 0.7);
  put(hk, xf(lumpGeo(0.2, 85, 0.12, 0), 0, -0.17, 0.12, 0.25, 0, 0, 1.2, 0.5, 1.0), OBS_HI);
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 0.06;
    put(hk, spikeAB([x, -0.01, 0.25 - Math.abs(x) * 0.4], [x * 0.9, -0.08, 0.27 - Math.abs(x) * 0.4], 0.016, 3), OBS_HI);
    put(hk, spikeAB([x, -0.13, 0.27 - Math.abs(x) * 0.4], [x * 0.9, -0.06, 0.28 - Math.abs(x) * 0.4], 0.014, 3), OBS_HI);
  }
  hg.add(new THREE.ConeGeometry(0.02, 0.18, 4), 0.05, -0.27, 0.28, Math.PI, 0, 0);
  // Horns sweeping out, back and forward again
  for (const s of [-1, 1]) {
    horn(
      hk,
      [
        [s * 0.18, 0.18, -0.02],
        [s * 0.48, 0.3, -0.18],
        [s * 0.78, 0.52, -0.08],
        [s * 0.88, 0.85, 0.2],
        [s * 0.78, 1.05, 0.45],
      ],
      0.11,
      HORN,
      OBS_DK,
    );
  }
  attach(rig, neck, hk, hg, GLOW, 5);

  // Arms: enormous, fists of fused rock with molten knuckles
  for (const s of [1, -1]) {
    const ap = pivot(frame, s * 0.98, 2.32, 0.05);
    const ak = new K();
    const ag = new GlowBatch();
    const upper = loft(
      ak,
      [
        [0, 0.05, 0],
        [s * 0.1, -0.45, 0.0],
        [s * 0.08, -0.9, 0.05],
      ],
      [
        [0, 0.3, 0.3],
        [0.5, 0.27, 0.27],
        [1, 0.24, 0.24],
      ],
      OBS,
      { radial: 10, steps: 6 },
    );
    const fore = loft(
      ak,
      [
        [s * 0.08, -0.9, 0.05],
        [s * 0.08, -1.25, 0.1],
        [s * 0.06, -1.55, 0.12],
      ],
      [
        [0, 0.26, 0.26],
        [0.6, 0.36, 0.34],
        [1, 0.32, 0.3],
      ],
      OBS_HI,
      { radial: 10, steps: 6 },
    );
    ag.add(new THREE.SphereGeometry(0.16, 8, 6), s * 0.08, -0.9, 0.04);
    crack(ag, upper, 0.1, s > 0 ? 0 : Math.PI, 4, 0.2, 0.5, 90 + s, 0.011);
    crack(ag, fore, 0.1, FRONT, 4, 0.2, 0.6, 92 + s, 0.012);
    for (let i = 0; i < 3; i++) put(ak, shardGeo([s * 0.3, -1.1 - i * 0.15, 0.0], [s * 0.62, -0.98 - i * 0.15, -0.12], 0.07, 4), OBS_DK);
    // Fist
    put(ak, xf(lumpGeo(0.4, 96 + s, 0.14, 1), s * 0.06, -1.82, 0.14, 0, 0, 0, 1.0, 0.9, 1.05), OBS);
    for (let i = 0; i < 4; i++) {
      const x = s * 0.06 + (i - 1.5) * 0.17;
      put(ak, xf(lumpGeo(0.12, 100 + i + s * 5, 0.2, 0), x, -1.98, 0.42, 0, 0, 0, 1, 0.9, 1), OBS_HI);
      ag.add(segLine([[x - 0.07, -1.9, 0.5], [x, -1.94, 0.53], [x + 0.06, -1.88, 0.5]], 0.011, 0.007, 3));
      put(ak, spikeAB([x, -1.92, 0.5], [x, -1.94, 0.68], 0.045, 4), OBS_DK);
    }
    ag.add(new THREE.ConeGeometry(0.025, 0.2, 4), s * 0.15, -2.27, 0.2, Math.PI, 0, 0);
    attach(rig, ap, ak, ag, GLOW, 3);
    if (s === 1) rig.armR = ap;
    else rig.armL = ap;
  }

  // Short pillar legs
  for (const s of [-1, 1]) {
    const lp = pivot(frame, s * 0.44, 1.12, 0);
    const lk = new K();
    const lg = new GlowBatch();
    const leg = loft(
      lk,
      [
        [0, 0.05, 0],
        [s * 0.04, -0.5, 0.06],
        [s * 0.05, -0.95, 0.02],
      ],
      [
        [0, 0.32, 0.32],
        [0.5, 0.27, 0.28],
        [1, 0.3, 0.3],
      ],
      OBS,
      { radial: 10, steps: 6 },
    );
    crack(lg, leg, 0.1, FRONT + s * 0.4, 4, 0.2, 0.5, 110 + s, 0.011);
    put(lk, xf(lumpGeo(0.2, 112 + s, 0.2, 0), s * 0.04, -0.55, 0.2, 0, 0, 0, 1, 1, 0.8), OBS_HI);
    put(lk, xf(lumpGeo(0.32, 114 + s, 0.12, 1), s * 0.05, -1.0, 0.12, 0, 0, 0, 1.05, 0.45, 1.3), OBS_DK);
    for (let i = 0; i < 3; i++) put(lk, spikeAB([s * 0.05 + (i - 1) * 0.15, -1.04, 0.42], [s * 0.05 + (i - 1) * 0.18, -1.1, 0.58], 0.05, 4), OBS_HI);
    attach(rig, lp, lk, lg, GLOW, 3);
    rig.legs.push(lp);
  }

  attach(rig, frame, k, gb, GLOW, 3);
  rig.height = 3.45;
  return rig;
}

// --- The Hollow King --------------------------------------------------------------------------------

function hollowKing(p: Palette): Rig {
  const GLOW = accentGlow(p, '#5fe0a8', 0.58);
  const ROBE = dusk(p.primary, 0.09, 0.42);
  const ROBE_DK = dusk(p.primary, 0.05, 0.38);
  const ROBE_HI = dusk(p.primary, 0.16, 0.38);
  const PLATE = metal('#1b1a20', 0.65);
  const PLATE_HI = metal('#34323c', 0.72);
  const GOLD = metal('#6e5726', 0.88);
  const BONE = '#a89d86';
  const BONE_DK = '#6b6354';
  const { rig, frame, k, gb } = bossRig('biped', 'cast');

  // Rotting royal robes: layered, torn and trailing on the ground
  put(k, tornLatheGeo([[0.62, 0], [0.56, 0.3], [0.44, 1.0], [0.35, 1.6], [0.3, 1.92]], 20, 0.3, 4), ROBE);
  put(k, tornLatheGeo([[0.52, 0.45], [0.46, 0.9], [0.37, 1.45], [0.32, 1.9]], 20, 0.4, 9), ROBE_DK);
  // Front panel with gold trim, a belt with a skull buckle
  rag(k, 0.34, 1.75, [0, 1.88, 0.38], 0, ROBE_HI, 17, 0.2, 0.25);
  for (const s of [-1, 1]) tube(k, [[s * 0.17, 1.86, 0.39], [s * 0.2, 1.2, 0.5], [s * 0.22, 0.4, 0.62]], 0.012, 0.01, GOLD, 3, 6);
  k.add(new THREE.CylinderGeometry(0.33, 0.33, 0.08, 14), GOLD, 0, 1.9, 0, 0, 0, 0, 1, 1, 0.8);
  k.ball(0.07, 0, 1.88, 0.3, BONE, 1, 1.1, 0.9);
  for (const s of [-1, 1]) k.ball(0.02, s * 0.025, 1.9, 0.36, SHADOW);

  // Black-gold breastplate over a hollow ribcage
  const chest = loft(
    k,
    [
      [0, 1.88, 0],
      [0, 2.25, 0.03],
      [0, 2.6, 0.0],
    ],
    [
      [0, 0.28, 0.21],
      [0.5, 0.33, 0.24],
      [1, 0.38, 0.24],
    ],
    PLATE,
    { radial: 12, steps: 8 },
  );
  for (const s of [-1, 1]) {
    tube(k, [chest.point(0.1, FRONT + s * 0.15, 0.01), chest.point(0.55, FRONT + s * 0.5, 0.01), chest.point(0.95, FRONT + s * 0.95, 0.01)], 0.016, 0.012, GOLD, 4, 6);
    for (let i = 0; i < 3; i++) tube(k, [chest.point(0.3 + i * 0.2, FRONT + s * 0.1, 0.012), chest.point(0.27 + i * 0.2, FRONT + s * 0.6, 0.015), chest.point(0.22 + i * 0.2, FRONT + s * 1.1, 0.012)], 0.018, 0.012, PLATE_HI, 4, 6);
  }
  // A green soul-sigil at the heart
  const sig = chest.point(0.55, FRONT, 0.02);
  gb.add(segLine([[0, sig.y + 0.13, sig.z], [0.05, sig.y, sig.z + 0.01], [0, sig.y - 0.13, sig.z], [-0.05, sig.y, sig.z + 0.01], [0, sig.y + 0.13, sig.z]], 0.012, 0.012, 4));
  gb.add(segLine([[-0.1, sig.y + 0.03, sig.z - 0.01], [0.1, sig.y + 0.03, sig.z - 0.01]], 0.01, 0.01, 4));
  // Mantle of torn velvet over the shoulders
  for (let i = 0; i < 7; i++) {
    const a = -1.4 + (i / 6) * 2.8;
    rag(k, 0.32, 0.55, [Math.sin(a) * 0.4, 2.62, -Math.cos(a) * 0.12 + 0.02], a + Math.PI, i % 2 ? ROBE_DK : ROBE, 50 + i, 0.4, 0.5);
  }
  // Collar of black blades standing behind the head
  thornRing(k, [0, 2.6, -0.02], 0.24, 9, 0.62, 0.05, PLATE_HI, { tilt: 1.15, arc: [Math.PI * 0.55, Math.PI * 1.45], jitter: 0.35, seed: 8 });

  // Skull with eye-fire, crown and soul flames
  const neck = pivot(frame, 0, 2.68, 0.03);
  rig.neck = neck;
  rig.head = neck;
  const hk = new K();
  const hg = new GlowBatch();
  hk.add(new THREE.CylinderGeometry(0.06, 0.08, 0.14, 8), BONE_DK, 0, 0.0, 0);
  hk.ball(0.16, 0, 0.21, 0.02, BONE, 0.92, 1.0, 1.05);
  for (const s of [-1, 1]) {
    hk.ball(0.05, s * 0.06, 0.2, 0.13, SHADOW, 1.1, 0.9, 0.7);
    hk.ball(0.04, s * 0.11, 0.13, 0.08, BONE, 1, 0.6, 1.0);
  }
  orbEyes(hg, 0.2, 0.155, 0.06, 0.024);
  for (const s of [-1, 1]) hg.add(flameGeo([s * 0.06, 0.23, 0.15], [s * 0.25, 0.5, -0.6], 0.18, 0.014, 120 + s, 0.25));
  hk.add(new THREE.ConeGeometry(0.03, 0.06, 3), SHADOW, 0, 0.13, 0.17, Math.PI, 0, 0);
  // Jaw hanging open, teeth
  hk.add(new THREE.BoxGeometry(0.16, 0.06, 0.12), BONE_DK, 0, 0.03, 0.08, 0.25, 0, 0);
  for (let i = 0; i < 6; i++) {
    hk.add(new THREE.BoxGeometry(0.018, 0.03, 0.015), BONE, -0.05 + i * 0.02, 0.09, 0.16);
    hk.add(new THREE.BoxGeometry(0.016, 0.026, 0.015), BONE, -0.05 + i * 0.02, 0.045, 0.14, 0.25, 0, 0);
  }
  // Crown: a black-gold band with tall spikes and a green gem
  hk.lathe([[0.15, 0], [0.16, 0.1], [0.18, 0.13]], 0, 0.3, 0.02, GOLD, 14);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const tall = i % 2 ? 0.18 : 0.34 - (Math.abs(Math.cos(a)) < 0.5 ? 0.06 : 0);
    put(hk, spikeAB([Math.sin(a) * 0.165, 0.42, 0.02 + Math.cos(a) * 0.165], [Math.sin(a) * 0.23, 0.42 + tall, 0.02 + Math.cos(a) * 0.21], 0.035, 4), i % 2 ? PLATE_HI : GOLD);
  }
  hg.add(new THREE.OctahedronGeometry(0.035, 0), 0, 0.37, 0.19, 0, 0, 0, 1, 1.4, 0.6);
  attach(rig, neck, hk, hg, GLOW, 5);
  const fl = new GlowBatch();
  for (let i = 0; i < 3; i++) fl.add(flameGeo([(i - 1) * 0.07, 0.45, 0.0], [(i - 1) * 0.2, 1, -0.15], 0.3 - Math.abs(i - 1) * 0.08, 0.03, 130 + i, 0.3));
  fl.flush(neck, GLOW, 2);

  // Arms: huge spiked pauldrons with skulls, torn sleeves, skeletal hands
  for (const s of [1, -1]) {
    const ap = pivot(frame, s * 0.44, 2.5, 0);
    const ak = new K();
    const ag = new GlowBatch();
    for (let i = 0; i < 3; i++) ak.add(new THREE.SphereGeometry(0.25 - i * 0.03, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), i % 2 ? PLATE_HI : PLATE, s * (0.06 + i * 0.03), 0.1 - i * 0.1, 0, 0, 0, -s * (0.35 + i * 0.15), 1.15, 0.75, 1.15);
    ak.add(new THREE.TorusGeometry(0.27, 0.014, 3, 16), GOLD, s * 0.06, 0.1, 0, Math.PI / 2, -s * 0.35, 0);
    for (let i = 0; i < 3; i++) horn(ak, [[s * (0.12 + i * 0.04), 0.22, -0.12 + i * 0.12], [s * (0.3 + i * 0.05), 0.5 - i * 0.08, -0.15 + i * 0.12], [s * (0.48 + i * 0.05), 0.68 - i * 0.12, -0.1 + i * 0.1]], 0.05, i === 1 ? GOLD : PLATE_HI);
    ak.ball(0.08, s * 0.24, 0.07, 0.18, BONE, 1, 1.1, 0.9);
    for (const e of [-1, 1]) ak.ball(0.022, s * 0.24 + e * 0.03, 0.09, 0.25, SHADOW);
    put(ak, tornLatheGeo([[0.26, -1.0], [0.18, -0.6], [0.12, -0.15], [0.12, 0.0]], 12, 0.25, 60 + s), ROBE);
    ak.add(new THREE.CylinderGeometry(0.07, 0.06, 0.32, 8), PLATE, 0, -1.0, 0.02);
    ak.add(new THREE.TorusGeometry(0.075, 0.012, 3, 10), GOLD, 0, -0.88, 0.02, Math.PI / 2, 0, 0);
    // Skeletal hand
    ak.add(new THREE.BoxGeometry(0.1, 0.08, 0.05), BONE_DK, 0, -1.2, 0.03);
    if (s === -1) {
      for (let i = 0; i < 4; i++) claw(ak, [(i - 1.5) * 0.028, -1.22, 0.04], [(i - 1.5) * 0.25, -1, 0.5], 0.24, 0.012, BONE, [0, 0, 1], 0.5);
      claw(ak, [0.05, -1.2, 0.05], [0.5, -0.5, 0.6], 0.14, 0.012, BONE);
      ag.add(flameGeo([0, -1.3, 0.12], [0, -0.3, 1], 0.2, 0.025, 140, 0.4));
    } else {
      for (let i = 0; i < 4; i++) ak.add(new THREE.TorusGeometry(0.05, 0.012, 3, 8, Math.PI * 1.3), BONE, (i - 1.5) * 0.026, -1.25, 0.03, 0, Math.PI / 2, 0);
    }
    attach(rig, ap, ak, ag, GLOW, 2.5);
    if (s === 1) {
      rig.armR = ap;
      // The soul-staff, held upright
      const hand = pivot(ap, 0, -1.24, 0.04);
      const sg = pivot(hand, 0, 0, 0);
      sg.rotation.x = 0.2;
      const sk = new K();
      const sgl = new GlowBatch();
      tube(sk, [[0, -1.15, 0], [0.03, -0.2, 0.02], [-0.03, 0.8, -0.02], [0, 1.55, 0]], 0.04, 0.032, PLATE, 6, 10);
      for (const y of [-0.05, 0.08, 1.35]) sk.add(new THREE.TorusGeometry(0.045, 0.014, 3, 8), GOLD, 0, y, 0, Math.PI / 2, 0, 0);
      sk.ball(0.09, 0, 1.55, 0, BONE, 1, 1.05, 1.1);
      for (const e of [-1, 1]) sk.ball(0.025, e * 0.035, 1.56, 0.08, SHADOW);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        tube(sk, [[Math.sin(a) * 0.05, 1.6, Math.cos(a) * 0.05], [Math.sin(a) * 0.2, 1.72, Math.cos(a) * 0.2], [Math.sin(a) * 0.24, 2.0, Math.cos(a) * 0.24], [Math.sin(a) * 0.3, 2.3, Math.cos(a) * 0.3]], 0.024, 0.004, i % 2 ? GOLD : PLATE_HI, 4, 8);
      }
      put(sk, spikeAB([0, 1.0, 0], [0, -1.35, 0], 0.03, 4), PLATE_HI);
      attach(rig, sg, sk, sgl, GLOW, 5);
      const gem = addGlow(sg, new THREE.OctahedronGeometry(0.1, 0), GLOW, 0, 1.87, 0, 4);
      gem.scale.set(1, 1.5, 1);
      rig.spinners.push(gem);
    } else rig.armL = ap;
  }

  // Long tattered royal cape
  const cp = pivot(frame, 0, 2.6, -0.24);
  const ck = new K();
  ck.add(ragGeo(0.95, 2.45, { folds: 4, depth: 0.07, flare: 0.4, tatter: 0.4, seed: 61, curl: 0.45 }), ROBE_DK, 0, 0, 0);
  ck.add(new THREE.BoxGeometry(0.9, 0.06, 0.06), GOLD, 0, -0.02, 0.03);
  rig.cape = cp;
  attach(rig, cp, ck);

  attach(rig, frame, k, gb, GLOW, 3);
  rig.height = 3.65;
  return rig;
}

// --- Nyxara -----------------------------------------------------------------------------------------

function nyxara(p: Palette): Rig {
  const GLOW = accentGlow(p, '#48e0c8', 0.6);
  const CRYS = metal(dusk(p.primary, 0.1, 0.45), 0.7);
  const CRYS_HI = metal(dusk(p.primary, 0.22, 0.4), 0.75);
  const CRYS_DK = dusk(p.primary, 0.05, 0.4);
  const VEIN = dusk(p.primary, 0.07, 0.6);
  const { rig, frame, k, gb } = bossRig('float', 'cast');

  // The monolith: a faceted, heptagonal crystal with one face turned to the front
  const SIDES = 7;
  const prof: [number, number][] = [
    [0.001, 0],
    [0.42, 0.62],
    [0.64, 1.2],
    [0.52, 1.85],
    [0.001, 2.65],
  ];
  const Y0 = 0.75;
  const off = -Math.PI / SIDES;
  put(k, xf(flat(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), SIDES)), 0, Y0, 0, 0, off, 0), CRYS);
  const rAt = (y: number): number => {
    const h = y - Y0;
    for (let i = 1; i < prof.length; i++) {
      const [r1, y1] = prof[i]!;
      const [r0, y0] = prof[i - 1]!;
      if (h <= y1) return r0 + ((r1 - r0) * (h - y0)) / (y1 - y0);
    }
    return 0;
  };
  /** Point on the faceted surface at height y and angle a (0 = front, +x = π/2). */
  const surf = (y: number, a: number, out = 0.01): THREE.Vector3 => {
    const step = (Math.PI * 2) / SIDES;
    const c = Math.round(a / step) * step;
    const d = (rAt(y) * Math.cos(Math.PI / SIDES)) / Math.cos(a - c) + out;
    return new THREE.Vector3(Math.sin(a) * d, y, Math.cos(a) * d);
  };
  // Inner layer of lighter crystal on the facet edges
  for (let i = 0; i < SIDES; i++) {
    const a = off + (i / SIDES) * Math.PI * 2;
    tube(k, [0.9, 1.4, 1.95, 2.6, 3.3].map((y) => { const q = surf(y, a, 0.0); return [q.x, q.y, q.z] as V; }), 0.025, 0.012, CRYS_HI, 4, 10);
  }
  // Light cracks spreading from the eye over the facets
  const rr = rnd(9);
  for (let i = 0; i < 8; i++) {
    let y = 2.05 + (rr() - 0.5) * 0.3;
    let a = (i % 2 ? 1 : -1) * (0.45 + rr() * 0.2);
    const dy = (i < 4 ? 1 : -1) * (0.12 + rr() * 0.08);
    const da = (i % 2 ? 1 : -1) * (0.18 + rr() * 0.12);
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j < 6; j++) {
      pts.push(surf(y, a, 0.008));
      y += dy * (0.7 + rr() * 0.6);
      a += da * (0.6 + rr() * 0.8);
      if (y < 1.0 || y > 3.2) break;
    }
    if (pts.length > 1) gb.add(segLine(pts, 0.011, 0.004, 4));
  }
  // Corrupted veins of dark flesh wrapped around the crystal
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 4) * Math.PI * 2 + 0.9;
    const pts: V[] = [];
    for (let j = 0; j <= 6; j++) {
      const y = 3.0 - j * 0.33;
      const q = surf(y, a0 + j * 0.45 * (i % 2 ? 1 : -1), 0.025);
      if (Math.abs(Math.atan2(q.x, q.z)) < 0.5 && y > 1.7 && y < 2.4) continue;
      pts.push([q.x, q.y, q.z]);
    }
    tube(k, pts, 0.045, 0.02, VEIN, 5, 16);
  }

  // The great eye
  const EY = 2.05;
  const ez = rAt(EY) * Math.cos(Math.PI / SIDES);
  k.ball(0.32, 0, EY, ez - 0.05, SHADOW, 1.25, 0.78, 0.4);
  k.ball(0.25, 0, EY, ez + 0.0, '#140a16', 1.2, 0.72, 0.42);
  addGlow(frame, new THREE.CircleGeometry(0.15, 20), GLOW, 0, EY, ez + 0.1, 3.5);
  addGlow(frame, new THREE.TorusGeometry(0.17, 0.012, 4, 20), GLOW, 0, EY, ez + 0.095, 2);
  k.add(new THREE.BoxGeometry(0.05, 0.25, 0.02), SHADOW, 0, EY, ez + 0.115);
  // Crystal lids and lashes of shards around the eye
  for (const s of [-1, 1]) {
    k.add(new THREE.TorusGeometry(0.3, 0.05, 4, 14, Math.PI), CRYS_HI, 0, EY + s * 0.02, ez + 0.05, 0, 0, s > 0 ? 0 : Math.PI, 1.05, 0.72, 1);
    for (let i = 0; i < 6; i++) {
      const a = 0.25 + (i / 5) * (Math.PI - 0.5);
      const bx = Math.cos(a) * 0.32;
      const by = EY + s * Math.sin(a) * 0.24;
      put(k, shardGeo([bx, by, ez + 0.04], [bx * 1.45, EY + s * Math.sin(a) * 0.44, ez + 0.14], 0.03, 4), i % 2 ? CRYS : CRYS_HI);
    }
  }
  halo(frame, GLOW, 0.4, 0, EY, ez + 0.2, 0.05);

  // Crystal growths bursting from the shoulders of the monolith, crown and hanging roots
  for (const s of [-1, 1]) {
    crystalCluster(
      k,
      [s * 0.45, 2.3, -0.05],
      [
        [s * 0.75, 0.75, -0.1, 0.13],
        [s * 0.55, 0.3, 0.25, 0.09],
        [s * 0.7, 0.1, -0.35, 0.1],
        [s * 0.3, 0.9, -0.3, 0.08],
        [s * 0.85, -0.2, 0.05, 0.08],
      ],
      [CRYS, CRYS_HI, CRYS_DK],
    );
    crystalCluster(
      k,
      [s * 0.35, 1.3, 0.0],
      [
        [s * 0.55, -0.35, 0.1, 0.08],
        [s * 0.4, -0.15, -0.3, 0.07],
      ],
      [CRYS_HI, CRYS],
    );
  }
  crystalCluster(
    k,
    [0, 3.15, 0],
    [
      [0.05, 0.6, 0.0, 0.1],
      [0.3, 0.42, -0.1, 0.07],
      [-0.28, 0.45, 0.08, 0.07],
      [0.0, 0.38, -0.3, 0.06],
    ],
    [CRYS_HI, CRYS],
  );
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const b: V = [Math.sin(a) * 0.15, 0.95, Math.cos(a) * 0.15];
    put(k, shardGeo(b, [Math.sin(a) * (0.3 + (i % 2) * 0.15), 0.2 + (i % 3) * 0.15, Math.cos(a) * (0.3 + (i % 2) * 0.15)], 0.06, 5), i % 2 ? CRYS_DK : CRYS);
  }
  put(k, shardGeo([0, 0.9, 0], [0, 0.0, 0], 0.07, 5), CRYS_HI);

  // Orbiting shards: an outer ring and a tilted inner ring
  const ring = (radius: number, n: number, y: number, tilt: [number, number], seed: number, size: number): void => {
    const holder = pivot(frame, 0, y, 0);
    holder.rotation.set(tilt[0], 0, tilt[1]);
    const sp = pivot(holder, 0, 0, 0);
    const sk = new K();
    const sg = new GlowBatch();
    const r2 = rnd(seed);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = new THREE.Vector3(Math.sin(a) * radius, (r2() - 0.5) * 0.4, Math.cos(a) * radius);
      const d = new THREE.Vector3(Math.cos(a) * (r2() - 0.5), 1, -Math.sin(a) * (r2() - 0.5)).normalize().multiplyScalar(size * (0.7 + r2() * 0.6));
      const g = shardGeo(c.clone().sub(d), c.clone().add(d), size * 0.28, 5);
      if (i % 4 === 0) sg.add(shardGeo(c.clone().sub(d.clone().multiplyScalar(0.6)), c.clone().add(d.clone().multiplyScalar(0.6)), size * 0.16, 4));
      else put(sk, g, i % 2 ? CRYS_HI : CRYS);
    }
    attach(rig, sp, sk, sg, GLOW, 2.5);
    rig.spinners.push(sp);
  };
  ring(1.35, 8, 2.0, [0, 0], 3, 0.32);
  ring(1.05, 6, 2.1, [0.35, 0.3], 5, 0.22);

  attach(rig, frame, k, gb, GLOW, 3);
  rig.height = 3.7;
  return rig;
}
