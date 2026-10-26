import type { Rng } from '../utils/rng.js';

export type Item = 'turbo' | 'shield' | 'oil' | 'missile';

export const ITEM_INFO: Record<Item, { emoji: string; label: string }> = {
  turbo: { emoji: '🚀', label: 'Turbo' },
  shield: { emoji: '🛡️', label: 'Shield' },
  oil: { emoji: '🛢️', label: 'Oil slick' },
  missile: { emoji: '🎯', label: 'Missile' },
};

/** Rank 1 = leader. Leaders get defensive items, the pack gets attacks, the back gets catch-up turbos. */
const WEIGHTS: Record<Item, [number, number]> = {
  // [leader, last]
  turbo: [1, 5],
  shield: [4, 1],
  oil: [4, 0.5],
  missile: [1, 4],
};

export function rollItem(rng: Rng, rank: number, total: number): Item {
  const t = total <= 1 ? 0 : (rank - 1) / (total - 1);
  const entries = (Object.keys(WEIGHTS) as Item[]).map((k) => [k, WEIGHTS[k][0] + (WEIGHTS[k][1] - WEIGHTS[k][0]) * t] as const);
  let roll = rng.next() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) {
    roll -= w;
    if (roll <= 0) return k;
  }
  return 'turbo';
}

export const BOX_OFFSETS = [-0.55, 0, 0.55];
export const BOX_RESPAWN = 5; // seconds
export const SHIELD_TIME = 7;
export const SPIN_TIME = 1;
export const OIL_LIFE = 14;
