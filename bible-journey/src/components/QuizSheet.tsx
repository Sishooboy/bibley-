import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cachedBook, loadBook, type BookText } from '../lib/bible';
import { fold } from '../lib/bibleSearch';
import { verseRef } from '../lib/highlight';
import { useCountUp } from '../lib/motion';
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
  const [finished, setFinished] = useState(false);
  /** Bumped by Try again: a fresh order of the same questions. */
  const [attempt, setAttempt] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
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
    chime(ok ? 'right' : 'miss');
  };

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
    setFinished(false);
    setAttempt((n) => n + 1);
  };

  /** Back to the reader at the verse, which is the same reader if one was open. */
  const inContext = (a: AskedQuestion) => {
    const [chapter, from] = a.question.ref;
    onClose();
    reader.open(a.book, chapter, from);
  };

  // How far along, counting a question as done once it is answered.
  const done = finished ? total : index + (picked === null ? 0 : 1);

  return (
    <div className="quiz" role="dialog" aria-modal="true" aria-label={`${book} quiz`} ref={shellRef}>
      <header className="quiz__bar">
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
      </header>

      {/* Outside the keyed stage, so it grows rather than starting again each question. */}
      <div className="quiz__rail" aria-hidden="true">
        <span style={{ '--done': total === 0 ? 0 : done / total } as CSSProperties} />
      </div>

      <div className="quiz__body">
        {error ? (
          <p className="quiz__message">{error}</p>
        ) : !asked ? (
          <p className="quiz__message quiz__message--quiet">Opening the {book} quiz…</p>
        ) : current ? (
          <section key={`${attempt}-${index}`} className="quiz__stage">
            <h2 className="quiz__q">{current.question.q}</h2>
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
              <div className="quiz__proof">
                <p className="quiz__proofHead">From {proofOf(text, current).label}</p>
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
                <div className="quiz__actions">
                  <button type="button" className="btn btn--sm" onClick={() => inContext(current)}>
                    Read it in context
                  </button>
                  <button type="button" className="btn btn--primary quiz__next" onClick={next}>
                    {index + 1 < total ? 'Next question' : 'See how it went'}
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="quiz__done" aria-live="polite">
            <p className="eyebrow">{book}</p>
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

            {missed.length > 0 && (
              <div className="quiz__missed">
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
              </div>
            )}

            <div className="quiz__actions">
              <button type="button" className="btn" onClick={again}>
                Try again
              </button>
              <button type="button" className="btn btn--primary" onClick={onClose}>
                Done
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
