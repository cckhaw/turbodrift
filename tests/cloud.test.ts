import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from '../api/_core';
import { createSave, getSave, makeCode, putSave } from '../api/_save';

// A fake network that routes the client's fetches into the real API core backed by in-memory Postgres.
const db = new PGlite();
const sql: Sql = async (s, ...v) => {
  let text = s[0];
  for (let i = 0; i < v.length; i++) text += `$${i + 1}` + s[i + 1];
  return (await db.query(text, v as unknown[])).rows as never[];
};

let store: Map<string, string>;
let online = true;
let ip = 0;

beforeEach(() => {
  store = new Map();
  online = true;
  ip++;
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    if (!online) throw new TypeError('offline');
    const u = new URL(url);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    let r;
    if (init.method === 'POST') r = await createSave(sql, body, `ip-${ip}`, makeCode(crypto.getRandomValues(new Uint8Array(12))));
    else if (init.method === 'PUT') r = await putSave(sql, body.code, body.save);
    else r = await getSave(sql, u.searchParams.get('code'));
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function load() {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE', 'http://api.test');
  const [cloud, progress, daily] = await Promise.all([import('../src/utils/cloud'), import('../src/utils/progress'), import('../src/utils/daily')]);
  return { cloud, progress, daily };
}

describe('cloud save: unlocks follow the player across devices', () => {
  it('device A enables cloud save; device B restores the unlocks with the code', async () => {
    const A = await load();
    A.progress.recordFinish(1, 2); // podium → world 2 unlocked
    A.progress.recordFinish(2, 1); // → world 3 unlocked
    A.daily.recordDaily('2026-10-26');
    const created = await A.cloud.enableCloud();
    expect(created?.code).toMatch(/^[0-9A-Z]{12}$/);

    store = new Map(); // a fresh device
    const B = await load();
    expect(B.progress.loadProgress().unlocked).toBe(1);
    const restored = await B.cloud.restoreFromCode(A.cloud.formatCode(created!.code).toLowerCase());
    expect(restored.result).toBe('ok');
    expect(B.progress.loadProgress()).toEqual({ unlocked: 3, medals: { 1: 2, 2: 1 } });
    expect(B.daily.loadDays()).toContain('2026-10-26');
    expect(B.cloud.getSyncCode()).toBe(created!.code);
  });

  it('merges in both directions and never lowers progress', async () => {
    const A = await load();
    A.progress.recordFinish(1, 3);
    const { code } = (await A.cloud.enableCloud())!;

    store = new Map();
    const B = await load();
    B.progress.recordFinish(1, 1); // better finish, still only world 2 unlocked
    await B.cloud.restoreFromCode(code);
    expect(B.progress.loadProgress().medals[1]).toBe(1);

    // device A syncs and picks up B's better medal; its own unlock is retained
    store = new Map([['turbodrift.synccode', code], ['turbodrift.progress.v1', JSON.stringify({ unlocked: 2, medals: { 1: 3 } })]]);
    const A2 = await load();
    const merged = await A2.cloud.syncCloud();
    expect(merged).toEqual({ unlocked: 2, medals: { 1: 1 } });
  });

  it('reports an unknown code and works offline without touching local progress', async () => {
    const A = await load();
    A.progress.recordFinish(1, 1);
    expect((await A.cloud.restoreFromCode('0000-0000-0000')).result).toBe('notfound');
    online = false;
    expect((await A.cloud.restoreFromCode('ABCD-EFGH-2345')).result).toBe('unavailable');
    expect(await A.cloud.enableCloud()).toBeNull();
    expect(A.progress.loadProgress().unlocked).toBe(2);
    expect(await A.cloud.syncCloud()).toBeNull(); // not enabled: no-op
  });

  it('forgets a sync code the server no longer has', async () => {
    const A = await load();
    store.set('turbodrift.synccode', 'ZZZZZZZZZZZZ');
    expect(await A.cloud.syncCloud()).toBeNull();
    expect(A.cloud.getSyncCode()).toBeNull();
  });
});
