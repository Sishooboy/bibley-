# Bibley

A Bible reading tracker. The reader picks a testament and then a reading order, marks chapters as
they go,
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
  It is fetched a book at a time rather than bundled: 4.4 MB has no business in the JS. `src/lib/bible.ts`
  caches in memory and dedupes concurrent loads, and the service worker keeps every book you open,
  so a book you have read once reads again on a plane. **A null verse is deliberate**: verse
  numbering follows the King James tradition, and 39 numbers have nothing behind them in this
  translation's source. Four are the familiar ones (Luke 17:36, Acts 8:37, 15:34, 24:7); the other
  35 are in Sirach, where the longer Greek text carries verses the shorter one this is translated
  from does not. The slot stays so later numbering is right, and the reader skips it.
  `bible.test.ts` pins the whole list, so replacing the text trips a test rather than silently
  shifting verse numbers.
- **The canon is Catholic, 73 books.** The seven deuterocanonical books are Tobit, Judith, Wisdom,
  Sirach, Baruch, 1 and 2 Maccabees, and they sit where a Catholic Bible prints them rather than in
  an appendix. Three of them are not separate books at all in that arrangement, and `INSERTS` in
  `scripts/fetch-bible.mjs` joins them on: Baruch 6 is the Letter of Jeremiah, Daniel 13 is Susanna,
  Daniel 14 is Bel and the Dragon, and the Greek additions to Esther carry their own numbering from
  10:4 to 16:24 so they land on the end of a Hebrew Esther. **Every join is an append**, which is the
  whole reason it is safe: Esther 1 to 10:3 and Daniel 1 to 12 do not move, so a highlight recorded
  before the canon changed still points at the same words. `git status` after re-fetching confirms
  it, only `daniel.json` and `esther.json` change.
- **The Prayer of Azariah is deliberately absent.** It is the one addition that is not an append: the
  Vulgate numbers it Daniel 3:24-90 and pushes the existing 3:24-30 down to 3:91 onwards, which would
  move verses a highlight might already point at. The source's copy is 64 verses against the 67 that
  numbering wants, so there is no mapping to be confident about either. Everything else in the
  Catholic Daniel is there.
- **The deuterocanonical books mark a plural "you" with an arrowhead**, `you⌃`, and nothing else in
  the Bible does. `clean()` in the fetch script strips it, and `bible.test.ts` fails if one survives,
  because seven books full of stray glyphs beside 66 clean ones reads as a broken font.
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
- **The journey is a spine, not a wall.** All thirteen phases used to render open: 73 book rows and
  418 words of reasoning before the reader had marked anything, 9,082px on a phone. A phase is a row
  now and only the current one is open, which is 2,694px. **`revealBook` in `JourneyView` opens the
  containing phase before it scrolls**, or the row the finder, the book grid and the today card are
  all aiming at is not in the document. That scroll lives in a `useLayoutEffect`, not a frame
  callback: opening a phase pushes everything below it down, so a scroll timed against the click
  lands a screen short, and rAF raced React's commit. It targets `block: 'start'` against a
  `scroll-margin-top` on `.book` that clears the pinned header, because centring a book whose panel
  is taller than the screen pushes its heading off the top.
- `BookGrid` is the whole plan as one square per book, printed order, built from the same per-book
  progress the phase rows use so the picture and the list cannot disagree. Tapping one goes through
  `revealBook`, so it reaches into a folded phase.
- **Finishing a book is the only milestone between one chapter and the whole Bible**, and it used to
  produce nothing. `booksFinishedBy` in `store.tsx` compares the read map before and after a mark,
  and the undo bar carries the result: it is already on screen at that moment, so a second toast
  would only fight it for the same corner. Keep the label short, it is a pill on a 375px screen.
- `src/data/canon.ts` is the books in printed order, `src/lib/navigate.ts` the movement between
  them. Inside a book both orders agree; at a book's last chapter the plan decides if it contains
  that chapter, and printed order takes over if it does not. That is what lets a reader wander off
  to a book their plan omits and still have Next behave like a Bible.
- `src/data/plan.ts` holds the printed book data and `BOOK_BY_NAME`, which is still what says how
  many chapters a book has. `src/data/plans.ts` is **gone**: the three hardcoded plans it built are
  now nine tracks resolved from `readingTracks.json` by `src/data/tracks.ts`.
- **The chooser is two steps, testament then order.** Nine orders on one screen is a wall, and on a
  phone it is a wall you scroll; it also matches how the question is actually asked, since nobody
  wants "Chronological" before they have decided on the Old Testament. `tracksFor` gives the primary
  tracks for a testament with the recommended one first, and that one is pre-selected so Begin is
  reachable in one tap. Settings groups the same nine the same way, under `.planGroup`, with the
  book and chapter count on the group heading rather than repeated on all three cards.
- **Daily Mix (`blended_daily`) is deliberately not offered yet.** It is the one `streams` track,
  it has no code path, and `activeTrack` silently falls back to the default for one, so listing it
  would start the reader on something other than what they picked. Both the chooser and Settings
  filter to `kind === 'phased'`. Offer it the moment its own path exists, and not before.
- `src/state/reducer.ts` holds every rule about how the journal changes; `src/state/store.tsx` is
  only the provider around it, persisting to `localStorage` under `bible-journey/v1`.
  **They are two files because exporting a plain function beside a component turns off Vite's fast
  refresh** for the whole module, and the reducer has to be exported so the tests can reach it.
  `src/state/cloud.tsx` mirrors the journal to Supabase.
- `src/lib/merge.ts` reconciles two copies of a journal. Read it before touching sync.
- Views are `Journey`, `Notes`, `Stats`, `Settings`. Journey has its own hero and book rows. The
  other three share one system: `ViewHeader` for the masthead, `.card` for every panel, and the
  `Notes, Stats and Settings` block at the end of `app.css`. Change `.card` there and all three move
  together.
- **Before adding a class to `app.css`, check the name is not already taken.** This has bitten
  twice: `.panel` (Journey's cards, redefined for the inner views, which repainted the verse of the
  day cream on cream) and `.planCard` (the testament chooser's cards, redefined for the Settings
  switcher, which made the chooser's plan names invisible at 1.09:1). Both were same specificity,
  later rule wins, no warning anywhere. A component refining its own earlier rule is fine, so read
  the output for names that belong to *two different components*. This finds them:
  `node -e "const L=require('fs').readFileSync('src/styles/app.css','utf8').split(/\r?\n/);const m=new Map();L.forEach((l,i)=>{const s=l.match(/^(\.[\w-]+(?:__[\w-]+)?(?:--[\w-]+)?)\s*\{/);if(s){(m.get(s[1])??m.set(s[1],[]).get(s[1])).push(i+1)}});[...m].filter(([,v])=>v.length>1).forEach(([k,v])=>console.log(k,v))"`
- **Every `:hover` rule sits inside `@media (hover: hover)`.** A phone has no hover, so it leaves
  the state applied after a tap: tapping a note twice left it beige until you touched something
  else. Guard any new hover rule the same way. This finds a stray one:
  `node -e "require('fs').readFileSync('src/styles/app.css','utf8').split(/\r?\n/).forEach((l,i)=>{if(/^[.#a-zA-Z\[]/.test(l)&&l.includes(':hover'))console.log(i+1,l)})"`
- **Contrast is measured, not judged.** Red and gold sit close in luminance, so eyeballing it fails.
  The masthead gradient's light end is `--red-700`, not `--red-600`, and its gold wash is 0.18, both
  chosen so every colour on it clears WCAG AA at the *brightest* point of the sweep rather than
  wherever the text happens to sit. `.eyebrow--onDark` is `--yellow-soft` for the same reason: full
  `--yellow` measures 3.8:1 there and 11px text needs 4.5. Solid `--red-600` carries white and cream
  but not gold; `--red-500` carries no text at all, so keep it for dots and fills.
- **`.panel` belongs to Journey**, not to that block. It is the today card and the verse card, and
  it is defined near `.panels` around line 1080. Redefining it later in the file silently repainted
  the verse of the day cream on cream. Anything shared between Journey and the other three, `.select`
  and `.chartBlock__note` for instance, needs the same care: scope the new treatment, do not
  redefine the base.
- `public/sw.js` is hand written. Navigations are network first so a deploy lands as soon as there
  is a connection, hashed assets are cache first, and anything cross-origin is ignored outright so
  a Supabase response can never be served from cache. Bump `CACHE` to retire every old cache.
  **Changing the text under `public/bible/` requires that bump.** Those filenames are not
  fingerprinted and they are cached first with no revalidation, so a reader who already had
  `esther.json` would keep the ten chapter one forever and find Esther 11 missing.
- **Chapters are named by number, not hit.** Two fields, "I read chapters N to M", plus the date.
  Three earlier designs all asked the reader to hit the chapter squares themselves, by tapping, then
  by dragging, then by double tapping each end. Every one was a poor target on a phone, and every
  one moved the layout as controls appeared and disappeared under a thumb. Fields cannot miss and
  cannot move. The commit bar is always rendered rather than shown on selection, for the same
  reason. The squares survive as `.strip`, which is `pointer-events: none`: purely a picture of
  where you have got to, which is why it can be 14px and show all 150 psalms in 206px without
  anyone needing to hit it.
- **The chosen reading day lasts one recording, then goes back to today.** It used to carry over,
  which was meant to help fill in a week and instead put later readings on a date the reader had
  stopped thinking about. `src/lib/readingLog.ts` answers the question the strip of squares cannot:
  `bookLog` groups a book by the day each chapter was read, `recentDays` does the same across the
  journal for Stats. A row in the book log loads its own chapters and day back into the fields, so
  a wrong date is two taps from being corrected.
- Notes are **rows, not cards**: one line each, opened one at a time, optionally grouped by book.
  Three cards used to fill a screen, which made finding anything a scroll.
- Stats is behind `React.lazy`, since recharts is a third of the JavaScript for a screen many opens
  never reach. Initial JS is 146 kB gzipped against 258 kB before.
- **Stats draws nothing until a chapter is read.** Every panel on it works perfectly well on an
  empty journal, which is the problem: a ring at nothing, a month of no bars, a heatmap of blanks,
  a finish date that cannot be worked out, and three zeros in the masthead. Nine panels agreeing
  there is nothing is the least encouraging thing a new reader can open, so `overall.planRead === 0`
  returns `NothingYet` instead: what will appear here, and one button into the next chapter. One
  chapter brings the real page back.
- **Stats says each number once.** Books done was on screen four times: the masthead chip, the hero
  facts, a stat square and a donut the size of a bar chart carrying the same two figures. The donut
  is gone and the square holds the completion ring instead, which is `StatRing` at `size={104}` with
  `tone="light"`. That tone is not decoration: the default track is white at 10% and the figure is
  gold, and neither shows on paper. The two long tables, the reading log and the phase table, end the
  page inside `FoldCard` and start shut, since both repeat row by row what the charts say in a
  picture. `FoldCard` is a real `<details>`, so it opens from a keyboard and find-in-page reveals it.
- The share card's lower half is **one square per book, in printed order**, filled from the bottom by
  how far in the reader has got. It is the only thing on the card that says something a percentage
  cannot: which parts, and how evenly. It went through two worse ideas first. Three most-read book
  bars, which repeated the figures above them, and then a passage the reader had highlighted, which
  put their own annotations on something made to be sent to other people. **Keep the card
  impersonal.** `gridLayout` sizes it, because the book count is 73 or 46 or 27 depending on the
  plan, and a grid that ran past the footer rule would print over it. The app mark is drawn at the
  head of the card from `/icon-192.png`, same origin so the canvas stays clean and `toBlob` still
  works, and `readyLogo()` resolves to null rather than rejecting if it cannot be fetched: a card
  with no mark beats no card. Everything in that header is measured off the thing before it, so a
  missing mark closes the gap instead of leaving a hole.
- **The welcome guide** is `src/components/Guide.tsx`, six stepped panels shown once. It is a panel
  rather than coach marks pointing at real controls, because a coach mark has to know where its
  target is, which breaks the first time a card moves, and it can say nothing at all about a screen
  you are not on. Each drawing is an inline SVG diagram of the screen it describes, so the shape you
  are shown is the shape you meet a minute later. Whether it has been seen is `prefs.guideSeenAt`,
  **synced on purpose**: being walked round the app again on the second device you sign into is an
  obstacle, not a welcome. Settings clears that field to show it again, which is the whole mechanism,
  and the component resets to step one when it opens because it stays mounted while hidden.
- `src/lib/bookSearch.ts` ranks books for the journey's finder: exact, then prefix, then substring,
  then subsequence, so "jo" puts John above 1 John and "hbk" still finds Habakkuk.
- **`src/lib/bibleSearch.ts` searches the text**, which is a different job: `bookSearch` finds a
  book by its name, this finds a phrase in 35,415 verses. `fold()` lowercases and maps the
  typographic marks onto the ones a keyboard has, and **every replacement in it has to be one
  character for one character**, because the index a hit reports is used to slice the *original*
  verse. Change the length and the highlight lands on the wrong words. A test pins that.
  `BibleSearch` runs it a book at a time through `loadBook`, so a search warms the cache the reader
  uses and the first one pulls the rest of the Bible, which is why it reports progress and can be
  stopped. It runs on submit, not on keypress: 73 books a keystroke is not a search.
- **The reader's grid needs `grid-template-columns: minmax(0, 1fr)`.** Without it the implicit
  column is `auto`, meaning max-content, so the header's widest possible layout decides how wide the
  whole reader is. Adding one control to that bar pushed it 53px off a 375px phone.
- `ErrorBoundary` wraps the app in `main.tsx` and each view in `App.tsx`, the inner one **keyed by
  view** so switching tabs remounts it and clears the error. A throw in one screen costs a panel
  rather than the white page React otherwise leaves, which looks exactly like lost data. It is the
  one class component in the app, because `getDerivedStateFromError` has no hook.
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
  **`useReveal` marks with `data-in`, never a class.** React owns `className` on every element that
  uses it and rewrites the whole attribute when the prop changes, so a class added from outside is
  destroyed the moment the component adds one of its own, and by then the element has been
  unobserved and the timeout has run, so nothing puts it back. It stays at opacity 0 for good. That
  is what turned an opened note into a blank sand block: opening it adds `entry--open`, and what you
  were looking at was `.entryList`'s `--line` background through an invisible row. `motion.test.ts`
  pins the marker and checks the stylesheet still reads the same one.
- **The five sounds in `src/lib/sound.ts` are synthesised, never loaded.** Oscillators and one noise
  buffer, which is +1.6 kB gzipped against shipping five files, carries no licence into an App Store
  build, and lets a chime be tuned by editing a number rather than re-exporting a wav. A bell is
  `PARTIALS`, inharmonic ratios above the strike tone that decay faster than it does, and a tick is
  filtered noise over a pitched thud: the noise alone is a click and the sine alone is a beep.
  **Web Audio and nothing else, because that is what respects the iOS silent switch.** An `<audio>`
  element is the known way to play through a silenced phone, so do not introduce one; the Capacitor
  shell decides this natively instead, through the audio session category, and needs checking when
  it lands. `MASTER` was **measured, not judged**, the same way contrast is: rendered through an
  `OfflineAudioContext`, 0.5 put the chapter tick at -20 dBFS, which vanishes under a phone speaker.
  0.9 puts the book bell at -9.6 and the tick at -14.9, which is where interface sound sits, and
  still leaves 8.7 dB of headroom. `schedule()` is exported so the voices can be rendered offline
  and measured rather than only listened to.
- **One tap, one sound**, decided by `chooseCue`: plan, then book, then streak, then chapter.
  Finishing a book on a day that also extends a streak is otherwise three cues at once, which
  arrives as noise rather than as three pieces of good news, and marking five chapters is one tick
  rather than five. The streak rung needs a *strict increase*, so a second chapter the same day and
  a backdated one that fills no gap both stay quiet. Clearing and undo share the chapter tick pitched
  down: marking that made a sound while unmarking made none read as a tap that had failed.
- **The cue lives on the reducer's `State`, never on `AppData`, and it must stay that way.**
  `normalize()` is a whitelist and `cloud.tsx` upserts the whole row, so a cue that reached the
  journal would sync and ring a bell on the other device for something nobody there had done. For
  the same reason `mergeRemote` and `importData` are silent: a pull can finish a book and extend a
  streak, but it happened somewhere else. The cue carries a counting `id` because the name alone
  cannot tell two identical marks apart, and an effect watching a string would fire once and leave
  the second chapter in silence.
- Sound is opened on the **first gesture anywhere**, by `primeSound`, not on the first cue. Every
  cue is downstream of a tap, but React flushes effects after the handler returns, which is late
  enough for Safari to refuse the resume and leave the app permanently silent. Settings switching
  the toggle on calls `setSoundEnabled` directly before playing its preview, for the same reason:
  the effect that watches the pref has not run yet while the gesture is still live.

- **Reading a chapter aloud is `speechSynthesis`, the device's own voices.** Nothing is downloaded,
  nothing is paid for per chapter, no API key has to live in a public bundle, and it works offline
  once the book is cached. A cloud voice would sound better and would need a backend, a key and a
  bill, none of which this app has. `toPieces` splits a chapter **verse by verse**, which is what
  lets `onstart` say which verse is being read, and that is what lights up `data-speaking`. It also
  sidesteps Chrome cutting off any single utterance after about fifteen seconds. A verse longer than
  240 characters is split again at a sentence end, and both halves keep the same verse number, or
  following along would jump to a verse that does not exist. **Every branch of that split has to
  give a positive index**: a bare `lastIndexOf` returns -1 when it finds nothing, and slicing on
  that drops a character off one piece and repeats it on the next, which is inaudible in testing and
  wrong in every verse. A test pins that nothing is lost.
- **Verses are spoken one at a time and chained on `onend`, never queued up front.** Queueing the
  whole chapter works on desktop Chrome and is unreliable on iOS Safari, which fires `onstart` for
  some utterances and not others: the audio kept going while the highlight froze on verse one. The
  chain sets the verse when a piece is *scheduled* rather than in `onstart`, for the same reason, and
  a highlight a beat early is nothing beside one that never moves. `onend` chains through a
  `setTimeout(0)`, because iOS refuses a `speak` issued from inside `onend` often enough to strand a
  chapter half read.
- **`voiceScore` picks the voice, not the browser.** Left alone every platform hands back its first
  voice, which is always one of the old compact ones, while the good voices sit unused further down
  the same list. They are recognisable by name, because every platform labels them Enhanced, Premium,
  Natural or Neural. This is the single biggest difference between read-aloud being worth using and
  sounding like 1998, and it costs nothing. Quality deliberately outweighs `localService`: a network
  voice needs a connection, which this app otherwise avoids relying on, but a voice nobody wants to
  hear is worth less than one that occasionally cannot load. The Settings card also says where to
  download the better ones, which is the other half of the same answer.
- **Following along scrolls `reader__body` itself, not `scrollIntoView`.** That walks every
  scrollable ancestor and, inside a fixed modal, drags the page behind it around too. It targets a
  third of the way down rather than centred, because what you want in view while something is read
  to you is the verse and the ones after it.
- **The transport lives inside `reader__top`, with the header.** `.reader` is a three row grid and
  its middle row is `minmax(0, 1fr)`, which permits zero: a fourth child took that row, flattened to
  17px, and its 44px buttons hung over the chapter heading while the text kept the `auto` row.
  Anything else pinned to the top of the reader belongs in that wrapper, not beside it.
- Every control in the reader bar is the **same 38px circle**, and the transport buttons are 44px,
  which is the smallest thing a thumb reliably hits. The transport was 30px and sized to look neat
  in a thin bar, which is the wrong thing to optimise for a control you reach for while something is
  already playing. On a phone the bar tightens its gaps rather than letting the book name collapse:
  at the desktop gap, Psalms rendered as "P..", and the book name is the one thing there that has to
  stay readable.
- The read-aloud keep-alive (`resume()` every 8s) is Chrome's long-standing stall, and it **only
  runs while the status is `speaking`**. Poking a queue the reader deliberately paused would start
  it again on its own, which is the one way this feature could feel possessed.
- **The voice is device-local and the speed is synced.** A voice on an iPhone does not exist on a
  Windows laptop, so carrying that choice across would only ever resolve to a fallback; pace is
  about the person, so `prefs.speechRate` travels. Same reasoning as `loadNotifiedDay`.
- **The streak animation reads the cue channel the sounds use**, exposed as `cue` on the store, so
  one moment drives both rather than two systems separately noticing the same event and disagreeing
  about when. It is four small things: the flame swells and warms, the number counts up through
  `useCountUp`, today's cell fills, and four sparks leave the flame. **Restarting a CSS animation
  needs the element replaced**, so the flame is keyed on a burst counter; re-setting an attribute it
  already has does nothing, and a second streak would be silent while the bell still rang.
  `prefers-reduced-motion` was designed in rather than bolted on: no swell, no bounce and no sparks
  at all, but today's cell still changes colour, because that is the record of having read today and
  not decoration.

### The data model

One row per account in `public.journals`: `user_id`, `data` jsonb, `updated_at`. Row-level security
is the only thing protecting it, since the publishable key is public by design. The blob holds
`planId`, `read` (chapter key to day), `removed` tombstones, `markedAt` stamps, `notes`,
`startedAt`, `ownerId`, `prefs`.

Chapter keys are `"<Book>|<chapter>"`. Book names are unique across the Bible, which is what lets a
plan be a *view* over the journal rather than a container: switching plans never deletes anything,
chapters outside the new plan simply stop being counted.

### Merge rules, and why they are what they are

1. **Adds union.** Two devices marking different chapters both win.
2. **Deletions need tombstones. All three kinds.** An absent thing is indistinguishable from one the
   other device has not seen, so deleting writes the date it happened: `removed` for chapters,
   `removedHighlights` by id, `removedNotes` by target. Without one, sync resurrects it. Notes were
   the last to get this and went years without: deleting a note only emptied the local array, so the
   next pull unioned it straight back off the server. **`removedNotes` is keyed by what the note was
   about, `"John|3"` or `"John|book"`, not by id**, because that is what `mergeNotes` dedupes on: two
   devices can each write the first note on John 3, only one survives the merge, and an id-keyed
   tombstone would name the one that did not. Emptying the note box deletes too, so it buries the
   note the same way, and writing on that chapter again retires the tombstone.
3. **The later mark decides the reading day.** `mergeRead` used to keep whichever day was earlier,
   which silently threw away corrections: re-date a chapter forward and the next sync put the old
   day back, so it looked as though marking had not registered at all. `markedAt` says which side
   spoke last, and a correction is by definition the later statement. Only journals with no
   timestamps on either side fall back to earliest-wins. One chapter, one day, last word wins.
4. **Marks carry timestamps.** `markedAt[key]` exists because comparing a deletion timestamp
   against a *reading day* ties when you clear and re-mark on the same day, and the tombstone wins.
   That was a real bug. The later action decides, and a mark that outlives its tombstone retires it.
5. **Sync flushes before it pulls.** `dirtyRef` in `cloud.tsx`. Pulling while a deletion is still
   only local merges it against a server copy that predates it.

Consequence to keep in mind: unmarking does not travel to a device that is offline with stale data.
Progress is never lost, only occasionally resurrected. That direction is deliberate.

## Gotchas that cost real time

- **iOS zooms any focused input under 16px**, and the zoomed page then pans sideways. All controls
  are 16px under `@media (pointer: coarse)`. Do not lower it. **The zoom lock is not a licence to**,
  because the half of it that iOS honours is not the half that would help here.
- **The page is held at 1:1**, in three places that each cover a different browser. The viewport
  meta carries `user-scalable=no, maximum-scale=1`, which Android and every webview honour and
  **iOS Safari has ignored since iOS 10**; `lockZoom()` in `src/lib/zoom.ts` refuses WebKit's
  `gesturestart`, which is the only thing that stops a pinch there; and `touch-action: manipulation`
  on `html` takes away double tap to zoom, which is the one that gets triggered by accident.
  `manipulation` and never `none`: `none` kills scrolling, which is how the old drag-to-select
  trapped the page inside the Psalms grid. `touch-action` does not inherit, so a child computing
  `auto` is expected and fine, the browser intersects the whole ancestor chain at hit-test time.
  None of this touches desktop browser zoom, or the system text size, and the reader's own four step
  text size is the accessible way to make the words bigger.
- **A transformed ancestor becomes the containing block for `position: fixed`.** The app entrance
  animation is opacity-only for exactly this reason: a transform there silently broke the nav and
  the undo chip.
- **`overflow-x: hidden` breaks every `position: sticky` under it.** Setting it forces the computed
  `overflow-y` to `auto`, so that element becomes a scrolling box and a sticky descendant sticks to
  a box nobody is scrolling, which means it does not stick at all. It was on `html` and `body` as
  drift protection, and it silently cost the app both of its sticky elements: the header and the
  notes filter bar were declared sticky and had never once stuck. **Use `overflow-x: clip`**, which
  clips identically and creates no scroll container. Nothing in the app overflows sideways at 375px
  anyway, measured with the guard off entirely, so it really is only belt and braces.
- `--topbar-h` is the pinned header's height and the offset everything else sticks below. It is one
  number because it was two: the notes filter bar hardcoded 62px and the header shrinks to 56px on a
  phone, which would show a strip of scrolling text between them. `.notesBar` goes `position: static`
  under 620px on purpose, since a 235px filter bar under a 56px header leaves no phone screen left.
- **The layout viewport does not shrink when the keyboard opens**, so anything pinned to the bottom
  of a `position: fixed` panel ends up behind the keys, and the browser's only recourse is to scroll
  the page around chasing the field. That is what put the highlight note box out of sight while it
  was being typed into. `useKeyboardInset` in `src/lib/keyboard.ts` reads `visualViewport` and the
  reader publishes it as `--keyboard` and `data-keyboard="open"`. **`offsetTop` counts as much as
  `height`**: once the browser has scrolled the visual viewport up, the keyboard is not simply the
  difference between the two heights. Under 100px is a URL bar collapsing, not a keyboard, and
  reacting to it makes the sheet twitch up and down while you are only reading. Any new panel that
  contains an input and sits at the bottom of the screen needs the same treatment.
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
  phase, headline figures, section rules.
- **No photography, anywhere.** The app is type and two colours, and a painting or a photograph
  dropped into it reads as pasted on. `src/components/Ornament.tsx` draws the cross from the app's
  own mark as SVG instead: it weighs nothing, stays sharp, takes its colour from what it sits in,
  and carries no licence into an App Store build. It is used in **two places only**, and that is
  the point of it: a watermark behind the plan chooser, and the finish line on the today card when
  a plan is complete. Anywhere else it stops being a mark and becomes wallpaper. Warm near-black and cream carry the rest.
- Fraunces for headings, nav and figures. Inter for body.
- Verify UI changes in the browser rather than assuming. The gate blocks a signed-out session, so
  temporarily bypassing it in `Gate()` is the usual trick. **Always revert the bypass.**

## State and what is next

Working: nine reading tracks behind a two-step chooser and a preparing transition, Google-only
sign-in behind a gate,
per-account sync with the merge rules above, chapter marking by slider, quick amounts and tap,
undo, backdating so a chapter counts on the day it was read, an optional time of day, the text
itself in a reader that opens at any book and any chapter, highlighting with a thought attached,
notes, stats, streaks, an offline app shell, a six panel welcome guide, full text search over all
73 books, five synthesised sounds with a synced mute switch, chapters read aloud with the verse
lighting up as it goes, a streak that celebrates itself when it grows, and a synced settings
screen.

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

**Next session: Daily Mix (`blended_daily`), the last track with no code path.** Four parallel
streams, Old Testament 3 a day, New Testament 1, a psalm and a proverb, with **position cursors
rather than next-unread**: the psalm advances one a day whatever the journal says, and a psalm
already read shows as read rather than skipping ahead. Completion counts the OT and NT streams
only. Until it exists, both the chooser and Settings filter it out rather than offering a track
that would quietly start you on The Full Arc.

Also worth doing: **phase progress weighted by chapters**, and never "phase 4 of 11" as the primary
number. A phase is not a unit of work, and eleven of wildly different sizes read as a progress bar
that lurches.

**Higgsfield was considered for the streak animation and rejected, and that is settled.** It
generates video, which cannot know the number, weighs megabytes against a bundle that keeps 4.4 MB
of Bible text out on principle, has one speed so reduced motion has no answer but to not play it,
and would read as pasted on for the same reason photography does. The hand-built version is four
CSS keyframes and `useCountUp`, and it cost nothing. If a future moment genuinely cannot be carried
that way, the escalation is **Rive** (around 100 kB of wasm, real state machines) or Lottie, both
still vector. A generative video tool earns its keep on an App Store preview clip, which is a
required asset anyway, not inside the app.

Not built yet, roughly in order:

1. **In-app account deletion.** Required by App Store guideline 5.1.1(v). Must clear the Supabase
   row and the local cache.
2. **Capacitor shell**, which is what makes notifications fire with the app closed, and what
   unlocks reminders. Needs macOS or GitHub Actions to build, and $99/year for Apple.
3. **Sign in with Apple**, required by guideline 4.8 because Google sign-in is offered.
4. A custom domain, which fixes the consent screen and gives somewhere to host a privacy policy.

**Export is the only undo there is.** `ExportPanel` in Settings writes the whole blob to a file,
because the server row is the only copy and a sync that writes the wrong thing cannot be walked
back. `buildExport` is a **deep copy**, not a spread: spreading leaves `read` and `notes` pointing at
the live objects, so the file would hold whatever the journal was when it serialised rather than when
the button was pressed. It is a bare journal plus `exportedAt` and `app`, not an envelope, because
`normalize()` takes any object with a top-level `read` map and drops the rest, so the file reads
straight back in. The filename matches `bibley-backup-*.json`, which the root `.gitignore` already
covers: an exported journal has been committed by accident before.

**`normalize()` is a whitelist and `cloud.tsx` upserts the whole row.** Between them, any client
running older code strips fields it does not know and writes the stripped journal back to the server.
So a new field must be **added to `normalize()` and shipped before anything writes it**, and `read`
must never leave the blob: `normalize()` returns null without it, and a null remote makes the sync
seed the row from local, which is how an account gets overwritten.

Backup and restore was removed on purpose once everything synced, and export brought back the half
that matters.
