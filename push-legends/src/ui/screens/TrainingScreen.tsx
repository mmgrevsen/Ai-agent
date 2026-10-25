import { useState } from 'react';
import { store, useGame } from '../../app/store';
import { BALANCE } from '../../core/config/balance';
import { trainingSummary, type TrainingSummary } from '../../core/systems/training';
import { formatNumber } from '../../core/util';
import { Bar, OverlayHeader } from '../components/common';
import { Icon } from '../components/Icon';

/**
 * Push-up training log: totals, calorie estimate, the last 14 days, records and the next goals that
 * help the player do a little more over time. Only verified (camera-counted) push-ups appear here.
 */
export function TrainingScreen() {
  const { game } = useGame();
  const t = trainingSummary(game, Date.now());
  const kneeShare = t.total.all ? t.total.knee / t.total.all : 0;
  return (
    <div className="overlay">
      <OverlayHeader title="Training" onBack={() => store.popOverlay()} />
      <div className="content stack-m">
        <div className="stat-grid">
          <StatTile label="Push-ups in total" value={formatNumber(t.total.all)} sub={t.total.knee ? `${formatNumber(t.total.full)} full · ${formatNumber(t.total.knee)} knee` : undefined} />
          <StatTile label="Calories burned" value={`${formatNumber(Math.round(t.total.kcal))} kcal`} sub="estimate" />
          <StatTile label="Today" value={formatNumber(t.today.reps)} sub={`${Math.round(t.today.kcal)} kcal`} />
          <StatTile label="Last 7 days" value={formatNumber(t.week.reps)} sub={`${t.week.activeDays} active day${t.week.activeDays === 1 ? '' : 's'}`} />
        </div>

        <div className="panel stack-m">
          <div className="spread">
            <div>
              <div className="xsmall faint">Rank</div>
              <h2 style={{ margin: 0 }}>{t.rank.name}</h2>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="xsmall faint">Best in one battle</div>
              <div className="display" style={{ fontSize: 22 }}>{t.bestBattle}</div>
            </div>
          </div>
          {t.nextRank ? (
            <>
              <Bar value={t.bestBattle - t.rank.best} max={t.nextRank.best - t.rank.best} tone="red" tall label={`${t.bestBattle} / ${t.nextRank.best} push-ups in one battle`} />
              <span className="xsmall dim">
                Do {t.nextRank.best} push-ups in one battle to become <b>{t.nextRank.name}</b>.
              </span>
            </>
          ) : (
            <span className="small dim">Highest rank reached. Keep the streak alive.</span>
          )}
        </div>

        <div className="panel stack-m">
          <div className="spread">
            <h3 style={{ margin: 0 }}>Push-ups per day</h3>
            <span className="xsmall faint">last 14 days</span>
          </div>
          <DayChart days={t.days} />
        </div>

        <div className="panel stack-m">
          <h3 style={{ margin: 0 }}>
            <Icon name="up" size={16} /> Do more and more
          </h3>
          <Goal label="Next battle" value={`${t.goals.battle} push-ups`} text={t.bestBattle ? `Your best is ${t.bestBattle}. Beat it by ${t.goals.battle - t.bestBattle} - small steps add up.` : 'Do your first push-ups in a battle to set a record.'} />
          <Goal label="Daily goal" value={`${t.goals.day} push-ups`} text="About 10% above your recent daily average. Spread them over a few battles." progress={{ value: t.today.reps, max: t.goals.day }} />
          {t.nextMilestone && <Goal label="Next milestone" value={`${formatNumber(t.nextMilestone)} in total`} text={`${formatNumber(t.nextMilestone - t.total.all)} to go.`} progress={{ value: t.total.all, max: t.nextMilestone }} />}
          {t.trendPct !== null && (
            <div className={`notice small ${t.trendPct >= 0 ? 'info' : ''}`}>
              {t.trendPct >= 0 ? `Your best battle this week is ${t.trendPct}% above the week before. You are getting stronger.` : `This week's best battles are ${-t.trendPct}% below last week. A rest day is fine - come back fresh.`}
            </div>
          )}
          {kneeShare > 0.6 && t.bestBattle >= 15 && <div className="notice info small">You manage {t.bestBattle} knee push-ups in a row: try a few full push-ups at the start of your next battle.</div>}
        </div>

        <div className="panel stack-m">
          <h3 style={{ margin: 0 }}>Records</h3>
          <Row label="Best day" value={t.bestDay ? `${t.bestDay.reps} push-ups (${t.bestDay.day})` : '-'} />
          <Row label="Streak" value={`${t.streak} day${t.streak === 1 ? '' : 's'}`} />
          <Row label="Days with push-ups" value={String(t.activeDays)} />
          <Row label="Calories this week" value={`${Math.round(t.week.kcal)} kcal`} />
        </div>

        <WeightSetting />
        <p className="xsmall faint">
          Only push-ups counted by the camera appear here. Calories are an estimate (about {Math.round(BALANCE.exercise.kcalPerKgPerRep * game.settings.bodyWeightKg * 100) / 100} kcal per push-up at your weight; knee push-ups count less). Rest when something hurts.
        </p>
      </div>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-tile">
      <div className="xsmall faint">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="xsmall dim">{sub}</div>}
    </div>
  );
}

function Goal({ label, value, text, progress }: { label: string; value: string; text: string; progress?: { value: number; max: number } }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="spread">
        <span className="small dim">{label}</span>
        <b className="small">{value}</b>
      </div>
      {progress && <Bar value={progress.value} max={progress.max} tone={progress.value >= progress.max ? 'green' : 'blue'} />}
      <span className="xsmall faint">{text}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="spread small">
      <span className="dim">{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** One bar per day (tap a bar for its numbers); today is highlighted. */
function DayChart({ days }: { days: TrainingSummary['days'] }) {
  const [pick, setPick] = useState(days.length - 1);
  const max = Math.max(10, ...days.map((d) => d.reps));
  const sel = days[pick]!;
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="xsmall dim" aria-live="polite">
        {sel.day === days[days.length - 1]!.day ? 'Today' : sel.day}: <b>{sel.reps}</b> push-ups{sel.best ? `, best battle ${sel.best}` : ''}
      </div>
      <div className="day-chart" role="list" aria-label="Push-ups per day, last 14 days">
        {days.map((d, i) => (
          <button key={d.day} role="listitem" className={`day-bar ${i === pick ? 'on' : ''} ${i === days.length - 1 ? 'today' : ''}`} onClick={() => setPick(i)} aria-label={`${d.day}: ${d.reps} push-ups`}>
            <i style={{ height: `${d.reps ? Math.max(4, (d.reps / max) * 100) : 0}%` }} />
          </button>
        ))}
      </div>
      <div className="spread xsmall faint">
        <span>{days[0]!.day.slice(5)}</span>
        <span>max {max}</span>
        <span>today</span>
      </div>
    </div>
  );
}

function WeightSetting() {
  const { game } = useGame();
  const [kg, setKg] = useState(String(game.settings.bodyWeightKg));
  const save = () => {
    const n = Number(kg.replace(',', '.'));
    if (Number.isFinite(n) && n >= 30 && n <= 250) store.updateSettings({ bodyWeightKg: Math.round(n) });
    else setKg(String(game.settings.bodyWeightKg));
  };
  return (
    <div className="panel spread">
      <label className="small" htmlFor="body-weight">
        Body weight (for calories)
      </label>
      <span className="row" style={{ gap: 6 }}>
        <input id="body-weight" className="field" inputMode="numeric" style={{ width: 70, minHeight: 34 }} value={kg} onChange={(e) => setKg(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <span className="small dim">kg</span>
      </span>
    </div>
  );
}
