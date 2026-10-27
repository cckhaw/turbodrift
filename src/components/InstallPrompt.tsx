import { useEffect, useState } from 'react';
import { MoreVertical, PlusSquare, Share, X } from 'lucide-react';
import { canPromptInstall, currentPlatform, neverRemind, onInstallChange, promptInstall, snoozeInstall } from '../utils/install';

interface Props {
  onClose: () => void;
}

/** A bottom sheet that shows how to add the game to the home screen: Share → Add to Home Screen on iOS, the install prompt (or menu) on Android. */
export default function InstallPrompt({ onClose }: Props) {
  const platform = currentPlatform();
  const [native, setNative] = useState(canPromptInstall());
  useEffect(() => onInstallChange(() => setNative(canPromptInstall())), []);

  const later = () => {
    snoozeInstall();
    onClose();
  };
  const never = () => {
    neverRemind();
    onClose();
  };
  const install = async () => {
    const ok = await promptInstall();
    if (ok) onClose();
    else later();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" role="dialog" aria-modal="true" aria-label="Add to home screen" onClick={later}>
      <div className="glass animate-rise relative w-full max-w-md space-y-3 !bg-[rgba(16,22,38,0.94)] p-5" onClick={(e) => e.stopPropagation()}>
        <button aria-label="Close" onClick={later} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-pill bg-white/10 active:scale-95">
          <X size={16} />
        </button>
        <div className="flex items-center gap-3 pr-8">
          <img src="/icon-192.png" alt="" className="h-14 w-14 rounded-2xl shadow-neon-blue" />
          <div>
            <h2 className="text-lg font-bold leading-tight tracking-tight">Play it like an app</h2>
            <p className="text-sm text-white/65">Add Turbo Drift to your home screen: full screen, no browser bars, works offline.</p>
          </div>
        </div>

        {platform === 'ios' && (
          <ol className="space-y-2 rounded-2xl bg-white/[0.06] p-3 text-[15px]">
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-apple-blue/25 text-apple-blue">
                <Share size={20} />
              </span>
              <span>
                Tap the <b>Share</b> button in Safari’s toolbar
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-apple-blue/25 text-apple-blue">
                <PlusSquare size={20} />
              </span>
              <span>
                Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>
              </span>
            </li>
          </ol>
        )}

        {platform === 'android' && !native && (
          <ol className="space-y-2 rounded-2xl bg-white/[0.06] p-3 text-[15px]">
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-apple-blue/25 text-apple-blue">
                <MoreVertical size={20} />
              </span>
              <span>
                Open the browser menu (<b>⋮</b>)
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-apple-blue/25 text-apple-blue">
                <PlusSquare size={20} />
              </span>
              <span>
                Tap <b>Install app</b> or <b>Add to Home screen</b>
              </span>
            </li>
          </ol>
        )}

        {platform === 'android' && native ? (
          <button onClick={install} className="btn-primary w-full">
            Install the app
          </button>
        ) : (
          <button onClick={later} className="btn-primary w-full">
            Got it
          </button>
        )}
        <div className="flex items-center justify-between px-1 text-sm">
          <button onClick={later} className="text-white/60 active:text-white">
            Maybe later
          </button>
          <button onClick={never} className="text-white/40 active:text-white/70">
            Don’t show again
          </button>
        </div>
      </div>
    </div>
  );
}
