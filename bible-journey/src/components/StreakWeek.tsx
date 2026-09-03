import { useEffect, useState, type CSSProperties } from 'react';
import { formatDay, fromDayKey, today } from '../lib/dates';
import { plural } from '../lib/format';
import { reducedMotion, useCountUp } from '../lib/motion';
import { last30Days } from '../lib/progress';
import type { ReadMap } from '../lib/storage';
import { useStore } from '../state/useStore';
import { Flame } from './icons';

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Sparks off the flame. Four is a suggestion of heat, eight is a firework. */
const SPARKS = [0, 1, 2, 3];

/**
 * The streak, and the seven days behind it.
 *
 * The number on its own never answered the question the reader actually has,
 * which is "have I read today". Seven cells do, at a glance, and they turn a
 * count into something that visibly has a gap in it when there is one.
 *
 * When the streak grows it says so. The moment comes off the same cue channel
 * the sounds use, so the bell and the flame are one event rather than two
 * systems separately noticing the same thing and disagreeing about when.
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
  const { cue } = useStore();
  const week = last30Days(read, 7);
  const todayKey = today();
  /*
   * Bumped on every streak cue, and used as a `key` further down. Restarting a
   * CSS animation needs the element replaced: re-setting an attribute or a class
   * it already has does nothing at all, which is why a second streak in the same
   * session would otherwise be silent visually while the sound still played.
   */
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (cue?.name === 'streak') setBurst((n) => n + 1);
  }, [cue]);

  /*
   * Counts to the new figure rather than snapping. `useCountUp` already returns
   * the target immediately under `prefers-reduced-motion`, so the number is
   * simply right for a reader who asked for less movement.
   */
  const shown = Math.round(useCountUp(current, 700));
  const calm = reducedMotion();

  return (
    <div className="streakWeek" data-burst={burst > 0 ? burst : undefined}>
      <span className={`streak${current === 0 ? ' streak--cold' : ''}`}>
        {/* Keyed on the burst so the swell replays, and only the flame is
            replaced: re-mounting the whole row would restart the count too. */}
        <span className="streak__fire" key={burst}>
          <Flame size={16} className="streak__flame" />
          {/* Sparks are decoration and the one part with nothing to say, so a
              reader who asked for less motion simply never gets them. */}
          {burst > 0 && !calm && (
            <span className="streak__sparks" aria-hidden="true">
              {SPARKS.map((i) => (
                <span key={i} className="streak__spark" style={{ '--s': i } as CSSProperties} />
              ))}
            </span>
          )}
        </span>
        {current > 0 ? (
          <span>
            <b>{shown}</b> day streak
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
            // Only today's cell fills, and only when the streak just grew. An
            // attribute rather than a class, since React owns className here.
            data-filled={burst > 0 && day.day === todayKey && day.chapters > 0 ? burst : undefined}
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
