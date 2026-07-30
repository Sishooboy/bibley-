import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDay, relativeDay } from '../lib/dates';
import { plural } from '../lib/format';
import {
  backupInfo,
  exportFilename,
  isPersisted,
  normalize,
  requestPersistence,
  type AppData,
} from '../lib/storage';
import { useStore } from '../state/useStore';

type Status = { tone: 'ok' | 'warn' | 'error'; text: string } | null;

function download(data: AppData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFilename();
  link.click();
  URL.revokeObjectURL(url);
}

export function BackupPanel() {
  const { data, load, importData, derived } = useStore();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void isPersisted().then(setPersisted);
  }, []);

  const chapters = derived.overall.planRead;
  // Re-read on every data change so the panel reflects what is actually stored.
  const backup = useMemo(backupInfo, [data]);

  async function handleFile(file: File) {
    try {
      const parsed = normalize(JSON.parse(await file.text()));
      if (!parsed) {
        setStatus({ tone: 'error', text: 'That file is not a Bibley backup.' });
        return;
      }
      const count = Object.values(parsed.read).filter(Boolean).length;
      importData(parsed);
      setStatus({
        tone: 'ok',
        text: `Restored ${plural(count, 'logged chapter')} and ${plural(parsed.notes.length, 'note')}. Use Undo if that was the wrong file.`,
      });
    } catch {
      setStatus({ tone: 'error', text: 'Could not read that file.' });
    }
  }

  return (
    <section className="chartBlock backup">
      <div className="chartBlock__head">
        <div>
          <h3>Backup and restore</h3>
          <p className="chartBlock__note">
            Your journal lives in this browser's storage. Keep a copy somewhere else.
          </p>
        </div>
      </div>

      <dl className="backup__facts">
        <div>
          <dt>Journal started</dt>
          <dd>{formatDay(data.startedAt)}</dd>
        </div>
        <div>
          <dt>Currently holding</dt>
          <dd>
            {plural(chapters, 'chapter')}, {plural(data.notes.length, 'note')}
          </dd>
        </div>
        <div>
          <dt>Daily safety copy</dt>
          <dd>
            {!backup.exists
              ? 'not yet taken'
              : backup.day
                ? `${relativeDay(backup.day)}, ${plural(backup.chapters, 'chapter')}`
                : `held, ${plural(backup.chapters, 'chapter')}`}
          </dd>
        </div>
        <div>
          <dt>Eviction protection</dt>
          <dd>
            {persisted === null
              ? 'checking…'
              : persisted
                ? 'granted by the browser'
                : 'not granted yet'}
          </dd>
        </div>
      </dl>

      {load.source === 'backup' && (
        <p className="backup__alert">
          Heads up: the main record could not be read this session, so your journal was restored
          from the daily safety copy. Anything logged after that copy was taken may be missing.
        </p>
      )}

      <div className="backup__actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={() => download(data)}>
          Export backup file
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => fileRef.current?.click()}
        >
          Restore from file
        </button>
        {persisted === false && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={async () => {
              const granted = await requestPersistence();
              setPersisted(granted);
              setStatus(
                granted
                  ? { tone: 'ok', text: 'The browser will no longer evict this data automatically.' }
                  : {
                      tone: 'warn',
                      text: 'The browser declined. Adding the app to your home screen usually earns it.',
                    },
              );
            }}
          >
            Ask browser to protect it
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {status && <p className={`backup__status backup__status--${status.tone}`}>{status.text}</p>}
    </section>
  );
}
