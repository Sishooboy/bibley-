import { useCloud } from '../state/useCloud';

function syncLine(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return 'not synced yet this session';
  return `last synced at ${new Date(lastSyncedAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export function AccountPanel() {
  const { status, email, lastSyncedAt, error, signOut, syncNow } = useCloud();

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
          <h3>Your account</h3>
          <p className="chartBlock__note">
            Your journal is stored against this account, so clearing this browser costs you
            nothing. Sign in anywhere and it comes back.
          </p>
        </div>
        <span className={`syncDot syncDot--${status}`} />
      </div>

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
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>

      {error && <p className="backup__status backup__status--error">{error}</p>}
    </section>
  );
}
