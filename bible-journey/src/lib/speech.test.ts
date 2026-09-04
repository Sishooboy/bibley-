import { describe, expect, it } from 'vitest';
import {
  isGoodVoice,
  resolveVoice,
  sortVoices,
  speechSupported,
  toPieces,
  voiceScore,
} from './speech';

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

const voice = (name: string, lang: string, localService = true, dflt = false) =>
  ({ name, lang, localService, voiceURI: name, default: dflt }) as SpeechSynthesisVoice;

/**
 * The ranking is the whole difference between read-aloud being worth using and
 * sounding like 1998. Left alone a browser hands back its first voice, which on
 * every platform is one of the old compact ones.
 */
describe('choosing a voice', () => {
  it('puts English first', () => {
    const sorted = sortVoices([voice('Thomas', 'fr-FR'), voice('Alex', 'en-US')]);
    expect(sorted[0].name).toBe('Alex');
  });

  it('ranks the voices a platform calls Enhanced above the ones it ships by default', () => {
    const sorted = sortVoices([
      voice('Daniel (Compact)', 'en-GB', true, true),
      voice('Samantha', 'en-US'),
      voice('Google UK English Female', 'en-GB', false),
      voice('Samantha (Enhanced)', 'en-US'),
    ]);
    expect(sorted.map((v) => v.name)).toEqual([
      'Samantha (Enhanced)',
      'Google UK English Female',
      'Samantha',
      'Daniel (Compact)',
    ]);
  });

  /*
   * A network voice needs a connection, which this app otherwise avoids relying
   * on, but Google's remote voices beat the local ones sitting beside them and a
   * voice nobody wants to hear is worth less than one that occasionally stalls.
   */
  it('lets quality outweigh working offline', () => {
    expect(voiceScore(voice('Microsoft Aria Online (Natural)', 'en-US', false))).toBeGreaterThan(
      voiceScore(voice('Microsoft David', 'en-US', true)),
    );
  });

  it('pushes the compact voices to the bottom, default or not', () => {
    const sorted = sortVoices([voice('Fred (Compact)', 'en-US', true, true), voice('Ava', 'en-US')]);
    expect(sorted[0].name).toBe('Ava');
  });

  /*
   * `default` marks what the system picked, not what is worth hearing, and on
   * most machines those are the same basic voice this ranking exists to avoid.
   * Treating it as a bonus was enough to hand a reader Microsoft David over
   * everything else installed, which is where "it sounds like the grim reaper"
   * came from.
   */
  it('does not prefer a voice merely for being the system default', () => {
    const sorted = sortVoices([
      voice('Microsoft David - English (United States)', 'en-US', true, true),
      voice('Microsoft Aria Online (Natural)', 'en-US', false),
    ]);
    expect(sorted[0].name).toBe('Microsoft Aria Online (Natural)');
  });

  it('sinks the old Windows desktop voices but not the good Microsoft ones', () => {
    const legacy = voice('Microsoft Zira - English (United States)', 'en-US', true);
    const modern = voice('Microsoft Aria Online (Natural)', 'en-US', false);
    expect(voiceScore(modern)).toBeGreaterThan(voiceScore(legacy));
    // And the penalty must not catch a plain non-Microsoft voice.
    expect(voiceScore(voice('Ava', 'en-US'))).toBeGreaterThan(voiceScore(legacy));
  });

  it('leaves the list it was given alone', () => {
    const list = [voice('B', 'en-US'), voice('A', 'en-US')];
    sortVoices(list);
    expect(list.map((v) => v.name)).toEqual(['B', 'A']);
  });
});

/**
 * "Which of these is least bad" and "is any of these actually good" are
 * different questions, and the second is the one a reader with a poor device is
 * really asking. Getting it wrong in the optimistic direction is worse: it
 * tells someone their voice list is fine when it is not.
 */
describe('isGoodVoice', () => {
  it('accepts the voices a platform marks as its better ones', () => {
    for (const name of [
      'Samantha (Enhanced)',
      'Ava (Premium)',
      'Microsoft Aria Online (Natural)',
      'Google UK English Female',
      'Siri Voice 4',
    ]) {
      expect(isGoodVoice(voice(name, 'en-US'))).toBe(true);
    }
  });

  it('rejects the compact voices and the Windows desktop set', () => {
    for (const name of [
      'Daniel (Compact)',
      'Microsoft David - English (United States)',
      'Microsoft Zira - English (United States)',
      'eSpeak English',
      'Albert (Novelty)',
    ]) {
      expect(isGoodVoice(voice(name, 'en-US'))).toBe(false);
    }
  });

  /*
   * An unmarked name is the ordinary case on iOS, where the plain entry may be
   * the compact voice or the downloaded one and the API does not say which.
   * Called good, it would tell a reader their list is fine when it is not.
   */
  it('does not vouch for a voice whose name claims nothing', () => {
    expect(isGoodVoice(voice('Samantha', 'en-US'))).toBe(false);
    expect(isGoodVoice(voice('Daniel', 'en-GB'))).toBe(false);
  });
});

describe('resolveVoice', () => {
  const list = [voice('Daniel (Compact)', 'en-GB', true, true), voice('Ava (Premium)', 'en-US')];

  it('takes the best available when the reader has not chosen', () => {
    expect(resolveVoice(list, null)?.name).toBe('Ava (Premium)');
  });

  it('honours a choice that is still installed', () => {
    expect(resolveVoice(list, 'Daniel (Compact)')?.name).toBe('Daniel (Compact)');
  });

  /*
   * The choice is device-local but a device can lose a voice: an iOS update
   * removes one, or the reader deletes the download. Falling back to the best
   * beats falling back to silence.
   */
  it('falls back to the best when the chosen voice is gone', () => {
    expect(resolveVoice(list, 'A voice that was uninstalled')?.name).toBe('Ava (Premium)');
  });

  it('has nothing to give when the device has no voices at all', () => {
    expect(resolveVoice([], null)).toBeUndefined();
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
