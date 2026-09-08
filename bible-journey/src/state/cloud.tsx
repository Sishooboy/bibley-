import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { mergeJournals, sameJournal } from '../lib/merge';
import { emptyData, normalize, type AppData } from '../lib/storage';
import { JOURNALS_TABLE, cloudConfigured, supabase } from '../lib/supabase';
import { publishPresence } from '../lib/friendsApi';
import { CloudContext, type Cloud, type CloudStatus } from './cloudContext';
import { useStore } from './useStore';

/** Local edits settle for this long before a write goes out. */
const PUSH_DELAY_MS = 1500;

/**
 * How often the friends projection goes out, at most.
 *
 * A friend's card is a glance, not a livestream, and this rides on every edit
 * the journal makes. A minute keeps a reading session that marks a dozen
 * chapters to one write rather than a dozen.
 */
const PRESENCE_EVERY_MS = 60_000;

/**
 * Sync failures are mostly one of three things, and "sync problem" tells the
 * reader none of them. The free Supabase project also sleeps after about a week
 * of inactivity, which looks exactly like being offline, so both get the same
 * reassurance: the journal on this device is fine and nothing has been lost.
 */
function describeSyncError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const text = raw.toLowerCase();

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'You are offline, so nothing could be saved to your account. Everything you mark is kept on this device and will sync by itself once you are back online.';
  }
  if (
    text.includes('fetch') ||
    text.includes('network') ||
    text.includes('load failed') ||
    text.includes('timeout') ||
    text.includes('503') ||
    text.includes('504')
  ) {
    return 'Could not reach the server. It may be asleep after a quiet spell, which sorts itself out in a few seconds. Your reading is safe on this device either way, so try again in a moment.';
  }
  if (text.includes('jwt') || text.includes('token') || text.includes('401')) {
    return 'Your sign-in expired. Sign out and back in to reconnect this device. Nothing on it has been lost.';
  }
  return `${raw || 'Sync failed'}. Your reading is still safe on this device.`;
}

export function CloudProvider({ children }: { children: ReactNode }) {
  const { data, derived, mergeRemote } = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<CloudStatus>(cloudConfigured ? 'loading' : 'off');
  const [ready, setReady] = useState(!cloudConfigured);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The pushers read through a ref so they never capture stale journal state.
  const dataRef = useRef(data);
  dataRef.current = data;
  /** Local edits not yet written to the server. */
  const dirtyRef = useRef(false);
  // The friends projection is worked out from derived state, which changes on
  // every edit, so it is read through a ref for the same reason the journal is.
  const derivedRef = useRef(derived);
  derivedRef.current = derived;
  /** When presence was last published, so the throttle survives a re-render. */
  const presenceAtRef = useRef(0);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data: result }) => {
      setSession(result.session);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const push = useCallback(
    async (payload: AppData, userId: string) => {
      if (!supabase) return;
      const { error: writeError } = await supabase
        .from(JOURNALS_TABLE)
        .upsert({ user_id: userId, data: payload }, { onConflict: 'user_id' });
      if (writeError) throw writeError;
    },
    [],
  );

  const syncNow = useCallback(async () => {
    const userId = session?.user.id;
    if (!supabase || !userId) return;

    setStatus('syncing');
    setError(null);
    try {
      // Flush local edits first. Pulling while a deletion is still only local
      // would merge it against a server copy that still has the chapter.
      if (dirtyRef.current) {
        await push(dataRef.current, userId);
        dirtyRef.current = false;
      }

      const { data: row, error: readError } = await supabase
        .from(JOURNALS_TABLE)
        .select('data')
        .eq('user_id', userId)
        .maybeSingle();
      if (readError) throw readError;

      const local = dataRef.current;
      const remote = row ? normalize(row.data) : null;
      // A cache stamped with a different account belongs to someone else's
      // journal, so it is replaced outright instead of merged into this one.
      const foreignCache = local.ownerId !== undefined && local.ownerId !== userId;

      if (!remote) {
        const seed = foreignCache
          ? { ...emptyData(), ownerId: userId }
          : { ...local, ownerId: userId };
        if (foreignCache) mergeRemote(seed);
        else if (local.ownerId !== userId) mergeRemote(seed);
        // First device for this account: seed the row from what is on this one.
        await push(seed, userId);
      } else if (foreignCache) {
        const claimed = { ...remote, ownerId: userId };
        mergeRemote(claimed);
      } else {
        const merged = { ...mergeJournals(local, remote), ownerId: userId };
        if (!sameJournal(merged, local) || local.ownerId !== userId) mergeRemote(merged);
        if (!sameJournal(merged, remote)) await push(merged, userId);
      }

      setStatus('synced');
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      console.error('Sync failed', err);
      setStatus('error');
      setError(describeSyncError(err));
    }
  }, [session, mergeRemote, push]);

  // Pull whenever a session appears, and whenever the tab comes back into view.
  useEffect(() => {
    if (!ready) return;
    if (session) void syncNow();
    else if (cloudConfigured) setStatus('signed-out');
  }, [ready, session, syncNow]);

  useEffect(() => {
    if (!session) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };
    // A sync that failed while offline has no other trigger: the reader may not
    // touch the app again, and the debounced push only runs on a fresh edit.
    const onOnline = () => void syncNow();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [session, syncNow]);

  // Debounced push of local edits.
  useEffect(() => {
    const userId = session?.user.id;
    if (!supabase || !userId) return;
    dirtyRef.current = true;
    const timer = setTimeout(() => {
      setStatus('syncing');
      push(data, userId)
        .then(() => {
          dirtyRef.current = false;
          setStatus('synced');
          setLastSyncedAt(new Date().toISOString());
        })
        .catch((err: unknown) => {
          console.error('Could not save to the cloud', err);
          setStatus('error');
          setError(describeSyncError(err));
        });
    }, PUSH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [data, session, push]);

  /*
   * Publish the friends projection alongside the journal.
   *
   * Deliberately its own effect and not a step inside the push above, because
   * **a friends failure must never break sync**. The journal is the thing that
   * matters and the row a friend reads is a convenience; one catch here keeps a
   * policy change or a paused project from turning "your reading is saved" into
   * an error banner. It also writes nothing at all until there is a profile, so
   * an account that has never opened Friends publishes nothing.
   *
   * Throttled hard, because nobody needs a friend's streak to be accurate to
   * the second and this rides on every edit the journal makes.
   */
  useEffect(() => {
    const userId = session?.user.id;
    if (!supabase || !userId) return;
    const since = Date.now() - presenceAtRef.current;
    const wait = Math.max(PUSH_DELAY_MS, PRESENCE_EVERY_MS - since);
    const timer = setTimeout(() => {
      presenceAtRef.current = Date.now();
      void publishPresence(userId, {
        data: dataRef.current,
        streak: derivedRef.current.streak,
        overall: derivedRef.current.overall,
      }).catch((err: unknown) => {
        console.warn('Could not publish presence to friends', err);
      });
    }, wait);
    return () => clearTimeout(timer);
  }, [data, session]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    // Google redirects back here, and detectSessionInUrl picks the session up.
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // Signing out ends the Bibley session, not the Google one, so without
        // this Google silently re-approves the account you just left and there
        // is no way to switch. Costs one tap, and this screen only appears
        // when there is no session to begin with.
        queryParams: { prompt: 'select_account' },
      },
    });
    if (authError) setError(authError.message);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setLastSyncedAt(null);
    // The local journal stays put: signing out is not deleting anything.
  }, []);

  const value = useMemo<Cloud>(
    () => ({
      status,
      email: session?.user.email ?? null,
      userId: session?.user.id ?? null,
      displayName:
        (session?.user.user_metadata?.full_name as string | undefined) ??
        (session?.user.user_metadata?.name as string | undefined) ??
        null,
      lastSyncedAt,
      error,
      signInWithGoogle,
      signOut,
      syncNow,
    }),
    [
      status,
      session,
      lastSyncedAt,
      error,
      signInWithGoogle,
      signOut,
      syncNow,
    ],
  );

  return <CloudContext value={value}>{children}</CloudContext>;
}
