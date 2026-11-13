import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_KEY, applyTheme, loadTheme, saveTheme } from './theme';

const css = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8');
const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
// Comments explain rules and quote selectors, so they would only confuse a scan.
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The custom properties and `color-scheme` set in a block with no nesting. */
function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of body.split(';')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    out.set(part.slice(0, at).trim(), part.slice(at + 1).trim().replace(/\s+/g, ' '));
  }
  return out;
}

/** The body of the first `{ }` after `marker`, which must exist. */
function blockAfter(marker: string, from = 0): string {
  const at = bare.indexOf(marker, from);
  expect(at, `${marker} is missing from app.css`).toBeGreaterThanOrEqual(0);
  const open = bare.indexOf('{', at + marker.length - 1);
  return bare.slice(open + 1, bare.indexOf('}', open));
}

const media = bare.indexOf('@media (prefers-color-scheme: dark)');
const bySystem = declarations(blockAfter(":root:not([data-theme='light']) {", media));
const byChoice = declarations(blockAfter(":root[data-theme='dark'] {"));

/** Every token any plain `:root` block defines, which is to say the day theme. */
const dayTokens = new Set(
  [...bare.matchAll(/^:root\s*\{([^{}]*)\}/gm)].flatMap((m) => [...declarations(m[1]).keys()]),
);

describe('the night set', () => {
  it('is written twice, and both copies agree', () => {
    // CSS cannot join "the system is dark and nobody chose light" with "the
    // reader chose dark" in one selector, so the set is duplicated. A token
    // edited in one copy only would give a night that depends on how you got
    // there.
    expect(bySystem.size).toBeGreaterThan(40);
    expect([...byChoice.entries()]).toEqual([...bySystem.entries()]);
  });

  it('only changes tokens the day theme already defines', () => {
    // A token that exists only at night is undefined by day, and every rule
    // reading it falls back to nothing without a warning.
    const strays = [...bySystem.keys()].filter((k) => k.startsWith('--') && !dayTokens.has(k));
    expect(strays).toEqual([]);
  });

  it('tells the browser, so scrollbars and the date picker follow', () => {
    expect(bySystem.get('color-scheme')).toBe('dark');
  });

  it('leaves the brand tokens alone', () => {
    // The dark surfaces stay as they are by keeping the brand tokens, and every
    // contrast figure in CLAUDE.md names them by value.
    const brand = [...bySystem.keys()].filter((k) =>
      /^--(ink|ink-\d+|cream|red-\d+|yellow|yellow-dim|yellow-soft|hl-gold)$/.test(k),
    );
    expect(brand).toEqual([]);
  });
});

describe('text on paper', () => {
  /*
   * The trap the night theme leaves behind. `color: var(--red-700)` on paper is
   * right by day and 2:1 at night, and nothing fails to say so. These four have
   * no dark ground and no gold ground they can be read on, so as a text colour
   * they can only ever be on paper, where the `--paper-` token is the answer.
   * Ink is the exception that proves it: ink on solid gold is legible in both
   * themes, so it is allowed where the same rule paints the gold.
   */
  const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim().split('\n').pop()!.trim(),
    body: m[2],
  }));
  const keyframeStep = /^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/;

  it('never takes a brand red or a brand ink grey', () => {
    const wrong = rules
      .filter((r) => /(^|;)\s*color:\s*var\(--(red-700|red-800|ink-700|ink-500)\)/.test(r.body))
      .map((r) => r.selector);
    expect(wrong).toEqual([]);
  });

  it('takes ink only where the rule paints the gold behind it', () => {
    const wrong = rules
      .filter((r) => /(^|;)\s*color:\s*var\(--ink\)/.test(r.body))
      .filter((r) => !keyframeStep.test(r.selector))
      .filter((r) => !/background(-color)?:\s*var\(--yellow\)/.test(r.body))
      .map((r) => r.selector);
    expect(wrong).toEqual([]);
  });
});

describe('index.html', () => {
  it('lets the first frame follow the system before the stylesheet loads', () => {
    expect(html).toMatch(/<meta name="color-scheme" content="light dark" \/>/);
  });

  it('applies a stored choice with the same key and attribute as theme.ts', () => {
    // The script runs before the stylesheet paints, so it cannot import the
    // module. If the two drifted, a reader who chose dark would get a cream
    // frame on every launch and nothing would look broken in development.
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
    expect(script).toContain(`localStorage.getItem('${THEME_KEY}')`);
    expect(script).toContain("setAttribute('data-theme', theme)");
    expect(script).toContain("theme === 'light' || theme === 'dark'");
  });

  it('runs that script before the app module', () => {
    expect(html.indexOf('<script>')).toBeGreaterThan(-1);
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
  });
});

describe('the stored choice', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function memoryStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  }

  it('is the system when nothing, or nothing sensible, is stored', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    expect(loadTheme()).toBe('system');
    vi.stubGlobal('localStorage', memoryStorage({ [THEME_KEY]: 'sepia' }));
    expect(loadTheme()).toBe('system');
  });

  it('reads light and dark back', () => {
    vi.stubGlobal('localStorage', memoryStorage({ [THEME_KEY]: 'dark' }));
    expect(loadTheme()).toBe('dark');
    vi.stubGlobal('localStorage', memoryStorage({ [THEME_KEY]: 'light' }));
    expect(loadTheme()).toBe('light');
  });

  it('follows the system when storage is blocked rather than throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadTheme()).toBe('system');
  });

  it('stores the system as nothing at all', () => {
    // "System" is the absence of a choice, and the stylesheet already answers
    // it on its own through the media query.
    const store = memoryStorage({ [THEME_KEY]: 'dark' });
    vi.stubGlobal('localStorage', store);
    saveTheme('system');
    expect(store.data.has(THEME_KEY)).toBe(false);
    saveTheme('light');
    expect(store.data.get(THEME_KEY)).toBe('light');
  });
});

describe('applyTheme', () => {
  function fakeDocument() {
    const attrs = new Map<string, string>();
    const meta = { content: 'light dark', setAttribute(name: string, value: string) {
      if (name === 'content') meta.content = value;
    } };
    const doc = {
      documentElement: {
        setAttribute: (k: string, v: string) => void attrs.set(k, v),
        removeAttribute: (k: string) => void attrs.delete(k),
      },
      querySelector: () => meta,
    } as unknown as Document;
    return { attrs, meta, doc };
  }

  it('marks an explicit choice so it overrules the media query', () => {
    const { attrs, meta, doc } = fakeDocument();
    applyTheme('dark', doc);
    expect(attrs.get('data-theme')).toBe('dark');
    expect(meta.content).toBe('dark');
  });

  it('removes the mark for the system, so the media query decides again', () => {
    const { attrs, meta, doc } = fakeDocument();
    applyTheme('light', doc);
    applyTheme('system', doc);
    expect(attrs.has('data-theme')).toBe(false);
    expect(meta.content).toBe('light dark');
  });
});
