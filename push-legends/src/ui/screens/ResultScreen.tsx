import { store, type BattleContext } from '../../app/store';
import { getCard } from '../../core/content/cards';
import { COSMETIC_BY_ID } from '../../core/content/cosmetics';
import { getItem } from '../../core/content/equipment';
import { getPet } from '../../core/content/pets';
import type { BattleResult } from '../../core/combat/types';
import type { DungeonRoomSummary } from '../../core/systems/dungeon';
import type { BattleSummary, Suggestion } from '../../core/systems/progression';
import { encodeChallenge } from '../../core/social/codes';
import { formatNumber } from '../../core/util';
import { CardArt, ItemArt, PetArt, RewardList } from '../components/common';
import { Icon } from '../components/Icon';
import { useEffect, useState } from 'react';
import { refresh as refreshFriends, sendDuel, useFriends } from '../../app/friends';

export function ResultScreen({ summary, result, context, dungeon }: { summary: BattleSummary; result: BattleResult; context: BattleContext; dungeon: DungeonRoomSummary | null }) {
  const won = result.outcome === 'victory';
  const runDone = result.outcome === 'complete';
  const positive = won || runDone;
  const title = won ? 'Victory!' : runDone ? (summary.newRecord ? 'New Record!' : 'Run Complete') : result.outcome === 'retreat' ? 'Regrouped' : result.outcome === 'timeout' ? "Time's Up" : 'Not Yet!';
  const subtitle = won
    ? result.label
    : runDone
      ? `Score: ${result.score}`
      : 'Your army regroups. Everything you earned is yours to keep.';

  const retry = (patch?: Partial<Extract<BattleContext, { type: 'campaign' }>>) => {
    if (context.type === 'campaign') store.startBattle({ ...context, ...patch });
    else if (context.type === 'dungeon') store.closeResult();
    else store.startBattle(context);
  };

  const act = (s: Suggestion) => {
    store.closeResult();
    if (s.action === 'cards') store.setTab('cards');
    else if (s.action === 'base') store.setTab('base');
    else if (s.action === 'hero') store.setTab('hero');
    else if (s.action === 'retry_story' && context.type === 'campaign') retry({ difficulty: 'story', startAtBoss: false });
    else if (s.action === 'retry_boss' && context.type === 'campaign') retry({ startAtBoss: true });
  };

  const isChallenge = context.type === 'challenge';
  const isBlitzLike = result.mode === 'blitz' || isChallenge;
  const nextStage = context.type === 'campaign' && won && summary.firstClear;

  return (
    <div className={`result ${positive ? '' : 'defeat'}`}>
      <div className="stack-l" style={{ maxWidth: 460, margin: '0 auto' }}>
        <div className="center pop-in">
          <div className={`banner-title ${positive ? '' : 'defeat'}`}>{title}</div>
          <p className="dim" style={{ marginTop: 8 }}>
            {subtitle}
          </p>
        </div>

        <div className="panel">
          <h3 style={{ marginBottom: 8 }}>{positive ? 'Battle report' : 'How far you got'}</h3>
          {summary.progressLines.map((l) => (
            <div key={l} className="stat-row">
              <span>{l}</span>
            </div>
          ))}
          {summary.bossCheckpointSaved && <div className="notice info small" style={{ marginTop: 8 }}>Boss checkpoint saved - next time you can start straight at the boss.</div>}
        </div>

        <div className="panel gold">
          <h3 style={{ marginBottom: 8 }}>{positive ? 'Rewards' : 'Rewards kept'}</h3>
          <RewardList reward={summary.kept} />
          {summary.repGold > 0 && (
            <div className="xsmall gold-text" style={{ marginTop: 6 }}>
              Includes {formatNumber(summary.repGold)} gold and {summary.repXp} XP from verified push-ups.
            </div>
          )}
          {summary.streakBonus > 0 && <div className="xsmall dim">Streak bonus +{Math.round(summary.streakBonus * 100)}% applied.</div>}
          {summary.victoryBonus && (
            <>
              <div className="divider" />
              <div className="small dim" style={{ marginBottom: 6 }}>
                {won ? (summary.firstClear ? 'First-clear bonus (×3)' : 'Victory bonus') : 'Run bonus'}
              </div>
              <RewardList reward={summary.victoryBonus} />
            </>
          )}
          {dungeon?.reward && (
            <>
              <div className="divider" />
              <div className="small dim" style={{ marginBottom: 6 }}>
                Room reward
              </div>
              <RewardList reward={dungeon.reward} />
            </>
          )}
          {summary.heroLevelsGained > 0 && (
            <div className="notice info small" style={{ marginTop: 8 }}>
              <Icon name="star" size={14} /> Hero level up! +{summary.heroLevelsGained}
            </div>
          )}
        </div>

        {(summary.unlockedCards.length > 0 || summary.fragments.length > 0 || summary.items.length > 0 || summary.pets.length > 0 || summary.cosmetics.length > 0) && (
          <div className="panel">
            <h3 style={{ marginBottom: 10 }}>Loot</h3>
            <div className="row wrap" style={{ gap: 12 }}>
              {summary.unlockedCards.map((id, i) => (
                <div key={`u${id}`} className="col loot-card" style={{ alignItems: 'center', width: 80, animationDelay: `${i * 0.1}s` }}>
                  <div className={`card-detail-art mini rarity-${getCard(id).rarity}`}>
                    <CardArt cardId={id} width={64} />
                  </div>
                  <span className="chip green">New card!</span>
                  <span className="xsmall center">{getCard(id).name}</span>
                </div>
              ))}
              {summary.fragments.map((f, i) => (
                <div key={`f${i}`} className="col loot-card" style={{ alignItems: 'center', width: 64, animationDelay: `${0.2 + i * 0.1}s` }}>
                  <div className={`card-detail-art thumb rarity-${getCard(f.cardId).rarity}`}>
                    <CardArt cardId={f.cardId} width={50} />
                  </div>
                  <span className="xsmall display">×{f.amount}</span>
                </div>
              ))}
              {summary.items.map((it) => (
                <div key={it.defId} className="col loot-card" style={{ alignItems: 'center', width: 80 }}>
                  <ItemArt defId={it.defId} size={52} />
                  <span className="xsmall center">{getItem(it.defId).name}</span>
                  <span className="chip">{it.result === 'new' ? 'New gear' : it.result === 'star' ? '+1 star' : '+ore'}</span>
                </div>
              ))}
              {summary.pets.map((p) => (
                <div key={p.petId} className="col loot-card" style={{ alignItems: 'center', width: 80 }}>
                  <PetArt petId={p.petId} size={60} animate />
                  <span className="xsmall center">{getPet(p.petId).name}</span>
                  <span className="chip green">{p.result === 'new' ? 'New pet!' : '+1 star'}</span>
                </div>
              ))}
              {summary.cosmetics.map((c) => (
                <span key={c} className="chip gold">
                  New style: {COSMETIC_BY_ID.get(c)?.name}
                </span>
              ))}
            </div>
            {summary.chest && <div className="small gold-text" style={{ marginTop: 8 }}>A chest was added - open it from the Home screen.</div>}
          </div>
        )}

        {!positive && summary.suggestions.length > 0 && (
          <div className="panel">
            <h3 style={{ marginBottom: 8 }}>Ideas for next time</h3>
            <div className="col">
              {summary.suggestions.map((s) => (
                <button key={s.title} className="suggestion tile" onClick={() => act(s)} disabled={s.action === 'none'} style={{ color: 'var(--text)', width: '100%' }}>
                  <Icon name="info" size={20} />
                  <div className="grow">
                    <div className="display small">{s.title}</div>
                    <div className="xsmall dim">{s.text}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {isBlitzLike && <ChallengeShare result={result} context={context} />}

        <div className="col">
          {context.type === 'campaign' && won && nextStage && (
            <button className="btn gold big block" onClick={() => store.startBattle({ type: 'campaign', stageIdx: Math.min(49, context.stageIdx + 1), difficulty: 'normal', startAtBoss: false })}>
              Next stage <Icon name="play" size={18} />
            </button>
          )}
          {context.type !== 'dungeon' && (
            <button className={`btn ${positive && nextStage ? 'ghost' : 'gold big'} block`} onClick={() => retry()}>
              {positive ? 'Play again' : 'Retry now'}
            </button>
          )}
          {context.type === 'campaign' && !won && context.difficulty !== 'story' && (
            <button className="btn purple block" onClick={() => retry({ difficulty: 'story', startAtBoss: false })}>
              Retry on Story difficulty (easier)
            </button>
          )}
          {context.type === 'dungeon' && !dungeon?.runEnded && (
            <button className="btn gold big block" onClick={() => store.closeResult()}>
              Continue the dungeon
            </button>
          )}
          <button
            className="btn ghost block"
            onClick={() => {
              store.closeResult();
              if (context.type === 'dungeon' && dungeon?.runEnded) store.setUi({ overlays: store.getSnapshot().ui.overlays.filter((o) => o.kind !== 'dungeon') });
            }}
          >
            {context.type === 'dungeon' && !dungeon?.runEnded ? 'Back to map' : 'Back'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChallengeShare({ result, context }: { result: BattleResult; context: BattleContext }) {
  const game = store.state;
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const friends = useFriends();
  const online = !!game.social.online.token;
  useEffect(() => {
    if (online && !friends.overview) void refreshFriends();
  }, [online, friends.overview]);
  if (context.type !== 'challenge' && result.mode !== 'blitz') return null;
  const seed = context.type === 'challenge' ? context.seed : 0;
  const world = context.type === 'challenge' ? context.world : 0;
  if (context.type !== 'challenge') return null;
  const code = encodeChallenge({ seed, world, score: result.score, name: game.profile.name, assisted: game.profile.devAssisted || result.reps.simulated > 0 });
  const theirs = context.code ? game.social.challenges.find((c) => c.code === context.code) : null;
  return (
    <div className="panel">
      <h3>Challenge a friend</h3>
      {theirs && (
        <p className="small">
          {theirs.fromName} scored <b>{theirs.theirScore}</b>. You scored <b>{result.score}</b>.{' '}
          {result.score > theirs.theirScore ? <span className="good-text">You win this one!</span> : result.score === theirs.theirScore ? 'A tie!' : 'So close - try again!'}
        </p>
      )}
      <p className="xsmall dim">Same seed, normalized card levels: only skill and strategy count. Nothing is wagered.</p>
      <div className="row">
        <input className="field grow" readOnly value={code} onFocus={(e) => e.target.select()} aria-label="Challenge code" />
        <button className="btn small" onClick={() => void navigator.clipboard?.writeText(code).then(() => setCopied(true))}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {online && (friends.overview?.friends.length ?? 0) > 0 && (
        <div className="stack-s" style={{ marginTop: 10 }}>
          <div className="small dim">Send this duel to a friend:</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {friends.overview!.friends.map((f) => (
              <button
                key={f.code}
                className="btn small purple"
                disabled={sent.includes(f.code)}
                onClick={() =>
                  void sendDuel(f.code, code, f.name).then((ok) => {
                    if (ok) setSent((x) => [...x, f.code]);
                  })
                }
              >
                {sent.includes(f.code) ? `Sent to ${f.name}` : f.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
