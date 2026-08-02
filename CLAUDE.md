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
npm run icons    # regenerate public/icon-*.png from brand/logo-source.png
```

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
- Supabase free projects **pause after about a week of inactivity**. Data is retained.
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
undo, notes, stats, streaks, and a synced settings screen.

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
