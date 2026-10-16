import * as THREE from 'three';
import type { BuildingId } from '../../core/content/buildings';
import { disposeTree } from './kit';
import { MAP, PATROLS, PLOTS, ROADS, type Plot } from './layout';
import { heroRig, humanoid } from '../battle3d/units3d';
import { barrel, banner, buildPlot, BUILD_MAT, C, cannon, catapult, crate, flag, lantern, merlons, stoneBox, torch, tower, tree, type Animator, type BuiltPlot, type PlotInfo } from './models';
import { bakeGroundAO, createPipeline, skyEnvironment, type Pipeline } from './render';
import { K, shade as shadeHex, star } from './sculpt';
import { addOutlines, glowMaterial, toonMaterial } from './style';

/**
 * Isometric-style 3D view of the player's base, rendered with three.js. Everything is generated
 * from code (no external models or textures). Plots are rebuilt only when their visible state
 * changes, so React can call `update` freely.
 */
export interface BaseSceneCallbacks {
  onSelect: (id: BuildingId) => void;
}

export interface BaseSceneState {
  plots: Record<BuildingId, PlotInfo>;
  /** Number of soldiers walking around the base. */
  walkers: number;
  soldierColors: string[];
}

const FOV = 35;
const PITCH = (52 * Math.PI) / 180;
const YAW = (18 * Math.PI) / 180;
const MIN_DIST = 22;
const MAX_DIST = 115;

/** Deterministic pseudo-random numbers so the scenery never changes between visits. */
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

function signTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const x = c.getContext('2d')!;
  x.fillStyle = '#5b3a1e';
  x.fillRect(0, 0, 512, 96);
  x.strokeStyle = '#f5c542';
  x.lineWidth = 8;
  x.strokeRect(6, 6, 500, 84);
  x.fillStyle = '#ffe28a';
  x.font = 'bold 54px Georgia, serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 256, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Staggered stone blocks on one face of a long wall. */
function bricksOn(k: K, rand: () => number, axis: 'x' | 'z', sign: 1 | -1, center: number, y0: number, face: number, len: number, h: number): void {
  const bh = 0.48;
  const bw = 1.0;
  const rows = Math.round(h / bh);
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let u = -len / 2 - (r % 2 ? bw / 2 : 0); u < len / 2; u += bw) {
      const a = Math.max(-len / 2, u);
      const b = Math.min(len / 2, u + bw);
      if (b - a < 0.2) continue;
      const c = center + (a + b) / 2;
      const hex = shadeHex(C.stone, (rand() - 0.5) * 0.12);
      if (axis === 'z') k.box(b - a - 0.08, rh - 0.08, 0.1, c, y0 + r * rh + 0.04, face + sign * 0.03, hex);
      else k.box(0.1, rh - 0.08, b - a - 0.08, face + sign * 0.03, y0 + r * rh + 0.04, c, hex);
    }
  }
}

interface Walker {
  mesh: THREE.Object3D;
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  path: [number, number][];
  lengths: number[];
  total: number;
  offset: number;
  speed: number;
}

export class BaseScene {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
  private readonly target = new THREE.Vector3(0, 0, 0);
  private dist = 80;
  private userZoomed = false;
  private readonly world = new THREE.Group();
  private readonly plotGroups = new Map<BuildingId, BuiltPlot>();
  private readonly plotSigs = new Map<BuildingId, string>();
  private readonly hitBoxes: THREE.Mesh[] = [];
  private readonly labels = new Map<BuildingId, HTMLElement>();
  private readonly staticAnimators: Animator[] = [];
  private walkers: Walker[] = [];
  private walkerSig = '';
  private readonly walkerGroup = new THREE.Group();
  private raf: number | null = null;
  private last = 0;
  private time = 0;
  private width = 1;
  private height = 1;
  private readonly resizeObs: ResizeObserver;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dragMoved = 0;
  private pinchDist = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly tmp = new THREE.Vector3();
  reducedMotion: boolean;
  private readonly pixel: boolean;
  private readonly pipeline: Pipeline;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: BaseSceneCallbacks,
    opts: { reducedMotion: boolean; pixel?: boolean },
  ) {
    this.reducedMotion = opts.reducedMotion;
    this.pixel = !!opts.pixel;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    const canvas = this.renderer.domElement;
    canvas.className = `base3d-canvas${this.pixel ? ' pixel' : ''}`;
    canvas.style.touchAction = 'none';
    container.prepend(canvas);

    this.scene.background = new THREE.Color('#a9d4ea');
    this.scene.fog = new THREE.Fog('#bcd9e6', 120, 320);
    // Warm low sun with soft shadows; the sky dome lights the shade and is reflected by metal
    const sunDir = new THREE.Vector3(26, 30, 18).normalize();
    this.scene.environment = skyEnvironment(this.renderer, '#6fa8d6', '#d7e8ee', '#5d7a45', sunDir);
    this.scene.environmentIntensity = 0.5;
    this.scene.add(new THREE.HemisphereLight('#dcecff', '#4d6b35', 0.3));
    const sun = new THREE.DirectionalLight('#ffe6c0', 2.7);
    sun.position.copy(sunDir).multiplyScalar(60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -46;
    sc.right = 46;
    sc.top = 46;
    sc.bottom = -46;
    sc.near = 5;
    sc.far = 120;
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 3;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.pipeline = createPipeline(this.renderer, this.scene, this.camera, {
      msaa: !this.pixel,
      bloom: { strength: 0.35, radius: 0.5, threshold: 2.6 },
      saturation: 1.0,
      contrast: 1.08,
      vignette: 0.26,
      ao: this.pixel ? null : { radius: 1.6, intensity: 1 },
    });
    this.scene.add(this.world);
    this.world.add(this.walkerGroup);
    this.buildStatic();

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Static world ------------------------------------------------------------------------------

  private buildStatic(): void {
    const rand = seeded(1337);
    const { minX, maxX, minZ, maxZ } = MAP;
    // Meadow outside, lush lawn inside the walls
    // Built with the Kit so the meadow gets the same procedural colour patches and grain
    const grass = new K().add(new THREE.PlaneGeometry(500, 500, 40, 40), '#5f8a42', 0, -0.2, 0, -Math.PI / 2).build(false);
    this.world.add(grass);

    const ground = new K();
    ground.box(maxX - minX, 0.2, maxZ - minZ, 0, -0.2, 0, '#76a650');
    // Cobblestone roads
    for (const [x0, z0, x1, z1] of ROADS) {
      ground.box(x1 - x0 + 0.5, 0.06, z1 - z0 + 0.5, (x0 + x1) / 2, -0.02, (z0 + z1) / 2, '#a99b86');
      const step = 0.62;
      for (let x = x0 + step / 2; x < x1; x += step) {
        for (let z = z0 + step / 2; z < z1; z += step) {
          const ox = (Math.floor((z - z0) / step) % 2) * step * 0.5;
          if (x + ox > x1) continue;
          ground.box(step - 0.1, 0.07, step - 0.1, x + ox, 0.0, z, shadeHex('#d6c9b3', (rand() - 0.5) * 0.14), rand() * 0.3);
        }
      }
    }
    // Road over the bridge and out of the gate
    ground.box(5.2, 0.05, 30, 0, -0.15, maxZ + 18, '#cdb894');
    for (let i = 0; i < 30; i++) {
      const a = rand() * Math.PI * 2;
      const r = 34 + rand() * 50;
      ground.add(new THREE.CircleGeometry(2 + rand() * 4, 8), '#66ad48', Math.cos(a) * r, -0.18, Math.sin(a) * r, -Math.PI / 2, 0, rand() * 3);
    }
    const groundMesh = ground.build(false, BUILD_MAT);
    groundMesh.receiveShadow = true;
    this.world.add(groundMesh);

    // Grass tufts and flowers (instanced)
    this.world.add(this.scatterTufts(rand));

    this.world.add(this.buildWalls(rand));
    this.buildMoat(rand);

    // Scenery outside the walls
    const nature = new K();
    for (let i = 0; i < 80; i++) {
      const a = rand() * Math.PI * 2;
      const r = 33 + rand() * 34;
      const x = Math.cos(a) * r * 1.05;
      const z = Math.sin(a) * r;
      if (z > 26 && Math.abs(x) < 7) continue; // keep the gate road clear
      const roll = rand();
      if (roll < 0.72) tree(nature, x, z, 0.9 + rand() * 0.9, rand() < 0.4);
      else if (roll < 0.88) nature.add(new THREE.DodecahedronGeometry(0.7 + rand() * 1.1, 0), rand() < 0.5 ? '#a8a092' : '#968e80', x, 0.3, z, rand(), rand(), rand(), 1, 0.7, 1);
      else for (let j = 0; j < 3; j++) nature.add(new THREE.IcosahedronGeometry(0.55 + rand() * 0.3, 1), j % 2 ? C.leaf : C.leafDark, x + j * 0.6, 0.35, z + (j % 2) * 0.4);
    }
    const natureMesh = nature.build(true, BUILD_MAT);
    bakeGroundAO(natureMesh, 2.5, 0.3);
    this.world.add(natureMesh);
    addOutlines(natureMesh, 0.04, () => true);

    // Plaza: fountain, flagpole, market stalls and lanterns along the avenue
    const deco = new K();
    const g = new THREE.Group();
    catapult(deco, -6.5, 21.5, Math.PI);
    catapult(deco, 6.5, 21.5, Math.PI);
    cannon(deco, -12, 21, Math.PI * 0.95);
    cannon(deco, 12, 21, Math.PI * 1.05);
    for (const [x, z] of [
      [-19.5, 21],
      [-18.6, 21.6],
      [19.5, 21],
      [18.8, 21.8],
    ] as const)
      barrel(deco, x, z);
    for (const [x, z] of [
      [-20, 23],
      [-19, 23.2],
      [20, 23],
      [19.2, 22.9],
    ] as const)
      crate(deco, x, z, 0.9, 0.3);
    banner(deco, -3.4, 18, C.purple, 3.2);
    banner(deco, 3.4, 18, C.purple, 3.2);
    torch(deco, g, -3.3, 23, this.staticAnimators);
    torch(deco, g, 3.3, 23, this.staticAnimators);
    deco.tube(0.1, 0.14, 9, 0, 4.5, -3.5, C.white, 0, 0, 0, 8);
    deco.lathe([[1.0, 0], [0.9, 0.3], [0.5, 0.45]], 0, 0, -3.5, C.stoneDark, 14);
    deco.ball(0.25, 0, 9.1, -3.5, C.gold);
    flag(g, 0.1, 8.1, -3.5, this.staticAnimators, 3, 1.9);
    // Fountain
    deco.lathe([[1.9, 0], [1.95, 0.55], [1.75, 0.6], [1.7, 0.2], [0.001, 0.2]], 0, 0, 4, '#e4dccb', 22);
    deco.tube(1.7, 1.7, 0.04, 0, 0.45, 4, '#6fc8f0', 0, 0, 0, 22);
    deco.lathe([[0.3, 0], [0.18, 0.6], [0.2, 1.1], [0.75, 1.25], [0.7, 1.4], [0.15, 1.45], [0.12, 1.9], [0.25, 2.0]], 0, 0.2, 4, '#efe8da', 16);
    deco.tube(0.65, 0.65, 0.03, 0, 1.55, 4, '#8fd8f5', 0, 0, 0, 16);
    const jets: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glowMaterial('#bfefff', 2.0));
      g.add(d);
      jets.push(d);
    }
    this.staticAnimators.push((t) => {
      jets.forEach((d, i) => {
        const p = (t * 0.9 + i / jets.length) % 1;
        const a = (i / jets.length) * Math.PI * 2;
        const r = 0.2 + p * 1.0;
        d.position.set(Math.cos(a) * r, 2.3 + Math.sin(p * Math.PI) * 0.9 - p * 0.9, 4 + Math.sin(a) * r);
        d.scale.setScalar(1 - p * 0.5);
      });
    });
    // Market stalls with striped awnings
    for (const [x, z, c1] of [
      [-13.5, 8.9, C.red],
      [13.5, 8.9, C.blue],
    ] as const) {
      deco.rbox(3.0, 0.9, 1.4, 0.06, x, 0.45, z, C.wood);
      deco.rbox(3.1, 0.1, 1.5, 0.03, x, 0.95, z, C.woodDark);
      for (const s of [-1, 1]) for (const dz of [-0.6, 0.6]) deco.tube(0.06, 0.06, 2.4, x + s * 1.4, 1.2, z + dz, C.woodDark, 0, 0, 0, 6);
      for (let i = 0; i < 6; i++) deco.rbox(0.52, 0.06, 1.8, 0.02, x - 1.3 + i * 0.52, 2.45 - 0.0, z + 0.1, i % 2 ? c1 : C.white, 0.25, 0, 0);
      for (let i = 0; i < 5; i++) deco.ball(0.15, x - 1.0 + i * 0.5, 1.12, z + 0.2, ['#e74c3c', '#f5b041', '#7bd389', '#f5c542', '#b98eff'][i]!);
    }
    for (const z of [-2, 4, 10, 16]) for (const s of [-1, 1]) {
      const x = s * 3.4;
      deco.tube(0.08, 0.12, 3.2, x, 1.6, z, '#3a3a44', 0, 0, 0, 6);
      deco.rbox(0.7, 0.08, 0.08, 0.02, x - s * 0.3, 3.15, z, '#3a3a44');
      lantern(deco, g, x - s * 0.55, 2.5, z);
    }
    const decoMesh = deco.build(true, BUILD_MAT);
    bakeGroundAO(decoMesh, 2, 0.25);
    g.add(decoMesh);
    addOutlines(g, 0.03, (m) => m.material === BUILD_MAT);
    this.world.add(g);

    this.buildSky(rand);
  }

  private scatterTufts(rand: () => number): THREE.Group {
    const group = new THREE.Group();
    const inRoad = (x: number, z: number) => ROADS.some(([x0, z0, x1, z1]) => x > x0 - 0.6 && x < x1 + 0.6 && z > z0 - 0.6 && z < z1 + 0.6);
    const inPlot = (x: number, z: number) => PLOTS.some((p) => Math.abs(x - p.x) < p.w / 2 + 0.3 && Math.abs(z - p.z) < p.d / 2 + 0.3);
    const tuft = new K();
    for (let j = 0; j < 4; j++) tuft.add(new THREE.ConeGeometry(0.07, 0.45, 4), '#ffffff', Math.cos(j * 1.6) * 0.09, 0.2, Math.sin(j * 1.6) * 0.09, Math.sin(j * 1.6) * 0.3, 0, -Math.cos(j * 1.6) * 0.3);
    const tuftMesh = tuft.build(false, toonMaterial(0.2));
    const flower = new K();
    flower.tube(0.015, 0.015, 0.35, 0, 0.17, 0, '#3d8b37', 0, 0, 0, 4);
    flower.ball(0.1, 0, 0.38, 0, '#ffffff', 1, 0.7, 1);
    flower.ball(0.05, 0, 0.42, 0, '#ffe066');
    const flowerMesh = flower.build(false, toonMaterial(0.2));
    const N = 900;
    const F = 160;
    const tufts = new THREE.InstancedMesh(tuftMesh.geometry, tuftMesh.material as THREE.Material, N);
    const flowers = new THREE.InstancedMesh(flowerMesh.geometry, flowerMesh.material as THREE.Material, F);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    let f = 0;
    const flowerColors = ['#ff8ad8', '#ffffff', '#ffe066', '#b98eff', '#ff7a6a'];
    for (let i = 0; i < 4000 && (n < N || f < F); i++) {
      const outside = rand() < 0.45;
      const x = outside ? (rand() * 2 - 1) * 60 : (rand() * 2 - 1) * (MAP.maxX - 1);
      const z = outside ? (rand() * 2 - 1) * 60 : (rand() * 2 - 1) * (MAP.maxZ - 1);
      if (outside && Math.abs(x) < MAP.maxX + 4 && Math.abs(z) < MAP.maxZ + 4) continue;
      if (!outside && (inRoad(x, z) || inPlot(x, z))) continue;
      const s = 0.7 + rand() * 0.8;
      q.setFromAxisAngle(up, rand() * 6.28);
      m4.compose(new THREE.Vector3(x, outside ? -0.18 : 0, z), q, new THREE.Vector3(s, s, s));
      if (rand() < 0.16 && f < F) {
        flowers.setMatrixAt(f, m4);
        flowers.setColorAt(f, new THREE.Color(flowerColors[f % flowerColors.length]!));
        f++;
      } else if (n < N) {
        tufts.setMatrixAt(n, m4);
        tufts.setColorAt(n, new THREE.Color(outside ? '#5aa83c' : '#63b143').offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.1));
        n++;
      }
    }
    tufts.count = n;
    flowers.count = f;
    group.add(tufts, flowers);
    return group;
  }

  private buildMoat(rand: () => number): void {
    const { minX, maxX, minZ, maxZ } = MAP;
    const w = 3.2;
    const off = 2.4;
    const k = new K();
    const water = new THREE.MeshStandardMaterial({ color: '#3f8fb8', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 });
    const rects: [number, number, number, number][] = [
      [minX - off - w, minZ - off - w, maxX + off + w, minZ - off],
      [minX - off - w, maxZ + off, maxX + off + w, maxZ + off + w],
      [minX - off - w, minZ - off, minX - off, maxZ + off],
      [maxX + off, minZ - off, maxX + off + w, maxZ + off],
    ];
    for (const [x0, z0, x1, z1] of rects) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), water);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, -0.12, (z0 + z1) / 2);
      m.receiveShadow = true;
      this.world.add(m);
      // Stone banks
      const along = x1 - x0 > z1 - z0;
      const len = along ? x1 - x0 : z1 - z0;
      for (let i = 0; i < len / 1.1; i++) {
        for (const side of [0, 1]) {
          const u = (along ? x0 : z0) + 0.55 + i * 1.1;
          const v = along ? (side ? z1 : z0) : side ? x1 : x0;
          const hex = shadeHex('#b8ae9f', (rand() - 0.5) * 0.12);
          if (along) k.rbox(1.0, 0.3, 0.45, 0.08, u, -0.05, v, hex);
          else k.rbox(0.45, 0.3, 1.0, 0.08, v, -0.05, u, hex);
        }
      }
    }
    // Sparkles on the water
    const sparkles: THREE.Mesh[] = [];
    for (let i = 0; i < 26; i++) {
      const r = rects[i % 4]!;
      const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), glowMaterial('#ffffff', 2.4));
      sp.position.set(r[0] + rand() * (r[2] - r[0]), -0.05, r[1] + rand() * (r[3] - r[1]));
      sp.scale.set(1, 0.3, 1);
      this.world.add(sp);
      sparkles.push(sp);
    }
    this.staticAnimators.push((t) => {
      sparkles.forEach((sp, i) => sp.scale.setScalar(Math.max(0.01, Math.sin(t * 2 + i * 1.7)) * 1.2));
    });
    // Wooden bridge at the gate
    const bz = maxZ + off + w / 2;
    for (let i = 0; i < 9; i++) k.rbox(5.4, 0.16, 0.6, 0.04, 0, 0.12, bz - w / 2 - 0.6 + i * 0.62, i % 2 ? C.wood : shadeHex(C.wood, -0.08));
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) k.tube(0.08, 0.1, 1.0, s * 2.7, 0.6, bz - w / 2 - 0.4 + i * 1.6, C.woodDark, 0, 0, 0, 6);
      k.rbox(0.12, 0.12, w + 1.6, 0.04, s * 2.7, 1.05, bz, C.wood);
    }
    const mesh = k.build(true, BUILD_MAT);
    this.world.add(mesh);
    addOutlines(mesh, 0.03, () => true);
  }

  private buildSky(rand: () => number): void {
    // Drifting clouds and a few birds circling the base
    const clouds = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const k = new K();
      for (let j = 0; j < 5; j++) k.add(new THREE.IcosahedronGeometry(1.6 + rand() * 1.4, 1), '#ffffff', j * 1.9 - 4, rand() * 0.8, (rand() - 0.5) * 1.6, 0, 0, 0, 1, 0.65, 1);
      const m = k.build(false, toonMaterial(0.1));
      // Clouds circle around the outside of the base so they never hide the buildings
      m.userData.angle = (i / 6) * Math.PI * 2 + rand() * 0.5;
      m.userData.radius = 62 + rand() * 14;
      m.position.y = 18 + rand() * 6;
      clouds.add(m);
    }
    this.world.add(clouds);
    const birds: THREE.Group[] = [];
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: '#3a3550' }));
      body.scale.set(1, 0.8, 1.6);
      b.add(body);
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.35), new THREE.MeshStandardMaterial({ color: '#4a4560' }));
        wing.geometry.translate(s * 0.45, 0, 0);
        wing.userData.side = s;
        b.add(wing);
      }
      this.world.add(b);
      birds.push(b);
    }
    this.staticAnimators.push((t) => {
      clouds.children.forEach((c) => {
        const a = (c.userData.angle as number) + t * 0.01;
        c.position.x = Math.cos(a) * (c.userData.radius as number);
        c.position.z = Math.sin(a) * (c.userData.radius as number) * 0.85;
      });
      birds.forEach((b, i) => {
        const a = t * (0.18 + i * 0.03) + i * 1.3;
        const r = 16 + i * 4;
        b.position.set(Math.cos(a) * r, 14 + i * 1.5 + Math.sin(t + i) * 0.6, Math.sin(a) * r * 0.8 - 4);
        b.rotation.y = -a;
        b.children.forEach((w) => {
          if (w.userData.side) w.rotation.z = w.userData.side * Math.sin(t * 9 + i) * 0.6;
        });
      });
    });
  }

  /** Wall segment with stone blocks on the side facing the camera, a walkway and merlons. */
  private wallSegment(k: K, rand: () => number, x0: number, z0: number, x1: number, z1: number, faceSign: 1 | -1): void {
    const h = 3.4;
    const th = 1.4;
    const along = Math.abs(z1 - z0) > Math.abs(x1 - x0);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    k.box(along ? th : len, h, along ? len : th, cx, 0, cz, C.mortar);
    if (along) {
      bricksOn(k, rand, 'x', faceSign, cz, 0, cx + (faceSign * th) / 2, len, h);
      k.rbox(th + 0.25, 0.22, len, 0.05, cx, h + 0.1, cz, C.stoneDark);
      const n = Math.round(len / 1.0);
      for (let i = 0; i < n; i++) for (const s of [-1, 1]) k.rbox(0.4, 0.62, 0.6, 0.08, cx + s * (th / 2 - 0.1), h + 0.5, cz - len / 2 + (len / n) * (i + 0.5), C.stone);
    } else {
      bricksOn(k, rand, 'z', faceSign, cx, 0, cz + (faceSign * th) / 2, len, h);
      k.rbox(len, 0.22, th + 0.25, 0.05, cx, h + 0.1, cz, C.stoneDark);
      const n = Math.round(len / 1.0);
      for (let i = 0; i < n; i++) for (const s of [-1, 1]) k.rbox(0.6, 0.62, 0.4, 0.08, cx - len / 2 + (len / n) * (i + 0.5), h + 0.5, cz + s * (th / 2 - 0.1), C.stone);
    }
  }

  private buildWalls(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    const k = new K();
    const { minX, maxX, minZ, maxZ } = MAP;
    const gateHalf = 3.6;
    // Inner faces of the north, west and east walls face the camera; the south wall shows its outside
    this.wallSegment(k, rand, minX, minZ, maxX, minZ, 1);
    this.wallSegment(k, rand, minX, minZ, minX, maxZ, 1);
    this.wallSegment(k, rand, maxX, minZ, maxX, maxZ, -1);
    this.wallSegment(k, rand, minX, maxZ, -gateHalf - 1.2, maxZ, 1);
    this.wallSegment(k, rand, gateHalf + 1.2, maxZ, maxX, maxZ, 1);
    for (const x of [minX, maxX]) for (const z of [minZ, maxZ]) tower(k, rand, x, z, 2.1, 5.4, 0, C.blue);
    for (const x of [minX, maxX]) tower(k, rand, x, 0, 1.6, 4.6, 0, C.red);
    for (const z of [minZ, maxZ]) for (const x of [-11.5, 11.5]) tower(k, rand, x, z, 1.6, 4.6, 0, C.red);
    // Gatehouse: two tall towers and an arch carrying the sign
    tower(k, rand, -gateHalf - 1.0, maxZ, 1.8, 6.6, 0, C.purple);
    tower(k, rand, gateHalf + 1.0, maxZ, 1.8, 6.6, 0, C.purple);
    stoneBox(k, rand, gateHalf * 2 + 0.6, 1.6, 1.8, 0, 4.4, maxZ, C.stone, false);
    merlons(k, gateHalf * 2 + 0.6, 1.8, 0, 6.0, maxZ, C.stone, false);
    k.add(new THREE.TorusGeometry(gateHalf - 0.2, 0.35, 6, 18, Math.PI), C.stoneDark, 0, 2.2, maxZ + 0.95, 0, 0, 0);
    for (let i = -3; i <= 3; i++) k.rbox(0.13, 1.1, 0.13, 0.03, i * 0.95, 4.0, maxZ + 0.3, C.iron);
    k.rbox(gateHalf * 2, 0.12, 0.13, 0.03, 0, 3.5, maxZ + 0.3, C.iron);
    for (const x of [-17, -7.5, 7.5, 17]) k.cloth(1.2, 2.1, x, 3.1, maxZ + 0.76, C.purple, 2, 0.04, 0.1).plate(star(0.28, 0.12), 0.03, 0.01, x, 2.0, maxZ + 0.86, C.gold);
    // Wooden stakes in front of the south wall
    for (let x = minX + 1; x <= maxX - 1; x += 1.4) {
      if (Math.abs(x) < gateHalf + 3) continue;
      k.add(new THREE.ConeGeometry(0.13, 1.3, 6), C.woodDark, x, 0.45, maxZ + 1.6, 0.5, 0, 0);
    }
    const mesh = k.build(true, BUILD_MAT);
    bakeGroundAO(mesh, 3, 0.3);
    g.add(mesh);
    addOutlines(g, 0.04, () => true);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 1.4), new THREE.MeshBasicMaterial({ map: signTexture('PUSH LEGENDS') }));
    sign.position.set(0, 5.2, maxZ + 0.95);
    g.add(sign);
    return g;
  }

  // --- State ---------------------------------------------------------------------------------------

  update(state: BaseSceneState): void {
    for (const plot of PLOTS) {
      const info = state.plots[plot.id];
      const sig = JSON.stringify(info);
      if (this.plotSigs.get(plot.id) === sig) continue;
      this.plotSigs.set(plot.id, sig);
      this.replacePlot(plot, info);
    }
    const wsig = `${state.walkers}|${state.soldierColors.join(',')}`;
    if (wsig !== this.walkerSig) {
      this.walkerSig = wsig;
      this.buildWalkers(state.walkers, state.soldierColors);
    }
  }

  private replacePlot(plot: Plot, info: PlotInfo): void {
    const old = this.plotGroups.get(plot.id);
    if (old) {
      this.world.remove(old.group);
      disposeTree(old.group);
    }
    const built = buildPlot(plot, info);
    this.world.add(built.group);
    this.plotGroups.set(plot.id, built);
    if (!this.hitBoxes.some((h) => h.userData.id === plot.id)) {
      const hit = new THREE.Mesh(new THREE.BoxGeometry(plot.w, plot.labelY, plot.d), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(plot.x, plot.labelY / 2, plot.z);
      hit.userData.id = plot.id;
      this.world.add(hit);
      this.hitBoxes.push(hit);
    }
  }

  private buildWalkers(count: number, colors: string[]): void {
    for (const w of this.walkers) disposeTree(w.mesh);
    this.walkerGroup.clear();
    this.walkers = [];
    const palette = colors.length ? colors : [C.blue, C.red, C.leaf];
    const add = (rig: { root: THREE.Object3D; legs: THREE.Object3D[]; armR: THREE.Object3D | null; armL: THREE.Object3D | null }, pathIdx: number, offset: number, speed: number) => {
      const mesh = rig.root;
      mesh.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : undefined));
      addOutlines(mesh, 0.02, (m) => !(m.material as THREE.Material).userData?.glow && (m.material as THREE.Material).type === 'MeshStandardMaterial');
      const arms = [rig.armR, rig.armL].filter((a): a is THREE.Object3D => !!a);
      const raw = PATROLS[pathIdx % PATROLS.length]!;
      const path = [...raw, raw[0]!];
      const lengths: number[] = [];
      let total = 0;
      for (let i = 0; i < path.length - 1; i++) {
        const l = Math.hypot(path[i + 1]![0] - path[i]![0], path[i + 1]![1] - path[i]![1]);
        lengths.push(l);
        total += l;
      }
      this.walkerGroup.add(mesh);
      this.walkers.push({ mesh, legs: rig.legs, arms, path, lengths, total, offset: offset * total, speed });
    };
    // The hero: bigger, gold armour and a purple cape
    const hero = heroRig(C.purple, 'goldsword');
    hero.root.scale.setScalar(1.05);
    add(hero, 1, 0.1, 1.6);
    for (let i = 0; i < count; i++) {
      const r = humanoid({ body: palette[i % palette.length]!, legs: '#4a4f5c', skin: '#f6c9a0', head: 'helm', headColor: i % 3 === 0 ? '#8c96a3' : '#cfd6df', weapon: i % 2 ? 'sword' : 'axe', shield: i % 2 ? 'round' : null, mood: 'brave', mustache: i % 4 === 1 ? '#7a4a1f' : undefined });
      r.root.scale.setScalar(0.85);
      add(r, i, ((i * 0.37) % 1) + 0.05, 1.8 + (i % 3) * 0.25);
    }
    this.placeWalkers();
  }

  private placeWalkers(): void {
    for (const w of this.walkers) {
      let d = (w.offset + this.time * w.speed) % w.total;
      for (let i = 0; i < w.lengths.length; i++) {
        const l = w.lengths[i]!;
        if (d <= l || i === w.lengths.length - 1) {
          const [x0, z0] = w.path[i]!;
          const [x1, z1] = w.path[i + 1]!;
          const f = l > 0 ? Math.min(1, d / l) : 0;
          w.mesh.position.set(x0 + (x1 - x0) * f, 0.05 + (this.reducedMotion ? 0 : Math.abs(Math.sin(this.time * 9 + w.offset)) * 0.08), z0 + (z1 - z0) * f);
          w.mesh.rotation.y = Math.atan2(x1 - x0, z1 - z0);
          const swing = this.reducedMotion ? 0 : Math.sin(this.time * 9 + w.offset);
          w.legs.forEach((l, j) => (l.rotation.x = (j ? -swing : swing) * 0.6));
          w.arms.forEach((a, j) => (a.rotation.x = (j ? swing : -swing) * 0.4));
          break;
        }
        d -= l;
      }
    }
  }

  /** Registers the HTML element that floats above a plot (or removes it with null). */
  setLabel(id: BuildingId, el: HTMLElement | null): void {
    if (el) this.labels.set(id, el);
    else this.labels.delete(id);
  }

  /** Smoothly centres the camera on a plot. */
  focus(id: BuildingId): void {
    const p = PLOTS.find((x) => x.id === id);
    if (!p) return;
    this.target.set(p.x, 0, p.z);
    this.clampTarget();
  }

  // --- Camera and input ---------------------------------------------------------------------------

  private defaultDist(): number {
    const aspect = this.width / this.height;
    const fitWidth = 50 / (2 * Math.tan(((FOV / 2) * Math.PI) / 180) * aspect);
    const fitDepth = (48 / (2 * Math.tan(((FOV / 2) * Math.PI) / 180)) / Math.sin(PITCH)) * 0.82;
    return THREE.MathUtils.clamp(Math.max(Math.min(fitWidth, 104), Math.min(fitDepth, 60)), MIN_DIST, MAX_DIST);
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    if (this.pixel) this.renderer.setPixelRatio(Math.min(2, 256 / h));
    this.renderer.setSize(w, h, false);
    this.pipeline.setSize(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.userZoomed) this.dist = this.defaultDist();
  }

  private updateCamera(): void {
    const horiz = this.dist * Math.cos(PITCH);
    this.camera.position.set(this.target.x + horiz * Math.sin(YAW), this.target.y + this.dist * Math.sin(PITCH), this.target.z + horiz * Math.cos(YAW));
    this.camera.lookAt(this.target);
  }

  private clampTarget(): void {
    const slack = Math.max(0, 1 - (this.dist - MIN_DIST) / (MAX_DIST - MIN_DIST));
    const rx = 6 + 16 * slack;
    const rz = 8 + 16 * slack;
    this.target.x = THREE.MathUtils.clamp(this.target.x, -rx, rx);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -rz, rz);
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) this.dragMoved = 0;
    if (this.pointers.size === 2) this.pinchDist = this.currentPinch();
  };

  private currentPinch(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private onPointerMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size >= 2) {
      const d = this.currentPinch();
      if (this.pinchDist > 0 && d > 0) this.zoomBy(this.pinchDist / d);
      this.pinchDist = d;
      this.dragMoved += 10;
      return;
    }
    this.dragMoved += Math.abs(dx) + Math.abs(dy);
    if (this.dragMoved < 6) return;
    const worldPerPx = (2 * this.dist * Math.tan(((FOV / 2) * Math.PI) / 180)) / this.height;
    const right = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));
    const fwd = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));
    this.target.addScaledVector(right, -dx * worldPerPx);
    this.target.addScaledVector(fwd, (dy * worldPerPx) / Math.sin(PITCH));
    this.clampTarget();
  };

  private onPointerUp = (e: PointerEvent): void => {
    const wasTap = this.pointers.size === 1 && this.dragMoved < 6 && e.type === 'pointerup';
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    if (wasTap) this.tap(e.clientX, e.clientY);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.zoomBy(Math.exp(e.deltaY * 0.0012));
  };

  private zoomBy(f: number): void {
    this.userZoomed = true;
    this.dist = THREE.MathUtils.clamp(this.dist * f, MIN_DIST, MAX_DIST);
    this.clampTarget();
  }

  private tap(cx: number, cy: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.hitBoxes, false)[0];
    const id = hit?.object.userData.id as BuildingId | undefined;
    if (id) this.callbacks.onSelect(id);
  }

  // --- Loop ----------------------------------------------------------------------------------------

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden) {
      this.last = now;
      return;
    }
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (!this.reducedMotion) {
      this.time += dt;
      for (const a of this.staticAnimators) a(this.time, dt);
      for (const p of this.plotGroups.values()) for (const a of p.animators) a(this.time, dt);
      this.placeWalkers();
    }
    this.updateCamera();
    this.pipeline.render();
    this.positionLabels();
  };

  private positionLabels(): void {
    for (const [id, el] of this.labels) {
      const p = PLOTS.find((x) => x.id === id);
      if (!p) continue;
      this.tmp.set(p.x, p.labelY, p.z).project(this.camera);
      const visible = this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.15 && Math.abs(this.tmp.y) < 1.15;
      el.style.visibility = visible ? 'visible' : 'hidden';
      // Keep labels inside the frame so names near the edge stay readable
      const half = el.offsetWidth / 2 + 4;
      const x = THREE.MathUtils.clamp(((this.tmp.x + 1) / 2) * this.width, half, Math.max(half, this.width - half));
      const y = ((1 - this.tmp.y) / 2) * this.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  dispose(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.resizeObs.disconnect();
    this.scene.environment?.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('wheel', this.onWheel);
    disposeTree(this.scene);
    this.pipeline.dispose();
    this.renderer.dispose();
    canvas.remove();
  }
}

/** True when the browser can create a WebGL context. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

