/*
 * Streak numbers that mean something in scripture.
 *
 * **Nothing here says what a number means.** There is a large and bad
 * literature on biblical numerology, gematria and "angel numbers" that assigns
 * numbers powers the text does not give them, and none of it is a source this
 * app would put beside a public domain translation. So an entry is not "forty
 * means testing". It is a short line about the pattern, and three places the
 * number actually appears, which the reader can go and look at.
 *
 * **Every reference was verified against the shipped text, and a test keeps it
 * that way.** `numbers.test.ts` fails if a citation names a verse that does not
 * exist, or one that does not contain the number it is cited for. That check is
 * the whole credibility of the feature: a line nobody can falsify is a line
 * that drifts into superstition.
 *
 * Two conditions decided the list. The number has to be reachable as a streak,
 * which rules out the famous large ones, and it has to have at least three
 * distinct occurrences worth citing. **Numbers that are only round get no
 * entry**: 100 and 365 are milestones in a calendar, not in scripture, and
 * including them would quietly turn this into "every milestone is biblical",
 * which is the one thing it must not become.
 *
 * Bundled rather than fetched, unlike `insights.json`. That file is sixty
 * kilobytes of prose and has no business in the JS, this is a page of it, and
 * more to the point **the celebration cannot await a network round trip**: it
 * fires the instant the cue arrives.
 */

/** Book, chapter, verse. The reader sees it as "Genesis 7:12". */
export type NumberRef = readonly [book: string, chapter: number, verse: number];

export type BibleNumber = {
  n: number;
  /** The number in words, which is how the card names it. */
  name: string;
  /** One short line. Descriptive of the verses below it, never a claim about the reader. */
  line: string;
  refs: readonly NumberRef[];
};

export const BIBLE_NUMBERS: readonly BibleNumber[] = [
  {
    n: 3,
    name: 'Three',
    line: 'Three days, and then up again.',
    refs: [
      ['Jonah', 1, 17],
      ['Matthew', 12, 40],
      ['Luke', 24, 46],
    ],
  },
  {
    n: 7,
    name: 'Seven',
    line: 'The count of a thing finished.',
    refs: [
      ['Genesis', 2, 2],
      ['Joshua', 6, 4],
      ['Revelation', 1, 20],
    ],
  },
  {
    n: 10,
    name: 'Ten',
    line: 'Counted out, and tested by.',
    refs: [
      ['Deuteronomy', 4, 13],
      ['Daniel', 1, 12],
      ['Matthew', 25, 1],
    ],
  },
  {
    n: 12,
    name: 'Twelve',
    line: 'A people, counted.',
    refs: [
      ['Genesis', 35, 22],
      ['Luke', 6, 13],
      ['Revelation', 21, 12],
    ],
  },
  {
    n: 14,
    name: 'Fourteen',
    line: 'Twice seven, and the day of Passover.',
    refs: [
      ['Genesis', 31, 41],
      ['Exodus', 12, 6],
      ['Matthew', 1, 17],
    ],
  },
  {
    n: 30,
    name: 'Thirty',
    line: 'The age a life’s work begins.',
    refs: [
      ['Genesis', 41, 46],
      ['Numbers', 4, 3],
      ['Luke', 3, 23],
    ],
  },
  {
    n: 40,
    name: 'Forty',
    line: 'The long wait before the change.',
    refs: [
      ['Genesis', 7, 12],
      ['Numbers', 14, 33],
      ['Matthew', 4, 2],
    ],
  },
  {
    n: 50,
    name: 'Fifty',
    line: 'The jubilee, and the count up to it.',
    refs: [
      ['Leviticus', 23, 16],
      ['Leviticus', 25, 10],
      ['Numbers', 8, 25],
    ],
  },
  {
    n: 70,
    name: 'Seventy',
    line: 'An exile, and the elders who outlast it.',
    refs: [
      ['Genesis', 46, 27],
      ['Numbers', 11, 16],
      ['Jeremiah', 25, 11],
    ],
  },
  {
    n: 120,
    name: 'A hundred and twenty',
    line: 'A full life, and a room at the start.',
    refs: [
      ['Genesis', 6, 3],
      ['Deuteronomy', 34, 7],
      ['Acts', 1, 15],
    ],
  },
];
