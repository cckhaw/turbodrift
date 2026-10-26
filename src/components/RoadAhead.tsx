import { useMemo } from 'react';
import { bendLabel, M_PER_SEG, type Ahead, type AheadMark, type Bend } from '../game/lookahead';

interface Props {
  ahead: Ahead;
  hairpinTrack: boolean;
  /** just the bend call-out, no road picture */
  chipOnly?: boolean;
}

const SEVERITY_COLOR = ['', '#ffffff', '#ffd60a', '#ff2d55'];
const RIBBON_STEP = 4; // segments per ribbon sample (matches lookahead.ts)
const SCALE = 2.6; // viewBox units per ribbon unit

const dist = (m: number) => (m <= 0 ? 'NOW' : `${Math.max(10, Math.round(m / 10) * 10)} m`);

function Chevrons({ b }: { b: Bend }) {
  const glyph = b.dir < 0 ? '‹' : '›';
  return (
    <span className="font-black leading-none tracking-[-0.18em]" style={{ color: SEVERITY_COLOR[b.severity], fontSize: 20 }}>
      {glyph.repeat(b.severity)}
    </span>
  );
}

/** A GPS-style view of the road in front of you: the bends, plus boost pads, item boxes and hazards. */
export default function RoadAhead({ ahead, hairpinTrack, chipOnly = false }: Props) {
  const { bend, then } = ahead;
  const pts = useMemo(() => ahead.ribbon.map(([x, y]) => [50 + x * SCALE, 62 + y * SCALE] as const), [ahead.ribbon]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const markAt = (m: AheadMark) => {
    const f = m.distM / (M_PER_SEG * RIBBON_STEP);
    const i = Math.min(Math.floor(f), pts.length - 2);
    if (i < 0) return null;
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const u = f - i;
    const x = ax + (bx - ax) * u;
    const y = ay + (by - ay) * u;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const lateral = m.lane * 3.4; // across the road
    return { x: x + (-(by - ay) / len) * -lateral, y: y + ((bx - ax) / len) * -lateral };
  };

  return (
    <div className="glass !rounded-2xl p-1.5" aria-label="Road ahead">
      {!chipOnly && (
        <svg viewBox="0 0 100 70" className="block h-[82px] w-[118px] overflow-hidden rounded-xl bg-black/25">
          <polyline points={line} fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth="9.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={line} fill="none" stroke="#3b4668" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={line} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" strokeDasharray="2.2 2.6" strokeLinejoin="round" />
          {ahead.marks.map((m, i) => {
            const p = markAt(m);
            if (!p) return null;
            if (m.kind === 'pad') return <rect key={i} x={p.x - 2.6} y={p.y - 1.5} width="5.2" height="3" rx="0.8" fill="#ffd60a" />;
            if (m.kind === 'box') return <rect key={i} x={p.x - 2.2} y={p.y - 2.2} width="4.4" height="4.4" fill="#ff9f0a" stroke="#fff" strokeWidth="0.7" transform={`rotate(45 ${p.x} ${p.y})`} />;
            if (m.kind === 'wind') return <circle key={i} cx={p.x} cy={p.y} r="2.8" fill="none" stroke="#5ac8fa" strokeWidth="1.2" />;
            return <rect key={i} x={p.x - 2.2} y={p.y - 2.2} width="4.4" height="4.4" fill="#ff2d55" />;
          })}
          {/* you */}
          <path d="M50 62 L45.5 69 L50 66.6 L54.5 69 Z" fill="#fff" stroke="#007aff" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      )}

      <div className={`flex items-center gap-1.5 px-0.5 ${chipOnly ? '' : 'mt-1'}`}>
        {bend ? (
          <>
            <Chevrons b={bend} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[11px] font-bold" style={{ color: SEVERITY_COLOR[bend.severity] }}>
                {bendLabel(bend, hairpinTrack)}
              </p>
              <p className="truncate text-[10px] font-medium text-white/60">
                {bend.inside ? 'in it now' : `in ${dist(bend.distM)}`}
                {then && ` · then ${then.dir < 0 ? 'left' : 'right'}`}
              </p>
            </div>
          </>
        ) : (
          <p className="px-1 text-[11px] font-semibold text-white/60">Straight ahead</p>
        )}
      </div>
    </div>
  );
}
