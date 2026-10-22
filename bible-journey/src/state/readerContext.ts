import { createContext } from 'react';

export type ReaderApi = {
  /**
   * Opens the reader at a chapter, loading the book if it is not cached yet.
   * With a verse, it lands on it the way a search result does: scrolled into
   * the middle of the screen and marked until it has been seen.
   */
  open: (book: string, chapter: number, verse?: number) => void;
};

export const ReaderContext = createContext<ReaderApi | null>(null);
