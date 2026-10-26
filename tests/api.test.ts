import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { getBoard, submitScore, type Sql } from '../api/_core';

const db = new PGlite();
const sql: Sql = async (s, ...v) => {
  let text = s[0];
  for (let i = 0; i < v.length; i++) text += `$${i + 1}` + s[i + 1];
  return (await db.query(text, v as unknown[])).rows as never[];
};
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const good = { clientId: A, name: ' Tester\u0007 ', world: 1, seed: 5, lapMs: 40000, totalMs: 125000 };
const age = () => db.query(`update scores set updated_at = now() - interval '1 hour'`);

describe('leaderboard API core', () => {
  beforeAll(async () => {
    await db.query('select 1');
  });

  it('accepts a plausible score and throttles the same device', async () => {
    expect((await submitScore(sql, good)).status).toBe(200);
    expect((await submitScore(sql, { ...good, seed: 6 })).status).toBe(429);
    await age();
  });

  it('keeps only a device’s best time per world+seed', async () => {
    await submitScore(sql, { ...good, lapMs: 45000, totalMs: 130000 });
    await age();
    const rows = (await getBoard(sql, '1', '5')).body as { name: string; lap_ms: number }[];
    expect(rows).toEqual([expect.objectContaining({ name: 'Tester', lap_ms: 40000 })]);
  });

  it.each([
    ['too fast', { lapMs: 5000 }],
    ['total shorter than 3 laps', { totalMs: 41000 }],
    ['fractional time', { lapMs: 40000.5 }],
    ['unknown world', { world: 9 }],
    ['bad client id', { clientId: 'x' }],
    ['seed out of range', { seed: 0 }],
  ])('rejects %s', async (_n, patch) => {
    expect((await submitScore(sql, { ...good, clientId: B, ...patch })).status).toBe(400);
  });

  it('rejects non-object bodies', async () => {
    expect((await submitScore(sql, null)).status).toBe(400);
    expect((await submitScore(sql, 'x')).status).toBe(400);
  });

  it('sorts the board, defaults empty names, and scopes by seed / world', async () => {
    expect((await submitScore(sql, { ...good, clientId: B, name: '', lapMs: 38000 })).status).toBe(200);
    const seed5 = (await getBoard(sql, '1', '5')).body as { name: string; lap_ms: number }[];
    expect(seed5.map((r) => [r.name, r.lap_ms])).toEqual([['YOU', 38000], ['Tester', 40000]]);
    expect(((await getBoard(sql, '1', null)).body as unknown[]).length).toBe(2);
    expect(((await getBoard(sql, '1', '99')).body as unknown[]).length).toBe(0);
    expect((await getBoard(sql, '7', null)).status).toBe(400);
    expect((await getBoard(sql, '1', 'abc')).status).toBe(400);
  });
});
