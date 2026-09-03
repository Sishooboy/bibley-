import { describe, expect, it } from 'vitest';
import { sortVoices, speechSupported, toPieces } from './speech';

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

describe('toPieces', () => {
  it('gives one piece per verse when every verse is short', () => {
    expect(toPieces(['In the beginning', 'And the earth'])).toEqual([
      { verse: 1, text: 'In the beginning' },
      { verse: 2, text: 'And the earth' },
    ]);
  });

  /*
   * A null verse is a number the King James tradition carries and this
   * translation's source does not. The reader passes over it in silence, so the
   * voice has to as well, and the numbering after it must stay right.
   */
  it('skips a verse the translation has nothing behind, without shifting the rest', () => {
    const pieces = toPieces(['first', null, 'third']);
    expect(pieces).toEqual([
      { verse: 1, text: 'first' },
      { verse: 3, text: 'third' },
    ]);
  });

  it('has nothing to say for an empty chapter', () => {
    expect(toPieces([])).toEqual([]);
    expect(toPieces([null, null])).toEqual([]);
  });

  /*
   * Chrome cuts off a single utterance after roughly fifteen seconds, so a long
   * verse is split. Both halves keep the same verse number, or following along
   * would jump to a verse that does not exist.
   */
  it('splits a long verse but keeps every piece under the same number', () => {
    const long = `${'A sentence that runs on. '.repeat(20)}`;
    const pieces = toPieces([long]);

    expect(pieces.length).toBeGreaterThan(1);
    expect(new Set(pieces.map((p) => p.verse))).toEqual(new Set([1]));
    expect(pieces.every((p) => p.text.length <= 240)).toBe(true);
  });

  it('breaks at a sentence end when there is one', () => {
    const a = 'He said the first thing. ';
    const pieces = toPieces([a.repeat(12)]);
    // Every piece bar the last should end where a reader would breathe.
    for (const piece of pieces.slice(0, -1)) {
      expect(piece.text.endsWith('.')).toBe(true);
    }
  });

  it('still splits a verse with no sentence end in it', () => {
    const pieces = toPieces([words(120)]);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((p) => p.text.length <= 240)).toBe(true);
  });

  /*
   * The whole point of splitting is that nothing is lost. A negative index from
   * `lastIndexOf` would drop a character off one piece and repeat it on the
   * next, which is inaudible in testing and wrong in every verse.
   */
  it('never loses or repeats a character', () => {
    // Compared with the whitespace stripped, because a seam is trimmed on both
    // sides and a blind cut has no space to rejoin on. What must survive is
    // every character of the verse, in order, exactly once.
    const bare = (s: string) => s.replace(/\s/g, '');
    for (const text of [words(200), 'One. Two. Three. '.repeat(30), 'x'.repeat(500)]) {
      const rebuilt = toPieces([text])
        .map((p) => p.text)
        .join('');
      expect(bare(rebuilt)).toBe(bare(text));
    }
  });

  it('makes progress on a verse that is one unbroken word', () => {
    // No space and no full stop anywhere: the blind cut is the only way out,
    // and without it the loop would never shorten `rest`.
    const pieces = toPieces(['y'.repeat(1000)]);
    expect(pieces.length).toBe(Math.ceil(1000 / 240));
  });
});

describe('sortVoices', () => {
  const voice = (name: string, lang: string, localService = true) =>
    ({ name, lang, localService, voiceURI: name, default: false }) as SpeechSynthesisVoice;

  it('puts English first, then the ones that need no connection', () => {
    const sorted = sortVoices([
      voice('Zoe', 'fr-FR'),
      voice('Remote', 'en-GB', false),
      voice('Local', 'en-GB'),
    ]);
    expect(sorted.map((v) => v.name)).toEqual(['Local', 'Remote', 'Zoe']);
  });

  it('leaves the list it was given alone', () => {
    const list = [voice('B', 'en-US'), voice('A', 'en-US')];
    sortVoices(list);
    expect(list.map((v) => v.name)).toEqual(['B', 'A']);
  });
});

describe('without speech synthesis', () => {
  it('reports that it is unsupported rather than throwing', () => {
    // jsdom has no speechSynthesis, which is the same answer an old browser
    // gives, and both have to end in a hidden button rather than a crash.
    expect(() => speechSupported()).not.toThrow();
    expect(speechSupported()).toBe(false);
  });
});
