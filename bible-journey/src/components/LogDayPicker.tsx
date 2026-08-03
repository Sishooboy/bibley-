import { addDays, fromDayKey, today } from '../lib/dates';
import { SLOTS, SLOT_LABELS, isSlot } from '../lib/storage';
import { useStore } from '../state/useStore';

/** A week back is enough. Older than that and you are reconstructing, not remembering. */
const DAYS = 7;

function label(offset: number): string {
  if (offset === 0) return 'today';
  if (offset === 1) return 'yesterday';
  const day = addDays(today(), -offset);
  return fromDayKey(day).toLocaleDateString(undefined, { weekday: 'long' });
}

/**
 * Marking used to stamp the moment you tapped, which is rarely the moment you
 * read. Two nights collapsing into one day made the streak wrong in the reader's
 * favour and the pace wrong against it.
 *
 * It sits next to every marking control rather than in settings, and turns gold
 * when it is not today, because the failure mode of a hidden version of this is
 * a whole week logged to the wrong day.
 *
 * The time of day beside it is optional and stays quiet: no default, no nagging,
 * and a chapter without one is not missing anything.
 */
export function LogDayPicker({ id }: { id: string }) {
  const { logOffset, setLogOffset, logSlot, setLogSlot } = useStore();

  return (
    <span className={`logDay${logOffset > 0 ? ' logDay--past' : ''}`}>
      <label className="logDay__label" htmlFor={id}>
        I read this
      </label>
      <select
        id={id}
        className="select logDay__select"
        value={logOffset}
        onChange={(e) => setLogOffset(Number(e.target.value))}
      >
        {Array.from({ length: DAYS }, (_, i) => (
          <option key={i} value={i}>
            {label(i)}
          </option>
        ))}
      </select>
      <select
        className={`select logDay__select logDay__slot${logSlot ? ' logDay__slot--set' : ''}`}
        value={logSlot ?? ''}
        aria-label="Time of day, optional"
        onChange={(e) => setLogSlot(isSlot(e.target.value) ? e.target.value : null)}
      >
        <option value="">any time</option>
        {SLOTS.map((slot) => (
          <option key={slot} value={slot}>
            {SLOT_LABELS[slot]}
          </option>
        ))}
      </select>
    </span>
  );
}
