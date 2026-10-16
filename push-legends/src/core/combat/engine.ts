import { BALANCE } from '../config/balance';
import type { DamageType, EnemyRole } from '../content/types';
import { BOSS_BY_ID, ENEMY_ROLE_STATS, getWorld } from '../content/worlds';
import { Rng } from '../rng';
import type {
  BattleAnalysis,
  BattleEvent,
  BattleOutcome,
  BattleResult,
  BattleSetup,
  DeckCardSpec,
  EnemySpawn,
  Telegraph,
  Unit,
  WaveDef,
} from './types';
import { buildEndlessWave } from './waves';

const C = BALANCE.combat;
const EX = BALANCE.exercise;

type WaveState = 'pending' | 'spawning' | 'fighting' | 'intermission' | 'done';

/**
 * Deterministic battle simulation. The UI drives it with step(dt) and player commands
 * (deploy, useSpecial, registerRep); it never reads wall-clock time or Math.random.
 */
export class Battle {
  readonly setup: BattleSetup;
  time = 0;
  units: Unit[] = [];
  telegraphs: Telegraph[] = [];
  valor: number;
  special = 0;
  warCryUntil = 0;
  warCryProgress = 0;
  hand: number[] = [];
  queue: number[] = [];
  waveIndex: number;
  waveState: WaveState = 'pending';
  wavesCleared = 0;
  outcome: BattleOutcome | null = null;
  autoDeploy: boolean;
  readonly hero: Unit;

  goldEarned = 0;
  xpEarned = 0;
  enemiesDefeated = 0;
  elitesDefeated = 0;
  specialsUsed = 0;
  interrupts = 0;
  warCries = 0;
  cardsDeployed = 0;
  reps = { full: 0, knee: 0, simulated: 0, repUnits: 0 };
  /** Total damage dealt by push-up strikes this battle. */
  repDamage = 0;
  bankedStrikes = 0;
  private nextBankedStrikeAt = 0;
  reachedBoss = false;
  bossIds: string[] = [];
  bossesKilled = 0;

  private events: BattleEvent[] = [];
  private readonly rng: Rng;
  private nextId = 1;
  private acc = 0;
  private spawnQueue: { spawn: EnemySpawn; at: number }[] = [];
  private nextWaveAt = 3;
  private analysis: BattleAnalysis;
  private generatedWaves: WaveDef[];

  constructor(setup: BattleSetup) {
    this.setup = setup;
    this.rng = new Rng(setup.seed);
    this.valor = setup.modifiers.includes('rally') ? C.maxValor : C.startValor;
    this.autoDeploy = setup.autoDeploy;
    this.waveIndex = setup.startWave;
    this.wavesCleared = setup.startWave;
    this.generatedWaves = [...setup.waves];
    this.hero = this.createHero();
    this.units.push(this.hero);

    const order = this.rng.shuffle(setup.deck.map((_, i) => i));
    this.hand = order.slice(0, Math.min(C.handSize, order.length));
    this.queue = order.slice(this.hand.length);

    const deck = setup.deck.map((d) => d.def);
    this.analysis = {
      heroDamageTakenByRole: {},
      flyingReachedHero: 0,
      armoredKills: 0,
      maxEnemiesAlive: 0,
      killedByBoss: false,
      deckHasAntiAir: deck.some((d) => d.targetsAir && d.role !== 'support'),
      deckHasTank: deck.some((d) => d.role === 'tank'),
      deckHasSplash: deck.some((d) => ['splashBurn', 'frostNova', 'chain', 'armorBreak', 'auroraBreath', 'rebirth'].includes(d.ability.kind)),
      deckHasHealer: deck.some((d) => d.ability.kind === 'heal' || d.ability.kind === 'healAura'),
      averageCardLevel: setup.deck.length ? setup.deck.reduce((s, d) => s + d.level, 0) / setup.deck.length : 0,
      timeWithFullValor: 0,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Public API

  get totalWaves(): number {
    return this.setup.endless ? Infinity : this.setup.waves.length;
  }

  get isOver(): boolean {
    return this.outcome !== null;
  }

  get warCryActive(): boolean {
    return this.time < this.warCryUntil;
  }

  get enemies(): Unit[] {
    return this.units.filter((u) => u.side === 'enemy' && !u.dead);
  }

  get allies(): Unit[] {
    return this.units.filter((u) => u.side === 'ally' && !u.dead);
  }

  get activeBoss(): Unit | null {
    return this.units.find((u) => u.kind === 'boss' && !u.dead) ?? null;
  }

  handCard(slot: number): DeckCardSpec | null {
    const idx = this.hand[slot];
    return idx === undefined ? null : this.setup.deck[idx]!;
  }

  nextCard(): DeckCardSpec | null {
    const idx = this.queue[0];
    return idx === undefined ? null : this.setup.deck[idx]!;
  }

  drainEvents(): BattleEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Advances the simulation by real seconds using a fixed internal timestep. */
  step(dt: number): void {
    if (this.outcome) return;
    this.acc += Math.min(dt, 0.5);
    while (this.acc >= C.tickSeconds && !this.outcome) {
      this.acc -= C.tickSeconds;
      this.tick(C.tickSeconds);
    }
  }

  /** Runs the battle to completion without rendering (tests and balance simulations). */
  runToEnd(maxSeconds = 600, onTick?: (b: Battle) => void): BattleResult {
    while (!this.outcome && this.time < maxSeconds) {
      this.tick(C.tickSeconds);
      onTick?.(this);
      this.events.length = 0;
    }
    if (!this.outcome) this.finish('timeout');
    return this.result();
  }

  /**
   * Where a card may be dropped right now (lane x range): from just in front of the hero up to the
   * middle of the field, and never past the nearest enemy.
   */
  deployZone(): { minX: number; maxX: number } {
    const nearest = this.enemies.reduce((m, e) => Math.min(m, e.x), Infinity);
    return { minX: C.deployMinX, maxX: Math.max(C.deployMinX, Math.min(C.deployMaxX, nearest - C.deployEnemyGap)) };
  }

  /** Clamps a requested drop point into the current deploy zone (lane -1..1). */
  clampDeploy(at: { x: number; lane: number }): { x: number; lane: number } {
    const z = this.deployZone();
    return { x: Math.max(z.minX, Math.min(z.maxX, at.x)), lane: Math.max(-1, Math.min(1, at.lane)) };
  }

  canAfford(slot: number): boolean {
    const idx = this.hand[slot];
    return idx !== undefined && this.valor + 1e-9 >= this.setup.deck[idx]!.def.cost;
  }

  /**
   * Plays the card in a hand slot. Without `at` the troops march out of the gate; with `at` they
   * appear where the player dropped the card (clamped into the deploy zone).
   */
  deploy(slot: number, at?: { x: number; lane: number }): boolean {
    if (this.outcome) return false;
    const idx = this.hand[slot];
    if (idx === undefined) return false;
    const spec = this.setup.deck[idx]!;
    if (this.valor + 1e-9 < spec.def.cost) return false;
    if (this.allies.length - 1 + spec.def.count > C.maxAlliesOnField) return false;
    this.valor -= spec.def.cost;
    const spot = at ? this.clampDeploy(at) : null;
    for (let i = 0; i < spec.def.count; i++) this.spawnAlly(spec, idx, i, spot);
    this.cardsDeployed++;
    this.events.push({ type: 'deploy', cardId: spec.def.id, x: spot?.x ?? C.allySpawnX, lane: spot?.lane ?? 0 });
    // Cycle: the played card goes to the back of the queue, the next card enters the hand.
    this.queue.push(idx);
    this.hand[slot] = this.queue.shift()!;
    return true;
  }

  canUseSpecial(): boolean {
    return !this.outcome && this.special >= 1;
  }

  /** Legend Strike: heavy damage near the frontline, stuns, and interrupts boss telegraphs. */
  useSpecial(): boolean {
    if (!this.canUseSpecial()) return false;
    this.special = 0;
    this.specialsUsed++;
    const front = this.frontlineX();
    const x0 = C.heroX;
    const x1 = front + C.specialRange * 0.6;
    let hits = 0;
    for (const e of this.enemies) {
      if (e.x > x1 && e.kind !== 'boss') continue;
      const bossMult = e.bossTier > 0 ? this.setup.hero.bossDamage : 1;
      this.applyDamage(e, this.setup.hero.damage * C.specialDamageMultiplier * bossMult * this.allyDamageMult(), 'holy', this.hero, false);
      e.stunUntil = Math.max(e.stunUntil, this.time + C.specialStunSec * (e.bossTier > 0 ? 0.6 : 1));
      hits++;
    }
    // Interrupt every boss attack currently being telegraphed.
    const casting = this.telegraphs.filter((t) => this.units.find((u) => u.id === t.sourceId && u.kind === 'boss' && !u.dead));
    if (casting.length) {
      const sourceIds = new Set(casting.map((t) => t.sourceId));
      this.telegraphs = this.telegraphs.filter((t) => !sourceIds.has(t.sourceId));
      for (const id of sourceIds) {
        const boss = this.units.find((u) => u.id === id)!;
        if (boss.boss) boss.boss.castingUntil = 0;
        this.interrupts++;
        this.events.push({ type: 'interrupt', bossName: boss.name, x: boss.x });
      }
    }
    this.events.push({ type: 'special', x0, x1, hits });
    return true;
  }

  /**
   * Registers one push-up repetition. Verified reps come from the camera engine; simulated reps
   * (developer mode) produce the same combat effect but are tracked separately and never count
   * as verified exercise.
   */
  registerRep(kind: 'full' | 'knee', verified: boolean): void {
    if (this.outcome) return;
    const mult = kind === 'full' ? EX.fullRepMultiplier : EX.kneeRepMultiplier;
    const power = this.setup.hero.repPower;
    const rally = this.setup.modifiers.includes('rally') ? 2 : 0;
    const gained = (EX.valorPerRep + rally) * mult * power;
    this.valor = Math.min(C.maxValor, this.valor + gained);
    this.pushupStrike(mult);
    this.warCryProgress += mult;
    if (this.warCryProgress >= EX.warCryReps) {
      this.warCryProgress -= EX.warCryReps;
      this.warCryUntil = this.time + EX.warCryDurationSec;
      this.warCries++;
      this.events.push({ type: 'warCry' });
    }
    for (const eff of this.setup.hero.effects) {
      if (eff.kind === 'repShield') this.grantShield(this.hero, this.hero.maxHp * eff.hpFraction * mult, 8);
    }
    if (!verified) this.reps.simulated++;
    else if (kind === 'full') this.reps.full++;
    else this.reps.knee++;
    if (verified) this.reps.repUnits += mult;
    this.events.push({ type: 'rep', kind, verified, valor: gained });
  }

  /** Damage a full push-up deals right now (before resistances). Better swords raise hero damage. */
  get pushupDamage(): number {
    return this.setup.hero.damage * EX.repStrikeDamage * this.setup.hero.repPower * this.allyDamageMult();
  }

  /**
   * A push-up makes the hero strike the enemy closest to the gate, with splash around it. If no enemy
   * is on the field the strike is saved and released when the next wave arrives, so no rep is wasted.
   */
  private pushupStrike(mult: number): void {
    const target = this.enemies.reduce<Unit | null>((b, e) => (!b || e.x < b.x ? e : b), null);
    if (!target) {
      this.bankedStrikes = Math.min(EX.maxBankedStrikes, this.bankedStrikes + mult);
      return;
    }
    const h = this.setup.hero;
    let dmg = this.pushupDamage * mult;
    if (target.bossTier > 0) dmg *= h.bossDamage;
    const dealt = this.applyDamage(target, dmg, 'physical', this.hero, false, true);
    for (const e of this.enemies) {
      if (e.id !== target.id && Math.abs(e.x - target.x) <= EX.repStrikeSplashRadius) this.applyDamage(e, dmg * EX.repStrikeSplash, 'physical', this.hero, false);
    }
    this.applyHeroEffects(target, dmg, dealt);
    this.hero.lastAttackAt = this.time;
    this.repDamage += dmg;
    this.events.push({ type: 'pushStrike', x: target.x, flying: target.flying, amount: dmg });
  }

  private releaseBankedStrike(): void {
    if (this.bankedStrikes <= 0 || this.enemies.length === 0 || this.time < this.nextBankedStrikeAt) return;
    const mult = Math.min(1, this.bankedStrikes);
    this.bankedStrikes -= mult;
    this.nextBankedStrikeAt = this.time + 0.35;
    this.pushupStrike(mult);
  }

  retreat(): void {
    if (!this.outcome) this.finish('retreat');
  }

  result(): BattleResult {
    const bossUnits = this.units.filter((u) => u.kind === 'boss');
    const lastBoss = bossUnits.at(-1);
    let phasesCleared = 0;
    let totalPhases = 0;
    let bossHpFraction = 0;
    if (lastBoss?.boss) {
      totalPhases = lastBoss.boss.def.phases.length;
      phasesCleared = lastBoss.dead ? totalPhases : lastBoss.boss.phaseIndex;
      bossHpFraction = lastBoss.dead ? 0 : lastBoss.hp / lastBoss.maxHp;
    }
    return {
      mode: this.setup.mode,
      label: this.setup.label,
      outcome: this.outcome ?? 'retreat',
      stageIndex: this.setup.stageIndex,
      difficulty: this.setup.difficulty,
      wavesCleared: this.wavesCleared,
      totalWaves: this.setup.endless ? this.wavesCleared : this.setup.waves.length,
      reachedBoss: this.reachedBoss,
      bossDefeated: bossUnits.length > 0 && bossUnits.every((b) => b.dead),
      bossIds: [...this.bossIds],
      bossPhasesCleared: phasesCleared,
      bossTotalPhases: totalPhases,
      bossHpFraction,
      enemiesDefeated: this.enemiesDefeated,
      elitesDefeated: this.elitesDefeated,
      goldEarned: Math.floor(this.goldEarned),
      xpEarned: Math.floor(this.xpEarned),
      duration: this.time,
      reps: { ...this.reps },
      repDamage: Math.floor(this.repDamage),
      specialsUsed: this.specialsUsed,
      interrupts: this.interrupts,
      warCries: this.warCries,
      cardsDeployed: this.cardsDeployed,
      score: this.setup.mode === 'blitz' || this.setup.mode === 'challenge' ? this.enemiesDefeated : this.wavesCleared,
      analysis: { ...this.analysis },
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Simulation

  private tick(dt: number): void {
    this.time += dt;
    this.valor = Math.min(C.maxValor, this.valor + C.valorRegenPerSec * dt);
    if (this.valor >= C.maxValor) this.analysis.timeWithFullValor += dt;
    this.special = Math.min(1, this.special + (dt / C.specialPassiveChargeSec) * this.setup.hero.specialCharge);

    this.updateWaves();
    this.releaseBankedStrike();
    if (this.autoDeploy) this.runAutoDeploy();
    this.updatePet(dt);

    for (const u of this.units) {
      if (u.dead) continue;
      this.updateStatuses(u, dt);
      if (u.dead) continue;
      if (u.boss) this.updateBoss(u, dt);
      this.updateAbilities(u, dt);
      this.updateUnit(u, dt);
    }
    this.resolveTelegraphs();
    this.collectDead();
    this.analysis.maxEnemiesAlive = Math.max(this.analysis.maxEnemiesAlive, this.enemies.length);
    this.checkEnd();
  }

  private checkEnd(): void {
    if (this.outcome) return;
    if (this.hero.dead) {
      this.finish(this.setup.endless ? 'complete' : 'defeat');
      return;
    }
    if (this.time >= this.setup.timeLimit) {
      this.finish(this.setup.endless ? 'complete' : 'timeout');
      return;
    }
    if (!this.setup.endless && this.waveState === 'done') this.finish('victory');
  }

  private finish(outcome: BattleOutcome): void {
    this.outcome = outcome;
    this.telegraphs = [];
    this.events.push({ type: 'end', outcome });
  }

  private waveAt(index: number): WaveDef | null {
    if (index < this.generatedWaves.length) return this.generatedWaves[index]!;
    if (!this.setup.endless) return null;
    while (this.generatedWaves.length <= index) {
      this.generatedWaves.push(buildEndlessWave(this.setup.world, this.generatedWaves.length, this.rng, this.setup.modifiers));
    }
    return this.generatedWaves[index]!;
  }

  private updateWaves(): void {
    if (this.waveState === 'pending' || this.waveState === 'intermission') {
      if (this.time >= this.nextWaveAt) this.beginWave();
      return;
    }
    while (this.spawnQueue.length && this.spawnQueue[0]!.at <= this.time) this.spawnEnemy(this.spawnQueue.shift()!.spawn);
    if (this.waveState === 'spawning' && this.spawnQueue.length === 0) this.waveState = 'fighting';
    const blitzPressure = this.setup.mode === 'blitz' || this.setup.mode === 'challenge';
    if (this.waveState === 'fighting' && (this.enemies.length === 0 || (blitzPressure && this.enemies.length < 4))) {
      this.events.push({ type: 'waveCleared', wave: this.waveIndex });
      this.waveIndex++;
      this.wavesCleared = Math.max(this.wavesCleared, this.waveIndex);
      if (!this.setup.endless && this.waveIndex >= this.setup.waves.length) {
        this.waveState = 'done';
        return;
      }
      this.waveState = 'intermission';
      this.nextWaveAt = this.time + (blitzPressure ? 0.8 : C.waveIntervalSec);
    }
  }

  private beginWave(): void {
    const wave = this.waveAt(this.waveIndex);
    if (!wave) {
      this.waveState = 'done';
      return;
    }
    this.waveState = 'spawning';
    const spacing = C.spawnSpacingSec * (this.setup.mode === 'blitz' ? 0.6 : 1);
    this.spawnQueue = wave.spawns.map((spawn, i) => ({ spawn, at: this.time + i * spacing }));
    this.events.push({ type: 'waveStart', wave: this.waveIndex, total: this.setup.endless ? 0 : this.setup.waves.length, boss: wave.isBossWave });
  }

  private endlessScale(): number {
    if (!this.setup.endless) return 1;
    return Math.pow(this.setup.endlessGrowth, this.waveIndex);
  }

  private newUnitBase(partial: Partial<Unit> & Pick<Unit, 'side' | 'kind' | 'defId' | 'name' | 'role' | 'x'>): Unit {
    const id = this.nextId++;
    return {
      id,
      elite: false,
      bossTier: 0,
      lane: (((id * 7919) % 11) - 5) / 5,
      size: 1,
      hp: 1,
      maxHp: 1,
      shield: 0,
      shieldUntil: 0,
      damage: 0,
      attackInterval: 1,
      attackCd: 0.3,
      range: 3,
      speed: 5,
      armor: 0,
      flying: false,
      targetsGround: true,
      targetsAir: false,
      damageType: 'physical',
      resist: {},
      priority: 'nearest',
      ability: { kind: 'none' },
      abilityTimer: 0,
      slowMult: 1,
      slowUntil: 0,
      burnDps: 0,
      burnUntil: 0,
      stunUntil: 0,
      hasteMult: 1,
      hasteUntil: 0,
      targetId: null,
      lastHitTargetId: null,
      rebirthUsed: false,
      goldValue: 0,
      xpValue: 0,
      dead: false,
      lastAttackAt: -10,
      lastHitAt: -10,
      spawnedAt: this.time,
      cardIndex: null,
      boss: null,
      ...partial,
    };
  }

  private createHero(): Unit {
    const h = this.setup.hero;
    const glass = this.setup.modifiers.includes('glass_cannon') ? 1.5 : 1;
    return this.newUnitBase({
      side: 'ally',
      kind: 'hero',
      defId: 'hero',
      name: 'Hero',
      role: 'hero',
      x: C.heroX,
      lane: 0,
      size: 1.3,
      hp: h.hp,
      maxHp: h.hp,
      damage: h.damage * glass,
      attackInterval: h.attackInterval,
      range: BALANCE.hero.attackRange,
      speed: 0,
      targetsAir: true,
      armor: 0.1,
    });
  }

  private spawnAlly(spec: DeckCardSpec, cardIndex: number, n: number, spot: { x: number; lane: number } | null = null): void {
    const d = spec.def;
    // A dropped squad stands in a small formation around the drop point.
    const spread = d.count > 1 ? (n - (d.count - 1) / 2) * 0.34 : 0;
    const placed = spot ? { x: Math.max(C.heroX + 2, spot.x - (n % 2) * 1.4), lane: Math.max(-1, Math.min(1, spot.lane + spread)) } : null;
    const h = this.setup.hero;
    const glass = this.setup.modifiers.includes('glass_cannon') ? 1.5 : 1;
    const hp = spec.hp * h.armyHp * (1 + this.setup.restBuff);
    const u = this.newUnitBase({
      side: 'ally',
      kind: 'card',
      defId: d.id,
      name: d.name,
      role: d.role,
      x: placed?.x ?? C.allySpawnX - n * 2,
      ...(placed ? { lane: placed.lane } : {}),
      size: d.id === 'bastion_golem' ? 1.5 : d.id === 'aurora_drake' ? 1.6 : 1,
      hp,
      maxHp: hp,
      damage: spec.damage * h.armyDamage * glass * (1 + this.setup.restBuff * 0.5),
      attackInterval: d.attackInterval,
      attackCd: 0.2 + n * 0.15,
      range: d.range,
      speed: d.speed,
      armor: d.armor,
      flying: d.flying,
      targetsGround: d.targetsGround,
      targetsAir: d.targetsAir,
      damageType: d.damageType,
      priority: d.priority,
      ability: d.ability,
      abilityTimer: d.ability.kind === 'shieldAllies' ? 1 : d.ability.kind === 'auroraBreath' ? 2 : 0,
      cardIndex,
    });
    this.units.push(u);
    this.events.push({ type: 'spawn', unitId: u.id, side: 'ally' });
  }

  private spawnEnemy(spawn: EnemySpawn, atX?: number): void {
    const world = getWorld(this.setup.world);
    const diff = this.setup.difficultyMult * this.endlessScale();
    const glass = this.setup.modifiers.includes('glass_cannon') ? 1.5 : 1;
    const ironSkin = this.setup.modifiers.includes('iron_skin') ? 0.2 : 0;
    const swift = this.setup.modifiers.includes('swift_foes') ? 1.35 : 1;
    const x = atX ?? C.enemySpawnX + this.rng.range(0, 3);

    if (spawn.kind === 'boss') {
      const def = BOSS_BY_ID.get(spawn.bossId);
      if (!def) return;
      const hp = def.hp * diff * BALANCE.difficulty.bossHpMult;
      const u = this.newUnitBase({
        side: 'enemy',
        kind: 'boss',
        defId: def.id,
        name: def.name,
        role: 'boss',
        x,
        lane: 0,
        bossTier: spawn.tier,
        size: def.size,
        hp,
        maxHp: hp,
        damage: def.damage * diff * glass * BALANCE.difficulty.bossDamageMult,
        attackInterval: def.attackInterval,
        range: def.range,
        speed: def.speed * swift,
        armor: Math.min(0.8, def.armor + ironSkin),
        flying: def.flying,
        targetsAir: true,
        resist: { ...def.resist },
        goldValue: this.killGoldFor(spawn.tier === 2 ? C.bossGoldMult : C.miniBossGoldMult),
        xpValue: spawn.tier === 2 ? 60 : 25,
        boss: {
          def,
          phaseIndex: 0,
          abilityCds: def.phases[0]!.abilities.map((a) => a.cooldown * 0.5),
          castingUntil: 0,
          baseResist: { ...def.resist },
          baseAttackInterval: def.attackInterval,
          baseDamage: def.damage * diff * glass * BALANCE.difficulty.bossDamageMult,
        },
      });
      this.units.push(u);
      this.reachedBoss = true;
      this.bossIds.push(def.id);
      this.events.push({ type: 'bossSpawn', bossId: def.id, name: def.name, title: def.title, tier: spawn.tier });
      this.events.push({ type: 'spawn', unitId: u.id, side: 'enemy' });
      return;
    }

    const s = ENEMY_ROLE_STATS[spawn.role];
    const eliteHp = spawn.elite ? C.eliteHpMult : 1;
    const eliteDmg = spawn.elite ? C.eliteDamageMult : 1;
    const hp = s.hp * diff * eliteHp;
    const u = this.newUnitBase({
      side: 'enemy',
      kind: 'enemy',
      defId: `${world.id}:${spawn.role}`,
      name: `${spawn.elite ? 'Elite ' : ''}${world.enemyNames[spawn.role]}`,
      role: spawn.role,
      x,
      elite: spawn.elite,
      size: spawn.elite ? 1.35 : 1,
      hp,
      maxHp: hp,
      damage: s.damage * diff * eliteDmg * glass,
      attackInterval: s.attackInterval,
      attackCd: 0.5,
      range: s.range,
      speed: s.speed * swift,
      armor: Math.min(0.8, s.armor + ironSkin),
      flying: s.flying,
      targetsAir: spawn.role === 'ranged' || spawn.role === 'flying',
      resist: { ...world.resist },
      goldValue: this.killGoldFor(s.goldWeight * (spawn.elite ? C.eliteGoldMult : 1)),
      xpValue: spawn.elite ? 4 : 1,
    });
    this.units.push(u);
    this.events.push({ type: 'spawn', unitId: u.id, side: 'enemy' });
  }

  private killGoldFor(weight: number): number {
    const endlessBonus = this.setup.endless ? Math.pow(1.06, this.waveIndex) : 1;
    return BALANCE.economy.killGoldBase * Math.pow(BALANCE.economy.killGoldGrowth, this.setup.stageIndex) * weight * this.setup.rewardMult * endlessBonus;
  }

  private frontlineX(): number {
    let x = C.heroX;
    for (const a of this.allies) if (a.x > x) x = a.x;
    return x;
  }

  // ---------------------------------------------------------------------------------------------
  // Unit behaviour

  private updateStatuses(u: Unit, dt: number): void {
    if (u.burnUntil > this.time && u.burnDps > 0) this.applyDamage(u, u.burnDps * dt, 'fire', null, true);
    if (u.slowUntil <= this.time) u.slowMult = 1;
    if (u.hasteUntil <= this.time) u.hasteMult = 1;
    if (u.shieldUntil <= this.time) u.shield = 0;
  }

  private canTarget(attacker: Unit, target: Unit): boolean {
    if (target.dead) return false;
    return target.flying ? attacker.targetsAir : attacker.targetsGround;
  }

  private distance(a: Unit, b: Unit): number {
    return Math.max(0, Math.abs(a.x - b.x) - (a.size + b.size - 2) * 1.5);
  }

  private inRange(a: Unit, b: Unit, extra = 0): boolean {
    return this.distance(a, b) <= a.range + extra;
  }

  private chooseAllyTarget(u: Unit): Unit | null {
    const enemies = this.units.filter((e) => e.side === 'enemy' && this.canTarget(u, e));
    if (enemies.length === 0) return null;
    const inRange = enemies.filter((e) => this.inRange(u, e));
    const pool = inRange.length ? inRange : null;
    const nearest = (list: Unit[]) => list.reduce((best, e) => (Math.abs(e.x - u.x) < Math.abs(best.x - u.x) ? e : best));

    const ability = u.ability;
    if (ability.kind === 'execute') {
      // Assassin: find the weakest enemy within leap range.
      const leap = enemies.filter((e) => Math.abs(e.x - u.x) <= ability.leapRange + u.range);
      if (leap.length) return leap.reduce((b, e) => (e.hp / e.maxHp < b.hp / b.maxHp ? e : b));
    }
    if (!pool) return nearest(enemies);
    switch (u.priority) {
      case 'flyingFirst': {
        const fliers = pool.filter((e) => e.flying);
        return nearest(fliers.length ? fliers : pool);
      }
      case 'priority': {
        const vip = pool.filter((e) => e.elite || e.bossTier > 0);
        if (vip.length) return vip.reduce((b, e) => (e.hp > b.hp ? e : b));
        return pool.reduce((b, e) => (e.hp > b.hp ? e : b));
      }
      case 'armored': {
        const armored = pool.filter((e) => e.armor > 0.1);
        return nearest(armored.length ? armored : pool);
      }
      case 'groups': {
        let best = pool[0]!;
        let bestCount = -1;
        for (const e of pool) {
          const count = pool.filter((o) => Math.abs(o.x - e.x) <= 6).length;
          if (count > bestCount) {
            best = e;
            bestCount = count;
          }
        }
        return best;
      }
      case 'lowestHp':
        return pool.reduce((b, e) => (e.hp / e.maxHp < b.hp / b.maxHp ? e : b));
      default:
        return nearest(pool);
    }
  }

  private chooseEnemyTarget(u: Unit): Unit | null {
    const candidates = this.units.filter((a) => a.side === 'ally' && !a.dead && (a.flying ? u.targetsAir : true));
    if (candidates.length === 0) return null;
    // Taunting knights pull nearby attackers.
    const taunters = candidates.filter((a) => a.ability.kind === 'taunt' && Math.abs(a.x - u.x) <= a.ability.radius && !u.flying);
    if (taunters.length) return taunters.reduce((b, a) => (Math.abs(a.x - u.x) < Math.abs(b.x - u.x) ? a : b));
    let pool = candidates;
    // Fliers dive past tanks to reach the back line.
    if (u.flying && u.kind !== 'boss') {
      const soft = candidates.filter((a) => a.role !== 'tank');
      if (soft.length) pool = soft;
    }
    // Prefer the closest ally in front of (to the left of) the enemy.
    return pool.reduce((b, a) => (Math.abs(a.x - u.x) < Math.abs(b.x - u.x) ? a : b));
  }

  private updateUnit(u: Unit, dt: number): void {
    if (u.stunUntil > this.time) return;
    if (u.boss && u.boss.castingUntil > this.time) return;
    const cdRate = u.hasteMult * (u.side === 'ally' && this.warCryActive ? 1.15 : 1);
    u.attackCd -= dt * cdRate;

    if (u.ability.kind === 'heal') {
      this.updateHealer(u, dt);
      return;
    }

    const target = u.side === 'ally' ? this.chooseAllyTarget(u) : this.chooseEnemyTarget(u);
    u.targetId = target?.id ?? null;

    if (target && this.inRange(u, target)) {
      if (u.attackCd <= 0) {
        this.performAttack(u, target);
        u.attackCd = u.attackInterval;
      }
      return;
    }
    if (u.kind === 'hero') return;
    this.move(u, target, dt);
  }

  private move(u: Unit, target: Unit | null, dt: number): void {
    let speed = u.speed * u.slowMult * (u.hasteMult > 1 ? 1.2 : 1);
    if (u.side === 'ally') {
      if (u.ability.kind === 'execute' && target && Math.abs(target.x - u.x) > u.range + 2) speed *= 2.2;
      if (!target) {
        // Nothing this unit can hit: hold behind the front of the enemy line, or rally forward between waves.
        const nearestEnemy = this.enemies.reduce<Unit | null>((b, e) => (!b || e.x < b.x ? e : b), null);
        const rally = nearestEnemy ? Math.min(nearestEnemy.x - 4, 70) : 38;
        if (u.x < rally) u.x = Math.min(rally, u.x + speed * dt);
        return;
      }
      const dir = Math.sign(target.x - u.x) || 1;
      u.x = Math.max(C.allySpawnX - 6, Math.min(C.enemySpawnX + 6, u.x + dir * speed * dt));
      return;
    }
    // Enemy: march left; ground units are blocked by ground allies in contact.
    let newX = u.x - speed * dt;
    if (!u.flying) {
      for (const a of this.units) {
        if (a.side !== 'ally' || a.dead || a.flying || a.kind === 'hero') continue;
        const contact = a.x + (a.size + u.size) * 1.2;
        if (a.x < u.x && newX < contact) newX = Math.max(newX, Math.min(u.x, contact));
      }
    }
    u.x = Math.max(C.heroX + 1.5 + u.size, newX);
    if (u.x <= C.heroX + 2 + u.size && u.flying) this.analysis.flyingReachedHero += dt;
  }

  private updateHealer(u: Unit, _dt: number): void {
    const injured = this.allies.filter((a) => a.id !== u.id && a.hp < a.maxHp * 0.97 && Math.abs(a.x - u.x) <= u.range);
    if (injured.length && u.attackCd <= 0) {
      const t = injured.reduce((b, a) => (a.hp / a.maxHp < b.hp / b.maxHp ? a : b));
      const amount = u.damage * (u.ability.kind === 'heal' ? u.ability.healMult : 1) * (this.warCryActive ? 1 + EX.warCryDamageBonus : 1);
      this.heal(t, amount);
      u.attackCd = u.attackInterval;
      u.lastAttackAt = this.time;
      this.events.push({ type: 'attack', sourceId: u.id, targetId: t.id, ranged: true, damageType: 'holy', fromX: u.x, toX: t.x, fromFlying: false, toFlying: t.flying });
      return;
    }
    // Follow behind the frontline.
    const front = this.allies.filter((a) => a.kind === 'card' && a.id !== u.id).reduce((m, a) => Math.max(m, a.x), C.allySpawnX);
    const desired = Math.max(C.allySpawnX, front - 8);
    const speed = u.speed * u.slowMult * _dt;
    if (Math.abs(desired - u.x) > 0.5) u.x += Math.sign(desired - u.x) * Math.min(speed, Math.abs(desired - u.x));
  }

  private allyDamageMult(u?: Unit): number {
    let m = this.warCryActive ? 1 + EX.warCryDamageBonus : 1;
    if (u) {
      for (const p of this.allies) {
        if (p.ability.kind === 'healAura' && p.id !== u.id && Math.abs(p.x - u.x) <= p.ability.radius) {
          m += p.ability.damageBuff;
          break;
        }
      }
    }
    return m;
  }

  private performAttack(u: Unit, target: Unit): void {
    u.lastAttackAt = this.time;
    const ranged = u.range > 6;
    this.events.push({ type: 'attack', sourceId: u.id, targetId: target.id, ranged, damageType: u.damageType, fromX: u.x, toX: target.x, fromFlying: u.flying, toFlying: target.flying });

    let dmg = u.damage;
    let crit = false;
    if (u.side === 'ally') {
      dmg *= this.allyDamageMult(u);
      const ab = u.ability;
      if (ab.kind === 'antiAir' && target.flying) dmg *= 1 + ab.bonus;
      if (ab.kind === 'bossBreaker' && (target.elite || target.bossTier > 0)) dmg *= 1 + ab.bonus;
      if (ab.kind === 'execute' && target.hp / target.maxHp < ab.threshold) dmg *= ab.mult;
      if (ab.kind === 'charge' && u.lastHitTargetId !== target.id) dmg *= ab.firstHitMult;
      if (ab.kind === 'armorBreak' && target.armor > 0.1) dmg *= 1 + ab.bonusVsArmored;
      if (ab.kind === 'priorityShot' && this.rng.chance(ab.critChance)) {
        dmg *= ab.critMult;
        crit = true;
      }
      if (u.kind === 'hero') {
        if (this.rng.chance(this.setup.hero.critChance)) {
          dmg *= 2;
          crit = true;
        }
        if (target.bossTier > 0) dmg *= this.setup.hero.bossDamage;
      }
    } else if (u.boss) {
      dmg *= u.boss.def.phases[u.boss.phaseIndex]!.damageMult;
    }
    u.lastHitTargetId = target.id;

    const dealt = this.applyDamage(target, dmg, u.damageType, u, false, crit);

    // On-hit abilities
    const ab = u.ability;
    if (ab.kind === 'splashBurn') {
      for (const e of this.splashTargets(u, target, ab.radius)) {
        if (e.id !== target.id) this.applyDamage(e, dmg * 0.6, u.damageType, u, false);
        e.burnDps = Math.max(e.burnDps, (u.damage * ab.burnFraction) / 1);
        e.burnUntil = this.time + ab.burnSec;
      }
      this.events.push({ type: 'splash', x: target.x, radius: ab.radius, damageType: 'fire' });
    } else if (ab.kind === 'frostNova') {
      for (const e of this.splashTargets(u, target, ab.radius)) {
        if (e.id !== target.id) this.applyDamage(e, dmg * 0.7, u.damageType, u, false);
        this.applySlow(e, ab.slow, ab.slowSec);
      }
      this.events.push({ type: 'splash', x: target.x, radius: ab.radius, damageType: 'frost' });
    } else if (ab.kind === 'armorBreak') {
      for (const e of this.splashTargets(u, target, ab.splashRadius)) {
        if (e.id !== target.id) this.applyDamage(e, dmg * 0.5, u.damageType, u, false);
      }
      this.events.push({ type: 'splash', x: target.x, radius: ab.splashRadius, damageType: 'fire' });
    } else if (ab.kind === 'rebirth') {
      for (const e of this.splashTargets(u, target, ab.splashRadius)) {
        if (e.id !== target.id) this.applyDamage(e, dmg * 0.5, u.damageType, u, false);
      }
      this.events.push({ type: 'splash', x: target.x, radius: ab.splashRadius, damageType: 'fire' });
    } else if (ab.kind === 'chain') {
      this.chain(u, target, dmg, ab.jumps, ab.falloff, ab.jumpRange);
    } else if (ab.kind === 'auroraBreath') {
      for (const e of this.units) {
        if (e.side === 'enemy' && e.id !== target.id && this.canTarget(u, e) && this.inRange(u, e)) this.applyDamage(e, dmg * 0.6, u.damageType, u, false);
      }
      this.events.push({ type: 'splash', x: (u.x + target.x) / 2, radius: Math.abs(target.x - u.x) / 2 + 3, damageType: 'frost' });
    }

    if (u.kind === 'hero') this.applyHeroEffects(target, dmg, dealt);
  }

  /** Weapon effects (burn, slow, chain, lifesteal) apply to normal hero hits and push-up strikes. */
  private applyHeroEffects(target: Unit, dmg: number, dealt: number): void {
    const hero = this.hero;
    for (const eff of this.setup.hero.effects) {
      if (eff.kind === 'burn') {
        target.burnDps = Math.max(target.burnDps, (dmg * eff.fraction) / 3);
        target.burnUntil = this.time + 3;
      } else if (eff.kind === 'slow') this.applySlow(target, eff.amount, eff.sec);
      else if (eff.kind === 'chain') this.chain(hero, target, dmg, eff.jumps, 0.7, 10);
      else if (eff.kind === 'lifesteal') this.heal(hero, dealt * eff.fraction);
    }
  }

  private splashTargets(u: Unit, center: Unit, radius: number): Unit[] {
    return this.units.filter((e) => e.side !== u.side && !e.dead && this.canTarget(u, e) && Math.abs(e.x - center.x) <= radius);
  }

  private chain(u: Unit, first: Unit, dmg: number, jumps: number, falloff: number, range: number): void {
    const hit = new Set([first.id]);
    const points = [{ x: u.x, flying: u.flying }, { x: first.x, flying: first.flying }];
    let last = first;
    let power = dmg;
    for (let j = 0; j < jumps; j++) {
      power *= falloff;
      const next = this.units
        .filter((e) => e.side !== u.side && !e.dead && !hit.has(e.id) && Math.abs(e.x - last.x) <= range)
        .sort((a, b) => Math.abs(a.x - last.x) - Math.abs(b.x - last.x))[0];
      if (!next) break;
      hit.add(next.id);
      this.applyDamage(next, power, u.damageType === 'physical' ? 'lightning' : u.damageType, u, false);
      points.push({ x: next.x, flying: next.flying });
      last = next;
    }
    this.events.push({ type: 'chain', points });
  }

  private applySlow(u: Unit, amount: number, sec: number): void {
    const mult = 1 - amount * (u.bossTier > 0 ? 0.5 : 1);
    u.slowMult = Math.min(u.slowMult, mult);
    u.slowUntil = Math.max(u.slowUntil, this.time + sec);
  }

  private resistMultiplier(target: Unit, type: DamageType): number {
    const r = target.resist[type] ?? 0;
    const armorMult = type === 'physical' ? 1 - target.armor : 1 - target.armor * 0.3;
    return Math.max(0.1, (1 - r) * armorMult);
  }

  /** Returns the damage that reached health (after shields). */
  private applyDamage(target: Unit, raw: number, type: DamageType, source: Unit | null, isDot: boolean, crit = false): number {
    if (target.dead || raw <= 0) return 0;
    let amount = raw * this.resistMultiplier(target, type);
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, amount);
      target.shield -= absorbed;
      amount -= absorbed;
    }
    target.hp -= amount;
    target.lastHitAt = this.time;
    if (target.kind === 'hero' && source) {
      const key = source.kind === 'boss' ? 'boss' : String(source.role);
      this.analysis.heroDamageTakenByRole[key] = (this.analysis.heroDamageTakenByRole[key] ?? 0) + amount;
    }
    if (!isDot || amount >= 1) this.events.push({ type: 'damage', targetId: target.id, amount, crit, damageType: type, x: target.x, side: target.side });
    if (target.hp <= 0) this.handleLethal(target, source);
    return amount;
  }

  private handleLethal(target: Unit, source: Unit | null): void {
    if (target.ability.kind === 'rebirth' && !target.rebirthUsed) {
      target.rebirthUsed = true;
      target.hp = target.maxHp * target.ability.hpPct;
      target.burnUntil = 0;
      this.events.push({ type: 'rebirth', unitId: target.id, x: target.x });
      return;
    }
    target.hp = 0;
    target.dead = true;
    if (target.kind === 'hero' && source?.kind === 'boss') this.analysis.killedByBoss = true;
  }

  private heal(u: Unit, amount: number): void {
    if (u.dead || amount <= 0) return;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + amount);
    if (u.hp - before >= 1) this.events.push({ type: 'heal', targetId: u.id, amount: u.hp - before, x: u.x });
  }

  private grantShield(u: Unit, amount: number, duration: number): void {
    u.shield = Math.min(u.maxHp * 0.6, u.shield + amount);
    u.shieldUntil = Math.max(u.shieldUntil, this.time + duration);
  }

  private updateAbilities(u: Unit, dt: number): void {
    const ab = u.ability;
    if (ab.kind === 'healAura') {
      for (const a of this.allies) {
        if (Math.abs(a.x - u.x) <= ab.radius && a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * ab.healPctPerSec * dt);
      }
    } else if (ab.kind === 'shieldAllies') {
      u.abilityTimer -= dt;
      if (u.abilityTimer <= 0 && this.enemies.length > 0) {
        u.abilityTimer = ab.interval;
        for (const a of this.allies) if (Math.abs(a.x - u.x) <= ab.radius) this.grantShield(a, u.maxHp * ab.shieldPct, ab.interval);
        this.events.push({ type: 'shieldGranted', x: u.x, radius: ab.radius });
      }
    } else if (ab.kind === 'auroraBreath') {
      u.abilityTimer -= dt;
      if (u.abilityTimer <= 0) {
        u.abilityTimer = ab.interval;
        for (const a of this.allies) {
          a.hasteMult = Math.max(a.hasteMult, 1 + ab.hasteBuff);
          a.hasteUntil = this.time + ab.hasteSec;
        }
        this.events.push({ type: 'shieldGranted', x: u.x, radius: 60 });
      }
    }
  }

  private petTimer = 0;

  private updatePet(dt: number): void {
    const pet = this.setup.hero.petActive;
    if (!pet) return;
    this.petTimer += dt;
    if (this.petTimer < pet.def.interval) return;
    const enemies = this.enemies;
    if (enemies.length === 0) return;
    this.petTimer = 0;
    if (pet.def.kind === 'guard') {
      this.grantShield(this.hero, this.hero.maxHp * pet.def.shieldPct * pet.power, pet.def.interval);
      this.events.push({ type: 'petAbility', kind: 'guard', x: this.hero.x, radius: 3 });
    } else if (pet.def.kind === 'fireball') {
      const target = enemies.reduce((b, e) => (e.x < b.x ? e : b));
      const r = pet.def.radius;
      for (const e of enemies) if (Math.abs(e.x - target.x) <= r) this.applyDamage(e, this.setup.hero.damage * pet.def.heroDamageMult * pet.power, 'fire', this.hero, false);
      this.events.push({ type: 'petAbility', kind: 'fireball', x: target.x, radius: r });
    } else if (pet.def.kind === 'frostAura') {
      const front = this.frontlineX();
      for (const e of enemies) if (e.x <= front + pet.def.radius) this.applySlow(e, pet.def.slow, 2.5);
      this.events.push({ type: 'petAbility', kind: 'frostAura', x: front, radius: pet.def.radius });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Bosses

  private updateBoss(u: Unit, dt: number): void {
    const b = u.boss!;
    const frac = u.hp / u.maxHp;
    let phase = b.phaseIndex;
    while (phase + 1 < b.def.phases.length && frac <= b.def.phases[phase + 1]!.threshold) phase++;
    if (phase !== b.phaseIndex) {
      b.phaseIndex = phase;
      const p = b.def.phases[phase]!;
      b.abilityCds = p.abilities.map((a) => a.cooldown * 0.4);
      u.resist = { ...b.baseResist, ...(p.resist ?? {}) };
      u.attackInterval = b.baseAttackInterval / p.attackSpeedMult;
      this.events.push({ type: 'phase', bossName: u.name, phaseName: p.name, message: p.message });
    }
    if (b.castingUntil > this.time || u.stunUntil > this.time) return;
    // Only use abilities once engaged.
    const engaged = this.allies.some((a) => Math.abs(a.x - u.x) <= 45);
    if (!engaged) return;
    const p = b.def.phases[b.phaseIndex]!;
    for (let i = 0; i < p.abilities.length; i++) {
      b.abilityCds[i] = (b.abilityCds[i] ?? 0) - dt;
      if (b.abilityCds[i]! > 0 || b.castingUntil > this.time) continue;
      const ab = p.abilities[i]!;
      b.abilityCds[i] = ab.cooldown;
      this.castBossAbility(u, ab, p.damageMult);
      break;
    }
  }

  private castBossAbility(u: Unit, ab: NonNullable<Unit['boss']>['def']['phases'][number]['abilities'][number], damageMult: number): void {
    const b = u.boss!;
    const resolveAt = this.time + ab.telegraph;
    b.castingUntil = resolveAt;
    const base = { sourceId: u.id, createdAt: this.time, resolveAt, slow: 0, healPct: 0, summon: null, shieldAmount: 0, shieldDuration: 0 } as const;
    const dmg = b.baseDamage * damageMult;
    const push = (t: Omit<Telegraph, 'id'>) => {
      const tel: Telegraph = { ...t, id: this.nextId++ };
      this.telegraphs.push(tel);
      this.events.push({ type: 'telegraph', telegraph: tel });
    };
    const reach = (u.size - 1) * 1.5;
    switch (ab.kind) {
      case 'slam':
        push({ ...base, kind: 'slam', x0: u.x - ab.width - reach, x1: u.x + 2, damage: dmg * ab.damageMult });
        break;
      case 'breath':
        push({ ...base, kind: 'breath', x0: u.x - ab.length - reach, x1: u.x, damage: dmg * ab.damageMult, slow: ab.slow });
        break;
      case 'drain':
        push({ ...base, kind: 'drain', x0: u.x - ab.length - reach, x1: u.x, damage: dmg * ab.damageMult, healPct: ab.healPct });
        break;
      case 'meteor': {
        // Meteors aim at the army; the hero (who cannot dodge) is only targeted when no units are deployed.
        const allies = this.allies.filter((a) => a.kind === 'card');
        for (let i = 0; i < ab.count; i++) {
          const target = allies.length ? this.rng.pick(allies) : this.hero;
          const cx = target.x + this.rng.range(-2, 2);
          push({ ...base, kind: 'meteor', x0: cx - ab.radius, x1: cx + ab.radius, damage: dmg * ab.damageMult });
        }
        break;
      }
      case 'volley': {
        const back = this.allies.reduce((m, a) => (a.x < m.x ? a : m), this.hero);
        const target = this.allies.filter((a) => a.kind === 'card').sort((a, b2) => a.x - b2.x)[0] ?? back;
        push({ ...base, kind: 'volley', x0: target.x - ab.radius, x1: target.x + ab.radius, damage: dmg * ab.damageMult });
        break;
      }
      case 'summon':
        push({ ...base, kind: 'summon', x0: u.x - 3, x1: u.x + 3, damage: 0, summon: { role: ab.role, count: ab.count } });
        break;
      case 'shield':
        push({ ...base, kind: 'shield', x0: u.x - 3, x1: u.x + 3, damage: 0, shieldAmount: u.maxHp * ab.amountPct, shieldDuration: ab.duration });
        break;
    }
  }

  private resolveTelegraphs(): void {
    if (this.telegraphs.length === 0) return;
    const due = this.telegraphs.filter((t) => t.resolveAt <= this.time);
    if (due.length === 0) return;
    this.telegraphs = this.telegraphs.filter((t) => t.resolveAt > this.time);
    for (const t of due) {
      const source = this.units.find((u) => u.id === t.sourceId);
      if (!source || source.dead) continue;
      this.events.push({ type: 'telegraphResolved', telegraphId: t.id, kind: t.kind, x0: t.x0, x1: t.x1 });
      if (t.kind === 'summon' && t.summon) {
        for (let i = 0; i < t.summon.count; i++) this.spawnEnemy({ kind: 'enemy', role: t.summon.role as EnemyRole, elite: false }, source.x - 2 - i * 1.5);
        continue;
      }
      if (t.kind === 'shield') {
        this.grantShield(source, t.shieldAmount, t.shieldDuration);
        continue;
      }
      let hits = 0;
      for (const a of this.allies) {
        if (a.x < t.x0 || a.x > t.x1) continue;
        this.applyDamage(a, t.damage, source.damageType, source, false);
        if (t.slow > 0) this.applySlow(a, t.slow, 3);
        hits++;
      }
      if (t.kind === 'drain' && hits > 0) this.heal(source, source.maxHp * t.healPct * Math.min(3, hits));
    }
  }

  private collectDead(): void {
    for (const u of this.units) {
      if (!u.dead || u.goldValue < 0) continue;
      if (u.side === 'enemy') {
        this.enemiesDefeated++;
        if (u.elite) this.elitesDefeated++;
        if (u.armor > 0.3) this.analysis.armoredKills++;
        if (u.bossTier > 0) this.bossesKilled++;
        this.goldEarned += u.goldValue;
        this.xpEarned += u.xpValue * this.setup.rewardMult;
        this.events.push({ type: 'death', unitId: u.id, x: u.x, side: 'enemy', gold: u.goldValue, flying: u.flying });
      } else if (u.kind !== 'hero') {
        this.events.push({ type: 'death', unitId: u.id, x: u.x, side: 'ally', gold: 0, flying: u.flying });
      }
      u.goldValue = -1; // mark processed
    }
    // Keep the hero record; drop other dead units after processing to keep loops small.
    if (this.units.length > 60) this.units = this.units.filter((u) => !u.dead || u.kind === 'hero' || u.kind === 'boss');
  }

  // ---------------------------------------------------------------------------------------------
  // Auto deploy (idle combat)

  private runAutoDeploy(): void {
    if (this.hand.length === 0) return;
    const enemies = this.enemies;
    const waveComing = this.waveState === 'spawning' || enemies.length > 0;
    if (!waveComing && this.valor < C.maxValor) return;
    const allies = this.allies.filter((a) => a.kind === 'card');
    const cards = this.hand.map((idx, slot) => ({ slot, spec: this.setup.deck[idx]! }));
    const maxCost = Math.max(...cards.map((c) => c.spec.def.cost));
    const aliveOf = (id: string) => allies.filter((a) => a.defId === id).length;
    const supports = allies.filter((a) => a.role === 'support').length;
    const score = (c: (typeof cards)[number]) => {
      const d = c.spec.def;
      let s = d.cost - 3 * aliveOf(d.id);
      if (d.role === 'support' && supports >= 2) s -= 20;
      if (enemies.some((e) => e.flying) && !allies.some((a) => a.targetsAir) && d.targetsAir && d.role !== 'support') s += 8;
      if (!allies.some((a) => a.role === 'tank') && d.role === 'tank' && enemies.length > 0) s += 6;
      if (d.role === 'support' && allies.length < 2) s -= 5;
      if (d.ability.kind === 'heal' && allies.some((a) => a.hp < a.maxHp * 0.6)) s += 4;
      if (enemies.length >= 5 && ['splashBurn', 'frostNova', 'chain', 'armorBreak'].includes(d.ability.kind)) s += 3;
      return s;
    };
    // Danger (enemies approaching, or nobody defending): deploy the best card we can afford right now.
    const danger = enemies.some((e) => e.x < C.heroX + 50) || (enemies.length > 0 && allies.length === 0);
    const pool = danger ? cards.filter((c) => c.spec.def.cost <= this.valor) : cards;
    if (pool.length === 0) return;
    const best = pool.reduce((b, c) => (score(c) > score(b) ? c : b));
    const threshold = Math.min(C.maxValor, Math.max(best.spec.def.cost, enemies.length > 3 ? best.spec.def.cost : Math.min(maxCost, best.spec.def.cost + 1)));
    if (this.valor >= threshold) this.deploy(best.slot);
  }
}
