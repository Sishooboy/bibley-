import { useEffect, useState } from 'react';
import { cachedBook, loadBook, type BookText } from '../lib/bible';
import { countWords, formatNumber, formatRefs, readingMinutes } from '../lib/format';
import { nextUnread } from '../lib/progress';
import { useReader } from '../state/useReader';
import { useReminder } from '../state/useReminder';
import { useStore } from '../state/useStore';
import { LogDayPicker } from './LogDayPicker';
import { Cross } from './Ornament';
import { Check, Flame } from './icons';

const SUGGESTION_SIZE = 3;
/** One tap for however much you actually got through. */
const QUICK_AMOUNTS = [1, 3, 5, 10];

/**
 * Runs shorter than this are not mourned. Losing a two day streak is not a loss,
 * and saying so would make the app sound like it is grieving on your behalf over
 * nothing.
 */
const MOURN_FROM = 3;

const LOSS_KEY = 'bible-journey/streak-lost';
const readLoss = (): string | null => {
  try {
    return localStorage.getItem(LOSS_KEY);
  } catch {
    return null;
  }
};
const writeLoss = (key: string): void => {
  try {
    localStorage.setItem(LOSS_KEY, key);
  } catch {
    /* A private window cannot remember, and will say it twice. Harmless. */
  }
};

export function TodayCard({ onOpenBook }: { onOpenBook: (book: string) => void }) {
  const { data, markNext, derived } = useStore();
  const { risk } = useReminder();
  const { open } = useReader();
  const plan = derived.plan;
  const refs = nextUnread(data.read, SUGGESTION_SIZE, plan);
  const first = refs[0] as (typeof refs)[number] | undefined;

  /*
   * What a streak was, said once, when it is gone. Keyed by the run and the day
   * it ended, so a second break is mourned again but the same one never is.
   * Device-local: telling you on your laptop and again on your phone is a small
   * redundancy, and putting it in the journal would mean a `normalize()` entry
   * for a string nothing else needs.
   */
  const { current, lastRun, lastReadDay } = derived.streak;
  const lost = current === 0 && lastRun >= MOURN_FROM && lastReadDay ? lastRun : null;
  const lossKey = lost ? `${lastReadDay}|${lost}` : null;
  const [mourn, setMourn] = useState<number | null>(null);
  useEffect(() => {
    if (!lossKey || !lost) {
      setMourn(null);
      return;
    }
    if (readLoss() === lossKey) return;
    setMourn(lost);
    writeLoss(lossKey);
  }, [lossKey, lost]);

  /*
   * The day's book, fetched here rather than when Read is pressed. A book is
   * one request of about sixty kilobytes, and having it in hand already does
   * two things: the reader opens on the text instead of on "Opening Genesis",
   * and the button can say how long the chapter is, which is the most inviting
   * thing a button can know. Before the early return below, because hooks are.
   */
  // The name alone, so the effect keys on the book and not on a `refs` array
  // that is new every render.
  const firstBook = first?.book;
  const [text, setText] = useState<BookText | undefined>(() =>
    firstBook ? cachedBook(firstBook) : undefined,
  );
  useEffect(() => {
    if (!firstBook) return;
    const hit = cachedBook(firstBook);
    if (hit) {
      setText(hit);
      return;
    }
    let live = true;
    setText(undefined);
    // Offline with the book uncached is the one case this fails, and the
    // button simply says less. The reader itself explains when pressed.
    loadBook(firstBook)
      .then((loaded) => live && setText(loaded))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [firstBook]);

  if (!first) {
    return (
      <section className="panel panel--done" aria-label="Today's reading">
        {/* The one moment in the app worth marking. Everywhere else this would
            be decoration; here it is the finish line. */}
        <Cross size={34} className="today__cross" />
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

  const phase = plan.phases.find((p) => p.phase === first.phase);
  const verses = text?.chapters[first.chapter - 1];
  const minutes = verses ? readingMinutes(countWords(verses)) : null;
  const verseCount = verses ? verses.filter((v) => v !== null).length : 0;
  const started = derived.pace.chaptersLogged > 0;


  return (
    <section className="panel" aria-label="Today's reading">
      {/*
        One line, and it escalates: `streakRisk` decides the wording from the
        clock and from whether a rest day is in hand. The tone is an attribute
        rather than three components, so the copy and the colour cannot drift
        apart.
      */}
      {risk && (
        <p className="riskNote" data-level={risk.level}>
          <Flame size={14} />
          {risk.text}
        </p>
      )}

      {/*
        A broken streak used to become "No active streak" in the hero and
        nothing else: twelve days gone without a word. This says it once, plainly
        and without ceremony, and then never again.
      */}
      {mourn !== null && (
        <p className="lossNote">
          Your {mourn} day streak ended. Today starts a new one.
        </p>
      )}

      <div className="today__head">
        <p className="eyebrow">Today’s reading</p>
        <p className="today__rest" style={{ marginTop: 0 }}>
          {first.phase === 0 ? `Start here · ${phase?.title}` : `Phase ${first.phase} · ${phase?.title}`}
        </p>
      </div>

      <h2 className="today__ref">{formatRefs(refs)}</h2>

      {/*
        One button, the width of the card. This is the whole reason the app is
        open, and it used to be one of four things competing at the same size.
      */}
      <button
        type="button"
        className="btn btn--primary today__go"
        onClick={() => open(first.book, first.chapter)}
      >
        <span className="today__goMain">
          Read {first.book} {first.chapter}
        </span>
        {/*
          The cost of saying yes, in the reader's own units. Nothing lowers the
          bar to starting like being told it is three minutes, and nothing on
          this screen is allowed to say that unless the text is in hand to
          count it.
        */}
        {minutes !== null && (
          <span className="today__goSub">
            {verseCount} verses · about {minutes === 1 ? 'a minute' : `${minutes} min`}
          </span>
        )}
      </button>

      {/*
        The first-timer needs the reasoning, and only the first-timer. Everyone
        else has read it and is here to get on with it.
      */}
      {first.phase === 0 && <p className="today__rest">{phase?.why}</p>}

      {/*
        Marking without opening the reader is the second job, not the first, so
        it folds away. Anyone who reads elsewhere opens it once and it stays
        open for the session.
      */}
      <details className="quickMark">
        <summary className="quickMark__summary">I read it somewhere else</summary>
        <div className="quickMark__head">
          <span className="quickMark__label">I read</span>
          <LogDayPicker id="today-log-day" />
        </div>
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
      </details>

      {!started && (
        <p className="today__rest today__first">
          Marking your first chapter starts the streak.
        </p>
      )}
    </section>
  );
}
