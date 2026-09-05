import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8');

/** Where a selector's rule opens, or -1. Used to compare cascade order. */
const at = (selector: string) => css.indexOf(`${selector} {`);

/**
 * The button family, pinned where the cascade decides the answer rather than the
 * declaration.
 *
 * None of this is visible in a component: every rule here is the same
 * specificity as the one it has to beat, so the file's order is the only thing
 * separating them, and moving a block a hundred lines is enough to silently undo
 * it. That is not hypothetical. `.btn--sm` set `padding` and `font-size` nine
 * hundred lines after the coarse-pointer rule that bumps every button up on a
 * phone, so it won there too, and every secondary button in the app was a
 * 12.5px label in a 26px box on the one device where a control most needs to be
 * hittable. Nothing failed, nothing warned, and it looked like a design choice.
 */
describe('the button family', () => {
  it('bumps small buttons on touch after .btn--sm has had its say', () => {
    const small = at('.btn--sm');
    const coarse = css.indexOf('@media (pointer: coarse)', small);
    expect(small).toBeGreaterThan(-1);
    expect(coarse).toBeGreaterThan(small);
    // And that block is the one that actually mentions the small button.
    const block = css.slice(coarse, css.indexOf('\n}\n', coarse));
    expect(block).toContain('.btn--sm');
  });

  it('presses after it focuses, so a held focused button still goes down', () => {
    /*
     * Both rules write `box-shadow`, at the same specificity. Focus first means
     * the press wins while the key is down, and the gold ring stays either way
     * because `outline` is a different property.
     */
    expect(at('.btn:active')).toBeGreaterThan(at('.btn:focus-visible'));
  });

  it('gives the gold focus ring something to sit against', () => {
    /*
     * Gold on cream measures 1.7:1, under the 3:1 a graphic needs, and
     * `outline-offset` puts the page between the button and the ring. Two pixels
     * of ink fill that gap: 8.7:1 for the gold against it, 14.9:1 for the ink
     * against the page.
     */
    const rule = css.slice(at('.btn:focus-visible'), at('.btn:active'));
    expect(rule).toContain('outline: 2px solid var(--yellow)');
    expect(rule).toMatch(/box-shadow:[^;]*0 0 0 2px var\(--ink-700\)/);
  });

  it('excludes disabled from every hover rather than undoing it after', () => {
    /*
     * The old reset named one background, so it could only ever put the plain
     * button back: a disabled primary still repainted itself under the cursor.
     */
    const hovers = [...css.matchAll(/^\s*(\.btn[\w-]*)((?::[\w-]+\([^)]*\))*):hover/gm)];
    expect(hovers.length).toBeGreaterThan(3);
    for (const [, selector, guards] of hovers) {
      expect(`${selector}${guards}`).toContain(':not(:disabled)');
    }
  });

  it('keeps every hover inside a hover media query', () => {
    // A phone leaves the state applied after a tap. Same rule as everywhere.
    for (const line of css.split(/\r?\n/)) {
      if (/^[.#a-zA-Z[]/.test(line)) expect(line).not.toContain(':hover');
    }
  });

  it('lets the reader keep a rectangle, since a 60px pill is a lozenge', () => {
    const rule = css.slice(at('.reader__actions .btn'));
    expect(rule.slice(0, rule.indexOf('}'))).toContain('border-radius: 8px');
  });
});
