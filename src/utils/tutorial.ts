import type { Item } from '../game/items';

/** The tutorial runs in endless practice mode on a fixed, forgiving track (curves and item boxes come up quickly). */
export const TUTORIAL_WORLD = 1;
export const TUTORIAL_SEED = 4242;

const KEY = 'turbodrift.tutorial.v1';

export const tutorialSeen = (): boolean => {
  try {
    return localStorage.getItem(KEY) != null;
  } catch {
    return true; // can't remember anything, so don't nag
  }
};

export function markTutorialSeen(outcome: 'done' | 'skipped'): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ outcome, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

export const resetTutorialSeen = (): void => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

export type TutorialStep = 'steer' | 'drift' | 'boost' | 'item' | 'done';
export const TUTORIAL_STEPS: TutorialStep[] = ['steer', 'drift', 'boost', 'item', 'done'];

export interface TutorialState {
  step: TutorialStep;
  left: boolean; // has steered left far enough
  right: boolean;
  hadItem: boolean; // picked one up and is waiting to use it
  wasDrifting: boolean; // boost lesson: has been holding a drift, so a boost now means they let go
}

export interface TutorialInput {
  steer: number; // -1..1
  drifting: boolean;
  boosting: boolean;
  item: Item | null;
}

export const initialTutorial: TutorialState = { step: 'steer', left: false, right: false, hadItem: false, wasDrifting: false };

const next = (s: TutorialState, step: TutorialStep): TutorialState => ({ ...s, step });

/** Pure step machine: feed it the live HUD data and it says which lesson the player is on. */
export function advanceTutorial(s: TutorialState, i: TutorialInput): TutorialState {
  switch (s.step) {
    case 'steer': {
      const left = s.left || i.steer < -0.45;
      const right = s.right || i.steer > 0.45;
      return left && right ? next({ ...s, left, right }, 'drift') : { ...s, left, right };
    }
    case 'drift':
      return i.drifting ? next({ ...s, wasDrifting: true }, 'boost') : s;
    case 'boost': {
      // only a boost that comes from *releasing a drift* counts (a boost pad on the road must not pass the lesson)
      const wasDrifting = s.wasDrifting || i.drifting;
      return wasDrifting && !i.drifting && i.boosting ? next({ ...s, wasDrifting }, 'item') : { ...s, wasDrifting };
    }
    case 'item': {
      const hadItem = s.hadItem || i.item != null;
      return hadItem && i.item === null ? next({ ...s, hadItem }, 'done') : { ...s, hadItem };
    }
    default:
      return s;
  }
}

/** Skip the current lesson (for players who are stuck). */
export function skipStep(s: TutorialState): TutorialState {
  const i = TUTORIAL_STEPS.indexOf(s.step);
  return i < TUTORIAL_STEPS.length - 1 ? { ...s, step: TUTORIAL_STEPS[i + 1] } : s;
}
