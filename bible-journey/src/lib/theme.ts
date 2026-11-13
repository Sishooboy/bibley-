/*
 * Light, dark, or whatever the device says.
 *
 * **Device-local on purpose, and not a `Prefs` field**, for the same reason the
 * folded footer is not: `normalize()` is a whitelist and `cloud.tsx` upserts the
 * whole row, so a field added to the journal has to ship in a release that only
 * reads it before any release writes it. And a theme belongs to the screen, not
 * the reader: dark on the phone at the bedside and light on the laptop at a
 * desk is a perfectly sensible pair, and syncing would make it impossible.
 *
 * "System" is the absence of a choice, so it is stored as nothing at all. The
 * stylesheet answers the system on its own through `prefers-color-scheme`, and
 * `data-theme` on the root exists only to overrule it.
 *
 * `index.html` repeats `THEME_KEY` and the two attributes in a script that runs
 * before the stylesheet paints, so a reader who chose dark on a light phone
 * never sees a cream frame first. `theme.test.ts` keeps the two in step.
 */
export type Theme = 'system' | 'light' | 'dark';

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

export const THEME_KEY = 'bible-journey/theme';

export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // Storage blocked in a private window. Following the system is the choice
    // nobody has to have made.
    return 'system';
  }
}

export function saveTheme(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch (err) {
    console.error('Could not remember the theme.', err);
  }
}

/*
 * The attribute is what the stylesheet reads. The `color-scheme` meta is for
 * the moment before the stylesheet has loaded, and for the browser's own
 * pieces, the scrollbars and the date picker's calendar, which follow it.
 */
export function applyTheme(theme: Theme, doc: Document = document): void {
  const root = doc.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  doc
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute('content', theme === 'system' ? 'light dark' : theme);
}
