import { useState } from 'react';
import { Check } from 'lucide-react';
import { getPlayerName, hasChosenName, renamePlayer } from '../utils/leaderboard';

interface Props {
  /** called with the saved name once it has been applied everywhere */
  onSaved?: (name: string) => void;
  className?: string;
}

/** The leaderboard name: type it, press Enter or tap Save, and every score you've posted takes it. */
export default function NameField({ onSaved, className = '' }: Props) {
  const [name, setName] = useState(hasChosenName() ? getPlayerName() : '');
  const [saved, setSaved] = useState(hasChosenName() ? getPlayerName() : '');
  const [busy, setBusy] = useState(false);
  const clean = name.trim();
  const dirty = clean !== saved;

  const save = async () => {
    if (!clean || !dirty || busy) return;
    setBusy(true);
    const n = await renamePlayer(clean);
    setName(n);
    setSaved(n);
    setBusy(false);
    onSaved?.(n);
  };

  return (
    <form
      className={`flex items-center gap-2 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <input
        aria-label="Your leaderboard name"
        placeholder="Your name"
        maxLength={12}
        autoComplete="nickname"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void save()}
        className="min-w-0 flex-1 rounded-pill border border-glass-border bg-black/30 px-4 py-2.5 text-sm outline-none focus:border-apple-blue"
      />
      <button type="submit" disabled={!clean || !dirty || busy} className="btn-glass flex shrink-0 items-center gap-1.5 !px-4 !py-2.5 text-sm disabled:opacity-40">
        {!dirty && clean ? <Check size={16} /> : null}
        {!dirty && clean ? 'Saved' : 'Save'}
      </button>
    </form>
  );
}
