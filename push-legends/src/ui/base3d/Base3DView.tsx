import { useEffect, useRef, useState, type ReactNode } from 'react';
import { store } from '../../app/store';
import { BUILDINGS, getBuilding, type BuildingId } from '../../core/content/buildings';
import { CARD_BY_ID } from '../../core/content/cards';
import { PETS } from '../../core/content/pets';
import type { GameState } from '../../core/state/types';
import { checkBuildingUpgrade, mineCapacity, mineStored } from '../../core/systems/buildings';
import { formatDuration, formatNumber } from '../../core/util';
import { Icon } from '../components/Icon';
import { BaseScene, webglAvailable, type BaseSceneState } from './BaseScene';
import type { PlotInfo } from './models';

/**
 * The 3D base with floating building labels. Loaded lazily so three.js is only downloaded when the
 * Base tab is opened. Falls back to `fallback` when WebGL is unavailable.
 */
const BUILDING_IDS = BUILDINGS.map((b) => b.id);

/** Visual tier 0..4 spread over each building's whole level range. */
function visualTier(level: number, maxLevel: number): number {
  if (level <= 1) return 0;
  return Math.min(4, Math.floor(((level - 1) / Math.max(1, maxLevel - 1)) * 5));
}

function sceneState(game: GameState, now: number): BaseSceneState {
  const castle = game.buildings.castle.level;
  const ownedPets = PETS.filter((p) => game.pets[p.id]).map((p) => p.id);
  const petColors = Object.fromEntries(PETS.map((p) => [p.id, p.palette.primary]));
  const soldierColors = game.deck.map((id) => CARD_BY_ID.get(id)?.palette.primary).filter((c): c is string => !!c);
  const cap = mineCapacity(game);
  const plots = {} as Record<BuildingId, PlotInfo>;
  for (const def of BUILDINGS) {
    const b = game.buildings[def.id];
    plots[def.id] = {
      level: b.level,
      tier: visualTier(b.level, def.maxLevel),
      unlocked: castle >= def.unlockCastleLevel,
      upgrading: b.upgradeEndsAt !== null,
      mineFill: def.id === 'gold_mine' && cap > 0 ? Math.round((mineStored(game, now) / cap) * 4) / 4 : 0,
      pets: def.id === 'pet_sanctuary' ? ownedPets : [],
      petColors: def.id === 'pet_sanctuary' ? petColors : {},
      soldierColors: def.id === 'barracks' || def.id === 'training_grounds' ? soldierColors : [],
    };
  }
  return { plots, walkers: Math.min(10, 3 + Math.floor(game.buildings.barracks.level / 3)), soldierColors };
}

export default function Base3DView({ game, now, fallback }: { game: GameState; now: number; fallback: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BaseScene | null>(null);
  const [failed, setFailed] = useState(() => !webglAvailable());
  const reducedMotion = game.settings.reducedMotion;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || failed) return;
    let scene: BaseScene;
    try {
      scene = new BaseScene(host, { onSelect: (id) => store.openModal({ kind: 'building', id }) }, { reducedMotion, pixel: game.settings.graphics !== 'smooth' });
    } catch {
      setFailed(true);
      return;
    }
    sceneRef.current = scene;
    for (const id of BUILDING_IDS) scene.setLabel(id, host.querySelector<HTMLElement>(`[data-plot="${id}"]`));
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // The scene is created once; later changes go through update() below.
  }, [failed, game.settings.graphics]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.reducedMotion = reducedMotion;
    scene.update(sceneState(game, now));
  });

  if (failed) return <>{fallback}</>;

  return (
    <div className="base3d" ref={hostRef}>
      <div className="base3d-labels">
        {BUILDINGS.map((def) => (
          <PlotLabel key={def.id} id={def.id} game={game} now={now} />
        ))}
      </div>
      <div className="base3d-hint xsmall">Drag to look around · pinch or scroll to zoom · tap a building</div>
    </div>
  );
}

function PlotLabel({ id, game, now }: { id: BuildingId; game: GameState; now: number }) {
  const def = getBuilding(id);
  const b = game.buildings[id];
  const check = checkBuildingUpgrade(game, id);
  const upgrading = b.upgradeEndsAt !== null;
  const locked = !check.ok && check.reason === 'locked';
  const stored = id === 'gold_mine' && b.level > 0 ? mineStored(game, now) : 0;
  return (
    <div className="plot-label" data-plot={id}>
      {stored > 0 && (
        <button className="plot-collect" onClick={() => store.collectMine()} aria-label={`Collect ${stored} gold from the mine`}>
          <Icon name="gold" size={14} /> {formatNumber(stored)}
        </button>
      )}
      <button className={`plot-tag${locked ? ' locked' : ''}`} onClick={() => store.openModal({ kind: 'building', id })}>
        <span className="plot-name">{def.name}</span>
        {locked ? (
          <span className="plot-sub">
            <Icon name="lock" size={10} /> Castle {def.unlockCastleLevel}
          </span>
        ) : b.level === 0 ? (
          <span className={`plot-sub${check.ok ? ' ok' : ''}`}>{check.ok ? 'Build ↑' : 'Build'}</span>
        ) : upgrading ? (
          <span className="plot-sub busy">{formatDuration(Math.max(0, (b.upgradeEndsAt! - now) / 1000))}</span>
        ) : (
          <span className={`plot-sub${check.ok ? ' ok' : ''}`}>
            Lv {b.level}
            {check.ok && ' ↑'}
          </span>
        )}
      </button>
    </div>
  );
}

