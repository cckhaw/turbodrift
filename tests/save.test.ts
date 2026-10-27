import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import type { Sql } from '../api/_core';
import { CODE_ALPHABET, WORLD_COUNT, createSave, getSave, makeCode, mergeSaves, normalizeCode, parseSave, putSave } from '../api/_save';
import { WORLDS } from '../src/game/worlds';
import { MIN_LAP_MS } from '../api/_core';

const db = new PGlite();
const sql: Sql = async (s, ...v) => {
  let text = s[0];
  for (let i = 0; i < v.length; i++) text += `$${i + 1}` + s[i + 1];
  return (await db.query(text, v as unknown[])).rows as never[];
};
it('the server-side world count follows the real worlds', () => {
  expect(WORLD_COUNT).toBe(WORLDS.length);
  expect(Object.keys(MIN_LAP_MS).map(Number).sort()).toEqual(WORLDS.map((w) => w.id));
});

const base = { unlocked: 2, medals: { '1': 1, '2': 4 }, days: ['2026-10-25', '2026-10-26'], name: 'Kai', kart: 'rocket' };
const CODE = 'ABCDEFGH2345';

describe('save parsing', () => {
  it('accepts a valid save and normalises it', () => {
    expect(parseSave({ ...base, days: ['2026-10-26', '2026-10-25', '2026-10-26'], name: ' Kai\u0007 ' })).toEqual({ ...base, name: 'Kai' });
  });

  it.each([
    ['null', null],
    ['unlocked out of range', { ...base, unlocked: 6 }],
    ['unlocked not an int', { ...base, unlocked: 1.5 }],
    ['unknown world medal', { ...base, medals: { '9': 1 } }],
    ['bad place', { ...base, medals: { '1': 0 } }],
    ['medals as array', { ...base, medals: [1] }],
    ['bad date', { ...base, days: ['yesterday'] }],
    ['too many days', { ...base, days: Array.from({ length: 91 }, (_, i) => `2026-01-${String((i % 28) + 1).padStart(2, '0')}`) }],
    ['long name', { ...base, name: 'x'.repeat(13) }],
    ['unknown kart', { ...base, kart: 'ufo' }],
  ])('rejects %s', (_n, input) => {
    expect(parseSave(input)).toBeNull();
  });
});

describe('sync codes', () => {
  it('are 12 Crockford-base32 characters and forgive typos', () => {
    const code = makeCode(new Uint8Array(12).map((_, i) => i * 21));
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    expect(normalizeCode('abcd-efgh 2345')).toBe('ABCDEFGH2345');
    expect(normalizeCode('OIL0IL0IL0IL')).toBe('011011011011'); // O→0, I/L→1
    expect(normalizeCode('short')).toBeNull();
    expect(normalizeCode(42)).toBeNull();
  });
});

describe('merging', () => {
  it('only moves progress forward', () => {
    const old = { ...base, unlocked: 1, medals: { '1': 3 }, days: ['2026-10-20'] };
    const m = mergeSaves(base, old);
    expect(m.unlocked).toBe(2);
    expect(m.medals).toEqual({ '1': 1, '2': 4 });
    expect(m.days).toEqual(['2026-10-20', '2026-10-25', '2026-10-26']);
  });
});

describe('cloud save API core', () => {
  it('creates, reads back, and throttles creation per IP', async () => {
    const r = await createSave(sql, base, 'iphash-a', CODE);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ code: CODE });
    expect((await createSave(sql, base, 'iphash-a', 'ZZZZZZZZZZZZ')).status).toBe(429);
    expect((await createSave(sql, base, 'iphash-b', 'YYYYYYYYYYYY')).status).toBe(200);
    expect((await getSave(sql, 'abcd-efgh-2345')).body).toEqual({ save: base });
  });

  it('rejects bad input and unknown codes', async () => {
    expect((await createSave(sql, { nope: true }, 'iphash-c', 'XXXXXXXXXXXX')).status).toBe(400);
    expect((await getSave(sql, 'not a code')).status).toBe(400);
    expect((await getSave(sql, '000000000000')).status).toBe(404);
    expect((await putSave(sql, '000000000000', base)).status).toBe(404);
    expect((await putSave(sql, CODE, { bad: 1 })).status).toBe(400);
  });

  it('a stale device cannot roll progress back', async () => {
    const stale = { ...base, unlocked: 1, medals: { '1': 5 }, days: [] };
    const r = await putSave(sql, CODE, stale);
    expect(r.status).toBe(200);
    expect((r.body as { save: typeof base }).save.unlocked).toBe(2);
    expect((r.body as { save: typeof base }).save.medals['1']).toBe(1);
    const progressed = { ...base, unlocked: 3, medals: { ...base.medals, '3': 2 } };
    await putSave(sql, CODE, progressed);
    const got = (await getSave(sql, CODE)).body as { save: { unlocked: number; medals: Record<string, number> } };
    expect(got.save.unlocked).toBe(3);
    expect(got.save.medals['3']).toBe(2);
  });
});
