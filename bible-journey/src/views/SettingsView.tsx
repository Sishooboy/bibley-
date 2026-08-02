import { useMemo } from 'react';
import { AccountPanel } from '../components/AccountPanel';
import { HeadChip, ViewHeader } from '../components/ViewHeader';
import { Check } from '../components/icons';
import { PLANS, PLAN_ORDER } from '../data/plans';
import { formatNumber, plural } from '../lib/format';
import { useReveal } from '../lib/motion';
import { formatTime } from '../lib/prefs';
import { overallProgress, phaseProgressAll } from '../lib/progress';
import { useReminder } from '../state/useReminder';
import { useStore } from '../state/useStore';

export function SettingsView() {
  const { prefs, setPrefs, permission, requestPermission, notifyNow } = useReminder();
  const { data, derived, choosePlan } = useStore();
  const { plan } = derived;
  const reveal = useReveal();
  const blocked = permission === 'denied';
  const unsupported = permission === 'unsupported';

  // Each card shows what you have already read *of that plan*, which is the
  // honest answer to "what happens to my progress if I switch".
  const planStats = useMemo(
    () =>
      Object.fromEntries(
        PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          return [id, overallProgress(phaseProgressAll(data.read, p), p)];
        }),
      ),
    [data.read],
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
              {prefs.remindersEnabled ? `Reminder ${formatTime(prefs.reminderTime)}` : 'No reminder'}
            </HeadChip>
          </>
        }
      />

      <div className="container statsView">
        <section ref={reveal} className="panel reveal">
          <div className="panel__head">
            <div>
              <h3 className="panel__title">Reading plan</h3>
              <p className="panel__note">
                Switching keeps every chapter you have marked. Progress is stored per book, so
                anything both plans contain carries straight over.
              </p>
            </div>
          </div>

          <div className="planSwitch" role="radiogroup" aria-label="Reading plan">
            {PLAN_ORDER.map((id) => {
              const option = PLANS[id];
              const stats = planStats[id];
              const active = option.id === plan.id;
              const pct = stats.percent;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`planCard${active ? ' planCard--active' : ''}`}
                  onClick={() => choosePlan(id)}
                >
                  <span className="planCard__top">
                    <span className="planCard__name">{option.label}</span>
                    <span className="planCard__tick" aria-hidden="true">
                      {active && <Check size={13} />}
                    </span>
                  </span>
                  <span className="planCard__meta">
                    {plural(option.bookCount, 'book')} · {formatNumber(option.chapterCount)} chapters
                  </span>
                  <span className="planCard__track" aria-hidden="true">
                    <span className="planCard__fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="planCard__pct">
                    {formatNumber(stats.planRead)} read · {pct.toFixed(1)}%
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <AccountPanel reveal={reveal} />

        <section ref={reveal} className="panel reveal">
          <div className="panel__head">
            <div>
              <h3 className="panel__title">Daily reminder</h3>
              <p className="panel__note">
                One nudge a day, only if you haven't read yet. Saved to your account, so it follows
                you to every device you sign in on.
              </p>
            </div>
            <span className={`pill${prefs.remindersEnabled ? ' pill--on' : ''}`}>
              {prefs.remindersEnabled ? 'On' : 'Off'}
            </span>
          </div>

          <div className="settingRow">
            <label className="settingRow__main" htmlFor="reminders-on">
              <span className="settingRow__label">Remind me to read</span>
              <span className="settingRow__hint">
                {prefs.remindersEnabled ? `Set for ${formatTime(prefs.reminderTime)}` : 'Currently off'}
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
            <p className="notice notice--warn">
              This browser has no notification support, so reminders can only appear inside the app.
            </p>
          )}
          {blocked && (
            <p className="notice notice--warn">
              Notifications are blocked for this site. Allow them in your browser's site settings,
              then switch this back on.
            </p>
          )}

          <div className="panel__actions">
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => void notifyNow()}
              disabled={permission !== 'granted'}
            >
              Send a test notification
            </button>
          </div>

          <p className="notice notice--gold">
            Honest limitation: this fires while Bibley is open or backgrounded, not when it is fully
            closed. Reaching a closed app needs a push service, which is a bigger piece of work.
            Either way, the app nudges you the moment you open it on a day you haven't read.
          </p>
        </section>
      </div>
    </>
  );
}
