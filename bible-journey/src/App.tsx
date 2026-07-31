import { useEffect, useState } from 'react';
import { PlanChooser } from './components/PlanChooser';
import { PREPARING_MS, Preparing } from './components/Preparing';
import { SignInScreen } from './components/SignInScreen';
import { SPLASH_MS, Splash } from './components/Splash';
import { SyncBadge } from './components/SyncBadge';
import { UndoBar } from './components/UndoBar';
import { Menu } from './components/icons';
import type { PlanId } from './data/plans';
import { returnedFromOAuth } from './lib/supabase';
import { CloudProvider } from './state/cloud';
import { useCloud } from './state/useCloud';
import { useStore } from './state/useStore';
import { StoreProvider } from './state/store';
import { JourneyView } from './views/JourneyView';
import { NotesView } from './views/NotesView';
import { SettingsView } from './views/SettingsView';
import { StatsView } from './views/StatsView';

const VIEWS = [
  { id: 'journey', label: 'Journey' },
  { id: 'notes', label: 'Notes' },
  { id: 'stats', label: 'Stats' },
  { id: 'settings', label: 'Settings' },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

function Shell() {
  const [view, setView] = useState<ViewId>('journey');
  const [menuOpen, setMenuOpen] = useState(false);

  // Dismiss the small-screen menu the way a menu should be dismissable.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.topbar__right')) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [menuOpen]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar__inner">
          <div className="wordmark">
            <img
              className="wordmark__mark"
              src="/icon-64.png"
              width={30}
              height={30}
              alt=""
              decoding="async"
            />
            <span>Bibley</span>
            <span className="wordmark__sub">reading journey</span>
          </div>

          <div className="topbar__right">
            <SyncBadge onOpenStats={() => setView('stats')} />

            <button
              type="button"
              className="menuBtn"
              aria-expanded={menuOpen}
              aria-controls="main-nav"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Menu size={18} open={menuOpen} />
            </button>

            <nav
              id="main-nav"
              className={`nav${menuOpen ? ' nav--open' : ''}`}
              aria-label="Views"
            >
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="nav__item"
                  aria-current={view === v.id ? 'page' : undefined}
                  onClick={() => {
                    setView(v.id);
                    setMenuOpen(false);
                  }}
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
        {view === 'settings' && <SettingsView />}
      </main>

      <UndoBar />
    </div>
  );
}

/**
 * The app is behind a sign-in wall whenever a cloud project is configured. If it
 * isn't (a build with no Supabase env vars), gating would lock everyone out of a
 * perfectly working local journal, so it falls through with a visible warning.
 */
function Gate() {
  const { status, email } = useCloud();
  const { data, choosePlan } = useStore();
  /** Set while the chosen plan is being laid out, purely for the transition. */
  const [preparing, setPreparing] = useState<PlanId | null>(null);
  // Only a fresh Google round trip earns the full splash. An ordinary launch
  // shows it just long enough to cover restoring the session.
  const [held, setHeld] = useState(returnedFromOAuth);

  useEffect(() => {
    if (!held) return;
    const timer = setTimeout(() => setHeld(false), SPLASH_MS);
    return () => clearTimeout(timer);
  }, [held]);

  if (status === 'off') {
    return (
      <>
        <p className="configWarning">
          No cloud project configured for this build. Progress stays on this device only.
        </p>
        <Shell />
      </>
    );
  }

  if (status === 'loading') return <Splash held={held} />;
  if (!email) return <SignInScreen />;
  if (held) return <Splash held />;
  if (preparing) return <Preparing planId={preparing} />;

  // No plan on the journal means this account has never started one.
  if (!data.planId) {
    return (
      <PlanChooser
        onChoose={(id) => {
          choosePlan(id);
          setPreparing(id);
          setTimeout(() => setPreparing(null), PREPARING_MS);
        }}
      />
    );
  }

  return (
    <div className="appEnter">
      <Shell />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <CloudProvider>
        <Gate />
      </CloudProvider>
    </StoreProvider>
  );
}
