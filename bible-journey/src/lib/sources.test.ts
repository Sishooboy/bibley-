import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANON } from '../data/canon';
import { CREDITS } from '../data/credits';
import { QUOTES } from '../data/quotes';
import raw from '../data/readingTracks.json';
import { fold } from './bibleSearch';
import type { Insights } from './insights';
import { bookQuizKey } from './quiz';
import { isVerse, parseRef, type Source } from './sources';

/*
 * What has been sourced so far. **It may only grow**: an area named here is held
 * to the rule that everything carries a source, and one not yet named is exempt
 * while the work goes book by book. A book name covers its introduction, its
 * chapter notes and its heading notes together; `quotes` is the verse of the day
 * and `tracks` the reading orders. When every area is here, nothing the app says
 * is unsourced, and this list and the exemption it grants should both go.
 */
const SOURCED = new Set<string>([
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Tobit', 'Judith', 'Esther',
  '1 Maccabees', '2 Maccabees', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Songs', 'Wisdom', 'Sirach',
  'Isaiah', 'Jeremiah', 'Lamentations', 'Baruch', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah',
  'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
]);
const AREAS = [...CANON, 'quotes', 'tracks'];
const PENDING = new Set<string>(AREAS.filter((a) => !SOURCED.has(a)));

const BIBLE_DIR = join(process.cwd(), 'public/bible');
const insights = JSON.parse(readFileSync(join(BIBLE_DIR, 'insights.json'), 'utf8')) as Insights;

const books = new Map<string, (string | null)[][]>();
function chaptersOf(book: string): (string | null)[][] | undefined {
  if (!CANON.includes(book)) return undefined;
  if (!books.has(book)) {
    const file = join(BIBLE_DIR, `${bookQuizKey(book)}.json`);
    books.set(book, (JSON.parse(readFileSync(file, 'utf8')) as { chapters: (string | null)[][] }).chapters);
  }
  return books.get(book);
}

/** The words a verse source points at, or null if it points at nothing. */
function textOf(ref: string): string | null {
  const parsed = parseRef(ref);
  if (!parsed) return null;
  const verses = chaptersOf(parsed.book)?.[parsed.chapter - 1];
  if (!verses) return null;
  if (parsed.from === undefined) return verses.filter((v) => v !== null).join(' ');
  if (parsed.to! > verses.length) return null;
  const span = verses.slice(parsed.from - 1, parsed.to);
  if (span.some((v) => v === null)) return null;
  return span.join(' ');
}

/** Anything in quotation marks, straight or curly, of two words or more. */
function quoted(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/["“]([^"”]+)["”]/g)) {
    const words = m[1].trim().replace(/[.,;:!?]+$/, '');
    if (words.split(/\s+/).length >= 2) out.push(words);
  }
  return out;
}

type Item = { where: string; text: string; sources: Source[] | undefined; pending: boolean };

/** Every claim the app makes in its own words, with what it says it rests on. */
function items(): Item[] {
  const out: Item[] = [];
  for (const [book, insight] of Object.entries(insights.books)) {
    const pending = PENDING.has(book);
    insight.facts.forEach((fact, i) =>
      out.push({ where: `${book} fact ${i + 1}`, text: fact, sources: insight.factSources?.[i], pending }),
    );
    for (const [chapter, note] of Object.entries(insight.chapters ?? {})) {
      out.push({ where: `${book} ${chapter} note`, text: note.note, sources: note.sources, pending });
    }
    for (const [chapter, sections] of Object.entries(insight.sections ?? {})) {
      for (const s of sections) {
        if (s.n) out.push({ where: `${book} ${chapter}:${s.v} heading note`, text: s.n, sources: s.s, pending });
      }
    }
  }
  for (const q of QUOTES) {
    out.push({ where: `verse of the day ${q.ref}`, text: q.context, sources: q.sources, pending: PENDING.has('quotes') });
  }
  type RawPhase = { name: string; note?: string; note_sources?: Source[] };
  type RawTrack = { id: string; why: string; sources?: { why?: Source[] }; phases?: RawPhase[] };
  const file = raw as unknown as { testaments: Record<string, { tracks: RawTrack[] }> };
  for (const t of Object.values(file.testaments).flatMap((x) => x.tracks)) {
    const pending = PENDING.has('tracks');
    out.push({ where: `${t.id} why`, text: t.why, sources: t.sources?.why, pending });
    for (const p of t.phases ?? []) {
      if (p.note) out.push({ where: `${t.id} ${p.name} note`, text: p.note, sources: p.note_sources, pending });
    }
  }
  return out;
}

const all = items();

describe('the sources behind what the app says', () => {
  it('names only areas that exist in its sourced list', () => {
    for (const s of SOURCED) expect(AREAS, s).toContain(s);
  });

  it('gives everything outside the pending list at least one source', () => {
    for (const item of all.filter((x) => !x.pending)) {
      expect(item.sources?.length ?? 0, `${item.where} has no source`).toBeGreaterThan(0);
    }
  });

  it('gives a book its sources fact by fact, not one list for all three', () => {
    for (const [book, insight] of Object.entries(insights.books)) {
      if (PENDING.has(book)) continue;
      expect(insight.factSources?.length, book).toBe(insight.facts.length);
    }
  });

  it('cites only verses the shipped text has, none of them empty', () => {
    for (const item of all) {
      for (const s of item.sources ?? []) {
        if (isVerse(s)) expect(textOf(s.ref), `${item.where} cites ${s.ref}`).not.toBeNull();
      }
    }
  });

  it('names a title and a secure link for every work outside the Bible', () => {
    for (const item of all) {
      for (const s of item.sources ?? []) {
        if (isVerse(s)) continue;
        expect(s.title.trim().length, item.where).toBeGreaterThan(0);
        expect(s.url, item.where).toMatch(/^https:\/\//);
      }
    }
  });

  // The strong check. Words in quotation marks are a claim that the Bible says
  // exactly that, so they have to be found in the verses the note cites. A note
  // quoting somebody other than the Bible cites that work instead, and the
  // check steps aside for it, since that text is not shipped here to look in.
  it('finds every quoted phrase in the verses it cites', () => {
    for (const item of all.filter((x) => !x.pending)) {
      const sources = item.sources ?? [];
      if (sources.some((s) => !isVerse(s))) continue;
      const cited = fold(
        sources
          .filter(isVerse)
          .map((s) => textOf(s.ref) ?? '')
          .join(' '),
      );
      for (const phrase of quoted(item.text)) {
        expect(cited.includes(fold(phrase)), `${item.where} quotes "${phrase}" from ${sources.map((s) => (isVerse(s) ? s.ref : s.title)).join(', ')}`).toBe(true);
      }
    }
  });
});

describe('the credits', () => {
  it('links every outside work to the page that states its terms', () => {
    for (const c of CREDITS) {
      expect(c.url, c.work).toMatch(/^https:\/\//);
      expect(c.usedFor.length, c.work).toBeGreaterThan(0);
      expect(c.terms.length, c.work).toBeGreaterThan(0);
    }
  });

  it('credits every text the reader and the verse of the day show', () => {
    const works = CREDITS.map((c) => c.work);
    for (const name of ['World English Bible', 'Berean Standard Bible', 'King James Version']) {
      expect(works, name).toContain(name);
    }
  });

  it('follows the house rule on dashes', () => {
    for (const c of CREDITS) expect(`${c.work}${c.usedFor}${c.terms}`, c.work).not.toMatch(/—/);
  });
});
