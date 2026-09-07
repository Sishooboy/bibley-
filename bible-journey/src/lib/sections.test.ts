import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blocksFor } from './passage';
import { sectionsFor, type Insights } from './insights';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const insights = JSON.parse(read('public/bible/insights.json')) as Insights;
const slug = (book: string) => book.toLowerCase().replace(/\s+/g, '-');

type Book = { chapters: (string | null)[][]; layout?: string[] };
const bookText = (book: string) =>
  JSON.parse(read(`public/bible/${slug(book)}.json`)) as Book;

/** Every book that has headings, and every chapter of it that does. */
const authored = Object.entries(insights.books).flatMap(([book, entry]) =>
  Object.keys(entry.sections ?? {}).map((chapter) => ({ book, chapter: Number(chapter) })),
);

describe('the headings over the paragraphs', () => {
  it('has some, or none of the rest of this means anything', () => {
    expect(authored.length).toBeGreaterThan(0);
  });

  it('never cuts a paragraph in half', () => {
    /*
     * The pin this file exists for, and it now checks a contract rather than
     * the data's discipline. The headings come from the Berean and the
     * paragraphs from the World English Bible, and nine times in a hundred the
     * two disagree about where a section starts, so the reader hands the
     * heading verses to `blocksFor` and a heading opens a paragraph. What has
     * to hold is that the reader and the builder agree: every heading is the
     * first verse of a block **when the blocks are built the way the reader
     * builds them**. Call it without the third argument and this fails, which
     * is exactly the regression worth catching.
     */
    for (const { book, chapter } of authored) {
      const text = bookText(book);
      const heads = sectionsFor(insights, book, chapter);
      const blocks = blocksFor(
        text.chapters[chapter - 1],
        text.layout?.[chapter - 1],
        new Set(heads.map((s) => s.v)),
      );
      const starts = new Set(blocks.map((b) => b.verses[0]));
      for (const section of heads) {
        expect(
          starts.has(section.v),
          `${book} ${chapter}:${section.v} "${section.t}" is not the start of a paragraph`,
        ).toBe(true);
      }
    }
  });

  it('covers the whole protestant canon, not a book or two', () => {
    /*
     * The feature shipped with Mark and nothing else, which is a mechanism
     * rather than a feature: open any other book and there was nothing to see.
     * This is the number that says it is actually there.
     */
    const books = new Set(authored.map((a) => a.book));
    expect(books.size).toBeGreaterThanOrEqual(66);
    const all = authored.flatMap(({ book, chapter }) => sectionsFor(insights, book, chapter));
    expect(all.length).toBeGreaterThan(2900);
  });

  it('credits the Berean, which is the condition of using it', () => {
    /*
     * Public domain asks for nothing, but taking three thousand headings from
     * someone else's work and printing them unattributed beside a translation
     * this app does credit would be the wrong way round.
     */
    const reader = read('src/components/Reader.tsx');
    expect(reader).toMatch(/Berean/);
  });

  it('points at verses the chapter actually has', () => {
    for (const { book, chapter } of authored) {
      const verses = bookText(book).chapters[chapter - 1];
      expect(verses, `${book} ${chapter} does not exist`).toBeTruthy();
      for (const section of sectionsFor(insights, book, chapter)) {
        expect(section.v, `${book} ${chapter}:${section.v}`).toBeGreaterThanOrEqual(1);
        expect(section.v, `${book} ${chapter}:${section.v}`).toBeLessThanOrEqual(verses.length);
        // A heading over a verse this translation has nothing behind would sit
        // above a paragraph that never gets drawn.
        expect(verses[section.v - 1], `${book} ${chapter}:${section.v} is a null verse`).not.toBeNull();
      }
    }
  });

  it('says each heading once a chapter, in verse order', () => {
    for (const { book, chapter } of authored) {
      const list = sectionsFor(insights, book, chapter);
      const seen = list.map((s) => s.v);
      expect(new Set(seen).size, `${book} ${chapter} repeats a verse`).toBe(seen.length);
      expect(seen, `${book} ${chapter}`).toEqual([...seen].sort((a, b) => a - b));
    }
  });

  it('keeps a heading short enough to be a heading', () => {
    /*
     * A guard against a paragraph ending up in a title, not against wrapping.
     * At 11.5px uppercase and letterspaced, a 288px phone line holds about
     * thirty four characters, so plenty of these take two lines and that is
     * what a printed Bible does too. The average is 24, the longest is 49, and
     * anything past sixty would mean the importer had picked up a verse.
     */
    for (const { book, chapter } of authored) {
      for (const s of sectionsFor(insights, book, chapter)) {
        expect(s.t.length, `${book} ${chapter}:${s.v} "${s.t}"`).toBeLessThanOrEqual(60);
        expect(s.t.trim(), `${book} ${chapter}:${s.v}`).toBe(s.t);
        // A heading is a label, so it never ends in a full stop and never
        // carries a verse's worth of punctuation.
        expect(s.t, `${book} ${chapter}:${s.v}`).not.toMatch(/\.$/);
      }
    }
  });

  it('explains a minority of them, not most', () => {
    /*
     * A note is the app stopping the reader, and a chapter where every heading
     * demanded attention would be a chapter nobody could read. Roughly a
     * quarter is the shape this was written to.
     */
    const all = authored.flatMap(({ book, chapter }) => sectionsFor(insights, book, chapter));
    const noted = all.filter((s) => s.n);
    expect(noted.length).toBeGreaterThan(0);
    expect(noted.length / all.length).toBeLessThan(0.5);
  });

  it('holds to the house rule on dashes', () => {
    for (const { book, chapter } of authored) {
      for (const s of sectionsFor(insights, book, chapter)) {
        expect(s.t, `${book} ${chapter}:${s.v}`).not.toContain('—');
        expect(s.n ?? '', `${book} ${chapter}:${s.v}`).not.toContain('—');
      }
    }
  });
});
