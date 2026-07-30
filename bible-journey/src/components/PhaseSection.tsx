import type { Phase } from '../data/plan';
import { formatNumber, plural } from '../lib/format';
import type { PhaseProgress, PhaseStatus } from '../lib/progress';
import { BookRow } from './BookRow';
import { ProgressBar } from './ProgressBar';

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
  openBook: string | null;
  onOpenBook: (book: string | null) => void;
};

export function PhaseSection({ phase, progress, status, openBook, onOpenBook }: Props) {
  const tag = TAGS[status];

  return (
    <section className={`phase phase--${status}`} aria-labelledby={`phase-${phase.phase}`}>
      <div className="phase__num" aria-hidden="true">
        {String(phase.phase).padStart(2, '0')}
      </div>

      <div>
        <div className="phase__head">
          <h3 id={`phase-${phase.phase}`}>{phase.title}</h3>
          {tag && <span className={`phase__tag phase__tag--${status}`}>{tag}</span>}
          <span className="phase__count">
            {formatNumber(progress.read)}/{formatNumber(progress.chapters)} ch ·{' '}
            {plural(phase.books.length, 'book')}
          </span>
        </div>

        <p className="phase__why">{phase.why}</p>

        <ProgressBar
          value={progress.read}
          max={progress.chapters}
          label={`Phase ${phase.phase} progress`}
          className="phase__bar"
        />

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
    </section>
  );
}
