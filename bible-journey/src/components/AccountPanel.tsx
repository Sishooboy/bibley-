import { useState } from 'react';
import { useCloud } from '../state/useCloud';
import { Sync } from './icons';

function syncLine(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return 'not synced yet this session';
  return `last synced at ${new Date(lastSyncedAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

type Props = { reveal?: (node: Element | null) => void };

export function AccountPanel({ reveal }: Props) {
  const { status, email, lastSyncedAt, error, signOut, syncNow, signInWithGoogle } = useCloud();
  const [busy, setBusy] = useState(false);

  if (status === 'off') {
    return (
      <section ref={reveal} className="card reveal">
        <div className="card__head">
          <div>
            <h3 className="card__title">Sync</h3>
            <p className="card__note">
              No cloud project is configured for this build, so the journal is local to this
              browser.
            </p>
          </div>
        </div>
      </section>
    );
  }

  /*
   * Reading without an account. This card is where the account is offered
   * from, and it says plainly what is at stake: a browser can clear its storage
   * when it needs room, and an unsynced journal has no other copy.
   */
  if (!email) {
    return (
      <section ref={reveal} className="card reveal">
        <div className="card__head">
          <div>
            <h3 className="card__title">Your account</h3>
            <p className="card__note">
              You are reading without one, so your journal lives on this device only. Sign in and
              everything here comes with you, and your phone and your laptop stay on the same
              journey. Until then the export below is your only other copy.
            </p>
          </div>
        </div>
        <div className="card__actions">
          <button
            type="button"
            className="btn btn--sm btn--primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void signInWithGoogle().finally(() => setBusy(false));
            }}
          >
            {busy ? 'Opening Google' : 'Continue with Google'}
          </button>
        </div>
        {error && (
          <div className="notice notice--error">
            <p>{error}</p>
          </div>
        )}
      </section>
    );
  }

  const label =
    status === 'syncing' ? 'syncing…' : status === 'error' ? 'sync problem' : syncLine(lastSyncedAt);

  return (
    <section ref={reveal} className="card reveal">
      <div className="card__head">
        <div>
          <h3 className="card__title">Your account</h3>
          <p className="card__note">
            Your journal is stored against this account, so clearing this browser costs you nothing.
            Signing out takes it off this device, and signing in anywhere brings it back.
          </p>
        </div>
      </div>

      <div className="account">
        <span className="account__avatar" aria-hidden="true">
          {(email ?? '?').charAt(0).toUpperCase()}
        </span>
        <div className="account__id">
          <span className="account__label">Signed in as</span>
          <span className="account__email">{email}</span>
        </div>
        <span className={`pill pill--sync pill--${status}`}>
          <span className={`syncDot syncDot--${status}`} />
          {label}
        </span>
      </div>

      <div className="card__actions">
        <button type="button" className="btn btn--sm btn--primary" onClick={() => void syncNow()}>
          <Sync size={14} className="btn__icon" />
          Sync now
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>

      {error && (
        <div className="notice notice--error">
          <p>{error}</p>
          <button type="button" className="btn btn--sm" onClick={() => void syncNow()}>
            <Sync size={14} className="btn__icon" />
            Try again
          </button>
        </div>
      )}
    </section>
  );
}
