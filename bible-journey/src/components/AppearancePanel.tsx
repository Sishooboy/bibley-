import { useState } from 'react';
import { THEMES, applyTheme, loadTheme, saveTheme, type Theme } from '../lib/theme';

type Props = { reveal?: (node: Element | null) => void };

/*
 * Each option is a sentence that answers the question rather than a label that
 * needs one, the same shape as the two visibility positions on Friends.
 * "Match this device" leads because it is the default and the one most people
 * want: a phone already set to go dark at sunset takes the app with it.
 */
const OPTIONS: Record<Theme, { name: string; line: string }> = {
  system: {
    name: 'Match this device.',
    line: 'Light or dark as your phone or computer is set, and it follows when they switch.',
  },
  light: { name: 'Light.', line: 'Cream paper, whatever the time.' },
  dark: { name: 'Dark.', line: 'Warm near-black, for reading with the lights off.' },
};

export function AppearancePanel({ reveal }: Props) {
  const [theme, setTheme] = useState<Theme>(loadTheme);

  const choose = (next: Theme) => {
    setTheme(next);
    saveTheme(next);
    applyTheme(next);
  };

  return (
    <section ref={reveal} className="card reveal">
      <div className="card__head">
        <div>
          <h3 className="card__title">Appearance</h3>
          <p className="card__note">
            Kept on this device and not your account, so a phone by the bed can be dark while a
            laptop at a desk stays light.
          </p>
        </div>
      </div>

      <fieldset className="themeChoice">
        <legend className="sr-only">Theme</legend>
        {THEMES.map((option) => (
          <label key={option} className="modeOption">
            <input
              type="radio"
              name="theme"
              value={option}
              checked={theme === option}
              onChange={() => choose(option)}
            />
            <span>
              <strong>{OPTIONS[option].name}</strong> {OPTIONS[option].line}
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
