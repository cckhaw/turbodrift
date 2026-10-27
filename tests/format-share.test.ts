import { describe, expect, it } from 'vitest';
import { formatTime, ordinal } from '../src/utils/format';
import type { RaceResult } from '../src/game/types';

// share.ts reads window.location; give it a stub before importing
(globalThis as unknown as { window: unknown }).window = { location: { href: 'https://turbodrift.example/?x=1#h' } };
const { scorecardText, challengeUrl } = await import('../src/utils/share');

describe('format', () => {
  it('formats times and ordinals', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(65432)).toBe('1:05.43');
    expect(formatTime(null)).toBe('--:--.--');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});

describe('share', () => {
  const result: RaceResult = {
    mode: 'race',
    laps: 3,
    kart: 'comet',
    world: 2,
    seed: 98765,
    position: 2,
    total: 6,
    lapTimes: [50000, 48000, 47500],
    lapPositions: [4, 3, 2],
    bestLap: 47500,
    totalTime: 145500,
    standings: [],
  };

  it('builds a clean challenge url', () => {
    expect(challengeUrl(2, 98765)).toBe('https://turbodrift.example/?world=2&seed=98765');
  });

  it('builds the emoji race matrix with the link', () => {
    const text = scorecardText(result);
    expect(text).toContain('🥈 Turbo Drift: Neon Circuit');
    expect(text).toContain('Cyber Stratosphere · Seed 98765');
    expect(text).toContain('2nd of 6 · 2:25.50 · Best lap 0:47.50');
    expect(text).toContain('L1 ⬜⬜⬜🟦⬛⬛ 0:50.00');
    expect(text).toContain('L3 ⬜🟥⬛⬛⬛⬛ 0:47.50');
    expect(text.endsWith('https://turbodrift.example/?world=2&seed=98765')).toBe(true);
  });
});
