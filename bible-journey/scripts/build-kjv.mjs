/*
 * Builds the King James Version into public/bible/kjv/, one file per book, in
 * the same shape as the World English Bible files beside it: `chapters` of
 * verse strings and a one character a verse `layout`.
 *
 * The source is eBible.org's USFM of the 1769 standardised text with the
 * Apocrypha, courtesy of CrossWire and eBible.org. It is public domain outside
 * the United Kingdom, where letters patent still govern printing, which is
 * stated on the credits card rather than left for a reader to discover.
 *
 * Run with `npm run kjv` against the unzipped archive. The output is committed,
 * so this only needs running again if the text is ever replaced.
 *
 *   node scripts/build-kjv.mjs <path to unzipped eng-kjv_usfm>
 *
 * The archive is https://ebible.org/Scriptures/eng-kjv_usfm.zip
 *
 * It refuses to write anything unless every book the app prints is present with
 * exactly the chapter count the World English Bible files have. Progress is kept
 * by book and chapter whatever translation is open, so a chapter that exists in
 * one and not the other would be a chapter a reader could mark and never find.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIBLE = join(ROOT, 'public', 'bible');
const OUT = join(BIBLE, 'kjv');

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

/**
 * The same joins `fetch-bible.mjs` makes for the World English Bible, so the two
 * translations have the same chapters. Every one is an append. The Greek Esther
 * keeps its own numbering, which starts at 10:4 precisely so it can follow a
 * Hebrew Esther that stops at 10:3; Susanna and Bel become Daniel 13 and 14.
 * The Song of the Three is left out for the reason the WEB leaves it out: the
 * Vulgate numbers it inside Daniel 3 and moves verses a highlight may point at.
 * 1 and 2 Esdras and the Prayer of Manasseh are not in the canon the app prints.
 */
const INSERTS = { ESG: { into: 'Esther' }, SUS: { into: 'Daniel', chapter: 13 }, BEL: { into: 'Daniel', chapter: 14 } };

const slug = (name) => name.toLowerCase().replaceAll(' ', '-');

/**
 * A verse's words with the markup taken out. The archive tags nearly every word
 * with a Strong's number, prints the translators' supplied words in `\add`, the
 * divine name in `\nd` and Christ's words in `\wj`; the reader shows plain text,
 * so all of it comes out here rather than on every chapter open forever.
 * Footnotes and cross references go entirely.
 */
function clean(raw) {
  return raw
    .replace(/\\f\s.*?\\f\*/g, '')
    .replace(/\\x\s.*?\\x\*/g, '')
    .replace(/\\\+?w\s+([^|\\]*?)(?:\|[^\\]*)?\\\+?w\*/g, '$1')
    .replace(/\\\+?[a-z]+\d?\*?/g, '')
    .replace(/[¶]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

/**
 * Chapters of verses and their layout codes, read in one pass. The layout codes
 * are the ones `build-layout.mjs` writes for the WEB: `p` and `P` prose, `1` to
 * `3` poetry, `4` to `6` poetry after a stanza break.
 */
function readUsfm(text) {
  const chapters = new Map();
  let chapter = null;
  let verse = null;
  let buffer = '';
  let title = '';
  let mode = 'p';
  let opens = false;
  let afterBreak = false;

  const flush = () => {
    if (chapter === null || verse === null) return;
    const entry = chapters.get(chapter);
    entry.verses[verse - 1] = clean(buffer);
    buffer = '';
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimStart();
    const c = /^\\c\s+(\d+)/.exec(line);
    if (c) {
      flush();
      chapter = Number(c[1]);
      verse = null;
      chapters.set(chapter, { verses: [], codes: [] });
      mode = 'p';
      opens = true;
      afterBreak = false;
      title = '';
      continue;
    }
    if (chapter === null) continue;
    // A psalm's title. The WEB carries it as the start of verse 1, so this does
    // too, which keeps the two translations' verse 1 the same kind of thing.
    const d = /^\\d\s+(.*)$/.exec(line);
    if (d) {
      title = clean(d[1]);
      continue;
    }
    // Headings and titles inside a book are the archive's, not the text's.
    if (/^\\(s\d?|ms\d?|mt\d?|h|toc\d|id|ide|ip|is\d?|imt\d?|tl)\b/.test(line) && !/\\v\s/.test(line)) continue;
    if (/^\\b\b/.test(line)) {
      afterBreak = true;
      continue;
    }
    const q = /^\\q(\d)?\b/.exec(line);
    if (q) {
      const depth = Math.min(Number(q[1] ?? 1), 3) - 1;
      mode = String((afterBreak ? 4 : 1) + depth);
      afterBreak = false;
      opens = false;
    } else if (/^\\(p|m|pi\d?|mi|nb|pc|pr|li\d?)\b/.test(line)) {
      mode = 'p';
      opens = true;
      afterBreak = false;
    }

    let rest = line.replace(/^\\(q\d?|p|m|pi\d?|mi|nb|pc|pr|li\d?)\b\s*/, '');
    for (;;) {
      const v = /\\v\s+(\d+)\s*/.exec(rest);
      if (!v) {
        if (verse !== null) buffer += ` ${rest}`;
        break;
      }
      if (verse !== null) buffer += ` ${rest.slice(0, v.index)}`;
      flush();
      verse = Number(v[1]);
      const entry = chapters.get(chapter);
      entry.codes[verse - 1] = mode === 'p' && opens ? 'P' : mode;
      opens = false;
      if (verse === 1 && title) {
        buffer = `${title} `;
        title = '';
      }
      rest = rest.slice(v.index + v[0].length);
    }
  }
  flush();
  return chapters;
}

async function main() {
  const source = process.argv[2];
  if (!source) {
    console.error('usage: node scripts/build-kjv.mjs <unzipped eng-kjv_usfm dir>');
    process.exit(1);
  }

  const files = (await readdir(source)).filter((f) => f.endsWith('.usfm'));
  const books = new Map();
  const extra = new Map();
  for (const file of files) {
    const id = /-([A-Z0-9]{3})eng-kjv/.exec(file)?.[1];
    if (!id) continue;
    const parsed = readUsfm(await readFile(join(source, file), 'utf8'));
    if (IDS[id]) books.set(IDS[id], parsed);
    else if (INSERTS[id]) extra.set(id, parsed);
  }

  for (const [id, parsed] of extra) {
    const { into, chapter } = INSERTS[id];
    const target = books.get(into);
    for (const [n, entry] of parsed) {
      const at = chapter ?? n;
      const existing = target.get(at);
      if (existing) {
        // An append onto a chapter the Hebrew text already has: Esther 10:4 on.
        entry.verses.forEach((v, i) => {
          if (v !== undefined) {
            existing.verses[i] = v;
            existing.codes[i] = entry.codes[i];
          }
        });
      } else {
        target.set(at, entry);
      }
    }
  }

  const problems = [];
  const out = new Map();
  for (const [name, chapters] of books) {
    const web = JSON.parse(await readFile(join(BIBLE, `${slug(name)}.json`), 'utf8'));
    if (chapters.size !== web.chapters.length) {
      problems.push(`${name}: ${chapters.size} chapters, the app has ${web.chapters.length}`);
      continue;
    }
    const verses = [];
    const layout = [];
    for (let c = 1; c <= chapters.size; c++) {
      const entry = chapters.get(c);
      if (!entry) {
        problems.push(`${name} ${c}: missing`);
        continue;
      }
      // A number the source skips is a null, the same convention the WEB uses.
      const list = Array.from({ length: entry.verses.length }, (_, i) => entry.verses[i] || null);
      verses.push(list);
      layout.push(Array.from({ length: list.length }, (_, i) => entry.codes[i] ?? 'p').join(''));
    }
    out.set(name, { book: name, translation: 'KJV', chapters: verses, layout });
  }
  for (const name of Object.values(IDS)) if (!books.has(name)) problems.push(`${name}: not in the archive`);

  if (problems.length) {
    console.error(problems.join('\n'));
    console.error('Refusing to write.');
    process.exit(1);
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  let differ = 0;
  for (const [name, book] of out) {
    await writeFile(join(OUT, `${slug(name)}.json`), JSON.stringify(book));
    const web = JSON.parse(await readFile(join(BIBLE, `${slug(name)}.json`), 'utf8'));
    book.chapters.forEach((v, i) => {
      if (v.length !== web.chapters[i].length) differ += 1;
    });
  }
  console.log(`wrote ${out.size} books to public/bible/kjv; ${differ} chapters differ from the WEB in verse count`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
