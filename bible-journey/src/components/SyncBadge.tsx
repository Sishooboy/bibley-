import { useCloud } from '../state/useCloud';

const LABELS: Record<string, string> = {
  'signed-out': 'Local only',
  syncing: 'Syncing',
  synced: 'Synced',
  error: 'Sync issue',
};

/** Quiet status in the header: the answer to "is my streak safe right now". */
export function SyncBadge({ onOpenStats }: { onOpenStats: () => void }) {
  const { status } = useCloud();
  if (status === 'off') return null;

  return (
    <button type="button" className="syncBadge" onClick={onOpenStats} title="Sync settings">
      <span className={`syncDot syncDot--${status}`} />
      <span className="syncBadge__label">{LABELS[status]}</span>
    </button>
  );
}
