-- Four demo friends, in the states that are otherwise impossible to look at.
--
-- Friends is a two person feature and there is one of you, so the screen has to
-- be buildable against something. Most of it can be: a seeded friend exercises
-- the list, the card, an incoming request and the inbox without anyone signing
-- in twice.
--
-- More to the point, **some of these states cannot be produced by hand at all**.
-- A lapsed friend needs somebody to stop reading for four days, and a friend in
-- another timezone needs somebody in another timezone. Waiting is not a test
-- plan, so they are written down instead.
--
-- Safe to run more than once: every insert is keyed on a fixed id and upserts.
-- `friends-demo-teardown.sql` removes all of it.
--
-- These are real rows in a real database, deliberately. They are also obviously
-- fake: every address is @bibley.invalid, a reserved TLD that can never be
-- delivered to, and every handle starts with demo_.

do $$
declare
  -- The account these four attach themselves to.
  me uuid;
  hana uuid := '00000000-b1b1-4000-8000-000000000001';
  marc uuid := '00000000-b1b1-4000-8000-000000000002';
  ruth uuid := '00000000-b1b1-4000-8000-000000000003';
  sam  uuid := '00000000-b1b1-4000-8000-000000000004';
  note_id uuid := '00000000-b1b1-4000-8000-00000000000a';
begin
  select id into me from auth.users where email = 'charbeljdagher@gmail.com' limit 1;
  if me is null then
    raise exception 'no account found to attach the demo friends to';
  end if;

  insert into auth.users (id, email, aud, role) values
    (hana, 'demo-hana@bibley.invalid', 'authenticated', 'authenticated'),
    (marc, 'demo-marc@bibley.invalid', 'authenticated', 'authenticated'),
    (ruth, 'demo-ruth@bibley.invalid', 'authenticated', 'authenticated'),
    (sam,  'demo-sam@bibley.invalid',  'authenticated', 'authenticated')
  on conflict (id) do nothing;

  insert into public.profiles (user_id, handle, display_name, visibility) values
    (hana, 'demo_hana', 'Hana', 'reading'),
    (marc, 'demo_marc', 'Marc', 'reading'),
    -- Ruth is the one who does not want to publish numbers, so the card has to
    -- work with almost nothing in it.
    (ruth, 'demo_ruth', 'Ruth', 'quiet'),
    (sam,  'demo_sam',  'Sam',  'reading')
  on conflict (user_id) do update
    set handle = excluded.handle,
        display_name = excluded.display_name,
        visibility = excluded.visibility;

  -- Hana, Marc and Ruth are friends. Sam has asked and is waiting, so the
  -- accept control has something real to act on, and so the pending case that
  -- must reveal nothing is on screen rather than only in a test.
  insert into public.friendships (user_a, user_b, requested_by, status, accepted_at) values
    (least(me, hana), greatest(me, hana), me,  'accepted', now() - interval '40 days'),
    (least(me, marc), greatest(me, marc), marc,'accepted', now() - interval '12 days'),
    (least(me, ruth), greatest(me, ruth), me,  'accepted', now() - interval '3 days'),
    (least(me, sam),  greatest(me, sam),  sam, 'pending',  null)
  on conflict (user_a, user_b) do update
    set status = excluded.status,
        requested_by = excluded.requested_by,
        accepted_at = excluded.accepted_at;

  insert into public.progress
    (user_id, last_read_day, tz_offset, streak_current, streak_longest,
     chapters_read, books_done, plan_id, plan_percent, current_book, current_chapter)
  values
    -- Tokyo. Her day rolls over nine hours before yours, so for most of a UTC
    -- afternoon her "today" is a date that has not started for you. Computing
    -- the dot against your own midnight is what this row exists to catch.
    (hana, ((now() at time zone 'UTC') + interval '540 minutes')::date, 540,
     23, 23, 512, 11, 'full_arc', 38, 'Luke', 9),
    -- Lapsed four days ago, and the hard case in the whole design: he opens a
    -- screen where everybody else is still going. His current streak is zero
    -- and his longest is not, which is the shape the card has to handle without
    -- printing a nought at somebody.
    (marc, (current_date - 4), -240,
     0, 18, 207, 4, 'new_testament_first', 15, 'Acts', 12),
    -- Quiet. Everything but the day is null, because a quiet reader's numbers
    -- are never uploaded rather than uploaded and hidden.
    (ruth, current_date, 60,
     null, null, null, null, null, null, null, null),
    -- Sam is only pending, so this row must stay invisible until it is
    -- accepted. It is here precisely so that "pending reveals nothing" is
    -- falsifiable on screen and not just in the test suite.
    (sam, current_date, 0,
     7, 7, 88, 2, 'full_arc', 6, 'Genesis', 30)
  on conflict (user_id) do update
    set last_read_day = excluded.last_read_day,
        tz_offset = excluded.tz_offset,
        streak_current = excluded.streak_current,
        streak_longest = excluded.streak_longest,
        chapters_read = excluded.chapters_read,
        books_done = excluded.books_done,
        plan_id = excluded.plan_id,
        plan_percent = excluded.plan_percent,
        current_book = excluded.current_book,
        current_chapter = excluded.current_chapter;

  -- One verse in the inbox, so the thing friends exist for is on screen from
  -- the first render rather than after two accounts have been wired together.
  insert into public.passages
    (id, from_user, to_user, book, chapter, from_verse, from_offset, to_verse, to_offset, thought)
  values
    (note_id, hana, me, 'John', 15, 12, 0, 12, 62,
     'Read this on the train and thought of you.')
  on conflict (id) do nothing;

  -- Two on the board, so the verse of the day is not an empty card. Hana's is
  -- dated to her own day, which is already tomorrow at +540, and that is the
  -- case the board has to survive: filtering on your own date would hide it.
  insert into public.broadcasts (user_id, day, book, chapter, from_verse, to_verse, thought)
  values
    (hana, ((now() at time zone 'UTC') + interval '540 minutes')::date,
     'Isaiah', 40, 31, 31, 'Carried me through this week.'),
    (marc, current_date, 'Lamentations', 3, 22, 23, null)
  on conflict (user_id, day) do update
    set book = excluded.book,
        chapter = excluded.chapter,
        from_verse = excluded.from_verse,
        to_verse = excluded.to_verse,
        thought = excluded.thought;

  raise notice 'seeded four demo friends';
end $$;

select p.handle, p.display_name, p.visibility, f.status,
       g.last_read_day, g.tz_offset, g.streak_current, g.current_book, g.current_chapter
from public.profiles p
join public.friendships f on (f.user_a = p.user_id or f.user_b = p.user_id)
left join public.progress g on g.user_id = p.user_id
where p.handle like 'demo_%'
order by p.handle;
