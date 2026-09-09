/*
 * Delete the calling account and everything attached to it.
 *
 * App Store guideline 5.1.1(v) requires an app that creates accounts to let
 * somebody delete theirs from inside the app, and to actually delete rather
 * than deactivate. This is the only place that can do it: removing a row from
 * auth.users needs the service role key, and the app ships a publishable key
 * that is public by design, so the client cannot be trusted with it and never
 * sees it.
 *
 * **The account deleted is the one in the token, never one named in the body.**
 * That is the whole security of this function. A user id parameter would turn
 * it into a way for any signed-in reader to delete anybody.
 *
 * Everything cascades from auth.users: journals, profiles, friendships,
 * progress, passages, broadcasts and blocks all declare `on delete cascade`, so
 * one delete is the whole job and the ordering does not matter. Reports are the
 * deliberate exception, `on delete set null`, since a complaint that erases
 * itself when the reported account leaves is no record at all.
 *
 * The avatar is storage rather than a table, so nothing cascades to it and it
 * is removed by hand before the account goes.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publishable = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !publishable) {
    return json({ error: 'The server is missing its configuration.' }, 500);
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Sign in first.' }, 401);

  /*
   * Two clients on purpose. The first runs as the caller and exists only to
   * turn their token into a user id, which is what makes the id trustworthy.
   * The second is the service role and never sees anything the caller sent.
   */
  const asCaller = createClient(url, publishable, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: who, error: whoError } = await asCaller.auth.getUser();
  if (whoError || !who?.user) return json({ error: 'That session is not valid.' }, 401);

  const userId = who.user.id;
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  /*
   * The face goes first. A failure here must not stop the deletion: a leftover
   * image in a bucket is untidy, an account that would not delete is a
   * guideline violation and a broken promise on screen.
   */
  try {
    await admin.storage.from('avatars').remove([`${userId}/avatar`]);
  } catch (err) {
    console.error('Could not remove the avatar, continuing with the delete.', err);
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error('Delete failed', error);
    return json({ error: 'The account could not be deleted. Nothing was changed.' }, 500);
  }

  return json({ deleted: true }, 200);
});
