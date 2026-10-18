import * as THREE from 'three';
import type { Kit } from '../base3d/kit';
import { glowMaterial, realMaterial } from '../base3d/style';

/**
 * A model built for the battle animations: a tree of pivots (legs, arms, neck, wings, cape) under
 * `body`. Models face +z with their feet at y = 0. Shared by every unit builder.
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
  /** Head pivot at the neck (humanoids): turned and tilted by the fight animations. */
  neck: THREE.Object3D | null;
  /** Where head parts (and glowing eyes) are attached while the model is built. */
  head: THREE.Object3D | null;
  /** Parts that spin or bob continuously (orbiting shards, floating orbs). */
  spinners: THREE.Object3D[];
  /** Top of the model in local units (before root scale). */
  height: number;
  material: THREE.MeshStandardMaterial;
  kind: 'biped' | 'quad' | 'flyer' | 'float';
  /** Carries a shield in the left hand (raised to block). */
  shield: boolean;
  /** Ranged style used for the attack animation. */
  attack: 'melee' | 'bow' | 'cast' | 'throw';
  /** Extra size factor the battle view applies (giants are drawn larger than troops). */
  presence?: number;
}

export function pivot(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export function rigMaterial(): THREE.MeshStandardMaterial {
  // Characters: light grain and bump (worn cloth, scratched metal), clean enough to read in battle
  const m = realMaterial({ grain: 0.35, bump: 0.45, roughness: 0.74, ornate: 1 });
  // Lathed brims, cloth and wing membranes are open surfaces
  m.side = THREE.DoubleSide;
  return m;
}

export function newRig(kind: Rig['kind'], attack: Rig['attack']): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  return { root, body, legs: [], armR: null, armL: null, wings: [], cape: null, neck: null, head: null, shield: false, spinners: [], height: 2.3, material: rigMaterial(), kind, attack };
}

export function addMesh(rig: Rig, parent: THREE.Object3D, k: Kit): THREE.Mesh {
  const m = k.build(true, rig.material);
  parent.add(m);
  return m;
}

/** Unlit glowing part (eyes, runes, embers, magic) that drives the bloom pass. */
export function addGlow(parent: THREE.Object3D, geo: THREE.BufferGeometry, hex: string, x: number, y: number, z: number, lum = 4): THREE.Mesh {
  const m = new THREE.Mesh(geo, glowMaterial(hex, lum));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
