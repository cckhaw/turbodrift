import { useEffect, useState } from 'react';
import { Check, Share2, X } from 'lucide-react';
import { WORLDS } from '../game/worlds';
import type { RaceResult } from '../game/types';
import { formatTime } from '../utils/format';
import Segmented from './Segmented';
import { getBoard, getPlayerName, setPlayerName, type Board, type BoardMode } from '../utils/leaderboard';
import { challengeUrl, copyText, scorecardText } from '../utils/share';

interface Props {
  world: number;
  seed: number;
  last: RaceResult | null;
  /** the mode and lap count currently selected in the menu: they decide which board opens first */
  mode?: string;
  laps?: number;
  onClose: () => void;
}

export default function LeaderboardModal({ world, seed, last, mode, laps, onClose }: Props) {
  // the board being viewed can be any world, so there is no trip back to the menu to look at another one
  const [bw, setBw] = useState(last?.world ?? world);
  const [kind, setKind] = useState<BoardMode>((last?.mode ?? mode) === 'race' ? 'race' : 'trial');
  const [bl, setBl] = useState<number>(last?.laps ?? laps ?? 3);
  const [board, setBoard] = useState<Board | null>(null);
  const [name, setName] = useState(getPlayerName());
  const [copied, setCopied] = useState(false);
  const w = WORLDS[bw - 1];

  useEffect(() => {
    let live = true;
    setBoard(null);
    getBoard(bw, null, kind, bl).then((b) => live && setBoard(b));
    return () => {
      live = false;
    };
  }, [bw, kind, bl]);

  const share = async () => {
    const text = last && last.world === world && last.seed === seed ? scorecardText(last) : `🏁 Turbo Drift: Neon Circuit\n${WORLDS[world - 1].emoji} ${WORLDS[world - 1].name} · Seed ${seed}\nBeat my lap 👉 ${challengeUrl(world, seed)}`;
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Leaderboard">
      <div className="glass animate-rise flex h-full w-full max-w-md flex-col overflow-hidden !bg-[rgba(20,26,42,0.92)] sm:h-[min(820px,90vh)] sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
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

        {/* every world is one tap away, so there's no trip back to the menu to look at another */}
        <div className="no-scrollbar mx-3 flex gap-1.5 overflow-x-auto px-2 pb-2" role="tablist" aria-label="World">
          {WORLDS.map((wd) => (
            <button key={wd.id} role="tab" aria-selected={bw === wd.id} onClick={() => setBw(wd.id)} className={`flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold transition ${bw === wd.id ? 'bg-apple-blue text-white' : 'bg-black/30 text-white/65'}`}>
              <span className="text-base leading-none">{wd.emoji}</span>
              <span>{wd.id}</span>
              {bw === wd.id && <span className="max-w-[7.5rem] truncate">{wd.name}</span>}
            </button>
          ))}
        </div>

        <div className="mx-5 mb-2 flex gap-2">
          <Segmented
            label="Board type"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'race', label: '🏁 Race' },
              { value: 'trial', label: '⏱️ Trial' },
            ]}
            className="flex-1"
          />
          <Segmented
            label="Laps"
            value={bl}
            onChange={setBl}
            options={[
              { value: 1, label: '1 lap' },
              { value: 2, label: '2' },
              { value: 3, label: '3' },
            ]}
            className="flex-1"
          />
        </div>

        <ol className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto px-3">
          {rows.map((r, i) => (
            <li key={i} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${r.you ? 'bg-apple-blue/25 ring-1 ring-apple-blue/60' : 'bg-white/[0.04]'}`}>
              <span className={`w-6 text-center text-sm font-bold ${i < 3 ? 'text-apple-yellow' : 'text-white/40'}`}>{i + 1}</span>
              <span className={`flex-1 truncate font-medium ${r.bot ? 'text-white/70' : ''}`}>
                {r.you ? `${r.name} ★` : r.name}
                {r.bot && <span title="Bot score" className="ml-1.5 rounded-md bg-white/10 px-1 py-0.5 align-middle text-[10px] font-semibold text-white/50">BOT</span>}
              </span>
              <span className="font-mono text-sm tabular-nums">{formatTime(r.totalMs)}</span>
            </li>
          ))}
          {!board && <li className="py-8 text-center text-white/50">Loading…</li>}
          {board && rows.length === 0 && <li className="py-8 text-center text-white/50">No times yet. Be the first!</li>}
        </ol>
        <p className="px-5 pt-2 text-[11px] text-white/40">
          {board?.source === 'global' && `Global board · server-verified ${kind === 'race' ? 'races' : 'time trials'} over ${bl} ${bl === 1 ? 'lap' : 'laps'}, total time, best per player`}
          {board?.source === 'offline' && 'Can’t reach the global board, so this shows your times'}
          {board?.source === 'local' && 'Local board: your times'}
          {board && ' · bots fill empty places'}
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
