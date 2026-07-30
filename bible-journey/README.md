# Bibley, reading journey

A single-user, local-only tracker for a specific Bible reading plan: John already read, then 12
ordered phases covering the other 65 books and 1,168 chapters.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run build` produces a static `dist/` you can serve from
anywhere if you'd rather not run the dev server.

## How it works

- **Stack:** Vite + React + TypeScript. No backend, no accounts, no network calls at runtime.
- **Storage:** everything lives in one `localStorage` key, `bible-journey/v1`, as a single JSON blob:
  `{ version, read, notes, startedAt, backedUpAt }`. Export and restore are wired to that exact
  shape, so a downloaded file is a complete journal.
- **Durability:** three layers. `bible-journey/v1.backup` holds the previous day's copy, written
  before the first save of each new day. A primary record that exists but will not parse is copied
  to `bible-journey/v1.corrupt.<timestamp>` instead of being overwritten, and the app falls back to
  the daily copy. The app also calls `navigator.storage.persist()` to ask the browser not to evict
  the origin. Manual export stays the only real off-device backup.
- **Read map:** `read` is keyed `"<Book>|<chapter>"` and holds the local day (`YYYY-MM-DD`) the
  chapter was marked. John's 21 chapters are seeded with `null`, which is what "read before the
  journal started" means. They count toward totals but never toward streaks, pace, or charts.
- **Streaks:** consecutive days present in the read map. The current streak survives a day where
  you haven't read _yet_ (gap of 1) and resets once a full day is missed.
- **Daily verse:** `quoteForDay` hashes the date string (FNV-1a) and mods into a 128-verse KJV list,
  so the verse is stable all day and needs nothing stored. Each verse carries a `context` line
  naming the speaker, the audience, and the situation.
- **Marking:** three routes, because tapping 150 tiles is not a plan. The home card marks the next
  1, 3, 5, or 10 chapters in sequence; each book has a "read through chapter N" slider; the tile
  grid stays for corrections. Every bulk change is reversible from the undo bar.
- **Suggestion:** the next three unread chapters in plan order. Nothing is ever locked. Phases are
  labelled, not gated, and you can mark anything at any time.
- **Touch:** all form controls are 16px on coarse pointers, which is what stops iOS from zooming
  into a focused field and leaving the page pannable sideways.

## Sync

Optional and local-first. Without a session the app is exactly what it was: local storage only.
Sign in and the same journal is mirrored to Supabase so a phone and a laptop stay in step.

- **Auth:** magic link, no passwords stored anywhere.
- **Shape:** one row per user in `journals` (`user_id`, `data` jsonb, `updated_at`), protected by
  row-level security. The publishable key is public by design; the policies are the boundary.
- **Merge, not overwrite.** `mergeJournals` unions the read maps (earliest date wins, `null` from
  the John prologue outranks any date) and resolves notes per book and chapter by `updatedAt`.
  A sync can only add progress.
- **The tradeoff:** unmarking does not travel. Clear a chapter on one device while another still
  has it and the next merge restores it. Chosen deliberately, since losing a streak is worse than
  re-clearing a chapter.
- **When it runs:** on sign-in, when the tab regains focus, and 1.5s after any local edit.

Configure with `.env.local` (see `.env.example`). Leave it unset and the sync UI reports that the
app is local-only rather than breaking.

## Deploying

Any static host works. For Vercel: import the repo, set the **Root Directory** to `bible-journey`,
framework preset Vite, and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as
environment variables. Then add the deployed origin to Supabase under Authentication, URL
Configuration, or magic links will bounce to the wrong place.

## Layout

```
src/
  data/plan.ts      the 12 phases verbatim, plus derived lookups (sequence, counts)
  data/quotes.ts    embedded KJV verses
  lib/              dates, storage, progress/streak/pace math, quote hashing
  state/            reducer + context; useStore is its own module for fast refresh
  components/       journey pieces (phase, book row, chapter grid, notes, quote)
  views/            Journey, Notes, Stats
  styles/app.css    tokens and all styling
```

## Brand assets

`brand/logo-source.png` is the master. Everything shipped in `public/` is generated from it:

```bash
npm run icons
```

That writes `icon-32` (favicon), `icon-64` (header mark), `icon-180` (iOS home screen),
and `icon-192` / `icon-512` (web manifest). The script quantizes to a palette, which takes the
512px icon from 345 KB to 62 KB with no visible loss at icon sizes. Replace the source file and
re-run rather than hand-editing anything in `public/`.

## Design

Red (`#c81d25`) carries the weight: hero, chapter tiles, active nav, chart series. Yellow
(`#f7b801`) is rationed to progress fills, the current-phase tag, the streak flame, today's bar, and
the quote card. Backgrounds are warm near-black (`#1a1512`) and cream (`#f7f2e9`). Headings are
Fraunces, body is Inter, both self-hosted via `@fontsource-variable` (no CDN).
