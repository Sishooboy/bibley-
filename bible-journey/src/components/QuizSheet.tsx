import { useEffect, useRef, useState } from 'react';
import { cachedBook, loadBook, type BookText } from '../lib/bible';
import { fold } from '../lib/bibleSearch';
import { verseRef } from '../lib/highlight';
import { reducedMotion, useCountUp } from '../lib/motion';
import { bookQuizKey, prepare, type AskedQuestion } from '../lib/quiz';
import { loadQuiz } from '../lib/quizData';
import { chime } from '../lib/sound';
import { useReader } from '../state/useReader';
import { useStore } from '../state/useStore';
import { Check } from './icons';

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * The cited verses as printed, split around the evidence so the words that
 * prove the answer can be marked. `fold()` changes no character's length, so
 * an index found in the folded text is the same index in the original.
 */
function proofOf(text: BookText | undefined, asked: AskedQuestion) {
  const [chapter, from, to] = asked.question.ref;
  const label = verseRef(asked.book, chapter, from, to);
  const verses = text?.chapters[chapter - 1]?.slice(from - 1, to);
  if (!verses) return { label, before: '', mark: '', after: '' };
  const joined = verses.filter((v): v is string => v !== null).join(' ');
  const at = fold(joined).indexOf(fold(asked.question.evidence));
  if (at < 0) return { label, before: joined, mark: '', after: '' };
  const end = at + asked.question.evidence.length;
  return { label, before: joined.slice(0, at), mark: joined.slice(at, end), after: joined.slice(end) };
}

/** The score, counted up as it arrives, the way the journey's headline is. */
function Score({ right, of }: { right: number; of: number }) {
  const shown = Math.round(useCountUp(right, 900));
  return (
    <p className="quiz__score" aria-hidden="true">
      <b>{shown}</b>
      <span> of {of}</span>
    </p>
  );
}

/**
 * One book's quiz, over whatever is on screen.
 *
 * **A reminder, not an exam.** One question at a time, no timer, no points,
 * nothing published. Answering shows the verse the answer comes from, printed
 * from the shipped text with the proving words marked, and offers to open the
 * reader there. That verse is the only explanation the quiz ever gives: the
 * words of explanation are scripture's own, never somebody's paraphrase.
 *
 * A real modal like the reader: focus moves in, Tab is held, Escape leaves,
 * and focus goes back to whatever opened it.
 */
export function QuizSheet({ book, onClose }: { book: string; onClose: () => void }) {
  const { recordQuiz, data } = useStore();
  const reader = useReader();
  const [asked, setAsked] = useState<AskedQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<BookText | undefined>(() => cachedBook(book));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const [missed, setMissed] = useState<AskedQuestion[]>([]);
  /** Right or not, question by question, for the marks along the masthead. */
  const [results, setResults] = useState<boolean[]>([]);
  const [finished, setFinished] = useState(false);
  /** Bumped by Try again: a fresh order of the same questions. */
  const [attempt, setAttempt] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const proofRef = useRef<HTMLDivElement>(null);
  // Held in a ref, so the focus effect below runs once rather than on every
  // render the provider gives a new arrow function.
  const closing = useRef(onClose);
  closing.current = onClose;
  const key = bookQuizKey(book);
  /** The best before this attempt, so the end can say when it was not beaten. */
  const [before] = useState(() => data.quizzes?.[key]);

  useEffect(() => {
    let live = true;
    Promise.all([loadQuiz(book), loadBook(book)])
      .then(([quiz, bookText]) => {
        if (!live) return;
        setText(bookText);
        setAsked(
          prepare(
            quiz.questions.map((question) => ({ book, question })),
            Date.now() + attempt,
          ),
        );
      })
      .catch(() => {
        if (live) setError(`The ${book} quiz did not load. Check the connection and try again.`);
      });
    return () => {
      live = false;
    };
  }, [book, attempt]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    // Capture, so Escape closes the quiz and stops there, rather than also
    // reaching the reader underneath and closing that too.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closing.current();
        return;
      }
      if (e.key !== 'Tab' || !shellRef.current) return;
      const focusable = shellRef.current.querySelectorAll<HTMLElement>('button:not([disabled])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      opener?.focus?.();
    };
  }, []);

  const total = asked?.length ?? 0;
  const current = asked && !finished ? asked[index] : null;

  const pick = (i: number) => {
    if (!current || picked !== null) return;
    setPicked(i);
    const ok = i === current.answer;
    if (ok) setRight((n) => n + 1);
    else setMissed((m) => [...m, current]);
    setResults((r) => [...r, ok]);
    chime(ok ? 'right' : 'miss');
  };

  // Each question starts at its own top, the way a new tab does.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [index, finished]);

  /*
   * The verse arrives under the answers, and on a short phone that is below the
   * fold. Scrolled by hand rather than with `scrollIntoView`, which also scrolls
   * every scroller above this one, `#root` included, and would move the app
   * behind the quiz. Only as far as it takes to show the verse, and never so far
   * that the answers it explains leave the top.
   */
  useEffect(() => {
    if (picked === null) return;
    const body = bodyRef.current;
    const proof = proofRef.current;
    if (!body || !proof) return;
    const frame = requestAnimationFrame(() => {
      const b = body.getBoundingClientRect();
      const p = proof.getBoundingClientRect();
      const short = p.bottom - b.bottom + 16;
      if (short <= 0) return;
      body.scrollBy({
        top: Math.min(short, p.top - b.top - 16),
        behavior: reducedMotion() ? 'auto' : 'smooth',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [picked]);

  const next = () => {
    if (!asked) return;
    if (index + 1 < asked.length) {
      setIndex((n) => n + 1);
      setPicked(null);
      return;
    }
    setFinished(true);
    recordQuiz(key, right, asked.length);
    chime('done');
  };

  const again = () => {
    setAsked(null);
    setIndex(0);
    setPicked(null);
    setRight(0);
    setMissed([]);
    setResults([]);
    setFinished(false);
    setAttempt((n) => n + 1);
  };

  /** Back to the reader at the verse, which is the same reader if one was open. */
  const inContext = (a: AskedQuestion) => {
    const [chapter, from] = a.question.ref;
    onClose();
    reader.open(a.book, chapter, from);
  };

  /*
   * One mark a question along the masthead, standing in for a progress bar. A
   * bar says how far; these also say how it went, gold for remembered and an
   * outline for missed, which is the picture the end of the quiz then counts.
   * Decoration only: the count beside the title says the same thing in words.
   */
  const marks = Array.from({ length: total }, (_, i) =>
    i < results.length ? (results[i] ? 'right' : 'missed') : i === index && !finished ? 'now' : 'later',
  );

  return (
    <div
      className="quiz"
      role="dialog"
      aria-modal="true"
      aria-label={`${book} quiz`}
      ref={shellRef}
      data-finished={finished ? '' : undefined}
      // Nothing missed: the score is the whole screen, there is no list under it.
      data-clean={finished && missed.length === 0 ? '' : undefined}
    >
      <header className="quiz__head">
        <div className="quiz__top">
          <button
            ref={closeRef}
            type="button"
            className="reader__tool quiz__close"
            onClick={onClose}
            aria-label="Close the quiz"
          >
            <span aria-hidden="true">×</span>
          </button>
          <p className="quiz__title">
            <span className="quiz__eyebrow">Quiz</span>
            {book}
          </p>
          {total > 0 && !finished && (
            <p className="quiz__count">
              {index + 1} <span>of {total}</span>
            </p>
          )}
        </div>

        {total > 0 && (
          <ol className="quiz__marks" aria-hidden="true">
            {marks.map((state, i) => (
              <li key={i} data-state={state} />
            ))}
          </ol>
        )}

        {/* The question is the headline, set in the masthead the way every
            other screen sets its title, and keyed so each one arrives. */}
        <div className="quiz__lead">
          {error ? (
            <p className="quiz__message">{error}</p>
          ) : !asked ? (
            <p className="quiz__message quiz__message--quiet">Opening the {book} quiz…</p>
          ) : current ? (
            <h2 key={`${attempt}-${index}`} className="quiz__q">
              {current.question.q}
            </h2>
          ) : (
            <div className="quiz__result" aria-live="polite">
              <Score right={right} of={total} />
              <span className="quiz__rule" aria-hidden="true" />
              <p className="quiz__verdict">
                {right === total
                  ? 'Every one. You know this book.'
                  : `You remembered ${right} of ${total}.`}
                {before && before.best / before.of > right / total && (
                  <> Your best is still {before.best} of {before.of}.</>
                )}
              </p>
              <span className="sr-only">{`${right} of ${total} right.`}</span>
            </div>
          )}
        </div>
      </header>

      <div className="quiz__body" ref={bodyRef}>
        {current ? (
          <section key={`${attempt}-${index}`} className="quiz__stage">
            <div className="quiz__options" role="group" aria-label="Answers">
              {current.options.map((option, i) => {
                const state =
                  picked === null
                    ? undefined
                    : i === current.answer
                      ? 'right'
                      : i === picked
                        ? 'wrong'
                        : 'other';
                return (
                  <button
                    key={option}
                    type="button"
                    className="quiz__option"
                    data-state={state}
                    disabled={picked !== null}
                    aria-pressed={picked === i}
                    onClick={() => pick(i)}
                  >
                    <span className="quiz__letter" aria-hidden="true">
                      {state === 'right' ? <Check size={14} /> : state === 'wrong' ? '×' : LETTERS[i]}
                    </span>
                    <span className="quiz__optionText">{option}</span>
                  </button>
                );
              })}
            </div>

            {/* Said once, for anyone who cannot see which button turned which colour. */}
            <p className="sr-only" aria-live="polite">
              {picked === null
                ? ''
                : picked === current.answer
                  ? 'Right.'
                  : `Not this one. The answer is ${current.options[current.answer]}.`}
            </p>

            {picked !== null && (
              <div className="quiz__proof" ref={proofRef}>
                {/* Always the WEB: every answer's evidence was cut from its words,
                    whatever translation the reader happens to have open. */}
                <p className="quiz__proofHead">From {proofOf(text, current).label}, World English Bible</p>
                <blockquote className="quiz__verse">
                  {(() => {
                    const p = proofOf(text, current);
                    return (
                      <>
                        {p.before}
                        {p.mark && <mark className="quiz__evidence">{p.mark}</mark>}
                        {p.after}
                      </>
                    );
                  })()}
                </blockquote>
              </div>
            )}
          </section>
        ) : finished && missed.length > 0 ? (
          <section className="quiz__missed">
            <p className="quiz__proofHead">Worth another look</p>
            <ul>
              {missed.map((a) => (
                <li key={a.question.id}>
                  <p className="quiz__missedQ">{a.question.q}</p>
                  <p className="quiz__missedA">
                    <b>{a.options[a.answer]}</b>
                  </p>
                  <button type="button" className="quiz__ref" onClick={() => inContext(a)}>
                    {proofOf(text, a).label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {/*
        Pinned under the thumb, so the next thing to press is always in the
        same place: a hint before answering, Next after it, and the two ways
        out at the end. It is in the layout and never over it, so nothing it
        covers is ever out of reach.
      */}
      {asked && (
        <footer className="quiz__foot">
          {current && picked === null && (
            <p className="quiz__hint">Pick one. The verse it comes from follows.</p>
          )}
          {current && picked !== null && (
            <>
              <button type="button" className="btn quiz__context" onClick={() => inContext(current)}>
                Read it in context
              </button>
              <button type="button" className="btn btn--primary quiz__next" onClick={next}>
                {index + 1 < total ? 'Next question' : 'See how it went'}
              </button>
            </>
          )}
          {finished && (
            <>
              <button type="button" className="btn quiz__context" onClick={again}>
                Try again
              </button>
              <button type="button" className="btn btn--primary quiz__next" onClick={onClose}>
                Done
              </button>
            </>
          )}
        </footer>
      )}
    </div>
  );
}
