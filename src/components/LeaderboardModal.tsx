import { useEffect, useState } from 'react';
import { Check, Share2, X } from 'lucide-react';
import { WORLDS } from '../game/worlds';
import type { RaceResult } from '../game/types';
import { formatTime } from '../utils/format';
import { getBoard, getPlayerName, setPlayerName, type Board } from '../utils/leaderboard';
import { challengeUrl, copyText, scorecardText } from '../utils/share';

interface Props {
  world: number;
  seed: number;
  last: RaceResult | null;
  onClose: () => void;
}

export default function LeaderboardModal({ world, seed, last, onClose }: Props) {
  const [tab, setTab] = useState<'seed' | 'world'>('seed');
  const [board, setBoard] = useState<Board | null>(null);
  const [name, setName] = useState(getPlayerName());
  const [copied, setCopied] = useState(false);
  const w = WORLDS[world - 1];

  useEffect(() => {
    let live = true;
    setBoard(null);
    getBoard(world, tab === 'seed' ? seed : null).then((b) => live && setBoard(b));
    return () => {
      live = false;
    };
  }, [world, seed, tab]);

  const share = async () => {
    const text = last && last.world === world && last.seed === seed ? scorecardText(last) : `🏁 Turbo Drift: Neon Circuit\n${w.emoji} ${w.name} · Seed ${seed}\nBeat my lap 👉 ${challengeUrl(world, seed)}`;
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* fall back to clipboard */
      }
    }
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const rows = board?.rows ?? [];
  const best = rows.findIndex((r) => r.you);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Leaderboard">
      <div className="glass animate-rise flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden !bg-[rgba(20,26,42,0.85)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Leaderboard</h2>
            <p className="text-xs text-white/55">
              {w.emoji} {w.name}
            </p>
          </div>
          <button aria-label="Close" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-pill bg-glass-strong active:scale-95">
            <X size={18} />
          </button>
        </div>

        <div className="mx-5 flex rounded-pill bg-black/30 p-1 text-sm font-medium">
          {(['seed', 'world'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-pill py-1.5 transition ${tab === t ? 'bg-apple-blue text-white' : 'text-white/60'}`}>
              {t === 'seed' ? `Seed ${seed}` : 'World best'}
            </button>
          ))}
        </div>

        <ol className="mt-3 flex-1 space-y-1 overflow-y-auto px-3">
          {rows.map((r, i) => (
            <li key={i} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${r.you ? 'bg-apple-blue/25 ring-1 ring-apple-blue/60' : 'bg-white/[0.04]'}`}>
              <span className={`w-6 text-center text-sm font-bold ${i < 3 ? 'text-apple-yellow' : 'text-white/40'}`}>{i + 1}</span>
              <span className="flex-1 truncate font-medium">{r.you ? `${r.name} ★` : r.name}</span>
              {tab === 'world' && <span className="font-mono text-[11px] text-white/35">#{r.seed}</span>}
              <span className="font-mono text-sm tabular-nums">{formatTime(r.lapMs)}</span>
            </li>
          ))}
          {!board && <li className="py-8 text-center text-white/50">Loading…</li>}
          {board && rows.length === 0 && <li className="py-8 text-center text-white/50">No times yet — be the first!</li>}
        </ol>
        <p className="px-5 pt-2 text-[11px] text-white/40">
          {board?.source === 'global' && 'Global board · server-verified time trials, best lap per player'}
          {board?.source === 'offline' && 'Can’t reach the global board — showing your times with rival ghosts'}
          {board?.source === 'local' && 'Local board with rival ghosts'}
          {best >= 0 ? ` · you’re #${best + 1}` : ''}
        </p>

        <div className="flex items-center gap-2 p-4">
          <input
            aria-label="Your name"
            maxLength={12}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setPlayerName(e.target.value);
            }}
            className="w-28 rounded-pill border border-glass-border bg-black/30 px-4 py-3 text-sm outline-none focus:border-apple-blue"
          />
          <button onClick={share} className="btn-hot flex flex-1 items-center justify-center gap-2 !py-3">
            {copied ? <Check size={18} /> : <Share2 size={18} />}
            {copied ? 'Copied!' : 'Share Scorecard'}
          </button>
        </div>
      </div>
    </div>
  );
}
