import { useMemo } from 'react';
import { addDays, formatDay, fromDayKey, today, type DayKey } from '../lib/dates';
import { plural } from '../lib/format';
import { readsByDay } from '../lib/progress';
import type { ReadMap } from '../lib/storage';

const WEEKS = 18;

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

export function Heatmap({ read }: { read: ReadMap }) {
  const { cells, months, busiest, activeDays } = useMemo(() => {
    const byDay = readsByDay(read);
    const end = today();
    // Rows are weekdays, so the grid has to start on a Sunday to line up.
    const startOfWeek = addDays(end, -fromDayKey(end).getDay());
    const first = addDays(startOfWeek, -(WEEKS - 1) * 7);

    const days: { day: DayKey; chapters: number; future: boolean }[] = [];
    for (let i = 0; i < WEEKS * 7; i++) {
      const day = addDays(first, i);
      days.push({ day, chapters: byDay.get(day) ?? 0, future: day > end });
    }

    const max = days.reduce((n, d) => Math.max(n, d.chapters), 0);

    // A month label sits over the column where that month first appears.
    const labels: { column: number; text: string }[] = [];
    let seen = '';
    for (let w = 0; w < WEEKS; w++) {
      const date = fromDayKey(days[w * 7].day);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if (key !== seen) {
        seen = key;
        labels.push({
          column: w + 1,
          text: date.toLocaleDateString(undefined, { month: 'short' }),
        });
      }
    }

    return {
      cells: days,
      months: labels,
      busiest: max,
      activeDays: days.filter((d) => d.chapters > 0).length,
    };
  }, [read]);

  return (
    <div className="heat">
      <div className="heat__months" aria-hidden="true">
        {months.map((m) => (
          <span key={m.column} style={{ gridColumn: m.column }}>
            {m.text}
          </span>
        ))}
      </div>

      <div className="heat__grid" role="img" aria-label={`Reading activity over the last ${WEEKS} weeks`}>
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

      <div className="heat__foot">
        <span>{plural(activeDays, 'reading day')} in {WEEKS} weeks</span>
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
