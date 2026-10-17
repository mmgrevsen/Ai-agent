import { PAL } from '../../../art/darkArt';
import { warrior } from '../parts';
import type { Rig } from '../../rig';

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
}

/**
 * Enemy troops per role, tinted per world by the palette. PLACEHOLDER built from the shared parts;
 * to be refined (roles: normal, ranged, fast, armored, flying; worlds 0-4).
 */
export function enemyUnit(role: string, world: number, p: Palette): Rig {
  const glow = p.accent;
  const base = { metal: PAL.iron, dark: PAL.blackSteel, cloth: PAL.cloth, leather: PAL.leatherDark, trim: PAL.iron };
  void world;
  switch (role) {
    case 'ranged':
      return warrior({ attack: 'bow', armor: 'leather', head: { helm: 'hood', ...base, eyes: glow }, colors: base, weapon: 'longbow' });
    case 'armored':
      return warrior({ armor: 'plate', bulk: 1.3, head: { helm: 'hounskull', ...base, eyes: glow }, colors: base, pauldrons: 'spiked', weapon: 'warhammer', shield: 'spiked' });
    case 'fast':
    case 'flying':
    default:
      return warrior({ armor: 'mail', head: { helm: 'skull', ...base, eyes: glow }, colors: base, weapon: 'falchion' });
  }
}
