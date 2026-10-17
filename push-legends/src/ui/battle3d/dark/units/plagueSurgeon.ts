import { PAL } from '../../../art/darkArt';
import { warrior } from '../parts';
import type { UnitDef } from './types';

/** Plague Surgeon (card: field_medic). PLACEHOLDER built from the shared parts; to be refined. */
export const plagueSurgeon: UnitDef = {
  build: () => warrior({ attack: 'throw', armor: 'robe', head: { helm: 'plague', metal: PAL.iron, dark: PAL.blackSteel, cloth: PAL.leatherDark, trim: PAL.iron, eyes: PAL.toxic }, colors: { metal: PAL.iron, dark: PAL.blackSteel, cloth: PAL.charcoal, leather: PAL.leatherDark, trim: PAL.iron }, weapon: 'lantern', weaponColors: { glow: PAL.toxic } }),
  portrait: { faction: 'grave' },
};
