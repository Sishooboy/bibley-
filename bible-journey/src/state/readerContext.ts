import { createContext } from 'react';

export type ReaderApi = {
  /** Opens the reader at a chapter, loading the book if it is not cached yet. */
  open: (book: string, chapter: number) => void;
};

export const ReaderContext = createContext<ReaderApi | null>(null);
