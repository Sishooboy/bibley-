import { useState } from 'react';
import { TOTAL_BOOK_COUNT, TOTAL_CHAPTER_COUNT } from '../data/plan';
import { formatNumber } from '../lib/format';
import { useCloud } from '../state/useCloud';

const CODE_LENGTH = 6;

export function SignInScreen() {
  const { signIn, verifyCode, resend, cancelSignIn, linkSent, pendingEmail, resendIn, error } =
    useCloud();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="gate">
      <div className="gate__panel">
        <img className="gate__mark" src="/icon-192.png" width={72} height={72} alt="" />
        <h1 className="gate__title">Bibley</h1>
        <p className="gate__lede">
          A reading journey through all {TOTAL_BOOK_COUNT} books,{' '}
          {formatNumber(TOTAL_CHAPTER_COUNT)} chapters, in an order built so each book lands with
          the context of the one before it.
        </p>

        {linkSent ? (
          <form
            className="gate__form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const ok = await verifyCode(code);
              setBusy(false);
              if (!ok) setCode('');
            }}
          >
            <label className="eyebrow" htmlFor="gate-code">
              Enter the code sent to {pendingEmail}
            </label>
            <input
              id="gate-code"
              className="field gate__code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={CODE_LENGTH}
              required
              autoFocus
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            />
            <button
              type="submit"
              className="btn btn--primary gate__submit"
              disabled={busy || code.length < CODE_LENGTH}
            >
              {busy ? 'Checking…' : 'Sign in'}
            </button>

            <div className="gate__altRow">
              <button
                type="button"
                className="gate__link"
                onClick={() => void resend()}
                disabled={resendIn > 0}
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Send a new code'}
              </button>
              <button
                type="button"
                className="gate__link"
                onClick={() => {
                  cancelSignIn();
                  setCode('');
                }}
              >
                Use a different email
              </button>
            </div>

            <p className="gate__note">
              The code works on any device, so you can request it here and type it on your phone.
              The same email also has a link, which only works on the device you opened it from.
            </p>
          </form>
        ) : (
          <form
            className="gate__form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              await signIn(email.trim());
              setBusy(false);
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
            <button type="submit" className="btn btn--primary gate__submit" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a code'}
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
