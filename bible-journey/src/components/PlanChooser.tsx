import { useState } from 'react';
import { PLANS, PLAN_ORDER, type PlanId } from '../data/plans';
import { formatNumber, plural } from '../lib/format';
import { CrossWatermark } from './Ornament';

/** Rough sizing so the choice is made with the commitment in view. */
function weeksAt(chapters: number, perDay: number): number {
  return Math.round(chapters / perDay / 7);
}

export function PlanChooser({ onChoose }: { onChoose: (id: PlanId) => void }) {
  const [selected, setSelected] = useState<PlanId | null>(null);

  return (
    <div className="chooser">
      {/* Behind everything, and off the edge, the way the mastheads carry their
          rings. It is the only thing on this screen that is not a word. */}
      <CrossWatermark className="chooser__watermark" />

      <div className="chooser__inner">
        <img
          className="chooser__mark"
          src="/icon-192.png"
          width={64}
          height={64}
          alt=""
          decoding="async"
        />
        <p className="eyebrow eyebrow--onDark">Before you start</p>
        <h1 className="chooser__title">Where are you reading?</h1>
        <p className="chooser__lede">
          Each option is a complete path with its own order and its own reasoning. You can switch
          later without losing a single chapter, since progress is kept per book.
        </p>

        <div className="chooser__grid" role="radiogroup" aria-label="Choose a reading plan">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            const active = selected === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`planCard${active ? ' planCard--active' : ''}`}
                onClick={() => setSelected(id)}
              >
                <span className="planCard__head">
                  <span className="planCard__name">{plan.label}</span>
                  <span className="planCard__count">
                    {plural(plan.bookCount, 'book')} · {formatNumber(plan.chapterCount)} chapters
                  </span>
                </span>
                <span className="planCard__blurb">{plan.blurb}</span>
                <span className="planCard__meta">
                  {plan.phases.length} phases · about {weeksAt(plan.chapterCount, 3)} weeks at 3
                  chapters a day
                </span>
              </button>
            );
          })}
        </div>

        {selected && (
          <p className="chooser__why">
            <b>Why this order:</b> {PLANS[selected].rationale}
          </p>
        )}

        <button
          type="button"
          className="btn btn--primary chooser__start"
          disabled={!selected}
          onClick={() => selected && onChoose(selected)}
        >
          {selected ? `Begin ${PLANS[selected].label}` : 'Pick a path to begin'}
        </button>
      </div>
    </div>
  );
}
