import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Replay } from '../src/game/replay';

const replay: Replay = { v: 1, world: 1, seed: 5, kart: 'comet', steps: 100, data: 'AAAA' };
const entry = { name: 'Tester', lapMs: 40000, totalMs: 125000, world: 1, seed: 5 };

let store: Map<string, string>;
let calls: { url: string; body: unknown }[];
let responses: (number | 'network')[];

async function load() {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE', 'http://api.test');
  return import('../src/utils/leaderboard');
}

const queued = () => JSON.parse(store.get('turbodrift.pending.v1') ?? '[]') as unknown[];

beforeEach(() => {
  store = new Map();
  calls = [];
  responses = [];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    const next = responses.shift() ?? 200;
    if (next === 'network') throw new TypeError('Failed to fetch');
    return { ok: next < 400, status: next, json: async () => ({}) };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('score submission queue', () => {
  it('queues a time trial that fails to send (offline) and delivers it later, exactly once', async () => {
    const L = await load();
    responses = ['network'];
    await L.saveScore(entry, replay);
    expect(queued()).toHaveLength(1);
    expect(calls).toHaveLength(1);
    await L.flushPending(); // back online
    expect(calls).toHaveLength(2);
    expect(queued()).toHaveLength(0);
    await L.flushPending();
    expect(calls).toHaveLength(2); // nothing left to send
  });

  it('sends the replay, never a client-claimed time', async () => {
    const L = await load();
    await L.saveScore(entry, replay);
    const body = calls[0].body as Record<string, unknown>;
    expect(body.replay).toEqual(replay);
    expect(body).not.toHaveProperty('lapMs');
    expect(body).not.toHaveProperty('totalMs');
    expect(calls[0].url).toBe('http://api.test/api/score');
  });

  it.each([
    [503, true],
    [429, true],
    [500, true],
    [400, false],
    [404, false],
  ])('server answer %i keeps the entry queued: %s', async (status, kept) => {
    const L = await load();
    responses = [status];
    await L.saveScore(entry, replay);
    expect(queued()).toHaveLength(kept ? 1 : 0);
  });

  it('keeps local records for every run, but queues only runs that have a replay (time trials)', async () => {
    const L = await load();
    await L.saveScore(entry); // a race
    expect(calls).toHaveLength(0);
    expect(L.bestLocalLap(1, 5)).toBe(40000);
  });

  it('stops at the first retryable failure and preserves order', async () => {
    const L = await load();
    responses = ['network', 'network'];
    await L.saveScore({ ...entry, name: 'A' }, replay);
    await L.saveScore({ ...entry, name: 'B' }, replay);
    expect((queued() as { name: string }[]).map((e) => e.name)).toEqual(['A', 'B']);
    responses = [];
    calls = [];
    await L.flushPending();
    expect((calls.map((c) => (c.body as { name: string }).name))).toEqual(['A', 'B']);
    expect(queued()).toHaveLength(0);
  });

  it('regression: an empty-queue flush at app start must not block later submissions', async () => {
    const L = await load();
    await L.flushPending(); // what App does on launch, with nothing queued
    await L.flushPending();
    await L.saveScore(entry, replay); // the player finishes a time trial
    expect(calls).toHaveLength(1);
    expect(queued()).toHaveLength(0);
    responses = ['network'];
    await L.saveScore({ ...entry, name: 'B' }, replay);
    expect(queued()).toHaveLength(1);
    await L.flushPending();
    expect(queued()).toHaveLength(0);
  });

  it('concurrent flushes send each entry once', async () => {
    const L = await load();
    responses = ['network'];
    await L.saveScore(entry, replay);
    calls = [];
    await Promise.all([L.flushPending(), L.flushPending(), L.flushPending()]);
    expect(calls).toHaveLength(1);
  });

  it('drops entries older than a week', async () => {
    const L = await load();
    store.set('turbodrift.pending.v1', JSON.stringify([{ id: 'old', name: 'x', replay, at: Date.now() - 8 * 86400000 }]));
    await L.flushPending();
    expect(calls).toHaveLength(0);
  });

  it('flushes when the browser comes back online', async () => {
    const L = await load();
    responses = ['network'];
    await L.saveScore(entry, replay);
    const listeners: Record<string, () => void> = {};
    vi.stubGlobal('window', { addEventListener: (n: string, f: () => void) => (listeners[n] = f), removeEventListener: () => {} });
    L.watchConnectivity();
    calls = [];
    listeners.online();
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toHaveLength(1);
    expect(queued()).toHaveLength(0);
  });
});
