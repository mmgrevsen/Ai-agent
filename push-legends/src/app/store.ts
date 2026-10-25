import { useSyncExternalStore } from 'react';
import type { Difficulty } from '../core/config/balance';
import type { BuildingId } from '../core/content/buildings';
import { getBuilding } from '../core/content/buildings';
import { getCard } from '../core/content/cards';
import { getItem, type EquipSlot } from '../core/content/equipment';
import { buySword } from '../core/systems/armory';
import type { ChestKind } from '../core/content/quests';
import type { BattleResult, BattleSetup } from '../core/combat/types';
import { hashString, Rng } from '../core/rng';
import { SaveManager } from '../core/state/save';
import type { GameState, Settings } from '../core/state/types';
import { blitzSetup, campaignSetup, challengeSetup, endlessSetup, weeklySetup } from '../core/systems/battleSetup';
import { collectMine, skipBuildingUpgrade, startBuildingUpgrade } from '../core/systems/buildings';
import { suggestDeck, swapDeckCard, toggleDeckCard, upgradeCard, setDeck } from '../core/systems/cards';
import { buyChest, openPendingChest, type ChestPurchase, type ChestResult } from '../core/systems/chests';
import { abandonDungeon, enterNode, finalizeDungeonBattle, pickShrineCard, startDungeon, type DungeonRoomSummary, type RoomOutcome } from '../core/systems/dungeon';
import { equipItem, unequipSlot, upgradeItem } from '../core/systems/equipment';
import { claimIdle, processReturn, touch, type OfflineReport } from '../core/systems/idle';
import { setActivePet, upgradePet } from '../core/systems/pets';
import { finalizeBattle, type BattleSummary } from '../core/systems/progression';
import { applyQuestEvent, claimAchievement, claimQuest, recordActiveDay, refreshQuests, rerollDailyQuest } from '../core/systems/quests';
import { grantReward } from '../core/systems/rewards';
import { buyOffer, buyWithGlory } from '../core/systems/shop';
import { decodeChallenge, sanitizeName } from '../core/social/codes';
import { addLocalFriend, blockCode, importChallenge, recordChallengeScore, removeLocalFriend, unblockCode, type AddFriendResult } from '../core/social/service';
import { sound, type SoundId } from '../platform/audio';
import { haptic, setHapticsEnabled } from '../platform/haptics';
import { LocalStorageAdapter } from '../platform/storage';

export type Tab = 'home' | 'cards' | 'hero' | 'base' | 'quests';

export type BattleContext =
  | { type: 'campaign'; stageIdx: number; difficulty: Difficulty; startAtBoss: boolean }
  | { type: 'dungeon'; nodeId: string }
  | { type: 'endless' }
  | { type: 'blitz' }
  | { type: 'weekly' }
  | { type: 'challenge'; seed: number; world: number; code: string | null };

export type Overlay =
  | { kind: 'battle'; setup: BattleSetup; context: BattleContext; id: number }
  | { kind: 'result'; summary: BattleSummary; result: BattleResult; context: BattleContext; dungeon: DungeonRoomSummary | null }
  | { kind: 'social' }
  | { kind: 'settings' }
  | { kind: 'modes' }
  | { kind: 'dungeon' }
  | { kind: 'cameraSetup'; then: BattleContext | null }
  | { kind: 'intro' }
  | { kind: 'training' };

export type Modal =
  | { kind: 'card'; id: string }
  | { kind: 'chest'; result: ChestResult }
  | { kind: 'offline'; report: OfflineReport }
  | { kind: 'prebattle'; context: BattleContext }
  | { kind: 'item'; uid: string }
  | { kind: 'building'; id: BuildingId }
  | { kind: 'chestShop'; chest: ChestKind }
  | { kind: 'room'; outcome: RoomOutcome; nodeId: string }
  | { kind: 'levelup'; level: number };

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'warn';
}

export interface UiState {
  tab: Tab;
  overlays: Overlay[];
  modal: Modal | null;
  toasts: Toast[];
  saveWarnings: string[];
  persistent: boolean;
}

export interface Snapshot {
  game: GameState;
  ui: UiState;
}

type Listener = () => void;

export class GameStore {
  private game: GameState;
  private ui: UiState;
  private snapshot: Snapshot;
  private listeners = new Set<Listener>();
  private saveTimer: number | null = null;
  private toastId = 1;
  private battleId = 1;
  private readonly saves: SaveManager;
  private readonly storage: LocalStorageAdapter;
  now: () => number = () => Date.now();
  rng = new Rng(Date.now() % 2147483647);

  constructor() {
    this.storage = new LocalStorageAdapter();
    this.saves = new SaveManager(this.storage);
    const now = this.now();
    const loaded = this.saves.load(now);
    this.game = loaded.state;
    this.ui = { tab: 'home', overlays: [], modal: null, toasts: [], saveWarnings: loaded.warnings, persistent: this.storage.persistent };
    const report = processReturn(this.game, now);
    refreshQuests(this.game, now);
    recordActiveDay(this.game, now);
    if (!this.game.tutorial.intro) this.ui.overlays = [{ kind: 'intro' }];
    else if (report) this.ui.modal = { kind: 'offline', report };
    this.snapshot = { game: this.game, ui: this.ui };
    this.applySettings();
    this.persist();
  }

  // --- subscription ---------------------------------------------------------------------------
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.snapshot;
  get state(): GameState {
    return this.game;
  }

  private emit(): void {
    this.snapshot = { game: this.game, ui: this.ui };
    this.listeners.forEach((l) => l());
  }

  /** Applies a mutation to a copy of the game state, then saves (debounced). */
  update(fn: (draft: GameState) => void): void {
    const draft = structuredClone(this.game);
    fn(draft);
    this.game = draft;
    this.emit();
    this.scheduleSave();
  }

  setUi(patch: Partial<UiState>): void {
    this.ui = { ...this.ui, ...patch };
    this.emit();
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.persist(), 400);
  }

  persist(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      this.saves.save(this.game, this.now());
    } catch {
      this.toast('Could not save progress - storage may be full.', 'warn');
    }
  }

  // --- feedback ---------------------------------------------------------------------------------
  toast(text: string, tone: Toast['tone'] = 'info'): void {
    const id = this.toastId++;
    this.setUi({ toasts: [...this.ui.toasts, { id, text, tone }].slice(-4) });
    window.setTimeout(() => this.setUi({ toasts: this.ui.toasts.filter((t) => t.id !== id) }), 2800);
  }

  sfx(id: SoundId): void {
    sound.play(id);
  }

  private applySettings(): void {
    const s = this.game.settings;
    sound.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume });
    setHapticsEnabled(s.haptics);
    document.documentElement.classList.toggle('large-text', s.largeText);
    document.documentElement.classList.toggle('reduced-motion', s.reducedMotion);
  }

  // --- navigation -------------------------------------------------------------------------------
  setTab(tab: Tab): void {
    this.setUi({ tab });
  }

  pushOverlay(o: Overlay): void {
    this.setUi({ overlays: [...this.ui.overlays, o], modal: null });
  }

  popOverlay(): void {
    this.setUi({ overlays: this.ui.overlays.slice(0, -1) });
  }

  replaceTopOverlay(o: Overlay): void {
    this.setUi({ overlays: [...this.ui.overlays.slice(0, -1), o] });
  }

  clearOverlays(): void {
    this.setUi({ overlays: [] });
  }

  openModal(modal: Modal): void {
    this.setUi({ modal });
  }

  closeModal(): void {
    this.setUi({ modal: null });
  }

  completeTutorial(key: string): void {
    if (this.game.tutorial[key]) return;
    this.update((s) => {
      s.tutorial[key] = true;
    });
  }

  // --- periodic -------------------------------------------------------------------------------
  tick(): void {
    const now = this.now();
    const before = this.game;
    let completed: BuildingId[] = [];
    const draft = structuredClone(before);
    completed = touch(draft, now);
    const questsChanged = refreshQuests(draft, now);
    recordActiveDay(draft, now);
    if (completed.length || questsChanged) {
      this.game = draft;
      this.emit();
      this.scheduleSave();
      for (const id of completed) {
        this.toast(`${getBuilding(id).name} upgraded to level ${draft.buildings[id].level}!`, 'good');
        sound.play('upgrade');
      }
    } else {
      // Keep timestamps fresh without re-rendering.
      this.game.lastSeenAt = draft.lastSeenAt;
      this.game.maxSeenAt = draft.maxSeenAt;
    }
  }

  onResume(): void {
    const now = this.now();
    const draft = structuredClone(this.game);
    const report = processReturn(draft, now);
    refreshQuests(draft, now);
    recordActiveDay(draft, now);
    this.game = draft;
    if (report && !this.ui.overlays.some((o) => o.kind === 'battle')) this.ui = { ...this.ui, modal: { kind: 'offline', report } };
    this.emit();
    this.scheduleSave();
  }

  // --- battles ------------------------------------------------------------------------------------
  private setupFor(ctx: BattleContext): BattleSetup | null {
    const s = this.game;
    switch (ctx.type) {
      case 'campaign':
        return campaignSetup(s, ctx.stageIdx, ctx.difficulty, { startAtBoss: ctx.startAtBoss, attemptSeed: this.rng.int(1, 2 ** 30) });
      case 'endless':
        return endlessSetup(s, this.rng.int(1, 2 ** 30));
      case 'blitz':
        return blitzSetup(s, this.rng.int(1, 2 ** 30));
      case 'weekly':
        return weeklySetup(s, this.now());
      case 'challenge':
        return challengeSetup(s, ctx.seed, ctx.world);
      case 'dungeon':
        return null;
    }
  }

  /** Opens the pre-battle sheet (exercise mode + difficulty), unless skipping straight in. */
  prepareBattle(ctx: BattleContext): void {
    this.openModal({ kind: 'prebattle', context: ctx });
  }

  startBattle(ctx: BattleContext, setupOverride?: BattleSetup, opts: { skipCameraPrompt?: boolean } = {}): void {
    const setup = setupOverride ?? this.setupFor(ctx);
    if (!setup) return;
    if (setup.deck.length === 0) {
      this.toast('Add at least one card to your deck first.', 'warn');
      return;
    }
    // Stages are only claimed with push-ups: offer the camera first when it is off
    if (setup.repsRequired > 0 && !this.game.settings.useCamera && !this.game.settings.devTools && !opts.skipCameraPrompt) {
      this.pushOverlay({ kind: 'cameraSetup', then: ctx });
      return;
    }
    sound.unlock();
    const overlays = this.ui.overlays.filter((o) => o.kind !== 'result');
    this.setUi({ overlays: [...overlays, { kind: 'battle', setup, context: ctx, id: this.battleId++ }], modal: null });
  }

  finishBattle(result: BattleResult, context: BattleContext): void {
    const now = this.now();
    let summary!: BattleSummary;
    let dungeon: DungeonRoomSummary | null = null;
    const levelBefore = this.game.hero.level;
    this.update((s) => {
      s.tutorial.firstBattle = true;
      summary = finalizeBattle(s, result, now, this.rng);
      if (context.type === 'dungeon') dungeon = finalizeDungeonBattle(s, result);
      if (context.type === 'challenge' && context.code) recordChallengeScore(s, context.code, result.score);
    });
    const overlays = this.ui.overlays.filter((o) => o.kind !== 'battle');
    this.setUi({ overlays: [...overlays, { kind: 'result', summary, result, context, dungeon }] });
    sound.play(result.outcome === 'victory' || result.outcome === 'complete' ? 'victory' : 'defeat');
    haptic(result.outcome === 'victory' ? 'success' : 'medium');
    if (this.game.hero.level > levelBefore) window.setTimeout(() => sound.play('levelup'), 700);
  }

  closeResult(): void {
    this.setUi({ overlays: this.ui.overlays.filter((o) => o.kind !== 'result') });
  }

  // --- cards ----------------------------------------------------------------------------------------
  upgradeCard(id: string): void {
    let ok = false;
    this.update((s) => {
      ok = upgradeCard(s, id);
      if (ok) applyQuestEvent(s, { type: 'cardUpgraded', amount: 1 });
    });
    if (ok) {
      sound.play('upgrade');
      haptic('success');
      this.toast(`${getCard(id).name} reached level ${this.game.cards[id]!.level}!`, 'good');
      this.completeTutorial('upgradeHint');
    } else sound.play('error');
  }

  toggleDeck(id: string): void {
    let ok = false;
    this.update((s) => {
      ok = toggleDeckCard(s, id);
    });
    if (!ok) this.toast(this.game.deck.includes(id) ? 'Your deck needs at least one card.' : 'Deck is full (8 cards). Remove one first.', 'warn');
    else sound.play('tap');
  }

  swapDeck(outId: string, inId: string): void {
    this.update((s) => {
      swapDeckCard(s, outId, inId);
    });
  }

  autoDeck(): void {
    this.update((s) => {
      setDeck(s, suggestDeck(s));
    });
    this.toast('Deck rebuilt: tanks, anti-air, area damage and support.', 'good');
  }

  importDeck(ids: string[]): boolean {
    const owned = ids.filter((id) => this.game.cards[id]);
    if (owned.length === 0) return false;
    this.update((s) => {
      setDeck(s, owned);
    });
    return true;
  }

  // --- hero, items, pets ------------------------------------------------------------------------
  equip(uid: string): void {
    this.update((s) => {
      equipItem(s, uid);
    });
    sound.play('tap');
  }

  unequip(slot: EquipSlot): void {
    this.update((s) => unequipSlot(s, slot));
  }

  upgradeItem(uid: string): void {
    let ok = false;
    this.update((s) => {
      ok = upgradeItem(s, uid);
      if (ok) applyQuestEvent(s, { type: 'itemUpgraded', amount: 1 });
    });
    sound.play(ok ? 'upgrade' : 'error');
  }

  buySword(defId: string): void {
    let ok = false;
    this.update((s) => {
      ok = buySword(s, defId);
    });
    if (ok) {
      sound.play('upgrade');
      haptic('success');
      this.toast(`${getItem(defId).name} forged! Your push-ups hit harder now.`, 'good');
    } else sound.play('error');
  }

  setPet(id: string | null): void {
    this.update((s) => {
      setActivePet(s, id);
    });
  }

  upgradePet(id: string): void {
    let ok = false;
    this.update((s) => {
      ok = upgradePet(s, id);
    });
    sound.play(ok ? 'upgrade' : 'error');
  }

  setCosmetic(kind: 'cape' | 'aura', id: string): void {
    if (!this.game.hero.cosmetics.includes(id)) return;
    this.update((s) => {
      s.hero[kind] = id;
    });
  }

  // --- base -----------------------------------------------------------------------------------------
  upgradeBuilding(id: BuildingId): void {
    let ok = false;
    this.update((s) => {
      ok = startBuildingUpgrade(s, id, this.now());
      if (ok) applyQuestEvent(s, { type: 'buildingUpgraded', amount: 1 });
    });
    if (ok) {
      sound.play('upgrade');
      this.toast(`${getBuilding(id).name} upgrade started.`, 'good');
      this.completeTutorial('baseHint');
    } else sound.play('error');
  }

  finishBuildingNow(id: BuildingId): void {
    let ok = false;
    this.update((s) => {
      ok = skipBuildingUpgrade(s, id, this.now());
    });
    sound.play(ok ? 'upgrade' : 'error');
    if (!ok) this.toast('Not enough gems.', 'warn');
  }

  collectMine(): number {
    let got = 0;
    this.update((s) => {
      got = collectMine(s, this.now());
      if (got > 0) applyQuestEvent(s, { type: 'mineCollected', amount: 1 });
    });
    if (got > 0) {
      sound.play('coin');
      haptic('light');
    }
    return got;
  }

  claimIdle(): number {
    let gold = 0;
    this.update((s) => {
      gold = claimIdle(s, this.now()).gold;
    });
    if (gold > 0) sound.play('coin');
    return gold;
  }

  // --- quests ---------------------------------------------------------------------------------------
  claimQuest(list: 'daily' | 'weekly', index: number): void {
    let ok = false;
    this.update((s) => {
      ok = claimQuest(s, list, index) !== null;
    });
    if (ok) {
      sound.play('chest');
      haptic('success');
    }
  }

  rerollQuest(index: number): void {
    let ok = false;
    this.update((s) => {
      ok = rerollDailyQuest(s, index);
    });
    if (!ok) this.toast('No swaps left today.', 'warn');
  }

  claimAchievement(id: string): void {
    let cosmetic: string | null = null;
    let ok = false;
    this.update((s) => {
      const r = claimAchievement(s, id);
      ok = !!r;
      cosmetic = r?.cosmetic ?? null;
    });
    if (ok) {
      sound.play('chest');
      if (cosmetic) this.toast('New cosmetic unlocked! Check the Hero screen.', 'good');
    }
  }

  // --- chests & shop --------------------------------------------------------------------------------
  openPendingChest(index: number): void {
    let result: ChestResult | null = null;
    this.update((s) => {
      result = openPendingChest(s, index, this.rng);
      if (result) applyQuestEvent(s, { type: 'chestOpened', amount: 1 });
    });
    if (result) {
      sound.play('chest');
      this.openModal({ kind: 'chest', result });
    }
  }

  buyChest(kind: ChestKind, currency: ChestPurchase): void {
    let result: ChestResult | null = null;
    this.update((s) => {
      result = buyChest(s, kind, currency, this.rng);
    });
    if (result) {
      sound.play('chest');
      this.openModal({ kind: 'chest', result });
    } else {
      sound.play('error');
      this.toast(`Not enough ${currency}.`, 'warn');
    }
  }

  buyOffer(id: string): void {
    let ok = false;
    this.update((s) => {
      ok = buyOffer(s, id, this.now());
    });
    sound.play(ok ? 'coin' : 'error');
  }

  buyGlory(cardId: string): void {
    let ok = false;
    this.update((s) => {
      ok = buyWithGlory(s, cardId);
    });
    sound.play(ok ? 'coin' : 'error');
  }

  // --- dungeon --------------------------------------------------------------------------------------
  startDungeon(): void {
    let ok = false;
    this.update((s) => {
      ok = !!startDungeon(s, this.now(), this.rng.int(1, 2 ** 30));
    });
    if (ok) this.pushOverlay({ kind: 'dungeon' });
  }

  enterDungeonNode(nodeId: string): void {
    let outcome: RoomOutcome | null = null;
    this.update((s) => {
      outcome = enterNode(s, nodeId);
    });
    const o = outcome as RoomOutcome | null;
    if (!o) return;
    if (o.kind === 'battle') this.startBattle({ type: 'dungeon', nodeId }, o.setup);
    else {
      sound.play(o.kind === 'treasure' ? 'coin' : 'chest');
      this.openModal({ kind: 'room', outcome: o, nodeId });
    }
  }

  pickShrine(cardId: string): void {
    let amount = 0;
    this.update((s) => {
      amount = pickShrineCard(s, cardId);
    });
    if (amount) this.toast(`+${amount} ${getCard(cardId).name} fragments`, 'good');
    this.closeModal();
  }

  abandonDungeon(): void {
    this.update((s) => abandonDungeon(s));
    this.setUi({ overlays: this.ui.overlays.filter((o) => o.kind !== 'dungeon') });
  }

  // --- social ---------------------------------------------------------------------------------------
  addFriend(code: string, name: string): AddFriendResult {
    let r: AddFriendResult = 'invalid';
    this.update((s) => {
      r = addLocalFriend(s, code, name, this.now());
    });
    return r;
  }

  removeFriend(code: string): void {
    this.update((s) => removeLocalFriend(s, code));
  }

  block(code: string): void {
    this.update((s) => blockCode(s, code));
  }

  unblock(code: string): void {
    this.update((s) => unblockCode(s, code));
  }

  importChallenge(code: string): boolean {
    let ok = false;
    this.update((s) => {
      ok = importChallenge(s, code, this.now()).ok;
    });
    return ok;
  }

  playChallenge(code: string): void {
    const p = decodeChallenge(code);
    if (!p) return this.toast('That challenge code is not valid.', 'warn');
    this.startBattle({ type: 'challenge', seed: p.seed, world: p.world, code });
  }

  /** A fresh challenge on a new seed (the player then shares their score as a code). */
  newChallenge(): void {
    const seed = this.rng.int(1, 2 ** 30);
    const world = Math.min(4, Math.floor(Math.max(0, this.game.progress.highestCleared) / 10));
    this.startBattle({ type: 'challenge', seed, world, code: null });
  }

  setProfile(patch: Partial<Pick<GameState['profile'], 'name' | 'privacy'>>): void {
    this.update((s) => {
      if (patch.name !== undefined) s.profile.name = sanitizeName(patch.name);
      if (patch.privacy) s.profile.privacy = patch.privacy;
    });
  }

  // --- settings & save ------------------------------------------------------------------------------
  updateSettings(patch: Partial<Settings>): void {
    this.update((s) => {
      Object.assign(s.settings, patch);
      if (patch.graphics) s.settings.graphicsChosen = true;
      if (patch.autoDeploy !== undefined) s.settings.autoDeployOptIn = patch.autoDeploy;
    });
    this.applySettings();
  }

  exportSave(): string {
    return this.saves.exportSave(this.game, this.now());
  }

  importSave(raw: string): boolean {
    const storage = new (class {
      data = new Map<string, string>();
      getItem = (k: string) => this.data.get(k) ?? null;
      setItem = (k: string, v: string) => void this.data.set(k, v);
      removeItem = (k: string) => void this.data.delete(k);
    })();
    storage.setItem('push-legends/save', raw.trim());
    const loaded = new SaveManager(storage).load(this.now());
    if (loaded.source === 'new') return false;
    this.game = loaded.state;
    this.persist();
    this.emit();
    this.applySettings();
    return true;
  }

  resetGame(): void {
    this.saves.reset();
    window.location.reload();
  }

  /** Developer shortcut. Marks the profile as assisted so shared challenge codes are flagged. */
  devGrant(): void {
    this.update((s) => {
      grantReward(s, { gold: 50_000, gems: 200, ore: 200, petTreats: 100 });
      s.profile.devAssisted = true;
    });
    this.toast('Developer resources granted (profile marked as assisted).', 'warn');
  }

  seedForToday(): number {
    return hashString(String(this.now()));
  }
}

export const store = new GameStore();

export function useGame(): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
