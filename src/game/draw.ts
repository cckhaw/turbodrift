import type { Hazard } from './types.js';
import { clipAbove, glowDot, hazardStripes, mix, rr, type Ctx } from './gfx.js';

export { mix };

export function drawHazard(ctx: Ctx, hz: Hazard, cx: number, base: number, u: number, roadW: number, time: number, clipY: number, day = false) {
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
  } else if (day) {
    // a stack of striped traffic barrels with a flashing lamp on top
    const bw = w / 2.4;
    const bh = bw * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, base, w * 0.6, w * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -0.82]] as const) {
      const x = cx + dx * bw * 0.52;
      const y = base + dy * bh;
      const g = ctx.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
      g.addColorStop(0, '#d9560f');
      g.addColorStop(0.5, '#ff8a2a');
      g.addColorStop(1, '#c4480a');
      ctx.fillStyle = g;
      rr(ctx, x - bw / 2, y - bh, bw, bh, bw * 0.18);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - bw / 2, y - bh * 0.72, bw, bh * 0.14);
      ctx.fillRect(x - bw / 2, y - bh * 0.4, bw, bh * 0.14);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x - bw / 2, y - bh, bw, Math.max(1, bh * 0.05));
    }
    if (Math.floor(time * 3 + hz.phase) % 2 === 0) glowDot(ctx, cx, base - bh * 1.9, w * 0.5, '#ffb347', 0.9);
    ctx.fillStyle = '#ffd60a';
    ctx.fillRect(cx - w * 0.05, base - bh * 1.95, w * 0.1, w * 0.08);
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
  const line = Math.max(1, w * 0.026);
  ctx.save();
  clipAbove(ctx, clipY);
  if (fx.blink) ctx.globalAlpha = 0.45;
  // shadow & underglow stay on the road
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(cx, base - w * 0.02, w * 0.6, w * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  glowDot(ctx, cx, base - w * 0.05, w * 0.75, acc, 0.4);

  const fallScale = 1 - fx.fall * 0.85;
  ctx.translate(cx, base + fx.fall * w * 1.2);
  ctx.scale(fallScale, fallScale);
  ctx.rotate(fx.tilt * 0.06 + fx.drift * 0.28 + fx.fall * 1.2 + (fx.spin ?? 0) * Math.PI * 2);
  ctx.lineJoin = 'round';
  ctx.lineWidth = line;
  ctx.strokeStyle = INK;

  // body proportions per kart: all of them are round, some rounder than others
  const P = shape === 'rocket' ? { rx: 0.31, ry: 0.27, cy: -0.31, tyreX: 0.4, tyreW: 0.2, tyreH: 0.36 } : shape === 'phantom' ? { rx: 0.4, ry: 0.19, cy: -0.24, tyreX: 0.44, tyreW: 0.22, tyreH: 0.32 } : { rx: 0.35, ry: 0.24, cy: -0.29, tyreX: 0.42, tyreW: 0.22, tyreH: 0.36 };
  const ww = w * P.tyreW;
  const wh = w * P.tyreH;

  // fat rear tyres: capsules with a glossy edge and a hub
  for (const sd of [-1, 1]) {
    const x = sd * w * P.tyreX - ww / 2;
    const tg = ctx.createLinearGradient(x, 0, x + ww, 0);
    tg.addColorStop(0, sd < 0 ? '#454b63' : '#1d2030');
    tg.addColorStop(0.5, '#181b29');
    tg.addColorStop(1, sd < 0 ? '#1d2030' : '#454b63');
    ctx.fillStyle = tg;
    rr(ctx, x, -wh, ww, wh, ww * 0.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    rr(ctx, sd < 0 ? x + ww * 0.12 : x + ww * 0.72, -wh * 0.88, ww * 0.16, wh * 0.62, ww * 0.08);
    ctx.fill();
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.ellipse(x + ww / 2, -wh * 0.42, ww * 0.2, wh * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // round body: a glossy bubble with a lighter belly stripe and a big highlight
  const g = ctx.createLinearGradient(0, w * (P.cy - P.ry), 0, w * (P.cy + P.ry));
  g.addColorStop(0, mix(col, '#ffffff', 0.42));
  g.addColorStop(0.4, col);
  g.addColorStop(1, mix(col, '#000000', 0.45));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, w * P.cy, w * P.rx, w * P.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.beginPath();
  ctx.ellipse(-w * P.rx * 0.38, w * (P.cy - P.ry * 0.5), w * P.rx * 0.34, w * P.ry * 0.2, -0.35, 0, Math.PI * 2);
  ctx.fill();

  // rounded fenders over the tyres
  ctx.fillStyle = mix(col, '#000000', 0.12);
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sd * w * P.tyreX, -wh * 0.98, ww * 0.82, wh * 0.26, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // kart-specific details
  if (shape === 'phantom') {
    ctx.fillStyle = acc;
    rr(ctx, -w * 0.035, w * (P.cy - P.ry * 0.9), w * 0.07, w * P.ry * 1.6, w * 0.035);
    ctx.fill();
    glowDot(ctx, 0, w * P.cy, w * 0.26, acc, 0.5);
    for (const sd of [-1, 1]) {
      // swept side pods
      ctx.beginPath();
      ctx.ellipse(sd * w * 0.5, w * -0.4, w * 0.12, w * 0.07, sd * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = acc;
      ctx.fill();
      ctx.stroke();
    }
  } else if (shape === 'rocket') {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    rr(ctx, -w * 0.04, w * (P.cy - P.ry * 0.95), w * 0.08, w * P.ry * 1.55, w * 0.04);
    ctx.fill();
    rr(ctx, -w * 0.13, w * (P.cy - P.ry * 0.85), w * 0.035, w * P.ry * 1.4, w * 0.018);
    ctx.fill();
    rr(ctx, w * 0.095, w * (P.cy - P.ry * 0.85), w * 0.035, w * P.ry * 1.4, w * 0.018);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; // number roundel
    ctx.beginPath();
    ctx.arc(0, w * P.cy + w * 0.02, w * 0.075, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.fillRect(-w * 0.013, w * P.cy - w * 0.04, w * 0.026, w * 0.11);
  }

  // engine pod with the two big ring exhausts (bright rings, dark throats)
  ctx.fillStyle = '#20243a';
  rr(ctx, -w * 0.2, -w * 0.2, w * 0.4, w * 0.15, w * 0.07);
  ctx.fill();
  ctx.stroke();
  for (const sd of [-1, 1]) {
    const ex = sd * w * 0.105;
    const ey = -w * 0.125;
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.arc(ex, ey, w * 0.075, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = fx.boost ? '#5ac8fa' : '#14172a';
    ctx.beginPath();
    ctx.arc(ex, ey, w * 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(ex - w * 0.03, ey - w * 0.035, w * 0.014, 0, Math.PI * 2);
    ctx.fill();
  }

  // driver: round cap in the kart's colour, ears and a rounded jersey, on a round seat back
  const headY = shape === 'rocket' ? -w * 0.66 : shape === 'phantom' ? -w * 0.5 : -w * 0.62;
  ctx.fillStyle = mix(acc, '#000000', 0.15);
  rr(ctx, -w * 0.17, headY + w * 0.04, w * 0.34, w * 0.26, w * 0.12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = acc;
  rr(ctx, -w * 0.13, headY + w * 0.1, w * 0.26, w * 0.15, w * 0.07);
  ctx.fill();
  const hr = w * 0.17;
  ctx.fillStyle = '#ffd5b0';
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sd * hr * 0.95, headY + hr * 0.12, hr * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const hg = ctx.createRadialGradient(-hr * 0.35, headY - hr * 0.4, hr * 0.1, 0, headY, hr * 1.15);
  hg.addColorStop(0, mix(shape === 'phantom' ? '#4a4f78' : col, '#ffffff', 0.5));
  hg.addColorStop(0.6, shape === 'phantom' ? '#2a2d48' : col);
  hg.addColorStop(1, mix(shape === 'phantom' ? '#2a2d48' : col, '#000000', 0.45));
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(0, headY, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // hair under the cap and a round badge on its back
  ctx.fillStyle = '#3a2418';
  ctx.beginPath();
  ctx.ellipse(0, headY + hr * 0.62, hr * 0.78, hr * 0.32, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, headY - hr * 0.1, hr * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = acc;
  ctx.beginPath();
  ctx.arc(0, headY - hr * 0.1, hr * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // round rear wing
  ctx.fillStyle = acc;
  if (shape === 'rocket') {
    rr(ctx, -w * 0.5, -w * 0.5, w * 1.0, w * 0.08, w * 0.04);
    ctx.fill();
    ctx.stroke();
    for (const sd of [-1, 1]) {
      rr(ctx, sd * w * 0.47 - w * 0.035, -w * 0.62, w * 0.07, w * 0.2, w * 0.035);
      ctx.fill();
      ctx.stroke();
    }
  } else if (shape === 'comet') {
    rr(ctx, -w * 0.46, -w * 0.52, w * 0.92, w * 0.085, w * 0.042);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    rr(ctx, -w * 0.4, -w * 0.5, w * 0.8, w * 0.02, w * 0.01);
    ctx.fill();
  }
  // tail lights: little round lamps
  ctx.fillStyle = '#ff2d55';
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sd * w * 0.25, -w * 0.3, w * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  glowDot(ctx, -w * 0.25, -w * 0.3, w * 0.2, '#ff2d55', 0.75, true);
  glowDot(ctx, w * 0.25, -w * 0.3, w * 0.2, '#ff2d55', 0.75, true);
  if (fx.shield) {
    const sg = ctx.createRadialGradient(0, -w * 0.35, w * 0.2, 0, -w * 0.35, w * 0.85);
    sg.addColorStop(0, 'rgba(90,200,250,0.05)');
    sg.addColorStop(0.8, 'rgba(90,200,250,0.35)');
    sg.addColorStop(1, 'rgba(180,240,255,0.85)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(0, -w * 0.38, w * 0.85, w * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // exhaust flames: orange cores with a blue-white heart, from the ring exhausts
  if (fx.boost) {
    const f = 0.8 + fx.flicker * 0.5;
    for (const sd of [-1, 1]) {
      const ex = sd * w * 0.105;
      const fg = ctx.createLinearGradient(0, -w * 0.12, 0, w * 0.62 * f);
      fg.addColorStop(0, '#ffffff');
      fg.addColorStop(0.25, '#5ac8fa');
      fg.addColorStop(0.6, '#ff9f0a');
      fg.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(ex - w * 0.06, -w * 0.12);
      ctx.quadraticCurveTo(ex - w * 0.09, w * 0.2 * f, ex, w * 0.62 * f);
      ctx.quadraticCurveTo(ex + w * 0.09, w * 0.2 * f, ex + w * 0.06, -w * 0.12);
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
