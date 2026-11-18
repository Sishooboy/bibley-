/*
 * Reading eBible.org's USFM into the shape the reader takes, shared by the
 * scripts that build a translation beside the World English Bible: the King
 * James (`build-kjv.mjs`) and the Free Bible Version (`build-fbv.mjs`).
 *
 * One copy rather than two because the two archives are made by the same tool
 * and mark the same things the same way, and a fix to how a verse is cleaned
 * should reach every translation built from them, not only the one somebody
 * happened to be looking at.
 */

/** USFM ids to the names the app prints. */
export const IDS = {
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

export const slug = (name) => name.toLowerCase().replaceAll(' ', '-');

/**
 * A verse's words with the markup taken out. Both archives tag nearly every
 * word with a Strong's number, and the King James prints the translators'
 * supplied words in `\add`, the divine name in `\nd` and Christ's words in
 * `\wj`; the reader shows plain text, so all of it comes out here rather than on
 * every chapter open forever. Footnotes and cross references go entirely.
 */
export function clean(raw) {
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
export function readUsfm(text) {
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
