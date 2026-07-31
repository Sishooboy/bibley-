import { PHASES, PROLOGUE, PROLOGUE_WHY, type Book, type Phase } from './plan';

export type PlanId = 'both' | 'nt' | 'ot';

export type ChapterRef = { book: string; chapter: number; phase: number };

export type Plan = {
  id: PlanId;
  label: string;
  /** One line for the chooser card. */
  blurb: string;
  /** The argument for reading it in this order. */
  rationale: string;
  phases: Phase[];
  books: Book[];
  bookCount: number;
  chapterCount: number;
  sequence: ChapterRef[];
  phaseOfBook: Map<string, number>;
};

/** John leads the combined plan, which is what the twelve phases assume. */
const MEET_JESUS: Phase = {
  phase: 0,
  title: 'Meet Jesus first',
  why: PROLOGUE_WHY,
  books: [PROLOGUE],
};

/**
 * New Testament only, 27 books.
 *
 * John opens rather than Matthew: it states its purpose outright, that these
 * things are written so you may believe, and it assumes no Old Testament
 * background. Matthew is held back to third because it argues from prophecy a
 * reader may not have met yet. Acts then bridges the gospels to the letters, so
 * Paul's correspondence arrives with its churches already introduced.
 */
const NT_PHASES: Phase[] = [
  {
    phase: 1,
    title: 'Meet Jesus',
    why: "Start where the story is stated most plainly. John writes with a declared purpose, that you would believe, and he assumes nothing about temple, law or prophecy. Everything after this has a person at the centre of it.",
    books: [{ name: 'John', chapters: 21 }],
  },
  {
    phase: 2,
    title: 'Three More Angles',
    why: "The same life told three more times, each for a different reader. Mark moves fast and shows more than it explains. Luke is the careful historian, with the fullest birth narrative and the parables no one else kept. Matthew comes third on purpose: it argues from Old Testament prophecy, which lands harder once the life itself is familiar.",
    books: [
      { name: 'Mark', chapters: 16 },
      { name: 'Luke', chapters: 24 },
      { name: 'Matthew', chapters: 28 },
    ],
  },
  {
    phase: 3,
    title: 'The Church Begins',
    why: "Luke's second volume, so it picks up exactly where you left off. The gospel leaves Jerusalem, Paul is introduced as an enemy before he is an apostle, and most of the churches he later writes to are founded in front of you.",
    books: [{ name: 'Acts', chapters: 28 }],
  },
  {
    phase: 4,
    title: "Paul's Letters",
    why: "Real letters to real congregations you have just watched being planted. Ordered by weight rather than by date: Romans first as his fullest argument, then the Corinthian correspondence with its very practical mess, then the shorter prison and pastoral letters, ending with Philemon, a single page about one runaway slave.",
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
    phase: 5,
    title: 'The Other Apostles',
    why: "Letters from outside Paul's circle, which is why they read so differently. Hebrews argues that the old system pointed forward all along, James is blunt about behaviour, Peter writes to people under pressure, and John writes about love and about telling truth from counterfeit.",
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
    phase: 6,
    title: 'Revelation',
    why: "Deliberately last. Its images are borrowed almost entirely from Ezekiel, Daniel and the prophets, so a New Testament reader meets them second hand. Worth returning to if you later read the Old Testament, when half the picture stops being strange.",
    books: [{ name: 'Revelation', chapters: 22 }],
  },
];

/**
 * Old Testament only, 39 books.
 *
 * Narrative spine first, in the order events happen, so the history makes sense
 * as a story before it is interrupted. Chronicles follows Kings rather than
 * sitting beside it, because it is a retelling from after the exile and the
 * interest is in what it changes. Wisdom lands after the monarchy it grew out
 * of, the prophets after the collapse they were shouting about, and the return
 * from exile comes last so it reads as resolution.
 */
const OT_PHASES: Phase[] = [
  {
    phase: 1,
    title: 'Beginnings',
    why: "How the world was made, how it broke, and how God's answer starts with one family. Genesis sets up every promise the rest of the Old Testament chases, and Exodus turns that family into a nation with a rescue story at its centre.",
    books: [
      { name: 'Genesis', chapters: 50 },
      { name: 'Exodus', chapters: 40 },
    ],
  },
  {
    phase: 2,
    title: 'The Law',
    why: "The hardest stretch, and it goes here rather than later because it belongs to the Exodus story: a people just freed being taught how to live near a holy God. Leviticus is the sacrificial system, Numbers is forty years of wandering, Deuteronomy is Moses' last sermon before a land he never enters.",
    books: [
      { name: 'Leviticus', chapters: 27 },
      { name: 'Numbers', chapters: 36 },
      { name: 'Deuteronomy', chapters: 34 },
    ],
  },
  {
    phase: 3,
    title: 'Into the Land',
    why: "The promise finally lands, then immediately frays. Joshua is the conquest, Judges is the cycle of forgetting and rescue that follows, and Ruth is one quiet family story set in those same violent years, which is exactly why it is placed here.",
    books: [
      { name: 'Joshua', chapters: 24 },
      { name: 'Judges', chapters: 21 },
      { name: 'Ruth', chapters: 4 },
    ],
  },
  {
    phase: 4,
    title: 'Kings and Collapse',
    why: "Israel asks for a king and gets everything that comes with one. Saul, David and Solomon, then a kingdom split in two and worn down over centuries until both halves are carried off. Read as one continuous account, because that is how it was written.",
    books: [
      { name: '1 Samuel', chapters: 31 },
      { name: '2 Samuel', chapters: 24 },
      { name: '1 Kings', chapters: 22 },
      { name: '2 Kings', chapters: 25 },
    ],
  },
  {
    phase: 5,
    title: 'The Same Story, Retold',
    why: "Chronicles covers ground you have just walked, written much later for people back from exile and rebuilding. Placed second on purpose: the interest is in what it keeps, what it quietly leaves out, and why a people starting over would tell their history that way.",
    books: [
      { name: '1 Chronicles', chapters: 29 },
      { name: '2 Chronicles', chapters: 36 },
    ],
  },
  {
    phase: 6,
    title: 'Poetry and Wisdom',
    why: "A change of register after centuries of narrative. Job asks whether suffering means guilt, and lands right after a national history full of it. Many psalms belong to David and the temple you have just seen built. Proverbs is practical, Ecclesiastes is disillusioned, and the Song is love poetry with no apology for being here.",
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
    title: 'The Major Prophets',
    why: "These men were shouting into the collapse you read in Kings, so their urgency only makes sense with that fresh. Isaiah spans it, Jeremiah watches Jerusalem fall, Lamentations is the funeral, Ezekiel writes from the camps, and Daniel serves in the empire that took him.",
    books: [
      { name: 'Isaiah', chapters: 66 },
      { name: 'Jeremiah', chapters: 52 },
      { name: 'Lamentations', chapters: 5 },
      { name: 'Ezekiel', chapters: 48 },
      { name: 'Daniel', chapters: 12 },
    ],
  },
  {
    phase: 8,
    title: 'The Minor Prophets',
    why: "Shorter only in length. Same world, same crisis, twelve more voices: Hosea's ruined marriage as a picture of the nation, Amos on rigged scales, Jonah on a prophet who resents mercy. They move quickly once the idiom is familiar.",
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
    phase: 9,
    title: 'Coming Home',
    why: "The other side of the exile, and the last word of the Old Testament. Ezra rebuilds the temple, Nehemiah the walls, and Esther is set among the Jews who never went back. It ends unfinished, waiting, which is precisely the note the New Testament opens on.",
    books: [
      { name: 'Ezra', chapters: 10 },
      { name: 'Nehemiah', chapters: 13 },
      { name: 'Esther', chapters: 10 },
    ],
  },
];

function definePlan(
  id: PlanId,
  label: string,
  blurb: string,
  rationale: string,
  phases: Phase[],
): Plan {
  const books = phases.flatMap((p) => p.books);
  return {
    id,
    label,
    blurb,
    rationale,
    phases,
    books,
    bookCount: books.length,
    chapterCount: books.reduce((n, b) => n + b.chapters, 0),
    sequence: phases.flatMap((p) =>
      p.books.flatMap((b) =>
        Array.from({ length: b.chapters }, (_, i) => ({
          book: b.name,
          chapter: i + 1,
          phase: p.phase,
        })),
      ),
    ),
    phaseOfBook: new Map(
      phases.flatMap((p) => p.books.map((b) => [b.name, p.phase] as [string, number])),
    ),
  };
}

export const PLANS: Record<PlanId, Plan> = {
  both: definePlan(
    'both',
    'The whole Bible',
    'All 66 books, in an order built so each one lands with the context of the one before it.',
    'John first, then back to the beginning. History before the prophets who explain it, Acts before the letters it sets up, Revelation last.',
    [MEET_JESUS, ...PHASES],
  ),
  nt: definePlan(
    'nt',
    'New Testament',
    'The 27 books of the New Testament, opening with the gospel written to be read first.',
    'John before Matthew, because it assumes no background. Acts as the bridge into the letters. Revelation last.',
    NT_PHASES,
  ),
  ot: definePlan(
    'ot',
    'Old Testament',
    'The 39 books of the Hebrew scriptures, read as one continuous story.',
    'The narrative spine in the order events happen, then the poetry it produced, then the prophets who shouted through its collapse.',
    OT_PHASES,
  ),
};

export const PLAN_ORDER: PlanId[] = ['both', 'nt', 'ot'];

export const DEFAULT_PLAN: PlanId = 'both';

export function getPlan(id: PlanId | undefined): Plan {
  return PLANS[id ?? DEFAULT_PLAN] ?? PLANS[DEFAULT_PLAN];
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && value in PLANS;
}
