/** Small painted scenes for the world cards on the menu: a night skyline, a cloud sea at sunrise, a volcanic horizon. */
const WINDOWS = [3, 11, 19, 27, 35, 43, 51, 59, 67, 75];

function City() {
  const towers: [number, number, number][] = [
    [8, 26, 34],
    [34, 22, 52],
    [58, 18, 40],
    [80, 24, 62],
    [108, 20, 46],
    [132, 22, 70],
    [158, 18, 38],
    [180, 26, 56],
    [210, 20, 44],
    [234, 22, 64],
    [260, 24, 42],
  ];
  return (
    <>
      <circle cx="238" cy="22" r="13" fill="#ffe3f4" opacity="0.95" />
      <circle cx="238" cy="22" r="26" fill="#ff8ad8" opacity="0.18" />
      {towers.map(([x, w, h], i) => (
        <g key={i}>
          <rect x={x} y={90 - h} width={w} height={h} fill={i % 2 ? '#1a1c5e' : '#272a80'} />
          <rect x={x} y={90 - h} width={w} height="1.6" fill={i % 3 ? '#ff5fa2' : '#5ee0ff'} />
          {WINDOWS.slice(0, Math.floor(h / 9)).map((wy, j) =>
            [0, 1, 2].map((c) =>
              (i * 7 + j * 3 + c * 5) % 4 < 2 ? <rect key={`${j}-${c}`} x={x + 4 + c * (w / 3.4)} y={90 - h + wy} width="3" height="3.4" fill={(i + j + c) % 3 ? '#ffe9a8' : '#9be9ff'} opacity="0.8" /> : null,
            ),
          )}
        </g>
      ))}
      <rect x="0" y="86" width="300" height="4" fill="#ff5fa2" opacity="0.55" />
    </>
  );
}

function Sky() {
  return (
    <>
      <circle cx="150" cy="84" r="46" fill="#ffb3e6" opacity="0.35" />
      <path d="M118 90a32 32 0 0 1 64 0z" fill="#fff0c8" />
      {[
        [20, 80, 16],
        [48, 84, 20],
        [96, 86, 18],
        [208, 84, 22],
        [244, 80, 16],
        [276, 86, 20],
      ].map(([x, y, r], i) => (
        <g key={i} fill={i % 2 ? '#ffd9f5' : '#fff0fb'}>
          <circle cx={x} cy={y} r={r} />
          <circle cx={x + r * 0.9} cy={y + 3} r={r * 0.75} />
          <circle cx={x - r * 0.85} cy={y + 4} r={r * 0.65} />
        </g>
      ))}
      <g transform="translate(228 28)">
        <ellipse cx="0" cy="0" rx="11" ry="13" fill="#ff5fa2" />
        <ellipse cx="0" cy="0" rx="7" ry="13" fill="#ffd60a" />
        <ellipse cx="0" cy="0" rx="3" ry="13" fill="#5ee0ff" />
        <rect x="-3.5" y="17" width="7" height="5" fill="#7a4a2a" />
      </g>
      <path d="M40 50l26 0-8 10h-10z" fill="#5a3fb0" />
      <ellipse cx="53" cy="49" rx="13" ry="3" fill="#7af0c8" />
      <path d="M53 38l4 10h-8z" fill="#ff8ad8" />
    </>
  );
}

function Volcano() {
  return (
    <>
      <circle cx="150" cy="40" r="30" fill="#ff7a1a" opacity="0.35" />
      <path d="M70 90L132 28h36l62 62z" fill="#2a0c06" />
      <path d="M0 90L40 52l30 38z" fill="#1a0705" />
      <path d="M232 90l30-34 38 34z" fill="#1a0705" />
      <rect x="132" y="27" width="36" height="3" fill="#ffb347" />
      <path d="M146 28l8 0 18 62-14 0z" fill="#ff8a2a" opacity="0.9" />
      {[40, 90, 130, 188, 214, 252].map((x, i) => (
        <circle key={i} cx={x} cy={20 + ((i * 17) % 40)} r="1.6" fill="#ffd27a" opacity="0.85" />
      ))}
      <rect x="0" y="85" width="300" height="5" fill="#ff6a1a" opacity="0.75" />
    </>
  );
}

function Desert() {
  return (
    <>
      <circle cx="248" cy="22" r="22" fill="#fff6d0" opacity="0.55" />
      <circle cx="248" cy="22" r="10" fill="#ffffff" />
      {[
        [20, 150, 2.4],
        [200, 130, 1.8],
        [60, 120, 1.2],
      ].map(([x, y, s], i) => (
        <g key={i} fill="#ffffff" opacity="0.95">
          <circle cx={x} cy={y / 5} r={7 * s} />
          <circle cx={x + 8 * s} cy={y / 5 + 2} r={5.5 * s} />
          <circle cx={x - 7 * s} cy={y / 5 + 3} r={5 * s} />
        </g>
      ))}
      <path d="M0 90L30 50h26l26 40z" fill="#d98f58" />
      <path d="M90 90L112 38h12l6-8h28l6 8h12l22 52z" fill="#c4703c" />
      <path d="M210 90l18-34h30l22 34z" fill="#d98f58" />
      <path d="M96 56h92M118 70h60" stroke="rgba(110,45,25,0.4)" strokeWidth="2" />
      <rect x="0" y="78" width="300" height="12" fill="#e3a066" />
      <path d="M0 86h300" stroke="#5a5e66" strokeWidth="6" />
      <path d="M0 86h300" stroke="#f4c430" strokeWidth="1.2" strokeDasharray="10 8" />
      <g fill="#3f9a4a">
        <rect x="262" y="52" width="6" height="28" rx="3" />
        <rect x="254" y="60" width="4" height="10" rx="2" />
        <rect x="272" y="56" width="4" height="12" rx="2" />
      </g>
    </>
  );
}

function Storm() {
  return (
    <>
      <path d="M0 90L34 40l14 14 20-34 22 40 16-14 30 44z" fill="#2c3a55" />
      <path d="M120 90l36-52 12 14 22-36 26 50 14-12 36 36z" fill="#222f48" />
      <path d="M210 90l30-30 20 12 40-38v56z" fill="#1a2438" />
      <path d="M34 40l6 8-6-2-4 4zM164 54l8-16 8 12z" fill="#e9f1ff" opacity="0.85" />
      {[40, 110, 180, 250].map((x, i) => (
        <g key={i} fill="#3d4a63">
          <circle cx={x} cy={10 + (i % 2) * 8} r="22" />
          <circle cx={x + 18} cy={16 + (i % 2) * 8} r="16" />
          <circle cx={x - 16} cy={18 + (i % 2) * 8} r="15" />
        </g>
      ))}
      <path d="M156 4l-14 28h12l-10 26 22-34h-12z" fill="#fff3a8" />
      <rect x="0" y="78" width="300" height="12" fill="#101a2b" />
      <path d="M0 84h300" stroke="#ffd60a" strokeWidth="3" strokeDasharray="12 8" />
      <g stroke="#9fb4d6" strokeWidth="0.8" opacity="0.7">
        {Array.from({ length: 28 }, (_, i) => (
          <path key={i} d={`M${i * 11 + 4} ${(i * 13) % 50}l-6 14`} />
        ))}
      </g>
      <g transform="translate(262 40)">
        <path d="M-5 38l3-26h4l3 26z" fill="#eef2f8" />
        <rect x="-4" y="22" width="8" height="5" fill="#d83a3a" />
        <rect x="-3" y="8" width="6" height="5" fill="#ffd9a0" />
      </g>
    </>
  );
}

export default function WorldArt({ world, dim = false }: { world: number; dim?: boolean }) {
  return (
    <svg viewBox="0 0 300 90" preserveAspectRatio="xMidYMax slice" aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-0 h-[60px] w-full ${dim ? 'opacity-25 grayscale' : 'opacity-90'}`} style={{ maskImage: 'linear-gradient(to top, black 55%, transparent)', WebkitMaskImage: 'linear-gradient(to top, black 55%, transparent)' }}>
      {world === 1 ? <City /> : world === 2 ? <Sky /> : world === 3 ? <Volcano /> : world === 4 ? <Desert /> : <Storm />}
    </svg>
  );
}
