import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { mergeJournals, sameJournal } from '../lib/merge';
import { emptyData, normalize, type AppData } from '../lib/storage';
import { JOURNALS_TABLE, cloudConfigured, supabase } from '../lib/supabase';
import { publishPresence } from '../lib/friendsApi';
import { isGuest, setGuest } from '../lib/guest';
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
  const { data, derived, mergeRemote, resetJournal } = useStore();
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
  /**
   * The account this device is signed in to, read by a sync that resumes after
   * an await. Set on render and cleared directly by sign out, because a sync
   * resuming between the two would otherwise still see the old account.
   */
  const accountRef = useRef<string | null>(null);
  accountRef.current = session?.user.id ?? null;

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
      // Signed out while the read was in flight. Applying it now would put the
      // journal just signed out of back on a device that was emptied of it.
      if (accountRef.current !== userId) return;

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
    if (session) {
      // A guest who signs in has an account now. Signing out later should
      // offer the sign-in screen, not an empty journal they never asked for.
      if (isGuest()) setGuest(false);
      void syncNow();
    } else if (cloudConfigured) setStatus('signed-out');
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

  /*
   * Signing out leaves nothing of yours on this device.
   *
   * It used to leave the journal where it was, which was harmless while the
   * only thing behind the sign-in screen was the sign-in screen. Now anybody can
   * pick the device up and start reading without an account, and they would
   * have been reading in your journal, notes and highlights included.
   *
   * **Only once the account has everything.** Unsaved edits are pushed first,
   * and the device is emptied only if that worked. If it did not, offline or an
   * expired token, the sign out still happens and the local copy stays, which is
   * the old behaviour: nothing is lost, and signing back in merges it. Refusing
   * to sign out instead would trap somebody whose token expired, since the
   * advice for that is to sign out and back in.
   *
   * The session is cleared here rather than left to the auth listener, so the
   * empty journal and the missing session land in the same render. The other way
   * round, the debounced push would see an empty journal with a live session and
   * write it over the account.
   */
  const signOut = useCallback(async () => {
    if (!supabase) return;
    const userId = session?.user.id;
    let saved = !dirtyRef.current;
    if (userId && dirtyRef.current) {
      try {
        await push(dataRef.current, userId);
        dirtyRef.current = false;
        saved = true;
      } catch (err) {
        console.warn('Signing out with edits the account has not got. Keeping them here.', err);
      }
    }
    await supabase.auth.signOut();
    accountRef.current = null;
    /*
     * Never carried into the next sign in. `syncNow` pushes a dirty journal
     * before it pulls, so a flag left over from this account would write this
     * journal over whichever account signs in next, before the ownership check
     * that guards against exactly that had a chance to run. Whatever is kept
     * here is merged on the way back in instead, by that check.
     */
    dirtyRef.current = false;
    setSession(null);
    setLastSyncedAt(null);
    setError(null);
    if (saved) resetJournal();
  }, [session, push, resetJournal]);

  /*
   * Delete the account, which App Store guideline 5.1.1(v) requires and which
   * nothing in the client is allowed to do on its own: removing a row from
   * auth.users needs the service role key, and this app ships a publishable one
   * that is public by design. So the work happens in the delete-account edge
   * function, which reads who is calling from their own token.
   *
   * **The local cache is cleared only after the server says it is done.**
   * Clearing first would, on a failed call, leave somebody signed in to an
   * account that still exists with their journal wiped off the device, which is
   * the one outcome worse than the delete not happening.
   */
  const deleteAccount = useCallback(async () => {
    if (!supabase) throw new Error('This build has no account to delete.');
    const { data, error: fnError } = await supabase.functions.invoke('delete-account', {
      method: 'POST',
    });
    if (fnError) throw new Error(describeSyncError(fnError));
    if (!(data as { deleted?: boolean } | null)?.deleted) {
      throw new Error('The account could not be deleted. Nothing was changed.');
    }

    // Everything this app has ever written on this device, by prefix, so a key
    // added later cannot be forgotten here.
    try {
      const mine = Object.keys(localStorage).filter((k) => k.startsWith('bible-journey/'));
      for (const key of mine) localStorage.removeItem(key);
    } catch (err) {
      console.error('Could not clear the local copy.', err);
    }

    await supabase.auth.signOut();
    // A reload rather than a state update: half the app is holding a journal
    // that no longer exists, and rebuilding from nothing is the honest reset.
    location.reload();
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
      deleteAccount,
    }),
    [
      status,
      session,
      lastSyncedAt,
      error,
      signInWithGoogle,
      signOut,
      syncNow,
      deleteAccount,
    ],
  );

  return <CloudContext value={value}>{children}</CloudContext>;
}
