import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { getBoard, submitScore, type Sql } from '../api/_core';
import { verifyReplay } from '../src/game/verify';
import type { Replay } from '../src/game/replay';
import { recordTrial } from './helpers/headless';

const db = new PGlite();
const sql: Sql = async (s, ...v) => {
  let text = s[0];
  for (let i = 0; i < v.length; i++) text += `$${i + 1}` + s[i + 1];
  return (await db.query(text, v as unknown[])).rows as never[];
};
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const age = () => db.query(`update scores set updated_at = now() - interval '1 hour'`);
const send = (body: Record<string, unknown>) => submitScore(sql, body, verifyReplay);

let good: { replay: Replay; lapMs: number; totalMs: number };
let fast: { replay: Replay; lapMs: number };

beforeAll(async () => {
  const a = await recordTrial(1, 5);
  good = { replay: a.replay, lapMs: Math.round(a.result.bestLap), totalMs: Math.round(a.result.totalTime) };
  // a different driver (weaves, so a slower run) on the same track
  const b = await recordTrial(1, 5, 'comet', (p, i) => (p.track.line[p.seg(p.player.dist + 1200).index] - p.player.x) * 3 + Math.sin(i / 25) * 0.4);
  fast = { replay: b.replay, lapMs: Math.round(b.result.bestLap) };
}, 120000);

describe('replay verification', () => {
  it('reproduces the client’s own result exactly from the recorded inputs', () => {
    const v = verifyReplay(good.replay);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.lapMs).toBe(good.lapMs);
      expect(v.totalMs).toBe(good.totalMs);
      expect(v.lapTimes).toHaveLength(3);
    }
  });

  it('different inputs give different (server-computed) times', () => {
    const v = verifyReplay(fast.replay);
    expect(v.ok && v.lapMs).toBe(fast.lapMs);
    expect(fast.lapMs).not.toBe(good.lapMs);
  });

  it('a tampered recording cannot claim the honest time: the server just plays it back', () => {
    // flip every steering byte's sign region: the replay now drives a different path
    const raw = Buffer.from(good.replay.data, 'base64');
    for (let i = 1; i < raw.length; i += 3) raw[i] = (raw[i] + 40) & 0xff;
    const v = verifyReplay({ ...good.replay, data: raw.toString('base64') });
    if (v.ok) expect(v.lapMs).not.toBe(good.lapMs);
    else expect(v.error).toBeTruthy();
  });

  it('a recording that never finishes the race is rejected', () => {
    const half = Buffer.from(good.replay.data, 'base64').subarray(0, 30);
    const v = verifyReplay({ ...good.replay, data: half.toString('base64'), steps: 600 });
    expect(v.ok).toBe(false);
  });

  it.each([
    ['wrong version', { v: 2 }],
    ['unknown world', { world: 9 }],
    ['unknown kart', { kart: 'ufo' }],
    ['bad seed', { seed: 0 }],
    ['length that does not match the data', { steps: -1 }],
    ['garbage data', { data: '***' }],
  ])('rejects %s', (_n, patch) => {
    const body = { ...good.replay, ...(patch as object) };
    if ((patch as { steps?: number }).steps === -1) (body as { steps: number }).steps = good.replay.steps + 5;
    expect(verifyReplay(body).ok).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(verifyReplay(null).ok).toBe(false);
    expect(verifyReplay('x').ok).toBe(false);
  });
});

describe('leaderboard API core', () => {
  it('stores the SERVER-computed time and throttles the same device', async () => {
    const r = await send({ clientId: A, name: ' Tester\u0007 ', replay: good.replay, lapMs: 1, totalMs: 1 });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, lapMs: good.lapMs, totalMs: good.totalMs });
    expect((await send({ clientId: A, name: 'x', replay: good.replay })).status).toBe(429);
    await age();
    const rows = (await getBoard(sql, '1', '5')).body as { name: string; lap_ms: number }[];
    expect(rows).toEqual([expect.objectContaining({ name: 'Tester', lap_ms: good.lapMs })]); // the claimed 1 ms was ignored
  });

  it('keeps only a device’s best time per world+seed', async () => {
    await send({ clientId: A, name: 'Tester', replay: fast.replay }); // slower run
    await age();
    const rows = (await getBoard(sql, '1', '5')).body as { lap_ms: number }[];
    expect(rows[0].lap_ms).toBe(Math.min(good.lapMs, fast.lapMs));
  });

  it('rejects bad client ids, non-object bodies and missing replays', async () => {
    expect((await send({ clientId: 'x', replay: good.replay })).status).toBe(400);
    expect((await submitScore(sql, null, verifyReplay)).status).toBe(400);
    expect((await send({ clientId: B })).status).toBe(400);
  });

  it('sorts the board, defaults empty names, and scopes by seed / world', async () => {
    const world2 = await recordTrial(2, 8);
    expect((await send({ clientId: B, name: '', replay: world2.replay })).status).toBe(200);
    const w2 = (await getBoard(sql, '2', '8')).body as { name: string }[];
    expect(w2.map((r) => r.name)).toEqual(['YOU']);
    expect(((await getBoard(sql, '1', null)).body as unknown[]).length).toBe(1);
    expect(((await getBoard(sql, '1', '99')).body as unknown[]).length).toBe(0);
    expect((await getBoard(sql, '7', null)).status).toBe(400);
    expect((await getBoard(sql, '1', 'abc')).status).toBe(400);
  }, 60000);
});
