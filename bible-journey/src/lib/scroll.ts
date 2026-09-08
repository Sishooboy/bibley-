/*
 * The app has one scrolling box and it is not the window.
 *
 * `body` is a fixed pane and `#root` scrolls inside it, which is what stops an
 * iPhone dragging the whole app past its own top. The cost is that
 * `window.scrollTo` is a no-op and `window.scrollY` is always 0, and neither
 * throws or warns when it is wrong. So the knowledge of which element moves
 * lives here rather than being spelled out at each call site, where the two
 * copies would drift apart the first time this changes.
 *
 * `scrollIntoView` needs none of this: it walks up to whatever scroller it
 * finds, so it kept working when the scroller moved.
 */

/** The element that actually scrolls, or null before React has mounted. */
export function appScroller(): HTMLElement | null {
  return document.getElementById('root');
}

/** Send the current screen back to its own beginning. */
export function scrollAppToTop(): void {
  appScroller()?.scrollTo({ top: 0 });
}
