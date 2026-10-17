import { PAL } from '../../../art/darkArt';
import { warrior } from '../parts';
import type { UnitDef } from './types';

/** Warg Reaver (card: wolf_rider). PLACEHOLDER (a humanoid stand-in) until the creature model is built. */
export const wargReaver: UnitDef = {
  build: () => warrior({ armor: 'leather', head: { helm: 'warcap', metal: PAL.iron, dark: PAL.blackSteel, cloth: PAL.ash, trim: PAL.iron, eyes: PAL.ember }, colors: { metal: PAL.iron, dark: PAL.blackSteel, cloth: PAL.ash, leather: PAL.leatherDark, trim: PAL.iron }, pauldrons: 'fur', weapon: 'greataxe' }),
  portrait: { faction: 'wild' },
};
