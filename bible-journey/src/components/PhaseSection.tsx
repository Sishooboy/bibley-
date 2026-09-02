import type { Phase } from '../data/plan';
import { formatNumber, plural } from '../lib/format';
import type { PhaseProgress, PhaseStatus } from '../lib/progress';
import { BookRow } from './BookRow';
import { ProgressBar } from './ProgressBar';
import { Chevron } from './icons';

const TAGS: Record<PhaseStatus, string | null> = {
  done: 'Complete',
  current: 'You are here',
  ahead: 'Started early',
  upcoming: null,
};

type Props = {
  phase: Phase;
  progress: PhaseProgress;
  status: PhaseStatus;
  open: boolean;
  onToggle: () => void;
  openBook: string | null;
  onOpenBook: (book: string | null) => void;
};

/**
 * One phase, shut by default.
 *
 * All thirteen used to be open at once, which put seventy-three book rows and
 * four hundred words of reasoning on the page before anyone had done anything:
 * eleven phone screens of scrolling to reach the end of a plan you have not
 * started. Shut, a phase is one line saying where it is up to, which is what you
 * want thirteen of. The reasoning and the books are a tap away.
 */
export function PhaseSection({
  phase,
  progress,
  status,
  open,
  onToggle,
  openBook,
  onOpenBook,
}: Props) {
  const tag = TAGS[status];
  const panelId = `phase-panel-${phase.phase}`;

  return (
    <section
      className={`phase phase--${status}${open ? ' phase--open' : ''}`}
      aria-labelledby={`phase-${phase.phase}`}
      data-phase={phase.phase}
    >
      <button type="button" className="phase__row" onClick={onToggle} aria-expanded={open} aria-controls={panelId}>
        <span className="phase__num" aria-hidden="true">
          {String(phase.phase).padStart(2, '0')}
        </span>

        <span className="phase__main">
          <span className="phase__head">
            <h3 id={`phase-${phase.phase}`}>{phase.title}</h3>
            {tag && <span className={`phase__tag phase__tag--${status}`}>{tag}</span>}
          </span>
          <ProgressBar
            value={progress.read}
            max={progress.chapters}
            label={`Phase ${phase.phase} progress`}
            className="phase__bar"
            thin
          />
        </span>

        <span className="phase__count">
          {formatNumber(progress.read)}/{formatNumber(progress.chapters)}
          <small> ch · {plural(phase.books.length, 'book')}</small>
        </span>

        <Chevron size={15} className={`phase__chev${open ? ' phase__chev--open' : ''}`} />
      </button>

      {open && (
        <div className="phase__panel" id={panelId}>
          <p className="phase__why">{phase.why}</p>

          <div className="books">
            {progress.books.map((book) => (
              <BookRow
                key={book.name}
                name={book.name}
                chapters={book.chapters}
                read={book.read}
                open={openBook === book.name}
                onToggle={() => onOpenBook(openBook === book.name ? null : book.name)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
