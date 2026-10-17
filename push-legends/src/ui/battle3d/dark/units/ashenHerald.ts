import { PAL } from '../../../art/darkArt';
import { warrior } from '../parts';
import type { UnitDef } from './types';

/** The Ashen Herald (card: ember_mage). PLACEHOLDER built from the shared parts; to be refined. */
export const ashenHerald: UnitDef = {
  build: () => warrior({ attack: 'cast', armor: 'robe', head: { helm: 'cowl', metal: PAL.blackSteel, dark: PAL.black, cloth: PAL.charcoal, trim: PAL.blood, eyes: PAL.fire }, colors: { metal: PAL.blackSteel, dark: PAL.black, cloth: PAL.charcoal, leather: PAL.leatherDark, trim: PAL.blood }, weapon: 'staff', weaponColors: { glow: PAL.fire } }),
  portrait: { faction: 'ash' },
};
