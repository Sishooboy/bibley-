import { AccountPanel } from '../components/AccountPanel';
import { BackupPanel } from '../components/BackupPanel';
import { PLANS, PLAN_ORDER } from '../data/plans';
import { formatNumber, plural } from '../lib/format';
import { formatTime } from '../lib/prefs';
import { useReminder } from '../state/useReminder';
import { useStore } from '../state/useStore';

export function SettingsView() {
  const { prefs, setPrefs, permission, requestPermission, notifyNow } = useReminder();
  const { derived, choosePlan } = useStore();
  const { plan } = derived;
  const blocked = permission === 'denied';
  const unsupported = permission === 'unsupported';

  return (
    <div className="container statsView">
      <div className="sectionHead">
        <div>
          <p className="eyebrow">Account, reminders and your data</p>
          <h2>Settings</h2>
        </div>
      </div>

      <div className="charts">
        <section className="chartBlock backup">
          <div className="chartBlock__head">
            <div>
              <h3>Reading plan</h3>
              <p className="chartBlock__note">
                Switching keeps every chapter you have marked. Progress is stored per book, so
                anything both plans contain carries straight over.
              </p>
            </div>
          </div>

          <div className="planSwitch">
            {PLAN_ORDER.map((id) => {
              const option = PLANS[id];
              const active = option.id === plan.id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`planSwitch__item${active ? ' planSwitch__item--active' : ''}`}
                  aria-pressed={active}
                  onClick={() => choosePlan(id)}
                >
                  <span className="planSwitch__name">{option.label}</span>
                  <span className="planSwitch__meta">
                    {plural(option.bookCount, 'book')} · {formatNumber(option.chapterCount)} ch
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <AccountPanel />

        <section className="chartBlock backup">
          <div className="chartBlock__head">
            <div>
              <h3>Daily reminder</h3>
              <p className="chartBlock__note">
                One nudge a day, only if you haven't read yet. Saved to your account, so it
                follows you to every device you sign in on.
              </p>
            </div>
          </div>

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

          <div className="settingRow settingRow--stack">
            <label className="settingRow__main" htmlFor="reminder-time">
              <span className="settingRow__label">Time of day</span>
              <span className="settingRow__hint">Late enough that you've had a chance to read</span>
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
            <p className="backup__status backup__status--warn">
              This browser has no notification support, so reminders can only appear inside the app.
            </p>
          )}
          {blocked && (
            <p className="backup__status backup__status--warn">
              Notifications are blocked for this site. Allow them in your browser's site settings,
              then switch this back on.
            </p>
          )}

          <div className="backup__actions">
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => void notifyNow()}
              disabled={permission !== 'granted'}
            >
              Send a test notification
            </button>
          </div>

          <p className="chartBlock__note backup__alert">
            Honest limitation: this fires while Bibley is open or backgrounded, not when it is fully
            closed. Reaching a closed app needs a push service, which is a bigger piece of work.
            Either way, the app nudges you the moment you open it on a day you haven't read.
          </p>
        </section>

        <BackupPanel />
      </div>
    </div>
  );
}
