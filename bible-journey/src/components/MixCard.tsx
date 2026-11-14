import { useEffect, useState } from 'react';
import type { StreamTrack } from '../data/tracks';
import { cachedBook, loadBook, type BookText } from '../lib/bible';
import { useToday } from '../lib/clock';
import { countWords, formatNumber, formatRefs, readingMinutes } from '../lib/format';
import { mixFinished, todaysMix } from '../lib/mix';
import { useTranslation } from '../lib/translations';
import { useReader } from '../state/useReader';
import { useStore } from '../state/useStore';
import { Check } from './icons';
import { LogDayPicker } from './LogDayPicker';
import { Cross } from './Ornament';
import { TodayAlerts } from './TodayAlerts';

/**
 * The day's reading on Daily Mix: four short readings rather than one run.
 *
 * The today card's shape, kept on purpose, so switching plans changes what the
 * card asks for and not how it is used: one wide red button for the next thing
 * to read, saying how long it takes, and marking-without-reading folded away
 * underneath. What is new is the list between them, one row a stream, each a
 * tap into the reader at that reading, each ticked off as it is read.
 */
export function MixCard({ plan }: { plan: StreamTrack }) {
  const { data, markRefs } = useStore();
  const { open } = useReader();
  const day = useToday();
  const mix = todaysMix(plan, data.read, day, data.startedAt);
  const waiting = mix.filter((m) => m.unread.length > 0);
  const next = waiting[0]?.unread[0];
  const read = mix.filter((m) => m.done).length;

  // The book the red button opens, fetched now so the button can say how long
  // it takes and the reader opens on the text. The today card's reasoning.
  const nextBook = next?.book;
  const translation = useTranslation();
  const [text, setText] = useState<BookText | undefined>(() =>
    nextBook ? cachedBook(nextBook, translation) : undefined,
  );
  useEffect(() => {
    if (!nextBook) return;
    const hit = cachedBook(nextBook, translation);
    if (hit) {
      setText(hit);
      return;
    }
    let live = true;
    setText(undefined);
    loadBook(nextBook, translation)
      .then((loaded) => live && setText(loaded))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [nextBook, translation]);

  if (mixFinished(mix)) {
    return (
      <section className="panel panel--done" aria-label="Today's mix">
        <Cross size={34} className="today__cross" />
        <p className="eyebrow">Today’s mix</p>
        <h2 className="today__ref" style={{ marginTop: '0.6rem' }}>
          All {formatNumber(plan.chapterCount)} chapters read
        </h2>
        <p className="today__rest">
          {plan.bookCount} books, the Old and New Testaments, done. Revisit anything from the
          journey below.
        </p>
      </section>
    );
  }

  const verses = next && text?.book === next.book ? text.chapters[next.chapter - 1] : undefined;
  const minutes = verses ? readingMinutes(countWords(verses)) : null;
  const verseCount = verses ? verses.filter((v) => v !== null).length : 0;

  return (
    <section className="panel" aria-label="Today's mix">
      <TodayAlerts />

      <div className="today__head">
        <p className="eyebrow">Today’s mix</p>
        <p className="today__rest" style={{ marginTop: 0 }}>
          {read} of {mix.length} read
          {plan.estimatedDailyMinutes ? ` · about ${plan.estimatedDailyMinutes} min a day` : ''}
        </p>
      </div>

      {/*
        A list and not a grid of tiles: the four are read in this order, and a
        row can carry the stream's name and its reference side by side on a
        phone without either wrapping. A read row stays a button, since reading
        the day's psalm twice is a perfectly good thing to want.
      */}
      <ul className="mix" data-tour={next ? undefined : 'today'}>
        {mix.map((m) => {
          const target = m.unread[0] ?? m.refs[0];
          return (
            <li key={m.stream.id}>
              <button
                type="button"
                className="mix__row"
                data-done={m.done || undefined}
                disabled={!target}
                onClick={() => target && open(target.book, target.chapter)}
              >
                <span className="mix__tick" aria-hidden="true">
                  {m.done && <Check size={12} />}
                </span>
                <span className="mix__name">{m.stream.name}</span>
                <span className="mix__ref">
                  {m.refs.length > 0 ? formatRefs(m.refs) : 'Finished'}
                  <span className="sr-only">{m.done ? ', read' : ', not read yet'}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {next ? (
        <button
          type="button"
          className="btn btn--primary today__go"
          data-tour="today"
          onClick={() => open(next.book, next.chapter)}
        >
          <span className="today__goMain">
            Read {next.book} {next.chapter}
          </span>
          {minutes !== null && (
            <span className="today__goSub">
              {verseCount} verses · about {minutes === 1 ? 'a minute' : `${minutes} min`}
            </span>
          )}
        </button>
      ) : (
        <p className="today__rest mix__done">
          All four read. Tomorrow’s are here from midnight.
        </p>
      )}

      {/*
        One button a stream, because what somebody read elsewhere is usually one
        of them, the psalm in a prayer book or the chapter in church, and one for
        the whole day for everyone who read all of it on paper.
      */}
      {waiting.length > 0 && (
        <details className="quickMark">
          <summary className="quickMark__summary">I read it somewhere else</summary>
          <div className="quickMark__head">
            <span className="quickMark__label">I read</span>
            <LogDayPicker id="mix-log-day" />
          </div>
          <div className="quickMark__row">
            {waiting.map((m) => (
              <button
                key={m.stream.id}
                type="button"
                className="btn btn--sm"
                onClick={() => markRefs(m.unread)}
              >
                {formatRefs(m.unread)}
              </button>
            ))}
            {waiting.length > 1 && (
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={() => markRefs(waiting.flatMap((m) => m.unread))}
              >
                <Check size={14} />
                All of it
              </button>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
