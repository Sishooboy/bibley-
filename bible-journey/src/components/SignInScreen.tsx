import { useState } from 'react';
import { TOTAL_BOOK_COUNT, TOTAL_CHAPTER_COUNT } from '../data/plan';
import { formatNumber } from '../lib/format';
import { useCloud } from '../state/useCloud';

export function SignInScreen() {
  const { signIn, linkSent, error } = useCloud();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  return (
    <div className="gate">
      <div className="gate__panel">
        <img className="gate__mark" src="/icon-192.png" width={72} height={72} alt="" />
        <h1 className="gate__title">Bibley</h1>
        <p className="gate__lede">
          A reading journey through all {TOTAL_BOOK_COUNT} books, {formatNumber(TOTAL_CHAPTER_COUNT)}{' '}
          chapters, in an order built so each book lands with the context of the one before it.
        </p>

        {linkSent ? (
          <div className="gate__sent">
            <p>
              <b>Check your email.</b>
            </p>
            <p>
              A sign-in link is on its way to <b>{email}</b>. Open it on this device. The link works
              once and expires after an hour.
            </p>
          </div>
        ) : (
          <form
            className="gate__form"
            onSubmit={async (e) => {
              e.preventDefault();
              setSending(true);
              await signIn(email.trim());
              setSending(false);
            }}
          >
            <label className="eyebrow" htmlFor="gate-email">
              Sign in with email
            </label>
            <input
              id="gate-email"
              className="field"
              type="email"
              required
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="btn btn--primary gate__submit" disabled={sending}>
              {sending ? 'Sending link…' : 'Send me a sign-in link'}
            </button>
            <p className="gate__note">
              No password to remember. Your progress is tied to this email, so signing in on your
              phone and your laptop keeps both on the same journey.
            </p>
          </form>
        )}

        {error && <p className="gate__error">{error}</p>}
      </div>
    </div>
  );
}
