import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Reader } from '../components/Reader';
import { loadBook } from '../lib/bible';
import { ReaderContext, type ReaderApi } from './readerContext';

/**
 * The reader is a full-screen sheet rather than a route, because reading is
 * something you step into and back out of without losing your place on the
 * journey underneath.
 */
export function ReaderProvider({ children }: { children: ReactNode }) {
  const [at, setAt] = useState<{ book: string; chapter: number } | null>(null);

  const go = useCallback((book: string, chapter: number) => {
    // Start the download on the tap rather than on the first render, so the
    // sheet and the text race each other instead of queueing.
    void loadBook(book).catch(() => undefined);
    setAt({ book, chapter });
  }, []);

  const api = useMemo<ReaderApi>(() => ({ open: go }), [go]);

  return (
    <ReaderContext value={api}>
      {children}
      {at && (
        <Reader
          book={at.book}
          chapter={at.chapter}
          onNavigate={go}
          onClose={() => setAt(null)}
        />
      )}
    </ReaderContext>
  );
}
