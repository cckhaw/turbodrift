import { describe, expect, it } from 'vitest';
import { generateTrack } from '../src/game/track';
import { SEG_LENGTH, WORLDS } from '../src/game/worlds';
import { MIN_LAP_MS } from '../api/_core';
import { MAX_KART_SPEED } from '../src/game/karts';

describe('generateTrack', () => {
  it('rebuilds the identical track from world + seed (shareable challenge links)', () => {
    const a = generateTrack(2, 98765);
    const b = generateTrack(2, 98765);
    expect(b.segments.map((s) => [s.curve, s.p2.world.y, s.scenery.length])).toEqual(a.segments.map((s) => [s.curve, s.p2.world.y, s.scenery.length]));
  });

  it('differs between seeds and worlds', () => {
    const curves = (w: number, s: number) => generateTrack(w, s).segments.slice(100, 400).map((x) => x.curve);
    expect(curves(1, 1)).not.toEqual(curves(1, 2));
    expect(curves(1, 1)).not.toEqual(curves(2, 1));
  });

  for (const w of WORLDS) {
    it(`world ${w.id} is a closed loop of the configured length within curve limits`, () => {
      const t = generateTrack(w.id, 4242);
      const n = t.segments.length;
      expect(n).toBeGreaterThanOrEqual(w.lapSegments - 10);
      expect(n).toBeLessThan(w.lapSegments + 400);
      expect(t.length).toBe(n * SEG_LENGTH);
      expect(t.segments[n - 1].p2.world.y).toBe(0);
      expect(Math.abs(t.segments[0].p1.world.y)).toBe(0);
      expect(t.segments[0].finish).toBe(true);
      expect(Math.max(...t.segments.map((s) => Math.abs(s.curve)))).toBeLessThanOrEqual(w.curveMax + 1e-9);
      expect(t.line).toHaveLength(n);
      expect(Math.max(...t.line.map(Math.abs))).toBeLessThanOrEqual(0.6);
    });

    it(`world ${w.id}: API lap-time floor is below what the game physics can reach`, () => {
      const fastest = ((w.lapSegments * SEG_LENGTH) / (w.maxSpeed * MAX_KART_SPEED * 1.38)) * 1000; // fastest kart, permanent boost, no corners
      expect(MIN_LAP_MS[w.id]).toBeLessThan(fastest);
      expect(MIN_LAP_MS[w.id]).toBeGreaterThan(fastest * 0.8);
    });
  }

  it('places item boxes in rows of three, deterministically', () => {
    const rows = (seed: number) => generateTrack(1, seed).segments.filter((x) => x.boxes).map((x) => x.index);
    expect(rows(5).length).toBeGreaterThan(4);
    expect(rows(5)).toEqual(rows(5));
    expect(generateTrack(1, 5).segments.find((x) => x.boxes)!.boxes).toEqual([-0.55, 0, 0.55]);
  });

  it('only the narrow worlds have falls, and hazards match the world theme', () => {
    const count = (w: number, k: 'hazard' | 'pad') => generateTrack(w, 7).segments.filter((s) => s[k]).length;
    expect(count(1, 'hazard')).toBe(0);
    expect(count(2, 'hazard')).toBeGreaterThan(5);
    expect(count(3, 'hazard')).toBeGreaterThan(5);
    expect(count(1, 'pad')).toBeGreaterThan(5);
    expect(WORLDS.map((w) => w.fallOff)).toEqual([false, true, true, false, true]);
    expect(count(4, 'hazard')).toBeGreaterThan(5); // traffic barrels
    expect(count(5, 'hazard')).toBeGreaterThan(5); // barriers on the storm pass
  });
});
