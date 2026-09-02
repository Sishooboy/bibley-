import raw from './readingTracks.json';

/**
 * Reading tracks: the single source of truth for every reading order.
 *
 * `readingTracks.json` is the data, and nothing in here reorders, edits or
 * invents a sequence. This module's whole job is to resolve what the file
 * describes into the shape the rest of the app already consumes, so the views,
 * `progress.ts` and the `Derived` contract keep working untouched.
 *
 * It is imported, not fetched. 50 KB bundled is the price of the chooser being
 * on screen with no loading state, and every screen after it needs the order
 * synchronously to work out where the reader is.
 */

export type TestamentId = 'old' | 'new' | 'both';

/** A book as the file lists it. `skimmable` is carried, not yet acted on. */
export type TrackBook = {
  book: string;
  chapters: number;
  note?: string;
  /** A chapter range most readers skip, for a "core chapters" toggle later. */
  skimmable?: string;
  /** Placed late on purpose, against canon or chronology. */
  deferred?: boolean;
  deuterocanonical?: boolean;
};

export type TrackPhase = {
  name: string;
  note?: string;
  books?: TrackBook[];
  /** Points at another track whose phases are inlined here. */
  reference?: string;
};

export type TrackStream = {
  id: string;
  name: string;
  daily_chapters: number;
  order_ref?: string;
  order?: string;
  book?: string;
  loops_at?: number;
  counts_toward_completion: boolean;
  note?: string;
};

type RawTrack = {
  id: string;
  name: string;
  tagline: string;
  kind: 'phased' | 'streams';
  recommended: boolean;
  primary: boolean;
  best_for: string;
  tradeoff: string;
  why: string;
  phases?: TrackPhase[];
  structure?: string;
  streams?: TrackStream[];
  completion_denominator?: string;
  estimated_daily_minutes?: number;
  estimated_days?: number;
};

type RawFile = {
  version: string;
  canon: string;
  books: number;
  total_chapters: number;
  testaments: Record<
    TestamentId,
    { total_chapters: number; total_books: number; tracks: RawTrack[] }
  >;
};

const file = raw as unknown as RawFile;

export const CANON_NAME = file.canon;
export const TESTAMENTS: TestamentId[] = ['both', 'old', 'new'];

export const TESTAMENT_LABELS: Record<TestamentId, string> = {
  both: 'The whole Bible',
  old: 'Old Testament',
  new: 'New Testament',
};

export const TESTAMENT_TOTALS: Record<TestamentId, { chapters: number; books: number }> = {
  both: {
    chapters: file.testaments.both.total_chapters,
    books: file.testaments.both.total_books,
  },
  old: { chapters: file.testaments.old.total_chapters, books: file.testaments.old.total_books },
  new: { chapters: file.testaments.new.total_chapters, books: file.testaments.new.total_books },
};

const rawById = new Map<string, RawTrack>();
const testamentOf = new Map<string, TestamentId>();
for (const testament of Object.keys(file.testaments) as TestamentId[]) {
  for (const track of file.testaments[testament].tracks) {
    rawById.set(track.id, track);
    testamentOf.set(track.id, testament);
  }
}

/**
 * Inlines any phase that points at another track.
 *
 * `full_canonical` is two references and nothing else, so without this it is a
 * track with two phases and no books at all. The guard set is per branch rather
 * than shared, so the same track can legitimately be referenced twice while a
 * real cycle still throws instead of hanging.
 */
function resolvePhases(track: RawTrack, seen: ReadonlySet<string> = new Set()): TrackPhase[] {
  if (!track.phases) return [];
  if (seen.has(track.id)) throw new Error(`Reading tracks: reference cycle at ${track.id}`);
  const guard = new Set(seen).add(track.id);

  const out: TrackPhase[] = [];
  for (const phase of track.phases) {
    if (phase.reference) {
      const target = rawById.get(phase.reference);
      if (!target) {
        throw new Error(`Reading tracks: ${track.id} references unknown track ${phase.reference}`);
      }
      out.push(...resolvePhases(target, guard));
    } else {
      out.push(phase);
    }
  }
  return out;
}

/** A phase, resolved and numbered, in the shape `progress.ts` already reads. */
export type Phase = {
  /** 1-based position in this track. The milestone unit, not the progress bar. */
  phase: number;
  title: string;
  why: string;
  books: { name: string; chapters: number }[];
  /** The entries as the file has them, carrying skimmable and deferred. */
  entries: TrackBook[];
};

export type ChapterRef = { book: string; chapter: number; phase: number };

/** The common half of every track, phased or not. */
type TrackBase = {
  id: string;
  testament: TestamentId;
  label: string;
  tagline: string;
  why: string;
  bestFor: string;
  tradeoff: string;
  recommended: boolean;
  primary: boolean;
  /** Kept so existing callers reading `blurb` and `rationale` keep working. */
  blurb: string;
  rationale: string;
};

/**
 * A phased track, shaped so it drops straight into the existing contract:
 * `label`, `blurb`, `rationale`, `phases`, `books`, `bookCount`, `chapterCount`,
 * `sequence` and `phaseOfBook` are all what the old `Plan` provided.
 */
export type PhasedTrack = TrackBase & {
  kind: 'phased';
  phases: Phase[];
  books: { name: string; chapters: number }[];
  bookCount: number;
  chapterCount: number;
  sequence: ChapterRef[];
  phaseOfBook: Map<string, number>;
};

export type StreamTrack = TrackBase & {
  kind: 'streams';
  streams: TrackStream[];
  /** The testament's own total. Psalms and Proverbs run alongside, uncounted. */
  chapterCount: number;
  estimatedDailyMinutes?: number;
  estimatedDays?: number;
};

export type Track = PhasedTrack | StreamTrack;

function build(track: RawTrack): Track {
  const testament = testamentOf.get(track.id)!;
  const base: TrackBase = {
    id: track.id,
    testament,
    label: track.name,
    tagline: track.tagline,
    why: track.why,
    bestFor: track.best_for,
    tradeoff: track.tradeoff,
    recommended: track.recommended,
    primary: track.primary,
    blurb: track.tagline,
    rationale: track.why,
  };

  if (track.kind === 'streams') {
    return {
      ...base,
      kind: 'streams',
      streams: track.streams ?? [],
      chapterCount: TESTAMENT_TOTALS[testament].chapters,
      estimatedDailyMinutes: track.estimated_daily_minutes,
      estimatedDays: track.estimated_days,
    };
  }

  const phases: Phase[] = resolvePhases(track).map((phase, i) => ({
    phase: i + 1,
    title: phase.name,
    why: phase.note ?? '',
    books: (phase.books ?? []).map((b) => ({ name: b.book, chapters: b.chapters })),
    entries: phase.books ?? [],
  }));

  const books = phases.flatMap((p) => p.books);
  return {
    ...base,
    kind: 'phased',
    phases,
    books,
    bookCount: books.length,
    chapterCount: books.reduce((n, b) => n + b.chapters, 0),
    sequence: phases.flatMap((p) =>
      p.books.flatMap((b) =>
        Array.from({ length: b.chapters }, (_, i) => ({
          book: b.name,
          chapter: i + 1,
          phase: p.phase,
        })),
      ),
    ),
    phaseOfBook: new Map(phases.flatMap((p) => p.books.map((b) => [b.name, p.phase] as const))),
  };
}

export const TRACKS: Map<string, Track> = new Map(
  [...rawById.values()].map((t) => [t.id, build(t)]),
);

/**
 * The cards for one testament: only `primary` tracks, recommended first.
 *
 * The file keeps orders with `primary: false` that are real but not worth a
 * card, `full_chronological` among them.
 */
export function tracksFor(testament: TestamentId): Track[] {
  return [...TRACKS.values()]
    .filter((t) => t.testament === testament && t.primary)
    .sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

export function recommendedFor(testament: TestamentId): Track {
  const cards = tracksFor(testament);
  return cards.find((t) => t.recommended) ?? cards[0];
}

export const DEFAULT_TRACK = 'full_story_first';

export function isTrackId(value: unknown): value is string {
  return typeof value === 'string' && TRACKS.has(value);
}

export function getTrack(id: string | undefined): Track {
  return (id !== undefined && TRACKS.get(id)) || TRACKS.get(DEFAULT_TRACK)!;
}

/**
 * What the three old plan ids become.
 *
 * A journal written before tracks carries `planId: 'both' | 'nt' | 'ot'`, and
 * each of those was a story-ordered plan, so each maps to the story-first track
 * for its testament. Nothing else about the journal moves: progress stays global
 * and keyed by book and chapter, so every mark survives the change.
 */
export const LEGACY_PLAN_TRACKS: Record<string, string> = {
  both: 'full_story_first',
  nt: 'nt_story_first',
  ot: 'ot_story_first',
};

/** Resolves a stored id, old or new, to a track id. */
export function trackIdFrom(stored: unknown): string | undefined {
  if (typeof stored !== 'string') return undefined;
  if (TRACKS.has(stored)) return stored;
  return LEGACY_PLAN_TRACKS[stored];
}
