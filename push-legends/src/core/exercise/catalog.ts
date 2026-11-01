import { BALANCE } from '../config/balance';
import type { ExerciseKind } from './tracking';

/** Player-facing description of each exercise the camera can count. */
export interface ExerciseInfo {
  id: ExerciseKind;
  name: string;
  /** Plural noun for counters ("12 pull-ups"). */
  plural: string;
  /** Combat and reward strength relative to a full push-up. */
  power: number;
  setup: string[];
}

const E = BALANCE.exercise;

export const EXERCISES: readonly ExerciseInfo[] = [
  {
    id: 'full',
    name: 'Push-ups',
    plural: 'push-ups',
    power: E.fullRepMultiplier,
    setup: ['Place the phone on the floor 1.5-2 m away, leaning against something stable.', 'Side view works best: the camera should see your head, arms, hips and feet.'],
  },
  {
    id: 'knee',
    name: 'Knee push-ups',
    plural: 'knee push-ups',
    power: E.kneeRepMultiplier,
    setup: ['Place the phone on the floor 1.5-2 m away, leaning against something stable.', 'Side view works best: the camera should see your head, arms, hips and knees.'],
  },
  {
    id: 'situp',
    name: 'Sit-ups',
    plural: 'sit-ups',
    power: E.situpRepMultiplier,
    setup: ['Place the phone on the floor 1.5-2 m to your side.', 'Lie on your back with bent knees; the camera must see your shoulders, hips and knees.', 'A rep: from lying back to sitting up and back down.'],
  },
  {
    id: 'pullup',
    name: 'Pull-ups',
    plural: 'pull-ups',
    power: E.pullupRepMultiplier,
    setup: ['Place the phone 2-3 m in front of the bar, a little below it, so your whole upper body and hips are in view while hanging.', 'A rep: from a dead hang with straight arms until your chin reaches the bar.', `Pull-ups are hard: each one hits like ${E.pullupRepMultiplier} push-ups and counts ${E.pullupStageCount}× towards a stage.`],
  },
];

export const EXERCISE_BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));
export const exerciseInfo = (k: ExerciseKind): ExerciseInfo => EXERCISE_BY_ID.get(k)!;
