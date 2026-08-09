/**
 * Holds the page at 1:1.
 *
 * The viewport meta covers Android and every webview, but **iOS Safari has
 * ignored `user-scalable=no` since iOS 10**, so on a phone the only thing that
 * actually stops a pinch is refusing the gesture events behind it. They are
 * WebKit's own, non-standard, and exist for exactly this.
 *
 * `touch-action: manipulation` in the stylesheet does the other half: it takes
 * away double-tap to zoom, which is the one that gets triggered by accident,
 * usually while tapping a chapter square twice.
 *
 * The trade this makes is real. Pinching to enlarge text is how a lot of people
 * read, and the answer here is the reader's own text size control, which is four
 * steps, synced to the account, and scales the passage properly rather than
 * scaling the whole page and leaving it panned sideways. Anyone relying on the
 * system text size still gets it: none of this touches that.
 */
export function lockZoom(): void {
  if (typeof document === 'undefined') return;

  // Non-standard, so they are not in the event map and are typed as plain
  // events. Passive has to be off or preventDefault does nothing.
  const refuse = (event: Event) => event.preventDefault();
  for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(name, refuse, { passive: false });
  }
}
