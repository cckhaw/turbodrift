import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoard, renamePlayer as renameRows, type Sql } from '../api/_core';
import type { Replay } from '../src/game/replay';

const db = new PGlite();
const sql: Sql = async (s, ...v) => {
  let text = s[0];
  for (let i = 0; i < v.length; i++) text += `$${i + 1}` + s[i + 1];
  return (await db.query(text, v as unknown[])).rows as never[];
};
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('renaming scores on the server', () => {
  it('renames every score from one device and nobody else’s', async () => {
    await getBoard(sql, '1', null); // creates the schema
    await sql`insert into scores (client_id, name, world, seed, mode, laps, lap_ms, total_ms) values (${A}, 'YOU', 1, 5, 'race', 3, 40000, 125000), (${A}, 'YOU', 2, 5, 'trial', 1, 40000, 41000), (${B}, 'Other', 1, 5, 'race', 3, 41000, 127000)`;
    const r = await renameRows(sql, { clientId: A, name: '  Ace\u0007Racer-long-name  ' });
    expect(r).toEqual({ status: 200, body: { ok: true, name: 'AceRacer-lon' } });
    const rows = (await getBoard(sql, '1', null, 'race', '3')).body as { name: string }[];
    expect(rows.map((x) => x.name).sort()).toEqual(['AceRacer-lon', 'Other']);
    const other = (await getBoard(sql, '2', null, 'trial', '1')).body as { name: string }[];
    expect(other.map((x) => x.name)).toEqual(['AceRacer-lon']);
  });

  it('rejects a bad client id or an empty name', async () => {
    expect((await renameRows(sql, { clientId: 'nope', name: 'x' })).status).toBe(400);
    expect((await renameRows(sql, { clientId: A, name: '   ' })).status).toBe(400);
    expect((await renameRows(sql, null)).status).toBe(400);
  });
});

describe('renaming on the device', () => {
  const replay: Replay = { v: 1, world: 1, seed: 5, kart: 'comet', steps: 100, data: 'AAAA' };
  let store: Map<string, string>;
  let calls: { url: string; body: Record<string, unknown> }[];
  let down: boolean;

  const load = async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE', 'http://api.test');
    return import('../src/utils/leaderboard');
  };

  beforeEach(() => {
    store = new Map();
    calls = [];
    down = false;
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      if (down) throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, json: async () => ({}) };
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('knows whether the player has picked a name yet', async () => {
    const lb = await load();
    expect(lb.hasChosenName()).toBe(false);
    expect(lb.getPlayerName()).toBe('YOU');
    await lb.renamePlayer('Mika');
    expect(lb.hasChosenName()).toBe(true);
    expect(lb.getPlayerName()).toBe('Mika');
  });

  it('sends the new name to the server and retags local records and queued scores', async () => {
    const lb = await load();
    down = true;
    await lb.saveScore({ name: 'YOU', lapMs: 40000, totalMs: 125000, world: 1, seed: 5, mode: 'race', laps: 3 }, replay); // fails: stays queued
    down = false;
    calls.length = 0;
    await lb.renamePlayer('Mika');
    const rename = calls.find((c) => c.url.endsWith('/api/rename'));
    expect(rename?.body).toMatchObject({ name: 'Mika' });
    // the queued run was sent under the new name, not "YOU"
    const sent = calls.find((c) => c.url.endsWith('/api/score'));
    expect(sent?.body).toMatchObject({ name: 'Mika' });
    expect(JSON.parse(store.get('turbodrift.scores.v1') ?? '[]')[0].name).toBe('Mika');
    expect(store.has('turbodrift.rename.v1')).toBe(false); // delivered
  });

  it('keeps the rename until the server can be reached, then delivers it once', async () => {
    const lb = await load();
    down = true;
    await lb.renamePlayer('Mika');
    expect(lb.getPlayerName()).toBe('Mika'); // changes locally straight away
    expect(store.get('turbodrift.rename.v1')).toBe('Mika');
    down = false;
    calls.length = 0;
    await lb.flushPending();
    expect(calls.filter((c) => c.url.endsWith('/api/rename'))).toHaveLength(1);
    expect(store.has('turbodrift.rename.v1')).toBe(false);
  });
});
