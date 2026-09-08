-- A face beside a name, and one verse a day anybody you read with can see.
--
-- Two additions and a bucket. Neither touches public.journals, and the
-- broadcast is the same shape as a passage: a reference and never the words, so
-- it renders from the app's own text.

-- A photograph, which is a deliberate exception to a house rule.
--
-- "No photography, anywhere" is about the app's own furniture: a stock image
-- dropped behind a heading reads as pasted on, and the app is type and two
-- colours. A reader's own face is not furniture, it is how you tell two friends
-- apart at a glance, and it is the one image in the app that carries meaning
-- rather than decoration. It stays small, round and inside the friends screen.
alter table public.profiles add column avatar_url text;

-- One verse a day, to everybody you read with rather than to one person.
--
-- The primary key is the pair, not an id, which is what makes "one a day" a
-- property of the table rather than a rule the client has to keep. Posting
-- again the same day replaces what is there, so nobody can fill a friend's
-- screen and there is nothing to scroll.
create table public.broadcasts (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The poster's own local day, so "today" means their today. The same reason
  -- progress carries tz_offset.
  day date not null,
  book text not null,
  chapter smallint not null,
  from_verse smallint not null,
  to_verse smallint not null,
  thought text,
  created_at timestamptz not null default now(),
  primary key (user_id, day),
  constraint broadcasts_span check (chapter > 0 and from_verse > 0 and to_verse >= from_verse),
  constraint broadcasts_thought_length check (thought is null or char_length(thought) <= 280)
);

alter table public.broadcasts enable row level security;

create policy "Readers can see their own verse of the day"
  on public.broadcasts for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Accepted friends only, the same rule progress follows. A pending request must
-- reveal nothing, including what somebody posted.
create policy "Readers can see an accepted friend's verse of the day"
  on public.broadcasts for select
  to authenticated
  using (public.is_friend(user_id));

create policy "Readers can post their own verse of the day"
  on public.broadcasts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Readers can change their own verse of the day"
  on public.broadcasts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Readers can take down their own verse of the day"
  on public.broadcasts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Reading a friend's board is "the newest day they posted", so the index is the
-- one that answers it.
create index broadcasts_recent_idx on public.broadcasts (user_id, day desc);

-- Avatars live in storage rather than in the row, because a base64 image in a
-- jsonb-adjacent table is a column nobody can page past.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  -- Public in the sense that a URL needs no token. The path is keyed by the
  -- account's uuid, so it is unguessable, and a face is not a secret in the way
  -- a journal is. The alternative is a signed URL per row per render, which is
  -- a request per friend every time the screen opens.
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anybody may read an avatar, which is what "public bucket" already means; this
-- states it rather than relying on the bucket flag alone.
create policy "Avatars are readable"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

-- **The first path segment has to be the account's own id.** Without that, any
-- signed-in reader could write over somebody else's face, which is the one way
-- this bucket could be turned into a weapon.
create policy "Readers can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Readers can replace their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Readers can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
