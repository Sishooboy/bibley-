import { useMemo } from 'react';
import { AccountPanel } from '../components/AccountPanel';
import { ExportPanel } from '../components/ExportPanel';
import { HeadChip, ViewHeader } from '../components/ViewHeader';
import { Check, Compass, Lock } from '../components/icons';
import {
  TESTAMENTS,
  TESTAMENT_LABELS,
  tracksFor,
  type PhasedTrack,
} from '../data/tracks';
import { formatDay } from '../lib/dates';
import { formatNumber, plural } from '../lib/format';
import { useReveal } from '../lib/motion';
import { REMINDERS_UNLOCKED, formatTime } from '../lib/prefs';
import { overallProgress, phaseProgressAll } from '../lib/progress';
import { play, setSoundEnabled } from '../lib/sound';
import { useReminder } from '../state/useReminder';
import { useStore } from '../state/useStore';

export function SettingsView() {
  const { prefs, setPrefs, permission, requestPermission, notifyNow } = useReminder();
  const { data, derived, choosePlan } = useStore();
  const { plan } = derived;
  const reveal = useReveal();
  const blocked = permission === 'denied';
  const unsupported = permission === 'unsupported';
  // Absent means on, the same reading `normalizePrefs` gives an older journal.
  const soundOn = prefs.soundEnabled !== false;

  /*
   * Grouped by testament rather than listed flat. Nine orders in one column is
   * a wall, and the first question is always which testament: the order within
   * it is only worth comparing once that is settled.
   */
  const groups = useMemo(
    () =>
      TESTAMENTS.map((id) => ({
        id,
        label: TESTAMENT_LABELS[id],
        tracks: tracksFor(id).filter((t) => t.kind === 'phased') as PhasedTrack[],
      })),
    [],
  );
  const options = useMemo(() => groups.flatMap((g) => g.tracks), [groups]);
  // Each card shows what you have already read *of that track*, which is the
  // honest answer to "what happens to my progress if I switch".
  const planStats = useMemo(
    () =>
      Object.fromEntries(
        options.map((t) => [t.id, overallProgress(phaseProgressAll(data.read, t), t)]),
      ),
    [data.read, options],
  );

  return (
    <>
      <ViewHeader
        eyebrow="Account, plan and reminders"
        title="Settings"
        lede="Everything here is saved to your account, not this device."
        meta={
          <>
            <HeadChip gold>{plan.label}</HeadChip>
            <HeadChip>
              {!REMINDERS_UNLOCKED
                ? 'Reminders with the app'
                : prefs.remindersEnabled
                  ? `Reminder ${formatTime(prefs.reminderTime)}`
                  : 'No reminder'}
            </HeadChip>
          </>
        }
      />

      <div className="container statsView">
        <section ref={reveal} className="card reveal">
          <div className="card__head">
            <div>
              <h3 className="card__title">Reading plan</h3>
              <p className="card__note">
                Switching keeps every chapter you have marked. Progress is stored per book, so
                anything both plans contain carries straight over.
              </p>
            </div>
          </div>

          {/* One radiogroup around all three, since only one order can be
              active: three separate ones would say these are three choices. */}
          <div role="radiogroup" aria-label="Reading plan">
            {groups.map((group) => (
              <div key={group.id} className="planGroup" role="group" aria-label={group.label}>
                <p className="planGroup__label">
                  {group.label}
                  <span className="planGroup__count">
                    {plural(group.tracks[0].bookCount, 'book')} ·{' '}
                    {formatNumber(group.tracks[0].chapterCount)} chapters
                  </span>
                </p>
                <div className="planSwitch">
                  {group.tracks.map((option) => {
                    const id = option.id;
                    const stats = planStats[id];
                    const active = option.id === plan.id;
                    const pct = stats.percent;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={`${option.label}, ${group.label}`}
                        className={`planPick${active ? ' planPick--active' : ''}`}
                        onClick={() => choosePlan(id)}
                      >
                        <span className="planPick__top">
                          <span className="planPick__name">{option.label}</span>
                          <span className="planPick__tick" aria-hidden="true">
                            {active && <Check size={13} />}
                          </span>
                        </span>
                        <span className="planPick__meta">{option.tagline}</span>
                        <span className="planPick__track" aria-hidden="true">
                          <span className="planPick__fill" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="planPick__pct">
                          {formatNumber(stats.planRead)} read · {pct.toFixed(1)}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <AccountPanel reveal={reveal} />

        <ExportPanel reveal={reveal} />

        <section ref={reveal} className="card reveal">
          <div className="card__head">
            <div>
              <h3 className="card__title">The guide</h3>
              <p className="card__note">
                The six panels you saw the first time, on where everything is and what it does.
              </p>
            </div>
          </div>
          <div className="settingRow">
            <span className="settingRow__main">
              <span className="settingRow__label">Show it again</span>
              <span className="settingRow__hint">
                {prefs.guideSeenAt
                  ? `Last seen ${formatDay(prefs.guideSeenAt.slice(0, 10))}`
                  : 'Waiting for you on the journey'}
              </span>
            </span>
            {/* Clearing when it was seen is the whole mechanism: the guide shows
                itself whenever that is unset. */}
            <button
              type="button"
              className="btn btn--sm"
              disabled={!prefs.guideSeenAt}
              onClick={() => setPrefs({ ...prefs, guideSeenAt: undefined })}
            >
              <Compass size={14} className="btn__icon" />
              Show the guide
            </button>
          </div>
        </section>

        <section ref={reveal} className="card reveal">
          <div className="card__head">
            <div>
              <h3 className="card__title">Sound</h3>
              <p className="card__note">
                A small tap when you mark a chapter, and something worth hearing when you finish a
                book or your streak grows. Nothing else in the app makes a noise.
              </p>
            </div>
          </div>

          <div className="settingRow">
            <label className="settingRow__main" htmlFor="sound-on">
              <span className="settingRow__label">Play sounds</span>
              <span className="settingRow__hint">
                {soundOn
                  ? "On. The silent switch on your phone still overrules it."
                  : 'Currently off, everywhere you are signed in'}
              </span>
            </label>
            <input
              id="sound-on"
              className="switch"
              type="checkbox"
              role="switch"
              checked={soundOn}
              onChange={(e) => {
                const on = e.target.checked;
                setPrefs({ ...prefs, soundEnabled: on });
                /*
                 * Told directly rather than left to the effect that watches the
                 * pref, because that runs after this handler returns: by then
                 * the gesture is over, and a browser will refuse to open an
                 * audio context outside one. Flipping the switch is also the
                 * natural moment to hear what you just switched on.
                 */
                if (on) {
                  setSoundEnabled(true);
                  play('streak');
                }
              }}
            />
          </div>

          <div className="card__actions">
            <button
              type="button"
              className="btn btn--sm"
              disabled={!soundOn}
              onClick={() => play('chapter')}
            >
              A chapter
            </button>
            <button
              type="button"
              className="btn btn--sm"
              disabled={!soundOn}
              onClick={() => play('streak')}
            >
              A streak
            </button>
            <button
              type="button"
              className="btn btn--sm"
              disabled={!soundOn}
              onClick={() => play('book')}
            >
              A finished book
            </button>
          </div>
        </section>

        <section ref={reveal} className="card card--locked reveal">
          <div className="card__head">
            <div>
              <h3 className="card__title">Daily reminder</h3>
              <p className="card__note">
                One nudge a day, only if you haven't read yet.
              </p>
            </div>
            <span className="pill pill--locked">
              <Lock size={12} />
              Locked
            </span>
          </div>

          {REMINDERS_UNLOCKED ? (
            <>
              <div className="settingRow">
                <label className="settingRow__main" htmlFor="reminders-on">
                  <span className="settingRow__label">Remind me to read</span>
                  <span className="settingRow__hint">
                    {prefs.remindersEnabled
                      ? `Set for ${formatTime(prefs.reminderTime)}`
                      : 'Currently off'}
                  </span>
                </label>
                <input
                  id="reminders-on"
                  className="switch"
                  type="checkbox"
                  role="switch"
                  checked={prefs.remindersEnabled}
                  disabled={unsupported || blocked}
                  onChange={async (e) => {
                    const on = e.target.checked;
                    if (on && permission === 'default') await requestPermission();
                    setPrefs({ ...prefs, remindersEnabled: on });
                  }}
                />
              </div>

              <div className="settingRow">
                <label className="settingRow__main" htmlFor="reminder-time">
                  <span className="settingRow__label">Time of day</span>
                  <span className="settingRow__hint">
                    Late enough that you've had a chance to read
                  </span>
                </label>
                <input
                  id="reminder-time"
                  className="field settingRow__time"
                  type="time"
                  value={prefs.reminderTime}
                  onChange={(e) => setPrefs({ ...prefs, reminderTime: e.target.value })}
                />
              </div>

              {unsupported && (
                <p className="notice notice--warn">
                  This browser has no notification support, so reminders can only appear inside the
                  app.
                </p>
              )}
              {blocked && (
                <p className="notice notice--warn">
                  Notifications are blocked for this site. Allow them in your browser's site
                  settings, then switch this back on.
                </p>
              )}

              <div className="card__actions">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => void notifyNow()}
                  disabled={permission !== 'granted'}
                >
                  Send a test notification
                </button>
              </div>
            </>
          ) : (
            <div className="locked">
              <span className="locked__mark" aria-hidden="true">
                <Lock size={20} />
              </span>
              <div>
                <p className="locked__title">Coming with the app</p>
                <p className="card__note">
                  A reminder in the browser only arrives while Bibley is open in a tab, which is not
                  much of a reminder. It is switched off until the App Store build lands, where a
                  notification can reach you with the app closed.
                </p>
              </div>
            </div>
          )}

          <p className="notice notice--gold">
            Nothing is lost while this is off. Bibley still tells you the moment you open it on a day
            you haven't read, and your streak is still counted the same way.
          </p>
        </section>
      </div>
    </>
  );
}
