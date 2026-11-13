import { Fragment } from 'react';
import { isVerse, sourceLabel, type Source } from '../lib/sources';

/**
 * One quiet line under a note naming what it rests on.
 *
 * A verse is plain text and a work outside the Bible is a link, because the
 * verse is already in the app and the work is not. It is set small and muted on
 * purpose: it is there for the reader who wants to check, and it must not
 * compete with the note for the attention of the one who does not.
 */
export function SourceLine({ sources }: { sources: Source[] | undefined }) {
  if (!sources || sources.length === 0) return null;
  return (
    <p className="sources">
      <span className="sources__label">{sources.length === 1 ? 'Source' : 'Sources'}</span>{' '}
      <SourceItems sources={sources} />
    </p>
  );
}

/**
 * Sources for a numbered list, shut until asked for. The book card's three facts
 * each have their own, so they are numbered to match rather than pooled into a
 * list that would leave a reader guessing which fact rests on what.
 */
export function SourcesFold({ groups }: { groups: (Source[] | undefined)[] }) {
  if (!groups.some((g) => g && g.length > 0)) return null;
  return (
    <details className="sourcesFold">
      <summary className="sourcesFold__summary">Sources</summary>
      <ol className="sourcesFold__list">
        {groups.map((sources, i) => (
          <li key={i} className="sourcesFold__item">
            {sources && sources.length > 0 ? <SourceItems sources={sources} /> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}

function SourceItems({ sources }: { sources: Source[] }) {
  return (
    <>
      {sources.map((source, i) => (
        <Fragment key={i}>
          {i > 0 && '; '}
          {isVerse(source) ? (
            <span className="sources__ref">{source.ref}</span>
          ) : (
            <a className="sources__link" href={source.url} target="_blank" rel="noreferrer">
              {sourceLabel(source)}
            </a>
          )}
        </Fragment>
      ))}
    </>
  );
}
