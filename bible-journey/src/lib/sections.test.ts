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
     * The pin this file exists for. A heading is drawn above the block that
     * contains its verse, so a heading pointing at a verse in the middle of a
     * paragraph appears above the whole paragraph instead, several sentences
     * early, attached to the wrong scene. Nothing throws and nothing looks
     * broken; it just quietly says the wrong thing about the text.
     *
     * Three of Mark's eighty-one were wrong when they were first written, which
     * is the rate to expect from hand written data.
     */
    for (const { book, chapter } of authored) {
      const text = bookText(book);
      const blocks = blocksFor(text.chapters[chapter - 1], text.layout?.[chapter - 1]);
      const starts = new Set(blocks.map((b) => b.verses[0]));
      for (const section of sectionsFor(insights, book, chapter)) {
        expect(
          starts.has(section.v),
          `${book} ${chapter}:${section.v} "${section.t}" is not the start of a paragraph`,
        ).toBe(true);
      }
    }
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
    // It is set uppercase and letterspaced at 11.5px. Past about forty
    // characters it wraps to two lines and stops reading as a label.
    for (const { book, chapter } of authored) {
      for (const s of sectionsFor(insights, book, chapter)) {
        expect(s.t.length, `${book} ${chapter}:${s.v} "${s.t}"`).toBeLessThanOrEqual(42);
        expect(s.t.trim()).toBe(s.t);
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
