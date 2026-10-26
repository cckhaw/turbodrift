import { X } from 'lucide-react';

interface Props {
  onClose: () => void;
  onTutorial?: () => void;
  onPractice?: () => void;
}

const Row = ({ keys, text }: { keys: string; text: string }) => (
  <div className="flex items-start justify-between gap-3 py-2 text-sm">
    <span className="text-white/80">{text}</span>
    <span className="shrink-0 rounded-lg bg-white/10 px-2 py-0.5 font-mono text-xs text-white/70">{keys}</span>
  </div>
);

const Card = ({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) => (
  <section className="mt-3 rounded-2xl bg-white/[0.05] px-4 py-3">
    <h3 className="flex items-center gap-2 text-[15px] font-semibold">
      <span className="text-xl">{icon}</span> {title}
    </h3>
    <div className="mt-1 text-sm leading-snug text-white/75">{children}</div>
  </section>
);

/** Quick reference for the controls. The guided lesson is the tutorial; this is for a fast look-up. */
export default function HowToPlayModal({ onClose, onTutorial, onPractice }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-3 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="How to play">
      <div className="glass animate-rise flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden !bg-[rgba(20,26,42,0.9)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 className="text-xl font-bold tracking-tight">How to play</h2>
          <button aria-label="Close" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-pill bg-glass-strong active:scale-95">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <p className="mt-1 px-1 text-sm text-white/60">Your kart speeds up on its own. You steer, drift and use items. Finish 3 laps ahead of the bots.</p>

          <Card icon="👆" title="Steer">
            Touch the screen and <b>drag your thumb left or right</b>, anywhere. The further you drag, the harder you turn. Drag back the other way to turn back, no need to lift.
          </Card>

          <Card icon="🌀" title="Drift and boost">
            <ol className="list-decimal space-y-0.5 pl-5">
              <li>Steer into a turn and <b>hold the DRIFT button</b> (bottom right).</li>
              <li>Keep holding. The ring around the button fills <span className="text-arcade-cyan">blue</span>, then <span className="text-apple-pink">pink</span>.</li>
              <li><b>Let go</b> to shoot forward with a turbo. Pink gives the bigger one.</li>
            </ol>
            <p className="mt-1.5 text-white/55">Tough corners in worlds 2 and 3 are very hard to take without drifting.</p>
          </Card>

          <Card icon="🎁" title="Items (race mode)">
            Drive through a glowing <b>?</b> box, then tap the <b>item button</b> beside DRIFT: 🚀 turbo · 🛡️ shield · 🛢️ oil slick (drop it behind you) · 🎯 homing missile.
          </Card>

          <Card icon="🛣️" title="On the road">
            Yellow chevrons are <b>boost pads</b>. Wind gates and blocks slow you down. On sky and lava tracks, leaving the road means a <b>fall</b>. On grass you just slow down.
          </Card>

          <Card icon="⌨️" title="Keyboard">
            <Row text="Steer" keys="← → / A D" />
            <Row text="Drift" keys="Space / Shift" />
            <Row text="Use item" keys="E / Enter" />
            <Row text="Pause" keys="Esc / P" />
          </Card>
        </div>

        {(onTutorial || onPractice) && (
          <div className="flex gap-2 border-t border-white/10 p-4">
            {onTutorial && (
              <button onClick={onTutorial} className="btn-primary flex-1 !px-3 !py-3 text-sm">
                Start the tutorial
              </button>
            )}
            {onPractice && (
              <button onClick={onPractice} className="btn-glass flex-1 !px-3 !py-3 text-sm">
                Free practice
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
