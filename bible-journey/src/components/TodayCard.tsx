import { formatNumber, formatRefs } from '../lib/format';
import { nextUnread } from '../lib/progress';
import { useReminder } from '../state/useReminder';
import { useStore } from '../state/useStore';
import { Check, Flame } from './icons';

const SUGGESTION_SIZE = 3;
/** One tap for however much you actually got through. */
const QUICK_AMOUNTS = [1, 3, 5, 10];

export function TodayCard({ onOpenBook }: { onOpenBook: (book: string) => void }) {
  const { data, markNext, derived } = useStore();
  const { streakAtRisk } = useReminder();
  const plan = derived.plan;
  const refs = nextUnread(data.read, SUGGESTION_SIZE, plan);

  if (refs.length === 0) {
    return (
      <section className="panel" aria-label="Today's reading">
        <p className="eyebrow">Today’s reading</p>
        <h2 className="today__ref" style={{ marginTop: '0.6rem' }}>
          All {formatNumber(plan.chapterCount)} chapters read
        </h2>
        <p className="today__rest">
          {plan.bookCount} books, {plan.phases.length} phases, done. Revisit anything from the
          journey below.
        </p>
      </section>
    );
  }

  const first = refs[0];
  const phase = plan.phases.find((p) => p.phase === first.phase);
  const started = derived.pace.chaptersLogged > 0;


  return (
    <section className="panel" aria-label="Today's reading">
      {streakAtRisk && (
        <p className="riskNote">
          <Flame size={14} />
          Your {derived.streak.current} day streak is still waiting on today.
        </p>
      )}

      <div className="today__head">
        <p className="eyebrow">Today’s reading</p>
        <p className="today__rest" style={{ marginTop: 0 }}>
          {first.phase === 0 ? `Start here · ${phase?.title}` : `Phase ${first.phase} · ${phase?.title}`}
        </p>
      </div>

      <h2 className="today__ref">{formatRefs(refs)}</h2>
      <p className="today__rest">
        {first.phase === 0
          ? phase?.why
          : 'Next up in sequence. Pick up here, or jump anywhere in the plan. Nothing is locked.'}
      </p>

      <div className="quickMark">
        <span className="quickMark__label">I read</span>
        <div className="quickMark__row">
          {QUICK_AMOUNTS.map((n) => (
            <button
              key={n}
              type="button"
              className={`btn btn--sm${n === SUGGESTION_SIZE ? ' btn--primary' : ''}`}
              onClick={() => markNext(n)}
            >
              {n === SUGGESTION_SIZE && <Check size={14} />}
              {n} ch
            </button>
          ))}
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => onOpenBook(first.book)}
          >
            Open {first.book}
          </button>
        </div>
      </div>

      {!started && (
        <p className="today__rest" style={{ marginTop: '0.9rem' }}>
          Marking your first chapter starts the streak.
        </p>
      )}
    </section>
  );
}
