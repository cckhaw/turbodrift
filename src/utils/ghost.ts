/** Best-lap ghost per world+seed: the player's path sampled every GHOST_DT seconds. */
export const GHOST_DT = 0.1;

export interface Ghost {
  lapMs: number;
  d: number[]; // distance into the lap (world units)
  x: number[]; // lateral position
}

const key = (world: number, seed: number) => `turbodrift.ghost.v1.${world}.${seed}`;

export function loadGhost(world: number, seed: number): Ghost | null {
  try {
    const g = JSON.parse(localStorage.getItem(key(world, seed)) || 'null');
    return g && Array.isArray(g.d) && g.d.length > 5 ? g : null;
  } catch {
    return null;
  }
}

export function saveGhost(world: number, seed: number, g: Ghost): void {
  try {
    localStorage.setItem(key(world, seed), JSON.stringify({ lapMs: g.lapMs, d: g.d.map(Math.round), x: g.x.map((v) => Math.round(v * 100) / 100) }));
  } catch {
    /* storage full or blocked: ghost is a nicety */
  }
}

/** Interpolated position at `t` seconds into the lap; holds the last sample after the ghost's lap ends. */
export function ghostAt(g: Ghost, t: number): { d: number; x: number } {
  const f = Math.max(0, t) / GHOST_DT;
  const i = Math.floor(f);
  if (i >= g.d.length - 1) return { d: g.d[g.d.length - 1], x: g.x[g.x.length - 1] };
  const p = f - i;
  return { d: g.d[i] + (g.d[i + 1] - g.d[i]) * p, x: g.x[i] + (g.x[i + 1] - g.x[i]) * p };
}
