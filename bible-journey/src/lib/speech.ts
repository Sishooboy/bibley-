import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Reading a chapter aloud, through the voices the device already has.
 *
 * `speechSynthesis` and nothing else, for the same reasons the sounds are
 * synthesised: nothing to download, nothing to pay for per chapter, no API key
 * that cannot live in a public bundle anyway, and it works with no connection
 * once the book is cached. A cloud voice would sound better and would need a
 * backend, a key and a bill, none of which this app has.
 *
 * The trade-off is honest and worth stating in the UI: the voice is whatever
 * the phone or laptop ships, which on iOS and modern Android is good and on an
 * old desktop browser is not.
 */

export type SpeechStatus = 'idle' | 'speaking' | 'paused';

/** Device-local, not synced: a voice on an iPhone does not exist on Windows. */
const VOICE_KEY = 'bible-journey/voice';

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function loadVoiceURI(): string | null {
  try {
    return localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}

export function saveVoiceURI(uri: string | null): void {
  try {
    if (uri) localStorage.setItem(VOICE_KEY, uri);
    else localStorage.removeItem(VOICE_KEY);
  } catch (err) {
    console.error('Could not remember the voice.', err);
  }
}

/**
 * A verse, or a piece of one, with the verse it belongs to.
 *
 * Chapters are spoken verse by verse rather than as one utterance, which is
 * what lets the reader follow along: `onstart` on each piece says which verse is
 * being read now. It also sidesteps the long-standing Chrome fault where a
 * single utterance is cut off after about fifteen seconds.
 */
export type Piece = { verse: number; text: string };

/** Longer than this and even one verse risks the cut-off, so it is split. */
const MAX_PIECE = 240;

/**
 * Splits a chapter into speakable pieces. A verse the source has nothing behind
 * is skipped rather than read as a silence, and an over-long verse is broken at
 * a sentence end so the seam falls where a reader would breathe.
 */
export function toPieces(verses: (string | null)[]): Piece[] {
  const out: Piece[] = [];
  verses.forEach((text, i) => {
    if (!text) return;
    const verse = i + 1;
    if (text.length <= MAX_PIECE) {
      out.push({ verse, text });
      return;
    }
    let rest = text;
    while (rest.length > MAX_PIECE) {
      // Prefer a sentence end, fall back to a word break, and only then cut
      // blind. Every branch has to give a positive index: a bare `lastIndexOf`
      // returns -1 when it finds nothing, and slicing on that silently drops
      // the last character of one piece and repeats it at the head of the next.
      const head = rest.slice(0, MAX_PIECE);
      const sentence = Math.max(
        head.lastIndexOf('. '),
        head.lastIndexOf('? '),
        head.lastIndexOf('! '),
      );
      const space = head.lastIndexOf(' ');
      // +1 keeps the full stop with the sentence it closes.
      const at = sentence > 0 ? sentence + 1 : space > 0 ? space : MAX_PIECE;
      out.push({ verse, text: rest.slice(0, at).trim() });
      rest = rest.slice(at).trim();
    }
    if (rest) out.push({ verse, text: rest });
  });
  return out;
}

/** English voices first, since the text is English, but never hide the rest. */
export function sortVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => {
    const ae = a.lang.toLowerCase().startsWith('en');
    const be = b.lang.toLowerCase().startsWith('en');
    if (ae !== be) return ae ? -1 : 1;
    if (a.localService !== b.localService) return a.localService ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export const RATE_MIN = 0.6;
export const RATE_MAX = 1.6;
export const RATE_DEFAULT = 1;

/**
 * Reads a chapter aloud and says which verse it is on.
 *
 * `speak` has to be called inside a real gesture the first time or iOS refuses
 * it, so `start` is only ever wired to a tap, never to an effect.
 */
export function useChapterSpeech(rate: number) {
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [verse, setVerse] = useState<number | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string | null>(loadVoiceURI);
  /** Guards the `onend` of an utterance we cancelled from ending the session. */
  const runId = useRef(0);

  // The list is empty on first call in most browsers and arrives later.
  useEffect(() => {
    if (!speechSupported()) return;
    const read = () => setVoices(sortVoices(window.speechSynthesis.getVoices()));
    read();
    window.speechSynthesis.addEventListener('voiceschanged', read);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', read);
  }, []);

  const stop = useCallback(() => {
    runId.current++;
    if (speechSupported()) window.speechSynthesis.cancel();
    setStatus('idle');
    setVerse(null);
  }, []);

  /*
   * Chrome stops speaking after roughly fifteen seconds unless something pokes
   * it. `resume` on a queue that is not paused does nothing everywhere else, so
   * the poke is safe to run for all browsers rather than sniffing for one.
   */
  useEffect(() => {
    if (status !== 'speaking') return;
    const poke = setInterval(() => window.speechSynthesis.resume(), 8000);
    return () => clearInterval(poke);
  }, [status]);

  // Leaving the reader, or the chapter changing under it, must not leave a
  // voice reading a page nobody is looking at.
  useEffect(() => stop, [stop]);

  const start = useCallback(
    (verses: (string | null)[]) => {
      if (!speechSupported()) return;
      const pieces = toPieces(verses);
      if (pieces.length === 0) return;

      window.speechSynthesis.cancel();
      const run = ++runId.current;
      const chosen = voiceURI
        ? window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI)
        : undefined;

      pieces.forEach((piece, i) => {
        const u = new SpeechSynthesisUtterance(piece.text);
        if (chosen) {
          u.voice = chosen;
          u.lang = chosen.lang;
        }
        u.rate = rate;
        u.onstart = () => {
          if (run !== runId.current) return;
          setVerse(piece.verse);
        };
        if (i === pieces.length - 1) {
          u.onend = () => {
            if (run !== runId.current) return;
            setStatus('idle');
            setVerse(null);
          };
        }
        u.onerror = () => {
          if (run !== runId.current) return;
          setStatus('idle');
          setVerse(null);
        };
        window.speechSynthesis.speak(u);
      });

      setStatus('speaking');
    },
    [rate, voiceURI],
  );

  const pause = useCallback(() => {
    if (!speechSupported()) return;
    window.speechSynthesis.pause();
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    if (!speechSupported()) return;
    window.speechSynthesis.resume();
    setStatus('speaking');
  }, []);

  const chooseVoice = useCallback((uri: string | null) => {
    setVoiceURI(uri);
    saveVoiceURI(uri);
  }, []);

  return {
    supported: speechSupported(),
    status,
    verse,
    voices,
    voiceURI,
    chooseVoice,
    start,
    pause,
    resume,
    stop,
  };
}
