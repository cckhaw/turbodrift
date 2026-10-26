import { synth } from '../audio/synth';
import { Rng, hashSeed } from '../utils/rng';
import { BOT_COLORS, BOT_NAMES, LAPS, SEG_LENGTH, WORLDS } from './worlds';
import { generateTrack } from './track';
import { drawBackdrop, drawHazard, drawKart, drawScenery, lerp, makeBackdrop, mix, type Backdrop } from './draw';
import type { Car, HudSnapshot, RaceResult, Segment, Track, WorldConfig } from './types';

const FOV = 80;
const CAM_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
const PLAYER_Z = 3000;
const CAM_H = 2500;
const DRAW_DIST = 130;
const KART_W = 900; // world units
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
  private lapTimes: number[] = [];
  private lapPositions: number[] = [];
  private playerLap = 1;
  private visTilt = 0;
  private visDrift = 0;
  private resizeObs?: ResizeObserver;

  constructor(private o: EngineOptions) {
    this.ctx = o.canvas.getContext('2d', { alpha: false })!;
    this.wd = WORLDS[o.world - 1];
    this.track = generateTrack(o.world, o.seed);
    const r = new Rng(hashSeed(o.world, o.seed, 99));
    this.backdrop = makeBackdrop(() => r.next());
    this.player = this.makeCar(0, 'YOU', '#007AFF', '#5AC8FA', true);
    this.setupGrid(r);
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(o.canvas);
  }

  // ---------- setup ----------
  private makeCar(id: number, name: string, color: string, accent: string, isPlayer: boolean): Car {
    return { id, name, color, accent, dist: 0, x: 0, speed: 0, isPlayer, skill: 1, lane: 0, wobble: 0, finishTime: null, lap: 1, steerVis: 0 };
  }

  private setupGrid(r: Rng) {
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
    synth.startEngine();
    synth.startMusic(this.wd);
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this.update(dt);
      this.render();
    };
    this.raf = requestAnimationFrame(tick);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = c.clientWidth || window.innerWidth;
    const ch = c.clientHeight || window.innerHeight;
    const scale = Math.min(dpr, 1000 / Math.max(cw, 1));
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

  private update(dt: number) {
    this.time += dt;
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.toast = null;

    if (this.state === 'countdown') {
      const left = COUNTDOWN - this.time;
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
    this.collisions(dt);
    this.trackLaps();
    this.stepParticles(dt);

    if (this.state === 'finished') {
      this.finishT += dt;
      if (!this.reported && this.finishT > 3.2) {
        this.reported = true;
        this.o.onFinish(this.buildResult());
      }
    }
    synth.updateEngine(this.player.speed / this.wd.maxSpeed, this.drifting, this.boostT > 0, this.fallT > 0);
    this.pushHud(dt);
  }

  private stepPlayer(dt: number, frozen: boolean) {
    const p = this.player;
    const wd = this.wd;
    const max = wd.maxSpeed;
    const seg = this.seg(p.dist);
    this.blinkT = Math.max(0, this.blinkT - dt);
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.shake = Math.max(0, this.shake - dt * 3);

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

    let steer = this.state === 'finished' ? clamp((this.track.line[this.seg(p.dist + 1500).index] - p.x) * 2.5, -1, 1) : this.input.steer;
    const pct = clamp(p.speed / max, 0, 1.5);

    // drift state machine
    const wantDrift = this.input.drift && this.state === 'racing' && pct > 0.35;
    if (wantDrift && !this.drifting && Math.abs(steer) > 0.25) {
      this.drifting = true;
      this.driftDir = Math.sign(steer);
      this.driftCharge = 0;
      this.driftLvl = 0;
    }
    if (this.drifting && !wantDrift) this.releaseDrift();
    let steerEff = steer;
    let cent = wd.centrifugal;
    let turnRate = 2;
    if (this.drifting) {
      this.driftCharge += dt * (0.8 + 0.4 * Math.abs(steer));
      const lvl: 0 | 1 | 2 = this.driftCharge > 2.1 ? 2 : this.driftCharge > 0.9 ? 1 : 0;
      if (lvl > this.driftLvl) synth.driftLevel(lvl);
      this.driftLvl = lvl;
      steerEff = this.driftDir * (0.6 + 0.4 * clamp(steer * this.driftDir, -1, 1));
      cent *= 0.38;
      turnRate = 2.3;
      this.sparks(dt);
    }

    // speed model
    const boosting = this.boostT > 0;
    if (boosting) this.boostT -= dt;
    const offroad = Math.abs(p.x) > 1;
    let target = max * (boosting ? 1.38 : 1) * (this.drifting ? 0.97 : 1);
    if (offroad) target = Math.min(target, max * wd.offroadLimit);
    const accel = max * (boosting ? 1.4 : 0.42);
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
    }

    // pads + hazards on the segment we are in
    if (seg.pad && Math.abs(p.x - seg.pad.offset) < seg.pad.width + 0.1 && this.boostT < 0.9) {
      this.boostT = 1.2;
      synth.pad();
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
      }
    }
    this.visTilt = lerp(this.visTilt, steerEff, Math.min(1, dt * 8));
    this.visDrift = lerp(this.visDrift, this.drifting ? this.driftDir * (0.5 + 0.3 * steer * this.driftDir) : 0, Math.min(1, dt * 10));
  }

  private releaseDrift(cancel = false) {
    if (!cancel && this.driftLvl > 0) {
      this.boostT = this.driftLvl === 2 ? 1.7 : 0.95;
      synth.boost(this.driftLvl);
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
      const targetSpeed = wd.maxSpeed * b.skill * cornerSlow * rb;
      if (b.speed < targetSpeed) b.speed = Math.min(targetSpeed, b.speed + wd.maxSpeed * 0.4 * dt);
      else b.speed = Math.max(targetSpeed, b.speed - wd.maxSpeed * 0.5 * dt);
      const lat = 1.7 * clamp(b.speed / wd.maxSpeed, 0.2, 1) * dt;
      b.x += clamp(target - b.x, -lat, lat);
      b.dist += b.speed * dt;
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
    const lap = clamp(Math.floor(p.dist / this.track.length) + 1, 1, LAPS + 1);
    if (lap > this.playerLap && this.state === 'racing') {
      this.lapTimes.push(this.lapT * 1000);
      this.lapPositions.push(this.rank().indexOf(p) + 1);
      this.lapT = 0;
      this.playerLap = lap;
      if (lap > LAPS) {
        p.finishTime = this.raceT * 1000;
        this.state = 'finished';
        this.drifting = false;
        const pos = this.rank().indexOf(p) + 1;
        synth.finish(pos <= 3);
        this.say(pos === 1 ? 'VICTORY!' : 'FINISH!');
      } else {
        synth.lap();
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
      countdown: this.state === 'countdown' ? Math.max(0, Math.ceil(COUNTDOWN - this.time - 0.6)) : null,
      standings: ranked.map((c) => ({ name: c.name, color: c.color, you: c.isPlayer, gap: (leaderDist - c.dist) / 1000 })),
      toast: this.toast,
      fallen: this.fallT > 0,
    });
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
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
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
    if (this.shake > 0) c.translate((Math.random() - 0.5) * this.shake * 10, (Math.random() - 0.5) * this.shake * 8);

    drawBackdrop(c, W, H, hz, wd, this.backdrop, this.bgScroll, this.time);
    c.fillStyle = wd.grass[0];
    c.fillRect(-20, hz, W + 40, H - hz + 20);

    const camPos = mod(p.dist - PLAYER_Z, track.length);
    const base = segs[Math.floor(camPos / SEG_LENGTH)];
    const basePct = (camPos % SEG_LENGTH) / SEG_LENGTH;
    const playerSeg = this.seg(p.dist);
    const playerPct = (mod(p.dist, track.length) % SEG_LENGTH) / SEG_LENGTH;
    const playerY = lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPct);
    const camY = CAM_H + playerY;

    // assign cars to segments
    for (const s of this.cars) {
      const sg = this.seg(s.dist);
      sg.cars.push(s);
    }

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
      // ground band
      c.fillStyle = wd.grass[alt];
      c.fillRect(-20, b.y, W + 40, a.y - b.y + 1);
      // lava / sky glow bands off the edge
      if (wd.fallOff) {
        c.fillStyle = alt ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
        c.fillRect(-20, b.y, W + 40, a.y - b.y + 1);
      }
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
        if (alt) {
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
          drawScenery(c, s, cx, a.y, u, wd, seg.clip, this.time);
        }
        if (seg.hazard) {
          const hzd = seg.hazard;
          const off = hzd.base + (hzd.kind === 'wind' ? Math.sin(this.time * hzd.speed + hzd.phase) * hzd.amp : 0);
          const cx = a.x + (a.scale * off * roadW * W) / 2;
          drawHazard(c, hzd, cx, a.y, u, roadW, this.time, seg.clip);
        }
        for (const car of seg.cars) {
          if (car.isPlayer) continue;
          const pct = (mod(car.dist, track.length) % SEG_LENGTH) / SEG_LENGTH;
          const sc = lerp(seg.p1.screen.scale, seg.p2.screen.scale, pct);
          const sx = lerp(seg.p1.screen.x, seg.p2.screen.x, pct) + (sc * car.x * roadW * W) / 2;
          const sy = lerp(seg.p1.screen.y, seg.p2.screen.y, pct);
          const kw = (sc * KART_W * W) / 2;
          drawKart(c, sx, sy, kw, car.color, car.accent, { tilt: 0, drift: 0, boost: car.speed > this.wd.maxSpeed * 1.05, flicker: Math.random(), fall: 0, blink: false }, seg.clip);
          if (kw > 26 && kw < W * 0.2 && sy < H * 0.8) {
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
    for (const s of this.cars) this.seg(s.dist).cars.length = 0;
    // fog layer must not tint sprites; just clear the cars lists above
    this.drawOverlay();
    c.restore();
  }

  private drawPlayer() {
    const c = this.ctx;
    const W = this.W;
    const sc = CAM_DEPTH / PLAYER_Z;
    const ground = this.H * HORIZON + (sc * CAM_H * this.H) / 2;
    const kw = (sc * KART_W * W) / 2;
    const bounce = Math.sin(this.time * 38) * (this.player.speed / this.wd.maxSpeed) * 0.8 * (this.W / 400);
    const accent = this.driftLvl === 2 ? '#ff2d55' : this.driftLvl === 1 ? '#5ac8fa' : this.player.accent;
    drawKart(
      c,
      W / 2,
      ground + bounce,
      kw,
      this.player.color,
      accent,
      { tilt: this.visTilt, drift: this.visDrift, boost: this.boostT > 0, flicker: Math.random(), fall: this.fallT > 0 ? clampFall(this.fallT) : 0, blink: this.blinkT > 0 && Math.floor(this.time * 14) % 2 === 0 },
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
    g.addColorStop(1, `rgba(0,0,0,${this.fallT > 0 ? 0.7 : 0.4})`);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    void mix;
  }
}

const clampFall = (t: number) => clamp(1 - t / 1.1, 0, 1);
