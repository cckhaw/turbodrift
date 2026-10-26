import { describe, expect, it } from 'vitest';
import { Rng, hashSeed } from '../src/utils/rng';

describe('Rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = new Rng(98765);
    const b = new Rng(98765);
    const seqA = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(seqA);
    const c = new Rng(98766);
    expect(Array.from({ length: 20 }, () => c.next())).not.toEqual(seqA);
  });

  it('stays in range', () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it('hashSeed mixes inputs', () => {
    expect(hashSeed(1, 2, 3)).toBe(hashSeed(1, 2, 3));
    expect(hashSeed(1, 2, 3)).not.toBe(hashSeed(3, 2, 1));
  });
});
