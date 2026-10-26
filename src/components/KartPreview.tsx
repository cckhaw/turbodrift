import { useEffect, useRef } from 'react';
import { drawKart } from '../game/draw';
import type { KartSpec } from '../game/karts';

/** Tiny static render of a kart, drawn with the same routine as the race. */
export default function KartPreview({ kart }: { kart: KartSpec }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    drawKart(ctx, c.width / 2, c.height * 0.88, c.width * 0.62, kart.color, kart.accent, { tilt: 0, drift: 0, boost: false, flicker: 0, fall: 0, blink: false, shape: kart.id as 'comet' | 'rocket' | 'phantom' });
  }, [kart]);
  return <canvas ref={ref} width={200} height={130} className="mx-auto mb-1 h-[54px] w-[84px]" aria-hidden />;
}
