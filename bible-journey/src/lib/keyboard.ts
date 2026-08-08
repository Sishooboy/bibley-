import { useEffect, useState } from 'react';

/**
 * How many pixels of the screen the on-screen keyboard is covering.
 *
 * A `position: fixed` element is laid out against the layout viewport, and the
 * layout viewport does not shrink when the keyboard opens. So a sheet pinned to
 * the bottom of the screen ends up underneath the keyboard, and the browser's
 * only answer is to scroll the page around trying to reveal the field, which is
 * how you end up typing into something you cannot see. `visualViewport` is the
 * one thing that knows where the visible area actually ends.
 *
 * `offsetTop` matters as much as `height`: when the browser has already scrolled
 * the visual viewport up to chase the field, the keyboard is not simply the
 * difference between the two heights.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const measure = () => {
      const covered = window.innerHeight - (vv.height + vv.offsetTop);
      /*
       * Under a hundred pixels is not a keyboard, it is a URL bar collapsing as
       * you scroll. Reacting to that would make the sheet twitch its way up and
       * down the screen while you are only reading.
       */
      setInset(covered > 100 ? Math.round(covered) : 0);
    };

    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
    };
  }, []);

  return inset;
}
