import { Rng } from '../rng';
import { LM, POSE_LANDMARK_COUNT, type Landmark, type PoseFrame } from './pose';

/**
 * Generates anatomically plausible side-view push-up landmarks. Used by automated tests and by the
 * developer "simulated camera", which feeds the real recognition pipeline instead of bypassing it.
 */
export interface SyntheticPoseOptions {
  elbowAngle: number;
  kind: 'full' | 'knee';
  /** Degrees the hips sag below a straight line (negative = piked up). */
  hipSag?: number;
  /** Bend at the knees in full mode (0 = straight legs). */
  kneeBend?: number;
  /** Rotate the whole body upright (90 = standing), for negative tests. */
  bodyTilt?: number;
  visibility?: number;
  noise?: number;
  rng?: Rng;
}

const UPPER_ARM = 0.13;
const FOREARM = 0.12;
const TORSO = 0.26;
const THIGH = 0.2;
const SHIN = 0.19;

export function syntheticPose(o: SyntheticPoseOptions): Landmark[] {
  const rng = o.rng ?? new Rng(1);
  const noise = o.noise ?? 0;
  const v = o.visibility ?? 0.95;
  const floorY = 0.82;
  const wrist = { x: 0.3, y: floorY };
  // Law of cosines: distance wrist→shoulder for the given elbow angle.
  const theta = (o.elbowAngle * Math.PI) / 180;
  const d = Math.sqrt(UPPER_ARM ** 2 + FOREARM ** 2 - 2 * UPPER_ARM * FOREARM * Math.cos(theta));
  const shoulder = { x: wrist.x + 0.02, y: floorY - d };
  // Elbow: intersection of circles around wrist (forearm) and shoulder (upper arm), bending toward the feet (+x).
  const a = (FOREARM ** 2 - UPPER_ARM ** 2 + d * d) / (2 * d);
  const hgt = Math.sqrt(Math.max(0, FOREARM ** 2 - a * a));
  const ux = (shoulder.x - wrist.x) / d;
  const uy = (shoulder.y - wrist.y) / d;
  const px = wrist.x + a * ux;
  const py = wrist.y + a * uy;
  const c1 = { x: px - uy * hgt, y: py + ux * hgt };
  const c2 = { x: px + uy * hgt, y: py - ux * hgt };
  const elbow = c1.x >= c2.x ? c1 : c2;

  // Body: from shoulder toward the floor contact point (feet or knees).
  const legLen = o.kind === 'full' ? THIGH + SHIN : THIGH;
  const contactX = shoulder.x + Math.sqrt(Math.max(0.01, (TORSO + legLen) ** 2 - (floorY - shoulder.y) ** 2));
  const contact = { x: contactX, y: floorY };
  const dirX = (contact.x - shoulder.x) / (TORSO + legLen);
  const dirY = (contact.y - shoulder.y) / (TORSO + legLen);
  // hipSag bends the body line at the hips by that many degrees (body line = 180 - hipSag).
  const hip = bentHip(shoulder, contact, dirX, dirY, o.hipSag ?? 0);
  const legDx = (contact.x - hip.x) / Math.hypot(contact.x - hip.x, contact.y - hip.y);
  const legDy = (contact.y - hip.y) / Math.hypot(contact.x - hip.x, contact.y - hip.y);
  let knee: { x: number; y: number };
  let ankle: { x: number; y: number };
  if (o.kind === 'full') {
    // Bending the knees rotates the shin upward around the knee.
    const bend = ((o.kneeBend ?? 0) * Math.PI) / 180;
    knee = { x: hip.x + legDx * THIGH, y: hip.y + legDy * THIGH };
    const sx = legDx * Math.cos(bend) + legDy * Math.sin(bend);
    const sy = -legDx * Math.sin(bend) + legDy * Math.cos(bend);
    ankle = { x: knee.x + sx * SHIN, y: knee.y + sy * SHIN };
  } else {
    knee = contact;
    ankle = { x: knee.x + SHIN * 0.75, y: knee.y - SHIN * 0.6 };
  }

  let points: Record<string, { x: number; y: number }> = { shoulder, elbow, wrist, hip, knee, ankle };
  if (o.bodyTilt) {
    // Rotate everything around the wrist (used to simulate standing / non push-up movement).
    const t = (-o.bodyTilt * Math.PI) / 180;
    const rot = (p: { x: number; y: number }) => {
      const dx = p.x - wrist.x;
      const dy = p.y - wrist.y;
      return { x: wrist.x + dx * Math.cos(t) - dy * Math.sin(t), y: wrist.y + dx * Math.sin(t) + dy * Math.cos(t) };
    };
    points = Object.fromEntries(Object.entries(points).map(([k, p]) => [k, rot(p)]));
  }

  const lm: Landmark[] = Array.from({ length: POSE_LANDMARK_COUNT }, () => ({ x: 0.5, y: 0.5, visibility: 0.1 }));
  const put = (i: number, p: { x: number; y: number }, visibility: number) => {
    lm[i] = { x: p.x + rng.range(-noise, noise), y: p.y + rng.range(-noise, noise), z: 0, visibility };
  };
  // Near side (left) is clearly visible; far side (right) is partly occluded, offset slightly.
  const off = (p: { x: number; y: number }) => ({ x: p.x + 0.01, y: p.y - 0.01 });
  put(LM.leftShoulder, points.shoulder!, v);
  put(LM.leftElbow, points.elbow!, v);
  put(LM.leftWrist, points.wrist!, v);
  put(LM.leftHip, points.hip!, v);
  put(LM.leftKnee, points.knee!, v);
  put(LM.leftAnkle, points.ankle!, v);
  put(LM.rightShoulder, off(points.shoulder!), v * 0.6);
  put(LM.rightElbow, off(points.elbow!), v * 0.6);
  put(LM.rightWrist, off(points.wrist!), v * 0.6);
  put(LM.rightHip, off(points.hip!), v * 0.6);
  put(LM.rightKnee, off(points.knee!), v * 0.6);
  put(LM.rightAnkle, off(points.ankle!), v * 0.6);
  put(LM.nose, { x: points.shoulder!.x - 0.05, y: points.shoulder!.y + 0.01 }, v);
  return lm;
}

function bentHip(shoulder: { x: number; y: number }, contact: { x: number; y: number }, dirX: number, dirY: number, sagDeg: number) {
  const straight = { x: shoulder.x + dirX * TORSO, y: shoulder.y + dirY * TORSO };
  if (!sagDeg) return straight;
  const target = 180 - sagDeg;
  let best = straight;
  let bestErr = Infinity;
  // Rotate the torso downward until the hip angle matches the requested bend.
  for (let deg = 0; deg <= 80; deg += 0.25) {
    const r = (deg * Math.PI) / 180;
    const hx = shoulder.x + (dirX * Math.cos(r) - dirY * Math.sin(r)) * TORSO;
    const hy = shoulder.y + (dirX * Math.sin(r) + dirY * Math.cos(r)) * TORSO;
    const v1x = shoulder.x - hx;
    const v1y = shoulder.y - hy;
    const v2x = contact.x - hx;
    const v2y = contact.y - hy;
    const ang = (Math.acos((v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y))) * 180) / Math.PI;
    if (Math.abs(ang - target) < bestErr) {
      bestErr = Math.abs(ang - target);
      best = { x: hx, y: hy };
    }
  }
  return best;
}

export interface RepSequenceOptions {
  reps: number;
  kind?: 'full' | 'knee';
  fps?: number;
  repMs?: number;
  topAngle?: number;
  bottomAngle?: number;
  holdTopMs?: number;
  noise?: number;
  hipSag?: number;
  kneeBend?: number;
  bodyTilt?: number;
  visibility?: number;
  startT?: number;
  seed?: number;
}

/** A sequence of frames: hold at the top, then `reps` smooth down-up cycles. */
export function repSequence(o: RepSequenceOptions): PoseFrame[] {
  const fps = o.fps ?? 30;
  const dt = 1000 / fps;
  const repMs = o.repMs ?? 1600;
  const top = o.topAngle ?? 165;
  const bottom = o.bottomAngle ?? 80;
  const hold = o.holdTopMs ?? 600;
  const rng = new Rng(o.seed ?? 7);
  const frames: PoseFrame[] = [];
  let t = o.startT ?? 0;
  const pose = (angle: number) =>
    syntheticPose({
      elbowAngle: angle,
      kind: o.kind ?? 'full',
      noise: o.noise ?? 0.0015,
      hipSag: o.hipSag,
      kneeBend: o.kneeBend,
      bodyTilt: o.bodyTilt,
      visibility: o.visibility,
      rng,
    });
  for (let ms = 0; ms < hold; ms += dt) frames.push({ t: (t += dt), landmarks: pose(top) });
  for (let r = 0; r < o.reps; r++) {
    for (let ms = 0; ms < repMs; ms += dt) {
      const phase = ms / repMs;
      const angle = top - (top - bottom) * (0.5 - 0.5 * Math.cos(phase * 2 * Math.PI));
      frames.push({ t: (t += dt), landmarks: pose(angle) });
    }
    for (let ms = 0; ms < 200; ms += dt) frames.push({ t: (t += dt), landmarks: pose(top) });
  }
  return frames;
}
