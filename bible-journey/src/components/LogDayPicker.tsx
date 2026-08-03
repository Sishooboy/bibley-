import { relativeDay, today } from '../lib/dates';
import { SLOTS, SLOT_LABELS, isSlot } from '../lib/storage';
import { useStore } from '../state/useStore';

/**
 * Marking used to stamp the moment you tapped, which is rarely the moment you
 * read. Two nights collapsing into one day made the streak wrong in the reader's
 * favour and the pace wrong against it.
 *
 * A native date input rather than a list of recent days, because catching up on
 * a fortnight away is exactly when this is needed, and because every phone
 * already has a calendar its owner knows how to use. Capped at today: a future
 * reading day would hold a streak open without anyone reading anything.
 *
 * It sits next to every marking control rather than in settings, and turns gold
 * when it is not today, because the failure mode of a hidden version of this is
 * a whole week logged to the wrong date.
 */
export function LogDayPicker({ id }: { id: string }) {
  const { logDay, setLogDay, logSlot, setLogSlot } = useStore();
  const now = today();
  const value = logDay ?? now;
  const isToday = value === now;

  return (
    <span className={`logDay${isToday ? '' : ' logDay--past'}`}>
      <label className="logDay__label" htmlFor={id}>
        I read this
      </label>

      <span className="logDay__date">
        <input
          id={id}
          className="field logDay__input"
          type="date"
          value={value}
          max={now}
          onChange={(e) => setLogDay(e.target.value || null)}
        />
        {/* The date says which day, this says how long ago, which is the thing
            you are actually checking before you tap Mark. */}
        <span className="logDay__when">{relativeDay(value)}</span>
      </span>

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

      {!isToday && (
        // Getting back to today through a calendar is several taps, and today is
        // where this should sit almost always.
        <button type="button" className="logDay__reset" onClick={() => setLogDay(null)}>
          Back to today
        </button>
      )}
    </span>
  );
}
