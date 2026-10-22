/**
 * Book quizzes: the rules, with no data and no screen in them.
 *
 * **Every question's answer is in the World English Bible text the app ships,
 * and the question proves it.** It cites a passage and carries `evidence`, an
 * exact span of that passage, and `quiz.test.ts` reads the shipped text and
 * fails if the span is not there, if the right answer is not in it, or if a
 * wrong answer is. That is the whole credibility of the feature, the same
 * standard `numbers.test.ts` holds the streak milestones to: a question nobody
 * can check against the text is how a Bible app teaches somebody something
 * false.
 *
 * Pure, so the rules can be pinned without a browser.
 */
import { mulberry32 } from './rng';

/** A question as it is written: four options, the right one by index. */
export type QuizQuestion = {
  /** Stable for ever and never reused, because a result is stored against the quiz. */
  id: string;
  /** Chapter, first verse, last verse, inside the book the file is for. */
  ref: readonly [chapter: number, from: number, to: number];
  q: string;
  options: readonly [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  /** An exact span of the cited verses, after `fold()`, that proves the answer. */
  evidence: string;
  /**
   * Words from the right option that must appear in `evidence`, for the rare
   * option that paraphrases rather than quotes. Absent means the option itself
   * must appear.
   */
  answerTerms?: readonly string[];
};

export type BookQuiz = {
  book: string;
  questions: QuizQuestion[];
};

/**
 * How many questions a book gets: more for a longer book, but slower than its
 * length, so Genesis is a proper quiz and Jude is a moment. Three to fifteen,
 * which across the shipped canon is 536 questions.
 */
export function quizSize(chapters: number): number {
  return Math.min(15, Math.max(3, Math.round(2 * Math.sqrt(chapters))));
}

/** A phase quiz is drawn from its books, a little larger and capped higher. */
export function phaseQuizSize(chapters: number): number {
  return Math.min(20, Math.max(5, Math.round(2 * Math.sqrt(chapters))));
}

/** Where a book's result is kept: the same slug its text file uses. */
export function bookQuizKey(book: string): string {
  return book.toLowerCase().replace(/\s+/g, '-');
}

/** Where a phase's result is kept. Phases differ between plans, so the plan is part of it. */
export function phaseQuizKey(trackId: string, phase: number): string {
  return `phase:${trackId}:${phase}`;
}

/** A question as it is asked: options in a fresh order, and where the right one went. */
export type AskedQuestion = {
  question: QuizQuestion;
  book: string;
  options: string[];
  answer: number;
};

/** Fisher and Yates over a seeded generator, so a test can ask for the same order twice. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * One attempt at a quiz: the questions in a fresh order and each question's
 * options in a fresh order. A retake is the same questions asked differently,
 * which is what stops the second go being a test of where the right button was.
 */
export function prepare(
  items: readonly { book: string; question: QuizQuestion }[],
  seed: number,
): AskedQuestion[] {
  const rng = mulberry32(seed);
  return shuffle(items, rng).map(({ book, question }) => {
    const order = shuffle([0, 1, 2, 3], rng);
    return {
      question,
      book,
      options: order.map((i) => question.options[i]),
      answer: order.indexOf(question.answer),
    };
  });
}

/**
 * A phase quiz's questions, drawn from its books' own.
 *
 * Shared out by chapters, so a long book is asked about more, but **every book
 * in the phase is asked about at least once**: a phase quiz that skipped a book
 * would be telling the reader that book did not count. Within a book the
 * questions are taken evenly through it rather than from the front, so the end
 * of a book is not always the part left out.
 */
export function samplePhase(
  books: readonly { quiz: BookQuiz; chapters: number }[],
  size: number,
  seed: number,
): { book: string; question: QuizQuestion }[] {
  const usable = books.filter((b) => b.quiz.questions.length > 0);
  if (usable.length === 0) return [];
  const total = usable.reduce((n, b) => n + b.chapters, 0);
  const target = Math.max(size, usable.length);

  // One each, then the rest shared by chapters, largest remainder first.
  const shares = usable.map((b) => {
    const exact = ((target - usable.length) * b.chapters) / total;
    return { b, take: 1 + Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = target - shares.reduce((n, s) => n + s.take, 0);
  for (const s of [...shares].sort((x, y) => y.rest - x.rest)) {
    if (left <= 0) break;
    s.take += 1;
    left -= 1;
  }

  const rng = mulberry32(seed);
  const out: { book: string; question: QuizQuestion }[] = [];
  for (const { b, take } of shares) {
    const qs = b.quiz.questions;
    const n = Math.min(take, qs.length);
    // Evenly through the book, starting somewhere different each time.
    const start = Math.floor(rng() * (qs.length / n));
    for (let k = 0; k < n; k++) {
      out.push({ book: b.quiz.book, question: qs[Math.floor(start + (k * qs.length) / n)] });
    }
  }
  return out;
}

/** Whether `next` beats `prev`, as a share of the questions, the same rule the merge keeps. */
export function isBetter(
  next: { best: number; of: number },
  prev: { best: number; of: number } | undefined,
): boolean {
  if (!prev) return true;
  return next.best / next.of > prev.best / prev.of;
}
