import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { K, shade } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { capGeo, cbox, frustumGeo, metal, prismGeo, SHAPES } from '../parts';
import { armBase, arrow, band, chestZ, glow, gouge, hoop, HR, HY, Hunter, latheArc, legBase, onShin, rod, shell, SHADOW, skirtHalf, strap, studs, torsoBase } from './_hunters';
import type { UnitDef } from './types';

/**
 * Grave Marksman (card: hawkeye_ranger, rare). A patient sniper: a heavy steel-prod arbalest with
 * a loaded bone-white bolt, a long-tailed sallet whose visor carries a brass sighting tube with a
 * single ember lens, a crimson scarf over the lower face, a dented breastplate over a long leather
 * greatcoat lined in crimson, plate gauntlets and a tall crimson pavise slung on the back.
 */
const BRASS = metal(shade(PAL.gold, -0.15), 0.85);
const C = {
  coat: shade(PAL.leather, 0.06),
  coatDark: PAL.leatherDark,
  shirt: PAL.cloth,
  trousers: PAL.charcoal,
  boot: PAL.leatherDark,
  plate: PAL.gunmetal,
  plateDark: PAL.blackSteel,
  bright: PAL.steel,
  scarf: shade(PAL.crimson, -0.1),
  lining: PAL.crimson,
  wood: PAL.wood,
  bone: PAL.bone,
  glow: PAL.ember,
};

/** Heavy arbalest along +y from the trigger grip; the bolt groove (top) faces −z. */
function arbalest(k: K, g: THREE.Object3D): void {
  // Tiller and butt
  k.add(frustumGeo(0.05, 0.86, 0.075, 0.75, 0.8), C.wood, 0, 0.2, 0.005);
  k.add(frustumGeo(0.07, 0.22, 0.11, 0.7, 0.75), shade(C.wood, -0.2), 0, -0.28, 0.02);
  for (const y of [-0.12, 0.3, 0.52]) band(k, 0.046, 0.03, 0, y, 0.005, C.plateDark, 0, 0, 0, 6);
  // Steel prod with bound tips, spanned string and a stirrup at the nose
  k.curve(
    [
      [-0.42, 0.5, -0.0],
      [-0.2, 0.57, -0.01],
      [0, 0.6, -0.01],
      [0.2, 0.57, -0.01],
      [0.42, 0.5, -0.0],
    ],
    0.024,
    0.024,
    C.plate,
    5,
  );
  for (const sx of [-1, 1]) {
    k.add(new THREE.OctahedronGeometry(0.03), C.bright, sx * 0.42, 0.5, 0);
    rod(k, [sx * 0.41, 0.5, -0.02], [0, 0.2, -0.045], 0.004, PAL.boneDark, 3);
  }
  k.add(frustumGeo(0.09, 0.08, 0.06, 0.8), C.plateDark, 0, 0.6, 0);
  hoop(k, 0.055, 0.009, 0, 0.7, 0.0, C.plateDark, 0, 0, 0, 8);
  // Loaded bolt in the groove
  arrow(k, [0, 0.2, -0.05], [0, 0.82, -0.05], { r: 0.009, shaft: PAL.boneDark, head: C.bright, fletch: C.scarf, headLen: 0.09 });
  // Trigger lever underneath, a rear sight post and a windlass hub on the side
  rod(k, [0, 0.04, 0.05], [0, -0.22, 0.055], 0.008, C.plateDark, 4);
  k.add(frustumGeo(0.012, 0.06, 0.012, 0.5), C.bright, 0, 0.12, -0.065);
  k.add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8), C.plateDark, 0.045, -0.12, 0.0, 0, 0, Math.PI / 2);
  rod(k, [0.06, -0.12, 0], [0.06, -0.2, 0.06], 0.006, C.plateDark, 4);
  addSpark(g);
}

/** Faint ember point on the bolt head: the sniper's mark (tiny, never obscures the weapon). */
function addSpark(g: THREE.Object3D): void {
  glow(g, C.glow, 2.2, [[new THREE.OctahedronGeometry(0.012), 0, 0.84, -0.05]]);
}

/** Long-tailed sallet with a visor slit, a brass sighting tube over the right eye. */
function sallet(k: K, glowParent: THREE.Object3D): number {
  const r = HR;
  k.ball(r * 0.95, 0, HY, 0, SHADOW, 1, 1.1, 1.05, 10);
  k.add(capGeo(r * 1.14, Math.PI * 0.5, 10, 4), C.plate, 0, HY + r * 0.02, -r * 0.08, 0, 0, 0, 1, 1.08, 1.18);
  // Sweeping tail flaring out over the neck
  k.add(latheArc([[r * 1.42, -r * 0.42], [r * 1.26, -r * 0.1], [r * 1.14, r * 0.04]], 10, Math.PI * 0.42, Math.PI * 1.16), C.plate, 0, HY, -r * 0.08, 0, 0, 0, 1, 1, 1.2);
  k.add(frustumGeo(r * 1.0, r * 0.12, r * 1.0, 0.4, 0.6), C.plateDark, 0, HY - r * 0.4, -r * 1.55, -0.35);
  // Ridge over the crown
  k.add(frustumGeo(r * 0.1, r * 0.16, r * 2.1, 0.5, 0.9), C.plateDark, 0, HY + r * 1.12, -r * 0.15, 0.08);
  // Visor with a single slit
  k.add(frustumGeo(r * 1.85, r * 0.8, r * 0.5, 0.95, 1.0, r * 0.08), C.plateDark, 0, HY + r * 0.08, r * 0.82);
  cbox(k, r * 1.5, r * 0.09, r * 0.2, 0, HY + r * 0.14, r * 1.06, SHADOW);
  for (const sx of [-1, 1]) k.add(new THREE.OctahedronGeometry(r * 0.08), C.bright, sx * r * 0.95, HY + r * 0.12, r * 0.55);
  gouge(k, -r * 0.4, HY + r * 0.65, r * 0.92, r * 0.5, 0.4);
  gouge(k, r * 0.2, HY - r * 0.12, r * 1.08, r * 0.35, -0.3);
  // Brass sighting tube on a hinge arm, lens glowing faintly
  rod(k, [r * 0.42, HY + r * 0.15, r * 1.0], [r * 0.42, HY + r * 0.15, r * 1.62], r * 0.13, BRASS, 7, r * 0.15);
  band(k, r * 0.17, r * 0.12, r * 0.42, HY + r * 0.15, r * 1.6, C.plateDark, Math.PI / 2, 0, 0, 7);
  strap(k, [r * 0.42, HY + r * 0.3, r * 1.1], [r * 1.0, HY + r * 0.55, r * 0.3], r * 0.1, r * 0.06, C.plateDark);
  glow(glowParent, C.glow, 4.5, [
    [new THREE.CircleGeometry(r * 0.12, 8), r * 0.42, HY + r * 0.15, r * 1.75],
    [new THREE.BoxGeometry(r * 0.32, r * 0.04, 0.01), -r * 0.36, HY + r * 0.14, r * 1.17],
  ]);
  // Steel bevor over the jaw, dark crimson scarf wound around the neck below it
  k.add(latheArc([[r * 1.08, -r * 1.0], [r * 1.12, -r * 0.6], [r * 1.0, -r * 0.2]], 10, -1.3, 2.6), C.plate, 0, HY, r * 0.08, 0, 0, 0, 1, 1, 1.1);
  k.add(frustumGeo(r * 0.12, r * 0.75, r * 0.1, 0.6), C.bright, 0, HY - r * 0.6, r * 1.2, -0.25);
  k.add(latheArc([[r * 1.35, -r * 1.5], [r * 1.25, -r * 1.2], [r * 1.12, -r * 0.92]], 10, 0, Math.PI * 2, 0.08, 4), C.scarf, 0, HY, 0, 0, 0, 0, 1, 1, 1.05);
  k.add(new THREE.TorusGeometry(r * 1.22, r * 0.14, 4, 10), shade(C.scarf, -0.2), 0, HY - r * 1.2, 0, Math.PI / 2 + 0.15, 0, 0, 1, 1.05, 1);
  return HY + r * 1.25;
}

/** Narrow pavise slung on the back: blackened iron face, a single crimson kill-stripe, bone sigil. */
function pavise(k: K): void {
  const shape = SHAPES.tower(0.2, 0.74);
  const z = -0.27;
  const y0 = 1.12;
  k.plate(shape, 0.04, 0.012, 0, y0, z, C.plateDark, 0.1, Math.PI, 0, 1.06);
  k.plate(shape, 0.03, 0.01, 0, y0, z - 0.022, C.plate, 0.1, Math.PI, 0);
  // Raised central ridge painted with one crimson stripe (the only accent on the back)
  k.add(frustumGeo(0.07, 0.72, 0.045, 0.85), C.lining, 0, y0, z - 0.045, 0.1);
  k.add(frustumGeo(0.02, 0.72, 0.02, 0.6), C.bright, 0, y0, z - 0.07, 0.1);
  // Bone sigil: a downward bolt point (the mark of a confirmed kill)
  k.add(new THREE.ConeGeometry(0.06, 0.14, 3), C.bone, 0, y0 - 0.14, z - 0.075, 0.1 + Math.PI, 0, 0, 1, 1, 0.2);
  for (const [x, y] of [[-0.17, y0 + 0.32], [0.17, y0 + 0.32], [-0.18, y0 - 0.28], [0.18, y0 - 0.28]] as const) k.add(new THREE.OctahedronGeometry(0.016), C.bright, x, y, z - 0.035 + (y - y0) * 0.1);
  gouge(k, 0.1, y0 + 0.2, z - 0.06, 0.14, 0.7);
  gouge(k, -0.11, y0 - 0.18, z - 0.065, 0.1, -0.5);
  // Carry straps over the shoulders
  for (const sx of [-1, 1]) strap(k, [sx * 0.11, y0 + 0.34, z + 0.03], [sx * 0.15, 1.58, 0.06], 0.04, 0.012, C.coatDark);
}

function marksman(): Rig {
  const h = new Hunter({ attack: 'bow', bulk: 1.0 });
  const b = h.b;
  const t = h.torso;
  torsoBase(t, b, { shirt: C.coat, trousers: C.trousers, neck: C.scarf });
  // Greatcoat body, dented breastplate with a ridge and rivets, high collar
  shell(t, b, C.coat, 0.96, 1.6, 0.02);
  shell(t, b, C.plate, 1.17, 1.55, 0.05, { phiStart: -1.15, phiLen: 2.3, seg: 8 });
  t.add(frustumGeo(0.035, 0.34, 0.03, 0.6), C.bright, 0, 1.36, chestZ(b, 1.36, 0.07));
  studs(t, C.bright, [-0.15, 0.15], [1.22, 1.32, 1.42], (x, y) => Math.sqrt(Math.max(0, chestZ(b, y, 0.055) ** 2 - (x * 0.66) ** 2)), 0.012);
  gouge(t, 0.07, 1.44, chestZ(b, 1.44, 0.07), 0.12, 0.55);
  gouge(t, -0.06, 1.27, chestZ(b, 1.27, 0.065), 0.09, -0.4);
  t.add(latheArc([[0.17, 1.56], [0.15, 1.66], [0.16, 1.76]], 10, 0.75, Math.PI * 2 - 1.5), C.coatDark, 0, 0, -0.01, 0, 0, 0, 1, 1, 0.85);
  // Belt with a bolt case on the right hip and a cranequin on the left
  shell(t, b, C.coatDark, 1.06, 1.13, 0.035);
  cbox(t, 0.065, 0.065, 0.02, 0, 1.095, chestZ(b, 1.1, 0.045), C.bright);
  cbox(t, 0.1, 0.24, 0.08, 0.2, 0.96, 0.03, C.coatDark, 0, 0, -0.08);
  for (let i = 0; i < 4; i++) arrow(t, [0.17 + i * 0.02, 1.13 + (i % 2) * 0.03, 0.01 + (i % 2) * 0.03], [0.17 + i * 0.02, 0.98, 0.02], { r: 0.006, fletch: i % 2 ? C.scarf : PAL.boneDark, headLen: 0.001 });
  t.add(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), C.plateDark, -0.2, 0.98, 0.06, 0, 0, Math.PI / 2 - 0.2);
  rod(t, [-0.2, 0.98, 0.06], [-0.24, 0.8, 0.1], 0.008, C.plateDark, 4);
  pavise(t);

  const hk = h.head;
  const top = sallet(hk, h.headGroup);

  // Legs: long coat skirt lined in crimson, plate knees and greaves
  for (const s of [-1, 1]) {
    const k = h.leg(s);
    const l = legBase(k, b, { trousers: C.trousers, boot: C.boot, bend: 0.05, cuff: C.coatDark });
    skirtHalf(
      k,
      s,
      h.legX,
      C.coat,
      [
        [0.27, -0.74],
        [0.235, -0.42],
        [0.19, -0.06],
        [0.168, 0.08],
      ],
      { frontGap: 0.38, backGap: 0.06, tatter: 0.08, seed: 21 },
    );
    skirtHalf(
      k,
      s,
      h.legX,
      C.lining,
      [
        [0.26, -0.7],
        [0.226, -0.42],
        [0.182, -0.06],
        [0.16, 0.06],
      ],
      { frontGap: 0.16, backGap: 0.5, tatter: 0.06, seed: 23, seg: 4 },
    );
    k.add(capGeo(0.068, Math.PI * 0.5, 8, 3), C.plate, 0, l.knee[1], l.knee[2] + 0.045, Math.PI / 2 - 0.1, 0, 0, 1, 1, 0.75);
    k.add(frustumGeo(0.012, 0.08, 0.06, 0.5), C.plateDark, s * 0.06, l.knee[1], l.knee[2] + 0.02, 0, 0, s * 0.2);
    k.add(frustumGeo(0.09, 0.32, 0.03, 1.2), C.plate, ...onShin(l, 0.42, 0.058), l.bend, 0, 0);
    k.add(frustumGeo(0.016, 0.3, 0.02, 0.5), C.bright, ...onShin(l, 0.42, 0.075), l.bend, 0, 0);
  }

  // Arms: layered steel on the left (pavise side), lighter cop on the shooting arm, plate gauntlets
  for (const s of [-1, 1]) {
    const k = h.arm(s);
    armBase(k, s, b, { sleeve: C.coat, glove: C.plateDark, forearm: C.coat, cuff: 1.35 });
    const lames = s < 0 ? 3 : 2;
    k.add(capGeo(0.14, Math.PI * 0.5, 8, 4), C.plate, s * 0.02, 0.01, 0, 0, 0, -s * 0.3, 1.06, 0.8, 1.14);
    for (let i = 1; i < lames; i++) k.add(capGeo(0.13 - i * 0.008, Math.PI * 0.42, 8, 3), i % 2 ? C.plateDark : C.plate, s * (0.025 + i * 0.006), 0.01 - i * 0.06, 0, 0, 0, -s * (0.38 + i * 0.06), 1.05, 0.55, 1.12);
    hoop(k, 0.14, 0.008, s * 0.02, 0.01, 0, C.bright, Math.PI / 2, 0, -s * 0.3, 12);
    gouge(k, s * 0.1, 0.04, 0.07, 0.07, -s * 0.8, -s * 0.5);
    k.add(capGeo(0.055, Math.PI * 0.55, 7, 3), C.plate, 0, -0.33, -0.02, -Math.PI / 2 - 0.3, 0, 0);
    k.add(prismGeo(0.05, 0.2, 7, 1.18), C.plate, 0, -0.47, 0);
  }

  // Arbalest in the right hand: hangs across the shins at rest, levels at the target when firing
  const wk = h.kit(h.handR, 0, -0.01, 0.0, 2.8, 0, 0.3);
  arbalest(wk.k, wk.g);
  return h.finish(top);
}

export const graveMarksman: UnitDef = {
  build: marksman,
  portrait: {
    pose: (rig) => {
      rig.armR!.rotation.set(-1.38, 0, 0.05);
      rig.armL!.rotation.set(-1.25, 0, 0.42);
      rig.body.rotation.y = 0.3;
      rig.legs[0]!.rotation.x = 0.25;
      rig.legs[1]!.rotation.x = -0.2;
      rig.neck!.rotation.set(0.06, -0.22, 0);
    },
    from: 0.34,
    to: 1.03,
    yaw: 0.42,
    faction: 'iron',
  },
};
