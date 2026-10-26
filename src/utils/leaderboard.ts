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

export interface Board {
  rows: ScoreEntry[];
  source: 'global' | 'offline' | 'local';
}

export const globalEnabled = (): boolean => import.meta.env.PROD || Boolean(API);

const KEY = 'turbodrift.scores.v1';
const NAME_KEY = 'turbodrift.name';
const CLIENT_KEY = 'turbodrift.client';
const PENDING_KEY = 'turbodrift.pending.v1';
/** Same-origin Vercel functions in production; set VITE_API_BASE to hit a deployed API from `npm run dev`. */
const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

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

const clientId = (): string => {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return '00000000-0000-4000-8000-000000000000';
  }
};

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(`${API}${path}`, { ...init, signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...init.headers } });
    if (!res.ok) throw new Error(`${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

type Pending = { name: string; lapMs: number; totalMs: number; world: number; seed: number };

const readPending = (): Pending[] => {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
  } catch {
    return [];
  }
};
const writePending = (p: Pending[]) => {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(p.slice(-30)));
  } catch {
    /* ignore */
  }
};

async function submitRemote(e: Pending): Promise<void> {
  await api('/api/score', {
    method: 'POST',
    body: JSON.stringify({ clientId: clientId(), name: e.name, world: e.world, seed: e.seed, lapMs: Math.round(e.lapMs), totalMs: Math.round(e.totalMs) }),
  });
}

/** Retry anything that failed earlier (offline, 5xx). Rejections by the server (4xx) are dropped. */
export async function flushPending(): Promise<void> {
  if (!globalEnabled()) return;
  const queue = readPending();
  const keep: Pending[] = [];
  for (const e of queue) {
    try {
      await submitRemote(e);
    } catch (err) {
      const code = parseInt((err as Error).message, 10);
      if (!(code >= 400 && code < 500)) keep.push(e);
    }
  }
  writePending(keep);
}

/** Your own best lap on a track, from this device. */
export function bestLocalLap(world: number, seed: number): number | null {
  const laps = loadLocal().filter((s) => s.world === world && s.seed === seed).map((s) => s.lapMs);
  return laps.length ? Math.min(...laps) : null;
}

export async function saveScore(e: Omit<ScoreEntry, 'you' | 'at'>): Promise<void> {
  const all = loadLocal();
  all.push({ ...e, you: true, at: Date.now() });
  try {
    localStorage.setItem(KEY, JSON.stringify(all.sort((a, b) => a.lapMs - b.lapMs).slice(0, 200)));
  } catch {
    /* ignore */
  }
  if (!globalEnabled()) return;
  writePending([...readPending(), { name: e.name, lapMs: e.lapMs, totalMs: e.totalMs, world: e.world, seed: e.seed }]);
  await flushPending();
}

async function fetchGlobal(world: number, seed: number | null): Promise<ScoreEntry[]> {
  const rows = (await (await api(`/api/leaderboard?world=${world}${seed != null ? `&seed=${seed}` : ''}`)).json()) as { name: string; lap_ms: number; total_ms: number; world: number; seed: number }[];
  return rows.map((r) => ({ name: r.name, lapMs: r.lap_ms, totalMs: r.total_ms, world: r.world, seed: r.seed }));
}

/** seed === null → best across every seed in the world. */
export async function getBoard(world: number, seed: number | null): Promise<Board> {
  const mine = loadLocal().filter((s) => s.world === world && (seed == null || s.seed === seed));
  if (globalEnabled()) {
    try {
      void flushPending();
      const rows = await fetchGlobal(world, seed);
      // mark my own rows (the public view carries no client id): same name + same lap time as a local score
      for (const r of rows) r.you = mine.some((m) => m.name === r.name && Math.round(m.lapMs) === r.lapMs);
      return { rows, source: 'global' };
    } catch {
      /* fall through to the offline board */
    }
  }
  const rows = [...mine, ...mockGlobal(world, seed ?? 0)].sort((a, b) => a.lapMs - b.lapMs).slice(0, 25);
  return { rows, source: globalEnabled() ? 'offline' : 'local' };
}
