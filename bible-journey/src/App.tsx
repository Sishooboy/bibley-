import { useState } from 'react';
import { SyncBadge } from './components/SyncBadge';
import { UndoBar } from './components/UndoBar';
import { CloudProvider } from './state/cloud';
import { StoreProvider } from './state/store';
import { JourneyView } from './views/JourneyView';
import { NotesView } from './views/NotesView';
import { StatsView } from './views/StatsView';

const VIEWS = [
  { id: 'journey', label: 'Journey' },
  { id: 'notes', label: 'Notes' },
  { id: 'stats', label: 'Stats' },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

function Shell() {
  const [view, setView] = useState<ViewId>('journey');

  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar__inner">
          <div className="wordmark">
            <span className="wordmark__mark" aria-hidden="true" />
            <span>Bibley</span>
            <span className="wordmark__sub">reading journey</span>
          </div>

          <div className="topbar__right">
            <SyncBadge onOpenStats={() => setView('stats')} />
            <nav className="nav" aria-label="Views">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="nav__item"
                  aria-current={view === v.id ? 'page' : undefined}
                  onClick={() => setView(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="view">
        {view === 'journey' && <JourneyView />}
        {view === 'notes' && <NotesView />}
        {view === 'stats' && <StatsView />}
      </main>

      <UndoBar />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <CloudProvider>
        <Shell />
      </CloudProvider>
    </StoreProvider>
  );
}
