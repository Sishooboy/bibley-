# Prompt for Claude Code: Bible Reading Journey App

Copy everything below the line into Claude Code to build the app.

---

## Project

Build a local web app that tracks my progress through a personal Bible reading plan. I've already read John. The plan covers all other 65 books across 12 ordered phases (data below). This isn't a generic "read the Bible in a year" app: the order, the phases, and the framing ("why here") are fixed and specific to me. Use the data as-is, don't regenerate or reorder it.

Pick whatever modern stack fits best for a fast, polished, single-user local app (a Next.js or Vite + React app is a safe default). No login, no multi-user auth. Data persists locally (browser storage, e.g. IndexedDB or localStorage, or a local JSON/SQLite file if the framework makes that easy) so my progress survives restarts. No backend server or hosted database needed.

## Design

Color scheme: red and yellow, but designed, not garish.

- Primary red: `C81D25` (or close), used with real dominance, not evenly split with yellow.
- Yellow: `F7B801` (or close) as a sharp accent, used sparingly (progress fills, highlights, badges, streak flame, the daily quote card) rather than as a second dominant color.
- Neutral base: near-black (`1A1512` or similar warm near-black) and off-white/cream for backgrounds, so red and yellow pop instead of fighting each other.
- Dark/light contrast: consider a dark hero/header area with light content sections underneath, or commit to dark mode throughout, either works, just be intentional.

Typography: use a clean, distinctive, "niche" font pairing, not a default system font and not Aptos/Calibri-generic.

- Headers: a characterful serif or editorial display font, e.g. **Fraunces** (Google Fonts) — has personality, feels appropriate for scripture without being churchy or clichéd. **Bricolage Grotesque** or **Space Grotesk** are good alternatives if a more modern/geometric feel is preferred.
- Body: a clean, highly readable sans, e.g. **Inter** or **General Sans**, for chapter lists, notes, and stats.
- Pull both from Google Fonts (self-hosted or `next/font` if using Next.js, don't just link the CDN).

General: no generic gradient hero images, no stock icon soup. Use simple geometric shapes, a consistent motif (e.g. numbered circles for phases, a subtle flame icon for streaks), and real whitespace. Avoid the AI-slop tells: no decorative accent stripes, no centered body paragraphs, no boilerplate card-with-shadow spam.

## Core data (use exactly this, don't invent a different order)

Already completed: **John** (21 chapters).

```json
[
  { "phase": 1, "title": "Foundations", "why": "You met Jesus through John. Now go back to the beginning: how the world was made, how it broke, and how God started rescuing it through one family and one nation. Every later book leans on this one.", "books": [ { "name": "Genesis", "chapters": 50 }, { "name": "Exodus", "chapters": 40 } ] },
  { "phase": 2, "title": "Finish the Gospels", "why": "You already have one full picture of Jesus's life. Mark moves fast and is action driven, Luke is the careful historian with the fullest birth narrative and parables, and Matthew was written for a Jewish audience and is packed with Old Testament fulfillment. Read these while the story is still fresh.", "books": [ { "name": "Mark", "chapters": 16 }, { "name": "Luke", "chapters": 24 }, { "name": "Matthew", "chapters": 28 } ] },
  { "phase": 3, "title": "The Early Church", "why": "What happened after Jesus left: the church is born, the gospel spreads, and Paul's story begins. This is the natural bridge into his letters later on.", "books": [ { "name": "Acts", "chapters": 28 } ] },
  { "phase": 4, "title": "The Law, Completed", "why": "The densest, most rule heavy books in the Bible. Placed here, after you already know the Exodus story and have met Jesus, so the sacrificial system reads as setup for something rather than rules in a vacuum.", "books": [ { "name": "Leviticus", "chapters": 27 }, { "name": "Numbers", "chapters": 36 }, { "name": "Deuteronomy", "chapters": 34 } ] },
  { "phase": 5, "title": "Kingdom History", "why": "The rest of Israel's story as one continuous narrative: conquest, judges, kings, a divided kingdom, and exile. It's a long stretch, but it moves once you're in it.", "books": [ { "name": "Joshua", "chapters": 24 }, { "name": "Judges", "chapters": 21 }, { "name": "Ruth", "chapters": 4 }, { "name": "1 Samuel", "chapters": 31 }, { "name": "2 Samuel", "chapters": 24 }, { "name": "1 Kings", "chapters": 22 }, { "name": "2 Kings", "chapters": 25 }, { "name": "1 Chronicles", "chapters": 29 }, { "name": "2 Chronicles", "chapters": 36 } ] },
  { "phase": 6, "title": "Wisdom Literature", "why": "A change of pace after all that narrative: prayer, poetry, and practical wisdom. Job fits here as a meditation on suffering, right after a long national history full of it.", "books": [ { "name": "Job", "chapters": 42 }, { "name": "Psalms", "chapters": 150 }, { "name": "Proverbs", "chapters": 31 }, { "name": "Ecclesiastes", "chapters": 12 }, { "name": "Song of Songs", "chapters": 8 } ] },
  { "phase": 7, "title": "Paul's Letters", "why": "Acts already introduced Paul, so his letters to the churches he planted make immediate sense. Ordered by weight: Romans first for his fullest theology, the shorter pastoral and personal letters last.", "books": [ { "name": "Romans", "chapters": 16 }, { "name": "1 Corinthians", "chapters": 16 }, { "name": "2 Corinthians", "chapters": 13 }, { "name": "Galatians", "chapters": 6 }, { "name": "Ephesians", "chapters": 6 }, { "name": "Philippians", "chapters": 4 }, { "name": "Colossians", "chapters": 4 }, { "name": "1 Thessalonians", "chapters": 5 }, { "name": "2 Thessalonians", "chapters": 3 }, { "name": "1 Timothy", "chapters": 6 }, { "name": "2 Timothy", "chapters": 4 }, { "name": "Titus", "chapters": 3 }, { "name": "Philemon", "chapters": 1 } ] },
  { "phase": 8, "title": "Major Prophets", "why": "The big, dense prophetic books. They explain the exile you just read about in the history books, so the context is still fresh.", "books": [ { "name": "Isaiah", "chapters": 66 }, { "name": "Jeremiah", "chapters": 52 }, { "name": "Lamentations", "chapters": 5 }, { "name": "Ezekiel", "chapters": 48 }, { "name": "Daniel", "chapters": 12 } ] },
  { "phase": 9, "title": "Minor Prophets", "why": "Shorter prophetic voices in the same world as the major prophets. Easier to move through quickly once you're used to the language.", "books": [ { "name": "Hosea", "chapters": 14 }, { "name": "Joel", "chapters": 3 }, { "name": "Amos", "chapters": 9 }, { "name": "Obadiah", "chapters": 1 }, { "name": "Jonah", "chapters": 4 }, { "name": "Micah", "chapters": 7 }, { "name": "Nahum", "chapters": 3 }, { "name": "Habakkuk", "chapters": 3 }, { "name": "Zephaniah", "chapters": 3 }, { "name": "Haggai", "chapters": 2 }, { "name": "Zechariah", "chapters": 14 }, { "name": "Malachi", "chapters": 4 } ] },
  { "phase": 10, "title": "Return From Exile", "why": "The other side of the exile: rebuilding. Placed after the prophets so the return actually feels like a resolution instead of a random detour.", "books": [ { "name": "Ezra", "chapters": 10 }, { "name": "Nehemiah", "chapters": 13 }, { "name": "Esther", "chapters": 10 } ] },
  { "phase": 11, "title": "The General Epistles", "why": "Letters from the other apostles, rounding out New Testament teaching after Paul.", "books": [ { "name": "Hebrews", "chapters": 13 }, { "name": "James", "chapters": 5 }, { "name": "1 Peter", "chapters": 5 }, { "name": "2 Peter", "chapters": 3 }, { "name": "1 John", "chapters": 5 }, { "name": "2 John", "chapters": 1 }, { "name": "3 John", "chapters": 1 }, { "name": "Jude", "chapters": 1 } ] },
  { "phase": 12, "title": "Revelation", "why": "The end of the story, deliberately last. Its imagery draws heavily on Ezekiel, Daniel, and the other prophets, so it lands harder once you've read them.", "books": [ { "name": "Revelation", "chapters": 22 } ] }
]
```

65 books, 1,168 chapters total across the 12 phases (already verified). Track progress at the chapter level within each book, and roll that up into book completion and phase completion.

## Features

**1. Journey map / home view**
Show all 12 phases in order, each with its books, a visual progress indicator per phase (e.g. filled ring or bar), and clear "current phase" highlighting. Completed phases, the in-progress phase, and locked/future phases should be visually distinct, but nothing should be truly locked, I should be able to jump ahead or read out of order if I want.

**2. Chapter-level tracking**
For each book, list its chapters as individually checkable/markable-read items (not just a single "mark book as done" toggle). Marking a chapter read should update book progress and phase progress live.

**3. Progress bars & streaks**
- Overall progress: chapters read / 1,168 (plus John, so really out of 1,189, with John shown as already complete).
- Per-phase and per-book progress bars.
- A reading streak counter (consecutive days with at least one chapter marked read), with the streak resetting if a day is missed. Show current streak and longest streak.

**4. Notes & highlights**
Let me attach a free-text note to any chapter or book (favorite verse, a thought, a summary). Notes should be viewable in a dedicated "My Notes" view, searchable/filterable by book or phase, not just buried per-chapter.

**5. Daily reading suggestion**
Since there's no fixed schedule, the app should suggest "today's reading": the next unread chapter(s) in sequence starting from wherever I've left off (respecting the phase/book order above). Let me accept it (mark as read directly from the suggestion) or skip/pick something else manually.

**6. Stats dashboard**
A dedicated stats/analytics view with: chapters read over time (simple chart, e.g. last 30 days), books completed vs. remaining, current pace (chapters/week average), and a rough "at this pace" completion estimate. Use real charts (e.g. a lightweight charting lib), not just numbers in boxes.

**7. Daily quote**
A "today's quote" card, prominently placed (e.g. on the home view), showing a Bible verse that changes once per day, deterministically, i.e. the same quote all day, a new one tomorrow, not re-randomized on every page load. Include a reasonably sized curated list of well-known verses (public domain translation, e.g. KJV or WEB) spanning both testaments, at least 50-100 quotes, embedded in the app (no external API dependency required, though an API is fine if it's reliable and free). Pick the day's quote via a deterministic function of the date (e.g. hash the date string, mod list length) so it's stable without needing to store which quote was shown.

## Data & storage

- No login, no accounts, single user (me).
- Persist all state locally: reading progress (per chapter), notes, streak history, and the app's own light cache (e.g. cached list of quotes) should all survive a browser refresh and app restart.
- Prefer a structure that would be easy to export/import later (e.g. a single JSON blob I could back up), even if that's just a "manual" future feature, not build now.

## Acceptance checklist (self-verify before calling it done)

- [ ] All 65 books and 1,168 chapters from the data above are represented exactly, nothing missing or duplicated, John shown as already complete.
- [ ] Marking a chapter read updates book progress, phase progress, overall progress, and the streak, immediately, without a page reload.
- [ ] Reload the browser/app: progress, notes, and streak are still there.
- [ ] Daily quote is the same across multiple reloads on the same day.
- [ ] Color usage actually looks like red is dominant with yellow as accent, not a 50/50 split, and text stays readable (check contrast) everywhere.
- [ ] Fonts load correctly (not falling back to system default) and headers/body are visually distinct from each other.
- [ ] Stats view renders a real chart with more than one data point (test by marking a few chapters read on different simulated days if needed).
