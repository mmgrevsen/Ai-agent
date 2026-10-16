import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Kit } from '../base3d/kit';

/**
 * Detailed, rounded cartoon battle models built in code (no external assets). Proportions are
 * "chibi": big expressive heads, short sturdy bodies. Every model is a rig of pivots (legs, arms,
 * wings, cape) so the battle scene can animate walking, attacks, hits and deaths.
 * Models face +z with their feet at y = 0; a soldier is about 2.2 units tall.
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
  material: THREE.MeshStandardMaterial;
  kind: 'biped' | 'quad' | 'flyer' | 'float';
  /** Ranged style used for the attack animation. */
  attack: 'melee' | 'bow' | 'cast' | 'throw';
}

/** Kit with smooth rounded primitives (all positions are centres unless noted). */
class K extends Kit {
  ball(r: number, x: number, y: number, z: number, hex: string, sx = 1, sy = 1, sz = 1, seg = r < 0.1 ? 7 : r < 0.25 ? 10 : 14): this {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(5, Math.round(seg * 0.7))), hex, x, y, z, 0, 0, 0, sx, sy, sz);
  }
  /** Capsule centred at (x,y,z), long axis along y before rotation. */
  pill(r: number, len: number, x: number, y: number, z: number, hex: string, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.CapsuleGeometry(r, len, 3, r < 0.08 ? 6 : 10), hex, x, y, z, rx, ry, rz);
  }
  rbox(w: number, h: number, d: number, r: number, x: number, y: number, z: number, hex: string, rx = 0, ry = 0, rz = 0): this {
    return this.add(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), hex, x, y, z, rx, ry, rz);
  }
  tube(rTop: number, rBot: number, h: number, x: number, y: number, z: number, hex: string, rx = 0, ry = 0, rz = 0, seg = 12): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), hex, x, y, z, rx, ry, rz);
  }
  /** Upper half sphere (dome) centred at its base. */
  dome(r: number, x: number, y: number, z: number, hex: string, sy = 1, sx = 1, sz = 1): this {
    return this.add(new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), hex, x, y, z, 0, 0, 0, sx, sy, sz);
  }
  ring(r: number, tube: number, x: number, y: number, z: number, hex: string, rx = Math.PI / 2, ry = 0, rz = 0, arc = Math.PI * 2): this {
    return this.add(new THREE.TorusGeometry(r, tube, 5, 18, arc), hex, x, y, z, rx, ry, rz);
  }
  spike(r: number, h: number, x: number, y: number, z: number, hex: string, rx = 0, ry = 0, rz = 0, seg = 10): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), hex, x, y, z, rx, ry, rz);
  }
}

const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04 });
const glowMat = (hex: string) => new THREE.MeshBasicMaterial({ color: hex });

function pivot(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function newRig(kind: Rig['kind'], attack: Rig['attack']): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  return { root, body, legs: [], armR: null, armL: null, wings: [], cape: null, spinners: [], height: 2.2, material: mat(), kind, attack };
}

function addMesh(rig: Rig, parent: THREE.Object3D, k: Kit): THREE.Mesh {
  const m = k.build(true, rig.material);
  parent.add(m);
  return m;
}

function addGlow(parent: THREE.Object3D, geo: THREE.BufferGeometry, hex: string, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, glowMat(hex));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const STEEL = '#cfd6df';
const STEEL_DARK = '#8c96a3';
const GOLD = '#f5c542';
const LEATHER = '#6b4626';
const LEATHER_DARK = '#4a2f18';
const BOOT = '#4a3020';
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
  teeth?: boolean;
  /** No visible face (full helm, skull, hood shadow). */
  hidden?: boolean;
}

/** Big cartoon face on a head of radius r centred at (0, hy, 0). */
function face(k: K, rig: Rig, f: FaceSpec, hy: number, r: number): void {
  if (f.hidden) return;
  const z = r * 0.86;
  const ex = r * 0.36;
  const ey = hy + r * 0.1;
  if (f.eyeGlow) {
    for (const s of [-1, 1]) addGlow(rig.body, new THREE.SphereGeometry(r * 0.16, 10, 8), f.eyeGlow, s * ex, ey, z + r * 0.06).scale.set(1, 0.7, 0.6);
  } else {
    for (const s of [-1, 1]) {
      k.ball(r * 0.22, s * ex, ey, z - r * 0.02, '#ffffff', 0.85, 1, 0.55);
      k.ball(r * 0.13, s * ex + s * -0.01, ey - r * 0.01, z + r * 0.09, f.eye ?? '#3b6fb6', 1, 1, 0.5);
      k.ball(r * 0.075, s * ex, ey - r * 0.01, z + r * 0.13, '#120a1c', 1, 1, 0.5);
      k.ball(r * 0.04, s * ex - r * 0.05, ey + r * 0.06, z + r * 0.16, '#ffffff', 1, 1, 0.5);
    }
  }
  // Brows show the mood
  const tilt = f.mood === 'angry' ? 0.45 : f.mood === 'brave' ? 0.22 : f.mood === 'sly' ? 0.1 : f.mood === 'happy' ? -0.2 : 0;
  for (const s of [-1, 1]) k.pill(r * 0.055, r * 0.26, s * ex, ey + r * 0.3, z - r * 0.02, f.brow ?? '#3a2414', 0, 0, Math.PI / 2 + s * tilt);
  // Nose and mouth
  k.ball(r * 0.13, 0, hy - r * 0.12, r * 0.95, shadeHex(f.skin, -0.12), 1.1, 0.9, 0.8);
  const my = hy - r * 0.42;
  if (f.mood === 'happy' || f.mood === 'brave' || f.teeth) {
    k.ball(r * 0.22, 0, my, z - r * 0.06, '#6b1a2a', 1.4, 0.6, 0.45);
    if (f.teeth !== false) k.rbox(r * 0.42, r * 0.1, r * 0.06, 0.02, 0, my + r * 0.06, z + r * 0.02, '#ffffff');
  } else if (f.mood === 'angry') {
    k.ball(r * 0.2, 0, my, z - r * 0.06, '#6b1a2a', 1.5, 0.45, 0.45);
    k.rbox(r * 0.4, r * 0.08, r * 0.06, 0.02, 0, my + r * 0.03, z + r * 0.01, '#ffffff');
  } else k.pill(r * 0.04, r * 0.18, r * 0.04, my + r * 0.04, z, '#6b1a2a', 0, 0, Math.PI / 2 + (f.mood === 'sly' ? 0.25 : 0));
  // Cheeks
  for (const s of [-1, 1]) k.ball(r * 0.12, s * r * 0.52, hy - r * 0.2, r * 0.74, shadeHex(f.skin, -0.04), 1, 0.7, 0.5);
  if (f.mustache) for (const s of [-1, 1]) k.pill(r * 0.09, r * 0.26, s * r * 0.2, hy - r * 0.28, r * 0.92, f.mustache, 0, 0, Math.PI / 2 - s * 0.35);
  if (f.beard) k.ball(r * 0.55, 0, hy - r * 0.62, r * 0.42, f.beard, 1, 0.75, 0.75);
}

function shadeHex(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  if (amt < 0) c.multiplyScalar(1 + amt);
  else c.lerp(new THREE.Color('#ffffff'), amt);
  return '#' + c.getHexString();
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
  /** Metal shoulder pads and chest plate. */
  armor?: string;
  trim?: string;
  ears?: 'round' | 'pointy' | null;
}

const HEAD_R = 0.46;

function headGear(k: K, spec: HumanSpec, hy: number): number {
  const r = HEAD_R;
  const c = spec.headColor;
  let top = hy + r;
  switch (spec.head) {
    case 'helm':
      k.dome(r * 1.08, 0, hy + r * 0.12, 0, c, 0.95);
      k.ring(r * 1.06, 0.05, 0, hy + r * 0.12, 0, shadeHex(c, -0.2));
      k.rbox(0.1, r * 0.75, 0.08, 0.03, 0, hy + r * 0.1, r * 1.0, shadeHex(c, -0.1));
      k.ball(0.07, 0, hy + r * 1.1, 0, GOLD);
      top = hy + r * 1.2;
      break;
    case 'fullhelm':
      k.ball(r * 1.1, 0, hy, 0, c, 1, 1.05, 1);
      k.rbox(r * 1.3, 0.09, 0.2, 0.04, 0, hy + r * 0.1, r * 0.98, DARK);
      k.rbox(0.09, r * 0.6, 0.12, 0.03, 0, hy - r * 0.25, r * 1.05, shadeHex(c, -0.15));
      for (let i = 0; i < 3; i++) k.rbox(r * 0.45, 0.04, 0.05, 0.02, 0, hy - r * 0.45 - i * 0.07, r * 0.98, DARK);
      k.ring(r * 1.1, 0.05, 0, hy - r * 0.6, 0, shadeHex(c, -0.2));
      // Plume
      for (let i = 0; i < 5; i++) k.ball(0.14 - i * 0.012, 0, hy + r * 1.1 + Math.sin(i * 0.6) * 0.1, -0.05 - i * 0.12, spec.hair ?? '#e74c3c', 1, 1, 1.3);
      top = hy + r * 1.35;
      break;
    case 'hood':
      k.ball(r * 1.14, 0, hy + 0.03, -0.05, c, 1, 1.02, 1);
      k.spike(0.16, 0.42, 0, hy + r * 1.05, -0.32, c, -0.9);
      k.ring(r * 0.98, 0.06, 0, hy, r * 0.5, shadeHex(c, -0.25), 0, 0, 0);
      top = hy + r * 1.2;
      break;
    case 'hat':
      k.tube(r * 1.55, r * 1.55, 0.06, 0, hy + r * 0.62, 0, c, 0, 0, 0, 24);
      k.tube(r * 0.78, r * 0.88, r * 0.62, 0, hy + r * 0.95, 0, c);
      k.tube(r * 0.9, r * 0.9, 0.08, 0, hy + r * 0.72, 0, '#c0392b');
      k.pill(0.05, 0.55, r * 0.7, hy + r * 1.25, -0.1, '#e74c3c', 0.3, 0, -0.5);
      top = hy + r * 1.3;
      break;
    case 'wizard': {
      k.tube(r * 1.5, r * 1.5, 0.06, 0, hy + r * 0.6, 0, c, 0, 0, 0, 24);
      k.spike(r * 0.92, 0.75, 0, hy + r * 0.6 + 0.37, 0, c);
      k.spike(r * 0.4, 0.5, 0.05, hy + r * 0.6 + 0.9, -0.12, c, -0.5);
      k.tube(r * 0.95, r * 0.95, 0.09, 0, hy + r * 0.68, 0, spec.trim ?? '#5dade2');
      top = hy + r * 0.6 + 1.1;
      break;
    }
    case 'hair':
      k.ball(r * 1.05, 0, hy + r * 0.2, -0.04, spec.hair ?? c, 1, 0.82, 1);
      k.ball(r * 0.45, -r * 0.4, hy + r * 0.62, r * 0.55, spec.hair ?? c, 1.1, 0.6, 0.7);
      k.ball(r * 0.4, r * 0.25, hy + r * 0.68, r * 0.55, spec.hair ?? c, 1.1, 0.55, 0.7);
      top = hy + r * 1.1;
      break;
    case 'long':
      k.ball(r * 1.06, 0, hy + r * 0.18, -0.06, spec.hair ?? c, 1, 0.85, 1);
      k.rbox(r * 1.9, r * 1.6, r * 0.6, 0.15, 0, hy - r * 0.5, -r * 0.55, spec.hair ?? c);
      k.ball(r * 0.4, 0, hy + r * 0.68, r * 0.5, spec.hair ?? c, 1.8, 0.55, 0.7);
      top = hy + r * 1.1;
      break;
    case 'spiky':
      k.ball(r * 0.98, 0, hy + r * 0.25, -0.03, spec.hair ?? c, 1, 0.8, 1);
      for (let i = 0; i < 7; i++) {
        const a = -1.1 + i * 0.37;
        k.spike(0.13, 0.5, Math.sin(a) * r * 0.75, hy + r * 0.85 + Math.cos(a) * 0.1, -0.05 + (i % 2) * 0.12, spec.hair ?? c, -0.2, 0, -a * 0.8);
      }
      top = hy + r * 1.5;
      break;
    case 'horns':
      for (const s of [-1, 1]) k.spike(0.1, 0.45, s * r * 0.75, hy + r * 0.85, 0, c, 0, 0, -s * 0.55);
      top = hy + r * 1.3;
      break;
    case 'skull':
      for (const s of [-1, 1]) k.ball(r * 0.22, s * r * 0.36, hy + r * 0.1, r * 0.8, DARK, 1, 1, 0.5);
      k.ball(r * 0.08, 0, hy - r * 0.15, r * 0.97, DARK, 1, 1.3, 0.5);
      for (let i = -2; i <= 2; i++) k.rbox(0.07, 0.1, 0.06, 0.02, i * 0.08, hy - r * 0.48, r * 0.88, '#f4efe2');
      break;
    case 'cap':
      k.dome(r * 1.04, 0, hy + r * 0.15, 0, '#ffffff', 0.7);
      k.rbox(0.08, 0.24, 0.05, 0.02, 0, hy + r * 0.55, r * 0.92, '#e74c3c');
      k.rbox(0.24, 0.08, 0.05, 0.02, 0, hy + r * 0.55, r * 0.92, '#e74c3c');
      k.ball(r * 0.9, 0, hy + r * 0.05, -0.12, spec.hair ?? '#8a4b2a', 1.05, 0.9, 0.9);
      top = hy + r * 1.05;
      break;
    case 'goggles':
      k.ball(r * 1.0, 0, hy + r * 0.25, -0.05, spec.hair ?? '#3a2a1e', 1, 0.78, 1);
      k.ring(r * 1.02, 0.05, 0, hy + r * 0.42, 0, LEATHER_DARK);
      for (const s of [-1, 1]) {
        k.ring(0.15, 0.04, s * 0.19, hy + r * 0.48, r * 0.9, '#6d7480', 0, 0, 0);
        k.ball(0.13, s * 0.19, hy + r * 0.48, r * 0.88, '#ff9f43', 1, 1, 0.4);
      }
      top = hy + r * 1.05;
      break;
    case 'wolfhood':
      k.ball(r * 1.12, 0, hy + r * 0.2, -0.04, c, 1, 0.92, 1.05);
      k.pill(r * 0.36, r * 0.4, 0, hy + r * 0.62, r * 0.82, shadeHex(c, 0.1), Math.PI / 2);
      k.ball(0.07, 0, hy + r * 0.65, r * 1.45, DARK);
      for (let i = -2; i <= 2; i++) k.spike(0.03, 0.1, i * 0.07, hy + r * 0.38, r * 1.15, '#ffffff', Math.PI);
      for (const s of [-1, 1]) k.spike(0.12, 0.32, s * r * 0.6, hy + r * 1.05, -0.05, c, 0, 0, -s * 0.25);
      for (const s of [-1, 1]) k.ball(0.04, s * 0.14, hy + r * 0.78, r * 1.08, '#ffd34d');
      top = hy + r * 1.35;
      break;
    case 'bald':
      k.ball(r * 0.3, 0, hy + r * 0.88, 0, shadeHex(spec.skin, 0.15), 1.4, 0.4, 1);
      break;
    default:
      break;
  }
  if (spec.crown) {
    k.tube(r * 0.75, r * 0.82, 0.16, 0, top - 0.02, 0, GOLD);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.spike(0.06, 0.18, Math.cos(a) * r * 0.72, top + 0.14, Math.sin(a) * r * 0.72, GOLD, 0, 0, 0, 6);
    }
    k.ball(0.06, 0, top + 0.02, r * 0.8, '#e74c3c');
    top += 0.3;
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
      const blade = spec.weapon === 'goldsword' ? '#ffd34d' : '#e6ecf3';
      k.pill(0.045, 0.2, 0, -0.02, 0, LEATHER_DARK);
      k.ball(0.07, 0, -0.17, 0, GOLD);
      k.rbox(0.42, 0.07, 0.1, 0.03, 0, 0.13, 0, GOLD);
      k.rbox(0.13, 0.95, 0.04, 0.02, 0, 0.64, 0, blade);
      k.rbox(0.03, 0.8, 0.045, 0.01, 0, 0.6, 0, shadeHex(blade, -0.15));
      k.spike(0.065, 0.16, 0, 1.19, 0, blade, 0, 0, 0, 4);
      if (spec.weapon === 'goldsword') addGlow(w, new THREE.SphereGeometry(0.06, 8, 6), '#fff3b0', 0, 0.13, 0.06);
      break;
    }
    case 'dagger':
      k.pill(0.04, 0.12, 0, -0.02, 0, LEATHER_DARK);
      k.rbox(0.22, 0.05, 0.07, 0.02, 0, 0.08, 0, GOLD);
      k.rbox(0.09, 0.42, 0.03, 0.015, 0, 0.32, 0, '#e6ecf3');
      k.spike(0.045, 0.1, 0, 0.58, 0, '#e6ecf3', 0, 0, 0, 4);
      break;
    case 'axe':
      k.pill(0.05, 0.95, 0, 0.25, 0, '#8a5a2b');
      k.add(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 16, 1, false, 0, Math.PI), STEEL, 0.0, 0.7, 0.0, 0, Math.PI / 2, Math.PI / 2);
      k.rbox(0.14, 0.2, 0.12, 0.03, 0, 0.7, 0, STEEL_DARK);
      break;
    case 'hammer':
      k.pill(0.055, 0.95, 0, 0.25, 0, '#6b4626');
      k.rbox(0.36, 0.34, 0.6, 0.08, 0, 0.82, 0, STEEL_DARK);
      for (const z of [-0.2, 0.2]) k.rbox(0.38, 0.36, 0.06, 0.02, 0, 0.82, z, GOLD);
      break;
    case 'club':
      k.tube(0.16, 0.06, 1.0, 0, 0.4, 0, '#8a5a2b');
      for (let i = 0; i < 4; i++) k.spike(0.04, 0.12, Math.cos(i * 1.6) * 0.14, 0.7 + i * 0.05, Math.sin(i * 1.6) * 0.14, '#e8dcc0', Math.sin(i * 1.6), 0, -Math.cos(i * 1.6));
      break;
    case 'staff': {
      k.tube(0.045, 0.055, 1.6, 0, 0.45, 0, '#7a4a1f');
      k.ring(0.16, 0.035, 0, 1.3, 0, GOLD, 0, 0, 0);
      for (const s of [-1, 1]) k.spike(0.04, 0.22, s * 0.13, 1.42, 0, GOLD, 0, 0, -s * 0.4, 6);
      const orb = addGlow(w, new THREE.SphereGeometry(0.15, 14, 10), spec.magic ?? '#5dade2', 0, 1.3, 0);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), new THREE.MeshBasicMaterial({ color: spec.magic ?? '#5dade2', transparent: true, opacity: 0.35, depthWrite: false }));
      halo.position.copy(orb.position);
      w.add(halo);
      rig.spinners.push(halo);
      break;
    }
    case 'bomb':
      k.ball(0.22, 0, 0.12, 0, '#2b2b33');
      k.ball(0.07, -0.08, 0.2, 0.15, '#6b6b78', 1, 1, 0.6);
      k.tube(0.06, 0.06, 0.08, 0, 0.35, 0, STEEL_DARK);
      k.pill(0.015, 0.12, 0.03, 0.44, 0, '#d9b77a', 0, 0, -0.4);
      addGlow(w, new THREE.OctahedronGeometry(0.07), '#ffd34d', 0.06, 0.53, 0);
      break;
    case 'potion':
      k.ball(0.15, 0, 0.08, 0, '#7bd389', 1, 1.05, 1);
      k.tube(0.05, 0.06, 0.12, 0, 0.26, 0, '#bde8c9');
      k.tube(0.055, 0.05, 0.07, 0, 0.35, 0, '#a0662e');
      break;
    case 'claws':
      for (const s of [-1, 0, 1]) k.spike(0.03, 0.3, s * 0.07, 0.15, 0.06, '#f2ead0', 0.3, 0, 0, 6);
      break;
    default:
      break;
  }
  if (!k.empty) addMesh(rig, w, k);
}

/** A detailed chibi humanoid rig, ≈ 2.2 units tall. */
export function humanoid(spec: HumanSpec, attack: Rig['attack'] = 'melee'): Rig {
  const rig = newRig('biped', attack);
  const b = spec.bulk ?? 1;
  const k = new K();
  const hipY = 0.5;
  const chestY = 0.9;
  const hy = 1.56;
  const skull = spec.head === 'skull';
  const skin = skull ? '#efe8d8' : spec.skin;
  // Robe / skirt or hips
  if (spec.robe) {
    k.tube(0.32 * b, 0.56 * b, 0.95, 0, 0.47, 0, spec.legs, 0, 0, 0, 18);
    k.tube(0.57 * b, 0.6 * b, 0.08, 0, 0.04, 0, spec.trim ?? shadeHex(spec.legs, -0.2), 0, 0, 0, 18);
  } else k.rbox(0.6 * b, 0.26, 0.42 * b, 0.1, 0, hipY + 0.05, 0, spec.legs);
  // Torso, chest plate, belt
  k.rbox(0.72 * b, 0.6, 0.5 * b, 0.18, 0, chestY, 0, spec.body);
  if (spec.armor) {
    k.rbox(0.62 * b, 0.42, 0.12, 0.08, 0, chestY + 0.04, 0.22 * b, spec.armor);
    k.ball(0.06, 0, chestY + 0.06, 0.29 * b, spec.trim ?? GOLD);
  } else if (spec.trim) k.rbox(0.12, 0.5, 0.06, 0.03, 0, chestY + 0.02, 0.25 * b, spec.trim);
  k.rbox(0.76 * b, 0.1, 0.54 * b, 0.04, 0, chestY - 0.26, 0, LEATHER);
  k.rbox(0.13, 0.12, 0.06, 0.03, 0, chestY - 0.26, 0.28 * b, GOLD);
  // Neck and head
  k.tube(0.13, 0.15, 0.16, 0, chestY + 0.34, 0, skin);
  k.ball(HEAD_R, 0, hy, 0, skin, 1.04, 1, 1);
  if (spec.ears && !skull) {
    for (const s of [-1, 1]) {
      if (spec.ears === 'pointy') k.spike(0.09, 0.34, s * HEAD_R * 1.05, hy + 0.05, 0, skin, 0, 0, -s * 1.15, 8);
      else k.ball(0.1, s * HEAD_R * 1.0, hy, 0, skin, 0.6, 1, 0.8);
    }
  }
  face(k, rig, { skin, eye: spec.eye, mood: spec.mood ?? 'brave', mustache: spec.mustache, beard: spec.beard, eyeGlow: spec.eyeGlow ?? undefined, hidden: spec.head === 'fullhelm' || skull }, hy, HEAD_R);
  if (skull && spec.eyeGlow) for (const s of [-1, 1]) addGlow(rig.body, new THREE.SphereGeometry(0.06, 8, 6), spec.eyeGlow, s * HEAD_R * 0.36, hy + HEAD_R * 0.1, HEAD_R * 0.92);
  if (spec.head === 'fullhelm' && spec.eyeGlow) addGlow(rig.body, new THREE.BoxGeometry(HEAD_R * 1.1, 0.05, 0.04), spec.eyeGlow, 0, hy + HEAD_R * 0.1, HEAD_R * 1.12);
  rig.height = headGear(k, spec, hy) + 0.05;
  addMesh(rig, rig.body, k);

  // Legs with boots
  if (!spec.robe) {
    for (const s of [-1, 1]) {
      const leg = pivot(rig.body, s * 0.17 * b, hipY, 0);
      const lk = new K();
      lk.pill(0.12 * Math.sqrt(b), 0.16, 0, -0.17, 0, spec.legs);
      lk.rbox(0.27 * Math.sqrt(b), 0.2, 0.36, 0.08, 0, -0.4, 0.04, BOOT);
      lk.rbox(0.29 * Math.sqrt(b), 0.05, 0.38, 0.02, 0, -0.48, 0.04, LEATHER_DARK);
      addMesh(rig, leg, lk);
      rig.legs.push(leg);
    }
  }

  // Arms with sleeves, gloves and shoulder pads
  for (const s of [-1, 1]) {
    const arm = pivot(rig.body, s * 0.43 * b, chestY + 0.2, 0);
    const ak = new K();
    ak.pill(0.105, 0.24, 0, -0.18, 0, spec.body);
    ak.ball(0.135, 0, -0.42, 0.02, spec.armor ? STEEL_DARK : skull ? '#efe8d8' : spec.skin);
    if (spec.armor) {
      ak.dome(0.2, 0, -0.02, 0, spec.armor, 0.8, 1.1, 1);
      ak.ring(0.19, 0.03, 0, -0.02, 0, spec.trim ?? GOLD);
    }
    addMesh(rig, arm, ak);
    const hand = pivot(arm, 0, -0.42, 0.02);
    if (s === 1) {
      rig.armR = arm;
      weaponMesh(rig, hand, spec);
    } else {
      rig.armL = arm;
      const sk = new K();
      if (spec.shield === 'round') {
        sk.tube(0.46, 0.46, 0.08, 0.06, 0, 0.18, spec.shieldColor ?? '#9a6430', Math.PI / 2, 0, 0, 22);
        sk.ring(0.46, 0.05, 0.06, 0, 0.18, STEEL_DARK, 0, 0, 0);
        sk.ball(0.12, 0.06, 0, 0.24, GOLD, 1, 1, 0.6);
        for (let i = 0; i < 4; i++) sk.rbox(0.05, 0.3, 0.02, 0.01, 0.06 + Math.cos(i * 1.57) * 0.24, Math.sin(i * 1.57) * 0.24, 0.23, shadeHex(spec.shieldColor ?? '#9a6430', -0.2), 0, 0, i * 1.57);
      } else if (spec.shield === 'tower' || spec.shield === 'kite') {
        const h = spec.shield === 'tower' ? 1.25 : 0.95;
        sk.rbox(0.82, h, 0.1, 0.08, 0.05, -0.15, 0.2, spec.shieldColor ?? '#1f618d');
        sk.rbox(0.9, 0.08, 0.12, 0.03, 0.05, -0.15 + h / 2, 0.2, GOLD);
        sk.rbox(0.9, 0.08, 0.12, 0.03, 0.05, -0.15 - h / 2, 0.2, GOLD);
        sk.ball(0.15, 0.05, -0.1, 0.27, GOLD, 1, 1, 0.5);
        for (let i = 0; i < 8; i++) sk.spike(0.03, 0.14, 0.05 + Math.cos((i / 8) * 6.28) * 0.24, -0.1 + Math.sin((i / 8) * 6.28) * 0.24, 0.27, GOLD, Math.PI / 2, 0, 0, 4);
      } else if (spec.weapon === 'bow') {
        sk.ring(0.55, 0.04, 0.0, 0.0, 0.24, '#8a5a2b', 0, Math.PI / 2, Math.PI / 2, Math.PI * 0.9);
        sk.pill(0.012, 1.0, 0.0, 0.0, 0.07, '#f2ead0');
        sk.rbox(0.07, 0.16, 0.08, 0.02, 0, 0, 0.24, LEATHER_DARK);
      } else if (spec.weapon === 'dagger') {
        sk.rbox(0.09, 0.42, 0.03, 0.015, 0, 0.12, 0.3, '#e6ecf3', 1.0, 0, 0);
      }
      if (!sk.empty) addMesh(rig, hand, sk);
    }
  }
  // Quiver for archers
  if (spec.weapon === 'bow') {
    const qk = new K();
    qk.tube(0.12, 0.1, 0.6, 0.15, chestY + 0.1, -0.3, LEATHER, 0.3, 0, -0.3);
    for (let i = 0; i < 3; i++) qk.spike(0.05, 0.14, 0.2 + i * 0.05, chestY + 0.48 + i * 0.02, -0.4, '#f2ead0', 0.3, 0, -0.3, 4);
    addMesh(rig, rig.body, qk);
  }
  // Cape
  if (spec.cape) {
    const cape = pivot(rig.body, 0, chestY + 0.3, -0.24 * b);
    const ck = new K();
    ck.rbox(0.82 * b, 1.0, 0.06, 0.05, 0, -0.5, -0.03, spec.cape);
    ck.rbox(0.86 * b, 0.1, 0.12, 0.04, 0, -0.02, 0.02, spec.trim ?? GOLD);
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
}

export function quadruped(spec: QuadSpec): Rig {
  const rig = newRig('quad', 'melee');
  const k = new K();
  k.pill(0.36, 0.85, 0, 0.72, 0, spec.body, Math.PI / 2);
  if (spec.belly) k.pill(0.28, 0.6, 0, 0.62, 0.02, spec.belly, Math.PI / 2);
  // Head
  k.ball(0.36, 0, 1.02, 0.78, spec.body);
  k.pill(0.17, 0.22, 0, 0.92, 1.1, spec.belly ?? spec.body, Math.PI / 2);
  k.ball(0.07, 0, 0.97, 1.32, DARK);
  for (let i = -1; i <= 1; i += 2) k.spike(0.035, 0.1, i * 0.08, 0.8, 1.22, '#ffffff', Math.PI);
  for (const s of [-1, 1]) {
    k.spike(0.11, 0.3, s * 0.2, 1.38, 0.7, spec.body, -0.2, 0, -s * 0.2);
    k.ball(0.09, s * 0.15, 1.1, 1.03, '#ffffff', 1, 1, 0.6);
    k.ball(0.05, s * 0.15, 1.1, 1.08, '#120a1c', 1, 1, 0.6);
    k.pill(0.025, 0.12, s * 0.15, 1.22, 1.04, DARK, 0, 0, Math.PI / 2 + s * 0.45);
  }
  if (spec.mane) k.ball(0.38, 0, 1.05, 0.5, spec.mane, 1.15, 1, 0.8);
  k.pill(0.08, 0.5, 0, 1.0, -0.82, spec.body, -0.9);
  if (spec.shell) {
    k.dome(0.72, 0, 0.75, -0.05, spec.shell, 0.75, 1, 1.25);
    for (let i = 0; i < 5; i++) k.ball(0.14, Math.cos(i * 1.26) * 0.4, 1.15, -0.05 + Math.sin(i * 1.26) * 0.5, shadeHex(spec.shell, 0.15), 1, 0.5, 1);
  }
  if (spec.crystal) for (let i = 0; i < 4; i++) k.spike(0.14, 0.6 + (i % 2) * 0.3, 0, 1.25, -0.5 + i * 0.32, spec.crystal, 0, 0, 0, 5);
  addMesh(rig, rig.body, k);
  if (spec.eye && spec.eye !== '#ffffff') for (const s of [-1, 1]) addGlow(rig.body, new THREE.SphereGeometry(0.045, 8, 6), spec.eye, s * 0.15, 1.1, 1.1);
  for (const [x, z] of [
    [-0.22, 0.45],
    [0.22, 0.45],
    [-0.22, -0.45],
    [0.22, -0.45],
  ] as const) {
    const leg = pivot(rig.body, x, 0.55, z);
    const lk = new K();
    lk.pill(0.1, 0.3, 0, -0.25, 0, spec.body);
    lk.ball(0.12, 0, -0.5, 0.04, shadeHex(spec.body, -0.2), 1, 0.6, 1.2);
    addMesh(rig, leg, lk);
    rig.legs.push(leg);
  }
  rig.height = 1.6;
  if (spec.rider) {
    const rider = humanoid({ ...spec.rider }, 'melee');
    for (const l of rider.legs) l.visible = false;
    rider.body.position.set(0, 0.62, -0.1);
    rider.root.scale.setScalar(0.85);
    rig.body.add(rider.root);
    rider.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === rider.material) m.material = rig.material;
    });
    rig.armR = rider.armR;
    rig.armL = rider.armL;
    rig.height = 2.9;
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

export function flyer(spec: FlyerSpec): Rig {
  const rig = newRig('flyer', spec.kind === 'wisp' ? 'cast' : 'melee');
  const k = new K();
  const eyes = (x: number, y: number, z: number, r: number) => {
    for (const s of [-1, 1]) {
      k.ball(r, s * x, y, z, '#ffffff', 1, 1, 0.6);
      k.ball(r * 0.55, s * x, y, z + r * 0.4, spec.eye ?? '#120a1c', 1, 1, 0.5);
    }
  };
  if (spec.kind === 'drake') {
    k.pill(0.42, 0.9, 0, 0, 0, spec.body, Math.PI / 2);
    k.pill(0.32, 0.5, 0, 0.12, -0.2, spec.accent ?? spec.body, Math.PI / 2);
    k.pill(0.2, 0.5, 0, 0.45, 0.85, spec.body, 0.9);
    k.ball(0.42, 0, 0.75, 1.25, spec.body);
    k.pill(0.24, 0.3, 0, 0.62, 1.62, spec.body, Math.PI / 2);
    for (const s of [-1, 1]) {
      k.spike(0.07, 0.5, s * 0.22, 1.18, 1.05, '#f3ead2', -0.7, 0, -s * 0.35);
      k.ball(0.04, s * 0.1, 0.72, 1.98, DARK);
    }
    eyes(0.2, 0.9, 1.55, 0.12);
    k.pill(0.12, 0.9, 0, 0.05, -1.25, spec.body, -1.3);
    k.spike(0.16, 0.35, 0, 0.0, -1.9, spec.accent ?? spec.wing, -1.6);
    for (let i = 0; i < 5; i++) k.spike(0.07, 0.22, 0, 0.42 - i * 0.03, 0.6 - i * 0.38, spec.accent ?? spec.wing, -0.3);
    rig.height = 1.5;
  } else if (spec.kind === 'bird') {
    k.ball(0.5, 0, 0, 0, spec.body, 1, 1, 1.2);
    k.ball(0.36, 0, 0.5, 0.45, spec.body);
    k.spike(0.12, 0.34, 0, 0.42, 0.88, GOLD, Math.PI / 2);
    for (let i = 0; i < 4; i++) addGlow(rig.body, new THREE.ConeGeometry(0.07, 0.34, 6), i % 2 ? '#ffd34d' : '#ff8a2a', -0.12 + i * 0.08, 0.95, 0.38 - i * 0.07).rotation.set(-0.4, 0, (i - 1.5) * 0.2);
    eyes(0.16, 0.58, 0.72, 0.09);
    for (let i = 0; i < 3; i++) k.ball(0.14, (i - 1) * 0.16, -0.15, -0.72 - i * 0.04, spec.accent ?? spec.wing, 0.8, 0.3, 1.8);
    rig.height = 1.3;
  } else if (spec.kind === 'wisp') {
    k.spike(0.34, 0.9, 0, -0.55, 0, spec.wing, Math.PI, 0, 0, 14);
    rig.height = 0.9;
  } else {
    k.ball(0.38, 0, 0, 0, spec.body, 1, 1.05, 1.1);
    eyes(0.14, 0.12, 0.33, 0.09);
    if (spec.kind === 'bat') for (const s of [-1, 1]) k.spike(0.1, 0.3, s * 0.18, 0.42, 0.05, spec.body, 0, 0, -s * 0.25);
    else for (const s of [-1, 1]) k.pill(0.02, 0.35, s * 0.12, 0.5, 0.22, spec.body, -0.4, 0, -s * 0.4);
    rig.height = 0.9;
  }
  addMesh(rig, rig.body, k);
  if (spec.kind === 'wisp') {
    const orb = addGlow(rig.body, new THREE.SphereGeometry(0.38, 16, 12), spec.body, 0, 0, 0);
    rig.spinners.push(orb);
    const core = addGlow(rig.body, new THREE.SphereGeometry(0.2, 12, 8), spec.accent ?? '#ffffff', 0, 0.05, 0.12);
    core.scale.set(1, 1, 0.8);
    for (const s of [-1, 1]) addGlow(rig.body, new THREE.SphereGeometry(0.06, 8, 6), spec.eye ?? '#1a1030', s * 0.13, 0.08, 0.33);
  } else {
    const span = spec.kind === 'drake' ? 1.6 : spec.kind === 'moth' ? 1.0 : spec.kind === 'bird' ? 1.25 : 0.8;
    for (const s of [-1, 1]) {
      const wing = pivot(rig.body, s * 0.32, 0.2, 0);
      const wk = new K();
      if (spec.kind === 'moth') {
        wk.ball(span * 0.5, (s * span) / 2, 0, 0.12, spec.wing, 1, 0.08, 0.9);
        wk.ball(span * 0.32, s * span * 0.42, 0, -0.42, spec.accent ?? spec.wing, 1, 0.08, 0.9);
        wk.ball(span * 0.12, s * span * 0.55, 0.03, 0.15, '#ffffff', 1, 0.1, 1);
      } else if (spec.kind === 'drake' || spec.kind === 'bat') {
        wk.pill(0.05, span, (s * span) / 2, 0.1, 0, shadeHex(spec.body, -0.15), 0, 0, Math.PI / 2);
        wk.ball(span * 0.55, (s * span) / 2, 0, -0.35, spec.wing, 1, 0.06, 0.7);
      } else {
        for (let i = 0; i < 4; i++) wk.ball(0.22, s * (0.25 + i * 0.28), -i * 0.04, -0.1 - i * 0.04, i % 2 ? spec.wing : spec.accent ?? spec.wing, 1.1, 0.25, 1.6 - i * 0.2);
      }
      addMesh(rig, wing, wk);
      rig.wings.push(wing);
    }
  }
  return rig;
}

// --- Giants and bosses ---------------------------------------------------------------------------

export function golem(stone: string, accent: string, eye: string, lava = false): Rig {
  const rig = newRig('biped', 'melee');
  const k = new K();
  k.ball(0.95, 0, 1.25, 0, stone, 1.1, 0.95, 0.85);
  k.ball(0.55, 0, 0.55, 0, shadeHex(stone, -0.1), 1.1, 0.7, 0.9);
  k.ball(0.62, 0, 2.35, 0.1, stone, 1, 0.9, 0.95);
  k.rbox(1.0, 0.18, 0.4, 0.08, 0, 2.55, 0.5, shadeHex(stone, -0.18));
  for (let i = 0; i < 4; i++) k.rbox(0.24, 0.26, 0.24, 0.05, -0.45 + i * 0.3, 2.95, 0.05, stone);
  for (let i = 0; i < 6; i++) k.ball(0.18, Math.cos(i) * 0.7, 1.0 + (i % 3) * 0.4, 0.62, accent, 1.2, 0.5, 0.4);
  addMesh(rig, rig.body, k);
  for (const s of [-1, 1]) addGlow(rig.body, new THREE.SphereGeometry(0.1, 10, 8), eye, s * 0.24, 2.4, 0.66).scale.set(1.4, 0.7, 0.5);
  if (lava) for (let i = 0; i < 5; i++) addGlow(rig.body, new THREE.BoxGeometry(0.06, 0.4, 0.04), eye, -0.5 + i * 0.25, 1.1 + (i % 2) * 0.3, 0.83).rotation.z = (i - 2) * 0.4;
  for (const s of [-1, 1]) {
    const leg = pivot(rig.body, s * 0.45, 0.6, 0);
    const lk = new K();
    lk.ball(0.34, 0, -0.32, 0, stone, 1, 1.1, 1);
    lk.rbox(0.6, 0.22, 0.7, 0.1, 0, -0.55, 0.06, shadeHex(stone, -0.15));
    addMesh(rig, leg, lk);
    rig.legs.push(leg);
    const arm = pivot(rig.body, s * 1.05, 1.9, 0);
    const ak = new K();
    ak.ball(0.36, 0, -0.1, 0, stone);
    ak.ball(0.3, 0, -0.6, 0, shadeHex(stone, -0.08), 1, 1.2, 1);
    ak.ball(0.45, 0, -1.15, 0.05, stone, 1, 0.9, 1);
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
  k.tube(0.6, 0.85, 2.2, 0, 1.4, 0, p.primary, 0, 0, 0, 12);
  for (let i = 0; i < 8; i++) k.pill(0.06, 1.2, Math.cos(i * 0.8) * 0.7, 1.4, Math.sin(i * 0.8) * 0.7, shadeHex(p.primary, -0.2));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    k.ball(0.75, Math.cos(a) * 0.9, 3.0 + Math.sin(i * 1.7) * 0.25, Math.sin(a) * 0.7, i % 2 ? p.secondary : shadeHex(p.secondary, 0.15));
  }
  k.ball(1.0, 0, 3.4, 0, p.secondary);
  k.ball(0.3, 0, 1.55, 0.72, '#2a1a10', 1.5, 0.6, 0.4);
  for (let i = -2; i <= 2; i++) k.spike(0.05, 0.14, i * 0.12, 1.66, 0.8, '#e8dcc0', Math.PI);
  for (let i = 0; i < 6; i++) k.ball(0.1, Math.cos(i * 2.1) * 0.9, 2.7 + (i % 2) * 0.6, 0.8, '#ff7ac8');
  addMesh(rig, rig.body, k);
  for (const s of [-1, 1]) addGlow(rig.body, new THREE.SphereGeometry(0.12, 10, 8), p.accent, s * 0.26, 2.05, 0.74).scale.set(1.3, 0.8, 0.5);
  for (const s of [-1, 1]) {
    const leg = pivot(rig.body, s * 0.4, 0.7, 0);
    const lk = new K();
    lk.tube(0.25, 0.32, 0.7, 0, -0.35, 0, p.primary, 0, 0, 0, 10);
    for (let i = 0; i < 3; i++) lk.pill(0.09, 0.4, (i - 1) * 0.18, -0.65, 0.25, shadeHex(p.primary, -0.1), 1.2, (i - 1) * 0.4, 0);
    addMesh(rig, leg, lk);
    rig.legs.push(leg);
    const arm = pivot(rig.body, s * 0.85, 2.3, 0);
    const ak = new K();
    ak.pill(0.16, 1.1, 0, -0.7, 0, p.primary, 0, 0, s * 0.15);
    for (let i = 0; i < 3; i++) ak.pill(0.06, 0.35, (i - 1) * 0.12, -1.5, 0.1, shadeHex(p.primary, -0.1), 0.3, 0, (i - 1) * 0.4);
    ak.ball(0.35, 0, -0.35, 0.05, p.secondary);
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
  k.add(new THREE.OctahedronGeometry(1.1, 1), p.primary, 0, 2.6, 0, 0, 0, 0, 1, 1.5, 1);
  for (let i = 0; i < 6; i++) k.add(new THREE.OctahedronGeometry(0.35, 0), shadeHex(p.primary, 0.2), Math.cos(i) * 0.9, 1.6 + (i % 3) * 0.5, Math.sin(i) * 0.6, 0, i, 0.4, 1, 1.8, 1);
  addMesh(rig, rig.body, k);
  const core = addGlow(rig.body, new THREE.OctahedronGeometry(0.45, 1), p.secondary, 0, 2.6, 0.6);
  rig.spinners.push(core);
  const ring = new THREE.Group();
  ring.position.y = 2.6;
  rig.body.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sk = new K();
    sk.add(new THREE.OctahedronGeometry(0.28, 0), i % 2 ? p.secondary : p.accent, Math.cos(a) * 1.9, Math.sin(i) * 0.3, Math.sin(a) * 1.9, 0, 0, 0, 1, 1.6, 1);
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
      return golem(p.primary, shadeHex(p.primary, 0.2), p.secondary, true);
    case 'ice_queen':
      return humanoid({ body: p.primary, legs: p.secondary, skin: '#d6eaf8', head: 'long', hair: '#ffffff', headColor: '#ffffff', weapon: 'staff', magic: '#bfe6fa', robe: true, crown: true, cape: p.secondary, trim: '#ffffff', bulk: 1.15, mood: 'sly', eye: '#5dade2' }, 'cast');
    case 'lich_king':
      return humanoid({ body: p.primary, legs: p.primary, skin: '#ece6d6', head: 'skull', headColor: p.secondary, weapon: 'staff', magic: p.accent, robe: true, crown: true, cape: '#2a1338', trim: p.accent, bulk: 1.15, eyeGlow: p.accent }, 'cast');
    case 'mossback':
      return quadruped({ body: p.primary, belly: p.accent, shell: p.secondary, eye: '#ffd34d' });
    case 'yeti_chieftain':
      return humanoid({ body: '#f2f4f7', legs: '#dfe6ee', skin: '#9fb7cc', head: 'horns', headColor: '#e8dcc0', weapon: 'club', bulk: 1.5, mood: 'angry', beard: '#ffffff', eye: '#5dade2' });
    case 'forge_overseer':
      return humanoid({ body: p.primary, legs: '#2c2c2c', skin: '#e9a77a', head: 'fullhelm', headColor: '#4d535c', hair: p.secondary, weapon: 'hammer', bulk: 1.45, eyeGlow: p.secondary, armor: '#5d6670', trim: p.secondary });
    case 'grave_warden':
      return humanoid({ body: p.primary, legs: '#3d3d3d', skin: '#ece6d6', head: 'skull', headColor: '#bdc3c7', weapon: 'sword', shield: 'tower', shieldColor: p.secondary, bulk: 1.3, eyeGlow: p.accent, armor: '#7f8796' });
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
      return humanoid({ body: '#3f8f4a', legs: '#7a5230', skin: SKIN, head: 'hood', headColor: '#2f7a3c', weapon: 'bow', mood: 'sly', eye: '#3f8f4a', trim: '#d9f2a0', ears: 'pointy' }, 'bow');
    case 'oakshield_knight':
      return humanoid({ body: '#4a6fb5', legs: '#5d6b80', skin: SKIN, head: 'helm', headColor: STEEL, weapon: 'sword', shield: 'round', bulk: 1.12, mood: 'brave', mustache: '#a0662e', armor: STEEL, trim: GOLD });
    case 'field_medic':
      return humanoid({ body: '#f4f1e8', legs: '#5aae73', skin: SKIN, head: 'cap', hair: '#8a4b2a', headColor: '#ffffff', weapon: 'potion', mood: 'happy', trim: '#e74c3c' }, 'throw');
    case 'wolf_rider':
      return quadruped({ body: '#7a6a58', belly: '#b3a28c', mane: '#5d4f40', eye: '#ffd34d', rider: { body: '#b5462f', legs: '#5b4a3a', skin: '#e9a77a', head: 'wolfhood', headColor: '#8d7c69', weapon: 'axe', mood: 'angry', beard: '#7a3b1e' } });
    case 'powder_bombardier':
      return humanoid({ body: '#6b5440', legs: '#3a2a1e', skin: SKIN, head: 'goggles', headColor: '#3a2a1e', weapon: 'bomb', mood: 'happy', trim: '#ff9f43' }, 'throw');
    case 'ember_mage':
      return humanoid({ body: '#b03a2e', legs: '#7b241c', skin: '#f8d2ad', head: 'spiky', hair: '#ff7a2a', headColor: '#ff7a2a', weapon: 'staff', magic: '#ff8c1a', robe: true, trim: '#f39c12', mood: 'sly', eye: '#e67e22' }, 'cast');
    case 'hawkeye_ranger':
      return humanoid({ body: '#2e5e3e', legs: '#6b4f2a', skin: SKIN, head: 'hat', headColor: '#7d5d33', weapon: 'bow', cape: '#24502b', mood: 'sly', eye: '#2e5e3e', trim: '#c9a227' }, 'bow');
    case 'dawn_paladin':
      return humanoid({ body: '#fdfefe', legs: '#d4ac0d', skin: SKIN, head: 'helm', headColor: GOLD, weapon: 'goldsword', cape: '#f5b041', bulk: 1.12, mood: 'calm', armor: GOLD, trim: '#fdfefe', eye: '#3498db' });
    case 'bastion_golem':
      return golem('#8e9aa3', '#6aa84f', '#5dade2');
    case 'frost_witch':
      return humanoid({ body: '#1b4f72', legs: '#154360', skin: '#cfe6f7', head: 'wizard', headColor: '#1b4f72', trim: '#bfe6fa', weapon: 'staff', magic: '#bfe6fa', robe: true, mood: 'sly', eye: '#48c9f0' }, 'cast');
    case 'aegis_guardian':
      return humanoid({ body: '#1f618d', legs: '#2c3e50', skin: SKIN, head: 'fullhelm', headColor: '#8fb3d1', hair: '#f5b041', weapon: 'sword', shield: 'tower', bulk: 1.25, eyeGlow: '#ffd34d', armor: '#8fb3d1', trim: GOLD });
    case 'shade_assassin':
      return humanoid({ body: '#2c2c54', legs: '#1c1c3a', skin: '#e9c2a0', head: 'hood', headColor: '#3b3b6e', weapon: 'dagger', cape: '#8e44ad', mood: 'angry', eye: '#b98ee0', trim: '#8e44ad' });
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
  return humanoid({ body: '#7b4fd0', legs: '#3a3550', skin: SKIN, head: 'hair', hair: '#7a3b1e', headColor: '#7a3b1e', weapon: sword, cape, bulk: 1.15, mood: 'brave', armor: '#d5dbe3', trim: GOLD, eye: '#4a7bd0' });
}

export function enemyRig(role: string, world: number, p: { primary: string; secondary: string; accent: string }): Rig {
  const skull = world === 3;
  const skin = skull ? '#ece6d6' : p.primary;
  switch (role) {
    case 'ranged':
      return humanoid(
        {
          body: p.secondary,
          legs: shadeHex(p.secondary, -0.2),
          skin,
          head: skull ? 'skull' : 'hood',
          headColor: shadeHex(p.secondary, 0.1),
          weapon: world === 2 ? 'bomb' : world === 4 || world === 1 ? 'staff' : 'bow',
          magic: p.accent,
          eyeGlow: skull ? p.accent : undefined,
          mood: 'angry',
          eye: '#c0392b',
          ears: skull ? null : 'pointy',
        },
        world === 2 ? 'throw' : world === 4 || world === 1 ? 'cast' : 'bow',
      );
    case 'fast':
      return world === 3
        ? humanoid({ body: p.secondary, legs: p.secondary, skin, head: 'skull', headColor: skin, weapon: 'claws', eyeGlow: p.accent })
        : quadruped({ body: p.primary, belly: p.accent, mane: shadeHex(p.primary, -0.2), eye: world === 2 ? '#ffd34d' : '#ff5c5c' });
    case 'armored':
      return humanoid({ body: p.secondary, legs: '#3d3d3d', skin, head: 'fullhelm', headColor: world === 4 ? p.primary : '#7f8796', hair: p.accent, weapon: 'hammer', shield: 'round', shieldColor: '#5d6670', bulk: 1.38, eyeGlow: p.accent, armor: '#7f8796', trim: p.accent });
    case 'flying': {
      const kind = (['moth', 'wisp', 'drake', 'wisp', 'bat'] as const)[world] ?? 'bat';
      return flyer({ kind, body: p.primary, wing: kind === 'moth' ? p.accent : p.secondary, accent: p.accent, eye: kind === 'wisp' ? p.secondary : '#c0392b' });
    }
    default:
      return humanoid({
        body: p.secondary,
        legs: shadeHex(p.secondary, -0.2),
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
