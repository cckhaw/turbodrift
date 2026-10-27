import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { getBoard, submitScore, MIN_LAP_MS, type Sql } from '../api/_core';
import { verifyReplay } from '../src/game/verify';
import type { Replay } from '../src/game/replay';
import { recordRace, recordTrial } from './helpers/headless';

const db = new PGlite();
const sql: Sql = async (s, ...v) => {
  let text = s[0];
  for (let i = 0; i < v.length; i++) text += `$${i + 1}` + s[i + 1];
  return (await db.query(text, v as unknown[])).rows as never[];
};
const A = '11111111-1111-4111-8111-111111111111';
const age = () => db.query(`update scores set updated_at = now() - interval '1 hour'`);

let race: { replay: Replay; lapMs: number; totalMs: number; presses: number };
let trial: { replay: Replay; lapMs: number };

beforeAll(async () => {
  const r = await recordRace(1, 5);
  race = { replay: r.replay, lapMs: Math.round(r.result.bestLap), totalMs: Math.round(r.result.totalTime), presses: r.itemPresses };
  const t = await recordTrial(1, 5);
  trial = { replay: t.replay, lapMs: Math.round(t.result.bestLap) };
}, 180000);

describe('race submissions', () => {
  it('records the mode and the item presses', () => {
    expect(race.replay.mode).toBe('race');
    expect(race.presses).toBeGreaterThan(0);
    expect(race.replay.items?.length).toBeGreaterThan(0);
    expect(trial.replay.mode).toBeUndefined();
  });

  it('the server re-runs the whole race, bots and items included, and gets the client’s times', () => {
    const t0 = Date.now();
    const v = verifyReplay(race.replay);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.mode).toBe('race');
      expect(v.lapMs).toBe(race.lapMs);
      expect(v.totalMs).toBe(race.totalMs);
    }
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it('dropping the item presses changes the race (they are part of the input)', () => {
    const v = verifyReplay({ ...race.replay, items: [] });
    if (v.ok) expect(v.totalMs).not.toBe(race.totalMs);
  });

  it('rejects malformed or impossible item presses', () => {
    for (const items of [[-1], [1.5], [5, 3], ['x'], [race.replay.steps + 10], Array.from({ length: 500 }, (_, i) => i)]) {
      expect(verifyReplay({ ...race.replay, items }).ok).toBe(false);
    }
    expect(verifyReplay({ ...trial.replay, items: [10] }).ok).toBe(false);
    expect(verifyReplay({ ...race.replay, mode: 'drag' }).ok).toBe(false);
  });

  it('keeps races and time trials on separate boards, one row each per player and track', async () => {
    expect((await submitScore(sql, { clientId: A, name: 'Racer', replay: race.replay }, verifyReplay)).status).toBe(200);
    await age();
    expect((await submitScore(sql, { clientId: A, name: 'Racer', replay: trial.replay }, verifyReplay)).status).toBe(200);
    const races = (await getBoard(sql, '1', '5', 'race')).body as { lap_ms: number }[];
    const trials = (await getBoard(sql, '1', '5', 'trial')).body as { lap_ms: number }[];
    const dflt = (await getBoard(sql, '1', '5')).body as { lap_ms: number }[];
    expect(races).toHaveLength(1);
    expect(races[0].lap_ms).toBe(race.lapMs);
    expect(trials).toHaveLength(1);
    expect(trials[0].lap_ms).toBe(trial.lapMs);
    expect(dflt).toEqual(trials); // older clients only know the time-trial board
  });

  it('upgrades a database created before races were accepted, keeping its rows as time trials', async () => {
    const old = new PGlite();
    const osql: Sql = async (s, ...v) => {
      let text = s[0];
      for (let i = 0; i < v.length; i++) text += `$${i + 1}` + s[i + 1];
      return (await old.query(text, v as unknown[])).rows as never[];
    };
    await old.query(`create table scores (id bigint generated always as identity primary key, client_id uuid not null, name text not null, world int not null, seed int not null, lap_ms int not null, total_ms int not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (client_id, world, seed))`);
    await old.query(`insert into scores (client_id, name, world, seed, lap_ms, total_ms) values ('${A}', 'Old', 1, 5, 40000, 130000)`);
    const rows = (await getBoard(osql, '1', '5', 'trial')).body as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual(['Old']);
    expect(((await getBoard(osql, '1', '5', 'race')).body as unknown[]).length).toBe(0);
    await old.query(`update scores set updated_at = now() - interval '1 hour'`); // clear the per-device throttle
    expect((await submitScore(osql, { clientId: A, name: 'New', replay: race.replay }, verifyReplay)).status).toBe(200);
    expect(((await getBoard(osql, '1', '5', 'race')).body as unknown[]).length).toBe(1);
  });

  it.each([2, 3])('race laps with item turbos stay above the plausibility floor in world %i', async (world) => {
    const r = await recordRace(world, 21);
    expect(r.result.bestLap).toBeGreaterThan(MIN_LAP_MS[world]);
  }, 120000);
});
