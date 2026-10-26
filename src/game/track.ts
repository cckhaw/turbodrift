import { Rng } from '../utils/rng';
import { SEG_LENGTH, WORLDS } from './worlds';
import type { Hazard, Pad, Scenery, Segment, Track } from './types';

const ease = (a: number, b: number, p: number) => a + (b - a) * p;
const easeIn = (a: number, b: number, p: number) => a + (b - a) * p * p;
const easeOut = (a: number, b: number, p: number) => a + (b - a) * (1 - (1 - p) * (1 - p));
const easeInOut = (a: number, b: number, p: number) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);

const blankPoint = () => ({ world: { y: 0, z: 0 }, camera: { x: 0, y: 0, z: 0 }, screen: { x: 0, y: 0, w: 0, scale: 0 } });

export function generateTrack(worldId: number, seed: number): Track {
  const w = WORLDS[worldId - 1];
  const rng = new Rng(seed * 31 + worldId * 7919);
  const segs: Segment[] = [];
  const lastY = () => (segs.length ? segs[segs.length - 1].p2.world.y : 0);

  const addSegment = (curve: number, y: number) => {
    const n = segs.length;
    segs.push({
      index: n,
      p1: { ...blankPoint(), world: { y: lastY(), z: n * SEG_LENGTH } },
      p2: { ...blankPoint(), world: { y, z: (n + 1) * SEG_LENGTH } },
      curve,
      scenery: [],
      finish: false,
      looped: false,
      fog: 0,
      clip: 0,
      cars: [],
      props: [],
    });
  };

  const addRoad = (enter: number, hold: number, leave: number, curve: number, dy: number) => {
    const startY = lastY();
    const endY = startY + dy * SEG_LENGTH;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
    for (let n = 0; n < hold; n++) addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
    for (let n = 0; n < leave; n++) addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
  };

  const hill = () => rng.sign() * rng.range(w.hill[0], w.hill[1]);
  const mild = () => rng.range(w.curveMax * 0.35, w.curveMax * 0.7);
  const hard = () => rng.range(w.curveMax * 0.75, w.curveMax);

  addRoad(20, 40, 20, 0, 0); // start straight
  const target = w.lapSegments - 160;
  while (segs.length < target) {
    const r = rng.next();
    const dir = rng.sign();
    if (r < 0.2) addRoad(rng.int(25, 50), rng.int(30, 70), rng.int(25, 50), 0, hill());
    else if (r < 0.5) addRoad(rng.int(25, 45), rng.int(30, 70), rng.int(25, 45), dir * mild(), hill() * 0.6);
    else if (r < 0.7) {
      addRoad(25, rng.int(20, 40), 25, dir * mild(), hill() * 0.5);
      addRoad(25, rng.int(20, 40), 25, -dir * hard(), hill() * 0.5);
    } else if (r < 0.88 || !w.hairpins) addRoad(rng.int(25, 40), rng.int(35, 70), rng.int(25, 40), dir * hard(), hill() * 0.4);
    else addRoad(rng.int(14, 22), rng.int(30, 48), rng.int(14, 22), dir * w.curveMax, hill() * 0.3);
  }
  // blend back to y = 0 with a straight so the lap closes smoothly
  const back = -lastY() / SEG_LENGTH;
  addRoad(40, 60, 60, 0, back);
  addRoad(0, 0, 0, 0, 0);
  const N = segs.length;
  segs[N - 1].p2.world.y = 0;

  // finish line + decoration
  segs[0].finish = true;
  segs[1].finish = true;
  const sceneryMax = w.id === 2 ? 5.5 : 4.2;
  for (let i = 0; i < N; i++) {
    if (!rng.chance(w.sceneryDensity)) continue;
    const side = rng.sign();
    const kind = rng.pick(w.scenery);
    const far = kind === 'cloud' || kind === 'island';
    const s: Scenery = {
      kind,
      offset: side * (far ? rng.range(2.2, sceneryMax + 2) : rng.range(1.5, sceneryMax)),
      size: rng.range(0.8, 1.7) * (kind === 'tower' ? 1.3 : 1),
      hue: rng.next(),
    };
    segs[i].scenery.push(s);
  }

  // boost pads
  let i = 90;
  while (i < N - 120) {
    const pad: Pad = { offset: rng.range(-0.55, 0.55), width: 0.28 };
    segs[i].pad = pad;
    segs[i + 1].pad = pad;
    segs[i + 2].pad = pad;
    i += rng.int(110, 220);
  }

  // hazards
  if (w.windGates || w.blocks) {
    i = 150;
    while (i < N - 150) {
      const hz: Hazard = w.windGates
        ? { kind: 'wind', base: 0, amp: rng.range(0.35, 0.7), speed: rng.range(0.8, 1.6), phase: rng.range(0, 6.28), width: 0.2 }
        : { kind: 'block', base: rng.range(-0.55, 0.55), amp: 0, speed: 0, phase: 0, width: 0.17 };
      segs[i].hazard = hz;
      i += rng.int(70, 150);
    }
  }

  // item boxes (placed last so earlier rng draws, and therefore existing tracks, are unchanged)
  i = 130;
  while (i < N - 100) {
    segs[i].boxes = [-0.55, 0, 0.55];
    i += rng.int(200, 300);
  }

  // racing line: lean toward the inside of upcoming curves, smoothed
  const raw = segs.map((_, k) => {
    let c = 0;
    for (let j = 6; j < 26; j += 2) c += segs[(k + j) % N].curve;
    return Math.max(-0.6, Math.min(0.6, (c / 10) * 0.22));
  });
  const line = raw.map((_, k) => {
    let sum = 0;
    for (let j = -10; j <= 10; j++) sum += raw[(k + j + N) % N];
    return sum / 21;
  });

  return { segments: segs, length: N * SEG_LENGTH, line, world: worldId, seed };
}

export { ease, easeIn, easeOut };
