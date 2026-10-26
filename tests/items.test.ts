import { describe, expect, it } from 'vitest';
import { rollItem, type Item } from '../src/game/items';
import { KARTS, kartById } from '../src/game/karts';
import { Rng } from '../src/utils/rng';

function histogram(rank: number, total = 6, n = 4000) {
  const rng = new Rng(7);
  const h: Record<Item, number> = { turbo: 0, shield: 0, oil: 0, missile: 0 };
  for (let i = 0; i < n; i++) h[rollItem(rng, rank, total)]++;
  return h;
}

describe('items', () => {
  it('rolls every item type and is deterministic for a seed', () => {
    const a = new Rng(3);
    const b = new Rng(3);
    expect(Array.from({ length: 30 }, () => rollItem(a, 3, 6))).toEqual(Array.from({ length: 30 }, () => rollItem(b, 3, 6)));
    const h = histogram(3);
    expect(Object.values(h).every((v) => v > 0)).toBe(true);
  });

  it('rubber-bands: leaders get defence, the back gets turbo and missiles', () => {
    const lead = histogram(1);
    const last = histogram(6);
    expect(lead.shield + lead.oil).toBeGreaterThan(last.shield + last.oil);
    expect(last.turbo + last.missile).toBeGreaterThan(lead.turbo + lead.missile);
  });

  it('works for a solo racer', () => {
    expect(['turbo', 'shield', 'oil', 'missile']).toContain(rollItem(new Rng(1), 1, 1));
  });
});

describe('karts', () => {
  it('has distinct trade-offs and a safe fallback', () => {
    expect(new Set(KARTS.map((k) => k.id)).size).toBe(KARTS.length);
    expect(kartById('nope')).toBe(KARTS[0]);
    expect(kartById('rocket').speed).toBeGreaterThan(kartById('comet').speed);
    expect(kartById('phantom').drift).toBeGreaterThan(kartById('comet').drift);
    for (const k of KARTS) expect(k.speed).toBeLessThanOrEqual(1.1);
  });
});
