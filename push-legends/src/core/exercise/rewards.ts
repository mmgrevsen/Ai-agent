import { BALANCE } from '../config/balance';
import type { ExerciseKind } from './tracking';

/** Transparent reward weighting: a verified full push-up is 100%, a knee push-up is configurable (50% by default). */
export function repRewardMultiplier(kind: ExerciseKind): number {
  return kind === 'full' ? BALANCE.exercise.fullRepMultiplier : BALANCE.exercise.kneeRepMultiplier;
}
