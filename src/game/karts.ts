export interface KartSpec {
  id: string;
  name: string;
  blurb: string;
  color: string;
  accent: string;
  speed: number; // top speed multiplier
  accel: number;
  handling: number; // steering rate multiplier
  drift: number; // drift charge rate multiplier
}

export const KARTS: KartSpec[] = [
  { id: 'comet', name: 'Comet', blurb: 'Balanced all-rounder', color: '#007AFF', accent: '#5AC8FA', speed: 1, accel: 1, handling: 1, drift: 1 },
  { id: 'rocket', name: 'Rocket', blurb: 'Fast on straights, heavy in corners', color: '#FF2D55', accent: '#FFD60A', speed: 1.06, accel: 0.85, handling: 0.88, drift: 1 },
  { id: 'phantom', name: 'Phantom', blurb: 'Quick to charge drifts, nimble', color: '#BF5AF2', accent: '#5AC8FA', speed: 0.97, accel: 1.1, handling: 1.1, drift: 1.35 },
];

/** Fastest any kart can be, used to sanity-check server lap-time limits. */
export const MAX_KART_SPEED = Math.max(...KARTS.map((k) => k.speed));

const KEY = 'turbodrift.kart';
export const kartById = (id: string | null | undefined): KartSpec => KARTS.find((k) => k.id === id) ?? KARTS[0];

export function loadKart(): KartSpec {
  try {
    return kartById(localStorage.getItem(KEY));
  } catch {
    return KARTS[0];
  }
}
export function saveKart(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}

export type Mode = 'race' | 'trial' | 'practice';
const MODE_KEY = 'turbodrift.mode';
export function loadMode(): Mode {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return m === 'trial' || m === 'practice' ? m : 'race';
  } catch {
    return 'race';
  }
}
export function saveMode(m: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* ignore */
  }
}
