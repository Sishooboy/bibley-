import { tap } from './sound';

/**
 * What counts as something you can press.
 *
 * Written as element types and roles rather than as a list of the app's class
 * names, which was the alternative and would have been wrong the first time
 * anyone added a component: a new button would silently be the one dead control
 * on the screen, and nothing would fail to say so. Everything here is either a
 * real control or is carrying an ARIA role that promises it behaves like one.
 */
const PRESSABLE = [
  'button',
  'summary',
  'a[href]',
  'select',
  'label',
  'input[type="checkbox"]',
  'input[type="radio"]',
  '[role="button"]',
  '[role="tab"]',
  '[role="switch"]',
].join(',');

/**
 * Things that are pressable but must stay silent.
 *
 * The reader's own text is the one that matters. A verse carries a `label` for
 * highlighting, and someone reading a chapter is dragging across words rather
 * than pressing a control: knocking once per word would turn reading into
 * typing.
 */
const SILENT = '.verse, .reader__body, [data-verse], [data-press="off"]';

/** Set while a press is on screen, so the release can hand the element back. */
const DOWN = 'data-press';

/**
 * A knock and a dip on every press, anywhere in the app.
 *
 * One delegated listener rather than a handler per component, because the point
 * is that *everything* answers: a control the author forgot to wire would be
 * the one thing on the screen that feels dead, and that is more noticeable than
 * no feedback at all. `pointerdown` and not `click`, so the sound lands with
 * the finger rather than after it, which is the whole difference between a
 * control that feels connected and one that feels laggy.
 *
 * Capture phase, so a component calling `stopPropagation` on its own press
 * cannot silence it, and passive, so it can never delay a scroll.
 */
export function listenForPresses(): () => void {
  const down = (e: PointerEvent) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const el = target.closest(PRESSABLE);
    if (!el || el.closest(SILENT)) return;
    // `disabled` only exists on form controls, and a disabled one is not a press.
    if ('disabled' in el && el.disabled) return;

    tap();

    /*
     * The dip is an attribute, never a class. React owns `className` on most of
     * these and rewrites the whole attribute when a prop changes, so a class
     * added out here is destroyed by the next render and the element is left
     * shrunk. That is the same trap `useReveal` documents.
     */
    el.setAttribute(DOWN, '');
    const up = () => {
      el.removeAttribute(DOWN);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  };

  window.addEventListener('pointerdown', down, { capture: true, passive: true });
  return () => window.removeEventListener('pointerdown', down, { capture: true });
}
