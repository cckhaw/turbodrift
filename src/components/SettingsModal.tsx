import { useState } from 'react';
import { Check, Cloud, Copy, Trash2, X } from 'lucide-react';
import { synth } from '../audio/synth';
import { disableCloud, enableCloud, formatCode, getSyncCode, restoreFromCode } from '../utils/cloud';
import { globalEnabled } from '../utils/api';
import { copyText } from '../utils/share';
import { hapticsEnabled, hapticsSupported, setHaptics } from '../utils/haptics';
import { getPlayerName, setPlayerName } from '../utils/leaderboard';
import { resetProgress, type Progress } from '../utils/progress';
import { loadSettings, saveSettings, type Settings } from '../utils/settings';

interface Props {
  muted: boolean;
  onMute: () => void;
  onProgress: (p: Progress) => void;
  onClose: () => void;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[15px] font-medium">{label}</p>
        {hint && <p className="text-xs text-white/45">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-7 w-12 shrink-0 rounded-pill transition ${on ? 'bg-apple-green' : 'bg-white/20'}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function Slider({ value, min, max, step, onChange, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string }) {
  return <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="h-1.5 w-36 shrink-0 accent-apple-blue" />;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-4">
    <h3 className="px-1 text-xs font-semibold uppercase tracking-widest text-white/45">{title}</h3>
    <div className="mt-1 divide-y divide-white/10 rounded-2xl bg-white/[0.05] px-4">{children}</div>
  </section>
);

export default function SettingsModal({ muted, onMute, onProgress, onClose }: Props) {
  const [s, setS] = useState<Settings>(loadSettings);
  const [name, setName] = useState(getPlayerName());
  const [haptics, setHapticsState] = useState(hapticsEnabled());
  const [code, setCode] = useState<string | null>(getSyncCode());
  const [restore, setRestore] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const cloudOk = globalEnabled();

  const update = (patch: Partial<Settings>) => {
    const next = saveSettings(patch);
    setS(next);
    synth.setVolumes(next.music, next.sfx);
  };

  const turnOn = async () => {
    setBusy(true);
    setMsg(null);
    const r = await enableCloud();
    setBusy(false);
    if (r) setCode(r.code);
    else setMsg('Couldn’t reach the server. Try again when you’re online.');
  };

  const doRestore = async () => {
    setBusy(true);
    setMsg(null);
    const r = await restoreFromCode(restore);
    setBusy(false);
    if (r.result === 'ok' && r.progress) {
      onProgress(r.progress);
      setCode(getSyncCode());
      setName(getPlayerName());
      setRestore('');
      setMsg('Progress restored.');
    } else setMsg(r.result === 'notfound' ? 'That code doesn’t match a save.' : 'Couldn’t reach the server. Try again when you’re online.');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-3 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Settings">
      <div className="glass animate-rise flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden !bg-[rgba(20,26,42,0.88)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 className="text-xl font-bold tracking-tight">Settings</h2>
          <button aria-label="Close" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-pill bg-glass-strong active:scale-95">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-5">
          <Section title="Audio">
            <Row label="Sound">
              <Toggle on={!muted} onChange={onMute} label="Sound" />
            </Row>
            <Row label="Music">
              <Slider label="Music volume" value={s.music} min={0} max={1} step={0.05} onChange={(v) => update({ music: v })} />
            </Row>
            <Row label="Effects">
              <Slider label="Effects volume" value={s.sfx} min={0} max={1} step={0.05} onChange={(v) => update({ sfx: v })} />
            </Row>
          </Section>

          <Section title="Controls">
            <Row label="Steering sensitivity" hint="How far to drag for full lock">
              <Slider label="Steering sensitivity" value={160 - s.steerRange} min={40} max={120} step={5} onChange={(v) => update({ steerRange: 160 - v })} />
            </Row>
            {hapticsSupported() && (
              <Row label="Vibration" hint="Drift levels, boosts, hits">
                <Toggle
                  on={haptics}
                  label="Vibration"
                  onChange={(v) => {
                    setHaptics(v);
                    setHapticsState(v);
                  }}
                />
              </Row>
            )}
          </Section>

          <Section title="Graphics">
            <Row label="Battery saver" hint="Lower resolution for smoother play on older phones">
              <Toggle on={s.quality === 'low'} label="Battery saver" onChange={(v) => update({ quality: v ? 'low' : 'high' })} />
            </Row>
            <Row label="Screen shake">
              <Toggle on={s.shake} label="Screen shake" onChange={(v) => update({ shake: v })} />
            </Row>
          </Section>

          <Section title="Profile">
            <Row label="Name" hint="Shown on the leaderboard">
              <input
                aria-label="Your name"
                maxLength={12}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setPlayerName(e.target.value);
                }}
                className="w-32 rounded-pill border border-glass-border bg-black/30 px-4 py-2 text-sm outline-none focus:border-apple-blue"
              />
            </Row>
          </Section>

          <Section title="Cloud save">
            <div className="py-3">
              <p className="flex items-center gap-2 text-[15px] font-medium">
                <Cloud size={16} className="text-apple-blue" /> Keep world unlocks on every device
              </p>
              {!cloudOk && <p className="mt-1 text-xs text-white/45">Not available while running locally.</p>}
              {cloudOk && !code && (
                <>
                  <p className="mt-1 text-xs text-white/45">No account needed. You get a code you can enter on another device.</p>
                  <button disabled={busy} onClick={turnOn} className="btn-primary mt-3 w-full !py-2.5 text-sm disabled:opacity-50">
                    Turn on cloud save
                  </button>
                </>
              )}
              {cloudOk && code && (
                <>
                  <p className="mt-1 text-xs text-white/45">Your sync code (keep it private, it opens your save):</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 rounded-xl bg-black/30 px-3 py-2.5 text-center font-mono text-lg tracking-wider">{formatCode(code)}</code>
                    <button
                      aria-label="Copy sync code"
                      className="btn-glass !p-3"
                      onClick={async () => {
                        if (await copyText(code)) {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        }
                      }}
                    >
                      {copied ? <Check size={18} className="text-apple-green" /> : <Copy size={18} />}
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      disableCloud();
                      setCode(null);
                    }}
                    className="mt-2 text-xs text-white/50 underline"
                  >
                    Stop syncing on this device
                  </button>
                </>
              )}
              {cloudOk && (
                <div className="mt-4 border-t border-white/10 pt-3">
                  <p className="text-xs text-white/45">Have a code from another device?</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      aria-label="Sync code"
                      placeholder="XXXX-XXXX-XXXX"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      value={restore}
                      onChange={(e) => setRestore(e.target.value)}
                      className="min-w-0 flex-1 rounded-xl border border-glass-border bg-black/30 px-3 py-2.5 font-mono text-sm uppercase tracking-wider outline-none focus:border-apple-blue"
                    />
                    <button disabled={busy || restore.replace(/[\s-]/g, '').length < 12} onClick={doRestore} className="btn-glass !px-4 !py-2.5 text-sm disabled:opacity-40">
                      Restore
                    </button>
                  </div>
                </div>
              )}
              {msg && (
                <p className="mt-2 text-xs text-apple-yellow" role="status">
                  {msg}
                </p>
              )}
            </div>
          </Section>

          <Section title="Data">
            <div className="py-3">
              {!confirmReset ? (
                <button onClick={() => setConfirmReset(true)} className="flex items-center gap-2 text-sm font-medium text-apple-pink">
                  <Trash2 size={16} /> Reset progress on this device
                </button>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-white/60">Locks worlds 2 and 3 again and clears medals here. Your cloud save, if any, keeps its progress.</p>
                  <div className="flex shrink-0 gap-2">
                    <button className="btn-glass !px-3 !py-2 text-xs" onClick={() => setConfirmReset(false)}>
                      Cancel
                    </button>
                    <button
                      className="btn-hot !px-3 !py-2 text-xs"
                      onClick={() => {
                        resetProgress();
                        disableCloud();
                        setCode(null);
                        onProgress({ unlocked: 1, medals: {} });
                        setConfirmReset(false);
                        setMsg('Progress reset on this device.');
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Section>

          <p className="mt-4 text-center text-[11px] text-white/35">Quality and screen-shake changes apply from the next race.</p>
        </div>
      </div>
    </div>
  );
}
