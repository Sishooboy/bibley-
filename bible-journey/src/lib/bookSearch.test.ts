import { describe, expect, it } from 'vitest';
import { CANON } from '../data/canon';
import { matchesBook, normalise, rankBooks } from './bookSearch';

describe('finding a book by typing', () => {
  it('ignores case, spaces and punctuation', () => {
    expect(normalise('1 Samuel')).toBe('1samuel');
    expect(matchesBook('1 Samuel', '1samuel')).toBe(true);
    expect(matchesBook('1 Samuel', '1 SAM')).toBe(true);
    expect(matchesBook('Song of Songs', 'songof')).toBe(true);
  });

  it('matches an abbreviation letter by letter', () => {
    expect(matchesBook('John', 'jhn')).toBe(true);
    expect(matchesBook('Revelation', 'rvltn')).toBe(true);
    expect(matchesBook('Habakkuk', 'hbk')).toBe(true);
  });

  it('does not match letters in the wrong order', () => {
    expect(matchesBook('John', 'nhj')).toBe(false);
    expect(matchesBook('Mark', 'markk')).toBe(false);
  });

  it('puts the book you meant first', () => {
    // "john" also appears inside 1, 2 and 3 John, so plain John has to win.
    expect(rankBooks(CANON, 'john')[0]).toBe('John');
    expect(rankBooks(CANON, 'jud')[0]).toBe('Judges');
    expect(rankBooks(CANON, 'rev')[0]).toBe('Revelation');
    expect(rankBooks(CANON, '1 cor')[0]).toBe('1 Corinthians');
  });

  it('reaches every book in the canon by its own name', () => {
    for (const book of CANON) {
      expect(rankBooks(CANON, book)[0]).toBe(book);
    }
  });

  it('finds the numbered books distinctly', () => {
    expect(rankBooks(CANON, '2 kings')[0]).toBe('2 Kings');
    expect(rankBooks(CANON, '3john')[0]).toBe('3 John');
  });

  it('returns nothing for an empty query, and nothing for nonsense', () => {
    expect(rankBooks(CANON, '')).toEqual([]);
    expect(rankBooks(CANON, '   ')).toEqual([]);
    expect(rankBooks(CANON, 'zzzz')).toEqual([]);
  });
});
