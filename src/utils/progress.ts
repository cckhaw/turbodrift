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

export function saveProgress(p: Progress): Progress {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
  return p;
}

/** Progress only moves forward: highest unlock, best finish per world. */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const medals: Record<number, number> = { ...a.medals };
  for (const [k, v] of Object.entries(b.medals)) medals[Number(k)] = Math.min(medals[Number(k)] ?? 99, v);
  return { unlocked: Math.max(a.unlocked, b.unlocked), medals };
}

export function resetProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
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
