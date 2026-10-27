/** True on machines with a mouse and keyboard rather than a touch screen. */
export const isDesktop = (): boolean => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

export function Key({ children, big = false }: { children: React.ReactNode; big?: boolean }) {
  return (
    <kbd className={`inline-flex items-center justify-center rounded-lg border border-white/35 border-b-[3px] bg-white/12 font-sans font-bold text-white ${big ? 'min-w-[2.4rem] px-2.5 py-1 text-base' : 'min-w-[1.5rem] px-1.5 py-0.5 text-[11px]'}`}>{children}</kbd>
  );
}

/** Keyboard cheat sheet for desktop players: a big card during the countdown, then a slim strip along the bottom. */
export default function KeyHints({ countdown, practice }: { countdown: boolean; practice: boolean }) {
  if (countdown) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-[16%] z-20 flex justify-center px-4">
        <div className="glass animate-rise w-full max-w-md space-y-2.5 !bg-[rgba(10,14,26,0.8)] p-4 text-left">
          <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-white/50">Keyboard controls</p>
          <div className="flex items-center gap-3">
            <span className="flex w-28 shrink-0 gap-1">
              <Key big>←</Key>
              <Key big>→</Key>
            </span>
            <span className="text-sm text-white/85">Steer <span className="text-white/45">(or A / D)</span></span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex w-28 shrink-0">
              <Key big>Space</Key>
            </span>
            <span className="text-sm text-white/85">
              <b>Hold in a bend to drift.</b> Let go to get a <b className="text-apple-pink">speed boost</b>. The longer the drift, the bigger the boost.
            </span>
          </div>
          {!practice && (
            <div className="flex items-center gap-3">
              <span className="flex w-28 shrink-0">
                <Key big>E</Key>
              </span>
              <span className="text-sm text-white/85">Use a pick-up <span className="text-white/45">(or Enter)</span></span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="flex w-28 shrink-0">
              <Key big>P</Key>
            </span>
            <span className="text-sm text-white/85">Pause <span className="text-white/45">(or Esc)</span></span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-pill bg-black/40 px-4 py-1.5 text-[11px] font-medium text-white/75 backdrop-blur-md">
        <span className="flex items-center gap-1.5">
          <Key>←</Key>
          <Key>→</Key> steer
        </span>
        <span className="flex items-center gap-1.5">
          <Key>Space</Key> hold to drift · <b className="text-apple-pink">release = boost</b>
        </span>
        {!practice && (
          <span className="flex items-center gap-1.5">
            <Key>E</Key> item
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Key>P</Key> pause
        </span>
      </div>
    </div>
  );
}
