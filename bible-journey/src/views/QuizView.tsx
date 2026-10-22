import { CANON } from '../data/canon';
import { HeadChip, ViewHeader } from '../components/ViewHeader';
import { Chevron } from '../components/icons';
import { plural } from '../lib/format';
import { useReveal } from '../lib/motion';
import { chapterCount } from '../lib/navigate';
import { bookQuizKey, quizSize } from '../lib/quiz';
import { QUIZ_BOOKS } from '../lib/quizData';
import type { QuizResult } from '../lib/storage';
import { useQuiz } from '../state/useQuiz';
import { useStore } from '../state/useStore';

type Row = { book: string; finished: boolean; result?: QuizResult };

/**
 * Every book's quiz, in the phases of the reader's own plan, so the list is the
 * journey's spine and not a second ordering to learn.
 *
 * **Only books with a quiz are listed**, which is every book, and the suite
 * fails if one goes missing. The filter stays so a lost file costs a row rather
 * than a row that opens onto nothing.
 *
 * Finished books come first in each phase, since a quiz is a reminder of
 * something read; the rest sit under "Not read yet" and still open, because
 * somebody may want to find out what they already know.
 */
export function QuizView() {
  const { derived, data } = useStore();
  const quiz = useQuiz();
  const reveal = useReveal();
  const written = new Set(QUIZ_BOOKS);
  const taken = Object.keys(data.quizzes ?? {}).filter((k) => !k.startsWith('phase:')).length;

  const rowOf = (book: string, read: number, chapters: number): Row => ({
    book,
    finished: chapters > 0 && read >= chapters,
    result: data.quizzes?.[bookQuizKey(book)],
  });

  const groups = derived.phases
    .map((phase) => ({
      title: phase.title,
      rows: phase.books
        .filter((b) => written.has(b.name))
        .map((b) => rowOf(b.name, b.read, b.chapters)),
    }))
    .filter((g) => g.rows.length > 0);

  // A quiz on a book the plan does not include is still a quiz worth offering.
  const inPlan = new Set(derived.phases.flatMap((p) => p.books.map((b) => b.name)));
  const outside = CANON.filter((b) => written.has(b) && !inPlan.has(b)).map((b) => {
    const chapters = chapterCount(b);
    let read = 0;
    for (let c = 1; c <= chapters; c++) if (`${b}|${c}` in data.read) read++;
    return rowOf(b, read, chapters);
  });
  if (outside.length > 0) groups.push({ title: 'Outside this plan', rows: outside });

  return (
    <>
      <ViewHeader
        eyebrow="Remember what you read"
        title="Quizzes"
        lede="A few questions on each book, answered from the text itself. Every answer shows you the verse it comes from."
        meta={
          <>
            <HeadChip>{plural(QUIZ_BOOKS.length, 'book')}</HeadChip>
            {taken > 0 && <HeadChip gold>{plural(taken, 'quiz', 'quizzes')} taken</HeadChip>}
          </>
        }
      />

      <div className="container quizView">
        {groups.map((group) => {
          const ready = group.rows.filter((r) => r.finished);
          const later = group.rows.filter((r) => !r.finished);
          return (
            <section key={group.title} ref={reveal} className="card reveal">
              <div className="card__head">
                <h3 className="card__title">{group.title}</h3>
              </div>
              <ul className="quizList">
                {ready.map((r) => (
                  <QuizRow key={r.book} row={r} onOpen={() => quiz.open(r.book)} />
                ))}
              </ul>
              {later.length > 0 && (
                <>
                  <p className="quizList__label">Not read yet</p>
                  <ul className="quizList">
                    {later.map((r) => (
                      <QuizRow key={r.book} row={r} onOpen={() => quiz.open(r.book)} />
                    ))}
                  </ul>
                </>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function QuizRow({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const size = quizSize(chapterCount(row.book));
  const perfect = row.result && row.result.best === row.result.of;
  return (
    <li>
      <button type="button" className="quizRow" onClick={onOpen}>
        <span className="quizRow__main">
          <span className="quizRow__book">{row.book}</span>
          <span className="quizRow__size">{plural(size, 'question')}</span>
        </span>
        <span className="quizRow__best" data-perfect={perfect ? '' : undefined}>
          {row.result ? `Best ${row.result.best} of ${row.result.of}` : 'Not taken'}
        </span>
        <Chevron size={14} className="quizRow__chev" />
      </button>
    </li>
  );
}
