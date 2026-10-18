import * as THREE from 'three';
import { FACTIONS, PAL } from '../../../art/darkArt';
import { K, shade, type V } from '../../../base3d/sculpt';
import type { Rig } from '../../rig';
import { cbox, metal, prismGeo } from '../parts';
import {
  armBase,
  band,
  crescentPauldron,
  cuirass,
  GILT,
  glow,
  type GlowPart,
  gouge,
  hoop,
  HR,
  Hunter,
  HY,
  latheArc,
  legBase,
  line,
  mix,
  ONYX,
  ONYX_DK,
  ONYX_HI,
  onSurf,
  onTorso,
  plateForearm,
  plateLeg,
  rod,
  shell,
  SHADOW,
  skirtHalf,
  strapPath,
  surfGeo,
  torsoBase,
  visorSurf,
} from './_hunters';
import type { UnitDef } from './types';

/**
 * Blackpowder Sapper (card: powder_bombardier, common). A stocky, soot-blackened bomb-thrower in
 * scorched black plate over burnt leather: a spiked iron kettle helm over a gas mask whose round
 * lenses burn with fire, twin brass filters, spiked pauldrons, a bandolier of iron bombs seamed with
 * glowing cracks, a powder keg on the back, and a lit bomb in the throwing hand.
 */
const GLOW = FACTIONS.ash.glow;
const BRASS = metal(shade(PAL.gold, -0.2), 0.82);
const C = {
  coat: shade(PAL.leatherDark, 0.12),
  apron: mix(PAL.leatherDark, PAL.ash, 0.25),
  soot: PAL.black,
  padding: PAL.charcoal,
  trousers: PAL.charcoal,
  boot: PAL.leatherDark,
  bomb: metal('#1a1a1e', 0.7),
  wood: shade(PAL.wood, -0.05),
  rope: PAL.boneDark,
};

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _z = new THREE.Vector3(0, 0, 1);
const _d = new THREE.Vector3();

/** Glowing seams cracked into a bomb's shell (tangent slivers on the sphere). */
function cracks(c: V, r: number, seed: number, n = 3): GlowPart[] {
  const out: GlowPart[] = [];
  for (let i = 0; i < n; i++) {
    const a = seed * 2.3 + i * 2.1;
    const el = Math.sin(seed + i * 1.7) * 0.6;
    _d.set(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el)).normalize();
    _q.setFromUnitVectors(_z, _d);
    _e.setFromQuaternion(_q, 'XYZ');
    const g = new THREE.BoxGeometry(r * 0.09, r * (0.9 + (i % 2) * 0.4), 0.003).rotateZ(a * 0.7);
    out.push([g, c[0] + _d.x * r * 1.01, c[1] + _d.y * r * 1.01, c[2] + _d.z * r * 1.01, _e.x, _e.y, _e.z]);
  }
  return out;
}

/** Round iron bomb with a riveted band and a fuse socket (centre at c). */
function bomb(k: K, c: V, r: number, fuse = true): void {
  k.ball(r, c[0], c[1], c[2], C.bomb, 1, 1, 1, 10);
  band(k, r * 1.02, r * 0.25, c[0], c[1], c[2], ONYX_HI, 0.4, 0, 0.2, 10);
  k.add(prismGeo(r * 0.32, r * 0.4, 6), BRASS, c[0], c[1] + r * 1.05, c[2]);
  if (fuse) rod(k, [c[0], c[1] + r * 1.2, c[2]], [c[0] + r * 0.3, c[1] + r * 1.7, c[2] + r * 0.1], r * 0.08, C.rope, 3);
}

/** Gas mask with burning lenses and twin filters, under a spiked iron kettle helm. */
function gasMask(k: K, glowParent: THREE.Object3D): number {
  const r = HR;
  // Tight leather hood with a neck drape
  k.ball(r * 1.04, 0, HY + r * 0.02, -r * 0.02, C.coat, 1, 1.08, 1.05, 10);
  k.add(latheArc([[r * 1.5, -r * 1.45], [r * 1.25, -r * 0.9], [r * 1.0, -r * 0.4]], 12, 0, Math.PI * 2, 0.06, 2), shade(C.coat, -0.2), 0, HY, 0, 0, 0, 0, 1, 1, 1.0);
  // Mask face: blackened leather with a riveted seam
  k.add(new THREE.SphereGeometry(r * 1.0, 10, 5, Math.PI / 2 - 1.0, 2.0, Math.PI * 0.32, Math.PI * 0.5), C.soot, 0, HY - r * 0.05, r * 0.12, 0, 0, 0, 1, 1.05, 1);
  // Round lenses in brass rims, fire behind the glass
  const lens: GlowPart[] = [];
  for (const sx of [-1, 1]) {
    k.add(new THREE.CylinderGeometry(r * 0.27, r * 0.3, r * 0.22, 12), BRASS, sx * r * 0.38, HY + r * 0.1, r * 0.98, Math.PI / 2, 0, 0);
    k.add(new THREE.CircleGeometry(r * 0.21, 12), SHADOW, sx * r * 0.38, HY + r * 0.1, r * 1.1);
    lens.push([new THREE.CircleGeometry(r * 0.17, 10), sx * r * 0.38, HY + r * 0.1, r * 1.11]);
  }
  glow(glowParent, GLOW, 5.5, lens);
  // Respirator snout and two filter canisters angled down and out
  rod(k, [0, HY - r * 0.35, r * 0.85], [0, HY - r * 0.62, r * 1.4], r * 0.3, ONYX, 8, r * 0.22);
  k.add(new THREE.CylinderGeometry(r * 0.24, r * 0.24, r * 0.1, 8), BRASS, 0, HY - r * 0.64, r * 1.43, Math.PI / 2 + 0.45, 0, 0);
  for (const sx of [-1, 1]) {
    const a: V = [sx * r * 0.25, HY - r * 0.55, r * 1.1];
    const b: V = [sx * r * 0.85, HY - r * 0.95, r * 0.95];
    rod(k, a, b, r * 0.2, ONYX_HI, 8, r * 0.24);
    k.add(new THREE.CylinderGeometry(r * 0.26, r * 0.26, r * 0.08, 8), BRASS, ...b, 0, 0, sx * 0.9);
  }
  // Spiked kettle helm: pointed iron crown with a rolled, gold-lined brim and a comb
  const f = visorSurf({ size: 1.12, keel: 0, peak: 0.7, chin: 0, cheek: 0.04, z: -0.01 });
  k.add(surfGeo(f, 16, 5, 0, Math.PI * 2, 0.5, 1), ONYX, 0, 0, 0);
  const rim = onSurf(f, 0, 0.5);
  k.lathe([[r * 1.62, rim[1] - 0.025], [r * 1.5, rim[1] - 0.005], [r * 1.18, rim[1] + 0.012]], 0, 0, -0.01, ONYX_HI, 16, 1, 1.04, 0.08, 0, 0);
  hoop(k, r * 1.6, 0.005, 0, rim[1] - 0.022, -0.005, GILT, Math.PI / 2 + 0.08, 0, 0, 16);
  const top = onSurf(f, 0, 1);
  k.add(new THREE.ConeGeometry(0.018, 0.12, 5), ONYX_HI, top[0], top[1] + 0.04, top[2], -0.35, 0, 0);
  line(k, [onSurf(f, 0, 0.55, 0.006), onSurf(f, 0, 0.8, 0.006), onSurf(f, 0, 0.98, 0.004)], 0.007, ONYX_HI);
  gouge(k, r * 0.3, HY + r * 0.85, r * 0.85, r * 0.4, 0.5, 0.0);
  return top[1] + 0.1;
}

/** Wooden powder keg strapped to the back, with a coil of smouldering slow-match. */
function keg(k: K, b: number, g: THREE.Object3D): void {
  const z = -0.34;
  k.lathe(
    [
      [0.14, 1.02],
      [0.175, 1.16],
      [0.185, 1.3],
      [0.175, 1.44],
      [0.14, 1.58],
    ],
    0,
    0,
    z,
    C.wood,
    12,
  );
  k.add(new THREE.CircleGeometry(0.14, 10), shade(C.wood, -0.3), 0, 1.58, z, -Math.PI / 2, 0, 0);
  for (const y of [1.08, 1.3, 1.52]) band(k, y === 1.3 ? 0.19 : 0.165, 0.035, 0, y, z, ONYX, 0, 0, 0, 12);
  k.add(new THREE.TorusGeometry(0.1, 0.02, 4, 12), C.rope, 0.0, 1.6, z, Math.PI / 2, 0, 0);
  // A soot-black skull brand on the keg
  cbox(k, 0.09, 0.07, 0.01, 0, 1.3, z - 0.186, C.soot);
  glow(g, GLOW, 4, [[new THREE.OctahedronGeometry(0.015), 0.1, 1.61, z]]);
  for (const sx of [-1, 1]) strapPath(k, [[sx * 0.13, 1.58, -0.12], [sx * 0.17, 1.6, 0.0], onTorso(b, sx * 0.14, 1.52, 0.05)], 0.045, 0.012, PAL.leatherDark);
  band(k, 0.24, 0.05, 0, 1.22, -0.05, PAL.leatherDark, 0, 0, 0, 12);
  cbox(k, 0.1, 0.14, 0.08, -0.2, 1.02, -0.12, C.coat, 0, -0.4, 0);
}

function sapperRig(): Rig {
  const h = new Hunter({ attack: 'throw', bulk: 1.12, neckZ: 0.02 });
  const b = h.b;
  const t = h.torso;
  torsoBase(t, b, { shirt: C.padding, trousers: C.trousers, neck: C.coat });
  shell(t, b, C.coat, 0.96, 1.6, 0.025, { seg: 14 });
  // Scorched black breastplate, soot smears and burns
  const { grow } = cuirass(t, b, { y0: 1.3, y1: 1.6, lames: 2, chevrons: 0, grow: 0.042 });
  for (const [x, y, w, rz] of [[0.08, 1.46, 0.1, 0.4], [-0.07, 1.38, 0.12, -0.2]] as const) {
    const p = onTorso(b, x, y, grow + 0.004);
    cbox(t, w, w * 0.5, 0.008, p[0], p[1], p[2], C.soot, 0, x * 2, rz);
  }
  gouge(t, 0.05, 1.42, onTorso(b, 0.05, 1.42, grow + 0.005)[2], 0.1, 0.7);
  // Bandolier of cracked bombs across the chest
  const bp: V[] = [[0.2, 1.56, 0.07], onTorso(b, 0.07, 1.44, grow + 0.012), onTorso(b, -0.08, 1.27, grow + 0.01), [-0.21, 1.1, 0.08]];
  strapPath(t, bp, 0.05, 0.014, PAL.leatherDark);
  const cr: GlowPart[] = [];
  for (let i = 0; i < 3; i++) {
    const x = 0.12 - i * 0.11;
    const y = 1.48 - i * 0.12;
    const c: V = [x, y, onTorso(b, x, y, grow + 0.055)[2]];
    bomb(t, c, 0.048, false);
    cr.push(...cracks(c, 0.048, i + 1, 2));
  }
  // Belt with hanging bombs and pouches
  shell(t, b, PAL.leatherDark, 1.04, 1.11, 0.044, { seg: 14 });
  cbox(t, 0.07, 0.07, 0.02, 0, 1.075, onTorso(b, 0, 1.08, 0.055)[2], BRASS);
  bomb(t, [0.22, 0.96, 0.08], 0.055, false);
  cr.push(...cracks([0.22, 0.96, 0.08], 0.055, 7, 2));
  bomb(t, [0.26, 0.98, -0.04], 0.05, false);
  cbox(t, 0.1, 0.11, 0.07, -0.2, 1.0, 0.07, C.coat, 0, -0.5, 0);
  glow(h.frame, GLOW, 4, cr);
  keg(t, b, h.frame);

  const top = gasMask(h.head, h.headGroup);

  // Legs: scorched apron flaps (front) and coat tails swing with the stride; plate knees and greaves
  for (const s of [-1, 1]) {
    const k = h.leg(s);
    const l = legBase(k, b, { trousers: C.trousers, boot: C.boot, bend: 0.08, cuff: shade(C.boot, 0.15) });
    skirtHalf(
      k,
      s,
      h.legX,
      C.apron,
      [
        [0.24, -0.58],
        [0.215, -0.3],
        [0.19, -0.02],
        [0.18, 0.06],
      ],
      { frontGap: 0.05, backGap: Math.PI - 1.05, tatter: 0.16, seed: 31, seg: 5 },
    );
    skirtHalf(
      k,
      s,
      h.legX,
      C.coat,
      [
        [0.25, -0.44],
        [0.22, -0.2],
        [0.19, 0.0],
        [0.175, 0.07],
      ],
      { frontGap: 1.15, backGap: 0.1, tatter: 0.12, seed: 33, seg: 6 },
    );
    plateLeg(k, l, { thigh: false, spike: 0.05 });
    cbox(k, 0.06, 0.05, 0.01, s * 0.02, -0.3, 0.1, C.soot, -0.1, 0, 0.6);
  }

  // Arms: spiked pauldrons, heavy black gauntlets
  for (const s of [-1, 1]) {
    const k = h.arm(s);
    armBase(k, s, b, { sleeve: C.coat, glove: ONYX_DK, forearm: C.coat, cuff: 1.5 });
    crescentPauldron(k, s, { r: 0.155, lames: 3, horn: 0, spikes: 4 });
    plateForearm(k, s, { spike: 0.05 });
  }

  // Lit bomb in the throwing hand, a smouldering slow-match baton in the other
  const bk = h.kit(h.handR, 0, -0.07, 0.04);
  bomb(bk.k, [0, -0.03, 0], 0.1);
  glow(bk.g, GLOW, 6, [...cracks([0, -0.03, 0], 0.1, 3, 3), [new THREE.OctahedronGeometry(0.024), 0.03, 0.14, 0.01], [new THREE.OctahedronGeometry(0.013), 0.05, 0.17, 0.0]]);
  const mk = h.kit(h.handL, 0, 0, 0.02, 1.0);
  mk.k.add(prismGeo(0.016, 0.34, 5), C.wood, 0, 0.08, 0);
  for (let i = 0; i < 3; i++) band(mk.k, 0.022, 0.02, 0, 0.12 + i * 0.04, 0, C.rope, 0, 0, 0, 5);
  mk.k.add(new THREE.ConeGeometry(0.02, 0.05, 5), C.soot, 0, 0.27, 0);
  glow(mk.g, GLOW, 5, [[new THREE.OctahedronGeometry(0.016), 0, 0.3, 0]]);
  return h.finish(top);
}

export const sapper: UnitDef = {
  build: sapperRig,
  portrait: {
    pose: (rig) => {
      rig.armR!.rotation.set(-2.55, 0, 0.35);
      rig.armL!.rotation.set(-0.85, 0, -0.35);
      rig.body.rotation.set(0.04, -0.25, 0);
      rig.legs[0]!.rotation.x = 0.3;
      rig.legs[1]!.rotation.x = -0.25;
      rig.neck!.rotation.set(0.0, 0.18, 0);
    },
    from: 0.3,
    to: 1.0,
    yaw: 0.5,
    faction: 'ash',
  },
};
