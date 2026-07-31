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
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="viewHead">
      <div className="container viewHead__inner">
        <div>
          <p className="eyebrow eyebrow--onDark">{eyebrow}</p>
          <h2 className="viewHead__title">{title}</h2>
          {lede && <p className="viewHead__lede">{lede}</p>}
        </div>
        {aside && <div className="viewHead__aside">{aside}</div>}
      </div>
    </div>
  );
}
