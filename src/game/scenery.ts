import type { Scenery, WorldConfig } from './types.js';
import { clipAbove, glowDot, gfxState, hazardStripes, rgba, rr, shade, vGrad, type Ctx } from './gfx.js';
import { hash } from './scene.js';

/**
 * Roadside sprites. Every size is in world units and scaled by `u` (pixels per unit at that distance); `base` is
 * the screen-y where the sprite stands. Nothing here touches gameplay: the simulation never reads scenery.
 */

const SHOP_PALETTES: [string, string, string][] = [
  ['#3b2a8f', '#ff5fa2', '#ffd9f0'],
  ['#1f5aa8', '#ffd60a', '#fff3b8'],
  ['#0f7a8a', '#ff9ad5', '#d9fbff'],
  ['#6a2fa0', '#5ee0ff', '#e6d9ff'],
];
const SKIN = ['#ffd5b0', '#e9b48a', '#c98f66', '#8d5a3a', '#f5c6a0'];
const SHIRT = ['#ff3b6b', '#ffd60a', '#30d158', '#5ac8fa', '#bf5af2', '#ff9f0a', '#ffffff'];

function flame(ctx: Ctx, x: number, base: number, w: number, h: number, time: number, seed: number) {
  if (h < 3) return;
  const sway = Math.sin(time * 9 + seed * 20) * w * 0.12;
  const flick = 0.85 + 0.2 * Math.sin(time * 13 + seed * 7);
  glowDot(ctx, x, base - h * 0.5, h * 1.5, '#ff7a1a', 0.7);
  for (const [scale, color] of [
    [1, '#ff5a14'],
    [0.72, '#ffb02e'],
    [0.42, '#fff2b0'],
  ] as const) {
    const fw = w * scale;
    const fh = h * scale * flick;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - fw / 2, base);
    ctx.quadraticCurveTo(x - fw * 0.65, base - fh * 0.5, x + sway * scale, base - fh);
    ctx.quadraticCurveTo(x + fw * 0.65, base - fh * 0.5, x + fw / 2, base);
    ctx.closePath();
    ctx.fill();
  }
}

function person(ctx: Ctx, x: number, base: number, h: number, i: number, time: number) {
  const w = h * 0.36;
  const wave = Math.sin(time * 6 + i * 1.7);
  const shirt = SHIRT[i % SHIRT.length];
  // arms up, waving
  ctx.strokeStyle = SKIN[i % SKIN.length];
  ctx.lineWidth = Math.max(1, h * 0.07);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - w * 0.4, base - h * 0.55);
  ctx.lineTo(x - w * 0.8, base - h * (0.95 + 0.08 * wave));
  ctx.moveTo(x + w * 0.4, base - h * 0.55);
  ctx.lineTo(x + w * 0.8, base - h * (0.95 - 0.08 * wave));
  ctx.stroke();
  // body and head
  ctx.fillStyle = shirt;
  rr(ctx, x - w / 2, base - h * 0.62, w, h * 0.62, w * 0.35);
  ctx.fill();
  ctx.fillStyle = SKIN[i % SKIN.length];
  ctx.beginPath();
  ctx.arc(x, base - h * 0.78, h * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ['#2b1d14', '#6b3b1a', '#111', '#c47a2c', '#d83a7a'][i % 5];
  ctx.beginPath();
  ctx.arc(x, base - h * 0.82, h * 0.17, Math.PI, 0);
  ctx.fill();
}

export function drawScenery(ctx: Ctx, s: Scenery, cx: number, base: number, u: number, wd: WorldConfig, clipY: number, time: number, W = 390, H = 844) {
  const k = s.size;
  /** a light never blooms bigger than this, or a lamp right beside the camera whites out the screen */
  const cap = H * 0.11;
  const glow = (x: number, y: number, r: number, color: string, alpha: number) => glowDot(ctx, x, y, Math.min(r, cap), color, alpha);
  const side = s.offset < 0 ? -1 : 1;
  if (u * 600 * k < 1.2 && s.kind !== 'arch' && s.kind !== 'bunting' && s.kind !== 'ring' && s.kind !== 'gantry') return; // too small to see
  ctx.save();
  clipAbove(ctx, clipY);
  switch (s.kind) {
    case 'tower': {
      const w = 1000 * k * u;
      const h = (4200 + 3600 * s.hue) * k * u;
      if (w < 2) break;
      const accent = s.hue > 0.5 ? '#ff5fa2' : '#5ee0ff';
      const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      g.addColorStop(0, '#24307f');
      g.addColorStop(0.5, '#2f3da0');
      g.addColorStop(1, '#1a2366');
      ctx.fillStyle = g;
      ctx.fillRect(cx - w / 2, base - h, w, h);
      // stepped crown
      ctx.fillStyle = '#1a2366';
      ctx.fillRect(cx - w * 0.32, base - h - h * 0.07, w * 0.64, h * 0.07);
      ctx.fillRect(cx - w * 0.04, base - h - h * 0.2, w * 0.08, h * 0.13);
      if (Math.sin(time * 2.2 + s.hue * 30) > 0) glow(cx, base - h - h * 0.2, w * 0.6, '#ff2d55', 0.9);
      // neon edge lines and crown band
      ctx.fillStyle = accent;
      ctx.fillRect(cx - w / 2, base - h, Math.max(1, w * 0.04), h);
      ctx.fillRect(cx + w / 2 - Math.max(1, w * 0.04), base - h, Math.max(1, w * 0.04), h);
      ctx.fillRect(cx - w / 2, base - h, w, Math.max(2, w * 0.045));
      glow(cx, base - h * 0.55, h * 0.7, accent, 0.18);
      if (w > 12 && !gfxState.lite) {
        const cols = 4;
        const rows = 12;
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            const hh = hash(s.hue * 977 + r * 7 + c * 13);
            if (hh > 0.62) continue;
            ctx.fillStyle = hh < 0.3 ? '#ffe9a8' : hh < 0.45 ? '#9be9ff' : '#ff9ad5';
            ctx.globalAlpha = 0.7;
            ctx.fillRect(cx - w / 2 + w * (0.12 + c * 0.22), base - h + h * (0.08 + r * 0.075), w * 0.13, h * 0.04);
          }
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'shop': {
      const w = 2300 * k * u;
      const h = (1500 + 800 * s.hue) * k * u;
      if (w < 3) break;
      const [body, accent, glass] = SHOP_PALETTES[Math.floor(s.hue * 4) % 4];
      // building body with a lit window band and overhanging roof
      const g = vGrad(ctx, base - h, base, [
        [0, shade(body, 0.12)],
        [1, shade(body, -0.25)],
      ]);
      ctx.fillStyle = g;
      ctx.fillRect(cx - w / 2, base - h, w, h);
      ctx.fillStyle = shade(body, -0.4);
      ctx.fillRect(cx - w * 0.54, base - h - h * 0.07, w * 1.08, h * 0.09);
      ctx.fillStyle = accent;
      ctx.fillRect(cx - w * 0.54, base - h + h * 0.02, w * 1.08, Math.max(1, h * 0.025));
      // shop windows
      const wy = base - h * 0.62;
      const wh = h * 0.42;
      const wg = vGrad(ctx, wy, wy + wh, [
        [0, '#ffe9a8'],
        [1, '#ffb36b'],
      ]);
      ctx.fillStyle = wg;
      ctx.fillRect(cx - w * 0.44, wy, w * 0.88, wh);
      ctx.fillStyle = rgba(body, 0.9);
      for (let m = 0; m < 5; m++) ctx.fillRect(cx - w * 0.44 + (w * 0.88 * m) / 4 - Math.max(0.5, w * 0.008), wy, Math.max(1, w * 0.016), wh);
      // door and striped awning
      ctx.fillStyle = glass;
      ctx.fillRect(cx - w * 0.07, base - h * 0.34, w * 0.14, h * 0.34);
      const aw = w * 0.5;
      const ay = base - h * 0.66;
      const stripes = 8;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 ? '#ffffff' : accent;
        ctx.beginPath();
        ctx.moveTo(cx - aw / 2 + (aw * i) / stripes, ay);
        ctx.lineTo(cx - aw / 2 + (aw * (i + 1)) / stripes, ay);
        ctx.lineTo(cx - aw / 2 + (aw * (i + 1)) / stripes, ay + h * 0.14);
        ctx.arc(cx - aw / 2 + (aw * (i + 0.5)) / stripes, ay + h * 0.14, aw / stripes / 2, 0, Math.PI);
        ctx.fill();
      }
      // neon shop sign
      const sw = w * 0.5;
      const sy = base - h * 0.9;
      ctx.fillStyle = '#0a0f2e';
      rr(ctx, cx - sw / 2, sy, sw, h * 0.16, h * 0.04);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1, h * 0.02);
      ctx.stroke();
      glow(cx, sy + h * 0.08, sw * 0.8, accent, 0.45);
      break;
    }
    case 'lamp': {
      const h = 3400 * k * u;
      const pw = Math.max(1.2, 95 * k * u);
      if (wd.id === 2) {
        // floating crystal lantern on a slim pole
        ctx.fillStyle = '#5b3aa8';
        ctx.fillRect(cx - pw / 2, base - h, pw, h);
        const y = base - h - 380 * k * u;
        glow(cx, y, 1200 * k * u, '#ff8ad8', 0.5);
        ctx.fillStyle = '#ffe3f7';
        ctx.beginPath();
        ctx.moveTo(cx, y - 380 * k * u);
        ctx.lineTo(cx + 230 * k * u, y);
        ctx.lineTo(cx, y + 380 * k * u);
        ctx.lineTo(cx - 230 * k * u, y);
        ctx.fill();
        break;
      }
      if (wd.id === 4) {
        // grey highway lamp with a long arm reaching over the lanes
        const toward4 = -side;
        ctx.fillStyle = '#8b929d';
        ctx.fillRect(cx - pw / 2, base - h, pw, h);
        const ex4 = cx + toward4 * 1100 * k * u;
        const ey4 = base - h - 90 * k * u;
        ctx.strokeStyle = '#8b929d';
        ctx.lineWidth = Math.max(1.2, pw * 0.8);
        ctx.beginPath();
        ctx.moveTo(cx, base - h);
        ctx.quadraticCurveTo(cx, ey4 - 260 * k * u, ex4, ey4);
        ctx.stroke();
        ctx.fillStyle = '#fff1c7';
        rr(ctx, ex4 - 330 * k * u, ey4 - 40 * k * u, 660 * k * u, 150 * k * u, 70 * k * u);
        ctx.fill();
        break;
      }
      // city street lamp with a curved arm over the road
      const toward = -side;
      ctx.fillStyle = '#39428f';
      ctx.fillRect(cx - pw / 2, base - h, pw, h);
      ctx.fillStyle = '#5560b8';
      ctx.fillRect(cx - pw / 2, base - h, pw * 0.35, h);
      ctx.fillRect(cx - pw * 2.2, base - 220 * k * u, pw * 4.4, 220 * k * u);
      const ex = cx + toward * 760 * k * u;
      const ey = base - h - 160 * k * u;
      ctx.strokeStyle = '#39428f';
      ctx.lineWidth = Math.max(1.2, pw * 0.8);
      ctx.beginPath();
      ctx.moveTo(cx, base - h);
      ctx.quadraticCurveTo(cx, ey - 120 * k * u, ex, ey);
      ctx.stroke();
      glow(ex, ey + 60 * k * u, 1000 * k * u, '#cfeaff', 0.3);
      ctx.fillStyle = '#ffffff';
      rr(ctx, ex - 260 * k * u, ey - 30 * k * u, 520 * k * u, 120 * k * u, 60 * k * u);
      ctx.fill();
      break;
    }
    case 'sign': {
      const w = 1700 * k * u;
      const ph = w * 0.42;
      const poleH = 2400 * k * u;
      const c = s.hue > 0.5 ? '#ff5fa2' : '#5ee0ff';
      const c2 = s.hue > 0.5 ? '#ffd60a' : '#bf5af2';
      if (w < 4) break;
      ctx.fillStyle = '#2a3270';
      for (const sx of [-0.3, 0.3]) ctx.fillRect(cx + sx * w - w * 0.018, base - poleH, w * 0.036, poleH);
      const top = base - poleH - ph;
      const g = ctx.createLinearGradient(cx - w / 2, top, cx + w / 2, top + ph);
      g.addColorStop(0, '#1c1f66');
      g.addColorStop(1, '#0a0d34');
      ctx.fillStyle = g;
      rr(ctx, cx - w / 2, top, w, ph, w * 0.05);
      ctx.fill();
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(1.2, w * 0.03);
      ctx.stroke();
      glow(cx, top + ph / 2, w * 0.75, c, 0.4);
      // pictogram: bolt, star or flag
      const ic = Math.floor(s.hue * 3) % 3;
      ctx.fillStyle = c2;
      ctx.beginPath();
      if (ic === 0) {
        ctx.moveTo(cx + w * 0.04, top + ph * 0.12);
        ctx.lineTo(cx - w * 0.1, top + ph * 0.56);
        ctx.lineTo(cx - w * 0.01, top + ph * 0.56);
        ctx.lineTo(cx - w * 0.05, top + ph * 0.9);
        ctx.lineTo(cx + w * 0.12, top + ph * 0.4);
        ctx.lineTo(cx + w * 0.02, top + ph * 0.4);
      } else if (ic === 1) {
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? w * 0.06 : w * 0.13;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          ctx.lineTo(cx + Math.cos(a) * r, top + ph / 2 + Math.sin(a) * r);
        }
      } else {
        ctx.rect(cx - w * 0.14, top + ph * 0.2, w * 0.28, ph * 0.6);
        ctx.fillStyle = '#0a0d34';
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) ctx.fillRect(cx - w * 0.14 + i * w * 0.07, top + ph * 0.2 + j * ph * 0.2, w * 0.07, ph * 0.2);
        ctx.fillStyle = c2;
      }
      ctx.fill();
      // chasing bulbs around the frame
      for (let i = 0; i < 10; i++) {
        const lit = Math.floor(time * 6 + i) % 3 === 0;
        ctx.fillStyle = lit ? '#ffffff' : rgba(c, 0.6);
        ctx.fillRect(cx - w / 2 + (w * (i + 0.5)) / 10 - 1, top - 1, Math.max(1.5, w * 0.02), Math.max(1.5, w * 0.02));
      }
      break;
    }
    case 'crowd': {
      const n = (gfxState.lite ? 3 : 5) + Math.floor(s.hue * 3);
      const h = 760 * k * u;
      const gap = 340 * k * u;
      const width = gap * n;
      // barrier first, people stand behind it
      for (let i = 0; i < n; i++) person(ctx, cx - width / 2 + gap * (i + 0.5) + (hash(s.hue * 50 + i) - 0.5) * gap * 0.4, base - h * 0.02, h * (0.9 + 0.2 * hash(s.hue * 90 + i)), i + Math.floor(s.hue * 10), time);
      ctx.fillStyle = '#f5f7ff';
      ctx.fillRect(cx - width / 2 - gap * 0.2, base - h * 0.28, width + gap * 0.4, h * 0.28);
      ctx.fillStyle = '#ff2d55';
      for (let i = 0; i < n * 2; i += 2) ctx.fillRect(cx - width / 2 - gap * 0.2 + ((width + gap * 0.4) * i) / (n * 2), base - h * 0.28, (width + gap * 0.4) / (n * 2), h * 0.28);
      break;
    }
    case 'palm': {
      const h = 3200 * k * u;
      const tw = Math.max(1.5, 190 * k * u);
      const lean = side * -0.12;
      ctx.strokeStyle = '#4b2d6a';
      ctx.lineWidth = tw;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, base);
      ctx.quadraticCurveTo(cx + lean * h * 0.4, base - h * 0.5, cx + lean * h, base - h);
      ctx.stroke();
      const tx = cx + lean * h;
      const ty = base - h;
      const col = s.hue > 0.5 ? '#ff5fa2' : '#5ee0ff';
      glow(tx, ty, h * 0.5, col, 0.35);
      ctx.strokeStyle = '#2fe0a0';
      ctx.lineWidth = Math.max(1.2, tw * 0.6);
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        const sway = Math.sin(time * 1.6 + i + s.hue * 8) * 0.06;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(tx + Math.cos(a + sway) * h * 0.25, ty - h * 0.18 + Math.sin(a) * h * 0.05, tx + Math.cos(a + sway) * h * 0.46, ty + h * 0.12 + Math.sin(a) * h * 0.08);
        ctx.stroke();
      }
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(tx, ty + tw * 0.4, tw * 0.9, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'pylon': {
      if (wd.id === 3) {
        // steel pylon with a hazard-striped foot and a warning beacon
        const w = 420 * k * u;
        const h = 4200 * k * u;
        const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
        g.addColorStop(0, '#46424e');
        g.addColorStop(0.5, '#6a6574');
        g.addColorStop(1, '#2f2c36');
        ctx.fillStyle = g;
        ctx.fillRect(cx - w / 2, base - h, w, h);
        hazardStripes(ctx, cx - w / 2, base - h * 0.28, w, h * 0.28);
        ctx.fillStyle = '#2f2c36';
        for (let i = 1; i < 6; i++) ctx.fillRect(cx - w, base - h * (i / 6.4), w * 2, Math.max(1, h * 0.012));
        if (Math.floor(time * 2 + s.hue * 9) % 2 === 0) glow(cx, base - h, w * 4.5, '#ff7a1a', 0.95);
        ctx.fillStyle = '#ffb347';
        ctx.fillRect(cx - w * 0.3, base - h - w * 0.4, w * 0.6, w * 0.4);
        break;
      }
      const w = 220 * k * u;
      const h = 4200 * k * u;
      ctx.fillStyle = '#322a7d';
      ctx.fillRect(cx - w / 2, base - h, w, h);
      glow(cx, base - h, w * 7, wd.glow, 0.9);
      break;
    }
    case 'torch': {
      const h = 2100 * k * u;
      const pw = Math.max(1.5, 120 * k * u);
      ctx.fillStyle = '#2a2630';
      ctx.fillRect(cx - pw / 2, base - h, pw, h);
      ctx.fillStyle = '#5a5462';
      ctx.fillRect(cx - pw * 2.6, base - 160 * k * u, pw * 5.2, 160 * k * u);
      // brazier bowl and flame
      ctx.fillStyle = '#1b1820';
      ctx.beginPath();
      ctx.moveTo(cx - 360 * k * u, base - h - 220 * k * u);
      ctx.lineTo(cx + 360 * k * u, base - h - 220 * k * u);
      ctx.lineTo(cx + 190 * k * u, base - h + 60 * k * u);
      ctx.lineTo(cx - 190 * k * u, base - h + 60 * k * u);
      ctx.fill();
      ctx.fillStyle = '#ff8a2a';
      ctx.fillRect(cx - 360 * k * u, base - h - 235 * k * u, 720 * k * u, Math.max(1, 40 * k * u));
      flame(ctx, cx, base - h - 220 * k * u, 620 * k * u, 1300 * k * u, time, s.hue);
      break;
    }
    case 'turbine': {
      const h = 4400 * k * u;
      const w = 170 * k * u;
      ctx.fillStyle = '#f6e6ff';
      ctx.beginPath();
      ctx.moveTo(cx - w, base);
      ctx.lineTo(cx - w * 0.45, base - h);
      ctx.lineTo(cx + w * 0.45, base - h);
      ctx.lineTo(cx + w, base);
      ctx.fill();
      ctx.fillStyle = '#c58ae8';
      ctx.fillRect(cx, base - h, w * 0.9, h);
      const hub = base - h;
      const L = 2200 * k * u;
      const ang = time * 1.3 + s.hue * 6.28;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) {
        const a = ang + (i * Math.PI * 2) / 3;
        ctx.save();
        ctx.translate(cx, hub);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(-w * 0.35, 0);
        ctx.lineTo(0, -L);
        ctx.lineTo(w * 0.35, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        glow(cx + Math.sin(a) * L, hub - Math.cos(a) * L, 380 * k * u, '#ff8ad8', 0.8);
      }
      ctx.fillStyle = '#ff8ad8';
      ctx.beginPath();
      ctx.arc(cx, hub, w * 0.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'cloud': {
      const w = 2800 * k * u;
      const y = base - 1800 * u * k;
      for (const [dx, dy, r] of [
        [-0.3, 0.02, 0.24],
        [0, -0.08, 0.32],
        [0.3, 0.02, 0.24],
        [0.08, 0.08, 0.28],
      ]) {
        const px = cx + dx * w;
        const py = y + dy * w * 0.4;
        const rad = r * w * 0.55;
        const g = ctx.createRadialGradient(px - rad * 0.2, py - rad * 0.35, rad * 0.1, px, py, rad);
        g.addColorStop(0, 'rgba(255,245,252,0.95)');
        g.addColorStop(1, 'rgba(210,150,235,0.7)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(px, py, rad * 1.3, rad, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'island': {
      const w = 2400 * k * u;
      const y = base - 2400 * u * k + Math.sin(time * 1.2 + s.hue * 9) * w * 0.03;
      // rocky underside with a thin waterfall of light
      const rg = vGrad(ctx, y, y + w * 0.6, [
        [0, '#5a3fb0'],
        [1, '#1d1260'],
      ]);
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, y);
      ctx.lineTo(cx + w / 2, y);
      ctx.lineTo(cx + w * 0.16, y + w * 0.62);
      ctx.lineTo(cx - w * 0.1, y + w * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(160,240,255,0.85)';
      ctx.fillRect(cx + w * 0.02, y, w * 0.045, w * 0.5);
      glow(cx + w * 0.04, y + w * 0.5, w * 0.2, '#5ee0ff', 0.5);
      // grassy top
      const tg = vGrad(ctx, y - w * 0.08, y + w * 0.03, [
        [0, '#7af0c8'],
        [1, '#2aa88f'],
      ]);
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.ellipse(cx, y, w / 2, w * 0.07, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#ff8ad8';
      ctx.beginPath();
      ctx.moveTo(cx, y - w * 0.32);
      ctx.lineTo(cx + w * 0.08, y - w * 0.05);
      ctx.lineTo(cx - w * 0.08, y - w * 0.05);
      ctx.fill();
      glow(cx, y - w * 0.15, w * 0.32, '#ff8ad8', 0.6);
      break;
    }
    case 'crystal': {
      const w = 700 * k * u;
      const h = 2600 * k * u;
      glow(cx, base - h * 0.5, h * 0.8, '#bf5af2', 0.55);
      for (const [dx, sc] of [
        [-0.9, 0.6],
        [0.8, 0.5],
        [0, 1],
      ]) {
        const x = cx + dx * w;
        const hh = h * sc;
        const ww = w * sc;
        const g = ctx.createLinearGradient(x - ww / 2, 0, x + ww / 2, 0);
        g.addColorStop(0, '#e8c4ff');
        g.addColorStop(0.55, '#b86bff');
        g.addColorStop(1, '#6a2fd0');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x, base - hh);
        ctx.lineTo(x + ww / 2, base - hh * 0.35);
        ctx.lineTo(x, base);
        ctx.lineTo(x - ww / 2, base - hh * 0.35);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.moveTo(x, base - hh);
        ctx.lineTo(x - ww / 2, base - hh * 0.35);
        ctx.lineTo(x - ww * 0.05, base - hh * 0.3);
        ctx.fill();
      }
      break;
    }
    case 'balloon': {
      const r = 900 * k * u;
      const y = base - 5200 * k * u + Math.sin(time * 0.9 + s.hue * 7) * r * 0.1;
      const cols = [['#ff5fa2', '#ffd60a', '#5ee0ff'], ['#5ee0ff', '#ffffff', '#ff5fa2'], ['#bf5af2', '#ffd60a', '#30d158']][Math.floor(s.hue * 3) % 3];
      // envelope: a base colour with three narrower gores laid over it
      ctx.fillStyle = cols[0];
      ctx.beginPath();
      ctx.ellipse(cx, y, r, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = cols[1];
      ctx.beginPath();
      ctx.ellipse(cx, y, r * 0.66, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = cols[2];
      ctx.beginPath();
      ctx.ellipse(cx, y, r * 0.3, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.35, y - r * 0.4, r * 0.18, r * 0.4, -0.4, 0, Math.PI * 2);
      ctx.fill();
      glow(cx, y, r * 2, '#ffd9f5', 0.18);
      ctx.strokeStyle = '#3a2a66';
      ctx.lineWidth = Math.max(1, r * 0.04);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.5, y + r * 1.0);
      ctx.lineTo(cx - r * 0.25, y + r * 1.7);
      ctx.moveTo(cx + r * 0.5, y + r * 1.0);
      ctx.lineTo(cx + r * 0.25, y + r * 1.7);
      ctx.stroke();
      ctx.fillStyle = '#7a4a2a';
      ctx.fillRect(cx - r * 0.28, y + r * 1.7, r * 0.56, r * 0.3);
      break;
    }
    case 'rock': {
      const w = 1700 * k * u;
      const h = (1600 + 1600 * s.hue) * k * u;
      glow(cx, base, w * 0.9, '#ff6a1a', 0.35);
      const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      g.addColorStop(0, '#3b2a2a');
      g.addColorStop(0.5, '#1d1414');
      g.addColorStop(1, '#0c0707');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, base);
      ctx.lineTo(cx - w * 0.34, base - h * 0.62);
      ctx.lineTo(cx - w * 0.1, base - h);
      ctx.lineTo(cx + w * 0.12, base - h * 0.78);
      ctx.lineTo(cx + w * 0.3, base - h * 0.55);
      ctx.lineTo(cx + w / 2, base);
      ctx.fill();
      // lit facet and glowing lava veins
      ctx.fillStyle = 'rgba(255,140,60,0.18)';
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.1, base - h);
      ctx.lineTo(cx - w * 0.34, base - h * 0.62);
      ctx.lineTo(cx - w * 0.05, base - h * 0.4);
      ctx.fill();
      ctx.strokeStyle = '#ff8a2a';
      ctx.lineWidth = Math.max(1, w * 0.018);
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.1, base - h);
      ctx.lineTo(cx - w * 0.04, base - h * 0.58);
      ctx.lineTo(cx - w * 0.16, base - h * 0.3);
      ctx.moveTo(cx - w * 0.04, base - h * 0.58);
      ctx.lineTo(cx + w * 0.16, base - h * 0.34);
      ctx.stroke();
      break;
    }
    case 'lavaPillar': {
      const w = 650 * k * u;
      const h = 3800 * k * u;
      const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      g.addColorStop(0, '#2d2220');
      g.addColorStop(0.5, '#150d0c');
      g.addColorStop(1, '#080505');
      ctx.fillStyle = g;
      ctx.fillRect(cx - w / 2, base - h, w, h);
      ctx.fillStyle = '#ff8a2a';
      for (let i = 0; i < 6; i++) ctx.fillRect(cx - w * 0.14, base - h * (0.1 + i * 0.15), w * 0.28, Math.max(1, h * 0.025));
      flame(ctx, cx, base - h, w * 1.5, h * 0.4, time, s.hue);
      break;
    }
    case 'cactus': {
      const h = 2800 * k * u;
      const w = 430 * k * u;
      const lit = (x: number, ww: number, y0: number, hh: number) => {
        const g = ctx.createLinearGradient(x - ww / 2, 0, x + ww / 2, 0);
        g.addColorStop(0, '#2f7a3c');
        g.addColorStop(0.6, '#4aa152');
        g.addColorStop(1, '#8fd27a');
        ctx.fillStyle = g;
        rr(ctx, x - ww / 2, y0, ww, hh, ww / 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,70,35,0.45)';
        ctx.lineWidth = Math.max(1, ww * 0.06);
        for (const f of [-0.18, 0.12]) {
          ctx.beginPath();
          ctx.moveTo(x + ww * f, y0 + ww * 0.4);
          ctx.lineTo(x + ww * f, y0 + hh - ww * 0.3);
          ctx.stroke();
        }
      };
      ctx.fillStyle = 'rgba(120,60,30,0.28)';
      ctx.beginPath();
      ctx.ellipse(cx + w * 0.4, base, w * 1.4, w * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      lit(cx, w, base - h, h);
      for (const [sd, ay, ah] of [[-1, 0.55, 0.3], [1, 0.4, 0.28]] as const) {
        const ax = cx + sd * w * 1.15;
        lit(ax, w * 0.7, base - h * (ay + ah), h * ah + w * 0.3); // upright part of the arm
        ctx.fillStyle = sd < 0 ? '#3a8b45' : '#4aa152';
        rr(ctx, Math.min(cx, ax) - w * 0.1, base - h * ay - w * 0.1, Math.abs(ax - cx) + w * 0.2, w * 0.6, w * 0.3); // elbow joining the trunk
        ctx.fill();
      }
      if (s.hue > 0.5) {
        ctx.fillStyle = '#ff6fa8';
        ctx.beginPath();
        ctx.arc(cx, base - h, w * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'butte': {
      const w = 2600 * k * u;
      const h = (1500 + 1500 * s.hue) * k * u;
      if (w < 4) break;
      ctx.fillStyle = 'rgba(120,60,30,0.25)';
      ctx.beginPath();
      ctx.ellipse(cx + w * 0.25, base, w * 0.75, w * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      g.addColorStop(0, '#a85a30');
      g.addColorStop(0.6, '#d17c45');
      g.addColorStop(1, '#f0a868');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, base);
      ctx.lineTo(cx - w * 0.4, base - h * 0.7);
      ctx.lineTo(cx - w * 0.34, base - h);
      ctx.lineTo(cx + w * 0.3, base - h);
      ctx.lineTo(cx + w * 0.38, base - h * 0.66);
      ctx.lineTo(cx + w / 2, base);
      ctx.fill();
      ctx.fillStyle = 'rgba(110,45,25,0.4)';
      for (let i = 1; i < 5; i++) ctx.fillRect(cx - w * 0.44, base - (h * i) / 5.2 - h * 0.02, w * 0.88, Math.max(1, h * 0.03));
      ctx.fillStyle = 'rgba(255,230,190,0.5)';
      ctx.fillRect(cx - w * 0.34, base - h, w * 0.64, Math.max(1.5, h * 0.03));
      break;
    }
    case 'roadsign': {
      const poleH = 2300 * k * u;
      const d = 1000 * k * u;
      const pw = Math.max(1.2, 80 * k * u);
      ctx.fillStyle = '#6a707a';
      ctx.fillRect(cx - pw / 2, base - poleH, pw, poleH);
      const cy = base - poleH - d * 0.35;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#f6c928';
      rr(ctx, -d / 2.8, -d / 2.8, d / 1.4, d / 1.4, d * 0.07);
      ctx.fill();
      ctx.strokeStyle = '#1b1b1b';
      ctx.lineWidth = Math.max(1, d * 0.035);
      rr(ctx, -d / 3.3, -d / 3.3, d / 1.65, d / 1.65, d * 0.04);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#1b1b1b';
      ctx.fillStyle = '#1b1b1b';
      ctx.lineWidth = Math.max(1, d * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (s.hue > 0.5) {
        // crossing
        ctx.moveTo(cx - d * 0.18, cy - d * 0.18);
        ctx.lineTo(cx + d * 0.18, cy + d * 0.18);
        ctx.moveTo(cx + d * 0.18, cy - d * 0.18);
        ctx.lineTo(cx - d * 0.18, cy + d * 0.18);
        ctx.stroke();
      } else {
        // curve ahead
        ctx.moveTo(cx - d * 0.12, cy + d * 0.2);
        ctx.quadraticCurveTo(cx - d * 0.12, cy - d * 0.02, cx + d * 0.12, cy - d * 0.14);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + d * 0.2, cy - d * 0.2);
        ctx.lineTo(cx + d * 0.02, cy - d * 0.2);
        ctx.lineTo(cx + d * 0.2, cy - d * 0.02);
        ctx.fill();
      }
      break;
    }
    case 'shrub': {
      const r = 520 * k * u;
      ctx.fillStyle = 'rgba(120,60,30,0.25)';
      ctx.beginPath();
      ctx.ellipse(cx, base, r * 1.8, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const [dx, dy, rad, col] of [
        [-0.8, -0.4, 0.8, '#7a8f3c'],
        [0.8, -0.45, 0.75, '#8aa24a'],
        [0, -0.9, 0.95, '#9db557'],
        [0.2, -0.3, 0.7, '#6f8236'],
      ] as const) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx + dx * r, base + dy * r, rad * r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'flag': {
      const h = 3900 * k * u;
      const pw = Math.max(1.2, 70 * k * u);
      ctx.fillStyle = '#d9dee5';
      ctx.fillRect(cx - pw / 2, base - h, pw, h);
      const wave = Math.sin(time * 3 + s.hue * 20);
      const fw = 620 * k * u;
      const fh = 1900 * k * u;
      const dir = side;
      const x0 = cx + dir * pw;
      ctx.fillStyle = '#1fa65a';
      ctx.beginPath();
      ctx.moveTo(x0, base - h);
      ctx.quadraticCurveTo(x0 + dir * (fw + wave * fw * 0.2), base - h + fh * 0.25, x0 + dir * fw * 0.7, base - h + fh);
      ctx.quadraticCurveTo(x0 + dir * fw * 0.1, base - h + fh * 0.8, x0, base - h + fh * 0.9);
      ctx.fill();
      ctx.fillStyle = '#ffd60a';
      ctx.beginPath();
      ctx.arc(x0 + dir * fw * 0.35, base - h + fh * 0.4, fw * 0.17, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'truck': {
      const w = 2300 * k * u;
      const h = 2900 * k * u;
      if (w < 6) break;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(cx, base, w * 0.62, w * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      // box trailer seen from behind: ribbed panels, split doors, lights, bumper and wheels
      const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      g.addColorStop(0, '#8f98a4');
      g.addColorStop(0.5, '#b9c1cb');
      g.addColorStop(1, '#7c8591');
      ctx.fillStyle = g;
      ctx.fillRect(cx - w / 2, base - h, w, h * 0.86);
      ctx.fillStyle = 'rgba(60,70,85,0.35)';
      for (let i = 1; i < 14; i++) ctx.fillRect(cx - w / 2 + (w * i) / 14, base - h, Math.max(1, w * 0.012), h * 0.86);
      ctx.fillStyle = '#4b5460';
      ctx.fillRect(cx - w * 0.012, base - h * 0.92, w * 0.024, h * 0.74);
      ctx.fillStyle = '#d63a30';
      ctx.fillRect(cx - w * 0.5, base - h * 0.95, w, h * 0.07);
      ctx.fillStyle = '#ff3b30';
      for (const sd of [-1, 1]) ctx.fillRect(cx + sd * w * 0.42 - w * 0.04, base - h * 0.32, w * 0.08, h * 0.05);
      ctx.fillStyle = '#2a2f38';
      ctx.fillRect(cx - w * 0.48, base - h * 0.14, w * 0.96, h * 0.05);
      for (const sd of [-1, 1]) {
        ctx.fillStyle = '#16181d';
        rr(ctx, cx + sd * w * 0.38 - w * 0.1, base - h * 0.13, w * 0.2, h * 0.13, w * 0.04);
        ctx.fill();
      }
      break;
    }
    case 'arch':
    case 'bunting':
    case 'ring':
    case 'gantry':
      drawSpan(ctx, s, cx, base, u, u * Math.max(1, H / W), wd, time, cap);
      break;
  }
  ctx.restore();
}

/** Set pieces that stretch across the whole road: banner arches, bunting, light rings and steel gantries. */
/**
 * `u` scales widths; `vu` scales heights. The road is projected with the screen height vertically, so a tall phone
 * needs taller set pieces or an arch would hang below the horizon and cover the road as you drive under it.
 */
function drawSpan(ctx: Ctx, s: Scenery, cx: number, base: number, u: number, vu: number, wd: WorldConfig, time: number, cap: number) {
  const glow = (x: number, y: number, r: number, color: string, alpha: number) => glowDot(ctx, x, y, Math.min(r, cap * 2.2), color, alpha);
  const half = wd.roadWidth * u * 1.26;
  if (half < 6) return;
  const k = s.size;
  const day = wd.id === 4;
  const accent = day ? '#ffffff' : wd.id === 1 ? (s.hue > 0.5 ? '#ff5fa2' : '#5ee0ff') : wd.id === 2 ? '#ff8ad8' : '#ff8a2a';

  if (s.kind === 'ring') {
    const cy = base - 2300 * vu;
    const ry = 2900 * vu;
    const pulse = 0.75 + 0.25 * Math.sin(time * 3 + s.hue * 9);
    glow(cx, cy, half * 1.5, accent, 0.25 * pulse);
    ctx.lineCap = 'round';
    for (const [lw, col, al] of [
      [Math.max(4, 560 * u), rgba(accent, 0.28), 1],
      [Math.max(2, 240 * u), '#ffffff', 0.95],
    ] as const) {
      ctx.globalAlpha = al * pulse;
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.ellipse(cx, cy, half * 0.96, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + time * 0.8;
      ctx.fillStyle = i % 2 ? '#ffffff' : accent;
      const px = cx + Math.cos(a) * half * 0.96;
      const py = cy + Math.sin(a) * ry;
      ctx.fillRect(px - 2, py - 2, Math.max(2.5, 160 * u), Math.max(2.5, 160 * u));
    }
    return;
  }

  const postH = (s.kind === 'bunting' ? 3600 : s.kind === 'gantry' ? 4300 : 4700) * k * vu;
  if (postH > cap * 60) return; // right on top of the camera
  const pw = Math.max(2, (s.kind === 'bunting' ? 150 : 360) * k * u);

  if (s.kind === 'bunting') {
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#39428f';
      ctx.fillRect(cx + sx * half - pw / 2, base - postH, pw, postH);
    }
    const y0 = base - postH;
    const sag = 700 * vu;
    ctx.strokeStyle = '#d9e2ff';
    ctx.lineWidth = Math.max(1, 40 * u);
    ctx.beginPath();
    ctx.moveTo(cx - half, y0);
    ctx.quadraticCurveTo(cx, y0 + sag * 2, cx + half, y0);
    ctx.stroke();
    const cols = ['#ff5fa2', '#ffd60a', '#5ee0ff', '#30d158', '#bf5af2'];
    for (let i = 1; i < 14; i++) {
      const t = i / 14;
      const x = cx - half + 2 * half * t;
      const y = y0 + 4 * sag * t * (1 - t);
      const fw = (2 * half) / 14 * 0.7;
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath();
      ctx.moveTo(x - fw / 2, y);
      ctx.lineTo(x + fw / 2, y);
      ctx.lineTo(x, y + fw * 1.1);
      ctx.fill();
    }
    return;
  }

  // arch / gantry: two posts, a beam and a lit sign
  const steel = s.kind === 'gantry' || wd.id === 3;
  const postCol = day ? '#8f96a1' : steel ? '#4a4552' : wd.id === 2 ? '#6a3fb8' : '#2f3a8c';
  const beamH = (steel ? 620 : 900) * k * vu;
  const top = base - postH;
  for (const sx of [-1, 1]) {
    const x = cx + sx * half;
    const g = ctx.createLinearGradient(x - pw, 0, x + pw, 0);
    g.addColorStop(0, shade(postCol, 0.2));
    g.addColorStop(1, shade(postCol, -0.3));
    ctx.fillStyle = g;
    ctx.fillRect(x - pw / 2, top, pw, postH);
    if (steel) hazardStripes(ctx, x - pw / 2, base - postH * 0.22, pw, postH * 0.22);
    else {
      ctx.fillStyle = accent;
      ctx.fillRect(x - pw / 2, top, Math.max(1, pw * 0.14), postH);
    }
    if (!day) glow(x, top + beamH * 0.5, pw * 4, accent, 0.5);
  }
  // beam
  const bg = vGrad(ctx, top - beamH, top + beamH * 0.2, [
    [0, shade(postCol, 0.25)],
    [1, shade(postCol, -0.35)],
  ]);
  ctx.fillStyle = bg;
  ctx.fillRect(cx - half - pw, top - beamH, half * 2 + pw * 2, beamH);
  ctx.fillStyle = accent;
  ctx.fillRect(cx - half - pw, top - beamH, half * 2 + pw * 2, Math.max(1.2, beamH * 0.07));
  // sign panel
  const pwid = half * 1.5;
  const ph = beamH * 2.3;
  const py = top - beamH - ph * 0.95;
  const label = s.label ?? (day ? 'MESA EXIT' : steel ? 'OBSIDIAN CORE' : 'TURBO DRIFT');
  const sg = vGrad(ctx, py, py + ph, day ? [[0, '#22a05a'], [1, '#0e6a38']] : steel ? [[0, '#2a1410'], [1, '#120806']] : wd.id === 2 ? [[0, '#6a35c8'], [1, '#2a1470']] : [[0, '#2a2fa0'], [1, '#12156a']]);
  ctx.fillStyle = sg;
  rr(ctx, cx - pwid / 2, py, pwid, ph, ph * 0.18);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1.4, ph * 0.05);
  ctx.stroke();
  if (!day) glow(cx, py + ph / 2, pwid * 0.7, accent, 0.35);
  if (pwid > 60) {
    ctx.font = `900 ${Math.round(ph * 0.5)}px -apple-system, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = accent;
    ctx.shadowBlur = gfxState.lite || day ? 0 : Math.min(24, ph * 0.3);
    ctx.fillText(label, cx, py + ph * 0.54, pwid * 0.9);
    ctx.shadowBlur = 0;
  }
  // chasing bulbs along the beam
  const n = 14;
  for (let i = 0; i < (day ? 0 : n); i++) {
    const lit = steel ? Math.floor(time * 3 + i) % 2 === 0 : Math.floor(time * 7 + i) % 3 === 0;
    ctx.fillStyle = lit ? (steel ? '#ffb347' : '#ffffff') : rgba(accent, 0.55);
    const bx = cx - half + (2 * half * (i + 0.5)) / n;
    ctx.fillRect(bx - 1.5, top - beamH * 0.55, Math.max(2.4, beamH * 0.16), Math.max(2.4, beamH * 0.16));
  }
  // checkered strip on the start arch
  if (s.label === 'START') {
    const cw = (half * 2) / 28;
    for (let i = 0; i < 28; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#10131c';
      ctx.fillRect(cx - half + i * cw, top - beamH * 0.04, cw, beamH * 0.26);
    }
  }
}
