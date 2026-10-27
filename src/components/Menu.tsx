import { useState } from 'react';
import { Check, CircleHelp, Dices, GraduationCap, Link2, Lock, Play, Settings, Trophy, Volume2, VolumeX } from 'lucide-react';
import { KARTS, type Mode } from '../game/karts';
import KartPreview from './KartPreview';
import { WORLDS } from '../game/worlds';
import type { Progress } from '../utils/progress';
import { bestLocalLap } from '../utils/leaderboard';
import WorldArt from './WorldArt';
import Segmented from './Segmented';
import { dailyDone, dailyStreak, formatCountdown, isDaily, msUntilNextDaily, type Daily } from '../utils/daily';
import { formatTime } from '../utils/format';
import { randomSeed } from '../utils/rng';
import { challengeUrl, copyText } from '../utils/share';

interface Props {
  world: number;
  seed: number;
  fromLink: boolean;
  daily: Daily;
  dailyTick: number;
  onDaily: () => void;
  progress: Progress;
  muted: boolean;
  mode: Mode;
  onMode: (m: Mode) => void;
  laps: 1 | 2 | 3;
  onLaps: (n: 1 | 2 | 3) => void;
  kart: string;
  onKart: (id: string) => void;
  onWorld: (w: number) => void;
  onSeed: (s: number) => void;
  onRace: () => void;
  onBoard: () => void;
  onMute: () => void;
  onSettings: () => void;
  onHowTo: () => void;
  onTutorial: () => void;
  /** first-time player who hasn't done or skipped the tutorial */
  newPlayer: boolean;
}

const DIFF_COLOR = ['bg-apple-green/20 text-apple-green', 'bg-apple-yellow/20 text-apple-yellow', 'bg-apple-pink/20 text-apple-pink', 'bg-white/25 text-white'];
const CARD_BG = [
  'linear-gradient(170deg,#1c1f7a,#2b2a8f 40%,#a8327a)',
  'linear-gradient(170deg,#3a1a8c,#8a3fd1 45%,#ff9ad5)',
  'linear-gradient(170deg,#2a0603,#7a1d08 45%,#ff7a2a)',
  'linear-gradient(170deg,#2b86d6,#76c6f4 50%,#e9a566)',
];

export default function Menu(p: Props) {
  const [copied, setCopied] = useState(false);
  const w = WORLDS[p.world - 1];
  const share = async () => {
    if (await copyText(challengeUrl(p.world, p.seed))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <div className="relative flex h-full flex-col overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="pointer-events-none fixed inset-0 -z-10" style={{ background: `radial-gradient(900px 500px at 50% -10%, ${w.glow}33, transparent 70%), #090D16` }} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex items-center justify-between">
          <span className="rounded-pill bg-glass px-3 py-1 text-xs font-medium tracking-wide text-white/70">v1 · ARCADE</span>
          <div className="flex gap-2">
          <button aria-label="How to play" onClick={p.onHowTo} className="glass flex h-10 w-10 items-center justify-center !rounded-pill active:scale-95">
            <CircleHelp size={18} />
          </button>
          <button aria-label="Settings" onClick={p.onSettings} className="glass flex h-10 w-10 items-center justify-center !rounded-pill active:scale-95">
            <Settings size={18} />
          </button>
          <button aria-label={p.muted ? 'Unmute' : 'Mute'} onClick={p.onMute} className="glass flex h-10 w-10 items-center justify-center !rounded-pill active:scale-95">
            {p.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          </div>
        </div>

        <header className="mt-6 animate-rise text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-apple-pink">Turbo Drift</p>
          <h1 className="title-grad mt-1 text-5xl font-extrabold leading-none tracking-tight">Neon Circuit</h1>
          <p className="mt-3 text-[15px] text-white/60">Drift. Boost. Beat five rival bots.</p>
        </header>

        {p.newPlayer && (
          <button onClick={p.onTutorial} className="mt-5 flex w-full items-center gap-3 rounded-squircle border border-apple-blue/50 bg-apple-blue/20 p-4 text-left shadow-neon-blue transition active:scale-[0.98]">
            <GraduationCap size={28} className="shrink-0 text-arcade-cyan" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">New here? Learn to drive</span>
              <span className="block text-xs text-white/65">A one-minute guided lap: steering, drifting, boosting and items.</span>
            </span>
            <span className="shrink-0 rounded-pill bg-apple-blue px-3 py-1.5 text-xs font-semibold">Start</span>
          </button>
        )}

        {(() => {
          void p.dailyTick;
          const dw = WORLDS[p.daily.world - 1];
          const best = bestLocalLap(p.daily.world, p.daily.seed);
          const streak = dailyStreak();
          const active = isDaily(p.daily, p.world, p.seed);
          return (
            <button onClick={p.onDaily} className={`glass mt-5 flex w-full items-center gap-3 p-4 text-left transition active:scale-[0.98] ${active ? 'ring-2 ring-apple-pink shadow-neon-pink' : ''}`}>
              <span className="text-3xl">{dailyDone(p.daily.date) ? '✅' : '📅'}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold uppercase tracking-widest text-apple-pink">Daily challenge</span>
                <span className="block truncate font-semibold">
                  {dw.emoji} {dw.name} · time trial
                </span>
                <span className="block text-xs text-white/55">
                  {best != null ? `Your best ${formatTime(best)}` : 'Set a lap time'} · resets in {formatCountdown(msUntilNextDaily())}
                </span>
              </span>
              {streak > 0 && <span className="shrink-0 rounded-pill bg-apple-yellow/20 px-2.5 py-1 text-xs font-bold text-apple-yellow">🔥 {streak}</span>}
            </button>
          );
        })()}

        {p.fromLink && !isDaily(p.daily, p.world, p.seed) && (
          <div className="glass mt-5 flex items-center gap-2 px-4 py-3 text-sm">
            <Link2 size={16} className="text-apple-blue" />
            <span>
              Challenge loaded — <b>{w.name}</b>, seed <b>{p.seed}</b>
            </span>
          </div>
        )}

        <section className="mt-6 space-y-3">
          {WORLDS.map((wd, i) => {
            const locked = wd.id > p.progress.unlocked && p.mode !== 'practice' && !(p.fromLink && wd.id === p.world);
            const sel = wd.id === p.world;
            const medal = p.progress.medals[wd.id];
            return (
              <button
                key={wd.id}
                disabled={locked}
                onClick={() => p.onWorld(wd.id)}
                style={{ background: locked ? undefined : CARD_BG[i] }}
                className={`glass relative w-full overflow-hidden p-4 pb-[58px] text-left transition active:scale-[0.98] ${sel ? 'ring-2 ring-apple-blue shadow-neon-blue' : ''} ${locked ? 'opacity-55' : ''}`}
              >
                <WorldArt world={wd.id} dim={locked} />
                <div className="relative flex items-start justify-between gap-3" style={wd.id === 4 && !locked ? { textShadow: '0 1px 8px rgba(0,45,100,0.65)' } : undefined}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{wd.emoji}</span>
                      <h2 className="text-lg font-bold tracking-tight">
                        {wd.id}. {wd.name}
                      </h2>
                    </div>
                    <p className="mt-1 text-sm text-white/70">{locked ? 'Finish on the podium (top 3) in the previous world to unlock. Open in Practice.' : wd.tagline}</p>
                  </div>
                  {locked ? <Lock size={20} className="mt-1 shrink-0 text-white/60" /> : <span className={`shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-semibold ${DIFF_COLOR[i]}`}>{wd.difficulty}</span>}
                </div>
                {!locked && medal && <p className="mt-2 text-xs text-white/60">Best finish: {medal === 1 ? '🥇' : medal === 2 ? '🥈' : medal === 3 ? '🥉' : `P${medal}`}</p>}
              </button>
            );
          })}
        </section>

        <section className="glass mt-4 p-4">
          <p className="text-sm font-medium text-white/70">Kart</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {KARTS.map((k) => (
              <button
                key={k.id}
                onClick={() => p.onKart(k.id)}
                aria-pressed={p.kart === k.id}
                className={`rounded-2xl border p-2.5 text-left transition active:scale-95 ${p.kart === k.id ? 'border-apple-blue bg-apple-blue/20' : 'border-glass-border bg-white/[0.04]'}`}
              >
                <KartPreview kart={k} />
                <span className="block text-sm font-semibold">{k.name}</span>
                {([['SPD', k.speed], ['ACC', k.accel], ['TURN', k.handling], ['DRIFT', k.drift]] as const).map(([l, v]) => (
                  <span key={l} className="mt-1 flex items-center gap-1 text-[9px] font-semibold tracking-wider text-white/45">
                    <span className="w-7">{l}</span>
                    <span className="h-1 flex-1 rounded-pill bg-white/10">
                      <span className="block h-full rounded-pill bg-white/70" style={{ width: `${Math.min(100, Math.max(15, ((v - 0.8) / 0.6) * 100))}%` }} />
                    </span>
                  </span>
                ))}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/45">{KARTS.find((k) => k.id === p.kart)?.blurb}</p>
        </section>

        <section className="glass mt-4 p-4">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="seed" className="text-sm font-medium text-white/70">
              Track seed
            </label>
            <div className="flex items-center gap-2">
              <input
                id="seed"
                inputMode="numeric"
                value={p.seed}
                onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/\D/g, '').slice(0, 9), 10);
                  p.onSeed(Number.isFinite(n) ? n : 0);
                }}
                className="w-28 rounded-xl border border-glass-border bg-black/30 px-3 py-2 text-right font-mono text-base outline-none focus:border-apple-blue"
              />
              <button aria-label="Random seed" onClick={() => p.onSeed(randomSeed())} className="btn-glass !p-2.5">
                <Dices size={18} />
              </button>
              <button aria-label="Copy challenge link" onClick={share} className="btn-glass !p-2.5">
                {copied ? <Check size={18} className="text-apple-green" /> : <Link2 size={18} />}
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-white/45">Same world + seed = same track. Share the link to challenge a friend.</p>
        </section>

        <div className="mt-4 flex rounded-pill bg-black/30 p-1 text-sm font-semibold" role="tablist" aria-label="Mode">
          {(['race', 'trial', 'practice'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={p.mode === m} onClick={() => p.onMode(m)} className={`flex-1 rounded-pill py-2 transition ${p.mode === m ? 'bg-apple-blue text-white' : 'text-white/60'}`}>
              {m === 'race' ? 'Race' : m === 'trial' ? 'Time Trial' : 'Practice'}
            </button>
          ))}
        </div>
        {p.mode !== 'practice' && (
          <div className="mt-3 flex items-center justify-between gap-3 px-1">
            <span className="text-sm font-medium text-white/70">Laps</span>
            <Segmented
              label="Laps"
              value={p.laps}
              onChange={p.onLaps}
              options={[
                { value: 1, label: '1 lap' },
                { value: 2, label: '2 laps' },
                { value: 3, label: '3 laps' },
              ]}
              className="w-56"
            />
          </div>
        )}
        <p className="mt-2 px-2 text-center text-xs text-white/50">
          {p.mode === 'race' && `${p.laps === 1 ? 'One lap' : p.laps === 2 ? 'Two laps' : 'Three laps'} against five bots, with item boxes. Finish top 3 to unlock the next world.`}
          {p.mode === 'trial' && 'Solo, no opponents. Times are verified and go on the global leaderboard for the lap count you pick.'}
          {p.mode === 'practice' && 'Endless free driving with item boxes. No timing, no results. Try the controls and the UI.'}
        </p>

        <div className="sticky bottom-0 mt-auto flex gap-3 pt-4">
          <button onClick={p.onRace} className="btn-primary flex flex-1 items-center justify-center gap-2 text-lg">
            <Play size={20} fill="currentColor" /> {p.mode === 'race' ? 'Race' : p.mode === 'trial' ? 'Start trial' : 'Start practice'}
          </button>
          <button onClick={p.onBoard} className="btn-glass flex items-center justify-center gap-2">
            <Trophy size={18} /> Board
          </button>
        </div>
      </div>
    </div>
  );
}
