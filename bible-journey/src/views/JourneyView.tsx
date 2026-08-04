import { useCallback, useMemo, useState } from 'react';
import { BookFinder } from '../components/BookFinder';
import { PhaseSection } from '../components/PhaseSection';
import { ProgressBar } from '../components/ProgressBar';
import { QuoteCard } from '../components/QuoteCard';
import { TodayCard } from '../components/TodayCard';
import { Flame } from '../components/icons';
import { formatNumber } from '../lib/format';
import { useStore } from '../state/useStore';

export function JourneyView() {
  const { derived } = useStore();
  const { plan, overall, streak, phases, statuses, currentPhase } = derived;
  const [openBook, setOpenBook] = useState<string | null>(null);

  const bookNames = useMemo(
    () => plan.phases.flatMap((p) => p.books.map((b) => b.name)),
    [plan],
  );

  /**
   * Opens the book and brings it into view. The row mounts its panel on the same
   * tick, so the scroll waits a frame or it aims at where the row used to be.
   */
  const jumpTo = useCallback((book: string) => {
    setOpenBook(book);
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-book="${CSS.escape(book)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, []);

  return (
    <>
      <div className="hero">
        <div className="container hero__inner">
          <div>
            <p className="eyebrow eyebrow--onDark">The reading plan</p>
            <h1>{plan.label}</h1>
            <p className="hero__lede">{plan.rationale}</p>
          </div>

          <div className="hero__progress">
            <div className="hero__progressTop">
              <div className="hero__count">
                {formatNumber(overall.planRead)}
                <span> / {formatNumber(overall.planTotal)} ch</span>
              </div>
              <div className="hero__pct">{overall.percent.toFixed(1)}%</div>
            </div>

            <ProgressBar
              value={overall.planRead}
              max={overall.planTotal}
              label="Overall plan progress"
              onDark
            />

            <div className="hero__meta">
              <span>
                <b>{overall.booksDone}</b>/{overall.booksTotal} books
              </span>
              <span>
                Phase <b>{currentPhase}</b> of {plan.phases.length}
              </span>
            </div>

            <div style={{ marginTop: '0.5rem' }}>
              <span className={`streak${streak.current === 0 ? ' streak--cold' : ''}`}>
                <Flame size={16} className="streak__flame" />
                {streak.current > 0 ? (
                  <span>
                    <b>{streak.current}</b> day streak
                  </span>
                ) : (
                  <span>No active streak</span>
                )}
                <span style={{ opacity: 0.6 }}>&nbsp;· best {streak.longest}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="panels">
          <TodayCard onOpenBook={setOpenBook} />
          <QuoteCard />
        </div>
      </div>

      <div className="container journey">
        <div className="sectionHead">
          <div>
            <p className="eyebrow">The journey</p>
            <h2>{plan.phases.length} phases</h2>
          </div>
          <p className="chartBlock__note" style={{ maxWidth: '34ch' }}>
            Nothing is locked. Jump ahead whenever you want. The phase order is a suggestion
            with a reason behind it.
          </p>
        </div>

        <BookFinder books={bookNames} onJump={jumpTo} />

        {plan.phases.map((phase, i) => (
          <PhaseSection
            key={phase.phase}
            phase={phase}
            progress={phases[i]}
            status={statuses.get(phase.phase) ?? 'upcoming'}
            openBook={openBook}
            onOpenBook={setOpenBook}
          />
        ))}
      </div>
    </>
  );
}
