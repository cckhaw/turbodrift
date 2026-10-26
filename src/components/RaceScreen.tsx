import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Flag, Zap } from 'lucide-react';
import { Engine } from '../game/engine';
import { ITEM_INFO } from '../game/items';
import type { Mode } from '../game/karts';
import { WORLDS } from '../game/worlds';
import type { HudSnapshot, RaceResult } from '../game/types';
import { formatTime } from '../utils/format';

interface Props {
  world: number;
  seed: number;
  mode: Mode;
  kart: string;
  onFinish: (r: RaceResult) => void;
  onQuit: () => void;
}

const STEER_RANGE = 70; // px of thumb travel for full lock
const LVL_COLOR = ['#ffffff', '#5AC8FA', '#FF2D55'];

export default function RaceScreen({ world, seed, mode, kart, onFinish, onQuit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [paused, setPaused] = useState(false);
  const [steerUi, setSteerUi] = useState(0);
  const [driftHeld, setDriftHeld] = useState(false);
  const drag = useRef<{ id: number; origin: number } | null>(null);
  const w = WORLDS[world - 1];

  useEffect(() => {
    const engine = new Engine({ canvas: canvasRef.current!, world, seed, onHud: setHud, onFinish: (r) => finishRef.current(r), mode, kart });
    engineRef.current = engine;
    engine.start();
    const keys = new Set<string>();
    const sync = () => {
      const l = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
      const r = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
      if (!drag.current) {
        engine.input.steer = (r ? 1 : 0) - (l ? 1 : 0);
        setSteerUi(engine.input.steer);
      }
      const d = keys.has(' ') || keys.has('Shift') || keys.has('ArrowDown');
      engine.input.drift = d;
      setDriftHeld(d);
    };
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') setPaused((p) => !p);
      if (e.key === ' ' || e.key === 'ArrowUp') e.preventDefault();
      if ((e.key === 'e' || e.key === 'E' || e.key === 'Enter' || e.key === 'ArrowUp') && !e.repeat) engine.useItem();
      keys.add(e.key);
      sync();
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(e.key);
      sync();
    };
    const vis = () => document.hidden && setPaused(true);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      document.removeEventListener('visibilitychange', vis);
      engine.destroy();
      engineRef.current = null;
    };
  }, [world, seed, mode, kart]);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);

  // ---- thumb steering: drag anywhere; the anchor follows the thumb so reversing is instant ----
  const setSteer = (v: number) => {
    if (engineRef.current) engineRef.current.input.steer = v;
    setSteerUi(v);
  };
  const onDown = (e: React.PointerEvent) => {
    if (drag.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, origin: e.clientX };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    let dx = e.clientX - d.origin;
    if (dx > STEER_RANGE) d.origin = e.clientX - STEER_RANGE;
    if (dx < -STEER_RANGE) d.origin = e.clientX + STEER_RANGE;
    dx = e.clientX - d.origin;
    const v = Math.abs(dx) < 4 ? 0 : dx / STEER_RANGE;
    setSteer(Math.max(-1, Math.min(1, v)));
  };
  const onUp = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) {
      drag.current = null;
      setSteer(0);
    }
  };
  const setDrift = (v: boolean) => {
    if (engineRef.current) engineRef.current.input.drift = v;
    setDriftHeld(v);
  };

  const ring = hud ? Math.min(1, hud.driftCharge) : 0;
  const lvl = hud?.driftLevel ?? 0;
  const circ = 2 * Math.PI * 46;
  const cd = hud?.countdown;

  return (
    <div className="relative h-full w-full overflow-hidden bg-obsidian">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* steering surface */}
      <div className="absolute inset-0 z-10 touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />

      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top)+10px)]">
        <div className="glass !rounded-2xl px-3.5 py-2 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Position</p>
          <p className="text-3xl font-extrabold leading-none tabular-nums">
            {hud?.position ?? '-'}
            <span className="text-base font-semibold text-white/50">/{hud?.total ?? 6}</span>
          </p>
        </div>
        <div className="glass !rounded-2xl px-3.5 py-2 text-center">
          <p className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-white/50">
            <Flag size={10} /> Lap {hud?.lap ?? 1}/{hud?.laps ?? 3}
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums">{formatTime(hud?.lapTime ?? 0)}</p>
        </div>
        <button aria-label="Pause" onClick={() => setPaused(true)} className="glass pointer-events-auto z-30 flex h-12 w-12 items-center justify-center !rounded-2xl active:scale-95">
          <Pause size={20} />
        </button>
      </div>

      {hud && hud.total > 1 && (
        <ul className="pointer-events-none absolute left-3 top-[calc(env(safe-area-inset-top)+84px)] z-20 space-y-1">
          {hud.standings.map((s, i) => (
            <li key={s.name} className={`flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11px] font-medium backdrop-blur-md ${s.you ? 'bg-apple-blue/70' : 'bg-black/30 text-white/80'}`}>
              <span className="w-3 text-center text-white/60">{i + 1}</span>
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span className="max-w-[78px] truncate">{s.you ? 'YOU' : s.name}</span>
            </li>
          ))}
        </ul>
      )}

      {hud?.toast && (
        <div key={hud.toast.id} className="pointer-events-none absolute inset-x-0 top-[26%] z-20 flex justify-center">
          <span className="animate-toast rounded-pill bg-black/45 px-5 py-2 text-xl font-extrabold tracking-wide backdrop-blur-md" style={{ color: hud.boosting ? '#5AC8FA' : '#fff' }}>
            {hud.toast.text}
          </span>
        </div>
      )}

      {cd != null && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span key={cd} className="animate-pop text-[9rem] font-black leading-none" style={{ color: cd === 0 ? '#30D158' : '#fff', textShadow: `0 0 40px ${w.glow}` }}>
            {cd === 0 ? 'GO!' : cd}
          </span>
        </div>
      )}

      {/* bottom: speed, steer indicator, drift button */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-4 pb-[calc(env(safe-area-inset-bottom)+18px)]">
        <div className="glass !rounded-2xl px-3.5 py-2">
          <p className="text-3xl font-extrabold leading-none tabular-nums">{hud?.kmh ?? 0}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">km/h</p>
        </div>

        <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+34px)] left-[120px] h-2 w-16 rounded-pill bg-white/10">
          <div className="relative h-full">
            <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" style={{ left: `${50 + steerUi * 45}%` }} />
          </div>
        </div>

        <button
          aria-label={hud?.item ? `Use ${ITEM_INFO[hud.item].label}` : 'No item'}
          disabled={mode === 'trial'}
          className={`pointer-events-auto absolute bottom-[calc(env(safe-area-inset-bottom)+34px)] right-[118px] z-30 flex h-[64px] w-[64px] touch-none select-none items-center justify-center rounded-full border text-3xl backdrop-blur-glass transition active:scale-90 ${mode === 'trial' ? 'hidden' : hud?.item && !hud.itemRolling ? 'border-apple-yellow bg-apple-yellow/25 shadow-[0_0_24px_rgba(255,214,10,0.5)]' : 'border-glass-border bg-glass'}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            engineRef.current?.useItem();
          }}
        >
          {hud?.itemRolling ? <span className="animate-pulse">❓</span> : hud?.item ? ITEM_INFO[hud.item].emoji : <span className="text-base text-white/35">ITEM</span>}
        </button>

        <button
          aria-label="Drift and boost"
          className="pointer-events-auto relative z-30 h-[92px] w-[92px] touch-none select-none"
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setDrift(true);
          }}
          onPointerUp={() => setDrift(false)}
          onPointerCancel={() => setDrift(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
            <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
            <circle cx="50" cy="50" r="46" fill="none" stroke={LVL_COLOR[Math.min(2, lvl + (ring > 0 && lvl < 2 ? 1 : 0))]} strokeWidth="5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - (lvl === 2 ? 1 : ring))} />
          </svg>
          <span
            className={`absolute inset-[9px] flex flex-col items-center justify-center rounded-full border text-xs font-bold uppercase tracking-wider backdrop-blur-glass transition ${driftHeld ? 'scale-95 border-apple-pink bg-apple-pink/70 shadow-neon-pink' : 'border-glass-border bg-glass-strong'}`}
          >
            <Zap size={22} fill={hud?.boosting ? 'currentColor' : 'none'} />
            Drift
          </span>
        </button>
      </div>

      {paused && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm">
          <div className="glass animate-rise w-full max-w-xs space-y-3 p-5 text-center !bg-[rgba(16,22,38,0.85)]">
            <h2 className="text-2xl font-bold">Paused</h2>
            <button onClick={() => setPaused(false)} className="btn-primary flex w-full items-center justify-center gap-2">
              <Play size={18} fill="currentColor" /> Resume
            </button>
            <button onClick={onQuit} className="btn-glass w-full">
              Quit to menu
            </button>
            <p className="pt-1 text-xs text-white/45">Drag to steer · hold DRIFT in a turn, release to boost · tap the item button (or E) to use pick-ups</p>
          </div>
        </div>
      )}
    </div>
  );
}
