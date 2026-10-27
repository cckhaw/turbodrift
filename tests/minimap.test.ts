import { describe, expect, it } from 'vitest';
import { generateTrack } from '../src/game/track';
import { WORLDS } from '../src/game/worlds';
import { buildTrackMap, closedPath, labelColor, pathBetween, pointAt } from '../src/game/minimap';

const curvesOf = (world: number, seed: number) => generateTrack(world, seed).segments.map((s) => s.curve);

describe('track map', () => {
  it('is a closed loop that fits the box, for every world and many seeds', () => {
    for (const w of WORLDS) {
      for (let seed = 1; seed <= 25; seed++) {
        const m = buildTrackMap(curvesOf(w.id, seed * 977));
        const first = m.pts[0];
        const last = m.pts[m.pts.length - 1];
        expect(last).toEqual(first);
        for (const [x, y] of m.pts) {
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(100);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(100);
        }
        // not squashed into a line: both dimensions use a decent share of the box
        const xs = m.pts.map((p) => p[0]);
        const ys = m.pts.map((p) => p[1]);
        const w2 = Math.max(...xs) - Math.min(...xs);
        const h2 = Math.max(...ys) - Math.min(...ys);
        expect(Math.min(w2, h2)).toBeGreaterThan(18);
      }
    }
  });

  it('never pinches or crosses itself, so the outline stays readable', () => {
    let worst = Infinity;
    for (const w of WORLDS) {
      for (let seed = 1; seed <= 40; seed++) {
        const m = buildTrackMap(curvesOf(w.id, seed * 613));
        const n = m.pts.length - 1; // closed: last == first
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const around = Math.min(j - i, n - (j - i)); // distance along the lap in samples
            if (around < 10) continue; // neighbours are supposed to be close
            worst = Math.min(worst, Math.hypot(m.pts[i][0] - m.pts[j][0], m.pts[i][1] - m.pts[j][1]));
          }
        }
      }
    }
    expect(worst).toBeGreaterThan(3);
  });

  it('is deterministic and differs between tracks', () => {
    const a = buildTrackMap(curvesOf(2, 5));
    expect(buildTrackMap(curvesOf(2, 5))).toEqual(a);
    expect(buildTrackMap(curvesOf(2, 6)).pts).not.toEqual(a.pts);
  });

  it('places racers around the lap and wraps past the finish line', () => {
    const m = buildTrackMap(curvesOf(1, 3));
    expect(pointAt(m, 0)).toEqual(m.pts[0]);
    const [x1, y1] = pointAt(m, 1);
    expect(x1).toBeCloseTo(m.pts[0][0]);
    expect(y1).toBeCloseTo(m.pts[0][1]);
    expect(pointAt(m, -0.25)).toEqual(pointAt(m, 0.75)); // grid slots behind the line
    const mid = pointAt(m, 0.5);
    expect(Number.isFinite(mid[0])).toBe(true);
    // moving along the lap moves along the map in small steps (no teleporting)
    let prev = pointAt(m, 0);
    for (let t = 0.01; t <= 1; t += 0.01) {
      const p = pointAt(m, t);
      expect(Math.hypot(p[0] - prev[0], p[1] - prev[1])).toBeLessThan(8);
      prev = p;
    }
  });

  it('builds svg path data, including a stretch that wraps the finish line', () => {
    const m = buildTrackMap(curvesOf(3, 9));
    expect(closedPath(m).startsWith('M')).toBe(true);
    expect(closedPath(m).endsWith('Z')).toBe(true);
    const ahead = pathBetween(m, 0.95, 0.1);
    expect(ahead.startsWith('M')).toBe(true);
    expect((ahead.match(/L/g) ?? []).length).toBe(24);
  });

  it('picks a readable label colour', () => {
    expect(labelColor('#ffd60a')).toBe('#10131c'); // yellow dot -> dark text
    expect(labelColor('#ffffff')).toBe('#10131c');
    expect(labelColor('#007AFF')).toBe('#ffffff');
    expect(labelColor('#bf5af2')).toBe('#ffffff');
  });
});

describe('map polish', () => {
  it('marks item-box rows and boost pads once each, inside the lap', async () => {
    const { generateTrack } = await import('../src/game/track');
    const { trackMarks } = await import('../src/game/minimap');
    for (const world of [1, 2, 3, 4, 5]) {
      const t = generateTrack(world, 11);
      const marks = trackMarks(t.segments);
      expect(marks.some((m) => m.kind === 'box')).toBe(true);
      expect(marks.some((m) => m.kind === 'pad')).toBe(true);
      for (const m of marks) {
        expect(m.t).toBeGreaterThanOrEqual(0);
        expect(m.t).toBeLessThan(1);
      }
      expect(marks.filter((m) => m.kind === 'pad').length).toBe(t.segments.filter((s, i) => s.pad && !t.segments[(i - 1 + t.segments.length) % t.segments.length].pad).length);
    }
  });

  it('spreads a standing-start pack so no two dots overlap, and leaves you where you are', async () => {
    const { generateTrack } = await import('../src/game/track');
    const { buildTrackMap, declutter, pointAt } = await import('../src/game/minimap');
    const map = buildTrackMap(generateTrack(1, 3).segments.map((s) => s.curve));
    const pack = [0, 1, 2, 3, 4, 5].map((id) => ({ id, t: 0.0005 * (id % 2), you: id === 2 }));
    const spots = declutter(map, pack);
    const pts = [...spots.values()];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])).toBeGreaterThan(5);
    const mine = spots.get(2)!;
    const home = pointAt(map, pack[2].t);
    expect(Math.hypot(mine[0] - home[0], mine[1] - home[1])).toBeLessThan(0.001);
  });
});
