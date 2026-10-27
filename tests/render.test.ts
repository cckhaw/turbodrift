import { describe, expect, it } from 'vitest';
import { drawHazard, drawItemBox, drawKart, drawProp } from '../src/game/draw';
import { drawBackdrop, drawGround, drawRoadside, makeBackdrop } from '../src/game/scene';
import { drawScenery } from '../src/game/scenery';
import { gfxState } from '../src/game/gfx';
import { generateTrack } from '../src/game/track';
import { WORLDS } from '../src/game/worlds';
import type { Scenery, SceneryKind } from '../src/game/types';
import { Rng } from '../src/utils/rng';

/**
 * A canvas stand-in that records problems instead of drawing: non-finite numbers, and the negative radii that make a
 * real browser throw (arc, ellipse, radial gradients). Browsers silently ignore NaN, so without this a broken sprite
 * just shows up as something missing on a phone.
 */
function recorder() {
  const problems: string[] = [];
  const state: Record<string, unknown> = { canvas: { width: 780, height: 1688 } };
  const gradient = { addColorStop: () => undefined };
  const ctx = new Proxy(state, {
    get(_t, prop: string) {
      if (prop in state) return state[prop];
      return (...a: unknown[]) => {
        const nums = a.filter((x): x is number => typeof x === 'number');
        if (nums.some((n) => !Number.isFinite(n))) problems.push(`${prop}(${a.join(',')}) has a non-finite argument`);
        if (prop === 'arc' && (a[2] as number) < 0) problems.push(`arc with negative radius ${a[2]}`);
        if (prop === 'ellipse' && ((a[2] as number) < 0 || (a[3] as number) < 0)) problems.push(`ellipse with negative radius ${a[2]},${a[3]}`);
        if (prop === 'createRadialGradient' && ((a[2] as number) < 0 || (a[5] as number) < 0)) problems.push(`radial gradient with negative radius ${a[2]},${a[5]}`);
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradient;
        if (prop === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(_t, prop: string, v) {
      state[prop] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, problems };
}

const ALL: SceneryKind[] = ['tower', 'sign', 'pylon', 'cloud', 'island', 'rock', 'lavaPillar', 'crystal', 'shop', 'lamp', 'crowd', 'palm', 'arch', 'bunting', 'turbine', 'balloon', 'ring', 'torch', 'gantry', 'cactus', 'butte', 'roadsign', 'shrub', 'flag', 'truck'];

describe('the recorder', () => {
  it('flags the mistakes a real canvas would choke on', () => {
    const { ctx, problems } = recorder();
    ctx.arc(0, 0, -2, 0, 1);
    ctx.ellipse(0, 0, 5, -1, 0, 0, 1);
    ctx.createRadialGradient(0, 0, 0, 0, 0, -3);
    ctx.fillRect(Number.NaN, 0, 1, 1);
    expect(problems).toHaveLength(4);
  });
});

describe('scene drawing', () => {
  it.each([false, true])('every sprite draws cleanly at every distance, world and variation (lite = %s)', (lite) => {
    gfxState.lite = lite;
    try {
      const { ctx, problems } = recorder();
      for (const wd of WORLDS) {
        for (const kind of ALL) {
          for (const u of [0.0004, 0.002, 0.01, 0.05, 0.2, 1, 4]) {
            for (const hue of [0, 0.31, 0.77, 0.999]) {
              for (const offset of [-3, -1.3, 0, 1.3, 3]) {
                const s: Scenery = { kind, offset, size: 0.8 + hue, hue, label: kind === 'arch' && hue > 0.5 ? 'START' : undefined };
                drawScenery(ctx, s, 390 + offset * 100, 600, u, wd, hue > 0.5 ? 300 : 0, hue * 17, 390, 844);
              }
            }
          }
        }
      }
      expect(problems.slice(0, 5)).toEqual([]);
    } finally {
      gfxState.lite = false;
    }
  });

  it('backdrop, ground and roadside draw cleanly in every world over time and scroll', () => {
    for (const lite of [false, true]) {
      gfxState.lite = lite;
      for (const wd of WORLDS) {
        const { ctx, problems } = recorder();
        const bd = makeBackdrop(() => new Rng(wd.id).next());
        for (const [W, H] of [[780, 1688], [1280, 720], [320, 480]]) {
          for (const t of [0, 1.7, 9.3, 120]) {
            for (const scroll of [0, 513, -9000, 1e6]) {
              const hz = Math.round(H * 0.37);
              drawBackdrop(ctx, W, H, hz, wd, bd, scroll, t);
              drawGround(ctx, W, H, hz, wd, t);
            }
          }
        }
        const poly = () => undefined;
        for (const idx of [0, 1, 5, 400]) drawRoadside(ctx, wd, { x: 390, y: 900, w: 500 }, { x: 392, y: 880, w: 480 }, idx % 2, idx, poly);
        expect(problems.slice(0, 5)).toEqual([]);
      }
    }
    gfxState.lite = false;
  });

  it('karts, items, hazards and props draw cleanly in every state', () => {
    const { ctx, problems } = recorder();
    for (const shape of ['comet', 'rocket', 'phantom'] as const)
      for (const w of [3, 8, 40, 160, 400])
        for (const fx of [
          { tilt: 0, drift: 0, boost: false, flicker: 0, fall: 0, blink: false },
          { tilt: -1, drift: 1, boost: true, flicker: 1, fall: 0.5, blink: true, spin: 0.4, shield: true },
          { tilt: 1, drift: -1, boost: true, flicker: 0.3, fall: 1, blink: false, spin: 1 },
        ])
          drawKart(ctx, 390, 700, w, '#007AFF', '#5AC8FA', { ...fx, shape }, 0);
    for (const u of [0.001, 0.02, 0.3, 2]) {
      drawItemBox(ctx, 200, 500, u, 3.3, 1, 0);
      drawProp(ctx, 'oil', 200, 500, u, 2, 0);
      drawProp(ctx, 'missile', 200, 500, u, 2, 100);
      drawHazard(ctx, { kind: 'wind', base: 0, amp: 0.4, speed: 1, phase: 0, width: 0.2 }, 200, 500, u, 2600, 4, 0);
      drawHazard(ctx, { kind: 'block', base: 0.2, amp: 0, speed: 0, phase: 0, width: 0.17 }, 200, 500, u, 1900, 4, 0);
      drawHazard(ctx, { kind: 'block', base: 0.2, amp: 0, speed: 0, phase: 1, width: 0.17 }, 200, 500, u, 2400, 4, 0, true); // traffic barrels
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });
});

describe('track dressing', () => {
  it('adds street furniture and set pieces without touching the gameplay layout', () => {
    for (const w of [1, 2, 3, 4]) {
      const t = generateTrack(w, 4242);
      const kinds = new Set(t.segments.flatMap((s) => s.scenery.map((x) => x.kind)));
      expect(kinds.has(w === 3 ? 'torch' : 'lamp')).toBe(true);
      expect(kinds.has(w === 1 || w === 4 ? 'arch' : w === 2 ? 'ring' : 'gantry')).toBe(true);
      if (w === 4) expect(kinds.has('flag') && kinds.has('truck')).toBe(true);
      expect(t.segments[4].scenery.some((x) => x.kind === 'arch' && x.label === 'START')).toBe(true);
      // the same seed gives identical dressing
      const again = generateTrack(w, 4242);
      expect(again.segments.map((s) => s.scenery.length)).toEqual(t.segments.map((s) => s.scenery.length));
    }
  });
});
