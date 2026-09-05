import { useCallback, useEffect, useRef, useState } from 'react';
import { reducedMotion } from '../lib/motion';
import { chime } from '../lib/sound';
import { Chevron } from './icons';

export type TourView = 'journey' | 'notes' | 'stats' | 'settings';

type Step = {
  /** The screen this step is about. The tour switches to it before pointing. */
  view: TourView;
  /** Matches a `data-tour` attribute on a real control. */
  target: string;
  title: string;
  body: string;
};

/*
 * Six stops, four screens.
 *
 * The screens are targeted by their masthead rather than by their nav button
 * for two reasons: the nav collapses behind a menu on a phone, so those buttons
 * have no box to point at, and the masthead is the one thing on an inner view
 * that is there whether or not the account has read anything. A new reader's
 * Stats screen is the empty state, and a spotlight expecting a chart would find
 * nothing at all.
 */
const STEPS: Step[] = [
  {
    view: 'journey',
    target: 'today',
    title: 'Start here',
    body: 'Your next chapters, worked out from the plan. It says how many verses and about how long, so you know what you are agreeing to before you tap it.',
  },
  {
    view: 'journey',
    target: 'streak',
    title: 'The streak, and the week behind it',
    body: 'One square a day. Read seven days running and you earn a rest day, which quietly covers the next day you miss instead of letting the run end.',
  },
  {
    view: 'journey',
    target: 'books',
    title: 'Go anywhere',
    body: 'Every book in the plan, one square each, filling in as you read. Tap any of them to open that book, whether the plan has reached it or not.',
  },
  {
    view: 'notes',
    target: 'masthead',
    title: 'Notes keeps what you thought',
    body: 'Highlight a passage while you read and attach a thought, or write a note on a whole chapter. Both land here, searchable and filed by book.',
  },
  {
    view: 'stats',
    target: 'masthead',
    title: 'Stats says where you actually are',
    body: 'Pace, streaks, the times of day you read, and the date the last chapter lands if you keep this up. There is a card at the bottom worth sending someone.',
  },
  {
    view: 'settings',
    target: 'masthead',
    title: 'Settings, and your way out',
    body: 'Change the reading order any time, nothing is ever lost. Sound is one tap, and you can download a copy of the whole journal whenever you like.',
  },
];

/** How far the spotlight sits outside the control it is pointing at. */
const PAD = 8;
/** The callout's own gap from the spotlight, and from the edge of the screen. */
const GAP = 14;
const EDGE = 12;

type Box = { top: number; left: number; width: number; height: number };

/**
 * A guided walk around the real controls.
 *
 * `Guide` is a stack of panels with drawings of the screens; this is the other
 * half of that job, pointing at the actual buttons on the actual page. The two
 * objections that kept coach marks out of this app for a long time are both
 * real, and both are answered here rather than ignored.
 *
 * **A coach mark has to know where its target is.** So it never stores one. Each
 * step names a `data-tour` attribute, and the box is measured off the live
 * element every frame the tour is open, which means it survives a card moving,
 * a font loading late, an image arriving, the reader scrolling, a phone
 * rotating and the smooth scroll that brings the target into view in the first
 * place. A step whose target is not in the document is skipped rather than
 * drawn, so the failure mode is a shorter tour and never a hole over nothing.
 *
 * **It cannot say anything about a screen you are not on.** So it drives the
 * app: each step names its view and the tour switches to it before it points.
 * That is the whole reason it can cover Notes, Stats and Settings at all.
 */
export function Tour({
  open,
  onClose,
  onView,
}: {
  open: boolean;
  onClose: () => void;
  onView: (view: TourView) => void;
}) {
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [missing, setMissing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const calm = reducedMotion();

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  const finish = useCallback(() => {
    // Always hand the reader back to the screen they started on. Ending a tour
    // on the settings page is the one place nobody wants to be left.
    onView('journey');
    onClose();
  }, [onClose, onView]);

  // Reopening from Settings should start at the beginning: the component stays
  // mounted while it is hidden, so the old step is still sitting in state.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  /* Switch screens for the step, and say so quietly. */
  useEffect(() => {
    if (!open) return;
    onView(current.view);
    setMissing(false);
    chime('note');
  }, [open, current.view, step, onView]);

  /*
   * Measure every frame while the tour is up.
   *
   * A rAF loop rather than scroll and resize listeners, because the thing most
   * likely to move the target is the smooth scroll this effect starts, and that
   * has no event that says "now I have finished". Watching it every frame is
   * both simpler and strictly more correct, and a few seconds of a loop that
   * reads one rect is not a cost worth optimising against being wrong.
   */
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    let scrolled = false;
    let waited = 0;

    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);

      if (!el) {
        /*
         * The view switch has not painted yet on the first frames. Give it a
         * moment before deciding the target is genuinely absent, then move on
         * rather than dimming the screen around nothing.
         */
        waited += 1;
        if (waited > 40) setMissing(true);
        frame = requestAnimationFrame(tick);
        return;
      }

      if (!scrolled) {
        scrolled = true;
        el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
      }

      const r = el.getBoundingClientRect();
      setBox({
        top: r.top - PAD,
        left: r.left - PAD,
        width: r.width + PAD * 2,
        height: r.height + PAD * 2,
      });
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open, current.target, calm]);

  /* A step pointing at nothing is skipped, not drawn. */
  useEffect(() => {
    if (!missing) return;
    if (last) finish();
    else setStep((s) => s + 1);
  }, [missing, last, finish]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight') setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, finish]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, step]);

  if (!open || !box) return null;

  /*
   * Below the target when there is room for the panel there, above it when
   * there is not, and pinned to the bottom when the target is so tall that
   * neither fits. Measured against the panel's real height rather than a
   * guess, so a three line body and a five line body both land correctly.
   */
  const panelH = panelRef.current?.offsetHeight ?? 190;
  const below = box.top + box.height + GAP;
  const above = box.top - GAP - panelH;
  const roomBelow = below + panelH < window.innerHeight - EDGE;
  const top = roomBelow ? below : above > EDGE ? above : window.innerHeight - panelH - EDGE;

  /*
   * Under the middle of the thing it is talking about, not the middle of the
   * screen. On a phone there is no difference, since the panel is nearly the
   * full width either way, but on a laptop a centred panel discussing a control
   * three hundred pixels to its left stops reading as a label for it.
   */
  const panelW = panelRef.current?.offsetWidth ?? 380;
  const wanted = box.left + box.width / 2 - panelW / 2;
  const left = Math.max(EDGE, Math.min(wanted, window.innerWidth - panelW - EDGE));

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="A look around Bibley">
      {/*
        The scrim is one element with an enormous spread shadow, so the hole is
        the element itself and there is nothing to keep in step with it. Four
        divs around a gap drift by a pixel the moment anything animates.
      */}
      <div
        className="tour__spot"
        style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        aria-hidden="true"
      />
      {/* Above the scrim and below the panel: a tap anywhere moves on, which is
          what everybody tries first. */}
      <button
        type="button"
        className="tour__catch"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => (last ? finish() : setStep((s) => s + 1))}
      />

      <div
        className="tour__panel"
        style={{ top, left }}
        ref={panelRef}
        tabIndex={-1}
        key={step}
        data-press="off"
      >
        <p className="eyebrow tour__count">
          {step + 1} of {STEPS.length}
        </p>
        <h2 className="tour__title">{current.title}</h2>
        <p className="tour__body">{current.body}</p>

        <div className="tour__foot">
          <button type="button" className="btn btn--sm btn--ghost tour__skip" onClick={finish}>
            Skip
          </button>
          <div className="tour__nav">
            {step > 0 && (
              <button
                type="button"
                className="btn btn--sm tour__back"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                <Chevron size={14} className="tour__backChev" />
                Back
              </button>
            )}
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => (last ? finish() : setStep((s) => s + 1))}
            >
              {last ? 'Start reading' : 'Next'}
              {!last && <Chevron size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
