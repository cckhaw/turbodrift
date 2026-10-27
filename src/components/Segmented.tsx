/** A pill-shaped single-choice control (laps, boards, settings). */
interface Props<T extends string | number> {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}

export default function Segmented<T extends string | number>({ options, value, onChange, label, className = '' }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex rounded-pill bg-black/30 p-0.5 text-xs font-semibold ${className}`}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={`flex-1 whitespace-nowrap rounded-pill px-3 py-1.5 transition ${value === o.value ? 'bg-apple-blue text-white' : 'text-white/60'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
