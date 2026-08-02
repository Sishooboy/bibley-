import { useCloud } from '../state/useCloud';

const LABELS: Record<string, string> = {
  loading: 'Checking',
  'signed-out': 'Local only',
  syncing: 'Syncing',
  synced: 'Synced',
  error: 'Sync issue',
};

/** Quiet status in the header: the answer to "is my streak safe right now". */
export function SyncBadge({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { status } = useCloud();
  if (status === 'off') return null;

  return (
    <button
      type="button"
      className={`syncBadge${status === 'error' ? ' syncBadge--error' : ''}`}
      onClick={onOpenSettings}
      // Settings holds the account panel, which is where a failure explains
      // itself and offers a retry.
      title={status === 'error' ? 'Sync problem, open settings' : 'Sync settings'}
    >
      <span className={`syncDot syncDot--${status}`} />
      <span className="syncBadge__label">{LABELS[status]}</span>
    </button>
  );
}
