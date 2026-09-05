import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const press = read('src/lib/press.ts');
const sound = read('src/lib/sound.ts');
const css = read('src/styles/app.css');

/**
 * The press knock and dip, pinned where nothing else would notice them going.
 *
 * All of this is one delegated listener and one attribute, which means there is
 * no component to fail and no render to look wrong. If it stops working the app
 * simply goes quiet and flat, which is exactly how it was before it existed.
 */
describe('the press feedback', () => {
  it('marks with an attribute, because React owns className', () => {
    /*
     * A class added from outside is wiped by the next render, and the element is
     * left mid-press with nothing to put it back. `useReveal` documents the same
     * trap, and the failure there was a note that stayed invisible for good.
     */
    expect(press).not.toMatch(/classList\.add/);
    expect(press).toMatch(/const DOWN = 'data-press'/);
    expect(press).toMatch(/setAttribute\(DOWN/);
    expect(press).toMatch(/removeAttribute\(DOWN\)/);
    expect(css).toContain('[data-press]');
  });

  it('listens on pointerdown, so the knock lands with the finger', () => {
    // `click` fires after the release, which is late enough to feel disconnected.
    expect(press).toMatch(/addEventListener\('pointerdown'/);
    expect(press).not.toMatch(/addEventListener\('click'/);
  });

  it('captures and stays passive', () => {
    // Capture, so a component calling stopPropagation cannot silence itself.
    // Passive, so a press can never delay a scroll.
    expect(press).toMatch(/capture: true, passive: true/);
  });

  it('lets go on cancel as well as on release', () => {
    // A press that turns into a scroll fires pointercancel and never pointerup.
    // Without this the element stays visibly held down for good. Both have to be
    // *subscribed*: matching the string alone also matches the teardown lines,
    // which is a pin that cannot fail.
    expect(press).toMatch(/addEventListener\('pointerup'/);
    expect(press).toMatch(/addEventListener\('pointercancel'/);
  });

  it('never knocks for a disabled control', () => {
    expect(press).toMatch(/'disabled' in el && el\.disabled/);
  });

  it('leaves the reader’s own text alone', () => {
    /*
     * A verse carries a label for highlighting. Someone reading is dragging
     * across words, not pressing controls, and a knock per word would turn
     * reading into typing.
     */
    expect(press).toMatch(/\.verse/);
    expect(press).toMatch(/data-verse/);
  });

  it('is registered once, outside the tree', () => {
    // The sign-in screen and the plan chooser live outside `Shell` and should
    // answer to a finger like everything else.
    expect(read('src/main.tsx')).toMatch(/listenForPresses\(\)/);
  });
});

describe('the knock itself', () => {
  it('is not a cue, so it can never reach the journal', () => {
    /*
     * Nothing changed when someone pressed something, so it is not the reducer's
     * business. `Cue` is the type that syncs consequences; a tap is not one.
     */
    expect(sound).toMatch(/export function tap\(\)/);
    const cueType = sound.match(/export type Cue = ([^;]+);/);
    expect(cueType).not.toBeNull();
    expect(cueType![1]).not.toContain('tap');
  });

  it('has no pitch, so it cannot be mistaken for a cue', () => {
    // Every other sound here is tuned because every other sound means something.
    // A dull knock is the sound of contact rather than the sound of news.
    const thock = sound.slice(sound.indexOf('function thock'), sound.indexOf('const TAP_LEVEL'));
    expect(thock).toContain('lowpass');
    expect(thock).not.toContain('createOscillator');
  });

  it('rate limits on the wall clock, not the audio clock', () => {
    /*
     * `currentTime` stops advancing while a context is suspended, which is what
     * iOS does the moment the app is backgrounded. A gap measured that way would
     * still be reading the moment before the phone went in a pocket, and would
     * refuse every tap from then on.
     */
    const tap = sound.slice(sound.indexOf('export function tap()'));
    expect(tap).toMatch(/performance\.now\(\)/);
    expect(tap.slice(0, tap.indexOf('thock('))).not.toMatch(/const now = c\.currentTime/);
  });

  it('obeys the same mute switch as everything else', () => {
    const tap = sound.slice(sound.indexOf('export function tap()'));
    expect(tap.slice(0, tap.indexOf('\n}'))).toMatch(/if \(!enabled\) return;/);
  });

  it('sits far enough under the cues to fire hundreds of times', () => {
    /*
     * Measured through an OfflineAudioContext at the levels below, the same way
     * MASTER was: the knock renders at -33 dBFS against the quietest cue's
     * -17.5, which is 15.5 dB down. It fires on every press in the app against
     * the chapter tick's three a day, so it has to read as the texture of
     * pressing rather than as a sound the app is making at you.
     */
    const level = sound.match(/const TAP_LEVEL = ([\d.]+);/);
    expect(level).not.toBeNull();
    const tapLevel = Number(level![1]);
    // The chapter tick is 0.2 and undo, the quietest cue, is 0.15.
    expect(tapLevel).toBeLessThan(0.15 / 2);
    expect(tapLevel).toBeGreaterThan(0.02);
  });
});

describe('the dip', () => {
  it('comes after every rule it has to beat', () => {
    /*
     * `[data-press]` is one attribute, 0,1,0, and it overrides `transform` and
     * `transition` on components that declare their own. Written next to the
     * buttons where it reads best, it lost to every rule below it: `.book__row`
     * sets a 260ms transition two thousand lines further down, so the 90ms press
     * never finished before the finger came off and the row simply never moved.
     * Nothing failed and nothing warned.
     *
     * The invariant is not "last line in the file", which would break the moment
     * anyone appended anything. It is "below the rules it is overriding".
     */
    const pressBlock = css.indexOf('[data-press] {');
    expect(pressBlock).toBeGreaterThan(-1);
    for (const selector of ['.btn {', '.book__row {', '.phase__row {', '.nav__item {']) {
      const owner = css.lastIndexOf(selector);
      expect(owner, `${selector} is missing`).toBeGreaterThan(-1);
      expect(pressBlock, `press must come after ${selector}`).toBeGreaterThan(owner);
    }
  });

  it('scales a row less than a button, and less again when it is wide', () => {
    // 0.96 on a 1000px row is fifteen pixels of travel, which reads as the
    // layout lurching. A gesture does not get bigger with the screen.
    expect(css).toMatch(/\.book__row\[data-press\][\s\S]{0,400}?transform: scale\(0\.985\)/);
    expect(css).toMatch(/min-width: 720px[\s\S]{0,600}?transform: scale\(0\.994\)/);
  });

  it('gives a reader who asked for less motion none of it', () => {
    const calm = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(calm).toContain('[data-press]');
    expect(calm).toContain('transform: none');
  });
});
