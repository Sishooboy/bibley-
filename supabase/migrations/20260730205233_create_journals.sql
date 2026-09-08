-- One row per user holding the whole reading journal as a single JSON blob,
-- mirroring the shape the app already keeps in local storage.
create table public.journals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.journals enable row level security;

-- A journal is readable and writable only by its owner. The publishable key is
-- public by design, so these policies are the actual security boundary.
create policy "Owners can read their journal"
  on public.journals for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners can create their journal"
  on public.journals for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Owners can update their journal"
  on public.journals for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners can delete their journal"
  on public.journals for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Server-side timestamp so clients can't backdate a write and win a merge.
create or replace function public.touch_journal_updated_at()
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

create trigger journals_set_updated_at
  before insert or update on public.journals
  for each row
  execute function public.touch_journal_updated_at();
