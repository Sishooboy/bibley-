import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BIBLE_NUMBERS } from '../data/numbers';
import { milestoneFor, refLabel } from './numbers';

/** The text the app ships, read the way the reader reads it. */
const books = new Map<string, (string | null)[][]>();
for (const file of readdirSync(join(process.cwd(), 'public/bible'))) {
  if (!file.endsWith('.json') || file === 'insights.json') continue;
  const json = JSON.parse(readFileSync(join(process.cwd(), 'public/bible', file), 'utf8')) as {
    book?: string;
    name?: string;
    chapters?: (string | null)[][];
  };
  const name = json.book ?? json.name;
  if (name) books.set(name, json.chapters ?? []);
}

const verseAt = (book: string, chapter: number, verse: number): string | null =>
  books.get(book)?.[chapter - 1]?.[verse - 1] ?? null;

/**
 * How each number is spelled in this translation.
 *
 * Written out rather than generated, because the forms are irregular and a
 * clever generator that produced "fourty" would make the check pass by being
 * wrong in the same direction as the data.
 */
const WORDS: Record<number, string[]> = {
  3: ['three', 'third'],
  7: ['seven', 'seventh'],
  10: ['ten', 'tenth'],
  12: ['twelve', 'twelfth'],
  14: ['fourteen', 'fourteenth'],
  30: ['thirty', 'thirtieth'],
  40: ['forty', 'fortieth'],
  50: ['fifty', 'fiftieth'],
  70: ['seventy', 'seventieth'],
  120: ['hundred twenty'],
};

describe('the number entries', () => {
  it('reads the canon it is being checked against', () => {
    expect(books.size).toBe(73);
  });

  /*
   * The check the whole feature rests on. A citation nobody can falsify is how
   * a line about scripture turns into a line about nothing, so every reference
   * has to land on a verse that actually says the number.
   */
  it('cites verses that exist and contain the number', () => {
    for (const entry of BIBLE_NUMBERS) {
      const forms = WORDS[entry.n];
      expect(forms, `no spelling listed for ${entry.n}`).toBeTruthy();
      for (const ref of entry.refs) {
        const text = verseAt(...ref);
        expect(text, `${refLabel(ref)} does not exist`).toBeTruthy();
        const found = forms.some((word) => text!.toLowerCase().includes(word));
        expect(found, `${refLabel(ref)} does not say "${entry.n}": ${text}`).toBe(true);
      }
    }
  });

  it('gives every number three places to look', () => {
    for (const entry of BIBLE_NUMBERS) {
      expect(entry.refs.length, `${entry.n}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('names each number once', () => {
    const seen = BIBLE_NUMBERS.map((e) => e.n);
    expect(new Set(seen).size).toBe(seen.length);
  });

  /*
   * Round is not the same as biblical. Letting 100 in would quietly make this
   * "every milestone is scriptural", which is the claim the feature refuses.
   */
  it('lets in no number that is only round', () => {
    const ns = BIBLE_NUMBERS.map((e) => e.n);
    expect(ns).not.toContain(100);
    expect(ns).not.toContain(365);
    expect(ns).not.toContain(1000);
  });

  /* The card is a moment, not a page. */
  it('keeps every line short', () => {
    for (const entry of BIBLE_NUMBERS) {
      expect(entry.line.length, `${entry.n}: ${entry.line}`).toBeLessThanOrEqual(48);
      expect(entry.name.length, entry.name).toBeLessThanOrEqual(22);
    }
  });

  /* The house rule, the same one `insights.test.ts` keeps. */
  it('uses no em dashes', () => {
    for (const entry of BIBLE_NUMBERS) {
      expect(entry.line).not.toContain('—');
      expect(entry.name).not.toContain('—');
    }
  });

  it('only marks numbers a streak can reach', () => {
    for (const entry of BIBLE_NUMBERS) {
      expect(entry.n).toBeGreaterThan(0);
      expect(entry.n).toBeLessThanOrEqual(400);
    }
  });
});

describe('milestoneFor', () => {
  it('finds the entry for a number that has one', () => {
    expect(milestoneFor(40)?.name).toBe('Forty');
    expect(milestoneFor(7)?.name).toBe('Seven');
  });

  /* Most days are ordinary, and the celebration is the plain one on those. */
  it('is null for an ordinary day', () => {
    expect(milestoneFor(1)).toBeNull();
    expect(milestoneFor(8)).toBeNull();
    expect(milestoneFor(41)).toBeNull();
    expect(milestoneFor(100)).toBeNull();
  });

  it('refuses anything that is not a whole streak', () => {
    expect(milestoneFor(0)).toBeNull();
    expect(milestoneFor(-3)).toBeNull();
    expect(milestoneFor(7.5)).toBeNull();
    expect(milestoneFor(NaN)).toBeNull();
  });
});

describe('refLabel', () => {
  it('spells a reference the way the rest of the app does', () => {
    expect(refLabel(['Genesis', 7, 12])).toBe('Genesis 7:12');
    expect(refLabel(['1 Kings', 19, 8])).toBe('1 Kings 19:8');
  });
});
