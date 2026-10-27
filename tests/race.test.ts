import { beforeAll, describe, expect, it } from 'vitest';
import type { Engine as EngineType } from '../src/game/engine';
import type { RaceResult } from '../src/game/types';
import { WORLDS } from '../src/game/worlds';

// The engine only touches the canvas/DOM for rendering and sizing, so a no-op 2D context lets us
// run whole races headlessly by stepping `update()` directly.
const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop }) as unknown as CanvasRenderingContext2D;
let Engine: typeof EngineType;

beforeAll(async () => {
  ({ Engine } = await import('../src/game/engine'));
});

interface CarPeek {
  dist: number;
  x: number;
  speed: number;
  spinT: number;
  shieldT: number;
  item: string | null;
  isPlayer: boolean;
}
interface Peek {
  state: string;
  track: { line: number[] };
  seg(d: number): { index: number };
  cars: CarPeek[];
  player: CarPeek;
  fallT: number;
  oils: unknown[];
  missiles: unknown[];
  update(dt: number): void;
}
type Extra = { mode?: 'race' | 'trial'; kart?: string };

function make(world: number, seed: number, extra: Extra = {}) {
  const canvas = { getContext: () => noop, clientWidth: 390, clientHeight: 844, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  let result: RaceResult | null = null;
  const e = new Engine({ canvas, world, seed, onHud: () => {}, onFinish: (r) => (result = r), ...extra });
  return { e, p: e as unknown as Peek, result: () => result };
}

/** Step past the countdown. */
function startRacing(p: Peek) {
  for (let i = 0; i < 200 && p.state === 'countdown'; i++) p.update(1 / 30);
  expect(p.state).toBe('racing');
}

function race(world: number, seed: number, drive: boolean, extra: Extra = {}): { result: RaceResult; falls: number } {
  const { e, p, result } = make(world, seed, extra);
  let falls = 0;
  let wasFallen = false;
  for (let t = 0; !result() && t < 600; t += 1 / 30) {
    if (p.state !== 'countdown' && drive) {
      const line = p.track.line[p.seg(p.player.dist + 1200).index];
      e.input.steer = Math.max(-1, Math.min(1, (line - p.player.x) * 3));
    }
    p.update(1 / 30);
    if (p.fallT > 0 && !wasFallen) falls++;
    wasFallen = p.fallT > 0;
  }
  const r = result();
  if (!r) throw new Error('race never finished');
  return { result: r, falls };
}

describe('headless races', () => {
  for (const w of WORLDS) {
    it(`world ${w.id}: a line-following driver finishes 3 laps and the bots stay close`, () => {
      const { result } = race(w.id, 4242, true);
      expect(result.mode).toBe('race');
      expect(result.total).toBe(6);
      expect(result.lapTimes).toHaveLength(3);
      expect(result.bestLap).toBeGreaterThan(20000);
      expect(result.standings).toHaveLength(6);
      // rubber-banding: every bot finishes within 10 s of the leader even though the driver never crashes
      const times = result.standings.map((s) => s.time as number);
      expect(Math.max(...times) - Math.min(...times)).toBeLessThan(10000);
      expect(result.standings.filter((s) => s.you)).toHaveLength(1);
    }, 60000);
  }

  it('a driver who never steers does badly on the sky track (falls) but the race still ends', () => {
    const { result, falls } = race(2, 4242, false);
    expect(falls).toBeGreaterThan(0);
    expect(result.position).toBeGreaterThan(1);
  }, 60000);

  it('is deterministic for the same seed, including bot item use', () => {
    const a = race(1, 99, true).result;
    const b = race(1, 99, true).result;
    expect(b.totalTime).toBe(a.totalTime);
    expect(b.position).toBe(a.position);
    expect(b.standings.map((s) => Math.round(s.time as number))).toEqual(a.standings.map((s) => Math.round(s.time as number)));
  }, 60000);
});

describe('time trial', () => {
  it('is a solo run with no bots and a finish after 3 laps', () => {
    const { p } = make(1, 5, { mode: 'trial' });
    expect(p.cars).toHaveLength(1);
    const { result } = race(1, 5, true, { mode: 'trial' });
    expect(result.mode).toBe('trial');
    expect(result.total).toBe(1);
    expect(result.position).toBe(1);
    expect(result.lapTimes).toHaveLength(3);
  }, 60000);

  it('never hands out items', () => {
    const { p, e } = make(1, 5, { mode: 'trial' });
    startRacing(p);
    for (let i = 0; i < 30 * 60; i++) {
      e.input.steer = Math.max(-1, Math.min(1, (p.track.line[p.seg(p.player.dist + 1200).index] - p.player.x) * 3));
      p.update(1 / 30);
    }
    expect(p.player.item).toBeNull();
  });
});

describe('karts', () => {
  it('the speedster out-runs the balanced kart on a clean line', () => {
    const rocket = race(1, 77, true, { mode: 'trial', kart: 'rocket' }).result.bestLap;
    const comet = race(1, 77, true, { mode: 'trial', kart: 'comet' }).result.bestLap;
    expect(rocket).toBeLessThan(comet);
  }, 60000);
});

describe('items', () => {
  function setup() {
    const m = make(1, 31);
    startRacing(m.p);
    // a bot 2500 units ahead in our lane, driving straight
    const bots = m.p.cars.filter((c) => !c.isPlayer);
    const bot = bots[0];
    bot.dist = m.p.player.dist + 2500;
    bot.x = m.p.player.x;
    // everyone else goes to the far side of the loop so they can't interfere
    for (const o of bots.slice(1)) o.dist = m.p.player.dist + 60000;
    return { ...m, bot };
  }

  it('a missile spins out the car ahead', () => {
    const { p, bot } = setup();
    p.player.item = 'missile';
    (p as unknown as { useItem(): void }).useItem();
    p.update(1 / 60); // a press takes effect at the start of the next fixed step
    expect(p.missiles).toHaveLength(1);
    let hit = false;
    for (let i = 0; i < 60 && !hit; i++) {
      p.update(1 / 30);
      hit = bot.spinT > 0;
    }
    expect(hit).toBe(true);
    expect(p.missiles).toHaveLength(0);
  });

  it('a shield absorbs one hit', () => {
    const { p, bot } = setup();
    bot.shieldT = 5;
    p.player.item = 'missile';
    (p as unknown as { useItem(): void }).useItem();
    for (let i = 0; i < 60; i++) p.update(1 / 30);
    expect(bot.spinT).toBe(0);
    expect(bot.shieldT).toBe(0);
  });

  it('oil spins a car that drives through it, and the dropper is not hit by their own oil', () => {
    const { p, bot } = setup();
    p.player.item = 'oil';
    (p as unknown as { useItem(): void }).useItem();
    p.update(1 / 60); // a press takes effect at the start of the next fixed step
    expect(p.oils).toHaveLength(1);
    expect(p.player.spinT).toBe(0);
    for (let i = 0; i < 10; i++) p.update(1 / 30);
    expect(p.player.spinT).toBe(0);
    // park a bot on the slick
    (p.oils[0] as { dist: number; x: number }).dist = bot.dist;
    (p.oils[0] as { dist: number; x: number }).x = bot.x;
    p.update(1 / 30);
    expect(bot.spinT).toBeGreaterThan(0);
    expect(p.oils).toHaveLength(0);
  });

  it('cannot be used during the countdown or with nothing held', () => {
    const { p } = make(1, 31);
    p.player.item = 'oil';
    (p as unknown as { useItem(): void }).useItem();
    expect(p.oils).toHaveLength(0);
    startRacing(p);
    p.player.item = null;
    (p as unknown as { useItem(): void }).useItem();
    expect(p.oils).toHaveLength(0);
  });
});
