import type { ReactNode } from 'react';

/**
 * The masthead the inner views were missing. Journey earns its full hero; these
 * get the same red band at a smaller scale so the app reads as one piece.
 */
export function ViewHeader({
  eyebrow,
  title,
  lede,
  aside,
  meta,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  aside?: ReactNode;
  /** Optional chips under the lede: counts, status, anything one line long. */
  meta?: ReactNode;
}) {
  return (
    <div className="viewHead">
      <div className="viewHead__glow" aria-hidden="true" />
      <div className="container viewHead__inner">
        <div className="viewHead__main">
          <p className="eyebrow eyebrow--onDark">{eyebrow}</p>
          <h2 className="viewHead__title">{title}</h2>
          {lede && <p className="viewHead__lede">{lede}</p>}
          {meta && <div className="viewHead__meta">{meta}</div>}
        </div>
        {aside && <div className="viewHead__aside">{aside}</div>}
      </div>
    </div>
  );
}

/** A single chip for the masthead's meta row. */
export function HeadChip({ children, gold }: { children: ReactNode; gold?: boolean }) {
  return <span className={`headChip${gold ? ' headChip--gold' : ''}`}>{children}</span>;
}
