const KEY = 'turbodrift.haptics';

let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
})();

export const hapticsSupported = (): boolean => typeof navigator !== 'undefined' && 'vibrate' in navigator;
export const hapticsEnabled = (): boolean => enabled;
export function setHaptics(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  if (on) buzz(15);
}

export function buzz(pattern: number | number[]): void {
  if (enabled && hapticsSupported()) navigator.vibrate(pattern);
}

export const haptic = {
  driftLevel: () => buzz(12),
  boost: () => buzz([30, 30, 50]),
  pad: () => buzz(25),
  bump: () => buzz(10),
  hit: () => buzz([60, 40, 90]),
  fall: () => buzz(150),
  lap: () => buzz([20, 40, 20]),
  finish: () => buzz([40, 40, 40, 40, 120]),
};
