import * as THREE from 'three';
import { K, type V } from '../../../base3d/sculpt';
import { addGlow, addMesh, newRig, pivot, type Rig } from '../../rig';
import { metal } from '../parts';
import { chunkGeo, featherEdge, featherGeo, flameGeo, GlowBatch, lumpGeo, orient, put, segLine, SHADOW, spikeAB, Spine, table, tube, xf } from './_creatures';
import type { UnitDef } from './types';

/**
 * The Pyre Phoenix (card: phoenix_warden, legendary). A bird of ash and bone that keeps burning:
 * a skull-like head with a hooked obsidian beak and furnace eyes under a crown of blade feathers,
 * a bare ribcage and keel with fire roaring inside, a neck of exposed vertebrae, and huge wings of
 * soot-black feathers on skeletal arms, every edge smouldering, flame trailing from the wing tips
 * and the long tail. Accent: pyre orange.
 */
const FEATHER = '#141114';
const FEATHER_2 = '#1f1a1b';
const FEATHER_HI = '#2c2729';
const BONE = '#8a8076';
const BONE_DK = '#4a433e';
const SINEW = '#241d1c';
const BEAK = metal('#1d1b20', 0.55);
const EMBER = '#ff7a1a';
const FIRE = '#ff4a0a';
const HOT = '#ffc04a';

/** A feather placed at p pointing along d (lying flat, face up), with optional ember edges. */
function feather(k: K, eg: GlowBatch | null, p: V, d: V, len: number, w: number, hex: string, seed: number, droop = 0.12, edge = 0.55, up: V = [0, 1, 0]): void {
  put(k, orient(featherGeo(len, w, { droop, seed, rows: 5, ragged: 0.3 }), p, d, up), hex);
  if (eg) for (const s of [-1, 1]) eg.add(orient(segLine(featherEdge(len, w * 1.04, s, edge, droop, 0.3, 3), 0.006, 0.003, 3), p, d, up));
}

/** Tip of a feather placed like `feather` (for flames). */
function tipOf(p: V, d: V, len: number, droop = 0.12): V {
  const D = new THREE.Vector3(...d).normalize();
  return [p[0] + D.x * len, p[1] + D.y * len - droop * len * 0.9, p[2] + D.z * len];
}

function wingKit(k: K, eg: GlowBatch, fg: GlowBatch, mirror: number): void {
  const S: V = [0, 0, 0];
  const E: V = [0.42, 0.09, -0.06];
  const W: V = [0.92, 0.07, 0.06];
  const T: V = [1.46, -0.02, -0.04];
  const lerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // Skeletal arm along the leading edge
  tube(k, [S, [0.2, 0.07, -0.05], E], 0.04, 0.026, SINEW, 6, 4);
  tube(k, [E, [0.68, 0.1, 0.02], W], 0.026, 0.02, SINEW, 5, 4);
  tube(k, [W, [1.2, 0.04, 0.0], T], 0.022, 0.008, BONE_DK, 5, 4);
  put(k, xf(lumpGeo(0.05, 3, 0.15, 0), E[0], E[1], E[2]), BONE_DK);
  put(k, xf(lumpGeo(0.045, 4, 0.15, 0), W[0], W[1], W[2]), BONE_DK);
  // Wrist claw hooking forward
  tube(k, [W, [0.95, 0.1, 0.14], [0.92, 0.06, 0.22]], 0.02, 0.003, BEAK, 4, 4);
  // Primaries: from pointing back at the wrist to sweeping outwards at the tip
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const base = lerp(W, T, t * 0.92);
    const th = -Math.PI / 2 - 0.1 + t * 1.25;
    const d: V = [Math.cos(th), -0.06, Math.sin(th)];
    const len = 0.62 + t * 0.32 - (i === 7 ? 0.08 : 0);
    feather(k, eg, [base[0], base[1] - 0.005 * i, base[2]], d, len, 0.075, i % 2 ? FEATHER : FEATHER_2, 10 + i * 3 + mirror, 0.1);
    if (i % 2 === 1 || i === 7) fg.add(flameGeo(tipOf(base, d, len, 0.1), [d[0] * 0.6, 0.05, d[2] * 0.6 - 0.6], 0.18 + t * 0.12, 0.022, 30 + i, 0.25));
  }
  // Secondaries along the forearm, pointing back
  for (let j = 0; j < 7; j++) {
    const t = j / 6;
    const base = lerp([0.1, 0.05, -0.05], W, t);
    const th = -Math.PI / 2 - 0.12 + t * 0.12;
    const d: V = [Math.cos(th), -0.05, Math.sin(th)];
    feather(k, j % 2 ? eg : null, [base[0], base[1] - 0.02, base[2]], d, 0.58 - t * 0.04, 0.085, j % 2 ? FEATHER_2 : FEATHER, 40 + j * 3 + mirror, 0.12, 0.6);
  }
  // Coverts layered over the bones (ashen grey)
  for (let j = 0; j < 9; j++) {
    const t = j / 8;
    const base = lerp([0.05, 0.08, -0.02], lerp(W, T, 0.4), t);
    const d: V = [0.15 + t * 0.3, -0.12, -1];
    feather(k, null, [base[0], base[1] + 0.012, base[2] + 0.03], d, 0.3 - t * 0.06, 0.075, j % 2 ? FEATHER_HI : FEATHER, 60 + j + mirror, 0.05);
  }
  // Ember fringe burning along the trailing edge of the secondaries
  for (let j = 0; j < 4; j++) fg.add(flameGeo([0.18 + j * 0.2, -0.04, -0.62], [0.05, 0.02, -1], 0.14, 0.018, 50 + j + mirror, 0.3));
}

function headKit(k: K, eye: GlowBatch, eg: GlowBatch, fg: GlowBatch): void {
  // Pivot-local: skull just ahead of the neck joint
  put(k, xf(lumpGeo(0.1, 5, 0.08, 1), 0, 0.04, 0.07, 0, 0, 0, 0.78, 0.76, 1.3), BONE);
  put(k, xf(lumpGeo(0.07, 6, 0.1, 0), 0, -0.02, 0.02, 0, 0, 0, 0.9, 0.7, 1.1), BONE_DK);
  // Deep sockets with furnace eyes
  for (const s of [-1, 1]) {
    k.ball(0.034, s * 0.055, 0.05, 0.13, SHADOW, 1, 0.75, 1.2, 8);
    eye.add(new THREE.SphereGeometry(0.016, 6, 4), s * 0.062, 0.048, 0.145, 0, 0, 0, 1.3, 0.6, 1);
    // Heavy brow ridge shading the socket
    put(k, xf(chunkGeo(0.075, 0.025, 0.09, 7 + s, { chamfer: 0.5, jitter: 0.05 }), s * 0.05, 0.085, 0.13, 0.25, s * 0.35, s * 0.3), BONE);
  }
  // Long hooked beak of obsidian, the lower half gaping
  const upper = new Spine(
    [
      [0, 0.05, 0.14],
      [0, 0.04, 0.27],
      [0, 0.0, 0.38],
      [0, -0.07, 0.43],
    ],
    (u) => table(u, [
      [0, 0.045, 0.045],
      [0.5, 0.028, 0.032],
      [1, 0.004, 0.004],
    ]),
    16,
  );
  put(k, upper.geo({ radial: 8, steps: 8, keel: 0.4 }), BEAK);
  const lower = new Spine(
    [
      [0, -0.01, 0.13],
      [0, -0.05, 0.25],
      [0, -0.09, 0.33],
    ],
    (u) => table(u, [
      [0, 0.035, 0.022],
      [1, 0.004, 0.004],
    ]),
    12,
  );
  put(k, lower.geo({ radial: 6, steps: 5 }), BEAK);
  // Fire breathing in the open beak
  eye.add(new THREE.SphereGeometry(0.025, 6, 4), 0, -0.02, 0.2, 0, 0, 0, 0.8, 0.6, 1.6);
  // Crown of blade feathers sweeping back, tipped with flame
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.03;
    const d: V = [(i - 2) * 0.2, 0.16 - Math.abs(i - 2) * 0.03, -1];
    const len = 0.46 - Math.abs(i - 2) * 0.07;
    feather(k, eg, [x, 0.09, 0.06], d, len, 0.03, i % 2 ? FEATHER_2 : FEATHER, 70 + i, -0.08, 0.5);
    if (i % 2 === 0) fg.add(flameGeo(tipOf([x, 0.09, 0.06], d, len, -0.08), [d[0] * 0.5, 0.35, -1], 0.12, 0.012, 75 + i, 0.25));
  }
}

function build(): Rig {
  const rig = newRig('flyer', 'cast');
  rig.presence = 1.15;
  const body = rig.body;
  const k = new K();
  const eg = new GlowBatch();
  const fg = new GlowBatch();

  // Fire roaring inside the ribcage
  addGlow(body, new THREE.SphereGeometry(0.1, 10, 8), FIRE, 0, -0.01, 0.08, 0.5).scale.set(1.45, 1.45, 2.1);
  addGlow(body, new THREE.SphereGeometry(0.04, 8, 6), HOT, 0, 0.01, 0.12, 2.2).scale.set(1, 1, 1.8);
  // Dark sinew lining the inside of the ribcage, so the fire shows only between the ribs
  put(k, xf(lumpGeo(0.17, 8, 0.05, 1), 0, 0.01, 0.06, 0, 0, 0, 0.78, 0.8, 1.4), SINEW);

  // Feathered mantle over the back (open underneath: the ribs show the fire)
  const sp = new Spine(
    [
      [0, -0.1, -0.52],
      [0, -0.04, -0.16],
      [0, 0.03, 0.14],
      [0, 0.17, 0.38],
    ],
    (u) => table(u, [
      [0, 0.09, 0.08],
      [0.4, 0.15, 0.15],
      [0.75, 0.2, 0.21],
      [1, 0.12, 0.12],
    ]),
    32,
  );
  put(k, sp.geo({ radial: 10, steps: 12, arc: [0.15, Math.PI - 0.15], keel: 0.15 }), FEATHER);
  put(k, sp.geo({ u0: 0, u1: 0.42, radial: 10, steps: 5, arc: [-Math.PI * 0.75, Math.PI * 0.25 - 0.1] }), FEATHER_2);
  // Ribs curving from the spine round to the sternum
  for (const s of [-1, 1])
    for (let i = 0; i < 6; i++) {
      const u = 0.44 + i * 0.085;
      const m = (a: number) => (s > 0 ? a : Math.PI - a);
      tube(k, [sp.point(u, m(0.35), -0.01), sp.point(u + 0.02, m(-0.45), 0.006), sp.point(u + 0.03, m(-1.2), 0.0), sp.point(u + 0.02, -Math.PI / 2 + s * 0.06, -0.01)], 0.02, 0.014, BONE_DK, 4, 5);
    }
  // Keel of the breastbone, blade-like
  const keel = new THREE.Shape();
  keel.moveTo(-0.16, 0);
  keel.lineTo(0.2, 0);
  keel.lineTo(0.12, -0.1);
  keel.lineTo(-0.06, -0.06);
  keel.closePath();
  k.plate(keel, 0.018, 0, 0, sp.point(0.72, -Math.PI / 2).y + 0.01, sp.point(0.72, -Math.PI / 2).z, BONE_DK, 0, -Math.PI / 2, 0);
  // Overlapping back feathers
  for (let r = 0; r < 3; r++)
    for (let i = -1; i <= 1; i++) {
      const u = 0.78 - r * 0.2;
      const p = sp.point(u, Math.PI / 2 + i * 0.5, 0.005);
      feather(k, null, [p.x, p.y, p.z], [i * 0.25, -0.15, -1], 0.3, 0.07, (r + i) % 2 ? FEATHER_HI : FEATHER_2, 80 + r * 3 + i, 0.03);
    }
  // Neck of exposed vertebrae with a ragged feather mane
  const nk = new Spine(
    [
      [0, 0.14, 0.36],
      [0, 0.3, 0.47],
      [0, 0.44, 0.58],
      [0, 0.5, 0.64],
    ],
    (u) => [0.085 - u * 0.03, 0.09 - u * 0.03],
    16,
  );
  put(k, nk.geo({ radial: 8, steps: 8, keel: 0.3 }), SINEW);
  for (let i = 0; i < 6; i++) {
    const u = i / 5;
    const f = nk.frame(u);
    const top = nk.point(u, Math.PI / 2, -0.015);
    put(k, orient(chunkGeo(0.06 - u * 0.012, 0.05, 0.05, 90 + i, { chamfer: 0.5, jitter: 0.05 }), top, f.t, [0, 0, -1]), i % 2 ? BONE : BONE_DK);
    put(k, spikeAB(top.clone().add(f.n.clone().multiplyScalar(0.015)), top.clone().add(f.n.clone().multiplyScalar(0.07)).add(f.t.clone().multiplyScalar(-0.05)), 0.013, 4), BONE_DK);
  }
  for (let i = 0; i < 8; i++) {
    const u = 0.05 + i * 0.12;
    const s = i % 2 ? 1 : -1;
    const p = nk.point(u, Math.PI / 2 + s * 0.9, -0.01);
    feather(k, i % 3 === 0 ? eg : null, [p.x, p.y, p.z], [s * 0.55, -0.35, -1], 0.3 - i * 0.015, 0.055, i % 2 ? FEATHER : FEATHER_2, 100 + i, 0.06, 0.5, [s, 0.6, 0]);
  }
  // Tail: long trailing feathers fanning back and down, burning at the ends
  const tb: V = [0, -0.1, -0.5];
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.13;
    const d: V = [Math.sin(a), -0.3, -Math.cos(a)];
    const len = 1.2 - Math.abs(i - 2) * 0.14;
    feather(k, eg, [tb[0] + (i - 2) * 0.02, tb[1], tb[2]], d, len, 0.07, i % 2 ? FEATHER_2 : FEATHER, 110 + i, 0.12, 0.55);
    fg.add(flameGeo(tipOf(tb, d, len, 0.12), [d[0], -0.15, -1], 0.26 + (2 - Math.abs(i - 2)) * 0.06, 0.026, 120 + i, 0.22));
  }
  // Two long streamer feathers trailing fire
  for (const s of [-1, 1]) {
    const d: V = [s * 0.12, -0.42, -1];
    feather(k, eg, [s * 0.03, -0.12, -0.48], d, 1.55, 0.035, FEATHER, 130 + s, 0.16, 0.4);
    fg.add(flameGeo(tipOf([s * 0.03, -0.12, -0.48], d, 1.55, 0.16), [s * 0.1, -0.1, -1], 0.36, 0.022, 132 + s, 0.25));
  }
  // Talons tucked under the body
  for (const s of [-1, 1]) {
    tube(k, [[s * 0.07, -0.14, -0.08], [s * 0.09, -0.26, -0.04], [s * 0.09, -0.34, 0.04]], 0.025, 0.018, BONE_DK, 5, 4);
    for (let i = 0; i < 3; i++) tube(k, [[s * 0.09, -0.34, 0.04], [s * 0.09 + (i - 1) * 0.03, -0.37, 0.1], [s * 0.09 + (i - 1) * 0.04, -0.42, 0.11]], 0.012, 0.002, BEAK, 4, 3);
  }

  // Head on the neck pivot
  const neck = pivot(body, 0, 0.5, 0.64);
  neck.scale.setScalar(1.15);
  rig.neck = neck;
  rig.head = neck;
  const hk = new K();
  const eye = new GlowBatch();
  const heg = new GlowBatch();
  const hfg = new GlowBatch();
  headKit(hk, eye, heg, hfg);
  addMesh(rig, neck, hk);
  eye.flush(neck, HOT, 3.5);
  heg.flush(neck, EMBER, 2.4);
  hfg.flush(neck, FIRE, 1.1);

  // Wings: the left one mirrors the right
  for (const s of [1, -1]) {
    const wp = pivot(body, s * 0.16, 0.1, 0.12);
    const wk = new K();
    const weg = new GlowBatch();
    const wfg = new GlowBatch();
    wingKit(wk, weg, wfg, s > 0 ? 0 : 1);
    addMesh(rig, wp, wk);
    weg.flush(wp, EMBER, 2.4);
    wfg.flush(wp, FIRE, 1.1);
    if (s < 0) wp.scale.x = -1;
    rig.wings.push(wp);
  }

  addMesh(rig, body, k);
  eg.flush(body, EMBER, 2.4);
  fg.flush(body, FIRE, 1.1);
  rig.height = 1.35;
  return rig;
}

export const pyrePhoenix: UnitDef = {
  build,
  portrait: {
    faction: 'ash',
    from: 0.35,
    to: 1.0,
    yaw: 0.45,
    pose: (rig) => {
      // Rising: body reared up, wings raised high, head turned to the viewer
      for (const w of rig.wings) w.rotation.z = (w.position.x > 0 ? 1 : -1) * 1.05;
      rig.body.rotation.x = -0.85;
      rig.body.position.y = 1.5;
      rig.neck?.rotation.set(0.75, -0.25, 0);
    },
  },
};
