import { useSyncExternalStore } from 'react';

/**
 * The translations the reader can show, and which one it is showing.
 *
 * The World English Bible is the default and stays the app's own reference
 * text: quiz answers, the notes' quotations and the audio are all its words, so
 * those keep saying so whatever is open in the reader. The King James sits
 * beside it, built by `scripts/build-kjv.mjs` into `/bible/kjv/` in the same
 * shape, with the same chapters, so progress kept by book and chapter means the
 * same thing in either. The Free Bible Version is the plain one, built by
 * `scripts/build-fbv.mjs`, and the only one that does not have every book: it
 * is a protestant Bible, so `lacksBooks` and `lacksChapters` say what is not
 * there and the reader says so rather than showing an empty page.
 *
 * The choice is device-local, not a `prefs` field. `normalize()` is a whitelist
 * and the journal is upserted whole, so a synced field would need a release that
 * reads it to ship before one that writes it; and which wording somebody likes to
 * read on a phone is not obviously what they want on a laptop.
 */
export type TranslationId = 'web' | 'kjv' | 'fbv';

export type Translation = {
  id: TranslationId;
  /** As its publisher names it. */
  name: string;
  /** For a 38px circle. */
  short: string;
  /** What reading it is like, in a line, for the chooser. */
  about: string;
  /** Where its book files live, ending in a slash. */
  dir: string;
  /** The line under every chapter, in the words its rights holder uses. */
  credit: string;
  /**
   * The licence, linked beside the credit, for a text whose licence asks for
   * one. Creative Commons Attribution does: the credit is a condition of
   * shipping the words at all, not a courtesy.
   */
  licence?: { name: string; url: string };
  /**
   * Books of the canon it does not have at all, so no file is shipped for them.
   * Known here rather than discovered by a fetch, because a missing file is not a
   * reliable answer: a host that serves the app for every unknown path answers
   * with a page, not a 404, and the reader would wait on a book forever.
   */
  lacksBooks?: readonly string[];
  /**
   * Chapters it does not have in a book it otherwise does, which are empty in
   * its file so the book keeps every chapter the app counts.
   */
  lacksChapters?: Readonly<Record<string, readonly number[]>>;
};

export const TRANSLATIONS: Translation[] = [
  {
    id: 'web',
    name: 'World English Bible',
    short: 'WEB',
    about: 'Modern English that keeps close to the original wording',
    dir: '/bible/',
    credit: 'World English Bible, public domain',
  },
  {
    id: 'fbv',
    name: 'Free Bible Version',
    short: 'FBV',
    about: 'Plain everyday English, the easiest to read',
    dir: '/bible/fbv/',
    // The licence asks for "the above copyright and source information", so this
    // is that line as eBible.org prints it, and the source.
    credit: 'Free Bible Version, Copyright © 2018 Dr. Jonathan Gallagher, from eBible.org',
    licence: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
    lacksBooks: ['Tobit', 'Judith', 'Wisdom', 'Sirach', 'Baruch', '1 Maccabees', '2 Maccabees'],
    lacksChapters: { Esther: [11, 12, 13, 14, 15, 16], Daniel: [13, 14] },
  },
  {
    id: 'kjv',
    name: 'King James Version',
    short: 'KJV',
    about: 'The 1769 text, in the English of four hundred years ago',
    dir: '/bible/kjv/',
    credit: 'King James Version, 1769 text, public domain outside the UK',
  },
];

export const DEFAULT_TRANSLATION: TranslationId = 'web';

export function translationById(id: string | undefined): Translation {
  return TRANSLATIONS.find((t) => t.id === id) ?? TRANSLATIONS[0];
}

/**
 * The translation a highlight belongs to. Absent is the World English Bible.
 *
 * An id this build does not know is returned as it is, not folded into the
 * default. A highlight made in a translation a later version adds carries
 * character positions inside that translation's words; folded into the WEB it
 * would be drawn over the wrong ones. Left as it is, it matches nothing open
 * here, so it is counted and not drawn, which is the honest thing to do with it.
 */
export function highlightTranslation(h: { translation?: string }): string {
  return h.translation ?? DEFAULT_TRANSLATION;
}

export function isKnownTranslation(id: string): id is TranslationId {
  return TRANSLATIONS.some((t) => t.id === id);
}

/** Whether a translation has this book at all. */
export function hasBook(id: TranslationId, book: string): boolean {
  return !translationById(id).lacksBooks?.includes(book);
}

/** Whether a translation has this chapter: the book, and the chapter in it. */
export function hasChapter(id: TranslationId, book: string, chapter: number): boolean {
  return hasBook(id, book) && !translationById(id).lacksChapters?.[book]?.includes(chapter);
}

/**
 * The translation to fetch a book in when any text will do, for a prefetch or a
 * reading time: the one asked for if it has the book, and the World English
 * Bible if it does not, which has every book the app prints. The reader never
 * uses this to fill a page, since putting one translation's words under
 * another's name is exactly what it must not do.
 */
export function textTranslation(id: TranslationId, book: string): TranslationId {
  return hasBook(id, book) ? id : DEFAULT_TRANSLATION;
}

/** The books of the canon a translation has, in the order given. */
export function booksIn(id: TranslationId, books: readonly string[]): string[] {
  return books.filter((book) => hasBook(id, book));
}

/** A short label for a translation id, known or not. */
export function translationShort(id: string): string {
  return isKnownTranslation(id) ? translationById(id).short : id.toUpperCase();
}

const KEY = 'bible-journey/translation';
const EVENT = 'bibley:translation';

export function currentTranslation(): TranslationId {
  try {
    return translationById(localStorage.getItem(KEY) ?? undefined).id;
  } catch {
    return DEFAULT_TRANSLATION;
  }
}

export function setTranslation(id: TranslationId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Private mode: the choice lasts the session and nothing worse.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  // Another tab changing it is the same choice, so this one follows.
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The open translation, re-rendering whatever reads it when it changes. */
export function useTranslation(): TranslationId {
  return useSyncExternalStore(subscribe, currentTranslation, () => DEFAULT_TRANSLATION);
}
