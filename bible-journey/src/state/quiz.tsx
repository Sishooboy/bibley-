import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { QuizSheet } from '../components/QuizSheet';
import { QuizContext, type QuizApi } from './quizContext';
import { useQuiz } from './useQuiz';

/**
 * Which quiz is open, if any.
 *
 * **State here, drawing in `QuizHost`, and the split is load bearing.** A quiz
 * is offered from the reader's footer, so the reader has to be inside this
 * provider; and a quiz sends the reader to a verse, so the sheet has to be
 * inside the reader's provider. One provider that also drew the sheet could
 * only be on one side of that. So this wraps the reader's provider and holds
 * the state, and `QuizHost`, mounted inside the reader's provider, draws it.
 */
export function QuizProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<QuizApi['current']>(null);
  const open = useCallback(
    (book: string) => setCurrent((was) => ({ book, run: (was?.run ?? 0) + 1 })),
    [],
  );
  const close = useCallback(() => setCurrent(null), []);
  const api = useMemo<QuizApi>(() => ({ open, close, current }), [open, close, current]);
  return <QuizContext value={api}>{children}</QuizContext>;
}

/** Draws the open quiz. Keyed on the opening, so taking the same quiz twice starts afresh. */
export function QuizHost() {
  const { current, close } = useQuiz();
  return current ? <QuizSheet key={current.run} book={current.book} onClose={close} /> : null;
}
