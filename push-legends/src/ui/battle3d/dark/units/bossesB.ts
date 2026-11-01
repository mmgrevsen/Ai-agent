import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { K, type V } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { arm, type BodyColors, capGeo, leg, metal, ragGeo, rune, SHAPES, torso } from '../parts';
import {
  accentGlow,
  attach,
  bossRig,
  claw,
  crystalCluster,
  dusk,
  eyes,
  GlowBatch,
  horn,
  loft,
  lumpGeo,
  orbEyes,
  pivot,
  put,
  rag,
  rnd,
  shardGeo,
  spikeAB,
  thornRing,
  tube,
  xf,
} from './_bosses';
import { flameGeo, segLine, SHADOW } from './_creatures';
import type { Palette } from './enemies';

/**
 * Mini-bosses (the road guardians of each world). Near-black hide, stone, plate and crystal with
 * one accent glow from the world palette:
 *
 *   troll | mossback          - Mossback Troll: hunched moss-grown brute, stone growths on its back,
 *                               underbite tusks, a boulder club bound to a log with a glowing rune.
 *   yeti | yeti_chieftain     - Yeti Chieftain: frost-tipped shaggy beast, great ram horns, skull
 *                               necklace and beast-skull pauldron, icicles, burning ice eyes.
 *   overseer | forge_overseer - Forge Overseer: armoured slave-driver, furnace-mask helm with a
 *                               burning grate and chimneys, chains, a white-hot hammer.
 *   warden | grave_warden     - Grave Warden: gaunt undead jailer in black plate, caged skull helm,
 *                               tower shield with a burning rune, notched great blade, lantern, keys.
 *   shardmaw                  - Shardmaw (quad): crystal-spined beast with a maw of glowing shards.
 */
export function bossesB(sprite: string, p: Palette): Rig | null {
  switch (sprite) {
    case 'troll':
    case 'mossback':
      return mossback(p);
    case 'yeti':
    case 'yeti_chieftain':
      return yeti(p);
    case 'overseer':
    case 'forge_overseer':
      return overseer(p);
    case 'warden':
    case 'grave_warden':
      return warden(p);
    case 'shardmaw':
      return shardmaw(p);
    default:
      return null;
  }
}

const FRONT = -Math.PI / 2;

// --- Mossback Troll ---------------------------------------------------------------------------------

function mossback(p: Palette): Rig {
  const GLOW = accentGlow(p, '#a8e05a', 0.55);
  const SKIN = dusk(p.primary, 0.14, 0.14);
  const SKIN_DK = dusk(p.primary, 0.08, 0.14);
  const MOSS = dusk(p.primary, 0.2, 0.5);
  const MOSS_DK = dusk(p.primary, 0.08, 0.45);
  const STONE = metal('#2e2e31', 0.3);
  const STONE_HI = '#45454a';
  const WOOD = '#2a1f17';
  const TUSK = '#8f8270';
  const { rig, frame, k, gb } = bossRig('biped');

  // Hunched torso, a hanging belly, a humped back heaped with moss and stone growths
  const body = loft(
    k,
    [
      [0, 0.95, -0.1],
      [0, 1.45, 0.02],
      [0, 1.95, 0.18],
      [0, 2.25, 0.36],
    ],
    [
      [0, 0.42, 0.36],
      [0.4, 0.55, 0.46],
      [0.8, 0.62, 0.5],
      [1, 0.42, 0.36],
    ],
    SKIN,
    { radial: 14, steps: 12, noise: 0.04, seed: 3 },
  );
  put(k, xf(lumpGeo(0.4, 4, 0.08, 1), 0, 1.3, 0.25, 0, 0, 0, 1.05, 0.9, 0.8), SKIN);
  const rr = rnd(7);
  for (let i = 0; i < 12; i++) {
    const u = 0.3 + rr() * 0.65;
    const a = Math.PI / 2 + (rr() - 0.5) * 2.4;
    const q = body.point(u, a, -0.04);
    put(k, xf(lumpGeo(0.15 + rr() * 0.1, 10 + i, 0.25, 0), q.x, q.y, q.z, rr(), rr(), 0, 1.3, 0.6, 1.2), i % 3 ? MOSS : MOSS_DK);
    if (i % 3 === 0) {
      const n = body.normal(u, a);
      for (let j = 0; j < 3; j++) gb.add(new THREE.SphereGeometry(0.025 - j * 0.005, 6, 4), q.x + n.x * 0.12 + (j - 1) * 0.05, q.y + n.y * 0.12 + 0.03, q.z + n.z * 0.12 + j * 0.03, 0, 0, 0, 1, 0.6, 1);
    }
  }
  for (let i = 0; i < 6; i++) {
    const u = 0.45 + i * 0.09;
    const q = body.point(u, Math.PI / 2 + (i % 2 ? 0.5 : -0.5), -0.05);
    put(k, shardGeo(q, q.clone().add(new THREE.Vector3((i % 2 ? 0.15 : -0.15), 0.38, -0.28)), 0.09, 5), i % 2 ? STONE : STONE_HI);
  }
  for (let i = 0; i < 6; i++) {
    const a = 0.5 + i * 0.85;
    const q = body.point(0.85, a, 0);
    rag(k, 0.26, 0.55 + (i % 2) * 0.2, [q.x, q.y, q.z], Math.atan2(q.x, q.z), i % 2 ? MOSS : MOSS_DK, 30 + i, 0.15, 0.55);
  }
  // Loincloth of hide and moss
  rag(k, 0.4, 0.5, [0, 1.0, 0.36], 0, '#2b2018', 9, 0.1, 0.5);
  k.add(new THREE.TorusGeometry(0.43, 0.04, 4, 14), WOOD, 0, 1.02, 0.0, Math.PI / 2, 0, 0, 1, 0.82, 1);

  // Head thrust forward and low: heavy brow, long ears, an underbite with tusks
  const neck = pivot(frame, 0, 2.1, 0.86);
  neck.scale.setScalar(1.25);
  rig.neck = neck;
  rig.head = neck;
  const hk = new K();
  const hg = new GlowBatch();
  put(hk, xf(lumpGeo(0.22, 41, 0.1, 1), 0, 0.05, 0.05, 0, 0, 0, 1.05, 0.95, 1.05), SKIN);
  put(hk, xf(lumpGeo(0.15, 42, 0.12, 0), 0, 0.14, 0.17, 0, 0, 0, 1.65, 0.45, 0.8), SKIN_DK);
  put(hk, xf(lumpGeo(0.16, 43, 0.08, 1), 0, -0.1, 0.17, 0, 0, 0, 1.35, 0.7, 1.05), SKIN);
  hk.ball(0.06, 0, 0.04, 0.26, SKIN_DK, 1, 0.8, 1);
  for (const s of [-1, 1]) {
    hk.add(new THREE.BoxGeometry(0.08, 0.03, 0.04), SHADOW, s * 0.08, 0.08, 0.22, 0, s * 0.3, -s * 0.25);
    put(hk, spikeAB([s * 0.09, -0.07, 0.26], [s * 0.13, 0.12, 0.3], 0.03, 5), TUSK);
    put(hk, xf(new THREE.ConeGeometry(0.06, 0.3, 4), s * 0.27, 0.08, -0.02, 0, 0, s * 1.9, 1, 1, 0.4), SKIN_DK);
  }
  eyes(hg, 0.07, 0.3, 0.08, 0.07, 0.026, 0.25, 0.3);
  for (let i = 0; i < 5; i++) hk.add(new THREE.ConeGeometry(0.012, 0.04, 3), TUSK, -0.06 + i * 0.03, -0.04, 0.29);
  put(hk, xf(lumpGeo(0.12, 44, 0.3, 0), 0, 0.2, -0.05, 0, 0, 0, 1.4, 0.5, 1.3), MOSS);
  attach(rig, neck, hk, hg, GLOW, 5);

  // Arms: long and heavy, knuckles near the ground
  for (const s of [1, -1]) {
    const ap = pivot(frame, s * 0.62, 2.12, 0.25);
    const ak = new K();
    const ag = new GlowBatch();
    put(ak, xf(lumpGeo(0.3, 50 + s, 0.12, 1), s * 0.04, 0.0, 0, 0, 0, 0, 1.1, 0.9, 1.1), SKIN);
    put(ak, xf(lumpGeo(0.2, 52 + s, 0.25, 0), s * 0.02, 0.18, -0.05, 0, 0, 0, 1.4, 0.6, 1.3), MOSS);
    loft(
      ak,
      [
        [0, -0.05, 0],
        [s * 0.15, -0.6, -0.02],
        [s * 0.15, -1.1, 0.12],
        [s * 0.12, -1.35, 0.18],
      ],
      [
        [0, 0.22, 0.22],
        [0.45, 0.16, 0.16],
        [0.7, 0.2, 0.19],
        [1, 0.17, 0.17],
      ],
      SKIN,
      { radial: 10, steps: 10, noise: 0.04, seed: 54 + s },
    );
    put(ak, xf(lumpGeo(0.2, 56 + s, 0.1, 1), s * 0.12, -1.45, 0.2, 0, 0, 0, 1, 0.85, 1.1), SKIN_DK);
    for (let i = 0; i < 3; i++) claw(ak, [s * 0.12 + (i - 1) * 0.1, -1.55, 0.3], [(i - 1) * 0.2, -0.6, 1], 0.2, 0.035, TUSK, [0, -1, 0], 0.5);
    rag(ak, 0.2, 0.45, [s * 0.2, -0.3, -0.05], s * Math.PI / 2, MOSS_DK, 60 + s, 0.05, 0.5);
    attach(rig, ap, ak, ag, GLOW, 3);
    if (s === 1) {
      rig.armR = ap;
      // Boulder club bound to a log
      const hand = pivot(ap, s * 0.12, -1.45, 0.2);
      const wg = pivot(hand, 0, 0, 0);
      wg.rotation.x = 1.05;
      const wk = new K();
      const wgl = new GlowBatch();
      tube(wk, [[0, -0.25, 0], [0.02, 0.4, 0.01], [-0.02, 1.0, 0]], 0.07, 0.1, WOOD, 6, 6);
      put(wk, xf(lumpGeo(0.33, 70, 0.18, 1), 0, 1.22, 0, 0, 0.4, 0, 1.0, 1.15, 0.95), STONE);
      for (const y of [0.98, 1.08]) wk.add(new THREE.TorusGeometry(0.15, 0.03, 4, 10), '#3a2e22', 0, y, 0, Math.PI / 2, 0, 0);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        put(wk, spikeAB([Math.sin(a) * 0.26, 1.3 + (i % 2) * 0.12, Math.cos(a) * 0.26], [Math.sin(a) * 0.46, 1.36 + (i % 2) * 0.15, Math.cos(a) * 0.46], 0.05, 4), STONE_HI);
      }
      wgl.add(segLine([[-0.08, 1.38, 0.3], [0.0, 1.22, 0.33], [0.07, 1.36, 0.31], [0.0, 1.08, 0.3]], 0.016, 0.012, 4));
      put(wk, xf(lumpGeo(0.1, 72, 0.3, 0), 0.1, 1.5, -0.1, 0, 0, 0, 1.5, 0.5, 1.3), MOSS);
      attach(rig, wg, wk, wgl, GLOW, 3.5);
    } else rig.armL = ap;
  }

  // Short, bowed legs with clawed feet
  for (const s of [-1, 1]) {
    const lp = pivot(frame, s * 0.34, 1.0, 0);
    const lk = new K();
    loft(
      lk,
      [
        [0, 0.05, 0],
        [s * 0.12, -0.45, 0.12],
        [s * 0.08, -0.9, 0.0],
      ],
      [
        [0, 0.26, 0.26],
        [0.5, 0.2, 0.21],
        [1, 0.16, 0.16],
      ],
      SKIN,
      { radial: 9, steps: 7, seed: 80 + s },
    );
    put(lk, xf(lumpGeo(0.22, 82 + s, 0.1, 1), s * 0.08, -0.93, 0.12, 0, 0, 0, 1.0, 0.45, 1.4), SKIN_DK);
    for (let i = 0; i < 3; i++) claw(lk, [s * 0.08 + (i - 1) * 0.1, -0.95, 0.38], [0, -0.3, 1], 0.14, 0.03, TUSK);
    attach(rig, lp, lk);
    rig.legs.push(lp);
  }

  attach(rig, frame, k, gb, GLOW, 3);
  rig.height = 2.75;
  return rig;
}

// --- Yeti Chieftain ---------------------------------------------------------------------------------

function yeti(p: Palette): Rig {
  const GLOW = accentGlow(p, '#7fd0ff', 0.64);
  const FUR = dusk(p.secondary, 0.16, 0.12);
  const FUR_DK = dusk(p.secondary, 0.09, 0.14);
  const FUR_TIP = dusk(p.primary, 0.5, 0.1);
  const FACE = '#14161a';
  const HORN = '#2a2420';
  const BONE = PAL.bone;
  const BONE_DK = PAL.boneDark;
  const ICE = metal(dusk(p.accent, 0.35, 0.3), 0.6);
  const { rig, frame, k, gb } = bossRig('biped');

  const tuft = (kk: K, at: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, hex: string): void => {
    put(kk, spikeAB(at, at.clone().addScaledVector(dir.normalize(), len), r, 4, 0.5), hex);
  };

  // Barrel body under shaggy fur
  const body = loft(
    k,
    [
      [0, 0.95, -0.05],
      [0, 1.45, 0.0],
      [0, 2.0, 0.1],
      [0, 2.35, 0.2],
    ],
    [
      [0, 0.44, 0.38],
      [0.4, 0.52, 0.42],
      [0.8, 0.62, 0.48],
      [1, 0.46, 0.38],
    ],
    FUR,
    { radial: 14, steps: 12, noise: 0.08, seed: 6 },
  );
  const rr = rnd(13);
  for (let i = 0; i < 44; i++) {
    const u = 0.08 + rr() * 0.9;
    const a = rr() * Math.PI * 2;
    if (Math.abs(Math.sin(a) + 1) < 0.25 && u > 0.35 && u < 0.75) continue;
    const q = body.point(u, a, -0.03);
    const n = body.normal(u, a).add(new THREE.Vector3(0, -1.1, 0));
    tuft(k, q, n, 0.2 + rr() * 0.14, 0.07, i % 3 === 0 ? FUR_TIP : i % 2 ? FUR_DK : FUR);
  }
  // Skull necklace and a belt of bones
  for (let i = 0; i < 7; i++) {
    const a = FRONT + (i - 3) * 0.32;
    const q = body.point(0.8 - Math.abs(i - 3) * 0.03, a, 0.02);
    k.ball(0.075, q.x, q.y - 0.1, q.z + 0.02, i === 3 ? BONE : BONE_DK, 1, 1.1, 0.9);
    for (const s of [-1, 1]) k.ball(0.02, q.x + s * 0.026, q.y - 0.09, q.z + 0.085, SHADOW);
  }
  tube(k, [-3, -2, -1, 0, 1, 2, 3].map((i) => { const q = body.point(0.8 - Math.abs(i) * 0.03, FRONT + i * 0.32, 0.01); return [q.x, q.y - 0.04, q.z] as V; }), 0.012, 0.012, '#3a2a1e', 3, 12);
  // Chest rune scratched into a hide plate, glowing ice blue
  const cq = body.point(0.55, FRONT, 0.01);
  put(k, xf(lumpGeo(0.17, 15, 0.05, 0), cq.x, cq.y, cq.z - 0.04, 0, 0, 0, 1.1, 1.0, 0.35), '#2b2018');
  rune(frame, GLOW, cq.x, cq.y, cq.z + 0.03, 0.1, 0, 3);
  k.add(new THREE.TorusGeometry(0.47, 0.04, 4, 14), '#2b2018', 0, 1.05, 0.0, Math.PI / 2, 0, 0, 1, 0.85, 1);
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45;
    put(k, spikeAB([Math.sin(a) * 0.47, 1.02, Math.cos(a) * 0.4], [Math.sin(a) * 0.5, 0.72, Math.cos(a) * 0.44], 0.03, 4), BONE_DK);
  }

  // Head: ape-like dark face with a fanged muzzle, frost-blue eyes and great ram horns
  const neck = pivot(frame, 0, 2.3, 0.42);
  rig.neck = neck;
  rig.head = neck;
  const hk = new K();
  const hg = new GlowBatch();
  put(hk, xf(lumpGeo(0.24, 21, 0.1, 1), 0, 0.1, -0.02, 0, 0, 0, 1.0, 1.0, 1.0), FUR);
  hk.ball(0.16, 0, 0.06, 0.13, FACE, 1.0, 1.0, 0.8);
  hk.add(new THREE.BoxGeometry(0.3, 0.06, 0.1), FUR_DK, 0, 0.14, 0.2, 0.2, 0, 0);
  hk.ball(0.11, 0, -0.04, 0.22, FACE, 1.1, 0.8, 0.9);
  eyes(hg, 0.1, 0.25, 0.07, 0.06, 0.018, 0.2, 0.3);
  for (const s of [-1, 1]) {
    put(hk, spikeAB([s * 0.055, -0.05, 0.3], [s * 0.065, -0.17, 0.31], 0.02, 4), BONE);
    put(hk, spikeAB([s * 0.08, -0.12, 0.27], [s * 0.09, -0.02, 0.29], 0.016, 4), BONE);
    horn(
      hk,
      [
        [s * 0.17, 0.22, -0.04],
        [s * 0.4, 0.38, -0.18],
        [s * 0.55, 0.22, -0.28],
        [s * 0.5, -0.02, -0.12],
        [s * 0.5, 0.0, 0.1],
        [s * 0.62, 0.14, 0.2],
      ],
      0.1,
      HORN,
      '#171310',
    );
  }
  for (let i = 0; i < 7; i++) tuft(hk, new THREE.Vector3((i - 3) * 0.06, 0.3, -0.05), new THREE.Vector3((i - 3) * 0.2, 0.6, -1), 0.24, 0.05, i % 2 ? FUR_TIP : FUR);
  attach(rig, neck, hk, hg, GLOW, 6);

  // Arms: massive, shaggy, with black claws; a beast-skull pauldron on the left
  for (const s of [1, -1]) {
    const ap = pivot(frame, s * 0.64, 2.2, 0.08);
    const ak = new K();
    const ag = new GlowBatch();
    const a = loft(
      ak,
      [
        [0, 0.08, 0],
        [s * 0.12, -0.55, 0.0],
        [s * 0.12, -1.05, 0.1],
        [s * 0.1, -1.3, 0.14],
      ],
      [
        [0, 0.3, 0.3],
        [0.45, 0.22, 0.22],
        [0.75, 0.24, 0.24],
        [1, 0.18, 0.18],
      ],
      FUR,
      { radial: 10, steps: 10, noise: 0.08, seed: 30 + s },
    );
    for (let i = 0; i < 14; i++) {
      const u = 0.05 + (i / 14) * 0.85;
      const ang = (i * 2.3) % (Math.PI * 2);
      tuft(ak, a.point(u, ang, -0.03), a.normal(u, ang).add(new THREE.Vector3(0, -1.3, 0)), 0.2, 0.06, i % 3 === 0 ? FUR_TIP : FUR_DK);
    }
    // Icicles hanging off the forearm, a few glowing
    for (let i = 0; i < 4; i++) {
      const q = a.point(0.7 + i * 0.06, s > 0 ? 0.3 : Math.PI - 0.3, -0.02);
      if (i === 1) ag.add(new THREE.ConeGeometry(0.025, 0.2, 4), q.x, q.y - 0.1, q.z, Math.PI, 0, 0);
      else put(ak, xf(new THREE.ConeGeometry(0.03, 0.22 + (i % 2) * 0.08, 4), q.x, q.y - 0.11, q.z, Math.PI, 0, 0), ICE);
    }
    ak.ball(0.17, s * 0.1, -1.38, 0.16, FACE, 1.1, 0.9, 1.1);
    for (let i = 0; i < 4; i++) claw(ak, [s * 0.1 + (i - 1.5) * 0.08, -1.48, 0.24], [(i - 1.5) * 0.2, -0.8, 0.8], 0.28, 0.03, '#1b1714', [0, -1, 0], 0.4);
    if (s === -1) {
      // Beast skull worn as a pauldron, with tusks
      put(ak, xf(lumpGeo(0.22, 35, 0.08, 1), -0.08, 0.2, 0.0, 0, 0, 0.3, 1.2, 0.8, 1.3), BONE_DK);
      for (const e of [-1, 1]) ak.ball(0.05, -0.1 + e * 0.02, 0.22, 0.2 + e * 0.0, SHADOW, 1, 0.8, 0.6);
      for (const e of [-1, 1]) horn(ak, [[-0.12, 0.2, e * 0.15], [-0.3, 0.35, e * 0.3], [-0.38, 0.62, e * 0.28]], 0.05, BONE);
    } else {
      crystalCluster(ak, [s * 0.05, 0.25, -0.02], [[s * 0.1, 0.42, -0.05, 0.06], [s * 0.3, 0.3, 0.08, 0.05], [-s * 0.02, 0.35, -0.2, 0.05]], [ICE], { gb: ag, every: 3 });
    }
    attach(rig, ap, ak, ag, GLOW, 3.5);
    if (s === 1) rig.armR = ap;
    else rig.armL = ap;
  }

  // Thick legs and wide clawed feet
  for (const s of [-1, 1]) {
    const lp = pivot(frame, s * 0.3, 1.0, 0);
    const lk = new K();
    const l = loft(
      lk,
      [
        [0, 0.05, 0],
        [s * 0.06, -0.45, 0.1],
        [s * 0.05, -0.9, 0.0],
      ],
      [
        [0, 0.27, 0.27],
        [0.5, 0.21, 0.22],
        [1, 0.17, 0.17],
      ],
      FUR,
      { radial: 9, steps: 7, noise: 0.08, seed: 40 + s },
    );
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2;
      tuft(lk, l.point(0.55, ang, -0.03), l.normal(0.55, ang).add(new THREE.Vector3(0, -1.6, 0)), 0.26, 0.07, i % 2 ? FUR_TIP : FUR_DK);
    }
    lk.ball(0.2, s * 0.05, -0.93, 0.1, FACE, 1, 0.45, 1.4);
    for (let i = 0; i < 3; i++) claw(lk, [s * 0.05 + (i - 1) * 0.1, -0.95, 0.35], [0, -0.3, 1], 0.14, 0.03, '#1b1714');
    attach(rig, lp, lk);
    rig.legs.push(lp);
  }

  attach(rig, frame, k, gb, GLOW, 3);
  rig.height = 3.05;
  return rig;
}

// --- Armoured humanoid scaffold (Forge Overseer, Grave Warden) -------------------------------------

interface Knight {
  rig: Rig;
  frame: THREE.Group;
  k: K;
  gb: GlowBatch;
  neck: THREE.Group;
  head: THREE.Group;
  arms: { ap: THREE.Group; k: K; gb: GlowBatch; hand: THREE.Group }[];
}

/** Plate-armoured humanoid body from the parts library (no head); built in standard units, scaled by `tall`. */
function knight(b: number, tall: number, col: BodyColors, o: { tabard?: string | null; skirt?: boolean } = {}): Knight {
  const { rig, frame, k, gb } = bossRig('biped');
  frame.scale.setScalar(tall);
  torso(k, 'plate', b, col, { tabard: o.tabard, skirt: o.skirt });
  const neck = pivot(frame, 0, 1.66, 0);
  const head = pivot(neck, 0, -1.66, 0);
  rig.neck = neck;
  rig.head = head;
  for (const s of [-1, 1]) {
    const lp = pivot(frame, s * 0.12 * b, 1.0, 0);
    const lk = new K();
    leg(lk, 'plate', b, col);
    attach(rig, lp, lk);
    rig.legs.push(lp);
  }
  const arms: Knight['arms'] = [];
  for (const s of [1, -1]) {
    const ap = pivot(frame, s * 0.26 * b, 1.56, 0);
    const ak = new K();
    arm(ak, 'plate', s, b * 1.4, col);
    const hand = pivot(ap, 0, -0.66, 0.03);
    arms.push({ ap, k: ak, gb: new GlowBatch(), hand });
    if (s === 1) rig.armR = ap;
    else rig.armL = ap;
  }
  return { rig, frame, k, gb, neck, head, arms };
}

/** Big angular pauldron in an arm kit: stacked plates, a raised guard and spikes. */
function bigPauldron(k: K, s: number, m: string, d: string, trim: string, spikes: number, r = 0.22): void {
  for (let i = 0; i < 3; i++) k.add(capGeo(r - i * 0.02, Math.PI * 0.5, 10, 4), i % 2 ? d : m, s * (0.04 + i * 0.02), 0.06 - i * 0.075, 0, 0, 0, -s * (0.3 + i * 0.12), 1.15, 0.7, 1.2);
  k.add(new THREE.TorusGeometry(r, 0.012, 3, 14), trim, s * 0.04, 0.06, 0, Math.PI / 2, -s * 0.3, 0);
  k.add(new THREE.BoxGeometry(0.03, 0.16, r * 1.7), d, -s * 0.06, 0.18, 0, 0, 0, -s * 0.15);
  for (let i = 0; i < spikes; i++) put(k, spikeAB([s * 0.12, 0.14 - i * 0.02, -0.12 + (i * 0.24) / Math.max(1, spikes - 1)], [s * 0.32, 0.4 - i * 0.04, -0.15 + (i * 0.3) / Math.max(1, spikes - 1)], 0.035, 4), d);
}

// --- Forge Overseer ---------------------------------------------------------------------------------

function overseer(p: Palette): Rig {
  const GLOW = accentGlow(p, '#ff7a24', 0.55, 'secondary');
  const IRON = metal(dusk(p.primary, 0.12, 0.08), 0.65);
  const IRON_DK = metal(dusk(p.primary, 0.065, 0.08), 0.55);
  const BRASS = metal('#5c4520', 0.85);
  const LEATHER = '#2a1c14';
  const col: BodyColors = { metal: IRON, dark: IRON_DK, cloth: '#2a1512', leather: LEATHER, trim: BRASS };
  const B = 1.65;
  const { rig, frame, k, gb, head, arms } = knight(B, 1.42, col, {});

  // Bulging armoured belly, leather apron, chains wound across the chest, a coiled whip
  k.add(capGeo(0.36, Math.PI * 0.5, 12, 5), IRON, 0, 1.3, 0.12, Math.PI / 2 - 0.1, 0, 0, 1.15, 0.8, 1);
  rag(k, 0.42, 0.62, [0, 1.06, 0.3], 0, LEATHER, 5, 0.05, 0.2);
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    k.add(new THREE.TorusGeometry(0.035, 0.011, 3, 6), IRON_DK, -0.32 + t * 0.64, 1.5 - t * 0.35, 0.27 - Math.abs(t - 0.5) * 0.08, 0, i % 2 ? Math.PI / 2 : 0, -0.5);
  }
  k.add(new THREE.TorusGeometry(0.1, 0.022, 4, 10), LEATHER, -0.4, 1.05, 0.12, 0, Math.PI / 2, 0);
  k.add(new THREE.TorusGeometry(0.075, 0.022, 4, 10), LEATHER, -0.42, 1.05, 0.12, 0, Math.PI / 2, 0);
  // Riveted gorget rising around the jaw
  k.add(new THREE.CylinderGeometry(0.17, 0.27, 0.16, 10), IRON_DK, 0, 1.66, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.ball(0.012, Math.sin(a) * 0.23, 1.64, Math.cos(a) * 0.23, BRASS);
  }

  // Furnace-mask helm: a bucket helm with a barred grate burning inside and two chimneys
  const hk = new K();
  const hg = new GlowBatch();
  const hy = 1.83;
  hk.add(new THREE.CylinderGeometry(0.15, 0.165, 0.32, 10), IRON, 0, hy, 0);
  hk.add(capGeo(0.152, Math.PI * 0.35, 10, 3), IRON, 0, hy + 0.15, 0, 0, 0, 0, 1, 0.5, 1);
  hk.add(new THREE.CircleGeometry(0.085, 14), SHADOW, 0, hy - 0.02, 0.162);
  const grate = new GlowBatch();
  grate.add(new THREE.CircleGeometry(0.075, 14), 0, hy - 0.02, 0.164);
  grate.flush(head, GLOW, 2);
  hk.add(new THREE.TorusGeometry(0.09, 0.02, 4, 14), BRASS, 0, hy - 0.02, 0.165);
  for (let i = 0; i < 5; i++) hk.add(new THREE.BoxGeometry(0.014, 0.17, 0.02), IRON_DK, (i - 2) * 0.034, hy - 0.02, 0.172);
  hk.add(new THREE.BoxGeometry(0.2, 0.025, 0.03), IRON_DK, 0, hy + 0.09, 0.16);
  eyes(hg, hy + 0.06, 0.168, 0.05, 0.05, 0.012, 0.2, 0.2);
  for (const s of [-1, 1]) {
    hk.add(new THREE.CylinderGeometry(0.035, 0.04, 0.24, 8), IRON_DK, s * 0.08, hy + 0.24, -0.08, -0.25, 0, s * 0.15);
    hk.add(new THREE.TorusGeometry(0.04, 0.01, 3, 8), BRASS, s * 0.097, hy + 0.35, -0.11, Math.PI / 2 - 0.25, 0, s * 0.15);
    hg.add(new THREE.CircleGeometry(0.03, 8), s * 0.1, hy + 0.362, -0.115, -Math.PI / 2 - 0.25, 0, 0);
    hg.add(flameGeo([s * 0.1, hy + 0.37, -0.115], [s * 0.1, 1, -0.3], 0.1, 0.014, 10 + s));
    put(hk, spikeAB([s * 0.15, hy + 0.05, 0], [s * 0.3, hy + 0.12, 0.04], 0.03, 4), IRON_DK);
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    hk.ball(0.011, Math.sin(a) * 0.16, hy - 0.13, Math.cos(a) * 0.16, BRASS);
  }
  attach(rig, head, hk, hg, GLOW, 4.5);

  for (const [i, a] of arms.entries()) {
    const s = i === 0 ? 1 : -1;
    bigPauldron(a.k, s, IRON, IRON_DK, BRASS, 3, 0.25);
    if (s === 1) {
      // Burning forge hammer
      const wg = pivot(a.hand, 0, 0, 0);
      wg.rotation.x = 1.05;
      const wk = new K();
      const wgl = new GlowBatch();
      tube(wk, [[0, -0.25, 0], [0, 0.5, 0], [0, 1.15, 0]], 0.03, 0.03, '#2a1f17', 6, 4);
      for (let j = 0; j < 4; j++) wk.add(new THREE.TorusGeometry(0.034, 0.008, 3, 8), IRON_DK, 0, -0.15 + j * 0.05, 0, Math.PI / 2, 0, 0);
      wk.add(new THREE.BoxGeometry(0.2, 0.24, 0.44), IRON_DK, 0, 1.2, 0);
      for (const z of [-1, 1]) {
        wk.add(new THREE.BoxGeometry(0.24, 0.28, 0.06), IRON, 0, 1.2, z * 0.24);
        wgl.add(new THREE.BoxGeometry(0.1, 0.012, 0.012), 0, 1.24, z * 0.275);
        wgl.add(new THREE.BoxGeometry(0.012, 0.12, 0.012), 0.02, 1.18, z * 0.275, 0, 0, 0.4);
      }
      for (const x of [-1, 1]) {
        wgl.add(segLine([[x * 0.101, 1.3, -0.15], [x * 0.102, 1.2, -0.05], [x * 0.101, 1.25, 0.06], [x * 0.102, 1.1, 0.15]], 0.01, 0.006, 3));
      }
      put(wk, spikeAB([0, 1.32, 0], [0, 1.5, 0], 0.05, 4), IRON);
      for (let j = 0; j < 2; j++) wgl.add(flameGeo([0, 1.32, (j - 0.5) * 0.2], [0, 1, 0], 0.14, 0.018, 20 + j));
      attach(rig, wg, wk, wgl, GLOW, 3.5);
    } else {
      // Manacle with a broken chain hanging from the left fist
      a.k.add(new THREE.TorusGeometry(0.09, 0.025, 4, 10), IRON_DK, 0, -0.5, 0, Math.PI / 2, 0, 0);
      for (let j = 0; j < 6; j++) a.k.add(new THREE.TorusGeometry(0.04, 0.012, 3, 6), IRON_DK, -0.08, -0.56 - j * 0.065, 0.04, 0, j % 2 ? Math.PI / 2 : 0, 0);
    }
    attach(rig, a.ap, a.k, a.gb, GLOW, 3);
  }

  attach(rig, frame, k, gb, GLOW, 3);
  rig.height = 2.25 * 1.42;
  return rig;
}

// --- Grave Warden -----------------------------------------------------------------------------------

function warden(p: Palette): Rig {
  const GLOW = accentGlow(p, '#5fe0a8', 0.58);
  const STEEL = metal(dusk(p.primary, 0.14, 0.12), 0.65);
  const STEEL_DK = metal(dusk(p.primary, 0.07, 0.12), 0.55);
  const CLOTH = dusk(p.secondary, 0.08, 0.35);
  const BONE = '#a89d86';
  const RUST = metal('#3b2a20', 0.5);
  const col: BodyColors = { metal: STEEL, dark: STEEL_DK, cloth: CLOTH, leather: '#1e1712', trim: RUST };
  const T = 1.55;
  const { rig, frame, k, gb, head, arms } = knight(1.3, T, col, { tabard: CLOTH });

  // Keys, a grave lantern and chains at the belt
  k.add(new THREE.TorusGeometry(0.06, 0.008, 3, 10), RUST, 0.26, 1.02, 0.12, 0, Math.PI / 2, 0);
  for (let i = 0; i < 4; i++) {
    const a = -0.6 + i * 0.4;
    k.add(new THREE.BoxGeometry(0.012, 0.12, 0.006), RUST, 0.26, 0.96 + Math.cos(a) * 0.01, 0.12 + Math.sin(a) * 0.05, a, 0, 0);
  }
  k.add(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 4), RUST, -0.28, 1.0, 0.1);
  k.add(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 6, 1, true), STEEL_DK, -0.28, 0.88, 0.1);
  k.add(new THREE.ConeGeometry(0.06, 0.06, 6), STEEL_DK, -0.28, 0.96, 0.1);
  gb.add(new THREE.IcosahedronGeometry(0.03, 0), -0.28, 0.88, 0.1);
  for (let i = 0; i < 8; i++) k.add(new THREE.TorusGeometry(0.03, 0.009, 3, 6), RUST, -0.15 + i * 0.045, 1.0 - Math.sin((i / 7) * Math.PI) * 0.1, 0.2, 0, i % 2 ? Math.PI / 2 : 0, 0);
  // Ragged mantle over the shoulders
  for (let i = 0; i < 5; i++) {
    const a = -1.2 + i * 0.6;
    rag(k, 0.2, 0.32, [Math.sin(a) * 0.3, 1.62, -Math.cos(a) * 0.12], a + Math.PI, CLOTH, 40 + i, 0.4, 0.5);
  }

  // Tall caged helm: a skull grins behind the bars
  const hk = new K();
  const hg = new GlowBatch();
  const hy = 1.83;
  hk.ball(0.11, 0, hy, 0.01, BONE, 0.9, 1.05, 1.0);
  for (const s of [-1, 1]) hk.ball(0.032, s * 0.04, hy + 0.01, 0.09, SHADOW, 1.1, 0.9, 0.6);
  orbEyes(hg, hy + 0.01, 0.105, 0.04, 0.016);
  for (let i = 0; i < 4; i++) hk.add(new THREE.BoxGeometry(0.014, 0.022, 0.01), BONE, -0.021 + i * 0.014, hy - 0.07, 0.1);
  hk.add(new THREE.CylinderGeometry(0.14, 0.15, 0.36, 10, 1, true), STEEL, 0, hy + 0.02, -0.02, 0, 0, 0, 1, 1, 1);
  hk.add(new THREE.BoxGeometry(0.22, 0.24, 0.02), SHADOW, 0, hy - 0.01, 0.06);
  for (let i = 0; i < 5; i++) hk.add(new THREE.BoxGeometry(0.014, 0.3, 0.016), STEEL_DK, (i - 2) * 0.045, hy, 0.135);
  for (const y of [-0.12, 0.12]) hk.add(new THREE.BoxGeometry(0.24, 0.02, 0.02), STEEL_DK, 0, hy + y, 0.135);
  hk.add(capGeo(0.145, Math.PI * 0.5, 10, 4), STEEL, 0, hy + 0.19, -0.02, 0, 0, 0, 1, 1.3, 1);
  thornRing(hk, [0, hy + 0.25, -0.02], 0.06, 5, 0.2, 0.025, STEEL_DK, { tilt: 1.25, arc: [-0.6, 0.6 + Math.PI], seed: 9 });
  put(hk, spikeAB([0, hy + 0.3, -0.02], [0, hy + 0.5, -0.06], 0.035, 4), STEEL_DK);
  for (const s of [-1, 1]) horn(hk, [[s * 0.13, hy + 0.1, -0.04], [s * 0.26, hy + 0.08, -0.1], [s * 0.32, hy - 0.08, -0.06], [s * 0.3, hy - 0.2, 0.06]], 0.035, STEEL_DK);
  attach(rig, head, hk, hg, GLOW, 5);

  for (const [i, a] of arms.entries()) {
    const s = i === 0 ? 1 : -1;
    bigPauldron(a.k, s, STEEL, STEEL_DK, RUST, 2, 0.21);
    if (s === 1) {
      // Notched great blade with glowing runes down the fuller
      const wg = pivot(a.hand, 0, 0, 0);
      wg.rotation.x = 1.05;
      const wk = new K();
      const wgl = new GlowBatch();
      tube(wk, [[0, -0.3, 0], [0, 0.0, 0], [0, 0.26, 0]], 0.026, 0.026, '#1e1712', 6, 3);
      wk.add(new THREE.OctahedronGeometry(0.05), STEEL_DK, 0, -0.33, 0, 0, 0, 0, 1, 1.4, 1);
      wk.add(new THREE.BoxGeometry(0.5, 0.06, 0.06), STEEL_DK, 0, 0.28, 0);
      for (const x of [-1, 1]) put(wk, spikeAB([x * 0.24, 0.28, 0], [x * 0.33, 0.4, 0], 0.03, 4), STEEL_DK);
      wk.ball(0.04, 0, 0.28, 0.035, BONE, 1, 1, 0.6);
      wk.plate(SHAPES.notchedBlade(1.45, 0.1), 0.02, 0.012, 0, 0.31, 0, STEEL);
      wk.add(new THREE.BoxGeometry(0.05, 1.05, 0.026), STEEL_DK, 0, 0.88, 0);
      for (let j = 0; j < 4; j++) {
        const y = 0.5 + j * 0.24;
        for (const z of [-1, 1]) wgl.add(segLine([[-0.012, y + 0.06, z * 0.015], [0.015, y, z * 0.015], [-0.012, y - 0.06, z * 0.015]], 0.006, 0.006, 3));
      }
      attach(rig, wg, wk, wgl, GLOW, 3.5);
    } else {
      // Tower shield: iron-banded, a skull boss and a burning rune
      rig.shield = true;
      const sk = new K();
      const tw = SHAPES.tower(0.3, 1.15);
      sk.plate(tw, 0.06, 0.02, 0.05, -0.15, 0.17, RUST, 0, 0, 0, 1.06);
      sk.plate(tw, 0.07, 0.015, 0.05, -0.15, 0.2, STEEL_DK);
      sk.add(new THREE.BoxGeometry(0.05, 1.08, 0.03), STEEL, 0.05, -0.15, 0.25);
      for (const y of [0.3, -0.45]) sk.add(new THREE.BoxGeometry(0.56, 0.05, 0.03), STEEL, 0.05, y, 0.25);
      sk.ball(0.09, 0.05, 0.05, 0.27, BONE, 1, 1.1, 0.8);
      for (const e of [-1, 1]) sk.ball(0.025, 0.05 + e * 0.032, 0.06, 0.33, SHADOW);
      for (const [x, y] of [[-0.19, 0.42], [0.29, 0.42], [-0.19, -0.48], [0.29, -0.48], [0.05, -0.72]] as const) put(sk, spikeAB([x, y, 0.24], [x, y, 0.38], 0.03, 4), STEEL);
      attach(rig, a.hand, sk);
      rune(a.hand, GLOW, 0.05, -0.28, 0.255, 0.11, 0, 3.5);
      rune(a.hand, GLOW, 0.05, 0.3, 0.255, 0.06, Math.PI, 3);
    }
    attach(rig, a.ap, a.k, a.gb, GLOW, 3);
  }

  // Tattered cloak
  const cp = pivot(frame, 0, 1.6, -0.2);
  const ck = new K();
  ck.add(ragGeo(0.8, 1.45, { folds: 3, depth: 0.05, flare: 0.4, tatter: 0.4, seed: 51, curl: 0.25 }), CLOTH, 0, 0, 0);
  rig.cape = cp;
  attach(rig, cp, ck);

  thornRing(k, [0, 1.62, -0.05], 0.18, 5, 0.25, 0.025, STEEL_DK, { tilt: 1.2, arc: [Math.PI * 0.6, Math.PI * 1.4], seed: 4 });
  attach(rig, frame, k, gb, GLOW, 4);
  rig.height = 2.4 * T;
  return rig;
}

// --- Shardmaw ---------------------------------------------------------------------------------------

function shardmaw(p: Palette): Rig {
  const GLOW = accentGlow(p, '#48e0c8', 0.6);
  const HIDE = dusk(p.primary, 0.1, 0.2);
  const HIDE_DK = dusk(p.primary, 0.055, 0.2);
  const CRYS = metal(dusk(p.primary, 0.12, 0.45), 0.7);
  const CRYS_HI = metal(dusk(p.primary, 0.25, 0.4), 0.75);
  const CLAW = '#1d1820';
  const { rig, frame, k, gb } = bossRig('quad');
  frame.position.y = -0.24;

  // Heavy-shouldered body sloping down to the hips
  const body = loft(
    k,
    [
      [0, 1.15, -1.0],
      [0, 1.3, -0.35],
      [0, 1.5, 0.35],
      [0, 1.42, 0.92],
    ],
    [
      [0, 0.34, 0.34],
      [0.35, 0.42, 0.42],
      [0.72, 0.5, 0.54],
      [1, 0.36, 0.4],
    ],
    HIDE,
    { radial: 14, steps: 14, keel: 0.15, seed: 2 },
  );
  // Armoured plates along the flanks
  for (let i = 0; i < 8; i++) {
    for (const s of [-1, 1]) {
      const u = 0.15 + i * 0.1;
      const q = body.point(u, s > 0 ? 0.35 : Math.PI - 0.35, -0.03);
      put(k, xf(lumpGeo(0.13, 10 + i + s * 20, 0.15, 0), q.x, q.y, q.z, 0, 0, 0, 0.6, 1.0, 1.3), i % 2 ? HIDE_DK : CRYS);
    }
  }
  // Crystal spines bursting along the back, the tallest over the shoulders
  for (let i = 0; i < 11; i++) {
    const u = 0.08 + i * 0.085;
    const tall = 0.35 + Math.sin(Math.min(1, u * 1.2) * Math.PI) * 0.55;
    for (const s of i % 2 ? [-1, 1] : [0]) {
      const q = body.point(u, Math.PI / 2 + s * 0.45, -0.04);
      const tip = q.clone().add(new THREE.Vector3(s * 0.3 * tall, tall, -0.35 * tall));
      if (i % 3 === 1 && s >= 0) gb.add(shardGeo(q, tip, 0.06, 4));
      else put(k, shardGeo(q, tip, 0.1 * (0.7 + tall * 0.4), 5), i % 2 ? CRYS_HI : CRYS);
    }
  }
  crystalCluster(k, [0, 1.85, 0.4], [[0.35, 0.55, -0.1, 0.1], [-0.35, 0.55, -0.1, 0.1], [0.55, 0.25, 0.1, 0.08], [-0.55, 0.25, 0.1, 0.08]], [CRYS_HI, CRYS]);

  // Tail ending in a crystal club
  const tail = loft(
    k,
    [
      [0, 1.18, -0.95],
      [0, 1.0, -1.45],
      [0.1, 0.65, -1.85],
      [0.2, 0.45, -2.15],
    ],
    [
      [0, 0.2, 0.2],
      [0.5, 0.12, 0.12],
      [1, 0.06, 0.06],
    ],
    HIDE,
    { radial: 8, steps: 10, seed: 3 },
  );
  for (let i = 0; i < 4; i++) {
    const q = tail.point(0.2 + i * 0.2, Math.PI / 2, -0.02);
    put(k, shardGeo(q, q.clone().add(new THREE.Vector3(0, 0.22 - i * 0.03, -0.12)), 0.05, 4), CRYS);
  }
  crystalCluster(k, [0.2, 0.45, -2.15], [[0.2, 0.3, -0.2, 0.08], [-0.15, 0.25, -0.25, 0.07], [0.1, -0.1, -0.35, 0.08], [0.25, 0.05, 0.0, 0.06]], [CRYS_HI, CRYS], { gb, every: 4 });

  // Head on the neck pivot: a long skull and a gaping maw of crystal shards
  const neck = pivot(frame, 0, 1.42, 1.25);
  neck.scale.setScalar(1.25);
  rig.neck = neck;
  rig.head = neck;
  const hk = new K();
  const hg = new GlowBatch();
  const skull = loft(
    hk,
    [
      [0, 0.05, -0.15],
      [0, 0.06, 0.15],
      [0, 0.02, 0.45],
      [0, -0.02, 0.7],
    ],
    [
      [0, 0.26, 0.24],
      [0.35, 0.25, 0.2],
      [0.75, 0.17, 0.13],
      [1, 0.12, 0.08],
    ],
    HIDE,
    { radial: 12, steps: 10, keel: 0.2, seed: 5 },
  );
  const jaw = loft(
    hk,
    [
      [0, -0.1, -0.05],
      [0, -0.25, 0.25],
      [0, -0.38, 0.6],
    ],
    [
      [0, 0.2, 0.1],
      [0.5, 0.15, 0.08],
      [1, 0.1, 0.06],
    ],
    HIDE_DK,
    { radial: 10, steps: 8, seed: 6 },
  );
  // Burning throat
  hg.add(new THREE.SphereGeometry(0.12, 8, 6), 0, -0.1, 0.25, 0.4, 0, 0, 0.8, 0.5, 1.8);
  hk.ball(0.16, 0, -0.12, 0.2, SHADOW, 0.9, 0.6, 1.6);
  // Shard teeth: dark crystals with a few glowing fangs
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const u = 0.35 + i * 0.11;
      const q = skull.point(u, -Math.PI / 2 + s * 0.8, -0.01);
      const t = q.clone().add(new THREE.Vector3(-s * 0.02, -0.12 - (i === 4 ? 0.08 : 0), 0.02));
      if (i === 4) hg.add(shardGeo(q, t, 0.022, 4));
      else put(hk, shardGeo(q, t, 0.026, 4), CRYS_HI);
      const j = jaw.point(0.25 + i * 0.12, Math.PI / 2 - s * 0.7, -0.005);
      put(hk, shardGeo(j, j.clone().add(new THREE.Vector3(0, 0.12, 0.01)), 0.022, 4), i === 2 ? CRYS : CRYS_HI);
    }
    // Two pairs of eyes under a crystal brow
    for (let e = 0; e < 2; e++) {
      const q = skull.point(0.32 + e * 0.12, s > 0 ? 0.35 : Math.PI - 0.35, 0.0);
      hg.add(new THREE.SphereGeometry(0.03 - e * 0.008, 6, 4), q.x, q.y, q.z);
    }
    const b = skull.point(0.25, s > 0 ? 0.9 : Math.PI - 0.9, -0.02);
    put(hk, shardGeo(b, b.clone().add(new THREE.Vector3(s * 0.25, 0.3, -0.3)), 0.06, 5), CRYS_HI);
    put(hk, shardGeo(b, b.clone().add(new THREE.Vector3(s * 0.12, 0.22, -0.4)), 0.04, 5), CRYS);
  }
  attach(rig, neck, hk, hg, GLOW, 5);

  // Legs: thick, with crystal-crusted elbows and black claws
  const legDefs: [number, number, number, boolean][] = [
    [-0.36, 1.25, 0.6, true],
    [0.36, 1.25, 0.6, true],
    [-0.32, 1.12, -0.7, false],
    [0.32, 1.12, -0.7, false],
  ];
  legDefs.forEach(([x, y, z, front], i) => {
    const s = Math.sign(x);
    const lp = pivot(frame, x, y, z);
    const lk = new K();
    const raw: V[] = front
      ? [
          [0, 0.05, 0],
          [s * 0.08, -0.5, -0.12],
          [s * 0.06, -0.95, 0.05],
          [s * 0.05, -1.18, 0.1],
        ]
      : [
          [0, 0.05, 0],
          [s * 0.06, -0.4, 0.15],
          [s * 0.05, -0.75, -0.12],
          [s * 0.04, -1.05, 0.0],
        ];
    const pts = raw.map(([px, py, pz], j): V => [px + s * j * 0.05, py * (front ? 0.81 : 0.79), pz]);
    loft(
      lk,
      pts,
      [
        [0, front ? 0.24 : 0.26, front ? 0.26 : 0.28],
        [0.5, 0.14, 0.15],
        [1, 0.11, 0.11],
      ],
      HIDE,
      { radial: 9, steps: 8, seed: 30 + i },
    );
    const e = pts[1]!;
    put(lk, shardGeo(e, [e[0] + s * 0.2, e[1] + 0.12, e[2] - 0.25], 0.05, 4), CRYS_HI);
    const f = pts[3]!;
    lk.ball(0.12, f[0], f[1] - 0.02, f[2] + 0.05, HIDE_DK, 1.1, 0.55, 1.4);
    for (let c = 0; c < 3; c++) claw(lk, [f[0] + (c - 1) * 0.08, f[1] - 0.03, f[2] + 0.18], [(c - 1) * 0.2, -0.4, 1], 0.17, 0.03, CLAW);
    attach(rig, lp, lk);
    rig.legs.push(lp);
  });

  attach(rig, frame, k, gb, GLOW, 3.5);
  rig.height = 2.3;
  return rig;
}
