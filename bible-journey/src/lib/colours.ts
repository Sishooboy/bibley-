/*
 * A leaf: this module imports nothing.
 *
 * It is its own file because two modules that already import each other need it.
 * `storage.ts` imports `prefs.ts` for `normalizePrefs`, and `prefs.ts` needs the
 * colours to remember the last one picked. Defining them in either would make a
 * cycle whose safety depends on evaluation order, which is the thing that kept
 * `TOUR_EVENT` out of `App.tsx`.
 */

/*
 * The three colours a highlight can be, and what the reader means by each is
 * theirs to decide.
 *
 * **Gold is first and it is the default, because it is what every highlight
 * made before colours existed already is.** An absent `colour` reads as gold,
 * so nothing anybody marked changes the day this ships.
 *
 * Blue and green rather than a second warm colour, on purpose. Red is the app's
 * own voice, the section headings and the primary buttons are red, and a red
 * highlight would read as part of the page rather than as something the reader
 * did to it. Blue and green mean nothing anywhere else here, which is exactly
 * what a reader's own category needs.
 */
export const HIGHLIGHT_COLOURS = ['gold', 'blue', 'green'] as const;
export type HighlightColour = (typeof HIGHLIGHT_COLOURS)[number];
