import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Flag, Zap } from 'lucide-react';
import { Engine } from '../game/engine';
import Minimap from './Minimap';
import RoadAhead from './RoadAhead';
import TutorialCoach from './TutorialCoach';
import { buildTrackMap, trackMarks } from '../game/minimap';
import { generateTrack } from '../game/track';
import { ITEM_INFO } from '../game/items';
import type { Mode } from '../game/karts';
import { loadSettings, nextHudMode, saveSettings, type HudMode } from '../utils/settings';
import { dragToSteer, holdRange, padSteer, smoothSteer } from '../utils/steering';
import KeyHints, { isDesktop } from './KeyHints';
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
  onSettings: () => void;
  /** Show the guided lessons on top of (endless) practice. */
  tutorial?: boolean;
}

const LVL_COLOR = ['#ffffff', '#5AC8FA', '#FF2D55'];

export default function RaceScreen({ world, seed, mode, kart, onFinish, onQuit, onSettings, tutorial = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [paused, setPaused] = useState(false);
  const [steerUi, setSteerUi] = useState(0);
  const [driftHeld, setDriftHeld] = useState(false);
  const [coachOpen, setCoachOpen] = useState(tutorial);
  const [hudMode, setHudMode] = useState<HudMode>(() => loadSettings().hud);
  const { trackMap, marks } = useMemo(() => {
    const { segments } = generateTrack(world, seed);
    return { trackMap: buildTrackMap(segments.map((s) => s.curve)), marks: trackMarks(segments) };
  }, [world, seed]);
  /** tap the panels to cycle full → compact → off; the choice is remembered */
  const cycleHud = () => {
    const next = nextHudMode(hudMode);
    setHudMode(next);
    saveSettings({ hud: next });
  };
  const steerRange = useRef(loadSettings().steerRange); // px of thumb travel for full lock
  const [scheme, setScheme] = useState(() => loadSettings().touchScheme);
  const desktop = useMemo(isDesktop, []);
  const steerTarget = useRef(0); // what the thumb (or pad) asks for
  const steerCur = useRef(0); // the smoothed value the engine actually sees
  const touchSteering = useRef(false);
  const pads = useRef({ left: false, right: false });
  const drag = useRef<{ id: number; origin: number } | null>(null);
  const w = WORLDS[world - 1];

  useEffect(() => {
    const engine = new Engine({ canvas: canvasRef.current!, world, seed, onHud: setHud, onFinish: (r) => finishRef.current(r), mode, kart });
    engineRef.current = engine;
    engine.start();
    // touch steering is eased towards the thumb's position every frame (the keyboard writes straight through)
    let raf = 0;
    let last = performance.now();
    let shown = 0;
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (touchSteering.current || steerCur.current !== 0) {
        steerCur.current = smoothSteer(steerCur.current, steerTarget.current, dt);
        engine.input.steer = steerCur.current;
        if (Math.abs(steerCur.current - shown) > 0.04 || (steerCur.current === 0 && shown !== 0)) {
          shown = steerCur.current;
          setSteerUi(shown);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const keys = new Set<string>();
    const sync = () => {
      const l = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
      const r = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
      if (!drag.current && !touchSteering.current && steerCur.current === 0) {
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
      cancelAnimationFrame(raf);
      engine.destroy();
      engineRef.current = null;
    };
  }, [world, seed, mode, kart]);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
    steerRange.current = loadSettings().steerRange; // may have been changed from the pause menu
    setHudMode(loadSettings().hud);
    setScheme(loadSettings().touchScheme);
    engineRef.current?.refreshSettings();
  }, [paused]);

  // ---- thumb steering: drag anywhere; the anchor follows the thumb so reversing is instant ----
  const setSteer = (v: number) => {
    steerTarget.current = v;
    touchSteering.current = drag.current !== null || pads.current.left || pads.current.right;
  };
  const setPad = (side: 'left' | 'right', held: boolean) => {
    pads.current[side] = held;
    setSteer(padSteer(pads.current.left, pads.current.right));
  };
  const onDown = (e: React.PointerEvent) => {
    if (drag.current || scheme !== 'drag') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, origin: e.clientX };
    touchSteering.current = true;
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    let dx = e.clientX - d.origin;
    const range = steerRange.current;
    const lim = holdRange(range);
    if (dx > lim) d.origin = e.clientX - lim;
    if (dx < -lim) d.origin = e.clientX + lim;
    dx = e.clientX - d.origin;
    setSteer(dragToSteer(dx, range));
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
        {mode === 'practice' ? (
          <div className="glass !rounded-2xl px-3.5 py-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-apple-yellow">Practice</p>
            <p className="text-sm font-semibold leading-tight text-white/70">No timing, no pressure</p>
          </div>
        ) : (
          <div className="glass !rounded-2xl px-3.5 py-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Position</p>
            <p className="text-3xl font-extrabold leading-none tabular-nums">
              {hud?.position ?? '-'}
              <span className="text-base font-semibold text-white/50">/{hud?.total ?? 6}</span>
            </p>
          </div>
        )}
        <div className="glass !rounded-2xl px-3.5 py-2 text-center">
          <p className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-white/50">
            <Flag size={10} /> {mode === 'practice' ? 'Lap time' : `Lap ${hud?.lap ?? 1}/${hud?.laps ?? 3}`}
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums">{formatTime(hud?.lapTime ?? 0)}</p>
        </div>
        <button aria-label="Pause" onClick={() => setPaused(true)} className="glass pointer-events-auto z-30 flex h-12 w-12 items-center justify-center !rounded-2xl active:scale-95">
          <Pause size={20} />
        </button>
      </div>

      {hud && !(tutorial && coachOpen) && (
        <button
          aria-label={`Race panels: ${hudMode}. Tap to change`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={cycleHud}
          className="absolute right-3 top-[calc(env(safe-area-inset-top)+78px)] z-20 flex flex-col items-end gap-2"
        >
          {hudMode === 'off' ? (
            <span className="glass !rounded-pill px-3 py-1.5 text-[11px] font-semibold text-white/70">Map</span>
          ) : (
            <>
              <Minimap map={trackMap} racers={hud.racers} marks={marks} compact={hudMode === 'compact'} />
              <RoadAhead ahead={hud.ahead} hairpinTrack={w.hairpins} chipOnly={hudMode === 'compact'} />
            </>
          )}
        </button>
      )}

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
        <div key={hud.toast.id} className={`pointer-events-none absolute inset-x-0 z-20 flex justify-center ${tutorial && coachOpen ? 'top-[46%]' : 'top-[26%]'}`}>
          <span className="animate-toast rounded-pill bg-black/45 px-5 py-2 text-xl font-extrabold tracking-wide backdrop-blur-md" style={{ color: hud.boosting ? '#5AC8FA' : '#fff' }}>
            {hud.toast.text}
          </span>
        </div>
      )}

      {tutorial && coachOpen && <TutorialCoach hud={hud} steer={steerUi} onKeepPractising={() => setCoachOpen(false)} onExit={onQuit} />}

      {cd != null && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span key={cd} className="animate-pop text-[9rem] font-black leading-none" style={{ color: cd === 0 ? '#30D158' : '#fff', textShadow: `0 0 40px ${w.glow}` }}>
            {cd === 0 ? 'GO!' : cd}
          </span>
        </div>
      )}

      {desktop && !(tutorial && coachOpen) && <KeyHints countdown={cd != null} practice={mode === 'practice'} />}

      {/* bottom: speed, steer indicator, drift button */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-4 pb-[calc(env(safe-area-inset-bottom)+18px)]">
        <div className={`glass !rounded-2xl px-3.5 py-2 ${scheme === 'buttons' ? 'absolute bottom-[calc(env(safe-area-inset-bottom)+126px)] left-4' : ''}`}>
          <p className="text-3xl font-extrabold leading-none tabular-nums">{hud?.kmh ?? 0}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">km/h</p>
        </div>

        {scheme === 'buttons' && (
          <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+18px)] left-3 flex gap-2">
            {(['left', 'right'] as const).map((side) => (
              <button
                key={side}
                aria-label={side === 'left' ? 'Steer left' : 'Steer right'}
                className={`pointer-events-auto flex h-[76px] w-[76px] touch-none select-none items-center justify-center rounded-3xl border text-4xl font-black backdrop-blur-glass transition ${pads.current[side] || (steerUi < -0.3 && side === 'left') || (steerUi > 0.3 && side === 'right') ? 'scale-95 border-apple-blue bg-apple-blue/50 shadow-neon-blue' : 'border-glass-border bg-glass'}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  setPad(side, true);
                }}
                onPointerUp={() => setPad(side, false)}
                onPointerCancel={() => setPad(side, false)}
                onContextMenu={(e) => e.preventDefault()}
              >
                {side === 'left' ? '‹' : '›'}
              </button>
            ))}
          </div>
        )}

        <div className={`absolute bottom-[calc(env(safe-area-inset-bottom)+34px)] left-[120px] h-2 w-16 rounded-pill bg-white/10 ${scheme === 'buttons' ? 'hidden' : ''}`}>
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
          className="pointer-events-auto relative z-30 ml-auto h-[92px] w-[92px] touch-none select-none"
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
            {desktop && <span className="mt-0.5 rounded border border-white/30 px-1 text-[9px] font-semibold normal-case tracking-normal text-white/70">Space</span>}
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
            <button onClick={onSettings} className="btn-glass w-full">
              Settings
            </button>
            <button onClick={onQuit} className="btn-glass w-full">
              Quit to menu
            </button>
            <p className="pt-1 text-xs text-white/45">
              {desktop ? '← → steer · hold Space in a bend to drift, release for a boost · E uses pick-ups · P pauses' : `${scheme === 'buttons' ? 'Use the arrow pads to steer' : 'Drag to steer'} · hold DRIFT in a turn, release to boost · tap the item button to use pick-ups`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
