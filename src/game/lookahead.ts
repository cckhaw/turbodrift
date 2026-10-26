/**
 * "Road ahead": what is coming up in the next few hundred metres, from the track data.
 *
 * Conventions match the renderer: a positive curve value is a RIGHT turn. Distances are shown in metres using the
 * game's own scale (top speed 7500 units/s is shown as 240 km/h, so 1 unit ≈ 0.00889 m and a segment ≈ 1.78 m).
 */
export const M_PER_SEG = 200 * (240 / 3.6 / 7500);

export interface AheadSegment {
  curve: number;
  pad?: { offset: number };
  boxes?: number[];
  hazard?: { kind: 'wind' | 'block'; base: number };
}

export interface Bend {
  dir: -1 | 1; // -1 left, 1 right
  severity: 1 | 2 | 3; // 1 gentle, 2 medium, 3 sharp (hairpin on tracks that have them)
  distM: number; // 0 when you're already in it
  lengthM: number;
  inside: boolean;
}

export interface AheadMark {
  kind: 'pad' | 'box' | 'wind' | 'block';
  distM: number;
  lane: number; // -1..1 across the road
}

export interface Ahead {
  bend: Bend | null; // the next (or current) bend
  then: Bend | null; // the one right after it, for S-bends
  /** Points of the road ahead in a local frame: starts at (0, 0) pointing "up" (negative y), 1 unit per sample. */
  ribbon: [number, number][];
  marks: AheadMark[];
}

const START = 0.9; // |curve| at which a bend begins
const END = 0.45; // ... and ends (hysteresis stops ease-in/out wobble splitting a bend)
export const LOOK_SEGS = 170; // ≈ 300 m
const RIBBON_STEP = 4;
const RIBBON_TURN = 0.008; // radians of turn per curve unit per segment, for drawing only

export function lookAhead(segments: readonly AheadSegment[], from: number, curveMax: number): Ahead {
  const N = segments.length;
  const at = (k: number) => segments[(((from + k) % N) + N) % N];

  const bends: Bend[] = [];
  let k = 0;
  while (k < LOOK_SEGS && bends.length < 2) {
    const c = at(k).curve;
    if (Math.abs(c) < START) {
      k++;
      continue;
    }
    const dir = c > 0 ? 1 : -1;
    const startK = k;
    let peak = 0;
    while (k < LOOK_SEGS + 60 && Math.sign(at(k).curve) === dir && Math.abs(at(k).curve) >= END) {
      peak = Math.max(peak, Math.abs(at(k).curve));
      k++;
    }
    const ratio = peak / curveMax;
    bends.push({
      dir,
      severity: ratio >= 0.75 ? 3 : ratio >= 0.45 ? 2 : 1,
      distM: Math.round(startK * M_PER_SEG),
      lengthM: Math.round((k - startK) * M_PER_SEG),
      inside: startK === 0,
    });
  }

  // the road drawn as a ribbon
  const ribbon: [number, number][] = [[0, 0]];
  let h = -Math.PI / 2;
  let x = 0;
  let y = 0;
  for (let i = 0; i < LOOK_SEGS; i += RIBBON_STEP) {
    let turn = 0;
    for (let j = 0; j < RIBBON_STEP; j++) turn += at(i + j).curve * RIBBON_TURN;
    h += turn;
    x += Math.cos(h);
    y += Math.sin(h);
    ribbon.push([x, y]);
  }

  const marks: AheadMark[] = [];
  for (let i = 1; i < LOOK_SEGS; i++) {
    const s = at(i);
    const prev = at(i - 1);
    if (s.pad && !prev.pad) marks.push({ kind: 'pad', distM: Math.round(i * M_PER_SEG), lane: s.pad.offset });
    if (s.boxes) marks.push({ kind: 'box', distM: Math.round(i * M_PER_SEG), lane: 0 });
    if (s.hazard) marks.push({ kind: s.hazard.kind, distM: Math.round(i * M_PER_SEG), lane: s.hazard.base });
  }

  return { bend: bends[0] ?? null, then: bends[1] ?? null, ribbon, marks };
}

export function bendLabel(b: Bend, hairpinTrack: boolean): string {
  const side = b.dir < 0 ? 'left' : 'right';
  const name = b.severity === 3 ? (hairpinTrack ? 'Hairpin' : 'Sharp') : b.severity === 2 ? 'Bend' : 'Gentle';
  return b.severity === 3 && hairpinTrack ? `Hairpin ${side}` : `${name} ${side}`;
}
