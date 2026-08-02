import { useCallback, useEffect, useRef, useState } from 'react';

export function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Registers any number of elements with one shared observer and adds `is-in` as
 * each scrolls into view, once. The stagger itself lives in CSS, driven by the
 * `--i` custom property the caller sets.
 *
 * The safety net matters: `.reveal` starts at opacity 0, so if the observer
 * never fires (a browser quirk, an element that is display:none at mount) the
 * timeout reveals everything rather than leaving a blank page.
 */
export function useReveal() {
  const nodes = useRef(new Set<Element>());
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const show = (el: Element) => el.classList.add('is-in');

    if (reducedMotion() || typeof IntersectionObserver === 'undefined') {
      nodes.current.forEach(show);
      return;
    }

    observer.current = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target);
          obs.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );

    nodes.current.forEach((el) => observer.current?.observe(el));
    const bail = setTimeout(() => nodes.current.forEach(show), 1500);

    return () => {
      clearTimeout(bail);
      observer.current?.disconnect();
      observer.current = null;
    };
  }, []);

  return useCallback((node: Element | null) => {
    if (!node) return;
    nodes.current.add(node);
    observer.current?.observe(node);
  }, []);
}

/**
 * Counts a figure up on first paint. Headline numbers only, and never when the
 * reader has asked for less motion.
 */
export function useCountUp(target: number, ms = 900): number {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0));
  const from = useRef(0);

  useEffect(() => {
    if (reducedMotion()) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const origin = from.current;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      // Ease out cubic: fast off the mark, settles rather than stops.
      const eased = 1 - Math.pow(1 - t, 3);
      const next = origin + (target - origin) * eased;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);

  return value;
}
