/*
 * Adds paragraph and poetry structure to the book files in public/bible/.
 *
 * The text the app ships came from a source that publishes verses and nothing
 * else, so the reader had no choice but to set one verse per line. That is not
 * how a Bible is printed and it is not how prose is read: it turns Mark into a
 * numbered list. The World English Bible's own USFM carries the real structure,
 * 9,254 paragraph marks and 23,331 poetry lines, and it is public domain like
 * the text, so this reads it off the source rather than guessing at it.
 *
 * **It never touches `chapters`.** Highlights are `{verse, offset}` character
 * offsets inside a verse string, so changing one character of the text moves
 * every highlight recorded in that verse. This only adds a `layout` key, and it
 * verifies the verse strings are byte identical before it writes anything.
 *
 * Run with `npm run layout`. The output is committed, so this only needs
 * running again if the structure is ever rebuilt.
 *
 *   node scripts/build-layout.mjs <path to unzipped eng-web_usfm>
 *
 * The archive is https://ebible.org/Scriptures/eng-web_usfm.zip
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIBLE = join(ROOT, 'public', 'bible');

/**
 * One character a verse, which is the whole reason this is affordable: 38,058
 * verses is 38 kB of layout across the entire Bible, small enough to live
 * inside the book files rather than needing a fetch of its own.
 *
 *   p  prose, continues the paragraph it is in
 *   P  prose, opens a new paragraph
 *   1 2 3  a line of poetry, at that indent
 *   4 5 6  the same, after a stanza break
 *
 * A verse is classified by the marker in force when its `\v` is reached. USFM
 * lets one verse span several lines, so a verse that starts as prose and runs
 * on into poetry is prose here: the app stores a verse as one string and cannot
 * break it without changing the text, which is the one thing this may not do.
 */
const PROSE_RUN = 'p';
const PROSE_NEW = 'P';
const POETRY = ['1', '2', '3'];
const POETRY_AFTER_BREAK = ['4', '5', '6'];

/** USFM ids to the names the app prints. */
const IDS = {
  GEN: 'Genesis', EXO: 'Exodus', LEV: 'Leviticus', NUM: 'Numbers',
  DEU: 'Deuteronomy', JOS: 'Joshua', JDG: 'Judges', RUT: 'Ruth',
  '1SA': '1 Samuel', '2SA': '2 Samuel', '1KI': '1 Kings', '2KI': '2 Kings',
  '1CH': '1 Chronicles', '2CH': '2 Chronicles', EZR: 'Ezra', NEH: 'Nehemiah',
  EST: 'Esther', JOB: 'Job', PSA: 'Psalms', PRO: 'Proverbs',
  ECC: 'Ecclesiastes', SNG: 'Song of Songs', ISA: 'Isaiah', JER: 'Jeremiah',
  LAM: 'Lamentations', EZK: 'Ezekiel', DAN: 'Daniel', HOS: 'Hosea',
  JOL: 'Joel', AMO: 'Amos', OBA: 'Obadiah', JON: 'Jonah', MIC: 'Micah',
  NAM: 'Nahum', HAB: 'Habakkuk', ZEP: 'Zephaniah', HAG: 'Haggai',
  ZEC: 'Zechariah', MAL: 'Malachi',
  TOB: 'Tobit', JDT: 'Judith', WIS: 'Wisdom', SIR: 'Sirach',
  BAR: 'Baruch', '1MA': '1 Maccabees', '2MA': '2 Maccabees',
  MAT: 'Matthew', MRK: 'Mark', LUK: 'Luke', JHN: 'John', ACT: 'Acts',
  ROM: 'Romans', '1CO': '1 Corinthians', '2CO': '2 Corinthians',
  GAL: 'Galatians', EPH: 'Ephesians', PHP: 'Philippians',
  COL: 'Colossians', '1TH': '1 Thessalonians', '2TH': '2 Thessalonians',
  '1TI': '1 Timothy', '2TI': '2 Timothy', TIT: 'Titus', PHM: 'Philemon',
  HEB: 'Hebrews', JAS: 'James', '1PE': '1 Peter', '2PE': '2 Peter',
  '1JN': '1 John', '2JN': '2 John', '3JN': '3 John', JUD: 'Jude',
  REV: 'Revelation',
};

const slug = (name) => name.toLowerCase().replaceAll(' ', '-');

/**
 * Chapter number to an array of per-verse codes.
 *
 * Poetry indents deeper than three are folded back to three. USFM allows q4 and
 * beyond, the WEB barely uses them, and a fourth indent on a 375px screen is
 * a margin rather than a distinction.
 */
function readUsfm(text) {
  const chapters = new Map();
  let chapter = null;
  let mode = PROSE_RUN;
  let opensParagraph = false;
  let afterBreak = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimStart();

    const c = /^\\c\s+(\d+)/.exec(line);
    if (c) {
      chapter = Number(c.group ?? c[1]);
      chapters.set(chapter, []);
      // A chapter always opens a paragraph, whatever the last one was doing.
      mode = PROSE_RUN;
      opensParagraph = true;
      afterBreak = false;
      continue;
    }

    // A stanza break. It applies to whatever line comes next.
    if (/^\\b\b/.test(line)) {
      afterBreak = true;
      continue;
    }

    const q = /^\\q(\d)?\b/.exec(line);
    if (q) {
      const depth = Math.min(Number(q[1] ?? 1), 3) - 1;
      mode = (afterBreak ? POETRY_AFTER_BREAK : POETRY)[depth];
      afterBreak = false;
      opensParagraph = false;
      // Fall through: a \q line can carry its own \v.
    } else if (/^\\(p|m|pi\d?|mi|nb|pc|pr|li\d?|lim\d?)\b/.test(line)) {
      mode = PROSE_RUN;
      opensParagraph = true;
      afterBreak = false;
    }

    const v = /^\\v\s+(\d+)/.exec(line);
    if (!v || chapter === null) continue;

    const number = Number(v[1]);
    const codes = chapters.get(chapter);
    let code = mode;
    if (mode === PROSE_RUN && opensParagraph) code = PROSE_NEW;
    // Only the first verse after a marker opens the paragraph; the rest run on.
    opensParagraph = false;
    codes[number - 1] = code;
  }

  return chapters;
}

async function main() {
  const source = process.argv[2];
  if (!source) {
    console.error('usage: node scripts/build-layout.mjs <unzipped eng-web_usfm dir>');
    process.exit(1);
  }

  const files = (await readdir(source)).filter((f) => f.endsWith('.usfm'));
  const byBook = new Map();
  for (const file of files) {
    const id = /-([A-Z0-9]{3})eng-web/.exec(file)?.[1];
    if (!id || !IDS[id]) continue;
    byBook.set(IDS[id], readUsfm(await readFile(join(source, file), 'utf8')));
  }

  let written = 0;
  let chaptersDone = 0;
  let chaptersSkipped = 0;
  const skipped = [];

  for (const [name, chapters] of byBook) {
    const path = join(BIBLE, `${slug(name)}.json`);
    const before = await readFile(path, 'utf8');
    const book = JSON.parse(before);

    const layout = book.chapters.map((verses, i) => {
      const codes = chapters.get(i + 1);
      /*
       * Per chapter and not per book. Esther and Daniel carry appended Greek
       * chapters the USFM publishes as separate books, Sirach and Romans differ
       * from this source by a verse or two in a handful of places, and a layout
       * one verse out of step would open a paragraph in the wrong sentence.
       * A chapter with no layout simply reads the way it always has.
       */
      if (!codes || codes.length !== verses.length) {
        chaptersSkipped += 1;
        skipped.push(`${name} ${i + 1}`);
        return '';
      }
      // A gap means a verse the source never introduced, which would be a hole
      // in the string. Prose is the safe reading of one.
      const out = Array.from(codes, (code) => code ?? PROSE_RUN).join('');
      chaptersDone += 1;
      return out;
    });

    book.layout = layout;

    /*
     * The guard this whole script exists under. Every verse string has to come
     * back byte for byte, because a highlight is a character offset inside one
     * and there is no way to notice afterwards that they all moved by two.
     */
    const after = JSON.parse(JSON.stringify(book));
    const original = JSON.parse(before);
    if (JSON.stringify(after.chapters) !== JSON.stringify(original.chapters)) {
      throw new Error(`${name}: verse text changed, refusing to write`);
    }

    // Minified and with no trailing newline, the same shape `npm run bible`
    // writes, so the only difference in the file is the key that was added.
    await writeFile(path, JSON.stringify(book));
    written += 1;
  }

  console.log(`books written: ${written}`);
  console.log(`chapters with layout: ${chaptersDone}`);
  console.log(`chapters left alone: ${chaptersSkipped}`);
  if (skipped.length) console.log(`  ${skipped.slice(0, 24).join(', ')}${skipped.length > 24 ? ', ...' : ''}`);
}

await main();
