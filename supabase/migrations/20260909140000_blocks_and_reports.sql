-- Blocking and reporting, which the friends feature needed the moment it grew
-- user-generated content and did not get.
--
-- The app now carries photographs somebody uploaded, a display name they chose
-- that a stranger can read by guessing a handle, 500 character messages between
-- friends and a 280 character thought on a verse of the day. App Store
-- guideline 1.2 asks for four things from anything that displays that: a way to
-- filter what gets posted, a way to report it, the ability to block an abusive
-- account, and a published way to reach the operator. Two of those are code and
-- they are here.
--
-- **Removing a friend was never a block, and that is the hole this closes.**
-- removeFriend deletes the friendship row, and the insert policy on friendships
-- happily lets the same person create a new pending row a second later. There
-- was no way to make somebody go away.

-- Who has blocked whom. Deliberately directional and not a canonical pair like
-- friendships: "I blocked you" and "you blocked me" are different facts, both
-- can be true, and lifting one must not lift the other.
create table public.blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  constraint blocks_not_self check (blocker <> blocked)
);

alter table public.blocks enable row level security;

-- **Only the blocker can see the row.** The list cannot be read by the person on
-- the wrong end of it and cannot be walked by anybody, so nobody is handed a
-- notification or a roster of who has cut them off.
--
-- It does not make a block undetectable, and no block ever is: somebody refused
-- when they try to send a request can work out why, and blocked_with below will
-- answer about a uuid they already hold. That is true of every block in every
-- app. What this policy buys is that finding out takes a deliberate attempt on
-- one specific account rather than arriving as a message.
create policy "Readers can see the blocks they made"
  on public.blocks for select
  to authenticated
  using (blocker = (select auth.uid()));

create policy "Readers can block somebody"
  on public.blocks for insert
  to authenticated
  with check (blocker = (select auth.uid()));

create policy "Readers can lift a block they made"
  on public.blocks for delete
  to authenticated
  using (blocker = (select auth.uid()));

-- What somebody reported, kept for whoever answers the support address. There
-- is no read policy for other accounts and no update policy at all: a report is
-- a thing you file, not a thing you or anybody else edits afterwards.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references auth.users (id) on delete cascade,
  -- The account complained about. Kept even after they delete theirs, since a
  -- report that erases itself when the reported party leaves is no record at
  -- all, so this is set null rather than cascade.
  reported uuid references auth.users (id) on delete set null,
  -- The specific message, when the report is about one. Null when the report is
  -- about the person, their name or their photograph.
  passage_id uuid references public.passages (id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint reports_reason_length check (char_length(reason) between 1 and 500)
);

alter table public.reports enable row level security;

-- You can see what you filed, so the screen can say it went through. Nobody can
-- see anybody else's.
create policy "Readers can see the reports they filed"
  on public.reports for select
  to authenticated
  using (reporter = (select auth.uid()));

create policy "Readers can file a report"
  on public.reports for insert
  to authenticated
  with check (reporter = (select auth.uid()));

create index reports_triage_idx on public.reports (created_at desc);

-- Is there a block between the caller and this account, in either direction?
--
-- One argument, reading the caller from the session, for the same reason
-- is_friend takes one: a two argument version would let any account probe
-- whether two strangers had fallen out. Security definer because the select
-- policy above deliberately hides the row from the person who was blocked, and
-- a policy that has to refuse their write still has to be able to see it.
--
-- Either direction counts. Blocking has to stop them reaching you, and it also
-- has to stop you reaching them: a block that let the blocker keep sending
-- would be a mute wearing the wrong name.
create or replace function public.blocked_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.blocks b
    where (b.blocker = auth.uid() and b.blocked = other)
       or (b.blocker = other and b.blocked = auth.uid())
  );
$$;

-- Everything a friend can see already goes through is_friend, and blocking
-- deletes the friendship, so progress, the verse of the day, the profile and
-- the ability to send anything all close on their own. The two policies below
-- are what stops it being reopened.

-- **The request policy is the one that matters.** Without this, blocking is
-- undone by the other person tapping Add again.
drop policy "Readers can request a friendship" on public.friendships;
create policy "Readers can request a friendship"
  on public.friendships for insert
  to authenticated
  with check (
    (select auth.uid()) in (user_a, user_b)
    and requested_by = (select auth.uid())
    and status = 'pending'
    and not public.blocked_with(
      case when (select auth.uid()) = user_a then user_b else user_a end
    )
  );

-- Belt and braces. is_friend is already false once the friendship is gone, so
-- this cannot currently be reached, and it is here so that a future change
-- letting a passage travel on anything other than an accepted friendship
-- cannot quietly reopen the hole.
drop policy "Readers can send a passage to a friend" on public.passages;
create policy "Readers can send a passage to a friend"
  on public.passages for insert
  to authenticated
  with check (
    from_user = (select auth.uid())
    and public.is_friend(to_user)
    and not public.blocked_with(to_user)
  );

-- Named in a policy, so it is evaluated as the querying role and has to keep
-- execute, exactly like is_friend. Safe for the same reason: it answers only
-- about the caller.
revoke execute on function public.blocked_with(uuid) from public, anon;
grant execute on function public.blocked_with(uuid) to authenticated;
