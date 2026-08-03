/*
 * Downloads the World English Bible into public/bible/, one file per book.
 *
 * The WEB is public domain, which is the whole reason it is the translation
 * here: no licence to honour, no attribution to get wrong, no takedown risk on
 * an App Store build.
 *
 * Run with `npm run bible`. The output is committed, so this only needs running
 * again if the text is ever replaced.
 *
 * It refuses to write anything unless every book in src/data/plan.ts is present
 * with exactly the chapter count the app claims. A reader who marks John 21 and
 * finds the reader has only 20 chapters would have no way to tell which half is
 * lying, so the mismatch has to stop the build instead.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'bible');
const TRANSLATION = 'WEB';
const BOOKS_URL = `https://bolls.life/get-books/${TRANSLATION}/`;
const TEXT_URL = `https://bolls.life/static/translations/${TRANSLATION}.json`;

/** Where the source's name for a book differs from the app's. */
const ALIASES = {
  'Song of Solomon': 'Song of Songs',
  Psalm: 'Psalms',
  'Acts of the Apostles': 'Acts',
  Revelation: 'Revelation',
  'Revelation of John': 'Revelation',
};

export function slugFor(book) {
  return book.toLowerCase().replace(/\s+/g, '-');
}

/**
 * The source carries a little inline markup and the occasional editorial
 * bracket. Verses render as plain text, so it comes out here rather than in the
 * app, where it would run on every chapter open forever.
 */
function clean(text) {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function planBooks(source) {
  const re = /name:\s*'([^']+)'\s*,\s*chapters:\s*(\d+)/g;
  const out = new Map();
  let match;
  while ((match = re.exec(source))) out.set(match[1], Number(match[2]));
  return out;
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
}

async function main() {
  const expected = planBooks(await readFile(join(ROOT, 'src', 'data', 'plan.ts'), 'utf8'));
  console.log(`Plan expects ${expected.size} books.`);

  const [books, verses] = await Promise.all([getJson(BOOKS_URL), getJson(TEXT_URL)]);
  console.log(`Source returned ${books.length} books and ${verses.length} verses.`);

  const nameOf = new Map(books.map((b) => [b.bookid, ALIASES[b.name] ?? b.name]));

  /** book -> chapter number -> verse array */
  const grouped = new Map();
  for (const row of verses) {
    const name = nameOf.get(row.book);
    if (!name) continue;
    if (!grouped.has(name)) grouped.set(name, new Map());
    const chapters = grouped.get(name);
    if (!chapters.has(row.chapter)) chapters.set(row.chapter, []);
    chapters.get(row.chapter)[row.verse - 1] = clean(row.text);
  }

  const problems = [];
  const extras = [];
  for (const [book, chapters] of expected) {
    const found = grouped.get(book);
    if (!found) {
      problems.push(`${book}: missing from the source entirely`);
      continue;
    }
    // The source carries the wider canon, so it has books and chapters this
    // plan does not use, Psalm 151 among them. Extra is fine and gets dropped.
    // Short is fatal: a reader who marks a chapter the reader cannot open has
    // no way to tell which half is lying.
    if (found.size < chapters) {
      problems.push(`${book}: plan says ${chapters} chapters, source has only ${found.size}`);
    } else if (found.size > chapters) {
      extras.push(`${book} (+${found.size - chapters})`);
    }
    for (let c = 1; c <= chapters; c++) {
      const verseList = found.get(c);
      if (!verseList || verseList.length === 0) problems.push(`${book} ${c}: no verses`);
    }
  }

  if (problems.length > 0) {
    console.error(`\nRefusing to write. ${problems.length} problem(s):`);
    for (const line of problems.slice(0, 20)) console.error(`  ${line}`);
    process.exit(1);
  }

  if (extras.length > 0) {
    console.log(`Outside this canon, dropped: ${extras.join(', ')}.`);
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  let bytes = 0;
  let chapterCount = 0;
  let verseCount = 0;
  const omitted = [];
  for (const [book, chapters] of expected) {
    const found = grouped.get(book);
    const payload = {
      book,
      translation: TRANSLATION,
      chapters: Array.from({ length: chapters }, (_, i) => {
        const verses = found.get(i + 1);
        // Verse numbering follows the King James tradition, but this text is
        // translated from a source that does not carry every verse in it, so a
        // handful of numbers have nothing behind them. Luke 17:36 and Acts 8:37
        // are the well known ones. They are recorded as explicit nulls: the
        // numbering has to stay intact, and a sparse array hole is a bug
        // waiting to happen, since Array#some walks straight past it.
        return Array.from({ length: verses.length }, (_, v) => {
          const text = verses[v];
          if (typeof text === 'string' && text.length > 0) return text;
          omitted.push(`${book} ${i + 1}:${v + 1}`);
          return null;
        });
      }),
    };
    const json = JSON.stringify(payload);
    await writeFile(join(OUT, `${slugFor(book)}.json`), json);
    bytes += json.length;
    chapterCount += chapters;
    verseCount += payload.chapters.reduce((n, v) => n + v.length, 0);
  }

  console.log(
    `\nWrote ${expected.size} books, ${chapterCount} chapters, ${verseCount} verse slots, ` +
      `${(bytes / 1024 / 1024).toFixed(2)} MB across public/bible/.`,
  );
  if (omitted.length > 0) {
    console.log(`Not in this translation's source text: ${omitted.join(', ')}.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
