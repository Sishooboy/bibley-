import { useEffect, useId, useState, type CSSProperties } from 'react';
import { reducedMotion } from '../lib/motion';

/**
 * The headline figure for a plan: a gold arc sweeping around a track. The sweep
 * is a stroke-dashoffset transition, so it costs one composited property and
 * nothing on the main thread.
 *
 * `tone` is which background it is sitting on, not a decoration: the default
 * track is white at 10%, which is invisible on paper, and the figure is gold,
 * which does not carry on cream either.
 */
export function StatRing({
  percent,
  label,
  sublabel,
  size = 168,
  tone = 'dark',
}: {
  percent: number;
  label: string;
  sublabel: string;
  size?: number;
  tone?: 'dark' | 'light';
}) {
  const [drawn, setDrawn] = useState(() => reducedMotion());
  // Two rings on one page would otherwise share a gradient id, and the first
  // one defined would quietly paint both.
  const gradientId = useId();

  useEffect(() => {
    if (drawn) return;
    // One frame of the empty ring first, otherwise there is nothing to sweep from.
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, [drawn]);

  const stroke = Math.max(7, Math.round(size * 0.071));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, percent));
  const offset = drawn ? c - (pct / 100) * c : c;

  return (
    <div
      className={`ring${tone === 'light' ? ' ring--light' : ''}`}
      style={{ '--ring-size': `${size}px` } as CSSProperties}
    >
      <svg
        className="ring__svg"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffd447" />
            <stop offset="55%" stopColor="#f7b801" />
            <stop offset="100%" stopColor="#e09a00" />
          </linearGradient>
        </defs>
        <circle
          className="ring__track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className="ring__arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring__center">
        <span className="ring__value">{label}</span>
        <span className="ring__label">{sublabel}</span>
      </div>
    </div>
  );
}
