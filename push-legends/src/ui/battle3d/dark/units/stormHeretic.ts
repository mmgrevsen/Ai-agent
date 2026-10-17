import { PAL } from '../../../art/darkArt';
import { warrior } from '../parts';
import type { UnitDef } from './types';

/** The Storm Heretic (card: storm_adept). PLACEHOLDER built from the shared parts; to be refined. */
export const stormHeretic: UnitDef = {
  build: () => warrior({ attack: 'cast', armor: 'robe', head: { helm: 'hood', metal: PAL.gunmetal, dark: PAL.blackSteel, cloth: '#24263a', trim: PAL.goldLight, eyes: PAL.storm }, colors: { metal: PAL.gunmetal, dark: PAL.blackSteel, cloth: '#24263a', leather: PAL.leatherDark, trim: PAL.goldLight }, weapon: 'staff', weaponColors: { glow: PAL.storm } }),
  portrait: { faction: 'storm' },
};
