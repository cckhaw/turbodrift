import { Engine } from './engine.js';
import { KARTS } from './karts.js';
import { MAX_REPLAY_STEPS, decodeRuns } from './replay.js';
import { LAPS, WORLDS } from './worlds.js';

/**
 * Server-side replay verification. Re-runs the real game engine headlessly with the recorded inputs and
 * reports the times the *simulation* produced, so the client's claimed time is never trusted.
 */
export type Verified = { ok: true; world: number; seed: number; kart: string; lapMs: number; totalMs: number; lapTimes: number[] } | { ok: false; error: string };

const noop: unknown = new Proxy(function () {}, { get: () => noop, apply: () => noop });

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

export function verifyReplay(input: unknown): Verified {
  const r = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (r.v !== 1) return { ok: false, error: 'unsupported replay' };
  const { world, seed, kart, steps, data } = r;
  if (!isInt(world) || world < 1 || world > WORLDS.length) return { ok: false, error: 'unknown world' };
  if (!isInt(seed) || seed < 1 || seed > 999999999) return { ok: false, error: 'bad seed' };
  if (typeof kart !== 'string' || !KARTS.some((k) => k.id === kart)) return { ok: false, error: 'unknown kart' };
  if (!isInt(steps) || steps < 60 || steps > MAX_REPLAY_STEPS) return { ok: false, error: 'bad replay length' };
  if (typeof data !== 'string' || data.length > 300_000) return { ok: false, error: 'bad replay data' };
  const runs = decodeRuns(data);
  if (!runs) return { ok: false, error: 'corrupt replay' };
  if (runs.reduce((n, x) => n + x.steps, 0) !== steps) return { ok: false, error: 'replay length mismatch' };

  const canvas = { getContext: () => noop, clientWidth: 390, clientHeight: 844, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  const engine = new Engine({ canvas, world, seed, mode: 'trial', kart, onHud: () => {}, onFinish: () => {} });
  const result = engine.runReplay(runs, steps + 120);
  if (!result || result.lapTimes.length !== LAPS) return { ok: false, error: 'replay does not finish the race' };
  return { ok: true, world, seed, kart, lapMs: Math.round(result.bestLap), totalMs: Math.round(result.totalTime), lapTimes: result.lapTimes.map(Math.round) };
}
