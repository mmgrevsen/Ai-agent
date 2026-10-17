import { PAL } from '../../../art/darkArt';
import { warrior } from '../parts';
import type { UnitDef } from './types';

/** The Obsidian Colossus (card: bastion_golem). PLACEHOLDER (a humanoid stand-in) until the creature model is built. */
export const obsidianColossus: UnitDef = {
  build: () => warrior({ armor: 'plate', bulk: 1.6, tall: 1.5, head: { helm: 'beast', metal: PAL.obsidian, dark: PAL.black, cloth: PAL.black, trim: PAL.ember, eyes: PAL.ember, skin: PAL.obsidian }, colors: { metal: PAL.obsidian, dark: PAL.black, cloth: PAL.black, leather: PAL.black, trim: PAL.ember }, weapon: 'none' }),
  portrait: { faction: 'ash' },
};
