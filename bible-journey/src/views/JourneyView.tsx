import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { BookFinder } from '../components/BookFinder';
import { BookGrid } from '../components/BookGrid';
import { PhaseSection } from '../components/PhaseSection';
import { ProgressBar } from '../components/ProgressBar';
import { QuoteCard } from '../components/QuoteCard';
import { StreakWeek } from '../components/StreakWeek';
import { TodayCard } from '../components/TodayCard';
import { formatNumber } from '../lib/format';
import { useStore } from '../state/useStore';

export function JourneyView() {
  const { data, derived } = useStore();
  const { plan, overall, streak, phases, statuses, currentPhase } = derived;
  const [openBook, setOpenBook] = useState<string | null>(null);
  /*
   * Which phase is expanded. Seeded from wherever the reader is, and only once:
   * finishing a phase mid-session should not fold the screen up underneath them.
   * Null closes them all.
   */
  const [openPhase, setOpenPhase] = useState<number | null>(() => currentPhase);

  const bookNames = useMemo(
    () => plan.phases.flatMap((p) => p.books.map((b) => b.name)),
    [plan],
  );

  /** Set by revealBook, cleared once the row has been scrolled to. */
  const [pendingReveal, setPendingReveal] = useState<string | null>(null);

  /**
   * Opens a book and brings it into view, wherever it is.
   *
   * The phase holding it has to be opened too, or the row is not in the document
   * to scroll to: this is the one thing collapsing the phases could quietly
   * break, and the finder and the today card both come through here.
   */
  const revealBook = useCallback(
    (book: string) => {
      const phase = plan.phaseOfBook.get(book);
      if (phase !== undefined) setOpenPhase(phase);
      setOpenBook(book);
      setPendingReveal(book);
    },
    [plan],
  );

  /*
   * The scroll waits for the row to exist and for the phase panel above it to
   * have been laid out. A frame callback is not enough on its own: opening the
   * phase pushes everything below it down, so a scroll timed against the click
   * aims at where the row was beforehand and lands a screen short. A layout
   * effect runs after the DOM is updated and measured, which is exactly when the
   * answer is right.
   *
   * Not smooth, either. Asking for a book by name is asking to be taken there,
   * and animating two thousand pixels of somebody else's plan on the way is a
   * journey nobody requested.
   */
  useLayoutEffect(() => {
    if (!pendingReveal) return;
    document
      .querySelector(`[data-book="${CSS.escape(pendingReveal)}"]`)
      // 'start' and not 'center': a book with a long panel is taller than the
      // screen, and centring a tall thing pushes its heading off the top. The
      // row carries a scroll-margin that clears the pinned header.
      ?.scrollIntoView({ block: 'start' });
    setPendingReveal(null);
  }, [pendingReveal]);

  return (
    <>
      <div className="hero">
        <div className="container hero__inner">
          <div>
            <p className="eyebrow eyebrow--onDark">The reading plan</p>
            <h1>{plan.label}</h1>
            {/*
              The reasoning is the best writing in the app and it is reference,
              not daily reading. Shut, it is one line; open, it is unchanged.
            */}
            <details className="hero__why">
              <summary>Why this order</summary>
              <p>{plan.rationale}</p>
            </details>
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

            <StreakWeek read={data.read} current={streak.current} longest={streak.longest} />
          </div>
        </div>
      </div>

      <div className="container">
        <div className="panels">
          <TodayCard onOpenBook={revealBook} />
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

        <BookGrid phases={phases} onPick={revealBook} />

        <BookFinder books={bookNames} onJump={revealBook} />

        {plan.phases.map((phase, i) => (
          <PhaseSection
            key={phase.phase}
            phase={phase}
            progress={phases[i]}
            status={statuses.get(phase.phase) ?? 'upcoming'}
            open={openPhase === phase.phase}
            onToggle={() =>
              setOpenPhase((current) => (current === phase.phase ? null : phase.phase))
            }
            openBook={openBook}
            onOpenBook={setOpenBook}
          />
        ))}
      </div>
    </>
  );
}
