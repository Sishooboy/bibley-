import { useState } from 'react';
import { TOTAL_BOOK_COUNT, TOTAL_CHAPTER_COUNT } from '../data/plan';
import { formatNumber } from '../lib/format';
import { useCloud } from '../state/useCloud';

const CODE_LENGTH = 6;

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function SignInScreen() {
  const {
    signInWithGoogle,
    signIn,
    verifyCode,
    resend,
    cancelSignIn,
    linkSent,
    pendingEmail,
    resendIn,
    error,
  } = useCloud();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  /** Email is the fallback now, so it stays folded away until asked for. */
  const [emailMode, setEmailMode] = useState(false);

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
          <div className="gate__form">
            <button
              type="button"
              className="btn gate__google"
              onClick={() => void signInWithGoogle()}
            >
              <GoogleMark />
              Continue with Google
            </button>

            {emailMode ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  await signIn(email.trim());
                  setBusy(false);
                }}
              >
                <label className="eyebrow" htmlFor="gate-email">
                  Or sign in with an emailed code
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
              </form>
            ) : (
              <div className="gate__altRow">
                <button type="button" className="gate__link" onClick={() => setEmailMode(true)}>
                  Use an email code instead
                </button>
              </div>
            )}

            <p className="gate__note">
              Your progress is tied to the account you pick, so signing in on your phone and your
              laptop keeps both on the same journey.
            </p>
          </div>
        )}

        {error && <p className="gate__error">{error}</p>}
      </div>
    </div>
  );
}
