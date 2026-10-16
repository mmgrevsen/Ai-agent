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
import { buildBattlefield, FLY_Y, toX, toZ, type Battlefield } from './battlefield3d';
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
const UNIT_SCALE = 3.2;

interface UnitView {
  rig: Rig;
  scale: number;
  baseY: number;
  facing: number;
  seed: number;
}

interface Corpse {
  rig: Rig;
  born: number;
  y: number;
  fall: number;
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
  kind: 'ring' | 'bolt' | 'column' | 'sweep';
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

export class BattleScene3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  /** Everything in battle-lane coordinates; rotated so the lane runs up the screen. */
  private readonly world = new THREE.Group();
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
  };
  private readonly mats = {
    arrowAlly: new THREE.MeshBasicMaterial({ color: '#fdf2d0' }),
    arrowEnemy: new THREE.MeshBasicMaterial({ color: '#e0b0ff' }),
    bomb: new THREE.MeshLambertMaterial({ color: '#2b2b33' }),
    crescent: new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    meteor: new THREE.MeshBasicMaterial({ color: '#ff8a3d' }),
    type: Object.fromEntries(Object.entries(TYPE_COLOR).map(([k, c]) => [k, new THREE.MeshBasicMaterial({ color: c })])) as Record<DamageType, THREE.MeshBasicMaterial>,
  };
  reducedMotion: boolean;
  private readonly opts: Scene3DOptions;

  constructor(
    private readonly host: HTMLElement,
    private readonly cb: Scene3DCallbacks,
    opts: Scene3DOptions,
  ) {
    this.opts = opts;
    this.reducedMotion = opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ antialias: !opts.pixel, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    const canvas = this.renderer.domElement;
    canvas.className = `battle3d-canvas${opts.pixel ? ' pixel' : ''}`;
    host.prepend(canvas);

    const world = WORLDS[opts.world] ?? WORLDS[0]!;
    this.field = buildBattlefield(world);
    this.world.rotation.y = Math.PI / 2;
    this.scene.add(this.world);
    this.world.add(this.field.group);
    this.scene.background = this.field.sky;
    this.scene.fog = new THREE.Fog(this.field.fog, 220, 520);
    const dark = world.index >= 2;
    this.scene.add(new THREE.HemisphereLight('#ffffff', dark ? '#8a7aa0' : world.ground, dark ? 1.9 : 1.7));
    this.scene.add(new THREE.AmbientLight('#ffffff', dark ? 0.5 : 0.35));
    const sun = new THREE.DirectionalLight(dark ? '#ffd8bc' : '#fff1d6', dark ? 2.6 : 2.8);
    sun.position.set(16, 42, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 5, far: 120 });
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);
    this.scene.add(sun.target);

    this.particles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), MAX_PARTICLES);
    this.particles.count = 0;
    this.particles.frustumCulled = false;
    this.world.add(this.particles);

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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.opts.pixel ? Math.min(dpr, PIXEL_HEIGHT / this.h) : dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  showBanner(title: string, subtitle: string, color = '#ffc94a', life = 2): void {
    this.banners.push({ title, subtitle, color, born: this.time, life });
  }

  // --- Mapping helpers ---------------------------------------------------------------------------

  private unitPos(u: Unit, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(toX(u.x), u.flying ? FLY_Y : 0, toZ(u.lane));
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

  private column(x: number, color: string, life: number, height = 12, width = 2.2): void {
    const m = new THREE.Mesh(this.geo.plane, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(x, height / 2, 0.5);
    m.scale.set(width, height, 1);
    this.world.add(m);
    this.fx.push({ mesh: m, born: this.time, life, grow: width, kind: 'column' });
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
          if (!e.ranged) {
            if (dst) this.burst(this.midOf(dst, e.toX), '#ffffff', 3, 4, 0.18, 0.25, -10, 1);
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
          const pos = u ? this.topOf(u) : new THREE.Vector3(toX(e.x), 3, 0);
          pos.x += (Math.random() - 0.5) * 0.8;
          if (this.texts.length < 60)
            this.texts.push({ pos, text: formatNumber(e.amount), color: e.crit ? '#ffd23f' : e.side === 'ally' ? '#ff8098' : TYPE_COLOR[e.damageType], size: e.crit ? 19 : 13, born: this.time, life: 0.8 });
          if (e.crit && u) this.burst(this.midOf(u, e.x), '#ffd23f', 6, 6, 0.22, 0.35, -8, 2);
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
          const at = new THREE.Vector3(toX(e.x), e.flying ? FLY_Y : 1, 0);
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
          this.ring(x, 0, 0.12, 2.6, '#c7aaff', 0.45);
          this.column(x, '#b98eff', 0.35, 9, 1.6);
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
          m.scale.set(3.5, 16, 1);
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
    this.world.add(rig.root);
    return { rig, scale, baseY: 0, facing, seed: (u.id * 0.61803) % 1 };
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

  private animateUnit(u: Unit, v: UnitView, battle: Battle): void {
    const { rig } = v;
    const bt = battle.time;
    const t = this.time + v.seed * 10;
    const pos = this.unitPos(u, this.tmp);
    const sinceAttack = bt - u.lastAttackAt;
    const attackK = sinceAttack >= 0 && sinceAttack < 0.35 ? sinceAttack / 0.35 : -1;
    const stunned = u.stunUntil > bt;
    const moving = u.kind !== 'hero' && u.kind !== 'boss' ? !stunned && attackK < 0 && battle.waveState !== 'done' : u.kind === 'boss' && !stunned && attackK < 0;
    const motion = this.reducedMotion ? 0 : 1;
    const age = bt - u.spawnedAt;

    // Spawn: allies drop from the sky, enemies grow out of the portal
    let spawnY = 0;
    let spawnS = 1;
    if (age < 0.4 && u.kind !== 'hero') {
      const k = age / 0.4;
      if (u.side === 'ally') spawnY = (1 - k) * (1 - k) * 9;
      else spawnS = 0.25 + 0.75 * k;
    }
    const landing = age >= 0.4 && age < 0.62 && u.side === 'ally' && u.kind !== 'hero' ? Math.sin(((age - 0.4) / 0.22) * Math.PI) : 0;
    if (age >= 0.4 && age < 0.43 && u.side === 'ally' && u.kind === 'card' && !rig.root.userData.landed) {
      rig.root.userData.landed = true;
      this.ring(pos.x, pos.z, 0.12, 2.4, '#ffffff', 0.35);
      this.burst(pos.clone().setY(0.3), '#d9c39a', 8, 4, 0.25, 0.45, -12, 2);
    }

    // Hit knockback and flash
    const hit = Math.max(0, 1 - (bt - u.lastHitAt) / 0.14);
    const dir = u.side === 'ally' ? 1 : -1;
    let lunge = 0;
    if (attackK >= 0 && rig.attack === 'melee') lunge = Math.sin(attackK * Math.PI) * 0.6 * dir;
    if (attackK >= 0 && rig.attack !== 'melee') lunge = -Math.sin(attackK * Math.PI) * 0.25 * dir;
    rig.root.position.set(pos.x + lunge - hit * 0.25 * dir * motion, pos.y + spawnY, pos.z);

    // Bob, breathing and squash
    const walk = moving ? t * (u.kind === 'enemy' && u.role === 'fast' ? 16 : 10) : 0;
    let bob = 0;
    if (rig.kind === 'flyer') bob = Math.sin(t * 3) * 0.25;
    else if (rig.kind === 'float') bob = 0.3 + Math.sin(t * 1.5) * 0.3;
    else if (moving) bob = Math.abs(Math.sin(walk)) * 0.12;
    rig.body.position.y = bob * motion;
    const breathe = 1 + Math.sin(t * 2.2) * 0.02 * motion;
    const squash = 1 - landing * 0.25;
    rig.body.scale.set((1 + landing * 0.18) * spawnS, breathe * squash * spawnS, (1 + landing * 0.18) * spawnS);

    // Legs
    if (rig.kind === 'quad') {
      rig.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(walk + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.7 * motion : 0));
    } else {
      rig.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(walk + i * Math.PI) * 0.65 * motion : 0));
    }

    // Arms: attack animation by style
    const arm = rig.armR;
    if (arm) {
      let a = moving ? -Math.sin(walk) * 0.4 * motion : Math.sin(t * 2) * 0.05;
      if (attackK >= 0) {
        if (rig.attack === 'melee') a = attackK < 0.35 ? 2.3 - (attackK / 0.35) * 3.4 : -1.1 + ((attackK - 0.35) / 0.65) * 1.1;
        else if (rig.attack === 'bow') a = -1.45 + Math.min(1, attackK * 3) * 0.25;
        else if (rig.attack === 'throw') a = attackK < 0.3 ? 2.6 : 2.6 - ((attackK - 0.3) / 0.7) * 3.6;
        else a = -2.3 + attackK * 1.4;
      }
      if (u.kind === 'hero') {
        const s = this.time - this.heroStrikeAt;
        if (s >= 0 && s < 0.35) a = s < 0.1 ? 2.6 : 2.6 - ((s - 0.1) / 0.25) * 4;
      }
      arm.rotation.x = -a;
    }
    if (rig.armL) {
      let a = moving ? Math.sin(walk) * 0.4 * motion : 0;
      if (rig.attack === 'bow') a = attackK >= 0 ? 1.45 : 0.5;
      rig.armL.rotation.x = -a;
    }
    if (rig.cape) rig.cape.rotation.x = -(0.12 + (moving ? 0.25 : 0) + Math.sin(t * 4) * 0.06) * motion;
    for (const wng of rig.wings) {
      const s = wng.position.x > 0 ? 1 : -1;
      wng.rotation.z = s * Math.sin(t * (rig.height > 1.3 ? 6 : 14)) * 0.7 * motion;
    }
    for (const sp of rig.spinners) sp.rotation.y = t * 1.5;

    // Hero takes a stance: body twist on strike
    if (u.kind === 'hero') {
      const s = this.time - this.heroStrikeAt;
      rig.body.rotation.y = s >= 0 && s < 0.35 ? Math.sin((s / 0.35) * Math.PI) * 0.6 : 0;
    }
    if (stunned) rig.body.rotation.z = Math.sin(t * 8) * 0.12;
    else rig.body.rotation.z = 0;

    // Tints: hit flash, frost, burn, boss casting
    const em = rig.material.emissive;
    if (hit > 0) em.setRGB(hit * 0.9, hit * 0.9, hit * 0.9);
    else if (u.burnUntil > bt) em.setRGB(0.45 + Math.sin(t * 20) * 0.15, 0.15, 0);
    else if (u.slowMult < 1) em.setRGB(0.05, 0.2, 0.4);
    else if (u.boss && u.boss.castingUntil > bt) em.setRGB(0.4 + Math.sin(t * 14) * 0.25, 0.05, 0.05);
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
      bubble.position.set(pos.x, pos.y + r, pos.z);
      bubble.scale.setScalar(r * (1 + Math.sin(this.time * 5) * 0.03));
    } else if (bubble) {
      this.world.remove(bubble);
      (bubble.material as THREE.Material).dispose();
      this.shields.delete(u.id);
    }
  }

  private syncUnits(battle: Battle): void {
    const seen = new Set<number>();
    for (const u of battle.units) {
      if (u.dead) continue;
      seen.add(u.id);
      let v = this.views.get(u.id);
      if (!v) {
        v = this.createView(u, battle);
        this.views.set(u.id, v);
      }
      this.animateUnit(u, v, battle);
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.views.delete(id);
      const bubble = this.shields.get(id);
      if (bubble) {
        this.world.remove(bubble);
        (bubble.material as THREE.Material).dispose();
        this.shields.delete(id);
      }
      v.rig.material.emissive.setRGB(0.6, 0.6, 0.6);
      this.corpses.push({ rig: v.rig, born: this.time, y: v.rig.root.position.y, fall: v.rig.kind === 'flyer' ? 1 : 0 });
    }
    // Death animation: topple, sink and shrink
    this.corpses = this.corpses.filter((c) => {
      const k = (this.time - c.born) / 0.7;
      if (k >= 1) {
        this.world.remove(c.rig.root);
        disposeTree(c.rig.root);
        return false;
      }
      const r = c.rig.root;
      r.rotation.z = Math.min(1, k * 2.5) * (Math.PI / 2.2);
      r.position.y = c.fall ? c.y * (1 - Math.min(1, k * 2)) : c.y - Math.max(0, k - 0.5) * 2;
      const s = r.scale.x;
      if (k > 0.55) r.scale.setScalar(s * 0.9);
      c.rig.material.emissive.setRGB(Math.max(0, 0.6 - k), Math.max(0, 0.6 - k), Math.max(0, 0.6 - k));
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
        f.mesh.position.set(x, 8, 0.5);
        m.opacity = 0.85 * (1 - k * 0.5);
        if (!this.reducedMotion) this.burst(new THREE.Vector3(x, Math.random() * 8, (Math.random() - 0.5) * 4), '#ffe9a0', 2, 3, 0.3, 0.5, 2, 1);
      } else {
        m.opacity = 1 - k;
      }
      return true;
    });
  }

  // --- Frame -------------------------------------------------------------------------------------

  render(battle: Battle, dt: number, overlay: Ctx): void {
    this.time += dt;
    const t = this.time;
    if (!this.reducedMotion) this.field.update(t, dt);
    this.syncUnits(battle);
    this.syncTelegraphs(battle);
    this.updateProjectiles();
    this.updateFx();
    this.updateParticles(dt);
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
    this.placeCamera(this.fit.d * (1 - zp), this.fit.tz - zp * 18);
    if (this.shake > 0.2 && !this.reducedMotion) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.08;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.08;
      this.shake *= 0.86;
    }
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay(overlay, battle, dt);
  }

  private fit = { d: 60, tz: 0 };
  private fitFor = '';
  private static readonly PITCH = (55 * Math.PI) / 180;

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
    this.renderer.dispose();
    this.renderer.domElement.remove();
    void this.host;
  }
}
