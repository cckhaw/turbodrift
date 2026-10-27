import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GHOST_DT, ghostAt, loadGhost, saveGhost, type Ghost } from '../src/utils/ghost';
import { loadSettings, saveSettings, sanitize, DEFAULT_SETTINGS } from '../src/utils/settings';
import { loadEngine, recordRace, recordTrial } from './helpers/headless';
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
  async function ghostShown(mode: 'race' | 'trial'): Promise<boolean> {
    saveGhost(1, 5, 'comet', ghost(30000));
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

  it('shows a ghost in Time Trial but not in a race, where it would look like a car restarting at the line', async () => {
    expect(await ghostShown('trial')).toBe(true);
    expect(await ghostShown('race')).toBe(false);
  });

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
