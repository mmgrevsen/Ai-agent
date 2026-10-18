import { BALANCE } from '../../core/config/balance';
import type { Battle } from '../../core/combat/engine';
import type { BattleEvent, Unit } from '../../core/combat/types';
import type { DamageType } from '../../core/content/types';
import { BOSS_BY_ID } from '../../core/content/worlds';
import { formatNumber } from '../../core/util';
import { circle, glow, line, rgba, rr, type Ctx } from '../art/draw';
import { drawBattleProps, drawWorldBackground } from '../art/scenery';
import { drawSprite, spriteHeight, type SpriteKey } from '../art/darkSprites';
import { dropLabel, squadOffsets, type PlacementPreview, type PlacementView } from './placement';

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  born: number;
  life: number;
  vy: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  born: number;
  life: number;
  gravity: number;
}

interface Projectile {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  type: DamageType;
  born: number;
  life: number;
  ally: boolean;
  /** Push-up sword strike: drawn as a big golden crescent. */
  strike?: boolean;
}

interface Ring {
  x: number;
  y: number;
  radius: number;
  color: string;
  born: number;
  life: number;
}

interface Bolt {
  points: { x: number; y: number }[];
  born: number;
  life: number;
  color: string;
}

interface Banner {
  title: string;
  subtitle: string;
  color: string;
  born: number;
  life: number;
}

const TYPE_COLOR: Record<DamageType, string> = {
  physical: '#f5f5f5',
  fire: '#ff8a3d',
  frost: '#8fd6ff',
  lightning: '#ffe066',
  holy: '#fff3b0',
};

export interface RendererCallbacks {
  onSound: (id: 'hit' | 'crit' | 'death' | 'coin' | 'telegraph' | 'boss' | 'special' | 'warcry' | 'heal') => void;
  onShake: (strength: number) => void;
}

/** Draws a Battle each frame and turns its events into visual effects. Pure presentation. */
export class BattleRenderer implements PlacementView {
  w = 360;
  h = 300;
  groundY = 220;
  private texts: FloatText[] = [];
  private particles: Particle[] = [];
  private projectiles: Projectile[] = [];
  private rings: Ring[] = [];
  private bolts: Bolt[] = [];
  private banners: Banner[] = [];
  private flash = 0;
  private shake = 0;
  private specialSweep: { x0: number; x1: number; born: number } | null = null;
  private time = 0;
  private unitScale = 1;
  reducedMotion = false;

  constructor(private readonly cb: RendererCallbacks) {}

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.groundY = Math.round(h * 0.7);
    this.unitScale = Math.max(0.8, Math.min(1.6, Math.min(w / 285, h / 300)));
  }

  /** Lane coordinate → screen x. */
  sx(x: number): number {
    const left = 36;
    const right = 22;
    return left + (x / (BALANCE.combat.enemySpawnX + 2)) * (this.w - left - right);
  }

  private placement: PlacementPreview | null = null;

  screenToLane(px: number, py: number): { x: number; lane: number } {
    const left = 36;
    const right = 22;
    return { x: ((px - left) / Math.max(1, this.w - left - right)) * (BALANCE.combat.enemySpawnX + 2), lane: (py - this.groundY - 8) / (14 * this.unitScale) };
  }

  setPlacement(p: PlacementPreview | null): void {
    this.placement = p;
  }

  private drawPlacement(ctx: Ctx, t: number): void {
    const p = this.placement;
    if (!p) return;
    const top = this.groundY + 8 - 20 * this.unitScale;
    const bottom = this.groundY + 8 + 20 * this.unitScale;
    const x0 = this.sx(p.minX - 2);
    const x1 = this.sx(p.maxX);
    ctx.fillStyle = 'rgba(159,232,255,0.2)';
    ctx.fillRect(x0, top, x1 - x0, bottom - top);
    ctx.fillStyle = 'rgba(255,77,109,0.16)';
    ctx.fillRect(x1, top, this.sx(BALANCE.combat.enemySpawnX + 2) - x1, bottom - top);
    ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.35 * Math.sin(t * 6)})`;
    ctx.fillRect(x1 - 1.5, top, 3, bottom - top);
    const color = p.ok ? '#ffffff' : '#ff5c7a';
    for (const off of squadOffsets(Math.min(p.count, 4))) {
      const x = this.sx(p.x + off.dx);
      const y = this.groundY + Math.max(-1, Math.min(1, p.lane + off.dl)) * 14 * this.unitScale + 8;
      ctx.globalAlpha = p.ok ? 0.5 : 0.25;
      drawSprite(ctx, { type: 'card', id: p.cardId }, x, p.flying ? y - 52 * this.unitScale : y, { t, facing: 1, attack: 0, hit: 0, scale: this.unitScale, moving: false, elite: false });
      ctx.globalAlpha = 1;
    }
    const mx = this.sx(p.x);
    const my = this.groundY + p.lane * 14 * this.unitScale + 8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(mx, my, 16 * this.unitScale, 6 * this.unitScale, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (!p.ok && p.reason) dropLabel(ctx, p.reason, mx, my - 70 * this.unitScale);
  }

  private unitY(u: Unit): number {
    const lane = this.groundY + u.lane * 14 * this.unitScale + 8;
    return u.flying ? lane - 52 * this.unitScale : lane;
  }

  private spriteFor(u: Unit, world: number): SpriteKey {
    if (u.kind === 'hero') return { type: 'hero', cape: '', aura: '' };
    if (u.kind === 'card') return { type: 'card', id: u.defId };
    if (u.kind === 'boss') return { type: 'boss', id: u.defId };
    return { type: 'enemy', role: u.role as 'normal', world, elite: u.elite };
  }

  showBanner(title: string, subtitle: string, color = '#ffc94a', life = 2): void {
    this.banners.push({ title, subtitle, color, born: this.time, life });
  }

  ingest(battle: Battle, events: BattleEvent[]): void {
    const byId = (id: number) => battle.units.find((u) => u.id === id);
    for (const e of events) {
      switch (e.type) {
        case 'attack': {
          if (!e.ranged) break;
          const src = byId(e.sourceId);
          const dst = byId(e.targetId);
          const fy = src ? this.unitY(src) - 24 * this.unitScale : this.groundY - 30;
          const ty = dst ? this.unitY(dst) - 20 * this.unitScale : this.groundY - 20;
          this.projectiles.push({ fromX: this.sx(e.fromX), fromY: fy, toX: this.sx(e.toX), toY: ty, type: e.damageType, born: this.time, life: 0.22, ally: src?.side === 'ally' });
          break;
        }
        case 'damage': {
          if (e.amount < 1) break;
          const u = byId(e.targetId);
          const y = u ? this.unitY(u) - spriteHeight(this.spriteFor(u, battle.setup.world)) * this.unitScale * (u.kind === 'boss' ? (BOSS_BY_ID.get(u.defId)?.size ?? 2) * 0.5 : 1) : this.groundY - 40;
          const toAlly = e.side === 'ally';
          if (this.texts.length < 60) {
            this.texts.push({
              x: this.sx(e.x) + (Math.random() - 0.5) * 14,
              y,
              text: formatNumber(e.amount),
              color: e.crit ? '#ffd23f' : toAlly ? '#ff8098' : TYPE_COLOR[e.damageType],
              size: e.crit ? 18 : 13,
              born: this.time,
              life: 0.8,
              vy: -40,
            });
          }
          this.cb.onSound(e.crit ? 'crit' : 'hit');
          break;
        }
        case 'heal':
          if (e.amount >= 5 && this.texts.length < 60) this.texts.push({ x: this.sx(e.x), y: this.groundY - 50, text: `+${formatNumber(e.amount)}`, color: '#6dffa5', size: 12, born: this.time, life: 0.8, vy: -30 });
          break;
        case 'death': {
          const x = this.sx(e.x);
          const y = e.flying ? this.groundY - 52 * this.unitScale : this.groundY - 10;
          const color = e.side === 'enemy' ? '#d7c8ff' : '#ffffff';
          for (let i = 0; i < (this.reducedMotion ? 4 : 10); i++) {
            const a = Math.random() * Math.PI * 2;
            this.particles.push({ x, y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 - 30, color, size: 3 + Math.random() * 3, born: this.time, life: 0.5, gravity: 80 });
          }
          if (e.side === 'enemy' && e.gold > 0) {
            for (let i = 0; i < 3; i++) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 80, vy: -120 - Math.random() * 60, color: '#ffc94a', size: 4, born: this.time, life: 0.7, gravity: 300 });
            this.texts.push({ x, y: y - 20, text: `+${formatNumber(e.gold)}`, color: '#ffc94a', size: 12, born: this.time, life: 0.9, vy: -25 });
            this.cb.onSound('coin');
          }
          this.cb.onSound('death');
          break;
        }
        case 'splash':
          this.rings.push({ x: this.sx(e.x), y: this.groundY, radius: (e.radius / 104) * this.w, color: TYPE_COLOR[e.damageType], born: this.time, life: 0.35 });
          break;
        case 'chain':
          this.bolts.push({ points: e.points.map((p) => ({ x: this.sx(p.x), y: p.flying ? this.groundY - 70 * this.unitScale : this.groundY - 22 })), born: this.time, life: 0.22, color: '#ffe066' });
          break;
        case 'shieldGranted':
          this.rings.push({ x: this.sx(e.x), y: this.groundY - 20, radius: Math.min(this.w, (e.radius / 104) * this.w), color: '#7fd3ff', born: this.time, life: 0.6 });
          break;
        case 'petAbility':
          this.rings.push({ x: this.sx(e.x), y: this.groundY - 10, radius: (e.radius / 104) * this.w + 10, color: e.kind === 'fireball' ? '#ff8a3d' : e.kind === 'frostAura' ? '#8fd6ff' : '#7fd3ff', born: this.time, life: 0.5 });
          break;
        case 'rebirth':
          for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2;
            this.particles.push({ x: this.sx(e.x), y: this.groundY - 60, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, color: i % 2 ? '#ff8a3d' : '#ffe066', size: 4, born: this.time, life: 0.7, gravity: -40 });
          }
          this.texts.push({ x: this.sx(e.x), y: this.groundY - 90, text: 'REBIRTH!', color: '#ffb347', size: 16, born: this.time, life: 1.2, vy: -20 });
          break;
        case 'telegraph':
          this.cb.onSound('telegraph');
          break;
        case 'telegraphResolved':
          this.shakeBy(e.kind === 'meteor' || e.kind === 'slam' ? 6 : 3);
          this.rings.push({ x: (this.sx(e.x0) + this.sx(e.x1)) / 2, y: this.groundY, radius: Math.abs(this.sx(e.x1) - this.sx(e.x0)) / 2, color: '#ff5c5c', born: this.time, life: 0.4 });
          break;
        case 'interrupt':
          this.texts.push({ x: this.sx(e.x), y: this.groundY - 120, text: 'INTERRUPTED!', color: '#ffe066', size: 22, born: this.time, life: 1.4, vy: -15 });
          this.flash = 0.6;
          break;
        case 'special':
          this.specialSweep = { x0: this.sx(e.x0), x1: this.sx(e.x1), born: this.time };
          this.flash = 0.8;
          this.shakeBy(10);
          this.cb.onSound('special');
          break;
        case 'warCry':
          this.showBanner('WAR CRY!', `Army +${Math.round(BALANCE.exercise.warCryDamageBonus * 100)}% damage`, '#ffb347', 1.6);
          this.cb.onSound('warcry');
          break;
        case 'waveStart':
          if (e.boss) this.showBanner('BOSS WAVE', 'Something big approaches...', '#ff5c7a', 1.8);
          else this.showBanner(e.total ? `Wave ${e.wave + 1} / ${e.total}` : `Wave ${e.wave + 1}`, '', '#ffffff', 1.3);
          break;
        case 'bossSpawn':
          this.showBanner(e.name, e.title, e.tier === 2 ? '#ff5c7a' : '#ffb347', 2.4);
          this.shakeBy(8);
          this.cb.onSound('boss');
          break;
        case 'phase':
          this.showBanner(e.phaseName, e.message, '#ff8a3d', 2);
          this.shakeBy(6);
          break;
        case 'pushStrike': {
          const toY = e.flying ? this.groundY - 52 * this.unitScale - 20 : this.groundY - 24 * this.unitScale;
          this.projectiles.push({ fromX: this.sx(BALANCE.combat.heroX) + 10, fromY: this.groundY - 40 * this.unitScale, toX: this.sx(e.x), toY, type: 'physical', born: this.time, life: 0.18, ally: true, strike: true });
          this.rings.push({ x: this.sx(e.x), y: toY + 10, radius: (BALANCE.exercise.repStrikeSplashRadius / 104) * this.w + 8, color: '#ffd23f', born: this.time + 0.18, life: 0.35 });
          this.shakeBy(3);
          this.cb.onSound('crit');
          break;
        }
        case 'rep':
          for (let i = 0; i < 6; i++) this.particles.push({ x: this.sx(BALANCE.combat.heroX), y: this.groundY - 40, vx: (Math.random() - 0.5) * 50, vy: -60 - Math.random() * 40, color: e.verified ? '#ffe066' : '#c7aaff', size: 3, born: this.time, life: 0.8, gravity: -20 });
          break;
        default:
          break;
      }
    }
  }

  private shakeBy(strength: number): void {
    if (this.reducedMotion) return;
    this.shake = Math.max(this.shake, strength);
    this.cb.onShake(strength);
  }

  draw(ctx: Ctx, battle: Battle, dt: number, look: { cape: string; aura: string }): void {
    this.time += dt;
    const t = this.time;
    ctx.save();
    if (this.shake > 0.2 && !this.reducedMotion) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= 0.86;
    }
    drawWorldBackground(ctx, battle.setup.world, this.w, this.h, this.groundY, t, 0);
    drawBattleProps(ctx, battle.setup.world, this.sx(BALANCE.combat.heroX) - 6, this.sx(BALANCE.combat.enemySpawnX) + 4, this.groundY + 4, t);

    // Telegraph zones (boss attacks) drawn on the ground under units.
    for (const tel of battle.telegraphs) {
      const x0 = this.sx(tel.x0);
      const x1 = this.sx(tel.x1);
      const p = Math.min(1, (battle.time - tel.createdAt) / Math.max(0.01, tel.resolveAt - tel.createdAt));
      const pulse = 0.25 + 0.2 * Math.sin(t * 18);
      if (tel.kind === 'meteor' || tel.kind === 'volley') {
        const cx = (x0 + x1) / 2;
        const r = (x1 - x0) / 2;
        ctx.fillStyle = `rgba(255,60,60,${pulse})`;
        ctx.beginPath();
        ctx.ellipse(cx, this.groundY + 4, r, r * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ff3b3b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, this.groundY + 4, r * p, r * 0.35 * p, 0, 0, Math.PI * 2);
        ctx.stroke();
        // falling projectile
        glow(ctx, cx, this.groundY - (1 - p) * this.groundY, 14, tel.kind === 'meteor' ? '#ff8a3d' : '#c39bd3', 0.9);
      } else if (tel.kind === 'summon' || tel.kind === 'shield') {
        glow(ctx, (x0 + x1) / 2, this.groundY - 40, 40 + p * 20, tel.kind === 'shield' ? '#7fd3ff' : '#b670ff', 0.4);
      } else {
        ctx.fillStyle = `rgba(255,60,60,${pulse})`;
        rr(ctx, x0, this.groundY - 6, x1 - x0, 22, 6);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,40,40,0.45)';
        rr(ctx, x1 - (x1 - x0) * p, this.groundY - 6, (x1 - x0) * p, 22, 6);
        ctx.fill();
      }
    }

    this.drawPlacement(ctx, t);

    // Units, sorted by depth.
    const units = battle.units.filter((u) => !u.dead).sort((a, b) => (a.flying === b.flying ? a.lane - b.lane : a.flying ? 1 : -1));
    for (const u of units) {
      const x = this.sx(u.x);
      const y = this.unitY(u);
      const key: SpriteKey = u.kind === 'hero' ? { type: 'hero', cape: look.cape, aura: look.aura } : this.spriteFor(u, battle.setup.world);
      const bossSize = u.kind === 'boss' ? (BOSS_BY_ID.get(u.defId)?.size ?? 2) * 0.55 : 1;
      const scale = this.unitScale * (u.kind === 'enemy' && u.elite ? 1.25 : 1) * bossSize * (u.kind === 'hero' ? 1.15 : 1);
      const sinceAttack = battle.time - u.lastAttackAt;
      const attack = sinceAttack < 0.3 ? sinceAttack / 0.3 : 0;
      const hit = Math.max(0, 1 - (battle.time - u.lastHitAt) / 0.12);
      const stunned = u.stunUntil > battle.time;
      const moving = u.kind !== 'hero' && !stunned && attack === 0 && battle.waveState !== 'done';
      if (u.slowMult < 1) glow(ctx, x, y - 12, 18 * scale, '#8fd6ff', 0.35);
      if (u.burnUntil > battle.time) glow(ctx, x, y - 16, 16 * scale, '#ff8a3d', 0.35);
      drawSprite(ctx, key, x, y, { t: t + u.id * 0.37, facing: u.side === 'ally' ? 1 : -1, attack, hit, scale, moving, elite: u.elite });
      if (u.shield > 0) {
        ctx.strokeStyle = 'rgba(127,211,255,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y - 22 * scale, 18 * scale, 26 * scale, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (stunned) this.drawStars(ctx, x, y - spriteHeight(key) * scale - 4, t);
      this.drawHealthBar(ctx, u, x, y - spriteHeight(key) * scale - 8, battle);
    }

    // Projectiles
    this.projectiles = this.projectiles.filter((p) => t - p.born < p.life);
    for (const p of this.projectiles) {
      const k = (t - p.born) / p.life;
      const x = p.fromX + (p.toX - p.fromX) * k;
      const y = p.fromY + (p.toY - p.fromY) * k - Math.sin(k * Math.PI) * 14;
      if (p.strike) {
        // Golden crescent slash flying from the hero to the target.
        const r = 16 * this.unitScale;
        glow(ctx, x, y, r * 1.8, '#ffd23f', 0.8);
        ctx.strokeStyle = '#fff3b0';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(x - r * 0.4, y, r, -Math.PI / 2.4, Math.PI / 2.4);
        ctx.stroke();
        ctx.strokeStyle = '#ffb000';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (p.type === 'physical') {
        const ang = Math.atan2(p.toY - p.fromY, p.toX - p.fromX);
        line(ctx, x - Math.cos(ang) * 9, y - Math.sin(ang) * 9, x, y, p.ally ? '#fdf2d0' : '#e0b0ff', 2);
      } else {
        glow(ctx, x, y, 10, TYPE_COLOR[p.type], 0.9);
        circle(ctx, x, y, 3.2);
        ctx.fillStyle = TYPE_COLOR[p.type];
        ctx.fill();
      }
    }

    // Lightning bolts
    this.bolts = this.bolts.filter((b) => t - b.born < b.life);
    for (const b of this.bolts) {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      b.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else {
          const prev = b.points[i - 1]!;
          const mx = (prev.x + p.x) / 2 + (Math.random() - 0.5) * 14;
          const my = (prev.y + p.y) / 2 + (Math.random() - 0.5) * 14;
          ctx.lineTo(mx, my);
          ctx.lineTo(p.x, p.y);
        }
      });
      ctx.stroke();
    }

    // Rings
    this.rings = this.rings.filter((r) => t - r.born < r.life);
    for (const r of this.rings) {
      const k = (t - r.born) / r.life;
      ctx.strokeStyle = rgba(r.color.startsWith('#') ? r.color : '#ffffff', 1 - k);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, Math.max(1, r.radius * (0.4 + k * 0.6)), Math.max(1, r.radius * 0.35 * (0.4 + k * 0.6)), 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Particles
    this.particles = this.particles.filter((p) => t - p.born < p.life).slice(-220);
    for (const p of this.particles) {
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = 1 - (t - p.born) / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Legend Strike sweep
    if (this.specialSweep) {
      const k = (t - this.specialSweep.born) / 0.5;
      if (k > 1) this.specialSweep = null;
      else {
        const x = this.specialSweep.x0 + (this.specialSweep.x1 - this.specialSweep.x0) * k;
        const g = ctx.createLinearGradient(x - 60, 0, x + 20, 0);
        g.addColorStop(0, 'rgba(255,220,100,0)');
        g.addColorStop(1, 'rgba(255,240,170,0.85)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 60, this.groundY - 120, 80, 140);
      }
    }

    // War cry tint
    if (battle.warCryActive) {
      ctx.fillStyle = `rgba(255,170,60,${0.08 + 0.04 * Math.sin(t * 6)})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // Floating texts
    this.texts = this.texts.filter((f) => t - f.born < f.life);
    ctx.textAlign = 'center';
    for (const f of this.texts) {
      const k = (t - f.born) / f.life;
      ctx.globalAlpha = Math.min(1, 2 * (1 - k));
      ctx.font = `${f.size}px "Lilita One", sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20,10,40,0.85)';
      const y = f.y + f.vy * k;
      ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // Flash & banners (not shaken)
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,250,220,${this.flash * 0.5})`;
      ctx.fillRect(0, 0, this.w, this.h);
      this.flash = Math.max(0, this.flash - dt * 2.5);
    }
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

  private drawStars(ctx: Ctx, x: number, y: number, t: number): void {
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i * Math.PI * 2) / 3;
      ctx.fillStyle = '#ffe066';
      ctx.font = '10px sans-serif';
      ctx.fillText('★', x + Math.cos(a) * 10, y + Math.sin(a) * 3);
    }
  }

  private drawHealthBar(ctx: Ctx, u: Unit, x: number, y: number, battle: Battle): void {
    if (u.kind === 'boss') return; // shown in the HUD boss bar
    const isHero = u.kind === 'hero';
    if (!isHero && u.hp >= u.maxHp && u.shield <= 0) return;
    const w = isHero ? 46 : u.elite ? 34 : 26;
    const h = isHero ? 6 : 4;
    const frac = Math.max(0, u.hp / u.maxHp);
    ctx.fillStyle = 'rgba(10,6,30,0.75)';
    rr(ctx, x - w / 2 - 1, y - 1, w + 2, h + 2, 3);
    ctx.fill();
    ctx.fillStyle = u.side === 'ally' ? (frac > 0.35 ? '#43d17a' : '#ffb347') : '#ff5c7a';
    rr(ctx, x - w / 2, y, w * frac, h, 2);
    ctx.fill();
    if (u.shield > 0) {
      ctx.fillStyle = 'rgba(127,211,255,0.9)';
      ctx.fillRect(x - w / 2, y - 2, Math.min(w, (w * u.shield) / u.maxHp), 2);
    }
    if (u.elite) {
      ctx.strokeStyle = '#ffc94a';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    }
    void battle;
  }
}
