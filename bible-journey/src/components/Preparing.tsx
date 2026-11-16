import { useEffect, useState } from 'react';
import { getTrack } from '../data/tracks';
import { formatNumber } from '../lib/format';

export const PREPARING_MS = 3200;

/**
 * The beat after choosing. The steps are real work the app is doing anyway:
 * laying out the plan, writing the choice, syncing it to the account. Showing
 * them makes a decision feel like it landed somewhere.
 */
export function Preparing({ trackId }: { trackId: string }) {
  const plan = getTrack(trackId);
  const [step, setStep] = useState(0);

  const steps = [
    // A mix's phases are only what it covers; what it lays out is the day.
    plan.kind === 'streams'
      ? `Setting out ${plan.streams.length} readings a day`
      : `Laying out ${plan.phases.length} phases`,
    `Ordering ${formatNumber(plan.chapterCount)} chapters`,
    'Saving your choice',
    'Ready',
  ];

  useEffect(() => {
    const timers = steps.map((_, i) =>
      setTimeout(() => setStep(i), (PREPARING_MS / steps.length) * i),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="splash preparing" role="status" aria-live="polite">
      <div className="splash__inner">
        <img className="splash__mark" src="/icon-192.png" width={88} height={88} alt="" />
        <p className="splash__word">{plan.label}</p>

        <div className="splash__barTrack">
          <div
            className="splash__bar splash__bar--timed"
            style={{ animationDuration: `${PREPARING_MS}ms` }}
          />
        </div>

        <ol className="preparing__steps">
          {steps.map((label, i) => (
            <li
              key={label}
              className={`preparing__step${i <= step ? ' preparing__step--done' : ''}`}
            >
              <span className="preparing__dot" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
