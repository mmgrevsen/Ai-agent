import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { registerMetal } from '../../base3d/kit';
import { K, shade, shapeFrom } from '../../base3d/sculpt';
import { glowColor } from '../../base3d/style';
import type { ArenaLook } from './look';
import { fireMaterial, KIND_PAVE, KIND_PLAIN, KIND_WALL, poolTexture, stoneMaterial } from './materials';
import { archFrame, archOutline, Batch, bannerPart, BRAZIER_FLAME_Y, brazierPart, IRON, merlonRow, partOf, slabGeo, squareTower, statuePart } from './parts';

/**
 * The battle arena: a gothic castle courtyard. Coordinates are battlefield-local: x runs along the
 * lane (hero gate at about -25, enemy portal at +23.8, the camera looks from -x), z across it
 * (the fighting lane is |z| <= 4.8), y up. Everything static is merged into three stone meshes
 * (paving, shadow-casting props, distant castle and mountains), one additive fire mesh, one light
 * pool mesh and one glow mesh, so the whole arena costs only a handful of draw calls.
 */
export interface Courtyard {
  group: THREE.Group;
  sky: THREE.Texture;
  update: (t: number, dt: number) => void;
}

/** Inner faces of the side walls and edges of the sunken lane. */
const WALL_Z = 13;
const LANE_HALF = 6.4;
const KERB = 0.55;
const TERRACE_Y = 0.32;
/** Front face of the far curtain wall (behind the enemy portal). */
const FAR_X = 30;
/** Bays of the side walls (banner + brazier) and the buttresses / statues between them. */
const BAYS = [-16.75, -6, 5, 16];
const PIERS = [-22, -11.5, -0.5, 10.5, 21.5];

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

const mixHex = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

/** Painted backdrop: sky gradient, sun glow, soft clouds (and stars at night). */
function skyTexture(look: ArenaLook, rand: () => number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, look.sky[0]);
  g.addColorStop(0.55, look.sky[1]);
  g.addColorStop(1, look.sky[2]);
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 512);
  if (look.stars) {
    for (let i = 0; i < 180; i++) {
      x.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.6})`;
      x.fillRect(rand() * 256, rand() * 330, rand() < 0.1 ? 2 : 1, 1);
    }
  }
  const sx = 190;
  const sy = 400;
  const sg = x.createRadialGradient(sx, sy, 0, sx, sy, 260);
  const sun = new THREE.Color(look.sunGlow);
  const rgb = `${Math.round(sun.r * 255)},${Math.round(sun.g * 255)},${Math.round(sun.b * 255)}`;
  sg.addColorStop(0, `rgba(${rgb},0.95)`);
  sg.addColorStop(0.08, `rgba(${rgb},0.55)`);
  sg.addColorStop(0.4, `rgba(${rgb},0.15)`);
  sg.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = sg;
  x.fillRect(0, 0, 256, 512);
  const cl = new THREE.Color(look.cloud);
  const crgb = `${Math.round(cl.r * 255)},${Math.round(cl.g * 255)},${Math.round(cl.b * 255)}`;
  for (let i = 0; i < 22; i++) {
    const cx = rand() * 300 - 20;
    const cy = 120 + rand() * 300;
    const rx = 30 + rand() * 80;
    const ry = 6 + rand() * 14;
    x.save();
    x.translate(cx, cy);
    x.scale(1, ry / rx);
    const cg = x.createRadialGradient(0, 0, 0, 0, 0, rx);
    const a = 0.25 + rand() * 0.4;
    cg.addColorStop(0, `rgba(${crgb},${a})`);
    cg.addColorStop(0.6, `rgba(${crgb},${a * 0.5})`);
    cg.addColorStop(1, `rgba(${crgb},0)`);
    x.fillStyle = cg;
    x.beginPath();
    x.arc(0, 0, rx, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Paving of the lane and the raised side terraces, kerbs and the gold sigil in the middle. */
function buildPaving(look: ArenaLook, rand: () => number, glow: K): K {
  const k = new K();
  const ruin = look.ruin;
  k.add(new THREE.PlaneGeometry(420, 420), look.mortar, 0, 0, 0, -Math.PI / 2);
  const slabColor = () => {
    const base = mixHex(look.pave, look.paveAlt, rand());
    return shade(base, (rand() - 0.5) * 0.26);
  };
  // Lane: big flat slabs, kept below the ground markers (unit shadows sit at y = 0.06)
  const cols = 27;
  const x0 = -29.7;
  const cw = 59.4 / cols;
  const rows = 6;
  const rw = (LANE_HALF * 2) / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cx = x0 + cw * (i + 0.5);
      const cz = -LANE_HALF + rw * (j + 0.5);
      const nearSigil = Math.hypot(cx, cz) < 10;
      if (!nearSigil && ruin > 0 && rand() < ruin * 0.05) {
        // Missing slab: a pit of earth and pebbles
        k.add(new THREE.PlaneGeometry(cw - 0.1, rw - 0.1), shade(look.mortar, 0.25), cx, 0.005, cz, -Math.PI / 2);
        for (let p = 0; p < 3; p++) k.rock(0.12 + rand() * 0.12, cx + (rand() - 0.5) * 1.4, -0.04, cz + (rand() - 0.5) * 1.4, shade(look.paveAlt, -0.1), rand() * 3, 0.5);
        continue;
      }
      const h = nearSigil ? 0.04 : 0.032 + rand() * 0.014;
      const col = slabColor();
      if (!nearSigil && ruin > 0 && rand() < ruin * 0.18) {
        // Cracked in two, the halves slightly apart
        const split = 0.35 + rand() * 0.3;
        const a = cw * split;
        k.add(slabGeo(a - 0.12, rw - 0.08, h, 0.025), col, cx - cw / 2 + a / 2, h / 2, cz, 0, 0, (rand() - 0.5) * 0.02);
        k.add(slabGeo(cw - a - 0.12, rw - 0.08, h, 0.025), shade(col, -0.06), cx + a / 2, h / 2, cz, (rand() - 0.5) * 0.02, rand() * 0.06, 0);
        continue;
      }
      const tilt = nearSigil ? 0 : 0.006;
      k.add(slabGeo(cw - 0.11, rw - 0.11, h, 0.03), col, cx, h / 2, cz, (rand() - 0.5) * tilt, 0, (rand() - 0.5) * tilt);
      if (look.lava && !nearSigil && rand() < 0.12) {
        // Molten seam glowing in the joint beside this slab
        const along = rand() < 0.5;
        if (along) glow.add(new THREE.BoxGeometry(cw * (1 + Math.floor(rand() * 2)), 0.02, 0.06), '#ff6a1a', cx, 0.01, cz + rw / 2);
        else glow.add(new THREE.BoxGeometry(0.06, 0.02, rw), '#ff6a1a', cx + cw / 2, 0.01, cz);
      }
    }
  }
  // Kerbs stepping up to the terraces
  for (const s of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      const x = -28.6 + i * 2.29;
      const tilt = ruin > 0 && rand() < ruin * 0.2 ? 0.08 : 0;
      k.add(slabGeo(2.2, KERB, 0.42, 0.06), shade(look.stoneDark, 0.12 + (rand() - 0.5) * 0.1), x, 0.21, s * (LANE_HALF + KERB / 2), tilt * s, 0, 0);
    }
    // Terrace body and its paving
    const tw = WALL_Z - LANE_HALF - KERB + 1;
    const tz = s * (LANE_HALF + KERB + tw / 2);
    k.box(60, TERRACE_Y, tw, 0.5, 0, tz, shade(look.mortar, 0.08));
    const tc = 24;
    const tcw = 58 / tc;
    const tr = 3;
    const trw = (WALL_Z - LANE_HALF - KERB) / tr;
    for (let i = 0; i < tc; i++) {
      for (let j = 0; j < tr; j++) {
        if (ruin > 0 && rand() < ruin * 0.1) continue;
        const cx = -28 + tcw * (i + 0.5);
        const cz = s * (LANE_HALF + KERB + trw * (j + 0.5));
        const h = 0.06 + rand() * 0.02;
        const tilt = ruin > 0 ? 0.06 * ruin : 0.01;
        k.add(slabGeo(tcw - 0.08, trw - 0.08, h, 0.03), slabColor(), cx, TERRACE_Y + h / 2, cz, (rand() - 0.5) * tilt, 0, (rand() - 0.5) * tilt);
      }
    }
  }
  // Far apron in front of the castle and the strip behind the hero gate
  k.box(4, TERRACE_Y * 0.5, 26, FAR_X - 0.3, 0, 0, shade(look.paveAlt, -0.15));
  return k;
}

/** The order's sigil inlaid in gold: a ring with a cross, the long stroke a sword along the lane. */
function buildSigil(k: K, hex: string, y: number): void {
  const flat = -Math.PI / 2;
  k.add(new THREE.RingGeometry(4.4, 4.8, 72), hex, 0, y, 0, flat);
  k.add(new THREE.RingGeometry(3.8, 3.95, 72), hex, 0, y, 0, flat);
  // Blade: from a point near the hero's side to the hilt beyond the ring
  k.add(new THREE.PlaneGeometry(15.6, 0.42), hex, -0.2, y, 0, flat);
    k.plate(shapeFrom([[0, -0.21], [0, 0.21], [-1.4, 0]]), 0.004, 0, -8.0, y, 0, hex, flat);
  k.add(new THREE.PlaneGeometry(0.36, 3.6), hex, 6.0, y, 0, flat);
  k.add(new THREE.PlaneGeometry(1.6, 0.22), hex, 6.85, y, 0, flat);
  k.add(new THREE.CircleGeometry(0.42, 4), hex, 8.0, y, 0, flat);
  // Cross arm through the ring
  k.add(new THREE.PlaneGeometry(0.36, 10.8), hex, 0, y, 0, flat);
  for (const [x, z] of [[4.6, 0], [-4.6, 0], [0, 4.6], [0, -4.6]] as const) k.add(new THREE.CircleGeometry(0.36, 4), hex, x, y + 0.002, z, flat);
  k.add(new THREE.CircleGeometry(0.62, 4), hex, 0, y + 0.002, 0, flat);
}

/** One side wall (inner face toward the lane) with buttresses, blind gothic arches and battlements. */
function sideWall(look: ArenaLook, rand: () => number, mirror: boolean): THREE.BufferGeometry {
  // Canonical: wall runs along u, front face at w = 0 facing +w; stamped onto the left or right side
  const k = new K();
  const ruin = look.ruin;
  const H = 7.4;
  const u0 = -27;
  const u1 = 31;
  const len = u1 - u0;
  const um = (u0 + u1) / 2;
  const U = (x: number) => (mirror ? -x : x);
  k.box(len, H, 3, U(um), 0, -1.5, look.stone);
  k.box(len, 1.0, 0.4, U(um), TERRACE_Y, 0.15, look.stoneDark);
  k.box(len + 0.3, 0.42, 3.6, U(um), H, -1.4, look.stoneDark);
  k.box(len, 0.24, 0.24, U(um), H * 0.66, 0.08, look.stoneDark);
  merlonRow(k, U(mirror ? u1 : u0), U(mirror ? u0 : u1), H + 0.42, 0.05, look.stone, rand, ruin, 0.8);
  for (const x of PIERS) {
    k.box(1.3, H - 0.8, 1.1, U(x), TERRACE_Y, 0.55, look.stone);
    k.add(new THREE.BoxGeometry(1.3, 0.5, 1.5), look.stoneDark, U(x), H - 0.4, 0.45, -0.55, 0, 0);
  }
  for (const x of BAYS) {
    k.plate(shapeFrom(archOutline(3.4, 3.2, 2.0)), 0.04, 0, U(x), TERRACE_Y + 0.6, 0.03, '#0f0d0c');
    k.plate(archFrame(4.3, 3.4, 3.2, 2.5, 2.0), 0.3, 0, U(x), TERRACE_Y + 0.6, 0.16, look.stoneDark);
    // Twin lancets with a rose above them inside the blind arch (tracery)
    k.box(0.16, 3.6, 0.12, U(x), TERRACE_Y + 0.6, 0.08, look.stoneDark);
    k.ring(0.55, 0.07, U(x), TERRACE_Y + 4.6, 0.1, look.stoneDark, 0);
  }
  return partOf([k, KIND_WALL]);
}

/** The castle across the far end: curtain wall, gatehouse with a great banner, towers, a keep. */
function farCastle(look: ArenaLook, rand: () => number, far: Batch): void {
  const ruin = look.ruin;
  // Canonical frame (facing +w); stamped at x = FAR_X facing the camera (-x)
  const k = new K();
  const W = 50;
  k.box(W, 10.5, 4, 0, 0, -2, look.stone);
  k.box(W + 0.4, 0.45, 4.6, 0, 10.5, -2, look.stoneDark);
  k.box(W, 1.0, 0.5, 0, 0, 0.2, look.stoneDark);
  merlonRow(k, -W / 2, W / 2, 10.95, 0.1, look.stone, rand, ruin, 0.85);
  for (const u of [-19.5, -12.5, 12.5, 19.5]) {
    k.box(1.4, 9.6, 1.4, u, 0, 0.7, look.stone);
    k.add(new THREE.BoxGeometry(1.4, 0.5, 1.8), look.stoneDark, u, 9.6, 0.55, -0.55, 0, 0);
  }
  // Gatehouse with a great pointed gate
  k.box(13, 15.5, 6, 0, 0, -1.5, look.stone);
  k.box(13.6, 0.5, 6.6, 0, 15.5, -1.5, look.stoneDark);
  merlonRow(k, -6.5, 6.5, 16, 1.55, look.stone, rand, ruin, 0.85);
  k.plate(shapeFrom(archOutline(5.0, 4.2, 2.8)), 0.06, 0, 0, 0, 1.53, '#0c0a09');
  k.plate(archFrame(6.6, 5.0, 4.2, 3.6, 2.8), 0.5, 0, 0, 0, 1.75, look.stoneDark);
  for (let i = -3; i <= 3; i++) k.box(0.12, 6.6, 0.12, i * 0.62, 0, 1.6, IRON);
  for (const yy of [2.2, 4.4]) k.box(4.6, 0.12, 0.12, 0, yy, 1.62, IRON);
  // Flanking towers and corner towers
  for (const s of [-1, 1]) {
    squareTower(k, look, rand, s * 8.8, -0.3, 4.6, 20, 7, ruin);
    squareTower(k, look, rand, s * 25, -1.2, 5, 15, 5.5, ruin);
  }
  const wall = partOf([k, KIND_WALL]);
  far.put(wall, FAR_X, 0, 0, -Math.PI / 2);
  wall.dispose();
  // Banners: a great one over the gate and one in each wide bay
  const great = bannerPart(look, 3.6, 6.0, ruin > 0);
  const tall = bannerPart(look, 2.2, 5.0, ruin > 0);
  const place = (part: THREE.BufferGeometry, u: number, y: number, w: number) => far.put(part, FAR_X - w, y, u, -Math.PI / 2);
  place(great, 0, 15.1, 1.55);
  for (const s of [-1, 1]) place(tall, s * 16, 10.1, 0.0);
  // Banners flanking the enemy portal, hung low enough to be seen from the battle camera
  const flank = bannerPart(look, 2.5, 6.4, ruin > 0);
  for (const s of [-1, 1]) place(flank, s * 4.55, 9.3, 1.55);
  flank.dispose();
  great.dispose();
  tall.dispose();
  // The keep and spires rising behind the curtain wall (seen in low views and on the horizon)
  const keep = new K();
  keep.box(18, 24, 12, 0, 0, -16, look.stone);
  keep.box(18.6, 0.6, 12.6, 0, 24, -16, look.stoneDark);
  merlonRow(keep, -9, 9, 24.6, -9.9, look.stone, rand, ruin, 1.0);
  for (const s of [-1, 1]) {
    squareTower(keep, look, rand, s * 9.5, -10.5, 4, 30, 9, ruin);
    keep.tube(2.2, 2.4, 22, s * 15, 11, -20, look.stone, 0, 0, 0, 10);
    keep.add(new THREE.ConeGeometry(2.9, 8, 10), look.slate, s * 15, 26, -20);
  }
  for (const s of [-1, 1]) {
    keep.plate(shapeFrom(archOutline(1.4, 3.0, 1.1)), 0.1, 0, s * 4, 12, -9.95, '#0e0c0b');
    keep.plate(shapeFrom(archOutline(1.4, 3.0, 1.1)), 0.1, 0, s * 4, 18, -9.95, '#0e0c0b');
  }
  const keepPart = partOf([keep, KIND_WALL]);
  far.put(keepPart, FAR_X, 0, 0, -Math.PI / 2);
  keepPart.dispose();
}

/** Distant mountain range around the castle (only seen from low angles). */
function mountains(look: ArenaLook, rand: () => number): K {
  const k = new K();
  for (let i = 0; i < 26; i++) {
    const a = -1.9 + (i / 25) * 3.8 + (rand() - 0.5) * 0.1;
    const d = 190 + rand() * 90;
    const r = 30 + rand() * 40;
    const h = 40 + rand() * 60;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    k.add(new THREE.ConeGeometry(r, h, 6), shade(look.mountain, (rand() - 0.5) * 0.2), x, h / 2 - 4, z, 0, rand() * 3, 0);
    if (look.snow > 0 || rand() < 0.6) k.add(new THREE.ConeGeometry(r * 0.32, h * 0.32, 6), mixHex(look.mountain, '#ffffff', 0.6), x, h - 4 - h * 0.16 + 0.5, z, 0, rand() * 3, 0);
  }
  return k;
}

/** The ally gatehouse behind the hero (dark gothic towers with crimson banners), facing the camera. */
function heroGate(look: ArenaLook, rand: () => number, props: Batch, gx: number): void {
  const k = new K();
  for (const s of [-1, 1]) squareTower(k, look, rand, s * 5.6, 0, 3.8, 7.6, 3.6);
  k.box(7.4, 5.2, 2.8, 0, 0, 0, look.stone);
  k.box(7.8, 0.35, 3.2, 0, 5.2, 0, look.stoneDark);
  merlonRow(k, -3.7, 3.7, 5.55, 1.45, look.stone, rand, 0, 0.7);
  k.plate(shapeFrom(archOutline(3.0, 1.9, 1.5)), 0.05, 0, 0, 0, 1.42, '#0c0a09');
  k.plate(archFrame(3.9, 3.0, 1.9, 2.0, 1.5), 0.35, 0, 0, 0, 1.55, look.stoneDark);
  for (let i = -2; i <= 2; i++) k.box(0.1, 3.2, 0.1, i * 0.55, 0.2, 1.48, IRON);
  // Crest over the arch: crimson shield with the gold sigil
  k.plate(shapeFrom([[-0.65, 0.55], [0.65, 0.55], [0.65, -0.1], [0, -0.7], [-0.65, -0.1]]), 0.1, 0.03, 0, 4.2, 1.5, look.cloth);
  k.ring(0.3, 0.05, 0, 4.15, 1.58, look.gold, 0);
  k.add(new THREE.BoxGeometry(0.08, 0.95, 0.04), look.gold, 0, 4.2, 1.6);
  // Low walls tying the gate to the side walls
  for (const s of [-1, 1]) {
    k.box(6.2, 4.2, 2.2, s * 10.6, 0, -0.2, look.stone);
    merlonRow(k, s * 7.5, s * 13.7, 4.2, 0.9, look.stone, rand, 0, 0.7);
  }
  const part = partOf([k, KIND_WALL]);
  props.put(part, gx, 0, 0, -Math.PI / 2);
  part.dispose();
  const banner = bannerPart(look, 1.5, 3.1);
  for (const s of [-1, 1]) props.put(banner, gx - 1.95, 6.9, s * 5.6, -Math.PI / 2);
  banner.dispose();
}

/** Enemy portal: a pointed stone arch (the swirl inside is added by the battlefield). */
function portalArch(look: ArenaLook, props: Batch, px: number): void {
  const k = new K();
  for (const s of [-1, 1]) {
    k.box(1.5, 0.5, 1.6, s * 2.9, 0, 0, look.stoneDark);
    k.box(1.2, 5.9, 1.2, s * 2.85, 0.5, 0, look.stone);
    k.add(new THREE.ConeGeometry(0.22, 1.1, 4), IRON, s * 3.3, 8.9, 0, 0, Math.PI / 4, 0);
  }
  k.plate(archFrame(7.0, 4.5, 6.2, 2.8, 2.0), 1.2, 0.04, 0, 0.2, 0, look.stoneDark);
  k.add(new THREE.OctahedronGeometry(0.35, 0), look.gold, 0, 9.4, 0, 0, 0, 0, 1, 1.6, 0.6);
  const part = partOf([k, KIND_WALL]);
  props.put(part, px, 0, 0, -Math.PI / 2);
  part.dispose();
}

/**
 * Keeps an additive effect mesh out of the ambient-occlusion pre-pass (which draws every mesh with
 * an override material): there it would write depth and darken the stone around the fire.
 */
function hideFromAO(mesh: THREE.Mesh): void {
  const saved = new THREE.Matrix4();
  mesh.onBeforeRender = (_r, scene) => {
    if (!scene.overrideMaterial) return;
    saved.copy(mesh.matrixWorld);
    mesh.matrixWorld.makeScale(0, 0, 0);
  };
  mesh.onAfterRender = (_r, scene) => {
    if (scene.overrideMaterial) mesh.matrixWorld.copy(saved);
  };
}

interface FlameSpec {
  x: number;
  y: number;
  z: number;
  s: number;
}

/** All flames in one geometry; per-vertex base, height and seed drive the flicker shader. */
function flameMesh(look: ArenaLook, flames: FlameSpec[]): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];
  const cols = [glowColor(look.flame[0], 1.3), glowColor(look.flame[1], 2.0), glowColor(look.flame[2], 2.7)];
  flames.forEach((f, idx) => {
    const seed = (idx * 0.618) % 1;
    const tongues: [number, number, number, number, THREE.Color][] = [
      [0.5, 1.75, 0, 0, cols[0]!],
      [0.36, 1.3, 0, 0, cols[1]!],
      [0.24, 0.8, 0, 0, cols[2]!],
      [0.2, 1.1, 0.3, 0.1, cols[1]!],
      [0.18, 0.95, -0.22, -0.24, cols[1]!],
      [0.16, 1.0, -0.05, 0.3, cols[0]!],
    ];
    tongues.forEach(([r, h, dx, dz, col], ti) => {
      const g = new THREE.ConeGeometry(r * f.s, h * f.s, 7, 1, true).toNonIndexed();
      g.translate(f.x + dx * f.s, f.y + (h * f.s) / 2, f.z + dz * f.s);
      const n = g.getAttribute('position').count;
      const base = new Float32Array(n * 3);
      const aCol = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        base.set([f.x + dx * f.s, f.y, f.z + dz * f.s], i * 3);
        aCol.set([col.r, col.g, col.b], i * 3);
      }
      g.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
      g.setAttribute('aCol', new THREE.BufferAttribute(aCol, 3));
      g.setAttribute('aTip', new THREE.BufferAttribute(new Float32Array(n).fill(h * f.s), 1));
      g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n).fill((seed + ti * 0.137) % 1), 1));
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
      geos.push(g);
    });
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos, false)!, fireMaterial());
  geos.forEach((g) => g.dispose());
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  hideFromAO(mesh);
  return mesh;
}

/** Warm light pools on the stone around each fire (additive decals, one mesh). */
function poolMesh(look: ArenaLook, pools: { x: number; y: number; z: number; r: number }[]): THREE.Mesh {
  const geos = pools.map((p) => {
    const g = new THREE.PlaneGeometry(p.r * 2, p.r * 2);
    g.rotateX(-Math.PI / 2);
    g.translate(p.x, p.y, p.z);
    return g;
  });
  const color = new THREE.Color(look.pool).multiplyScalar(look.poolStrength);
  const mat = new THREE.MeshBasicMaterial({ map: poolTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(mergeGeometries(geos, false)!, mat);
  geos.forEach((g) => g.dispose());
  mesh.renderOrder = 1;
  hideFromAO(mesh);
  return mesh;
}

export function buildCourtyard(idx: number, look: ArenaLook, gateX: number, portalX: number): Courtyard {
  const group = new THREE.Group();
  const rand = seeded(idx * 7919 + 101);
  const anim: ((t: number, dt: number) => void)[] = [];
  registerMetal(look.gold, 0.6);
  registerMetal(IRON, 0.35);
  const material = stoneMaterial(look, `w${idx}`);
  const glowK = new K();

  // Ground: paving, kerbs, terraces and the sigil (receives shadows, casts none)
  const paving = new Batch();
  const pk = buildPaving(look, rand, glowK);
  // A glowing sigil stays faint (below the bloom) so it never reads as a gameplay marker
  if (look.sigilGlow) buildSigil(glowK, mixHex(look.sigilGlow, '#000000', 0.93), 0.046);
  else buildSigil(pk, look.gold, 0.046);
  paving.take(pk, KIND_PAVE);
  group.add(paving.build(material, false));

  // Walls, statues, braziers, banners, both gates (cast shadows)
  const props = new Batch();
  // Backdrop (side walls, far castle, mountains): receives but casts no shadow
  const far = new Batch();
  // The side walls cast no shadow: a low sun from the side would otherwise darken half the lane
  const left = sideWall(look, rand, false);
  const right = sideWall(look, rand, true);
  far.put(left, 0, 0, -WALL_Z, 0);
  far.put(right, 0, 0, WALL_Z, Math.PI);
  left.dispose();
  right.dispose();
  const banner = bannerPart(look, 2.0, 3.7, look.ruin > 0);
  const statue = statuePart(look);
  const broken = statuePart(look, true);
  const brazier = brazierPart(look);
  const flames: FlameSpec[] = [];
  const pools: { x: number; y: number; z: number; r: number }[] = [];
  const addBrazier = (x: number, y: number, z: number) => {
    props.put(brazier, x, y, z, 0);
    flames.push({ x, y: y + BRAZIER_FLAME_Y, z, s: 1 });
    // Glow on the brazier's own platform and spilling onto the lane next to it
    const side = Math.sign(z);
    if (y > 0) {
      pools.push({ x, y: y + 0.1, z: z + side * 0.9, r: 2.5 });
      pools.push({ x, y: 0.05, z: side * 5.0, r: 3.4 });
    } else pools.push({ x, y: 0.05, z, r: 4.2 });
  };
  for (const s of [-1, 1]) {
    for (const x of BAYS) {
      props.put(banner, x, TERRACE_Y + 5.9, s * (WALL_Z - 0.32), s < 0 ? 0 : Math.PI);
      addBrazier(x, TERRACE_Y, s * 7.75);
    }
    PIERS.slice(1).forEach((x, i) => {
      const isBroken = look.ruin > 0 && (i + (s > 0 ? 1 : 0)) % 2 === 0;
      props.put(isBroken ? broken : statue, x, TERRACE_Y, s * 10.2, s < 0 ? 0 : Math.PI, 1.3);
    });
    // Fires flanking the enemy gate, on the terraces in front of the gate towers
    addBrazier(portalX + 2.6, TERRACE_Y, s * 9.4);
  }
  banner.dispose();
  statue.dispose();
  broken.dispose();
  brazier.dispose();

  heroGate(look, rand, props, gateX);
  portalArch(look, props, portalX);
  farCastle(look, rand, far);
  const extras = new K();
  if (look.ruin > 0) {
    // Rubble heaps along the walls and fallen blocks on the terraces
    for (let i = 0; i < 26; i++) {
      const s = rand() < 0.5 ? -1 : 1;
      const x = -26 + rand() * 54;
      const z = s * (WALL_Z - 0.8 - rand() * 4.5);
      extras.rock(0.35 + rand() * 0.6, x, TERRACE_Y - 0.1, z, shade(look.stone, (rand() - 0.3) * 0.2), rand() * 3, 0.6);
      if (rand() < 0.5) extras.box(0.9, 0.55, 0.6, x + 0.8, TERRACE_Y, z + 0.3, look.stone, rand() * 3);
    }
  }
  if (look.snow > 0) {
    // Drifts banked against the walls and plinths
    for (let i = 0; i < 30; i++) {
      const s = rand() < 0.5 ? -1 : 1;
      extras.add(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#e6edf5', -27 + rand() * 56, TERRACE_Y - 0.05, s * (WALL_Z - 0.4 - rand() * 0.8), 0, rand() * 3, 0, 1.2 + rand() * 1.4, 0.35 + rand() * 0.25, 0.7 + rand() * 0.4);
    }
  }
  if (look.crystals) {
    // Violet and teal crystal clusters growing from the wall feet
    for (let i = 0; i < 22; i++) {
      const s = rand() < 0.5 ? -1 : 1;
      const x = -26 + rand() * 54;
      const z = s * (WALL_Z - 0.6 - rand() * 1.2);
      const hex = rand() < 0.6 ? '#9a5cff' : '#3ad6c0';
      for (let j = 0; j < 3; j++) {
        const h = 0.8 + rand() * 1.8;
        glowK.add(new THREE.OctahedronGeometry(0.35, 0), hex, x + (rand() - 0.5) * 0.9, TERRACE_Y + h * 0.5, z + (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 0.6, 0.6 + rand() * 0.4, h * 1.4, 0.6 + rand() * 0.4);
      }
    }
  }
  if (!extras.empty) props.take(extras, KIND_PLAIN);
  const propsMesh = props.build(material, true);
  group.add(propsMesh);

  far.take(mountains(look, rand), KIND_PLAIN);
  const farMesh = far.build(material, false);
  group.add(farMesh);

  const fire = flameMesh(look, flames);
  group.add(fire);
  const poolM = poolMesh(look, pools);
  group.add(poolM);
  const fmat = fire.material as THREE.ShaderMaterial;
  const pmat = poolM.material as THREE.MeshBasicMaterial;
  anim.push((t) => {
    fmat.uniforms.uTime!.value = t;
    pmat.opacity = 0.88 + 0.08 * Math.sin(t * 9.3) + 0.05 * Math.sin(t * 23.1);
  });
  if (!glowK.empty) {
    const gm = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 1, 1).multiplyScalar(look.sigilGlow ? 1.8 : 2.6) });
    const glow = glowK.build(false, gm);
    group.add(glow);
  }

  return {
    group,
    sky: skyTexture(look, rand),
    update: (t, dt) => {
      for (const f of anim) f(t, dt);
    },
  };
}
