import * as THREE from 'three';
import { Kit } from '../base3d/kit';

/**
 * Chunky low-poly (voxel-style) battle models built in code. Every model is a small rig of pivots
 * (legs, arms, wings, cape) so the battle scene can animate walking, attacks, hits and deaths.
 * Models face +z with their feet at y = 0; one unit ≈ a 1.9 m tall soldier.
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
  material: THREE.MeshLambertMaterial;
  kind: 'biped' | 'quad' | 'flyer' | 'float';
  /** Ranged style used for the attack animation. */
  attack: 'melee' | 'bow' | 'cast' | 'throw';
}

const mat = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
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
  return { root, body, legs: [], armR: null, armL: null, wings: [], cape: null, spinners: [], height: 2.1, material: mat(), kind, attack };
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

// --- Humanoids -----------------------------------------------------------------------------------

export type HeadKind = 'none' | 'helm' | 'fullhelm' | 'hood' | 'hat' | 'wizard' | 'hair' | 'spiky' | 'horns' | 'skull' | 'cap' | 'goggles' | 'wolfhood';
export type Weapon = 'none' | 'sword' | 'goldsword' | 'bow' | 'staff' | 'bomb' | 'dagger' | 'axe' | 'hammer' | 'potion' | 'claws';

export interface HumanSpec {
  body: string;
  legs: string;
  skin: string;
  head: HeadKind;
  headColor: string;
  weapon: Weapon;
  /** Colour of a staff orb or spell. */
  magic?: string;
  cape?: string;
  shield?: 'round' | 'tower' | null;
  shieldColor?: string;
  hair?: string;
  bulk?: number;
  /** Long robe instead of legs. */
  robe?: boolean;
  crown?: boolean;
  eyeGlow?: string;
}

function headGear(k: Kit, g: THREE.Object3D, spec: HumanSpec, y: number): void {
  const c = spec.headColor;
  switch (spec.head) {
    case 'helm':
      k.box(0.68, 0.34, 0.64, 0, y + 0.3, 0, c);
      k.box(0.1, 0.3, 0.06, 0, y + 0.08, 0.31, c);
      break;
    case 'fullhelm':
      k.box(0.7, 0.66, 0.66, 0, y - 0.04, 0, c);
      k.box(0.5, 0.08, 0.04, 0, y + 0.26, 0.34, '#11131a');
      k.box(0.12, 0.42, 0.24, 0, y + 0.64, -0.05, spec.hair ?? '#f5b041');
      break;
    case 'hood':
      k.box(0.7, 0.66, 0.66, 0, y - 0.04, -0.03, c);
      k.box(0.3, 0.26, 0.3, 0, y + 0.6, -0.15, c);
      break;
    case 'hat':
      k.box(1.05, 0.07, 1.05, 0, y + 0.42, 0, c);
      k.box(0.6, 0.3, 0.6, 0, y + 0.48, 0, c);
      k.box(0.62, 0.07, 0.62, 0, y + 0.5, 0, '#c0392b');
      break;
    case 'wizard':
      k.box(0.95, 0.07, 0.95, 0, y + 0.42, 0, c);
      k.cone(0.4, 0.9, 0, y + 0.48, 0, c, 4, Math.PI / 4);
      break;
    case 'hair':
      k.box(0.64, 0.22, 0.62, 0, y + 0.44, -0.01, spec.hair ?? c);
      k.box(0.64, 0.5, 0.14, 0, y + 0.1, -0.26, spec.hair ?? c);
      break;
    case 'spiky':
      for (let i = 0; i < 5; i++) k.cone(0.16, 0.5, -0.24 + i * 0.12, y + 0.44, -0.05 + (i % 2) * 0.1, spec.hair ?? c, 4);
      break;
    case 'horns':
      for (const s of [-1, 1]) k.add(new THREE.ConeGeometry(0.09, 0.4, 4), c, s * 0.34, y + 0.5, 0, 0, 0, -s * 0.5);
      break;
    case 'skull':
      k.box(0.14, 0.12, 0.04, -0.14, y + 0.22, 0.29, '#11131a');
      k.box(0.14, 0.12, 0.04, 0.14, y + 0.22, 0.29, '#11131a');
      break;
    case 'cap':
      k.box(0.66, 0.2, 0.64, 0, y + 0.46, 0, '#ffffff');
      k.box(0.08, 0.16, 0.04, 0, y + 0.48, 0.33, '#e74c3c');
      k.box(0.18, 0.06, 0.04, 0, y + 0.53, 0.33, '#e74c3c');
      break;
    case 'goggles':
      k.box(0.64, 0.24, 0.62, 0, y + 0.42, -0.01, spec.hair ?? '#3a2a1e');
      k.box(0.66, 0.08, 0.66, 0, y + 0.36, 0, '#5b3a1e');
      k.box(0.16, 0.14, 0.06, -0.14, y + 0.36, 0.33, '#ff9f43');
      k.box(0.16, 0.14, 0.06, 0.14, y + 0.36, 0.33, '#ff9f43');
      break;
    case 'wolfhood':
      k.box(0.72, 0.36, 0.7, 0, y + 0.36, -0.02, c);
      k.box(0.36, 0.2, 0.3, 0, y + 0.4, 0.4, c);
      for (const s of [-1, 1]) k.cone(0.1, 0.26, s * 0.24, y + 0.54, -0.05, c, 4);
      break;
    default:
      break;
  }
  if (spec.crown) {
    for (let i = 0; i < 5; i++) k.box(0.1, 0.18, 0.1, -0.24 + i * 0.12, y + 0.52, 0.26, '#f5c542');
    k.box(0.62, 0.08, 0.62, 0, y + 0.5, 0, '#f5c542');
  }
  void g;
}

function weaponMesh(rig: Rig, hand: THREE.Object3D, spec: HumanSpec): void {
  const w = pivot(hand, 0, -0.62, 0.04);
  w.rotation.x = 0.95;
  const k = new Kit();
  switch (spec.weapon) {
    case 'sword':
    case 'goldsword': {
      const blade = spec.weapon === 'goldsword' ? '#ffd34d' : '#dfe6ee';
      k.box(0.07, 0.24, 0.07, 0, -0.08, 0, '#5b3a1e');
      k.box(0.34, 0.06, 0.1, 0, 0.14, 0, '#f5c542');
      k.box(0.08, 0.95, 0.16, 0, 0.18, 0, blade);
      break;
    }
    case 'dagger':
      k.box(0.06, 0.16, 0.06, 0, -0.04, 0, '#3a2a1e');
      k.box(0.06, 0.45, 0.12, 0, 0.12, 0, '#dfe6ee');
      break;
    case 'axe':
      k.box(0.07, 0.9, 0.07, 0, -0.2, 0, '#7a4a1f');
      k.box(0.08, 0.32, 0.3, 0, 0.5, 0.12, '#aab1bf');
      break;
    case 'hammer':
      k.box(0.08, 0.9, 0.08, 0, -0.2, 0, '#5b3a1e');
      k.box(0.3, 0.3, 0.46, 0, 0.5, 0, '#7f8796');
      break;
    case 'staff':
      k.box(0.07, 1.4, 0.07, 0, -0.4, 0, '#7a4a1f');
      addGlow(w, new THREE.IcosahedronGeometry(0.17, 0), spec.magic ?? '#5dade2', 0, 1.1, 0);
      break;
    case 'bomb':
      k.sphere(0.2, 0, 0.12, 0, '#2b2b33', 1);
      addGlow(w, new THREE.OctahedronGeometry(0.08), '#ffd34d', 0, 0.38, 0);
      break;
    case 'potion':
      k.box(0.18, 0.24, 0.18, 0, 0.0, 0, '#7bd389');
      k.box(0.08, 0.08, 0.08, 0, 0.24, 0, '#a0662e');
      break;
    case 'claws':
      for (const s of [-1, 0, 1]) k.box(0.04, 0.3, 0.06, s * 0.08, 0.1, 0.05, '#f2ead0');
      break;
    default:
      break;
  }
  if (!k.empty) addMesh(rig, w, k);
}

/** A humanoid rig. Body height ≈ 2.1 units. */
export function humanoid(spec: HumanSpec, attack: Rig['attack'] = 'melee'): Rig {
  const rig = newRig('biped', attack);
  const b = spec.bulk ?? 1;
  const torso = new Kit();
  if (spec.robe) {
    torso.add(new THREE.CylinderGeometry(0.34 * b, 0.62 * b, 0.95, 6), spec.legs, 0, 0.47, 0);
  }
  torso.box(0.72 * b, 0.78, 0.44 * b, 0, 0.75, 0, spec.body);
  torso.box(0.74 * b, 0.1, 0.46 * b, 0, 0.82, 0, '#5b3a1e');
  // Head
  const hy = 1.53;
  torso.box(0.6, 0.58, 0.56, 0, hy, 0, spec.head === 'skull' ? '#ece6d6' : spec.skin);
  if (spec.head !== 'fullhelm') {
    if (spec.eyeGlow) {
      addGlow(rig.body, new THREE.BoxGeometry(0.12, 0.08, 0.04), spec.eyeGlow, -0.13, hy + 0.32, 0.29);
      addGlow(rig.body, new THREE.BoxGeometry(0.12, 0.08, 0.04), spec.eyeGlow, 0.13, hy + 0.32, 0.29);
    } else if (spec.head !== 'skull') {
      torso.box(0.1, 0.12, 0.04, -0.13, hy + 0.27, 0.28, '#1a1030');
      torso.box(0.1, 0.12, 0.04, 0.13, hy + 0.27, 0.28, '#1a1030');
    }
  } else if (spec.eyeGlow) {
    addGlow(rig.body, new THREE.BoxGeometry(0.4, 0.06, 0.04), spec.eyeGlow, 0, hy + 0.26, 0.345);
  }
  headGear(torso, rig.body, spec, hy);
  addMesh(rig, rig.body, torso);
  rig.height = hy + 0.6 + (spec.head === 'wizard' ? 0.8 : spec.head === 'hat' ? 0.35 : 0.2);
  // Legs
  if (!spec.robe) {
    for (const s of [-1, 1]) {
      const leg = pivot(rig.body, s * 0.18 * b, 0.78, 0);
      const k = new Kit();
      k.box(0.26 * b, 0.8, 0.28, 0, -0.78, 0, spec.legs);
      k.box(0.28 * b, 0.18, 0.34, 0, -0.78, 0.03, '#3a2a1e');
      addMesh(rig, leg, k);
      rig.legs.push(leg);
    }
  }
  // Arms
  for (const s of [-1, 1]) {
    const arm = pivot(rig.body, s * 0.47 * b, 1.46, 0);
    const k = new Kit();
    k.box(0.22, 0.6, 0.24, 0, -0.58, 0, spec.body);
    k.box(0.2, 0.16, 0.2, 0, -0.72, 0, spec.skin);
    addMesh(rig, arm, k);
    if (s === 1) {
      rig.armR = arm;
      weaponMesh(rig, arm, spec);
    } else {
      rig.armL = arm;
      if (spec.shield) {
        const sk = new Kit();
        if (spec.shield === 'round') {
          sk.add(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 10), spec.shieldColor ?? '#9a6430', 0, -0.5, 0.2, Math.PI / 2, 0, 0);
          sk.add(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 8), '#f2c14e', 0, -0.5, 0.26, Math.PI / 2, 0, 0);
        } else {
          sk.box(0.12, 1.2, 0.8, -0.08, -1.05, 0.2, spec.shieldColor ?? '#1f618d');
          sk.box(0.14, 0.24, 0.24, -0.1, -0.55, 0.2, '#f5b041');
        }
        addMesh(rig, arm, sk);
      } else if (spec.weapon === 'bow') {
        const bk = new Kit();
        bk.box(0.07, 0.5, 0.07, 0, -0.62, 0.3, '#7a4a1f');
        bk.box(0.07, 0.36, 0.07, 0, -0.98, 0.18, '#7a4a1f');
        bk.box(0.07, 0.36, 0.07, 0, -0.26, 0.18, '#7a4a1f');
        bk.box(0.02, 1.1, 0.02, 0, -0.62, 0.08, '#f2ead0');
        addMesh(rig, arm, bk);
      } else if (spec.weapon === 'dagger') {
        const dk = new Kit();
        dk.box(0.06, 0.45, 0.12, 0, -0.68, 0.24, '#dfe6ee');
        addMesh(rig, arm, dk);
      }
    }
  }
  // Cape on a pivot so it can sway
  if (spec.cape) {
    const cape = pivot(rig.body, 0, 1.5, -0.24);
    const k = new Kit();
    k.box(0.74 * b, 1.05, 0.06, 0, -1.08, 0, spec.cape);
    addMesh(rig, cape, k);
    rig.cape = cape;
  }
  return rig;
}

// --- Beasts --------------------------------------------------------------------------------------

export interface QuadSpec {
  body: string;
  belly?: string;
  eye?: string;
  scale?: number;
  shell?: string;
  crystal?: string;
  rider?: HumanSpec;
}

export function quadruped(spec: QuadSpec): Rig {
  const rig = newRig('quad', 'melee');
  const k = new Kit();
  k.box(0.75, 0.6, 1.45, 0, 0.62, 0, spec.body);
  if (spec.belly) k.box(0.6, 0.12, 1.2, 0, 0.58, 0, spec.belly);
  k.box(0.6, 0.55, 0.6, 0, 0.9, 0.85, spec.body);
  k.box(0.36, 0.28, 0.36, 0, 0.92, 1.25, spec.belly ?? spec.body);
  k.box(0.1, 0.06, 0.04, 0, 1.06, 1.44, '#1a1030');
  for (const s of [-1, 1]) k.cone(0.1, 0.28, s * 0.2, 1.42, 0.78, spec.body, 4);
  k.add(new THREE.BoxGeometry(0.16, 0.16, 0.7), spec.body, 0, 1.0, -0.95, 0.6, 0, 0);
  if (spec.shell) {
    k.add(new THREE.DodecahedronGeometry(0.75, 0), spec.shell, 0, 1.1, -0.05, 0, 0, 0, 1, 0.65, 1.15);
  }
  if (spec.crystal) {
    for (let i = 0; i < 4; i++) k.cone(0.14, 0.6 + (i % 2) * 0.3, 0, 1.15, -0.5 + i * 0.32, spec.crystal, 4);
  }
  addMesh(rig, rig.body, k);
  for (const s of [-1, 1]) addGlow(rig.body, new THREE.BoxGeometry(0.1, 0.1, 0.04), spec.eye ?? '#ffd34d', s * 0.17, 1.02, 1.16);
  for (const [x, z] of [
    [-0.26, 0.5],
    [0.26, 0.5],
    [-0.26, -0.5],
    [0.26, -0.5],
  ] as const) {
    const leg = pivot(rig.body, x, 0.5, z);
    const lk = new Kit();
    lk.box(0.2, 0.5, 0.22, 0, -0.5, 0, spec.body);
    addMesh(rig, leg, lk);
    rig.legs.push(leg);
  }
  rig.height = 1.6;
  if (spec.rider) {
    const rider = humanoid({ ...spec.rider }, 'melee');
    // Seat the rider: drop the legs and lift the torso onto the back
    for (const l of rider.legs) l.visible = false;
    rider.body.position.set(0, 0.55, -0.1);
    rider.root.scale.setScalar(0.85);
    rig.body.add(rider.root);
    rider.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === rider.material) m.material = rig.material;
    });
    rig.armR = rider.armR;
    rig.armL = rider.armL;
    rig.height = 2.6;
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
  const k = new Kit();
  if (spec.kind === 'drake') {
    k.box(0.8, 0.7, 1.6, 0, 0, 0, spec.body);
    k.box(0.5, 0.5, 0.9, 0, 0.35, 1.0, spec.body);
    k.box(0.6, 0.5, 0.75, 0, 0.55, 1.6, spec.body);
    k.box(0.44, 0.24, 0.4, 0, 0.42, 2.05, spec.accent ?? spec.body);
    for (const s of [-1, 1]) k.add(new THREE.ConeGeometry(0.08, 0.5, 4), '#f3ead2', s * 0.2, 1.0, 1.4, -0.6, 0, -s * 0.3);
    k.add(new THREE.BoxGeometry(0.3, 0.3, 1.2), spec.body, 0, 0.1, -1.3, 0.3, 0, 0);
    k.add(new THREE.BoxGeometry(0.4, 0.06, 0.5), spec.accent ?? spec.wing, 0, 0.3, -1.95, 0.3, 0, 0);
    for (let i = 0; i < 4; i++) k.cone(0.1, 0.3, 0, 0.32, 0.6 - i * 0.45, spec.accent ?? spec.wing, 4);
    rig.height = 1.4;
  } else if (spec.kind === 'bird') {
    k.box(0.7, 0.7, 1.1, 0, 0, 0, spec.body);
    k.box(0.55, 0.55, 0.55, 0, 0.45, 0.6, spec.body);
    k.box(0.2, 0.18, 0.32, 0, 0.38, 0.98, '#f5c542');
    k.add(new THREE.BoxGeometry(0.5, 0.06, 0.8), spec.accent ?? spec.wing, 0, 0.0, -0.8, 0.3, 0, 0);
    rig.height = 1.2;
  } else if (spec.kind === 'wisp') {
    k.sphere(0.45, 0, 0, 0, spec.body, 1);
    k.cone(0.35, 0.8, 0, -0.95, 0, spec.wing, 6);
    rig.height = 0.8;
  } else {
    k.box(0.5, 0.55, 0.7, 0, 0, 0, spec.body);
    k.box(0.45, 0.42, 0.4, 0, 0.18, 0.45, spec.body);
    if (spec.kind === 'bat') for (const s of [-1, 1]) k.cone(0.09, 0.26, s * 0.15, 0.36, 0.42, spec.body, 4);
    else for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.03, 0.4, 0.03), spec.body, s * 0.12, 0.55, 0.6, -0.4, 0, -s * 0.4);
    rig.height = 0.8;
  }
  addMesh(rig, rig.body, k);
  const eyeZ = spec.kind === 'drake' ? 1.97 : spec.kind === 'bird' ? 0.88 : spec.kind === 'wisp' ? 0.42 : 0.66;
  const eyeY = spec.kind === 'drake' ? 0.66 : spec.kind === 'bird' ? 0.55 : spec.kind === 'wisp' ? 0.05 : 0.24;
  for (const s of [-1, 1]) addGlow(rig.body, new THREE.BoxGeometry(0.1, 0.1, 0.04), spec.eye ?? '#1a1030', s * 0.14, eyeY, eyeZ);
  if (spec.kind !== 'wisp') {
    const span = spec.kind === 'drake' ? 1.5 : spec.kind === 'moth' ? 1.0 : spec.kind === 'bird' ? 1.2 : 0.8;
    for (const s of [-1, 1]) {
      const wing = pivot(rig.body, s * 0.3, 0.2, 0);
      const wk = new Kit();
      if (spec.kind === 'moth') {
        wk.box(span, 0.04, 0.9, (s * span) / 2, 0, 0.1, spec.wing);
        wk.box(span * 0.7, 0.05, 0.5, (s * span * 0.4) / 1, 0.01, -0.45, spec.accent ?? spec.wing);
      } else {
        wk.box(span, 0.06, 0.9, (s * span) / 2, 0, 0, spec.wing);
        wk.box(span * 0.6, 0.07, 0.5, s * span * 0.75, 0, -0.45, spec.accent ?? spec.wing);
      }
      addMesh(rig, wing, wk);
      rig.wings.push(wing);
    }
  } else {
    const orb = addGlow(rig.body, new THREE.IcosahedronGeometry(0.22, 0), spec.accent ?? '#ffffff', 0, 0, 0);
    rig.spinners.push(orb);
  }
  return rig;
}

// --- Giants and bosses ---------------------------------------------------------------------------

export function golem(stone: string, accent: string, eye: string): Rig {
  const rig = newRig('biped', 'melee');
  const k = new Kit();
  k.box(1.5, 1.3, 1.0, 0, 0.9, 0, stone);
  k.box(1.2, 0.9, 0.9, 0, 2.1, 0.05, stone);
  for (let i = 0; i < 4; i++) k.box(0.22, 0.26, 0.22, -0.45 + i * 0.3, 3.0, 0.05, stone);
  k.box(0.5, 0.2, 0.3, -0.35, 1.5, 0.45, accent);
  k.box(0.3, 0.16, 0.3, 0.5, 0.9, 0.45, accent);
  addMesh(rig, rig.body, k);
  addGlow(rig.body, new THREE.BoxGeometry(0.26, 0.12, 0.04), eye, -0.26, 2.45, 0.52);
  addGlow(rig.body, new THREE.BoxGeometry(0.26, 0.12, 0.04), eye, 0.26, 2.45, 0.52);
  for (const s of [-1, 1]) {
    const leg = pivot(rig.body, s * 0.42, 0.9, 0);
    const lk = new Kit();
    lk.box(0.5, 0.9, 0.55, 0, -0.9, 0, stone);
    addMesh(rig, leg, lk);
    rig.legs.push(leg);
    const arm = pivot(rig.body, s * 0.95, 2.1, 0);
    const ak = new Kit();
    ak.box(0.45, 1.0, 0.5, 0, -1.0, 0, stone);
    ak.box(0.62, 0.55, 0.62, 0, -1.4, 0.05, stone);
    addMesh(rig, arm, ak);
    if (s === 1) rig.armR = arm;
    else rig.armL = arm;
  }
  rig.height = 3.3;
  return rig;
}

function treant(p: { primary: string; secondary: string; accent: string }): Rig {
  const rig = newRig('biped', 'melee');
  const k = new Kit();
  k.box(1.2, 2.0, 0.9, 0, 0.9, 0, p.primary);
  k.box(0.9, 0.5, 0.7, 0, 2.9, 0, p.primary);
  k.sphere(1.0, 0, 3.7, 0, p.secondary, 0);
  k.sphere(0.7, 0.7, 3.3, -0.2, p.secondary, 0);
  k.sphere(0.7, -0.7, 3.4, 0.1, p.secondary, 0);
  k.box(0.7, 0.14, 0.04, 0, 1.9, 0.46, '#2a1a10');
  addMesh(rig, rig.body, k);
  addGlow(rig.body, new THREE.BoxGeometry(0.22, 0.14, 0.04), p.accent, -0.25, 2.4, 0.46);
  addGlow(rig.body, new THREE.BoxGeometry(0.22, 0.14, 0.04), p.accent, 0.25, 2.4, 0.46);
  for (const s of [-1, 1]) {
    const leg = pivot(rig.body, s * 0.38, 0.9, 0);
    const lk = new Kit();
    lk.box(0.42, 0.9, 0.5, 0, -0.9, 0, p.primary);
    lk.box(0.7, 0.16, 0.7, 0, -0.9, 0.1, p.primary);
    addMesh(rig, leg, lk);
    rig.legs.push(leg);
    const arm = pivot(rig.body, s * 0.8, 2.6, 0);
    const ak = new Kit();
    ak.box(0.3, 1.4, 0.3, 0, -1.3, 0, p.primary);
    ak.sphere(0.4, 0, -1.4, 0.1, p.secondary, 0);
    addMesh(rig, arm, ak);
    if (s === 1) rig.armR = arm;
    else rig.armL = arm;
  }
  rig.height = 4.6;
  return rig;
}

function crystalHeart(p: { primary: string; secondary: string; accent: string }): Rig {
  const rig = newRig('float', 'cast');
  const k = new Kit();
  k.add(new THREE.OctahedronGeometry(1.1, 0), p.primary, 0, 2.6, 0, 0, 0, 0, 1, 1.5, 1);
  addMesh(rig, rig.body, k);
  const core = addGlow(rig.body, new THREE.OctahedronGeometry(0.45, 0), p.secondary, 0, 2.6, 0.5);
  rig.spinners.push(core);
  const ring = new THREE.Group();
  ring.position.y = 2.6;
  rig.body.add(ring);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sk = new Kit();
    sk.add(new THREE.OctahedronGeometry(0.3, 0), i % 2 ? p.secondary : p.accent, Math.cos(a) * 1.9, Math.sin(i) * 0.3, Math.sin(a) * 1.9, 0, 0, 0, 1, 1.6, 1);
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
    case 'magma_titan': {
      const r = golem(p.primary, p.secondary, p.accent);
      r.height = 3.3;
      return r;
    }
    case 'ice_queen':
      return humanoid({ body: p.primary, legs: p.secondary, skin: '#d6eaf8', head: 'hair', hair: '#ffffff', headColor: '#ffffff', weapon: 'staff', magic: '#bfe6fa', robe: true, crown: true, cape: p.secondary, bulk: 1.2 }, 'cast');
    case 'lich_king':
      return humanoid({ body: p.primary, legs: p.primary, skin: '#ece6d6', head: 'skull', headColor: p.secondary, weapon: 'staff', magic: p.accent, robe: true, crown: true, cape: '#2a1338', bulk: 1.2, eyeGlow: p.accent }, 'cast');
    case 'mossback':
      return quadruped({ body: p.primary, belly: p.accent, shell: p.secondary, eye: '#ffd34d' });
    case 'yeti_chieftain':
      return humanoid({ body: '#f2f4f7', legs: '#dfe6ee', skin: '#cfd8e3', head: 'horns', headColor: p.secondary, weapon: 'hammer', bulk: 1.5, eyeGlow: '#5dade2' });
    case 'forge_overseer':
      return humanoid({ body: p.primary, legs: '#2c2c2c', skin: '#e9a77a', head: 'fullhelm', headColor: '#4d535c', hair: p.secondary, weapon: 'hammer', bulk: 1.45, eyeGlow: p.secondary });
    case 'grave_warden':
      return humanoid({ body: p.primary, legs: '#3d3d3d', skin: '#ece6d6', head: 'skull', headColor: '#bdc3c7', weapon: 'sword', shield: 'tower', shieldColor: p.secondary, bulk: 1.3, eyeGlow: p.accent });
    case 'shardmaw':
      return quadruped({ body: p.primary, belly: p.accent, crystal: p.secondary, eye: '#ffffff' });
    default:
      return golem(p.primary, p.secondary, p.accent);
  }
}

// --- Cards, hero, enemies ------------------------------------------------------------------------

const SKIN = '#f2c79b';

export function cardRig(cardId: string): Rig {
  switch (cardId) {
    case 'thornbow_archer':
      return humanoid({ body: '#3f8f4a', legs: '#8a5a2b', skin: SKIN, head: 'hood', headColor: '#2f6f39', weapon: 'bow' }, 'bow');
    case 'oakshield_knight':
      return humanoid({ body: '#4a6fb5', legs: '#6b7280', skin: SKIN, head: 'helm', headColor: '#c9ced9', weapon: 'sword', shield: 'round', bulk: 1.1 });
    case 'field_medic':
      return humanoid({ body: '#f4f1e8', legs: '#7bd389', skin: SKIN, head: 'cap', headColor: '#ffffff', weapon: 'potion' }, 'throw');
    case 'wolf_rider':
      return quadruped({ body: '#7a6a58', belly: '#a39380', eye: '#ffd34d', rider: { body: '#b5462f', legs: '#5b4a3a', skin: '#e9a77a', head: 'wolfhood', headColor: '#8d7c69', weapon: 'axe' } });
    case 'powder_bombardier':
      return humanoid({ body: '#5b4a3a', legs: '#3a2a1e', skin: SKIN, head: 'goggles', headColor: '#3a2a1e', weapon: 'bomb' }, 'throw');
    case 'ember_mage':
      return humanoid({ body: '#b03a2e', legs: '#7b241c', skin: '#f8cfa5', head: 'spiky', hair: '#ff7a2a', headColor: '#ff7a2a', weapon: 'staff', magic: '#ff8c1a', robe: true }, 'cast');
    case 'hawkeye_ranger':
      return humanoid({ body: '#2e5e3e', legs: '#6b4f2a', skin: SKIN, head: 'hat', headColor: '#7d5d33', weapon: 'bow', cape: '#24502b' }, 'bow');
    case 'dawn_paladin':
      return humanoid({ body: '#f5c542', legs: '#fdfefe', skin: SKIN, head: 'helm', headColor: '#f5c542', weapon: 'goldsword', cape: '#fdfefe', bulk: 1.1 });
    case 'bastion_golem':
      return golem('#8e9aa3', '#6aa84f', '#5dade2');
    case 'frost_witch':
      return humanoid({ body: '#1b4f72', legs: '#154360', skin: '#c9e3f7', head: 'wizard', headColor: '#1b4f72', weapon: 'staff', magic: '#bfe6fa', robe: true }, 'cast');
    case 'aegis_guardian':
      return humanoid({ body: '#1f618d', legs: '#5c86a8', skin: SKIN, head: 'fullhelm', headColor: '#7fa8c9', hair: '#f5b041', weapon: 'sword', shield: 'tower', bulk: 1.25, eyeGlow: '#ffd34d' });
    case 'shade_assassin':
      return humanoid({ body: '#2c2c54', legs: '#1c1c3a', skin: '#e9c2a0', head: 'hood', headColor: '#3b3b6e', weapon: 'dagger', cape: '#8e44ad', eyeGlow: '#b98ee0' });
    case 'storm_adept':
      return humanoid({ body: '#5b2c6f', legs: '#3d1d5e', skin: SKIN, head: 'spiky', hair: '#ece2f5', headColor: '#ece2f5', weapon: 'staff', magic: '#f7dc6f', robe: true, eyeGlow: '#f7dc6f' }, 'cast');
    case 'phoenix_warden':
      return flyer({ kind: 'bird', body: '#e74c3c', wing: '#f39c12', accent: '#f5b041', eye: '#fff3b0' });
    case 'aurora_drake':
      return flyer({ kind: 'drake', body: '#48c9b0', wing: '#a569bd', accent: '#e8f8f5', eye: '#ffffff' });
    default:
      return humanoid({ body: '#7f8c8d', legs: '#566573', skin: SKIN, head: 'helm', headColor: '#c9ced9', weapon: 'sword' });
  }
}

export function heroRig(cape: string, sword: 'sword' | 'goldsword'): Rig {
  return humanoid({ body: '#7b4fd0', legs: '#3a3550', skin: SKIN, head: 'hair', hair: '#7a3b1e', headColor: '#7a3b1e', weapon: sword, cape, bulk: 1.12 });
}

export function enemyRig(role: string, world: number, p: { primary: string; secondary: string; accent: string }): Rig {
  const skull = world === 3;
  switch (role) {
    case 'ranged':
      return humanoid(
        {
          body: p.secondary,
          legs: p.secondary,
          skin: skull ? '#ece6d6' : p.primary,
          head: skull ? 'skull' : 'hood',
          headColor: p.secondary,
          weapon: world === 2 ? 'bomb' : world === 4 || world === 1 ? 'staff' : 'bow',
          magic: p.accent,
          eyeGlow: skull ? p.accent : undefined,
        },
        world === 2 ? 'throw' : world === 4 || world === 1 ? 'cast' : 'bow',
      );
    case 'fast':
      return world === 3
        ? humanoid({ body: p.secondary, legs: p.secondary, skin: '#ece6d6', head: 'skull', headColor: '#ece6d6', weapon: 'claws', eyeGlow: p.accent })
        : quadruped({ body: p.primary, belly: p.accent, eye: world === 2 ? '#ffd34d' : '#ff5c5c' });
    case 'armored':
      return humanoid({ body: p.secondary, legs: '#3d3d3d', skin: skull ? '#ece6d6' : p.primary, head: 'fullhelm', headColor: world === 4 ? p.primary : '#7f8796', hair: p.accent, weapon: 'hammer', shield: 'round', shieldColor: '#5d6670', bulk: 1.35, eyeGlow: p.accent });
    case 'flying': {
      const kind = (['moth', 'wisp', 'drake', 'wisp', 'bat'] as const)[world] ?? 'bat';
      return flyer({ kind, body: p.primary, wing: kind === 'moth' ? p.accent : p.secondary, accent: p.accent, eye: kind === 'wisp' ? p.secondary : '#ff5c5c' });
    }
    default:
      return humanoid({
        body: p.secondary,
        legs: p.secondary,
        skin: skull ? '#ece6d6' : p.primary,
        head: skull ? 'skull' : world === 2 || world === 4 ? 'horns' : 'none',
        headColor: p.accent,
        weapon: world === 0 ? 'claws' : 'dagger',
        eyeGlow: skull ? p.accent : undefined,
      });
  }
}
