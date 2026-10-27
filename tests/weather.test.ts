import { describe, expect, it } from 'vitest';
import { DAY_SECONDS, WIND_PUSH, rainCentrifugal, rainSteering, weatherAt } from '../src/game/weather';
import { WORLDS } from '../src/game/worlds';
import { verifyReplay } from '../src/game/verify';
import { recordRace, recordTrial } from './helpers/headless';

const samples = (from: number, to: number, step: number) => {
  const out = [];
  for (let t = from; t <= to; t += step) out.push(weatherAt(t));
  return out;
};

describe('storm weather', () => {
  it('is a pure function of time: identical every call, so replays see the same sky', () => {
    for (const t of [0, 3.3, 77, 123.4, 999]) expect(weatherAt(t)).toEqual(weatherAt(t));
  });

  it('stays inside its ranges for hours of play', () => {
    for (const w of samples(0, 3 * 3600, 1.7)) {
      expect(w.day).toBeGreaterThanOrEqual(0);
      expect(w.day).toBeLessThanOrEqual(1);
      expect(w.rain).toBeGreaterThanOrEqual(0);
      expect(w.rain).toBeLessThanOrEqual(1);
      expect(Math.abs(w.wind)).toBeLessThanOrEqual(1);
      expect(w.gust).toBeGreaterThanOrEqual(0);
      expect(w.gust).toBeLessThanOrEqual(1);
      expect(w.lightning).toBeGreaterThanOrEqual(0);
      expect(w.lightning).toBeLessThanOrEqual(1);
      expect(w.phase).toBeGreaterThanOrEqual(0);
      expect(w.phase).toBeLessThan(1);
    }
  });

  it('starts bright and dry, then goes through night, rain and gusts both ways', () => {
    const start = weatherAt(0);
    expect(start.day).toBeGreaterThan(0.9);
    expect(start.rain).toBeLessThan(0.05);
    const cycle = samples(0, DAY_SECONDS * 2, 0.5);
    expect(Math.min(...cycle.map((w) => w.day))).toBeLessThan(0.05); // dead of night
    expect(Math.max(...cycle.map((w) => w.day))).toBeGreaterThan(0.95);
    expect(Math.max(...cycle.map((w) => w.rain))).toBeGreaterThan(0.9); // downpour
    expect(Math.min(...cycle.map((w) => w.rain))).toBeLessThan(0.05); // dry spells
    expect(Math.max(...cycle.map((w) => w.wind))).toBeGreaterThan(0.5);
    expect(Math.min(...cycle.map((w) => w.wind))).toBeLessThan(-0.5);
  });

  it('changes smoothly: no sudden jump in light, rain or wind', () => {
    let prev = weatherAt(0);
    for (let t = 0.1; t < 600; t += 0.1) {
      const w = weatherAt(t);
      expect(Math.abs(w.day - prev.day)).toBeLessThan(0.02);
      expect(Math.abs(w.rain - prev.rain)).toBeLessThan(0.03);
      expect(Math.abs(w.wind - prev.wind)).toBeLessThan(0.08);
      prev = w;
    }
  });

  it('lightning only comes with heavy rain, and does happen', () => {
    let seen = 0;
    for (const w of samples(0, 1800, 0.05)) {
      if (w.lightning > 0) {
        seen++;
        expect(w.rain).toBeGreaterThan(0.55);
      }
    }
    expect(seen).toBeGreaterThan(5);
  });

  it('rain makes the road greasier but never impossible', () => {
    expect(rainCentrifugal(0)).toBe(1);
    expect(rainCentrifugal(1)).toBeGreaterThan(1.2);
    expect(rainCentrifugal(1)).toBeLessThan(1.6);
    expect(rainSteering(0)).toBe(1);
    expect(rainSteering(1)).toBeGreaterThan(0.8);
    expect(WIND_PUSH).toBeGreaterThan(0.3);
    expect(WIND_PUSH).toBeLessThan(1.2);
  });
});

describe('Tempest Peak (the god-level world)', () => {
  const w5 = WORLDS.find((w) => w.id === 5)!;

  it('is the hardest world: narrowest road, sharpest bends, falls, barriers and a changing sky', () => {
    expect(w5.difficulty).toBe('God');
    expect(w5.weather).toBe(true);
    expect(w5.fallOff).toBe(true);
    expect(w5.blocks).toBe(true);
    for (const w of WORLDS.filter((x) => x.id !== 5)) {
      expect(w5.roadWidth).toBeLessThanOrEqual(w.roadWidth);
      expect(w5.curveMax).toBeGreaterThanOrEqual(w.curveMax);
      expect(w5.botPace).toBeGreaterThanOrEqual(w.botPace);
      expect(w.weather).toBeUndefined();
    }
  });

  it('is replayed exactly by the server, wind, rain and all (time trial)', async () => {
    const r = await recordTrial(5, 7, 'comet', undefined, 1);
    const v = verifyReplay(r.replay);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.lapMs).toBe(Math.round(r.result.bestLap));
      expect(v.totalMs).toBe(Math.round(r.result.totalTime));
    }
  }, 120000);

  it('is replayed exactly for a race against bots too', async () => {
    const r = await recordRace(5, 7, 'comet', 1);
    const v = verifyReplay(r.replay);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.totalMs).toBe(Math.round(r.result.totalTime));
  }, 120000);
});
