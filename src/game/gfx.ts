/** Small canvas helpers shared by the scene, kart and effect drawing code. */
export type Ctx = CanvasRenderingContext2D;

const parse = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Blend two #rrggbb colours (t = 0 → a, 1 → b). */
export const mix = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const c = (x: number, y: number) => Math.round(x * (1 - t) + y * t);
  return `rgb(${c(ar, br)},${c(ag, bg)},${c(ab, bb)})`;
};

/** Like mix(), but returns #rrggbb so the result can be mixed again. */
export const mixHex = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const c = (x: number, y: number) => Math.max(0, Math.min(255, Math.round(x * (1 - t) + y * t)));
  return '#' + [c(ar, br), c(ag, bg), c(ab, bb)].map((v) => v.toString(16).padStart(2, '0')).join('');
};

/** #rrggbb + alpha → rgba() string. */
export const rgba = (hex: string, a: number): string => {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/** Lighten (amount > 0) or darken (amount < 0) a #rrggbb colour. */
export const shade = (hex: string, amount: number): string => (amount >= 0 ? mix(hex, '#ffffff', amount) : mix(hex, '#000000', -amount));

/** Hide everything at or below screen-y `clipY` (road crest occlusion). */
export function clipAbove(ctx: Ctx, clipY: number) {
  if (clipY <= 0) return;
  ctx.beginPath();
  ctx.rect(-10000, -10000, 20000, 10000 + clipY);
  ctx.clip();
}

/** Set by the engine: true when the device can't keep up (or Battery saver is on), so decoration is trimmed. */
export const gfxState = {
  lite: false,
  /** storm world: how dark it is (0 day .. 1 night) and which way the wind blows (-1..1), for lamps and swaying trees */
  night: 0,
  wind: 0,
  /** at night the lights are queued and drawn after the scene is darkened, so they stay bright */
  deferGlow: false,
  glows: [] as { x: number; y: number; r: number; color: string; alpha: number }[],
};

/** Draw the queued lights on top (after the night tint), then clear the queue. */
export function flushGlows(ctx: Ctx, boost = 1): void {
  const q = gfxState.glows;
  gfxState.deferGlow = false;
  for (const g of q) glowDot(ctx, g.x, g.y, g.r, g.color, Math.min(1, g.alpha * boost), true);
  q.length = 0;
}

const glowSprites = new Map<string, HTMLCanvasElement>();
const GLOW_PX = 64;

/** A soft round light in one colour, rendered once and then stamped (much cheaper than building a gradient per use). */
function glowSprite(color: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let s = glowSprites.get(color);
  if (!s) {
    s = document.createElement('canvas');
    s.width = s.height = GLOW_PX;
    const c = s.getContext('2d');
    if (!c) return null;
    const g = c.createRadialGradient(GLOW_PX / 2, GLOW_PX / 2, 0, GLOW_PX / 2, GLOW_PX / 2, GLOW_PX / 2);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, GLOW_PX, GLOW_PX);
    glowSprites.set(color, s);
  }
  return s;
}

/** Additive radial light, the cheap "bloom" used for lamps, neon and engines. */
export function glowDot(ctx: Ctx, x: number, y: number, r: number, color: string, alpha = 1, essential = false) {
  if (r < 1.5 || (gfxState.lite && !essential)) return;
  if (gfxState.deferGlow) {
    if (gfxState.glows.length < 500) gfxState.glows.push({ x, y, r, color, alpha });
    return;
  }
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  const sprite = glowSprite(color);
  if (sprite) ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  else {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** Rounded rectangle path (falls back to a plain rect on very old browsers). */
export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  else ctx.rect(x, y, w, h);
}

/** Soft vertical gradient fill. */
export function vGrad(ctx: Ctx, y0: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** Diagonal amber-and-black warning stripes. */
export function hazardStripes(ctx: Ctx, x: number, y: number, w: number, h: number, a = '#ffc400', b = '#1a1a1a') {
  ctx.fillStyle = a;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = b;
  const step = Math.max(2, h / 4);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let sy = y - h; sy < y + h * 1.5; sy += step * 2) {
    ctx.beginPath();
    ctx.moveTo(x - 2, sy + step);
    ctx.lineTo(x + w + 2, sy - step * 0.2);
    ctx.lineTo(x + w + 2, sy + step * 0.8);
    ctx.lineTo(x - 2, sy + step * 2);
    ctx.fill();
  }
  ctx.restore();
}
