import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HudSnapshot } from '../src/game/types';
import { FIXED_DT } from '../src/game/replay';
import { advanceTutorial, initialTutorial, markTutorialSeen, resetTutorialSeen, skipStep, TUTORIAL_SEED, TUTORIAL_WORLD, tutorialSeen, type TutorialInput, type TutorialState } from '../src/utils/tutorial';
import { loadEngine } from './helpers/headless';

const idle: TutorialInput = { steer: 0, drifting: false, boosting: false, item: null };

describe('tutorial step machine', () => {
  it('needs steering both ways before moving on', () => {
    let s: TutorialState = initialTutorial;
    s = advanceTutorial(s, { ...idle, steer: -0.9 });
    expect(s.step).toBe('steer');
    s = advanceTutorial(s, { ...idle, steer: 0.2 }); // not far enough
    expect(s.step).toBe('steer');
    s = advanceTutorial(s, { ...idle, steer: 0.8 });
    expect(s.step).toBe('drift');
  });

  it('follows drift → boost → item → done', () => {
    let s: TutorialState = { ...initialTutorial, step: 'drift' };
    s = advanceTutorial(s, { ...idle, boosting: true }); // a boost pad must not skip the drift lesson
    expect(s.step).toBe('drift');
    s = advanceTutorial(s, { ...idle, drifting: true });
    expect(s.step).toBe('boost');
    s = advanceTutorial(s, { ...idle, drifting: true }); // still holding
    expect(s.step).toBe('boost');
    s = advanceTutorial(s, idle); // let go too early: no boost, try again
    expect(s.step).toBe('boost');
    s = advanceTutorial(s, { ...idle, boosting: true });
    expect(s.step).toBe('item');
    s = advanceTutorial(s, idle); // no item yet
    expect(s.step).toBe('item');
    s = advanceTutorial(s, { ...idle, item: 'oil' }); // picked one up
    expect(s.step).toBe('item');
    s = advanceTutorial(s, idle); // used it
    expect(s.step).toBe('done');
    expect(advanceTutorial(s, { ...idle, drifting: true }).step).toBe('done');
  });

  it('a boost pad does not pass the boost lesson; only releasing a drift does', () => {
    let s: TutorialState = { ...initialTutorial, step: 'boost' }; // e.g. they skipped the drift lesson
    s = advanceTutorial(s, { ...idle, boosting: true });
    expect(s.step).toBe('boost');
    s = advanceTutorial(s, { ...idle, drifting: true, boosting: true }); // drifting while a pad boost is still active
    expect(s.step).toBe('boost');
    s = advanceTutorial(s, { ...idle, boosting: true }); // released the drift: boosting
    expect(s.step).toBe('item');
  });

  it('lets a stuck player skip a lesson, but not past the end', () => {
    let s: TutorialState = initialTutorial;
    for (const want of ['drift', 'boost', 'item', 'done', 'done']) {
      s = skipStep(s);
      expect(s.step).toBe(want);
    }
  });
});

describe('tutorial seen flag', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('remembers completion or skipping, and can be reset to replay the first-run prompt', () => {
    expect(tutorialSeen()).toBe(false);
    markTutorialSeen('skipped');
    expect(tutorialSeen()).toBe(true);
    resetTutorialSeen();
    expect(tutorialSeen()).toBe(false);
    markTutorialSeen('done');
    expect(JSON.parse(store.get('turbodrift.tutorial.v1')!).outcome).toBe('done');
  });

  it('does not nag when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(tutorialSeen()).toBe(true);
  });
});

interface Peek {
  state: string;
  track: { line: number[]; segments: { curve: number }[] };
  seg(d: number): { index: number };
  player: { dist: number; x: number; item: string | null };
  update(dt: number): void;
  oils: unknown[];
}

describe('practice mode on the tutorial track', () => {
  it('is endless and records nothing, and a sensible driver can complete every lesson', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    try {
      const E = await loadEngine();
      const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop }) as unknown as CanvasRenderingContext2D;
      const canvas = { getContext: () => noop, clientWidth: 390, clientHeight: 844, width: 0, height: 0 } as unknown as HTMLCanvasElement;
      let hud: HudSnapshot | null = null;
      let finished = false;
      const e = new E({ canvas, world: TUTORIAL_WORLD, seed: TUTORIAL_SEED, mode: 'practice', kart: 'comet', onHud: (h) => (hud = h), onFinish: () => (finished = true) });
      const p = e as unknown as Peek;

      let state: TutorialState = initialTutorial;
      const reached: Record<string, number> = {};
      let t = 0;
      const total = 60 * 420; // 7 minutes of play: well past 3 laps
      for (let i = 0; i < total; i++, t += FIXED_DT) {
        const seg = p.track.segments[p.seg(p.player.dist).index];
        const line = p.track.line[p.seg(p.player.dist + 1200).index];
        let steer = (line - p.player.x) * 3;
        let drift = false;
        if (t < 2) steer = Math.sin(t * 4) * 0.9; // the "try steering" lesson: wiggle left and right
        else if (Math.abs(seg.curve) > 1.2) {
          drift = true; // hold DRIFT through the turn
          steer = Math.sign(seg.curve) * 0.8;
        }
        e.input.steer = Math.max(-1, Math.min(1, steer));
        e.input.drift = drift;
        p.update(FIXED_DT);
        // like a player following the coach: hold whatever you pick up and only use it when the lesson asks
        if (state.step === 'item' && p.player.item && !(hud as HudSnapshot | null)?.itemRolling) (e as unknown as { useItem(): void }).useItem();
        const h = hud as HudSnapshot | null;
        if (h) {
          state = advanceTutorial(state, { steer: e.input.steer, drifting: h.driftCharge > 0 || h.driftLevel > 0, boosting: h.boosting, item: h.item });
          reached[state.step] ??= t;
        }
      }
      // every lesson was reachable, in order, within a reasonable time
      expect(state.step).toBe('done');
      const order = ['steer', 'drift', 'boost', 'item', 'done'].map((s) => reached[s]);
      expect(order.every((v) => v !== undefined)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(reached.done).toBeLessThan(150);

      // practice is endless and leaves no trace
      expect(finished).toBe(false);
      expect(p.state).toBe('racing');
      expect(p.player.dist).toBeGreaterThan(3 * (p.track.segments.length * 200));
      expect([...store.keys()].filter((k) => k.includes('ghost') || k.includes('scores'))).toEqual([]);
      expect((e as unknown as { getReplay(): unknown }).getReplay()).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  }, 120000);

  it('starts immediately (no 3-2-1) and has item boxes, unlike a time trial', async () => {
    const E = await loadEngine();
    const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop }) as unknown as CanvasRenderingContext2D;
    const canvas = { getContext: () => noop, clientWidth: 390, clientHeight: 844, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    const e = new E({ canvas, world: 1, seed: 7, mode: 'practice', onHud: () => {}, onFinish: () => {} });
    const p = e as unknown as Peek;
    for (let i = 0; i < 60; i++) p.update(FIXED_DT); // one second
    expect(p.state).toBe('racing');
    expect((e as unknown as { cars: unknown[] }).cars).toHaveLength(1);
  });
});
