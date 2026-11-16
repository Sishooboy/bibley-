import { useEffect } from 'react';
import { formatBytes, plural } from '../lib/format';
import {
  coverage,
  refreshOffline,
  saveForOffline,
  stopSaving,
  useOffline,
  type Coverage,
} from '../lib/offline';
import { TRANSLATIONS, translationById, useTranslation, type TranslationId } from '../lib/translations';
import { ProgressBar } from './ProgressBar';
import { Check, Download } from './icons';

type Props = { reveal?: (node: Element | null) => void };

/**
 * The whole Bible, kept on this device.
 *
 * The translation being read comes first, and the other is offered underneath
 * as a choice of its own rather than folded into one button: nearly ten
 * megabytes for both is a lot to spend on a phone for a translation somebody
 * may never open. Device-local like Appearance, because what a phone keeps is
 * a fact about the phone.
 */
export function OfflinePanel({ reveal }: Props) {
  const reading = useTranslation();
  const { support, have, job } = useOffline();

  /*
   * Read again whenever the screen comes back into view, since a browser can
   * clear its storage while the app is in the background, and a count that
   * said "all 73" over an emptied cache would be the one lie this card exists
   * not to tell.
   */
  useEffect(() => {
    void refreshOffline();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshOffline();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const order: TranslationId[] = [
    reading,
    ...TRANSLATIONS.map((t) => t.id).filter((id) => id !== reading),
  ];
  const running = job !== null && job.outcome === null;
  const finished = job?.outcome ? job : null;
  const finishedCoverage = finished && have ? coverage(finished.translation, have) : null;

  return (
    <section ref={reveal} className="card reveal">
      <div className="card__head">
        <div>
          <h3 className="card__title">Reading offline</h3>
          <p className="card__note">
            Every book you open stays on this device. Save the rest ahead of time and the whole
            Bible opens with no connection, on a plane or out of signal.
          </p>
        </div>
      </div>

      {support === 'dev' ? (
        <p className="notice notice--warn">
          This is the development server, which runs without the service worker that keeps books,
          so there is nothing here to save into. Build the app and run it with npm run preview to
          try this.
        </p>
      ) : support === 'none' ? (
        <p className="notice notice--warn">
          This browser is not letting Bibley keep books for offline reading, so each one is fetched
          when you open it.
        </p>
      ) : (
        order.map((id, i) => (
          <OfflineRow
            key={id}
            translation={id}
            first={i === 0}
            coverage={have ? coverage(id, have) : null}
            saving={running && job.translation === id}
            stopping={running && job.translation === id && job.stopping === true}
            busy={running}
          />
        ))
      )}

      {/* Only while the cache still agrees, so this can never say "the whole
          Bible" over a count that has since gone down. */}
      {finished?.outcome === 'done' && finishedCoverage?.missing.length === 0 && (
        <p className="notice notice--gold" role="status">
          The whole {translationById(finished.translation).name} is on this device and opens with
          no connection. If the browser ever clears it to make room, the count above will show it.
        </p>
      )}

      {finished?.outcome === 'failed' && (
        <p className="notice notice--warn" role="status">
          Saving stopped before the end.{' '}
          {typeof navigator !== 'undefined' && navigator.onLine === false
            ? 'The connection dropped.'
            : 'The connection may have dropped, or this device may be short of space.'}{' '}
          Everything saved so far stays saved, so trying again carries on from there.
        </p>
      )}
    </section>
  );
}

type RowProps = {
  translation: TranslationId;
  /** The translation being read, which gets the red button. */
  first: boolean;
  /** Null until the cache has been read. */
  coverage: Coverage | null;
  saving: boolean;
  /** Stop was pressed and the files in flight are still landing. */
  stopping: boolean;
  /** Some save is running, this one or the other. */
  busy: boolean;
};

function OfflineRow({ translation, first, coverage: c, saving, stopping, busy }: RowProps) {
  const { name } = translationById(translation);
  const complete = c !== null && c.missing.length === 0;
  const left = c ? c.total - c.books : 0;

  const hint =
    c === null
      ? 'Checking this device…'
      : saving
        ? `Saving, ${c.books} of ${c.total} books on this device`
        : complete
          ? `All ${c.total} books, ready with no connection`
          : c.books > 0
            ? `${c.books} of ${c.total} books on this device`
            : first
              ? 'Only the books you open are kept'
              : 'Saved separately, if you read it too';

  /*
   * The label names what the press does and what it costs, so the size is read
   * before the tap rather than discovered after it.
   */
  const size = c ? formatBytes(c.missingBytes) : '';
  const label =
    left === 0
      ? `Save the headings and notes, ${size}`
      : c && c.books === 0
        ? `Save all ${plural(left, 'book')}, ${size}`
        : left === 1
          ? `Save the last book, ${size}`
          : `Save the other ${left}, ${size}`;

  return (
    <div className="settingRow offlineRow">
      <span className="settingRow__main">
        <span className="settingRow__label">{name}</span>
        {/* Not a live region: it changes once a book, and seventy-three
            announcements is noise. The bar carries the value, and the notice
            under the rows announces the end. */}
        <span className="settingRow__hint">{hint}</span>
        {c && (c.books > 0 || saving) && (
          <ProgressBar
            value={c.books}
            max={c.total}
            label={`${name}, books saved on this device`}
            thin
            className="offlineRow__bar"
          />
        )}
      </span>

      {saving ? (
        <button type="button" className="btn btn--sm" disabled={stopping} onClick={stopSaving}>
          {stopping ? 'Stopping…' : 'Stop'}
        </button>
      ) : complete ? (
        <span className="pill pill--on">
          <Check size={12} />
          Saved
        </span>
      ) : (
        <button
          type="button"
          className={`btn btn--sm${first ? ' btn--primary' : ''}`}
          disabled={c === null || busy}
          onClick={() => void saveForOffline(translation)}
        >
          <Download size={14} className="btn__icon" />
          {c === null ? 'Save' : label}
        </button>
      )}
    </div>
  );
}
