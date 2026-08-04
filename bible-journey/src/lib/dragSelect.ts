import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/** How long a finger must rest before a drag starts selecting rather than scrolling. */
const HOLD_MS = 180;
/** Movement over this many pixels before the hold elapses is taken as a scroll. */
const SLOP = 8;

type Drag = {
  /** Where the press went down. The range always runs from here to the pointer. */
  anchor: number;
  /** Dragging off an unselected chapter adds; off a selected one takes away. */
  adding: boolean;
  /** The selection as it was before this drag, so every move recomputes cleanly. */
  base: ReadonlySet<number>;
  /** Live once we own the gesture. A touch has to earn this; a mouse never waits. */
  armed: boolean;
  startX: number;
  startY: number;
};

function chapterUnder(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y);
  const button = el instanceof Element ? el.closest('[data-chapter]') : null;
  if (!button) return null;
  const n = Number(button.getAttribute('data-chapter'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Drag across chapters to select them, the way dragging across text works.
 *
 * The range runs from where the drag started to wherever the pointer is, in
 * chapter order, so dragging down a row takes everything in between rather than
 * only the squares the finger crossed. Recomputed from a snapshot on every move
 * rather than accumulated, so dragging back over your own path undoes it.
 *
 * On touch the gesture has to be earned with a short hold, exactly as selecting
 * text does on a phone. A quick swipe over the grid therefore still scrolls the
 * page, which matters because a long book's grid is taller than the screen and
 * would otherwise be a region you could never scroll through. Scrolling is
 * suppressed by cancelling touchmove once the hold has elapsed, rather than by
 * `touch-action: none`, because that decision has to be made per gesture and
 * CSS makes it once and for all.
 */
export function useChapterDrag(
  picked: ReadonlySet<number>,
  setPicked: (next: ReadonlySet<number>) => void,
) {
  const drag = useRef<Drag | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const holdTimer = useRef(0);
  const [selecting, setSelecting] = useState(false);
  /*
   * A pointer press is followed by a click, and both would toggle. The click has
   * to be skipped when a pointer already dealt with it, without skipping the
   * click a keyboard sends. A flag alone is not enough: a drag that ends off a
   * button never produces a click, so the flag would still be set when the next
   * keyboard press arrived and would swallow it. Time is the reliable signal.
   */
  const lastPointerAt = useRef(0);

  const applyTo = useCallback(
    (to: number) => {
      const current = drag.current;
      if (!current) return;
      const [lo, hi] = current.anchor <= to ? [current.anchor, to] : [to, current.anchor];
      const next = new Set(current.base);
      for (let c = lo; c <= hi; c++) {
        if (current.adding) next.add(c);
        else next.delete(c);
      }
      setPicked(next);
    },
    [setPicked],
  );

  const stop = useCallback(() => {
    window.clearTimeout(holdTimer.current);
    drag.current = null;
    setSelecting(false);
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const chapter = chapterUnder(e.clientX, e.clientY);
      if (chapter === null) return;
      lastPointerAt.current = Date.now();

      // A mouse or pen cannot scroll the page by dragging, so it owns the
      // gesture at once. A finger has to hold still first.
      const armed = e.pointerType !== 'touch';
      drag.current = {
        anchor: chapter,
        adding: !picked.has(chapter),
        base: picked,
        armed,
        startX: e.clientX,
        startY: e.clientY,
      };
      e.currentTarget.setPointerCapture?.(e.pointerId);

      if (armed) {
        setSelecting(true);
        applyTo(chapter);
        return;
      }
      window.clearTimeout(holdTimer.current);
      holdTimer.current = window.setTimeout(() => {
        if (!drag.current) return;
        drag.current.armed = true;
        setSelecting(true);
        applyTo(drag.current.anchor);
      }, HOLD_MS);
    },
    [picked, applyTo],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const current = drag.current;
      if (!current) return;

      if (!current.armed) {
        // Moved before the hold elapsed, so this was a scroll all along.
        const far =
          Math.abs(e.clientX - current.startX) > SLOP ||
          Math.abs(e.clientY - current.startY) > SLOP;
        if (far) stop();
        return;
      }

      const chapter = chapterUnder(e.clientX, e.clientY);
      if (chapter !== null) applyTo(chapter);
    },
    [applyTo, stop],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const current = drag.current;
      // A tap that never armed still has to select the chapter it landed on.
      if (current && !current.armed) applyTo(current.anchor);
      void e;
      lastPointerAt.current = Date.now();
      stop();
    },
    [applyTo, stop],
  );

  /*
   * Cancelling touchmove is what stops the page scrolling, and it only works
   * from a listener that is not passive, which React's own handlers are.
   */
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const onTouchMove = (e: TouchEvent) => {
      if (drag.current?.armed) e.preventDefault();
    };
    grid.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => grid.removeEventListener('touchmove', onTouchMove);
  }, []);

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  /**
   * True when a click should be ignored because a pointer already dealt with it.
   * A keyboard click reports no detail and follows no pointer.
   */
  const claimClick = useCallback((e: { detail: number }) => {
    if (e.detail !== 0) return true;
    return Date.now() - lastPointerAt.current < 500;
  }, []);

  return {
    /** Set while the grid owns the gesture, so it can show that it is selecting. */
    selecting,
    gridProps: {
      ref: gridRef,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: stop,
      onLostPointerCapture: stop,
    },
    claimClick,
  };
}
