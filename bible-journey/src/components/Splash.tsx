import { useEffect, useState } from 'react';
import { quoteForDay } from '../lib/quote';

/** Long enough to feel like an arrival, short enough not to be in the way. */
export const SPLASH_MS = 2200;

/**
 * Shown while a session is being restored, and held for a beat after signing in.
 * The progress bar is honest about its duration rather than spinning forever.
 */
export function Splash({ held }: { held: boolean }) {
  const [line, setLine] = useState(false);
  const quote = quoteForDay();

  useEffect(() => {
    const timer = setTimeout(() => setLine(true), 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="splash" role="status" aria-live="polite">
      <div className="splash__inner">
        <img className="splash__mark" src="/icon-192.png" width={88} height={88} alt="" />
        <p className="splash__word">Bibley</p>

        <div className="splash__barTrack">
          <div
            className={`splash__bar${held ? ' splash__bar--timed' : ''}`}
            style={held ? { animationDuration: `${SPLASH_MS}ms` } : undefined}
          />
        </div>

        <p className={`splash__quote${line ? ' splash__quote--in' : ''}`}>
          {quote.text}
          <span className="splash__ref">{quote.ref}</span>
        </p>
      </div>
    </div>
  );
}
