import type { Rig } from '../../rig';
import { ashenHerald } from './ashenHerald';
import { blackguard } from './blackguard';
import { bossesA } from './bossesA';
import { bossesB } from './bossesB';
import { bulwark } from './bulwark';
import { dreadRangers } from './dreadRangers';
import { enemyUnit, type Palette } from './enemies';
import { fallenOath } from './fallenOath';
import { graveMarksman } from './graveMarksman';
import { buildHero } from './hero';
import { obsidianColossus } from './obsidianColossus';
import { plagueSurgeon } from './plagueSurgeon';
import { pyrePhoenix } from './pyrePhoenix';
import { redReaper } from './redReaper';
import { rimeWidow } from './rimeWidow';
import { sapper } from './sapper';
import { stormHeretic } from './stormHeretic';
import type { UnitDef } from './types';
import { voidWyrm } from './voidWyrm';
import { wargReaver } from './wargReaver';

/** Card id → dark-fantasy unit (battle model + card portrait framing). */
export const CARD_UNITS: Record<string, UnitDef> = {
  oakshield_knight: blackguard,
  aegis_guardian: bulwark,
  dawn_paladin: fallenOath,
  thornbow_archer: dreadRangers,
  hawkeye_ranger: graveMarksman,
  shade_assassin: redReaper,
  powder_bombardier: sapper,
  field_medic: plagueSurgeon,
  ember_mage: ashenHerald,
  frost_witch: rimeWidow,
  storm_adept: stormHeretic,
  bastion_golem: obsidianColossus,
  wolf_rider: wargReaver,
  phoenix_warden: pyrePhoenix,
  aurora_drake: voidWyrm,
};

export { buildHero, enemyUnit, type Palette };

export function bossUnit(sprite: string, p: Palette): Rig | null {
  return bossesA(sprite, p) ?? bossesB(sprite, p);
}
