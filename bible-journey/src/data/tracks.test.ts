import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bookSlug, type BookText } from '../lib/bible';
import {
  CANON_NAME,
  TESTAMENTS,
  TESTAMENT_TOTALS,
  TRACKS,
  getTrack,
  isTrackId,
  recommendedFor,
  trackIdFrom,
  tracksFor,
  type PhasedTrack,
  type TestamentId,
} from './tracks';

const phased = [...TRACKS.values()].filter((t): t is PhasedTrack => t.kind === 'phased');

describe('the reading tracks file', () => {
  it('is the canon the app actually ships', () => {
    expect(CANON_NAME).toBe('catholic');
    expect(TESTAMENT_TOTALS.both).toEqual({ chapters: 1334, books: 73 });
    expect(TESTAMENT_TOTALS.old).toEqual({ chapters: 1074, books: 46 });
    expect(TESTAMENT_TOTALS.new).toEqual({ chapters: 260, books: 27 });
  });

  /**
   * The count every track has to add up to. A track that is short is a track
   * that can never reach 100%, and one that is long is counting something twice.
   */
  it('resolves every track to its testament total', () => {
    const wrong: string[] = [];
    for (const track of phased) {
      const want = TESTAMENT_TOTALS[track.testament].chapters;
      if (track.chapterCount !== want) {
        wrong.push(`${track.id}: ${track.chapterCount} against ${want}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('never lists the same chapter twice in one track', () => {
    const dupes: string[] = [];
    for (const track of phased) {
      const seen = new Set<string>();
      for (const ref of track.sequence) {
        const key = `${ref.book}|${ref.chapter}`;
        if (seen.has(key)) dupes.push(`${track.id}: ${key}`);
        seen.add(key);
      }
      // The sequence and the chapter count are two ways of saying the same
      // thing, so they have to agree.
      expect(track.sequence).toHaveLength(track.chapterCount);
    }
    expect(dupes).toEqual([]);
  });

  it('gives every testament exactly one recommended track, offered first', () => {
    for (const testament of TESTAMENTS) {
      const cards = tracksFor(testament);
      expect(cards.filter((t) => t.recommended)).toHaveLength(1);
      expect(cards[0].recommended, `${testament} does not lead with its recommendation`).toBe(true);
      expect(cards.every((t) => t.primary)).toBe(true);
      expect(recommendedFor(testament).testament).toBe(testament);
    }
  });

  it('hides the tracks the file does not mark primary', () => {
    // full_chronological is a real order kept out of the chooser on purpose.
    expect(TRACKS.has('full_chronological')).toBe(true);
    expect(tracksFor('both').map((t) => t.id)).not.toContain('full_chronological');
  });
});

describe('reference expansion', () => {
  /*
   * full_canonical is two phases, both of them references. Unexpanded it is a
   * track with no books in it at all.
   */
  it('inlines a referenced track, keeping its phases in order', () => {
    const full = getTrack('full_canonical') as PhasedTrack;
    const ot = getTrack('ot_canonical') as PhasedTrack;
    const nt = getTrack('nt_canonical') as PhasedTrack;

    expect(full.phases).toHaveLength(ot.phases.length + nt.phases.length);
    expect(full.phases.map((p) => p.title)).toEqual([
      ...ot.phases.map((p) => p.title),
      ...nt.phases.map((p) => p.title),
    ]);
    expect(full.chapterCount).toBe(ot.chapterCount + nt.chapterCount);
  });

  it('renumbers the inlined phases into one run', () => {
    const full = getTrack('full_canonical') as PhasedTrack;
    expect(full.phases.map((p) => p.phase)).toEqual(
      Array.from({ length: full.phases.length }, (_, i) => i + 1),
    );
  });

  it('leaves no unresolved reference anywhere', () => {
    for (const track of phased) {
      for (const phase of track.phases) {
        expect(phase.books.length, `${track.id} / ${phase.title} is empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe('the streams track', () => {
  it('is kept out of the phase model', () => {
    const daily = getTrack('blended_daily');
    expect(daily.kind).toBe('streams');
    expect('phases' in daily).toBe(false);
  });

  it('carries its four streams, saying which ones count', () => {
    const daily = getTrack('blended_daily');
    if (daily.kind !== 'streams') throw new Error('expected a streams track');

    expect(daily.streams.map((s) => s.id)).toEqual(['ot', 'nt', 'psalm', 'proverb']);
    expect(daily.streams.filter((s) => s.counts_toward_completion).map((s) => s.id)).toEqual([
      'ot',
      'nt',
    ]);
    // Proverbs loops, which is why it needs a cursor rather than next-unread.
    expect(daily.streams.find((s) => s.id === 'proverb')?.loops_at).toBe(31);
  });
});

describe('resolving a stored id', () => {
  it('carries the three old plan ids onto their story-first track', () => {
    expect(trackIdFrom('both')).toBe('full_story_first');
    expect(trackIdFrom('nt')).toBe('nt_story_first');
    expect(trackIdFrom('ot')).toBe('ot_story_first');
  });

  it('passes a track id through untouched', () => {
    expect(trackIdFrom('ot_canonical')).toBe('ot_canonical');
  });

  it('has no answer for anything else, rather than a wrong one', () => {
    expect(trackIdFrom('nonsense')).toBeUndefined();
    expect(trackIdFrom(undefined)).toBeUndefined();
    expect(isTrackId('nonsense')).toBe(false);
  });

  it('falls back to the default rather than throwing', () => {
    expect(getTrack(undefined).id).toBe('full_story_first');
    expect(getTrack('nonsense').id).toBe('full_story_first');
  });
});

/**
 * The bridge between the file and the text. A track claiming a chapter the
 * reader cannot open is the one mismatch that makes the app lie to itself, and
 * it is exactly what the canon question turned on.
 */
describe('against the bundled text', () => {
  const DIR = join(process.cwd(), 'public', 'bible');

  it('names books that exist, with the chapter counts they really have', async () => {
    const claimed = new Map<string, number>();
    for (const track of phased) {
      for (const book of track.books) {
        const seen = claimed.get(book.name);
        expect(seen === undefined || seen === book.chapters, `${book.name} disagrees`).toBe(true);
        claimed.set(book.name, book.chapters);
      }
    }
    expect(claimed.size).toBe(73);

    const wrong: string[] = [];
    for (const [name, chapters] of claimed) {
      const text = JSON.parse(
        await readFile(join(DIR, `${bookSlug(name)}.json`), 'utf8'),
      ) as BookText;
      if (text.chapters.length !== chapters) {
        wrong.push(`${name}: track ${chapters}, text ${text.chapters.length}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('covers every book the whole-Bible track claims', () => {
    const both = getTrack('full_story_first') as PhasedTrack;
    expect(both.bookCount).toBe(73);
    expect(new Set(both.books.map((b) => b.name)).size).toBe(73);
  });
});

describe('phases as the milestone unit', () => {
  it('numbers them from one, in order, per track', () => {
    for (const track of phased) {
      expect(track.phases.map((p) => p.phase)).toEqual(
        Array.from({ length: track.phases.length }, (_, i) => i + 1),
      );
    }
  });

  it('files every book under the phase that contains it', () => {
    for (const track of phased) {
      for (const phase of track.phases) {
        for (const book of phase.books) {
          expect(track.phaseOfBook.get(book.name)).toBe(phase.phase);
        }
      }
    }
  });

  /*
   * Phases vary enormously, from 16 chapters to 343. That is why the bar is
   * weighted by chapters and "phase 4 of 11" is never the headline number.
   */
  it('has phases too uneven to use as a progress bar', () => {
    const sizes = phased.flatMap((t) =>
      t.phases.map((p) => p.books.reduce((n, b) => n + b.chapters, 0)),
    );
    expect(Math.min(...sizes)).toBeLessThan(20);
    expect(Math.max(...sizes)).toBeGreaterThan(300);
  });
});

describe('what the cards need', () => {
  it('gives every card the copy it renders', () => {
    for (const testament of TESTAMENTS as TestamentId[]) {
      for (const track of tracksFor(testament)) {
        for (const field of ['label', 'tagline', 'why', 'bestFor', 'tradeoff'] as const) {
          expect(track[field], `${track.id} has no ${field}`).toBeTruthy();
        }
      }
    }
  });

  it('keeps the skimmable ranges for the toggle that does not exist yet', () => {
    const both = getTrack('full_story_first') as PhasedTrack;
    const skimmable = both.phases.flatMap((p) => p.entries.filter((e) => e.skimmable));
    expect(skimmable.length).toBeGreaterThan(0);
    expect(skimmable.find((e) => e.book === 'Exodus')?.skimmable).toContain('25-40');
  });
});
