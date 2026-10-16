import * as THREE from 'three';
import type { WorldDef } from '../../core/content/types';
import { Kit } from '../base3d/kit';
import { flag, tree } from '../base3d/models';

/** The 3D battlefield for one world: ground, lane, scenery, both bases and ambient particles. */
export interface Battlefield {
  group: THREE.Group;
  sky: THREE.Texture;
  fog: string;
  update: (t: number, dt: number) => void;
}

/** Battle lane x (0..104) → world X. */
export const XS = 0.44;
export const toX = (x: number): number => (x - 54) * XS;
export const toZ = (lane: number): number => lane * 3.2;
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

function skyTexture(top: string, bottom: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mix(a: string, b: string, t: number): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

/** Scatter positions behind (z < 0) and a few in front of the lane. */
function scatter(rand: () => number, n: number, zMin: number, zMax: number, xSpan = 70): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) out.push([(rand() * 2 - 1) * xSpan, zMin + rand() * (zMax - zMin)]);
  return out;
}

export function buildBattlefield(world: WorldDef): Battlefield {
  const group = new THREE.Group();
  const rand = seeded(world.index * 977 + 13);
  const anim: ((t: number, dt: number) => void)[] = [];
  const idx = world.index;

  // Ground and lane
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: world.ground }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  const k = new Kit();
  const laneColor = mix(world.ground, idx === 1 ? '#ffffff' : '#d9c39a', idx >= 2 ? 0.18 : 0.35);
  k.box(64, 0.04, 11.4, 0, 0, 0, mix(world.groundDark, world.ground, 0.4));
  k.box(64, 0.06, 10.2, 0, 0, 0, laneColor);
  // Lane stones / tufts
  for (let i = 0; i < 40; i++) {
    const x = (rand() * 2 - 1) * 28;
    const z = (rand() < 0.5 ? -1 : 1) * (5.4 + rand() * 0.8);
    k.rock(0.18 + rand() * 0.25, x, 0, z, mix(world.groundDark, '#888888', 0.3), rand() * 3, 0.6);
  }

  // Scenery per world
  const back = scatter(rand, 52, -40, -9);
  const front = scatter(rand, 30, 9, 26, 36);
  // Ground detail: darker patches and tufts so the foreground is never empty
  for (let i = 0; i < 70; i++) {
    const x = (rand() * 2 - 1) * 40;
    const z = rand() < 0.6 ? 7 + rand() * 18 : -6 - rand() * 14;
    if (rand() < 0.5) k.add(new THREE.CircleGeometry(0.8 + rand() * 1.6, 6), mix(world.ground, world.groundDark, 0.5), x, 0.02, z, -Math.PI / 2, 0, rand() * 3);
    else for (let j = 0; j < 3; j++) k.box(0.12, 0.3 + rand() * 0.3, 0.12, x + j * 0.18, 0, z + (j % 2) * 0.15, mix(world.groundDark, world.accent, idx === 0 ? 0.1 : 0.3));
  }
  const props = new Kit();
  const glowGroup = new THREE.Group();
  group.add(glowGroup);
  const glowMat = (hex: string) => new THREE.MeshBasicMaterial({ color: hex });
  const addGlowBox = (geo: THREE.BufferGeometry, hex: string, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(geo, glowMat(hex));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    glowGroup.add(m);
    return m;
  };
  if (idx === 0) {
    for (const [x, z] of back) {
      if (rand() < 0.8) tree(props, x, z, 1.6 + rand() * 1.4, rand() < 0.35);
      else props.rock(0.8 + rand(), x, 0, z, '#8d9a7a', rand() * 3);
    }
    for (const [x, z] of front) {
      if (rand() < 0.45) {
        props.sphere(0.7 + rand() * 0.5, x, 0.5, z, rand() < 0.5 ? '#4caf50' : '#2e7d32', 0);
        props.sphere(0.5, x + 0.7, 0.4, z + 0.2, '#66bb6a', 0);
        continue;
      }
      props.cyl(0.08, 0.1, 0.4, x, 0, z, '#f2ead0', 6);
      addGlowBox(new THREE.CylinderGeometry(0.35, 0.1, 0.22, 7), rand() < 0.5 ? '#ff7ac8' : '#9be37a', x, 0.5, z);
    }
  } else if (idx === 1) {
    for (const [x, z] of back) {
      if (rand() < 0.65) {
        const s = 1.6 + rand() * 1.4;
        props.cyl(0.25 * s, 0.3 * s, 1 * s, x, 0, z, '#6b4f2a', 6);
        props.cone(1.3 * s, 2.2 * s, x, 0.9 * s, z, '#2e6b4a', 7);
        props.cone(1.1 * s, 1.2 * s, x, 1.6 * s, z, '#ffffff', 7);
        props.cone(0.8 * s, 1.5 * s, x, 2.3 * s, z, '#2e6b4a', 7);
        props.cone(0.5 * s, 0.8 * s, x, 3.1 * s, z, '#ffffff', 7);
      } else props.add(new THREE.ConeGeometry(0.6 + rand() * 0.6, 2.5 + rand() * 3, 4), '#bfe6fa', x, 1.4, z, 0, rand() * 3, (rand() - 0.5) * 0.3);
    }
    for (const [x, z] of front) {
      if (rand() < 0.4) {
        const s = 0.8 + rand() * 0.5;
        props.cyl(0.15 * s, 0.2 * s, 0.6 * s, x, 0, z, '#6b4f2a', 6);
        props.cone(0.9 * s, 1.6 * s, x, 0.5 * s, z, '#2e6b4a', 7);
        props.cone(0.6 * s, 0.7 * s, x, 1.3 * s, z, '#ffffff', 7);
      } else props.rock(0.5 + rand() * 0.7, x, 0, z, '#ffffff', rand() * 3, 0.45);
    }
  } else if (idx === 2) {
    // Volcano in the distance
    props.cone(28, 26, 10, -0.5, -110, '#2b1b17', 9);
    addGlowBox(new THREE.CylinderGeometry(4, 6, 1.2, 9), '#ff7a2a', 10, 25.6, -110);
    for (const [x, z] of back) {
      if (rand() < 0.6) props.rock(1 + rand() * 1.6, x, 0, z, rand() < 0.5 ? '#2c2c2c' : '#46302a', rand() * 3, 0.9);
      else {
        const pool = addGlowBox(new THREE.CircleGeometry(1 + rand() * 1.5, 7), '#ff6a1a', x, 0.05, z);
        pool.rotation.x = -Math.PI / 2;
      }
    }
    for (const [x, z] of front) {
      props.rock(0.4 + rand() * 0.7, x, 0, z, '#2c2c2c', rand() * 3, 0.8);
      if (rand() < 0.4) {
        const crack = addGlowBox(new THREE.PlaneGeometry(1.8 + rand() * 2, 0.18), '#ff6a1a', x + 1.2, 0.04, z + 0.4, rand() * 3);
        crack.rotation.x = -Math.PI / 2;
      }
    }
  } else if (idx === 3) {
    for (const [x, z] of back) {
      const r = rand();
      if (r < 0.4) {
        const h = 2 + rand() * 4;
        props.box(4 + rand() * 4, h, 1.2, x, 0, z, '#7b7b7b', rand() * 0.4);
        props.crenels(4, x, h, z, '#7b7b7b', false, 0.6, 0.6);
      } else if (r < 0.7) {
        props.cyl(0.6, 0.7, 2 + rand() * 5, x, 0, z, '#8a8a8a', 8);
      } else {
        props.box(0.7, 1.1, 0.25, x, 0, z, '#9aa0a6');
        props.box(0.5, 0.15, 0.27, x, 0.7, z, '#9aa0a6');
      }
    }
    for (const [x, z] of front) {
      const r = rand();
      if (r < 0.45) {
        props.box(0.7, 1.0, 0.24, x, 0, z, '#8d939a', rand() * 0.6);
        props.box(0.9, 0.16, 0.26, x, 0.6, z, '#8d939a', rand() * 0.6);
      } else if (r < 0.75) props.cyl(0.5, 0.6, 0.6 + rand() * 1.4, x, 0, z, '#7b7b7b', 8);
      else props.box(0.36, 0.3, 0.32, x, 0, z, '#ece6d6');
    }
  } else {
    for (const [x, z] of back) {
      const h = 1.5 + rand() * 5;
      const hex = rand() < 0.5 ? '#8e44ad' : '#1abc9c';
      const m = addGlowBox(new THREE.OctahedronGeometry(1, 0), hex, x, h / 2, z, rand() * 3);
      m.scale.set(0.6 + rand() * 0.6, h / 2, 0.6 + rand() * 0.6);
      m.rotation.z = (rand() - 0.5) * 0.5;
    }
    for (const [x, z] of front) {
      props.rock(0.5 + rand() * 0.5, x, 0, z, '#3a2a5a', rand() * 3, 0.7);
      if (rand() < 0.6) {
        const m = addGlowBox(new THREE.OctahedronGeometry(0.5, 0), rand() < 0.5 ? '#b670ff' : '#48e0c8', x + 0.6, 0.6, z, rand() * 3);
        m.scale.set(0.7, 1.4 + rand(), 0.7);
      }
    }
  }
  group.add(k.build(false));
  group.add(props.build(true));

  // Ally keep (left) and enemy portal (right)
  const keep = new Kit();
  const kx = toX(-6);
  keep.box(4.4, 5, 4, kx - 1, 0, -3.5, '#d8d2c6');
  keep.crenels(4.4, kx - 1, 5, -1.6, '#d8d2c6', false, 0.6, 0.5);
  keep.cyl(1.3, 1.4, 7, kx - 3.4, 0, -4.5, '#e3ddd3', 10);
  keep.cone(1.6, 2.4, kx - 3.4, 7, -4.5, '#7b4fd0', 10);
  keep.box(1.6, 2.4, 0.2, kx - 1, 0, -1.45, '#5b3a1e');
  keep.box(1.2, 0.3, 6, kx + 1, 0, 3.4, '#a0703c');
  group.add(keep.build(true));
  flag(group, kx - 3.3, 9.4, -4.5, anim, 2.2, 1.3);
  const pole = new Kit();
  pole.cyl(0.08, 0.08, 1.6, kx - 3.4, 9.0, -4.5, '#f7f4ee', 6);
  group.add(pole.build(false));

  const portal = new Kit();
  const px = toX(108);
  portal.box(1.2, 7, 1.2, px, 0, -2.8, '#3a3550');
  portal.box(1.2, 7, 1.2, px, 0, 2.8, '#3a3550');
  portal.box(1.4, 1.2, 7, px, 7, 0, '#3a3550');
  for (const z of [-2.8, 2.8]) portal.cone(0.5, 1.2, px, 8.2, z, world.accent, 4);
  group.add(portal.build(true));
  const swirl = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.35, 5, 18), new THREE.MeshBasicMaterial({ color: world.enemyPalette.primary }));
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
  const pColor = ['#e6ff8a', '#ffffff', '#ffb347', '#c8c8d0', '#d7b8ff'][idx] ?? '#ffffff';
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: pColor, size: idx === 1 ? 0.32 : 0.24, transparent: true, opacity: 0.9 }));
  group.add(points);
  anim.push((t, dt) => {
    const a = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const v = vel[i]!;
      let y = a.getY(i);
      let x = a.getX(i);
      if (idx === 1) {
        y -= dt * (1.2 + v);
        x += Math.sin(t + v * 9) * dt * 0.6;
      } else if (idx === 2) {
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
    sky: skyTexture(world.sky[0], world.sky[1]),
    fog: world.sky[1],
    update: (t, dt) => {
      for (const f of anim) f(t, dt);
    },
  };
}
