export interface Settings {
  music: number; // 0..1
  sfx: number; // 0..1
  steerRange: number; // px of thumb travel for full lock (smaller = more sensitive)
  shake: boolean;
  quality: 'high' | 'low';
  hud: HudMode;
  /** touch steering: drag anywhere, or two arrow pads (digital, like a keyboard) */
  touchScheme: 'drag' | 'buttons';
  /** laps in a race or time trial (1, 2 or 3); every lap count has its own leaderboard */
  laps: 1 | 2 | 3;
  /** show the translucent best-lap ghost car in Time Trial (off: a lone car reads as an opponent) */
  ghost: boolean;
  /** steering hard through a bend starts (and ends) the drift for you */
  driftAssist: boolean;
}

/** Phones and tablets: where the drift assist defaults to on. */
export const isTouchDevice = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export type HudMode = 'full' | 'compact' | 'off';
export const HUD_MODES: HudMode[] = ['full', 'compact', 'off'];
export const nextHudMode = (m: HudMode): HudMode => HUD_MODES[(HUD_MODES.indexOf(m) + 1) % HUD_MODES.length];

export const DEFAULT_SETTINGS: Settings = { music: 0.7, sfx: 0.8, steerRange: 70, shake: true, quality: 'high', hud: 'full', touchScheme: 'drag', driftAssist: false, laps: 3, ghost: false };
const KEY = 'turbodrift.settings.v1';

const clamp = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

export function sanitize(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    music: clamp(r.music, 0, 1, DEFAULT_SETTINGS.music),
    sfx: clamp(r.sfx, 0, 1, DEFAULT_SETTINGS.sfx),
    steerRange: clamp(r.steerRange, 40, 120, DEFAULT_SETTINGS.steerRange),
    shake: typeof r.shake === 'boolean' ? r.shake : DEFAULT_SETTINGS.shake,
    quality: r.quality === 'low' ? 'low' : 'high',
    hud: r.hud === 'compact' || r.hud === 'off' ? r.hud : 'full',
    touchScheme: r.touchScheme === 'buttons' ? 'buttons' : 'drag',
    laps: r.laps === 1 || r.laps === 2 ? r.laps : 3,
    ghost: r.ghost === true,
    driftAssist: typeof r.driftAssist === 'boolean' ? r.driftAssist : isTouchDevice(),
  };
}

export function loadSettings(): Settings {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = sanitize({ ...loadSettings(), ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
