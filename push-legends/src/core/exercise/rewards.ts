import { BALANCE } from '../config/balance';
import type { ExerciseKind } from './tracking';

/** Transparent reward weighting: a verified full push-up is 100%, a knee push-up is configurable (50% by default). */
export function repRewardMultiplier(kind: ExerciseKind): number {
  const e = BALANCE.exercise;
  return kind === 'full' ? e.fullRepMultiplier : kind === 'knee' ? e.kneeRepMultiplier : kind === 'situp' ? e.situpRepMultiplier : e.pullupRepMultiplier;
}
