import { PAL } from '../../../art/darkArt';
import { warrior } from '../parts';
import type { Rig } from '../../rig';
import type { Palette } from './enemies';

/** Bosses (troll, mossback, yeti, yeti_chieftain, overseer, forge_overseer, warden, grave_warden, shardmaw). PLACEHOLDER: a towering armoured stand-in until each boss is modelled. */
export function bossesB(sprite: string, p: Palette): Rig | null {
  switch (sprite) {
    case 'troll':
    case 'mossback':
    case 'yeti':
    case 'yeti_chieftain':
    case 'overseer':
    case 'forge_overseer':
    case 'warden':
    case 'grave_warden':
    case 'shardmaw':
      return warrior({ armor: 'plate', bulk: 1.5, tall: 1.6, head: { helm: 'horned', metal: PAL.blackSteel, dark: PAL.black, cloth: PAL.crimson, trim: PAL.gold, eyes: p.accent }, colors: { metal: PAL.blackSteel, dark: PAL.black, cloth: PAL.crimson, leather: PAL.leatherDark, trim: PAL.gold }, pauldrons: 'spiked', weapon: 'greataxe' });
    default:
      return null;
  }
}
