import { useState } from 'react';
import { store, useGame } from '../../app/store';
import { CHEST_NAMES } from '../../core/systems/chests';
import { getCard } from '../../core/content/cards';
import { getPet } from '../../core/content/pets';
import { getItem } from '../../core/content/equipment';
import { nextAffordableSword } from '../../core/systems/armory';
import { DAILY_QUESTS } from '../../core/content/quests';
import { BOSS_STAGE, getWorld, MINI_BOSS_STAGE, STAGES_PER_WORLD, WORLD_COUNT } from '../../core/content/worlds';
import { checkBuildingUpgrade, activeUpgrades, mineCapacity, mineStored } from '../../core/systems/buildings';
import { upgradeableCards } from '../../core/systems/cards';
import { stageIndex } from '../../core/systems/economy';
import { powerRating, recommendedPower } from '../../core/systems/hero';
import { idleAccrued, idleCapHours } from '../../core/systems/idle';
import { cardUnlockedAtStage, PET_UNLOCKS } from '../../core/systems/progression';
import { BUILDINGS } from '../../core/content/buildings';
import { formatDuration, formatNumber } from '../../core/util';
import { drawWorldBackground } from '../art/scenery';
import { stageRepsRequired, trainingSummary } from '../../core/systems/training';
import { drawFigure } from '../art/cardPortraits';
import { heroPortraitKey } from '../art/heroLook';
import { ArtCanvas, Bar, useNow } from '../components/common';
import { Icon } from '../components/Icon';
import '../styles/screens.css';

export function HomeScreen() {
  const { game } = useGame();
  const now = useNow(1000);
  const highest = game.progress.highestCleared;
  const frontier = Math.min(WORLD_COUNT * STAGES_PER_WORLD - 1, highest + 1);
  const [world, setWorld] = useState(() => Math.floor(game.progress.selectedStage / STAGES_PER_WORLD));
  const maxWorld = Math.floor(frontier / STAGES_PER_WORLD);
  const w = getWorld(Math.min(world, maxWorld));
  const selected = game.progress.selectedStage;
  const sel = { world: Math.floor(selected / 10), stage: (selected % 10) + 1 };
  const idle = idleAccrued(game, now);
  const mine = mineStored(game, now);
  const cap = mineCapacity(game);
  const upgradable = upgradeableCards(game).length;
  const idleBuilders = 2 - activeUpgrades(game).length;
  const affordableBuilding = BUILDINGS.some((b) => checkBuildingUpgrade(game, b.id).ok);
  const power = powerRating(game);
  const rec = recommendedPower(selected);
  const isBoss = sel.stage === BOSS_STAGE;
  const isMini = sel.stage === MINI_BOSS_STAGE;
  const bossDef = isBoss ? getWorld(sel.world).boss : isMini ? getWorld(sel.world).miniBoss : null;
  const checkpoint = game.progress.bossCheckpoints.includes(selected);
  const firstClearCards = cardUnlockedAtStage(selected).filter((id) => !game.cards[id]);
  const petUnlock = PET_UNLOCKS[selected];
  const dailyOpen = game.quests.daily.filter((q) => !q.claimed);
  const sword = nextAffordableSword(game);
  const training = trainingSummary(game, Date.now());

  const selectStage = (idx: number) => {
    store.update((s) => {
      s.progress.selectedStage = idx;
    });
  };

  return (
    <div className="stack-m">
      {/* World banner */}
      <div className="world-banner">
        <ArtCanvas
          width={492}
          height={150}
          animate
          className="world-banner-canvas"
          draw={(ctx, t) => {
            drawWorldBackground(ctx, w.index, 492, 150, 118, t, t * 6);
            drawFigure(ctx, `boss:${w.boss.id}`, 292, 2, 111, 148);
            drawFigure(ctx, heroPortraitKey(game), 12, 2, 111, 148);
          }}
        />
        <div className="world-banner-text">
          <div className="xsmall faint">World {w.index + 1}</div>
          <h1>{w.name}</h1>
          <div className="small dim">{w.theme}</div>
        </div>
        <div className="world-nav">
          <button className="icon-btn" disabled={world <= 0} onClick={() => setWorld(world - 1)} aria-label="Previous world">
            <Icon name="back" />
          </button>
          <button className="icon-btn flip" disabled={world >= maxWorld} onClick={() => setWorld(world + 1)} aria-label="Next world">
            <Icon name="back" />
          </button>
        </div>
      </div>

      {/* Stage path */}
      <div className="stage-path" role="list" aria-label="Stages">
        {Array.from({ length: STAGES_PER_WORLD }, (_, i) => {
          const idx = stageIndex(w.index, i + 1);
          const cleared = idx <= highest;
          const locked = idx > frontier;
          const boss = i + 1 === BOSS_STAGE;
          const mini = i + 1 === MINI_BOSS_STAGE;
          return (
            <button
              key={idx}
              role="listitem"
              className={`stage-node ${cleared ? 'cleared' : ''} ${locked ? 'locked' : ''} ${idx === selected ? 'selected' : ''} ${boss ? 'boss' : mini ? 'mini' : ''} ${idx === frontier ? 'frontier' : ''}`}
              disabled={locked}
              onClick={() => selectStage(idx)}
              aria-label={`Stage ${w.index + 1}-${i + 1}${boss ? ' boss' : mini ? ' mini-boss' : ''}${cleared ? ', cleared' : locked ? ', locked' : ''}`}
            >
              {locked ? <Icon name="lock" size={16} /> : boss || mini ? <Icon name="skull" size={boss ? 22 : 18} /> : <span className="display">{i + 1}</span>}
              {cleared && <span className="stage-check"><Icon name="check" size={10} /></span>}
              {game.progress.heroicCleared.includes(idx) && <span className="stage-star"><Icon name="star" size={10} /></span>}
            </button>
          );
        })}
      </div>

      {/* Selected stage card */}
      <div className="panel gold stage-card">
        <div className="spread">
          <div>
            <div className="xsmall faint">Stage {sel.world + 1}-{sel.stage}</div>
            <h2>{bossDef ? `${bossDef.name}` : selected <= highest ? 'Replay stage' : 'Next battle'}</h2>
            {bossDef && <div className="small dim">{bossDef.title}</div>}
          </div>
          <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
            <span className="small dim">Army power</span>
            <span className={`display ${power >= rec ? 'good-text' : 'warn-text'}`}>{formatNumber(power)}</span>
            <span className="xsmall faint">Suggested {formatNumber(rec)}</span>
          </div>
        </div>
        {(firstClearCards.length > 0 || petUnlock) && selected > highest && (
          <div className="row wrap small" style={{ marginTop: 8 }}>
            <span className="chip gold">First clear:</span>
            {firstClearCards.map((id) => (
              <span key={id} className="chip green">
                New card: {getCard(id).name}
              </span>
            ))}
            {petUnlock && !game.pets[petUnlock] && <span className="chip green">New pet: {getPet(petUnlock).name}</span>}
            {(isBoss || isMini) && <span className="chip blue">{isBoss ? 'Golden' : 'Silver'} chest</span>}
          </div>
        )}
        {bossDef && <p className="small dim" style={{ margin: '8px 0 0' }}>{bossDef.hint}</p>}
        <div className="small" style={{ marginTop: 8 }}>
          <span className="chip red">
            <Icon name="flame" size={14} /> Claim with {stageRepsRequired(game, selected)} push-ups
          </span>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className={`btn gold big grow ${!game.tutorial.firstBattle ? 'pulse' : ''}`} onClick={() => store.prepareBattle({ type: 'campaign', stageIdx: selected, difficulty: 'normal', startAtBoss: false })}>
            <Icon name="swords" size={22} /> Battle
          </button>
          {checkpoint && (
            <button className="btn red" onClick={() => store.prepareBattle({ type: 'campaign', stageIdx: selected, difficulty: 'normal', startAtBoss: true })}>
              Boss
            </button>
          )}
        </div>
        {checkpoint && <div className="xsmall dim" style={{ marginTop: 6 }}>Checkpoint saved: earlier waves stay cleared - jump straight to the boss.</div>}
      </div>

      {/* Idle rewards */}
      <div className="grid-2">
        <button className="panel idle-card tile" onClick={() => idle.gold > 0 && store.toast(`+${formatNumber(store.claimIdle())} gold from your army`, 'good')}>
          <div className="row">
            <Icon name="chest" size={30} />
            <div className="grow">
              <div className="display">War Chest</div>
              <div className="xsmall dim">Army income · cap {idleCapHours(game)}h</div>
            </div>
          </div>
          <div className="display gold-text idle-amount">+{formatNumber(idle.gold)}</div>
          <Bar value={idle.elapsedSec} max={idleCapHours(game) * 3600} label={idle.capped ? 'FULL' : formatDuration(idle.elapsedSec)} />
        </button>
        <button className="panel idle-card tile" onClick={() => mine > 0 && store.toast(`+${formatNumber(store.collectMine())} gold from the mine`, 'good')}>
          <div className="row">
            <Icon name="gold" size={30} />
            <div className="grow">
              <div className="display">Gold Mine</div>
              <div className="xsmall dim">Level {game.buildings.gold_mine.level}</div>
            </div>
          </div>
          <div className="display gold-text idle-amount">+{formatNumber(mine)}</div>
          <Bar value={mine} max={cap} label={mine >= cap ? 'FULL' : `${Math.round((mine / Math.max(1, cap)) * 100)}%`} />
        </button>
      </div>

      {/* Pending chests */}
      {game.pendingChests.length > 0 && (
        <div className="panel">
          <div className="section-title">
            <h3>Chests to open</h3>
            <span className="chip gold">{game.pendingChests.length}</span>
          </div>
          <div className="row wrap">
            {game.pendingChests.slice(0, 6).map((c, i) => (
              <button key={i} className="btn purple small" onClick={() => store.openPendingChest(i)}>
                <Icon name="chest" size={18} /> {CHEST_NAMES[c]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nudges */}
      {(upgradable > 0 || (idleBuilders > 0 && affordableBuilding) || sword) && (
        <div className="col">
          {sword && (
            <button className="list-item tile nudge" onClick={() => store.setTab('hero')}>
              <span className="nudge-icon gold"><Icon name="swords" size={18} /></span>
              <span className="grow">New sword in the Armory: {getItem(sword.defId).name} ({formatNumber(sword.pushupDamageWith)} damage per push-up)</span>
              <span className="chip gold">Buy</span>
            </button>
          )}
          {upgradable > 0 && (
            <button className="list-item tile nudge" onClick={() => store.setTab('cards')}>
              <span className="nudge-icon green"><Icon name="up" size={18} /></span>
              <span className="grow">{upgradable} card upgrade{upgradable > 1 ? 's' : ''} ready</span>
              <span className="chip green">Upgrade</span>
            </button>
          )}
          {idleBuilders > 0 && affordableBuilding && (
            <button className="list-item tile nudge" onClick={() => store.setTab('base')}>
              <span className="nudge-icon gold"><Icon name="base" size={18} /></span>
              <span className="grow">{idleBuilders} builder{idleBuilders > 1 ? 's' : ''} free - a building upgrade is affordable</span>
              <span className="chip gold">Build</span>
            </button>
          )}
        </div>
      )}

      {/* Training */}
      <button className="panel tile modes-entry" onClick={() => store.pushOverlay({ kind: 'training' })}>
        <div className="row">
          <Icon name="trophy" size={30} />
          <div className="grow">
            <div className="display">Training</div>
            <div className="small dim">
              {formatNumber(training.total.all)} push-ups · {formatNumber(Math.round(training.total.kcal))} kcal · today {training.today.reps}/{training.goals.day}
            </div>
          </div>
          <Icon name="back" className="flip" size={20} />
        </div>
      </button>

      {/* Modes */}
      <button className="panel tile modes-entry" onClick={() => store.pushOverlay({ kind: 'modes' })}>
        <div className="row">
          <Icon name="map" size={30} />
          <div className="grow">
            <div className="display">Battle Modes</div>
            <div className="small dim">Dungeons, Endless Siege, Blitz, Weekly Challenge, Friend Challenges</div>
          </div>
          <Icon name="back" className="flip" size={20} />
        </div>
      </button>

      {/* Daily quest preview */}
      <div className="panel">
        <div className="section-title">
          <h3>Today's quests</h3>
          <button className="btn ghost small" onClick={() => store.setTab('quests')}>
            All
          </button>
        </div>
        {dailyOpen.length === 0 && <div className="empty">All daily quests done. Great work!</div>}
        {dailyOpen.slice(0, 2).map((q) => {
          const t = DAILY_QUESTS.find((x) => x.id === q.templateId)!;
          return (
            <div key={q.templateId} className="col" style={{ gap: 4, marginBottom: 8 }}>
              <div className="spread small">
                <span>{t.text(q.target)}</span>
                <span className="faint">
                  {q.progress}/{q.target}
                </span>
              </div>
              <Bar value={q.progress} max={q.target} tone="green" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
