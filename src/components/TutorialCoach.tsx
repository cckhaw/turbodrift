import { useEffect, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { ITEM_INFO } from '../game/items';
import type { HudSnapshot } from '../game/types';
import { loadSettings } from '../utils/settings';
import { advanceTutorial, initialTutorial, markTutorialSeen, skipStep, TUTORIAL_STEPS, type TutorialState } from '../utils/tutorial';

interface Props {
  hud: HudSnapshot | null;
  steer: number; // live steering, -1..1
  onKeepPractising: () => void; // finish the lessons but stay on the track
  onExit: () => void; // back to the menu
}

const COPY = {
  steer: { icon: '↔️', title: 'Steer', body: 'Touch the screen and drag your thumb left and right. The kart speeds up by itself.', key: 'Keyboard: ← → or A D' },
  drift: { icon: '🌀', title: 'Drift through a turn', body: 'When a bend comes up, steer into it and hold the DRIFT button.', key: 'Keyboard: hold Space' },
  boost: { icon: '🚀', title: 'Let go to boost', body: 'Keep holding until the ring around DRIFT turns blue (then pink), then release for a turbo.', key: 'Longer drift = longer boost' },
  item: { icon: '🎁', title: 'Grab an item', body: 'Drive through a glowing ? box, then tap the item button.', key: 'Keyboard: E or Enter' },
  done: { icon: '🏁', title: 'You’re ready to race!', body: 'Yellow chevrons on the road are boost pads. Finish in the top 3 to unlock new worlds. Your best laps in Races and Time Trials go on the global leaderboards.', key: '' },
} as const;

/** A ring that pulses around a control to say "this one". Positions mirror the layout in RaceScreen. */
function Halo({ className }: { className: string }) {
  return (
    <div className={`pointer-events-none absolute z-20 ${className}`}>
      <span className="absolute inset-0 animate-halo rounded-full border-4 border-apple-yellow" />
      <span className="absolute inset-0 rounded-full border-2 border-apple-yellow/80" />
    </div>
  );
}

export default function TutorialCoach({ hud, steer, onKeepPractising, onExit }: Props) {
  const [state, setState] = useState<TutorialState>(initialTutorial);
  const step = state.step;

  // advance from live data
  useEffect(() => {
    setState((s) =>
      advanceTutorial(s, {
        steer,
        drifting: (hud?.driftCharge ?? 0) > 0 || (hud?.driftLevel ?? 0) > 0,
        boosting: hud?.boosting ?? false,
        item: hud?.item ?? null,
      }),
    );
  }, [steer, hud]);

  useEffect(() => {
    if (step === 'done') markTutorialSeen('done');
  }, [step]);

  const { touchScheme, driftAssist } = loadSettings();
  const c = COPY[step];
  const idx = TUTORIAL_STEPS.indexOf(step);
  const holding = hud?.item != null;
  const body = step === 'item' && holding ? `You’ve got ${ITEM_INFO[hud!.item!].emoji} ${ITEM_INFO[hud!.item!].label}! Tap the item button to use it.` : (step === 'steer' && touchScheme === 'buttons' ? 'Hold the left and right arrow pads. The kart speeds up by itself.' : step === 'drift' && driftAssist ? 'When a bend comes up, steer hard into it and the kart starts drifting. You can also hold the DRIFT button.' : c.body);

  return (
    <>
      {(step === 'drift' || step === 'boost') && <Halo className="bottom-[calc(env(safe-area-inset-bottom)+10px)] right-[8px] h-[108px] w-[108px]" />}
      {step === 'item' && holding && <Halo className="bottom-[calc(env(safe-area-inset-bottom)+28px)] right-[112px] h-[76px] w-[76px]" />}

      {step === 'steer' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[28%] z-20 flex justify-center" aria-hidden>
          <div className="relative h-14 w-44 rounded-pill bg-black/35 backdrop-blur-md">
            <div className="absolute inset-0 flex items-center justify-between px-4 text-xl text-white/60">
              <span>◀</span>
              <span>▶</span>
            </div>
            <div className="absolute left-1/2 top-1/2 -ml-5 -mt-5 h-10 w-10 animate-sweep rounded-full border-2 border-white bg-white/40" />
          </div>
        </div>
      )}

      <div className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+86px)] z-30 mx-auto max-w-md" role="status" aria-live="polite">
        <div className="glass animate-rise !bg-[rgba(14,20,36,0.82)] px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="text-3xl leading-none">{c.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[17px] font-bold tracking-tight">{c.title}</p>
                <button aria-label="Skip tutorial" onClick={() => { markTutorialSeen(step === 'done' ? 'done' : 'skipped'); onKeepPractising(); }} className="pointer-events-auto -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 active:scale-90">
                  <X size={14} />
                </button>
              </div>
              <p className="mt-0.5 text-[14px] leading-snug text-white/80">{body}</p>
              {step === 'steer' && (
                <p className="mt-1.5 flex gap-2 text-xs font-semibold">
                  <span className={state.left ? 'text-apple-green' : 'text-white/45'}>{state.left ? '✓' : '○'} Left</span>
                  <span className={state.right ? 'text-apple-green' : 'text-white/45'}>{state.right ? '✓' : '○'} Right</span>
                </p>
              )}
              {c.key && <p className="mt-1 text-[11px] text-white/45">{c.key}</p>}
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between">
            <div className="flex gap-1.5" aria-label={`Step ${Math.min(idx + 1, 4)} of 4`}>
              {TUTORIAL_STEPS.slice(0, 4).map((s, i) => (
                <span key={s} className={`h-1.5 w-6 rounded-pill ${i < idx ? 'bg-apple-green' : i === idx ? 'bg-apple-blue' : 'bg-white/20'}`} />
              ))}
            </div>
            {step !== 'done' ? (
              <button onClick={() => setState(skipStep)} className="pointer-events-auto flex items-center gap-0.5 text-xs font-medium text-white/55 active:opacity-60">
                Skip this step <ChevronRight size={14} />
              </button>
            ) : (
              <div className="pointer-events-auto flex gap-2">
                <button onClick={onKeepPractising} className="btn-glass !px-3.5 !py-2 text-xs">
                  Keep practising
                </button>
                <button onClick={onExit} className="btn-primary !px-3.5 !py-2 text-xs">
                  Back to menu
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
