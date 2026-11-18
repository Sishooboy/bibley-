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
import { IDS, readUsfm, slug } from './usfm.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIBLE = join(ROOT, 'public', 'bible');
const OUT = join(BIBLE, 'kjv');

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
