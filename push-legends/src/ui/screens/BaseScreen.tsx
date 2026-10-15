import { store, useGame } from '../../app/store';
import { BALANCE } from '../../core/config/balance';
import { BUILDINGS, getBuilding, type BuildingId } from '../../core/content/buildings';
import { activeUpgrades, buildingLevelCap, buildingUpgradeDuration, checkBuildingUpgrade, mineStored, skipCostGems } from '../../core/systems/buildings';
import { formatDuration, formatNumber } from '../../core/util';
import { drawBuilding } from '../art/scenery';
import { ArtCanvas, Bar, BuildingArt, ModalShell, useNow } from '../components/common';
import { Icon } from '../components/Icon';

const REASON_TEXT: Record<string, string> = {
  locked: 'Raise your Castle to unlock',
  max_level: 'Max level',
  castle_cap: 'Raise the Castle first',
  progress_cap: 'Clear more stages to raise the Castle',
  busy: 'Upgrading...',
  no_builder: 'Both builders are busy',
  gold: 'Not enough gold',
};

const LAYOUT: { id: BuildingId; x: number; y: number; s: number }[] = [
  { id: 'castle', x: 246, y: 120, s: 1.15 },
  { id: 'gold_mine', x: 70, y: 150, s: 0.8 },
  { id: 'barracks', x: 150, y: 175, s: 0.8 },
  { id: 'training_grounds', x: 345, y: 175, s: 0.8 },
  { id: 'academy', x: 425, y: 150, s: 0.8 },
  { id: 'blacksmith', x: 55, y: 205, s: 0.75 },
  { id: 'treasury', x: 245, y: 215, s: 0.75 },
  { id: 'pet_sanctuary', x: 440, y: 205, s: 0.75 },
  { id: 'guild_hall', x: 150, y: 110, s: 0.7 },
];

export function BaseScreen() {
  const { game } = useGame();
  const now = useNow(1000);
  const busy = activeUpgrades(game).length;
  return (
    <div className="stack-m">
      <div className="base-scene">
        <ArtCanvas
          width={492}
          height={230}
          animate
          draw={(ctx, t) => {
            const sky = ctx.createLinearGradient(0, 0, 0, 230);
            sky.addColorStop(0, '#6ec6ff');
            sky.addColorStop(1, '#c8f0c0');
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, 492, 230);
            ctx.fillStyle = '#6dbb4f';
            ctx.beginPath();
            ctx.ellipse(246, 230, 330, 140, 0, Math.PI, 0);
            ctx.fill();
            ctx.fillStyle = '#c9a66b';
            ctx.beginPath();
            ctx.ellipse(246, 200, 140, 26, 0, 0, Math.PI * 2);
            ctx.fill();
            for (const l of [...LAYOUT].sort((a, b) => a.y - b.y)) drawBuilding(ctx, l.id, game.buildings[l.id].level, l.x, l.y, l.s, t);
          }}
        />
      </div>
      <div className="spread small">
        <span className="dim">
          Builders: <b className="display">{BALANCE.buildings.builders - busy}</b> free of {BALANCE.buildings.builders}
        </span>
        <span className="chip">Castle Lv {game.buildings.castle.level}</span>
      </div>
      <div className="grid-2">
        {BUILDINGS.map((def) => {
          const b = game.buildings[def.id];
          const check = checkBuildingUpgrade(game, def.id);
          const upgrading = b.upgradeEndsAt !== null;
          const remaining = upgrading ? Math.max(0, (b.upgradeEndsAt! - now) / 1000) : 0;
          const locked = !check.ok && check.reason === 'locked';
          return (
            <button key={def.id} className="panel tile building-card" onClick={() => store.openModal({ kind: 'building', id: def.id })} style={{ opacity: locked ? 0.6 : 1 }}>
              <div className="spread">
                <span className="display small">{def.name}</span>
                <span className="level-badge">{b.level}</span>
              </div>
              <BuildingArt id={def.id} level={b.level} width={120} height={84} />
              {upgrading ? (
                <Bar value={1 - remaining / Math.max(1, buildingUpgradeDuration(b.level))} max={1} tone="blue" label={formatDuration(remaining)} />
              ) : check.ok ? (
                <span className="chip green center">
                  <Icon name="up" size={12} /> {formatNumber(check.cost)} gold
                </span>
              ) : (
                <span className="xsmall faint center">{REASON_TEXT[check.reason] ?? ''}</span>
              )}
              {def.id === 'gold_mine' && b.level > 0 && <span className="xsmall gold-text center">{formatNumber(mineStored(game, now))} ready</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BuildingModal({ id }: { id: BuildingId }) {
  const { game } = useGame();
  const now = useNow(1000);
  const def = getBuilding(id);
  const b = game.buildings[id];
  const check = checkBuildingUpgrade(game, id);
  const upgrading = b.upgradeEndsAt !== null;
  const remaining = upgrading ? Math.max(0, (b.upgradeEndsAt! - now) / 1000) : 0;
  const gems = upgrading ? skipCostGems(game, id, now) : 0;
  return (
    <ModalShell label={def.name} onClose={() => store.closeModal()}>
      <div className="stack-m">
        <div className="row">
          <BuildingArt id={id} level={b.level} width={130} height={100} animate />
          <div className="grow">
            <h2>{def.name}</h2>
            <div className="small dim">
              Level {b.level} / {buildingLevelCap(game, id)} (max {def.maxLevel})
            </div>
          </div>
        </div>
        <p className="small dim" style={{ margin: 0 }}>
          {def.description}
        </p>
        <div className="panel dark small">
          <div className="stat-row">
            <span>Now</span>
            <b>{b.level > 0 ? def.benefit(b.level) : 'Not built yet'}</b>
          </div>
          {b.level < def.maxLevel && (
            <div className="stat-row">
              <span>Next level</span>
              <b className="up">{def.benefit(b.level + 1)}</b>
            </div>
          )}
          {id === 'castle' && (
            <div className="stat-row">
              <span>Unlocks</span>
              <b className="small">
                {BUILDINGS.filter((x) => x.unlockCastleLevel === b.level + 1)
                  .map((x) => x.name)
                  .join(', ') || (b.level + 1 === 2 ? 'Dungeons' : 'Higher building levels')}
              </b>
            </div>
          )}
        </div>
        {upgrading ? (
          <>
            <div className="spread small">
              <span>Upgrading to level {b.level + 1}</span>
              <span className="display">{formatDuration(remaining)}</span>
            </div>
            <button className="btn purple block" disabled={game.resources.gems < gems} onClick={() => store.finishBuildingNow(id)}>
              Finish now <Icon name="gem" size={16} /> {gems}
            </button>
            <p className="xsmall faint center" style={{ margin: 0 }}>
              The building keeps working at its current level while upgrading.
            </p>
          </>
        ) : (
          <>
            <div className="spread small">
              <span className="row">
                <Icon name="clock" size={16} /> {formatDuration(check.duration)}
              </span>
              <span className="row">
                <Icon name="gold" size={16} /> {formatNumber(check.cost)}
              </span>
            </div>
            <button className="btn gold big block" disabled={!check.ok} onClick={() => store.upgradeBuilding(id)}>
              {check.ok ? 'Upgrade' : REASON_TEXT[check.reason]}
            </button>
          </>
        )}
        {id === 'gold_mine' && b.level > 0 && (
          <button className="btn green block" onClick={() => store.collectMine()}>
            Collect {formatNumber(mineStored(game, now))} gold
          </button>
        )}
      </div>
    </ModalShell>
  );
}
