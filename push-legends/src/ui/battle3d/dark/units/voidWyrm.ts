import { PAL } from '../../../art/darkArt';
import { warrior } from '../parts';
import type { UnitDef } from './types';

/** The Void Wyrm (card: aurora_drake). PLACEHOLDER (a humanoid stand-in) until the creature model is built. */
export const voidWyrm: UnitDef = {
  build: () => warrior({ armor: 'robe', head: { helm: 'horned', metal: PAL.obsidian, dark: PAL.black, cloth: PAL.black, trim: PAL.void2, eyes: PAL.void2 }, colors: { metal: PAL.obsidian, dark: PAL.black, cloth: PAL.black, leather: PAL.black, trim: PAL.void2 }, weapon: 'none' }),
  portrait: { faction: 'void' },
};
