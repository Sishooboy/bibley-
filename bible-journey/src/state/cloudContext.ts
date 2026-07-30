import { createContext } from 'react';

export type CloudStatus =
  /** No Supabase project configured: the app is purely local. */
  | 'off'
  | 'signed-out'
  | 'syncing'
  | 'synced'
  | 'error';

export type Cloud = {
  status: CloudStatus;
  email: string | null;
  lastSyncedAt: string | null;
  error: string | null;
  /** True between requesting a magic link and that link being used. */
  linkSent: boolean;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
};

export const CloudContext = createContext<Cloud | null>(null);
