/**
 * The books in the order they appear in a printed Bible.
 *
 * The plans deliberately reorder things, and that reordering is the point of the
 * app. But a reader looking for Habakkuk is not thinking in phases, so anything
 * that exists to help someone *find* a book uses this order instead.
 *
 * This is the Catholic canon, 73 books, so the seven deuterocanonical books sit
 * where a Catholic Bible prints them rather than in an appendix: Tobit and
 * Judith before Esther, Maccabees after it, Wisdom and Sirach after the Song,
 * Baruch after Lamentations.
 *
 * `canon.test.ts` checks this against the plan data, so the two can never drift.
 */
export const OLD_TESTAMENT = [
  'Genesis',
  'Exodus',
  'Leviticus',
  'Numbers',
  'Deuteronomy',
  'Joshua',
  'Judges',
  'Ruth',
  '1 Samuel',
  '2 Samuel',
  '1 Kings',
  '2 Kings',
  '1 Chronicles',
  '2 Chronicles',
  'Ezra',
  'Nehemiah',
  'Tobit',
  'Judith',
  'Esther',
  '1 Maccabees',
  '2 Maccabees',
  'Job',
  'Psalms',
  'Proverbs',
  'Ecclesiastes',
  'Song of Songs',
  'Wisdom',
  'Sirach',
  'Isaiah',
  'Jeremiah',
  'Lamentations',
  'Baruch',
  'Ezekiel',
  'Daniel',
  'Hosea',
  'Joel',
  'Amos',
  'Obadiah',
  'Jonah',
  'Micah',
  'Nahum',
  'Habakkuk',
  'Zephaniah',
  'Haggai',
  'Zechariah',
  'Malachi',
] as const;

export const NEW_TESTAMENT = [
  'Matthew',
  'Mark',
  'Luke',
  'John',
  'Acts',
  'Romans',
  '1 Corinthians',
  '2 Corinthians',
  'Galatians',
  'Ephesians',
  'Philippians',
  'Colossians',
  '1 Thessalonians',
  '2 Thessalonians',
  '1 Timothy',
  '2 Timothy',
  'Titus',
  'Philemon',
  'Hebrews',
  'James',
  '1 Peter',
  '2 Peter',
  '1 John',
  '2 John',
  '3 John',
  'Jude',
  'Revelation',
] as const;

export const CANON: readonly string[] = [...OLD_TESTAMENT, ...NEW_TESTAMENT];
