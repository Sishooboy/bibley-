import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

type Drag = {
  /** Where the finger went down. The range always runs from here to the pointer. */
  anchor: number;
  /** Dragging off an unselected chapter adds; off a selected one takes away. */
  adding: boolean;
  /** The selection as it was before this drag, so every move recomputes cleanly. */
  base: ReadonlySet<number>;
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
 * only the squares the finger physically crossed. That is what makes a diagonal
 * drag fill whole lines instead of leaving gaps.
 *
 * Recomputed from a snapshot on every move rather than accumulated, so dragging
 * back over your own path undoes it instead of leaving a smear.
 */
export function useChapterDrag(
  picked: ReadonlySet<number>,
  setPicked: (next: ReadonlySet<number>) => void,
) {
  const drag = useRef<Drag | null>(null);
  /*
   * A pointer press is followed by a click. Both would toggle, cancelling each
   * other out, so the click is skipped whenever a pointer already handled it.
   * A keyboard press fires a click with no pointer before it, and still works.
   */
  const handledByPointer = useRef(false);

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

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const chapter = chapterUnder(e.clientX, e.clientY);
      if (chapter === null) return;
      handledByPointer.current = true;
      drag.current = { anchor: chapter, adding: !picked.has(chapter), base: picked };
      // Capture keeps the moves coming even if the finger leaves the grid.
      e.currentTarget.setPointerCapture?.(e.pointerId);
      applyTo(chapter);
    },
    [picked, applyTo],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!drag.current) return;
      const chapter = chapterUnder(e.clientX, e.clientY);
      if (chapter !== null) applyTo(chapter);
    },
    [applyTo],
  );

  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  /** True when a click should be ignored because a pointer already dealt with it. */
  const claimClick = useCallback(() => {
    if (!handledByPointer.current) return false;
    handledByPointer.current = false;
    return true;
  }, []);

  return {
    gridProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onLostPointerCapture: onPointerUp,
    },
    claimClick,
  };
}
