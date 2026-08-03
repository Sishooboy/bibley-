# Bibley

A Bible reading tracker. The reader picks one of three ordered plans, marks chapters as they go,
keeps notes, and builds a streak. Progress lives in a Supabase account so a phone and a laptop stay
in step. Long-term goal is an App Store release via Capacitor.

The app is in `bible-journey/`. The repo root holds this file and the original brief
(`claude_code_prompt_bible_app.md`).

## Commands

Run these from `bible-journey/`.

```bash
npm run dev      # vite --host, so a phone on the same wifi can reach it
npm run build    # tsc -b && vite build, run before pushing anything substantial
npm run lint     # oxlint
npm test         # vitest run, covers merge, streaks, plan invariants and the text
npm run bible    # re-download public/bible/ from the WEB. Output is committed, so rarely needed
npm run preview  # serves dist on 4173, the only way to exercise the service worker
npm run icons    # regenerate public/icon-*.png from brand/logo-source.png
```

The service worker is production only, so `npm run dev` never has one in front of it. To test
offline behaviour, build, `npm run preview`, then stop the server and reload the page.

## Stack

Vite, React 19, TypeScript, recharts, `@supabase/supabase-js`. Fraunces and Inter self-hosted via
`@fontsource-variable` (no CDN). No CSS framework: one stylesheet, `src/styles/app.css`, with
design tokens at the top.

## Services

| Thing | Where |
|---|---|
| Database and auth | Supabase project `bibley`, ref `jneqppzcjbdafciqdkij`, region `ca-central-1` |
| Hosting | Vercel, root directory `bible-journey`, deploys on push to `main` |
| Live URL | https://bibley-charbeljdagher-4033s-projects.vercel.app |
| Repo | https://github.com/Sishooboy/bibley- |
| Sign-in | Google OAuth only, via Supabase |

Env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` live in `.env.local` (gitignored)
and in Vercel. **Vite bakes them in at build time, so changing one in Vercel does nothing until you
redeploy.**

## Architecture

- **The text lives in `public/bible/`**, one JSON file per book, World English Bible, public domain.
  It is fetched a book at a time rather than bundled: 3.9 MB has no business in the JS. `src/lib/bible.ts`
  caches in memory and dedupes concurrent loads, and the service worker keeps every book you open,
  so a book you have read once reads again on a plane. **A null verse is deliberate**: verse
  numbering follows the King James tradition, and four numbers (Luke 17:36, Acts 8:37, 15:34, 24:7)
  have nothing behind them in this translation's source. The slot stays so later numbering is right,
  and the reader skips it. `bible.test.ts` pins that list, so replacing the text trips a test rather
  than silently shifting verse numbers.
- **Highlights are the chapter rules, not the note rules.** They carry an id, they union on merge,
  and deleting one writes a tombstone in `removedHighlights`, because an absent highlight is
  indistinguishable from one the other device has not seen. Exactly the bug unmarking a chapter
  had. Positions are `{verse, offset}` character offsets *inside a verse*, never anything derived
  from the DOM, so they survive a re-render and a device swap. **`data-verse` goes on the text span,
  not the paragraph**: put it on the paragraph and the verse number counts as characters, so every
  highlight lands one place off, or two past verse nine.
- The shareable card in Stats is **drawn on a canvas**, not styled in the DOM and converted after.
  DOM-to-image loses the webfonts, and the card is almost entirely typography. Canvas text uses the
  document's loaded faces, so `readyFonts()` awaits them before the first stroke. It exports JPEG,
  not PNG: the full-bleed gradient makes the same image 1.4 MB as a PNG against 129 KB as a JPEG,
  and it exists to be sent to someone.
- The reader is a real modal: it claims `aria-modal`, so it moves focus in on open, traps Tab, and
  hands focus back to whatever opened it. Reading size lives in `prefs`, so it syncs with the
  account, and scales the whole passage through `--verse-scale` rather than the verses alone.
- Anything that changes a journal must be visible to `sameJournal` in `merge.ts`. It decides whether
  a change is worth writing to the server, so a field missing from it is a field that silently
  never syncs.
- `src/data/canon.ts` is the books in printed order, `src/lib/navigate.ts` the movement between
  them. Inside a book both orders agree; at a book's last chapter the plan decides if it contains
  that chapter, and printed order takes over if it does not. That is what lets a reader wander off
  to a book their plan omits and still have Next behave like a Bible.
- `src/data/plan.ts` holds the twelve-phase book data. `src/data/plans.ts` builds the three plans
  from it: `both` (66 books, 1,189 chapters), `nt` (27, 260), `ot` (39, 929).
- `src/state/store.tsx` is a reducer over `AppData`, persisted to `localStorage` under
  `bible-journey/v1`. `src/state/cloud.tsx` mirrors it to Supabase.
- `src/lib/merge.ts` reconciles two copies of a journal. Read it before touching sync.
- Views are `Journey`, `Notes`, `Stats`, `Settings`. Journey has its own hero and book rows. The
  other three share one system: `ViewHeader` for the masthead, `.card` for every panel, and the
  `Notes, Stats and Settings` block at the end of `app.css`. Change `.card` there and all three move
  together.
- **`.panel` belongs to Journey**, not to that block. It is the today card and the verse card, and
  it is defined near `.panels` around line 1080. Redefining it later in the file silently repainted
  the verse of the day cream on cream. Anything shared between Journey and the other three, `.select`
  and `.chartBlock__note` for instance, needs the same care: scope the new treatment, do not
  redefine the base.
- `public/sw.js` is hand written. Navigations are network first so a deploy lands as soon as there
  is a connection, hashed assets are cache first, and anything cross-origin is ignored outright so
  a Supabase response can never be served from cache. Bump `CACHE` to retire every old cache.
- **Marking records the day you read, not the day you tapped.** `logDay` in `store.tsx` is
  session-only React state and **null means "whenever today is"**, not today's date: the default
  has to keep tracking the clock so a session left open across midnight still logs correctly, while
  a date picked from the calendar is an absolute answer and is kept as given. `clampReadingDay`
  guards the input, since a future reading day would hold a streak open with nobody reading.
  `LogDayPicker` is a native date input, so every phone offers its own calendar, and it sits beside
  every marking control and turns gold when it is not today. `markedAt` still stamps the moment of
  the tap, because that is what settles a clear against a re-mark. Do not collapse the two.
- **Time of day is optional and stays optional.** `slots` on the journal, `logSlot` beside
  `logOffset`, four values, and no default. An untagged chapter is not missing anything, so nothing
  nags for it and the Stats panel counts only what was actually tagged rather than treating
  untagged as a fifth, largest category. On merge a tag follows its mark, and a tag whose chapter
  was cleared goes with it.
- `src/lib/motion.ts` holds `useReveal` (scroll-in stagger) and `useCountUp`. Both no-op under
  `prefers-reduced-motion`, and `useReveal` has a timeout that shows everything if the observer
  never fires, because `.reveal` starts at opacity 0 and a stuck observer is a blank page.

### The data model

One row per account in `public.journals`: `user_id`, `data` jsonb, `updated_at`. Row-level security
is the only thing protecting it, since the publishable key is public by design. The blob holds
`planId`, `read` (chapter key to day), `removed` tombstones, `markedAt` stamps, `notes`,
`startedAt`, `ownerId`, `prefs`.

Chapter keys are `"<Book>|<chapter>"`. Book names are unique across the Bible, which is what lets a
plan be a *view* over the journal rather than a container: switching plans never deletes anything,
chapters outside the new plan simply stop being counted.

### Merge rules, and why they are what they are

1. **Adds union.** Two devices marking different chapters both win. Earliest date per chapter.
2. **Deletions need tombstones.** An absent key is indistinguishable from one the other device has
   not seen, so unmarking writes `removed[key] = now`. Without this, sync resurrects cleared
   chapters.
3. **Marks carry timestamps.** `markedAt[key]` exists because comparing a deletion timestamp
   against a *reading day* ties when you clear and re-mark on the same day, and the tombstone wins.
   That was a real bug. The later action decides, and a mark that outlives its tombstone retires it.
4. **Sync flushes before it pulls.** `dirtyRef` in `cloud.tsx`. Pulling while a deletion is still
   only local merges it against a server copy that predates it.

Consequence to keep in mind: unmarking does not travel to a device that is offline with stale data.
Progress is never lost, only occasionally resurrected. That direction is deliberate.

## Gotchas that cost real time

- **iOS zooms any focused input under 16px**, and the zoomed page then pans sideways. All controls
  are 16px under `@media (pointer: coarse)`. Do not lower it.
- **A transformed ancestor becomes the containing block for `position: fixed`.** The app entrance
  animation is opacity-only for exactly this reason: a transform there silently broke the nav and
  the undo chip.
- **The dev server can serve a blank page** after heavy file rewriting. Stale module graph, not a
  code fault. Restart it before debugging.
- **Never `git add -A` blindly.** It has swept in a Google client secret (GitHub push protection
  caught it) and an exported journal (nothing caught it). Check `git status` first.
- Supabase free projects **pause after about a week of inactivity**. Data is retained. A paused
  project looks exactly like being offline from the client, so `describeSyncError` in `cloud.tsx`
  covers both with the same reassurance, and a failed sync retries on the `online` event.
- Google's consent screen shows the Supabase hostname because that is the OAuth redirect target.
  Only a custom domain changes it.

## Conventions

- **No em dashes anywhere**, in code, comments, UI copy, or commit messages. Use a comma or a
  second sentence.
- Comments explain *why*, not what. If a line looks odd, the comment says what would break.
- Red (`#c81d25`) dominates. Gold (`#f7b801`) is rationed: progress fills, streak flame, current
  phase, headline figures, section rules. Warm near-black and cream carry the rest.
- Fraunces for headings, nav and figures. Inter for body.
- Verify UI changes in the browser rather than assuming. The gate blocks a signed-out session, so
  temporarily bypassing it in `Gate()` is the usual trick. **Always revert the bypass.**

## State and what is next

Working: three plans with a chooser and a preparing transition, Google-only sign-in behind a gate,
per-account sync with the merge rules above, chapter marking by slider, quick amounts and tap,
undo, backdating so a chapter counts on the day it was read, an optional time of day, the text
itself in a reader that opens at any book and any chapter, highlighting with a thought attached,
notes, stats, streaks, an offline app shell, and a synced settings screen.

Notes and highlights share one feed in the Notes view, sorted by when each was last touched. They
are different objects with the same purpose, so the filter switches between them rather than
separating them into two screens.

**Daily reminders are locked**, behind `REMINDERS_UNLOCKED` in `src/lib/prefs.ts`. A web
notification only fires while the tab is alive, which is the wrong promise for a reminder, so the
settings panel shows a locked state and `reminderDue()` returns false before it reads any pref.
The gate is in `reminderDue` rather than the view so an account that already had the toggle on
stops being nudged too. Saved prefs are untouched, so flipping the flag restores each reader's own
time. Unlock it when the Capacitor shell lands. The in-app streak nudge on the journey is separate
and still runs.

Not built yet, roughly in order:

1. **In-app account deletion.** Required by App Store guideline 5.1.1(v). Must clear the Supabase
   row and the local cache.
2. **Onboarding** for a first-time reader who lands on the journey with no context.
3. **Capacitor shell**, which is what makes notifications fire with the app closed, and what
   unlocks reminders. Needs macOS or GitHub Actions to build, and $99/year for Apple.
4. **Sign in with Apple**, required by guideline 4.8 because Google sign-in is offered.
5. A custom domain, which fixes the consent screen and gives somewhere to host a privacy policy.

Backup and restore was removed on purpose once everything synced. The server row is now the only
copy that matters.
