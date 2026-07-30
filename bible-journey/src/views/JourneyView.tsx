import { useState } from 'react';
import { BookRow } from '../components/BookRow';
import { PhaseSection } from '../components/PhaseSection';
import { ProgressBar } from '../components/ProgressBar';
import { QuoteCard } from '../components/QuoteCard';
import { TodayCard } from '../components/TodayCard';
import { Flame } from '../components/icons';
import { PHASES, PROLOGUE } from '../data/plan';
import { formatNumber } from '../lib/format';
import { useStore } from '../state/useStore';

export function JourneyView() {
  const { derived } = useStore();
  const { overall, streak, phases, statuses, currentPhase } = derived;
  const [openBook, setOpenBook] = useState<string | null>(null);

  return (
    <>
      <div className="hero">
        <div className="container hero__inner">
          <div>
            <p className="eyebrow eyebrow--onDark">The reading plan</p>
            <h1>Sixty-five books, in order.</h1>
            <p className="hero__lede">
              John is already behind you. What follows is twelve phases built so each book lands
              with the context of the one before it: history before prophets, Acts before Paul,
              Revelation last.
            </p>
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
                Phase <b>{currentPhase}</b> of 12
              </span>
              <span>
                <b>{formatNumber(overall.totalRead)}</b>/{formatNumber(overall.total)} with John
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
            <h2>Twelve phases</h2>
          </div>
          <p className="chartBlock__note" style={{ maxWidth: '34ch' }}>
            Nothing is locked. Jump ahead whenever you want. The phase order is a suggestion
            with a reason behind it.
          </p>
        </div>

        <p className="prologue">
          <span className="prologue__badge" aria-hidden="true">
            ✓
          </span>
          <span>
            Before the plan: <b>{PROLOGUE.name}</b>, all {PROLOGUE.chapters} chapters, already read.
          </span>
        </p>

        <div className="books" style={{ marginBottom: '2.5rem' }}>
          <BookRow
            name={PROLOGUE.name}
            chapters={PROLOGUE.chapters}
            read={PROLOGUE.chapters}
            seeded
            open={openBook === PROLOGUE.name}
            onToggle={() => setOpenBook(openBook === PROLOGUE.name ? null : PROLOGUE.name)}
          />
        </div>

        {PHASES.map((phase, i) => (
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
