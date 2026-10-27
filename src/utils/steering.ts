/** Touch steering response, kept free of React so it can be tested. */

const DEAD_PX = 6;
/** full lock is reached at this fraction of the configured thumb travel, so it is easy to hit and hold */
const FULL_AT = 0.72;

/** How far the thumb can travel before the drag anchor starts following it (just past full lock, so reversing is quick). */
export const holdRange = (range: number): number => range * FULL_AT + DEAD_PX;

/** Thumb offset (px from where the drag started) → steering -1..1: a small dead zone, gentle near the middle, full lock without a stretch. */
export function dragToSteer(dx: number, range: number): number {
  const full = Math.max(range * FULL_AT, DEAD_PX + 1);
  const t = Math.min(1, Math.max(0, (Math.abs(dx) - DEAD_PX) / (full - DEAD_PX)));
  return Math.sign(dx) * Math.pow(t, 1.25);
}

/** Low-pass filter so a jittery thumb doesn't wobble the kart; it eases back to centre a bit faster than it eases out. */
export function smoothSteer(current: number, target: number, dt: number): number {
  const rate = Math.abs(target) < Math.abs(current) ? 34 : 22;
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  const next = current + (target - current) * k;
  return Math.abs(next - target) < 0.004 ? target : next;
}

/** The arrow pads steer like keyboard keys: both held cancel out. */
export const padSteer = (left: boolean, right: boolean): number => (right ? 1 : 0) - (left ? 1 : 0);
