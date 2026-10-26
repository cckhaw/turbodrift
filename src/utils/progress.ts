const KEY = 'turbodrift.progress.v1';

export interface Progress {
  unlocked: number; // highest unlocked world
  medals: Record<number, number>; // world -> best finishing place
}

export function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (p && typeof p.unlocked === 'number') return p;
  } catch {
    /* ignore */
  }
  return { unlocked: 1, medals: {} };
}

/** Podium (top 3) in a world unlocks the next one. */
export function recordFinish(world: number, place: number): Progress {
  const p = loadProgress();
  p.medals[world] = Math.min(p.medals[world] ?? 99, place);
  if (place <= 3) p.unlocked = Math.max(p.unlocked, Math.min(3, world + 1));
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
  return p;
}
