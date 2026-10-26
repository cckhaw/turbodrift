import { hashSeed } from './rng';

/** One shared track per UTC day: same world + seed for everyone, so the leaderboard for that seed *is* the daily board. */
export interface Daily {
  date: string; // YYYY-MM-DD (UTC)
  world: number;
  seed: number;
}

const KEY = 'turbodrift.daily.v1';
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export function dailyFor(now: Date = new Date()): Daily {
  const date = dayKey(now);
  const dayIndex = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000);
  return { date, world: 1 + (dayIndex % 3), seed: 100000 + (hashSeed(dayIndex, 20251) % 899999) };
}

export const msUntilNextDaily = (now: Date = new Date()): number =>
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();

export function formatCountdown(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export const isDaily = (d: Daily, world: number, seed: number): boolean => d.world === world && d.seed === seed;

export function mergeDays(days: string[]): string[] {
  const merged = Array.from(new Set([...load(), ...days])).sort().slice(-90);
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
  return merged;
}

export const loadDays = (): string[] => load();

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Remember that today's daily was completed. */
export function recordDaily(date: string): string[] {
  const days = Array.from(new Set([...load(), date])).sort().slice(-90);
  try {
    localStorage.setItem(KEY, JSON.stringify(days));
  } catch {
    /* ignore */
  }
  return days;
}

export const dailyDone = (date: string): boolean => load().includes(date);

/** Consecutive completed days ending today (or yesterday, so the streak isn't shown as broken until the day is missed). */
export function dailyStreak(now: Date = new Date(), days: string[] = load()): number {
  const set = new Set(days);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!set.has(dayKey(d))) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (set.has(dayKey(d))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}
