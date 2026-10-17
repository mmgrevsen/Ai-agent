import { PAL } from '../../../art/darkArt';
import { warrior } from '../parts';
import type { UnitDef } from './types';

/** Blackpowder Sapper (card: powder_bombardier). PLACEHOLDER built from the shared parts; to be refined. */
export const sapper: UnitDef = {
  build: () => warrior({ attack: 'throw', armor: 'leather', head: { helm: 'plague', metal: PAL.iron, dark: PAL.blackSteel, cloth: PAL.leatherDark, trim: PAL.iron, eyes: PAL.fire }, colors: { metal: PAL.iron, dark: PAL.blackSteel, cloth: PAL.cloth, leather: PAL.leather, trim: PAL.iron }, weapon: 'bomb', weaponColors: { glow: PAL.fire } }),
  portrait: { faction: 'ash' },
};
