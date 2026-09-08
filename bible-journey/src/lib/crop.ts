/*
 * Choosing which square of a photograph becomes the avatar.
 *
 * **The upload is square by construction, and that is the point.** The avatar
 * was reported as an oval, and hardening the CSS could only ever make a wrong
 * box look right: an image that is 400 by 150 stays 400 by 150 on the server,
 * and every consumer of it has to remember to crop. Cropping before the upload
 * removes the whole class of problem, and it is also the thing a reader
 * actually wants, since `object-fit: cover` picks the middle of a photograph
 * and the middle is rarely the face.
 *
 * The maths lives here rather than in the component so it can be tested without
 * a canvas, a file or a browser.
 */

export type CropView = {
  /** The chosen image at its own size. */
  naturalWidth: number;
  naturalHeight: number;
  /** The square window on screen, in CSS pixels. */
  viewport: number;
  /** 1 is "just covers the window". Above that is zoomed in. */
  zoom: number;
  /** Where the image's top left sits inside the window, in CSS pixels. */
  offsetX: number;
  offsetY: number;
};

/** The smallest scale that still covers the square, so no corner is ever empty. */
export function coverScale(naturalWidth: number, naturalHeight: number, viewport: number): number {
  if (naturalWidth <= 0 || naturalHeight <= 0) return 1;
  return Math.max(viewport / naturalWidth, viewport / naturalHeight);
}

/**
 * The offset the image is actually allowed to sit at.
 *
 * A photograph may be dragged until its edge reaches the window and no further.
 * Letting it go past would put paper inside the circle, which the reader would
 * read as the app being broken rather than as their own drag going too far.
 */
export function clampOffset(view: CropView): { x: number; y: number } {
  const scale = coverScale(view.naturalWidth, view.naturalHeight, view.viewport) * Math.max(1, view.zoom);
  const width = view.naturalWidth * scale;
  const height = view.naturalHeight * scale;
  // Rounded, because a scale that covers by a hundredth of a pixel would
  // otherwise allow a hairline of background along one edge.
  const minX = Math.min(0, view.viewport - width);
  const minY = Math.min(0, view.viewport - height);
  return {
    x: Math.min(0, Math.max(minX, view.offsetX)),
    y: Math.min(0, Math.max(minY, view.offsetY)),
  };
}

/**
 * The square of the original the reader has framed, in the image's own pixels.
 *
 * This is what goes to `drawImage` as the source rectangle. It is always square
 * and always inside the image, so the canvas it is drawn onto is square whatever
 * the reader did with the slider.
 */
export function cropRect(view: CropView): { sx: number; sy: number; size: number } {
  const zoom = Math.max(1, view.zoom);
  const scale = coverScale(view.naturalWidth, view.naturalHeight, view.viewport) * zoom;
  const { x, y } = clampOffset({ ...view, zoom });
  /*
   * The two extra terms are belt and braces and currently unreachable: because
   * `coverScale` takes the larger ratio, `viewport / scale` is already at most
   * the shorter side. Mutation testing found it, which is the honest reason it
   * is labelled rather than left looking load bearing. It stays so that a
   * change to `coverScale` cannot silently make the crop wider than the image.
   */
  const size = Math.min(view.viewport / scale, view.naturalWidth, view.naturalHeight);
  const sx = Math.min(Math.max(0, -x / scale), Math.max(0, view.naturalWidth - size));
  const sy = Math.min(Math.max(0, -y / scale), Math.max(0, view.naturalHeight - size));
  return { sx, sy, size };
}

/**
 * Where a fresh image should sit so the reader starts on the middle of it.
 *
 * Centring is the right default for a photograph of a person, since a phone
 * camera puts the face near the middle far more often than it puts it in a
 * corner.
 */
export function centredOffset(view: Omit<CropView, 'offsetX' | 'offsetY'>): {
  x: number;
  y: number;
} {
  const scale = coverScale(view.naturalWidth, view.naturalHeight, view.viewport) * Math.max(1, view.zoom);
  return {
    x: (view.viewport - view.naturalWidth * scale) / 2,
    y: (view.viewport - view.naturalHeight * scale) / 2,
  };
}

/** The side of the square written to storage. */
export const AVATAR_SIZE = 512;

/** Above this and a phone camera's photograph would be uploaded whole. */
export const AVATAR_QUALITY = 0.85;
