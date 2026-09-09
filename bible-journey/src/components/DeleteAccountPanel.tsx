import { useState } from 'react';
import { countJournal } from '../lib/exportJournal';
import { plural } from '../lib/format';
import { useCloud } from '../state/useCloud';
import { useStore } from '../state/useStore';

type Props = { reveal?: (node: Element | null) => void };

/** Typed out in full, because a button nobody meant to press is how this goes wrong. */
const PHRASE = 'delete';

/**
 * Delete the account, for good.
 *
 * App Store guideline 5.1.1(v) requires this of any app that lets somebody make
 * an account, and requires that it actually delete rather than deactivate. It is
 * also the only honest counterpart to a sync that has no undo.
 *
 * **It sits under the export on purpose.** The panel above this one is the only
 * copy anybody will ever get, so the reading order is take your copy, then close
 * the account, and this one says so rather than assuming.
 *
 * The confirmation is a typed word rather than a second button. Everything else
 * destructive in this app is recoverable: unmarking a chapter, deleting a note
 * and removing a friend all leave something behind or can be done again. This
 * cannot, so it is the one place worth making somebody stop.
 */
export function DeleteAccountPanel({ reveal }: Props) {
  const { data } = useStore();
  const { email, deleteAccount } = useCloud();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const counts = countJournal(data);
  const ready = typed.trim().toLowerCase() === PHRASE;

  return (
    <section ref={reveal} className="card reveal">
      <div className="card__head">
        <div>
          <h3 className="card__title">Close your account</h3>
          <p className="card__note">
            Deletes your reading, your notes and highlights, your handle and your friends, from this
            device and from the server. It cannot be undone, and nothing is kept.
          </p>
        </div>
      </div>

      {!open ? (
        <button type="button" className="btn btn--sm btn--danger" onClick={() => setOpen(true)}>
          Delete my account
        </button>
      ) : (
        <div className="danger">
          <p className="danger__what">
            This removes {plural(counts.chapters, 'chapter')} marked as read,{' '}
            {plural(counts.notes, 'note')} and {plural(counts.highlights, 'highlight')}, along with
            your profile, the verses you have exchanged and anything you have posted.{' '}
            {email ? <>Signed in as {email}.</> : null}
          </p>
          <p className="danger__save">
            Take your copy first if you want one. The panel above writes the whole journal to a file
            and this will not give you another chance.
          </p>

          <label className="danger__label" htmlFor="delete-confirm">
            Type <strong>{PHRASE}</strong> to confirm
          </label>
          <input
            id="delete-confirm"
            className="field"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={busy}
          />

          {failed && <p className="danger__failed">{failed}</p>}

          <div className="danger__actions">
            <button
              type="button"
              className="btn btn--sm btn--danger"
              disabled={!ready || busy}
              onClick={async () => {
                setBusy(true);
                setFailed(null);
                try {
                  await deleteAccount();
                  // On success the page reloads, so nothing here runs again.
                } catch (err) {
                  console.error('Could not delete the account', err);
                  setFailed(
                    err instanceof Error
                      ? err.message
                      : 'The account could not be deleted. Nothing was changed.',
                  );
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Deleting' : 'Delete for good'}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setTyped('');
                setFailed(null);
              }}
            >
              Keep my account
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
