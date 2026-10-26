import { describe, expect, it } from 'vitest';
import type { HudSnapshot } from '../src/game/types';
import { loadEngine } from './helpers/headless';

describe('HUD race markers and road-ahead', () => {
  it('reports every racer once, exactly one "you", valid lap fractions and a look-ahead', async () => {
    const E = await loadEngine();
    const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop }) as unknown as CanvasRenderingContext2D;
    const canvas = { getContext: () => noop, clientWidth: 390, clientHeight: 844, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    const huds: HudSnapshot[] = [];
    const e = new E({ canvas, world: 2, seed: 77, mode: 'race', kart: 'comet', onHud: (h) => huds.push(h), onFinish: () => {} });
    const p = e as unknown as { update(dt: number): void };
    for (let i = 0; i < 60 * 12; i++) p.update(1 / 60);
    const h = huds[huds.length - 1];
    expect(h).toBeTruthy();
    expect(h.racers.length).toBe(h.total);
    expect(h.racers.filter((r) => r.you)).toHaveLength(1);
    expect(new Set(h.racers.map((r) => r.pos)).size).toBe(h.total);
    expect(new Set(h.racers.map((r) => r.id)).size).toBe(h.total);
    for (const r of h.racers) {
      expect(r.t).toBeGreaterThanOrEqual(0);
      expect(r.t).toBeLessThan(1);
    }
    expect(h.ahead.ribbon.length).toBeGreaterThan(5);
  });
});
