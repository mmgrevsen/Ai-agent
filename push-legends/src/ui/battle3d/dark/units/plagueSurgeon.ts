import * as THREE from 'three';
import { PAL } from '../../../art/darkArt';
import { K, shade, shapeFrom, type V } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { cbox, frustumGeo, metal, prismGeo } from '../parts';
import { armBase, band, chestZ, glow, gouge, type GlowPart, hoop, HR, HY, Hunter, latheArc, legBase, mantle, mix, onShin, rod, shell, SHADOW, skirtHalf, strapPath, torsoBase } from './_hunters';
import type { UnitDef } from './types';

/**
 * Plague Surgeon (card: field_medic, common). Tall and gaunt in a waxed leather greatcoat that
 * sweeps to the ankles, a shoulder cape, a wide angular hat over a pale beaked mask with round
 * lenses glowing sickly green, a bandolier of glowing vials, a bone saw in one hand and a swinging
 * iron censer of green smoke in the other. His cures burn.
 */
const BRASS = metal(shade(PAL.gold, -0.25), 0.8);
const C = {
  coat: mix(shade(PAL.leather, 0.04), PAL.charcoal, 0.25),
  cape: shade(PAL.leather, 0.1),
  hat: shade(PAL.charcoal, 0.08),
  hood: PAL.leatherDark,
  beak: PAL.boneDark,
  beakHi: PAL.bone,
  trousers: PAL.charcoal,
  boot: PAL.leatherDark,
  glove: shade(PAL.leatherDark, 0.12),
  iron: PAL.iron,
  ironDark: PAL.blackSteel,
  saw: PAL.gunmetal,
  bone: PAL.bone,
  glass: mix(PAL.charcoal, PAL.toxic, 0.25),
  glow: PAL.toxic,
};

const SAW = shapeFrom(
  (() => {
    // Straight back, toothed edge on +x, squared tip
    const pts: [number, number][] = [
      [-0.03, 0],
      [-0.035, 0.34],
      [0.0, 0.36],
    ];
    for (let i = 0; i < 9; i++) {
      const y = 0.34 - i * 0.035;
      pts.push([0.045, y], [0.03, y - 0.018]);
    }
    pts.push([0.03, 0]);
    return pts;
  })(),
);

/** Wide angular hat, hooded leather coif, pale beaked mask with green lenses. */
function beakedHead(k: K, glowParent: THREE.Object3D): number {
  const r = HR;
  k.ball(r * 1.0, 0, HY, 0, C.hood, 1, 1.08, 1.05, 10);
  k.add(latheArc([[r * 1.55, -r * 1.5], [r * 1.3, -r * 0.95], [r * 1.05, -r * 0.35]], 10, 0, Math.PI * 2, 0.08, 6), C.hood, 0, HY, 0, 0, 0, 0, 1, 1, 1.0);
  // Mask face and the long curved beak with a seam, breathing holes and a bone tip
  k.add(new THREE.SphereGeometry(r * 0.98, 8, 5, Math.PI / 2 - 1.0, 2.0, Math.PI * 0.25, Math.PI * 0.55), C.beak, 0, HY - r * 0.04, r * 0.1, 0, 0, 0, 1, 1.06, 1);
  k.curve(
    [
      [0, HY - r * 0.2, r * 0.7],
      [0, HY - r * 0.42, r * 1.45],
      [0, HY - r * 0.85, r * 2.2],
      [0, HY - r * 1.45, r * 2.65],
    ],
    r * 0.42,
    r * 0.03,
    C.beak,
    6,
  );
  k.curve(
    [
      [0, HY - r * 0.02, r * 0.95],
      [0, HY - r * 0.15, r * 1.6],
      [0, HY - r * 0.6, r * 2.3],
      [0, HY - r * 1.3, r * 2.7],
    ],
    r * 0.05,
    r * 0.02,
    C.beakHi,
    3,
  );
  for (const sx of [-1, 1]) k.add(new THREE.OctahedronGeometry(r * 0.05), SHADOW, sx * r * 0.12, HY - r * 0.42, r * 1.62);
  hoop(k, r * 0.32, r * 0.05, 0, HY - r * 0.36, r * 1.18, PAL.leatherDark, 0.4, 0, 0, 8);
  // Round glass lenses in brass rims
  for (const sx of [-1, 1]) k.add(new THREE.CylinderGeometry(r * 0.24, r * 0.27, r * 0.2, 10), BRASS, sx * r * 0.4, HY + r * 0.12, r * 0.9, Math.PI / 2, 0, 0);
  glow(glowParent, C.glow, 3.5, [
    [new THREE.CircleGeometry(r * 0.18, 10), r * 0.4, HY + r * 0.12, r * 1.01],
    [new THREE.CircleGeometry(r * 0.18, 10), -r * 0.4, HY + r * 0.12, r * 1.01],
  ]);
  // Wide angular hat: octagonal brim drooping front and back, tall tapered crown, bone cord band
  const brim = new THREE.LatheGeometry(
    [
      [r * 2.45, -r * 0.1],
      [r * 2.2, r * 0.02],
      [r * 1.1, r * 0.08],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    8,
  );
  const p = brim.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const x = p.getX(i);
    // Droop where the brim reaches furthest forward and back
    p.setY(i, p.getY(i) - (Math.abs(z) / (r * 2.45)) ** 2 * r * 0.35 + (Math.abs(x) / (r * 2.45)) ** 2 * r * 0.1);
  }
  brim.computeVertexNormals();
  k.add(brim, C.hat, 0, HY + r * 0.62, 0, 0, Math.PI / 8, 0);
  k.lathe(
    [
      [r * 1.08, 0],
      [r * 1.02, r * 0.6],
      [r * 0.9, r * 1.05],
      [r * 0.55, r * 1.12],
      [0.001, r * 1.14],
    ],
    0,
    HY + r * 0.66,
    -r * 0.04,
    C.hat,
    8,
    1,
    1,
    -0.06,
    Math.PI / 8,
    0,
  );
  band(k, r * 1.08, r * 0.16, 0, HY + r * 0.8, -r * 0.04, C.bone, -0.06, Math.PI / 8, 0, 8);
  gouge(k, r * 1.2, HY + r * 0.72, r * 1.4, r * 0.5, 0, 0.8);
  return HY + r * 1.85;
}

/** Iron censer cage with green fire, hanging on a short chain (spins slowly). */
function censer(h: Hunter): void {
  const ck = h.kit(h.handR, 0, -0.02, 0.03);
  for (let i = 0; i < 4; i++) ck.k.add(new THREE.TorusGeometry(0.014, 0.004, 3, 6), C.iron, 0, -0.03 - i * 0.045, 0, 0, i * 1.57, 0);
  const sp = h.kit(ck.g, 0, -0.23, 0);
  const k = sp.k;
  k.add(new THREE.ConeGeometry(0.075, 0.08, 6), C.ironDark, 0, 0.0, 0);
  k.add(new THREE.CylinderGeometry(0.05, 0.065, 0.03, 6), C.iron, 0, -0.18, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    rod(k, [Math.cos(a) * 0.06, -0.04, Math.sin(a) * 0.06], [Math.cos(a) * 0.07, -0.17, Math.sin(a) * 0.07], 0.006, C.ironDark, 3);
  }
  band(k, 0.074, 0.018, 0, -0.1, 0, C.iron, 0, 0, 0, 6);
  k.add(new THREE.ConeGeometry(0.02, 0.07, 4), C.iron, 0, -0.23, 0, Math.PI, 0, 0);
  glow(sp.g, C.glow, 5, [[new THREE.IcosahedronGeometry(0.042, 0), 0, -0.1, 0]]);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: C.glow, transparent: true, opacity: 0.16, depthWrite: false }));
  halo.position.set(0, -0.1, 0);
  sp.g.add(halo);
  h.rig.spinners.push(sp.g);
}

function surgeon(): Rig {
  const h = new Hunter({ attack: 'throw', bulk: 0.95, tall: 1.03, neckZ: 0.03 });
  const b = h.b;
  const t = h.torso;
  torsoBase(t, b, { shirt: C.coat, trousers: C.trousers, neck: C.hood });
  shell(t, b, C.coat, 0.96, 1.6, 0.025);
  // Buttoned double front, belt, bandolier of vials
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) t.add(new THREE.OctahedronGeometry(0.012), BRASS, sx * 0.07, 1.48 - i * 0.09, chestZ(b, 1.48 - i * 0.09, 0.035));
  shell(t, b, PAL.leatherDark, 1.05, 1.12, 0.04);
  cbox(t, 0.06, 0.06, 0.02, 0, 1.085, chestZ(b, 1.09, 0.05), C.iron);
  const vp: V[] = [
    [-0.18, 1.56, 0.06],
    [-0.06, 1.42, chestZ(b, 1.42, 0.05)],
    [0.08, 1.24, chestZ(b, 1.24, 0.05)],
    [0.18, 1.1, 0.07],
  ];
  strapPath(t, vp, 0.045, 0.012, PAL.leatherDark);
  const vials: GlowPart[] = [];
  for (let i = 0; i < 4; i++) {
    const f = 0.18 + i * 0.21;
    const x = -0.15 + f * 0.31;
    const y = 1.52 - f * 0.4;
    const z = chestZ(b, y, 0.075);
    t.add(new THREE.CylinderGeometry(0.016, 0.016, 0.07, 6), C.glass, x, y, z, 0, 0, -0.6);
    t.add(new THREE.CylinderGeometry(0.01, 0.01, 0.02, 5), PAL.boneDark, x + Math.sin(0.6) * 0.045, y + Math.cos(0.6) * 0.045, z, 0, 0, -0.6);
    vials.push([new THREE.CylinderGeometry(0.011, 0.011, 0.04, 5), x - Math.sin(0.6) * 0.008, y - Math.cos(0.6) * 0.008, z + 0.006, 0, 0, -0.6]);
  }
  // Surgeon's satchel and hanging tools at the left hip
  cbox(t, 0.13, 0.15, 0.08, -0.22, 0.98, 0.04, C.cape, 0, -0.5, 0);
  cbox(t, 0.13, 0.05, 0.085, -0.22, 1.05, 0.045, shade(C.cape, -0.25), 0, -0.5, 0);
  rod(t, [-0.15, 1.05, 0.12], [-0.13, 0.86, 0.15], 0.006, C.saw, 4);
  rod(t, [-0.12, 1.05, 0.13], [-0.09, 0.9, 0.16], 0.005, C.bone, 4);
  // Glass flask at the right hip
  t.add(new THREE.SphereGeometry(0.045, 6, 5), C.glass, 0.21, 0.98, 0.06);
  vials.push([new THREE.SphereGeometry(0.03, 6, 4), 0.21, 0.975, 0.07]);
  glow(h.frame, C.glow, 2, vials);
  // Shoulder cape of waxed leather and a high collar
  mantle(t, b, C.cape, { bottom: 1.24, width: 0.36, tatter: 0.08, seed: 17, seg: 10 });
  t.add(latheArc([[0.16, 1.56], [0.15, 1.68], [0.17, 1.78]], 10, 0.8, Math.PI * 2 - 1.6), shade(C.cape, -0.15), 0, 0, -0.01, 0, 0, 0, 1, 1, 0.85);

  const hk = h.head;
  const top = beakedHead(hk, h.headGroup);

  // Long coat to the ankles in two halves that part with every stride
  for (const s of [-1, 1]) {
    const k = h.leg(s);
    const l = legBase(k, b, { trousers: C.trousers, boot: C.boot, bend: 0.05, cuff: null });
    skirtHalf(
      k,
      s,
      h.legX,
      C.coat,
      [
        [0.31, -0.9],
        [0.27, -0.55],
        [0.2, -0.08],
        [0.168, 0.08],
      ],
      { frontGap: 0.32, backGap: 0.05, tatter: 0.1, seed: 41, seg: 8 },
    );
    band(k, 0.062, 0.03, ...onShin(l, 0.55), PAL.leatherDark, l.bend);
    k.add(new THREE.OctahedronGeometry(0.014), BRASS, s * 0.05, onShin(l, 0.55)[1], onShin(l, 0.55)[2] + 0.04);
    cbox(k, 0.06, 0.08, 0.01, s * 0.05, -0.62, 0.21, shade(C.coat, -0.3), 0.3, s * 0.5, 0.4);
  }

  // Arms: coat sleeves with turned-back cuffs, long leather gloves
  for (const s of [-1, 1]) {
    const k = h.arm(s);
    armBase(k, s, b, { sleeve: C.coat, glove: C.glove, forearm: C.coat, cuff: 1.25 });
    k.add(prismGeo(0.06, 0.08, 8, 1.15), shade(C.coat, 0.12), 0, -0.52, 0);
  }

  censer(h);
  // Bone saw in the left hand, carried point-down
  const sk = h.kit(h.handL, 0, 0, 0.01, 2.45);
  sk.k.add(prismGeo(0.02, 0.15, 6, 0.85), C.bone, 0, 0.0, 0);
  sk.k.add(new THREE.OctahedronGeometry(0.026), C.bone, 0, -0.09, 0);
  sk.k.add(frustumGeo(0.08, 0.03, 0.035, 1), C.iron, 0, 0.085, 0);
  sk.k.plate(SAW, 0.008, 0.003, 0, 0.1, 0, C.saw, 0, Math.PI / 2, 0);
  sk.k.add(frustumGeo(0.01, 0.2, 0.012, 1), shade(PAL.blood, -0.2), 0, 0.25, 0.012);
  return h.finish(top);
}

export const plagueSurgeon: UnitDef = {
  build: surgeon,
  portrait: {
    pose: (rig) => {
      rig.armR!.rotation.set(-0.55, 0, 0.35);
      rig.armL!.rotation.set(-0.5, 0, -0.25);
      rig.body.rotation.y = 0.15;
      rig.legs[0]!.rotation.x = 0.2;
      rig.legs[1]!.rotation.x = -0.15;
      rig.neck!.rotation.set(0.2, -0.2, 0);
    },
    from: 0.38,
    to: 1.02,
    yaw: 0.45,
    faction: 'grave',
  },
};
