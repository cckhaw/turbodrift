import { describe, expect, it } from 'vitest';
import { bendLabel, lookAhead, LOOK_SEGS, M_PER_SEG, type AheadSegment } from '../src/game/lookahead';
import { generateTrack } from '../src/game/track';
import { WORLDS } from '../src/game/worlds';

const straight = (n: number): AheadSegment[] => Array.from({ length: n }, () => ({ curve: 0 }));
/** a track of `n` segments with the given curve values written at `at` */
function track(n: number, at: number, curves: number[]): AheadSegment[] {
  const t = straight(n);
  curves.forEach((c, i) => (t[(at + i) % n] = { curve: c }));
  return t;
}
const ramp = (peak: number, hold: number) => [peak * 0.3, peak * 0.7, ...Array(hold).fill(peak), peak * 0.7, peak * 0.3];

describe('look ahead', () => {
  it('sees nothing on a straight', () => {
    const a = lookAhead(straight(400), 0, 3);
    expect(a.bend).toBeNull();
    expect(a.then).toBeNull();
    expect(a.marks).toEqual([]);
    expect(a.ribbon.every(([x]) => Math.abs(x) < 1e-9)).toBe(true); // goes straight up
  });

  it('finds the next bend: direction (positive = right), distance and size', () => {
    const t = track(600, 50, ramp(2.5, 20)); // starts a little after segment 50
    const right = lookAhead(t, 10, 3);
    expect(right.bend).toMatchObject({ dir: 1, inside: false, severity: 3 });
    expect(right.bend!.distM).toBeGreaterThan(30 * M_PER_SEG);
    expect(right.bend!.distM).toBeLessThan(45 * M_PER_SEG);
    expect(right.bend!.lengthM).toBeGreaterThan(15 * M_PER_SEG);

    const left = lookAhead(track(600, 50, ramp(-1.4, 20)), 10, 3);
    expect(left.bend).toMatchObject({ dir: -1, severity: 2 });
    expect(lookAhead(track(600, 50, ramp(1.0, 20)), 10, 3).bend!.severity).toBe(1); // gentle
  });

  it('says when you are already in a bend, and reports the next one after it (S-bends)', () => {
    const t = track(600, 20, [...ramp(2, 15), 0, 0, 0, 0, 0, 0, 0, 0, ...ramp(-2, 15)]);
    const a = lookAhead(t, 25, 3);
    expect(a.bend).toMatchObject({ dir: 1, inside: true, distM: 0 });
    expect(a.then).toMatchObject({ dir: -1, inside: false });
    expect(a.then!.distM).toBeGreaterThan(a.bend!.lengthM * 0.3);
  });

  it('ignores bends beyond the look-ahead window', () => {
    expect(lookAhead(track(900, 400, ramp(2.5, 20)), 0, 3).bend).toBeNull();
    expect(lookAhead(track(900, LOOK_SEGS - 20, ramp(2.5, 20)), 0, 3).bend).not.toBeNull();
  });

  it('wraps past the finish line', () => {
    const n = 500;
    const t = track(n, 10, ramp(-2.5, 12)); // bend just after the line
    const a = lookAhead(t, n - 20, 3); // we are 20 segments before the line
    expect(a.bend).toMatchObject({ dir: -1 });
    expect(a.bend!.distM).toBeLessThan(40 * M_PER_SEG);
  });

  it('the road ribbon bends the same way as the bend', () => {
    const r = lookAhead(track(600, 20, ramp(2.5, 30)), 0, 3).ribbon;
    const l = lookAhead(track(600, 20, ramp(-2.5, 30)), 0, 3).ribbon;
    expect(r[r.length - 1][0]).toBeGreaterThan(5); // ends up to the right of where it started
    expect(l[l.length - 1][0]).toBeLessThan(-5);
    expect(r[r.length - 1][1]).toBeLessThan(0); // and still heads forward (up)
  });

  it('lists boost pads, item boxes and hazards with their distance and lane', () => {
    const t = straight(500) as AheadSegment[];
    t[20] = { curve: 0, pad: { offset: 0.3 } };
    t[21] = { curve: 0, pad: { offset: 0.3 } }; // a pad covers several segments but is one mark
    t[40] = { curve: 0, boxes: [-0.55, 0, 0.55] };
    t[60] = { curve: 0, hazard: { kind: 'wind', base: -0.2 } };
    t[80] = { curve: 0, hazard: { kind: 'block', base: 0.4 } };
    const marks = lookAhead(t, 0, 3).marks;
    expect(marks.map((m) => m.kind)).toEqual(['pad', 'box', 'wind', 'block']);
    expect(marks[0]).toMatchObject({ lane: 0.3, distM: Math.round(20 * M_PER_SEG) });
    expect(marks[2].lane).toBe(-0.2);
    expect(lookAhead(t, 100, 3).marks).toEqual([]); // all behind us
  });

  it('works on every generated track and always reports sane values', () => {
    for (const w of WORLDS) {
      const segs = generateTrack(w.id, 2024).segments;
      let bends = 0;
      for (let i = 0; i < segs.length; i += 7) {
        const a = lookAhead(segs, i, w.curveMax);
        if (a.bend) {
          bends++;
          expect([-1, 1]).toContain(a.bend.dir);
          expect([1, 2, 3]).toContain(a.bend.severity);
          expect(a.bend.distM).toBeGreaterThanOrEqual(0);
          expect(a.bend.distM).toBeLessThanOrEqual(LOOK_SEGS * M_PER_SEG);
        }
        expect(a.ribbon.length).toBeGreaterThan(10);
      }
      expect(bends).toBeGreaterThan(20); // there is always something coming up on a real track
    }
  });

  it('labels bends for the HUD', () => {
    const b = { dir: -1 as const, severity: 3 as const, distM: 80, lengthM: 40, inside: false };
    expect(bendLabel(b, true)).toBe('Hairpin left');
    expect(bendLabel(b, false)).toBe('Sharp left');
    expect(bendLabel({ ...b, dir: 1, severity: 2 }, true)).toBe('Bend right');
    expect(bendLabel({ ...b, dir: 1, severity: 1 }, true)).toBe('Gentle right');
  });
});
