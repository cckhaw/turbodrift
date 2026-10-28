import type { Replay } from '../game/replay';
import { WORLDS } from '../game/worlds';
import { Rng, hashSeed } from './rng';
import { api, globalEnabled } from './api';

export interface ScoreEntry {
  name: string;
  lapMs: number;
  totalMs: number;
  world: number;
  seed: number;
  /** which board it counts for; older local entries are time trials */
  mode?: 'race' | 'trial';
  /** laps in the run (1, 2 or 3); older local entries are 3-lap runs */
  laps?: number;
  /** a bot that fills an empty board; never sent to or from the server */
  bot?: boolean;
  you?: boolean;
  at?: number;
}

export interface Board {
  rows: ScoreEntry[];
  source: 'global' | 'offline' | 'local';
}

export type BoardMode = 'race' | 'trial';

export { globalEnabled };

const KEY = 'turbodrift.scores.v1';
const NAME_KEY = 'turbodrift.name';
const CLIENT_KEY = 'turbodrift.client';
const PENDING_KEY = 'turbodrift.pending.v1';

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

/** Names for the bots that fill an empty board. */
const BOT_POOL = ['CyberBot-01', 'NeonViper', 'GlitchRider', 'ByteBlaze', 'ChromeFang', 'PulseNova', 'VoltRunner', 'NightDrift', 'PixelRacer', 'ApexKid', 'SynthWolf', 'RubberBurn', 'HaloGT', 'Kira-9', 'TurboToast', 'LaserLine', 'Zenith', 'DriftMonk', 'Hyperion', 'MochiMax'];

/** Rows a board is padded to with bots, so a new track or an empty world still has rivals to chase. */
export const BOARD_FILL = 15;

/**
 * Deterministic bot scores for a board (same world, seed, mode and laps always give the same rows), from a quick
 * lap down to a gentle one. They are marked `bot` so the UI can label them and they never reach the server.
 * `seed === null` is the world-best board, where each bot "set" its time on a different seed.
 */
export function botScores(world: number, seed: number | null, mode: BoardMode, laps: number, count: number): ScoreEntry[] {
  const w = WORLDS[world - 1];
  const rng = new Rng(hashSeed(world, seed ?? 0, mode === 'race' ? 71 : 7, laps));
  const par = (w.lapSegments * 200) / (w.maxSpeed * 0.86); // seconds for a tidy lap
  const pool = [...BOT_POOL];
  return Array.from({ length: count }, (_, i) => {
    const lap = par * (1.02 + i * 0.04 + rng.range(0, 0.025)) * 1000;
    const name = pool.splice(rng.int(0, pool.length - 1), 1)[0] ?? `Bot-${i + 1}`;
    return { name, lapMs: Math.round(lap), totalMs: Math.round(lap * laps + rng.range(300, 2500)), world, seed: seed ?? 10000 + rng.int(0, 989999), mode, laps, bot: true };
  });
}

/** Real rows plus however many bots it takes to reach BOARD_FILL, fastest total race time first. */
export function withBots(rows: ScoreEntry[], world: number, seed: number | null, mode: BoardMode, laps: number): ScoreEntry[] {
  const filler = botScores(world, seed, mode, laps, Math.max(0, BOARD_FILL - rows.length));
  return [...rows, ...filler].sort((a, b) => a.totalMs - b.totalMs).slice(0, 25);
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

/** A verified race or time-trial submission waiting to be sent. Kept until the server accepts or definitively rejects it. */
interface Pending {
  id: string;
  name: string;
  replay: Replay;
  at: number;
}

const MAX_PENDING = 10;
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const readPending = (): Pending[] => {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    return Array.isArray(v) ? v.filter((e) => e && e.replay && Date.now() - e.at < MAX_AGE_MS) : [];
  } catch {
    return [];
  }
};
const writePending = (p: Pending[]) => {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(p.slice(-MAX_PENDING)));
  } catch {
    /* storage full: drop the oldest and try once more */
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(p.slice(-3)));
    } catch {
      /* ignore */
    }
  }
};

async function submitRemote(e: Pending): Promise<void> {
  await api('/api/score', { method: 'POST', body: JSON.stringify({ clientId: clientId(), name: e.name, replay: e.replay }) });
}

/** Network failures, 5xx and 429 (throttled) are worth retrying; any other 4xx means the server rejected it for good. */
export function isRetryable(err: unknown): boolean {
  const code = parseInt((err as Error)?.message, 10);
  return !(code >= 400 && code < 500 && code !== 429);
}

let flushing: Promise<void> | null = null;

/** Send everything queued. Safe to call from several places at once. */
export function flushPending(): Promise<void> {
  if (!globalEnabled()) return Promise.resolve();
  if (flushing) return flushing;
  // With an empty queue the async body below finishes synchronously, so the lock has to be released from a
  // callback attached *after* `flushing` is assigned (a `finally` inside the body would run too early and
  // leave a stale, already-resolved promise in `flushing` forever).
  const run = (async () => {
    const queue = readPending();
    const keep: Pending[] = [];
    let blocked = false;
    for (const e of queue) {
      if (blocked) {
        keep.push(e);
        continue;
      }
      try {
        await submitRemote(e);
      } catch (err) {
        if (isRetryable(err)) {
          keep.push(e);
          blocked = true; // offline or throttled: stop and try again later, preserving order
        }
      }
    }
    // keep entries queued while we were sending
    const sent = new Set(queue.map((q) => q.id));
    writePending([...keep, ...readPending().filter((q) => !sent.has(q.id))]);
  })();
  flushing = run;
  const release = () => {
    if (flushing === run) flushing = null;
  };
  run.then(release, release);
  return run;
}

/** Retry when the browser comes back online. */
export function watchConnectivity(): () => void {
  if (typeof window === 'undefined') return () => {};
  const on = () => void flushPending();
  window.addEventListener('online', on);
  return () => window.removeEventListener('online', on);
}

/** Your own best lap on a track, from this device. */
export function bestLocalLap(world: number, seed: number): number | null {
  const laps = loadLocal().filter((s) => s.world === world && s.seed === seed).map((s) => s.lapMs);
  return laps.length ? Math.min(...laps) : null;
}

/**
 * Local records are kept for every run. Races and time trials that carry an input replay go to the global board (each
 * has its own), where the server re-simulates them (see api/score.ts).
 */
export async function saveScore(e: Omit<ScoreEntry, 'you' | 'at'>, replay?: Replay): Promise<void> {
  const all = loadLocal();
  all.push({ ...e, you: true, at: Date.now() });
  try {
    localStorage.setItem(KEY, JSON.stringify(all.sort((a, b) => a.lapMs - b.lapMs).slice(0, 200)));
  } catch {
    /* ignore */
  }
  if (!globalEnabled() || !replay) return;
  writePending([...readPending(), { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: e.name, replay, at: Date.now() }]);
  await flushPending();
}

async function fetchGlobal(world: number, seed: number | null, mode: BoardMode, laps: number): Promise<ScoreEntry[]> {
  const rows = (await (await api(`/api/leaderboard?world=${world}&mode=${mode}&laps=${laps}${seed != null ? `&seed=${seed}` : ''}`)).json()) as { name: string; lap_ms: number; total_ms: number; world: number; seed: number }[];
  return rows.map((r) => ({ name: r.name, lapMs: r.lap_ms, totalMs: r.total_ms, world: r.world, seed: r.seed }));
}

/** seed === null → best across every seed in the world. */
export async function getBoard(world: number, seed: number | null, mode: BoardMode = 'trial', laps = 3): Promise<Board> {
  const mine = loadLocal().filter((s) => s.world === world && (s.mode ?? 'trial') === mode && (s.laps ?? 3) === laps && (seed == null || s.seed === seed));
  if (globalEnabled()) {
    try {
      void flushPending();
      const rows = await fetchGlobal(world, seed, mode, laps);
      // mark my own rows (the public view carries no client id): same name + same total time as a local score
      for (const r of rows) r.you = mine.some((m) => m.name === r.name && Math.round(m.totalMs) === r.totalMs);
      return { rows: withBots(rows, world, seed, mode, laps), source: 'global' };
    } catch {
      /* fall through to the offline board */
    }
  }
  const rows = withBots(mine, world, seed, mode, laps);
  return { rows, source: globalEnabled() ? 'offline' : 'local' };
}
