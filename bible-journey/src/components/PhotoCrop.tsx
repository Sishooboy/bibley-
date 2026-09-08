import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AVATAR_QUALITY,
  AVATAR_SIZE,
  centredOffset,
  clampOffset,
  coverScale,
  cropRect,
} from '../lib/crop';

/** The square window on screen. Big enough to judge a face, small enough for a phone. */
const VIEWPORT = 260;

/**
 * Choose which square of a photograph becomes the avatar.
 *
 * **The upload is square by construction.** Hardening the CSS could only make a
 * wrong box look right; an image that is 400 by 150 stays that shape on the
 * server and every consumer has to remember to crop it. Cutting the square
 * before it is uploaded removes the whole class of problem, and it is what a
 * reader wants anyway, since `object-fit: cover` takes the middle of a
 * photograph and the middle is rarely the face.
 *
 * Drag to move, the slider to zoom, and the maths is in `crop.ts` so it can be
 * tested without a canvas.
 */
export function PhotoCrop({
  file,
  onCancel,
  onCropped,
}: {
  file: File;
  onCancel: () => void;
  onCropped: (square: File) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const made = URL.createObjectURL(file);
    setUrl(made);
    // Revoked on the way out, or every photograph a reader tried stays in
    // memory for the life of the tab.
    return () => URL.revokeObjectURL(made);
  }, [file]);

  const view = natural
    ? { naturalWidth: natural.w, naturalHeight: natural.h, viewport: VIEWPORT, zoom }
    : null;

  const onLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });
    setOffset(centredOffset({ naturalWidth: w, naturalHeight: h, viewport: VIEWPORT, zoom: 1 }));
  }, []);

  /* Re-clamp on every zoom, or zooming out leaves the image parked off its edge. */
  useEffect(() => {
    if (!view) return;
    setOffset((o) => clampOffset({ ...view, offsetX: o.x, offsetY: o.y }));
  }, [zoom, natural]); // eslint-disable-line react-hooks/exhaustive-deps

  const scale = view ? coverScale(view.naturalWidth, view.naturalHeight, VIEWPORT) * zoom : 1;

  return (
    <div className="crop">
      <p className="sendVerse__label">Drag to move, slide to zoom</p>

      {/*
        One square window with the photograph moved behind it. `touch-action:
        none` is what lets a drag be a drag: without it the browser claims the
        gesture as a scroll and the photograph never moves on a phone.
      */}
      <div
        className="crop__window"
        style={{ width: VIEWPORT, height: VIEWPORT }}
        onPointerDown={(e) => {
          if (!view) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !view) return;
          setOffset(
            clampOffset({
              ...view,
              offsetX: d.ox + (e.clientX - d.x),
              offsetY: d.oy + (e.clientY - d.y),
            }),
          );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {url && (
          <img
            className="crop__img"
            src={url}
            alt=""
            draggable={false}
            onLoad={onLoad}
            style={
              natural
                ? {
                    width: natural.w * scale,
                    height: natural.h * scale,
                    transform: `translate(${offset.x}px, ${offset.y}px)`,
                  }
                : { visibility: 'hidden' }
            }
          />
        )}
        {/* The circle is the shape it will end up, drawn over the square so the
            reader frames what they will actually see rather than a rectangle. */}
        <div className="crop__ring" aria-hidden="true" />
      </div>

      <label className="sr-only" htmlFor="crop-zoom">
        Zoom
      </label>
      <input
        id="crop-zoom"
        className="crop__zoom"
        type="range"
        min={1}
        max={4}
        step={0.01}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
      />

      <div className="hlSheet__actions">
        <button
          type="button"
          className="btn btn--sm btn--primary"
          disabled={!natural || busy}
          onClick={async () => {
            if (!view || !url) return;
            setBusy(true);
            try {
              onCropped(await toSquare(url, cropRect({ ...view, offsetX: offset.x, offsetY: offset.y }), file.name));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Cutting…' : 'Use this'}
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Draw the chosen square onto a canvas and hand back a file.
 *
 * JPEG rather than PNG for the same reason the share card is: a photograph is
 * an order of magnitude smaller as a JPEG and this one is going over a phone
 * connection. 512 is enough for a 56px circle at any pixel density anybody
 * owns, and it caps what a 12 megapixel camera would otherwise upload.
 */
function toSquare(
  url: string,
  rect: { sx: number; sy: number; size: number },
  name: string,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('no canvas'));
        return;
      }
      ctx.drawImage(img, rect.sx, rect.sy, rect.size, rect.size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('could not encode'));
            return;
          }
          resolve(
            new File([blob], `${name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' }),
          );
        },
        'image/jpeg',
        AVATAR_QUALITY,
      );
    };
    img.onerror = () => reject(new Error('could not read that image'));
    img.src = url;
  });
}
