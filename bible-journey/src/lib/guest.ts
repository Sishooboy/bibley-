import { useSyncExternalStore } from 'react';

/**
 * Whether this device chose to read without an account.
 *
 * App Store guideline 5.1.1(i) says an app whose core is not an account feature
 * must not demand a login before it can be used, and reading the Bible is not an
 * account feature. Sync and Friends are, so they ask for one at the point they
 * are needed and nowhere else.
 *
 * **Device-local, never a `prefs` field.** It answers a question about this
 * browser before there is any account to sync it to, and `normalize()` is a
 * whitelist, so a synced field would need a read-only release first anyway.
 *
 * Signing in clears it (`cloud.tsx`), so somebody who later signs out is shown
 * the sign-in screen again rather than dropped into an empty guest journal they
 * never asked for.
 */
const KEY = 'bible-journey/guest';
const EVENT = 'bibley:guest';

/*
 * Private browsing can refuse storage outright. Without this the choice would
 * not stick for even one render, and the gate would bounce straight back to the
 * sign-in screen. Held in memory, it lasts the session, which is all private
 * browsing ever promises.
 */
let fallback = false;

export function isGuest(): boolean {
  try {
    return localStorage.getItem(KEY) === '1' || fallback;
  } catch {
    return fallback;
  }
}

export function setGuest(on: boolean): void {
  fallback = on;
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the in-memory copy above carries it.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useGuest(): boolean {
  return useSyncExternalStore(subscribe, isGuest, () => false);
}
