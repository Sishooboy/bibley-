import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/**
 * `useReveal` marks a revealed element from outside React, and `app.css` decides
 * what that mark looks like. The two have to agree, and the failure when they do
 * not is not a missing animation: `.reveal` starts at opacity 0, so every
 * element that should have been revealed stays invisible instead.
 */
describe('the scroll reveal marker', () => {
  const motion = read('src/lib/motion.ts');
  const css = read('src/styles/app.css');

  it('is an attribute, because React rewrites className whole', () => {
    /*
     * A class added out here is wiped the moment the component changes its own
     * className, and by then the element has been unobserved and the safety
     * timeout has run, so nothing puts it back. That is what turned an opened
     * note into a blank sand coloured block: opening it adds `entry--open`.
     */
    expect(motion).not.toMatch(/classList\.add/);
    expect(motion).toMatch(/setAttribute\(/);
  });

  it('is the same one the stylesheet reveals on', () => {
    const marker = motion.match(/setAttribute\('([\w-]+)'/);
    expect(marker).not.toBeNull();
    expect(css).toContain(`.reveal[${marker![1]}]`);
  });
});
