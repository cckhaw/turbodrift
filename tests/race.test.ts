import { beforeAll, describe, expect, it } from 'vitest';
import type { Engine as EngineType } from '../src/game/engine';
import type { RaceResult } from '../src/game/types';
import { WORLDS } from '../src/game/worlds';

// The engine only touches the canvas/DOM for rendering and sizing, so a no-op 2D context lets us
// run whole races headlessly by stepping `update()` directly.
const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop }) as unknown as CanvasRenderingContext2D;
let Engine: typeof EngineType;

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;
  g.window = { devicePixelRatio: 1, innerWidth: 390, innerHeight: 844 };
  g.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  ({ Engine } = await import('../src/game/engine'));
});

type Peek = { state: string; player: { dist: number; x: number }; track: { line: number[]; segments: unknown[] }; seg(d: number): { index: number }; cars: { dist: number; isPlayer: boolean }[]; fallT: number; update(dt: number): void };

function race(world: number, seed: number, drive: boolean): { result: RaceResult; falls: number } {
  const canvas = { getContext: () => noop, clientWidth: 390, clientHeight: 844, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  let result: RaceResult | null = null;
  const e = new Engine({ canvas, world, seed, onHud: () => {}, onFinish: (r) => (result = r) });
  const p = e as unknown as Peek;
  let falls = 0;
  let wasFallen = false;
  for (let t = 0; !result && t < 600; t += 1 / 30) {
    if (p.state !== 'countdown' && drive) {
      const line = p.track.line[p.seg(p.player.dist + 1200).index];
      e.input.steer = Math.max(-1, Math.min(1, (line - p.player.x) * 3));
    }
    p.update(1 / 30);
    if (p.fallT > 0 && !wasFallen) falls++;
    wasFallen = p.fallT > 0;
  }
  if (!result) throw new Error('race never finished');
  return { result, falls };
}

describe('headless races', () => {
  for (const w of WORLDS) {
    it(`world ${w.id}: a line-following driver finishes 3 laps and the bots stay close`, () => {
      const { result } = race(w.id, 4242, true);
      expect(result.total).toBe(6);
      expect(result.lapTimes).toHaveLength(3);
      expect(result.bestLap).toBeGreaterThan(20000);
      expect(result.standings).toHaveLength(6);
      // rubber-banding: every bot finishes within 10 s of the leader even though the driver never crashes
      const times = result.standings.map((s) => s.time as number);
      expect(Math.max(...times) - Math.min(...times)).toBeLessThan(10000);
      expect(result.standings.filter((s) => s.you)).toHaveLength(1);
    }, 60000);
  }

  it('a driver who never steers does badly on the sky track (falls) but the race still ends', () => {
    const { result, falls } = race(2, 4242, false);
    expect(falls).toBeGreaterThan(0);
    expect(result.position).toBeGreaterThan(1);
  }, 60000);

  it('is deterministic for the same seed', () => {
    const a = race(1, 99, true).result;
    const b = race(1, 99, true).result;
    expect(b.totalTime).toBe(a.totalTime);
    expect(b.position).toBe(a.position);
  }, 60000);
});
