import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ES module without types
import { findKeep, judge, selectOld } from '../scripts/cleanup-lib.mjs';

interface D {
  uid: string;
  url: string;
  created: number;
  state: string;
  target: string | null;
  meta?: { githubCommitSha?: string };
}
const d = (uid: string, created: number, state = 'READY', target: string | null = 'production', sha = ''): D => ({ uid, url: `${uid}.vercel.app`, created, state, target, meta: { githubCommitSha: sha } });

const all: D[] = [d('new', 400, 'BUILDING', 'production', 'bbb'), d('preview', 350, 'CANCELED', null, 'bbb'), d('cur', 300, 'READY', 'production', 'aaa'), d('old', 200), d('prev', 100, 'CANCELED', null)];

describe('deployment cleanup selection', () => {
  it('finds the production deployment built from a commit, ignoring previews of the same commit', () => {
    expect(findKeep(all, { sha: 'bbb' }).uid).toBe('new');
    expect(findKeep(all, { sha: 'aaa' }).uid).toBe('cur');
    expect(findKeep(all, { sha: 'zzz' })).toBeNull();
  });

  it('finds by id or hostname', () => {
    expect(findKeep(all, { keep: 'cur' }).uid).toBe('cur');
    expect(findKeep(all, { keep: 'https://old.vercel.app/path' }).uid).toBe('old');
    expect(findKeep(all, {})).toBeNull();
  });

  it('only ever selects deployments older than the one kept (never a newer build in flight)', () => {
    const keep = findKeep(all, { sha: 'aaa' });
    expect(selectOld(all, keep).map((x: D) => x.uid)).toEqual(['old', 'prev']);
    expect(selectOld(all, findKeep(all, { keep: 'prev' }))).toEqual([]);
  });

  it('waits while building, goes when READY, aborts on failure', () => {
    expect(judge(null)).toBe('wait');
    for (const s of ['QUEUED', 'INITIALIZING', 'BUILDING']) expect(judge(d('x', 1, s))).toBe('wait');
    expect(judge(d('x', 1, 'READY'))).toBe('go');
    for (const s of ['ERROR', 'CANCELED', 'DELETED']) expect(judge(d('x', 1, s))).toBe('abort');
  });
});
