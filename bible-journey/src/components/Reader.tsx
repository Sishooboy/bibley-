import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { CANON, NEW_TESTAMENT, OLD_TESTAMENT } from '../data/canon';
import { cachedBook, loadBook, type BookText } from '../lib/bible';
import { BOOK_BY_NAME } from '../data/plan';
import {
  DEFAULT_TRANSLATION,
  TRANSLATIONS,
  hasBook,
  hasChapter,
  highlightTranslation,
  isKnownTranslation,
  setTranslation,
  translationById,
  useTranslation,
  type TranslationId,
} from '../lib/translations';
import {
  highlightsFor,
  isEmptyRange,
  offsetWithin,
  order,
  segmentVerse,
  verseRootOf,
  type Range,
} from '../lib/highlight';
import { relativeDay, today } from '../lib/dates';
import { plural } from '../lib/format';
import {
  bookInsight,
  cachedInsights,
  chapterNote,
  loadInsights,
  markSeen,
  noteSeenKey,
  presentation,
  sectionsFor,
  seenSet,
  sheetKey,
  type Insights,
  type NoteMode,
  type Section,
} from '../lib/insights';
import { useKeyboardInset } from '../lib/keyboard';
import { neighbours } from '../lib/navigate';
import { blocksFor } from '../lib/passage';
import {
  DEFAULT_PREFS,
  TEXT_SIZES,
  dismissQuizOffer,
  markFolded,
  quizOfferDismissed,
  setMarkFolded,
  textScale,
} from '../lib/prefs';
import { bookQuizKey, quizSize } from '../lib/quiz';
import { hasQuiz } from '../lib/quizData';
import { scrollAppToTop } from '../lib/scroll';
import { chime } from '../lib/sound';
import type { HighlightColour } from '../lib/colours';
import { chapterKey, newId, type Highlight } from '../lib/storage';
import { useQuiz } from '../state/useQuiz';
import { useStore } from '../state/useStore';
import { BibleSearch } from './BibleSearch';
import { ChapterNoteSheet } from './ChapterNoteSheet';
import { HighlightSheet } from './HighlightSheet';
import { AboutPill, BookSheet, ChapterNoteCard } from './Insight';
import { SourceLine } from './Sources';
import { ListenBar } from './ListenBar';
import { LogDayPicker } from './LogDayPicker';
import { Check, Chevron, Search, Speaker } from './icons';

/**
 * The reader. Until this existed you tracked your reading in Bibley and did the
 * reading somewhere else, which made the app a logbook for a habit it did not
 * host.
 *
 * Chapters move in plan order where the plan has an opinion, so reading straight
 * through walks the plan. Anywhere else, and anywhere the reader has wandered off
 * to on their own, printed order takes over.
 */
/**
 * A heading over a paragraph, and the note some of them carry.
 *
 * Modern Bibles all have these and almost none of them are usable: the headings
 * in the NIV, the ESV and the NASB are editorial work under their own copyright
 * even where the translation is old. The World English Bible, which is the text
 * here precisely because it is public domain, has none of its own, so the
 * headings come from the Berean Standard Bible, which is public domain too and
 * is credited in the footer. The notes are this app's own, and each names the
 * verses it rests on, so a reader can check a note rather than take it on trust.
 *
 * The note is shut until it is asked for. A reader who came to read should meet
 * a heading, not a paragraph of commentary between them and the next sentence.
 */
function SectionHead({ section, quotesFrom }: { section: Section; quotesFrom?: string }) {
  const [open, setOpen] = useState(false);

  if (!section.n) {
    return <h3 className="passage">{section.t}</h3>;
  }

  return (
    <div className="passage passage--noted">
      <button
        type="button"
        className="passage__toggle"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <h3 className="passage__title">{section.t}</h3>
        <span className="passage__why">
          {open ? 'Hide' : 'Why this matters'}
          <Chevron size={12} className="passage__chev" />
        </span>
      </button>
      {open && (
        <div className="passage__note">
          <p>{section.n}</p>
          <SourceLine sources={section.s} quotesFrom={quotesFrom} />
        </div>
      )}
    </div>
  );
}

/**
 * One verse: its number, then its words.
 *
 * `data-verse` marks the text span and only the text span. Put it on the
 * paragraph and the verse number counts as characters, so every highlight lands
 * one place off, or two past verse nine. That mattered when a paragraph held
 * one verse and it matters more now that it holds eight.
 */
function VerseText({
  n,
  text,
  marks,
  landed,
  onOpenNote,
}: {
  n: number;
  text: string;
  marks: Highlight[];
  landed: boolean;
  onOpenNote: (id: string) => void;
}) {
  return (
    <>
      <span className="verse__n" aria-hidden="true">
        {n}
      </span>
      <span
        className="verse__t"
        data-verse={n}
        // Set from React rather than added to className imperatively, which is
        // the mistake that once left an opened note invisible.
        data-landed={landed ? '' : undefined}
      >
        {segmentVerse(text, n, marks).map((segment, s) =>
          segment.id ? (
            <mark
              key={s}
              className={`hl${segment.note ? ' hl--noted' : ''}`}
              // An attribute rather than a third class, so the colour rules
              // outrank `.hl` on specificity instead of depending on where in
              // the file they sit, which is the trap that has cost this
              // stylesheet an afternoon more than once.
              data-colour={segment.colour}
              // Reading is the default, so opening a note is a tap rather than
              // something a stray drag can trigger.
              onClick={() => onOpenNote(segment.id!)}
            >
              {segment.text}
            </mark>
          ) : (
            <span key={s}>{segment.text}</span>
          ),
        )}
      </span>
    </>
  );
}

type Turn = 'next' | 'back';

/** A chapter's place in the printed Bible, for telling forwards from back. */
function printedOrder(book: string, chapter: number): number {
  return CANON.indexOf(book) * 1000 + chapter;
}

/*
 * How long each line of the placeholder runs, as a share of the column. Fixed
 * rather than random so it is the same shape every time and never reflows,
 * and ragged on the right the way set text is.
 */
const SKELETON = [1, 0.96, 1, 0.9, 0.98, 0.62, 1, 0.94, 0.86];

/**
 * What the reader shows while a book it has never opened is on its way: the
 * heading it already knows, and grey lines where the paragraph will be, so the
 * text lands into a page shaped like itself rather than replacing a sentence
 * in the middle of an empty screen. Faded in after a beat, so a fast network
 * never flashes it at all.
 */
function Opening({ book, chapter }: { book: string; chapter: number }) {
  return (
    <div className="reader__text reader__skeleton" role="status">
      <h2 className="reader__heading">
        {book} {chapter}
      </h2>
      <span className="sr-only">Opening {book}</span>
      <div className="reader__skLines" aria-hidden="true">
        {SKELETON.map((w, i) => (
          <span key={i} className="reader__skLine" style={{ '--w': w } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}

export function Reader({
  book,
  chapter,
  landOn,
  closing = false,
  onNavigate,
  onClose,
}: {
  book: string;
  chapter: number;
  /** A verse to land on, for a reader opened at a passage rather than a chapter. */
  landOn?: number;
  /** True for the moment it takes to leave, after Close and before unmount. */
  closing?: boolean;
  onNavigate: (book: string, chapter: number) => void;
  onClose: () => void;
}) {
  const { data, derived, toggleChapter, addHighlight, setPrefs, noteFor } = useStore();
  const { plan } = derived;
  const prefs = data.prefs ?? DEFAULT_PREFS;
  const chosen = useTranslation();
  /*
   * A book or chapter the chosen translation does not have, the deuterocanon in
   * the Free Bible Version, is never an empty page and never another
   * translation's words passed off under its name. The page says it is not
   * there, and offers the World English Bible, which has every book. Taking
   * that offer borrows the WEB for this book only: the device keeps its choice,
   * so the next book opens in the chosen translation again without anyone
   * having to remember to switch back.
   *
   * `translation` is the words on the page, which is what highlights, quotes
   * and the credit all have to agree with, so it is the borrowed one while the
   * WEB is standing in.
   */
  const [borrowed, setBorrowed] = useState<string | null>(null);
  const absent = !hasChapter(chosen, book, chapter);
  const translation: TranslationId = absent && borrowed === book ? DEFAULT_TRANSLATION : chosen;
  const missing = absent && borrowed !== book;
  const reading = translationById(translation);
  /** Whether the list of translations is open under the chapter's name. */
  const [choosing, setChoosing] = useState(false);
  /*
   * The app's own notes quote the World English Bible, and when another
   * translation is open the words on the page will not match theirs, so the
   * notes say whose wording they are quoting rather than leave a reader to
   * wonder whether the note or the page is wrong.
   */
  const quotesFrom = translation === DEFAULT_TRANSLATION ? undefined : translationById(DEFAULT_TRANSLATION).name;
  const [text, setText] = useState<BookText | undefined>(() => cachedBook(book, translation));
  const [error, setError] = useState<string | null>(null);
  /** The highlight whose note is open, or a pending range not yet saved. */
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState<Range | null>(null);
  const [searching, setSearching] = useState(false);
  /*
   * Listening stays on while you page through chapters, and goes off when the
   * reader closes. It is deliberately not remembered across opens: sound
   * starting by itself because of something you did days ago is startling, and
   * the button is one tap.
   */
  const [listening, setListening] = useState(false);
  /** A verse arrived at from a search result, marked until it has been seen. */
  const [landedOn, setLandedOn] = useState<number | null>(landOn ?? null);
  /**
   * True for a moment after marking, and only marking: it drives the gold sweep
   * across the button. Unmarking gets no sweep, since taking something back is
   * not a thing to celebrate, and turning the page clears it so a sweep never
   * plays on a chapter it was not for.
   */
  const [justMarked, setJustMarked] = useState(false);
  /*
   * Whether the marking controls are folded away. Device-local rather than a
   * journal field, so it survives a chapter change and a reload without
   * needing a release that reads it shipped before one writes it.
   */
  const [folded, setFoldedState] = useState(markFolded);
  const setFolded = useCallback((next: boolean) => {
    setFoldedState(next);
    setMarkFolded(next);
  }, []);
  /** The book cards and chapter notes, fetched once like the text. */
  const [insights, setInsights] = useState<Insights | undefined>(cachedInsights);
  /** Whether the book's card is up, and whether it was asked for rather than arriving. */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetReplay, setSheetReplay] = useState(false);
  const [noteMode, setNoteMode] = useState<NoteMode>('none');
  /** Whether the reader's own note on this chapter is open for writing. */
  const [noting, setNoting] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const keyboard = useKeyboardInset();
  /*
   * Which way the page turned, for the slide the new text arrives on. Worked
   * out during render, from where the reader was against where it is now in
   * printed order, so the very first frame of the new chapter already knows
   * its direction; an effect would paint the text in place for one frame and
   * then start it sliding, which reads as a flicker. Null on open, because
   * opening the reader is not turning a page.
   */
  const [place, setPlace] = useState<{ book: string; chapter: number; turn: Turn | null }>({
    book,
    chapter,
    turn: null,
  });
  if (place.book !== book || place.chapter !== chapter) {
    setPlace({
      book,
      chapter,
      turn: printedOrder(book, chapter) >= printedOrder(place.book, place.chapter) ? 'next' : 'back',
    });
  }

  useEffect(() => {
    setJustMarked(false);
  }, [book, chapter]);

  useEffect(() => {
    let live = true;
    void loadInsights().then((loaded) => live && setInsights(loaded));
    return () => {
      live = false;
    };
  }, []);

  /*
   * Decided once per chapter opened, and deliberately not again when the
   * journal changes under it: marking this chapter must not re-present a card
   * that was just dismissed. `readInBook` is read at that moment for the same
   * reason. The sheet's chime plays here; a note's waits until the sheet has
   * gone, or plays at once when there is none, so two sounds never arrive
   * together.
   */
  useEffect(() => {
    if (!insights) return;
    const seen = seenSet();
    let readInBook = 0;
    for (const k of Object.keys(data.read)) if (k.startsWith(`${book}|`)) readInBook++;
    const shown = presentation({
      hasBook: !!bookInsight(insights, book),
      seenBook: seen.has(sheetKey(book)),
      readInBook,
      hasNote: !!chapterNote(insights, book, chapter),
      seenNote: seen.has(noteSeenKey(book, chapter)),
    });
    setSheetReplay(false);
    setSheetOpen(shown.sheet);
    setNoteMode(shown.note);
    if (shown.sheet) chime('open');
    else if (shown.note === 'reveal') {
      chime('note');
      markSeen(noteSeenKey(book, chapter));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, chapter, insights]);

  const dismissSheet = () => {
    if (!sheetReplay) {
      markSeen(sheetKey(book));
      if (noteMode === 'reveal') {
        chime('note');
        markSeen(noteSeenKey(book, chapter));
      }
    }
    setSheetOpen(false);
    setSheetReplay(false);
  };
  useEffect(() => {
    if (!justMarked) return;
    const timer = setTimeout(() => setJustMarked(false), 900);
    return () => clearTimeout(timer);
  }, [justMarked]);

  const key = chapterKey(book, chapter);
  const isRead = key in data.read;
  /*
   * How many chapters of this book are still unread, this one included. When
   * that is one, pressing the button finishes the book, and the button should
   * say so rather than "Mark as read" like any other chapter: it is the
   * difference between a task and a milestone, and the celebration that
   * follows should not be a surprise. Needs the text loaded to know the
   * chapter count; until then it falls back to the plain label.
   */
  const bookTotal = text?.chapters.length ?? 0;
  let unreadLeft = 0;
  for (let c = 1; c <= bookTotal; c++) if (!(chapterKey(book, c) in data.read)) unreadLeft++;
  const lastOne = !isRead && bookTotal > 0 && unreadLeft === 1;
  /*
   * The quiz offer: once a book is finished, if it has a quiz nobody has taken
   * and the reader has not said no. It appears under the celebration and is
   * there when that closes, never on top of it. Saying no is remembered on the
   * device, so it is asked once.
   */
  const quiz = useQuiz();
  const quizKey = bookQuizKey(book);
  const [, setOfferSeen] = useState(0);
  const offerQuiz =
    bookTotal > 0 &&
    unreadLeft === 0 &&
    hasQuiz(book) &&
    !data.quizzes?.[quizKey] &&
    !quizOfferDismissed(quizKey);
  const readOn = data.read[key];
  /*
   * Only the highlights made in the translation that is open. A highlight is a
   * pair of character positions inside one translation's verse strings, so drawn
   * over another translation's words it would mark the wrong ones. The rest are
   * counted, so the page can say they exist rather than seem to have lost them.
   */
  const { marks, elsewhere, elsewhereIn } = useMemo(() => {
    const all = highlightsFor(data.highlights, book, chapter);
    const here = all.filter((h) => highlightTranslation(h) === translation);
    // Somewhere to send the reader to see them, if this build can open it.
    const away = all
      .map(highlightTranslation)
      .filter((id): id is TranslationId => id !== translation && isKnownTranslation(id))[0];
    return { marks: here, elsewhere: all.length - here.length, elsewhereIn: away };
  }, [data.highlights, book, chapter, translation]);

  const { previous, next } = useMemo(
    () => neighbours(book, chapter, plan),
    [book, chapter, plan],
  );

  useEffect(() => {
    let live = true;
    // No file was shipped for a book the translation does not have, so there is
    // nothing to wait for; the page says so instead.
    if (!hasBook(translation, book)) {
      setText(undefined);
      setError(null);
      return;
    }
    const hit = cachedBook(book, translation);
    if (hit) {
      setText(hit);
      setError(null);
      return;
    }
    setText(undefined);
    setError(null);
    loadBook(book, translation)
      .then((loaded) => live && setText(loaded))
      .catch(() => {
        if (!live) return;
        setError(
          'That book has not been saved on this device yet, and there is no connection to fetch it. Anything you have already opened still works offline, and Settings can save the rest for next time.',
        );
      });
    return () => {
      live = false;
    };
  }, [book, translation]);

  // A new chapter starts at the top, the way turning a page does.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    setPending(null);
    setEditing(null);
    setNoting(false);
    setChoosing(false);
  }, [book, chapter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editing || pending) {
          setEditing(null);
          setPending(null);
        } else if (noting) setNoting(false);
        else if (searching) setSearching(false);
        else onClose();
        return;
      }
      // Arrow keys would fight a text selection, a note being typed and a
      // search field, so they stay out of the way of all three.
      if (editing || pending || noting || searching) return;
      if (e.key === 'ArrowLeft' && previous) onNavigate(previous.book, previous.chapter);
      if (e.key === 'ArrowRight' && next) onNavigate(next.book, next.chapter);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onNavigate, previous, next, editing, pending, noting, searching]);

  // The page behind must not scroll while a full-screen sheet is open.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  /*
   * iOS scrolls the document to reveal a focused field even when that field is
   * inside a fixed element, which drags the reader off the top of the screen and
   * takes the passage with it. The sheet moves itself above the keyboard, so
   * that scroll has nothing left to achieve and is put straight back.
   */
  useEffect(() => {
    if (keyboard === 0) return;
    scrollAppToTop();
  }, [keyboard]);

  /*
   * Arriving from a search result. Declared after the effect that sends a new
   * chapter back to the top, so this one wins and lands on the verse instead.
   * The mark clears itself: it is there to answer "which one was it", and once
   * you are looking at it that is answered.
   */
  useEffect(() => {
    if (landedOn === null || !text) return;
    bodyRef.current
      ?.querySelector(`[data-verse="${landedOn}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const timer = window.setTimeout(() => setLandedOn(null), 2800);
    return () => window.clearTimeout(timer);
  }, [landedOn, text, chapter]);

  // Opened at a passage again while already open, say from a second quiz
  // answer: land on the new verse the same way.
  useEffect(() => {
    if (landOn) setLandedOn(landOn);
  }, [landOn, book, chapter]);

  /*
   * This claims aria-modal, so focus has to actually live inside it. Without
   * this, opening the reader leaves focus on the button behind and a keyboard
   * tabs through a page it cannot see. The opener gets its focus back on close.
   */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !shellRef.current) return;
      const focusable = shellRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select, textarea, [href]',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onTab);
    return () => {
      document.removeEventListener('keydown', onTab);
      opener?.focus?.();
    };
  }, []);

  /** Turns whatever the reader dragged over into verse and character offsets. */
  const readSelection = useCallback((): Range | null => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

    const root = textRef.current;
    if (!root) return null;

    const startVerse = verseRootOf(selection.anchorNode);
    const endVerse = verseRootOf(selection.focusNode);
    if (!startVerse || !endVerse || !root.contains(startVerse) || !root.contains(endVerse)) {
      return null;
    }

    const range = order(
      {
        verse: Number(startVerse.dataset.verse),
        offset: offsetWithin(startVerse, selection.anchorNode!, selection.anchorOffset),
      },
      {
        verse: Number(endVerse.dataset.verse),
        offset: offsetWithin(endVerse, selection.focusNode!, selection.focusOffset),
      },
    );

    return isEmptyRange(range) ? null : range;
  }, []);

  const onSelectionEnd = useCallback(() => {
    const range = readSelection();
    if (range) {
      setPending(range);
      setEditing(null);
    }
  }, [readSelection]);

  /*
   * A phone does not end a long-press selection with a tidy touchend, and
   * dragging the selection handles afterwards fires nothing at all. Watching for
   * the selection to settle is what makes this work with a thumb rather than
   * only with a mouse.
   */
  useEffect(() => {
    let timer = 0;
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(onSelectionEnd, 400);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('selectionchange', onChange);
    };
  }, [onSelectionEnd]);

  /** The selected words, stitched across verses. Used for the preview and the save. */
  const quoteFor = useCallback(
    (range: Range): string => {
      if (!text) return '';
      const parts: string[] = [];
      for (let v = range.from.verse; v <= range.to.verse; v++) {
        const verse = text.chapters[chapter - 1]?.[v - 1];
        if (!verse) continue;
        const start = v === range.from.verse ? range.from.offset : 0;
        const end = v === range.to.verse ? range.to.offset : verse.length;
        parts.push(verse.slice(start, end).trim());
      }
      return parts.filter(Boolean).join(' ');
    },
    [text, chapter],
  );

  const commitPending = useCallback(
    (note: string, colour: HighlightColour) => {
      if (!pending || !text) return;
      const now = new Date().toISOString();
      const highlight: Highlight = {
        id: newId(),
        book,
        chapter,
        from: pending.from,
        to: pending.to,
        text: quoteFor(pending),
        note: note.trim() || undefined,
        colour,
        // Absent means the World English Bible, which is what every highlight
        // made before there was a choice already is, so only another is written.
        translation: translation === DEFAULT_TRANSLATION ? undefined : translation,
        createdAt: now,
        updatedAt: now,
      };
      addHighlight(highlight);
      setPending(null);
      window.getSelection()?.removeAllRanges();
    },
    [pending, text, book, chapter, addHighlight, quoteFor, translation],
  );

  // A book the translation does not have has no file to count, and the chapter
  // picker is the way on from it, so the canon answers instead.
  const chapterCount = text?.chapters.length ?? (missing ? (BOOK_BY_NAME.get(book)?.chapters ?? 0) : 0);
  const verses = text?.chapters[chapter - 1];
  /*
   * Where the paragraphs are. Memoised on the chapter rather than worked out
   * per render, since it walks every verse and the reader re-renders on every
   * drag while a selection is being made.
   */
  /** Verse number to the heading that sits above it, for a lookup a block. */
  const headings = useMemo(
    () => new Map(sectionsFor(insights, book, chapter).map((sec) => [sec.v, sec])),
    [insights, book, chapter],
  );
  /*
   * Where the paragraphs are. Memoised on the chapter rather than worked out
   * per render, since it walks every verse and the reader re-renders on every
   * drag while a selection is being made.
   *
   * The headings go in as well as coming out: a heading opens a paragraph, so
   * the blocks cannot be worked out without knowing where they are.
   */
  const blocks = useMemo(
    () =>
      verses ? blocksFor(verses, text?.layout?.[chapter - 1], new Set(headings.keys())) : [],
    [verses, text, chapter, headings],
  );
  const open = marks.find((h) => h.id === editing);

  /*
   * The row under the chapter's name, shared by the text and by the page that
   * says a chapter is not in this translation, since that page is exactly where
   * somebody needs a way to another translation.
   */
  const pills = (
    <>
      {absent && !missing && (
        <p className="reader__elsewhere">
          {hasBook(chosen, book) ? `${book} ${chapter}` : book} is not in the{' '}
          {translationById(chosen).name}, so this is the {reading.name}. Other books still open in
          the {translationById(chosen).name}.
        </p>
      )}
      {/*
        The translation lives here and not in the bar. It was a fourth 38px
        circle there first, and on a 375px phone it squeezed the book picker to
        54px, which printed Genesis as "G": the failure the bar's gap rule
        exists to prevent. Under the chapter's name it costs the bar nothing and
        has room to name the translation in full.

        It opens a list rather than flipping to the next one. A flip was right
        with two, where "Switch to KJV" says exactly what a tap does; with three
        it is a cycle, and somebody after the plain one would have to read past
        the King James to reach it, which is the wrong way round for the
        reader it exists for. The list says what each one is like, so the
        choice can be made without trying all three.
      */}
      <div className="reader__pills">
        {bookInsight(insights, book) && !sheetOpen && (
          <AboutPill
            book={book}
            onOpen={() => {
              setSheetReplay(true);
              setSheetOpen(true);
            }}
          />
        )}
        <button
          type="button"
          className="aboutPill reader__translationPill"
          aria-expanded={choosing}
          aria-controls="reader-translations"
          onClick={() => setChoosing((was) => !was)}
          aria-label={`Reading the ${reading.name}. Choose a translation.`}
        >
          {reading.name}
          <span className="reader__translationSwitch" aria-hidden="true">
            {choosing ? 'Close' : 'Change'}
          </span>
        </button>
        {/*
          A chapter note could only be written from the journey's book
          panel, so somebody reading had to close the reader, find the
          book, open it, and pick the chapter from a list to write down a
          thought they were having now. Here it is one tap from the words.
        */}
        <button
          type="button"
          className="aboutPill reader__notePill"
          data-has={noteFor(book, chapter) ? '' : undefined}
          onClick={() => {
            setPending(null);
            setEditing(null);
            setNoting(true);
          }}
        >
          {noteFor(book, chapter) ? 'Your note' : 'Add a note'}
        </button>
      </div>
      {choosing && (
        <div id="reader-translations" className="translationList" role="group" aria-label="Translations">
          {TRANSLATIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="translationList__item"
              aria-pressed={t.id === translation}
              onClick={() => {
                setTranslation(t.id);
                setBorrowed(null);
                setChoosing(false);
              }}
            >
              <span className="translationList__name">{t.name}</span>
              <span className="translationList__about">
                {t.about}
                {t.lacksBooks && `, without the ${t.lacksBooks.length} deuterocanonical books`}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div
      className="reader"
      data-closing={closing ? '' : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={`${book} ${chapter}`}
      ref={shellRef}
      // The keyboard is a length the sheet sits above and a state the sheet
      // gets smaller in. CSS decides what to do with both.
      data-keyboard={keyboard > 0 ? 'open' : undefined}
      style={
        {
          '--verse-scale': textScale(prefs.textSize),
          '--keyboard': `${keyboard}px`,
        } as CSSProperties
      }
    >
      <header className="reader__bar">
        <button
          type="button"
          className="reader__close"
          onClick={onClose}
          aria-label="Close reader"
          ref={closeRef}
        >
          ✕
        </button>

        <div className="reader__ref">
          {/* Every book, not only the ones in the plan: how you read is yours. */}
          <select
            className="select reader__book"
            value={book}
            aria-label="Book"
            onChange={(e) => onNavigate(e.target.value, 1)}
          >
            <optgroup label="Old Testament">
              {OLD_TESTAMENT.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
            <optgroup label="New Testament">
              {NEW_TESTAMENT.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          </select>

          {chapterCount > 0 && (
            <select
              className="select reader__chapter"
              value={chapter}
              aria-label="Chapter"
              onChange={(e) => onNavigate(book, Number(e.target.value))}
            >
              {Array.from({ length: chapterCount }, (_, i) => (
                // A tick beside the chapters already read, so the picker doubles
                // as the answer to "where had I got to".
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                  {chapterKey(book, i + 1) in data.read ? ' ✓' : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          type="button"
          className={`reader__tool${listening ? ' reader__tool--on' : ''}`}
          onClick={() => setListening((on) => !on)}
          aria-pressed={listening}
          aria-label="Listen to this chapter"
          title="Listen"
        >
          <Speaker size={16} />
        </button>

        <button
          type="button"
          className={`reader__tool${searching ? ' reader__tool--on' : ''}`}
          onClick={() => setSearching((on) => !on)}
          aria-pressed={searching}
          aria-label="Search the Bible text"
          title="Search the text"
        >
          <Search size={16} />
        </button>

        <button
          type="button"
          className="reader__size"
          // Cycles rather than opening a menu: four steps is short enough that
          // tapping through them is faster than choosing from a list.
          onClick={() =>
            setPrefs({
              ...prefs,
              textSize: ((prefs.textSize ?? 1) + 1) % TEXT_SIZES.length,
            })
          }
          aria-label={`Text size, currently ${(prefs.textSize ?? 1) + 1} of ${TEXT_SIZES.length}`}
          title="Text size"
        >
          <span className="reader__sizeLetters">
            <span className="reader__sizeSmall">A</span>
            <span className="reader__sizeBig">A</span>
          </span>
        </button>

        {isRead && (
          <span className="reader__done" title="Marked as read">
            <Check size={14} />
          </span>
        )}
      </header>

      {listening && (
        <ListenBar book={book} chapter={chapter} onClose={() => setListening(false)} />
      )}

      <div className="reader__body" ref={bodyRef} data-sheet={sheetOpen ? '' : undefined}>
        {searching ? (
          <BibleSearch
            onClose={() => setSearching(false)}
            onPick={(toBook, toChapter, verse) => {
              setSearching(false);
              setLandedOn(verse);
              if (toBook !== book || toChapter !== chapter) onNavigate(toBook, toChapter);
            }}
          />
        ) : missing ? (
          <div key={`${book}|${chapter}`} className="reader__text" data-turn={place.turn ?? undefined}>
            <h2 className="reader__heading">
              {book} {chapter}
            </h2>
            {pills}
            <div className="absent" role="status">
              <p className="absent__title">
                {hasBook(chosen, book) ? `${book} ${chapter}` : book} is not in the{' '}
                {translationById(chosen).name}
              </p>
              <p className="absent__why">
                {hasBook(chosen, book)
                  ? `This chapter comes from the Greek text of ${book}, which the ${translationById(chosen).name} leaves out, as most protestant Bibles do.`
                  : `The ${translationById(chosen).name} is a protestant Bible, so it does not have the seven deuterocanonical books. The World English Bible has every book this app prints.`}
              </p>
              {/* Not red: the mark button below already is, and there is one red
                  button at a time. */}
              <button type="button" className="btn" onClick={() => setBorrowed(book)}>
                Read it in the {translationById(DEFAULT_TRANSLATION).name}
              </button>
            </div>
          </div>
        ) : error ? (
          <p className="reader__message">{error}</p>
        ) : !verses ? (
          <Opening book={book} chapter={chapter} />
        ) : (
          <article
            /* Keyed on the chapter so a new page is a new element and its
               arrival animation runs; the same element with new verses in it
               would simply change under the reader's eyes. */
            key={`${book}|${chapter}`}
            className="reader__text"
            data-turn={place.turn ?? undefined}
            ref={textRef}
            onMouseUp={onSelectionEnd}
            onTouchEnd={onSelectionEnd}
          >
            <h2 className="reader__heading">
              {book} {chapter}
            </h2>
            {elsewhere > 0 && (
              <p className="reader__elsewhere">
                {elsewhere === 1 ? 'One highlight' : `${elsewhere} highlights`} in this chapter{' '}
                {elsewhere === 1 ? 'was' : 'were'} made in another translation.{' '}
                {elsewhereIn && (
                  <button
                    type="button"
                    className="reader__elsewhereSwitch"
                    onClick={() => setTranslation(elsewhereIn)}
                  >
                    Show {elsewhere === 1 ? 'it' : 'them'}
                  </button>
                )}
              </p>
            )}
            {pills}
            {/* Held back while the sheet is up, so its lines rise after the
                card has gone rather than underneath it. */}
            {!sheetOpen && chapterNote(insights, book, chapter) && (
              <ChapterNoteCard
                key={`${book}-${chapter}`}
                note={chapterNote(insights, book, chapter)!}
                mode={noteMode}
                quotesFrom={quotesFrom}
              />
            )}
            {/*
              Blocks, not verses. The verse span inside is unchanged and there
              is still exactly one of them a verse carrying `data-verse`, which
              is the whole constraint: highlights are character offsets inside a
              verse string, so a verse split across two elements would put every
              highlight already recorded on the wrong half.
            */}
            {blocks.map((block, b) => (
              <Fragment key={b}>
                {/* Above the paragraph it belongs to, never inside it. The
                    heading's verse is the first verse of a block, which a test
                    pins, so this can never cut a paragraph in half. */}
                {headings.get(block.verses[0]) && (
                  <SectionHead section={headings.get(block.verses[0])!} quotesFrom={quotesFrom} />
                )}
                {block.kind === 'poetry' ? (
                <p
                  className="verse verse--poetry"
                  data-indent={block.indent}
                  data-stanza={block.stanza ? '' : undefined}
                >
                  {block.verses.map((n) => (
                    <VerseText
                      key={n}
                      n={n}
                      text={verses[n - 1] as string}
                      marks={marks}
                      landed={landedOn === n}
                      onOpenNote={(id) => {
                        setPending(null);
                        setEditing(id);
                      }}
                    />
                  ))}
                </p>
              ) : (
                <p className="verse">
                  {block.verses.map((n) => (
                    <VerseText
                      key={n}
                      n={n}
                      text={verses[n - 1] as string}
                      marks={marks}
                      landed={landedOn === n}
                      onOpenNote={(id) => {
                        setPending(null);
                        setEditing(id);
                      }}
                    />
                  ))}
                </p>
                )}
              </Fragment>
            ))}
            {/*
              Both are public domain and neither asks for this, but taking three
              thousand headings from someone else's work and printing them
              unattributed beside a translation this app does credit would be
              the wrong way round.
            */}
            <p className="reader__credit">
              {reading.credit}
              {/* A Creative Commons licence asks for a link to itself, not only its name. */}
              {reading.licence && (
                <>
                  {', '}
                  <a href={reading.licence.url} target="_blank" rel="noreferrer license">
                    {reading.licence.name}
                  </a>
                </>
              )}
              {headings.size > 0 && <span>Headings from the Berean Standard Bible</span>}
            </p>
          </article>
        )}
      </div>

      {(pending || open) && (
        <HighlightSheet
          highlight={open}
          pendingText={pending ? quoteFor(pending) : ''}
          /*
           * A saved highlight already knows where it is; a selection still
           * being made does not, and the reader is the only thing that does. So
           * it is worked out here for both, which is what lets a passage be
           * handed on without first being kept.
           */
          sendable={
            open
              ? { book: open.book, chapter: open.chapter, from: open.from, to: open.to }
              : pending
                ? { book, chapter, from: pending.from, to: pending.to }
                : undefined
          }
          onSave={commitPending}
          onClose={() => {
            setPending(null);
            setEditing(null);
          }}
        />
      )}

      {/* One sheet at a time: a selection made while the note is open wins. */}
      {noting && !pending && !open && (
        <ChapterNoteSheet book={book} chapter={chapter} onClose={() => setNoting(false)} />
      )}

      {/*
        Gone while searching. Marking a chapter as read, or paging to the next
        one, is about the chapter behind the results, and neither means anything
        while you are looking at a list of verses from elsewhere.
      */}
      {!searching && (
      <footer className={`reader__foot${folded ? ' reader__foot--shut' : ''}`}>
        {offerQuiz && (
          <div className="quizOffer">
            <button type="button" className="quizOffer__go" onClick={() => quiz.open(book)}>
              <span className="quizOffer__eyebrow">{book}, finished</span>
              <span className="quizOffer__text">
                Take the quiz, {plural(quizSize(bookTotal), 'question')}
              </span>
            </button>
            <button
              type="button"
              className="quizOffer__no"
              aria-label={`No thanks to the ${book} quiz`}
              onClick={() => {
                dismissQuizOffer(quizKey);
                setOfferSeen((n) => n + 1);
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        )}
        {/*
          Folded away, the whole footer is one strip that still names the
          primary action, so marking stays one tap and nothing has to be
          remembered. Paging folds with it. Keeping Back and Next out of the
          fold was the earlier call and it gave back almost nothing: they are
          two thirds of the height, so hiding the rest left the footer the same
          size and the fold looked broken.
        */}
        {folded ? (
          <button
            type="button"
            className="markFold markFold--shut"
            aria-expanded={false}
            onClick={() => setFolded(false)}
          >
            <Check size={13} />
            <span>{isRead ? 'Read, tap to change' : 'Mark as read'}</span>
            <Chevron size={13} className="markFold__chev" />
          </button>
        ) : (
          <>
            <button
              type="button"
              className="markFold"
              aria-expanded
              onClick={() => setFolded(true)}
            >
              <Chevron size={13} className="markFold__chev markFold__chev--open" />
              <span>Hide this while I read</span>
            </button>
            <div className="reader__log">
              <LogDayPicker id={`reader-log-${chapterKey(book, chapter)}`} />
            </div>
          </>
        )}

        {/*
          Three controls that each say what pressing them does. Back and Next
          name their destination, and say when it is a different book, because
          "Next" tells you nothing and "Exodus 1" is a small event. The mark
          button names the consequence: how many are left in the book, or that
          this one finishes it.
        */}
        {!folded && (
        <div className="reader__actions">
          <button
            type="button"
            className="btn readerNav readerNav--back"
            disabled={!previous}
            onClick={() => previous && onNavigate(previous.book, previous.chapter)}
          >
            <Chevron size={14} className="reader__back" />
            <span className="readerNav__text">
              <span className="readerNav__eyebrow">
                {previous && previous.book !== book ? 'Back a book' : 'Back'}
              </span>
              <span className="readerNav__to">
                {previous ? (
                  <>
                    <span className="readerNav__book">{previous.book}</span>
                    <span className="readerNav__n">{previous.chapter}</span>
                  </>
                ) : (
                  <span className="readerNav__book">Start of the Bible</span>
                )}
              </span>
            </span>
          </button>

          <button
            type="button"
            className={`btn readerMark${isRead ? ' btn--done' : ' btn--primary'}${
              lastOne ? ' readerMark--finish' : ''
            }`}
            data-just={justMarked ? '' : undefined}
            onClick={() => {
              if (!isRead) setJustMarked(true);
              toggleChapter(book, chapter);
            }}
          >
            <span className="readerMark__eyebrow">
              {isRead
                ? readOn && readOn !== today()
                  ? `Marked ${relativeDay(readOn)}, tap to undo`
                  : 'Marked today, tap to undo'
                : lastOne
                  ? `Last chapter of ${book}`
                  : unreadLeft > 1
                    ? `${unreadLeft - 1} more to finish ${book}`
                    : `${book} ${chapter}`}
            </span>
            <span className="readerMark__main">
              {isRead && <Check size={15} />}
              {isRead ? 'Read' : lastOne ? `Finish ${book}` : 'Mark as read'}
            </span>
          </button>

          <button
            type="button"
            className="btn readerNav readerNav--next"
            disabled={!next}
            // Once this chapter is read, Next is where the reader goes now, so
            // it is the one that looks like an invitation. An attribute, since
            // the arrival of the attribute is what starts its one nudge.
            data-ready={isRead && next ? '' : undefined}
            onClick={() => next && onNavigate(next.book, next.chapter)}
          >
            <span className="readerNav__text">
              <span className="readerNav__eyebrow">
                {next && next.book !== book ? 'Next book' : 'Next'}
              </span>
              {/* Name and number apart, so a long name gives way to an ellipsis
                  and the number, which is the part that matters on a button
                  that turns a page, always survives. */}
              <span className="readerNav__to">
                {next ? (
                  <>
                    <span className="readerNav__book">{next.book}</span>
                    <span className="readerNav__n">{next.chapter}</span>
                  </>
                ) : (
                  <span className="readerNav__book">End of the Bible</span>
                )}
              </span>
            </span>
            <Chevron size={14} />
          </button>
        </div>
        )}
      </footer>
      )}

      {/*
        A child of the reader rather than of its body, which is what makes it
        cover the whole screen: `.insightSheet` is `position: absolute; inset: 0`
        and resolves against the nearest positioned ancestor, so living in the
        body confined it to the text and left the bar and the footer showing.
        Last in source order, so it paints over both without needing to outrank
        them.

        This was deliberately the other way round once, so that the book and
        chapter pickers stayed usable behind it and somebody who opened the
        wrong book did not have to dismiss an introduction to fix it. That cost
        one tap and bought a card sitting in a letterbox between two bars, and
        the introduction to a book is worth the whole screen.
      */}
      {sheetOpen && bookInsight(insights, book) && (
        <BookSheet
          key={`${book}-${sheetReplay ? 'again' : 'first'}`}
          book={book}
          insight={bookInsight(insights, book)!}
          replay={sheetReplay}
          onBegin={dismissSheet}
          quotesFrom={quotesFrom}
        />
      )}
    </div>
  );
}
