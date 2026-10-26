import { useState } from 'react';
import { Check, Dices, Link2, Lock, Play, Smartphone, Trophy, Volume2, VolumeX } from 'lucide-react';
import { KARTS, type Mode } from '../game/karts';
import { WORLDS } from '../game/worlds';
import type { Progress } from '../utils/progress';
import { hapticsSupported } from '../utils/haptics';
import { randomSeed } from '../utils/rng';
import { challengeUrl, copyText } from '../utils/share';

interface Props {
  world: number;
  seed: number;
  fromLink: boolean;
  progress: Progress;
  muted: boolean;
  haptics: boolean;
  onHaptics: () => void;
  mode: Mode;
  onMode: (m: Mode) => void;
  kart: string;
  onKart: (id: string) => void;
  onWorld: (w: number) => void;
  onSeed: (s: number) => void;
  onRace: () => void;
  onBoard: () => void;
  onMute: () => void;
}

const DIFF_COLOR = ['bg-apple-green/20 text-apple-green', 'bg-apple-yellow/20 text-apple-yellow', 'bg-apple-pink/20 text-apple-pink'];
const CARD_BG = [
  'linear-gradient(160deg,#0b4f8f,#06142e 70%)',
  'linear-gradient(160deg,#6a2fc2,#140a45 70%)',
  'linear-gradient(160deg,#a8310b,#120202 70%)',
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
          {hapticsSupported() && (
            <button aria-label={p.haptics ? 'Turn haptics off' : 'Turn haptics on'} aria-pressed={p.haptics} onClick={p.onHaptics} className={`glass flex h-10 w-10 items-center justify-center !rounded-pill active:scale-95 ${p.haptics ? '' : 'opacity-50'}`}>
              <Smartphone size={18} />
            </button>
          )}
          <button aria-label={p.muted ? 'Unmute' : 'Mute'} onClick={p.onMute} className="glass flex h-10 w-10 items-center justify-center !rounded-pill active:scale-95">
            {p.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          </div>
        </div>

        <header className="mt-6 animate-rise text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-apple-pink">Turbo Drift</p>
          <h1 className="title-grad mt-1 text-5xl font-extrabold leading-none tracking-tight">Neon Circuit</h1>
          <p className="mt-3 text-[15px] text-white/60">Drift. Boost. Beat five rival bots in 3 laps.</p>
        </header>

        {p.fromLink && (
          <div className="glass mt-5 flex items-center gap-2 px-4 py-3 text-sm">
            <Link2 size={16} className="text-apple-blue" />
            <span>
              Challenge loaded — <b>{w.name}</b>, seed <b>{p.seed}</b>
            </span>
          </div>
        )}

        <section className="mt-6 space-y-3">
          {WORLDS.map((wd, i) => {
            const locked = wd.id > p.progress.unlocked && !(p.fromLink && wd.id === p.world);
            const sel = wd.id === p.world;
            const medal = p.progress.medals[wd.id];
            return (
              <button
                key={wd.id}
                disabled={locked}
                onClick={() => p.onWorld(wd.id)}
                style={{ background: locked ? undefined : CARD_BG[i] }}
                className={`glass relative w-full overflow-hidden p-4 text-left transition active:scale-[0.98] ${sel ? 'ring-2 ring-apple-blue shadow-neon-blue' : ''} ${locked ? 'opacity-55' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{wd.emoji}</span>
                      <h2 className="text-lg font-bold tracking-tight">
                        {wd.id}. {wd.name}
                      </h2>
                    </div>
                    <p className="mt-1 text-sm text-white/70">{locked ? 'Finish on the podium (top 3) in the previous world to unlock.' : wd.tagline}</p>
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
                <span className="mb-1.5 block h-1.5 w-full rounded-pill" style={{ background: `linear-gradient(90deg, ${k.color}, ${k.accent})` }} />
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
          {(['race', 'trial'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={p.mode === m} onClick={() => p.onMode(m)} className={`flex-1 rounded-pill py-2 transition ${p.mode === m ? 'bg-apple-blue text-white' : 'text-white/60'}`}>
              {m === 'race' ? 'Race · bots + items' : 'Time Trial · solo'}
            </button>
          ))}
        </div>

        <div className="sticky bottom-0 mt-auto flex gap-3 pt-4">
          <button onClick={p.onRace} className="btn-primary flex flex-1 items-center justify-center gap-2 text-lg">
            <Play size={20} fill="currentColor" /> {p.mode === 'race' ? 'Race' : 'Start trial'}
          </button>
          <button onClick={p.onBoard} className="btn-glass flex items-center justify-center gap-2">
            <Trophy size={18} /> Board
          </button>
        </div>
      </div>
    </div>
  );
}
