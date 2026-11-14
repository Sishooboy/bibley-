import { useSyncExternalStore } from 'react';

/**
 * The translations the reader can show, and which one it is showing.
 *
 * The World English Bible is the default and stays the app's own reference
 * text: quiz answers, the notes' quotations and the audio are all its words, so
 * those keep saying so whatever is open in the reader. The King James sits
 * beside it, built by `scripts/build-kjv.mjs` into `/bible/kjv/` in the same
 * shape, with the same chapters, so progress kept by book and chapter means the
 * same thing in either.
 *
 * The choice is device-local, not a `prefs` field. `normalize()` is a whitelist
 * and the journal is upserted whole, so a synced field would need a release that
 * reads it to ship before one that writes it; and which wording somebody likes to
 * read on a phone is not obviously what they want on a laptop.
 */
export type TranslationId = 'web' | 'kjv';

export type Translation = {
  id: TranslationId;
  /** As its publisher names it. */
  name: string;
  /** For a 38px circle. */
  short: string;
  /** Where its book files live, ending in a slash. */
  dir: string;
  /** The line under every chapter, in the words its rights holder uses. */
  credit: string;
};

export const TRANSLATIONS: Translation[] = [
  {
    id: 'web',
    name: 'World English Bible',
    short: 'WEB',
    dir: '/bible/',
    credit: 'World English Bible, public domain',
  },
  {
    id: 'kjv',
    name: 'King James Version',
    short: 'KJV',
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
