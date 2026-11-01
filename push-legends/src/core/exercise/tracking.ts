import { angleDeg, LEFT, RIGHT, tiltFromHorizontal, vis, type Landmark, type Side } from './pose';

/** full / knee push-ups, sit-ups (trunk-thigh angle) and pull-ups (elbow angle while hanging). */
export type ExerciseKind = 'full' | 'knee' | 'situp' | 'pullup';
export const isPushUp = (k: ExerciseKind) => k === 'full' || k === 'knee';
export type Placement = 'side' | 'front' | 'auto';

/**
 * Tells side and front views apart from the body itself: seen from the front the shoulders are wide
 * apart compared with the torso, seen from the side they overlap.
 */
export function detectPlacement(lm: Landmark[]): 'side' | 'front' {
  const ls = lm[LEFT.shoulder];
  const rs = lm[RIGHT.shoulder];
  const lh = lm[LEFT.hip];
  if (!ls || !rs || !lh || vis(ls) < 0.3 || vis(rs) < 0.3) return 'side';
  const width = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  const torso = Math.hypot(ls.x - lh.x, ls.y - lh.y);
  return torso > 1e-3 && width / torso > 0.45 ? 'front' : 'side';
}

/** Guidance codes. The UI maps these to friendly, non-accusatory messages. */
export type Guidance =
  | 'no_person'
  | 'move_into_frame'
  | 'show_arms'
  | 'show_hips'
  | 'show_legs'
  | 'turn_sideways'
  | 'get_into_position'
  | 'low_light_or_blur'
  | 'ok';

export interface Measurement {
  /** 0..1 confidence that the landmarks needed for this exercise are reliable. */
  confidence: number;
  quality: 'good' | 'fair' | 'poor' | 'lost';
  guidance: Guidance;
  /** Elbow angle in degrees (null if arms are not tracked). */
  elbowAngle: number | null;
  /**
   * The angle the rep counter follows: the elbow for push-ups and pull-ups, the shoulder-hip-knee
   * (trunk to thigh) angle for sit-ups. Large = extended / lying back, small = bent / sat up.
   */
  angle: number | null;
  /** Shoulder-hip-ankle (full) or shoulder-hip-knee (knee) angle; 180 = perfectly straight. */
  bodyLine: number | null;
  /** Knee angle (hip-knee-ankle), used to tell full and knee push-ups apart. */
  kneeAngle: number | null;
  /** Torso tilt from horizontal in degrees (only meaningful in side placement). */
  torsoTilt: number | null;
  side: 'left' | 'right' | 'both' | null;
  /** Camera view used for this frame (resolved when the setting is 'auto'). */
  placement: 'side' | 'front';
}

const inFrame = (l: Landmark | undefined) => !!l && l.x > -0.05 && l.x < 1.05 && l.y > -0.05 && l.y < 1.05;

function parts(s: Side, kind: ExerciseKind): number[] {
  if (kind === 'situp') return [s.shoulder, s.hip, s.knee];
  if (kind === 'pullup') return [s.shoulder, s.elbow, s.wrist, s.hip];
  return [s.shoulder, s.elbow, s.wrist, s.hip, kind === 'full' ? s.ankle : s.knee];
}

function sideScore(lm: Landmark[], s: Side, kind: ExerciseKind): number {
  const ps = parts(s, kind);
  return ps.reduce((sum, i) => sum + (inFrame(lm[i]) ? vis(lm[i]) : 0), 0) / ps.length;
}

/** Extracts the measurements the rep counter needs from one frame of landmarks. */
export function measure(lm: Landmark[] | null, kind: ExerciseKind, placementSetting: Placement): Measurement {
  let placement: 'side' | 'front' = placementSetting === 'front' ? 'front' : 'side';
  const empty: Measurement = { confidence: 0, quality: 'lost', guidance: 'no_person', elbowAngle: null, angle: null, bodyLine: null, kneeAngle: null, torsoTilt: null, side: null, placement: placement === 'front' ? 'front' : 'side' };
  if (!lm || lm.length < 29) return empty;
  if (placementSetting === 'auto') placement = detectPlacement(lm);

  const ls = sideScore(lm, LEFT, kind);
  const rs = sideScore(lm, RIGHT, kind);
  const best = ls >= rs ? LEFT : RIGHT;
  const bestScore = Math.max(ls, rs);
  const useBoth = placement === 'front' && Math.min(ls, rs) > 0.6;

  const situp = kind === 'situp';
  const armVis = situp ? 1 : Math.min(vis(lm[best.shoulder]), vis(lm[best.elbow]), vis(lm[best.wrist]));
  const hipVis = vis(lm[best.hip]);
  const legEnd = kind === 'full' ? best.ankle : best.knee;
  const legVis = kind === 'pullup' ? 1 : vis(lm[legEnd]);

  let guidance: Guidance = 'ok';
  if (bestScore < 0.15) guidance = 'no_person';
  else if (!(situp ? [best.shoulder, best.hip, best.knee] : [best.shoulder, best.elbow, best.wrist, best.hip]).every((i) => inFrame(lm[i]))) guidance = 'move_into_frame';
  else if (armVis < 0.5) guidance = 'show_arms';
  else if (hipVis < 0.5) guidance = 'show_hips';
  else if ((placement === 'side' || situp) && legVis < 0.4) guidance = 'show_legs';

  const elbow = (s: Side) => angleDeg(lm[s.shoulder]!, lm[s.elbow]!, lm[s.wrist]!);
  const elbowAngle = situp ? null : useBoth ? (elbow(LEFT) + elbow(RIGHT)) / 2 : elbow(best);
  const trunk = situp && legVis >= 0.4 ? angleDeg(lm[best.shoulder]!, lm[best.hip]!, lm[best.knee]!) : null;
  const angle = situp ? trunk : elbowAngle;
  const bodyLine = isPushUp(kind) && legVis >= 0.4 ? angleDeg(lm[best.shoulder]!, lm[best.hip]!, lm[legEnd]!) : null;
  const kneeAngle = vis(lm[best.knee]) >= 0.4 && vis(lm[best.ankle]) >= 0.4 ? angleDeg(lm[best.hip]!, lm[best.knee]!, lm[best.ankle]!) : null;
  const torsoTilt = tiltFromHorizontal(lm[best.shoulder]!, lm[best.hip]!);

  // Leg landmarks matter less in front placement where they are often hidden.
  const legWeight = situp ? 0.4 : kind === 'pullup' ? 0 : placement === 'side' ? 0.2 : 0.05;
  const armWeight = situp ? 0 : 0.6;
  const confidence = Math.max(0, Math.min(1, armVis * armWeight + hipVis * (1 - armWeight - legWeight) + legVis * legWeight));
  const quality: Measurement['quality'] = confidence >= 0.75 ? 'good' : confidence >= 0.55 ? 'fair' : confidence >= 0.3 ? 'poor' : 'lost';
  if (guidance === 'ok' && quality === 'poor') guidance = 'low_light_or_blur';
  if (guidance === 'ok' && isPushUp(kind) && placement === 'side' && torsoTilt > 60) guidance = 'get_into_position';

  return { confidence, quality, guidance, elbowAngle, angle, bodyLine, kneeAngle, torsoTilt, side: useBoth ? 'both' : best === LEFT ? 'left' : 'right', placement };
}
