export type Book = { name: string; chapters: number };

export type Phase = {
  phase: number;
  title: string;
  why: string;
  books: Book[];
};

/**
 * Step zero. The twelve phases are ordered on the assumption that you have met
 * Jesus in John first, so John leads rather than being assumed.
 */
export const PROLOGUE: Book = { name: 'John', chapters: 21 };

export const PROLOGUE_PHASE = 0;

export const PROLOGUE_WHY =
  'Start here. The order of everything below is built around this one book: meet Jesus first, then go back to the beginning and watch the whole story lead to him.';

export const PHASES: Phase[] = [
  {
    phase: 1,
    title: 'Foundations',
    why: "You met Jesus through John. Now go back to the beginning: how the world was made, how it broke, and how God started rescuing it through one family and one nation. Every later book leans on this one.",
    books: [
      { name: 'Genesis', chapters: 50 },
      { name: 'Exodus', chapters: 40 },
    ],
  },
  {
    phase: 2,
    title: 'Finish the Gospels',
    why: "You already have one full picture of Jesus's life. Mark moves fast and is action driven, Luke is the careful historian with the fullest birth narrative and parables, and Matthew was written for a Jewish audience and is packed with Old Testament fulfillment. Read these while the story is still fresh.",
    books: [
      { name: 'Mark', chapters: 16 },
      { name: 'Luke', chapters: 24 },
      { name: 'Matthew', chapters: 28 },
    ],
  },
  {
    phase: 3,
    title: 'The Early Church',
    why: "What happened after Jesus left: the church is born, the gospel spreads, and Paul's story begins. This is the natural bridge into his letters later on.",
    books: [{ name: 'Acts', chapters: 28 }],
  },
  {
    phase: 4,
    title: 'The Law, Completed',
    why: 'The densest, most rule heavy books in the Bible. Placed here, after you already know the Exodus story and have met Jesus, so the sacrificial system reads as setup for something rather than rules in a vacuum.',
    books: [
      { name: 'Leviticus', chapters: 27 },
      { name: 'Numbers', chapters: 36 },
      { name: 'Deuteronomy', chapters: 34 },
    ],
  },
  {
    phase: 5,
    title: 'Kingdom History',
    why: "The rest of Israel's story as one continuous narrative: conquest, judges, kings, a divided kingdom, and exile. It's a long stretch, but it moves once you're in it.",
    books: [
      { name: 'Joshua', chapters: 24 },
      { name: 'Judges', chapters: 21 },
      { name: 'Ruth', chapters: 4 },
      { name: '1 Samuel', chapters: 31 },
      { name: '2 Samuel', chapters: 24 },
      { name: '1 Kings', chapters: 22 },
      { name: '2 Kings', chapters: 25 },
      { name: '1 Chronicles', chapters: 29 },
      { name: '2 Chronicles', chapters: 36 },
    ],
  },
  {
    phase: 6,
    title: 'Wisdom Literature',
    why: 'A change of pace after all that narrative: prayer, poetry, and practical wisdom. Job fits here as a meditation on suffering, right after a long national history full of it.',
    books: [
      { name: 'Job', chapters: 42 },
      { name: 'Psalms', chapters: 150 },
      { name: 'Proverbs', chapters: 31 },
      { name: 'Ecclesiastes', chapters: 12 },
      { name: 'Song of Songs', chapters: 8 },
    ],
  },
  {
    phase: 7,
    title: "Paul's Letters",
    why: 'Acts already introduced Paul, so his letters to the churches he planted make immediate sense. Ordered by weight: Romans first for his fullest theology, the shorter pastoral and personal letters last.',
    books: [
      { name: 'Romans', chapters: 16 },
      { name: '1 Corinthians', chapters: 16 },
      { name: '2 Corinthians', chapters: 13 },
      { name: 'Galatians', chapters: 6 },
      { name: 'Ephesians', chapters: 6 },
      { name: 'Philippians', chapters: 4 },
      { name: 'Colossians', chapters: 4 },
      { name: '1 Thessalonians', chapters: 5 },
      { name: '2 Thessalonians', chapters: 3 },
      { name: '1 Timothy', chapters: 6 },
      { name: '2 Timothy', chapters: 4 },
      { name: 'Titus', chapters: 3 },
      { name: 'Philemon', chapters: 1 },
    ],
  },
  {
    phase: 8,
    title: 'Major Prophets',
    why: 'The big, dense prophetic books. They explain the exile you just read about in the history books, so the context is still fresh.',
    books: [
      { name: 'Isaiah', chapters: 66 },
      { name: 'Jeremiah', chapters: 52 },
      { name: 'Lamentations', chapters: 5 },
      { name: 'Ezekiel', chapters: 48 },
      { name: 'Daniel', chapters: 12 },
    ],
  },
  {
    phase: 9,
    title: 'Minor Prophets',
    why: "Shorter prophetic voices in the same world as the major prophets. Easier to move through quickly once you're used to the language.",
    books: [
      { name: 'Hosea', chapters: 14 },
      { name: 'Joel', chapters: 3 },
      { name: 'Amos', chapters: 9 },
      { name: 'Obadiah', chapters: 1 },
      { name: 'Jonah', chapters: 4 },
      { name: 'Micah', chapters: 7 },
      { name: 'Nahum', chapters: 3 },
      { name: 'Habakkuk', chapters: 3 },
      { name: 'Zephaniah', chapters: 3 },
      { name: 'Haggai', chapters: 2 },
      { name: 'Zechariah', chapters: 14 },
      { name: 'Malachi', chapters: 4 },
    ],
  },
  {
    phase: 10,
    title: 'Return From Exile',
    why: 'The other side of the exile: rebuilding. Placed after the prophets so the return actually feels like a resolution instead of a random detour.',
    books: [
      { name: 'Ezra', chapters: 10 },
      { name: 'Nehemiah', chapters: 13 },
      { name: 'Esther', chapters: 10 },
    ],
  },
  {
    phase: 11,
    title: 'The General Epistles',
    why: 'Letters from the other apostles, rounding out New Testament teaching after Paul.',
    books: [
      { name: 'Hebrews', chapters: 13 },
      { name: 'James', chapters: 5 },
      { name: '1 Peter', chapters: 5 },
      { name: '2 Peter', chapters: 3 },
      { name: '1 John', chapters: 5 },
      { name: '2 John', chapters: 1 },
      { name: '3 John', chapters: 1 },
      { name: 'Jude', chapters: 1 },
    ],
  },
  {
    phase: 12,
    title: 'Revelation',
    why: 'The end of the story, deliberately last. Its imagery draws heavily on Ezekiel, Daniel, and the other prophets, so it lands harder once you’ve read them.',
    books: [{ name: 'Revelation', chapters: 22 }],
  },
];

/** The 65 books of the twelve phases, in reading order (excludes John). */
export const PLAN_BOOKS: Book[] = PHASES.flatMap((p) => p.books);

/** Everything to read, John first. */
export const ALL_BOOKS: Book[] = [PROLOGUE, ...PLAN_BOOKS];

/** Reading order as flat chapter references. Drives the daily suggestion. */
export type ChapterRef = { book: string; chapter: number; phase: number };

const prologueSequence: ChapterRef[] = Array.from(
  { length: PROLOGUE.chapters },
  (_, i) => ({ book: PROLOGUE.name, chapter: i + 1, phase: PROLOGUE_PHASE }),
);

export const CHAPTER_SEQUENCE: ChapterRef[] = [
  ...prologueSequence,
  ...PHASES.flatMap((p) =>
    p.books.flatMap((b) =>
      Array.from({ length: b.chapters }, (_, i) => ({
        book: b.name,
        chapter: i + 1,
        phase: p.phase,
      })),
    ),
  ),
];

export const PHASE_OF_BOOK = new Map<string, number>([
  [PROLOGUE.name, PROLOGUE_PHASE],
  ...PHASES.flatMap((p) => p.books.map((b) => [b.name, p.phase] as [string, number])),
]);

export const BOOK_BY_NAME = new Map<string, Book>(ALL_BOOKS.map((b) => [b.name, b]));

export const PHASES_CHAPTER_COUNT = PLAN_BOOKS.reduce((n, b) => n + b.chapters, 0); // 1168
export const TOTAL_BOOK_COUNT = ALL_BOOKS.length; // 66
export const TOTAL_CHAPTER_COUNT = PHASES_CHAPTER_COUNT + PROLOGUE.chapters; // 1189
