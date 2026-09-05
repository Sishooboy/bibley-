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
    expect(block.slice(0, 300)).toContain('.tour__spot');
    expect(block.slice(0, 300)).toContain('animation: none');
  });

  it('cuts one hole with one box, so nothing can drift out of step', () => {
    // Four divs arranged around a gap have four edges to keep aligned, and they
    // drift by a pixel the moment the target moves, which here is every frame.
    expect(css).toMatch(/\.tour__spot \{[\s\S]*?0 0 0 9999px/);
  });
});
