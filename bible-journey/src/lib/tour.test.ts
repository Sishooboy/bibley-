import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/** Every source file, so an anchor can be found wherever it happens to live. */
function sources(dir = 'src', out: string[] = []): string[] {
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const path = `${dir}/${name}`;
    if (statSync(join(process.cwd(), path)).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

const tour = read('src/components/Tour.tsx');
const sound = read('src/lib/sound.ts');
const app = read('src/App.tsx');
const guide = read('src/components/Guide.tsx');
const css = read('src/styles/app.css');

/** The `target:` of every step, in order. */
const targets = [...tour.matchAll(/target: '([\w-]+)'/g)].map((m) => m[1]);
/** The `view:` of every step, in order. */
const views = [...tour.matchAll(/view: '([\w-]+)'/g)].map((m) => m[1]);

/**
 * The walk round the real controls.
 *
 * Coach marks were kept out of this app for years for two reasons that were
 * both correct: one has to know where its target is, and it can say nothing
 * about a screen you are not on. The component answers both, and these are the
 * pins that keep the answers true.
 */
describe('the tour', () => {
  it('points at anchors that actually exist', () => {
    /*
     * The one failure with no symptom. A target naming an attribute nobody
     * renders is skipped at runtime by design, so renaming a component's
     * `data-tour` does not throw, does not warn and does not look broken: the
     * tour just quietly gets shorter, and nobody finds out until a new reader
     * has already had the short version.
     */
    const all = sources().map(read).join('\n');
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(all, `nothing renders data-tour="${target}"`).toContain(`data-tour="${target}"`);
    }
  });

  it('names views the shell can actually switch to', () => {
    const ids = [...app.matchAll(/\{ id: '([\w-]+)', label:/g)].map((m) => m[1]);
    expect(ids).toContain('journey');
    for (const view of views) expect(ids, `no such view: ${view}`).toContain(view);
  });

  /*
   * The gap this is here to catch. A whole screen was added to the nav and the
   * tour did not mention it, which is the same silent failure as a renamed
   * anchor: nothing throws, nothing warns, and a new reader is simply never
   * told that part of the app exists. "More than one screen" was true the
   * entire time it was wrong.
   */
  it('stops on every screen the nav offers', () => {
    const ids = [...app.matchAll(/\{ id: '([\w-]+)', label:/g)].map((m) => m[1]);
    const visited = new Set(views);
    for (const id of ids) {
      expect(visited.has(id), `the tour never stops on ${id}`).toBe(true);
    }
  });

  it('visits more than one screen, which is the whole point', () => {
    // A tour that cannot leave the journey is a tour that cannot describe the
    // other three quarters of the app, which was the second objection to coach
    // marks and the reason this one drives the view.
    expect(new Set(views).size).toBeGreaterThan(1);
    expect(tour).toMatch(/onView\(current\.view\)/);
  });

  it('measures its target instead of remembering where it was', () => {
    /*
     * The first objection to coach marks. Nothing here may carry a coordinate:
     * the box comes off the live element, every frame, so it survives a card
     * moving, a font landing late, a rotation and the smooth scroll the tour
     * itself starts.
     */
    expect(tour).toMatch(/getBoundingClientRect\(\)/);
    expect(tour).toMatch(/requestAnimationFrame/);
    expect(tour).toMatch(/cancelAnimationFrame/);
  });

  it('skips a step it cannot point at rather than dimming nothing', () => {
    expect(tour).toMatch(/setMissing\(true\)/);
    const skip = tour.slice(tour.indexOf('if (!missing) return;'));
    expect(skip.slice(0, 120)).toMatch(/setStep\(\(s\) => s \+ 1\)/);
  });

  it('hands the reader back to the journey when it ends', () => {
    // Ending on the settings screen is the one place nobody wants to be left.
    const end = tour.slice(tour.indexOf('const finish ='));
    expect(end.slice(0, end.indexOf('}, ['))).toMatch(/onView\('journey'\)/);
  });

  it('is reachable from the guide and from Settings', () => {
    // Finishing the guide hands over; skipping it must not, because skipping is
    // someone saying what they want.
    expect(guide).toMatch(/onFinish\?\.\(\)/);
    expect(guide).toMatch(/last \? done\(\) :/);
    expect(read('src/views/SettingsView.tsx')).toMatch(/onClick=\{startTour\}/);
    expect(app).toMatch(/addEventListener\(TOUR_EVENT/);
  });

  it('keeps the event name out of App.tsx, so there is no import cycle', () => {
    /*
     * `App` imports `SettingsView`, so `SettingsView` importing a const back out
     * of `App` is a cycle whose safety depends on evaluation order. It also
     * turns off fast refresh for the module that exports a plain value beside a
     * component, the same reason the reducer does not live in `store.tsx`.
     */
    expect(read('src/lib/tour.ts')).toMatch(/export const TOUR_EVENT/);
    expect(app).toMatch(/import \{ TOUR_EVENT \} from '\.\/lib\/tour'/);
    expect(read('src/views/SettingsView.tsx')).not.toMatch(/from '\.\.\/App'/);
  });

  it('gives a reader who asked for less motion a still spotlight', () => {
    /*
     * The spotlight still moves between steps, because that movement is the
     * tour saying "now this one" and losing it would leave someone hunting for
     * what changed. It arrives rather than travelling, and nothing pulses.
     */
    expect(tour).toMatch(/behavior: calm \? 'auto' : 'smooth'/);
    const calm = css.slice(css.indexOf('.tour__spot'));
    const block = calm.slice(calm.indexOf('@media (prefers-reduced-motion: reduce)'));
    const head = block.slice(0, 500);
    expect(head).toContain('.tour__spot');
    expect(head).toContain('animation: none');
    // The sheen is decoration and goes with the rest of it.
    expect(head).toContain('.tour__spot::before');
    expect(head).toContain('.tour__stage');
  });

  it('climbs rather than repeating one note six times', () => {
    /*
     * It borrowed the insight bell first, which meant the same A5 on every
     * step. That is the difference between a sound and a score: an identical
     * chime tells you something happened and nothing else, so by the third one
     * you have stopped hearing it. Rung by rung tells you where you are in the
     * walk without anyone reading "4 of 6".
     */
    expect(tour).toMatch(/tourStep\(step, STEPS\.length\)/);
    expect(tour).not.toMatch(/chime\('note'\)/);

    const ladder = sound.match(/const TOUR_LADDER = \[([^\]]+)\]/);
    expect(ladder).not.toBeNull();
    const rungs = ladder![1].split(',').map((n) => n.trim());
    expect(rungs.length).toBeGreaterThan(1);
    // Octaves and fifths on A and no third, the rule the whole set follows.
    for (const rung of rungs) expect(rung).toMatch(/^[AE]\d$/);
  });

  it('lands on the last step instead of merely stopping', () => {
    // Root, fifth and octave, the same arrival shape the streak cue resolves
    // on, and measured louder than the rungs: -12.8 dBFS against about -15.7.
    const step = sound.slice(sound.indexOf('export function scheduleTourStep'));
    const arrival = step.slice(0, step.indexOf('const freq'));
    expect(arrival).toMatch(/index >= total - 1/);
    expect(arrival).toMatch(/A4/);
    expect(arrival).toMatch(/E5/);
    expect(arrival).toMatch(/A5/);
  });

  it('keeps every rung inside what a phone speaker can reproduce', () => {
    /*
     * 220 to 880. Below that a phone has almost nothing and above it gets
     * shrill, which is why only `drone` and the finished book's flourish are
     * allowed outside the window.
     */
    const notes: Record<string, number> = {};
    for (const [, name, value] of sound.matchAll(/const ([AE]\d) = ([\d.]+);/g)) {
      notes[name] = Number(value);
    }
    const ladder = sound.match(/const TOUR_LADDER = \[([^\]]+)\]/)![1];
    for (const rung of ladder.split(',').map((n) => n.trim())) {
      expect(notes[rung], `${rung} is not a defined note`).toBeDefined();
      expect(notes[rung]).toBeGreaterThanOrEqual(220);
      expect(notes[rung]).toBeLessThanOrEqual(880);
    }
  });

  it('rises, so a later step is never a lower note than an earlier one', () => {
    const notes: Record<string, number> = {};
    for (const [, name, value] of sound.matchAll(/const ([AE]\d) = ([\d.]+);/g)) {
      notes[name] = Number(value);
    }
    const ladder = sound.match(/const TOUR_LADDER = \[([^\]]+)\]/)![1];
    const freqs = ladder.split(',').map((n) => notes[n.trim()]);
    for (let i = 1; i < freqs.length; i++) expect(freqs[i]).toBeGreaterThan(freqs[i - 1]);
  });

  it('slides the progress rail instead of restarting it every step', () => {
    /*
     * The words are keyed on the step so each one arrives rather than swapping
     * in place. The rail must sit outside that key, or it would be replaced
     * along with them and start from nothing on every stop, which is the one
     * thing a progress indicator may not do.
     */
    const railAt = tour.indexOf('className="tour__rail"');
    const stageAt = tour.indexOf('className="tour__stage"');
    expect(railAt).toBeGreaterThan(-1);
    expect(stageAt).toBeGreaterThan(railAt);
    expect(tour).not.toMatch(/className="tour__panel"[\s\S]{0,200}key=\{step\}/);
    expect(css).toMatch(/\.tour__rail \{[\s\S]*?transition: width/);
  });

  it('borrows the app’s own sheen rather than inventing a second one', () => {
    // The today button already makes this move on arrival. A different flourish
    // for the tour would make the tour feel like a different product.
    expect(css).toContain('tourSheen');
    // By background-position, not transform: a transform would carry the
    // pseudo-element's rounded corners out of the box with it.
    const sheen = css.slice(css.indexOf('.tour__spot::before'));
    expect(sheen.slice(0, sheen.indexOf('}'))).toMatch(/background-position/);
  });

  it('cuts one hole with one box, so nothing can drift out of step', () => {
    // Four divs arranged around a gap have four edges to keep aligned, and they
    // drift by a pixel the moment the target moves, which here is every frame.
    expect(css).toMatch(/\.tour__spot \{[\s\S]*?0 0 0 9999px/);
  });
});
