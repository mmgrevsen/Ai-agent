import { useState } from 'react';
import { store, useGame, type BattleContext, type Modal } from '../../app/store';
import type { Difficulty } from '../../core/config/balance';
import { BALANCE } from '../../core/config/balance';
import { getCard } from '../../core/content/cards';
import { getBuilding } from '../../core/content/buildings';
import { getItem } from '../../core/content/equipment';
import { getPet } from '../../core/content/pets';
import { CHEST_NAMES, type ChestResult } from '../../core/systems/chests';
import { getWorld } from '../../core/content/worlds';
import { stageFromIndex } from '../../core/systems/economy';
import { idleAccrued, type OfflineReport } from '../../core/systems/idle';
import { ROOM_INFO } from '../../core/systems/dungeon';
import { weeklyModifiers } from '../../core/systems/battleSetup';
import { BATTLE_MODIFIERS } from '../../core/combat/types';
import { formatDuration, formatNumber } from '../../core/util';
import { cameraSupported } from '../../platform/pose';
import { pushupDamage } from '../../core/systems/armory';
import { computeHeroStats } from '../../core/systems/hero';
import { CardArt, ItemArt, ModalShell, PetArt, RewardList, Segmented } from '../components/common';
import { Icon } from '../components/Icon';
import { BuildingModal } from './BaseScreen';
import { CardModal } from './CardsScreen';
import { ItemModal } from './HeroScreen';

export function ModalHost({ modal }: { modal: Modal }) {
  switch (modal.kind) {
    case 'card':
      return <CardModal id={modal.id} />;
    case 'item':
      return <ItemModal uid={modal.uid} />;
    case 'building':
      return <BuildingModal id={modal.id} />;
    case 'chest':
      return <ChestModal result={modal.result} />;
    case 'offline':
      return <OfflineModal report={modal.report} />;
    case 'prebattle':
      return <PreBattleModal context={modal.context} />;
    case 'room':
      return <RoomModal modal={modal} />;
    default:
      return null;
  }
}

function contextTitle(ctx: BattleContext): string {
  switch (ctx.type) {
    case 'campaign': {
      const { world, stage } = stageFromIndex(ctx.stageIdx);
      return `${getWorld(world).name} ${world + 1}-${stage}`;
    }
    case 'endless':
      return 'Endless Siege';
    case 'blitz':
      return 'Blitz Trial';
    case 'weekly':
      return 'Weekly Challenge';
    case 'challenge':
      return 'Friend Challenge';
    case 'dungeon':
      return 'Dungeon room';
  }
}

function PreBattleModal({ context }: { context: BattleContext }) {
  const { game } = useGame();
  const s = game.settings;
  const [difficulty, setDifficulty] = useState<Difficulty>(context.type === 'campaign' ? context.difficulty : 'normal');
  const cleared = context.type === 'campaign' && context.stageIdx <= game.progress.highestCleared;
  const mode: 'full' | 'knee' | 'off' = s.useCamera ? s.exerciseMode : 'off';
  const setMode = (m: 'full' | 'knee' | 'off') => {
    if (m === 'off') store.updateSettings({ useCamera: false });
    else store.updateSettings({ useCamera: true, exerciseMode: m });
  };
  const go = () => {
    const ctx = context.type === 'campaign' ? { ...context, difficulty } : context;
    if (mode !== 'off' && !s.cameraPrivacyAccepted) {
      store.closeModal();
      store.pushOverlay({ kind: 'cameraSetup', then: ctx });
      return;
    }
    store.startBattle(ctx);
  };
  return (
    <ModalShell label="Prepare for battle" onClose={() => store.closeModal()}>
      <div className="stack-m">
        <div>
          <div className="xsmall faint">Prepare for battle</div>
          <h2>{contextTitle(context)}</h2>
        </div>
        {context.type === 'weekly' && (
          <div className="col">
            {weeklyModifiers(Date.now()).map((m) => (
              <span key={m} className="chip gold">
                {BATTLE_MODIFIERS[m].name}: {BATTLE_MODIFIERS[m].text}
              </span>
            ))}
          </div>
        )}
        {context.type === 'challenge' && <div className="notice info small">Fair mode: every card is set to level {BALANCE.cards.normalizedPvpLevel} and your hero uses baseline stats. 90 seconds - defeat as many enemies as you can.</div>}

        <div className="col">
          <span className="small dim">Exercise mode</span>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'full', label: 'Full push-ups' },
              { value: 'knee', label: 'Knee push-ups' },
              { value: 'off', label: 'No camera' },
            ]}
          />
          <span className="xsmall faint">
            {mode === 'full'
              ? `Each verified push-up is a sword strike for ${formatNumber(pushupDamage(computeHeroStats(game)))} damage (+${BALANCE.exercise.valorPerRep} valor, builds War Cry). Better swords hit harder.`
              : mode === 'knee'
                ? `Knee push-ups give ${Math.round(BALANCE.exercise.kneeRepMultiplier * 100)}% of the full push-up effect and rewards.`
                : 'Play without exercise - your army fights and progresses on its own.'}
          </span>
          {mode !== 'off' && !cameraSupported() && <div className="notice small">This device or browser has no camera access. You can still play without the camera.</div>}
          {mode !== 'off' && (
            <button className="btn ghost small" onClick={() => { store.closeModal(); store.pushOverlay({ kind: 'cameraSetup', then: null }); }}>
              <Icon name="camera" size={16} /> Camera setup & calibration
            </button>
          )}
        </div>

        {context.type === 'campaign' && (
          <div className="col">
            <span className="small dim">Difficulty</span>
            <Segmented
              value={difficulty}
              onChange={setDifficulty}
              options={[
                { value: 'story', label: 'Story' },
                { value: 'normal', label: 'Normal' },
                ...(cleared ? [{ value: 'heroic' as Difficulty, label: 'Heroic' }] : []),
              ]}
            />
            <span className="xsmall faint">
              {difficulty === 'story'
                ? `Enemies ${Math.round((1 - BALANCE.difficulty.story.power) * 100)}% weaker, ${Math.round(BALANCE.difficulty.story.rewards * 100)}% rewards. Still unlocks the next stage.`
                : difficulty === 'heroic'
                  ? `Enemies ${Math.round((BALANCE.difficulty.heroic.power - 1) * 100)}% stronger, ${BALANCE.difficulty.heroic.rewards}× rewards and gems on first heroic clear.`
                  : 'The standard challenge.'}
            </span>
          </div>
        )}

        <div className="spread small">
          <span className="dim">Auto-deploy cards</span>
          <button className={`switch ${s.autoDeploy ? 'on' : ''}`} role="switch" aria-checked={s.autoDeploy} aria-label="Auto-deploy" onClick={() => store.updateSettings({ autoDeploy: !s.autoDeploy })} />
        </div>
        <div className="row wrap">
          {game.deck.map((id) => (
            <div key={id} className={`card-detail-art rarity-${getCard(id).rarity}`} style={{ padding: 2, borderRadius: 10 }}>
              <CardArt cardId={id} width={34} />
            </div>
          ))}
        </div>
        <button className="btn gold big block" onClick={go}>
          <Icon name="swords" size={22} /> Fight!
        </button>
        <p className="xsmall faint center" style={{ margin: 0 }}>
          Losing never costs anything. Every reward you earn in battle is yours to keep.
        </p>
      </div>
    </ModalShell>
  );
}

function OfflineModal({ report }: { report: OfflineReport }) {
  const { game } = useGame();
  const idle = idleAccrued(game, Date.now());
  return (
    <ModalShell label="Welcome back" onClose={() => store.closeModal()}>
      <div className="stack-m center">
        <div className="banner-title" style={{ fontSize: 32 }}>
          Welcome back!
        </div>
        {report.clockWarning ? (
          <div className="notice small">Your device clock seems to have changed. Idle income continues normally from now on - nothing was lost.</div>
        ) : (
          <p className="dim small">You were away for {formatDuration(report.awaySec)}. Your army kept fighting:</p>
        )}
        <div className="panel dark" style={{ textAlign: 'left' }}>
          <div className="stat-row">
            <span>Enemies defeated by your army</span>
            <b>{formatNumber(idle.enemiesDefeated)}</b>
          </div>
          <div className="stat-row">
            <span>Army gold in the War Chest</span>
            <b className="gold-text">+{formatNumber(idle.gold)}</b>
          </div>
          {idle.ore > 0 && (
            <div className="stat-row">
              <span>Ore gathered</span>
              <b>+{idle.ore}</b>
            </div>
          )}
          <div className="stat-row">
            <span>Gold Mine</span>
            <b className="gold-text">{formatNumber(report.mineReady)} ready</b>
          </div>
          {report.buildingsCompleted.length > 0 && (
            <div className="stat-row">
              <span>Construction finished</span>
              <b>{report.buildingsCompleted.map((b) => getBuilding(b).name).join(', ')}</b>
            </div>
          )}
          {report.upgradesAvailable > 0 && (
            <div className="stat-row">
              <span>Card upgrades available</span>
              <b className="good-text">{report.upgradesAvailable}</b>
            </div>
          )}
          {idle.capped && <div className="xsmall faint" style={{ marginTop: 6 }}>The War Chest was full. Upgrade the Treasury to store more.</div>}
        </div>
        {report.returnBonus && (
          <div className="panel gold">
            <div className="display">Welcome-back gift</div>
            <RewardList reward={report.returnBonus} />
          </div>
        )}
        <button
          className="btn gold big block"
          onClick={() => {
            const gold = store.claimIdle();
            const mine = store.collectMine();
            store.closeModal();
            if (gold + mine > 0) store.toast(`Collected ${formatNumber(gold + mine)} gold`, 'good');
          }}
        >
          Collect all
        </button>
      </div>
    </ModalShell>
  );
}

function ChestModal({ result }: { result: ChestResult }) {
  return (
    <ModalShell label="Chest opened" onClose={() => store.closeModal()}>
      <div className="stack-m center">
        <div className="pop-in">
          <Icon name="chest" size={72} />
        </div>
        <h2>{CHEST_NAMES[result.kind]}</h2>
        <RewardList reward={{ gold: result.gold }} />
        <div className="row wrap center" style={{ gap: 12 }}>
          {result.fragments.map((f, i) => (
            <div key={f.cardId} className="col loot-card" style={{ alignItems: 'center', width: 76, animationDelay: `${i * 0.12}s` }}>
              <div className={`card-detail-art rarity-${getCard(f.cardId).rarity}`} style={{ padding: 3 }}>
                <CardArt cardId={f.cardId} width={60} />
              </div>
              <span className="display small">×{f.amount}</span>
              {f.newCard && <span className="chip green">New!</span>}
              <span className="xsmall">{getCard(f.cardId).name}</span>
            </div>
          ))}
          {result.item && (
            <div className="col loot-card" style={{ alignItems: 'center', width: 86 }}>
              <ItemArt defId={result.item.defId} size={56} />
              <span className="xsmall">{getItem(result.item.defId).name}</span>
              <span className="chip">{result.item.result === 'new' ? 'New gear' : result.item.result === 'star' ? '+1 star' : 'Converted to ore'}</span>
            </div>
          )}
          {result.pet && (
            <div className="col loot-card" style={{ alignItems: 'center', width: 86 }}>
              <PetArt petId={result.pet.petId} size={56} animate />
              <span className="xsmall">{getPet(result.pet.petId).name}</span>
              <span className="chip green">{result.pet.result === 'star' ? '+1 star' : result.pet.result === 'treats' ? '+treats' : 'New!'}</span>
            </div>
          )}
        </div>
        <button className="btn gold block" onClick={() => store.closeModal()}>
          Awesome!
        </button>
      </div>
    </ModalShell>
  );
}

function RoomModal({ modal }: { modal: Extract<Modal, { kind: 'room' }> }) {
  const o = modal.outcome;
  const info = ROOM_INFO[o.kind === 'rest' ? 'rest' : o.kind === 'treasure' ? 'treasure' : o.kind === 'cards' ? 'cards' : 'battle'];
  return (
    <ModalShell label={info.name} onClose={() => o.kind !== 'cards' && store.closeModal()}>
      <div className="stack-m center">
        <h2>{info.name}</h2>
        {o.kind === 'rest' && <p className="dim">Your army rests by the fire. All units now have +{Math.round(o.buff * 100)}% health for the rest of this run.</p>}
        {o.kind === 'treasure' && <RewardList reward={o.reward} />}
        {o.kind === 'cards' && (
          <>
            <p className="dim small">Choose one card to receive fragments:</p>
            <div className="row center" style={{ gap: 10 }}>
              {o.options.map((id) => (
                <button key={id} className="tile col" style={{ alignItems: 'center', color: 'var(--text)' }} onClick={() => store.pickShrine(id)}>
                  <div className={`card-detail-art rarity-${getCard(id).rarity}`} style={{ padding: 3 }}>
                    <CardArt cardId={id} width={70} />
                  </div>
                  <span className="xsmall">{getCard(id).name}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {o.kind !== 'cards' && (
          <button className="btn gold block" onClick={() => store.closeModal()}>
            Continue
          </button>
        )}
      </div>
    </ModalShell>
  );
}
