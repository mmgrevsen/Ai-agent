import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { shapeFrom, type K } from '../../../base3d/sculpt';
import { capGeo, cbox, frustumGeo, HEAD_R, HEAD_Y, metal, prismGeo } from '../parts';
import { band, CHEST_SZ, copTop, eyeSlit, flat, gouge, grip, knight, mtl, rivet, scratch, shellGeo, spaulder, type KnightParts } from './_armored';
import type { UnitDef } from './types';

/**
 * The Bulwark (card: aegis_guardian, rare). A walking wall: a hulking knight in weathered steel
 * behind a huge iron tower shield painted with a blood-red portcullis, a frog-mouthed helm sunk
 * between massive pauldrons, and a short flanged mace for the gaps in the line.
 */
const P = metal('#7b8189', 0.75);
const D = PAL.blackSteel;
const T = PAL.iron;
const HI = mtl(P, 0.2);
const FACE = metal('#41454b', 0.6);
const SHADOW = '#060607';

function frogHelm(k: K, glow: THREE.Object3D): number {
  const r = HEAD_R;
  const hy = HEAD_Y - 0.03;
  k.ball(r * 0.9, 0, hy, 0, '#08080a', 1, 1.05, 1.05, 8);
  // Lower bowl: a jutting prow with a sharp ridge, flaring down onto the breastplate
  k.add(flat(new THREE.LatheGeometry([[1.34, -1.3], [1.26, -0.72], [1.15, -0.1], [1.02, 0.17]].map(([a, y]) => new THREE.Vector2(a! * r, hy + y! * r)), 8)), P, 0, 0, r * 0.2, 0, 0, 0, 1, 1, 1.24);
  // Upper skull set back; its brow overhangs the slit (the "frog mouth")
  k.add(flat(capGeo(r * 1.1, Math.PI * 0.5, 8, 3)), P, 0, hy + r * 0.27, -r * 0.08, 0, 0, 0, 1, 0.98, 1.1);
  k.add(flat(shellGeo([[r * 1.2, hy + r * 0.22], [r * 1.18, hy + r * 0.27], [r * 1.08, hy + r * 0.36]], 0, 1.25, 6, 1.1)), D, 0, 0, -r * 0.06);
  // The slit: a black gap with two faint embers deep inside
  cbox(k, r * 1.55, r * 0.075, r * 0.5, 0, hy + r * 0.22, r * 0.95, SHADOW);
  eyeSlit(k, glow, PAL.ember, hy + r * 0.215, r * 1.04, 0, r * 0.07, r * 0.32, 3, 0, r * 0.32);
  // Low comb along the crown and a riveted seam
  k.add(frustumGeo(0.022, r * 0.28, r * 1.9, 0.5, 0.85), D, 0, hy + r * 1.24, -r * 0.12);
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 2.6;
    rivet(k, Math.sin(a) * r * 1.12, hy + r * 0.12, r * 0.14 + Math.cos(a) * r * 1.12 * 1.14, T, 0.009);
  }
  // Breaths punched in the right side of the prow, and a deep dent on the left
  for (let i = 0; i < 6; i++) cbox(k, r * 0.07, r * 0.07, 0.02, r * (0.42 + (i % 2) * 0.16), hy - r * (0.35 + Math.floor(i / 2) * 0.18), r * 1.1, SHADOW, 0, 0.55, 0);
  k.ball(r * 0.25, -r * 0.65, hy - r * 0.4, r * 0.95, mtl(P, -0.45), 1, 0.8, 0.4, 6);
  scratch(k, r * 0.7, -r * 0.2, hy + r * 0.75, r * 0.95, 0.3, -0.2);
  return hy + r * 1.38;
}

const FLANGE = shapeFrom([[0, -0.1], [0.045, -0.075], [0.072, -0.01], [0.06, 0.07], [0, 0.1]]);

function mace(k: K): void {
  grip(k, -0.12, 0.15, 0.026, PAL.leatherDark);
  k.add(new THREE.OctahedronGeometry(0.038, 0), D, 0, -0.15, 0, 0, 0, 0, 1, 1.3, 1);
  band(k, 0.032, 0.009, 0, 0.17, 0, T, Math.PI / 2, 0, 0, 6);
  k.add(prismGeo(0.021, 0.42, 6), D, 0, 0.38, 0);
  // Heavy head: iron core with six flanges and a blunt crown spike
  k.add(prismGeo(0.042, 0.22, 6), D, 0, 0.66, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.plate(FLANGE, 0.016, 0.004, Math.sin(a) * 0.03, 0.66, Math.cos(a) * 0.03, i % 2 ? P : HI, 0, a - Math.PI / 2, 0, 1.2);
  }
  k.add(new THREE.ConeGeometry(0.034, 0.1, 6), P, 0, 0.82, 0);
  band(k, 0.045, 0.01, 0, 0.54, 0, T, Math.PI / 2, 0, 0, 6);
}

/**
 * Tower shield: a curved iron pavise taller than the knight's waist-to-chin, framed in thick
 * blackened bands, with a riveted spine, a viewing notch, ground spikes and a painted portcullis.
 */
function towerShield(k: K): void {
  const R = 1.05;
  const half = 0.37;
  const y0 = -0.74;
  const y1 = 0.62;
  const cx = 0.13;
  const cz = 0.2 - R;
  const at = (a: number, y: number, out = 0): [number, number, number] => [cx + Math.sin(a) * (R + out), y, cz + Math.cos(a) * (R + out)];
  // Wooden core (seen from behind) and the iron face plate
  k.add(shellGeo([[R - 0.012, y0], [R - 0.012, y1]], 0, half, 6), PAL.wood, cx, 0, cz);
  k.add(shellGeo([[R, y0], [R, y1 - 0.06], [R - 0.004, y1]], 0, half, 6, 1, -0.05), FACE, cx, 0, cz);
  // Thick frame: top, bottom and side bands with a raised edge
  const rim = (ya: number, yb: number, hex: string) => k.add(shellGeo([[R - 0.02, ya], [R + 0.028, ya], [R + 0.028, yb], [R - 0.02, yb]], 0, half + 0.01, 6), hex, cx, 0, cz);
  rim(y0 - 0.02, y0 + 0.05, P);
  rim(y1 - 0.11, y1 - 0.04, P);
  for (const s of [-1, 1]) {
    const [x, , z] = at(s * (half + 0.005), 0, 0.004);
    cbox(k, 0.06, y1 - y0 - 0.04, 0.05, x, (y0 + y1) / 2 - 0.03, z, P, 0, s * half, 0);
  }
  // Viewing notch in the top edge
  cbox(k, 0.12, 0.05, 0.06, cx, y1 - 0.06, cz + R + 0.01, SHADOW);
  // Horizontal iron straps and a central spine with a heavy boss at the grip
  for (const y of [-0.38, 0.12]) k.add(shellGeo([[R + 0.004, y - 0.025], [R + 0.018, y - 0.022], [R + 0.018, y + 0.022], [R + 0.004, y + 0.025]], 0, half, 6), T, cx, 0, cz);
  cbox(k, 0.05, y1 - y0 - 0.14, 0.03, cx, (y0 + y1) / 2 - 0.05, cz + R + 0.012, D);
  k.add(flat(capGeo(0.085, Math.PI / 2, 8, 3)), P, cx, -0.12, cz + R + 0.02, Math.PI / 2, 0, 0, 1, 1, 0.7);
  band(k, 0.085, 0.012, cx, -0.12, cz + R + 0.02, T, 0, 0, 0, 8);
  for (const a of [-0.3, -0.1, 0.1, 0.3])
    for (const y of [-0.38, 0.12]) {
      const [x, , z] = at(a, y, 0.02);
      rivet(k, x, y, z, PAL.steel, 0.014);
    }
  // Painted portcullis: blood-red bars with spiked feet
  for (const a of [-0.2, 0, 0.2]) {
    const [x, , z] = at(a, 0.3, 0.007);
    cbox(k, 0.035, 0.36, 0.006, x, 0.36, z, PAL.blood, 0, a, 0);
    const [fx, , fz] = at(a, 0.15, 0.007);
    k.add(new THREE.ConeGeometry(0.03, 0.08, 3), PAL.blood, fx, 0.15, fz, Math.PI, a, 0, 1, 1, 0.12);
  }
  for (const y of [0.3, 0.44]) k.add(shellGeo([[R + 0.006, y - 0.016], [R + 0.006, y + 0.016]], 0, 0.27, 4), PAL.blood, cx, 0, cz);
  // Ground spikes along the foot so it can be planted
  for (const a of [-0.26, 0, 0.26]) {
    const [x, , z] = at(a, y0, 0.002);
    k.add(new THREE.ConeGeometry(0.028, 0.14, 4), D, x, y0 - 0.08, z, Math.PI, 0, 0);
  }
  // Leather straps and braces on the back
  for (const y of [-0.3, 0.2]) cbox(k, 0.5, 0.05, 0.02, cx, y, cz + R - 0.03, PAL.leatherDark);
  cbox(k, 0.05, 1.1, 0.025, cx - 0.12, -0.06, cz + R - 0.03, T, 0, 0, 0.5);
  cbox(k, 0.05, 1.1, 0.025, cx + 0.12, -0.06, cz + R - 0.03, T, 0, 0, -0.5);
  // Battle damage
  {
    const [x, , z] = at(0.22, -0.2, 0.008);
    gouge(k, 0.22, x, -0.2, z, 0.6, 0.22);
  }
  {
    const [x, , z] = at(-0.18, -0.52, 0.008);
    gouge(k, 0.16, x, -0.52, z, -0.4, -0.18);
  }
  {
    const [x, , z] = at(-0.24, 0.02, 0.008);
    scratch(k, 0.2, x, 0.02, z, -0.25, -0.24);
  }
  {
    const [x, , z] = at(0.12, 0.5, 0.008);
    scratch(k, 0.14, x, 0.5, z, 0.5, 0.12, PAL.boneDark);
  }
  // A crossbow bolt stuck in the face
  const [bx, , bz] = at(-0.15, -0.3, 0.06);
  k.add(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 4), PAL.wood, bx, -0.28, bz, 1.2, 0.3, 0);
  cbox(k, 0.004, 0.04, 0.03, bx - 0.02, -0.25, bz + 0.07, PAL.boneDark, 1.2, 0.3, 0);
}

export const bulwark: UnitDef = {
  build: () =>
    knight({
      bulk: 1.36,
      col: { plate: P, dark: D, trim: T, mail: PAL.iron, cloth: PAL.cloth, leather: PAL.leatherDark },
      helm: frogHelm,
      pauldron: (k, s) => {
        const ps = { size: 0.2, lames: 4, plate: P, dark: D, trim: T, haute: 0.17, tilt: 0.45, stretch: [1.05, 0.95, 1.15] as [number, number, number], rivets: 4, facet: true };
        spaulder(k, s, ps);
        // Reinforcing ridge over the cop
        const [tx, ty] = copTop(ps, s);
        k.add(frustumGeo(0.03, 0.035, 0.36, 0.6, 0.9), HI, tx, ty + 0.01, 0, 0, 0, -s * 0.45);
      },
      weapon: (k) => mace(k),
      shield: towerShield,
      shieldTilt: 0.42,
      tabard: { front: PAL.blood, back: PAL.crimson, len: 0.5, w: 0.24, seed: 41, tatter: 0.4 },
      faulds: 4,
      extra: (p: KnightParts) => {
        // Heavy chain slung round the hips
        for (let i = 0; i < 9; i++) {
          const a = -1.2 + i * 0.3;
          const r = 0.25 * p.b;
          band(p.torso, 0.02, 0.006, Math.sin(a) * r, 0.94 + Math.cos(a * 1.3) * 0.02, Math.cos(a) * r * 0.82, T, 0, a + (i % 2) * 1.57, 0.4, 6);
        }
        // Thick collar plate behind the helm (the head sinks between the shoulders)
        p.torso.add(shellGeo([[0.2 * p.b, 1.55], [0.17 * p.b, 1.66], [0.13 * p.b, 1.72]], Math.PI, 1.5, 7, 0.85), D, 0, 0, 0);
        // Shield arm: heavy strapped vambrace
        band(p.armL, 0.09, 0.014, 0, -0.42, 0, PAL.leatherDark, Math.PI / 2 + 0.15, 0, 0, 8);
        band(p.armL, 0.09, 0.014, 0, -0.52, 0, PAL.leatherDark, Math.PI / 2 - 0.1, 0, 0, 8);
        // Overlapping lames across the small of the back
        for (let i = 0; i < 3; i++) {
          const y = 1.25 - i * 0.075;
          p.torso.add(shellGeo([[p.chestR(y - 0.08) + 0.014, y - 0.08], [p.chestR(y) + 0.008, y]], Math.PI, 1.3, 6, CHEST_SZ * 1.02), i % 2 ? P : D, 0, 0, 0.004);
        }
        // Old wounds in the plate
        const [x, y, z] = p.onChest(0.3, 1.27, 0.006);
        gouge(p.torso, 0.18, x, y, z, -0.6, p.chestYaw(0.3));
      },
    }),
  portrait: {
    from: 0.12,
    to: 1.04,
    yaw: 0.35,
    faction: 'iron',
    // Shield planted upright in front, mace raised over it
    pose: (rig) => {
      rig.armR?.rotation.set(-1.25, 0, 0.32);
      rig.armL?.rotation.set(-0.3, 0, 0.04);
      rig.legs.forEach((l, i) => (l.rotation.x = i === 0 ? 0.25 : -0.2));
      rig.body.rotation.y = 0.1;
      rig.neck?.rotation.set(0.06, -0.12, 0);
    },
  },
};
