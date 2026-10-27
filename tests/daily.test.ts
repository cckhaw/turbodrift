import { describe, expect, it } from 'vitest';
import { DAILY_WORLDS, dailyFor, dailyStreak, formatCountdown, msUntilNextDaily } from '../src/utils/daily';
import { WORLDS } from '../src/game/worlds';

const at = (iso: string) => new Date(iso);

describe('daily challenge', () => {
  it('is the same for everyone on a UTC day and changes at midnight UTC', () => {
    const a = dailyFor(at('2026-10-26T00:00:01Z'));
    const b = dailyFor(at('2026-10-26T23:59:59Z'));
    expect(b).toEqual(a);
    expect(dailyFor(at('2026-10-27T00:00:00Z')).date).toBe('2026-10-27');
    expect(dailyFor(at('2026-10-27T00:00:00Z')).seed).not.toBe(a.seed);
  });

  it('always yields a valid world and a seed the API accepts', () => {
    const worlds = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const d = dailyFor(new Date(Date.UTC(2026, 0, 1 + i)));
      worlds.add(d.world);
      expect(d.world).toBeGreaterThanOrEqual(1);
      expect(d.world).toBeLessThanOrEqual(DAILY_WORLDS);
      expect(Number.isInteger(d.seed) && d.seed >= 1 && d.seed <= 999999999).toBe(true);
    }
    expect(worlds.size).toBe(DAILY_WORLDS); // rotates through every world that is open to everyone
    expect(DAILY_WORLDS).toBe(WORLDS.filter((w) => w.difficulty !== 'God').length); // the god-level world is not a daily
  });

  it('counts down to the next UTC midnight', () => {
    expect(msUntilNextDaily(at('2026-10-26T22:30:00Z'))).toBe(90 * 60000);
    expect(formatCountdown(90 * 60000)).toBe('1h 30m');
    expect(formatCountdown(5 * 60000)).toBe('0h 05m');
    expect(formatCountdown(-5)).toBe('0h 00m');
  });

  it('streaks count consecutive days, survive an unplayed today, and break after a missed day', () => {
    const now = at('2026-10-26T12:00:00Z');
    expect(dailyStreak(now, [])).toBe(0);
    expect(dailyStreak(now, ['2026-10-26'])).toBe(1);
    expect(dailyStreak(now, ['2026-10-24', '2026-10-25', '2026-10-26'])).toBe(3);
    expect(dailyStreak(now, ['2026-10-24', '2026-10-25'])).toBe(2); // today not played yet
    expect(dailyStreak(now, ['2026-10-23', '2026-10-24'])).toBe(0); // missed yesterday
    expect(dailyStreak(now, ['2026-10-20', '2026-10-25', '2026-10-26'])).toBe(2);
  });
});
