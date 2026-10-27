import { afterEach, describe, expect, it, vi } from 'vitest';
import { dragToSteer, holdRange, padSteer, smoothSteer } from '../src/utils/steering';
import { sanitize } from '../src/utils/settings';
import { verifyReplay } from '../src/game/verify';
import { FIXED_DT } from '../src/game/replay';
import type { HudSnapshot, RaceResult } from '../src/game/types';
import { loadEngine } from './helpers/headless';

describe('touch steering response', () => {
  it('has a dead zone, is symmetric and monotonic, and reaches full lock before the full travel', () => {
    expect(dragToSteer(0, 70)).toBe(0);
    expect(dragToSteer(5, 70)).toBe(0);
    expect(dragToSteer(-5, 70)).toBeCloseTo(0);
    let prev = 0;
    for (let dx = 0; dx <= 80; dx += 2) {
      const v = dragToSteer(dx, 70);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(dragToSteer(-dx, 70)).toBeCloseTo(-v);
      prev = v;
    }
    expect(dragToSteer(70 * 0.72 + 1, 70)).toBe(1);
    expect(dragToSteer(30, 70)).toBeLessThan(0.5); // gentle near the middle
  });

  it('holds the drag anchor just past full lock so reversing is quick', () => {
    expect(dragToSteer(holdRange(70), 70)).toBe(1);
    expect(holdRange(70)).toBeLessThan(70);
  });

  it('smoothing converges without overshoot and eases back to centre faster than it eases out', () => {
    let v = 0;
    for (let i = 0; i < 12; i++) {
      v = smoothSteer(v, 1, 1 / 60);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(v).toBeGreaterThan(0.9);
    const out = smoothSteer(0, 1, 1 / 60);
    const back = 1 - smoothSteer(1, 0, 1 / 60);
    expect(back).toBeGreaterThan(out);
    expect(smoothSteer(0.9995, 1, 1 / 60)).toBe(1);
  });

  it('arrow pads steer like keys: both held cancel', () => {
    expect(padSteer(true, false)).toBe(-1);
    expect(padSteer(false, true)).toBe(1);
    expect(padSteer(true, true)).toBe(0);
    expect(padSteer(false, false)).toBe(0);
  });

  it('settings: scheme defaults to drag, assist only follows an explicit value (or a touch device)', () => {
    expect(sanitize(null).touchScheme).toBe('drag');
    expect(sanitize({ touchScheme: 'buttons' }).touchScheme).toBe('buttons');
    expect(sanitize({ touchScheme: 'tilt' }).touchScheme).toBe('drag');
    expect(sanitize({ driftAssist: true }).driftAssist).toBe(true);
    expect(sanitize({ driftAssist: 'yes' }).driftAssist).toBe(false); // no touch screen in the test environment
  });
});

describe('drift assist', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A driver that only steers (never presses DRIFT) around a trial lap, with the assist on or off. */
  async function steerOnly(assist: boolean) {
    const store = new Map<string, string>([['turbodrift.settings.v1', JSON.stringify({ driftAssist: assist })]]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    const E = await loadEngine();
    const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop }) as unknown as CanvasRenderingContext2D;
    const canvas = { getContext: () => noop, clientWidth: 390, clientHeight: 844, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    let hud: HudSnapshot | null = null;
    let result: RaceResult | null = null;
    const e = new E({ canvas, world: 3, seed: 8, mode: 'trial', kart: 'comet', onHud: (h) => (hud = h), onFinish: (r) => (result = r) });
    const p = e as unknown as { state: string; track: { line: number[]; segments: { curve: number }[] }; seg(d: number): { index: number }; player: { dist: number; x: number }; update(dt: number): void };
    let driftTicks = 0;
    let boosts = 0;
    let wasBoosting = false;
    for (let i = 0; !result && i < 60 * 600; i++) {
      const line = p.track.line[p.seg(p.player.dist + 1200).index];
      const curve = p.track.segments[p.seg(p.player.dist).index].curve;
      // follow the racing line, but lean hard into real bends like a thumb would
      let steer = (line - p.player.x) * 3;
      if (Math.abs(curve) > 1.2) steer = Math.sign(curve);
      e.input.steer = p.state === 'countdown' ? 0 : Math.max(-1, Math.min(1, steer));
      e.input.drift = false;
      p.update(FIXED_DT);
      const h = hud as HudSnapshot | null;
      if (h && (h.driftCharge > 0 || h.driftLevel > 0)) driftTicks++;
      if (h && h.boosting && !wasBoosting) boosts++;
      wasBoosting = !!h?.boosting;
    }
    return { result: result as RaceResult | null, driftTicks, boosts };
  }

  it('starts drifts by itself in bends and pays out boosts; off, the same steering never drifts', async () => {
    const off = await steerOnly(false);
    expect(off.driftTicks).toBe(0);
    const on = await steerOnly(true);
    expect(on.driftTicks).toBeGreaterThan(30);
    expect(on.boosts).toBeGreaterThan(0);
  }, 120000);

  it('what the assist did is recorded, so the server reproduces the run without knowing about it', async () => {
    const on = await steerOnly(true);
    expect(on.result?.replay).toBeTruthy();
    const v = verifyReplay(on.result!.replay);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.lapMs).toBe(Math.round(on.result!.bestLap));
  }, 120000);
});
