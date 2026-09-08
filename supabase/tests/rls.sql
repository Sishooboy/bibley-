-- What the friends tables let one account see of another.
--
-- Row level security is the entire security boundary here, the same as it is
-- for journals: the publishable key is public by design, so a policy that is
-- one word too generous is a data leak rather than a glitch. That is not a
-- thing to find out by clicking around with two accounts, so this asserts it
-- directly.
--
-- It needs no Google accounts and no browser. A policy only cares about
-- auth.uid(), which reads request.jwt.claims, so three rows in auth.users and
-- a set_config are a complete set of identities.
--
-- Everything runs inside a sub-block that ends by raising, so the test users
-- and their rows are rolled back whether it passes or fails and nothing is
-- ever left behind in a live database. The results survive that rollback
-- because they are held in a plpgsql variable, and variables are memory rather
-- than table rows.
--
-- Run it with the whole file as one statement. It returns one row per check.
--   supabase: execute this file against the project
--   psql:     \i supabase/tests/rls.sql

create temp table if not exists rls_results (ord int, ok boolean, label text, detail text);
truncate rls_results;

do $$
declare
  -- Three identities. A and B are friends, A and C have a request pending,
  -- and B and C have never heard of each other.
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  passage_id uuid := gen_random_uuid();
  results text[] := '{}';
  ord int := 0;
  chk record;
  n int;
  affected int;
begin
  begin
    insert into auth.users (id, email, aud, role) values
      (a, 'rls-a@test.invalid', 'authenticated', 'authenticated'),
      (b, 'rls-b@test.invalid', 'authenticated', 'authenticated'),
      (c, 'rls-c@test.invalid', 'authenticated', 'authenticated');

    insert into public.profiles (user_id, handle, display_name) values
      (a, 'bibley_test_a', 'Reader A'),
      (b, 'bibley_test_b', 'Reader B'),
      (c, 'bibley_test_c', 'Reader C');

    -- Canonical order is a constraint, so the pair has to be sorted going in.
    insert into public.friendships (user_a, user_b, requested_by, status, accepted_at)
      values (least(a, b), greatest(a, b), a, 'accepted', now());
    insert into public.friendships (user_a, user_b, requested_by, status)
      values (least(a, c), greatest(a, c), a, 'pending');

    insert into public.progress (user_id, last_read_day, tz_offset, streak_current) values
      (a, current_date, 0, 3),
      (b, current_date, 540, 11),
      (c, current_date, -300, 1);

    insert into public.passages
      (id, from_user, to_user, book, chapter, from_verse, from_offset, to_verse, to_offset, thought)
      values (passage_id, a, b, 'John', 3, 16, 0, 16, 40, 'thought of you');

    -- A journal for A, purely so the checks against journals below mean
    -- something. Without a row there, "C changed nothing" is true whether the
    -- policy holds or not, and the test would pass against an open table.
    insert into public.journals (user_id, data)
      values (a, '{"read":{},"notes":[]}'::jsonb);

    perform set_config('role', 'authenticated', true);

    -- Reads. Each is a count, so a policy that is too generous shows up as a
    -- number that is too high and one that is too mean shows up as too low.
    for chk in
      select * from (values
        ('A sees own progress and an accepted friend'::text,
         'select count(*) from public.progress'::text, 2::int, a::uuid),
        ('B sees own progress and an accepted friend',
         'select count(*) from public.progress', 2, b),
        ('a pending request reveals no progress at all',
         'select count(*) from public.progress', 1, c),
        ('C cannot read B progress, they are strangers',
         format('select count(*) from public.progress where user_id = %L', b), 0, c),
        ('A can read B progress, they are friends',
         format('select count(*) from public.progress where user_id = %L', b), 1, a),
        ('A sees profiles for both connections',
         'select count(*) from public.profiles', 3, a),
        ('B sees only their own profile and A',
         'select count(*) from public.profiles', 2, b),
        ('a pending request does reveal a name, so it can be answered',
         'select count(*) from public.profiles', 2, c),
        ('A sees both friendship rows',
         'select count(*) from public.friendships', 2, a),
        ('C sees only the friendship they are part of',
         'select count(*) from public.friendships', 1, c),
        ('A sees the passage they sent',
         'select count(*) from public.passages', 1, a),
        ('B sees the passage they received',
         'select count(*) from public.passages', 1, b),
        ('a passage between two other people is invisible',
         'select count(*) from public.passages', 0, c),
        ('is_friend is true for an accepted friend',
         format('select (public.is_friend(%L))::int', b), 1, a),
        ('is_friend is false while a request is only pending',
         format('select (public.is_friend(%L))::int', c), 0, a),
        ('a handle can be looked up exactly, which is how anyone is added',
         'select count(*) from public.find_profile(''bibley_test_b'')', 1, c),
        ('find_profile does not match a prefix, so it cannot be walked',
         'select count(*) from public.find_profile(''bibley_test'')', 0, c),
        ('a friend still cannot read the journal behind the progress',
         'select count(*) from public.journals', 0, b),
        ('the friends tables did not widen access to journals',
         'select count(*) from public.journals', 0, c),
        ('the owner can still read their own journal',
         'select count(*) from public.journals', 1, a)
      ) as t(label, q, expected, who)
    loop
      ord := ord + 1;
      perform set_config('request.jwt.claims',
        json_build_object('sub', chk.who, 'role', 'authenticated')::text, true);
      begin
        execute chk.q into n;
        if n = chk.expected then
          results := results || format('%s|t|%s|read %s', ord, chk.label, n);
        else
          results := results || format('%s|f|%s|expected %s, read %s', ord, chk.label, chk.expected, n);
        end if;
      exception when others then
        results := results || format('%s|f|%s|errored: %s', ord, chk.label, sqlerrm);
      end;
    end loop;

    -- Writes that must not go through. A refusal is either an exception or
    -- zero rows affected: an UPDATE whose USING clause fails does not throw,
    -- it quietly matches nothing, which is why row count is checked too.
    for chk in
      select * from (values
        ('C cannot publish progress in B name'::text,
         format('insert into public.progress (user_id) values (%L)', b)::text, c::uuid),
        ('C cannot overwrite B progress',
         format('update public.progress set streak_current = 999 where user_id = %L', b), c),
        ('a stranger cannot send a passage',
         format('insert into public.passages (from_user, to_user, book, chapter, from_verse, from_offset, to_verse, to_offset) values (%L, %L, ''Mark'', 1, 1, 0, 1, 5)', c, b), c),
        ('nobody can send a passage in someone else name',
         format('insert into public.passages (from_user, to_user, book, chapter, from_verse, from_offset, to_verse, to_offset) values (%L, %L, ''Mark'', 1, 1, 0, 1, 5)', b, a), a),
        ('the requester cannot accept their own request',
         format('update public.friendships set status = ''accepted'' where user_a = %L and user_b = %L', least(a, c), greatest(a, c)), a),
        ('a friendship cannot be inserted already accepted',
         format('insert into public.friendships (user_a, user_b, requested_by, status) values (%L, %L, %L, ''accepted'')', least(b, c), greatest(b, c), c), c),
        ('a friendship cannot be inserted naming someone else as sender',
         format('insert into public.friendships (user_a, user_b, requested_by) values (%L, %L, %L)', least(b, c), greatest(b, c), b), c),
        ('the recipient cannot rewrite the words they were sent',
         format('update public.passages set thought = ''something else'' where id = %L', passage_id), b),
        ('the sender cannot edit a passage after it has gone',
         format('update public.passages set thought = ''second thoughts'' where id = %L', passage_id), a),
        ('an accepted friend cannot write to the journal behind the progress',
         format('update public.journals set data = ''{}''::jsonb where user_id = %L', a), b),
        ('a stranger cannot write to a journal either',
         format('update public.journals set data = ''{}''::jsonb where user_id = %L', a), c)
      ) as t(label, q, who)
    loop
      ord := ord + 1;
      perform set_config('request.jwt.claims',
        json_build_object('sub', chk.who, 'role', 'authenticated')::text, true);
      begin
        execute chk.q;
        get diagnostics affected = row_count;
        if affected = 0 then
          results := results || format('%s|t|%s|refused, nothing matched', ord, chk.label);
        else
          results := results || format('%s|f|%s|ALLOWED, %s rows written', ord, chk.label, affected);
        end if;
      exception when others then
        results := results || format('%s|t|%s|refused: %s', ord, chk.label, split_part(sqlerrm, E'\n', 1));
      end;
    end loop;

    -- Positive controls, last because they change what the reads above count.
    -- Without these the whole suite would pass just as happily against tables
    -- nobody can touch at all.
    for chk in
      select * from (values
        ('the addressee can accept a request'::text,
         format('update public.friendships set status = ''accepted'', accepted_at = now() where user_a = %L and user_b = %L', least(a, c), greatest(a, c))::text, c::uuid),
        ('the recipient can mark a passage seen',
         format('update public.passages set seen_at = now() where id = %L', passage_id), b),
        ('A can publish their own progress',
         format('update public.progress set streak_current = 5 where user_id = %L', a), a),
        ('A can send a passage to an accepted friend',
         format('insert into public.passages (from_user, to_user, book, chapter, from_verse, from_offset, to_verse, to_offset) values (%L, %L, ''Psalms'', 23, 1, 0, 1, 20)', a, b), a)
      ) as t(label, q, who)
    loop
      ord := ord + 1;
      perform set_config('request.jwt.claims',
        json_build_object('sub', chk.who, 'role', 'authenticated')::text, true);
      begin
        execute chk.q;
        get diagnostics affected = row_count;
        if affected > 0 then
          results := results || format('%s|t|%s|allowed, %s rows', ord, chk.label, affected);
        else
          results := results || format('%s|f|%s|REFUSED, nothing matched', ord, chk.label);
        end if;
      exception when others then
        results := results || format('%s|f|%s|REFUSED: %s', ord, chk.label, split_part(sqlerrm, E'\n', 1));
      end;
    end loop;

    perform set_config('role', 'postgres', true);
    raise exception 'roll the test data back';
  exception when others then
    if sqlerrm <> 'roll the test data back' then
      results := results || format('%s|f|the suite itself broke|%s', ord + 1, sqlerrm);
    end if;
  end;

  -- Past the rollback. Every test row is gone and the findings are still here.
  insert into rls_results
  select
    split_part(r, '|', 1)::int,
    split_part(r, '|', 2) = 't',
    split_part(r, '|', 3),
    split_part(r, '|', 4)
  from unnest(results) as r;
end $$;

select
  case when ok then 'pass' else 'FAIL' end as result,
  label,
  detail
from rls_results
order by ok, ord;
