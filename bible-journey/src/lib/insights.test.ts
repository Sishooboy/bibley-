import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANON } from '../data/canon';
import { chapterCount } from './navigate';
import { noteSeenKey, presentation, sheetKey, type Insights } from './insights';

const file = JSON.parse(
  readFileSync(join(process.cwd(), 'public/bible/insights.json'), 'utf8'),
) as Insights;

const words = (s: string) => s.trim().split(/\s+/).length;

/**
 * The words are content, and content drifts: a book renamed, a chapter number
 * typed wrong, a fact that runs to a paragraph. None of that fails a build on
 * its own, so this pins the shape against the canon the app actually ships.
 */
describe('the insights file', () => {
  it('introduces every book in the canon, and no book outside it', () => {
    const names = Object.keys(file.books).sort();
    expect(names).toEqual([...CANON].sort());
  });

  it('gives each book an eyebrow and three facts', () => {
    for (const [book, b] of Object.entries(file.books)) {
      expect(b.eyebrow, book).toBeTruthy();
      expect(b.facts, book).toHaveLength(3);
    }
  });

  it('only annotates chapters the book actually has', () => {
    for (const [book, b] of Object.entries(file.books)) {
      for (const key of Object.keys(b.chapters ?? {})) {
        const n = Number(key);
        expect(Number.isInteger(n) && n >= 1, `${book} ${key}`).toBe(true);
        expect(n, `${book} ${key}`).toBeLessThanOrEqual(chapterCount(book));
      }
    }
  });

  /*
   * A card is glanced at between a tap and the first verse. A fact that needs a
   * paragraph is an essay, and an essay is what the reader came here to avoid.
   */
  it('keeps every line short enough to be read in a glance', () => {
    for (const [book, b] of Object.entries(file.books)) {
      expect(words(b.eyebrow), `${book} eyebrow`).toBeLessThanOrEqual(10);
      for (const f of b.facts) expect(words(f), `${book}: ${f.slice(0, 30)}`).toBeLessThanOrEqual(32);
      for (const [key, c] of Object.entries(b.chapters ?? {})) {
        expect(words(c.title), `${book} ${key} title`).toBeLessThanOrEqual(8);
        expect(words(c.note), `${book} ${key}`).toBeLessThanOrEqual(70);
      }
    }
  });

  it('follows the house rule on dashes', () => {
    const raw = readFileSync(join(process.cwd(), 'public/bible/insights.json'), 'utf8');
    expect(raw.includes('—')).toBe(false);
  });

  it('gives the major books at least two chapter notes', () => {
    for (const book of ['Genesis', 'Exodus', 'Psalms', 'Isaiah', 'Matthew', 'Luke', 'John', 'Romans']) {
      expect(Object.keys(file.books[book].chapters ?? {}).length, book).toBeGreaterThanOrEqual(2);
    }
  });

  it('says something about the deuterocanon, which is what a reader is least likely to know', () => {
    for (const book of ['Tobit', 'Judith', 'Wisdom', 'Sirach', 'Baruch', '1 Maccabees', '2 Maccabees']) {
      expect(Object.keys(file.books[book].chapters ?? {}).length, book).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('presentation', () => {
  const base = { hasBook: true, seenBook: false, readInBook: 0, hasNote: false, seenNote: false };

  it('presents the card on the first open of an unread book', () => {
    expect(presentation(base).sheet).toBe(true);
  });

  it('does not present it again once seen', () => {
    expect(presentation({ ...base, seenBook: true }).sheet).toBe(false);
  });

  /*
   * Marking happens from the journey screen more often than from the reader, so
   * requiring an unread book meant the card usually never appeared at all: by
   * the time a book was opened here, chapters in it had been ticked off
   * elsewhere. Seen is now the only thing that closes it.
   */
  it('still presents it for a book already marked from the journey screen', () => {
    expect(presentation({ ...base, readInBook: 7 }).sheet).toBe(true);
  });

  it('has nothing to present for a book without an entry', () => {
    expect(presentation({ ...base, hasBook: false }).sheet).toBe(false);
  });

  it('reveals a note once, then leaves it standing', () => {
    expect(presentation({ ...base, hasNote: true }).note).toBe('reveal');
    expect(presentation({ ...base, hasNote: true, seenNote: true }).note).toBe('static');
    expect(presentation({ ...base, hasNote: false }).note).toBe('none');
  });

  it('keys the two kinds of seen apart', () => {
    expect(sheetKey('John')).not.toBe(noteSeenKey('John', 3));
    expect(noteSeenKey('John', 3)).toBe('John|3');
  });
});
