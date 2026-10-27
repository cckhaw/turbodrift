import { Home, RotateCcw, Share2, Check, Trophy, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { WORLDS } from '../game/worlds';
import type { RaceResult } from '../game/types';
import { formatTime, ordinal } from '../utils/format';
import { copyText, scorecardText } from '../utils/share';

interface Props {
  result: RaceResult;
  newUnlock: number | null;
  onAgain: () => void;
  onMenu: () => void;
  onBoard: () => void;
  onNext: (() => void) | null;
}

export default function Results({ result: r, newUnlock, onAgain, onMenu, onBoard, onNext }: Props) {
  const [copied, setCopied] = useState(false);
  const w = WORLDS[r.world - 1];
  const share = async () => {
    if (await copyText(scorecardText(r))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };
  const trial = r.mode === 'trial';
  const medal = trial ? '⏱️' : r.position === 1 ? '🥇' : r.position === 2 ? '🥈' : r.position === 3 ? '🥉' : '🏁';
  const winTime = r.standings[0]?.time ?? 0;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/60 p-4 pt-[calc(env(safe-area-inset-top)+16px)] backdrop-blur-sm">
      <div className="glass animate-rise w-full max-w-md p-5 !bg-[rgba(16,22,38,0.82)]">
        <div className="text-center">
          <div className="text-5xl">{medal}</div>
          <h2 className="title-grad mt-1 text-4xl font-extrabold tracking-tight">{trial ? 'Time Trial' : `${ordinal(r.position)} place`}</h2>
          <p className="mt-1 text-sm text-white/60">
            {w.emoji} {w.name} · Seed {r.seed}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-white/[0.06] py-3">
            <p className="text-[11px] uppercase tracking-wider text-white/50">Total</p>
            <p className="font-mono text-xl font-semibold">{formatTime(r.totalTime)}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.06] py-3">
            <p className="text-[11px] uppercase tracking-wider text-white/50">Best lap</p>
            <p className="font-mono text-xl font-semibold text-apple-pink">{formatTime(r.bestLap)}</p>
          </div>
        </div>

        {trial && (
          <ol className="mt-3 space-y-1">
            {r.lapTimes.map((t, i) => (
              <li key={i} className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-sm ${t === r.bestLap ? 'bg-apple-pink/25 font-semibold' : 'bg-white/[0.04]'}`}>
                <span>Lap {i + 1}</span>
                <span className="font-mono text-xs">{formatTime(t)}</span>
              </li>
            ))}
          </ol>
        )}

        {!trial && (
        <ol className="mt-3 space-y-1">
          {r.standings.map((s, i) => (
            <li key={s.name} className={`flex items-center gap-3 rounded-xl px-3 py-1.5 text-sm ${s.you ? 'bg-apple-blue/30 font-semibold' : 'bg-white/[0.04]'}`}>
              <span className="w-5 text-center text-white/50">{i + 1}</span>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              <span className="flex-1 truncate">{s.you ? 'You' : s.name}</span>
              <span className="font-mono text-xs text-white/70">{i === 0 ? formatTime(s.time) : `+${(((s.time ?? 0) - winTime) / 1000).toFixed(2)}`}</span>
            </li>
          ))}
        </ol>
        )}

        {!trial && (
          <p className="mt-3 text-center text-xs text-white/45">Your best lap is posted to the Race leaderboard once the server has replayed your inputs to verify it.</p>
        )}

        {newUnlock && (
          <p className="mt-3 rounded-2xl bg-apple-green/15 px-4 py-2.5 text-center text-sm font-medium text-apple-green">
            🔓 {WORLDS[newUnlock - 1].name} unlocked!
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={share} className="btn-hot col-span-2 flex items-center justify-center gap-2">
            {copied ? <Check size={18} /> : <Share2 size={18} />} {copied ? 'Scorecard copied!' : 'Share Scorecard'}
          </button>
          <button onClick={onAgain} className="btn-primary flex items-center justify-center gap-2">
            <RotateCcw size={18} /> Again
          </button>
          <button onClick={onBoard} className="btn-glass flex items-center justify-center gap-2">
            <Trophy size={18} /> Board
          </button>
          {onNext && (
            <button onClick={onNext} className="btn-glass col-span-2 flex items-center justify-center gap-2">
              Next world <ChevronRight size={18} />
            </button>
          )}
          <button onClick={onMenu} className="btn-glass col-span-2 flex items-center justify-center gap-2">
            <Home size={18} /> Menu
          </button>
        </div>
      </div>
    </div>
  );
}
