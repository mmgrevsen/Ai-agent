import { PAL } from '../../../art/darkArt';
import { warrior } from '../parts';
import type { UnitDef } from './types';

/** The Pyre Phoenix (card: phoenix_warden). PLACEHOLDER (a humanoid stand-in) until the creature model is built. */
export const pyrePhoenix: UnitDef = {
  build: () => warrior({ armor: 'robe', head: { helm: 'skull', metal: PAL.iron, dark: PAL.black, cloth: PAL.black, trim: PAL.fire, eyes: PAL.fire }, colors: { metal: PAL.iron, dark: PAL.black, cloth: PAL.black, leather: PAL.black, trim: PAL.fire }, weapon: 'none' }),
  portrait: { faction: 'ash' },
};
