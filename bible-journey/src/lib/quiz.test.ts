import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANON } from '../data/canon';
import { fold } from './bibleSearch';
import {
  bookQuizKey,
  isBetter,
  phaseQuizSize,
  prepare,
  quizSize,
  samplePhase,
  type BookQuiz,
  type QuizQuestion,
} from './quiz';

/*
 * The books still waiting for their questions. **It may only shrink**: a book
 * listed here must not have a file, and a book not listed must, so writing a
 * quiz means taking its name off this list in the same commit, and the suite
 * says so if either half is forgotten. When it is empty, every book in the
 * canon has a quiz.
 */
const PENDING = new Set<string>([
  'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah',
  'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians',
  '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians',
  '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter',
  '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation',
]);

const QUIZ_DIR = join(process.cwd(), 'src/data/quiz');
const BIBLE_DIR = join(process.cwd(), 'public/bible');

/** Every quiz file, raw and parsed, keyed by the slug its name carries. */
const files = readdirSync(QUIZ_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const raw = readFileSync(join(QUIZ_DIR, f), 'utf8');
    return { slug: f.replace(/\.json$/, ''), raw, quiz: JSON.parse(raw) as BookQuiz };
  });

/** The text the app ships, read the way the reader reads it. */
function chaptersOf(book: string): (string | null)[][] {
  const json = JSON.parse(readFileSync(join(BIBLE_DIR, `${bookQuizKey(book)}.json`), 'utf8')) as {
    chapters: (string | null)[][];
  };
  return json.chapters;
}

/** The cited verses, joined and folded, or null if any of them is not there. */
function passage(book: string, [chapter, from, to]: QuizQuestion['ref']): string | null {
  const verses = chaptersOf(book)[chapter - 1];
  if (!verses || from < 1 || to < from || to > verses.length) return null;
  const span = verses.slice(from - 1, to);
  // A null verse is a number with nothing behind it in this translation.
  if (span.some((v) => v === null)) return null;
  return fold(span.join(' '));
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether `needle` stands in `hay` as whole words. Whole words, so a wrong
 * answer of "Ten" is not found inside "often" and a right answer of "Ten" is
 * not proved by it either. Both sides are folded first.
 */
function stands(hay: string, needle: string): boolean {
  const n = fold(needle).trim();
  const start = /^\w/.test(n) ? '\\b' : '';
  const end = /\w$/.test(n) ? '\\b' : '';
  return new RegExp(`${start}${escape(n)}${end}`).test(fold(hay));
}

/** The stem with anything in quotation marks taken out, so a quoted "not" is not a negative stem. */
const unquoted = (q: string) => q.replace(/"[^"]*"/g, '').replace(/“[^”]*”/g, '');

const all = files.flatMap((f) => f.quiz.questions.map((question) => ({ ...f, question })));

describe('the quiz files', () => {
  it('only names books the app ships, each in a file of its own slug', () => {
    for (const { slug, quiz } of files) {
      expect(CANON, `${quiz.book} is not in the canon`).toContain(quiz.book);
      expect(slug).toBe(bookQuizKey(quiz.book));
    }
  });

  it('has a quiz for every book not still listed as pending, and none for a pending one', () => {
    const written = new Set(files.map((f) => f.quiz.book));
    for (const book of CANON) {
      if (PENDING.has(book)) expect(written.has(book), `${book} is written, take it off PENDING`).toBe(false);
      else expect(written.has(book), `${book} has no quiz`).toBe(true);
    }
  });

  it('sizes every quiz to its book', () => {
    for (const { quiz } of files) {
      expect(quiz.questions.length, quiz.book).toBe(quizSize(chaptersOf(quiz.book).length));
    }
  });

  it('gives every question an id of its own, starting with its book', () => {
    const ids = all.map((x) => x.question.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { slug, question } of all) {
      expect(question.id.startsWith(`${slug}-`), question.id).toBe(true);
    }
  });

  it('follows the house rule on dashes', () => {
    for (const { raw, slug } of files) expect(raw.includes('—'), slug).toBe(false);
  });
});

/*
 * The checks the feature's credibility rests on. Each question cites verses
 * that exist, quotes a span of them that really is there, and that span has
 * to contain the right answer and none of the wrong ones. A question that
 * fails any of these is either wrong or ambiguous, and neither ships.
 */
describe('every question, against the shipped text', () => {
  /*
   * Pinned directly, because no question cites one yet and so nothing else
   * would notice the check going missing. Luke 17:36 is one of the 39 numbers
   * with nothing behind them in this translation.
   */
  it('refuses a citation of a verse this translation leaves empty', () => {
    expect(passage('Luke', [17, 35, 35])).not.toBeNull();
    expect(passage('Luke', [17, 36, 36])).toBeNull();
    expect(passage('Luke', [17, 35, 37])).toBeNull();
    expect(passage('Mark', [16, 9, 99])).toBeNull();
  });

  it('cites verses the book has, none of them empty', () => {
    for (const { quiz, question } of all) {
      expect(passage(quiz.book, question.ref), `${question.id} cites ${question.ref}`).not.toBeNull();
    }
  });

  it('quotes evidence that is really in the cited verses', () => {
    for (const { quiz, question } of all) {
      const text = passage(quiz.book, question.ref) ?? '';
      expect(text.includes(fold(question.evidence)), `${question.id}: ${question.evidence}`).toBe(
        true,
      );
    }
  });

  it('finds the right answer in the evidence', () => {
    for (const { question } of all) {
      const right = question.options[question.answer];
      const terms = question.answerTerms ?? [right];
      for (const term of terms) {
        expect(stands(question.evidence, term), `${question.id}: "${term}" not in evidence`).toBe(
          true,
        );
      }
    }
  });

  /* What catches a question with two right answers. */
  it('finds no wrong answer in the evidence', () => {
    for (const { question } of all) {
      question.options.forEach((option, i) => {
        if (i === question.answer) return;
        expect(stands(question.evidence, option), `${question.id}: "${option}" is in evidence`).toBe(
          false,
        );
      });
    }
  });

  it('offers four different options with one marked right', () => {
    for (const { question } of all) {
      expect(question.options.length, question.id).toBe(4);
      expect(new Set(question.options.map((o) => fold(o).trim())).size, question.id).toBe(4);
      expect([0, 1, 2, 3], question.id).toContain(question.answer);
    }
  });

  it('never asks a negative question or offers all or none of the above', () => {
    for (const { question } of all) {
      expect(/\b(not|except|never)\b/i.test(unquoted(question.q)), question.id).toBe(false);
      for (const option of question.options) {
        expect(/\b(all|none) of the above\b/i.test(option), question.id).toBe(false);
      }
    }
  });

  it('fits a phone: a stem under 120 characters, an option under 48', () => {
    for (const { question } of all) {
      expect(question.q.length, question.id).toBeLessThanOrEqual(120);
      for (const option of question.options) expect(option.length, question.id).toBeLessThanOrEqual(48);
    }
  });

  it('never keeps the right answer in one position for most of a book', () => {
    for (const { quiz } of files) {
      if (quiz.questions.length < 5) continue;
      const counts = [0, 0, 0, 0];
      for (const q of quiz.questions) counts[q.answer] += 1;
      expect(Math.max(...counts), quiz.book).toBeLessThanOrEqual(quiz.questions.length / 2);
    }
  });

  /* A quiz that only asks about the first chapters is a quiz about the opening. */
  it('asks about the whole book, its first third and its last', () => {
    for (const { quiz } of files) {
      const chapters = chaptersOf(quiz.book).length;
      if (chapters < 3) continue;
      const asked = new Set(quiz.questions.map((q) => q.ref[0]));
      const third = Math.ceil(chapters / 3);
      expect(asked.size, quiz.book).toBeGreaterThanOrEqual(Math.min(quiz.questions.length, 3));
      expect([...asked].some((c) => c <= third), `${quiz.book} misses its first third`).toBe(true);
      expect(
        [...asked].some((c) => c > chapters - third),
        `${quiz.book} misses its last third`,
      ).toBe(true);
    }
  });
});

describe('quizSize', () => {
  const chapters = (book: string) => chaptersOf(book).length;

  it('grows with the book, more slowly than the book', () => {
    expect(quizSize(chapters('Jude'))).toBe(3);
    expect(quizSize(chapters('Obadiah'))).toBe(3);
    expect(quizSize(chapters('Philemon'))).toBe(3);
    expect(quizSize(chapters('Ruth'))).toBe(4);
    expect(quizSize(chapters('Mark'))).toBe(8);
    expect(quizSize(chapters('Romans'))).toBe(8);
    expect(quizSize(chapters('John'))).toBe(9);
    expect(quizSize(chapters('Revelation'))).toBe(9);
    expect(quizSize(chapters('Genesis'))).toBe(14);
    expect(quizSize(chapters('Sirach'))).toBe(14);
    expect(quizSize(chapters('Psalms'))).toBe(15);
    expect(quizSize(chapters('Isaiah'))).toBe(15);
  });

  it('comes to 536 questions across the canon the app ships', () => {
    expect(CANON.reduce((n, book) => n + quizSize(chapters(book)), 0)).toBe(536);
  });

  it('gives a phase at least five and at most twenty', () => {
    expect(phaseQuizSize(1)).toBe(5);
    expect(phaseQuizSize(16)).toBe(8);
    expect(phaseQuizSize(400)).toBe(20);
  });
});

describe('an attempt', () => {
  const mark = files.find((f) => f.quiz.book === 'Mark')!.quiz;
  const items = mark.questions.map((question) => ({ book: 'Mark', question }));

  it('asks every question once, in a fresh order, with the answer following its option', () => {
    const asked = prepare(items, 42);
    expect(asked.map((a) => a.question.id).sort()).toEqual(mark.questions.map((q) => q.id).sort());
    for (const a of asked) {
      expect(a.options.slice().sort()).toEqual([...a.question.options].sort());
      expect(a.options[a.answer]).toBe(a.question.options[a.question.answer]);
    }
  });

  it('is the same attempt from the same seed, and a different one from another', () => {
    const order = (seed: number) => prepare(items, seed).map((a) => a.question.id).join();
    expect(order(7)).toBe(order(7));
    expect([1, 2, 3, 4, 5].map(order).some((o) => o !== order(7))).toBe(true);
  });

  it('only counts a better share of the questions as a better result', () => {
    expect(isBetter({ best: 3, of: 8 }, undefined)).toBe(true);
    expect(isBetter({ best: 7, of: 8 }, { best: 6, of: 8 })).toBe(true);
    expect(isBetter({ best: 6, of: 8 }, { best: 6, of: 8 })).toBe(false);
    expect(isBetter({ best: 11, of: 12 }, { best: 8, of: 8 })).toBe(false);
  });
});

describe('a phase quiz', () => {
  const fake = (book: string, n: number): BookQuiz => ({
    book,
    questions: Array.from({ length: n }, (_, i) => ({
      id: `${book}-${i + 1}`,
      ref: [1, 1, 1],
      q: `${book} ${i + 1}`,
      options: ['a', 'b', 'c', 'd'],
      answer: 0,
      evidence: 'a',
    })),
  });
  const phase = [
    { quiz: fake('long', 14), chapters: 50 },
    { quiz: fake('mid', 8), chapters: 16 },
    { quiz: fake('short', 3), chapters: 1 },
  ];

  it('asks the size it was given, about every book, without repeating itself', () => {
    const picked = samplePhase(phase, 12, 3);
    expect(picked.length).toBe(12);
    expect(new Set(picked.map((p) => p.book))).toEqual(new Set(['long', 'mid', 'short']));
    expect(new Set(picked.map((p) => p.question.id)).size).toBe(picked.length);
  });

  it('asks a longer book about more', () => {
    const picked = samplePhase(phase, 12, 3);
    const count = (b: string) => picked.filter((p) => p.book === b).length;
    expect(count('long')).toBeGreaterThan(count('mid'));
    expect(count('mid')).toBeGreaterThanOrEqual(count('short'));
  });

  it('still asks about every book when there are more books than questions', () => {
    const picked = samplePhase(phase, 2, 3);
    expect(new Set(picked.map((p) => p.book)).size).toBe(3);
  });
});
