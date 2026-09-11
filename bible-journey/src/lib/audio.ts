/*
 * Listening to a chapter.
 *
 * **This is a real human reading, not a synthesised voice, and that is the
 * whole reason the feature came back.** Read aloud was built four times on
 * `speechSynthesis` and removed, because the voices a web page can reach are
 * not good enough to want: on iOS the good Siri voices are not exposed to the
 * browser at all, so the ceiling was low and no amount of picking, pitching or
 * resetting moved it. What changed the answer was not better synthesis, it was
 * finding that a recording of this exact translation already exists and is free
 * to use.
 *
 * The recording is the World English Bible read by David Williams, made in
 * 2000 and placed into the public domain by the narrator in 2016. The text this
 * app ships is the same translation, so the words on screen and the words in
 * the ear are the same words, which no synthesised reading of a different
 * edition could promise.
 *
 * **An `<audio>` element, which the sound rules otherwise forbid.** `sound.ts`
 * uses Web Audio and nothing else, because that is what respects the iOS silent
 * switch, and an interface chime that played through a silenced phone would be
 * the app talking over somebody who asked it not to. This is the opposite case:
 * somebody pressed play. Deliberate media is meant to behave like a podcast and
 * go through the media channel, so `<audio>` is right here and stays wrong
 * everywhere else.
 *
 * **It streams from somebody else's server and that is the weak point.** The
 * files are not ours, they are not on our CDN, and they are not cached: the
 * service worker ignores cross-origin requests outright, so there is no offline
 * listening and no second copy if that host goes away. `AUDIO_BASE` is one
 * constant so re-hosting is a one line change, and hosting it properly is the
 * real fix rather than a nicety.
 */
import { AUDIO_BOOKS } from '../data/audioBooks';

/** Where the recordings live. One constant, so moving them is one edit. */
export const AUDIO_BASE = 'https://www.audiotreasure.com/content/WEBD_AT';

/*
 * Printed wherever the recording plays, because taking somebody's work
 * unattributed would be the wrong way round, the same reasoning that keeps the
 * two text credits in the reader's footer.
 *
 * The narrator's name and nothing else: on a 375px strip the longer version
 * ended in an ellipsis, and a credit cut off halfway is a worse credit than a
 * short one. The public domain status is a fact about the licence rather than
 * something a reader needs on screen.
 */
export const AUDIO_CREDIT = 'Read by David Williams';

/**
 * The file holding this chapter, or null when there is no recording of it.
 *
 * Null is a real answer and has to be handled rather than guessed past: the
 * seven deuterocanonical books have no recording, neither do 1 and 2
 * Thessalonians, and the Greek additions run past the end of what was recorded
 * for Esther and Daniel. A missing file is silent, so the screen has to say so
 * rather than offering a button that does nothing.
 */
export function audioUrl(book: string, chapter: number): string | null {
  const entry = AUDIO_BOOKS[book];
  if (!entry) return null;
  const [prefix, shape, recorded] = entry;
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > recorded) return null;

  const name =
    shape === 'whole'
      ? prefix
      : shape === 'bare1'
        ? `${prefix}${chapter}`
        : shape === 'under3'
          ? `${prefix}_${String(chapter).padStart(3, '0')}`
          : `${prefix}_${String(chapter).padStart(2, '0')}`;
  return `${AUDIO_BASE}/${name}.mp3`;
}

/** Is there anything to listen to in this book at all? Used to explain the absence once, not per chapter. */
export function hasRecording(book: string): boolean {
  return book in AUDIO_BOOKS;
}

/** m:ss, for a position and a duration that are both usually minutes. */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
