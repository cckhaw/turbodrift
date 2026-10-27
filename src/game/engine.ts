import { synth } from '../audio/synth.js';
import { FIXED_DT, MAX_REPLAY_ITEMS, ReplayRecorder, encodeRuns, quantizeSteer, type InputRun, type Replay } from './replay.js';
import { Rng, hashSeed } from '../utils/rng.js';
import { haptic } from '../utils/haptics.js';
import { loadSettings, type Settings } from '../utils/settings.js';
import { GHOST_DT, ghostAt, loadGhost, saveGhost, type Ghost } from '../utils/ghost.js';
import { BOT_COLORS, BOT_NAMES, LAPS, SEG_LENGTH, WORLDS } from './worlds.js';
import { generateTrack } from './track.js';
import { lookAhead } from './lookahead.js';
import { KARTS, kartById, type KartSpec } from './karts.js';
import { BOX_OFFSETS, BOX_RESPAWN, OIL_LIFE, SHIELD_TIME, SPIN_TIME, rollItem } from './items.js';
import { drawHazard, drawItemBox, drawKart, drawProp, lerp, mix } from './draw.js';
import { gfxState } from './gfx.js';
import { drawBackdrop, drawGround, drawRoadside, makeBackdrop, type Backdrop } from './scene.js';
import { drawScenery } from './scenery.js';
import type { Car, HudSnapshot, RaceResult, Segment, Track, WorldConfig } from './types.js';

const FOV = 80;
const CAM_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
const PLAYER_Z = 3000;
const CAM_H = 2500;
const DRAW_DIST = 130;
const KART_W = 900; // world units
const KART_DRAW = 1.22; // karts are drawn a little larger than their hit box so they read well on a phone
const KART_LEN = 700;
const HORIZON = 0.37;
const FOG_DENSITY = 4;
const RUMBLE_LEN = 3;
const COUNTDOWN = 3.6;
const FALL_AT = 1.22;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const mod = (v: number, m: number) => ((v % m) + m) % m;

export interface Input {
  steer: number;
  drift: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  world: number;
  seed: number;
  onHud: (h: HudSnapshot) => void;
  onFinish: (r: RaceResult) => void;
  /** race: bots + items · trial: solo, verified for the leaderboard · practice: solo, items, endless, nothing recorded */
  mode?: 'race' | 'trial' | 'practice';
  kart?: string;
}

export class Engine {
  readonly input: Input = { steer: 0, drift: false };
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private track: Track;
  private wd: WorldConfig;
  private backdrop: Backdrop;
  private player: Car;
  private cars: Car[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private raceT = 0;
  private lapT = 0;
  private hudT = 0;
  private state: 'countdown' | 'racing' | 'finished' = 'countdown';
  private paused = false;
  private lastCount = 4;
  private finishT = 0;
  private reported = false;
  private bgScroll = 0;
  /** trimmed decoration: Battery saver, or switched on automatically when frames run slow */
  private lite = false;
  private slowFrames = 0;
  private frameSum = 0;
  private frameCount = 0;
  private particles: Particle[] = [];
  private shake = 0;
  private toast: { text: string; id: number } | null = null;
  private toastId = 0;
  private toastT = 0;

  // player state
  private drifting = false;
  private driftDir = 0;
  private driftCharge = 0;
  private driftLvl: 0 | 1 | 2 = 0;
  private boostT = 0;
  private fallT = 0;
  private blinkT = 0;
  private hitCd = 0;
  private ghost: Ghost | null;
  private ghostCar: Car | null = null;
  private rec: Ghost = { lapMs: 0, d: [], x: [] };
  private recT = 0;
  private lapTimes: number[] = [];
  private lapPositions: number[] = [];
  private playerLap = 1;
  private visTilt = 0;
  private visDrift = 0;
  private visSpin = 0;
  private resizeObs?: ResizeObserver;

  // fixed-step simulation, input recording and replay
  private acc = 0;
  private cmd = { steer: 0, drift: false };
  private recorder = new ReplayRecorder();
  private replayRuns: InputRun[] | null = null;
  private replayIdx = 0;
  private replayStep = 0;
  private replayItems: number[] = [];
  private replayItemIdx = 0;
  private itemPress = false;
  private assistT = 0;
  private assistOn = false;
  private assistDir = 0;
  private replayLeft = 0;
  private finalResult: RaceResult | null = null;

  // karts, items, hazards thrown by cars
  private settings: Settings;
  private kart: KartSpec;
  private mode: 'race' | 'trial' | 'practice';
  private countdownLen = COUNTDOWN;
  private itemRng: Rng;
  private itemRollT = 0;
  private boxTaken = new Map<string, number>();
  private oils: { dist: number; x: number; life: number; owner: number }[] = [];
  private missiles: { dist: number; x: number; speed: number; life: number; owner: Car; target: Car | null }[] = [];

  constructor(private o: EngineOptions) {
    this.ctx = o.canvas.getContext('2d', { alpha: false })!;
    this.wd = WORLDS[o.world - 1];
    this.track = generateTrack(o.world, o.seed);
    const r = new Rng(hashSeed(o.world, o.seed, 99));
    this.backdrop = makeBackdrop(() => r.next());
    this.settings = loadSettings();
    this.mode = o.mode ?? 'race';
    if (this.mode === 'practice') this.countdownLen = 0.6; // no countdown, just GO
    this.kart = kartById(o.kart ?? KARTS[0].id);
    this.itemRng = new Rng(hashSeed(o.world, o.seed, 555));
    this.player = this.makeCar(0, 'YOU', this.kart.color, this.kart.accent, true);
    this.player.shape = this.kart.id as Car['shape'];
    this.setupGrid(r);
    // the best-lap ghost belongs to Time Trial: in a race a translucent car restarting at the line every lap just looks like a bug
    this.ghost = this.mode === 'trial' ? loadGhost(o.world, o.seed, this.kart.id) : null;
    if (this.ghost) this.ghostCar = { ...this.makeCar(99, 'BEST', '#ffffff', '#ffffff', false), ghost: true };
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(o.canvas);
    }
  }

  // ---------- setup ----------
  private makeCar(id: number, name: string, color: string, accent: string, isPlayer: boolean): Car {
    return { id, name, color, accent, dist: 0, x: 0, speed: 0, isPlayer, skill: 1, lane: 0, wobble: 0, finishTime: null, lap: 1, steerVis: 0, item: null, itemT: 0, shieldT: 0, spinT: 0, boostT: 0 };
  }

  private setupGrid(r: Rng) {
    if (this.mode !== 'race') {
      this.player.dist = -700;
      this.player.x = 0;
      this.cars.push(this.player);
      return;
    }
    const slots = 6;
    const playerSlot = 3; // start mid-pack so there is someone to chase and someone to defend from
    const order = [...Array(slots).keys()];
    let botIdx = 0;
    for (const slot of order) {
      const row = Math.floor(slot / 2);
      const col = slot % 2 === 0 ? -0.35 : 0.35;
      const dist = -(row * 900 + 700);
      if (slot === playerSlot) {
        this.player.dist = dist;
        this.player.x = col;
        this.cars.push(this.player);
      } else {
        const [c, a] = BOT_COLORS[botIdx % BOT_COLORS.length];
        const bot = this.makeCar(botIdx + 1, BOT_NAMES[botIdx % BOT_NAMES.length], c, a, false);
        bot.shape = KARTS[botIdx % KARTS.length].id as Car['shape'];
        bot.dist = dist;
        bot.x = col;
        bot.skill = this.wd.botPace * r.range(0.95, 1.03);
        bot.lane = r.range(-0.35, 0.35);
        bot.wobble = r.range(0, 6.28);
        this.cars.push(bot);
        botIdx++;
      }
    }
  }

  start(): void {
    synth.setVolumes(this.settings.music, this.settings.sfx);
    synth.startEngine();
    synth.startMusic(this.wd);
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      this.watchFrameRate((now - this.last) / 1000);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) {
        // fixed 60 Hz steps keep the simulation identical on every device (and replayable on the server)
        this.acc += dt;
        let n = 0;
        while (this.acc >= FIXED_DT && n < 6) {
          this.update(FIXED_DT);
          this.acc -= FIXED_DT;
          n++;
        }
        if (n === 6) this.acc = 0;
      }
      this.render();
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** If a couple of seconds of frames average slower than ~38 fps, drop the extra decoration for the rest of the session. */
  private watchFrameRate(raw: number): void {
    if (this.lite || this.paused || raw > 0.25 || this.state === 'countdown') return;
    this.frameSum += raw;
    if (++this.frameCount < 90) return;
    this.slowFrames = this.frameSum / this.frameCount > 1 / 38 ? this.slowFrames + 1 : 0;
    this.frameSum = 0;
    this.frameCount = 0;
    if (this.slowFrames >= 2) this.lite = true;
  }

  destroy(): void {
    gfxState.lite = false;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    synth.stopEngine();
    synth.stopMusic();
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (p) synth.updateEngine(0, false, false, false);
  }

  private resize() {
    const c = this.o.canvas;
    const win = typeof window !== 'undefined' ? window : null; // absent when replaying on the server
    const dpr = Math.min(win?.devicePixelRatio || 1, 2);
    const cw = c.clientWidth || win?.innerWidth || 390;
    const ch = c.clientHeight || win?.innerHeight || 844;
    const scale = Math.min(dpr, (this.settings.quality === 'low' ? 560 : 1000) / Math.max(cw, 1));
    this.W = c.width = Math.max(240, Math.round(cw * scale));
    this.H = c.height = Math.max(240, Math.round(ch * scale));
  }

  // ---------- simulation ----------
  private seg(dist: number): Segment {
    return this.track.segments[Math.floor(mod(dist, this.track.length) / SEG_LENGTH)];
  }

  private say(text: string) {
    this.toast = { text, id: ++this.toastId };
    this.toastT = 1.6;
  }

  /** Sample the player's command for this step (or take it from the replay) and record it. */
  private readCommand(dt: number) {
    if (this.replayRuns) {
      const run = this.replayRuns[Math.min(this.replayIdx, this.replayRuns.length - 1)];
      this.cmd.steer = run.steer / 127;
      this.cmd.drift = run.drift;
      if (--this.replayLeft <= 0 && this.replayIdx < this.replayRuns.length - 1) {
        this.replayIdx++;
        this.replayLeft = this.replayRuns[this.replayIdx].steps;
      }
      while (this.replayItemIdx < this.replayItems.length && this.replayItems[this.replayItemIdx] <= this.replayStep) {
        if (this.replayItems[this.replayItemIdx++] === this.replayStep) this.tryUseItem();
      }
      this.replayStep++;
      return;
    }
    const q = quantizeSteer(this.input.steer);
    this.cmd.steer = q / 127;
    // the effective drift (held button or assist) is what gets recorded, so a replay needs no knowledge of the assist
    this.cmd.drift = this.input.drift || this.driftAssist(dt);
    if (Math.abs(dt - FIXED_DT) > 1e-9) this.recorder.valid = false;
    if (this.itemPress) {
      // the press is applied inside the fixed step, so a replay can apply it at exactly the same step
      this.itemPress = false;
      if (this.recorder.items.length < MAX_REPLAY_ITEMS) this.recorder.items.push(this.recorder.total);
      else this.recorder.valid = false;
      this.tryUseItem();
    }
    this.recorder.push(q, this.cmd.drift);
  }

  private update(dt: number) {
    this.readCommand(dt);
    this.time += dt;
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.toast = null;

    if (this.state === 'countdown') {
      const left = this.countdownLen - this.time;
      const n = Math.max(0, Math.ceil(left - 0.6));
      if (n !== this.lastCount) {
        this.lastCount = n;
        synth.beep(n === 0);
      }
      if (left <= 0) {
        this.state = 'racing';
        this.raceT = 0;
        this.lapT = 0;
      }
      this.stepPlayer(dt, true);
      this.updateBots(dt, true);
      this.pushHud(dt);
      return;
    }

    this.raceT += dt;
    if (this.state === 'racing') this.lapT += dt;
    this.stepPlayer(dt, false);
    this.updateBots(dt, false);
    this.stepProps(dt);
    this.collisions(dt);
    this.trackLaps();
    this.stepGhost(dt);
    this.stepParticles(dt);

    if (this.state === 'finished') {
      this.finishT += dt;
      if (!this.reported && this.finishT > 3.2) {
        this.reported = true;
        this.o.onFinish({ ...(this.finalResult ?? this.buildResult()), replay: this.getReplay() ?? undefined });
      }
    }
    synth.updateEngine(this.player.speed / this.wd.maxSpeed, this.drifting, this.boostT > 0, this.fallT > 0);
    this.pushHud(dt);
  }

  private stepPlayer(dt: number, frozen: boolean) {
    const p = this.player;
    const wd = this.wd;
    const max = wd.maxSpeed * this.kart.speed;
    const seg = this.seg(p.dist);
    const prevDist = p.dist;
    this.blinkT = Math.max(0, this.blinkT - dt);
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.shake = Math.max(0, this.shake - dt * 3);
    p.shieldT = Math.max(0, p.shieldT - dt);
    this.itemRollT = Math.max(0, this.itemRollT - dt);

    if (frozen) {
      p.speed = 0;
      return;
    }

    // falling off a sky / lava track
    if (this.fallT > 0) {
      this.fallT -= dt;
      p.speed = Math.max(0, p.speed - max * 1.5 * dt);
      p.dist += p.speed * dt;
      if (this.fallT <= 0) {
        p.x = clamp(this.track.line[seg.index] || 0, -0.5, 0.5);
        p.speed = max * 0.3;
        this.blinkT = 1.5;
        this.drifting = false;
      }
      return;
    }

    const spun = p.spinT > 0;
    if (spun) {
      p.spinT -= dt;
      if (this.drifting) this.releaseDrift(true);
    }
    let steer = spun ? 0 : this.state === 'finished' ? clamp((this.track.line[this.seg(p.dist + 1500).index] - p.x) * 2.5, -1, 1) : this.cmd.steer;
    const pct = clamp(p.speed / max, 0, 1.5);

    // drift state machine
    const wantDrift = this.cmd.drift && this.state === 'racing' && pct > 0.35 && !spun;
    if (wantDrift && !this.drifting && Math.abs(steer) > 0.25) {
      this.drifting = true;
      this.driftDir = Math.sign(steer);
      this.driftCharge = 0;
      this.driftLvl = 0;
    }
    if (this.drifting && !wantDrift) this.releaseDrift();
    let steerEff = steer;
    let cent = wd.centrifugal;
    let turnRate = 2 * this.kart.handling;
    if (this.drifting) {
      this.driftCharge += dt * (0.8 + 0.4 * Math.abs(steer)) * this.kart.drift;
      const lvl: 0 | 1 | 2 = this.driftCharge > 2.1 ? 2 : this.driftCharge > 0.9 ? 1 : 0;
      if (lvl > this.driftLvl) {
        synth.driftLevel(lvl);
        haptic.driftLevel();
      }
      this.driftLvl = lvl;
      steerEff = this.driftDir * (0.6 + 0.4 * clamp(steer * this.driftDir, -1, 1));
      cent *= 0.38;
      turnRate = 2.3 * this.kart.handling;
      this.sparks(dt);
    }

    // speed model
    const boosting = this.boostT > 0;
    if (boosting) this.boostT -= dt;
    const offroad = Math.abs(p.x) > 1;
    let target = max * (boosting ? 1.38 : 1) * (this.drifting ? 0.97 : 1) * (spun ? 0.35 : 1);
    if (offroad) target = Math.min(target, max * wd.offroadLimit);
    const accel = max * (boosting ? 1.4 : 0.42 * this.kart.accel);
    if (p.speed < target) p.speed = Math.min(target, p.speed + accel * dt);
    else p.speed = Math.max(target, p.speed - max * (offroad ? 1.6 : 0.5) * dt);
    if (this.state === 'finished') p.speed = Math.max(max * 0.5, p.speed - max * 0.2 * dt);

    // lateral
    const dx = dt * turnRate * clamp(pct, 0, 1.2);
    p.x += dx * steerEff;
    p.x -= dx * pct * seg.curve * cent;
    p.x = clamp(p.x, -2.2, 2.2);
    p.dist += p.speed * dt;
    this.bgScroll += seg.curve * pct * dt * 140;

    // falls
    if (wd.fallOff && Math.abs(p.x) > FALL_AT && this.state === 'racing') {
      this.fallT = 1.1;
      this.drifting = false;
      this.driftCharge = 0;
      this.driftLvl = 0;
      this.say(wd.id === 3 ? 'Burned! 🔥' : 'Fell off the sky track!');
      synth.fall();
      haptic.fall();
    }

    if (this.state === 'racing') this.collectBoxes(p, prevDist);

    // pads + hazards on the segment we are in
    if (seg.pad && Math.abs(p.x - seg.pad.offset) < seg.pad.width + 0.1 && this.boostT < 0.9) {
      this.boostT = 1.2;
      synth.pad();
      haptic.pad();
      this.say('BOOST PAD');
    }
    if (seg.hazard && this.hitCd <= 0 && this.blinkT <= 0) {
      const hz = seg.hazard;
      const hx = hz.base + (hz.kind === 'wind' ? Math.sin(this.time * hz.speed + hz.phase) * hz.amp : 0);
      if (Math.abs(p.x - hx) < hz.width + KART_W / 2 / wd.roadWidth * 0.6) {
        this.hitCd = 1;
        p.speed *= 0.45;
        this.boostT = 0;
        if (this.drifting) this.releaseDrift(true);
        this.shake = 1;
        this.say(hz.kind === 'wind' ? 'Wind gust!' : 'Crash!');
        synth.hit();
        haptic.hit();
      }
    }
    this.visTilt = lerp(this.visTilt, steerEff, Math.min(1, dt * 8));
    this.visSpin = spun ? 1 - p.spinT / SPIN_TIME : 0;
    this.visDrift = lerp(this.visDrift, this.drifting ? this.driftDir * (0.5 + 0.3 * steer * this.driftDir) : 0, Math.min(1, dt * 10));
  }

  private stepGhost(dt: number) {
    if (this.state !== 'racing' || this.mode === 'practice') return;
    this.recT += dt;
    while (this.recT >= GHOST_DT) {
      this.recT -= GHOST_DT;
      this.rec.d.push(this.player.dist - (this.playerLap - 1) * this.track.length);
      this.rec.x.push(this.player.x);
    }
    if (this.ghost && this.ghostCar) {
      const g = ghostAt(this.ghost, this.lapT);
      this.ghostCar.dist = (this.playerLap - 1) * this.track.length + g.d;
      this.ghostCar.x = g.x;
      this.ghostCar.speed = 0;
    }
  }

  private releaseDrift(cancel = false) {
    if (!cancel && this.driftLvl > 0) {
      this.boostT = this.driftLvl === 2 ? 1.7 : 0.95;
      synth.boost(this.driftLvl);
      haptic.boost();
      this.say(this.driftLvl === 2 ? 'TURBO!!' : 'Turbo!');
      this.shake = 0.5;
    }
    this.drifting = false;
    this.driftCharge = 0;
    this.driftLvl = 0;
  }

  private sparks(dt: number) {
    const n = Math.random() < dt * 60 * 0.8 ? 1 : 0;
    const colors = ['#ffd60a', '#5ac8fa', '#ff2d55'];
    for (let i = 0; i < n + (this.driftLvl > 0 ? 1 : 0); i++) {
      const side = -this.driftDir; // outside wheel
      this.particles.push({
        x: this.W / 2 + side * this.W * 0.07,
        y: this.H * 0.86,
        vx: side * (40 + Math.random() * 120) + (Math.random() - 0.5) * 60,
        vy: -(30 + Math.random() * 140),
        life: 0,
        max: 0.35 + Math.random() * 0.3,
        color: colors[this.driftLvl],
        size: 2 + Math.random() * 2.5,
      });
    }
  }

  private stepParticles(dt: number) {
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    if (this.boostT > 0 && Math.random() < 0.7)
      this.particles.push({ x: this.W / 2 + (Math.random() - 0.5) * this.W * 0.1, y: this.H * 0.88, vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 120, life: 0, max: 0.3, color: '#5ac8fa', size: 2.5 });
  }

  // ---------- items ----------
  private wrap(d: number): number {
    const L = this.track.length;
    return mod(d + L / 2, L) - L / 2;
  }

  private collectBoxes(car: Car, from: number) {
    if (this.mode === 'trial' || car.item || car.finishTime != null) return;
    const N = this.track.segments.length;
    for (let i = Math.floor(from / SEG_LENGTH); i <= Math.floor(car.dist / SEG_LENGTH); i++) {
      const seg = this.track.segments[((i % N) + N) % N];
      if (!seg.boxes) continue;
      for (let k = 0; k < seg.boxes.length; k++) {
        const key = `${seg.index}:${k}`;
        if ((this.boxTaken.get(key) ?? 0) > this.time || Math.abs(car.x - BOX_OFFSETS[k]) > 0.3) continue;
        this.boxTaken.set(key, this.time + BOX_RESPAWN);
        const rank = this.rank().indexOf(car) + 1;
        car.item = rollItem(this.itemRng, rank, this.cars.length);
        if (car.isPlayer) {
          this.itemRollT = 0.9;
          synth.pickup();
          haptic.pad();
        } else {
          car.itemT = this.itemRng.range(2, 6);
        }
        return;
      }
    }
  }

  /**
   * Drift assist for touch play: steering hard through a real bend for a moment starts a drift, and steering back
   * (or leaving the bend) lets go, which pays out the boost. Off unless the player enabled it.
   */
  private driftAssist(dt: number): boolean {
    if (!this.settings.driftAssist || this.state !== 'racing') {
      this.assistT = 0;
      return (this.assistOn = false);
    }
    const steer = this.cmd.steer;
    const p = this.player;
    const curve = this.seg(p.dist).curve;
    if (this.assistOn) {
      // keep drifting while still steering the same way and the player is still going fast enough
      if (steer * this.assistDir < 0.35 || p.speed < this.wd.maxSpeed * this.kart.speed * 0.3 || this.fallT > 0 || p.spinT > 0) this.assistOn = false;
      return this.assistOn;
    }
    const inBend = Math.abs(curve) >= 0.8 && Math.sign(curve) === Math.sign(steer);
    if (Math.abs(steer) >= 0.9 && inBend && p.speed > this.wd.maxSpeed * this.kart.speed * 0.55 && this.fallT <= 0 && p.spinT <= 0) {
      this.assistT += dt;
      if (this.assistT >= 0.18) {
        this.assistOn = true;
        this.assistDir = Math.sign(steer);
        this.assistT = 0;
      }
    } else this.assistT = 0;
    return this.assistOn;
  }

  /** Race or time-trial recording for server verification; null if it can't be replayed exactly. */
  getReplay(): Replay | null {
    if (this.mode === 'practice' || !this.recorder.valid || !this.finalResult || this.replayRuns) return null;
    const r: Replay = { v: 1, world: this.o.world, seed: this.o.seed, kart: this.kart.id, steps: this.recorder.total, data: encodeRuns(this.recorder.runs) };
    if (this.mode === 'race') {
      r.mode = 'race';
      r.items = this.recorder.items;
    }
    return r;
  }

  /** Server side: drive the engine from recorded inputs (held at the last input once they run out). */
  runReplay(runs: InputRun[], maxSteps: number, items: number[] = []): RaceResult | null {
    this.replayRuns = runs;
    this.replayItems = items;
    this.replayItemIdx = 0;
    this.replayStep = 0;
    this.replayIdx = 0;
    this.replayLeft = runs[0].steps;
    for (let i = 0; i < maxSteps && !this.finalResult; i++) this.update(FIXED_DT);
    return this.finalResult;
  }

  /** Pick up settings changed from the pause menu (drift assist, shake, volumes). */
  refreshSettings(): void {
    this.settings = loadSettings();
    synth.setVolumes(this.settings.music, this.settings.sfx);
  }

  /** Player taps the item button; it takes effect at the start of the next simulation step. */
  useItem(): void {
    if (this.state === 'racing' && this.mode === 'race' && !this.replayRuns) this.itemPress = true;
    else if (this.mode !== 'race') this.tryUseItem();
  }

  private tryUseItem(): void {
    const p = this.player;
    if (this.state !== 'racing' || !p.item || this.itemRollT > 0 || this.fallT > 0 || p.spinT > 0) return;
    this.activate(p);
  }

  private activate(car: Car) {
    const item = car.item;
    if (!item) return;
    car.item = null;
    switch (item) {
      case 'turbo':
        if (car.isPlayer) {
          this.boostT = Math.max(this.boostT, 1.6);
          this.shake = 0.4;
          this.say('TURBO!');
          synth.boost(1);
          haptic.boost();
        } else car.boostT = 1.6;
        break;
      case 'shield':
        car.shieldT = SHIELD_TIME;
        if (car.isPlayer) this.say('Shield up');
        break;
      case 'oil':
        this.oils.push({ dist: car.dist - 600, x: car.x, life: OIL_LIFE, owner: car.id });
        if (car.isPlayer) this.say('Oil dropped');
        break;
      case 'missile': {
        let target: Car | null = null;
        let best = 14000;
        for (const o of this.cars) {
          const d = o.dist - car.dist;
          if (o !== car && o.finishTime == null && d > 0 && d < best) {
            best = d;
            target = o;
          }
        }
        this.missiles.push({ dist: car.dist + 600, x: car.x, speed: this.wd.maxSpeed * 1.7, life: 6, owner: car, target });
        if (car.isPlayer) {
          this.say(target ? 'Missile away' : 'Missile fired');
          synth.shoot();
        }
        break;
      }
    }
  }

  private hitCar(car: Car, cause: 'oil' | 'missile') {
    if (car.finishTime != null) return;
    if (car.shieldT > 0) {
      car.shieldT = 0;
      if (car.isPlayer) {
        this.say('Shield blocked it!');
        synth.bump();
      }
      return;
    }
    if (car.isPlayer) {
      if (this.fallT > 0 || this.blinkT > 0) return;
      car.spinT = SPIN_TIME;
      car.speed *= 0.4;
      this.boostT = 0;
      this.shake = 1;
      this.say(cause === 'missile' ? 'Missile hit!' : 'Slipped on oil!');
      synth.hit();
      haptic.hit();
    } else {
      car.spinT = SPIN_TIME;
      car.speed *= 0.4;
      car.boostT = 0;
    }
  }

  private stepProps(dt: number) {
    for (const o of this.oils) {
      o.life -= dt;
      for (const c of this.cars) {
        if (o.life <= 0) break;
        if (c.id === o.owner && o.life > OIL_LIFE - 1.5) continue;
        if (Math.abs(this.wrap(c.dist - o.dist)) < 400 && Math.abs(c.x - o.x) < 0.3) {
          o.life = 0;
          this.hitCar(c, 'oil');
        }
      }
    }
    this.oils = this.oils.filter((o) => o.life > 0);
    for (const m of this.missiles) {
      m.life -= dt;
      m.dist += m.speed * dt;
      if (m.target) {
        m.x += clamp(m.target.x - m.x, -3 * dt, 3 * dt);
        if (this.wrap(m.target.dist - m.dist) < -2500) m.target = null;
      }
      for (const c of this.cars) {
        if (m.life <= 0) break;
        if (c === m.owner) continue;
        if (Math.abs(this.wrap(c.dist - m.dist)) < 450 && Math.abs(c.x - m.x) < 0.32) {
          m.life = 0;
          this.hitCar(c, 'missile');
        }
      }
    }
    this.missiles = this.missiles.filter((m) => m.life > 0);
  }

  private botUseItem(b: Car, dt: number) {
    if (!b.item) return;
    b.itemT -= dt;
    if (b.itemT > 0) return;
    const ahead = this.cars.some((o) => o !== b && o.dist - b.dist > 0 && o.dist - b.dist < 9000);
    const behind = this.cars.some((o) => o !== b && b.dist - o.dist > 0 && b.dist - o.dist < 3500);
    if ((b.item === 'missile' && !ahead) || (b.item === 'oil' && !behind)) {
      b.itemT = 1;
      return;
    }
    this.activate(b);
  }

  private updateBots(dt: number, frozen: boolean) {
    const wd = this.wd;
    const N = this.track.segments.length;
    const playerDist = this.player.dist;
    const finalLap = this.player.lap >= LAPS;
    for (const b of this.cars) {
      if (b.isPlayer) continue;
      if (frozen) {
        b.speed = 0;
        continue;
      }
      b.spinT = Math.max(0, b.spinT - dt);
      b.boostT = Math.max(0, b.boostT - dt);
      b.shieldT = Math.max(0, b.shieldT - dt);
      this.botUseItem(b, dt);
      const idx = this.seg(b.dist).index;
      // waypoint: racing line ahead plus personal lane offset
      const look = this.track.line[(idx + 9) % N];
      let target = clamp(look + b.lane * (1 - Math.abs(look) * 0.8), -0.85, 0.85);
      // look ahead for slower traffic and pick a free lane
      for (const o of this.cars) {
        if (o === b) continue;
        const d = mod(o.dist - b.dist + this.track.length / 2, this.track.length) - this.track.length / 2;
        if (d > 0 && d < 2400 && Math.abs(o.x - b.x) < 0.5) target = clamp(b.x + (b.x >= o.x ? 0.45 : -0.45), -0.85, 0.85);
      }
      target += Math.sin(this.time * 0.9 + b.wobble) * 0.06;
      // ahead curvature -> brake a little in hard corners
      let curveAhead = 0;
      for (let k = 2; k < 14; k += 3) curveAhead = Math.max(curveAhead, Math.abs(this.track.segments[(idx + k) % N].curve));
      const cornerSlow = 1 - Math.min(0.2, curveAhead * 0.03);
      // rubber banding keeps the pack tense; harder pull in the last lap
      const gap = (b.dist - playerDist) / SEG_LENGTH;
      let rb = 1;
      if (gap > 0) rb = 1 - clamp(gap / 110, 0, 1) * wd.rubberSlow;
      else rb = 1 + clamp(-gap / 60, 0, 1) * wd.rubberFast;
      if (finalLap && Math.abs(gap) < 20) rb += 0.025;
      const targetSpeed = wd.maxSpeed * b.skill * cornerSlow * rb * (b.spinT > 0 ? 0.35 : 1) * (b.boostT > 0 ? 1.25 : 1);
      if (b.speed < targetSpeed) b.speed = Math.min(targetSpeed, b.speed + wd.maxSpeed * 0.4 * dt);
      else b.speed = Math.max(targetSpeed, b.speed - wd.maxSpeed * 0.5 * dt);
      const lat = 1.7 * clamp(b.speed / wd.maxSpeed, 0.2, 1) * dt;
      b.x += clamp(target - b.x, -lat, lat);
      const prev = b.dist;
      b.dist += b.speed * dt;
      this.collectBoxes(b, prev);
      b.lap = clamp(Math.floor(b.dist / this.track.length) + 1, 1, LAPS + 1);
      if (b.finishTime == null && b.dist >= LAPS * this.track.length) b.finishTime = this.raceT * 1000;
    }
  }

  private collisions(dt: number) {
    const p = this.player;
    if (this.fallT > 0) return;
    for (const b of this.cars) {
      if (b.isPlayer) continue;
      const dz = b.dist - p.dist;
      const dx = b.x - p.x;
      if (Math.abs(dz) < KART_LEN && Math.abs(dx) < (KART_W / this.wd.roadWidth) * 0.8) {
        const push = (dx >= 0 ? 1 : -1) * dt * 2.5;
        p.x -= push;
        b.x += push;
        if (dz > 0) p.speed = Math.min(p.speed, b.speed * 1.02);
        else b.speed = Math.min(b.speed, p.speed * 1.02);
        synth.bump();
        haptic.bump();
        this.shake = Math.max(this.shake, 0.35);
      }
    }
  }

  private rank(): Car[] {
    return [...this.cars].sort((a, b) => {
      if (a.finishTime != null && b.finishTime != null) return a.finishTime - b.finishTime;
      if (a.finishTime != null) return -1;
      if (b.finishTime != null) return 1;
      return b.dist - a.dist;
    });
  }

  private trackLaps() {
    const p = this.player;
    if (this.mode === 'practice') {
      // endless: count laps, but never finish, record a ghost or produce a result
      const n = Math.max(1, Math.floor(p.dist / this.track.length) + 1);
      if (n > this.playerLap && this.state === 'racing') {
        this.lapT = 0;
        this.playerLap = n;
        synth.lap();
        haptic.lap();
        this.say(`LAP ${n}`);
      }
      p.lap = n;
      return;
    }
    const lap = clamp(Math.floor(p.dist / this.track.length) + 1, 1, LAPS + 1);
    if (lap > this.playerLap && this.state === 'racing') {
      const lapMs = this.lapT * 1000;
      if (this.mode === 'trial' && this.rec.d.length > 5 && (!this.ghost || lapMs < this.ghost.lapMs)) {
        this.ghost = { lapMs, d: this.rec.d, x: this.rec.x };
        saveGhost(this.o.world, this.o.seed, this.kart.id, this.ghost);
        this.ghostCar ??= { ...this.makeCar(99, 'BEST', '#ffffff', '#ffffff', false), ghost: true };
        this.say('NEW BEST LAP');
      }
      this.rec = { lapMs: 0, d: [], x: [] };
      this.recT = 0;
      this.lapTimes.push(lapMs);
      this.lapPositions.push(this.rank().indexOf(p) + 1);
      this.lapT = 0;
      this.playerLap = lap;
      if (lap > LAPS) {
        p.finishTime = this.raceT * 1000;
        this.state = 'finished';
        this.drifting = false;
        this.finalResult = this.buildResult();
        const pos = this.rank().indexOf(p) + 1;
        synth.finish(pos <= 3);
        haptic.finish();
        this.say(pos === 1 ? 'VICTORY!' : 'FINISH!');
      } else {
        synth.lap();
        haptic.lap();
        this.say(lap === LAPS ? 'FINAL LAP' : `LAP ${lap}`);
      }
    }
    p.lap = Math.min(lap, LAPS);
  }

  private buildResult(): RaceResult {
    const ranked = this.rank();
    const p = this.player;
    const remaining = (c: Car) => Math.max(0, LAPS * this.track.length - c.dist) / Math.max(c.speed, this.wd.maxSpeed * 0.5);
    return {
      mode: this.mode === 'trial' ? 'trial' : 'race', // practice never produces a result
      kart: this.kart.id,
      world: this.o.world,
      seed: this.o.seed,
      position: ranked.indexOf(p) + 1,
      total: this.cars.length,
      lapTimes: this.lapTimes,
      lapPositions: this.lapPositions,
      bestLap: Math.min(...this.lapTimes),
      totalTime: p.finishTime ?? this.raceT * 1000,
      standings: ranked.map((c) => ({
        name: c.name,
        color: c.color,
        you: c.isPlayer,
        time: c.finishTime ?? this.raceT * 1000 + remaining(c) * 1000,
      })),
    };
  }

  private pushHud(dt: number) {
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    const ranked = this.rank();
    const p = this.player;
    const leaderDist = ranked[0].dist;
    this.o.onHud({
      position: Math.max(1, ranked.indexOf(p) + 1),
      total: this.cars.length,
      lap: Math.min(p.lap, LAPS),
      laps: LAPS,
      kmh: Math.round((p.speed / this.wd.maxSpeed) * 240),
      lapTime: this.lapT * 1000,
      raceTime: Math.max(0, this.raceT) * 1000,
      driftLevel: this.driftLvl,
      driftCharge: this.drifting ? (this.driftLvl === 0 ? this.driftCharge / 0.9 : this.driftLvl === 1 ? (this.driftCharge - 0.9) / 1.2 : 1) : 0,
      boosting: this.boostT > 0,
      countdown: this.state === 'countdown' ? Math.max(0, Math.ceil(this.countdownLen - this.time - 0.6)) : null,
      standings: ranked.map((c) => ({ name: c.name, color: c.color, you: c.isPlayer, gap: (leaderDist - c.dist) / 1000 })),
      toast: this.toast,
      fallen: this.fallT > 0,
      item: p.item,
      itemRolling: this.itemRollT > 0,
      shield: p.shieldT > 0,
      racers: this.racerMarkers(ranked),
      ahead: lookAhead(this.track.segments, this.seg(p.dist).index, this.wd.curveMax),
    });
  }

  /** Where everyone is on the lap, for the track map. */
  private racerMarkers(ranked: Car[]): HudSnapshot['racers'] {
    const L = this.track.length;
    const out: HudSnapshot['racers'] = ranked.map((c, i) => ({ id: c.id, color: c.color, you: c.isPlayer, pos: i + 1, t: mod(c.dist, L) / L }));
    if (this.ghostCar && this.state === 'racing') out.push({ id: this.ghostCar.id, color: '#ffffff', you: false, pos: 0, t: mod(this.ghostCar.dist, L) / L, ghost: true });
    return out;
  }

  // ---------- rendering ----------
  private project(pt: Segment['p1'], camX: number, camY: number, camZ: number) {
    const W = this.W;
    const H = this.H;
    pt.camera.x = -camX;
    pt.camera.y = pt.world.y - camY;
    pt.camera.z = pt.world.z - camZ;
    pt.screen.scale = CAM_DEPTH / pt.camera.z;
    pt.screen.x = Math.round(W / 2 + (pt.screen.scale * pt.camera.x * W) / 2);
    pt.screen.y = Math.round(H * HORIZON - (pt.screen.scale * pt.camera.y * H) / 2);
    pt.screen.w = Math.round((pt.screen.scale * this.wd.roadWidth * W) / 2);
  }

  private poly(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, color: string) {
    const c = this.ctx;
    c.fillStyle = color;
    c.beginPath();
    // the near edge is pushed down a pixel so neighbouring segments overlap: a bright ground colour (the desert) otherwise shows through as hairlines
    c.moveTo(x1, y1 + 1);
    c.lineTo(x2, y2 + 1);
    c.lineTo(x3, y3);
    c.lineTo(x4, y4);
    c.closePath();
    c.fill();
  }

  private render() {
    const { ctx: c, W, H, wd, track } = this;
    const segs = track.segments;
    const N = segs.length;
    const p = this.player;
    const roadW = wd.roadWidth;
    const hz = Math.round(H * HORIZON);

    c.save();
    if (this.shake > 0 && this.settings.shake) c.translate((Math.random() - 0.5) * this.shake * 10, (Math.random() - 0.5) * this.shake * 8);

    gfxState.lite = this.lite || this.settings.quality === 'low';
    drawBackdrop(c, W, H, hz, wd, this.backdrop, this.bgScroll, this.time);
    const groundFill = drawGround(c, W, H, hz, wd, this.time);

    const camPos = mod(p.dist - PLAYER_Z, track.length);
    const base = segs[Math.floor(camPos / SEG_LENGTH)];
    const basePct = (camPos % SEG_LENGTH) / SEG_LENGTH;
    const playerSeg = this.seg(p.dist);
    const playerPct = (mod(p.dist, track.length) % SEG_LENGTH) / SEG_LENGTH;
    const playerY = lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPct);
    const camY = CAM_H + playerY;

    // assign cars to segments
    const drawn = this.ghostCar && this.state === 'racing' ? [...this.cars, this.ghostCar] : this.cars;
    for (const s of drawn) this.seg(s.dist).cars.push(s);
    const propSegs: Segment[] = [];
    const putProp = (dist: number, x: number, kind: 'oil' | 'missile') => {
      const sg = this.seg(dist);
      sg.props.push({ kind, x, pct: (mod(dist, track.length) % SEG_LENGTH) / SEG_LENGTH });
      propSegs.push(sg);
    };
    for (const o of this.oils) putProp(o.dist, o.x, 'oil');
    for (const m of this.missiles) putProp(m.dist, m.x, 'missile');

    let maxy = H;
    let x = 0;
    let dx = -base.curve * basePct;

    for (let n = 0; n < DRAW_DIST; n++) {
      const seg = segs[(base.index + n) % N];
      seg.looped = seg.index < base.index;
      seg.fog = 1 - 1 / Math.pow(Math.E, (n / DRAW_DIST) * (n / DRAW_DIST) * FOG_DENSITY);
      seg.clip = maxy;
      const lz = seg.looped ? track.length : 0;
      const camX = p.x * roadW - x;
      this.project(seg.p1, camX, camY, camPos - lz);
      this.project(seg.p2, camX - dx, camY, camPos - lz);
      x += dx;
      dx += seg.curve;

      if (seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;

      const a = seg.p1.screen;
      const b = seg.p2.screen;
      const alt = Math.floor(seg.index / RUMBLE_LEN) % 2;
      // ground band, with a faint alternating tint so the speed reads, then the pavement / rails beside the road
      c.fillStyle = groundFill;
      c.fillRect(-20, b.y, W + 40, a.y - b.y + 1);
      drawRoadside(c, wd, a, b, alt, seg.index, (x1, y1, x2, y2, x3, y3, x4, y4, color) => this.poly(x1, y1, x2, y2, x3, y3, x4, y4, color), H / W);
      const rw1 = a.w / 6;
      const rw2 = b.w / 6;
      const lw1 = a.w / 40;
      const lw2 = b.w / 40;
      this.poly(a.x - a.w - rw1, a.y, a.x - a.w, a.y, b.x - b.w, b.y, b.x - b.w - rw2, b.y, wd.rumble[alt]);
      this.poly(a.x + a.w + rw1, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x + b.w + rw2, b.y, wd.rumble[alt]);
      this.poly(a.x - a.w, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x - b.w, b.y, wd.road[alt]);
      if (seg.finish) {
        for (let k = 0; k < 10; k++) {
          const t0 = -1 + k * 0.2;
          const t1 = t0 + 0.2;
          this.poly(a.x + a.w * t0, a.y, a.x + a.w * t1, a.y, b.x + b.w * t1, b.y, b.x + b.w * t0, b.y, (k + seg.index) % 2 ? '#f5f7ff' : '#10131c');
        }
      } else {
        if (seg.pad) {
          const o0 = seg.pad.offset - seg.pad.width;
          const o1 = seg.pad.offset + seg.pad.width;
          this.poly(a.x + a.w * o0, a.y, a.x + a.w * o1, a.y, b.x + b.w * o1, b.y, b.x + b.w * o0, b.y, alt ? '#ffd60a' : '#ff9f0a');
        }
        if (wd.id === 4) {
          // highway: a double yellow line down the middle, white dashes between lanes
          const yw1 = a.w / 90;
          const yw2 = b.w / 90;
          for (const o of [-0.05, 0.05]) this.poly(a.x + a.w * o - yw1, a.y, a.x + a.w * o + yw1, a.y, b.x + b.w * o + yw2, b.y, b.x + b.w * o - yw2, b.y, '#f4c430');
          if (alt) for (const lx of [-0.5, 0.5]) this.poly(a.x + a.w * lx - lw1, a.y, a.x + a.w * lx + lw1, a.y, b.x + b.w * lx + lw2, b.y, b.x + b.w * lx - lw2, b.y, wd.lane);
        } else if (alt) {
          const lanes = 3;
          for (let l = 1; l < lanes; l++) {
            const lx = -1 + (2 * l) / lanes;
            this.poly(a.x + a.w * lx - lw1, a.y, a.x + a.w * lx + lw1, a.y, b.x + b.w * lx + lw2, b.y, b.x + b.w * lx - lw2, b.y, wd.lane);
          }
        }
      }
      // neon edge glow
      c.globalAlpha = 0.5;
      this.poly(a.x - a.w - 2, a.y, a.x - a.w + 2, a.y, b.x - b.w + 2, b.y, b.x - b.w - 2, b.y, wd.glow);
      this.poly(a.x + a.w - 2, a.y, a.x + a.w + 2, a.y, b.x + b.w + 2, b.y, b.x + b.w - 2, b.y, wd.glow);
      c.globalAlpha = 1;

      if (seg.fog > 0.01) {
        c.globalAlpha = seg.fog;
        c.fillStyle = wd.fogColor;
        c.fillRect(-20, b.y, W + 40, a.y - b.y + 1);
        c.globalAlpha = 1;
      }
      maxy = a.y;
    }

    // sprites, far → near. The player's kart is drawn once we reach its segment.
    const playerN = mod(playerSeg.index - base.index, N);
    let playerDrawn = false;
    for (let n = DRAW_DIST - 1; n >= 0; n--) {
      const seg = segs[(base.index + n) % N];
      const a = seg.p1.screen;
      const useful = seg.p1.camera.z > CAM_DEPTH;
      if (useful) {
        const u = (a.scale * W) / 2;
        for (const s of seg.scenery) {
          const cx = a.x + (a.scale * s.offset * roadW * W) / 2;
          drawScenery(c, s, cx, a.y, u, wd, seg.clip, this.time, W, H);
        }
        if (seg.hazard) {
          const hzd = seg.hazard;
          const off = hzd.base + (hzd.kind === 'wind' ? Math.sin(this.time * hzd.speed + hzd.phase) * hzd.amp : 0);
          const cx = a.x + (a.scale * off * roadW * W) / 2;
          drawHazard(c, hzd, cx, a.y, u, roadW, this.time, seg.clip, wd.id === 4);
        }
        if (seg.boxes && this.mode !== 'trial') {
          for (let k = 0; k < seg.boxes.length; k++) {
            if ((this.boxTaken.get(`${seg.index}:${k}`) ?? 0) > this.time) continue;
            const cx = a.x + (a.scale * BOX_OFFSETS[k] * roadW * W) / 2;
            drawItemBox(c, cx, a.y, u, this.time, k * 2 + seg.index, seg.clip);
          }
        }
        for (const pr of seg.props) {
          const sc = lerp(seg.p1.screen.scale, seg.p2.screen.scale, pr.pct);
          const sx = lerp(seg.p1.screen.x, seg.p2.screen.x, pr.pct) + (sc * pr.x * roadW * W) / 2;
          const sy = lerp(seg.p1.screen.y, seg.p2.screen.y, pr.pct);
          drawProp(c, pr.kind, sx, sy, (sc * W) / 2, this.time, seg.clip);
        }
        for (const car of seg.cars) {
          if (car.isPlayer) continue;
          const pct = (mod(car.dist, track.length) % SEG_LENGTH) / SEG_LENGTH;
          const sc = lerp(seg.p1.screen.scale, seg.p2.screen.scale, pct);
          const sx = lerp(seg.p1.screen.x, seg.p2.screen.x, pct) + (sc * car.x * roadW * W) / 2;
          const sy = lerp(seg.p1.screen.y, seg.p2.screen.y, pct);
          const kw = (sc * KART_W * KART_DRAW * W) / 2;
          drawKart(c, sx, sy, kw, car.color, car.accent, { tilt: 0, drift: 0, boost: !car.ghost && (car.boostT > 0 || car.speed > this.wd.maxSpeed * 1.05), flicker: Math.random(), fall: 0, blink: !!car.ghost, spin: car.spinT > 0 ? 1 - car.spinT / SPIN_TIME : 0, shield: car.shieldT > 0, shape: car.shape }, seg.clip);
          if (kw > 26 && kw < W * 0.2 && sy < H * 0.8 && !car.ghost) {
            c.font = `600 ${Math.max(9, Math.round(kw * 0.17))}px -apple-system, system-ui, sans-serif`;
            c.textAlign = 'center';
            c.fillStyle = 'rgba(255,255,255,0.8)';
            c.fillText(car.name, sx, sy - kw * 0.95);
          }
        }
      }
      if (!playerDrawn && n === playerN) {
        playerDrawn = true;
        this.drawPlayer();
      }
    }
    for (const s of drawn) this.seg(s.dist).cars.length = 0;
    for (const sg of propSegs) sg.props.length = 0;
    // fog layer must not tint sprites; just clear the cars lists above
    this.drawOverlay();
    c.restore();
  }

  private drawPlayer() {
    const c = this.ctx;
    const W = this.W;
    const sc = CAM_DEPTH / PLAYER_Z;
    const ground = this.H * HORIZON + (sc * CAM_H * this.H) / 2;
    const kw = (sc * KART_W * KART_DRAW * W) / 2;
    const bounce = Math.sin(this.time * 38) * (this.player.speed / this.wd.maxSpeed) * 0.8 * (this.W / 400);
    const accent = this.driftLvl === 2 ? '#ff2d55' : this.driftLvl === 1 ? '#5ac8fa' : this.player.accent;
    drawKart(
      c,
      W / 2,
      ground + bounce,
      kw,
      this.player.color,
      accent,
      { tilt: this.visTilt, drift: this.visDrift, boost: this.boostT > 0, flicker: Math.random(), fall: this.fallT > 0 ? clampFall(this.fallT) : 0, blink: this.blinkT > 0 && Math.floor(this.time * 14) % 2 === 0, spin: this.visSpin, shield: this.player.shieldT > 0, shape: this.player.shape },
      0,
    );
    // particles in screen space
    c.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      c.globalAlpha = 1 - p.life / p.max;
      c.fillStyle = p.color;
      c.fillRect(p.x, p.y, p.size, p.size);
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  private drawOverlay() {
    const c = this.ctx;
    const { W, H } = this;
    // speed lines when boosting
    if (this.boostT > 0) {
      c.strokeStyle = 'rgba(160,230,255,0.45)';
      c.lineWidth = 2;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + this.time * 0.3;
        const r0 = Math.min(W, H) * (0.45 + ((this.time * 3 + i * 0.37) % 1) * 0.2);
        const r1 = r0 + Math.min(W, H) * 0.2;
        c.beginPath();
        c.moveTo(W / 2 + Math.cos(a) * r0 * 1.1, H * 0.45 + Math.sin(a) * r0);
        c.lineTo(W / 2 + Math.cos(a) * r1 * 1.1, H * 0.45 + Math.sin(a) * r1);
        c.stroke();
      }
    }
    // vignette
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${this.fallT > 0 ? 0.7 : this.wd.id === 4 ? 0.16 : 0.4})`);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    void mix;
  }
}

const clampFall = (t: number) => clamp(1 - t / 1.1, 0, 1);
