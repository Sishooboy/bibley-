import { useMemo, useState } from 'react';
import {
  TESTAMENTS,
  TESTAMENT_LABELS,
  TESTAMENT_TOTALS,
  recommendedFor,
  tracksFor,
  type PhasedTrack,
  type TestamentId,
} from '../data/tracks';
import { formatNumber, plural } from '../lib/format';
import { CrossWatermark } from './Ornament';

/**
 * What each testament is, in one line.
 *
 * The track data says what an *order* is for and never what the testament is,
 * because it assumes you already chose. On the first screen after signing in
 * that assumption does not hold.
 */
const TESTAMENT_BLURB: Record<TestamentId, string> = {
  both: 'Genesis through to Revelation, the whole thing as one path.',
  old: 'The covenant, the kingdom and the prophets. Where the story starts.',
  new: 'The gospels, the young church and the letters. Where it arrives.',
};

/** Rough sizing so the choice is made with the commitment in view. */
function weeksAt(chapters: number, perDay: number): number {
  return Math.round(chapters / perDay / 7);
}

/**
 * Testament first, then the order within it.
 *
 * Nine orders on one screen is not a choice, it is a wall, and on a phone it is
 * a wall you have to scroll. Splitting it also matches how the question is
 * actually asked: nobody wants "Chronological", they want the Old Testament and
 * then they want to know what the options are for reading it.
 */
export function PlanChooser({ onChoose }: { onChoose: (id: string) => void }) {
  const [testament, setTestament] = useState<TestamentId | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  /*
   * Phased only. The streams track, Daily Mix, has no code path yet and
   * `activeTrack` quietly falls back to the default for one, so offering it
   * here would start the reader on something other than what they picked.
   */
  const options = useMemo(
    () =>
      testament
        ? (tracksFor(testament).filter((t) => t.kind === 'phased') as PhasedTrack[])
        : [],
    [testament],
  );
  const chosen = options.find((t) => t.id === selected) ?? null;

  const open = (id: TestamentId) => {
    setTestament(id);
    // The recommended one is already selected, so Begin is reachable in one tap
    // and the reader who does not want to compare anything never has to.
    setSelected(recommendedFor(id).id);
  };

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

        {!testament ? (
          <>
            <p className="eyebrow eyebrow--onDark">Before you start</p>
            <h1 className="chooser__title">Where are you reading?</h1>
            <p className="chooser__lede">
              Pick how much of the Bible you are taking on. You can switch later without losing a
              single chapter, since progress is kept per book.
            </p>

            <div className="chooser__grid" role="list">
              {TESTAMENTS.map((id) => {
                const total = TESTAMENT_TOTALS[id];
                const ways = tracksFor(id).filter((t) => t.kind === 'phased').length;
                return (
                  <button
                    key={id}
                    type="button"
                    role="listitem"
                    className="planCard"
                    onClick={() => open(id)}
                  >
                    <span className="planCard__head">
                      <span className="planCard__name">{TESTAMENT_LABELS[id]}</span>
                      <span className="planCard__count">
                        {plural(total.books, 'book')} · {formatNumber(total.chapters)} chapters
                      </span>
                    </span>
                    <span className="planCard__blurb">{TESTAMENT_BLURB[id]}</span>
                    <span className="planCard__meta">
                      {plural(ways, 'way')} to read it · about {weeksAt(total.chapters, 3)} weeks at
                      3 chapters a day
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className="chooser__back"
              onClick={() => {
                setTestament(null);
                setSelected(null);
              }}
            >
              Back to all three
            </button>

            <p className="eyebrow eyebrow--onDark">{TESTAMENT_LABELS[testament]}</p>
            <h1 className="chooser__title">In what order?</h1>
            <p className="chooser__lede">
              Same books either way. The difference is which one you meet first, and every option
              here is a complete path.
            </p>

            <div className="chooser__grid" role="radiogroup" aria-label="Choose a reading order">
              {options.map((track) => {
                const active = selected === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`planCard${active ? ' planCard--active' : ''}`}
                    onClick={() => setSelected(track.id)}
                  >
                    <span className="planCard__head">
                      <span className="planCard__name">
                        {track.label}
                        {track.recommended && <span className="planCard__rec">Suggested</span>}
                      </span>
                      <span className="planCard__count">
                        {plural(track.phases.length, 'phase')}
                      </span>
                    </span>
                    <span className="planCard__blurb">{track.tagline}</span>
                  </button>
                );
              })}
            </div>

            {chosen && (
              <div className="chooser__why">
                <p>
                  <b>Why this order:</b> {chosen.why}
                </p>
                <p>
                  <b>Best for:</b> {chosen.bestFor}
                </p>
                <p>
                  <b>The trade-off:</b> {chosen.tradeoff}
                </p>
              </div>
            )}

            <button
              type="button"
              className="btn btn--primary chooser__start"
              disabled={!chosen}
              onClick={() => chosen && onChoose(chosen.id)}
            >
              {chosen ? `Begin ${chosen.label}` : 'Pick an order to begin'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
