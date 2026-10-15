import { angleDeg, LEFT, RIGHT, tiltFromHorizontal, vis, type Landmark, type Side } from './pose';

export type ExerciseKind = 'full' | 'knee';
export type Placement = 'side' | 'front';

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
  /** Shoulder-hip-ankle (full) or shoulder-hip-knee (knee) angle; 180 = perfectly straight. */
  bodyLine: number | null;
  /** Knee angle (hip-knee-ankle), used to tell full and knee push-ups apart. */
  kneeAngle: number | null;
  /** Torso tilt from horizontal in degrees (only meaningful in side placement). */
  torsoTilt: number | null;
  side: 'left' | 'right' | 'both' | null;
}

const inFrame = (l: Landmark | undefined) => !!l && l.x > -0.05 && l.x < 1.05 && l.y > -0.05 && l.y < 1.05;

function sideScore(lm: Landmark[], s: Side, kind: ExerciseKind): number {
  const legEnd = kind === 'full' ? s.ankle : s.knee;
  const parts = [s.shoulder, s.elbow, s.wrist, s.hip, legEnd];
  return parts.reduce((sum, i) => sum + (inFrame(lm[i]) ? vis(lm[i]) : 0), 0) / parts.length;
}

/** Extracts the measurements the rep counter needs from one frame of landmarks. */
export function measure(lm: Landmark[] | null, kind: ExerciseKind, placement: Placement): Measurement {
  const empty: Measurement = { confidence: 0, quality: 'lost', guidance: 'no_person', elbowAngle: null, bodyLine: null, kneeAngle: null, torsoTilt: null, side: null };
  if (!lm || lm.length < 29) return empty;

  const ls = sideScore(lm, LEFT, kind);
  const rs = sideScore(lm, RIGHT, kind);
  const best = ls >= rs ? LEFT : RIGHT;
  const bestScore = Math.max(ls, rs);
  const useBoth = placement === 'front' && Math.min(ls, rs) > 0.6;

  const armVis = Math.min(vis(lm[best.shoulder]), vis(lm[best.elbow]), vis(lm[best.wrist]));
  const hipVis = vis(lm[best.hip]);
  const legEnd = kind === 'full' ? best.ankle : best.knee;
  const legVis = vis(lm[legEnd]);

  let guidance: Guidance = 'ok';
  if (bestScore < 0.15) guidance = 'no_person';
  else if (![best.shoulder, best.elbow, best.wrist, best.hip].every((i) => inFrame(lm[i]))) guidance = 'move_into_frame';
  else if (armVis < 0.5) guidance = 'show_arms';
  else if (hipVis < 0.5) guidance = 'show_hips';
  else if (placement === 'side' && legVis < 0.4) guidance = 'show_legs';

  const elbow = (s: Side) => angleDeg(lm[s.shoulder]!, lm[s.elbow]!, lm[s.wrist]!);
  const elbowAngle = useBoth ? (elbow(LEFT) + elbow(RIGHT)) / 2 : elbow(best);
  const bodyLine = legVis >= 0.4 ? angleDeg(lm[best.shoulder]!, lm[best.hip]!, lm[legEnd]!) : null;
  const kneeAngle = vis(lm[best.knee]) >= 0.4 && vis(lm[best.ankle]) >= 0.4 ? angleDeg(lm[best.hip]!, lm[best.knee]!, lm[best.ankle]!) : null;
  const torsoTilt = tiltFromHorizontal(lm[best.shoulder]!, lm[best.hip]!);

  // Leg landmarks matter less in front placement where they are often hidden.
  const legWeight = placement === 'side' ? 0.2 : 0.05;
  const confidence = Math.max(0, Math.min(1, armVis * 0.6 + hipVis * (0.4 - legWeight) + legVis * legWeight));
  const quality: Measurement['quality'] = confidence >= 0.75 ? 'good' : confidence >= 0.55 ? 'fair' : confidence >= 0.3 ? 'poor' : 'lost';
  if (guidance === 'ok' && quality === 'poor') guidance = 'low_light_or_blur';
  if (guidance === 'ok' && placement === 'side' && torsoTilt > 60) guidance = 'get_into_position';

  return { confidence, quality, guidance, elbowAngle, bodyLine, kneeAngle, torsoTilt, side: useBoth ? 'both' : best === LEFT ? 'left' : 'right' };
}
