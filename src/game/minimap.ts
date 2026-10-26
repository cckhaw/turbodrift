/**
 * A schematic top-down map of a lap, built from the track's curve data.
 *
 * The game's tracks are described by per-segment curvature, which doesn't form a closed loop on its own, so the
 * heading is nudged by a steady trend until the lap turns exactly once and the small leftover gap is spread along
 * the path. The result is a closed loop that keeps the character of the real track (where the bends and hairpins
 * are, and which way they go) without being to scale.
 */
export interface TrackMap {
  /** Sample points (closed: the last equals the first), in a 0..100 box. */
  pts: [number, number][];
  /** Track segments between consecutive samples. */
  stride: number;
  /** Number of segments in a lap. */
  n: number;
}

export function buildTrackMap(curves: number[], stride = 6, pad = 9): TrackMap {
  const n = curves.length;
  const integral = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) integral[i + 1] = integral[i] + curves[i];
  const range = Math.max(...integral) - Math.min(...integral) || 1;
  const k = 2.6 / range; // radians of heading swing per unit of curve-sum, so every world uses a similar amount of the map
  const trend = (2 * Math.PI - k * integral[n]) / n; // makes the lap turn exactly once

  const xs = [0];
  const ys = [0];
  for (let i = 0; i < n; i++) {
    const h = k * integral[i] + trend * i;
    xs.push(xs[i] + Math.cos(h));
    ys.push(ys[i] + Math.sin(h));
  }
  // close the loop: spread the remaining gap along the path
  const ex = xs[n];
  const ey = ys[n];
  const raw: [number, number][] = [];
  for (let i = 0; i < n; i += stride) raw.push([xs[i] - (ex * i) / n, ys[i] - (ey * i) / n]);
  raw.push(raw[0]);

  const minX = Math.min(...raw.map((p) => p[0]));
  const maxX = Math.max(...raw.map((p) => p[0]));
  const minY = Math.min(...raw.map((p) => p[1]));
  const maxY = Math.max(...raw.map((p) => p[1]));
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = (100 - 2 * pad) / span;
  const offX = (100 - (maxX - minX) * scale) / 2 - minX * scale;
  const offY = (100 - (maxY - minY) * scale) / 2 - minY * scale;
  return { pts: raw.map(([x, y]) => [x * scale + offX, y * scale + offY]), stride, n };
}

/** Point on the map for a position `t` (0..1) around the lap. */
export function pointAt(map: TrackMap, t: number): [number, number] {
  const f = (((t % 1) + 1) % 1) * (map.pts.length - 1);
  const i = Math.floor(f);
  const a = map.pts[i];
  const b = map.pts[Math.min(i + 1, map.pts.length - 1)];
  const u = f - i;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

/** SVG path data for the part of the lap between two positions (t0 → t1, wrapping past the finish line). */
export function pathBetween(map: TrackMap, t0: number, t1: number, steps = 24): string {
  const span = (((t1 - t0) % 1) + 1) % 1;
  let d = '';
  for (let s = 0; s <= steps; s++) {
    const [x, y] = pointAt(map, t0 + (span * s) / steps);
    d += `${s === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

export const closedPath = (map: TrackMap): string => map.pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z';

/** Readable text colour for a dot of the given #rrggbb colour. */
export function labelColor(hex: string): string {
  const v = parseInt(hex.replace('#', ''), 16);
  const lum = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  return lum > 0.62 ? '#10131c' : '#ffffff';
}
