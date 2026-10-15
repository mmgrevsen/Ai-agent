/**
 * Pose primitives shared by the recognition engine, synthetic test data and the MediaPipe adapter.
 * Coordinates are normalized image coordinates (0..1, y grows downward), as produced by MediaPipe.
 */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface PoseFrame {
  /** Milliseconds, monotonically increasing for a live stream. */
  t: number;
  /** 33 BlazePose landmarks, or null when no person was detected. */
  landmarks: Landmark[] | null;
}

/** BlazePose landmark indices used by the engine. */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export const POSE_LANDMARK_COUNT = 33;

/** Skeleton connections drawn in the camera overlay. */
export const SKELETON_EDGES: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

export interface Side {
  shoulder: number;
  elbow: number;
  wrist: number;
  hip: number;
  knee: number;
  ankle: number;
}

export const LEFT: Side = { shoulder: LM.leftShoulder, elbow: LM.leftElbow, wrist: LM.leftWrist, hip: LM.leftHip, knee: LM.leftKnee, ankle: LM.leftAnkle };
export const RIGHT: Side = { shoulder: LM.rightShoulder, elbow: LM.rightElbow, wrist: LM.rightWrist, hip: LM.rightHip, knee: LM.rightKnee, ankle: LM.rightAnkle };

/** Interior angle ABC in degrees (0..180). */
export function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag < 1e-9) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

/** Angle of the segment a→b from horizontal, in degrees (0 = horizontal, 90 = vertical). */
export function tiltFromHorizontal(a: Landmark, b: Landmark): number {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

export const vis = (l: Landmark | undefined) => (l ? (l.visibility ?? 1) : 0);
