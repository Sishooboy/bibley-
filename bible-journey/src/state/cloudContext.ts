import { createContext } from 'react';

export type CloudStatus =
  /** No Supabase project configured: the app is purely local. */
  | 'off'
  /** Restoring a stored session. Gating on this avoids a sign-in flash on reload. */
  | 'loading'
  | 'signed-out'
  | 'syncing'
  | 'synced'
  | 'error';

export type Cloud = {
  status: CloudStatus;
  email: string | null;
  lastSyncedAt: string | null;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
};

export const CloudContext = createContext<Cloud | null>(null);
