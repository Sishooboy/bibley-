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

## Design

Red (`#c81d25`) carries the weight: hero, chapter tiles, active nav, chart series. Yellow
(`#f7b801`) is rationed to progress fills, the current-phase tag, the streak flame, today's bar, and
the quote card. Backgrounds are warm near-black (`#1a1512`) and cream (`#f7f2e9`). Headings are
Fraunces, body is Inter, both self-hosted via `@fontsource-variable` (no CDN).
