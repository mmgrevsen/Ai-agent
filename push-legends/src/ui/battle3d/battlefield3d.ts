import * as THREE from 'three';
import type { WorldDef } from '../../core/content/types';
import { Kit } from '../base3d/kit';
import { barrel, BUILD_MAT, crate, flag, merlons, stoneBox, tower, tree } from '../base3d/models';
import { bakeGroundAO } from '../base3d/render';
import { K, shapeFrom, star } from '../base3d/sculpt';
import { addOutlines } from '../base3d/style';
import { glowMaterial, toonMaterial } from '../base3d/style';

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
  const laneColor = mix(world.ground, idx === 1 ? '#ffffff' : '#e3cf9f', idx >= 2 ? 0.22 : 0.5);
  // Arena: checkered turf, a paved road down the middle and a low border on both sides
  // Natural turf: barely different tiles, the material noise does the variation
  const natural = mix(world.ground, '#7d7a55', idx === 0 ? 0.28 : 0.1);
  const tileA = mix(natural, '#ffffff', idx === 1 ? 0.18 : 0.02);
  const tileB = mix(natural, world.groundDark, 0.07);
  const T = 2.4;
  for (let ix = -13; ix <= 13; ix++) {
    for (let iz = -5; iz <= 5; iz++) {
      const z = iz * T;
      if (Math.abs(z) < 4.6) continue;
      k.box(T, 0.05, T, ix * T, 0, z, (ix + iz) % 2 === 0 ? tileA : tileB);
    }
  }
  k.box(64, 0.06, 9.6, 0, 0, 0, mix(laneColor, world.groundDark, 0.15));
  for (let i = 0; i < 46; i++) {
    const x = -30 + i * 1.32 + (rand() - 0.5) * 0.3;
    for (let j = -2; j <= 2; j++) k.box(1.1 + rand() * 0.15, 0.1, 1.6 + rand() * 0.2, x, 0.02, j * 1.82 + (i % 2) * 0.4, mix(laneColor, '#ffffff', rand() * 0.12), (rand() - 0.5) * 0.1);
  }
  const curb = mix(world.groundDark, '#a8a29a', 0.55);
  for (const z of [-4.95, 4.95]) for (let i = 0; i < 26; i++) k.box(2.2, 0.32, 0.55, -30 + i * 2.4, 0, z, i % 2 ? curb : mix(curb, '#ffffff', 0.12));
  // Border hedges / walls framing the arena
  const borderHex = ['#3f8f3a', '#f2f6fa', '#3a2a26', '#7b7b7b', '#3a2a5a'][idx] ?? '#3f8f3a';
  for (const z of [-14, 14]) {
    for (let i = 0; i < 26; i++) {
      const x = -30 + i * 2.4;
      if (idx === 0 || idx === 1) {
        k.add(new THREE.SphereGeometry(1.25, 12, 8), i % 2 ? borderHex : mix(borderHex, '#ffffff', 0.12), x, 0.7, z, 0, 0, 0, 1.1, 0.75, 0.9);
        if (idx === 0 && i % 3 === 0) k.add(new THREE.SphereGeometry(0.18, 8, 6), i % 2 ? '#ff7ac8' : '#ffe066', x + 0.4, 1.45, z + (z < 0 ? 0.6 : -0.6));
      } else {
        k.box(2.3, 1.1 + (i % 3) * 0.25, 1, x, 0, z, i % 2 ? borderHex : mix(borderHex, '#ffffff', 0.08));
        if (i % 2 === 0) k.box(0.6, 0.4, 1.05, x, 1.1 + (i % 3) * 0.25, z, mix(borderHex, '#ffffff', 0.12));
      }
    }
  }

  // Scenery per world (both sides of the arena) plus small items along the borders
  const back = [...scatter(rand, 40, -42, -16), ...scatter(rand, 40, 16, 42)];
  const front = [...scatter(rand, 10, 15.2, 16.5, 30), ...scatter(rand, 10, -16.5, -15.2, 30)];
  for (let i = 0; i < 60; i++) {
    const x = (rand() * 2 - 1) * 40;
    const z = (rand() < 0.5 ? -1 : 1) * (16 + rand() * 20);
    if (rand() < 0.5) k.add(new THREE.CircleGeometry(0.8 + rand() * 1.6, 8), mix(world.ground, world.groundDark, 0.5), x, 0.02, z, -Math.PI / 2, 0, rand() * 3);
  }
  const props = new Kit();
  const glowGroup = new THREE.Group();
  group.add(glowGroup);
  // Large scenery glows stay just above the bloom threshold so they shine without flooding the view
  const glowMat = (hex: string) => glowMaterial(hex, 2.35);
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
      props.add(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), rand() < 0.5 ? '#ff6fb5' : '#e74c3c', x, 0.38, z);
      props.sphere(0.07, x + 0.15, 0.62, z + 0.2, '#ffffff', 0);
      props.sphere(0.06, x - 0.18, 0.6, z - 0.1, '#ffffff', 0);
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
    props.add(new THREE.CylinderGeometry(4, 6, 1.2, 9), '#ff7a2a', 10, 26.2, -110);
    for (const [x, z] of back) {
      if (rand() < 0.6) props.rock(1 + rand() * 1.6, x, 0, z, rand() < 0.5 ? '#2c2c2c' : '#46302a', rand() * 3, 0.9);
      else {
        const pr = 1 + rand() * 1.5;
        props.add(new THREE.CircleGeometry(pr * 1.15, 9), '#3a201a', x, 0.03, z, -Math.PI / 2, 0, 0);
        props.add(new THREE.CircleGeometry(pr, 9), '#e8561a', x, 0.05, z, -Math.PI / 2, 0, 0);
        const pool = addGlowBox(new THREE.CircleGeometry(pr * 0.45, 9), '#ffb347', x, 0.07, z);
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

  // Ally gatehouse behind the hero (built facing +z, then turned to face the camera at local -x)
  const kx = toX(-3.5);
  const gk = new K();
  const grand = seeded(77);
  for (const x of [-5.6, 5.6]) tower(gk, grand, x, 0, 2.0, 6.4, 0, '#4d5a6a', '#f5c542');
  stoneBox(gk, grand, 7.4, 4.8, 2.6, 0, 0, 0.2, '#ddd5c7');
  merlons(gk, 7.4, 2.6, 0, 4.8, 0.2, '#ddd5c7', false);
  gk.add(new THREE.TorusGeometry(1.75, 0.3, 6, 16, Math.PI), '#b3a999', 0, 2.3, 1.55, 0, 0, 0);
  gk.rbox(3.2, 2.3, 0.15, 0.05, 0, 1.15, 1.48, '#2a1e16');
  gk.add(new THREE.CircleGeometry(1.6, 16, 0, Math.PI), '#2a1e16', 0, 2.3, 1.56, 0, 0, 0);
  for (let i = -3; i <= 3; i++) gk.rbox(0.12, 1.4, 0.12, 0.03, i * 0.45, 3.0, 1.62, '#4d535c');
  gk.rbox(3.2, 0.12, 0.13, 0.03, 0, 2.4, 1.62, '#4d535c');
  for (const x of [-2.6, 2.6]) gk.cloth(1.0, 2.0, x, 4.3, 1.55, '#7b4fd0', 2, 0.04, 0.1).plate(star(0.25, 0.11), 0.03, 0.01, x, 3.3, 1.68, '#f5c542');
  gk.plate(shapeFrom([[-0.6, 0.5], [0.6, 0.5], [0.6, -0.1], [0, -0.6], [-0.6, -0.1]]), 0.08, 0.03, 0, 3.75, 1.6, '#3f72dc').plate(star(0.32, 0.14), 0.04, 0.02, 0, 3.75, 1.68, '#f5c542');
  const gateMesh = gk.build(true, BUILD_MAT);
  bakeGroundAO(gateMesh, 3, 0.3);
  addOutlines(gateMesh, 0.04, () => true);
  gateMesh.rotation.y = -Math.PI / 2;
  gateMesh.position.set(kx, 0, 0);
  group.add(gateMesh);
  for (const z of [-5.6, 5.6]) {
    flag(group, kx, 11.9, z, anim, 2.4, 1.4);
    const pole = new Kit();
    pole.cyl(0.08, 0.08, 2.2, kx, 10.5, z, '#f7f4ee', 6);
    group.add(pole.build(false));
  }

  const portal = new Kit();
  const px = toX(108);
  portal.box(1.2, 7, 1.2, px, 0, -2.8, '#3a3550');
  portal.box(1.2, 7, 1.2, px, 0, 2.8, '#3a3550');
  portal.box(1.4, 1.2, 7, px, 7, 0, '#3a3550');
  for (const z of [-2.8, 2.8]) portal.cone(0.5, 1.2, px, 8.2, z, world.accent, 4);
  group.add(portal.build(true));
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

  // Banners on poles along the arena edges and supplies by the gatehouse
  const deco = new K();
  const bannerHex = ['#7b4fd0', '#3f72dc', '#c0392b', '#5d6670', '#8e44ad'][idx] ?? '#7b4fd0';
  // One banner model (cloth facing +z), placed facing the camera (local -x) along both edges
  const bk = new K();
  bk.tube(0.1, 0.13, 5.2, 0, 2.6, 0, '#4a3a2e', 0, 0, 0, 7);
  bk.ball(0.2, 0, 5.3, 0, '#f5c542');
  bk.tube(0.05, 0.05, 1.5, 0, 4.75, 0.1, '#4a3a2e', 0, 0, Math.PI / 2, 5);
  bk.cloth(1.3, 2.3, 0, 4.7, 0.14, bannerHex, 2, 0.05, 0.12);
  bk.rbox(1.32, 0.1, 0.06, 0.02, 0, 4.3, 0.18, '#f5c542');
  bk.plate(star(0.32, 0.14), 0.03, 0.01, 0, 3.35, 0.22, '#f5c542');
  bk.tube(0.3, 0.36, 0.3, 0, 0.15, 0, '#8a8278', 0, 0, 0, 10);
  const bannerMesh = bk.build(true, BUILD_MAT);
  addOutlines(bannerMesh, 0.035, () => true);
  for (const x of [-21, -9, 3, 15]) {
    for (const z of [-12.4, 12.4]) {
      const m = bannerMesh.clone();
      m.position.set(x, 0, z);
      m.rotation.y = -Math.PI / 2;
      group.add(m);
    }
  }
  const kx2 = toX(-1.5);
  for (const z of [-8.5, 8.5]) {
    barrel(deco, kx2, z);
    barrel(deco, kx2 + 1.1, z + (z < 0 ? -0.3 : 0.3), 0.85);
    crate(deco, kx2 - 0.4, z + (z < 0 ? 1.2 : -1.2), 0.9, 0.3);
  }
  const decoMesh = deco.build(true, BUILD_MAT);
  addOutlines(decoMesh, 0.035, () => true);
  group.add(decoMesh);

  // Lanterns along the road (they glow and bloom)
  const posts = new Kit();
  const lanternHex = ['#ffd27a', '#bfe6ff', '#ff9a4a', '#a8ffcf', '#e0b8ff'][idx] ?? '#ffd27a';
  for (let i = 0; i < 5; i++) {
    const x = -16 + i * 8.5;
    for (const z of [-6.1, 6.1]) {
      const lz = z < 0 ? z + 0.7 : z - 0.7;
      posts.cyl(0.14, 0.2, 3.0, x, 0, z, '#4a3a2e', 8);
      posts.cyl(0.26, 0.26, 0.18, x, 0, z, '#3a2e24', 8);
      posts.box(0.1, 0.1, 0.9, x, 2.9, (z + lz) / 2, '#4a3a2e');
      posts.cyl(0.16, 0.22, 0.12, x, 2.66, lz, '#2e2620', 8);
      posts.cyl(0.18, 0.14, 0.08, x, 2.0, lz, '#2e2620', 8);
      const lamp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), glowMaterial(lanternHex));
      lamp.position.set(x, 2.35, lz);
      group.add(lamp);
      const halo = new THREE.Mesh(new THREE.CircleGeometry(1.4, 20), new THREE.MeshBasicMaterial({ color: lanternHex, transparent: true, opacity: 0.09, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2;
      halo.position.set(x, 0.09, lz);
      group.add(halo);
    }
  }
  group.add(posts.build(true));

  // Instanced grass tufts / pebbles / tiny crystals over the turf
  const tuftGeo = new Kit();
  if (idx === 4) tuftGeo.add(new THREE.OctahedronGeometry(0.16, 0), '#ffffff', 0, 0.2, 0, 0, 0, 0, 1, 2, 1);
  else if (idx === 2 || idx === 3) tuftGeo.rock(0.16, 0, 0, 0, '#ffffff', 0, 0.6);
  else for (let j = 0; j < 4; j++) tuftGeo.add(new THREE.ConeGeometry(0.07, 0.42, 4), '#ffffff', Math.cos(j * 1.6) * 0.08, 0.2, Math.sin(j * 1.6) * 0.08, Math.sin(j * 1.6) * 0.3, 0, -Math.cos(j * 1.6) * 0.3);
  const tuftMesh = tuftGeo.build(false, toonMaterial(0.2));
  const N = 520;
  const tufts = new THREE.InstancedMesh(tuftMesh.geometry, tuftMesh.material as THREE.Material, N);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const base = new THREE.Color(idx === 1 ? '#ffffff' : idx === 4 ? '#b670ff' : mix(world.ground, idx >= 2 ? '#888888' : '#9be37a', 0.35));
  for (let i = 0; i < N; i++) {
    const x = (rand() * 2 - 1) * 31;
    const z = (rand() < 0.5 ? -1 : 1) * (5.6 + rand() * 7.6);
    pv.set(x, 0.02, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
    const s = 0.7 + rand() * 0.8;
    sc.set(s, s, s);
    m4.compose(pv, q, sc);
    tufts.setMatrixAt(i, m4);
    tufts.setColorAt(i, base.clone().offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.12));
  }
  tufts.receiveShadow = true;
  group.add(tufts);

  return {
    group,
    sky: skyTexture(world.sky[0], world.sky[1]),
    fog: world.sky[1],
    update: (t, dt) => {
      for (const f of anim) f(t, dt);
    },
  };
}
