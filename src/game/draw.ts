import type { Hazard, Scenery, WorldConfig } from './types';

type Ctx = CanvasRenderingContext2D;

export const mix = (a: string, b: string, t: number): string => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};

/** Hide everything at or below screen-y `clipY` (road crest occlusion). */
function clipAbove(ctx: Ctx, clipY: number) {
  if (clipY <= 0) return;
  ctx.beginPath();
  ctx.rect(-10000, -10000, 20000, 10000 + clipY);
  ctx.clip();
}

function glowDot(ctx: Ctx, x: number, y: number, r: number, color: string, alpha = 1) {
  if (r < 0.8) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ---------- parallax background ----------
interface Bump {
  x: number;
  w: number;
  h: number;
  t: number;
}
export interface Backdrop {
  far: Bump[];
  near: Bump[];
  stars: { x: number; y: number; r: number }[];
}

export function makeBackdrop(rand: () => number): Backdrop {
  const mk = (n: number, wMin: number, wMax: number, hMin: number, hMax: number): Bump[] =>
    Array.from({ length: n }, (_, i) => ({ x: i / n, w: wMin + rand() * (wMax - wMin), h: hMin + rand() * (hMax - hMin), t: rand() }));
  return {
    far: mk(28, 0.03, 0.08, 0.04, 0.2),
    near: mk(18, 0.05, 0.12, 0.03, 0.14),
    stars: Array.from({ length: 70 }, () => ({ x: rand(), y: rand() * 0.8, r: 0.5 + rand() * 1.3 })),
  };
}

export function drawBackdrop(ctx: Ctx, W: number, H: number, hz: number, wd: WorldConfig, bd: Backdrop, scroll: number, t: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, hz + 4);
  sky.addColorStop(0, wd.sky[0]);
  sky.addColorStop(0.6, wd.sky[1]);
  sky.addColorStop(1, wd.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, hz + 4);

  if (wd.id !== 1) {
    ctx.fillStyle = '#fff';
    for (const s of bd.stars) {
      ctx.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(t * 1.5 + s.x * 40));
      ctx.fillRect(s.x * W, s.y * hz, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }
  // sun / moon glow
  const sx = W * 0.5 - ((scroll * 0.05) % W);
  for (const off of [0, W]) glowDot(ctx, sx + off, hz - H * 0.04, H * 0.2, wd.glow, 0.55);

  const layer = (bumps: Bump[], par: number, color: string, rim: string, hMul: number) => {
    const tile = W * 2;
    const base = -((scroll * par) % tile + tile) % tile;
    for (let rep = 0; rep < 2; rep++) {
      for (const b of bumps) {
        const x = base + rep * tile + b.x * tile;
        const bw = b.w * W * 1.4;
        const bh = b.h * H * hMul;
        if (x > W || x + bw < 0) continue;
        ctx.fillStyle = color;
        ctx.beginPath();
        if (wd.id === 1) {
          ctx.rect(x, hz - bh, bw, bh + 2);
        } else if (wd.id === 2) {
          ctx.ellipse(x + bw / 2, hz - bh * 0.15, bw * 0.9, bh * 0.45, 0, 0, Math.PI * 2);
        } else {
          ctx.moveTo(x - bw * 0.3, hz + 2);
          ctx.lineTo(x + bw * (0.3 + b.t * 0.3), hz - bh * 1.3);
          ctx.lineTo(x + bw * 1.3, hz + 2);
        }
        ctx.fill();
        if (wd.id === 1) {
          ctx.fillStyle = rim;
          ctx.fillRect(x, hz - bh, bw, 2);
          ctx.globalAlpha = 0.5;
          for (let k = 0; k < 5; k++) ctx.fillRect(x + bw * (0.15 + 0.17 * k), hz - bh * (0.2 + ((k * 37 + b.t * 100) % 60) / 100), bw * 0.06, bh * 0.05);
          ctx.globalAlpha = 1;
        }
      }
    }
  };
  if (wd.id === 1) {
    layer(bd.far, 0.18, '#0a2a52', '#5ee0ff', 1.6);
    layer(bd.near, 0.4, '#071a36', '#ff2d55', 1.4);
  } else if (wd.id === 2) {
    layer(bd.far, 0.15, 'rgba(255,170,235,0.55)', '', 1);
    layer(bd.near, 0.35, 'rgba(255,230,250,0.65)', '', 0.9);
  } else {
    layer(bd.far, 0.15, '#3a0c05', '', 1.8);
    layer(bd.near, 0.35, '#1c0503', '', 1.5);
  }
}

// ---------- road-side scenery ----------
export function drawScenery(ctx: Ctx, s: Scenery, cx: number, base: number, u: number, wd: WorldConfig, clipY: number, time: number) {
  const k = s.size;
  ctx.save();
  clipAbove(ctx, clipY);
  switch (s.kind) {
    case 'tower': {
      const w = 1000 * k * u;
      const h = (4200 + 3600 * s.hue) * k * u;
      if (w < 2) break;
      const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      g.addColorStop(0, '#0b1d3f');
      g.addColorStop(1, '#13305f');
      ctx.fillStyle = g;
      ctx.fillRect(cx - w / 2, base - h, w, h);
      ctx.fillStyle = s.hue > 0.5 ? '#ff2d55' : '#5ee0ff';
      ctx.fillRect(cx - w / 2, base - h, w, Math.max(2, w * 0.035));
      if (w > 14) {
        ctx.fillStyle = '#9be9ff';
        ctx.globalAlpha = 0.55;
        const cols = 4;
        const rows = 10;
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++)
            if (((r * 7 + c * 13 + Math.floor(s.hue * 100)) % 5) < 2)
              ctx.fillRect(cx - w / 2 + w * (0.12 + c * 0.22), base - h + h * (0.08 + r * 0.09), w * 0.1, h * 0.04);
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'sign': {
      const w = 1500 * k * u;
      const h = 2600 * k * u;
      const c = s.hue > 0.5 ? '#ff2d55' : '#5ee0ff';
      ctx.fillStyle = '#1a2340';
      ctx.fillRect(cx - w * 0.03, base - h, w * 0.06, h);
      ctx.fillStyle = '#0a1226';
      ctx.fillRect(cx - w / 2, base - h - w * 0.35, w, w * 0.35);
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(1, w * 0.03);
      ctx.strokeRect(cx - w / 2, base - h - w * 0.35, w, w * 0.35);
      glowDot(ctx, cx, base - h - w * 0.17, w * 0.7, c, 0.5);
      break;
    }
    case 'pylon': {
      const w = 220 * k * u;
      const h = 4200 * k * u;
      ctx.fillStyle = wd.id === 3 ? '#2b2530' : '#1b2548';
      ctx.fillRect(cx - w / 2, base - h, w, h);
      glowDot(ctx, cx, base - h, w * 7, wd.glow, 0.9);
      break;
    }
    case 'cloud': {
      const w = 2800 * k * u;
      const y = base - 1800 * u * k;
      ctx.fillStyle = 'rgba(255,225,250,0.55)';
      for (const [dx, dy, r] of [[-0.3, 0, 0.25], [0, -0.1, 0.33], [0.3, 0, 0.25], [0.05, 0.05, 0.3]]) {
        ctx.beginPath();
        ctx.ellipse(cx + dx * w, y + dy * w * 0.4, r * w, r * w * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'island': {
      const w = 2400 * k * u;
      const y = base - 2400 * u * k + Math.sin(time * 1.2 + s.hue * 9) * w * 0.03;
      ctx.fillStyle = '#2a1f66';
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, y);
      ctx.lineTo(cx + w / 2, y);
      ctx.lineTo(cx + w * 0.1, y + w * 0.5);
      ctx.lineTo(cx - w * 0.1, y + w * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#4b3bb0';
      ctx.fillRect(cx - w / 2, y - w * 0.05, w, w * 0.07);
      glowDot(ctx, cx, y - w * 0.15, w * 0.3, '#ff8ad8', 0.6);
      ctx.fillStyle = '#ff8ad8';
      ctx.beginPath();
      ctx.moveTo(cx, y - w * 0.3);
      ctx.lineTo(cx + w * 0.08, y - w * 0.05);
      ctx.lineTo(cx - w * 0.08, y - w * 0.05);
      ctx.fill();
      break;
    }
    case 'crystal': {
      const w = 700 * k * u;
      const h = 2600 * k * u;
      glowDot(ctx, cx, base - h * 0.5, h * 0.7, '#bf5af2', 0.5);
      ctx.fillStyle = '#d9a3ff';
      ctx.beginPath();
      ctx.moveTo(cx, base - h);
      ctx.lineTo(cx + w / 2, base - h * 0.35);
      ctx.lineTo(cx, base);
      ctx.lineTo(cx - w / 2, base - h * 0.35);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(cx, base - h);
      ctx.lineTo(cx + w / 2, base - h * 0.35);
      ctx.lineTo(cx, base - h * 0.35);
      ctx.fill();
      break;
    }
    case 'rock': {
      const w = 1700 * k * u;
      const h = (1600 + 1600 * s.hue) * k * u;
      ctx.fillStyle = '#17110f';
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, base);
      ctx.lineTo(cx - w * 0.3, base - h * 0.7);
      ctx.lineTo(cx - w * 0.05, base - h);
      ctx.lineTo(cx + w * 0.25, base - h * 0.6);
      ctx.lineTo(cx + w / 2, base);
      ctx.fill();
      ctx.strokeStyle = '#ff6a1a';
      ctx.lineWidth = Math.max(1, w * 0.015);
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.3, base - h * 0.7);
      ctx.lineTo(cx - w * 0.05, base - h);
      ctx.lineTo(cx + w * 0.25, base - h * 0.6);
      ctx.stroke();
      break;
    }
    case 'lavaPillar': {
      const w = 650 * k * u;
      const h = 3800 * k * u;
      ctx.fillStyle = '#120c0b';
      ctx.fillRect(cx - w / 2, base - h, w, h);
      ctx.fillStyle = '#ff7a1a';
      for (let i = 0; i < 6; i++) ctx.fillRect(cx - w * 0.12, base - h * (0.12 + i * 0.15), w * 0.24, Math.max(1, h * 0.03));
      const fl = 1 + 0.25 * Math.sin(time * 9 + s.hue * 20);
      glowDot(ctx, cx, base - h, w * 2.6 * fl, '#ff6a1a', 0.95);
      break;
    }
  }
  ctx.restore();
}

export function drawHazard(ctx: Ctx, hz: Hazard, cx: number, base: number, u: number, roadW: number, time: number, clipY: number) {
  ctx.save();
  clipAbove(ctx, clipY);
  const w = hz.width * roadW * 2 * u;
  if (hz.kind === 'wind') {
    const h = 2200 * u;
    const g = ctx.createLinearGradient(0, base - h, 0, base);
    g.addColorStop(0, 'rgba(120,230,255,0)');
    g.addColorStop(1, 'rgba(120,230,255,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - w / 2, base - h, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = Math.max(1, w * 0.04);
    for (let i = 0; i < 5; i++) {
      const yy = base - h * (((time * 0.9 + i / 5) % 1) as number);
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, yy);
      ctx.quadraticCurveTo(cx, yy - h * 0.05, cx + w / 2, yy);
      ctx.stroke();
    }
    ctx.fillStyle = '#5ac8fa';
    ctx.fillRect(cx - w / 2 - w * 0.06, base - h, w * 0.06, h);
    ctx.fillRect(cx + w / 2, base - h, w * 0.06, h);
  } else {
    const h = 900 * u * 1.6;
    ctx.fillStyle = '#2a2025';
    ctx.fillRect(cx - w / 2, base - h, w, h);
    ctx.fillStyle = '#ffb000';
    const stripes = 4;
    for (let i = 0; i < stripes; i += 2) ctx.fillRect(cx - w / 2 + (w / stripes) * i, base - h * 0.55, w / stripes, h * 0.25);
    glowDot(ctx, cx, base - h, w * 0.7, '#ff6a1a', 0.7);
  }
  ctx.restore();
}

// ---------- karts ----------
export interface KartFx {
  tilt: number; // -1..1 body roll from steering
  drift: number; // -1..1 drift angle
  boost: boolean;
  flicker: number;
  fall: number; // 0..1 falling progress
  blink: boolean;
  spin?: number; // 0..1 progress of a spin-out
  shield?: boolean;
}

export function drawKart(ctx: Ctx, cx: number, base: number, w: number, color: string, accent: string, fx: KartFx, clipY = 0) {
  if (w < 3) return;
  ctx.save();
  clipAbove(ctx, clipY);
  if (fx.blink) ctx.globalAlpha = 0.45;
  // shadow & underglow stay on the road
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(cx, base - w * 0.02, w * 0.55, w * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  glowDot(ctx, cx, base - w * 0.05, w * 0.7, accent, 0.45);

  const fallScale = 1 - fx.fall * 0.85;
  ctx.translate(cx, base + fx.fall * w * 1.2);
  ctx.scale(fallScale, fallScale);
  ctx.rotate(fx.tilt * 0.06 + fx.drift * 0.28 + fx.fall * 1.2 + (fx.spin ?? 0) * Math.PI * 2);

  // rear wheels
  ctx.fillStyle = '#0d0f16';
  const ww = w * 0.2;
  const wh = w * 0.34;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(s * w * 0.4 - ww / 2, -wh, ww, wh, ww * 0.3);
    ctx.fill();
    ctx.fillStyle = '#242838';
    ctx.fillRect(s * w * 0.4 - ww / 2, -wh * 0.65, ww, wh * 0.08);
    ctx.fillStyle = '#0d0f16';
  }
  // body
  const g = ctx.createLinearGradient(0, -w * 0.62, 0, -w * 0.1);
  g.addColorStop(0, color);
  g.addColorStop(1, mix(color.startsWith('#') ? color : '#888888', '#000000', 0.55));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-w * 0.36, -w * 0.12);
  ctx.lineTo(-w * 0.27, -w * 0.52);
  ctx.lineTo(w * 0.27, -w * 0.52);
  ctx.lineTo(w * 0.36, -w * 0.12);
  ctx.closePath();
  ctx.fill();
  // driver
  ctx.fillStyle = '#e9ecf7';
  ctx.beginPath();
  ctx.arc(0, -w * 0.62, w * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.fillRect(-w * 0.1, -w * 0.66, w * 0.2, w * 0.05);
  // spoiler
  ctx.fillStyle = accent;
  ctx.fillRect(-w * 0.48, -w * 0.56, w * 0.96, w * 0.07);
  ctx.fillRect(-w * 0.4, -w * 0.52, w * 0.05, w * 0.12);
  ctx.fillRect(w * 0.35, -w * 0.52, w * 0.05, w * 0.12);
  // tail lights
  ctx.fillStyle = '#ff2d55';
  ctx.fillRect(-w * 0.3, -w * 0.3, w * 0.2, w * 0.05);
  ctx.fillRect(w * 0.1, -w * 0.3, w * 0.2, w * 0.05);
  glowDot(ctx, -w * 0.2, -w * 0.28, w * 0.18, '#ff2d55', 0.7);
  glowDot(ctx, w * 0.2, -w * 0.28, w * 0.18, '#ff2d55', 0.7);
  if (fx.shield) {
    const sg = ctx.createRadialGradient(0, -w * 0.35, w * 0.2, 0, -w * 0.35, w * 0.8);
    sg.addColorStop(0, 'rgba(90,200,250,0.05)');
    sg.addColorStop(0.8, 'rgba(90,200,250,0.35)');
    sg.addColorStop(1, 'rgba(180,240,255,0.8)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(0, -w * 0.35, w * 0.8, w * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // exhaust flames
  if (fx.boost) {
    const f = 0.8 + fx.flicker * 0.5;
    for (const s of [-1, 1]) {
      const fg = ctx.createLinearGradient(0, -w * 0.1, 0, w * 0.55 * f);
      fg.addColorStop(0, '#ffffff');
      fg.addColorStop(0.3, '#5ac8fa');
      fg.addColorStop(1, 'rgba(0,122,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(s * w * 0.2 - w * 0.07, -w * 0.12);
      ctx.lineTo(s * w * 0.2 + w * 0.07, -w * 0.12);
      ctx.lineTo(s * w * 0.2, w * 0.55 * f);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------- road overlays ----------
export function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

// ---------- item boxes, oil slicks, missiles ----------
export function drawItemBox(ctx: Ctx, cx: number, base: number, u: number, time: number, phase: number, clipY: number) {
  const s = 650 * u;
  if (s < 3) return;
  const y = base - 650 * u - Math.sin(time * 3 + phase) * s * 0.08;
  ctx.save();
  clipAbove(ctx, clipY);
  glowDot(ctx, cx, y, s * 1.3, '#ffd60a', 0.55);
  ctx.translate(cx, y);
  ctx.rotate(time * 1.4 + phase);
  const g = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
  g.addColorStop(0, '#ff2d55');
  g.addColorStop(1, '#ffd60a');
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(-s / 2, -s / 2, s, s);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.strokeRect(-s / 2, -s / 2, s, s);
  ctx.rotate(-(time * 1.4 + phase));
  if (s > 12) {
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${Math.round(s * 0.7)}px -apple-system, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, s * 0.04);
  }
  ctx.restore();
}

export function drawProp(ctx: Ctx, kind: 'oil' | 'missile', cx: number, base: number, u: number, time: number, clipY: number) {
  ctx.save();
  clipAbove(ctx, clipY);
  if (kind === 'oil') {
    const w = 1000 * u;
    const g = ctx.createRadialGradient(cx, base, 0, cx, base, w / 2);
    g.addColorStop(0, 'rgba(5,5,15,0.95)');
    g.addColorStop(0.7, 'rgba(15,10,40,0.9)');
    g.addColorStop(1, 'rgba(15,10,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, base, w / 2, w * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = `hsl(${(time * 120) % 360},90%,60%)`;
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.1, base - w * 0.02, w * 0.18, w * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const s = 420 * u;
    const y = base - 320 * u;
    glowDot(ctx, cx, y, s * 2.4, '#ff6a00', 0.8);
    ctx.fillStyle = '#f2f2f7';
    ctx.beginPath();
    ctx.ellipse(cx, y, s * 0.35, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff2d55';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.35, y + s * 0.3);
    ctx.lineTo(cx - s * 0.7, y + s * 0.7);
    ctx.lineTo(cx - s * 0.2, y + s * 0.5);
    ctx.moveTo(cx + s * 0.35, y + s * 0.3);
    ctx.lineTo(cx + s * 0.7, y + s * 0.7);
    ctx.lineTo(cx + s * 0.2, y + s * 0.5);
    ctx.fill();
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, y + s * 0.5);
    ctx.lineTo(cx + s * 0.2, y + s * 0.5);
    ctx.lineTo(cx, y + s * (0.9 + 0.3 * Math.sin(time * 40)));
    ctx.fill();
  }
  ctx.restore();
}
