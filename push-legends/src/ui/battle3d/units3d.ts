import * as THREE from 'three';
import { Kit } from '../base3d/kit';
import { K, shade, shapeFrom, star } from '../base3d/sculpt';
import { glowMaterial, toonMaterial } from '../base3d/style';

/**
 * Detailed stylised battle models built in code (no external assets). Chibi proportions, a wide
 * shape vocabulary (lathed helmets and flasks, bevelled blades and shields, curved tapered horns,
 * hair locks and bows, folded cloth) and cel shading with outlines added by the scene.
 * Every model is a rig of pivots (legs, arms, wings, cape) for the battle animations.
 * Models face +z with their feet at y = 0; a soldier is about 2.3 units tall.
 */
export interface Rig {
  root: THREE.Group;
  /** Everything visible; used for bobbing, squash and hit knockback. */
  body: THREE.Group;
  legs: THREE.Object3D[];
  armR: THREE.Object3D | null;
  armL: THREE.Object3D | null;
  wings: THREE.Object3D[];
  cape: THREE.Object3D | null;
  /** Parts that spin or bob continuously (orbiting shards, floating orbs). */
  spinners: THREE.Object3D[];
  /** Top of the model in local units (before root scale). */
  height: number;
  material: THREE.MeshToonMaterial;
  kind: 'biped' | 'quad' | 'flyer' | 'float';
  /** Ranged style used for the attack animation. */
  attack: 'melee' | 'bow' | 'cast' | 'throw';
}

function pivot(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function rigMaterial(): THREE.MeshToonMaterial {
  const m = toonMaterial(0.6);
  // Lathed brims, cloth and wing membranes are open surfaces
  m.side = THREE.DoubleSide;
  return m;
}

function newRig(kind: Rig['kind'], attack: Rig['attack']): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  return { root, body, legs: [], armR: null, armL: null, wings: [], cape: null, spinners: [], height: 2.3, material: rigMaterial(), kind, attack };
}

function addMesh(rig: Rig, parent: THREE.Object3D, k: Kit): THREE.Mesh {
  const m = k.build(true, rig.material);
  parent.add(m);
  return m;
}

function addGlow(parent: THREE.Object3D, geo: THREE.BufferGeometry, hex: string, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, glowMaterial(hex));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const STEEL = '#d3dae3';
const STEEL_DARK = '#8a95a3';
const GOLD = '#f5c542';
const GOLD_DARK = '#c99a1e';
const LEATHER = '#6b4626';
const LEATHER_DARK = '#4a2f18';
const BOOT = '#4f3422';
const DARK = '#1c1428';

// --- Faces ---------------------------------------------------------------------------------------

export type Mood = 'brave' | 'angry' | 'happy' | 'calm' | 'sly';

interface FaceSpec {
  skin: string;
  eye?: string;
  mood?: Mood;
  brow?: string;
  mustache?: string;
  beard?: string;
  eyeGlow?: string;
  hidden?: boolean;
  scar?: boolean;
}

/** Big expressive cartoon face on a head of radius r centred at (0, hy, 0). */
function face(k: K, rig: Rig, f: FaceSpec, hy: number, r: number): void {
  if (f.hidden) return;
  const z = r * 0.84;
  const ex = r * 0.37;
  const ey = hy + r * 0.08;
  const mood = f.mood ?? 'brave';
  if (f.eyeGlow) {
    for (const s of [-1, 1]) addGlow(rig.body, new THREE.SphereGeometry(r * 0.15, 10, 8), f.eyeGlow, s * ex, ey, z + r * 0.06).scale.set(1.1, 0.65, 0.6);
  } else {
    for (const s of [-1, 1]) {
      k.ball(r * 0.24, s * ex, ey, z - r * 0.03, '#ffffff', 0.82, 1.05, 0.55);
      k.ball(r * 0.15, s * ex - s * 0.008, ey - r * 0.02, z + r * 0.08, f.eye ?? '#3b6fb6', 1, 1, 0.5);
      k.ball(r * 0.085, s * ex - s * 0.008, ey - r * 0.02, z + r * 0.13, '#120a1c', 1, 1, 0.5);
      k.ball(r * 0.05, s * ex - r * 0.06, ey + r * 0.07, z + r * 0.17, '#ffffff', 1, 1, 0.5);
      // Eyelids give attitude
      if (mood === 'angry' || mood === 'sly' || mood === 'calm') {
        const lid = mood === 'calm' ? 0.35 : 0.5;
        k.add(new THREE.SphereGeometry(r * 0.26, 12, 6, 0, Math.PI * 2, 0, Math.PI * lid), f.skin, s * ex, ey + r * 0.02, z - r * 0.04, mood === 'angry' ? 0.25 : 0, 0, mood === 'angry' ? -s * 0.35 : mood === 'sly' ? s * 0.15 : 0, 0.86, 1.05, 0.6);
      }
    }
  }
  const tilt = mood === 'angry' ? 0.5 : mood === 'brave' ? 0.25 : mood === 'sly' ? 0.12 : mood === 'happy' ? -0.22 : -0.05;
  for (const s of [-1, 1]) k.curve([[s * (ex + r * 0.17), ey + r * 0.3 + tilt * r * 0.2, z - r * 0.02], [s * ex, ey + r * 0.36, z + r * 0.04], [s * (ex - r * 0.17), ey + r * 0.3 - tilt * r * 0.25, z]], r * 0.06, r * 0.035, f.brow ?? '#3a2414', 6);
  // Nose
  k.ball(r * 0.13, 0, hy - r * 0.12, r * 0.95, shade(f.skin, -0.1), 1.05, 0.95, 0.85);
  k.ball(r * 0.05, -r * 0.05, hy - r * 0.08, r * 1.05, shade(f.skin, 0.25), 1, 1, 0.6);
  // Mouth
  const my = hy - r * 0.43;
  if (mood === 'happy' || mood === 'brave') {
    k.add(new THREE.SphereGeometry(r * 0.24, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#6b1a2a', 0, my + r * 0.07, z - r * 0.08, 0, 0, 0, 1.35, 0.85, 0.55);
    k.rbox(r * 0.46, r * 0.09, r * 0.06, 0.02, 0, my + r * 0.04, z + r * 0.03, '#ffffff');
    k.ball(r * 0.1, 0, my - r * 0.1, z - r * 0.02, '#ff7a8a', 1.4, 0.6, 0.4);
  } else if (mood === 'angry') {
    k.ball(r * 0.2, 0, my, z - r * 0.06, '#6b1a2a', 1.5, 0.45, 0.45);
    k.rbox(r * 0.42, r * 0.07, r * 0.06, 0.02, 0, my + r * 0.03, z + r * 0.02, '#ffffff');
    k.rbox(r * 0.42, r * 0.06, r * 0.06, 0.02, 0, my - r * 0.04, z + r * 0.02, '#ffffff');
  } else k.curve([[-r * 0.16, my + r * 0.04, z], [0, my - (mood === 'sly' ? 0 : r * 0.03), z + r * 0.04], [r * 0.18, my + (mood === 'sly' ? r * 0.08 : r * 0.04), z]], r * 0.035, r * 0.03, '#6b1a2a', 5);
  // Cheeks, ears are added by the body
  for (const s of [-1, 1]) k.ball(r * 0.13, s * r * 0.55, hy - r * 0.2, r * 0.72, '#ff9c8a', 1, 0.65, 0.4);
  if (f.mustache) for (const s of [-1, 1]) k.curve([[s * r * 0.04, hy - r * 0.27, r * 1.0], [s * r * 0.25, hy - r * 0.33, r * 0.94], [s * r * 0.42, hy - r * 0.2, r * 0.8]], r * 0.11, r * 0.03, f.mustache, 7);
  if (f.beard) {
    k.ball(r * 0.6, 0, hy - r * 0.62, r * 0.36, f.beard, 1, 0.78, 0.8);
    k.spike(r * 0.3, r * 0.5, 0, hy - r * 1.05, r * 0.5, f.beard, 0.3, 0, 0);
  }
  if (f.scar) k.rbox(r * 0.04, r * 0.32, r * 0.03, 0.01, -ex, ey, z + r * 0.15, '#c96b5a', 0, 0, 0.3);
}

// --- Humanoids -----------------------------------------------------------------------------------

export type HeadKind = 'none' | 'helm' | 'fullhelm' | 'hood' | 'hat' | 'wizard' | 'hair' | 'long' | 'spiky' | 'horns' | 'skull' | 'cap' | 'goggles' | 'wolfhood' | 'bald';
export type Weapon = 'none' | 'sword' | 'goldsword' | 'bow' | 'staff' | 'bomb' | 'dagger' | 'axe' | 'hammer' | 'potion' | 'claws' | 'club';

export interface HumanSpec {
  body: string;
  legs: string;
  skin: string;
  head: HeadKind;
  headColor: string;
  weapon: Weapon;
  magic?: string;
  cape?: string;
  shield?: 'round' | 'tower' | 'kite' | null;
  shieldColor?: string;
  hair?: string;
  bulk?: number;
  robe?: boolean;
  crown?: boolean;
  eyeGlow?: string;
  eye?: string;
  mood?: Mood;
  mustache?: string;
  beard?: string;
  armor?: string;
  trim?: string;
  ears?: 'round' | 'pointy' | null;
  /** Cloth panel hanging from the belt. */
  tabard?: string;
  emblem?: string;
  scar?: boolean;
}

const HEAD_R = 0.47;

function hairLocks(k: K, color: string, hy: number, r: number, count: number, spread = 1): void {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const x = t * r * 1.5 * spread;
    k.curve(
      [
        [x * 0.6, hy + r * 0.95, r * 0.05],
        [x * 0.9, hy + r * 0.8, r * 0.7],
        [x * 1.15 + t * 0.1, hy + r * 0.48, r * 0.92],
      ],
      r * 0.2,
      r * 0.03,
      color,
      7,
    );
  }
}

function headGear(k: K, rig: Rig, spec: HumanSpec, hy: number): number {
  const r = HEAD_R;
  const c = spec.headColor;
  let top = hy + r;
  switch (spec.head) {
    case 'helm':
      k.lathe([[r * 1.12, 0], [r * 1.14, r * 0.12], [r * 1.06, r * 0.42], [r * 0.82, r * 0.82], [r * 0.4, r * 1.06], [0.001, r * 1.12]], 0, hy + r * 0.02, 0, c, 18);
      k.ring(r * 1.13, 0.045, 0, hy + r * 0.05, 0, shade(c, -0.22));
      k.plate(shapeFrom([[-0.06, 0], [0.06, 0], [0.04, -r * 0.55], [0, -r * 0.65], [-0.04, -r * 0.55]]), 0.03, 0.015, 0, hy + r * 0.12, r * 1.07, shade(c, -0.08));
      for (const s of [-1, 1]) k.rbox(0.18, r * 0.7, 0.08, 0.04, s * r * 0.98, hy - r * 0.25, r * 0.25, c, 0, s * 0.4, s * 0.12);
      k.curve([[0, hy + r * 1.12, -0.04], [0, hy + r * 1.38, -0.2], [0, hy + r * 1.3, -0.5]], 0.09, 0.03, spec.hair ?? '#e74c3c', 7);
      for (let i = 0; i < 6; i++) k.ball(0.03, Math.cos((i / 6) * 6.28) * r * 1.12, hy + r * 0.2, Math.sin((i / 6) * 6.28) * r * 1.12, GOLD);
      top = hy + r * 1.45;
      break;
    case 'fullhelm':
      k.lathe([[r * 0.95, -r * 0.85], [r * 1.12, -r * 0.5], [r * 1.14, 0], [r * 1.05, r * 0.5], [r * 0.7, r * 0.95], [0.001, r * 1.12]], 0, hy, 0, c, 18);
      k.rbox(r * 1.35, 0.09, 0.22, 0.04, 0, hy + r * 0.12, r * 0.98, DARK);
      for (let i = 0; i < 5; i++) k.rbox(0.035, r * 0.42, 0.06, 0.015, -0.16 + i * 0.08, hy - r * 0.32, r * 1.09, DARK);
      k.plate(shapeFrom([[0, 0], [r * 0.6, r * 0.45], [r * 0.9, r * 0.1], [r * 1.1, -r * 0.9], [0, -r * 0.3]]), 0.06, 0.02, 0, hy + r * 1.05, -r * 0.1, spec.hair ?? '#e74c3c', 0, Math.PI / 2, 0);
      k.ring(r * 1.12, 0.05, 0, hy - r * 0.62, 0, shade(c, -0.25));
      for (const s of [-1, 1]) k.ball(0.06, s * r * 1.1, hy + r * 0.1, 0, GOLD);
      top = hy + r * 1.6;
      break;
    case 'hood':
      k.lathe([[r * 1.15, -r * 0.9], [r * 1.25, -r * 0.3], [r * 1.18, r * 0.35], [r * 0.85, r * 0.95], [0.001, r * 1.2]], 0, hy, -0.06, c, 16);
      k.curve([[0, hy + r * 0.9, -r * 0.4], [0, hy + r * 1.05, -r * 0.9], [0, hy + r * 0.6, -r * 1.35]], r * 0.3, 0.01, c, 8);
      k.ring(r * 1.0, 0.07, 0, hy - r * 0.05, r * 0.55, shade(c, -0.28), 0, 0, 0);
      top = hy + r * 1.25;
      break;
    case 'hat':
      k.lathe([[r * 1.75, -0.02], [r * 1.7, 0.06], [r * 1.0, 0.05], [r * 0.85, 0.1]], 0, hy + r * 0.58, 0, c, 22);
      k.lathe([[r * 0.88, 0], [r * 0.86, r * 0.5], [r * 0.65, r * 0.8], [0.001, r * 0.85]], 0, hy + r * 0.62, 0, shade(c, 0.05), 18);
      k.tube(r * 0.9, r * 0.9, 0.09, 0, hy + r * 0.72, 0, '#c0392b', 0, 0, 0, 16);
      k.curve([[r * 0.7, hy + r * 0.8, 0], [r * 1.1, hy + r * 1.4, -0.1], [r * 1.3, hy + r * 1.75, -0.35]], 0.07, 0.01, '#e74c3c', 6);
      top = hy + r * 1.5;
      break;
    case 'wizard': {
      k.lathe([[r * 1.6, -0.02], [r * 1.55, 0.07], [r * 1.0, 0.06]], 0, hy + r * 0.55, 0, c, 22);
      k.curve([[0, hy + r * 0.6, 0], [0, hy + r * 1.4, -0.05], [0.12, hy + r * 2.1, -0.25], [0.35, hy + r * 2.35, -0.5]], r * 0.9, 0.02, c, 12);
      k.tube(r * 0.93, r * 0.96, 0.1, 0, hy + r * 0.66, 0, spec.trim ?? '#5dade2', 0, 0, 0, 16);
      k.plate(star(0.12, 0.05), 0.03, 0.01, 0, hy + r * 1.0, r * 0.75, GOLD, -0.35);
      top = hy + r * 2.3;
      break;
    }
    case 'hair':
      k.ball(r * 1.06, 0, hy + r * 0.2, -0.05, spec.hair ?? c, 1, 0.84, 1);
      hairLocks(k, spec.hair ?? c, hy, r, 5);
      for (const s of [-1, 1]) k.curve([[s * r * 0.85, hy + r * 0.3, 0], [s * r * 1.02, hy - r * 0.1, r * 0.15], [s * r * 0.9, hy - r * 0.4, r * 0.3]], r * 0.18, r * 0.04, spec.hair ?? c, 6);
      top = hy + r * 1.15;
      break;
    case 'long':
      k.ball(r * 1.07, 0, hy + r * 0.18, -0.06, spec.hair ?? c, 1, 0.86, 1);
      hairLocks(k, spec.hair ?? c, hy, r, 4, 0.8);
      for (let i = 0; i < 7; i++) {
        const a = -1.3 + (i / 6) * 2.6;
        k.curve([[Math.sin(a) * r * 0.9, hy + r * 0.3, -Math.cos(a) * r * 0.75], [Math.sin(a) * r * 1.05, hy - r * 0.6, -Math.cos(a) * r * 0.85], [Math.sin(a) * r * 1.0, hy - r * 1.5, -Math.cos(a) * r * 0.8 - 0.1]], r * 0.22, r * 0.05, spec.hair ?? c, 6);
      }
      top = hy + r * 1.1;
      break;
    case 'spiky':
      k.ball(r * 0.99, 0, hy + r * 0.25, -0.04, spec.hair ?? c, 1, 0.82, 1);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const lx = Math.cos(a) * r * 0.55;
        const lz = Math.sin(a) * r * 0.55 - 0.05;
        k.curve([[lx * 0.5, hy + r * 0.75, lz * 0.5], [lx, hy + r * 1.15, lz], [lx * 1.5, hy + r * 1.55, lz * 1.5 - 0.05]], r * 0.22, 0.01, spec.hair ?? c, 6);
      }
      hairLocks(k, spec.hair ?? c, hy, r, 3, 0.7);
      top = hy + r * 1.6;
      break;
    case 'horns':
      for (const s of [-1, 1]) k.curve([[s * r * 0.6, hy + r * 0.65, 0], [s * r * 1.15, hy + r * 1.0, -0.05], [s * r * 1.25, hy + r * 1.5, 0.15], [s * r * 1.0, hy + r * 1.85, 0.3]], 0.12, 0.01, c, 8);
      top = hy + r * 1.7;
      break;
    case 'skull':
      for (const s of [-1, 1]) k.ball(r * 0.24, s * r * 0.36, hy + r * 0.08, r * 0.78, DARK, 1, 1.05, 0.5);
      k.plate(shapeFrom([[0, 0.05], [0.05, -0.04], [-0.05, -0.04]]), 0.04, 0.01, 0, hy - r * 0.15, r * 0.97, DARK);
      for (let i = -2; i <= 2; i++) k.rbox(0.07, 0.11, 0.06, 0.02, i * 0.08, hy - r * 0.5, r * 0.86, '#f4efe2');
      k.rbox(0.04, 0.16, 0.03, 0.01, r * 0.3, hy + r * 0.6, r * 0.8, '#bdb5a1', 0, 0, 0.5);
      break;
    case 'cap':
      k.ball(r * 1.02, 0, hy + r * 0.12, -0.1, spec.hair ?? '#8a4b2a', 1.05, 0.95, 0.95);
      hairLocks(k, spec.hair ?? '#8a4b2a', hy - r * 0.15, r, 3, 0.9);
      k.lathe([[r * 1.05, 0], [r * 1.02, r * 0.35], [r * 0.6, r * 0.62], [0.001, r * 0.66]], 0, hy + r * 0.45, -0.02, '#ffffff', 16);
      k.plate(shapeFrom([[-0.03, 0.1], [0.03, 0.1], [0.03, 0.03], [0.1, 0.03], [0.1, -0.03], [0.03, -0.03], [0.03, -0.1], [-0.03, -0.1], [-0.03, -0.03], [-0.1, -0.03], [-0.1, 0.03], [-0.03, 0.03]]), 0.02, 0.005, 0, hy + r * 0.72, r * 0.92, '#e74c3c', -0.4);
      top = hy + r * 1.15;
      break;
    case 'goggles':
      k.ball(r * 1.0, 0, hy + r * 0.25, -0.05, spec.hair ?? '#3a2a1e', 1, 0.8, 1);
      hairLocks(k, spec.hair ?? '#3a2a1e', hy + r * 0.1, r, 4);
      k.ring(r * 1.03, 0.05, 0, hy + r * 0.42, 0, LEATHER_DARK);
      for (const s of [-1, 1]) {
        k.lathe([[0.16, 0], [0.17, 0.05], [0.14, 0.09]], s * 0.2, hy + r * 0.48, r * 0.84, '#6d7480', 14, 1, 1, Math.PI / 2);
        k.ball(0.13, s * 0.2, hy + r * 0.48, r * 0.92, '#ff9f43', 1, 1, 0.35);
        k.ball(0.04, s * 0.2 - 0.05, hy + r * 0.53, r * 0.98, '#fff3d6', 1, 1, 0.4);
      }
      top = hy + r * 1.1;
      break;
    case 'wolfhood':
      k.lathe([[r * 1.15, -r * 0.5], [r * 1.18, r * 0.2], [r * 0.95, r * 0.75], [0.001, r * 1.05]], 0, hy + r * 0.1, -0.04, c, 16);
      k.lathe([[r * 0.42, 0], [r * 0.35, r * 0.35], [r * 0.18, r * 0.75], [0.001, r * 0.8]], 0, hy + r * 0.62, r * 0.55, shade(c, 0.1), 12, 1, 1, Math.PI / 2);
      k.ball(0.07, 0, hy + r * 0.62, r * 1.38, DARK);
      for (let i = -2; i <= 2; i++) k.spike(0.03, 0.11, i * 0.07, hy + r * 0.4, r * 1.12, '#ffffff', Math.PI);
      for (const s of [-1, 1]) {
        k.plate(shapeFrom([[-0.12, 0], [0.12, 0], [0, 0.34]]), 0.06, 0.02, s * r * 0.6, hy + r * 0.95, -0.05, c, -0.2, 0, -s * 0.3);
        addGlow(rig.body, new THREE.SphereGeometry(0.04, 8, 6), '#ffd34d', s * 0.14, hy + r * 0.8, r * 1.06);
      }
      k.cloth(r * 1.6, 0.9, 0, hy - r * 0.2, -r * 0.95, c, 2, 0.06, 0.4);
      top = hy + r * 1.35;
      break;
    case 'bald':
      k.ball(r * 0.3, -r * 0.2, hy + r * 0.85, r * 0.2, shade(spec.skin, 0.2), 1.3, 0.35, 1);
      break;
    default:
      break;
  }
  if (spec.crown) {
    k.lathe([[r * 0.8, 0], [r * 0.82, 0.14], [r * 0.86, 0.17]], 0, top - 0.06, 0, GOLD, 18);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.spike(0.07, 0.24, Math.cos(a) * r * 0.78, top + 0.2, Math.sin(a) * r * 0.78, GOLD, 0, 0, 0, 5);
      k.ball(0.035, Math.cos(a) * r * 0.78, top + 0.33, Math.sin(a) * r * 0.78, GOLD_DARK);
    }
    k.gem(0.08, 0, top + 0.03, r * 0.85, '#e74c3c');
    top += 0.38;
  }
  return top;
}

function weaponMesh(rig: Rig, hand: THREE.Object3D, spec: HumanSpec): void {
  const w = pivot(hand, 0, 0, 0.02);
  w.rotation.x = 1.05;
  const k = new K();
  switch (spec.weapon) {
    case 'sword':
    case 'goldsword': {
      const blade = spec.weapon === 'goldsword' ? '#ffd34d' : '#e8eef5';
      k.tube(0.045, 0.05, 0.24, 0, -0.02, 0, LEATHER_DARK, 0, 0, 0, 8);
      for (let i = 0; i < 3; i++) k.ring(0.052, 0.012, 0, -0.1 + i * 0.08, 0, LEATHER, Math.PI / 2);
      k.gem(0.07, 0, -0.2, 0, spec.weapon === 'goldsword' ? '#e74c3c' : GOLD);
      k.curve([[-0.26, 0.2, 0], [-0.12, 0.12, 0], [0, 0.12, 0], [0.12, 0.12, 0], [0.26, 0.2, 0]], 0.045, 0.035, GOLD, 6);
      k.ball(0.07, 0, 0.13, 0, GOLD_DARK);
      k.plate(shapeFrom([[-0.065, 0], [0.065, 0], [0.06, 0.86], [0, 1.08], [-0.06, 0.86]]), 0.012, 0.022, 0, 0.16, 0, blade);
      k.rbox(0.025, 0.7, 0.05, 0.01, 0, 0.55, 0, shade(blade, -0.18));
      if (spec.weapon === 'goldsword') addGlow(w, new THREE.OctahedronGeometry(0.05), '#fff3b0', 0, 0.13, 0.07);
      break;
    }
    case 'dagger':
      k.tube(0.04, 0.045, 0.14, 0, -0.02, 0, LEATHER_DARK, 0, 0, 0, 8);
      k.curve([[-0.13, 0.1, 0], [0, 0.07, 0], [0.13, 0.1, 0]], 0.03, 0.025, GOLD, 5);
      k.plate(shapeFrom([[-0.045, 0], [0.045, 0], [0.05, 0.3], [0.0, 0.5], [-0.02, 0.32]]), 0.01, 0.015, 0, 0.09, 0, '#e8eef5');
      break;
    case 'axe':
      k.curve([[0, -0.25, 0], [0.02, 0.3, 0], [0, 0.85, 0]], 0.05, 0.045, '#8a5a2b', 7);
      for (let i = 0; i < 3; i++) k.ring(0.055, 0.012, 0, -0.15 + i * 0.07, 0, LEATHER_DARK, Math.PI / 2);
      k.plate(shapeFrom([[0, -0.14], [0.2, -0.2], [0.42, -0.36], [0.46, 0], [0.42, 0.36], [0.2, 0.2], [0, 0.14]]), 0.05, 0.025, 0.04, 0.68, 0, STEEL, 0, Math.PI / 2, 0);
      k.plate(shapeFrom([[0, -0.08], [-0.2, -0.04], [-0.24, 0], [-0.2, 0.04], [0, 0.08]]), 0.05, 0.02, -0.02, 0.68, 0, STEEL_DARK, 0, Math.PI / 2, 0);
      break;
    case 'hammer':
      k.curve([[0, -0.25, 0], [0, 0.3, 0], [0, 0.78, 0]], 0.055, 0.05, '#6b4626', 7);
      k.rbox(0.34, 0.32, 0.56, 0.08, 0, 0.85, 0, STEEL_DARK);
      for (const z of [-0.3, 0.3]) k.lathe([[0.17, 0], [0.19, 0.05], [0.15, 0.1]], 0, 0.85, z, STEEL, 14, 1, 1, Math.PI / 2 * (z > 0 ? 1 : -1));
      for (const z of [-0.18, 0.18]) k.rbox(0.36, 0.34, 0.05, 0.02, 0, 0.85, z, GOLD);
      k.spike(0.07, 0.25, 0, 1.12, 0, STEEL, 0, 0, 0, 6);
      break;
    case 'club':
      k.lathe([[0.05, 0], [0.06, 0.3], [0.13, 0.65], [0.17, 0.85], [0.12, 1.0], [0.001, 1.04]], 0, -0.2, 0, '#8a5a2b', 10);
      for (let i = 0; i < 6; i++) k.spike(0.04, 0.16, Math.cos(i * 1.05) * 0.16, 0.5 + (i % 3) * 0.1, Math.sin(i * 1.05) * 0.16, '#e8dcc0', Math.sin(i * 1.05) * 1.3, 0, -Math.cos(i * 1.05) * 1.3, 5);
      break;
    case 'staff': {
      k.curve([[0, -0.4, 0], [0.03, 0.2, 0.02], [-0.03, 0.8, -0.02], [0, 1.15, 0]], 0.05, 0.04, '#7a4a1f', 7);
      for (let i = 0; i < 2; i++) k.ring(0.055, 0.015, 0, 0.0 + i * 0.1, 0, GOLD, Math.PI / 2);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        k.curve([[Math.cos(a) * 0.05, 1.12, Math.sin(a) * 0.05], [Math.cos(a) * 0.2, 1.3, Math.sin(a) * 0.2], [Math.cos(a) * 0.08, 1.52, Math.sin(a) * 0.08]], 0.035, 0.01, GOLD, 5);
      }
      const orb = addGlow(w, new THREE.IcosahedronGeometry(0.13, 1), spec.magic ?? '#5dade2', 0, 1.32, 0);
      rig.spinners.push(orb);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), new THREE.MeshBasicMaterial({ color: spec.magic ?? '#5dade2', transparent: true, opacity: 0.3, depthWrite: false }));
      halo.position.copy(orb.position);
      w.add(halo);
      break;
    }
    case 'bomb':
      k.ball(0.23, 0, 0.12, 0, '#2b2b33');
      k.ring(0.232, 0.02, 0, 0.12, 0, STEEL_DARK, 0.4);
      k.ball(0.07, -0.09, 0.22, 0.15, '#7b7b88', 1, 1, 0.6);
      k.tube(0.07, 0.08, 0.08, 0, 0.36, 0, STEEL_DARK, 0, 0, 0, 10);
      k.curve([[0, 0.4, 0], [0.05, 0.5, 0.02], [0.12, 0.54, 0.05]], 0.018, 0.015, '#d9b77a', 5);
      addGlow(w, new THREE.OctahedronGeometry(0.07), '#ffd34d', 0.13, 0.56, 0.05);
      break;
    case 'potion':
      k.lathe([[0.001, 0], [0.12, 0.02], [0.17, 0.12], [0.15, 0.24], [0.06, 0.3], [0.05, 0.4]], 0, -0.05, 0, '#bde8c9', 14);
      addGlow(w, new THREE.SphereGeometry(0.12, 12, 8), '#7bd389', 0, 0.07, 0).scale.set(1.1, 0.8, 1.1);
      k.tube(0.06, 0.05, 0.08, 0, 0.38, 0, '#a0662e', 0, 0, 0, 8);
      break;
    case 'claws':
      for (const s of [-1, 0, 1]) k.curve([[s * 0.07, 0.0, 0.04], [s * 0.08, 0.2, 0.1], [s * 0.06, 0.35, 0.02]], 0.03, 0.005, '#f2ead0', 5);
      break;
    default:
      break;
  }
  if (!k.empty) addMesh(rig, w, k);
}

/** A detailed chibi humanoid rig, ≈ 2.3 units tall. */
export function humanoid(spec: HumanSpec, attack: Rig['attack'] = 'melee'): Rig {
  const rig = newRig('biped', attack);
  const b = spec.bulk ?? 1;
  const k = new K();
  const hipY = 0.52;
  const hy = 1.6;
  const skull = spec.head === 'skull';
  const skin = skull ? '#efe8d8' : spec.skin;
  // Robe or hips
  if (spec.robe) {
    k.lathe([[0.6 * b, 0], [0.58 * b, 0.12], [0.45 * b, 0.55], [0.34 * b, 0.95]], 0, 0, 0, spec.legs, 18);
    k.lathe([[0.62 * b, 0], [0.62 * b, 0.1], [0.6 * b, 0.12]], 0, 0, 0, spec.trim ?? shade(spec.legs, -0.2), 18);
    for (let i = 0; i < 6; i++) k.rbox(0.04, 0.7, 0.04, 0.02, Math.cos((i / 6) * 6.28 + 0.5) * 0.5 * b, 0.4, Math.sin((i / 6) * 6.28 + 0.5) * 0.5 * b, shade(spec.legs, -0.15), Math.sin((i / 6) * 6.28 + 0.5) * 0.2, 0, -Math.cos((i / 6) * 6.28 + 0.5) * 0.2);
  } else k.rbox(0.6 * b, 0.28, 0.42 * b, 0.11, 0, hipY + 0.06, 0, spec.legs);
  // V-shaped torso
  k.lathe([[0.27, 0], [0.3, 0.12], [0.37, 0.36], [0.38, 0.5], [0.3, 0.62], [0.13, 0.68]], 0, 0.62, 0, spec.body, 16, b, 0.74 * b);
  if (spec.armor) {
    k.lathe([[0.3, 0], [0.37, 0.18], [0.39, 0.33], [0.33, 0.44], [0.001, 0.47]], 0, 0.8, 0.07 * b, spec.armor, 14, b * 0.95, 0.42 * b, 0.12);
    k.ring(0.27 * b, 0.025, 0, 1.12, 0.12 * b, spec.trim ?? GOLD, Math.PI / 2 - 0.2, 0, 0);
    if (spec.emblem) k.plate(star(0.11, 0.05), 0.03, 0.01, 0, 0.98, 0.26 * b, spec.emblem);
    else k.gem(0.06, 0, 0.98, 0.27 * b, spec.trim ?? GOLD);
  } else if (spec.trim) {
    k.rbox(0.1, 0.48, 0.05, 0.02, 0, 0.92, 0.27 * b, spec.trim);
    for (let i = 0; i < 3; i++) k.ball(0.03, 0, 0.78 + i * 0.13, 0.3 * b, GOLD);
  }
  // Belt with buckle and pouch
  k.ring(0.33 * b, 0.05, 0, 0.66, 0, LEATHER, Math.PI / 2, 0, 0);
  k.rbox(0.15, 0.13, 0.05, 0.03, 0, 0.66, 0.31 * b, GOLD);
  k.rbox(0.08, 0.06, 0.06, 0.02, 0, 0.66, 0.32 * b, GOLD_DARK);
  k.rbox(0.16, 0.18, 0.1, 0.04, 0.3 * b, 0.6, 0.15 * b, LEATHER_DARK, 0, 0.8, 0);
  if (spec.tabard) {
    k.plate(shapeFrom([[-0.18, 0], [0.18, 0], [0.15, -0.42], [0, -0.5], [-0.15, -0.42]]), 0.02, 0.01, 0, 0.62, 0.3 * b, spec.tabard);
    k.plate(star(0.07, 0.03), 0.02, 0.008, 0, 0.4, 0.32 * b, spec.trim ?? GOLD);
  }
  // Collar, neck, head, ears
  k.ring(0.17, 0.05, 0, 1.28, 0, spec.trim ?? shade(spec.body, -0.2), Math.PI / 2);
  k.tube(0.13, 0.15, 0.16, 0, 1.33, 0, skin, 0, 0, 0, 10);
  k.ball(HEAD_R, 0, hy, 0, skin, 1.04, 0.98, 1);
  k.ball(HEAD_R * 0.62, 0, hy - HEAD_R * 0.45, HEAD_R * 0.15, skin, 1.15, 0.75, 1);
  if (spec.ears && !skull) {
    for (const s of [-1, 1]) {
      if (spec.ears === 'pointy') k.curve([[s * HEAD_R * 0.9, hy, 0], [s * HEAD_R * 1.3, hy + 0.1, -0.05], [s * HEAD_R * 1.6, hy + 0.3, -0.1]], 0.1, 0.01, skin, 6);
      else {
        k.ball(0.11, s * HEAD_R * 0.98, hy - 0.02, 0, skin, 0.55, 1, 0.85);
        k.ball(0.05, s * HEAD_R * 1.03, hy - 0.02, 0.02, shade(skin, -0.15), 0.5, 1, 0.8);
      }
    }
  }
  face(k, rig, { skin, eye: spec.eye, mood: spec.mood, mustache: spec.mustache, beard: spec.beard, eyeGlow: skull || spec.head === 'fullhelm' ? undefined : spec.eyeGlow, hidden: spec.head === 'fullhelm' || skull, scar: spec.scar }, hy, HEAD_R);
  if (skull && spec.eyeGlow) for (const s of [-1, 1]) addGlow(rig.body, new THREE.SphereGeometry(0.06, 8, 6), spec.eyeGlow, s * HEAD_R * 0.36, hy + HEAD_R * 0.08, HEAD_R * 0.9);
  if (spec.head === 'fullhelm' && spec.eyeGlow) for (const s of [-1, 1]) addGlow(rig.body, new THREE.SphereGeometry(0.05, 8, 6), spec.eyeGlow, s * HEAD_R * 0.32, hy + HEAD_R * 0.12, HEAD_R * 1.08).scale.set(1.6, 0.6, 0.6);
  rig.height = headGear(k, rig, spec, hy) + 0.05;
  addMesh(rig, rig.body, k);

  // Legs: tapered thigh, knee, shin, boot with cuff, toe cap and sole
  if (!spec.robe) {
    for (const s of [-1, 1]) {
      const leg = pivot(rig.body, s * 0.17 * b, hipY, 0);
      const lk = new K();
      const lb = Math.sqrt(b);
      lk.tube(0.13 * lb, 0.11 * lb, 0.22, 0, -0.1, 0, spec.legs, 0, 0, 0, 10);
      if (spec.armor) lk.dome(0.11 * lb, 0, -0.22, 0.07, spec.armor, 0.8, 1, 0.7);
      else lk.ball(0.1 * lb, 0, -0.22, 0.03, shade(spec.legs, -0.1));
      lk.lathe([[0.15 * lb, 0], [0.14 * lb, 0.16], [0.12 * lb, 0.22]], 0, -0.48, 0, BOOT, 12);
      lk.ring(0.13 * lb, 0.035, 0, -0.27, 0, LEATHER, Math.PI / 2);
      lk.rbox(0.25 * lb, 0.14, 0.32, 0.06, 0, -0.43, 0.08, BOOT);
      lk.ball(0.12 * lb, 0, -0.42, 0.22, shade(BOOT, 0.08), 1, 0.7, 0.9);
      lk.rbox(0.27 * lb, 0.04, 0.36, 0.02, 0, -0.49, 0.08, LEATHER_DARK);
      addMesh(rig, leg, lk);
      rig.legs.push(leg);
    }
  }

  // Arms: tapered sleeve, elbow, forearm, cuff, hand with thumb, shoulder pads
  for (const s of [-1, 1]) {
    const arm = pivot(rig.body, s * 0.43 * b, 1.18, 0);
    const ak = new K();
    ak.tube(0.11, 0.095, 0.22, 0, -0.12, 0, spec.body, 0, 0, 0, 10);
    ak.ball(0.095, 0, -0.24, 0, shade(spec.body, -0.08));
    ak.tube(0.09, 0.08, 0.16, 0, -0.33, 0, spec.armor ? STEEL_DARK : spec.body, 0, 0, 0, 10);
    ak.lathe([[0.085, 0], [0.11, 0.06], [0.1, 0.09]], 0, -0.4, 0, spec.armor ? spec.armor : LEATHER, 10);
    const handHex = spec.armor ? STEEL_DARK : skin;
    ak.ball(0.12, 0, -0.48, 0.02, handHex, 1, 0.95, 1.05);
    ak.pill(0.045, 0.06, s * -0.08, -0.45, 0.08, handHex, 0.5, 0, s * 0.6);
    if (spec.armor) {
      ak.dome(0.21, 0, -0.03, 0, spec.armor, 0.75, 1.15, 1.05);
      ak.dome(0.17, s * 0.04, -0.1, 0, shade(spec.armor, -0.1), 0.6, 1.2, 1.05);
      ak.ring(0.2, 0.025, 0, -0.03, 0, spec.trim ?? GOLD, Math.PI / 2);
      for (const z of [-0.12, 0.12]) ak.ball(0.03, s * 0.1, 0.06, z, GOLD);
    }
    addMesh(rig, arm, ak);
    const hand = pivot(arm, 0, -0.48, 0.02);
    if (s === 1) {
      rig.armR = arm;
      weaponMesh(rig, hand, spec);
    } else {
      rig.armL = arm;
      const sk = new K();
      if (spec.shield === 'round') {
        const sc = spec.shieldColor ?? '#9a6430';
        sk.lathe([[0.001, 0.07], [0.3, 0.05], [0.46, 0.0], [0.48, -0.02]], 0.06, 0, 0.2, sc, 20, 1, 1, Math.PI / 2);
        sk.ring(0.47, 0.045, 0.06, 0, 0.19, STEEL_DARK, 0, 0, 0);
        sk.dome(0.12, 0.06, 0, 0.26, GOLD, 0.7);
        for (let i = 0; i < 8; i++) sk.ball(0.025, 0.06 + Math.cos(i * 0.785) * 0.4, Math.sin(i * 0.785) * 0.4, 0.22, STEEL);
        for (let i = 0; i < 4; i++) sk.rbox(0.04, 0.3, 0.03, 0.01, 0.06 + Math.cos(i * 1.57) * 0.25, Math.sin(i * 1.57) * 0.25, 0.25, shade(sc, -0.22), 0, 0, i * 1.57);
      } else if (spec.shield === 'tower' || spec.shield === 'kite') {
        const h = spec.shield === 'tower' ? 1.25 : 0.95;
        const shape = shapeFrom([[-0.42, h * 0.5], [0.42, h * 0.5], [0.42, -h * 0.15], [0, -h * 0.55], [-0.42, -h * 0.15]]);
        sk.plate(shape, 0.06, 0.03, 0.05, -0.12, 0.2, GOLD, 0, 0, 0, 1.08);
        sk.plate(shape, 0.08, 0.03, 0.05, -0.12, 0.23, spec.shieldColor ?? '#1f618d');
        sk.plate(star(0.2, 0.09), 0.04, 0.015, 0.05, -0.05, 0.29, spec.emblem ?? GOLD);
      } else if (spec.weapon === 'bow') {
        sk.curve([[0, 0.62, 0.12], [0, 0.42, 0.3], [0, 0.0, 0.3], [0, -0.42, 0.3], [0, -0.62, 0.12]], 0.045, 0.045, '#8a5a2b', 7);
        for (const yy of [0.62, -0.62]) sk.ball(0.04, 0, yy, 0.12, GOLD);
        sk.pill(0.01, 1.2, 0, 0, 0.12, '#f2ead0');
        sk.rbox(0.07, 0.16, 0.08, 0.02, 0, 0, 0.3, LEATHER_DARK);
      } else if (spec.weapon === 'dagger') {
        sk.plate(shapeFrom([[-0.045, 0], [0.045, 0], [0.05, 0.3], [0, 0.48], [-0.02, 0.3]]), 0.01, 0.015, 0, 0.05, 0.3, '#e8eef5', 1.0, 0, 0);
      }
      if (!sk.empty) addMesh(rig, hand, sk);
    }
  }
  // Quiver for archers
  if (spec.weapon === 'bow') {
    const qk = new K();
    qk.lathe([[0.1, 0], [0.12, 0.05], [0.13, 0.6]], 0.15, 0.7, -0.32, LEATHER, 12, 1, 1, 0.3, 0, -0.3);
    for (let i = 0; i < 4; i++) {
      qk.pill(0.012, 0.25, 0.2 + i * 0.04, 1.32 + i * 0.02, -0.5 + i * 0.03, '#d9c39a', 0.3, 0, -0.3);
      qk.plate(shapeFrom([[0, 0], [0.05, 0.08], [0, 0.16], [-0.05, 0.08]]), 0.01, 0.005, 0.22 + i * 0.04, 1.45 + i * 0.02, -0.53 + i * 0.03, i % 2 ? '#e74c3c' : '#ffffff', 0, 0.6, -0.3);
    }
    addMesh(rig, rig.body, qk);
  }
  // Cape with folds
  if (spec.cape) {
    const cape = pivot(rig.body, 0, 1.25, -0.25 * b);
    const ck = new K();
    ck.cloth(0.78 * b, 1.05, 0, 0, -0.02, spec.cape, 3, 0.05, 0.35);
    ck.rbox(0.8 * b, 0.1, 0.12, 0.04, 0, 0, 0.02, spec.trim ?? GOLD);
    for (const s of [-1, 1]) ck.ball(0.06, s * 0.3 * b, 0, 0.1, GOLD);
    addMesh(rig, cape, ck);
    rig.cape = cape;
  }
  return rig;
}

// --- Beasts --------------------------------------------------------------------------------------

export interface QuadSpec {
  body: string;
  belly?: string;
  eye?: string;
  shell?: string;
  crystal?: string;
  mane?: string;
  rider?: HumanSpec;
  saddle?: string;
}

export function quadruped(spec: QuadSpec): Rig {
  const rig = newRig('quad', 'melee');
  const k = new K();
  k.pill(0.37, 0.8, 0, 0.74, 0, spec.body, Math.PI / 2);
  k.ball(0.42, 0, 0.82, 0.38, spec.body, 1, 1, 1);
  if (spec.belly) k.pill(0.27, 0.55, 0, 0.62, 0.05, spec.belly, Math.PI / 2);
  // Head: skull, muzzle, nose, jaw with teeth, cheek fur, ears, brows
  k.ball(0.35, 0, 1.08, 0.8, spec.body);
  k.lathe([[0.2, 0], [0.19, 0.15], [0.14, 0.3], [0.001, 0.34]], 0, 0.98, 0.95, spec.belly ?? shade(spec.body, 0.1), 12, 1, 1, Math.PI / 2);
  k.ball(0.07, 0, 1.03, 1.3, DARK, 1.3, 1, 1);
  k.rbox(0.26, 0.08, 0.26, 0.04, 0, 0.86, 1.1, shade(spec.body, -0.1));
  for (const x of [-0.08, 0.08]) k.spike(0.035, 0.12, x, 0.92, 1.2, '#ffffff', Math.PI);
  for (const s of [-1, 1]) {
    k.plate(shapeFrom([[-0.11, 0], [0.11, 0], [0.02, 0.34]]), 0.06, 0.02, s * 0.2, 1.36, 0.72, spec.body, -0.25, 0, -s * 0.25);
    k.plate(shapeFrom([[-0.06, 0.02], [0.06, 0.02], [0.01, 0.2]]), 0.03, 0.01, s * 0.2, 1.38, 0.76, '#e8b4a0', -0.25, 0, -s * 0.25);
    k.ball(0.09, s * 0.15, 1.14, 1.04, '#ffffff', 1, 1, 0.6);
    k.ball(0.05, s * 0.15, 1.14, 1.09, '#120a1c', 1, 1, 0.6);
    k.curve([[s * 0.24, 1.25, 1.0], [s * 0.15, 1.24, 1.06], [s * 0.06, 1.2, 1.06]], 0.03, 0.02, DARK, 5);
    k.spike(0.12, 0.25, s * 0.3, 0.98, 0.85, spec.mane ?? spec.body, 0, 0, s * 1.8);
  }
  if (spec.mane) for (let i = 0; i < 7; i++) k.spike(0.12, 0.34, 0, 1.18 - i * 0.03, 0.55 - i * 0.16, spec.mane, -0.8);
  k.curve([[0, 0.95, -0.75], [0, 1.25, -1.05], [0, 1.15, -1.45]], 0.13, 0.03, spec.mane ?? spec.body, 8);
  if (spec.shell) {
    k.lathe([[0.85, 0], [0.8, 0.25], [0.55, 0.55], [0.001, 0.68]], 0, 0.78, -0.05, spec.shell, 14, 0.85, 1.15);
    for (let i = 0; i < 6; i++) k.plate(shapeFrom([[0, 0.14], [0.13, 0.05], [0.09, -0.12], [-0.09, -0.12], [-0.13, 0.05]]), 0.04, 0.015, Math.cos(i * 1.05) * 0.38, 1.2, -0.05 + Math.sin(i * 1.05) * 0.5, shade(spec.shell, 0.18), -Math.PI / 2 + 0.3, 0, 0);
  }
  if (spec.crystal) for (let i = 0; i < 5; i++) k.gem(0.13 + (i % 2) * 0.05, ((i % 2) - 0.5) * 0.2, 1.35, -0.6 + i * 0.3, spec.crystal, 2.6);
  if (spec.saddle) {
    k.rbox(0.62, 0.12, 0.6, 0.05, 0, 1.08, -0.1, spec.saddle);
    k.rbox(0.66, 0.05, 0.64, 0.02, 0, 1.02, -0.1, GOLD);
  }
  addMesh(rig, rig.body, k);
  if (spec.eye && spec.eye !== '#ffffff') for (const s of [-1, 1]) addGlow(rig.body, new THREE.SphereGeometry(0.03, 8, 6), spec.eye, s * 0.15, 1.15, 1.13);
  for (const [x, z] of [
    [-0.23, 0.42],
    [0.23, 0.42],
    [-0.23, -0.42],
    [0.23, -0.42],
  ] as const) {
    const leg = pivot(rig.body, x, 0.6, z);
    const lk = new K();
    lk.tube(0.12, 0.085, 0.36, 0, -0.18, 0, spec.body, 0, 0, 0, 10);
    lk.ball(0.12, 0, -0.52, 0.05, shade(spec.body, -0.18), 1, 0.6, 1.2);
    for (const t of [-0.06, 0, 0.06]) lk.spike(0.02, 0.07, t, -0.55, 0.17, '#f2ead0', Math.PI / 2, 0, 0, 4);
    addMesh(rig, leg, lk);
    rig.legs.push(leg);
  }
  rig.height = 1.7;
  if (spec.rider) {
    const rider = humanoid({ ...spec.rider }, 'melee');
    for (const l of rider.legs) l.visible = false;
    rider.body.position.set(0, 0.6, -0.1);
    rider.root.scale.setScalar(0.85);
    rig.body.add(rider.root);
    rider.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === rider.material) m.material = rig.material;
    });
    rig.armR = rider.armR;
    rig.armL = rider.armL;
    rig.height = 3.0;
  }
  return rig;
}

export interface FlyerSpec {
  body: string;
  wing: string;
  eye?: string;
  kind: 'moth' | 'bird' | 'drake' | 'wisp' | 'bat';
  accent?: string;
}

const wingShape = (span: number) =>
  shapeFrom([
    [0, 0.15],
    [span * 0.5, 0.35],
    [span, 0.25],
    [span * 0.92, -0.05],
    [span * 0.78, -0.12],
    [span * 0.66, -0.35],
    [span * 0.5, -0.22],
    [span * 0.36, -0.45],
    [span * 0.22, -0.25],
    [0, -0.2],
  ]);

const featherShape = (len: number, w: number) => shapeFrom([[0, 0], [w, len * 0.3], [w * 0.6, len * 0.85], [0, len], [-w * 0.6, len * 0.85], [-w, len * 0.3]]);

export function flyer(spec: FlyerSpec): Rig {
  const rig = newRig('flyer', spec.kind === 'wisp' ? 'cast' : 'melee');
  const k = new K();
  const eyes = (x: number, y: number, z: number, r: number, angry = true) => {
    for (const s of [-1, 1]) {
      k.ball(r, s * x, y, z, '#ffffff', 1, 1, 0.6);
      k.ball(r * 0.55, s * x, y, z + r * 0.4, spec.eye ?? '#120a1c', 1, 1, 0.5);
      k.ball(r * 0.22, s * x - r * 0.3, y + r * 0.3, z + r * 0.6, '#ffffff', 1, 1, 0.5);
      if (angry) k.curve([[s * (x + r), y + r * 1.1, z], [s * (x - r * 0.8), y + r * 0.7, z + r * 0.5]], r * 0.3, r * 0.2, DARK, 5);
    }
  };
  if (spec.kind === 'drake') {
    k.pill(0.42, 0.9, 0, 0, 0, spec.body, Math.PI / 2);
    k.pill(0.32, 0.55, 0, -0.12, 0.05, spec.accent ?? spec.body, Math.PI / 2);
    k.curve([[0, 0.2, 0.55], [0, 0.55, 0.95], [0, 0.75, 1.2]], 0.24, 0.2, spec.body, 10);
    k.ball(0.42, 0, 0.8, 1.32, spec.body);
    k.lathe([[0.26, 0], [0.24, 0.2], [0.16, 0.4], [0.001, 0.45]], 0, 0.68, 1.45, spec.body, 12, 1.1, 0.9, Math.PI / 2);
    for (const s of [-1, 1]) {
      k.curve([[s * 0.2, 1.1, 1.2], [s * 0.35, 1.35, 0.95], [s * 0.3, 1.5, 0.6]], 0.08, 0.01, '#f3ead2', 7);
      k.ball(0.04, s * 0.1, 0.75, 1.9, DARK);
      k.spike(0.03, 0.1, s * 0.12, 0.55, 1.7, '#ffffff', Math.PI);
    }
    eyes(0.2, 0.95, 1.6, 0.12);
    k.curve([[0, 0.05, -0.5], [0, 0.0, -1.1], [0, 0.2, -1.6], [0, 0.45, -1.9]], 0.18, 0.03, spec.body, 8);
    k.plate(shapeFrom([[0, 0], [0.22, 0.12], [0, 0.4], [-0.22, 0.12]]), 0.05, 0.02, 0, 0.48, -1.95, spec.accent ?? spec.wing, 0.6, 0, 0);
    for (let i = 0; i < 6; i++) k.plate(shapeFrom([[-0.08, 0], [0.08, 0], [0, 0.2]]), 0.03, 0.01, 0, 0.42 - i * 0.02, 0.65 - i * 0.35, spec.accent ?? spec.wing, 0, Math.PI / 2, 0);
    rig.height = 1.6;
  } else if (spec.kind === 'bird') {
    k.ball(0.5, 0, 0, 0, spec.body, 1, 1, 1.2);
    k.ball(0.38, 0, -0.1, 0.25, spec.accent ?? spec.body, 0.85, 0.8, 0.9);
    k.ball(0.36, 0, 0.5, 0.45, spec.body);
    k.lathe([[0.13, 0], [0.1, 0.12], [0.04, 0.26], [0.001, 0.3]], 0, 0.45, 0.78, GOLD, 10, 1, 0.8, Math.PI / 2 + 0.3);
    for (let i = 0; i < 5; i++) addGlow(rig.body, new THREE.ConeGeometry(0.06, 0.38, 6), i % 2 ? '#ffd34d' : '#ff8a2a', -0.16 + i * 0.08, 0.98, 0.38 - Math.abs(i - 2) * 0.05).rotation.set(-0.5, 0, (i - 2) * 0.25);
    eyes(0.16, 0.6, 0.72, 0.09);
    for (let i = 0; i < 5; i++) k.plate(featherShape(0.7, 0.13), 0.02, 0.01, (i - 2) * 0.12, -0.05, -0.55, i % 2 ? spec.wing : spec.accent ?? spec.wing, -Math.PI / 2 - 0.3, 0, (i - 2) * 0.25);
    rig.height = 1.3;
  } else if (spec.kind === 'wisp') {
    k.curve([[0, -0.2, 0], [0.1, -0.6, -0.1], [-0.1, -1.0, -0.2], [0.05, -1.3, -0.3]], 0.3, 0.01, spec.wing, 10);
    rig.height = 0.9;
  } else {
    k.ball(0.38, 0, 0, 0, spec.body, 1, 1.05, 1.1);
    k.ball(0.25, 0, -0.1, 0.18, spec.accent ?? spec.body, 1, 0.9, 0.8);
    eyes(0.14, 0.12, 0.33, 0.09);
    if (spec.kind === 'bat') {
      for (const s of [-1, 1]) k.plate(shapeFrom([[-0.1, 0], [0.1, 0], [0.02, 0.32]]), 0.04, 0.015, s * 0.18, 0.32, 0.02, spec.body, 0, 0, -s * 0.25);
      for (const s of [-1, 1]) k.spike(0.025, 0.08, s * 0.06, -0.08, 0.36, '#ffffff', Math.PI);
    } else for (const s of [-1, 1]) k.curve([[s * 0.08, 0.32, 0.2], [s * 0.15, 0.55, 0.3], [s * 0.3, 0.65, 0.2]], 0.02, 0.01, spec.body, 5);
    rig.height = 0.9;
  }
  addMesh(rig, rig.body, k);
  if (spec.kind === 'wisp') {
    const orb = addGlow(rig.body, new THREE.IcosahedronGeometry(0.36, 2), spec.body, 0, 0, 0);
    rig.spinners.push(orb);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: spec.eye ?? '#1a1030' }));
      e.position.set(s * 0.13, 0.06, 0.33);
      e.scale.set(1, 1.3, 0.6);
      rig.body.add(e);
    }
  } else {
    const span = spec.kind === 'drake' ? 1.6 : spec.kind === 'moth' ? 1.0 : spec.kind === 'bird' ? 1.25 : 0.85;
    for (const s of [-1, 1]) {
      const wing = pivot(rig.body, s * 0.32, 0.2, 0);
      const wk = new K();
      if (spec.kind === 'moth') {
        wk.ball(span * 0.5, (s * span) / 2, 0, 0.12, spec.wing, 1, 0.07, 0.9);
        wk.ball(span * 0.32, s * span * 0.42, 0, -0.42, spec.accent ?? spec.wing, 1, 0.07, 0.9);
        wk.ball(span * 0.14, s * span * 0.55, 0.03, 0.15, '#ffffff', 1, 0.1, 1);
        wk.ball(span * 0.07, s * span * 0.55, 0.05, 0.15, spec.body, 1, 0.1, 1);
      } else if (spec.kind === 'drake' || spec.kind === 'bat') {
        wk.plate(wingShape(span), 0.03, 0.015, 0, 0, 0, spec.wing, -Math.PI / 2, 0, 0, 1);
        for (let i = 0; i < 3; i++) wk.curve([[0, 0.02, 0.15], [span * (0.35 + i * 0.25), 0.04, 0.3 - i * 0.05], [span * (0.45 + i * 0.22), 0.02, -0.2 - i * 0.1]], 0.04, 0.012, shade(spec.body, -0.15), 5);
      } else {
        for (let i = 0; i < 5; i++) wk.plate(featherShape(0.55 + i * 0.08, 0.13), 0.02, 0.01, s * (0.15 + i * 0.22), 0, 0.15 - i * 0.04, i % 2 ? spec.wing : spec.accent ?? spec.wing, -Math.PI / 2, 0, s * (Math.PI / 2 + 0.4 - i * 0.12));
      }
      addMesh(rig, wing, wk);
      if (spec.kind === 'drake' || spec.kind === 'bat') {
        // Mirror the membrane for the left wing
        if (s < 0) wing.scale.x = -1;
      }
      rig.wings.push(wing);
    }
  }
  return rig;
}

// --- Giants and bosses ---------------------------------------------------------------------------

export function golem(stone: string, accent: string, eye: string, lava = false): Rig {
  const rig = newRig('biped', 'melee');
  const k = new K();
  const rock = (r: number, x: number, y: number, z: number, hex: string, sx = 1, sy = 1, sz = 1) => k.add(new THREE.DodecahedronGeometry(r, 1), hex, x, y, z, 0.3, 0.5, 0.2, sx, sy, sz);
  rock(0.95, 0, 1.3, 0, stone, 1.15, 0.95, 0.85);
  rock(0.55, 0, 0.6, 0, shade(stone, -0.1), 1.1, 0.7, 0.9);
  rock(0.6, 0, 2.38, 0.1, stone, 1, 0.9, 0.95);
  k.rbox(1.0, 0.2, 0.42, 0.08, 0, 2.58, 0.5, shade(stone, -0.18));
  for (let i = 0; i < 4; i++) k.rbox(0.25, 0.28, 0.25, 0.06, -0.45 + i * 0.3, 2.98, 0.05, stone);
  for (let i = 0; i < 7; i++) k.ball(0.17, Math.cos(i * 0.9) * 0.75, 0.95 + (i % 3) * 0.42, 0.6, accent, 1.3, 0.45, 0.4);
  k.curve([[-0.5, 2.0, 0.5], [-0.2, 1.6, 0.78], [0.1, 1.2, 0.8]], 0.03, 0.02, shade(stone, -0.35), 5);
  addMesh(rig, rig.body, k);
  for (const s of [-1, 1]) addGlow(rig.body, new THREE.SphereGeometry(0.1, 10, 8), eye, s * 0.24, 2.42, 0.64).scale.set(1.5, 0.7, 0.5);
  if (lava) for (let i = 0; i < 6; i++) addGlow(rig.body, new THREE.BoxGeometry(0.06, 0.42, 0.04), eye, -0.55 + i * 0.22, 1.1 + (i % 2) * 0.35, 0.86).rotation.z = (i - 2.5) * 0.4;
  for (const s of [-1, 1]) {
    const leg = pivot(rig.body, s * 0.45, 0.62, 0);
    const lk = new K();
    lk.add(new THREE.DodecahedronGeometry(0.34, 1), stone, 0, -0.3, 0, 0, s, 0, 1, 1.1, 1);
    lk.rbox(0.62, 0.24, 0.72, 0.1, 0, -0.56, 0.06, shade(stone, -0.15));
    addMesh(rig, leg, lk);
    rig.legs.push(leg);
    const arm = pivot(rig.body, s * 1.08, 1.95, 0);
    const ak = new K();
    ak.add(new THREE.DodecahedronGeometry(0.38, 1), stone, 0, -0.1, 0, 0.4, 0, 0);
    ak.add(new THREE.DodecahedronGeometry(0.3, 1), shade(stone, -0.08), 0, -0.62, 0, 0, 0.7, 0, 1, 1.25, 1);
    ak.add(new THREE.DodecahedronGeometry(0.46, 1), stone, 0, -1.18, 0.05, 0.2, 0.3, 0, 1, 0.9, 1);
    ak.ball(0.12, 0.15, -0.95, 0.25, accent, 1, 0.5, 0.5);
    addMesh(rig, arm, ak);
    if (s === 1) rig.armR = arm;
    else rig.armL = arm;
  }
  rig.height = 3.3;
  return rig;
}

function treant(p: { primary: string; secondary: string; accent: string }): Rig {
  const rig = newRig('biped', 'melee');
  const k = new K();
  k.lathe([[0.95, 0], [0.75, 0.35], [0.62, 1.2], [0.7, 2.0], [0.55, 2.5]], 0, 0.4, 0, p.primary, 12);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    k.curve([[Math.cos(a) * 0.62, 0.7, Math.sin(a) * 0.62], [Math.cos(a) * 0.66, 1.6, Math.sin(a) * 0.66], [Math.cos(a) * 0.6, 2.6, Math.sin(a) * 0.6]], 0.07, 0.04, shade(p.primary, -0.22), 5);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    k.add(new THREE.IcosahedronGeometry(0.72, 1), i % 2 ? p.secondary : shade(p.secondary, 0.15), Math.cos(a) * 1.0, 3.05 + Math.sin(i * 1.7) * 0.3, Math.sin(a) * 0.75);
  }
  k.add(new THREE.IcosahedronGeometry(1.05, 1), p.secondary, 0, 3.5, 0);
  k.ball(0.32, 0, 1.6, 0.68, '#2a1a10', 1.5, 0.6, 0.4);
  for (let i = -2; i <= 2; i++) k.spike(0.05, 0.16, i * 0.12, 1.72, 0.78, '#e8dcc0', Math.PI);
  k.curve([[-0.45, 2.35, 0.6], [-0.2, 2.2, 0.72], [0, 2.15, 0.72]], 0.08, 0.04, shade(p.primary, -0.3), 5);
  k.curve([[0.45, 2.35, 0.6], [0.2, 2.2, 0.72], [0, 2.15, 0.72]], 0.08, 0.04, shade(p.primary, -0.3), 5);
  for (let i = 0; i < 8; i++) k.ball(0.1, Math.cos(i * 2.1) * 0.95, 2.8 + (i % 2) * 0.7, 0.75, i % 2 ? '#ff7ac8' : '#ffe066');
  for (let i = 0; i < 3; i++) k.ball(0.14, -0.4 + i * 0.4, 0.5 + i * 0.2, 0.6, '#f2ead0', 1, 0.6, 1);
  addMesh(rig, rig.body, k);
  for (const s of [-1, 1]) addGlow(rig.body, new THREE.SphereGeometry(0.12, 10, 8), p.accent, s * 0.26, 2.05, 0.72).scale.set(1.3, 0.8, 0.5);
  for (const s of [-1, 1]) {
    const leg = pivot(rig.body, s * 0.42, 0.75, 0);
    const lk = new K();
    lk.tube(0.26, 0.34, 0.75, 0, -0.37, 0, p.primary, 0, 0, 0, 10);
    for (let i = 0; i < 3; i++) lk.curve([[(i - 1) * 0.15, -0.6, 0.1], [(i - 1) * 0.3, -0.72, 0.4], [(i - 1) * 0.4, -0.75, 0.7]], 0.12, 0.02, shade(p.primary, -0.1), 6);
    addMesh(rig, leg, lk);
    rig.legs.push(leg);
    const arm = pivot(rig.body, s * 0.85, 2.35, 0);
    const ak = new K();
    ak.curve([[0, 0, 0], [s * 0.25, -0.6, 0.1], [s * 0.15, -1.3, 0.2]], 0.2, 0.12, p.primary, 8);
    for (let i = 0; i < 4; i++) ak.curve([[s * 0.15, -1.3, 0.2], [s * (0.15 + (i - 1.5) * 0.12), -1.55, 0.35], [s * (0.15 + (i - 1.5) * 0.2), -1.7, 0.25]], 0.07, 0.01, shade(p.primary, -0.1), 5);
    ak.add(new THREE.IcosahedronGeometry(0.36, 1), p.secondary, s * 0.1, -0.35, 0.05);
    addMesh(rig, arm, ak);
    if (s === 1) rig.armR = arm;
    else rig.armL = arm;
  }
  rig.height = 4.5;
  return rig;
}

function crystalHeart(p: { primary: string; secondary: string; accent: string }): Rig {
  const rig = newRig('float', 'cast');
  const k = new K();
  k.add(new THREE.OctahedronGeometry(1.1, 0), p.primary, 0, 2.6, 0, 0, 0.4, 0, 1, 1.5, 1);
  for (let i = 0; i < 8; i++) k.gem(0.3 + (i % 3) * 0.08, Math.cos(i * 0.8) * 0.95, 1.6 + (i % 3) * 0.55, Math.sin(i * 0.8) * 0.65, shade(p.primary, 0.2), 2);
  for (let i = 0; i < 5; i++) k.curve([[0, 1.0, 0], [Math.cos(i * 1.26) * 0.6, 0.6, Math.sin(i * 1.26) * 0.6], [Math.cos(i * 1.26) * 0.9, 0.1, Math.sin(i * 1.26) * 0.9]], 0.12, 0.02, shade(p.primary, -0.3), 5);
  addMesh(rig, rig.body, k);
  const core = addGlow(rig.body, new THREE.OctahedronGeometry(0.45, 0), p.secondary, 0, 2.6, 0.62);
  rig.spinners.push(core);
  const ring = new THREE.Group();
  ring.position.y = 2.6;
  rig.body.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sk = new K();
    sk.gem(0.28, Math.cos(a) * 1.9, Math.sin(i) * 0.3, Math.sin(a) * 1.9, i % 2 ? p.secondary : p.accent, 1.6);
    addMesh(rig, ring, sk);
  }
  rig.spinners.push(ring);
  rig.height = 4.4;
  return rig;
}

/** Builds the model for a boss or mini-boss sprite id. */
export function bossRig(sprite: string, p: { primary: string; secondary: string; accent: string }): Rig {
  switch (sprite) {
    case 'treant':
      return treant(p);
    case 'crystal_heart':
      return crystalHeart(p);
    case 'magma_titan':
      return golem(shade(p.primary, 0.22), shade(p.primary, 0.4), p.secondary, true);
    case 'ice_queen':
      return humanoid({ body: p.primary, legs: p.secondary, skin: '#d6eaf8', head: 'long', hair: '#ffffff', headColor: '#ffffff', weapon: 'staff', magic: '#bfe6fa', robe: true, crown: true, cape: p.secondary, trim: '#ffffff', bulk: 1.15, mood: 'sly', eye: '#5dade2', armor: '#e8f6ff' }, 'cast');
    case 'lich_king':
      return humanoid({ body: p.primary, legs: p.primary, skin: '#ece6d6', head: 'skull', headColor: p.secondary, weapon: 'staff', magic: p.accent, robe: true, crown: true, cape: '#2a1338', trim: p.accent, bulk: 1.15, eyeGlow: p.accent, armor: '#6c5a7c' }, 'cast');
    case 'troll':
    case 'mossback':
      return humanoid({ body: p.secondary, legs: p.primary, skin: '#7fa36a', head: 'bald', headColor: p.secondary, weapon: 'club', bulk: 1.6, mood: 'angry', beard: p.secondary, eye: '#ffd34d', ears: 'pointy', armor: shade(p.secondary, 0.1), trim: p.accent, scar: true });
    case 'yeti':
    case 'yeti_chieftain':
      return humanoid({ body: '#f2f4f7', legs: '#dfe6ee', skin: '#9fb7cc', head: 'horns', headColor: '#e8dcc0', weapon: 'club', bulk: 1.5, mood: 'angry', beard: '#ffffff', eye: '#5dade2', scar: true });
    case 'overseer':
    case 'forge_overseer':
      return humanoid({ body: p.primary, legs: '#2c2c2c', skin: '#e9a77a', head: 'fullhelm', headColor: '#4d535c', hair: p.secondary, weapon: 'hammer', bulk: 1.45, eyeGlow: p.secondary, armor: '#5d6670', trim: p.secondary });
    case 'warden':
    case 'grave_warden':
      return humanoid({ body: p.primary, legs: '#3d3d3d', skin: '#ece6d6', head: 'skull', headColor: '#bdc3c7', weapon: 'sword', shield: 'tower', shieldColor: p.secondary, bulk: 1.3, eyeGlow: p.accent, armor: '#7f8796', emblem: p.accent });
    case 'shardmaw':
      return quadruped({ body: p.primary, belly: p.accent, crystal: p.secondary, eye: '#ffffff' });
    default:
      return golem(p.primary, p.secondary, p.accent);
  }
}

// --- Cards, hero, enemies ------------------------------------------------------------------------

const SKIN = '#f6c9a0';

export function cardRig(cardId: string): Rig {
  switch (cardId) {
    case 'thornbow_archer':
      return humanoid({ body: '#3f8f4a', legs: '#7a5230', skin: SKIN, head: 'hood', headColor: '#2f7a3c', weapon: 'bow', mood: 'sly', eye: '#3f8f4a', trim: '#d9f2a0', ears: 'pointy', hair: '#7a4a1f' }, 'bow');
    case 'oakshield_knight':
      return humanoid({ body: '#4a6fb5', legs: '#5d6b80', skin: SKIN, head: 'helm', headColor: STEEL, hair: '#e74c3c', weapon: 'sword', shield: 'round', bulk: 1.12, mood: 'brave', mustache: '#a0662e', armor: STEEL, trim: GOLD, tabard: '#3a5a9a' });
    case 'field_medic':
      return humanoid({ body: '#f4f1e8', legs: '#5aae73', skin: SKIN, head: 'cap', hair: '#8a4b2a', headColor: '#ffffff', weapon: 'potion', mood: 'happy', trim: '#e74c3c', ears: 'round' }, 'throw');
    case 'wolf_rider':
      return quadruped({ body: '#7a6a58', belly: '#b3a28c', mane: '#5d4f40', eye: '#ffd34d', saddle: '#8a3a2a', rider: { body: '#b5462f', legs: '#5b4a3a', skin: '#e9a77a', head: 'wolfhood', headColor: '#8d7c69', weapon: 'axe', mood: 'angry', beard: '#7a3b1e', scar: true } });
    case 'powder_bombardier':
      return humanoid({ body: '#6b5440', legs: '#3a2a1e', skin: SKIN, head: 'goggles', headColor: '#3a2a1e', weapon: 'bomb', mood: 'happy', trim: '#ff9f43', ears: 'round' }, 'throw');
    case 'ember_mage':
      return humanoid({ body: '#b03a2e', legs: '#7b241c', skin: '#f8d2ad', head: 'spiky', hair: '#ff7a2a', headColor: '#ff7a2a', weapon: 'staff', magic: '#ff8c1a', robe: true, trim: '#f39c12', mood: 'sly', eye: '#e67e22' }, 'cast');
    case 'hawkeye_ranger':
      return humanoid({ body: '#2e5e3e', legs: '#6b4f2a', skin: SKIN, head: 'hat', headColor: '#7d5d33', weapon: 'bow', cape: '#24502b', mood: 'sly', eye: '#2e5e3e', trim: '#c9a227', ears: 'round' }, 'bow');
    case 'dawn_paladin':
      return humanoid({ body: '#fdfefe', legs: '#d4ac0d', skin: SKIN, head: 'helm', headColor: GOLD, hair: '#ffffff', weapon: 'goldsword', cape: '#f5b041', bulk: 1.12, mood: 'calm', armor: GOLD, trim: '#fdfefe', eye: '#3498db', tabard: '#fdfefe', emblem: '#f39c12' });
    case 'bastion_golem':
      return golem('#8e9aa3', '#6aa84f', '#5dade2');
    case 'frost_witch':
      return humanoid({ body: '#1b4f72', legs: '#154360', skin: '#cfe6f7', head: 'wizard', headColor: '#1b4f72', trim: '#bfe6fa', weapon: 'staff', magic: '#bfe6fa', robe: true, mood: 'sly', eye: '#48c9f0', ears: 'pointy' }, 'cast');
    case 'aegis_guardian':
      return humanoid({ body: '#1f618d', legs: '#2c3e50', skin: SKIN, head: 'fullhelm', headColor: '#8fb3d1', hair: '#f5b041', weapon: 'sword', shield: 'tower', bulk: 1.25, eyeGlow: '#ffd34d', armor: '#8fb3d1', trim: GOLD, tabard: '#1f618d' });
    case 'shade_assassin':
      return humanoid({ body: '#2c2c54', legs: '#1c1c3a', skin: '#e9c2a0', head: 'hood', headColor: '#3b3b6e', weapon: 'dagger', cape: '#8e44ad', mood: 'angry', eye: '#b98ee0', trim: '#8e44ad', scar: true });
    case 'storm_adept':
      return humanoid({ body: '#5b2c6f', legs: '#3d1d5e', skin: SKIN, head: 'spiky', hair: '#ece2f5', headColor: '#ece2f5', weapon: 'staff', magic: '#f7dc6f', robe: true, trim: '#f7dc6f', mood: 'happy', eye: '#f7dc6f', beard: '#ece2f5' }, 'cast');
    case 'phoenix_warden':
      return flyer({ kind: 'bird', body: '#e74c3c', wing: '#f39c12', accent: '#f5b041', eye: '#7b1f14' });
    case 'aurora_drake':
      return flyer({ kind: 'drake', body: '#48c9b0', wing: '#a569bd', accent: '#e8f8f5', eye: '#5b2c6f' });
    default:
      return humanoid({ body: '#7f8c8d', legs: '#566573', skin: SKIN, head: 'helm', headColor: STEEL, weapon: 'sword' });
  }
}

export function heroRig(cape: string, sword: 'sword' | 'goldsword'): Rig {
  return humanoid({ body: '#7b4fd0', legs: '#3a3550', skin: SKIN, head: 'hair', hair: '#7a3b1e', headColor: '#7a3b1e', weapon: sword, cape, bulk: 1.15, mood: 'brave', armor: '#d5dbe3', trim: GOLD, eye: '#4a7bd0', tabard: '#5b35a8', emblem: GOLD, ears: 'round' });
}

export function enemyRig(role: string, world: number, p: { primary: string; secondary: string; accent: string }): Rig {
  const skull = world === 3;
  const skin = skull ? '#ece6d6' : p.primary;
  switch (role) {
    case 'ranged':
      return humanoid(
        {
          body: p.secondary,
          legs: shade(p.secondary, -0.2),
          skin,
          head: skull ? 'skull' : 'hood',
          headColor: shade(p.secondary, 0.1),
          weapon: world === 2 ? 'bomb' : world === 4 || world === 1 ? 'staff' : 'bow',
          magic: p.accent,
          eyeGlow: skull ? p.accent : undefined,
          mood: 'angry',
          eye: '#c0392b',
          ears: skull ? null : 'pointy',
          trim: p.accent,
        },
        world === 2 ? 'throw' : world === 4 || world === 1 ? 'cast' : 'bow',
      );
    case 'fast':
      return world === 3
        ? humanoid({ body: p.secondary, legs: p.secondary, skin, head: 'skull', headColor: skin, weapon: 'claws', eyeGlow: p.accent })
        : quadruped({ body: p.primary, belly: p.accent, mane: shade(p.primary, -0.2), eye: world === 2 ? '#ffd34d' : '#ff5c5c' });
    case 'armored':
      return humanoid({ body: p.secondary, legs: '#3d3d3d', skin, head: 'fullhelm', headColor: world === 4 ? p.primary : '#7f8796', hair: p.accent, weapon: 'hammer', shield: 'round', shieldColor: '#5d6670', bulk: 1.38, eyeGlow: p.accent, armor: '#7f8796', trim: p.accent });
    case 'flying': {
      const kind = (['moth', 'wisp', 'drake', 'wisp', 'bat'] as const)[world] ?? 'bat';
      return flyer({ kind, body: p.primary, wing: kind === 'moth' ? p.accent : p.secondary, accent: p.accent, eye: kind === 'wisp' ? p.secondary : '#c0392b' });
    }
    default:
      return humanoid({
        body: p.secondary,
        legs: shade(p.secondary, -0.2),
        skin,
        head: skull ? 'skull' : world === 2 || world === 4 ? 'horns' : 'bald',
        headColor: p.accent,
        weapon: world === 0 ? 'club' : 'dagger',
        eyeGlow: skull ? p.accent : undefined,
        mood: 'angry',
        eye: '#c0392b',
        ears: skull ? null : 'pointy',
      });
  }
}
