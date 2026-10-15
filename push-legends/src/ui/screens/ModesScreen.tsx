import { store, useGame } from '../../app/store';
import { BALANCE } from '../../core/config/balance';
import { availableNodes, DUNGEON_UNLOCK_CASTLE, dungeonUnlocked, dungeonWorldName, ROOM_INFO } from '../../core/systems/dungeon';
import { weeklyModifiers } from '../../core/systems/battleSetup';
import { BATTLE_MODIFIERS } from '../../core/combat/types';
import type { DungeonNode } from '../../core/state/types';
import { dayKey, weekKey } from '../../core/util';
import { OverlayHeader, RewardList } from '../components/common';
import { Icon, type IconName } from '../components/Icon';

function ModeCard({ icon, color, title, text, onClick, locked, extra }: { icon: IconName; color: string; title: string; text: string; onClick: () => void; locked?: string; extra?: React.ReactNode }) {
  return (
    <button className="panel tile mode-card" onClick={onClick} disabled={!!locked} style={{ opacity: locked ? 0.6 : 1 }}>
      <div className="mode-icon" style={{ background: color }}>
        <Icon name={locked ? 'lock' : icon} size={28} />
      </div>
      <div className="grow">
        <div className="display">{title}</div>
        <div className="small dim">{locked ?? text}</div>
        {extra}
      </div>
    </button>
  );
}

export function ModesScreen() {
  const { game } = useGame();
  const now = Date.now();
  const runsToday = game.progress.dungeonRunsToday.day === dayKey(now) ? game.progress.dungeonRunsToday.count : 0;
  const weeklyBest = game.progress.weekly.weekKey === weekKey(now) ? game.progress.weekly.best : 0;
  return (
    <div className="overlay">
      <OverlayHeader title="Battle Modes" onBack={() => store.popOverlay()} />
      <div className="content stack-m">
        <p className="small dim" style={{ margin: 0 }}>
          Every mode keeps your permanent progress safe. Losing just ends the run - you keep everything earned along the way.
        </p>
        <ModeCard
          icon="castle"
          color="linear-gradient(180deg,#9c7bff,#5a3cc4)"
          title={game.dungeon ? 'Continue Dungeon' : 'Dungeon Delve'}
          text={`Choose your path through ${BALANCE.dungeon.floors} floors: fights, elites, treasure, campfires and card shrines. Full rewards for ${Math.max(0, BALANCE.dungeon.fullRewardRunsPerDay - runsToday)} more run(s) today.`}
          locked={dungeonUnlocked(game) ? undefined : `Unlocks at Castle level ${DUNGEON_UNLOCK_CASTLE}`}
          onClick={() => (game.dungeon ? store.pushOverlay({ kind: 'dungeon' }) : store.startDungeon())}
        />
        <ModeCard icon="shield" color="linear-gradient(180deg,#ff8a5c,#c2402a)" title="Endless Siege" text={`Hold the gate against ever-growing waves. Best: wave ${game.progress.endlessBest}.`} onClick={() => store.prepareBattle({ type: 'endless' })} />
        <ModeCard icon="clock" color="linear-gradient(180deg,#5fe08f,#1f9a52)" title="Blitz Trial" text={`90 seconds: defeat as many enemies as you can. Best: ${game.progress.blitzBest}.`} onClick={() => store.prepareBattle({ type: 'blitz' })} />
        <ModeCard
          icon="trophy"
          color="linear-gradient(180deg,#ffd666,#d98a0b)"
          title="Weekly Challenge"
          text={`Same seed for everyone this week, with special rules. Your best this week: wave ${weeklyBest}.`}
          extra={
            <div className="row wrap" style={{ marginTop: 4 }}>
              {weeklyModifiers(now).map((m) => (
                <span key={m} className="chip gold">
                  {BATTLE_MODIFIERS[m].name}
                </span>
              ))}
            </div>
          }
          onClick={() => store.prepareBattle({ type: 'weekly' })}
        />
        <ModeCard icon="social" color="linear-gradient(180deg,#5aa9ff,#1f7fc4)" title="Friend Challenge" text="A fair 90-second duel on a shared seed with normalized card levels. Share the code; nothing is wagered." onClick={() => store.pushOverlay({ kind: 'social' })} />
      </div>
    </div>
  );
}

const ROOM_ICON: Record<DungeonNode['kind'], IconName> = { battle: 'swords', swarm: 'skull', elite: 'star', rest: 'flame', treasure: 'chest', cards: 'cards', boss: 'trophy' };

export function DungeonScreen() {
  const { game } = useGame();
  const run = game.dungeon;
  if (!run) {
    return (
      <div className="overlay">
        <OverlayHeader title="Dungeon" onBack={() => store.popOverlay()} />
        <div className="content empty">This dungeon run has ended. Start a new one from Battle Modes.</div>
      </div>
    );
  }
  const available = new Set(availableNodes(run).map((n) => n.id));
  const floors = Array.from({ length: BALANCE.dungeon.floors }, (_, f) => run.nodes.filter((n) => n.floor === f));
  return (
    <div className="overlay">
      <OverlayHeader title={dungeonWorldName(run)} onBack={() => store.popOverlay()} />
      <div className="content stack-m">
        <div className="panel">
          <div className="spread">
            <span className="small dim">{run.fullRewards ? 'Full rewards run' : `Reduced rewards (${Math.round(BALANCE.dungeon.reducedRewardRate * 100)}%) - daily full runs used`}</span>
            {run.restBuff > 0 && <span className="chip green">+{Math.round(run.restBuff * 100)}% army</span>}
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            Banked this run:
          </div>
          {Object.keys(run.banked).length === 0 ? (
            <div className="xsmall faint">Nothing yet - every room you clear is banked instantly and kept even if you lose later.</div>
          ) : (
            <RewardList reward={run.banked} extra={run.banked.fragments ? <span className="reward-pill">+{run.banked.fragments} fragments</span> : null} />
          )}
        </div>
        <DungeonMap nodes={run.nodes} visited={run.visited} available={available} floors={floors.length} />
        <div className="panel dark small">
          {Object.entries(ROOM_INFO).map(([k, v]) => (
            <div key={k} className="stat-row">
              <span className="row">
                <Icon name={ROOM_ICON[k as DungeonNode['kind']]} size={14} /> {v.name}
              </span>
              <span className="dim" style={{ textAlign: 'right', maxWidth: '65%' }}>
                {v.text}
              </span>
            </div>
          ))}
        </div>
        <button className="btn ghost block" onClick={() => store.abandonDungeon()}>
          Leave dungeon (keep everything banked)
        </button>
      </div>
    </div>
  );
}

const ROW_H = 100;

/** Floors drawn bottom-up with lines showing which rooms connect, so path choices are readable. */
function DungeonMap({ nodes, visited, available, floors }: { nodes: DungeonNode[]; visited: string[]; available: Set<string>; floors: number }) {
  const pos = new Map<string, { x: number; y: number }>();
  for (let f = 0; f < floors; f++) {
    const row = nodes.filter((n) => n.floor === f);
    row.forEach((n, i) => pos.set(n.id, { x: ((i + 1) / (row.length + 1)) * 100, y: (floors - 1 - f) * ROW_H + ROW_H / 2 }));
  }
  const height = floors * ROW_H;
  return (
    <div className="dungeon-map" style={{ height }}>
      <svg className="dungeon-lines" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {nodes.flatMap((n) =>
          n.next.map((to) => {
            const a = pos.get(n.id)!;
            const b = pos.get(to)!;
            const lit = visited.includes(n.id);
            return <line key={`${n.id}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lit ? '#ffc94a' : 'rgba(207,196,240,0.3)'} strokeWidth={lit ? 3 : 2} vectorEffect="non-scaling-stroke" strokeDasharray={lit ? undefined : '6 6'} />;
          }),
        )}
      </svg>
      {nodes.map((n) => {
        const p = pos.get(n.id)!;
        const isVisited = visited.includes(n.id);
        const can = available.has(n.id);
        return (
          <button
            key={n.id}
            className={`room ${isVisited ? 'visited' : ''} ${can ? 'available' : ''}`}
            style={{ left: `${p.x}%`, top: p.y }}
            disabled={!can}
            onClick={() => store.enterDungeonNode(n.id)}
            aria-label={`${ROOM_INFO[n.kind].name}, floor ${n.floor + 1}${isVisited ? ', cleared' : can ? ', available' : ''}`}
          >
            <Icon name={isVisited ? 'check' : ROOM_ICON[n.kind]} size={22} />
            <span className="display">{ROOM_INFO[n.kind].name}</span>
          </button>
        );
      })}
    </div>
  );
}
