/**
 * Rebuild src/data/audioBooks.ts by asking the recording's host what exists.
 *
 * Run with `npm run audio`. The output is committed, so this is rarely needed:
 * only if the recordings move, or if the set gains the books it is missing.
 *
 * **It probes rather than reads the published index, and that is the point.**
 * The index at audiotreasure.com/webindex.htm is wrong in at least two places,
 * listing 22_Song_of_Soloman_01 and 25_Lamentations01 when the real files are
 * 22_Song_of_Solomon_01 and 25_Lam1. A wrong filename does not throw anywhere:
 * it gives a play button that silently does nothing, which is the failure this
 * script exists to prevent.
 *
 * Chapter one first, then the last chapter walked back to whatever the
 * recording actually has. Enough to catch a wrong prefix and a wrong zero
 * padding without asking for all 1,189 chapters of somebody else's server.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.audiotreasure.com/content/WEBD_AT';

/** This app's book name on the left, the recording's own token on the right. */
const PREFIX = {
  Genesis: '01_Genesis', Exodus: '02_Exodus', Leviticus: '03_Leviticus',
  Numbers: '04_Numbers', Deuteronomy: '05_Deuteronomy', Joshua: '06_Joshua',
  Judges: '07_Judges', Ruth: '08_Ruth', '1 Samuel': '09_1Samuel',
  '2 Samuel': '10_2Samuel', '1 Kings': '11_1Kings', '2 Kings': '12_2Kings',
  '1 Chronicles': '13_1Chronicles', '2 Chronicles': '14_2Chronicles',
  Ezra: '15_Ezra', Nehemiah: '16_Nehemiah', Esther: '17_Esther', Job: '18_Job',
  Psalms: '19_Psalm', Proverbs: '20_Prov', Ecclesiastes: '21_Ecclesiastes',
  'Song of Songs': '22_Song_of_Solomon', Isaiah: '23_Isaiah',
  Jeremiah: '24_Jeremiah', Lamentations: '25_Lam', Ezekiel: '26_Ezekiel',
  Daniel: '27_Daniel', Hosea: '28_Hosea', Joel: '29_Joel', Amos: '30_Amos',
  Obadiah: '31_Obadiah', Jonah: '32_Jonah', Micah: '33_Micah', Nahum: '34_Nahum',
  Habakkuk: '35_Habakkuk', Zephaniah: '36_Zephaniah', Haggai: '37_Haggai',
  Zechariah: '38_Zechariah', Malachi: '39_Malachi', Matthew: '40_Matt',
  Mark: '41_Mark', Luke: '42_Luke', John: '43_John', Acts: '44_Acts',
  Romans: '45_Romans', '1 Corinthians': '46_1Cor', '2 Corinthians': '47_2Cor',
  Galatians: '48_Gal', Ephesians: '49_Ephesians', Philippians: '50_Philippians',
  Colossians: '51_Colossians', '1 Thessalonians': '52_1Thess',
  '2 Thessalonians': '53_2Thess', '1 Timothy': '54_1Timothy',
  '2 Timothy': '55_2Timothy', Titus: '56_Titus', Philemon: '57_Philemon',
  Hebrews: '58_Hebrews', James: '59_James', '1 Peter': '60_1Peter',
  '2 Peter': '61_2Peter', '1 John': '62_1John', '2 John': '63_2John',
  '3 John': '64_3John', Jude: '65_Jude', Revelation: '66_Revelation',
};

/** How a chapter number joins the prefix. Four answers, all of them real. */
const SHAPES = {
  under2: (p, n) => `${p}_${String(n).padStart(2, '0')}`,
  under3: (p, n) => `${p}_${String(n).padStart(3, '0')}`,
  bare1: (p, n) => `${p}${n}`,
  whole: (p) => p,
};

/** The canon this app ships, read from the files the reader itself reads. */
function canon() {
  const out = [];
  for (const file of readdirSync(join(root, 'public/bible'))) {
    if (!file.endsWith('.json') || file === 'insights.json') continue;
    const json = JSON.parse(readFileSync(join(root, 'public/bible', file), 'utf8'));
    const name = json.book ?? json.name;
    if (name) out.push([name, (json.chapters ?? []).length]);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function exists(name) {
  try {
    const res = await fetch(`${BASE}/${name}.mp3`, { method: 'HEAD' });
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * The pattern that answers for this book, and how many chapters it covers.
 *
 * The count is walked down from the app's own chapter count rather than
 * assumed: the canon here is Catholic, so Esther runs to 16 and Daniel to 14,
 * and the recording stops at the Hebrew 10 and 12. Claiming the app's number
 * would offer audio for a chapter nobody recorded.
 */
async function settle(book, chapters) {
  const prefix = PREFIX[book];
  if (!prefix) return null;

  for (const [shape, make] of Object.entries(SHAPES)) {
    if (!(await exists(make(prefix, 1)))) {
      await wait(80);
      continue;
    }
    if (shape === 'whole') return { prefix, shape, recorded: 1 };

    for (let n = chapters; n >= 1; n--) {
      if (await exists(make(prefix, n))) return { prefix, shape, recorded: n };
      await wait(80);
    }
  }
  return null;
}

const rows = [];
const silent = [];
for (const [book, chapters] of canon()) {
  const hit = await settle(book, chapters);
  if (hit) rows.push([book, hit]);
  else silent.push(book);
  process.stderr.write(hit ? '.' : `\n  no recording: ${book}\n`);
  await wait(80);
}
process.stderr.write('\n');

const body = rows
  .map(([book, v]) => `  ${JSON.stringify(book)}: ['${v.prefix}', '${v.shape}', ${v.recorded}],`)
  .join('\n');

const header = [
  '/*',
  ' * Which recording file holds which chapter.',
  ' *',
  ' * **Generated by scripts/build-audio-map.mjs, which asks the server rather',
  ' * than reading its index**, because the index is wrong: it publishes',
  ' * 22_Song_of_Soloman_01 and 25_Lamentations01 and both 404. Run `npm run',
  ' * audio` to rebuild. Do not edit by hand.',
  ' *',
  ' * The tuple is [prefix, shape, recorded].',
  ' *',
  ' * `shape` is how the chapter number joins the prefix, and it is four',
  ' * different answers because the recording is volunteer work rather than a',
  ' * database export:',
  ' *   under2  06_Joshua_01     most books',
  ' *   under3  19_Psalm_001     Psalms alone',
  ' *   bare1   25_Lam1          Lamentations alone, no separator, no padding',
  ' *   whole   65_Jude          the one chapter books, which carry no number',
  ' *',
  ' * `recorded` is how many chapters the recording has, which is not always how',
  ' * many this app has. The canon here is Catholic, so Esther runs to 16 and',
  ' * Daniel to 14, and the recording stops at the Hebrew 10 and 12.',
  ' *',
  ` * Silent, and so absent from this map: ${silent.join(', ')}.`,
  ' */',
].join('\n');

writeFileSync(
  join(root, 'src/data/audioBooks.ts'),
  `${header}
export type AudioShape = 'under2' | 'under3' | 'bare1' | 'whole';

/** [filename prefix, how the chapter number joins it, chapters recorded]. */
export const AUDIO_BOOKS: Record<string, readonly [string, AudioShape, number]> = {
${body}
};
`,
  'utf8',
);
console.log(`${rows.length} books mapped, ${silent.length} silent`);
