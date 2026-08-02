import { addDays, fromDayKey, today } from '../lib/dates';
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
 */
export function LogDayPicker({ id }: { id: string }) {
  const { logOffset, setLogOffset } = useStore();

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
    </span>
  );
}
