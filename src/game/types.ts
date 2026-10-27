export type SceneryKind =
  | 'tower'
  | 'sign'
  | 'pylon'
  | 'cloud'
  | 'island'
  | 'rock'
  | 'lavaPillar'
  | 'crystal'
  // street furniture and set pieces added in the visual overhaul
  | 'shop'
  | 'lamp'
  | 'crowd'
  | 'palm'
  | 'arch'
  | 'bunting'
  | 'turbine'
  | 'balloon'
  | 'ring'
  | 'torch'
  | 'gantry'
  // daylight desert highway
  | 'cactus'
  | 'butte'
  | 'roadsign'
  | 'shrub'
  | 'flag'
  | 'truck'
  // storm world
  | 'pine'
  | 'lighthouse';
import type { Item } from './items.js';
import type { Ahead } from './lookahead.js';

export type HazardKind = 'wind' | 'block';

export interface Scenery {
  kind: SceneryKind;
  offset: number; // road-halves from center
  size: number; // multiplier
  hue: number; // 0..1 variation
  label?: string; // text on arches and gantries
}

export interface Hazard {
  kind: HazardKind;
  base: number;
  amp: number;
  speed: number;
  phase: number;
  width: number; // normalised half-widths
}

export interface Pad {
  offset: number;
  width: number;
}

export interface Prop {
  kind: 'oil' | 'missile';
  x: number;
  pct: number; // position inside the segment
}

export interface Point {
  world: { y: number; z: number };
  camera: { x: number; y: number; z: number };
  screen: { x: number; y: number; w: number; scale: number };
}

export interface Segment {
  index: number;
  p1: Point;
  p2: Point;
  curve: number;
  scenery: Scenery[];
  hazard?: Hazard;
  pad?: Pad;
  boxes?: number[];
  finish: boolean;
  looped: boolean;
  fog: number;
  clip: number;
  cars: Car[];
  props: Prop[];
}

export interface Car {
  id: number;
  name: string;
  color: string;
  accent: string;
  dist: number; // cumulative distance (units); negative = behind the start line
  x: number; // -1..1 inside road
  speed: number;
  isPlayer: boolean;
  skill: number;
  lane: number;
  wobble: number;
  finishTime: number | null;
  lap: number;
  steerVis: number;
  ghost?: boolean;
  shape?: 'comet' | 'rocket' | 'phantom';
  item: Item | null;
  itemT: number; // bots: seconds until they use the held item
  shieldT: number;
  spinT: number;
  boostT: number; // bots only
}

export interface Track {
  segments: Segment[];
  length: number; // world units
  line: number[]; // racing-line x per segment (bot waypoints)
  world: number;
  seed: number;
}

export interface WorldConfig {
  id: number;
  name: string;
  emoji: string;
  tagline: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Expert' | 'God';
  blurb: string;
  // geometry
  roadWidth: number;
  lapSegments: number;
  curveMax: number;
  hairpins: boolean;
  hill: [number, number];
  // physics
  maxSpeed: number;
  centrifugal: number;
  fallOff: boolean;
  offroadLimit: number;
  // bots
  botPace: number;
  rubberSlow: number;
  rubberFast: number;
  // look
  sky: [string, string, string];
  grass: [string, string];
  road: [string, string];
  rumble: [string, string];
  lane: string;
  fogColor: string;
  glow: string;
  scenery: SceneryKind[];
  sceneryDensity: number;
  windGates: boolean;
  blocks: boolean;
  /** a changing sky: day to night, rain and gusty wind (see weather.ts) */
  weather?: boolean;
  music: { bpm: number; root: number; scale: number[] };
}

export interface HudSnapshot {
  position: number;
  total: number;
  lap: number;
  laps: number;
  kmh: number;
  lapTime: number;
  raceTime: number;
  driftLevel: 0 | 1 | 2;
  driftCharge: number; // 0..1 toward next level
  boosting: boolean;
  countdown: number | null; // 3,2,1,0(GO)
  standings: { name: string; color: string; you: boolean; gap: number }[];
  toast: { text: string; id: number } | null;
  fallen: boolean;
  item: Item | null;
  itemRolling: boolean;
  shield: boolean;
  /** Everyone on track for the map: `pos` is their race position (0 for the ghost), `t` is how far round the lap (0..1). */
  /** the storm world's sky right now (null elsewhere) */
  weather: { day: number; rain: number; wind: number; gust: number } | null;
  racers: { id: number; color: string; you: boolean; pos: number; t: number; ghost?: boolean }[];
  ahead: Ahead;
}

import type { Replay } from './replay.js';

export interface RaceResult {
  laps: number;
  replay?: Replay;
  mode: 'race' | 'trial';
  kart: string;
  world: number;
  seed: number;
  position: number;
  total: number;
  lapTimes: number[];
  lapPositions: number[];
  bestLap: number;
  totalTime: number;
  standings: { name: string; color: string; you: boolean; time: number | null }[];
}
