import { Suspense, lazy, useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Guide } from './components/Guide';
import { PlanChooser } from './components/PlanChooser';
import { PREPARING_MS, Preparing } from './components/Preparing';
import { SignInScreen } from './components/SignInScreen';
import { StreakCelebration } from './components/StreakCelebration';
import { SPLASH_MS, Splash } from './components/Splash';
import { SyncBadge } from './components/SyncBadge';
import { Tour } from './components/Tour';
import { UndoBar } from './components/UndoBar';
import { Menu } from './components/icons';
import { returnedFromOAuth } from './lib/supabase';
import { TOUR_EVENT } from './lib/tour';
import { CloudProvider } from './state/cloud';
import { ReaderProvider } from './state/reader';
import { useCloud } from './state/useCloud';
import { useStore } from './state/useStore';
import { StoreProvider } from './state/store';
import { FriendsView } from './views/FriendsView';
import { JourneyView } from './views/JourneyView';
import { NotesView } from './views/NotesView';
import { SettingsView } from './views/SettingsView';
const StatsView = lazy(() =>
  import('./views/StatsView').then((m) => ({ default: m.StatsView })),
);

const VIEWS = [
  { id: 'journey', label: 'Journey' },
  { id: 'notes', label: 'Notes' },
  { id: 'friends', label: 'Friends' },
  { id: 'stats', label: 'Stats' },
  { id: 'settings', label: 'Settings' },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

function Shell() {
  const [view, setView] = useState<ViewId>('journey');
  const [menuOpen, setMenuOpen] = useState(false);
  /*
   * The tour walks between screens, so it has to be able to change the view,
   * and the view lives here. That is the whole reason it is mounted at this
   * level rather than beside the thing it points at.
   */
  const [tour, setTour] = useState(false);

  /*
   * A new tab starts at its own beginning. Without this the scroll position
   * carries over, so tapping Notes after scrolling down the journey lands you
   * halfway down the notes with the masthead off screen.
   */
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

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
    <ReaderProvider>
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
            <SyncBadge onOpenSettings={() => setView('settings')} />

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
        {/*
          Keyed by view, so switching tabs remounts the boundary and clears the
          error. One broken screen leaves the other four, and the nav above,
          working.
        */}
        <ErrorBoundary key={view} what={`The ${VIEWS.find((v) => v.id === view)?.label} screen`}>
          {view === 'journey' && <JourneyView />}
          {view === 'notes' && <NotesView />}
          {view === 'friends' && <FriendsView />}
          {/*
            Stats brings the whole charting library with it, which is a third of
            the JavaScript for a screen most opens never reach. It arrives on
            demand instead, so the journey is on screen sooner.
          */}
          {view === 'stats' && (
            <Suspense fallback={<p className="viewLoading">Working out where you are…</p>}>
              <StatsView />
            </Suspense>
          )}
          {view === 'settings' && <SettingsView />}
        </ErrorBoundary>
      </main>

      {/* Listens for the same event Settings fires, so "Take the tour" works
          from anywhere without threading a callback through four components. */}
      <TourHost open={tour} setOpen={setTour} onView={setView} />

      <UndoBar />
      {/* Full screen for a few seconds when the streak grows. Here beside the
          undo bar and never inside anything transformed, or `fixed` would stop
          meaning the screen. */}
      <StreakCelebration />
      {/* Renders nothing once it has been seen, which is a synced pref. The
          last panel hands over to the tour rather than just closing. */}
      <Guide onFinish={() => setTour(true)} />
    </div>
    </ReaderProvider>
  );
}

/**
 * The tour, and the one listener that lets anything ask for it.
 *
 * A custom event rather than a callback threaded down through Settings and its
 * panels: the only thing the rest of the app ever wants to say about the tour
 * is "start it", and that is not worth four components each carrying a prop
 * they do not use themselves.
 */
function TourHost({
  open,
  setOpen,
  onView,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  onView: (view: ViewId) => void;
}) {
  useEffect(() => {
    const start = () => setOpen(true);
    window.addEventListener(TOUR_EVENT, start);
    return () => window.removeEventListener(TOUR_EVENT, start);
  }, [setOpen]);

  return <Tour open={open} onClose={() => setOpen(false)} onView={onView} />;
}

/**
 * The app is behind a sign-in wall whenever a cloud project is configured. If it
 * isn't (a build with no Supabase env vars), gating would lock everyone out of a
 * perfectly working local journal, so it falls through with a visible warning.
 */
function Gate() {
  const { status, email } = useCloud();
  const { data, choosePlan } = useStore();
  /** Set while the chosen track is being laid out, purely for the transition. */
  const [preparing, setPreparing] = useState<string | null>(null);
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
  if (preparing) return <Preparing trackId={preparing} />;

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
