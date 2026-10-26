import { loadKart, saveKart } from '../game/karts';
import { api, globalEnabled } from './api';
import { loadDays, mergeDays } from './daily';
import { getPlayerName, setPlayerName } from './leaderboard';
import { loadProgress, mergeProgress, saveProgress, type Progress } from './progress';

/** Mirrors api/_save.ts. */
export interface SaveData {
  unlocked: number;
  medals: Record<string, number>;
  days: string[];
  name: string;
  kart: string;
}

const CODE_KEY = 'turbodrift.synccode';

export const getSyncCode = (): string | null => {
  try {
    return localStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
};
const setSyncCode = (c: string | null) => {
  try {
    if (c) localStorage.setItem(CODE_KEY, c);
    else localStorage.removeItem(CODE_KEY);
  } catch {
    /* ignore */
  }
};

export const formatCode = (c: string): string => c.replace(/(.{4})(?=.)/g, '$1-');

export function buildSave(): SaveData {
  const p = loadProgress();
  return { unlocked: p.unlocked, medals: Object.fromEntries(Object.entries(p.medals).map(([k, v]) => [k, v])), days: loadDays(), name: getPlayerName(), kart: loadKart().id };
}

/** Merge a remote save into this device (never lowers anything). Returns the new local progress. */
export function applySave(s: SaveData): Progress {
  const remote: Progress = { unlocked: s.unlocked, medals: Object.fromEntries(Object.entries(s.medals).map(([k, v]) => [Number(k), v])) };
  const merged = saveProgress(mergeProgress(loadProgress(), remote));
  mergeDays(s.days);
  return merged;
}

export type CloudResult = 'ok' | 'notfound' | 'unavailable';

/** Turn cloud save on: uploads this device's progress and stores the new sync code. */
export async function enableCloud(): Promise<{ code: string } | null> {
  if (!globalEnabled()) return null;
  try {
    const res = await api('/api/save', { method: 'POST', body: JSON.stringify(buildSave()) });
    const { code } = (await res.json()) as { code: string };
    setSyncCode(code);
    return { code };
  } catch {
    return null;
  }
}

/** Use a sync code from another device: pull its progress into this one, then push the merged result back. */
export async function restoreFromCode(raw: string): Promise<{ result: CloudResult; progress?: Progress }> {
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  try {
    const res = await api(`/api/save?code=${encodeURIComponent(code)}`);
    const { save } = (await res.json()) as { save: SaveData };
    const progress = applySave(save);
    // adopt the other device's identity only if this one still has the defaults
    if (getPlayerName() === 'YOU') setPlayerName(save.name);
    if (!localStorageHas('turbodrift.kart')) saveKart(save.kart);
    setSyncCode(code);
    await api('/api/save', { method: 'PUT', body: JSON.stringify({ code, save: buildSave() }) }).catch(() => undefined);
    return { result: 'ok', progress };
  } catch (e) {
    return { result: parseInt((e as Error).message, 10) === 404 ? 'notfound' : 'unavailable' };
  }
}

function localStorageHas(k: string): boolean {
  try {
    return localStorage.getItem(k) != null;
  } catch {
    return false;
  }
}

/** Pull + merge + push. No-op unless cloud save is on. */
export async function syncCloud(): Promise<Progress | null> {
  const code = getSyncCode();
  if (!code || !globalEnabled()) return null;
  try {
    const { save } = (await (await api(`/api/save?code=${code}`)).json()) as { save: SaveData };
    const progress = applySave(save);
    await api('/api/save', { method: 'PUT', body: JSON.stringify({ code, save: buildSave() }) });
    return progress;
  } catch (e) {
    if (parseInt((e as Error).message, 10) === 404) setSyncCode(null); // save was removed server-side
    return null;
  }
}

export function disableCloud(): void {
  setSyncCode(null);
}
