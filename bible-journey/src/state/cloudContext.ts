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
  /**
   * The signed-in account's id, which is what every friends query is written
   * against. Not derivable from `email`, and asking Supabase for it again in
   * each caller would mean a different answer during the moment a session is
   * being restored.
   */
  userId: string | null;
  /**
   * The name Google gave us, which is the only thing about a reader the app
   * knows without asking. Friends uses it to arrive with its form filled in
   * rather than making somebody compose a profile before they can see anybody.
   */
  displayName: string | null;
  lastSyncedAt: string | null;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  /**
   * Delete the account for good, server side and on this device.
   *
   * Resolves only once the row is gone. Throws with something printable if it
   * could not be done, because a delete that silently failed would leave
   * somebody believing their data was gone when it was not.
   */
  deleteAccount: () => Promise<void>;
};

export const CloudContext = createContext<Cloud | null>(null);
