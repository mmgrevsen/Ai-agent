import { useState } from 'react';
import { store, useGame } from '../../app/store';
import { BALANCE } from '../../core/config/balance';
import { ACHIEVEMENTS, achievementReward, DAILY_QUESTS, WEEKLY_QUESTS } from '../../core/content/quests';
import { achievementStatus, streakBonus } from '../../core/systems/quests';
import { Bar, RewardList, Segmented } from '../components/common';
import { Icon } from '../components/Icon';

export function QuestsScreen() {
  const { game } = useGame();
  const [view, setView] = useState<'quests' | 'achievements'>('quests');
  const bonus = streakBonus(game);
  return (
    <div className="stack-m">
      <div className="panel row">
        <div className="streak-flame">
          <Icon name="flame" size={30} />
        </div>
        <div className="grow">
          <div className="display">{game.streak.count}-day streak</div>
          <div className="small dim">
            +{Math.round(bonus * 100)}% battle gold · best {game.streak.best} · rest tokens {game.streak.restTokens}/{BALANCE.streak.maxRestTokens}
          </div>
          <div className="xsmall faint">Missing a day uses a rest token. Without one only the bonus resets - you never lose anything.</div>
        </div>
      </div>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'quests', label: 'Quests' },
          { value: 'achievements', label: 'Achievements' },
        ]}
      />
      {view === 'quests' ? <QuestLists /> : <Achievements />}
    </div>
  );
}

function QuestLists() {
  const { game } = useGame();
  return (
    <div className="stack-m">
      <div className="section-title">
        <h2>Daily</h2>
        <span className="small dim">Swaps left: {game.quests.rerollsLeft}</span>
      </div>
      {game.quests.daily.map((q, i) => {
        const t = DAILY_QUESTS.find((x) => x.id === q.templateId)!;
        const done = q.progress >= q.target;
        return (
          <div key={q.templateId} className={`quest ${done ? 'done' : ''} ${q.claimed ? 'claimed' : ''}`}>
            <div className="spread">
              <span className="row">
                {t.exercise && <span className="chip gold">Exercise</span>}
                <span>{t.text(q.target)}</span>
              </span>
              <span className="small faint">
                {q.progress}/{q.target}
              </span>
            </div>
            <Bar value={q.progress} max={q.target} tone="green" />
            <div className="spread">
              <RewardList reward={q.reward} />
              {q.claimed ? (
                <span className="chip green">
                  <Icon name="check" size={12} /> Claimed
                </span>
              ) : done ? (
                <button className="btn green small" onClick={() => store.claimQuest('daily', i)}>
                  Claim
                </button>
              ) : (
                game.quests.rerollsLeft > 0 && (
                  <button className="btn ghost small" onClick={() => store.rerollQuest(i)} title="Swap for another (non-exercise) quest">
                    Swap
                  </button>
                )
              )}
            </div>
          </div>
        );
      })}
      <p className="xsmall faint">
        Exercise quests are optional and modest. Rest days are part of training - swap the push-up quest any time and still earn the rewards elsewhere.
      </p>
      <div className="section-title">
        <h2>Weekly</h2>
      </div>
      {game.quests.weekly.map((q, i) => {
        const t = WEEKLY_QUESTS.find((x) => x.id === q.templateId)!;
        const done = q.progress >= q.target;
        return (
          <div key={q.templateId} className={`quest ${done ? 'done' : ''} ${q.claimed ? 'claimed' : ''}`}>
            <div className="spread">
              <span className="row">
                {t.exercise && <span className="chip gold">Exercise</span>}
                <span>{t.text(q.target)}</span>
              </span>
              <span className="small faint">
                {q.progress}/{q.target}
              </span>
            </div>
            <Bar value={q.progress} max={q.target} tone="blue" />
            <div className="spread">
              <RewardList reward={q.reward} />
              {q.claimed ? (
                <span className="chip green">Claimed</span>
              ) : (
                done && (
                  <button className="btn green small" onClick={() => store.claimQuest('weekly', i)}>
                    Claim
                  </button>
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Achievements() {
  const { game } = useGame();
  return (
    <div className="col">
      {ACHIEVEMENTS.map((def) => {
        const st = achievementStatus(game, def);
        const complete = st.nextTarget === null;
        return (
          <div key={def.id} className={`quest ${st.claimable ? 'done' : ''}`}>
            <div className="spread">
              <div>
                <div className="display">{def.name}</div>
                <div className="xsmall dim">{complete ? 'All tiers complete!' : def.text(st.nextTarget!)}</div>
              </div>
              <div className="row" aria-label={`Tier ${st.claimedTiers} of ${def.tiers.length}`}>
                {def.tiers.map((_, i) => (
                  <Icon key={i} name="star" size={14} className={i < st.claimedTiers ? 'gold-text' : 'faint'} />
                ))}
              </div>
            </div>
            {!complete && <Bar value={st.value} max={st.nextTarget!} tone="purple" label={`${Math.min(st.value, st.nextTarget!)}/${st.nextTarget}`} />}
            {!complete && (
              <div className="spread">
                <RewardList reward={achievementReward(st.claimedTiers)} extra={def.cosmetic && st.claimedTiers === def.tiers.length - 1 ? <span className="chip gold">+ cosmetic</span> : null} />
                {st.claimable && (
                  <button className="btn green small" onClick={() => store.claimAchievement(def.id)}>
                    Claim
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
