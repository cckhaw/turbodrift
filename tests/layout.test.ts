import { describe, expect, it } from 'vitest';
import { generateTrack } from '../src/game/track';

/**
 * Golden fingerprints of the gameplay layout (curves, hills, pads, hazards, item boxes, racing line) for a few tracks,
 * taken before the visual overhaul. Decoration must never change them: replays, ghosts and the leaderboard depend on
 * every seed giving the same road, pads and boxes forever. If this fails after an intentional gameplay change, the
 * existing leaderboard times for those seeds are no longer comparable.
 */
const GOLDEN: Record<string, string> = {
  "1:1": "1516:60385a1f:-171162",
  "1:5": "1592:62612e49:237833",
  "1:4242": "1568:ebd30b47:26595",
  "1:98765": "1593:d3357918:-92798",
  "2:1": "1870:f4df97ac:77254",
  "2:5": "1938:96e0db4c:-16679",
  "2:4242": "1867:1e93780:79909",
  "2:98765": "1899:47d72a6:133219",
  "3:1": "2059:d4d3400:-54267",
  "3:5": "2061:134a0dda:419360",
  "3:4242": "2093:e3ffce1f:-83456",
  "3:98765": "2010:b6e6af1b:278361"
};

const fingerprint = (world: number, seed: number): string => {
  const t = generateTrack(world, seed);
  const parts = t.segments.map((s) =>
    [Math.round(s.curve * 1e4), Math.round(s.p2.world.y), s.pad ? [Math.round(s.pad.offset * 1e4), s.pad.width] : 0, s.hazard ? [s.hazard.kind, Math.round(s.hazard.base * 1e4), Math.round(s.hazard.amp * 1e4), Math.round(s.hazard.speed * 1e4), Math.round(s.hazard.phase * 1e4)] : 0, s.boxes ?? 0, s.finish ? 1 : 0].join(','),
  );
  let h = 2166136261;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `${t.segments.length}:${h.toString(16)}:${Math.round(t.line.reduce((a, b) => a + b, 0) * 1e3)}`;
};

describe('track layout is frozen', () => {
  it.each(Object.keys(GOLDEN))('world:seed %s keeps its road, pads, hazards and boxes', (key) => {
    const [w, s] = key.split(':').map(Number);
    expect(fingerprint(w, s)).toBe(GOLDEN[key]);
  });
});
