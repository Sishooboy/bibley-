/*
 * Section headings for every chapter, from the Berean Standard Bible.
 *
 * The World English Bible has no headings of its own, and every modern
 * translation that does keeps them under copyright: the NIV, the ESV, the NASB
 * and the Good News Translation are all editorial work owned by their
 * publishers even where the translation underneath is ancient. Hand writing
 * three thousand of them is weeks of work.
 *
 * The Berean Standard Bible is the way out. It carries 3,017 `\s1` headings
 * across all 66 protestant books and eBible.org publishes it as **Public
 * Domain**, contributed by BSB Publishing, LLC, which is the same footing the
 * WEB text this app already ships stands on. `copr.htm` in the archive says so
 * twice, and `sections.test.ts` keeps the credit on screen.
 *
 * Run with `npm run sections`. The output is committed.
 *
 *   node scripts/build-sections.mjs <path to unzipped engbsb_usfm>
 *
 * The archive is https://ebible.org/Scriptures/engbsb_usfm.zip
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIBLE = join(ROOT, 'public', 'bible');
const INSIGHTS = join(BIBLE, 'insights.json');

/** USFM ids to the names the app prints. The Berean is the 66, no deuterocanon. */
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
 * Headings and versification out of one USFM file.
 *
 * A heading belongs to the verse that follows it, since USFM writes `\s1` on
 * its own line above the paragraph it opens. Several can stack before one verse
 * where a book has a major heading over a section heading, and only the last is
 * kept: two headings on one paragraph is a formatting decision this reader has
 * no way to draw.
 */
function read(text) {
  const heads = new Map();
  const shape = new Map();
  let chapter = null;
  let pending = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimStart();

    const c = /^\\c\s+(\d+)/.exec(line);
    if (c) {
      chapter = Number(c[1]);
      heads.set(chapter, []);
      shape.set(chapter, 0);
      pending = null;
      continue;
    }

    const s = /^\\s1?\s+(.*)/.exec(line);
    if (s && chapter !== null) {
      // Strip any character markers the heading carries, `\nd LORD\nd*` and so on.
      const title = s[1].replace(/\\[a-z]+\*?/g, '').replace(/\s+/g, ' ').trim();
      if (title) pending = title;
      continue;
    }

    const v = /^\\v\s+(\d+)/.exec(line);
    if (!v || chapter === null) continue;
    const number = Number(v[1]);
    shape.set(chapter, Math.max(shape.get(chapter), number));
    if (pending) {
      heads.get(chapter).push({ v: number, t: pending });
      pending = null;
    }
  }

  return { heads, shape };
}

/**
 * The notes already written by hand, lifted off the headings they were attached
 * to so they can be put back on the Berean's.
 *
 * A note is the expensive half and the headings are the cheap half, so the
 * headings are replaced wholesale and the notes are re-homed. Each goes on the
 * heading that covers its verse, meaning the last heading at or before it, so a
 * note written for the baptism stays on the paragraph the baptism is in even
 * though the two books name it differently.
 */
function rehome(existing, heads) {
  const notes = [];
  for (const [chapter, list] of Object.entries(existing ?? {})) {
    for (const section of list) {
      if (section.n) notes.push({ chapter, v: section.v, n: section.n });
    }
  }

  let placed = 0;
  let orphaned = 0;
  for (const note of notes) {
    const list = heads.get(Number(note.chapter)) ?? [];
    let home = null;
    for (const head of list) {
      if (head.v <= note.v) home = head;
      else break;
    }
    if (home && !home.n) {
      home.n = note.n;
      placed += 1;
    } else {
      orphaned += 1;
    }
  }
  return { placed, orphaned, total: notes.length };
}

async function main() {
  const source = process.argv[2];
  if (!source) {
    console.error('usage: node scripts/build-sections.mjs <unzipped engbsb_usfm dir>');
    process.exit(1);
  }

  const insights = JSON.parse(await readFile(INSIGHTS, 'utf8'));
  const files = (await readdir(source)).filter((f) => f.endsWith('.usfm'));

  let books = 0;
  let headings = 0;
  let chapters = 0;
  let skipped = 0;
  const skippedDetail = [];
  let notesPlaced = 0;
  let notesOrphaned = 0;

  for (const file of files) {
    const id = /-([A-Z0-9]{3})engbsb/.exec(file)?.[1];
    if (!id || !IDS[id]) continue;
    const name = IDS[id];
    const entry = insights.books[name];
    if (!entry) continue;

    const book = JSON.parse(await readFile(join(BIBLE, `${slug(name)}.json`), 'utf8'));
    const { heads, shape } = read(await readFile(join(source, file), 'utf8'));

    /*
     * Per chapter, not per book, the same rule the layout follows. The Berean
     * is a different translation, so a handful of chapters divide their verses
     * differently: Romans 14 and 16 move the doxology, and Esther and Daniel
     * carry Greek chapters the Berean does not have at all. A heading one verse
     * out of step names the wrong paragraph, so those chapters get none.
     */
    const sections = {};
    book.chapters.forEach((verses, i) => {
      const chapter = i + 1;
      if (shape.get(chapter) !== verses.length) {
        skipped += 1;
        if (skippedDetail.length < 16) skippedDetail.push(`${name} ${chapter}`);
        heads.delete(chapter);
        return;
      }
      chapters += 1;
    });

    const moved = rehome(entry.sections, heads);
    notesPlaced += moved.placed;
    notesOrphaned += moved.orphaned;

    for (const [chapter, list] of heads) {
      if (list.length === 0) continue;
      sections[String(chapter)] = list;
      headings += list.length;
    }

    if (Object.keys(sections).length > 0) {
      entry.sections = sections;
      books += 1;
    } else {
      delete entry.sections;
    }
  }

  await writeFile(INSIGHTS, JSON.stringify(insights));

  console.log(`books with headings : ${books}`);
  console.log(`headings written    : ${headings}`);
  console.log(`chapters covered    : ${chapters}`);
  console.log(`chapters skipped    : ${skipped}${skippedDetail.length ? `  (${skippedDetail.join(', ')})` : ''}`);
  console.log(`hand written notes  : ${notesPlaced} re-homed, ${notesOrphaned} orphaned`);
}

await main();
