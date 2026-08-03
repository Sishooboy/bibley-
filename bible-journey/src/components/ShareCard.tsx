import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CARD_H,
  CARD_W,
  buildShareStats,
  describeCard,
  drawShareCard,
  readyFonts,
} from '../lib/shareCard';
import { useStore } from '../state/useStore';

const FILENAME = 'bibley.jpg';
const TYPE = 'image/jpeg';

/*
 * JPEG rather than PNG. The card is a full-bleed gradient, which PNG stores
 * appallingly: the same image is 1.4 MB as a PNG and 129 KB here, with no
 * difference anyone can see at this size. It matters because the whole point is
 * sending it to someone.
 */
function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, TYPE, 0.92));
}

/**
 * A card worth sending someone.
 *
 * Drawn straight onto a canvas rather than styled in the DOM and converted
 * afterwards, so what you save is the same pixels you were looking at. The usual
 * DOM-to-image route also loses the fonts, and this card is mostly typography.
 */
export function ShareCard() {
  const { data, derived } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stats = useMemo(
    () => buildShareStats(data, derived.plan, derived.overall, derived.streak, derived.pace),
    [data, derived],
  );

  useEffect(() => {
    let live = true;
    void readyFonts().then(() => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!live || !ctx) return;
      drawShareCard(ctx, stats);
    });
    return () => {
      live = false;
    };
  }, [stats]);

  const save = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    setStatus(null);
    try {
      const blob = await toBlob(canvas);
      if (!blob) throw new Error('no image');

      const file = new File([blob], FILENAME, { type: TYPE });
      // The share sheet is the point of this on a phone. Where there isn't one,
      // a download is the same outcome with one more step.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My Bibley progress' });
        setStatus(null);
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = FILENAME;
      link.click();
      URL.revokeObjectURL(url);
      setStatus('Saved to your downloads.');
    } catch (err) {
      // A cancelled share sheet throws, and is not a failure worth reporting.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Could not save the card', err);
      setStatus('Could not save the image. Screenshotting the card works just as well.');
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <>
      <div className="shareCard">
        <canvas
          ref={canvasRef}
          className="shareCard__canvas"
          width={CARD_W}
          height={CARD_H}
          role="img"
          aria-label={describeCard(stats)}
        />
      </div>

      <div className="card__actions">
        <button type="button" className="btn btn--sm btn--primary" onClick={save} disabled={busy}>
          {busy ? 'Preparing…' : 'Save or share'}
        </button>
      </div>

      {status && <p className="notice notice--gold">{status}</p>}
    </>
  );
}
