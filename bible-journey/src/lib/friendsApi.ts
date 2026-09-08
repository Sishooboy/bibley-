/*
 * Every query friends makes, in one place.
 *
 * Row level security is the whole boundary here, so none of these functions
 * filters by user: `select * from friendships` returns yours because the policy
 * says so, not because the client remembered to ask nicely. That is deliberate.
 * A client-side filter would look identical when it worked and would be the
 * only thing standing between two accounts when it did not.
 *
 * The joins are done here rather than by PostgREST because the foreign keys all
 * point at `auth.users` rather than at `profiles`, so there is no relationship
 * for it to embed through. Three small selects beat inventing one.
 */
import { supabase } from './supabase';
import {
  canonicalPair,
  projectProgress,
  type PublishedProgress,
  type Visibility,
} from './friends';
import type { OverallProgress, Streak } from './progress';
import type { AppData } from './storage';

export const PROFILES = 'profiles';
export const FRIENDSHIPS = 'friendships';
export const PROGRESS = 'progress';
export const PASSAGES = 'passages';

export type Profile = {
  user_id: string;
  handle: string;
  display_name: string;
  visibility: Visibility;
};

export type FriendshipRow = {
  user_a: string;
  user_b: string;
  requested_by: string;
  status: 'pending' | 'accepted';
};

/** One person as the screen needs them: who they are, and what they let you see. */
export type Friend = {
  userId: string;
  handle: string;
  displayName: string;
  status: 'pending' | 'accepted';
  /** True when they asked you, so the card offers an answer rather than a wait. */
  incoming: boolean;
  /** Null for a pending request, which must reveal nothing. */
  progress: PublishedProgress | null;
};

export type Passage = {
  id: string;
  from_user: string;
  to_user: string;
  book: string;
  chapter: number;
  from_verse: number;
  from_offset: number;
  to_verse: number;
  to_offset: number;
  thought: string | null;
  created_at: string;
  seen_at: string | null;
};

function client() {
  if (!supabase) throw new Error('No cloud project is configured for this build.');
  return supabase;
}

export async function loadMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await client()
    .from(PROFILES)
    .select('user_id, handle, display_name, visibility')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function saveMyProfile(profile: Profile): Promise<void> {
  const { error } = await client().from(PROFILES).upsert(profile, { onConflict: 'user_id' });
  if (error) throw error;
}

/**
 * Everyone you are connected to, accepted or waiting.
 *
 * A pending row deliberately comes back with `progress: null`, and not because
 * this filters it out: the policy on `progress` requires an accepted
 * friendship, so the row simply is not returned. The null here is a
 * description of what the server gave, not a decision made afterwards.
 */
export async function loadFriends(userId: string): Promise<Friend[]> {
  const db = client();

  const { data: links, error: linkError } = await db
    .from(FRIENDSHIPS)
    .select('user_a, user_b, requested_by, status');
  if (linkError) throw linkError;

  const rows = (links ?? []) as FriendshipRow[];
  const others = rows.map((r) => (r.user_a === userId ? r.user_b : r.user_a));
  if (others.length === 0) return [];

  const [{ data: profiles, error: profileError }, { data: progress, error: progressError }] =
    await Promise.all([
      db.from(PROFILES).select('user_id, handle, display_name, visibility').in('user_id', others),
      db.from(PROGRESS).select('*').in('user_id', others),
    ]);
  if (profileError) throw profileError;
  if (progressError) throw progressError;

  const byId = new Map((profiles ?? []).map((p) => [(p as Profile).user_id, p as Profile]));
  const progressById = new Map(
    (progress ?? []).map((p) => [(p as { user_id: string }).user_id, p as unknown as PublishedProgress]),
  );

  return rows.flatMap((row) => {
    const other = row.user_a === userId ? row.user_b : row.user_a;
    const profile = byId.get(other);
    // A friendship whose profile did not come back is a half-built account, not
    // an error worth a screen. Leaving it out is the same choice the tour makes
    // for a step whose target is missing.
    if (!profile) return [];
    return [
      {
        userId: other,
        handle: profile.handle,
        displayName: profile.display_name,
        status: row.status,
        incoming: row.requested_by !== userId,
        progress: progressById.get(other) ?? null,
      },
    ];
  });
}

export async function loadInbox(): Promise<Passage[]> {
  const { data, error } = await client()
    .from(PASSAGES)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Passage[];
}

/** Look a handle up exactly. The one way anybody becomes addable. */
export async function findByHandle(handle: string): Promise<Profile | null> {
  const { data, error } = await client().rpc('find_profile', { lookup_handle: handle });
  if (error) throw error;
  const rows = (data ?? []) as { user_id: string; handle: string; display_name: string }[];
  const first = rows[0];
  return first ? { ...first, visibility: 'reading' } : null;
}

export async function requestFriend(me: string, them: string): Promise<void> {
  const { error } = await client()
    .from(FRIENDSHIPS)
    .insert({ ...canonicalPair(me, them), requested_by: me, status: 'pending' });
  if (error) throw error;
}

export async function acceptFriend(me: string, them: string): Promise<void> {
  const pair = canonicalPair(me, them);
  const { error } = await client()
    .from(FRIENDSHIPS)
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('user_a', pair.user_a)
    .eq('user_b', pair.user_b);
  if (error) throw error;
}

/** Declining, cancelling and unfriending are all the same row going away. */
export async function removeFriend(me: string, them: string): Promise<void> {
  const pair = canonicalPair(me, them);
  const { error } = await client()
    .from(FRIENDSHIPS)
    .delete()
    .eq('user_a', pair.user_a)
    .eq('user_b', pair.user_b);
  if (error) throw error;
}

export async function publishProgress(userId: string, row: PublishedProgress): Promise<void> {
  const { error } = await client()
    .from(PROGRESS)
    .upsert({ user_id: userId, ...row }, { onConflict: 'user_id' });
  if (error) throw error;
}

/**
 * Work out the projection and publish it, in one call, for the two places that
 * need to: the sync loop, and the moment somebody changes what they share.
 *
 * **The profile is re-read rather than passed in.** Visibility is the thing
 * being obeyed here, so reading a cached copy is how switching to quiet keeps
 * publishing numbers until the next reload. It is one small select against a
 * write that happens at most once a minute.
 *
 * No profile means no handle, which means nobody can have added you, so there
 * is nothing to publish to and nothing is written. That is what makes "nothing
 * about your reading is published until you pick a handle" true rather than a
 * claim on a screen.
 */
export async function publishPresence(
  userId: string,
  input: { data: AppData; streak: Streak; overall: OverallProgress },
): Promise<void> {
  const profile = await loadMyProfile(userId);
  if (!profile) return;
  await publishProgress(
    userId,
    projectProgress({
      data: input.data,
      streak: input.streak,
      overall: input.overall,
      visibility: profile.visibility,
    }),
  );
}

export async function markPassageSeen(id: string): Promise<void> {
  const { error } = await client()
    .from(PASSAGES)
    .update({ seen_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function sendPassage(input: {
  from: string;
  to: string;
  book: string;
  chapter: number;
  fromVerse: number;
  fromOffset: number;
  toVerse: number;
  toOffset: number;
  thought: string | null;
}): Promise<void> {
  const { error } = await client().from(PASSAGES).insert({
    from_user: input.from,
    to_user: input.to,
    book: input.book,
    chapter: input.chapter,
    from_verse: input.fromVerse,
    from_offset: input.fromOffset,
    to_verse: input.toVerse,
    to_offset: input.toOffset,
    thought: input.thought,
  });
  if (error) throw error;
}
