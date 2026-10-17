import { PAL } from '../../../art/darkArt';
import { warrior } from '../parts';
import type { UnitDef } from './types';

/** The Rime Widow (card: frost_witch). PLACEHOLDER built from the shared parts; to be refined. */
export const rimeWidow: UnitDef = {
  build: () => warrior({ attack: 'cast', armor: 'robe', head: { helm: 'witch', metal: PAL.steel, dark: PAL.blackSteel, cloth: '#1f2a33', trim: PAL.bone, eyes: PAL.frost }, colors: { metal: PAL.steel, dark: PAL.blackSteel, cloth: '#1f2a33', leather: PAL.leatherDark, trim: PAL.bone }, weapon: 'staff', weaponColors: { glow: PAL.frost } }),
  portrait: { faction: 'frost' },
};
