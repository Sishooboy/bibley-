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
  /** True once a code has been emailed and we're waiting for it to be typed in. */
  linkSent: boolean;
  /** The address a pending code was sent to. */
  pendingEmail: string | null;
  /** Seconds until another code can be requested. Supabase rate-limits per address. */
  resendIn: number;
  signIn: (email: string) => Promise<void>;
  verifyCode: (code: string) => Promise<boolean>;
  resend: () => Promise<void>;
  cancelSignIn: () => void;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
};

export const CloudContext = createContext<Cloud | null>(null);
