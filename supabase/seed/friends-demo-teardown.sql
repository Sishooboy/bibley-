-- Remove everything friends-demo.sql created.
--
-- Deleting the four accounts is enough on its own: every friends table
-- references auth.users with `on delete cascade`, so the profiles, the
-- friendships, the progress rows and the passage all go with them. That is the
-- same reason in-app account deletion does not need to name these tables in any
-- particular order.
--
-- It matches on the fixed ids rather than on the handle or the address, so a
-- real account could never be caught by it even if somebody took the name.

delete from auth.users
where id in (
  '00000000-b1b1-4000-8000-000000000001',
  '00000000-b1b1-4000-8000-000000000002',
  '00000000-b1b1-4000-8000-000000000003',
  '00000000-b1b1-4000-8000-000000000004'
);

select
  (select count(*) from public.profiles where handle like 'demo_%') as demo_profiles_left,
  (select count(*) from public.progress) as progress_rows_left,
  (select count(*) from public.passages) as passages_left,
  (select count(*) from public.journals) as journals_untouched;
