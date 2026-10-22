import { createContext } from 'react';

export type QuizApi = {
  /** Opens a book's quiz over whatever is on screen, the reader included. */
  open: (book: string) => void;
  close: () => void;
  /** The quiz that is open, and which opening of it, so a retake from outside starts afresh. */
  current: { book: string; run: number } | null;
};

export const QuizContext = createContext<QuizApi | null>(null);
