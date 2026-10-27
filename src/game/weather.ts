/**
 * The living sky of the storm world. Everything here is a pure function of the simulation clock, so a replay
 * re-creates exactly the same gusts and downpours the player drove through (nothing random is involved).
 */
export interface Weather {
  /** position in the day, 0..1 (0.25 is noon): places the sun and moon */
  phase: number;
  /** 0 = deep night, 1 = full daylight */
  day: number;
  /** how far the sun (1) or moon (-1) is above the horizon, -1..1 */
  sun: number;
  /** 0 = dry, 1 = downpour */
  rain: number;
  /** sideways push on karts, -1 (hard left) .. 1 (hard right) */
  wind: number;
  /** 0..1 strength of the current gust, for the HUD and the streaks */
  gust: number;
  /** a lightning flash, 0..1, decaying quickly */
  lightning: number;
}

/** Seconds for a full day and night. A 3-lap race sees about one and a half. */
export const DAY_SECONDS = 180;
const TAU = Math.PI * 2;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function weatherAt(t: number): Weather {
  const time = Math.max(0, t);
  // start mid-morning, sunset about a third of the way round, dead of night at two thirds
  const phase = time / DAY_SECONDS + 0.1;
  const sun = Math.sin(phase * TAU);
  const day = smooth(-0.18, 0.32, sun);

  // fronts roll in and out on two slow, unrelated rhythms (dry at the start line, with the first shower about half a minute in)
  const front = Math.sin((time / 95) * TAU - 0.5) * 0.7 + Math.sin((time / 41) * TAU - 0.6) * 0.3;
  const rain = smooth(-0.45, 0.55, front);

  // the wind swings from side to side and arrives in gusts that are fiercer in the rain
  const dir = Math.sin((time / 53) * TAU + 0.7);
  const gustWave = Math.max(0, Math.sin((time / 17) * TAU + Math.sin(time / 9) * 1.2));
  const gust = Math.min(1, 0.25 + 0.75 * gustWave * gustWave) * (0.65 + 0.35 * rain);
  const wind = Math.max(-1, Math.min(1, dir * gust * 1.15));

  // lightning only in heavy rain: a short, bright flash in some of the seven-second windows
  let lightning = 0;
  if (rain > 0.55) {
    const slot = Math.floor(time / 7);
    const into = time - slot * 7;
    if (hash(slot + 11) < 0.45 && into < 0.6) lightning = into < 0.12 ? 1 : into < 0.2 ? 0.2 : into < 0.3 ? 0.8 : Math.max(0, 0.5 - (into - 0.3) * 1.6);
  }
  return { phase: ((phase % 1) + 1) % 1, day, sun, rain, wind, gust, lightning };
}

/** How hard the wind shoves a kart sideways at full gust, in road-halves per second. */
export const WIND_PUSH = 0.62;
/** Rain makes the road greasy: bends throw you wider, and the wheel bites a little less. */
export const rainCentrifugal = (rain: number): number => 1 + 0.4 * rain;
export const rainSteering = (rain: number): number => 1 - 0.14 * rain;
