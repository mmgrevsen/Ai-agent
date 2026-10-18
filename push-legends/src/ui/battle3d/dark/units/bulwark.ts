import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { shapeFrom, type K } from '../../../base3d/sculpt';
import { capGeo, cbox, HEAD_R, HEAD_Y, metal, prismGeo } from '../parts';
import { band, bladedPauldron, CHEST_SZ, chestLines, finGeo, flat, GlowBatch, gouge, grip, hoop, knight, lineGeo, mtl, rivet, scratch, shellGeo, type KnightParts } from './_armored';
import type { UnitDef } from './types';

/**
 * The Bulwark (card: aegis_guardian, rare). A walking wall: a hulking knight in glossy black iron
 * behind a huge tower pavise whose raised portcullis has forge-fire burning behind its bars, a
 * frog-mouthed helm crowned with battlements and sunk between massive spiked pauldrons, and a
 * short flanged mace for the gaps in the line. Accent: molten orange.
 */
const P = metal('#30333a', 0.72);
const D = metal('#1a1b20', 0.62);
const T = PAL.iron;
const HI = metal('#8a929b', 0.85);
const FACE = metal('#24262c', 0.6);
const SHADOW = '#060607';
const MOLTEN = '#ff7a1a';

function frogHelm(k: K, glow: THREE.Object3D): number {
  const r = HEAD_R;
  const hy = HEAD_Y - 0.03;
  k.ball(r * 0.9, 0, hy, 0, '#08080a', 1, 1.05, 1.05, 8);
  // Heavy bevor flaring onto the collar
  k.add(flat(new THREE.LatheGeometry([[1.32, -1.32], [1.2, -0.82], [1.1, -0.3], [1.06, 0.12]].map(([a, y]) => new THREE.Vector2(a! * r, hy + y! * r)), 10)), P, 0, 0, r * 0.04, 0, 0, 0, 1, 1, 1.12);
  // Domed skull
  k.add(flat(capGeo(r * 1.1, Math.PI * 0.55, 10, 4)), P, 0, hy + r * 0.1, -r * 0.04, 0, 0, 0, 1, 1.12, 1.08);
  // Sharp six-sided prow visor jutting forward under the slit
  k.add(flat(new THREE.ConeGeometry(r * 0.82, r * 1.55, 6)), D, 0, hy - r * 0.3, r * 0.78, Math.PI / 2, Math.PI / 6, 0, 1, 1, 0.72);
  k.add(flat(new THREE.ConeGeometry(r * 0.1, r * 1.5, 4)), HI, 0, hy - r * 0.02, r * 0.88, Math.PI / 2 + 0.3, 0, 0, 1, 1, 0.5);
  // Overhanging brow
  k.add(flat(shellGeo([[r * 1.26, hy + r * 0.36], [r * 1.22, hy + r * 0.43], [r * 1.1, hy + r * 0.54]], 0, 1.25, 8, 1.1)), D, 0, 0, -r * 0.04);
  // The slit: a black gap with molten light burning inside it
  cbox(k, r * 1.5, r * 0.12, 0.03, 0, hy + r * 0.29, r * 1.12, SHADOW);
  const gb = new GlowBatch();
  for (const sx of [-1, 1]) gb.add(new THREE.BoxGeometry(r * 0.52, r * 0.06, 0.008), sx * r * 0.36, hy + r * 0.29, r * 1.12 + 0.018, 0, sx * 0.3, 0);
  gb.flush(glow, MOLTEN, 5);
  // Battlemented comb along the crown, edged in bright steel
  const c = r * 1.5;
  k.add(finGeo(shapeFrom([[-c * 0.62, 0], [c * 0.7, 0], [c * 0.7, c * 0.3], [c * 0.42, c * 0.3], [c * 0.42, c * 0.48], [c * 0.16, c * 0.48], [c * 0.16, c * 0.3], [-c * 0.1, c * 0.3], [-c * 0.1, c * 0.52], [-c * 0.36, c * 0.52], [-c * 0.36, c * 0.3], [-c * 0.62, c * 0.3]]), 0.032, 0, hy + r * 1.05, -r * 0.08, 0, 0.005), D, 0, 0, 0);
  k.add(lineGeo([[0, hy + r * 1.05 + c * 0.3 + 0.004, r * 0.85], [0, hy + r * 1.05 + c * 0.3 + 0.004, -r * 1.1]], 0.005), HI, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 2.6;
    rivet(k, Math.sin(a) * r * 1.13, hy + r * 0.12, -r * 0.04 + Math.cos(a) * r * 1.13 * 1.1, HI, 0.009);
  }
  // Breaths punched in the right side of the prow, and a deep dent on the left
  for (let i = 0; i < 6; i++) cbox(k, r * 0.06, r * 0.06, 0.02, r * (0.5 + (i % 2) * 0.15), hy - r * (0.42 + Math.floor(i / 2) * 0.17), r * 1.06 - (i % 2) * r * 0.1, SHADOW, 0, 0.7, 0);
  k.ball(r * 0.22, -r * 0.62, hy + r * 0.75, r * 0.72, mtl(P, -0.45, 0.6), 1, 0.8, 0.4, 6);
  scratch(k, r * 0.7, -r * 0.2, hy + r * 0.75, r * 0.95, 0.3, -0.2);
  return hy + r * 1.05 + r * 1.5 * 0.52;
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
    k.plate(FLANGE, 0.018, 0, Math.sin(a) * 0.03, 0.66, Math.cos(a) * 0.03, i % 2 ? P : HI, 0, a - Math.PI / 2, 0, 1.2);
  }
  k.add(new THREE.ConeGeometry(0.034, 0.1, 6), P, 0, 0.82, 0);
  band(k, 0.045, 0.01, 0, 0.54, 0, T, Math.PI / 2, 0, 0, 6);
}

/**
 * Tower shield: a curved iron pavise taller than the knight's waist-to-chin, framed in thick
 * blackened bands, with a riveted spine, a viewing notch, ground spikes and a painted portcullis.
 */
function towerShield(k: K, g: THREE.Group): void {
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
  // Raised iron portcullis over the upper two thirds, forge-fire burning in the gaps behind it
  const fire = new GlowBatch();
  for (const a of [-0.25, -0.085, 0.085, 0.25]) {
    const [x, , z] = at(a, 0.2, 0.012);
    cbox(k, 0.04, 0.52, 0.016, x, 0.23, z, P, 0, a, 0);
    cbox(k, 0.008, 0.5, 0.018, x, 0.23, z + 0.002, HI, 0, a, 0);
    const [fx, , fz] = at(a, -0.06, 0.012);
    k.add(new THREE.ConeGeometry(0.035, 0.11, 4), P, fx, -0.07, fz, Math.PI, a, 0, 1, 1, 0.3);
  }
  for (const a of [-0.335, -0.168, 0, 0.168, 0.335]) {
    const [x, , z] = at(a, 0.2, 0.003);
    fire.add(new THREE.BoxGeometry(a === 0 || Math.abs(a) > 0.3 ? 0.026 : 0.034, 0.46, 0.004), x, 0.22, z, 0, a, 0);
  }
  fire.flush(g, MOLTEN, 2.4);
  for (const y of [0.3, 0.44]) k.add(shellGeo([[R + 0.008, y - 0.022], [R + 0.022, y - 0.02], [R + 0.022, y + 0.02], [R + 0.008, y + 0.022]], 0, 0.31, 6), P, cx, 0, cz);
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
      pauldron: (k, s) => bladedPauldron(k, s, { size: 0.22, lames: 4, plate: P, dark: D, edge: HI, tilt: 0.45, stretch: [1.08, 0.9, 1.18], spikes: 3, haute: 0.2, point: 0.03 }),
      weapon: (k) => mace(k),
      shield: towerShield,
      shieldTilt: 0.15,
      shieldOffset: [0.05, 0.12],
      tabard: { front: null, back: PAL.crimson, len: 0.5, w: 0.24, seed: 41, tatter: 0.4 },
      faulds: 4,
      edge: HI,
      extra: (p: KnightParts) => {
        chestLines(p, HI, { abs: false });
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
        // A furnace grille in the backplate, molten light behind its bars (reads from behind)
        {
          const rg = new GlowBatch();
          const [bx, by, bz] = p.onChest(Math.PI, 1.36, 0.012);
          p.torso.add(flat(new THREE.CylinderGeometry(0.085, 0.085, 0.016, 8)), D, bx, by, bz + 0.004, Math.PI / 2 + 0.1, 0, Math.PI / 8);
          hoop(p.torso, 0.085, 0.008, bx, by, bz - 0.004, HI, Math.PI / 2 + 0.1, 0, 0, 8);
          for (const dy of [-0.04, 0, 0.04]) rg.add(new THREE.BoxGeometry(0.11 - Math.abs(dy) * 0.9, 0.016, 0.01), bx, by + dy, bz - 0.006, 0.1, 0, 0);
          rg.flush(p.frame, MOLTEN, 3);
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
      rig.armL?.rotation.set(-0.08, 0, 0.04);
      rig.legs.forEach((l, i) => (l.rotation.x = i === 0 ? 0.25 : -0.2));
      rig.body.rotation.y = 0.1;
      rig.neck?.rotation.set(0.06, -0.12, 0);
    },
  },
};
