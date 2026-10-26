import type { Engine as EngineType } from '../../src/game/engine';
import { FIXED_DT, type Replay } from '../../src/game/replay';
import type { RaceResult } from '../../src/game/types';

const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop }) as unknown as CanvasRenderingContext2D;
let Engine: typeof EngineType | null = null;

export async function loadEngine(): Promise<typeof EngineType> {
  if (Engine) return Engine;
  Engine = (await import('../../src/game/engine')).Engine;
  return Engine;
}

export interface Peek {
  state: string;
  track: { line: number[] };
  seg(d: number): { index: number };
  player: { dist: number; x: number };
  update(dt: number): void;
}

/** Drive a time trial at the real 60 Hz step with a line-following driver; returns the result and its replay. */
export async function recordTrial(world: number, seed: number, kart = 'comet', drive: (p: Peek, i: number) => number = (p) => (p.track.line[p.seg(p.player.dist + 1200).index] - p.player.x) * 3): Promise<{ result: RaceResult; replay: Replay }> {
  const E = await loadEngine();
  const canvas = { getContext: () => noop, clientWidth: 390, clientHeight: 844, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  let result: RaceResult | null = null;
  const e = new E({ canvas, world, seed, mode: 'trial', kart, onHud: () => {}, onFinish: (r) => (result = r) });
  const p = e as unknown as Peek;
  for (let i = 0; !result && i < 60 * 600; i++) {
    e.input.steer = Math.max(-1, Math.min(1, p.state === 'countdown' ? 0 : drive(p, i)));
    p.update(FIXED_DT);
  }
  if (!result) throw new Error('trial never finished');
  const r = result as RaceResult;
  if (!r.replay) throw new Error('no replay recorded');
  return { result: r, replay: r.replay };
}
