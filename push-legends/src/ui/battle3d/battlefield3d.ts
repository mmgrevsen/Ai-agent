import * as THREE from 'three';
import type { WorldDef } from '../../core/content/types';
import { glowMaterial } from '../base3d/style';
import { buildCourtyard } from './arena/courtyard';
import { arenaLook, type ArenaLook } from './arena/look';

/** The 3D battlefield for one world: the castle-courtyard arena, both gates and ambient particles. */
export interface Battlefield {
  group: THREE.Group;
  sky: THREE.Texture;
  fog: string;
  /** Light, sky and palette of this world's arena (read by the scene for its lights). */
  look: ArenaLook;
  update: (t: number, dt: number) => void;
}

/** Battle lane x (0..104) → world X. */
export const XS = 0.44;
export const toX = (x: number): number => (x - 54) * XS;
export const toZ = (lane: number): number => lane * 4.3;
export const FLY_Y = 6;

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildBattlefield(world: WorldDef): Battlefield {
  const idx = world.index;
  const look = arenaLook(idx);
  const rand = seeded(idx * 977 + 13);
  const anim: ((t: number, dt: number) => void)[] = [];
  // The arena is a gothic castle courtyard in every world; the look sets light, palette and props
  const court = buildCourtyard(idx, look, toX(-3.5), toX(108));
  const group = court.group;
  anim.push(court.update);

  // Enemy portal: the swirl inside the stone arch
  const px = toX(108);
  const swirl = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.3, 8, 28), glowMaterial(world.enemyPalette.primary, 2.6));
  swirl.position.set(px, 3.6, 0);
  swirl.rotation.y = Math.PI / 2;
  group.add(swirl);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(2.2, 18), new THREE.MeshBasicMaterial({ color: world.enemyPalette.secondary, transparent: true, opacity: 0.75 }));
  inner.position.set(px - 0.05, 3.6, 0);
  inner.rotation.y = -Math.PI / 2;
  group.add(inner);
  anim.push((t) => {
    swirl.rotation.x = t * 1.6;
    inner.scale.setScalar(0.9 + Math.sin(t * 3) * 0.08);
  });

  // Ambient particles: fireflies, snow, embers, dust, sparkles
  const count = 90;
  const pos = new Float32Array(count * 3);
  const vel: number[] = [];
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() * 2 - 1) * 34;
    pos[i * 3 + 1] = rand() * 16;
    pos[i * 3 + 2] = -14 + rand() * 30;
    vel.push(rand());
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mode = look.particleMode;
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: look.particle, size: mode === 'fall' ? 0.32 : 0.22, transparent: true, opacity: 0.85 }));
  group.add(points);
  anim.push((t, dt) => {
    const a = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const v = vel[i]!;
      let y = a.getY(i);
      let x = a.getX(i);
      if (mode === 'fall') {
        y -= dt * (1.2 + v);
        x += Math.sin(t + v * 9) * dt * 0.6;
      } else if (mode === 'rise') {
        y += dt * (1 + v * 1.5);
        x += Math.sin(t * 2 + v * 9) * dt * 0.4;
      } else {
        y += Math.sin(t * (0.8 + v) + v * 20) * dt * 0.6;
        x += Math.cos(t * (0.6 + v) + v * 10) * dt * 0.6;
      }
      if (y < 0) y = 16;
      if (y > 16) y = 0;
      a.setXY(i, x, y);
    }
    a.needsUpdate = true;
  });

  return {
    group,
    sky: court.sky,
    fog: look.fog,
    look,
    update: (t, dt) => {
      for (const f of anim) f(t, dt);
    },
  };
}
