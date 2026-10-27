import type { Hazard } from './types.js';
import { clipAbove, glowDot, hazardStripes, mix, rr, type Ctx } from './gfx.js';

export { mix };

export function drawHazard(ctx: Ctx, hz: Hazard, cx: number, base: number, u: number, roadW: number, time: number, clipY: number) {
  ctx.save();
  clipAbove(ctx, clipY);
  const w = hz.width * roadW * 2 * u;
  if (hz.kind === 'wind') {
    // a gate of moving air between two lit posts, with chevrons streaming upwards
    const h = 2300 * u;
    const g = ctx.createLinearGradient(0, base - h, 0, base);
    g.addColorStop(0, 'rgba(120,230,255,0)');
    g.addColorStop(1, 'rgba(120,230,255,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - w / 2, base - h, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1, w * 0.035);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 5; i++) {
      const p = (time * 0.9 + i / 5) % 1;
      const yy = base - h * p;
      ctx.globalAlpha = Math.sin(p * Math.PI);
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.3, yy + w * 0.12);
      ctx.lineTo(cx, yy - w * 0.04);
      ctx.lineTo(cx + w * 0.3, yy + w * 0.12);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const sx of [-1, 1]) {
      const px = cx + sx * (w / 2 + w * 0.04);
      const pg = ctx.createLinearGradient(px - w * 0.05, 0, px + w * 0.05, 0);
      pg.addColorStop(0, '#e9fbff');
      pg.addColorStop(1, '#5ac8fa');
      ctx.fillStyle = pg;
      ctx.fillRect(px - w * 0.04, base - h, w * 0.08, h);
      glowDot(ctx, px, base - h, w * 0.3, '#5ac8fa', 0.8);
    }
  } else {
    // striped concrete barrier with a flashing beacon
    const h = 1500 * u;
    const bg = ctx.createLinearGradient(0, base - h, 0, base);
    bg.addColorStop(0, '#6a6470');
    bg.addColorStop(1, '#2a262f');
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, base, w * 0.62, w * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bg;
    ctx.fillRect(cx - w / 2, base - h, w, h);
    hazardStripes(ctx, cx - w / 2, base - h * 0.78, w, h * 0.34);
    ctx.fillStyle = '#1b1820';
    ctx.fillRect(cx - w / 2, base - h, w, Math.max(1, h * 0.06));
    if (Math.floor(time * 3 + hz.phase) % 2 === 0) glowDot(ctx, cx, base - h - w * 0.06, w * 0.7, '#ff7a1a', 0.9);
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(cx - w * 0.07, base - h - w * 0.1, w * 0.14, w * 0.1);
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
  shape?: 'comet' | 'rocket' | 'phantom';
  shield?: boolean;
}

const INK = '#0b0d1a';

export function drawKart(ctx: Ctx, cx: number, base: number, w: number, color: string, accent: string, fx: KartFx, clipY = 0) {
  if (w < 3) return;
  const shape = fx.shape ?? 'comet';
  const col = color.startsWith('#') ? color : '#888888';
  const acc = accent.startsWith('#') ? accent : '#ffffff';
  const line = Math.max(1, w * 0.024);
  ctx.save();
  clipAbove(ctx, clipY);
  if (fx.blink) ctx.globalAlpha = 0.45;
  // shadow & underglow stay on the road
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(cx, base - w * 0.02, w * 0.58, w * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  glowDot(ctx, cx, base - w * 0.05, w * 0.75, acc, 0.5);

  const fallScale = 1 - fx.fall * 0.85;
  ctx.translate(cx, base + fx.fall * w * 1.2);
  ctx.scale(fallScale, fallScale);
  ctx.rotate(fx.tilt * 0.06 + fx.drift * 0.28 + fx.fall * 1.2 + (fx.spin ?? 0) * Math.PI * 2);
  ctx.lineJoin = 'round';
  ctx.lineWidth = line;
  ctx.strokeStyle = INK;

  // rear tyres: chunky, with tread bands and a bright rim light on the outer edge
  const ww = w * 0.22;
  const wh = w * 0.36;
  for (const sd of [-1, 1]) {
    const x = sd * w * 0.41 - ww / 2;
    const tg = ctx.createLinearGradient(x, 0, x + ww, 0);
    tg.addColorStop(0, sd < 0 ? '#3a3f55' : '#1a1d2b');
    tg.addColorStop(0.5, '#171a27');
    tg.addColorStop(1, sd < 0 ? '#1a1d2b' : '#3a3f55');
    ctx.fillStyle = tg;
    rr(ctx, x, -wh, ww, wh, ww * 0.32);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2e3348';
    for (let t = 1; t < 4; t++) ctx.fillRect(x + ww * 0.12, -wh + (wh * t) / 4 - line * 0.5, ww * 0.76, line);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(sd < 0 ? x + ww * 0.1 : x + ww * 0.78, -wh * 0.9, ww * 0.1, wh * 0.7);
  }

  // body: glossy gradient, outline, top highlight
  const g = ctx.createLinearGradient(0, -w * 0.64, 0, -w * 0.08);
  g.addColorStop(0, mix(col, '#ffffff', 0.35));
  g.addColorStop(0.35, col);
  g.addColorStop(1, mix(col, '#000000', 0.5));
  ctx.fillStyle = g;
  const pts: [number, number][] =
    shape === 'rocket'
      ? [[-0.4, -0.1], [-0.17, -0.62], [0.17, -0.62], [0.4, -0.1]]
      : shape === 'phantom'
        ? [[-0.44, -0.1], [-0.3, -0.44], [0.3, -0.44], [0.44, -0.1]]
        : [[-0.37, -0.1], [-0.28, -0.54], [0.28, -0.54], [0.37, -0.1]];
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * w) : ctx.moveTo(x * w, y * w)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // highlight along the shoulder
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.moveTo(pts[1][0] * w + w * 0.02, pts[1][1] * w + w * 0.02);
  ctx.lineTo(pts[2][0] * w - w * 0.02, pts[2][1] * w + w * 0.02);
  ctx.lineTo(pts[2][0] * w - w * 0.06, pts[2][1] * w + w * 0.09);
  ctx.lineTo(pts[1][0] * w + w * 0.06, pts[1][1] * w + w * 0.09);
  ctx.fill();
  // fender flares over the tyres, in body colour
  ctx.fillStyle = mix(col, '#000000', 0.18);
  for (const sd of [-1, 1]) {
    rr(ctx, sd * w * 0.41 - ww * 0.62, -wh * 1.02, ww * 1.24, wh * 0.26, ww * 0.3);
    ctx.fill();
    ctx.stroke();
  }
  if (shape === 'phantom') {
    ctx.fillStyle = acc;
    ctx.fillRect(-w * 0.03, -w * 0.44, w * 0.06, w * 0.34); // glowing spine
    glowDot(ctx, 0, -w * 0.28, w * 0.25, acc, 0.5);
  } else if (shape === 'rocket') {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(-w * 0.035, -w * 0.6, w * 0.07, w * 0.44); // racing stripe
    ctx.fillRect(-w * 0.11, -w * 0.6, w * 0.025, w * 0.44);
    ctx.fillRect(w * 0.085, -w * 0.6, w * 0.025, w * 0.44);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; // number roundel
    ctx.beginPath();
    ctx.arc(0, -w * 0.3, w * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.fillRect(-w * 0.012, -w * 0.35, w * 0.024, w * 0.1);
  }

  // engine block with chrome exhausts
  ctx.fillStyle = '#1b1e2e';
  rr(ctx, -w * 0.17, -w * 0.2, w * 0.34, w * 0.13, w * 0.04);
  ctx.fill();
  ctx.stroke();
  for (const sd of [-1, 1]) {
    const ex = sd * w * 0.085;
    const eg = ctx.createRadialGradient(ex - w * 0.01, -w * 0.15, w * 0.005, ex, -w * 0.135, w * 0.055);
    eg.addColorStop(0, '#ffffff');
    eg.addColorStop(0.5, '#aab3c9');
    eg.addColorStop(1, '#3a4054');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(ex, -w * 0.135, w * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = fx.boost ? '#5ac8fa' : '#0b0d1a';
    ctx.beginPath();
    ctx.arc(ex, -w * 0.135, w * 0.028, 0, Math.PI * 2);
    ctx.fill();
  }

  // driver: shoulders, helmet with a reflective visor
  const headY = shape === 'rocket' ? -w * 0.7 : shape === 'phantom' ? -w * 0.52 : -w * 0.64;
  const jersey = shape === 'phantom' ? '#232640' : acc;
  ctx.fillStyle = jersey;
  rr(ctx, -w * 0.15, headY + w * 0.05, w * 0.3, w * 0.17, w * 0.07);
  ctx.fill();
  ctx.stroke();
  const hr = w * 0.145;
  const hg = ctx.createRadialGradient(-hr * 0.35, headY - hr * 0.4, hr * 0.1, 0, headY, hr * 1.1);
  const helmet = shape === 'phantom' ? '#2a2d48' : shape === 'rocket' ? '#fff3d6' : '#ffffff';
  hg.addColorStop(0, '#ffffff');
  hg.addColorStop(0.55, helmet);
  hg.addColorStop(1, mix(helmet.startsWith('#') ? helmet : '#ffffff', '#6a7088', 0.55));
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(0, headY, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // helmet stripe in the kart's accent
  ctx.fillStyle = acc;
  ctx.fillRect(-hr * 0.16, headY - hr * 0.98, hr * 0.32, hr * 0.7);
  // visor
  const vg = ctx.createLinearGradient(0, headY - hr * 0.2, 0, headY + hr * 0.3);
  vg.addColorStop(0, shape === 'phantom' ? acc : '#2a3350');
  vg.addColorStop(1, '#0b0d1a');
  ctx.fillStyle = vg;
  rr(ctx, -hr * 0.82, headY - hr * 0.16, hr * 1.64, hr * 0.5, hr * 0.25);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(-hr * 0.6, headY - hr * 0.06, hr * 0.7, Math.max(1, hr * 0.07));

  // wing / fins
  ctx.fillStyle = acc;
  if (shape === 'rocket') {
    rr(ctx, -w * 0.56, -w * 0.52, w * 1.12, w * 0.07, w * 0.02);
    ctx.fill();
    ctx.stroke();
    for (const sd of [-1, 1]) {
      rr(ctx, sd * w * 0.52 - w * 0.03, -w * 0.64, w * 0.06, w * 0.2, w * 0.015);
      ctx.fill();
      ctx.stroke();
    }
  } else if (shape === 'phantom') {
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sd * w * 0.36, -w * 0.4);
      ctx.lineTo(sd * w * 0.66, -w * 0.66);
      ctx.lineTo(sd * w * 0.48, -w * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    rr(ctx, -w * 0.3, -w * 0.45, w * 0.6, w * 0.04, w * 0.015);
    ctx.fill();
  } else {
    rr(ctx, -w * 0.5, -w * 0.58, w * 1.0, w * 0.08, w * 0.025);
    ctx.fill();
    ctx.stroke();
    for (const sd of [-1, 1]) {
      rr(ctx, sd * w * 0.4 - w * 0.025, -w * 0.52, w * 0.05, w * 0.12, w * 0.01);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.fillStyle = acc;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(-w * 0.46, -w * 0.575, w * 0.92, w * 0.018);
  }
  // tail lights
  ctx.fillStyle = '#ff2d55';
  for (const sd of [-1, 1]) {
    rr(ctx, sd * w * 0.2 - w * 0.1, -w * 0.33, w * 0.2, w * 0.055, w * 0.025);
    ctx.fill();
  }
  glowDot(ctx, -w * 0.2, -w * 0.3, w * 0.2, '#ff2d55', 0.75, true);
  glowDot(ctx, w * 0.2, -w * 0.3, w * 0.2, '#ff2d55', 0.75, true);
  if (fx.shield) {
    const sg = ctx.createRadialGradient(0, -w * 0.35, w * 0.2, 0, -w * 0.35, w * 0.85);
    sg.addColorStop(0, 'rgba(90,200,250,0.05)');
    sg.addColorStop(0.8, 'rgba(90,200,250,0.35)');
    sg.addColorStop(1, 'rgba(180,240,255,0.85)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(0, -w * 0.38, w * 0.85, w * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // exhaust flames
  if (fx.boost) {
    const f = 0.8 + fx.flicker * 0.5;
    for (const sd of [-1, 1]) {
      const ex = sd * w * 0.085;
      const fg = ctx.createLinearGradient(0, -w * 0.12, 0, w * 0.6 * f);
      fg.addColorStop(0, '#ffffff');
      fg.addColorStop(0.3, '#5ac8fa');
      fg.addColorStop(1, 'rgba(0,122,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(ex - w * 0.045, -w * 0.12);
      ctx.lineTo(ex + w * 0.045, -w * 0.12);
      ctx.lineTo(ex, w * 0.6 * f);
      ctx.fill();
    }
    glowDot(ctx, 0, -w * 0.05, w * 0.45, '#5ac8fa', 0.5);
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
