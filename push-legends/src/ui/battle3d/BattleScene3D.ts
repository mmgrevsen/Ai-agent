import * as THREE from 'three';
import { BALANCE } from '../../core/config/balance';
import type { Battle } from '../../core/combat/engine';
import type { BattleEvent, Unit } from '../../core/combat/types';
import { COSMETIC_BY_ID } from '../../core/content/cosmetics';
import type { DamageType } from '../../core/content/types';
import { BOSS_BY_ID, WORLDS } from '../../core/content/worlds';
import { formatNumber } from '../../core/util';
import { rr, type Ctx } from '../art/draw';
import { disposeTree } from '../base3d/kit';
import { addOutlines, glowColor, glowMaterial } from '../base3d/style';
import { createPipeline, skyEnvironment, type Pipeline } from '../base3d/render';
import { dropLabel, squadOffsets, type PlacementPreview, type PlacementView } from '../battle/placement';
import { buildBattlefield, FLY_Y, toX, toZ, XS, type Battlefield } from './battlefield3d';
import { bossRig, cardRig, enemyRig, heroRig, type Rig } from './units3d';

/**
 * 3D battle presentation (three.js). Reads the deterministic Battle state each frame and turns its
 * events into animations and effects. Numbers, health bars and banners are drawn on a 2D overlay.
 * Like the 2D renderer, it never changes the battle.
 */
export interface Scene3DCallbacks {
  onSound: (id: 'hit' | 'crit' | 'death' | 'coin' | 'telegraph' | 'boss' | 'special' | 'warcry' | 'heal') => void;
  onShake: (strength: number) => void;
}

export interface Scene3DOptions {
  /** Render the 3D view at 256 px height with hard pixel edges. */
  pixel: boolean;
  reducedMotion: boolean;
  world: number;
  cape: string;
  aura: string;
  goldSword: boolean;
}

const TYPE_COLOR: Record<DamageType, string> = {
  physical: '#f5f5f5',
  fire: '#ff8a3d',
  frost: '#8fd6ff',
  lightning: '#ffe066',
  holy: '#fff3b0',
};

const PIXEL_HEIGHT = 256;
const UNIT_SCALE = 3.5;

interface UnitView {
  rig: Rig;
  blob: THREE.Mesh;
  scale: number;
  baseY: number;
  facing: number;
  seed: number;
  lastDust: number;
  /** Displayed lane position: melee fighters step across to meet their opponent face to face. */
  dispZ: number;
  /** Current heading (smoothed), turned towards the opponent while fighting. */
  yaw: number;
  /** Attacks seen so far; picks the next swing (chop, slash, thrust). */
  attacks: number;
  lastSeenAttack: number;
  lastX: number;
  /** Last hit taken: scene time, heavy or not, and where the attacker stood (lane-local x). */
  hitT: number;
  hitHeavy: boolean;
  hitFromX: number;
}

interface Corpse {
  rig: Rig;
  born: number;
  y: number;
  fall: number;
  /** Heading while falling (faces the killer, falls backwards). */
  yaw: number;
  x: number;
  z: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
const easeIn = (k: number) => k * k;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
/** Fall with two small bounces. */
function fallBounce(k: number): number {
  if (k < 0.62) return easeIn(k / 0.62);
  if (k < 0.85) return 1 - Math.sin(((k - 0.62) / 0.23) * Math.PI) * 0.08;
  return 1 - Math.sin(((k - 0.85) / 0.15) * Math.PI) * 0.025;
}

interface Proj {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  born: number;
  life: number;
  arc: number;
  spin: number;
  strike: boolean;
  trail: string | null;
}

interface Fx {
  mesh: THREE.Mesh | THREE.Line;
  born: number;
  life: number;
  grow: number;
  kind: 'ring' | 'bolt' | 'column' | 'sweep' | 'slash' | 'spark' | 'rune';
  spin?: number;
  x0?: number;
  x1?: number;
}

interface FloatText {
  pos: THREE.Vector3;
  text: string;
  color: string;
  size: number;
  born: number;
  life: number;
}

interface Banner {
  title: string;
  subtitle: string;
  color: string;
  born: number;
  life: number;
}

const MAX_PARTICLES = 420;
const DEBUG_FLAGS = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);


export class BattleScene3D implements PlacementView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  /** Everything in battle-lane coordinates; rotated so the lane runs up the screen. */
  private readonly world = new THREE.Group();
  private readonly pipeline: Pipeline;
  private readonly blobGeo = new THREE.CircleGeometry(1, 20);
  private readonly blobMat: THREE.MeshBasicMaterial;
  private readonly camera = new THREE.PerspectiveCamera(27, 1, 0.5, 600);
  private readonly field: Battlefield;
  private readonly views = new Map<number, UnitView>();
  private corpses: Corpse[] = [];
  private projs: Proj[] = [];
  private fx: Fx[] = [];
  private texts: FloatText[] = [];
  private banners: Banner[] = [];
  private readonly telegraphs = new Map<number, THREE.Mesh>();
  private readonly meteors = new Map<number, THREE.Mesh>();
  // Cube particles in one instanced mesh
  private readonly particles: THREE.InstancedMesh;
  private readonly pState: { p: THREE.Vector3; v: THREE.Vector3; born: number; life: number; size: number; g: number; spin: number; c: THREE.Color }[] = [];
  private readonly heroAura: THREE.Mesh | null = null;
  private readonly warCryRing: THREE.Mesh;
  private readonly shields = new Map<number, THREE.Mesh>();
  private time = 0;
  private frameDt = 0;
  private debugFocus = 0;
  private debugLane = 0;
  private shake = 0;
  private flash = 0;
  private zoomPulse = 0;
  private heroStrikeAt = -10;
  private w = 1;
  private h = 1;
  private readonly tmp = new THREE.Vector3();
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpS = new THREE.Vector3();
  private readonly geo = {
    arrow: new THREE.BoxGeometry(0.08, 0.08, 1.1),
    orb: new THREE.IcosahedronGeometry(0.32, 0),
    bomb: new THREE.IcosahedronGeometry(0.34, 1),
    ring: new THREE.RingGeometry(0.82, 1, 40),
    crescent: new THREE.TorusGeometry(1.5, 0.24, 4, 14, Math.PI),
    disc: new THREE.CircleGeometry(1, 36),
    plane: new THREE.PlaneGeometry(1, 1),
    meteor: new THREE.IcosahedronGeometry(1.1, 0),
    bubble: new THREE.IcosahedronGeometry(1, 1),
    slash: new THREE.TorusGeometry(1, 0.09, 4, 18, Math.PI * 0.85),
    spark: (() => {
      const sh = new THREE.Shape();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 ? 0.28 : 1;
        if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      sh.closePath();
      return new THREE.ShapeGeometry(sh);
    })(),
    rune: (() => {
      const sh = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const r = i % 2 ? 0.42 : 0.9;
        if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      sh.closePath();
      const hole = new THREE.Path();
      hole.absarc(0, 0, 0.3, 0, Math.PI * 2, true);
      sh.holes.push(hole);
      return new THREE.ShapeGeometry(sh);
    })(),
  };
  private readonly mats = {
    arrowAlly: new THREE.MeshBasicMaterial({ color: '#fdf2d0' }),
    arrowEnemy: new THREE.MeshBasicMaterial({ color: '#e0b0ff' }),
    bomb: new THREE.MeshLambertMaterial({ color: '#2b2b33' }),
    crescent: new THREE.MeshBasicMaterial({ color: glowColor('#ffd23f', 5), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    meteor: glowMaterial('#ff8a3d'),
    type: Object.fromEntries(Object.entries(TYPE_COLOR).map(([k, c]) => [k, glowMaterial(c)])) as Record<DamageType, THREE.MeshBasicMaterial>,
  };
  reducedMotion: boolean;
  private readonly opts: Scene3DOptions;
  // Drag-to-place preview: deploy zone, the blocked part of the lane, a drop marker and ghost troops
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly ndc = new THREE.Vector2();
  private placement: PlacementPreview | null = null;
  private place: {
    root: THREE.Group;
    zone: THREE.Mesh;
    blocked: THREE.Mesh;
    edge: THREE.Mesh;
    ring: THREE.Mesh;
    disc: THREE.Mesh;
    ghosts: THREE.Group;
    ghostKey: string;
  } | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly cb: Scene3DCallbacks,
    opts: Scene3DOptions,
  ) {
    this.opts = opts;
    this.reducedMotion = opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ antialias: !opts.pixel, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    // PCF with a wide kernel: soft-edged shadows
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    const canvas = this.renderer.domElement;
    canvas.className = `battle3d-canvas${opts.pixel ? ' pixel' : ''}`;
    host.prepend(canvas);

    const world = WORLDS[opts.world] ?? WORLDS[0]!;
    this.field = buildBattlefield(world);
    this.world.rotation.y = Math.PI / 2;
    this.scene.add(this.world);
    this.world.add(this.field.group);
    this.scene.background = this.field.sky;
    // Aerial perspective: distant scenery fades into the horizon colour
    this.scene.fog = new THREE.Fog(this.field.fog, 120, 420);
    const dark = world.index >= 2;
    // Low, warm late-afternoon sun with long soft shadows, sky light from an image-based dome
    const sunDir = new THREE.Vector3(18, 21, 26).normalize();
    this.scene.environment = skyEnvironment(this.renderer, world.sky[0], world.sky[1], dark ? '#3a3040' : '#6e6650', sunDir);
    this.scene.environmentIntensity = dark ? 0.7 : 0.5;
    // Night and lava worlds: brighter exposure so the dusk palette still reads
    if (dark) this.renderer.toneMappingExposure = 1.25;
    this.scene.add(new THREE.HemisphereLight(dark ? '#c9b8ff' : '#dcecff', dark ? '#4a3a3a' : '#5a5040', dark ? 0.55 : 0.3));
    const sun = new THREE.DirectionalLight(dark ? '#ffcfa8' : '#ffe6c0', dark ? 3.0 : 2.7);
    sun.position.copy(sunDir).multiplyScalar(60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(opts.pixel ? 1024 : 2048, opts.pixel ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 20, far: 120 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    this.scene.add(sun.target);

    this.particles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), MAX_PARTICLES);
    this.particles.count = 0;
    this.particles.frustumCulled = false;
    this.world.add(this.particles);

    const bc = document.createElement('canvas');
    bc.width = bc.height = 64;
    const bx = bc.getContext('2d')!;
    const bg = bx.createRadialGradient(32, 32, 0, 32, 32, 32);
    bg.addColorStop(0, 'rgba(0,0,0,0.55)');
    bg.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    bx.fillStyle = bg;
    bx.fillRect(0, 0, 64, 64);
    this.blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, opacity: 0.55, depthWrite: false });
    this.blobMat.userData.shared = true;

    this.pipeline = createPipeline(this.renderer, this.scene, this.camera, {
      msaa: !opts.pixel,
      bloom: { strength: 0.35, radius: 0.5, threshold: 2.6 },
      saturation: 1.0,
      contrast: 1.08,
      vignette: 0.32,
      ao: opts.pixel || DEBUG_FLAGS.get('ao') === '0' ? null : { radius: 2.2, intensity: 1 },
    });

    const aura = COSMETIC_BY_ID.get(opts.aura);
    if (aura && aura.color !== 'transparent') {
      const m = new THREE.Mesh(this.geo.ring, new THREE.MeshBasicMaterial({ color: aura.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(toX(BALANCE.combat.heroX), 0.08, 0);
      m.scale.setScalar(2.2);
      this.world.add(m);
      this.heroAura = m;
    }
    this.warCryRing = new THREE.Mesh(this.geo.disc, new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0, depthWrite: false }));
    this.warCryRing.rotation.x = -Math.PI / 2;
    this.warCryRing.position.set(toX(30), 0.07, 0);
    this.warCryRing.scale.set(16, 5, 1);
    this.world.add(this.warCryRing);
  }

  resize(w: number, h: number): void {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    // MSAA keeps edges clean, so 1.5x density is plenty and saves a lot of GPU work on phones
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.opts.pixel ? Math.min(dpr, PIXEL_HEIGHT / this.h) : dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.pipeline.setSize(this.w, this.h, this.renderer.getPixelRatio());
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  showBanner(title: string, subtitle: string, color = '#ffc94a', life = 2): void {
    this.banners.push({ title, subtitle, color, born: this.time, life });
  }

  // --- Drag-to-place -----------------------------------------------------------------------------

  screenToLane(px: number, py: number): { x: number; lane: number } | null {
    this.ndc.set((px / this.w) * 2 - 1, 1 - (py / this.h) * 2);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
    if (!hit) return null;
    this.world.updateMatrixWorld();
    const local = this.world.worldToLocal(hit);
    return { x: local.x / XS + 54, lane: local.z / toZ(1) };
  }

  setPlacement(p: PlacementPreview | null): void {
    this.placement = p;
    if (!p) {
      if (this.place) this.place.root.visible = false;
      return;
    }
    const pl = this.place ?? this.buildPlacement();
    pl.root.visible = true;
    const key = `${p.cardId}x${p.count}`;
    if (pl.ghostKey !== key) {
      for (const g of [...pl.ghosts.children]) {
        pl.ghosts.remove(g);
        disposeTree(g);
      }
      for (const off of squadOffsets(Math.min(p.count, 4))) {
        const ghost = this.ghostRig(p.cardId);
        ghost.userData.off = off;
        pl.ghosts.add(ghost);
      }
      pl.ghostKey = key;
    }
  }

  private buildPlacement(): NonNullable<BattleScene3D['place']> {
    const flat = (color: string, opacity: number, order: number) => {
      const m = new THREE.Mesh(this.geo.plane, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = order;
      return m;
    };
    const root = new THREE.Group();
    const zone = flat('#9fe8ff', 0.24, 3);
    const blocked = flat('#ff3355', 0.26, 3);
    const edge = flat('#ffffff', 0.85, 4);
    const ring = new THREE.Mesh(this.geo.ring, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 5;
    const disc = new THREE.Mesh(this.geo.disc, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.28, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.renderOrder = 5;
    const ghosts = new THREE.Group();
    root.add(zone, blocked, edge, ring, disc, ghosts);
    root.visible = false;
    this.world.add(root);
    this.place = { root, zone, blocked, edge, ring, disc, ghosts, ghostKey: '' };
    return this.place;
  }

  /** A see-through copy of a card's troop model, used as the drop preview. */
  private ghostRig(cardId: string): THREE.Group {
    const rig = cardRig(cardId);
    const copies = new Map<THREE.Material, THREE.Material>();
    rig.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.Material;
      let c = copies.get(src);
      if (!c) {
        c = src.clone();
        delete c.userData.shared;
        c.transparent = true;
        c.opacity = 0.55;
        c.depthWrite = false;
        copies.set(src, c);
      }
      mesh.material = c;
      mesh.castShadow = false;
      mesh.renderOrder = 6;
    });
    rig.root.scale.setScalar(UNIT_SCALE);
    rig.root.rotation.y = Math.PI / 2;
    return rig.root;
  }

  private updatePlacement(t: number): void {
    const p = this.placement;
    const pl = this.place;
    if (!p || !pl) return;
    const half = toZ(1.12) * 2;
    const x0 = toX(p.minX - 2);
    const x1 = toX(p.maxX);
    const end = toX(BALANCE.combat.enemySpawnX + 4);
    pl.zone.position.set((x0 + x1) / 2, 0.16, 0);
    pl.zone.scale.set(Math.max(0.01, x1 - x0), half, 1);
    pl.blocked.position.set((x1 + end) / 2, 0.16, 0);
    pl.blocked.scale.set(Math.max(0.01, end - x1), half, 1);
    pl.edge.position.set(x1, 0.18, 0);
    pl.edge.scale.set(0.22, half, 1);
    (pl.edge.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(t * 6);
    const color = p.ok ? '#ffffff' : '#ff5c7a';
    const mx = toX(p.x);
    const mz = toZ(p.lane);
    const pulse = 1 + Math.sin(t * 7) * 0.06;
    pl.ring.position.set(mx, 0.2, mz);
    pl.ring.scale.setScalar(1.9 * pulse);
    (pl.ring.material as THREE.MeshBasicMaterial).color.set(color);
    pl.disc.position.set(mx, 0.19, mz);
    pl.disc.scale.setScalar(1.6);
    (pl.disc.material as THREE.MeshBasicMaterial).color.set(color);
    const lift = (p.flying ? FLY_Y : 0.35) + Math.sin(t * 4) * 0.18;
    for (const g of pl.ghosts.children) {
      const off = g.userData.off as { dx: number; dl: number };
      g.position.set(toX(p.x + off.dx), lift, toZ(Math.max(-1, Math.min(1, p.lane + off.dl))));
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) (mesh.material as THREE.Material).opacity = p.ok ? 0.55 : 0.3;
      });
    }
  }

  // --- Mapping helpers ---------------------------------------------------------------------------

  private unitPos(u: Unit, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(toX(u.x), u.flying ? FLY_Y : 0, this.views.get(u.id)?.dispZ ?? toZ(u.lane));
  }

  private topOf(u: Unit, out = new THREE.Vector3()): THREE.Vector3 {
    const v = this.views.get(u.id);
    this.unitPos(u, out);
    out.y += v ? v.rig.height * v.scale + 0.3 : 3;
    return out;
  }

  private midOf(u: Unit | undefined, fallbackX: number, flying = false): THREE.Vector3 {
    if (!u) return new THREE.Vector3(toX(fallbackX), flying ? FLY_Y : 1.6, 0);
    const v = this.views.get(u.id);
    const p = this.unitPos(u);
    p.y += v ? v.rig.height * v.scale * 0.55 : 1.6;
    return p;
  }

  // --- Particles ----------------------------------------------------------------------------------

  private burst(at: THREE.Vector3, color: string, n: number, speed = 6, size = 0.3, life = 0.6, gravity = -14, up = 4): void {
    const count = this.reducedMotion ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      if (this.pState.length >= MAX_PARTICLES) this.pState.shift();
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.pState.push({
        p: at.clone(),
        v: new THREE.Vector3(Math.cos(a) * Math.cos(b) * s, Math.abs(Math.sin(b)) * s + up, Math.sin(a) * Math.cos(b) * s * 0.6),
        born: this.time,
        life: life * (0.7 + Math.random() * 0.6),
        size: size * (0.6 + Math.random() * 0.8),
        g: gravity,
        spin: Math.random() * 10,
        c: new THREE.Color(color),
      });
    }
  }

  private updateParticles(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.pState.length; i++) {
      const s = this.pState[i]!;
      const age = this.time - s.born;
      if (age > s.life) continue;
      s.v.y += s.g * dt;
      s.p.addScaledVector(s.v, dt);
      if (s.p.y < 0.1 && s.g < 0) {
        s.p.y = 0.1;
        s.v.y *= -0.35;
        s.v.x *= 0.7;
      }
      this.pState[w] = s;
      w++;
    }
    this.pState.length = w;
    for (let i = 0; i < w; i++) {
      const s = this.pState[i]!;
      const k = 1 - (this.time - s.born) / s.life;
      this.tmpQ.setFromAxisAngle(this.tmp.set(1, 1, 0).normalize(), s.spin + this.time * 6);
      this.tmpS.setScalar(Math.max(0.01, s.size * Math.min(1, k * 2)));
      this.tmpM.compose(s.p, this.tmpQ, this.tmpS);
      this.particles.setMatrixAt(i, this.tmpM);
      this.particles.setColorAt(i, s.c);
    }
    this.particles.count = w;
    this.particles.instanceMatrix.needsUpdate = true;
    if (this.particles.instanceColor) this.particles.instanceColor.needsUpdate = true;
  }

  // --- Effects -----------------------------------------------------------------------------------

  private ring(x: number, z: number, y: number, radius: number, color: string, life: number, delay = 0): void {
    const m = new THREE.Mesh(this.geo.ring, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.scale.setScalar(0.01);
    this.world.add(m);
    this.fx.push({ mesh: m, born: this.time + delay, life, grow: radius, kind: 'ring' });
  }

  private column(x: number, color: string, life: number, height = 12, width = 2.2, z = 0): void {
    const m = new THREE.Mesh(this.geo.plane, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    // Facing the camera (the lane group is rotated a quarter turn)
    m.rotation.y = Math.PI / 2;
    m.position.set(x, height / 2, z);
    m.scale.set(width, height, 1);
    this.world.add(m);
    this.fx.push({ mesh: m, born: this.time, life, grow: width, kind: 'column' });
  }

  private additive(color: string, opacity = 0.95): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color: glowColor(color, 3), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  }

  /** Sword-swipe arc at a melee impact. */
  private slash(at: THREE.Vector3, color: string): void {
    if (this.reducedMotion) return;
    const m = new THREE.Mesh(this.geo.slash, this.additive(color, 0.9));
    m.position.copy(at);
    this.world.add(m);
    m.lookAt(this.camera.position);
    m.rotateZ(Math.random() * Math.PI * 2);
    this.fx.push({ mesh: m, born: this.time, life: 0.2, grow: 1.4, kind: 'slash' });
  }

  /** Star-shaped impact spark. */
  private spark(at: THREE.Vector3, color: string, size = 1): void {
    const m = new THREE.Mesh(this.geo.spark, this.additive(color));
    m.position.copy(at);
    this.world.add(m);
    m.lookAt(this.camera.position);
    this.fx.push({ mesh: m, born: this.time, life: 0.28, grow: size, kind: 'spark', spin: (Math.random() - 0.5) * 8 });
  }

  /** Rotating summoning rune on the ground. */
  private rune(x: number, z: number, color: string): void {
    const m = new THREE.Mesh(this.geo.rune, this.additive(color, 0.8));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.14, z);
    this.world.add(m);
    this.fx.push({ mesh: m, born: this.time, life: 0.75, grow: 3.2, kind: 'rune', spin: 2.5 });
  }

  private boltLine(points: THREE.Vector3[], color: string): void {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < points.length; i++) {
      if (i > 0) {
        const a = points[i - 1]!;
        const b = points[i]!;
        for (let j = 1; j < 4; j++) {
          const p = a.clone().lerp(b, j / 4);
          p.x += (Math.random() - 0.5) * 0.8;
          p.y += (Math.random() - 0.5) * 0.8;
          pts.push(p);
        }
      }
      pts.push(points[i]!.clone());
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true }));
    this.world.add(line);
    this.fx.push({ mesh: line, born: this.time, life: 0.25, grow: 0, kind: 'bolt' });
  }

  private shoot(from: THREE.Vector3, to: THREE.Vector3, type: DamageType, ally: boolean, style: 'arrow' | 'orb' | 'bomb'): void {
    let mesh: THREE.Object3D;
    if (style === 'arrow') mesh = new THREE.Mesh(this.geo.arrow, ally ? this.mats.arrowAlly : this.mats.arrowEnemy);
    else if (style === 'bomb') mesh = new THREE.Mesh(this.geo.bomb, this.mats.bomb);
    else mesh = new THREE.Mesh(this.geo.orb, this.mats.type[type]);
    mesh.position.copy(from);
    this.world.add(mesh);
    const dist = from.distanceTo(to);
    this.projs.push({ mesh, from, to, born: this.time, life: style === 'bomb' ? 0.32 : 0.22, arc: style === 'bomb' ? 3 + dist * 0.1 : style === 'arrow' ? 0.8 + dist * 0.04 : 0.4, spin: style === 'arrow' ? 0 : 8, strike: false, trail: style === 'orb' ? TYPE_COLOR[type] : style === 'bomb' ? '#ffb347' : null });
  }

  private styleFor(u: Unit | undefined): 'arrow' | 'orb' | 'bomb' {
    const v = u ? this.views.get(u.id) : undefined;
    if (!v) return 'orb';
    return v.rig.attack === 'bow' ? 'arrow' : v.rig.attack === 'throw' ? 'bomb' : 'orb';
  }

  private shakeBy(s: number): void {
    if (this.reducedMotion) return;
    this.shake = Math.max(this.shake, s);
    this.cb.onShake(s);
  }

  // --- Events ------------------------------------------------------------------------------------

  ingest(battle: Battle, events: BattleEvent[]): void {
    const byId = (id: number) => battle.units.find((u) => u.id === id);
    for (const e of events) {
      switch (e.type) {
        case 'attack': {
          const src = byId(e.sourceId);
          const dst = byId(e.targetId);
          const dv = this.views.get(e.targetId);
          if (dv) dv.hitFromX = toX(e.fromX);
          if (!e.ranged) {
            if (dst) {
              const at = this.midOf(dst, e.toX);
              // Contact point: between the two fighters, at weapon height
              if (src) at.lerp(this.midOf(src, e.fromX), 0.35);
              this.burst(at, '#ffffff', 4, 4, 0.18, 0.25, -10, 1);
              this.slash(at, src?.side === 'ally' ? '#fff3c4' : '#ffb0c8');
              // Both swung at the same moment: the blades clash
              if (src && dst.targetId === src.id && Math.abs(dst.lastAttackAt - battle.time) < 0.18) {
                this.spark(at, '#ffe9a0', 1.6);
                this.burst(at, '#ffd23f', 10, 9, 0.16, 0.35, -12, 3);
                this.shakeBy(1.5);
              }
            }
            break;
          }
          const from = this.midOf(src, e.fromX, e.fromFlying);
          from.y += 0.4;
          this.shoot(from, this.midOf(dst, e.toX, e.toFlying), e.damageType, src?.side === 'ally', this.styleFor(src));
          break;
        }
        case 'damage': {
          if (e.amount < 1) break;
          const u = byId(e.targetId);
          const hv = this.views.get(e.targetId);
          if (hv && u) {
            hv.hitT = this.time;
            hv.hitHeavy = e.amount > u.maxHp * 0.12 || e.crit;
            if (hv.rig.shield && !hv.hitHeavy) this.spark(this.midOf(u, e.x).add(new THREE.Vector3(Math.sin(hv.yaw), 0, Math.cos(hv.yaw)).multiplyScalar(1.2)), '#dfe8ff', 0.9);
            if (hv.hitHeavy && !u.flying) this.burst(this.unitPos(u).setY(0.3), '#c9b48f', 6, 3, 0.26, 0.5, -8, 1.5);
          }
          const pos = u ? this.topOf(u) : new THREE.Vector3(toX(e.x), 3, 0);
          pos.x += (Math.random() - 0.5) * 0.8;
          if (this.texts.length < 60)
            this.texts.push({ pos, text: formatNumber(e.amount), color: e.crit ? '#ffd23f' : e.side === 'ally' ? '#ff8098' : TYPE_COLOR[e.damageType], size: e.crit ? 19 : 13, born: this.time, life: 0.8 });
          if (e.crit && u) {
            this.burst(this.midOf(u, e.x), '#ffd23f', 6, 6, 0.22, 0.35, -8, 2);
            this.spark(this.midOf(u, e.x), '#ffd23f', 1.3);
          }
          this.cb.onSound(e.crit ? 'crit' : 'hit');
          break;
        }
        case 'heal': {
          const u = byId(e.targetId);
          if (e.amount >= 5 && this.texts.length < 60) this.texts.push({ pos: u ? this.topOf(u) : new THREE.Vector3(toX(e.x), 3, 0), text: `+${formatNumber(e.amount)}`, color: '#6dffa5', size: 12, born: this.time, life: 0.8 });
          if (u) this.burst(this.midOf(u, e.x), '#6dffa5', 3, 1.5, 0.16, 0.7, 3, 1);
          break;
        }
        case 'death': {
          const at = new THREE.Vector3(toX(e.x), e.flying ? FLY_Y : 1, this.views.get(e.unitId)?.dispZ ?? 0);
          this.burst(at, e.side === 'enemy' ? '#d7c8ff' : '#ffffff', 12, 7, 0.32, 0.6);
          if (e.side === 'enemy' && e.gold > 0) {
            this.burst(at, '#ffc94a', 7, 5, 0.34, 0.9, -18, 8);
            this.texts.push({ pos: at.clone().setY(at.y + 2.5), text: `+${formatNumber(e.gold)}`, color: '#ffc94a', size: 12, born: this.time, life: 0.9 });
            this.cb.onSound('coin');
          }
          this.cb.onSound('death');
          break;
        }
        case 'splash':
          this.ring(toX(e.x), 0, 0.12, e.radius * 0.44 + 0.6, TYPE_COLOR[e.damageType], 0.35);
          this.burst(new THREE.Vector3(toX(e.x), 0.5, 0), TYPE_COLOR[e.damageType], 8, 5, 0.25, 0.4, -10, 3);
          break;
        case 'chain':
          this.boltLine(
            e.points.map((p) => new THREE.Vector3(toX(p.x), p.flying ? FLY_Y + 0.8 : 1.6, 0.3)),
            '#ffe066',
          );
          break;
        case 'shieldGranted':
          this.ring(toX(e.x), 0, 0.15, Math.min(22, e.radius * 0.44), '#7fd3ff', 0.6);
          break;
        case 'petAbility': {
          const c = e.kind === 'fireball' ? '#ff8a3d' : e.kind === 'frostAura' ? '#8fd6ff' : '#7fd3ff';
          this.ring(toX(e.x), 0, 0.15, e.radius * 0.44 + 1, c, 0.5);
          this.burst(new THREE.Vector3(toX(e.x), 1, 0), c, 10, 5, 0.25, 0.5);
          break;
        }
        case 'rebirth': {
          const at = new THREE.Vector3(toX(e.x), 3, 0);
          this.burst(at, '#ff8a3d', 18, 8, 0.35, 0.8, 2);
          this.burst(at, '#ffe066', 12, 6, 0.3, 0.8, 2);
          this.column(toX(e.x), '#ff8a3d', 0.7, 14, 2.5);
          this.texts.push({ pos: at.clone().setY(7), text: 'REBIRTH!', color: '#ffb347', size: 16, born: this.time, life: 1.2 });
          break;
        }
        case 'deploy': {
          const x = toX(e.x);
          const z = toZ(e.lane);
          this.ring(x, z, 0.12, 2.6, '#c7aaff', 0.45);
          this.rune(x, z, '#c7aaff');
          this.column(x, '#b98eff', 0.35, 9, 1.6, z);
          this.burst(new THREE.Vector3(x, 0.6, z), '#e3d0ff', 10, 6, 0.26, 0.5, -10, 5);
          break;
        }
        case 'telegraph':
          this.cb.onSound('telegraph');
          break;
        case 'telegraphResolved': {
          const cx = (toX(e.x0) + toX(e.x1)) / 2;
          const r = Math.abs(toX(e.x1) - toX(e.x0)) / 2;
          this.shakeBy(e.kind === 'meteor' || e.kind === 'slam' ? 7 : 3);
          this.ring(cx, 0, 0.14, r + 1, '#ff5c5c', 0.45);
          this.burst(new THREE.Vector3(cx, 0.4, 0), e.kind === 'meteor' ? '#ff8a3d' : '#a08a70', 18, 8, 0.4, 0.7, -16, 5);
          break;
        }
        case 'interrupt':
          this.texts.push({ pos: new THREE.Vector3(toX(e.x), 9, 0), text: 'INTERRUPTED!', color: '#ffe066', size: 22, born: this.time, life: 1.4 });
          this.flash = 0.6;
          break;
        case 'special': {
          const m = new THREE.Mesh(this.geo.plane, new THREE.MeshBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
          // A wall of light across the road that sweeps up the lane
          m.rotation.y = Math.PI / 2;
          m.scale.set(12, 16, 1);
          this.world.add(m);
          this.fx.push({ mesh: m, born: this.time, life: 0.55, grow: 0, kind: 'sweep', x0: toX(e.x0), x1: toX(e.x1) });
          this.flash = 0.8;
          this.shakeBy(10);
          this.cb.onSound('special');
          break;
        }
        case 'warCry':
          this.showBanner('WAR CRY!', `Army +${Math.round(BALANCE.exercise.warCryDamageBonus * 100)}% damage`, '#ffb347', 1.6);
          this.ring(toX(BALANCE.combat.heroX), 0, 0.15, 14, '#ffb347', 0.7);
          this.cb.onSound('warcry');
          break;
        case 'waveStart':
          if (e.boss) this.showBanner('BOSS WAVE', 'Something big approaches...', '#ff5c7a', 1.8);
          else this.showBanner(e.total ? `Wave ${e.wave + 1} / ${e.total}` : `Wave ${e.wave + 1}`, '', '#ffffff', 1.3);
          break;
        case 'bossSpawn':
          this.showBanner(e.name, e.title, e.tier === 2 ? '#ff5c7a' : '#ffb347', 2.4);
          this.shakeBy(9);
          this.zoomPulse = 1;
          this.cb.onSound('boss');
          break;
        case 'phase':
          this.showBanner(e.phaseName, e.message, '#ff8a3d', 2);
          this.shakeBy(6);
          break;
        case 'pushStrike': {
          const from = new THREE.Vector3(toX(BALANCE.combat.heroX) + 1, 2.4, 0.4);
          const to = new THREE.Vector3(toX(e.x), e.flying ? FLY_Y + 0.6 : 1.4, 0);
          const mesh = new THREE.Mesh(this.geo.crescent, this.mats.crescent);
          mesh.position.copy(from);
          this.world.add(mesh);
          this.projs.push({ mesh, from, to, born: this.time, life: 0.2, arc: 1, spin: 0, strike: true, trail: '#ffd23f' });
          this.heroStrikeAt = this.time;
          this.ring(to.x, 0, 0.16, BALANCE.exercise.repStrikeSplashRadius * 0.44 + 1, '#ffd23f', 0.4, 0.2);
          this.shakeBy(3);
          this.cb.onSound('crit');
          break;
        }
        case 'rep': {
          const at = new THREE.Vector3(toX(BALANCE.combat.heroX), 2.5, 0);
          this.burst(at, e.verified ? '#ffe066' : '#c7aaff', 8, 3, 0.2, 0.8, 3, 2);
          break;
        }
        default:
          break;
      }
    }
  }

  // --- Units -------------------------------------------------------------------------------------

  private createView(u: Unit, battle: Battle): UnitView {
    const world = WORLDS[battle.setup.world] ?? WORLDS[0]!;
    let rig: Rig;
    let scale = UNIT_SCALE;
    if (u.kind === 'hero') {
      const cape = COSMETIC_BY_ID.get(this.opts.cape)?.color ?? '#c0392b';
      rig = heroRig(cape, this.opts.goldSword ? 'goldsword' : 'sword');
      scale *= 1.18;
    } else if (u.kind === 'card') rig = cardRig(u.defId);
    else if (u.kind === 'boss') {
      const def = BOSS_BY_ID.get(u.defId);
      rig = bossRig(def?.sprite ?? '', def?.palette ?? world.enemyPalette);
      scale *= 0.45 + (def?.size ?? 2) * 0.45;
      scale = Math.min(scale, 13 / rig.height);
    } else {
      rig = enemyRig(u.role as string, world.index, world.enemyPalette);
      if (u.elite) scale *= 1.28;
      if (u.elite) this.addEliteMark(rig);
    }
    rig.root.scale.setScalar(scale);
    rig.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    const facing = u.side === 'ally' ? Math.PI / 2 : -Math.PI / 2;
    rig.root.rotation.y = facing;
    addOutlines(rig.root, u.kind === 'boss' ? 0.016 : 0.02, (m) => m.material === rig.material);
    this.world.add(rig.root);
    const blob = new THREE.Mesh(this.blobGeo, this.blobMat);
    blob.rotation.x = -Math.PI / 2;
    const br = (rig.kind === 'quad' ? 1.0 : rig.kind === 'flyer' ? 0.7 : 0.62) * scale * (rig.height > 3 ? 1.5 : 1);
    blob.scale.set(br, br * 0.8, 1);
    this.world.add(blob);
    rig.root.rotation.order = 'YXZ';
    return {
      rig,
      blob,
      scale,
      baseY: 0,
      facing,
      seed: (u.id * 0.61803) % 1,
      lastDust: 0,
      dispZ: toZ(u.lane),
      yaw: facing,
      attacks: 0,
      lastSeenAttack: u.lastAttackAt,
      lastX: u.x,
      hitT: -10,
      hitHeavy: false,
      hitFromX: toX(u.x) + (u.side === 'ally' ? 5 : -5),
    };
  }

  private addEliteMark(rig: Rig): void {
    const crown = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: '#ffc94a' });
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), m);
      c.position.set(-0.2 + i * 0.13, 0, 0);
      crown.add(c);
    }
    crown.position.y = rig.height + 0.1;
    rig.body.add(crown);
  }

  /**
   * Fight animation. The engine only says when a blow lands (lastAttackAt) and how long until the
   * next one (attackCd), so every swing is staged around that: a wind-up while the cooldown runs
   * out, a fast strike on the hit, then a recovery into a guard stance. Fighters turn to face their
   * opponent and step across the lane to meet them; hits stagger the target (heavy hits knock it
   * back), shields come up to block.
   */
  private animateUnit(u: Unit, v: UnitView, battle: Battle, byId: Map<number, Unit>): void {
    const { rig } = v;
    const bt = battle.time;
    const dt = Math.min(0.1, this.frameDt);
    const t = this.time + v.seed * 10;
    const motion = this.reducedMotion ? 0 : 1;
    const stunned = u.stunUntil > bt;
    const casting = !!u.boss && u.boss.castingUntil > bt;
    const age = bt - u.spawnedAt;

    // Opponent and engagement (mirrors the engine's range check)
    const target = u.targetId !== null ? byId.get(u.targetId) : undefined;
    const foe = target && !target.dead ? target : undefined;
    const gap = foe ? Math.max(0, Math.abs(foe.x - u.x) - (u.size + foe.size - 2) * 1.5) : Infinity;
    const engaged = !!foe && gap <= u.range + 0.6 && !stunned;
    const melee = u.range <= 6 && (rig.attack === 'melee' || u.kind === 'boss');

    // A new blow landed: count it (the count picks the swing variant)
    if (u.lastAttackAt !== v.lastSeenAttack) {
      v.lastSeenAttack = u.lastAttackAt;
      v.attacks++;
    }
    const since = bt - u.lastAttackAt;
    const STRIKE = 0.14;
    const RECOVER = 0.42;
    const windWindow = Math.min(0.36, u.attackInterval * 0.55);
    const strikeK = since >= 0 && since < STRIKE ? since / STRIKE : -1;
    const recoverK = since >= STRIKE && since < STRIKE + RECOVER ? (since - STRIKE) / RECOVER : -1;
    const windK = engaged && strikeK < 0 && recoverK < 0 && u.attackCd < windWindow ? clamp01(1 - u.attackCd / windWindow) : 0;
    const swingNow = (v.attacks + 2) % 3; // variant of the blow that just landed
    const swingNext = (v.attacks + 3) % 3; // variant being wound up
    const inFight = engaged || strikeK >= 0 || recoverK >= 0;

    // Movement
    const speed = Math.abs(u.x - v.lastX) / Math.max(1e-4, dt);
    v.lastX = u.x;
    const moving = !stunned && !casting && !inFight && speed > 0.15 && u.kind !== 'hero';

    // Step across the lane to meet the opponent, drift back to the own lane otherwise
    let wantZ = toZ(u.lane);
    if (foe && melee && gap < u.range + 6) {
      const fv = this.views.get(foe.id);
      wantZ = (fv ? fv.dispZ : toZ(foe.lane)) + (v.seed - 0.5) * 3.2;
    }
    v.dispZ += (Math.max(-4.8, Math.min(4.8, wantZ)) - v.dispZ) * Math.min(1, dt * 2.2);

    // Face the opponent while fighting or closing in
    let wantYaw = v.facing;
    if (foe && (inFight || gap < 14)) {
      const fv = this.views.get(foe.id);
      wantYaw = Math.atan2(toX(foe.x) - toX(u.x), (fv ? fv.dispZ : toZ(foe.lane)) - v.dispZ);
    }
    v.yaw = lerpAngle(v.yaw, wantYaw, Math.min(1, dt * 9));
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);

    // Spawn: allies drop from the sky, enemies grow out of the portal
    let spawnY = 0;
    let spawnS = 1;
    if (age < 0.4 && u.kind !== 'hero') {
      const k = age / 0.4;
      if (u.side === 'ally') spawnY = (1 - k) * (1 - k) * 9;
      else spawnS = 0.25 + 0.75 * k;
    }
    const landing = age >= 0.4 && age < 0.62 && u.side === 'ally' && u.kind !== 'hero' ? Math.sin(((age - 0.4) / 0.22) * Math.PI) : 0;
    const base = this.unitPos(u, this.tmp);
    if (age >= 0.4 && age < 0.43 && u.side === 'ally' && u.kind === 'card' && !rig.root.userData.landed) {
      rig.root.userData.landed = true;
      this.ring(base.x, base.z, 0.12, 2.4, '#ffffff', 0.35);
      this.burst(base.clone().setY(0.3), '#d9c39a', 8, 4, 0.25, 0.45, -12, 2);
    }

    // --- Pose ------------------------------------------------------------------------------------
    // a = right arm raise (0 down, PI/2 forward, PI overhead); aZ = arm swung out to the side
    let a = 0;
    let aZ = 0;
    let aL = 0;
    let aLZ = 0;
    let lean = 0; // + forward
    let twist = 0; // + right shoulder back
    let crouch = 0;
    let lunge = 0; // world units along the heading
    let dive = 0;
    let legA = 0;
    let legB = 0;
    const walk = moving ? t * (u.kind === 'enemy' && u.role === 'fast' ? 16 : 10) : 0;

    if (moving) {
      a = -Math.sin(walk) * 0.45;
      aL = Math.sin(walk) * 0.45;
      legA = Math.sin(walk) * 0.7;
      legB = -legA;
      lean = 0.12;
    } else if (!inFight) {
      a = Math.sin(t * 2) * 0.05;
      aL = Math.sin(t * 2 + 1) * 0.05;
    }

    if (inFight && !stunned) {
      // Guard: knees bent, feet staggered, weapon and shield up, a little sway
      const sway = Math.sin(t * 2.6) * motion;
      crouch = 0.07;
      legA = 0.32 + sway * 0.05;
      legB = -0.22 - sway * 0.05;
      lean = 0.1;
      twist = 0.12 * sway;
      a = 0.95 + Math.sin(t * 3.1) * 0.06 * motion;
      aL = rig.shield ? 1.15 : 0.45;
      aLZ = rig.shield ? 0.35 : 0.15;

      if (melee) {
        const wind = easeOut(windK);
        if (windK > 0) {
          if (swingNext === 0) {
            // Overhead chop
            a = lerp(a, 2.95, wind);
            lean = lerp(lean, -0.14, wind);
            twist = lerp(twist, 0.25, wind);
          } else if (swingNext === 1) {
            // Side slash
            a = lerp(a, 1.5, wind);
            aZ = lerp(0, 1.15, wind);
            twist = lerp(twist, 0.85, wind);
          } else {
            // Thrust
            a = lerp(a, 1.15, wind);
            twist = lerp(twist, 0.55, wind);
            lean = lerp(lean, -0.12, wind);
          }
          lunge = -0.45 * wind;
          if (rig.kind === 'quad') lean = -0.4 * wind; // rear up before pouncing
        }
        if (strikeK >= 0) {
          const k = easeOut(strikeK);
          if (swingNow === 0) {
            a = lerp(2.95, -0.55, k);
            lean = lerp(-0.14, 0.38, k);
            twist = lerp(0.25, -0.1, k);
            lunge = lerp(-0.45, 1.1, k);
          } else if (swingNow === 1) {
            a = 1.5;
            aZ = lerp(1.15, -0.55, k);
            twist = lerp(0.85, -0.85, k);
            lean = 0.2;
            lunge = lerp(-0.3, 0.7, k);
          } else {
            a = lerp(1.15, 1.7, k);
            twist = lerp(0.55, -0.35, k);
            lean = lerp(-0.12, 0.4, k);
            lunge = lerp(-0.45, 1.9, k);
          }
          legA = 0.65;
          legB = -0.4;
          aL = rig.shield ? 0.7 : -0.35; // off-hand swings back for balance
          if (rig.kind === 'quad') lean = 0.35;
        } else if (recoverK >= 0) {
          const k = easeOut(recoverK);
          const from =
            swingNow === 0
              ? { a: -0.55, aZ: 0, twist: -0.1, lean: 0.38, lunge: 1.1 }
              : swingNow === 1
                ? { a: 1.5, aZ: -0.55, twist: -0.85, lean: 0.2, lunge: 0.7 }
                : { a: 1.7, aZ: 0, twist: -0.35, lean: 0.4, lunge: 1.9 };
          a = lerp(from.a, a, k);
          aZ = lerp(from.aZ, aZ, k);
          twist = lerp(from.twist, twist, k);
          lean = lerp(from.lean, lean, k);
          lunge = lerp(from.lunge, 0, k);
          legA = lerp(0.65, legA, k);
          legB = lerp(-0.4, legB, k);
        }
        if (rig.kind === 'flyer') {
          // Flyers swoop: rise while winding up, dive into the strike
          dive = strikeK >= 0 ? -1.4 * Math.sin(strikeK * Math.PI) : windK * 0.8;
        }
      } else {
        // Ranged and casters
        const wind = easeOut(windK);
        if (rig.attack === 'bow') {
          aL = 1.5;
          aLZ = 0;
          twist = 0.45;
          a = lerp(1.25, 1.55, wind);
          aZ = lerp(0, -0.25, wind);
          if (strikeK >= 0) {
            a = lerp(1.55, 0.7, easeOut(strikeK));
            lean = -0.08;
          } else if (recoverK >= 0) a = lerp(0.7, 1.25, easeOut(recoverK));
        } else if (rig.attack === 'throw') {
          a = lerp(0.9, 2.8, wind);
          twist = lerp(0.1, 0.6, wind);
          if (strikeK >= 0) {
            a = lerp(2.8, -0.4, easeOut(strikeK));
            twist = lerp(0.6, -0.4, easeOut(strikeK));
            lean = 0.25;
          } else if (recoverK >= 0) a = lerp(-0.4, 0.9, easeOut(recoverK));
        } else {
          // cast: staff lifted while the spell charges, then pushed forward
          a = lerp(1.0, 2.7, wind);
          aL = lerp(0.5, 1.2, wind);
          lean = lerp(0.05, -0.12, wind);
          if (strikeK >= 0) {
            a = lerp(2.7, 1.55, easeOut(strikeK));
            lean = 0.25;
            lunge = 0.4 * Math.sin(strikeK * Math.PI);
          } else if (recoverK >= 0) a = lerp(1.55, 1.0, easeOut(recoverK));
        }
      }
    }

    // The hero's push-up strikes
    if (u.kind === 'hero') {
      const s = this.time - this.heroStrikeAt;
      if (s >= 0 && s < 0.4) {
        const k = s / 0.4;
        a = k < 0.25 ? lerp(1, 3.0, k / 0.25) : lerp(3.0, -0.6, easeOut((k - 0.25) / 0.75));
        twist = Math.sin(k * Math.PI) * 0.6;
        lean = k < 0.25 ? -0.15 : 0.35 * (1 - k);
        lunge = Math.sin(k * Math.PI) * 0.8;
      }
    }

    // Hit reaction: stagger back, head snaps, heavy blows knock the unit off its feet a little
    const hitDur = v.hitHeavy ? 0.5 : 0.28;
    const hk = (this.time - v.hitT) / hitDur;
    let knock = 0;
    let hop = 0;
    let neckBack = 0;
    if (hk >= 0 && hk < 1 && u.kind !== 'hero') {
      const s = hk < 0.2 ? hk / 0.2 : 1 - (hk - 0.2) / 0.8;
      const heavy = v.hitHeavy ? 1 : 0;
      knock = s * (0.55 + heavy * 1.1) * (u.kind === 'boss' ? 0.3 : 1);
      lean -= s * (0.28 + heavy * 0.3);
      neckBack = s * 0.45;
      hop = heavy * Math.sin(hk * Math.PI) * 0.5;
      if (rig.shield && !v.hitHeavy) {
        aL = 1.45;
        aLZ = 0.55;
      }
    }

    // --- Apply -----------------------------------------------------------------------------------
    // Knock-back pushes away from where the attacker stood
    const away = Math.sign(base.x - v.hitFromX) || (u.side === 'ally' ? -1 : 1);
    // The models are wider than the engine's contact distance: melee fighters keep a sword's
    // length apart (the lunge closes it on the strike)
    const spacing = inFight && melee && foe && rig.kind !== 'flyer' ? Math.min(2.4, 0.9 + v.scale * 0.4) : 0;
    const lungeM = (lunge - spacing) * motion;
    rig.root.position.set(base.x + fx * lungeM + away * knock * motion, base.y + spawnY + (hop + dive) * motion, base.z + fz * lungeM);
    rig.root.rotation.y = v.yaw;
    v.blob.position.set(rig.root.position.x, 0.06, rig.root.position.z);

    if (moving && !u.flying && rig.kind !== 'float' && !this.reducedMotion && this.time - v.lastDust > 0.32) {
      v.lastDust = this.time + Math.random() * 0.1;
      this.burst(new THREE.Vector3(base.x - fx * 0.4, 0.15, base.z - fz * 0.4 + (Math.random() - 0.5) * 0.6), '#cbb894', 2, 1.2, 0.22, 0.45, -2, 0.6);
    }
    if (strikeK >= 0 && strikeK < 0.3 && melee && !u.flying && rig.kind !== 'float' && !this.reducedMotion && this.time - v.lastDust > 0.2) {
      v.lastDust = this.time;
      this.burst(new THREE.Vector3(base.x + fx * 1.2, 0.15, base.z + fz * 1.2), '#cbb894', 3, 2, 0.24, 0.4, -4, 0.8);
    }

    let bob = 0;
    if (rig.kind === 'flyer') bob = Math.sin(t * 3) * 0.25;
    else if (rig.kind === 'float') bob = 0.3 + Math.sin(t * 1.5) * 0.3;
    else if (moving) bob = Math.abs(Math.sin(walk)) * 0.12;
    rig.body.position.y = (bob - crouch) * motion;
    const breathe = 1 + Math.sin(t * 2.2) * 0.02 * motion;
    const squash = 1 - landing * 0.25;
    rig.body.scale.set((1 + landing * 0.18) * spawnS, breathe * squash * spawnS, (1 + landing * 0.18) * spawnS);
    rig.body.rotation.x = lean * motion;
    rig.body.rotation.y = twist * motion;
    rig.body.rotation.z = stunned ? Math.sin(t * 8) * 0.12 : 0;

    if (rig.kind === 'quad') {
      rig.legs.forEach((l, i) => {
        const gallop = moving ? Math.sin(walk + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.7 : 0;
        const rear = inFight ? (i < 2 ? -lean * 1.4 : lean * 0.6) : 0;
        l.rotation.x = (gallop + rear) * motion;
      });
    } else {
      rig.legs.forEach((l, i) => (l.rotation.x = (i === 0 ? legA : legB) * motion));
    }
    if (rig.armR) {
      rig.armR.rotation.x = -a * (motion || 0.3);
      rig.armR.rotation.z = (aZ + 0.12) * motion; // relaxed: arms hang slightly away from the body
    }
    if (rig.armL) {
      rig.armL.rotation.x = -aL * (motion || 0.3);
      rig.armL.rotation.z = (aLZ - 0.12) * motion;
    }
    if (rig.neck) {
      // The head stays on the opponent while the body twists, and snaps back when hit
      rig.neck.rotation.y = -twist * 0.7 * motion;
      rig.neck.rotation.x = (-neckBack + (inFight ? 0.08 : 0)) * motion;
    }
    if (rig.cape) rig.cape.rotation.x = -(0.12 + (moving ? 0.25 : 0) + Math.max(0, lunge) * 0.15 + Math.sin(t * 4) * 0.06) * motion;
    for (const wng of rig.wings) {
      const s = wng.position.x > 0 ? 1 : -1;
      const beat = strikeK >= 0 ? 20 : rig.height > 1.3 ? 6 : 14;
      wng.rotation.z = s * Math.sin(t * beat) * 0.7 * motion;
    }
    for (const sp of rig.spinners) sp.rotation.y = t * (windK > 0 ? 6 : 1.5);

    // Tints: hit flash, frost, burn, boss casting
    const hit = Math.max(0, 1 - (bt - u.lastHitAt) / 0.1);
    const em = rig.material.emissive;
    if (hit > 0) em.setRGB(hit * 0.32, hit * 0.26, hit * 0.22);
    else if (u.burnUntil > bt) em.setRGB(0.45 + Math.sin(t * 20) * 0.15, 0.15, 0);
    else if (u.slowMult < 1) em.setRGB(0.05, 0.2, 0.4);
    else if (casting) em.setRGB(0.4 + Math.sin(t * 14) * 0.25, 0.05, 0.05);
    else if (battle.warCryActive && u.side === 'ally') em.setRGB(0.18, 0.08, 0);
    else em.setRGB(0, 0, 0);

    // Shield bubble
    let bubble = this.shields.get(u.id);
    if (u.shield > 0) {
      if (!bubble) {
        bubble = new THREE.Mesh(this.geo.bubble, new THREE.MeshBasicMaterial({ color: '#7fd3ff', transparent: true, opacity: 0.25, depthWrite: false }));
        this.world.add(bubble);
        this.shields.set(u.id, bubble);
      }
      const r = v.rig.height * v.scale * 0.55;
      bubble.position.set(rig.root.position.x, base.y + r, rig.root.position.z);
      bubble.scale.setScalar(r * (1 + Math.sin(this.time * 5) * 0.03));
    } else if (bubble) {
      this.world.remove(bubble);
      (bubble.material as THREE.Material).dispose();
      this.shields.delete(u.id);
    }
  }

  private syncUnits(battle: Battle): void {
    const seen = new Set<number>();
    const byId = new Map<number, Unit>();
    for (const u of battle.units) byId.set(u.id, u);
    for (const u of battle.units) {
      if (u.dead) continue;
      seen.add(u.id);
      let v = this.views.get(u.id);
      if (!v) {
        v = this.createView(u, battle);
        this.views.set(u.id, v);
      }
      this.animateUnit(u, v, battle, byId);
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.views.delete(id);
      this.world.remove(v.blob);
      const bubble = this.shields.get(id);
      if (bubble) {
        this.world.remove(bubble);
        (bubble.material as THREE.Material).dispose();
        this.shields.delete(id);
      }
      const r = v.rig.root;
      v.rig.material.emissive.setRGB(0.25, 0.22, 0.2);
      // Fall backwards, away from the killer
      const yaw = Math.atan2(v.hitFromX - r.position.x, 0.0001) || v.yaw;
      this.corpses.push({ rig: v.rig, born: this.time, y: r.position.y, fall: v.rig.kind === 'flyer' ? 1 : 0, yaw, x: r.position.x, z: r.position.z });
    }
    // Death: topple backwards with a bounce, lie still, then sink into the ground
    const FALL = 0.55;
    const LIE = 1.5;
    const SINK = 0.8;
    this.corpses = this.corpses.filter((c) => {
      const age = this.time - c.born;
      if (age >= FALL + LIE + SINK) {
        this.world.remove(c.rig.root);
        disposeTree(c.rig.root);
        return false;
      }
      const r = c.rig.root;
      const k = Math.min(1, age / FALL);
      const f = this.reducedMotion ? 1 : fallBounce(k);
      r.rotation.order = 'YXZ';
      r.rotation.y = lerpAngle(r.rotation.y, c.yaw, Math.min(1, age * 12));
      r.rotation.x = -f * (Math.PI / 2) * 0.92;
      // Slide back a little as the body hits the ground
      const back = easeOut(k) * 0.9;
      r.position.x = c.x - Math.sin(c.yaw) * back;
      r.position.z = c.z - Math.cos(c.yaw) * back;
      const sink = Math.max(0, age - FALL - LIE) / SINK;
      r.position.y = (c.fall ? c.y * (1 - easeIn(k)) : c.y * (1 - k)) - sink * 1.6;
      // Limbs go limp
      if (c.rig.armR) c.rig.armR.rotation.x = lerp(c.rig.armR.rotation.x, -2.4, Math.min(1, age * 6));
      if (c.rig.armL) c.rig.armL.rotation.x = lerp(c.rig.armL.rotation.x, -2.1, Math.min(1, age * 6));
      c.rig.body.rotation.y *= 0.9;
      c.rig.body.rotation.x *= 0.9;
      const glow = Math.max(0, 0.25 - age * 1.2);
      c.rig.material.emissive.setRGB(glow, glow * 0.9, glow * 0.8);
      // Darken while lying, so the living stand out
      const dim = 1 - Math.min(0.45, age * 0.6);
      c.rig.material.color.setRGB(dim, dim, dim);
      return true;
    });
  }

  private syncTelegraphs(battle: Battle): void {
    const live = new Set<number>();
    for (const tel of battle.telegraphs) {
      live.add(tel.id);
      const x0 = toX(tel.x0);
      const x1 = toX(tel.x1);
      const p = Math.min(1, (battle.time - tel.createdAt) / Math.max(0.01, tel.resolveAt - tel.createdAt));
      let m = this.telegraphs.get(tel.id);
      const round = tel.kind === 'meteor' || tel.kind === 'volley';
      if (!m) {
        m = new THREE.Mesh(round ? this.geo.disc : this.geo.plane, new THREE.MeshBasicMaterial({ color: tel.kind === 'shield' ? '#7fd3ff' : tel.kind === 'summon' ? '#b670ff' : '#ff3b3b', transparent: true, opacity: 0.4, depthWrite: false }));
        m.rotation.x = -Math.PI / 2;
        this.world.add(m);
        this.telegraphs.set(tel.id, m);
      }
      const cx = (x0 + x1) / 2;
      const half = Math.max(0.5, Math.abs(x1 - x0) / 2);
      m.position.set(cx, 0.11, 0);
      if (round) m.scale.set(half, half * 0.6, 1);
      else m.scale.set(half * 2, 7.5, 1);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.25 * Math.abs(Math.sin(this.time * 9)) + p * 0.2;
      if (round) {
        let met = this.meteors.get(tel.id);
        if (!met) {
          met = new THREE.Mesh(this.geo.meteor, tel.kind === 'meteor' ? this.mats.meteor : this.mats.type.lightning);
          this.world.add(met);
          this.meteors.set(tel.id, met);
        }
        met.position.set(cx + (1 - p) * 6, 1 + (1 - p) * 24, 0);
        met.rotation.set(this.time * 3, this.time * 2, 0);
        if (!this.reducedMotion && Math.random() < 0.6) this.burst(met.position.clone(), '#ffb347', 1, 1, 0.3, 0.4, 2, 0);
      }
    }
    for (const [id, m] of this.telegraphs) {
      if (live.has(id)) continue;
      this.world.remove(m);
      (m.material as THREE.Material).dispose();
      this.telegraphs.delete(id);
      const met = this.meteors.get(id);
      if (met) {
        this.world.remove(met);
        this.meteors.delete(id);
      }
    }
  }

  private updateProjectiles(): void {
    this.projs = this.projs.filter((p) => {
      const k = (this.time - p.born) / p.life;
      if (k >= 1) {
        this.world.remove(p.mesh);
        if (p.strike) {
          this.burst(p.to, '#ffd23f', 14, 8, 0.32, 0.5, -10, 3);
          this.burst(p.to, '#fff3b0', 6, 4, 0.22, 0.35, -6, 2);
        } else if (p.trail === '#ffb347') this.burst(p.to, '#ffb347', 8, 5, 0.3, 0.45);
        return false;
      }
      const prev = p.mesh.position.clone();
      p.mesh.position.lerpVectors(p.from, p.to, k);
      p.mesh.position.y += Math.sin(k * Math.PI) * p.arc;
      if (p.strike) {
        p.mesh.lookAt(this.camera.position);
        p.mesh.rotateZ(-Math.PI / 2 + Math.sin(k * Math.PI) * 0.3);
        p.mesh.scale.setScalar(0.8 + k * 0.6);
      } else if (p.spin) p.mesh.rotation.set(this.time * p.spin, this.time * p.spin, 0);
      else p.mesh.lookAt(this.world.localToWorld(p.mesh.position.clone().add(p.mesh.position.clone().sub(prev))));
      if (p.trail && !this.reducedMotion) this.burst(p.mesh.position.clone(), p.trail, p.strike ? 2 : 1, 0.5, p.strike ? 0.3 : 0.18, 0.3, 0, 0);
      return true;
    });
  }

  private updateFx(): void {
    this.fx = this.fx.filter((f) => {
      const k = (this.time - f.born) / f.life;
      if (k < 0) return true;
      if (k >= 1) {
        this.world.remove(f.mesh);
        (f.mesh.material as THREE.Material).dispose();
        if (f.kind === 'bolt') f.mesh.geometry.dispose();
        return false;
      }
      const m = f.mesh.material as THREE.MeshBasicMaterial;
      if (f.kind === 'ring') {
        f.mesh.scale.setScalar(Math.max(0.01, f.grow * (0.3 + k * 0.7)));
        m.opacity = 0.9 * (1 - k);
      } else if (f.kind === 'column') {
        f.mesh.scale.x = f.grow * (1 - k * 0.7);
        m.opacity = 0.8 * (1 - k);
      } else if (f.kind === 'sweep') {
        const x = (f.x0 ?? 0) + ((f.x1 ?? 0) - (f.x0 ?? 0)) * k;
        f.mesh.position.set(x, 8, 0);
        m.opacity = 0.85 * (1 - k * 0.5);
        if (!this.reducedMotion) this.burst(new THREE.Vector3(x, Math.random() * 8, (Math.random() - 0.5) * 4), '#ffe9a0', 2, 3, 0.3, 0.5, 2, 1);
      } else if (f.kind === 'slash') {
        f.mesh.scale.setScalar(f.grow * (0.5 + k * 0.7));
        f.mesh.rotateZ(0.12);
        m.opacity = 0.9 * (1 - k * k);
      } else if (f.kind === 'spark') {
        const pop = k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7;
        f.mesh.scale.setScalar(Math.max(0.01, f.grow * (0.3 + pop)));
        f.mesh.rotateZ((f.spin ?? 0) * 0.016);
        m.opacity = Math.min(1, pop * 1.4);
      } else if (f.kind === 'rune') {
        f.mesh.scale.setScalar(f.grow * (0.6 + Math.min(1, k * 3) * 0.4));
        f.mesh.rotation.z += (f.spin ?? 0) * 0.016;
        m.opacity = 0.8 * (k < 0.7 ? 1 : (1 - k) / 0.3);
      } else {
        m.opacity = 1 - k;
      }
      return true;
    });
  }

  // --- Frame -------------------------------------------------------------------------------------

  render(battle: Battle, dt: number, overlay: Ctx): void {
    this.time += dt;
    this.frameDt = dt;
    const t = this.time;
    if (!this.reducedMotion) this.field.update(t, dt);
    this.syncUnits(battle);
    this.syncTelegraphs(battle);
    this.updateProjectiles();
    this.updateFx();
    this.updateParticles(dt);
    this.updatePlacement(t);
    if (this.heroAura) {
      this.heroAura.rotation.z = t;
      this.heroAura.scale.setScalar(2.2 + Math.sin(t * 3) * 0.15);
    }
    (this.warCryRing.material as THREE.MeshBasicMaterial).opacity = battle.warCryActive ? 0.12 + 0.06 * Math.sin(t * 6) : 0;

    // Camera: looks down the lane from behind the hero (lane runs up the screen), with shake and a
    // short push-in when a boss arrives
    if (this.fitFor !== `${this.w}x${this.h}`) this.fitCamera();
    this.zoomPulse = Math.max(0, this.zoomPulse - dt * 0.6);
    const zp = Math.sin(Math.min(1, this.zoomPulse) * Math.PI) * 0.16;
    const zoom = Number(DEBUG_FLAGS.get('zoom') ?? 0);
    if (zoom > 0 && DEBUG_FLAGS.has('debug')) {
      // Developer close-up (?debug=1&zoom=0.35): follow the front line to inspect animations
      const lead = battle.units.filter((x) => !x.dead && x.side === 'enemy').reduce<Unit | null>((m, x) => (!m || x.x < m.x ? x : m), null);
      const front = lead?.x ?? 60;
      this.debugFocus = lerp(this.debugFocus || front, front - 4, 0.05);
      this.debugLane = lerp(this.debugLane, lead ? (this.views.get(lead.id)?.dispZ ?? 0) : 0, 0.05);
      if (DEBUG_FLAGS.has('front')) {
        // Three-quarter view from the enemy side, inside the hedges
        const fz = -toX(this.debugFocus);
        this.camera.position.set(this.debugLane + 11 * zoom, 11 * zoom, fz - 2);
        this.camera.lookAt(this.debugLane, 2.2, fz);
        this.camera.updateMatrixWorld();
      } else this.placeCamera(this.fit.d * zoom, -toX(this.debugFocus) + 6 * zoom);
    } else this.placeCamera(this.fit.d * (1 - zp), this.fit.tz - zp * 18);
    if (this.shake > 0.2 && !this.reducedMotion) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.08;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.08;
      this.shake *= 0.86;
    }
    this.pipeline.render();
    this.drawOverlay(overlay, battle, dt);
  }

  private fit = { d: 60, tz: 0 };
  private fitFor = '';
  private static readonly PITCH = (46 * Math.PI) / 180;

  private placeCamera(d: number, tz: number): void {
    const p = BattleScene3D.PITCH;
    this.camera.position.set(0, d * Math.sin(p), tz + d * Math.cos(p));
    this.camera.lookAt(0, 0, tz);
    this.camera.updateMatrixWorld();
  }

  /** Finds the camera distance and target so the whole lane (hero to portal) fills the view. */
  private fitCamera(): void {
    this.fitFor = `${this.w}x${this.h}`;
    const near = new THREE.Vector3(0, 0, 23.2);
    const far = new THREE.Vector3(0, 0, -24.5);
    const ndc = (v: THREE.Vector3) => v.clone().project(this.camera).y;
    let lo = 15;
    let hi = 220;
    let tz = 0;
    for (let i = 0; i < 28; i++) {
      const d = (lo + hi) / 2;
      // Put the hero end near the bottom of the view
      let a = -30;
      let b = 30;
      for (let j = 0; j < 28; j++) {
        tz = (a + b) / 2;
        this.placeCamera(d, tz);
        if (ndc(near) < -0.78) a = tz;
        else b = tz;
      }
      this.placeCamera(d, tz);
      if (ndc(far) > 0.7) lo = d;
      else hi = d;
    }
    this.fit = { d: hi, tz };
  }

  private project(p: THREE.Vector3): { x: number; y: number; ok: boolean } {
    const v = this.world.localToWorld(this.tmp.copy(p)).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.w, y: ((1 - v.y) / 2) * this.h, ok: v.z < 1 };
  }

  private drawOverlay(ctx: Ctx, battle: Battle, dt: number): void {
    const t = this.time;
    ctx.clearRect(0, 0, this.w, this.h);
    // Health bars and stun stars
    for (const u of battle.units) {
      if (u.dead || u.kind === 'boss') continue;
      const top = this.topOf(u);
      const s = this.project(top);
      if (!s.ok) continue;
      if (u.stunUntil > battle.time) {
        ctx.fillStyle = '#ffe066';
        ctx.font = '10px sans-serif';
        for (let i = 0; i < 3; i++) {
          const a = t * 5 + (i * Math.PI * 2) / 3;
          ctx.fillText('★', s.x + Math.cos(a) * 10 - 4, s.y - 10 + Math.sin(a) * 3);
        }
      }
      const isHero = u.kind === 'hero';
      if (!isHero && u.hp >= u.maxHp && u.shield <= 0) continue;
      const w = isHero ? 46 : u.elite ? 34 : 26;
      const h = isHero ? 6 : 4;
      const frac = Math.max(0, u.hp / u.maxHp);
      ctx.fillStyle = 'rgba(10,6,30,0.75)';
      rr(ctx, s.x - w / 2 - 1, s.y - 1, w + 2, h + 2, 3);
      ctx.fill();
      ctx.fillStyle = u.side === 'ally' ? (frac > 0.35 ? '#43d17a' : '#ffb347') : '#ff5c7a';
      rr(ctx, s.x - w / 2, s.y, w * frac, h, 2);
      ctx.fill();
      if (u.shield > 0) {
        ctx.fillStyle = 'rgba(127,211,255,0.9)';
        ctx.fillRect(s.x - w / 2, s.y - 2, Math.min(w, (w * u.shield) / u.maxHp), 2);
      }
      if (u.elite) {
        ctx.strokeStyle = '#ffc94a';
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x - w / 2 - 1, s.y - 1, w + 2, h + 2);
      }
    }
    // Floating numbers
    this.texts = this.texts.filter((f) => t - f.born < f.life);
    ctx.textAlign = 'center';
    for (const f of this.texts) {
      const k = (t - f.born) / f.life;
      const s = this.project(f.pos);
      if (!s.ok) continue;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.5);
      ctx.globalAlpha = Math.min(1, 2 * (1 - k));
      ctx.font = `${Math.round(f.size * pop)}px "Lilita One", sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20,10,40,0.85)';
      const y = s.y - k * 34;
      ctx.strokeText(f.text, s.x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, s.x, y);
    }
    ctx.globalAlpha = 1;
    // Why a dragged card cannot be dropped right now
    const pl = this.placement;
    if (pl && !pl.ok && pl.reason) {
      const s = this.project(new THREE.Vector3(toX(pl.x), (pl.flying ? FLY_Y : 0) + 4.2, toZ(pl.lane)));
      if (s.ok) dropLabel(ctx, pl.reason, s.x, s.y);
    }
    // Flash
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,250,220,${this.flash * 0.5})`;
      ctx.fillRect(0, 0, this.w, this.h);
      this.flash = Math.max(0, this.flash - dt * 2.5);
    }
    // Banner
    this.banners = this.banners.filter((b) => t - b.born < b.life);
    const banner = this.banners.at(-1);
    if (banner) {
      const k = (t - banner.born) / banner.life;
      const a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
      const scale = k < 0.15 ? 0.7 + (k / 0.15) * 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(this.w / 2, this.h * 0.3);
      ctx.scale(scale, scale);
      ctx.fillStyle = 'rgba(10,6,30,0.55)';
      rr(ctx, -this.w * 0.42, -30, this.w * 0.84, banner.subtitle ? 62 : 44, 14);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.font = `28px "Lilita One", sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#1a0f3a';
      ctx.strokeText(banner.title, 0, 2);
      ctx.fillStyle = banner.color;
      ctx.fillText(banner.title, 0, 2);
      if (banner.subtitle) {
        ctx.font = `14px "Lilita One", sans-serif`;
        ctx.fillStyle = '#e8e0ff';
        ctx.fillText(banner.subtitle, 0, 24);
      }
      ctx.restore();
    }
  }

  dispose(): void {
    disposeTree(this.scene);
    this.particles.dispose();
    this.field.sky.dispose();
    this.scene.environment?.dispose();
    this.pipeline.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    void this.host;
  }
}
