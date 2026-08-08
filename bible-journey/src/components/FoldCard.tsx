import type { ReactNode } from 'react';
import { Chevron } from './icons';

/**
 * A card that starts shut, with the one line worth knowing on the outside.
 *
 * Stats had grown into a page you scroll past rather than read: two of its
 * panels were long tables that repeat, row by row, what the charts above them
 * already show at a glance. They keep their detail and stop spending screen on
 * it until asked.
 *
 * A real `<details>` rather than a button and some state, so it opens with a
 * keyboard, announces itself as a disclosure, and is findable by the browser's
 * own find-in-page, which reveals it on a match.
 */
export function FoldCard({
  title,
  summary,
  reveal,
  children,
}: {
  title: string;
  /** What the shut card says instead of its contents. */
  summary: ReactNode;
  reveal: (node: Element | null) => void;
  children: ReactNode;
}) {
  return (
    <details ref={reveal} className="card fold reveal">
      <summary className="fold__head">
        <h3 className="card__title fold__title">{title}</h3>
        <span className="fold__meta">{summary}</span>
        <Chevron size={14} className="fold__chev" />
      </summary>
      <div className="fold__body">{children}</div>
    </details>
  );
}
