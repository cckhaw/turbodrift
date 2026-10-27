/** Compact input recording for server-side verification. 60 Hz fixed steps, run-length encoded. */
export const FIXED_DT = 1 / 60;
export const MAX_REPLAY_STEPS = 60 * 60 * 8; // 8 minutes of racing
export const MAX_REPLAY_ITEMS = 400;

export interface InputRun {
  steps: number; // how many consecutive steps this input is held
  steer: number; // -127..127 (steer * 127)
  drift: boolean;
}

export const quantizeSteer = (v: number): number => Math.round(Math.max(-1, Math.min(1, v)) * 127);

/** Collects per-step inputs as runs. */
export class ReplayRecorder {
  runs: InputRun[] = [];
  total = 0;
  valid = true;
  /** step numbers at which the player pressed the item button (races only) */
  items: number[] = [];

  push(steer: number, drift: boolean): void {
    const last = this.runs[this.runs.length - 1];
    if (last && last.steer === steer && last.drift === drift) last.steps++;
    else this.runs.push({ steps: 1, steer, drift });
    this.total++;
  }
}

export interface Replay {
  v: 1;
  world: number;
  seed: number;
  kart: string;
  steps: number;
  /** absent on older recordings, which are always time trials */
  mode?: 'trial' | 'race';
  /** step numbers at which the item button was pressed; races only */
  items?: number[];
  data: string; // base64 of runs: varint(steps) int8(steer) u8(drift)
}

function bytesToB64(bytes: number[]): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
}
function b64ToBytes(b64: string): number[] {
  const s = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  return out;
}

export function encodeRuns(runs: InputRun[]): string {
  const bytes: number[] = [];
  for (const r of runs) {
    let n = r.steps;
    while (n >= 0x80) {
      bytes.push((n & 0x7f) | 0x80);
      n >>>= 7;
    }
    bytes.push(n);
    bytes.push(r.steer & 0xff);
    bytes.push(r.drift ? 1 : 0);
  }
  return bytesToB64(bytes);
}

/** Returns null for malformed input instead of throwing. */
export function decodeRuns(data: string, maxSteps = MAX_REPLAY_STEPS): InputRun[] | null {
  let bytes: number[];
  try {
    bytes = b64ToBytes(data);
  } catch {
    return null;
  }
  const runs: InputRun[] = [];
  let total = 0;
  let i = 0;
  while (i < bytes.length) {
    let steps = 0;
    let shift = 0;
    for (;;) {
      if (i >= bytes.length || shift > 28) return null;
      const b = bytes[i++];
      steps |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    if (i + 2 > bytes.length || steps <= 0) return null;
    const raw = bytes[i++];
    const steer = raw > 127 ? raw - 256 : raw;
    const flag = bytes[i++];
    if (steer < -127 || steer > 127 || flag > 1) return null;
    total += steps;
    if (total > maxSteps) return null;
    runs.push({ steps, steer, drift: flag === 1 });
  }
  return runs.length ? runs : null;
}
