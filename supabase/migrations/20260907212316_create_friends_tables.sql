-- Friends: four tables that let two accounts see a little of each other
-- without either one's journal ever being readable by the other.
--
-- public.journals is one jsonb blob per account holding notes and highlights,
-- so there is no version of "let a friend read my row" that is not a data
-- leak. Nothing here touches it. What a friend can see is a separate,
-- deliberately thin projection the client computes and publishes, which is why
-- public.progress is explicit columns rather than another blob: what leaves a
-- device is then auditable by reading the schema, and there is no field a note
-- could arrive in by accident.

-- Sign-in is Google only, so the only name an account starts with is an email
-- address. Finding people by email would both leak addresses and let a
-- stranger open a conversation, so a handle is the one addressable identity.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique,
  display_name text not null,
  -- 'reading' publishes the whole card, 'quiet' publishes only whether they
  -- read today. Enforced by what the client uploads rather than by filtering
  -- on read: a quiet account writes nulls, so the numbers are never on the
  -- server at all rather than being on it and hidden.
  visibility text not null default 'reading',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lowercase is stored, not merely accepted, so uniqueness cannot be dodged
  -- by capitalising a letter.
  constraint profiles_handle_shape check (handle ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 40),
  constraint profiles_visibility check (visibility in ('reading', 'quiet'))
);

-- One row per pair, with the two ids in a fixed order, so a duplicate
-- friendship is impossible by construction rather than by a uniqueness rule
-- somebody has to remember to apply in both directions.
create table public.friendships (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_a, user_b),
  constraint friendships_canonical_order check (user_a < user_b),
  constraint friendships_requester_is_a_party check (requested_by in (user_a, user_b)),
  constraint friendships_status check (status in ('pending', 'accepted'))
);

-- The projection. Every column here is derived from the journal and none of it
-- is copied out of it, which is the property the whole design rests on.
create table public.progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- The reader's own local day, the same key the journal uses. A friend in
  -- another timezone has a different today, so the offset travels beside it in
  -- minutes: without that, "read today" gets computed against the wrong
  -- midnight and the dot is confidently wrong, which is a small lie and this
  -- app does not tell those about streaks anywhere else.
  last_read_day date,
  tz_offset smallint not null default 0,
  -- Null on purpose rather than zero: a quiet account publishes no numbers,
  -- and zero would be a claim about someone who has not made one.
  streak_current smallint,
  streak_longest smallint,
  chapters_read smallint,
  books_done smallint,
  plan_id text,
  plan_percent smallint,
  current_book text,
  current_chapter smallint,
  updated_at timestamptz not null default now(),
  constraint progress_tz_offset check (tz_offset between -840 and 840),
  constraint progress_plan_percent check (plan_percent is null or plan_percent between 0 and 100),
  constraint progress_counts_positive check (
    (streak_current is null or streak_current >= 0)
    and (streak_longest is null or streak_longest >= 0)
    and (chapters_read is null or chapters_read >= 0)
    and (books_done is null or books_done >= 0)
  )
);

-- A verse handed to one person, which is the reason to have friends at all.
create table public.passages (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  -- The reference, never the words. The text renders from the app's own copy
  -- under public/bible/, so a passage stays right if the text is ever
  -- re-fetched, and the same {verse, offset} pair a highlight already uses
  -- picks out the phrase rather than the whole verse.
  book text not null,
  chapter smallint not null,
  from_verse smallint not null,
  from_offset integer not null,
  to_verse smallint not null,
  to_offset integer not null,
  thought text,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  constraint passages_not_self check (from_user <> to_user),
  constraint passages_span check (
    chapter > 0
    and from_verse > 0
    and to_verse >= from_verse
    and from_offset >= 0
    and to_offset >= 0
  ),
  constraint passages_thought_length check (thought is null or char_length(thought) <= 500)
);

-- Is the caller an accepted friend of this account? Every policy below that
-- widens access past "your own row" goes through this, so the rule lives in
-- one place.
--
-- It takes one argument and reads the caller from the session rather than
-- taking two, which is what keeps it safe to expose: it can only ever answer
-- about you. A two-argument version would let any account probe whether two
-- strangers know each other.
--
-- Security definer because a policy on progress would otherwise read
-- friendships through friendships' own policies, which is slower and is a
-- recursion waiting to happen the first time a friendships policy needs to
-- consult something that consults it back.
create or replace function public.is_friend(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and f.user_a = least(auth.uid(), other)
      and f.user_b = greatest(auth.uid(), other)
  );
$$;

-- Looking someone up in order to add them needs exactly one row on an exact
-- handle and nothing that would let the table be walked. Security definer
-- because the select policies deliberately hide a profile you have no
-- friendship with, and an exact-match lookup is the single hole that has to
-- exist for anyone to become a friend in the first place.
create or replace function public.find_profile(lookup_handle text)
returns table (user_id uuid, handle text, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.handle, p.display_name
  from public.profiles p
  where p.handle = lower(lookup_handle)
  limit 1;
$$;

-- Server-side timestamp, the same reason journals has one: a client must not
-- be able to backdate a write. public.touch_journal_updated_at already does
-- this for journals and is left exactly as it is, since this migration
-- deliberately changes nothing about the journal.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- The recipient may mark a passage seen and nothing else. Without this, the
-- update policy that lets them set seen_at would also let them rewrite the
-- words they were sent, on the one object in the app that came from somebody
-- else.
create or replace function public.freeze_passage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.from_user is distinct from old.from_user
    or new.to_user is distinct from old.to_user
    or new.book is distinct from old.book
    or new.chapter is distinct from old.chapter
    or new.from_verse is distinct from old.from_verse
    or new.from_offset is distinct from old.from_offset
    or new.to_verse is distinct from old.to_verse
    or new.to_offset is distinct from old.to_offset
    or new.thought is distinct from old.thought
    or new.created_at is distinct from old.created_at
  then
    raise exception 'a passage is immutable except for seen_at';
  end if;
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before insert or update on public.profiles
  for each row
  execute function public.touch_updated_at();

create trigger progress_set_updated_at
  before insert or update on public.progress
  for each row
  execute function public.touch_updated_at();

create trigger passages_freeze
  before update on public.passages
  for each row
  execute function public.freeze_passage();

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.progress enable row level security;
alter table public.passages enable row level security;

-- The publishable key is public by design, so as with journals these policies
-- are the actual security boundary and not a convenience.

create policy "Readers can see their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Also visible to anyone you already have a friendship row with, accepted or
-- pending, so an incoming request can show a name rather than a uuid. Everyone
-- else's profile stays invisible: a readable profiles table is a directory of
-- every account in the app, which is not a thing this has any reason to
-- publish.
create policy "Readers can see a profile they have a friendship with"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.friendships f
      where (f.user_a = (select auth.uid()) and f.user_b = profiles.user_id)
         or (f.user_b = (select auth.uid()) and f.user_a = profiles.user_id)
    )
  );

create policy "Readers can create their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Readers can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Readers can see their own friendships"
  on public.friendships for select
  to authenticated
  using ((select auth.uid()) in (user_a, user_b));

-- A request names its own sender and starts pending. Nobody can insert an
-- already-accepted friendship, which is what would otherwise let one account
-- put itself on another's list without ever asking.
create policy "Readers can request a friendship"
  on public.friendships for insert
  to authenticated
  with check (
    (select auth.uid()) in (user_a, user_b)
    and requested_by = (select auth.uid())
    and status = 'pending'
  );

-- Only the other party accepts, and only a row that is still pending. The
-- requester accepting their own request is the whole thing this prevents.
create policy "Readers can accept a friendship sent to them"
  on public.friendships for update
  to authenticated
  using (
    (select auth.uid()) in (user_a, user_b)
    and requested_by <> (select auth.uid())
    and status = 'pending'
  )
  with check (status = 'accepted');

-- Either side can delete, which covers cancelling a request, declining one and
-- unfriending later. They are all the same row.
create policy "Readers can remove a friendship"
  on public.friendships for delete
  to authenticated
  using ((select auth.uid()) in (user_a, user_b));

create policy "Readers can see their own progress"
  on public.progress for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Accepted only. A pending request must reveal nothing, or sending a request
-- to a stranger would by itself be enough to read them.
create policy "Readers can see an accepted friend's progress"
  on public.progress for select
  to authenticated
  using (public.is_friend(user_id));

create policy "Readers can create their own progress"
  on public.progress for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Readers can update their own progress"
  on public.progress for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Readers can delete their own progress"
  on public.progress for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Readers can see a passage they sent or received"
  on public.passages for select
  to authenticated
  using ((select auth.uid()) in (from_user, to_user));

-- Friendship is checked here rather than in the client, so "nothing arrives
-- from a stranger" is a property of the database and not of a code path that
-- can be skipped.
create policy "Readers can send a passage to a friend"
  on public.passages for insert
  to authenticated
  with check (
    from_user = (select auth.uid())
    and public.is_friend(to_user)
  );

-- The recipient marks it seen. The sender gets no update policy at all: an
-- edit after the fact would rewrite something the other person has already
-- read.
create policy "Recipients can mark a passage seen"
  on public.passages for update
  to authenticated
  using (to_user = (select auth.uid()))
  with check (to_user = (select auth.uid()));

create policy "Readers can delete a passage they sent or received"
  on public.passages for delete
  to authenticated
  using ((select auth.uid()) in (from_user, to_user));

-- user_a leads the primary key, so the other direction needs its own index for
-- "everyone I am connected to" to be one scan rather than two.
create index friendships_user_b_idx on public.friendships (user_b);

-- The inbox is the only way passages are ever read: newest first, one person.
create index passages_inbox_idx on public.passages (to_user, created_at desc);
create index passages_sent_idx on public.passages (from_user, created_at desc);

-- Trigger functions run as the table owner, so the API roles never call them
-- directly. Keeping them off the RPC surface is the same reasoning that
-- revoked touch_journal_updated_at.
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.freeze_passage() from public, anon, authenticated;

-- is_friend keeps execute, and it has to. A trigger function is invoked by the
-- trigger system and never privilege checked against the caller, but a
-- function named in a policy is evaluated as the querying role, so revoking
-- this one would not harden anything, it would make every read it guards fail
-- with a permission error. It is safe to expose because it answers only about
-- the caller: there is no argument that asks about somebody else.
revoke execute on function public.is_friend(uuid) from public, anon;
grant execute on function public.is_friend(uuid) to authenticated;

-- find_profile is the one that is meant to be called: it is how a handle
-- becomes an account to send a request to. Signed in only.
revoke execute on function public.find_profile(text) from public, anon;
grant execute on function public.find_profile(text) to authenticated;
