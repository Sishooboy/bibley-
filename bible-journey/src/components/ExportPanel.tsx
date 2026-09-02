import { useCallback, useMemo, useState } from 'react';
import { buildExport, countJournal, exportFilename } from '../lib/exportJournal';
import { formatNumber, plural } from '../lib/format';
import { useStore } from '../state/useStore';

type Props = { reveal?: (node: Element | null) => void };

/**
 * A copy of the journal, on your device.
 *
 * The server row is the only copy that exists. That is fine right up until
 * something goes wrong with it, and there is no undo for a sync that writes the
 * wrong thing. This is the undo.
 *
 * Download and not the share sheet: a share sheet offers Messages as readily as
 * Files, and this file has every note and highlight you have ever written in it.
 */
export function ExportPanel({ reveal }: Props) {
  const { data } = useStore();
  const [saved, setSaved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const counts = useMemo(() => countJournal(data), [data]);

  const save = useCallback(() => {
    setFailed(false);
    try {
      const name = exportFilename();
      const text = JSON.stringify(buildExport(data), null, 2);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      // Revoked on a timer rather than immediately: the download reads the blob
      // after the click returns, and revoking under it gives an empty file.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setSaved(name);
    } catch (err) {
      console.error('Could not write the export', err);
      setFailed(true);
    }
  }, [data]);

  return (
    <section ref={reveal} className="card reveal">
      <div className="card__head">
        <div>
          <h3 className="card__title">Your own copy</h3>
          <p className="card__note">
            Everything in your journal as one file, saved to this device. Your account is the only
            copy there is, so this is the one that does not depend on it.
          </p>
        </div>
      </div>

      {/* Shown before the button, so an empty export cannot pass unnoticed. */}
      <dl className="exportCounts">
        <div>
          <dt>Chapters</dt>
          <dd>{formatNumber(counts.chapters)}</dd>
        </div>
        <div>
          <dt>Books touched</dt>
          <dd>{counts.books}</dd>
        </div>
        <div>
          <dt>Highlights</dt>
          <dd>{counts.highlights}</dd>
        </div>
        <div>
          <dt>Notes</dt>
          <dd>{counts.notes}</dd>
        </div>
      </dl>

      <div className="card__actions">
        <button type="button" className="btn btn--sm btn--primary" onClick={save}>
          Download my journal
        </button>
      </div>

      {saved && !failed && (
        <p className="notice notice--gold">
          Saved <b>{saved}</b>, with {plural(counts.chapters, 'chapter')},{' '}
          {plural(counts.highlights, 'highlight')} and {plural(counts.notes, 'note')} in it.
        </p>
      )}

      {failed && (
        <p className="notice notice--error">
          This browser would not write the file. Try again, or from a desktop browser.
        </p>
      )}
    </section>
  );
}
