import { usePersistentState } from './storage';

/** Clean runs (no mistakes, no hints) needed before a line counts as memorized. */
export const MASTERY = 5;

/** Clean practice runs per line and color, e.g. { italian: { w: 3 } }. */
export type TrainerProgress = Record<string, Partial<Record<'w' | 'b', number>>>;

export function useTrainerProgress() {
  return usePersistentState<TrainerProgress>('trainer.progress', {});
}
