import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { mergeJournals, sameJournal } from '../lib/merge';
import { emptyData, normalize, type AppData } from '../lib/storage';
import { JOURNALS_TABLE, cloudConfigured, supabase } from '../lib/supabase';
import { CloudContext, type Cloud, type CloudStatus } from './cloudContext';
import { useStore } from './useStore';

/** Local edits settle for this long before a write goes out. */
const PUSH_DELAY_MS = 1500;
/** Supabase rate-limits sign-in emails per address, so don't let the button spam it. */
const RESEND_COOLDOWN_S = 60;

export function CloudProvider({ children }: { children: ReactNode }) {
  const { data, mergeRemote } = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<CloudStatus>(cloudConfigured ? 'loading' : 'off');
  const [ready, setReady] = useState(!cloudConfigured);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  // The pushers read through a ref so they never capture stale journal state.
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data: result }) => {
      setSession(result.session);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) setLinkSent(false);
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
      setError(err instanceof Error ? err.message : 'Sync failed');
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
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [session, syncNow]);

  // Debounced push of local edits.
  useEffect(() => {
    const userId = session?.user.id;
    if (!supabase || !userId) return;
    const timer = setTimeout(() => {
      setStatus('syncing');
      push(data, userId)
        .then(() => {
          setStatus('synced');
          setLastSyncedAt(new Date().toISOString());
        })
        .catch((err: unknown) => {
          console.error('Could not save to the cloud', err);
          setStatus('error');
          setError(err instanceof Error ? err.message : 'Could not save to the cloud');
        });
    }, PUSH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [data, session, push]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    // Google redirects back here, and detectSessionInUrl picks the session up.
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (authError) setError(authError.message);
  }, []);

  const sendCode = useCallback(async (email: string) => {
    if (!supabase) return false;
    setError(null);
    // emailRedirectTo still lets the link in the same email work on this device,
    // but the typed code is what makes signing in on a second device possible.
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    });
    if (authError) {
      setError(authError.message);
      return false;
    }
    setPendingEmail(email);
    setLinkSent(true);
    setResendIn(RESEND_COOLDOWN_S);
    return true;
  }, []);

  const signIn = useCallback(
    async (email: string) => {
      await sendCode(email);
    },
    [sendCode],
  );

  const resend = useCallback(async () => {
    if (!pendingEmail || resendIn > 0) return;
    await sendCode(pendingEmail);
  }, [pendingEmail, resendIn, sendCode]);

  const verifyCode = useCallback(
    async (code: string) => {
      if (!supabase || !pendingEmail) return false;
      setError(null);
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: code.trim(),
        type: 'email',
      });
      if (verifyError) {
        setError(
          verifyError.message.toLowerCase().includes('expired')
            ? 'That code has expired. Send yourself a new one.'
            : 'That code was not right. Check the latest email and try again.',
        );
        return false;
      }
      setLinkSent(false);
      setPendingEmail(null);
      return true;
    },
    [pendingEmail],
  );

  const cancelSignIn = useCallback(() => {
    setLinkSent(false);
    setPendingEmail(null);
    setError(null);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setLastSyncedAt(null);
    setLinkSent(false);
    // The local journal stays put: signing out is not deleting anything.
  }, []);

  const value = useMemo<Cloud>(
    () => ({
      status,
      email: session?.user.email ?? null,
      lastSyncedAt,
      error,
      linkSent,
      pendingEmail,
      resendIn,
      signInWithGoogle,
      signIn,
      verifyCode,
      resend,
      cancelSignIn,
      signOut,
      syncNow,
    }),
    [
      status,
      session,
      lastSyncedAt,
      error,
      linkSent,
      pendingEmail,
      resendIn,
      signInWithGoogle,
      signIn,
      verifyCode,
      resend,
      cancelSignIn,
      signOut,
      syncNow,
    ],
  );

  return <CloudContext value={value}>{children}</CloudContext>;
}
