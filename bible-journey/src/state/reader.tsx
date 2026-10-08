import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Reader } from '../components/Reader';
import { loadBook } from '../lib/bible';
import { reducedMotion } from '../lib/motion';
import { ReaderContext, type ReaderApi } from './readerContext';

/**
 * How long the reader takes to leave. It stays mounted this long after Close,
 * marked `data-closing`, so the stylesheet can take it away rather than the
 * page underneath simply reappearing. Not exported, because a plain value
 * exported beside a component turns off fast refresh for the whole module;
 * the stylesheet's `readerOut` is the other half and says the same number.
 */
const READER_EXIT_MS = 220;

/**
 * The reader is a full-screen sheet rather than a route, because reading is
 * something you step into and back out of without losing your place on the
 * journey underneath.
 */
export function ReaderProvider({ children }: { children: ReactNode }) {
  const [at, setAt] = useState<{ book: string; chapter: number } | null>(null);
  const [closing, setClosing] = useState(false);
  /*
   * The pending unmount. Opening again inside the exit has to cancel it, or a
   * reader opened a moment after one was closed would be taken away by the
   * old close's timer and the tap would look as though it did nothing.
   */
  const leaving = useRef<number | null>(null);

  const go = useCallback((book: string, chapter: number) => {
    if (leaving.current !== null) {
      window.clearTimeout(leaving.current);
      leaving.current = null;
    }
    setClosing(false);
    // Start the download on the tap rather than on the first render, so the
    // sheet and the text race each other instead of queueing.
    void loadBook(book).catch(() => undefined);
    setAt({ book, chapter });
  }, []);

  const close = useCallback(() => {
    if (leaving.current !== null) return;
    // Nothing to wait for when nothing moves.
    if (reducedMotion()) {
      setAt(null);
      return;
    }
    setClosing(true);
    leaving.current = window.setTimeout(() => {
      leaving.current = null;
      setClosing(false);
      setAt(null);
    }, READER_EXIT_MS);
  }, []);

  useEffect(
    () => () => {
      if (leaving.current !== null) window.clearTimeout(leaving.current);
    },
    [],
  );

  const api = useMemo<ReaderApi>(() => ({ open: go }), [go]);

  return (
    <ReaderContext value={api}>
      {children}
      {at && (
        <Reader
          book={at.book}
          chapter={at.chapter}
          closing={closing}
          onNavigate={go}
          onClose={close}
        />
      )}
    </ReaderContext>
  );
}
