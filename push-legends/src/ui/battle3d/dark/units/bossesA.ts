import { PAL } from '../../../art/darkArt';
import { warrior } from '../parts';
import type { Rig } from '../../rig';
import type { Palette } from './enemies';

/** Bosses (treant, crystal_heart, magma_titan, ice_queen, lich_king). PLACEHOLDER: a towering armoured stand-in until each boss is modelled. */
export function bossesA(sprite: string, p: Palette): Rig | null {
  switch (sprite) {
    case 'treant':
    case 'crystal_heart':
    case 'magma_titan':
    case 'ice_queen':
    case 'lich_king':
      return warrior({ armor: 'plate', bulk: 1.5, tall: 1.6, head: { helm: 'horned', metal: PAL.blackSteel, dark: PAL.black, cloth: PAL.crimson, trim: PAL.gold, eyes: p.accent }, colors: { metal: PAL.blackSteel, dark: PAL.black, cloth: PAL.crimson, leather: PAL.leatherDark, trim: PAL.gold }, pauldrons: 'spiked', weapon: 'greataxe' });
    default:
      return null;
  }
}
