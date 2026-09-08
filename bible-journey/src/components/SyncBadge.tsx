import { useCloud } from '../state/useCloud';

const LABELS: Record<string, string> = {
  loading: 'Checking',
  'signed-out': 'Local only',
  syncing: 'Syncing',
  synced: 'Synced',
  error: 'Sync issue',
};

/**
 * The header says nothing while sync is working, and speaks up when it is not.
 *
 * It used to sit there permanently, which on a phone is a dot beside the menu
 * saying "everything is fine" on every screen of every session. A status that
 * never changes is one nobody reads, and it was the only ornament in a header
 * that is otherwise a mark and a menu.
 *
 * **It still appears on a failure**, because this is the only ambient sign that
 * a journal is not reaching the account: `describeSyncError` explains it inside
 * Settings, and without this nothing anywhere else would say to go and look.
 */
export function SyncBadge({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { status } = useCloud();
  if (status !== 'error') return null;

  return (
    <button
      type="button"
      className="syncBadge syncBadge--error"
      onClick={onOpenSettings}
      // Settings holds the account panel, which is where a failure explains
      // itself and offers a retry.
      title="Sync problem, open settings"
    >
      <span className={`syncDot syncDot--${status}`} />
      <span className="syncBadge__label">{LABELS[status]}</span>
    </button>
  );
}
