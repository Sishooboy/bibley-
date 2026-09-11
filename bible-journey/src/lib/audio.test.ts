import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIO_BOOKS } from '../data/audioBooks';
import { AUDIO_BASE, audioUrl, clock, hasRecording } from './audio';

/** The canon the app actually ships, read the same way the reader reads it. */
const canon = new Map<string, number>();
for (const file of readdirSync(join(process.cwd(), 'public/bible'))) {
  if (!file.endsWith('.json') || file === 'insights.json') continue;
  const json = JSON.parse(readFileSync(join(process.cwd(), 'public/bible', file), 'utf8')) as {
    book?: string;
    name?: string;
    chapters?: unknown[];
  };
  const name = json.book ?? json.name;
  if (name) canon.set(name, (json.chapters ?? []).length);
}

describe('the recording map', () => {
  it('reads the canon it is being checked against', () => {
    expect(canon.size).toBe(73);
  });

  /*
   * A book named here that the app cannot open is a dead entry nobody would
   * ever notice, since it can only be reached by opening that book.
   */
  it('names only books the app actually has', () => {
    for (const book of Object.keys(AUDIO_BOOKS)) {
      expect(canon.has(book), `${book} is not in the canon`).toBe(true);
    }
  });

  /*
   * The opposite mistake, and the dangerous one: claiming a recording for a
   * chapter the text does not have would offer audio for a page nobody can be
   * on. Esther and Daniel are the live cases, since this canon is Catholic and
   * the recording stops at the Hebrew ending.
   */
  it('never claims more chapters than the book has', () => {
    for (const [book, [, , recorded]] of Object.entries(AUDIO_BOOKS)) {
      expect(recorded, book).toBeLessThanOrEqual(canon.get(book)!);
      expect(recorded, book).toBeGreaterThan(0);
    }
  });
});

describe('audioUrl', () => {
  /*
   * The three odd shapes, each pinned by the exact file that was confirmed by
   * asking the server. These are the ones the published index gets wrong, so a
   * regression here is a play button that silently does nothing.
   */
  it('builds the ordinary two digit name', () => {
    expect(audioUrl('Joshua', 1)).toBe(`${AUDIO_BASE}/06_Joshua_01.mp3`);
    expect(audioUrl('Joshua', 24)).toBe(`${AUDIO_BASE}/06_Joshua_24.mp3`);
  });

  it('pads Psalms to three digits, which nothing else does', () => {
    expect(audioUrl('Psalms', 1)).toBe(`${AUDIO_BASE}/19_Psalm_001.mp3`);
    expect(audioUrl('Psalms', 150)).toBe(`${AUDIO_BASE}/19_Psalm_150.mp3`);
  });

  it('gives Lamentations no separator and no padding', () => {
    expect(audioUrl('Lamentations', 1)).toBe(`${AUDIO_BASE}/25_Lam1.mp3`);
    expect(audioUrl('Lamentations', 5)).toBe(`${AUDIO_BASE}/25_Lam5.mp3`);
  });

  it('carries no chapter number on a one chapter book', () => {
    expect(audioUrl('Jude', 1)).toBe(`${AUDIO_BASE}/65_Jude.mp3`);
    expect(audioUrl('Obadiah', 1)).toBe(`${AUDIO_BASE}/31_Obadiah.mp3`);
    expect(audioUrl('Philemon', 1)).toBe(`${AUDIO_BASE}/57_Philemon.mp3`);
  });

  /*
   * Silence has to be an answer the caller gets, not a URL that 404s. The
   * screen says "no recording" off the back of this.
   */
  it('has nothing for the deuterocanon', () => {
    for (const book of ['Tobit', 'Judith', 'Wisdom', 'Sirach', 'Baruch', '1 Maccabees', '2 Maccabees']) {
      expect(audioUrl(book, 1), book).toBeNull();
      expect(hasRecording(book), book).toBe(false);
    }
  });

  it('has nothing for the two books missing from the set', () => {
    expect(audioUrl('1 Thessalonians', 1)).toBeNull();
    expect(audioUrl('2 Thessalonians', 1)).toBeNull();
  });

  it('stops where the recording stops, not where the book does', () => {
    // Esther 1 to 10 is the Hebrew book and is read; 11 to 16 are the Greek
    // additions this canon appends, and nobody recorded them.
    expect(audioUrl('Esther', 10)).toBe(`${AUDIO_BASE}/17_Esther_10.mp3`);
    expect(audioUrl('Esther', 11)).toBeNull();
    expect(audioUrl('Esther', 16)).toBeNull();
    // Susanna and Bel and the Dragon, the same story.
    expect(audioUrl('Daniel', 12)).toBe(`${AUDIO_BASE}/27_Daniel_12.mp3`);
    expect(audioUrl('Daniel', 13)).toBeNull();
  });

  it('refuses a chapter number that is not one', () => {
    expect(audioUrl('Joshua', 0)).toBeNull();
    expect(audioUrl('Joshua', -1)).toBeNull();
    expect(audioUrl('Joshua', 1.5)).toBeNull();
    expect(audioUrl('Nowhere', 1)).toBeNull();
  });

  it('always points at an mp3 under the one base', () => {
    for (const [book, [, , recorded]] of Object.entries(AUDIO_BOOKS)) {
      const url = audioUrl(book, recorded)!;
      expect(url, book).toMatch(/^https:\/\//);
      expect(url, book).toContain(AUDIO_BASE);
      expect(url, book).toMatch(/\.mp3$/);
    }
  });
});

describe('clock', () => {
  it('reads as minutes and seconds', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(9)).toBe('0:09');
    expect(clock(61)).toBe('1:01');
    expect(clock(600)).toBe('10:00');
  });

  // A media element reports NaN for duration until it has loaded enough to know.
  it('survives the duration not being known yet', () => {
    expect(clock(NaN)).toBe('0:00');
    expect(clock(Infinity)).toBe('0:00');
    expect(clock(-5)).toBe('0:00');
  });
});
