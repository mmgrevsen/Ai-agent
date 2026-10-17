import { UNIT_LOOK, type Faction } from '../art/darkArt';
import { BOSS_BY_ID, WORLDS } from '../../core/content/worlds';
import { bossUnit, buildHero, CARD_UNITS, enemyUnit } from './dark/units';
import type { PortraitSpec, UnitDef } from './dark/units/types';
import { PortraitStudio } from './portrait';

/**
 * Bakes portraits from the battle models (loaded lazily by art/cardPortraits.ts so the 2D screens
 * do not pull in three.js). One shared studio; it is released when the queue runs dry.
 *
 * Keys: a card id (card framing), `full:<cardId>` (whole body), `hero:<cape hex>:<sword|goldsword>`
 * and `boss:<boss id>` (whole body).
 */
let studio: PortraitStudio | null = null;

const FULL: PortraitSpec = { from: -0.02, to: 1.04, yaw: 0.4 };
const BOSS_FACTION: Faction[] = ['wild', 'frost', 'ash', 'grave', 'void'];

function resolve(key: string): { def: UnitDef; faction: Faction } | null {
  const [kind, a, b] = key.split(':');
  if (kind === 'hero') return { def: { build: () => buildHero(a ?? '#5e0f14', b === 'goldsword' ? 'goldsword' : 'sword'), portrait: FULL }, faction: 'iron' };
  if (kind === 'boss') {
    const boss = BOSS_BY_ID.get(a ?? '');
    if (!boss) return null;
    const world = WORLDS.findIndex((w) => w.boss.id === boss.id || w.miniBoss.id === boss.id);
    return {
      def: { build: () => bossUnit(boss.sprite, boss.palette) ?? enemyUnit('armored', Math.max(0, world), boss.palette), portrait: FULL },
      faction: BOSS_FACTION[world] ?? 'void',
    };
  }
  const id = kind === 'full' ? (a ?? '') : key;
  const def = CARD_UNITS[id];
  if (!def) return null;
  return { def: kind === 'full' ? { build: def.build, portrait: { ...def.portrait, ...FULL } } : def, faction: UNIT_LOOK[id]?.faction ?? 'iron' };
}

export function bakePortrait(key: string): HTMLCanvasElement | null {
  const r = resolve(key);
  if (!r) return null;
  studio ??= new PortraitStudio();
  return studio.render(r.def.build(), r.def.portrait, r.faction);
}

export function releaseStudio(): void {
  studio?.dispose();
  studio = null;
}
