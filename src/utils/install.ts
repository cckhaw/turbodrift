/** "Add to home screen" reminders for people playing in a browser tab on a phone. */

export type Platform = 'ios' | 'android' | 'other';

const KEY = 'turbodrift.install.v1';
export const SNOOZE_MS = 3 * 24 * 3600 * 1000;

interface State {
  /** don't remind again until this time (ms since epoch) */
  until: number;
  /** the player said never, or the app got installed */
  never: boolean;
}

/** iPhone, iPad (including iPadOS, which reports itself as a Mac with a touch screen), Android, or neither. */
export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** True when the game was launched from the home screen (or installed), where the reminder would be pointless. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  try {
    return ['standalone', 'fullscreen', 'minimal-ui'].some((m) => window.matchMedia(`(display-mode: ${m})`).matches);
  } catch {
    return false;
  }
}

function read(): State {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return { until: typeof v?.until === 'number' ? v.until : 0, never: v?.never === true };
  } catch {
    return { until: 0, never: false };
  }
}

function write(s: State): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Pure decision: remind on a phone, in a browser tab, unless snoozed or switched off. */
export function shouldRemind(platform: Platform, standalone: boolean, state: { until: number; never: boolean }, now: number): boolean {
  if (platform === 'other' || standalone || state.never) return false;
  return now >= state.until;
}

export const remindNow = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return shouldRemind(detectPlatform(navigator.userAgent, navigator.maxTouchPoints), isStandalone(), read(), Date.now());
};
export const currentPlatform = (): Platform => (typeof navigator === 'undefined' ? 'other' : detectPlatform(navigator.userAgent, navigator.maxTouchPoints));
export const snoozeInstall = (now = Date.now()): void => write({ ...read(), until: now + SNOOZE_MS });
export const neverRemind = (): void => write({ until: 0, never: true });
export const resetInstall = (): void => write({ until: 0, never: false });

// ---- Android's native install prompt, captured so a button can trigger it ----
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

export function watchInstall(): () => void {
  if (typeof window === 'undefined') return () => {};
  const before = (e: Event) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  };
  const done = () => {
    deferred = null;
    neverRemind();
    listeners.forEach((l) => l());
  };
  window.addEventListener('beforeinstallprompt', before);
  window.addEventListener('appinstalled', done);
  return () => {
    window.removeEventListener('beforeinstallprompt', before);
    window.removeEventListener('appinstalled', done);
  };
}

export const canPromptInstall = (): boolean => deferred !== null;
export const onInstallChange = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Show Chrome's own install dialog (Android). Resolves true if the player accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  return outcome === 'accepted';
}
