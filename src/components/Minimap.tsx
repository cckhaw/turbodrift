import { useMemo } from 'react';
import { closedPath, declutter, labelColor, pathBetween, pointAt, type MapMark, type TrackMap } from '../game/minimap';
import type { HudSnapshot } from '../game/types';

interface Props {
  map: TrackMap;
  racers: HudSnapshot['racers'];
  marks?: MapMark[];
  compact?: boolean;
}

/** The whole lap from above. Every kart is a coloured dot with its race position inside; yours glows. */
export default function Minimap({ map, racers, marks = [], compact = false }: Props) {
  const outline = useMemo(() => closedPath(map), [map]);
  const me = racers.find((r) => r.you);
  const spots = useMemo(() => declutter(map, racers, compact ? 9 : 7.5), [map, racers, compact]);
  const ahead = me ? pathBetween(map, me.t, me.t + 0.16) : null;

  // start/finish line: a short dashed bar across the track at the first point
  const [x0, y0] = map.pts[0];
  const [x1, y1] = map.pts[1];
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;

  // leader on top of the pack, you on top of everyone, ghost underneath
  const order = [...racers].sort((a, b) => (a.ghost ? -1 : b.ghost ? 1 : a.you ? 1 : b.you ? -1 : b.pos - a.pos));

  return (
    <div className="glass !rounded-2xl p-1.5" aria-label="Track map">
      <svg viewBox="0 0 100 100" className={`block overflow-visible ${compact ? 'h-[84px] w-[84px]' : 'h-[118px] w-[118px]'}`}>
        <path d={outline} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="8" strokeLinejoin="round" />
        <path d={outline} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="4.6" strokeLinejoin="round" />
        {ahead && <path d={ahead} fill="none" stroke="#5ac8fa" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />}
        <line x1={x0 - nx * 5} y1={y0 - ny * 5} x2={x0 + nx * 5} y2={y0 + ny * 5} stroke="#fff" strokeWidth="2.4" strokeDasharray="1.6 1.6" />

        {marks.map((m, i) => {
          const [x, y] = pointAt(map, m.t);
          return m.kind === 'pad' ? (
            <rect key={i} x={x - 2.4} y={y - 1.2} width="4.8" height="2.4" rx="0.6" fill="#ffd60a" opacity="0.9" />
          ) : (
            <rect key={i} x={x - 1.7} y={y - 1.7} width="3.4" height="3.4" fill="#ff9f0a" opacity="0.95" transform={`rotate(45 ${x} ${y})`} />
          );
        })}

        {order.map((r) => {
          const [x, y] = spots.get(r.id) ?? [0, 0];
          const radius = r.you ? 7.4 : 6.2;
          const fill = r.ghost ? 'rgba(255,255,255,0.12)' : r.color;
          return (
            <g key={r.id} style={{ transform: `translate(${x}px, ${y}px)`, transition: 'transform 110ms linear' }}>
              {r.you && (
                <>
                  <circle r={12} fill={r.color} opacity="0.35" className="animate-halo" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
                  <circle r={9.5} fill={r.color} opacity="0.45" />
                </>
              )}
              <circle
                r={radius}
                fill={fill}
                stroke={r.you ? '#ffffff' : r.pos === 1 ? '#ffd60a' : r.ghost ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'}
                strokeWidth={r.you ? 1.9 : r.pos === 1 ? 1.7 : 1}
                strokeDasharray={r.ghost ? '1.6 1.4' : undefined}
                style={r.you ? { filter: `drop-shadow(0 0 3px ${r.color}) drop-shadow(0 0 6px ${r.color})` } : undefined}
              />
              <text y="0.5" textAnchor="middle" dominantBaseline="central" fontSize={r.you ? 8.6 : 7.4} fontWeight="800" fill={r.ghost ? '#fff' : labelColor(r.color)} style={{ fontFamily: '-apple-system, system-ui, sans-serif' }}>
                {r.ghost ? 'G' : r.pos}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
