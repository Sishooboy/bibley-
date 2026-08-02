import { useEffect, useState } from 'react';
import { reducedMotion } from '../lib/motion';

const SIZE = 168;
const STROKE = 12;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/**
 * The headline figure for a plan: a gold arc sweeping around a red track. The
 * sweep is a stroke-dashoffset transition, so it costs one composited property
 * and nothing on the main thread.
 */
export function StatRing({
  percent,
  label,
  sublabel,
}: {
  percent: number;
  label: string;
  sublabel: string;
}) {
  const [drawn, setDrawn] = useState(() => reducedMotion());

  useEffect(() => {
    if (drawn) return;
    // One frame of the empty ring first, otherwise there is nothing to sweep from.
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, [drawn]);

  const pct = Math.max(0, Math.min(100, percent));
  const offset = drawn ? C - (pct / 100) * C : C;

  return (
    <div className="ring">
      <svg
        className="ring__svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ringGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffd447" />
            <stop offset="55%" stopColor="#f7b801" />
            <stop offset="100%" stopColor="#e09a00" />
          </linearGradient>
        </defs>
        <circle
          className="ring__track"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          strokeWidth={STROKE}
          fill="none"
        />
        <circle
          className="ring__arc"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          strokeWidth={STROKE}
          fill="none"
          stroke="url(#ringGold)"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <div className="ring__center">
        <span className="ring__value">{label}</span>
        <span className="ring__label">{sublabel}</span>
      </div>
    </div>
  );
}
