import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GHOST_DT, ghostAt, loadGhost, saveGhost, type Ghost } from '../src/utils/ghost';
import { loadSettings, saveSettings, sanitize, DEFAULT_SETTINGS } from '../src/utils/settings';
import { loadEngine, recordRace, recordTrial } from './helpers/headless';
import { WORLDS } from '../src/game/worlds';
import type { HudSnapshot } from '../src/game/types';
import { FIXED_DT } from '../src/game/replay';

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
});
afterEach(() => vi.unstubAllGlobals());

const ghost = (lapMs: number): Ghost => ({ lapMs, d: Array.from({ length: 20 }, (_, i) => i * 1000), x: Array.from({ length: 20 }, () => 0.1) });

describe('ghosts are per kart', () => {
  it('a ghost recorded with one kart is not offered to another', () => {
    saveGhost(1, 5, 'rocket', ghost(39000));
    expect(loadGhost(1, 5, 'rocket')?.lapMs).toBe(39000);
    expect(loadGhost(1, 5, 'comet')).toBeNull();
    expect(loadGhost(1, 6, 'rocket')).toBeNull();
    saveGhost(1, 5, 'comet', ghost(42000));
    expect(loadGhost(1, 5, 'comet')?.lapMs).toBe(42000);
    expect(loadGhost(1, 5, 'rocket')?.lapMs).toBe(39000); // unchanged
  });

  it('interpolates and holds the final position', () => {
    const g = ghost(1);
    expect(ghostAt(g, GHOST_DT * 2.5).d).toBeCloseTo(2500);
    expect(ghostAt(g, 999).d).toBe(19000);
    expect(ghostAt(g, -1).d).toBe(0);
  });

  it('the engine saves the ghost under the kart that set it', async () => {
    await recordTrial(1, 11, 'phantom');
    const keys = [...store.keys()].filter((k) => k.startsWith('turbodrift.ghost.v2.'));
    expect(keys).toEqual(['turbodrift.ghost.v2.1.11.phantom']);
  }, 60000);
});

describe('the best-lap ghost is a Time Trial feature', () => {
  /** Run a mode for a few seconds with a saved ghost present and report whether a ghost marker ever shows up. */
  async function ghostShown(mode: 'race' | 'trial', enabled = true): Promise<boolean> {
    saveGhost(1, 5, 'comet', ghost(30000));
    if (enabled) store.set('turbodrift.settings.v1', JSON.stringify({ ghost: true }));
    else store.delete('turbodrift.settings.v1');
    const E = await loadEngine();
    const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop }) as unknown as CanvasRenderingContext2D;
    const canvas = { getContext: () => noop, clientWidth: 390, clientHeight: 844, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    let hud: HudSnapshot | null = null;
    const e = new E({ canvas, world: 1, seed: 5, mode, kart: 'comet', onHud: (h) => (hud = h), onFinish: () => {} });
    const p = e as unknown as { update(dt: number): void };
    let seen = false;
    for (let i = 0; i < 60 * 8; i++) {
      p.update(FIXED_DT);
      if ((hud as HudSnapshot | null)?.racers.some((r) => r.ghost)) seen = true;
    }
    return seen;
  }

  it('shows a ghost in Time Trial only when the player turned it on, and never in a race', async () => {
    expect(await ghostShown('trial', true)).toBe(true);
    expect(await ghostShown('race', true)).toBe(false);
    expect(await ghostShown('trial', false)).toBe(false); // the default: a lone translucent car reads as an opponent
  });

  it.each(WORLDS.map((w) => w.id))('world %i: a Time Trial shows exactly one car on every lap, even with a saved best-lap ghost', async (world) => {
    saveGhost(world, 9, 'comet', ghost(30000));
    const E = await loadEngine();
    const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop }) as unknown as CanvasRenderingContext2D;
    const canvas = { getContext: () => noop, clientWidth: 390, clientHeight: 844, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    const seen: number[] = [];
    let ghosts = 0;
    let lapsSeen = new Set<number>();
    let done = false;
    const e = new E({ canvas, world, seed: 9, mode: 'trial', kart: 'comet', onHud: (h) => (seen.push(h.total), (ghosts += h.racers.filter((r) => r.ghost || !r.you).length), lapsSeen.add(h.lap)), onFinish: () => (done = true) });
    const p = e as unknown as { update(dt: number): void; state: string; track: { line: number[] }; seg(d: number): { index: number }; player: { dist: number; x: number } };
    for (let i = 0; !done && i < 60 * 900; i++) {
      e.input.steer = Math.max(-1, Math.min(1, p.state === 'countdown' ? 0 : (p.track.line[p.seg(p.player.dist + 1200).index] - p.player.x) * 3));
      p.update(FIXED_DT);
    }
    expect(done).toBe(true);
    expect([...lapsSeen]).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(new Set(seen)).toEqual(new Set([1]));
    expect(ghosts).toBe(0);
  }, 120000);

  it('a race does not record ghosts either', async () => {
    await recordRace(1, 11, 'comet');
    expect([...store.keys()].filter((k) => k.startsWith('turbodrift.ghost.v2.'))).toEqual([]);
  }, 120000);
});

describe('settings', () => {
  it('falls back to defaults and clamps bad values', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(sanitize({ music: 9, sfx: -1, steerRange: 5, shake: 'no', quality: 'ultra' })).toEqual({ ...DEFAULT_SETTINGS, music: 1, sfx: 0, steerRange: 40, shake: true, quality: 'high' });
    store.set('turbodrift.settings.v1', '{not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists partial updates', () => {
    saveSettings({ quality: 'low', shake: false });
    saveSettings({ music: 0.2 });
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, quality: 'low', shake: false, music: 0.2 });
  });
});
