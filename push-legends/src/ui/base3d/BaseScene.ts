import * as THREE from 'three';
import type { BuildingId } from '../../core/content/buildings';
import { disposeTree, Kit } from './kit';
import { MAP, PATROLS, PLOTS, ROADS, type Plot } from './layout';
import { barrel, banner, buildPlot, C, cannon, catapult, crate, flag, soldierMesh, torch, tree, type Animator, type BuiltPlot, type PlotInfo } from './models';

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

interface Walker {
  mesh: THREE.Object3D;
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

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: BaseSceneCallbacks,
    opts: { reducedMotion: boolean; pixel?: boolean },
  ) {
    this.reducedMotion = opts.reducedMotion;
    this.pixel = !!opts.pixel;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.pixel, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.className = `base3d-canvas${this.pixel ? ' pixel' : ''}`;
    canvas.style.touchAction = 'none';
    container.prepend(canvas);

    this.scene.background = new THREE.Color('#bfe3f2');
    this.scene.fog = new THREE.Fog('#bfe3f2', 120, 260);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#caa070', 1.7));
    const sun = new THREE.DirectionalLight('#fff3dc', 2.3);
    sun.position.set(22, 42, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -38;
    sc.right = 38;
    sc.top = 38;
    sc.bottom = -38;
    sc.near = 5;
    sc.far = 120;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
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
    // Grass all around, sand inside the walls
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: C.grass }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.15;
    grass.receiveShadow = true;
    this.world.add(grass);

    const ground = new Kit();
    ground.box(MAP.maxX - MAP.minX, 0.15, MAP.maxZ - MAP.minZ, 0, -0.15, 0, C.sand);
    for (const [x0, z0, x1, z1] of ROADS) {
      ground.box(x1 - x0 + 0.3, 0.05, z1 - z0 + 0.3, (x0 + x1) / 2, 0, (z0 + z1) / 2, C.roadEdge);
      ground.box(x1 - x0, 0.07, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2, C.road);
    }
    // Road out of the gate
    ground.box(5.2, 0.05, 30, 0, -0.12, MAP.maxZ + 15, '#cdb894');
    // A few darker grass patches outside
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const r = 32 + rand() * 40;
      ground.add(new THREE.CircleGeometry(2 + rand() * 4, 7), C.grassDark, Math.cos(a) * r, -0.14, Math.sin(a) * r, -Math.PI / 2, 0, rand() * 3);
    }
    this.world.add(ground.build(false));

    this.world.add(this.buildWalls());

    // Scenery outside the walls
    const nature = new Kit();
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const r = 30 + rand() * 32;
      const x = Math.cos(a) * r * 1.05;
      const z = Math.sin(a) * r;
      if (z > 26 && Math.abs(x) < 6) continue; // keep the gate road clear
      if (rand() < 0.75) tree(nature, x, z, 0.9 + rand() * 0.8, rand() < 0.45);
      else nature.rock(0.6 + rand() * 1.2, x, -0.1, z, rand() < 0.5 ? C.stoneDark : '#a59d90', rand() * 3);
    }
    // Bushes hugging the walls
    for (let i = 0; i < 30; i++) {
      const side = i % 4;
      const t = rand() * 2 - 1;
      const x = side < 2 ? (side === 0 ? MAP.minX - 2 : MAP.maxX + 2) : t * 22;
      const z = side < 2 ? t * 24 : side === 2 ? MAP.minZ - 2 : MAP.maxZ + 2;
      if (side === 3 && Math.abs(x) < 7) continue;
      nature.sphere(0.6 + rand() * 0.5, x, 0.4, z, rand() < 0.5 ? C.leaf : C.leafDark);
    }
    this.world.add(nature.build());

    // Gate decorations: siege engines, supplies, torches and the plaza flag
    const deco = new Kit();
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
    // Plaza flagpole and well
    deco.cyl(0.12, 0.15, 9, 0, 0, -3.5, C.white, 8);
    deco.cyl(0.9, 1, 0.4, 0, 0, -3.5, C.stoneDark, 10);
    deco.sphere(0.25, 0, 9.1, -3.5, C.gold);
    flag(g, 0.12, 8.1, -3.5, this.staticAnimators, 3, 1.9);
    deco.cyl(1.1, 1.2, 0.9, 0, 0, 4, C.stone, 12);
    deco.cyl(0.85, 0.85, 0.05, 0, 0.88, 4, C.water, 12);
    deco.box(0.15, 1.6, 0.15, -1, 0.9, 4, C.woodDark);
    deco.box(0.15, 1.6, 0.15, 1, 0.9, 4, C.woodDark);
    deco.roof(2.6, 0.7, 1.4, 0, 2.5, 4, C.red);
    g.add(deco.build());
    this.world.add(g);
  }

  private buildWalls(): THREE.Group {
    const g = new THREE.Group();
    const k = new Kit();
    const h = 3.2;
    const th = 1.3;
    const { minX, maxX, minZ, maxZ } = MAP;
    const gateHalf = 3.6;
    const wall = (x0: number, z0: number, x1: number, z1: number) => {
      const along = Math.abs(z1 - z0) > Math.abs(x1 - x0);
      const len = Math.hypot(x1 - x0, z1 - z0);
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      k.box(along ? th : len, h, along ? len : th, cx, 0, cz, C.stone);
      k.box(along ? th + 0.2 : len, 0.25, along ? len : th + 0.2, cx, h - 0.25, cz, C.stoneDark);
      // Battlements on the outer edge
      if (along) k.crenels(len, cx + (cx < 0 ? -th / 2 + 0.25 : th / 2 - 0.25), h, cz, C.stone, true, 0.5, 0.55);
      else k.crenels(len, cx, h, cz + (cz < 0 ? -th / 2 + 0.25 : th / 2 - 0.25), C.stone, false, 0.5, 0.55);
    };
    wall(minX, minZ, maxX, minZ);
    wall(minX, minZ, minX, maxZ);
    wall(maxX, minZ, maxX, maxZ);
    wall(minX, maxZ, -gateHalf, maxZ);
    wall(gateHalf, maxZ, maxX, maxZ);

    const tower = (x: number, z: number, r: number, th2: number, roofHex: string) => {
      k.cyl(r, r * 1.08, th2, x, 0, z, C.stone, 10);
      k.cyl(r * 1.18, r * 1.18, 0.4, x, th2, z, C.stoneDark, 10);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        k.box(0.45, 0.5, 0.45, x + Math.cos(a) * r, th2 + 0.4, z + Math.sin(a) * r, C.stone);
      }
      k.cone(r * 1.2, r * 1.5, x, th2 + 0.9, z, roofHex, 10);
      k.box(0.35, 0.7, 0.06, x, th2 * 0.55, z + r + 0.02, '#3b2a55');
    };
    for (const x of [minX, maxX]) for (const z of [minZ, maxZ]) tower(x, z, 2, 5.2, C.blue);
    for (const x of [minX, maxX]) tower(x, 0, 1.5, 4.4, C.red);
    tower(-11.5, minZ, 1.5, 4.4, C.red);
    tower(11.5, minZ, 1.5, 4.4, C.red);
    tower(-11.5, maxZ, 1.5, 4.4, C.red);
    tower(11.5, maxZ, 1.5, 4.4, C.red);

    // Gatehouse: two towers and an arch carrying the sign
    tower(-gateHalf - 0.9, maxZ, 1.6, 6.2, C.purple);
    tower(gateHalf + 0.9, maxZ, 1.6, 6.2, C.purple);
    k.box(gateHalf * 2 + 1.2, 1.3, 1.6, 0, 4.6, maxZ, C.stone);
    k.crenels(gateHalf * 2 + 1.2, 0, 5.9, maxZ + 0.55, C.stone, false, 0.5, 0.5);
    k.box(gateHalf * 2, 0.25, 0.3, 0, 4.4, maxZ + 0.7, C.gold);
    // Open portcullis bars peeking from the arch
    for (let i = -3; i <= 3; i++) k.box(0.12, 0.6, 0.12, i * 1, 3.85, maxZ, C.iron);
    // Wall banners
    for (const x of [-17, -6, 6, 17]) k.box(1.1, 1.8, 0.08, x, 1, maxZ + th / 2 + 0.05, C.purple);
    for (const x of [-17, -6, 6, 17]) k.box(1.1, 0.25, 0.1, x, 2.6, maxZ + th / 2 + 0.06, C.gold);
    // Wooden stakes in front of the south wall (the fantasy take on barbed wire)
    for (let x = minX + 1; x <= maxX - 1; x += 1.4) {
      if (Math.abs(x) < gateHalf + 3) continue;
      k.add(new THREE.ConeGeometry(0.14, 1.3, 5), C.woodDark, x, 0.45, maxZ + 2.1, 0.5, 0, 0);
    }
    g.add(k.build());

    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 1.4), new THREE.MeshBasicMaterial({ map: signTexture('PUSH LEGENDS') }));
    sign.position.set(0, 5.25, maxZ + 0.82);
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
    const add = (mesh: THREE.Object3D, pathIdx: number, offset: number, speed: number) => {
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
      this.walkers.push({ mesh, path, lengths, total, offset: offset * total, speed });
    };
    // The hero: bigger, gold armour and a purple cape
    add(soldierMesh(C.gold, C.gold, 1.45, C.purple), 1, 0.1, 1.6);
    for (let i = 0; i < count; i++) {
      const m = soldierMesh(palette[i % palette.length]!, i % 3 === 0 ? C.iron : C.steel, 1.05);
      add(m, i, ((i * 0.37) % 1) + 0.05, 1.8 + (i % 3) * 0.25);
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
    this.renderer.render(this.scene, this.camera);
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
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('wheel', this.onWheel);
    disposeTree(this.scene);
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

