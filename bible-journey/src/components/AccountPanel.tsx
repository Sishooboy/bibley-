import { useState } from 'react';
import { useCloud } from '../state/useCloud';

function syncLine(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return 'not synced yet this session';
  return `last synced at ${new Date(lastSyncedAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export function AccountPanel() {
  const { status, email, lastSyncedAt, error, linkSent, signIn, signOut, syncNow } = useCloud();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  if (status === 'off') {
    return (
      <section className="chartBlock backup">
        <div className="chartBlock__head">
          <div>
            <h3>Sync</h3>
            <p className="chartBlock__note">
              No cloud project is configured for this build, so the journal is local to this
              browser. Export files are your only backup.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="chartBlock backup">
      <div className="chartBlock__head">
        <div>
          <h3>Sync across devices</h3>
          <p className="chartBlock__note">
            Signing in keeps your phone and laptop on the same journal, and puts a copy somewhere
            that survives clearing your browser.
          </p>
        </div>
        <span className={`syncDot syncDot--${status}`} />
      </div>

      {email ? (
        <>
          <dl className="backup__facts">
            <div>
              <dt>Signed in as</dt>
              <dd>{email}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {status === 'syncing'
                  ? 'syncing…'
                  : status === 'error'
                    ? 'sync problem'
                    : syncLine(lastSyncedAt)}
              </dd>
            </div>
          </dl>

          <div className="backup__actions">
            <button type="button" className="btn btn--sm" onClick={() => void syncNow()}>
              Sync now
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        </>
      ) : (
        <form
          className="signIn"
          onSubmit={async (e) => {
            e.preventDefault();
            setSending(true);
            await signIn(draft.trim());
            setSending(false);
          }}
        >
          <label className="eyebrow" htmlFor="signin-email">
            Email
          </label>
          <div className="signIn__row">
            <input
              id="signin-email"
              className="field"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="btn btn--primary btn--sm" disabled={sending}>
              {sending ? 'Sending…' : 'Send sign-in link'}
            </button>
          </div>
          <p className="chartBlock__note">
            No password. You get a one-tap link by email, and whatever is already on this device
            merges into the account rather than replacing it.
          </p>
        </form>
      )}

      {linkSent && (
        <p className="backup__status backup__status--ok">
          Check your email and open the link on the device you want to sync. The link expires after
          an hour.
        </p>
      )}
      {error && <p className="backup__status backup__status--error">{error}</p>}
    </section>
  );
}
