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

/**
 * How good a voice is likely to be, higher being better.
 *
 * Left to itself a browser hands back its *first* voice, which on every
 * platform is one of the old compact ones: the robot. The good voices are
 * there, they are just not the default, and they are recognisable by name
 * because every platform labels them. This is the single biggest difference
 * between read-aloud sounding worth using and sounding like 1998, and it costs
 * nothing.
 *
 * Quality markers deliberately outweigh `localService`. A network voice needs a
 * connection, which this app otherwise avoids relying on, but Google's remote
 * voices are far better than the local ones sitting beside them, and a voice
 * nobody wants to listen to is worth less than one that occasionally cannot
 * load.
 */
export function voiceScore(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase();
  let score = 0;
  if (v.lang.toLowerCase().startsWith('en')) score += 100;
  // What the platforms call the voices they want you to use.
  if (/enhanced|premium|neural|natural/.test(name)) score += 40;
  if (/google|siri/.test(name)) score += 25;
  // And what they call the ones they shipped in 2005.
  if (/compact|eloquence|espeak|novelty/.test(name)) score -= 40;
  /*
   * Windows still ships the SAPI era desktop voices, David, Zira, Mark and
   * company, which are the deep flat ones that read scripture like a eulogy.
   * Every good Microsoft voice carries Online or Natural in its name, so the
   * absence of both is the tell.
   */
  if (/microsoft/.test(name) && !/online|natural|neural/.test(name)) score -= 30;
  if (v.localService) score += 2;
  /*
   * `default` is deliberately not a bonus. It marks what the system picked, not
   * what is worth hearing, and on most machines those are the same basic voice
   * this whole ranking exists to avoid. Boosting it was enough to hand a reader
   * Microsoft David over anything else installed.
   */
  return score;
}

/** Best first, so the picker opens on something worth hearing. */
export function sortVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => {
    const d = voiceScore(b) - voiceScore(a);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
}

/**
 * The voice to actually use: the reader's, if they chose one and it is still
 * installed, otherwise the best available rather than the browser's own pick.
 */
export function resolveVoice(
  voices: SpeechSynthesisVoice[],
  uri: string | null,
): SpeechSynthesisVoice | undefined {
  if (uri) {
    const chosen = voices.find((v) => v.voiceURI === uri);
    if (chosen) return chosen;
  }
  return sortVoices(voices)[0];
}

export const RATE_MIN = 0.6;
export const RATE_MAX = 1.6;
export const RATE_DEFAULT = 1;

/*
 * Pitch, for lifting a voice that sits too low. Kept to a narrow band on
 * purpose: past about 1.4 a synthesised voice stops sounding lighter and starts
 * sounding like a cartoon, and below 0.8 every voice becomes the thing this was
 * added to escape.
 */
export const PITCH_MIN = 0.8;
export const PITCH_MAX = 1.4;
export const PITCH_DEFAULT = 1;

/**
 * Reads a chapter aloud and says which verse it is on.
 *
 * `speak` has to be called inside a real gesture the first time or iOS refuses
 * it, so `start` is only ever wired to a tap, never to an effect.
 */
export function useChapterSpeech(rate: number, pitch: number = PITCH_DEFAULT) {
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [verse, setVerse] = useState<number | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string | null>(loadVoiceURI);
  /** Guards the `onend` of an utterance we cancelled from ending the session. */
  const runId = useRef(0);
  const queue = useRef<Piece[]>([]);
  const voiceRef = useRef<SpeechSynthesisVoice | undefined>(undefined);
  /* Read by the chain rather than closed over, so changing the speed mid-chapter
     applies to the next verse instead of rebuilding the whole run. */
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const pitchRef = useRef(pitch);
  pitchRef.current = pitch;

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

  /**
   * Speaks one piece and chains to the next when it ends.
   *
   * **One at a time, not the whole chapter queued up front.** Queueing thirty
   * utterances works on desktop Chrome and is unreliable on iOS Safari, which
   * fires `onstart` for some of them and not others: the audio kept going and
   * the highlight stopped moving after the first verse. Chaining also puts a
   * natural breath between verses, which reads better than a wall of speech.
   *
   * The verse is set when the piece is *scheduled* rather than in `onstart`, for
   * the same reason. A highlight a beat early is barely noticeable; one that
   * never moves makes the whole feature look broken.
   */
  const sayFrom = useCallback((index: number, run: number) => {
    if (run !== runId.current) return;
    const piece = queue.current[index];
    if (!piece) {
      setStatus('idle');
      setVerse(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(piece.text);
    const voice = voiceRef.current;
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = rateRef.current;
    utterance.pitch = pitchRef.current;
    setVerse(piece.verse);

    utterance.onend = () => {
      if (run !== runId.current) return;
      // Out of the handler before speaking again: iOS refuses a `speak` issued
      // from inside `onend` often enough to strand a chapter half read.
      setTimeout(() => sayFrom(index + 1, run), 0);
    };
    utterance.onerror = () => {
      // Cancelling raises this too, and the run guard is what tells the two
      // apart: a cancel has already moved the id on.
      if (run !== runId.current) return;
      setStatus('idle');
      setVerse(null);
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const start = useCallback(
    (verses: (string | null)[]) => {
      if (!speechSupported()) return;
      const pieces = toPieces(verses);
      if (pieces.length === 0) return;

      window.speechSynthesis.cancel();
      queue.current = pieces;
      // Resolved once per chapter, not per verse, and from the live list rather
      // than the state copy, which may not have arrived on the first open.
      voiceRef.current = resolveVoice(window.speechSynthesis.getVoices(), voiceURI);
      const run = ++runId.current;
      setStatus('speaking');
      sayFrom(0, run);
    },
    [voiceURI, sayFrom],
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
