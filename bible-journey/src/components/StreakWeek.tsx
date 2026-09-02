import type { CSSProperties } from 'react';
import { formatDay, fromDayKey, today } from '../lib/dates';
import { plural } from '../lib/format';
import { last30Days } from '../lib/progress';
import type { ReadMap } from '../lib/storage';
import { Flame } from './icons';

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * The streak, and the seven days behind it.
 *
 * The number on its own never answered the question the reader actually has,
 * which is "have I read today". Seven cells do, at a glance, and they turn a
 * count into something that visibly has a gap in it when there is one.
 */
export function StreakWeek({
  read,
  current,
  longest,
}: {
  read: ReadMap;
  current: number;
  longest: number;
}) {
  const week = last30Days(read, 7);
  const todayKey = today();

  return (
    <div className="streakWeek">
      <span className={`streak${current === 0 ? ' streak--cold' : ''}`}>
        <Flame size={16} className="streak__flame" />
        {current > 0 ? (
          <span>
            <b>{current}</b> day streak
          </span>
        ) : (
          <span>No active streak</span>
        )}
        <span className="streakWeek__best">· best {longest}</span>
      </span>

      <div className="streakWeek__days" role="img" aria-label={weekLabel(week, todayKey)}>
        {week.map((day, i) => (
          <span
            key={day.day}
            className={`streakWeek__day${day.chapters > 0 ? ' is-read' : ''}${
              day.day === todayKey ? ' is-today' : ''
            }`}
            style={{ '--i': i } as CSSProperties}
            title={`${formatDay(day.day)} · ${plural(day.chapters, 'chapter')}`}
          >
            {LETTERS[fromDayKey(day.day).getDay()]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One sentence for anyone who cannot see the row of cells. */
function weekLabel(week: { day: string; chapters: number }[], todayKey: string): string {
  const days = week.filter((d) => d.chapters > 0).length;
  const readToday = week.some((d) => d.day === todayKey && d.chapters > 0);
  return `Read on ${days} of the last 7 days. ${readToday ? 'Including today.' : 'Not yet today.'}`;
}
