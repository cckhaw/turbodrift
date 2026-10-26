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

export const globalEnabled = (): boolean => Boolean(SB_URL && SB_KEY);

const KEY = 'turbodrift.scores.v1';
const NAME_KEY = 'turbodrift.name';
const CLIENT_KEY = 'turbodrift.client';
const PENDING_KEY = 'turbodrift.pending.v1';
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

async function sb(path: string, init: RequestInit = {}): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(`${SB_URL}${path}`, {
      ...init,
      signal: ctl.signal,
      headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...init.headers },
    });
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
  await sb('/rest/v1/rpc/submit_score', {
    method: 'POST',
    body: JSON.stringify({ p_client: clientId(), p_name: e.name, p_world: e.world, p_seed: e.seed, p_lap_ms: Math.round(e.lapMs), p_total_ms: Math.round(e.totalMs) }),
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
  const q = `world=eq.${world}${seed != null ? `&seed=eq.${seed}` : ''}&order=lap_ms.asc&limit=25&select=name,lap_ms,total_ms,world,seed`;
  const rows = (await (await sb(`/rest/v1/leaderboard?${q}`)).json()) as { name: string; lap_ms: number; total_ms: number; world: number; seed: number }[];
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
