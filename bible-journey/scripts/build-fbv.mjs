/*
 * Builds the Free Bible Version into public/bible/fbv/, one file per book, in
 * the same shape as the World English Bible files beside it: `chapters` of
 * verse strings and a one character a verse `layout`.
 *
 * It is here because the World English Bible and the King James are both hard
 * going for a lot of readers, the vocabulary and the grammar alike, and the
 * plain modern translations people actually reach for, the Good News, the NLT,
 * the ERV, are all under copyright. The FBV is a plain, modern translation by
 * Dr. Jonathan Gallagher, published by eBible.org under Creative Commons
 * Attribution-ShareAlike 4.0, which is what lets it ship: the credit and a link
 * to the licence go under every chapter, and the text is not changed beyond
 * taking the markup and the footnotes out.
 *
 * Run with `npm run fbv` against the unzipped archive. The output is committed,
 * so this only needs running again if the text is ever replaced.
 *
 *   node scripts/build-fbv.mjs <path to unzipped engfbv_usfm>
 *
 * The archive is https://ebible.org/Scriptures/engfbv_usfm.zip
 *
 * The FBV is a protestant Bible, 66 books, so it has none of the seven
 * deuterocanonical books, nor the Greek chapters this app appends to Esther and
 * Daniel. Those are written the honest way rather than borrowed from another
 * translation: no file for a book it does not have, which `lacks` in
 * `translations.ts` names, and an empty chapter for Esther 11 to 16 and Daniel
 * 13 and 14, so the book still has every chapter the app counts and the reader
 * can say that one is not in this translation instead of finding nothing there.
 * Anything else missing, a book or a chapter, and it refuses to write.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDS, readUsfm, slug } from './usfm.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIBLE = join(ROOT, 'public', 'bible');
const OUT = join(BIBLE, 'fbv');

/** Not in a protestant Bible, so not in this one. Mirrors `lacks` in `translations.ts`. */
const ABSENT_BOOKS = new Set(['Tobit', 'Judith', 'Wisdom', 'Sirach', 'Baruch', '1 Maccabees', '2 Maccabees']);

/** The Greek chapters the app appends to two Hebrew books, as empty chapters here. */
const ABSENT_CHAPTERS = { Esther: [11, 12, 13, 14, 15, 16], Daniel: [13, 14] };

async function main() {
  const source = process.argv[2];
  if (!source) {
    console.error('usage: node scripts/build-fbv.mjs <unzipped engfbv_usfm dir>');
    process.exit(1);
  }

  const books = new Map();
  for (const file of (await readdir(source)).filter((f) => f.endsWith('.usfm'))) {
    const id = /^\d+-([A-Z0-9]{3})engfbv/.exec(file)?.[1];
    if (!id || !IDS[id]) continue;
    books.set(IDS[id], readUsfm(await readFile(join(source, file), 'utf8')));
  }

  const problems = [];
  const out = new Map();
  for (const name of Object.values(IDS)) {
    const chapters = books.get(name);
    if (ABSENT_BOOKS.has(name)) {
      if (chapters) problems.push(`${name}: in the archive after all, so it should be built`);
      continue;
    }
    if (!chapters) {
      problems.push(`${name}: not in the archive`);
      continue;
    }
    const web = JSON.parse(await readFile(join(BIBLE, `${slug(name)}.json`), 'utf8'));
    const absent = new Set(ABSENT_CHAPTERS[name] ?? []);
    if (chapters.size + absent.size !== web.chapters.length) {
      problems.push(`${name}: ${chapters.size} chapters, the app has ${web.chapters.length}`);
      continue;
    }
    const verses = [];
    const layout = [];
    for (let c = 1; c <= web.chapters.length; c++) {
      if (absent.has(c)) {
        // Not missing by accident: the reader reads an empty chapter as one this
        // translation does not have, and says so.
        verses.push([]);
        layout.push('');
        continue;
      }
      const entry = chapters.get(c);
      if (!entry) {
        problems.push(`${name} ${c}: missing`);
        continue;
      }
      // A number the source skips is a null, the same convention the WEB uses,
      // so every verse after it keeps its number.
      // A null at the very end keeps no later number in place, so it goes:
      // Revelation 12 prints an empty verse 18 the WEB does not number at all.
      const list = Array.from({ length: entry.verses.length }, (_, i) => entry.verses[i] || null);
      while (list.length && list[list.length - 1] === null) list.pop();
      if (list.every((v) => v === null)) problems.push(`${name} ${c}: no text`);
      verses.push(list);
      layout.push(Array.from({ length: list.length }, (_, i) => entry.codes[i] ?? 'p').join(''));
    }
    out.set(name, { book: name, translation: 'FBV', chapters: verses, layout });
  }

  if (problems.length) {
    console.error(problems.join('\n'));
    console.error('Refusing to write.');
    process.exit(1);
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const differ = [];
  for (const [name, book] of out) {
    await writeFile(join(OUT, `${slug(name)}.json`), JSON.stringify(book));
    const web = JSON.parse(await readFile(join(BIBLE, `${slug(name)}.json`), 'utf8'));
    book.chapters.forEach((v, i) => {
      if (v.length && v.length !== web.chapters[i].length) differ.push(`${name} ${i + 1} (${v.length} against ${web.chapters[i].length})`);
    });
  }
  console.log(`wrote ${out.size} books to public/bible/fbv; ${differ.length} chapters differ from the WEB in verse count`);
  if (differ.length) console.log(differ.join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
