import { PAL } from '../../art/darkArt';
import type { Rig } from '../rig';
import { warrior } from './parts';

/**
 * People of the player's base (patrolling soldiers, the hall guard, push-up trainees and their drill
 * sergeant), in the same dark style and from the same parts as the battle units.
 */

/** A patrolling soldier; `cloth` is the tabard colour (taken from the deck), `i` varies the kit. */
export function baseSoldier(cloth: string, i: number): Rig {
  const heavy = i % 3 === 0;
  return warrior({
    bulk: heavy ? 1.12 : 1,
    armor: heavy ? 'plate' : 'mail',
    head: { helm: heavy ? 'sallet' : 'warcap', metal: PAL.gunmetal, dark: PAL.blackSteel, cloth, trim: PAL.iron, eyes: null, skin: PAL.skinPale },
    colors: { metal: PAL.gunmetal, dark: PAL.blackSteel, cloth, leather: PAL.leatherDark, trim: PAL.iron },
    pauldrons: heavy ? 'plate' : 'none',
    weapon: i % 2 ? 'longsword' : 'mace',
    shield: i % 2 ? 'heater' : null,
    shieldFace: cloth,
    tabard: cloth,
  });
}

/** The guard in front of the hall. */
export function baseGuard(cloth: string): Rig {
  return warrior({
    bulk: 1.12,
    armor: 'plate',
    head: { helm: 'barbute', metal: PAL.gunmetal, dark: PAL.blackSteel, cloth, trim: PAL.iron, eyes: null },
    colors: { metal: PAL.gunmetal, dark: PAL.blackSteel, cloth, leather: PAL.leatherDark, trim: PAL.iron },
    pauldrons: 'layered',
    weapon: 'halberd',
    shield: null,
    tabard: cloth,
    skirt: true,
  });
}

/** An unarmed trainee (posed in the push-up position by the barracks model). */
export function baseTrainee(cloth: string, i: number): Rig {
  return warrior({
    bulk: i % 2 ? 1.05 : 0.95,
    armor: 'leather',
    head: { helm: i % 3 ? 'warcap' : 'hood', metal: PAL.iron, dark: PAL.blackSteel, cloth, trim: PAL.leather, eyes: null, skin: PAL.skinPale },
    colors: { metal: PAL.iron, dark: PAL.blackSteel, cloth, leather: PAL.leather, trim: PAL.leatherDark },
    weapon: 'none',
    shield: null,
  });
}

/** The drill sergeant pacing in front of the trainees. */
export function baseSergeant(): Rig {
  return warrior({
    bulk: 1.15,
    armor: 'mail',
    head: { helm: 'warcap', metal: PAL.blackSteel, dark: PAL.black, cloth: PAL.crimson, trim: PAL.gold, eyes: null, skin: PAL.skinPale },
    colors: { metal: PAL.blackSteel, dark: PAL.black, cloth: PAL.crimson, leather: PAL.leatherDark, trim: PAL.gold },
    pauldrons: 'fur',
    weapon: 'none',
    shield: null,
    cape: PAL.crimson,
  });
}
