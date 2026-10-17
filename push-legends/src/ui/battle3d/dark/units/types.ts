import type { Faction } from '../../../art/darkArt';
import type { Rig } from '../../rig';

/** How a unit is framed and posed on its card portrait (rendered from the same 3D model). */
export interface PortraitSpec {
  /** Pose for the portrait (raise the weapon, spread wings...). Runs after the rig is built. */
  pose?: (rig: Rig) => void;
  /** Visible slice of the model, as fractions of its height (default 0.32 → 1.06). */
  from?: number;
  to?: number;
  /** Turn towards the camera in radians (default 0.45: three-quarter view). */
  yaw?: number;
  /** Shift the subject sideways in the frame (units of frame width, default 0). */
  shift?: number;
  faction?: Faction;
}

export interface UnitDef {
  build: () => Rig;
  portrait?: PortraitSpec;
}
