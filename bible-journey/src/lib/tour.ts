/**
 * The name of the event that asks for the tour, and the one call that fires it.
 *
 * Its own module, and not a constant exported from `App.tsx`, for two reasons.
 * Importing it from there would have made a cycle, since `App` imports the very
 * view that wanted it, and a `const` in a cycle is only safe by luck about
 * evaluation order. And exporting a plain value beside a component turns off
 * Vite's fast refresh for that whole module, which is the same reason the
 * reducer does not live in `store.tsx`.
 *
 * An event rather than a prop threaded down through Settings and its panels,
 * because the only thing the rest of the app ever wants to say about the tour
 * is "start it", and the tour itself has to live high enough to change which
 * view is on screen.
 */
export const TOUR_EVENT = 'bibley:tour';

export function startTour(): void {
  window.dispatchEvent(new Event(TOUR_EVENT));
}
