import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_PREFS } from '../lib/prefs';
import { useStore } from '../state/useStore';
import { Chevron } from './icons';

const RED = '#c81d25';
const GOLD = '#f7b801';
const CREAM = '#f7f2e9';

/*
 * The drawings.
 *
 * Each one is a diagram of the screen it is about rather than an illustration
 * of the idea: the shape you are shown here is the shape you will meet a minute
 * later. They are inline SVG in the brand's two colours, so they cost nothing to
 * load, scale to any screen, and cannot arrive after the words they belong to.
 */

function ArtWelcome() {
  return (
    <svg viewBox="0 0 240 132" className="guide__art" aria-hidden="true">
      <rect x="18" y="14" width="204" height="34" rx="8" fill="rgba(0,0,0,0.45)" />
      <rect x="28" y="24" width="14" height="14" rx="4" fill={GOLD} />
      <rect x="50" y="27" width="42" height="8" rx="4" fill={CREAM} opacity="0.9" />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={110 + i * 28}
          y={26}
          width="22"
          height="10"
          rx="5"
          fill={i === 0 ? RED : CREAM}
          opacity={i === 0 ? 1 : 0.28}
        />
      ))}
      <rect x="18" y="60" width="204" height="58" rx="10" fill="rgba(255,255,255,0.06)" />
      <rect x="32" y="74" width="88" height="10" rx="5" fill={CREAM} opacity="0.75" />
      <rect x="32" y="92" width="140" height="8" rx="4" fill={CREAM} opacity="0.3" />
      <circle cx="196" cy="89" r="18" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="6" />
      <path
        d="M196 71a18 18 0 0 1 13 30"
        fill="none"
        stroke={GOLD}
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArtJourney() {
  return (
    <svg viewBox="0 0 240 132" className="guide__art" aria-hidden="true">
      <rect x="18" y="16" width="86" height="34" rx="8" fill="rgba(0,0,0,0.4)" />
      <rect x="18" y="16" width="86" height="34" rx="8" fill="none" stroke={GOLD} strokeWidth="2" />
      <text x="61" y="40" textAnchor="middle" className="guide__artNum">
        1
      </text>
      <path d="M112 33h16" stroke={CREAM} strokeWidth="2.5" opacity="0.5" strokeLinecap="round" />
      <rect x="136" y="16" width="86" height="34" rx="8" fill="rgba(0,0,0,0.4)" />
      <rect
        x="136"
        y="16"
        width="86"
        height="34"
        rx="8"
        fill="none"
        stroke={GOLD}
        strokeWidth="2"
      />
      <text x="179" y="40" textAnchor="middle" className="guide__artNum">
        12
      </text>
      <rect x="18" y="66" width="118" height="22" rx="11" fill={RED} />
      <rect x="146" y="66" width="76" height="22" rx="11" fill="rgba(255,255,255,0.1)" />
      {/* The strip underneath, filling in as the chapters land. */}
      {Array.from({ length: 18 }, (_, i) => (
        <rect
          key={i}
          x={18 + i * 11.6}
          y={104}
          width="9"
          height="12"
          rx="2"
          fill={i < 12 ? GOLD : 'rgba(255,255,255,0.14)'}
        />
      ))}
    </svg>
  );
}

function ArtRead() {
  return (
    <svg viewBox="0 0 240 132" className="guide__art" aria-hidden="true">
      <rect x="30" y="10" width="180" height="112" rx="10" fill="rgba(247,242,233,0.94)" />
      <rect x="46" y="26" width="62" height="11" rx="3" fill={RED} />
      {[0, 1, 3, 4].map((i) => (
        <rect
          key={i}
          x={46}
          y={50 + i * 16}
          width={i === 4 ? 96 : 148}
          height="7"
          rx="3.5"
          fill="#241c16"
          opacity="0.22"
        />
      ))}
      {/* The highlighted line, with the thought written on it. */}
      <rect x="42" y="94" width="130" height="14" rx="3" fill={GOLD} opacity="0.75" />
      <rect x="46" y="98" width="122" height="7" rx="3.5" fill="#241c16" opacity="0.42" />
      <circle cx="186" cy="101" r="13" fill={RED} />
      <path
        d="M181 101h10M186 96v10"
        stroke={CREAM}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArtNotes() {
  return (
    <svg viewBox="0 0 240 132" className="guide__art" aria-hidden="true">
      <rect x="18" y="10" width="204" height="24" rx="7" fill="rgba(0,0,0,0.4)" />
      <circle cx="34" cy="22" r="6" fill="none" stroke={CREAM} strokeWidth="2" opacity="0.6" />
      <path d="M38 26l5 5" stroke={CREAM} strokeWidth="2" opacity="0.6" strokeLinecap="round" />
      <rect x="50" y="18" width="70" height="8" rx="4" fill={CREAM} opacity="0.25" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect
            x="18"
            y={44 + i * 30}
            width="204"
            height="24"
            rx="6"
            fill="rgba(255,255,255,0.07)"
          />
          <rect x="18" y={44 + i * 30} width="3" height="24" rx="1.5" fill={i === 1 ? GOLD : RED} />
          <rect x="32" y={52 + i * 30} width="46" height="8" rx="4" fill={RED} opacity="0.85" />
          <rect
            x="88"
            y={53 + i * 30}
            width={[92, 68, 104][i]}
            height="6"
            rx="3"
            fill={CREAM}
            opacity="0.3"
          />
        </g>
      ))}
    </svg>
  );
}

function ArtStats() {
  return (
    <svg viewBox="0 0 240 132" className="guide__art" aria-hidden="true">
      <circle cx="58" cy="62" r="34" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="11" />
      <path
        d="M58 28a34 34 0 0 1 24 58"
        fill="none"
        stroke={GOLD}
        strokeWidth="11"
        strokeLinecap="round"
      />
      <text x="58" y="70" textAnchor="middle" className="guide__artNum">
        41%
      </text>
      {[26, 44, 30, 58, 40, 70, 52].map((h, i) => (
        <rect
          key={i}
          x={116 + i * 17}
          y={100 - h}
          width="11"
          height={h}
          rx="3"
          fill={i === 5 ? GOLD : RED}
        />
      ))}
      <rect x="116" y="110" width="106" height="6" rx="3" fill={CREAM} opacity="0.2" />
    </svg>
  );
}

function ArtSet() {
  return (
    <svg viewBox="0 0 240 132" className="guide__art" aria-hidden="true">
      <circle cx="120" cy="52" r="30" fill="none" stroke={GOLD} strokeWidth="4" />
      <path
        d="M107 52l10 10 19-21"
        fill="none"
        stroke={GOLD}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[0, 1].map((i) => (
        <g key={i}>
          <rect
            x={i === 0 ? 40 : 148}
            y="98"
            width="52"
            height="26"
            rx="6"
            fill="rgba(255,255,255,0.1)"
          />
          <rect x={i === 0 ? 50 : 158} y="107" width="32" height="8" rx="4" fill={CREAM} opacity="0.35" />
        </g>
      ))}
      <path
        d="M96 111h48"
        stroke={GOLD}
        strokeWidth="2.5"
        strokeDasharray="5 5"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Step = { eyebrow: string; title: string; body: string; art: ReactNode };

const STEPS: Step[] = [
  {
    eyebrow: 'Welcome',
    title: 'This is Bibley',
    body: 'A reading plan with the whole Bible inside it. Four screens, and everything below is the tour. It takes about twenty seconds.',
    art: <ArtWelcome />,
  },
  {
    eyebrow: 'Journey',
    title: 'Say what you read',
    body: 'Open a book and there are two boxes: from which chapter, to which. Type the numbers and press the button. The date sits beside them, so a chapter you read on Sunday still counts on Sunday.',
    art: <ArtJourney />,
  },
  {
    eyebrow: 'Read',
    title: 'The text is in here too',
    body: 'Every book, every chapter, and any book you have opened once will open again with no connection. Select a passage to highlight it, and write down what you made of it while it is still in front of you.',
    art: <ArtRead />,
  },
  {
    eyebrow: 'Notes',
    title: 'Everything you wrote down',
    body: 'Highlights and chapter notes in one list, most recent first. Search it, filter it by book, or group it. None of it goes anywhere near the card you share.',
    art: <ArtNotes />,
  },
  {
    eyebrow: 'Stats',
    title: 'How it is actually going',
    body: 'Your streak, your pace, and the date the last chapter lands if you keep this up. There is a card at the bottom of it worth sending to someone.',
    art: <ArtStats />,
  },
  {
    eyebrow: 'One more thing',
    title: 'It follows the account, not the phone',
    body: 'Everything is saved against your sign-in. Read on a phone, mark it on a laptop, it is the same journey. You can reopen this guide any time from Settings.',
    art: <ArtSet />,
  },
];

/**
 * The welcome tour, shown once and then never again unless it is asked for.
 *
 * A stepped panel rather than marks pointing at the real controls: coach marks
 * have to know where their target is, which means they break the first time a
 * card moves or the reader scrolls, and they cannot say anything at all about a
 * screen you are not currently on.
 *
 * Whether it has been seen lives in `prefs`, so it is synced. Being walked round
 * the app again on the second device you sign into is not a welcome.
 */
export function Guide() {
  const { data, setPrefs } = useStore();
  const prefs = data.prefs ?? DEFAULT_PREFS;
  const [step, setStep] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const open = !prefs.guideSeenAt;

  const close = () => setPrefs({ ...prefs, guideSeenAt: new Date().toISOString() });

  useEffect(() => {
    if (!open) return;
    // Asking for it again from Settings should start it again. The component
    // stays mounted while it is hidden, so the old step is still sitting there.
    setStep(0);
    const opener = document.activeElement as HTMLElement | null;
    nextRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
      if (e.key !== 'Tab' || !shellRef.current) return;
      // It claims aria-modal, so focus has to actually stay inside it.
      const focusable = shellRef.current.querySelectorAll<HTMLElement>('button:not([disabled])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
    // close is stable enough for this, and re-running would steal focus back
    // every time the step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="guide" role="dialog" aria-modal="true" aria-label="Welcome to Bibley">
      <div className="guide__panel" ref={shellRef}>
        <button type="button" className="guide__skip" onClick={close}>
          {last ? 'Close' : 'Skip'}
        </button>

        {/* Keyed, so each step animates in rather than the text swapping in place. */}
        <div className="guide__stage" key={step}>
          {current.art}
          <p className="eyebrow eyebrow--onDark guide__eyebrow">{current.eyebrow}</p>
          <h2 className="guide__title">{current.title}</h2>
          <p className="guide__body">{current.body}</p>
        </div>

        <div className="guide__foot">
          <div className="guide__dots" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s.eyebrow} className={`guide__dot${i === step ? ' guide__dot--on' : ''}`} />
            ))}
          </div>

          <div className="guide__nav">
            <button
              type="button"
              className="btn btn--sm guide__back"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              <Chevron size={14} className="guide__backChev" />
              Back
            </button>
            <button
              type="button"
              className="btn btn--sm btn--primary"
              ref={nextRef}
              onClick={() => (last ? close() : setStep((s) => s + 1))}
            >
              {last ? 'Start reading' : 'Next'}
              {!last && <Chevron size={14} />}
            </button>
          </div>
        </div>

        <p className="guide__count" aria-live="polite">
          {step + 1} of {STEPS.length}
        </p>
      </div>
    </div>
  );
}
