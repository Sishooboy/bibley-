import { describe, expect, it } from 'vitest';
import { centredOffset, clampOffset, coverScale, cropRect, type CropView } from './crop';

/** A wide photograph, which is the shape that made the avatar an oval. */
const wide = (over: Partial<CropView> = {}): CropView => ({
  naturalWidth: 400,
  naturalHeight: 150,
  viewport: 300,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  ...over,
});

const tall = (over: Partial<CropView> = {}): CropView => ({
  naturalWidth: 150,
  naturalHeight: 400,
  viewport: 300,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  ...over,
});

describe('coverScale never leaves a corner empty', () => {
  it('scales a wide photograph by its short side', () => {
    // 300/150 is the larger of the two, so the height is what has to reach.
    expect(coverScale(400, 150, 300)).toBe(2);
  });

  it('scales a tall photograph by its short side too', () => {
    expect(coverScale(150, 400, 300)).toBe(2);
  });

  it('enlarges a photograph smaller than the window', () => {
    expect(coverScale(100, 100, 300)).toBe(3);
  });

  it('does not divide by nothing', () => {
    expect(coverScale(0, 0, 300)).toBe(1);
  });
});

describe('the crop is always a square inside the image', () => {
  /*
   * The property the whole file exists for. Whatever the reader does with the
   * slider and the drag, what reaches the canvas is a square, so what reaches
   * storage is a square, so no container downstream can ever be handed
   * something that is not.
   */
  it('is square at every zoom, offset and shape', () => {
    for (const make of [wide, tall]) {
      for (const zoom of [1, 1.4, 2.5, 6]) {
        for (const offsetX of [-900, -200, 0, 200]) {
          for (const offsetY of [-900, -200, 0, 200]) {
            const view = make({ zoom, offsetX, offsetY });
            const { sx, sy, size } = cropRect(view);
            expect(size, `size at zoom ${zoom}`).toBeGreaterThan(0);
            expect(sx).toBeGreaterThanOrEqual(0);
            expect(sy).toBeGreaterThanOrEqual(0);
            expect(sx + size).toBeLessThanOrEqual(view.naturalWidth + 0.0001);
            expect(sy + size).toBeLessThanOrEqual(view.naturalHeight + 0.0001);
          }
        }
      }
    }
  });

  it('takes the whole short side at rest', () => {
    // A 400x150 at cover scale shows a 150x150 square of the original.
    expect(cropRect(wide()).size).toBeCloseTo(150, 5);
    expect(cropRect(tall()).size).toBeCloseTo(150, 5);
  });

  it('takes a smaller square as the reader zooms in', () => {
    expect(cropRect(wide({ zoom: 2 })).size).toBeCloseTo(75, 5);
    expect(cropRect(wide({ zoom: 3 })).size).toBeCloseTo(50, 5);
  });

  it('refuses to zoom out past covering', () => {
    /*
     * The size alone does not prove this, which mutation testing found: the
     * clamp inside `size` absorbs a zoom below 1 and the assertion passed
     * either way. What a sub-1 zoom really changes is where the window lands,
     * so the offset is what has to be checked, and the whole rect is compared
     * rather than one number of it.
     */
    expect(cropRect(wide({ zoom: 0.2 }))).toEqual(cropRect(wide()));
    expect(cropRect(wide({ zoom: 0.5, offsetX: -100 }))).toEqual(
      cropRect(wide({ zoom: 1, offsetX: -100 })),
    );
    // And the offset a sub-1 zoom would have allowed is not the same one.
    expect(cropRect(wide({ zoom: 0.5, offsetX: -100 })).sx).toBeCloseTo(50, 5);
  });

  it('moves along the axis the reader dragged', () => {
    const rest = cropRect(wide());
    const moved = cropRect(wide({ offsetX: -200 }));
    expect(moved.sx).toBeGreaterThan(rest.sx);
    expect(moved.sy).toBe(rest.sy);
  });
});

describe('the image cannot be dragged off its own window', () => {
  it('stops when an edge reaches the window', () => {
    // 400 wide at scale 2 is 800 on screen, so the furthest left is 300 - 800.
    expect(clampOffset(wide({ offsetX: -5000 })).x).toBe(-500);
    expect(clampOffset(wide({ offsetX: 5000 })).x).toBe(0);
  });

  it('pins an axis that exactly fills the window', () => {
    // The short side covers exactly, so there is nowhere to go on it.
    expect(clampOffset(wide({ offsetY: -80 })).y).toBe(0);
    expect(clampOffset(wide({ offsetY: 80 })).y).toBe(0);
  });

  it('never lets a positive offset open a gap', () => {
    for (const view of [wide({ offsetX: 40, offsetY: 40 }), tall({ offsetX: 40, offsetY: 40 })]) {
      const { x, y } = clampOffset(view);
      expect(x).toBeLessThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(0);
    }
  });
});

describe('a fresh photograph starts on its middle', () => {
  it('centres the long axis and pins the short one', () => {
    const { x, y } = centredOffset({ naturalWidth: 400, naturalHeight: 150, viewport: 300, zoom: 1 });
    // 800 wide inside 300 leaves 500 to hide, half either side.
    expect(x).toBeCloseTo(-250, 5);
    expect(y).toBeCloseTo(0, 5);
  });

  it('lands inside what the clamp allows, so nothing jumps on the first drag', () => {
    for (const make of [wide, tall]) {
      for (const zoom of [1, 2, 4]) {
        const base = make({ zoom });
        const centre = centredOffset(base);
        const clamped = clampOffset({ ...base, offsetX: centre.x, offsetY: centre.y });
        expect(clamped.x).toBeCloseTo(centre.x, 5);
        expect(clamped.y).toBeCloseTo(centre.y, 5);
      }
    }
  });
});
