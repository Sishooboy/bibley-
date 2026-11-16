import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { addDays, formatDay, fromDayKey, today, type DayKey } from '../lib/dates';
import { plural } from '../lib/format';
import { readsByDay } from '../lib/progress';
import type { ReadMap } from '../lib/storage';

/** How many weeks fit the card at once, and the least the grid ever shows. */
const VISIBLE_WEEKS = 18;
/*
 * A backdated mark can put a reading years in the past, and every week behind
 * it is seven more cells. Ten years is 3,640 of them, which a phone draws
 * without noticing, and no plan in this app takes that long.
 */
const MAX_WEEKS = 520;

/**
 * Four steps is enough to read a rhythm without pretending the data is precise.
 * The top step is gold, so it is gated on an absolute count as well as a share:
 * on a journal where the best day is two chapters, everything would go gold and
 * the accent would stop meaning anything.
 */
function level(chapters: number, busiest: number): number {
  if (chapters === 0) return 0;
  const share = busiest === 0 ? 1 : chapters / busiest;
  if (share > 0.8) return chapters >= 3 ? 4 : 3;
  if (share > 0.5) return 3;
  if (share > 0.25) return 2;
  return 1;
}

/**
 * Every week since the first chapter read, never fewer than eighteen.
 *
 * It used to be the last eighteen weeks and nothing else, so once those had
 * filled up, everything before them was simply gone from the screen, the start
 * of the habit included. Now the grid runs back to the first reading and the
 * card is a window onto it: it opens on today, at the right, and scrolls back.
 * The columns keep the size they always had, eighteen to the card's width,
 * through `cqi` on the scroller, so a short history looks exactly as it did.
 */
export function Heatmap({ read }: { read: ReadMap }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);

  const { cells, months, busiest, activeDays, weeks, firstDay } = useMemo(() => {
    const byDay = readsByDay(read);
    const end = today();
    // Rows are weekdays, so the grid has to start on a Sunday to line up.
    const startOfWeek = addDays(end, -fromDayKey(end).getDay());

    let earliest: DayKey | null = null;
    for (const day of byDay.keys()) if (earliest === null || day < earliest) earliest = day;
    const back = earliest
      ? Math.ceil(
          (fromDayKey(startOfWeek).getTime() - fromDayKey(earliest).getTime()) / (7 * 86_400_000),
        ) + 1
      : 0;
    const count = Math.min(MAX_WEEKS, Math.max(VISIBLE_WEEKS, back));
    const first = addDays(startOfWeek, -(count - 1) * 7);

    const days: { day: DayKey; chapters: number; future: boolean }[] = [];
    for (let i = 0; i < count * 7; i++) {
      const day = addDays(first, i);
      days.push({ day, chapters: byDay.get(day) ?? 0, future: day > end });
    }

    const max = days.reduce((n, d) => Math.max(n, d.chapters), 0);

    // A month label sits over the column where that month first appears. Once
    // the grid can scroll back past a new year, "Jan" alone could be any of
    // them, so January says its year, and so does the first label of a grid
    // that is longer than one screen.
    const starts: { column: number; date: Date }[] = [];
    let seen = '';
    for (let w = 0; w < count; w++) {
      const date = fromDayKey(days[w * 7].day);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if (key !== seen) {
        seen = key;
        starts.push({ column: w + 1, date });
      }
    }
    /*
     * A label spills right over the columns after its own, so it is only as
     * long as the room before the next one. "Feb 2026" needs about four weeks
     * and the oldest month is often one or two weeks wide, where it ran straight
     * into "Mar". It drops the year first, and the first label drops out
     * altogether when it has a single column; the line under the grid already
     * names the month the history starts in.
     */
    const labels: { column: number; text: string }[] = [];
    starts.forEach((s, i) => {
      const room = (starts[i + 1]?.column ?? count + 1) - s.column;
      if (i === 0 && room < 2 && starts.length > 1) return;
      const wantsYear = s.date.getMonth() === 0 || (i === 0 && count > VISIBLE_WEEKS);
      labels.push({
        column: s.column,
        text: s.date.toLocaleDateString(
          undefined,
          wantsYear && room >= 4 ? { month: 'short', year: 'numeric' } : { month: 'short' },
        ),
      });
    });

    return {
      cells: days,
      months: labels,
      busiest: max,
      activeDays: days.filter((d) => d.chapters > 0).length,
      weeks: count,
      firstDay: earliest,
    };
  }, [read]);

  const scrolls = weeks > VISIBLE_WEEKS;

  /*
   * Opens on today. A layout effect, so the first frame the reader sees is
   * already at the right-hand end rather than at the oldest week and then
   * jumping. It runs again when the grid grows, which only happens when a new
   * week starts or an older day is marked.
   */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    setAtStart(el.scrollLeft <= 1);
  }, [weeks]);

  const since = firstDay
    ? fromDayKey(firstDay).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="heat">
      <div
        className="heat__scroll"
        ref={scrollRef}
        style={{ '--weeks': weeks } as CSSProperties}
        data-scrolls={scrolls ? '' : undefined}
        // The fade at the left edge says there is more behind it, and goes once
        // there is not.
        data-more={scrolls && !atStart ? '' : undefined}
        onScroll={(e) => setAtStart(e.currentTarget.scrollLeft <= 1)}
        // Focusable only when there is somewhere to go, so a keyboard can scroll
        // it with the arrow keys.
        tabIndex={scrolls ? 0 : undefined}
        aria-label={scrolls ? 'Reading rhythm, scroll back for earlier weeks' : undefined}
      >
        <div className="heat__months" aria-hidden="true">
          {months.map((m) => (
            <span key={m.column} style={{ gridColumn: m.column }}>
              {m.text}
            </span>
          ))}
        </div>

        <div
          className="heat__grid"
          role="img"
          aria-label={
            scrolls
              ? `Reading activity every day since ${since}`
              : `Reading activity over the last ${VISIBLE_WEEKS} weeks`
          }
        >
          {cells.map((cell) => (
            <span
              key={cell.day}
              className={`heat__cell heat__cell--${cell.future ? 'future' : level(cell.chapters, busiest)}`}
              title={
                cell.future
                  ? formatDay(cell.day)
                  : `${formatDay(cell.day)} · ${plural(cell.chapters, 'chapter')}`
              }
            />
          ))}
        </div>
      </div>

      <div className="heat__foot">
        <span>
          {scrolls
            ? `${plural(activeDays, 'reading day')} since ${since}. Scroll back to see them.`
            : `${plural(activeDays, 'reading day')} in ${VISIBLE_WEEKS} weeks`}
        </span>
        <span className="heat__scale" aria-hidden="true">
          less
          <i className="heat__cell heat__cell--0" />
          <i className="heat__cell heat__cell--1" />
          <i className="heat__cell heat__cell--2" />
          <i className="heat__cell heat__cell--3" />
          <i className="heat__cell heat__cell--4" />
          more
        </span>
      </div>
    </div>
  );
}
