import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GHOST_DT, ghostAt, loadGhost, saveGhost, type Ghost } from '../src/utils/ghost';
import { loadSettings, saveSettings, sanitize, DEFAULT_SETTINGS } from '../src/utils/settings';
import { recordTrial } from './helpers/headless';

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
