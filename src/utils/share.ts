import { WORLDS } from '../game/worlds';
import type { RaceResult } from '../game/types';
import { formatTime, ordinal } from './format';

export function challengeUrl(world: number, seed: number): string {
  const u = new URL(window.location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('world', String(world));
  u.searchParams.set('seed', String(seed));
  return u.toString();
}

/** Emoji race matrix: one row per lap, ⬜ = karts ahead, 🟦 = you, ⬛ = karts behind. */
export function scorecardText(r: RaceResult): string {
  const w = WORLDS[r.world - 1];
  if (r.mode === 'trial') {
    return [
      '⏱️ Turbo Drift: Neon Circuit · Time Trial',
      `${w.emoji} ${w.name} · Seed ${r.seed}`,
      `${formatTime(r.totalTime)} · Best lap ${formatTime(r.bestLap)}`,
      ...r.lapTimes.map((t, i) => `L${i + 1} ${formatTime(t)}`),
      `Beat my lap 👉 ${challengeUrl(r.world, r.seed)}`,
    ].join('\n');
  }
  const rows = r.lapPositions.map((p, i) => {
    const cells = Array.from({ length: r.total }, (_, k) => (k + 1 < p ? '⬜' : k + 1 === p ? (i === r.lapPositions.length - 1 ? '🟥' : '🟦') : '⬛'));
    return `L${i + 1} ${cells.join('')} ${formatTime(r.lapTimes[i])}`;
  });
  const medal = r.position === 1 ? '🥇' : r.position === 2 ? '🥈' : r.position === 3 ? '🥉' : '🏁';
  return [
    `${medal} Turbo Drift: Neon Circuit`,
    `${w.emoji} ${w.name} · Seed ${r.seed}`,
    `${ordinal(r.position)} of ${r.total} · ${formatTime(r.totalTime)} · Best lap ${formatTime(r.bestLap)}`,
    ...rows,
    `Beat me 👉 ${challengeUrl(r.world, r.seed)}`,
  ].join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
