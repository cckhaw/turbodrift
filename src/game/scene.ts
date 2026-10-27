import type { WorldConfig } from './types.js';
import { glowDot, gfxState, mix, rgba, vGrad, type Ctx } from './gfx.js';

/** Deterministic 0..1 noise from a number, for window patterns and the like (no state, so frames never flicker). */
export const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ---------- backdrop data ----------
interface Building {
  x: number; // 0..1 along the tile
  w: number;
  h: number;
  t: number; // 0..1 variation (colour, roof, window pattern)
}
interface Puff {
  x: number;
  y: number; // 0..1 of the sky height
  s: number; // size
  t: number;
}
export interface Backdrop {
  far: Building[];
  mid: Building[];
  near: Building[];
  stars: { x: number; y: number; r: number }[];
  puffs: Puff[];
  embers: { x: number; y: number; s: number; v: number }[];
  /** pre-rendered parallax layers (browser only), rebuilt when the canvas size changes */
  cache: Record<string, { sig: string; canvas: HTMLCanvasElement }>;
}

export function makeBackdrop(rand: () => number): Backdrop {
  const row = (n: number, wMin: number, wMax: number, hMin: number, hMax: number): Building[] => {
    let x = 0;
    const out: Building[] = [];
    for (let i = 0; i < n; i++) {
      const w = wMin + rand() * (wMax - wMin);
      out.push({ x, w, h: hMin + rand() * (hMax - hMin), t: rand() });
      x += w * 0.78; // overlap a little so there are no gaps
    }
    const k = 1 / x; // normalise so the row tiles exactly
    return out.map((b) => ({ ...b, x: b.x * k, w: b.w * k }));
  };
  return {
    far: row(34, 0.03, 0.07, 0.05, 0.22),
    mid: row(26, 0.04, 0.09, 0.05, 0.18),
    near: row(18, 0.05, 0.11, 0.04, 0.12),
    stars: Array.from({ length: 90 }, () => ({ x: rand(), y: rand() * 0.85, r: 0.5 + rand() * 1.4 })),
    puffs: Array.from({ length: 22 }, () => ({ x: rand(), y: rand(), s: 0.6 + rand() * 0.9, t: rand() })),
    embers: Array.from({ length: 46 }, () => ({ x: rand(), y: rand(), s: 0.6 + rand() * 1.6, v: 0.04 + rand() * 0.1 })),
    cache: {},
  };
}

const WINDOW_COLORS = ['#ffe9a8', '#9be9ff', '#ff9ad5', '#ffd27a'];

/** One tile of a skyline layer: buildings with lit windows, rooftop kit and neon edge lines, drawn at x offset `ox`. */
function paintSkyline(ctx: Ctx, H: number, hz: number, row: Building[], tile: number, ox: number, body: string, trim: string, lit: number, hMul: number, seed: number) {
  for (let i = 0; i < row.length; i++) {
    const b = row[i];
    // a building that spills over the end of the tile is drawn again at the start so the seam is invisible
    for (const x of b.x + b.w > 1 ? [ox + b.x * tile, ox + (b.x - 1) * tile] : [ox + b.x * tile]) {
    const bw = b.w * tile;
    const bh = b.h * H * hMul;
    const top = hz - bh;
    ctx.fillStyle = body;
    ctx.fillRect(x, top, bw, bh + 2);
    // lit edge on one side, like the glowing facades of a night street
    ctx.fillStyle = rgba(trim, 0.55);
    ctx.fillRect(x, top, Math.max(1, bw * 0.05), bh + 2);
    ctx.fillStyle = trim;
    ctx.fillRect(x, top, bw, Math.max(1.2, bh * 0.012));
    if (b.t > 0.66) {
      ctx.fillStyle = body;
      ctx.fillRect(x + bw * 0.46, top - bh * 0.22, Math.max(1, bw * 0.05), bh * 0.22);
    } else if (b.t < 0.22) {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(x + bw * 0.2, top);
      ctx.lineTo(x + bw * 0.5, top - bh * 0.3);
      ctx.lineTo(x + bw * 0.8, top);
      ctx.fill();
    }
    if (lit > 0 && bw > 6) {
      const cols = Math.max(2, Math.floor(bw / 7));
      const rows = Math.max(3, Math.floor(bh / 9));
      const cw = bw / cols;
      const ch = bh / rows;
      for (let r = 1; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (hash(seed + i * 31 + r * 7 + c * 13) > lit) continue;
          ctx.fillStyle = WINDOW_COLORS[Math.floor(hash(seed + i + r * 3 + c) * WINDOW_COLORS.length)];
          ctx.globalAlpha = 0.45 + 0.5 * hash(seed + c + r * 17);
          ctx.fillRect(x + c * cw + cw * 0.22, top + r * ch + ch * 0.2, cw * 0.56, ch * 0.5);
        }
      }
      ctx.globalAlpha = 1;
    }
    }
  }
}

/** Blinking red beacons on the taller roofs (the only animated part of a skyline layer). */
function skylineBeacons(ctx: Ctx, W: number, H: number, hz: number, row: Building[], tile: number, base: number, hMul: number, t: number) {
  for (let rep = 0; rep < 2; rep++)
    for (let i = 0; i < row.length; i++) {
      const b = row[i];
      if (b.t <= 0.66) continue;
      const x = base + rep * tile + b.x * tile;
      const bw = b.w * tile;
      if (x > W || x + bw < 0 || Math.sin(t * 2.2 + i * 1.7) < 0) continue;
      glowDot(ctx, x + bw * 0.485, hz - b.h * H * hMul * 1.22, Math.max(5, bw * 0.35), '#ff2d55', 0.9);
    }
}

/**
 * Draw a horizontally tiling layer. In a browser each layer is painted once into an offscreen canvas and then
 * blitted twice per frame; without a DOM (the server-side verifier, tests) it is painted directly.
 */
function tiled(ctx: Ctx, bd: Backdrop, name: string, W: number, H: number, hz: number, tile: number, base: number, paint: (c: Ctx, ox: number) => void) {
  if (typeof document === 'undefined') {
    paint(ctx, base);
    paint(ctx, base + tile);
    return;
  }
  const sig = `${W}x${H}x${hz}`;
  let e = bd.cache[name];
  if (!e || e.sig !== sig) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(tile));
    canvas.height = Math.max(1, Math.ceil(hz + 6));
    const c2 = canvas.getContext('2d');
    if (!c2) {
      paint(ctx, base);
      paint(ctx, base + tile);
      return;
    }
    paint(c2, 0);
    e = bd.cache[name] = { sig, canvas };
  }
  // only the visible slice of each copy
  for (const dx of [base, base + tile]) {
    const x0 = Math.max(0, dx);
    const x1 = Math.min(W, dx + tile);
    if (x1 > x0) ctx.drawImage(e.canvas, x0 - dx, 0, x1 - x0, e.canvas.height, x0, 0, x1 - x0, e.canvas.height);
  }
}

const wrapBase = (scroll: number, par: number, tile: number) => -(((scroll * par) % tile) + tile) % tile;

/** A one-off image (sky gradient, sun, moon) painted once per canvas size; null where there is no DOM. */
function sprite(bd: Backdrop, name: string, w: number, h: number, sig: string, paint: (c: Ctx) => void): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let e = bd.cache[name];
  if (!e || e.sig !== sig) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w));
    canvas.height = Math.max(1, Math.ceil(h));
    const c2 = canvas.getContext('2d');
    if (!c2) return null;
    paint(c2);
    e = bd.cache[name] = { sig, canvas };
  }
  return e.canvas;
}

function fireworks(ctx: Ctx, W: number, hz: number, t: number) {
  for (let k = 0; k < 3; k++) {
    const period = 3.6 + k * 0.7;
    const ph = ((t + k * 1.3) % period) / period; // 0..1
    if (ph > 0.55) continue;
    const e = ph / 0.55;
    const cx = W * (0.2 + 0.3 * k + 0.1 * hash(Math.floor((t + k * 1.3) / period) + k));
    const cy = hz * (0.18 + 0.2 * hash(Math.floor((t + k * 1.3) / period) * 3 + k));
    const color = ['#ff5fa2', '#5ee0ff', '#ffd60a'][(Math.floor((t + k * 1.3) / period) + k) % 3];
    const R = hz * 0.15 * (0.3 + e);
    ctx.globalAlpha = (1 - e) * 0.9;
    ctx.fillStyle = color;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const rr = R * (0.8 + 0.2 * hash(i + k * 7));
      ctx.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr + e * e * hz * 0.03, 2.2, 2.2);
    }
    glowDot(ctx, cx, cy, R * 1.1, color, (1 - e) * 0.35);
  }
  ctx.globalAlpha = 1;
}

function searchLights(ctx: Ctx, W: number, hz: number, t: number) {
  ctx.globalCompositeOperation = 'lighter';
  for (const [x0, sp, col] of [[0.18, 0.7, '#5ee0ff'], [0.82, 0.55, '#ff5fa2']] as const) {
    const sway = Math.sin(t * sp + x0 * 9) * 0.28;
    const bx = W * x0;
    const g = ctx.createLinearGradient(bx, hz, bx + sway * W, 0);
    g.addColorStop(0, rgba(col, 0.28));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx - 6, hz);
    ctx.lineTo(bx + 6, hz);
    ctx.lineTo(bx + sway * W + W * 0.06, 0);
    ctx.lineTo(bx + sway * W - W * 0.06, 0);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function puff(ctx: Ctx, x: number, y: number, r: number, light: string, shadow: string, alpha: number) {
  const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, light);
  g.addColorStop(0.7, light);
  g.addColorStop(1, shadow);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function paintClouds(ctx: Ctx, tile: number, ox: number, puffs: Puff[], hz: number, yBase: number, size: number, light: string, shadow: string, alpha: number) {
  for (const p of puffs) {
    const r = size * (0.5 + p.s * 0.6);
    const y = yBase - p.y * hz * 0.1;
    for (const x of [ox + p.x * tile, ox + p.x * tile - tile]) {
      puff(ctx, x, y, r, light, shadow, alpha);
      puff(ctx, x + r * 0.9, y + r * 0.12, r * 0.75, light, shadow, alpha);
      puff(ctx, x - r * 0.85, y + r * 0.18, r * 0.65, light, shadow, alpha);
    }
  }
}

function volcano(ctx: Ctx, x: number, hz: number, w: number, h: number, body: string, t: number, glow: boolean) {
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.62, hz + 2);
  ctx.lineTo(x - w * 0.09, hz - h);
  ctx.lineTo(x + w * 0.09, hz - h);
  ctx.lineTo(x + w * 0.62, hz + 2);
  ctx.fill();
  if (glow) {
    // molten crater and a lava stream down one flank
    glowDot(ctx, x, hz - h, w * 0.5 * (1 + 0.08 * Math.sin(t * 3 + x)), '#ff7a1a', 0.9);
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(x - w * 0.09, hz - h - 1, w * 0.18, 3);
    const g = ctx.createLinearGradient(0, hz - h, 0, hz);
    g.addColorStop(0, 'rgba(255,190,70,0.95)');
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.02, hz - h);
    ctx.lineTo(x + w * 0.05, hz - h);
    ctx.lineTo(x + w * 0.22, hz);
    ctx.lineTo(x + w * 0.1, hz);
    ctx.fill();
    // drifting smoke
    for (let i = 0; i < 6; i++) {
      const p = ((t * 0.07 + i / 6) % 1) as number;
      const r = w * (0.1 + p * 0.22);
      ctx.globalAlpha = (1 - p) * 0.55;
      ctx.fillStyle = '#2a1410';
      ctx.beginPath();
      ctx.arc(x + Math.sin(i * 2 + t * 0.4) * w * 0.12 + p * w * 0.2, hz - h - p * h * 1.1, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- parallax background ----------
export function drawBackdrop(ctx: Ctx, W: number, H: number, hz: number, wd: WorldConfig, bd: Backdrop, scroll: number, t: number) {
  const sig = `${W}x${H}x${hz}`;
  // the sky gradient and the big static glow on the horizon are painted once and blitted
  const paintSky = (c: Ctx) => {
    c.fillStyle = vGrad(c, 0, hz + 4, [
      [0, wd.sky[0]],
      [0.55, wd.sky[1]],
      [1, wd.sky[2]],
    ]);
    c.fillRect(0, 0, W, hz + 4);
    if (wd.id === 1) glowDot(c, W * 0.5, hz, H * 0.5, '#ff6fb1', 0.5);
    else if (wd.id === 3) glowDot(c, W * 0.5, hz, H * 0.55, '#ff6a1a', 0.55);
  };
  const skyImg = sprite(bd, 'sky', W, hz + 4, sig, paintSky);
  if (skyImg) ctx.drawImage(skyImg, 0, 0);
  else paintSky(ctx);

  // stars (the sky is a night sky in every world)
  ctx.fillStyle = '#fff';
  for (const s of bd.stars) {
    ctx.globalAlpha = (wd.id === 1 ? 0.18 : 0.25) + 0.5 * Math.abs(Math.sin(t * 1.5 + s.x * 40));
    ctx.fillRect(s.x * W, s.y * hz * (wd.id === 1 ? 0.6 : 1), s.r, s.r);
  }
  ctx.globalAlpha = 1;

  if (wd.id === 1) {
    // big soft moon (painted once as a sprite) behind the skyline
    const mx = W * 0.72 - ((scroll * 0.01) % W);
    const S = H * 0.4;
    const moon = sprite(bd, 'moon', S, S, sig, (c) => {
      glowDot(c, S / 2, S / 2, S / 2, '#ffd6f5', 0.5);
      const mg = c.createRadialGradient(S / 2 - H * 0.012, S / 2 - H * 0.012, H * 0.005, S / 2, S / 2, H * 0.045);
      mg.addColorStop(0, '#ffffff');
      mg.addColorStop(1, '#ffc8e8');
      c.fillStyle = mg;
      c.beginPath();
      c.arc(S / 2, S / 2, H * 0.045, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,170,215,0.35)'; // a few craters
      for (const [dx, dy, r] of [[-0.012, 0.008, 0.01], [0.014, -0.006, 0.007], [0.004, 0.02, 0.006]]) {
        c.beginPath();
        c.arc(S / 2 + H * dx, S / 2 + H * dy, H * r, 0, Math.PI * 2);
        c.fill();
      }
    });
    if (moon) for (const off of [0, W]) ctx.drawImage(moon, mx + off - S / 2, hz * 0.34 - S / 2);
    if (!gfxState.lite) {
      searchLights(ctx, W, hz, t);
      fireworks(ctx, W, hz, t);
    }
    const tile = W * 2.4;
    for (const [name, row, par, body, trim, lit, hm, seed] of [
      ['far', bd.far, 0.12, '#2a2f8a', '#7a8cff', 0.35, 0.95, 11],
      ['mid', bd.mid, 0.24, '#1a1c5e', '#ff5fa2', 0.5, 0.72, 29],
      ['near', bd.near, 0.42, '#0f1040', '#5ee0ff', 0.62, 0.5, 53],
    ] as const) {
      const base = wrapBase(scroll, par, tile);
      tiled(ctx, bd, name, W, H, hz, tile, base, (c, ox) => paintSkyline(c, H, hz, row, tile, ox, body, trim, lit, hm, seed));
      if (!gfxState.lite) skylineBeacons(ctx, W, H, hz, row, tile, base, hm, t);
    }
  } else if (wd.id === 2) {
    // sunrise over a sea of cloud (the sun is a sprite), aurora ribbons above
    const sx = W * 0.5 - ((scroll * 0.03) % W);
    const S = H * 0.84;
    const sun = sprite(bd, 'sun', S, S, sig, (c) => {
      glowDot(c, S / 2, S / 2, S / 2, '#ffb3e6', 0.6);
      c.fillStyle = vGrad(c, S / 2 - H * 0.16, S / 2 + H * 0.02, [
        [0, '#fff5d6'],
        [1, '#ff9ad5'],
      ]);
      c.beginPath();
      c.arc(S / 2, S / 2, H * 0.1, Math.PI, 0);
      c.fill();
    });
    if (sun) for (const off of [0, W]) ctx.drawImage(sun, sx + off - S / 2, hz - H * 0.02 - S / 2);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < (gfxState.lite ? 0 : 3); k++) {
      const col = ['#5ee0ff', '#bf5af2', '#ff8ad8'][k];
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const [lw, al] of [[H * 0.07, 0.05], [H * 0.04, 0.07], [H * 0.015, 0.1]] as const) {
        ctx.strokeStyle = rgba(col, al);
        ctx.lineWidth = lw;
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) {
          const px = (i / 48) * W;
          const py = hz * (0.2 + k * 0.1) + Math.sin(i * 0.22 + t * 0.4 + k * 2) * hz * 0.045;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    const tile = W * 2;
    tiled(ctx, bd, 'cloudsFar', W, H, hz, tile, wrapBase(scroll, 0.1, tile), (c, ox) => paintClouds(c, tile, ox, bd.puffs, hz, hz - H * 0.03, H * 0.06, '#ffd9f5', '#c58ae8', 0.75));
    tiled(ctx, bd, 'cloudsNear', W, H, hz, tile, wrapBase(scroll + 900, 0.22, tile), (c, ox) => paintClouds(c, tile, ox, bd.puffs, hz, hz + H * 0.002, H * 0.07, '#fff0fb', '#e6a8f0', 0.95));
  } else {
    // volcanic horizon: layered ridges, glowing craters, lava falls and rising embers
    const tile = W * 2.4;
    for (const [par, hh, body, glow, n] of [
      [0.1, 0.34, '#3a0f08', true, 3],
      [0.22, 0.24, '#220805', false, 5],
      [0.4, 0.16, '#130403', false, 7],
    ] as const) {
      const base = -(((scroll * par) % tile) + tile) % tile;
      for (let rep = 0; rep < 2; rep++)
        for (let i = 0; i < n; i++) {
          const x = base + rep * tile + ((i + 0.5) / n) * tile;
          if (x < -W * 0.4 || x > W * 1.4) continue;
          volcano(ctx, x, hz, W * (0.5 + 0.2 * hash(i + par * 10)), H * hh * (0.7 + 0.5 * hash(i * 3 + par * 7)), body, t, glow);
        }
    }
    ctx.fillStyle = '#ffd27a';
    for (const e of gfxState.lite ? [] : bd.embers) {
      const y = (((e.y - t * e.v) % 1) + 1) % 1;
      ctx.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(t * 2 + e.x * 30));
      ctx.fillRect(e.x * W + Math.sin(t + e.x * 20) * 8, y * hz, e.s, e.s);
    }
    ctx.globalAlpha = 1;
  }

  // haze where the world meets the sky, in the fog colour so the road dissolves into it
  const haze = vGrad(ctx, hz - H * 0.05, hz + 2, [
    [0, rgba(wd.fogColor, 0)],
    [1, rgba(wd.fogColor, 0.75)],
  ]);
  ctx.fillStyle = haze;
  ctx.fillRect(0, hz - H * 0.05, W, H * 0.05 + 2);
}

// ---------- ground below the horizon ----------
/** Paints the ground below the horizon; returns the fill the road loop should reuse for ground that rises above it (hills), or null for flat colours. */
export function drawGround(ctx: Ctx, W: number, H: number, hz: number, wd: WorldConfig, t: number): CanvasGradient {
  if (wd.id === 2) {
    // a sea of cloud far below the floating track
    const fill = vGrad(ctx, hz, H, [
      [0, mix(wd.fogColor, '#ffffff', 0.15)],
      [0.35, '#8a46c9'],
      [1, '#240f5c'],
    ]);
    ctx.fillStyle = fill;
    ctx.fillRect(-20, hz, W + 40, H - hz + 20);
    return fill;
  } else if (wd.id === 3) {
    const fill = vGrad(ctx, hz, H, [
      [0, '#ff9a2e'],
      [0.14, '#e0480f'],
      [0.55, '#8a1a08'],
      [1, '#3a0a04'],
    ]);
    ctx.fillStyle = fill;
    ctx.fillRect(-20, hz, W + 40, H - hz + 20);
    // slow glowing cracks in the lava, in perspective
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,200,90,0.35)';
    for (let k = 0; k < 9; k++) {
      const f = (k + ((t * 0.12) % 1)) / 9;
      const y = hz + (H - hz) * f * f;
      ctx.lineWidth = 1 + f * 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let i = 1; i <= 10; i++) ctx.lineTo((i / 10) * W, y + Math.sin(i * 1.7 + k * 3 + t * 0.7) * (2 + f * 10));
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    return fill;
  }
  // city: a violet haze at the horizon sinking into the dark blocks below
  const fill = vGrad(ctx, hz, H, [
    [0, mix(wd.fogColor, '#171a52', 0.35)],
    [0.3, wd.grass[1]],
    [1, wd.grass[0]],
  ]);
  ctx.fillStyle = fill;
  ctx.fillRect(-20, hz, W + 40, H - hz + 20);
  return fill;
}

/** Outer limits of the sidewalk (as a multiple of the road half-width) in the city world. */
const SIDEWALK = 1.78;

/**
 * Extra surface detail beside the road, drawn per segment between the ground band and the road itself:
 * a tiled pavement and glowing kerb in the city, a lit platform edge in the sky, steel rails over the lava.
 */
export function drawRoadside(
  ctx: Ctx,
  wd: WorldConfig,
  a: { x: number; y: number; w: number },
  b: { x: number; y: number; w: number },
  alt: number,
  index: number,
  poly: (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, color: string) => void,
) {
  const e1 = a.w * (1 + 1 / 6);
  const e2 = b.w * (1 + 1 / 6);
  if (wd.id === 1) {
    const tile = Math.floor(index / 3) % 2;
    const color = tile ? '#3f4888' : '#363e78';
    for (const s of [-1, 1]) {
      poly(a.x + s * e1, a.y, a.x + s * a.w * SIDEWALK, a.y, b.x + s * b.w * SIDEWALK, b.y, b.x + s * e2, b.y, color);
      // low glowing barrier at the outer edge
      poly(a.x + s * a.w * SIDEWALK, a.y, a.x + s * a.w * (SIDEWALK + 0.05), a.y, b.x + s * b.w * (SIDEWALK + 0.05), b.y, b.x + s * b.w * SIDEWALK, b.y, alt ? '#ff5fa2' : '#5ee0ff');
    }
  } else if (wd.id === 2) {
    ctx.globalAlpha = 0.55;
    for (const s of [-1, 1]) poly(a.x + s * e1, a.y, a.x + s * a.w * 1.3, a.y, b.x + s * b.w * 1.3, b.y, b.x + s * e2, b.y, alt ? '#ffd6f5' : '#e9a8ff');
    ctx.globalAlpha = 1;
  } else {
    for (const s of [-1, 1]) {
      poly(a.x + s * e1, a.y, a.x + s * a.w * 1.22, a.y, b.x + s * b.w * 1.22, b.y, b.x + s * e2, b.y, alt ? '#2a2630' : '#1d1a22');
      poly(a.x + s * a.w * 1.2, a.y, a.x + s * a.w * 1.24, a.y, b.x + s * b.w * 1.24, b.y, b.x + s * b.w * 1.2, b.y, alt ? '#ff8a2a' : '#ffb347');
    }
  }
}
