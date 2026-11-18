/**
 * Every outside work the app uses, what it is used for, and on what terms.
 *
 * Each licence line was checked against the rights holder's own page, and the
 * `url` is that page rather than a home page, so a reader who wants to check can
 * land on the statement itself. Two corrections came out of doing that. The
 * audio was recorded in 2000 and 2001 and released without restriction; nothing
 * on the host says who released it or when, so nothing here says either. And
 * the King James page speaks of letters patent, not the Crown, so this does too.
 *
 * `credits.test.ts` checks every entry has a working shape. Adding a text, a
 * recording or a font to the app means adding it here in the same commit.
 */
export type Credit = {
  /** The work, as its owner names it. */
  work: string;
  /** What the app uses it for, in the reader's terms. */
  usedFor: string;
  /** The terms, in a sentence. */
  terms: string;
  /** The page that states the terms. */
  url: string;
  /** The licence itself, linked, where the terms are a licence that asks for that. */
  licence?: { name: string; url: string };
};

export const CREDITS: Credit[] = [
  {
    work: 'World English Bible',
    usedFor: 'The Bible text in the reader, search and quizzes, and its paragraphs and poetry lines.',
    terms: 'Public domain. Text downloaded from bolls.life; paragraphing from the eBible.org USFM edition.',
    url: 'https://worldenglish.bible/',
  },
  {
    work: 'Berean Standard Bible',
    usedFor: 'The section headings over each chapter of the 66 books.',
    terms: 'Dedicated to the public domain on 30 April 2023.',
    url: 'https://berean.bible/terms.htm',
  },
  {
    work: 'King James Version',
    usedFor: 'The second translation in the reader, with the Apocrypha, and the verse of the day.',
    terms:
      'The 1769 standardised text. Public domain outside the United Kingdom, where it remains under letters patent. Text courtesy of CrossWire and eBible.org.',
    url: 'https://ebible.org/KJV/copr.htm',
  },
  {
    work: 'Free Bible Version',
    usedFor: 'The plain, easy to read translation in the reader. It has the 66 books of a protestant Bible.',
    // The licence's conditions, kept: the copyright and source, a note of what
    // was changed, and the same licence on what is shared from it.
    terms:
      'Copyright © 2018 Dr. Jonathan Gallagher, from eBible.org, under the Creative Commons Attribution Share-Alike license 4.0. The footnotes and word tags are left out here and the text is otherwise unchanged; the files made from it are shared under the same licence.',
    url: 'https://ebible.org/engfbv/copyright.htm',
    licence: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  },
  {
    work: 'World English Bible audio, read by David Williams',
    usedFor: 'Listening in the reader.',
    terms: 'Recorded in 2000 and 2001 and released into the public domain without restriction.',
    url: 'https://www.audiotreasure.com/webindex.htm',
  },
  {
    work: 'Fraunces, by Undercase Type',
    usedFor: 'Headings, figures and buttons.',
    terms: 'SIL Open Font License 1.1.',
    url: 'https://github.com/undercasetype/Fraunces/blob/master/OFL.txt',
  },
  {
    work: 'Inter, by Rasmus Andersson',
    usedFor: 'Body text.',
    terms: 'SIL Open Font License 1.1.',
    url: 'https://github.com/rsms/inter/blob/master/LICENSE.txt',
  },
  {
    work: 'React, Recharts and Supabase JS',
    usedFor: 'The interface, the charts in Stats, and the connection that keeps devices in step.',
    terms: 'MIT License.',
    url: 'https://opensource.org/license/mit',
  },
];
