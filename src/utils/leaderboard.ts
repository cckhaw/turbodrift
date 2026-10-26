import { WORLDS } from '../game/worlds';
import { Rng, hashSeed } from './rng';

export interface ScoreEntry {
  name: string;
  lapMs: number;
  totalMs: number;
  world: number;
  seed: number;
  you?: boolean;
  at?: number;
}

const KEY = 'turbodrift.scores.v1';
const NAME_KEY = 'turbodrift.name';
const SB_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const GHOSTS = ['VoltRunner', 'NightDrift', 'PixelRacer', 'ApexKid', 'SynthWolf', 'RubberBurn', 'HaloGT', 'Kira-9', 'TurboToast', 'LaserLine', 'Zenith', 'DriftMonk', 'Hyperion', 'MochiMax'];

export const getPlayerName = (): string => {
  try {
    return localStorage.getItem(NAME_KEY) || 'YOU';
  } catch {
    return 'YOU';
  }
};
export const setPlayerName = (n: string): void => {
  try {
    localStorage.setItem(NAME_KEY, n.trim().slice(0, 12) || 'YOU');
  } catch {
    /* ignore */
  }
};

function loadLocal(): ScoreEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

/** Deterministic stand-in for a global board so every challenge link has rivals to chase. */
function mockGlobal(world: number, seed: number): ScoreEntry[] {
  const w = WORLDS[world - 1];
  const rng = new Rng(hashSeed(world, seed, 7));
  const base = (w.lapSegments * 200) / (w.maxSpeed * 0.86);
  return Array.from({ length: 12 }, (_, i) => {
    const lap = base * (1 + i * 0.035 + rng.range(0, 0.025)) * 1000;
    return { name: GHOSTS[(i * 5 + rng.int(0, 4)) % GHOSTS.length], lapMs: lap, totalMs: lap * 3 + rng.range(500, 2500), world, seed };
  });
}

export async function saveScore(e: Omit<ScoreEntry, 'you' | 'at'>): Promise<void> {
  const all = loadLocal();
  all.push({ ...e, you: true, at: Date.now() });
  try {
    localStorage.setItem(KEY, JSON.stringify(all.sort((a, b) => a.lapMs - b.lapMs).slice(0, 200)));
  } catch {
    /* ignore */
  }
  if (SB_URL && SB_KEY) {
    try {
      await fetch(`${SB_URL}/rest/v1/scores`, {
        method: 'POST',
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: e.name, lap_ms: Math.round(e.lapMs), total_ms: Math.round(e.totalMs), world: e.world, seed: e.seed }),
      });
    } catch {
      /* offline: local copy is enough */
    }
  }
}

async function fetchRemote(world: number, seed: number | null): Promise<ScoreEntry[]> {
  if (!SB_URL || !SB_KEY) return [];
  try {
    const q = `world=eq.${world}${seed != null ? `&seed=eq.${seed}` : ''}&order=lap_ms.asc&limit=25`;
    const res = await fetch(`${SB_URL}/rest/v1/scores?${q}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    const rows = (await res.json()) as { name: string; lap_ms: number; total_ms: number; world: number; seed: number }[];
    return rows.map((r) => ({ name: r.name, lapMs: r.lap_ms, totalMs: r.total_ms, world: r.world, seed: r.seed }));
  } catch {
    return [];
  }
}

/** seed === null → best across every seed in the world. */
export async function getBoard(world: number, seed: number | null): Promise<ScoreEntry[]> {
  const local = loadLocal().filter((s) => s.world === world && (seed == null || s.seed === seed));
  const remote = await fetchRemote(world, seed);
  const ghosts = mockGlobal(world, seed ?? 0);
  return [...local, ...remote, ...ghosts].sort((a, b) => a.lapMs - b.lapMs).slice(0, 25);
}
