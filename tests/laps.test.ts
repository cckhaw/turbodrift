import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { getBoard, submitScore, MIN_LAP_MS, type Sql } from '../api/_core';
import { verifyReplay } from '../src/game/verify';
import type { Replay } from '../src/game/replay';
import { sanitize } from '../src/utils/settings';
import { BOARD_FILL, botScores, withBots } from '../src/utils/leaderboard';
import { WORLDS } from '../src/game/worlds';
import { recordRace, recordTrial } from './helpers/headless';

const db = new PGlite();
const sql: Sql = async (s, ...v) => {
  let text = s[0];
  for (let i = 0; i < v.length; i++) text += `$${i + 1}` + s[i + 1];
  return (await db.query(text, v as unknown[])).rows as never[];
};
const A = '11111111-1111-4111-8111-111111111111';
const age = () => db.query(`update scores set updated_at = now() - interval '1 hour'`);

let t1: { replay: Replay; lapMs: number; totalMs: number };
let t2: { replay: Replay; lapMs: number; totalMs: number };
let t3: { replay: Replay; lapMs: number; totalMs: number };

beforeAll(async () => {
  for (const [n, set] of [[1, (v: typeof t1) => (t1 = v)], [2, (v: typeof t1) => (t2 = v)], [3, (v: typeof t1) => (t3 = v)]] as const) {
    const r = await recordTrial(1, 5, 'comet', undefined, n);
    set({ replay: r.replay, lapMs: Math.round(r.result.bestLap), totalMs: Math.round(r.result.totalTime) });
  }
}, 120000);

describe('laps per race', () => {
  it('a time trial runs exactly the chosen number of laps and records the lap count', async () => {
    const r1 = await recordTrial(1, 5, 'comet', undefined, 1);
    const r2 = await recordTrial(1, 5, 'comet', undefined, 2);
    expect(r1.result.lapTimes).toHaveLength(1);
    expect(r2.result.lapTimes).toHaveLength(2);
    expect(r1.result.laps).toBe(1);
    expect(r1.replay.laps).toBe(1);
    expect(r2.replay.laps).toBe(2);
    expect(t3.replay.laps).toBeUndefined(); // three laps is the default and the old format
    expect(r1.result.totalTime).toBeLessThan(r2.result.totalTime);
  }, 60000);

  it('a race of one or two laps finishes with bots in it', async () => {
    for (const laps of [1, 2]) {
      const r = await recordRace(1, 5, 'comet', laps);
      expect(r.result.lapTimes).toHaveLength(laps);
      expect(r.result.total).toBe(6);
      expect(r.replay.laps).toBe(laps);
    }
  }, 120000);

  it('the server replays each lap count and gets the same times', () => {
    for (const t of [t1, t2, t3]) {
      const v = verifyReplay(t.replay);
      expect(v.ok).toBe(true);
      if (v.ok) {
        expect(v.lapMs).toBe(t.lapMs);
        expect(v.totalMs).toBe(t.totalMs);
        expect(v.lapTimes).toHaveLength(v.laps);
      }
    }
  });

  it('rejects lap counts the game does not have, and a recording that does not finish its laps', () => {
    for (const laps of [0, 4, 1.5, '3', null]) expect(verifyReplay({ ...t3.replay, laps }).ok).toBe(false);
    // a 1-lap recording claiming 3 laps never finishes them
    expect(verifyReplay({ ...t1.replay, laps: 3 }).ok).toBe(false);
  });

  it('keeps a separate board per lap count, one row each per player and track', async () => {
    for (const t of [t1, t2, t3]) {
      expect((await submitScore(sql, { clientId: A, name: 'Lapper', replay: t.replay }, verifyReplay)).status).toBe(200);
      await age();
    }
    for (const [laps, t] of [[1, t1], [2, t2], [3, t3]] as const) {
      const rows = (await getBoard(sql, '1', '5', 'trial', String(laps))).body as { lap_ms: number; total_ms: number }[];
      expect(rows).toHaveLength(1);
      expect(rows[0].lap_ms).toBe(t.lapMs);
      expect(rows[0].total_ms).toBe(t.totalMs);
    }
    // no laps parameter means the three-lap board, as before
    expect(((await getBoard(sql, '1', '5', 'trial')).body as { lap_ms: number }[])[0].lap_ms).toBe(t3.lapMs);
    expect((await getBoard(sql, '1', '5', 'trial', '4')).status).toBe(400);
  }, 60000);

  it('ranks a board by total race time, not by best lap', async () => {
    const B = '22222222-2222-4222-8222-222222222222';
    // Quick has the better lap but the slower race; Steady is the other way round
    await sql`insert into scores (client_id, name, world, seed, mode, laps, lap_ms, total_ms) values (${A}, 'Quick', 3, 9, 'race', 3, 40000, 130000), (${B}, 'Steady', 3, 9, 'race', 3, 42000, 126000)`;
    const rows = (await getBoard(sql, '3', null, 'race', '3')).body as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual(['Steady', 'Quick']);
  });

  it('a one-lap total is plausible (no phantom extra laps required)', async () => {
    expect(t1.totalMs).toBeGreaterThanOrEqual(t1.lapMs);
    expect(t1.lapMs).toBeGreaterThan(MIN_LAP_MS[1]);
  });

  it('the laps setting is 1, 2 or 3 and defaults to 3', () => {
    expect(sanitize(null).laps).toBe(3);
    expect(sanitize({ laps: 1 }).laps).toBe(1);
    expect(sanitize({ laps: 2 }).laps).toBe(2);
    expect(sanitize({ laps: 7 }).laps).toBe(3);
    expect(sanitize({ laps: '2' }).laps).toBe(3);
  });
});

describe('database upgrade for lap counts', () => {
  it('adds laps to a database that already has modes, keeping its rows as three-lap runs', async () => {
    const old = new PGlite();
    const osql: Sql = async (s, ...v) => {
      let text = s[0];
      for (let i = 0; i < v.length; i++) text += `$${i + 1}` + s[i + 1];
      return (await old.query(text, v as unknown[])).rows as never[];
    };
    await old.query(`create table scores (id bigint generated always as identity primary key, client_id uuid not null, name text not null, world int not null, seed int not null, mode text not null default 'trial', lap_ms int not null, total_ms int not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`);
    await old.query(`create unique index scores_client_track_mode_idx on scores (client_id, world, seed, mode)`);
    await old.query(`insert into scores (client_id, name, world, seed, mode, lap_ms, total_ms) values ('${A}', 'Old', 1, 5, 'race', 40000, 130000)`);
    const rows = (await getBoard(osql, '1', '5', 'race', '3')).body as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual(['Old']);
    expect(((await getBoard(osql, '1', '5', 'race', '1')).body as unknown[]).length).toBe(0);
    await old.query(`update scores set updated_at = now() - interval '1 hour'`);
    expect((await submitScore(osql, { clientId: A, name: 'New', replay: t1.replay }, verifyReplay)).status).toBe(200);
    expect(((await getBoard(osql, '1', '5', 'trial', '1')).body as unknown[]).length).toBe(1);
  }, 60000);
});

describe('bots fill the boards', () => {
  it('are deterministic, ordered, labelled and beatable', () => {
    for (const w of WORLDS) {
      const a = botScores(w.id, 5, 'race', 3, 15);
      const b = botScores(w.id, 5, 'race', 3, 15);
      expect(a).toEqual(b);
      expect(a.every((r) => r.bot && r.world === w.id)).toBe(true);
      expect(new Set(a.map((r) => r.name)).size).toBe(15); // no duplicate names on one board
      expect(a[0].lapMs).toBeGreaterThan(MIN_LAP_MS[w.id]); // slower than the physical floor, so a real player can top them
      expect(a.map((r) => r.totalMs)).toEqual([...a.map((r) => r.totalMs)].sort((x, y) => x - y));
      // different boards get different rivals
      expect(botScores(w.id, 6, 'race', 3, 15)).not.toEqual(a);
      expect(botScores(w.id, 5, 'trial', 3, 15)).not.toEqual(a);
    }
  });

  it('pad a board up to the fill size, with real times ranked among them', () => {
    const real = [{ name: 'Ace', lapMs: 1000 * 20, totalMs: 60000, world: 1, seed: 5 }, { name: 'Mid', lapMs: 1000 * 55, totalMs: 170000, world: 1, seed: 5 }];
    const rows = withBots(real, 1, 5, 'trial', 3);
    expect(rows).toHaveLength(BOARD_FILL);
    expect(rows[0].name).toBe('Ace');
    expect(rows.filter((r) => !r.bot)).toHaveLength(2);
    expect(rows.findIndex((r) => r.name === 'Mid')).toBeGreaterThan(0);
    expect(rows.map((r) => r.totalMs)).toEqual([...rows.map((r) => r.totalMs)].sort((x, y) => x - y));
    // a full board of real times gets no bots
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `P${i}`, lapMs: 40000 + i * 100, totalMs: 130000, world: 1, seed: 5 }));
    expect(withBots(many, 1, 5, 'trial', 3).every((r) => !r.bot)).toBe(true);
  });
});
