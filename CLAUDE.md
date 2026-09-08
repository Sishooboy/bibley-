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
npm run layout   # add paragraph structure to public/bible/ from the WEB's USFM. Also committed
npm run sections # import section headings into insights.json from the Berean. Also committed
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
- **The reader sets paragraphs, not one verse a line.** The source the text came from publishes
  verses and nothing else, so for a long time every verse was its own paragraph, which turns Mark
  into a numbered list and makes narrative look like unrelated facts. The World English Bible's own
  USFM carries the real structure, 9,254 paragraph marks and 23,331 poetry lines, and it is public
  domain like the text, so `scripts/build-layout.mjs` reads it off the source rather than guessing.
  Run it with `npm run layout` against an unzipped
  [eng-web_usfm](https://ebible.org/Scriptures/eng-web_usfm.zip).
- **`build-layout.mjs` never touches `chapters`, and verifies that it did not.** Highlights are
  `{verse, offset}` character offsets inside a verse string, so changing one character moves every
  highlight recorded in that verse and there is no way to notice afterwards. It adds a `layout` key
  and re-reads the verse text to compare before it writes. All 35,415 verse strings were checked
  against the previous commit as well, outside the script, the first time it ran.
- **`layout` is one character a verse**, which is what makes it affordable: 38 kB across the whole
  Bible, 0.8% of the text, small enough to live inside the book files rather than needing a fetch of
  its own. `p` prose, `P` prose opening a paragraph, `1` to `3` poetry at that indent, `4` to `6`
  the same after a stanza break. `blocksFor` in `src/lib/passage.ts` decodes it.
- **A verse belongs to exactly one block and is never split.** That is the constraint the whole
  design bends around: the reader still draws one `data-verse` span a verse, so a verse that ran on
  from prose into poetry is set as prose rather than broken across two elements, because a verse in
  two elements would need offsets that knew where the break was and every highlight already recorded
  would point at the wrong half. Verified end to end: a selection spanning two verses inside one
  paragraph still resolves to the right verse and offsets, and those offsets still index the source
  JSON exactly.
- **Thirteen chapters have no layout on purpose**, and they keep the old setting rather than a
  layout one verse out of step with the words. Esther 10 to 16 and Daniel 13 and 14 are the Greek
  additions, which this app appends as chapters and the USFM publishes as separate books; Sirach 20,
  23 and 33 and Romans 16 differ from that source by a verse or two. **The check is per chapter, not
  per book**, since a book that mostly agrees still has chapters that do not.
- **The section headings come from the Berean Standard Bible, which is public domain.** This was
  hand written for Mark first and that was the wrong answer: one book of seventy three is a
  mechanism, not a feature, and open anything else and there was nothing to see. Every heading a
  reader would recognise is copyrighted, the NIV, the ESV, the NASB and the Good News Translation
  all included, and the WEB has none of its own, so hand writing three thousand was the only path
  until the Berean turned up. It carries **3,017 `\s1` headings across all 66 protestant books**
  and eBible.org publishes it as **Public Domain**, contributed by BSB Publishing, LLC, which is
  the same footing the WEB text stands on. `copr.htm` in the archive says so twice.
  `scripts/build-sections.mjs` imports them, `npm run sections`, from an unzipped
  [engbsb_usfm](https://ebible.org/Scriptures/engbsb_usfm.zip). They live in `insights.json` under
  `sections`, keyed by chapter, as `{v, t, n?}`. **3,009 headings over 1,186 chapters.**
- **A heading opens a paragraph, breaking one if it has to.** The headings come from one book and
  the paragraphs from another: the Berean marks the sections, the WEB marks the paragraphs, and
  nine times in a hundred the two disagree about where a section starts. 91% land on a paragraph
  the WEB already opened; the other 9% force a break, which is what every printed Bible does with a
  heading anyway. `blocksFor` takes the heading verses as its third argument and the reader passes
  them, so **the builder and the renderer have to agree or the headings drift**, which is what
  `sections.test.ts` pins.
- **The 66 are covered and the deuterocanon is not.** The Berean is a protestant canon, so Tobit,
  Judith, Wisdom, Sirach, Baruch and 1 and 2 Maccabees have no headings, and neither do the eleven
  chapters where the Berean's versification differs: Esther 10 to 16 and Daniel 13 and 14, which
  are the Greek additions it does not carry at all, and Romans 14 and 16, where it moves the
  doxology. Per chapter, not per book, the same rule the layout follows.
- **The credit is not optional even though the licence says it is.** Both texts are public domain
  and neither asks for attribution, but taking three thousand headings from someone else's work and
  printing them unattributed beside a translation this app does credit would be the wrong way
  round. The reader's footer carries both, and a test keeps it there.
- **Notes are re-homed, never rewritten.** The 21 hand written "why this matters" notes were
  attached to hand written headings that no longer exist. `rehome` in the import script moves each
  onto the Berean heading that covers its verse, meaning the last heading at or before it, so a
  note written for the baptism stays on the paragraph the baptism is in even though the two books
  name that section differently. All 21 landed, 14 of them exactly. **The headings are the cheap
  half and the notes are the expensive half**, so a re-import replaces the headings wholesale and
  carries the notes across.
- **A heading and an explained key verse are one shape, not two.** `t` is the heading and `n` is the
  note that turns it into a moment worth stopping on. Splitting them would have meant authoring the
  same list of turning points twice and keeping the two in step by hand. About a quarter carry a
  note: a chapter where every heading demanded attention is a chapter nobody can read, and the note
  is shut until it is asked for, because a reader who came to read should meet a heading rather than
  a paragraph of commentary between them and the next sentence.
- **A heading's verse has to be the first verse of a block**, or it is drawn above the paragraph
  that contains it and lands several sentences early, attached to the wrong scene. Nothing throws
  and nothing looks broken. That used to be a rule the data had to keep, and three of Mark's
  eighty-one broke it; now it is a contract between `blocksFor` and the reader, since a heading
  forces the break itself. `sections.test.ts` builds the blocks the way the reader builds them and
  fails if any heading is not a block start, so **dropping the third argument anywhere is a failing
  test rather than a page of headings a paragraph early**.
- **The heading is apparatus and has to look like it.** Body face, small, uppercase, in the muted
  colour, and deliberately not scaled by `--verse-scale`: making the words bigger is about reading
  the Bible, not about reading the labels on it. The "Why this matters" control is `--red-700` and
  **not gold**, which is the case the rationing rule was written for: gold was the obvious choice
  for the app's one invitation inside the text and `--yellow-dim`, already the dark end of it,
  measured 2.64:1 on paper at 10.5px against the 4.5 that size needs. The gold survives where it can
  be a graphic rather than a word, on the note's own edge.
- **`.passage__toggle` names `text-transform` and `letter-spacing` rather than inheriting them.**
  The browser's own button styles set both, and a UA rule beats inheritance, so without those two
  lines a heading with a note was sentence case while a heading without one was uppercase: two kinds
  of heading rather than one that can be opened.
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
- Views are `Journey`, `Notes`, `Friends`, `Stats`, `Settings`. Journey has its own hero and book
  rows. The other four share one system: `ViewHeader` for the masthead, `.card` for every panel, and
  the `Notes, Stats and Settings` block at the end of `app.css`. Change `.card` there and all four
  move together.
- **Before adding a class to `app.css`, check the name is not already taken.** This has bitten
  twice: `.panel` (Journey's cards, redefined for the inner views, which repainted the verse of the
  day cream on cream) and `.planCard` (the testament chooser's cards, redefined for the Settings
  switcher, which made the chooser's plan names invisible at 1.09:1). Both were same specificity,
  later rule wins, no warning anywhere. A component refining its own earlier rule is fine, so read
  the output for names that belong to *two different components*. This finds them:
  `node -e "const L=require('fs').readFileSync('src/styles/app.css','utf8').split(/\r?\n/);const m=new Map();L.forEach((l,i)=>{const s=l.match(/^(\.[\w-]+(?:__[\w-]+)?(?:--[\w-]+)?)\s*\{/);if(s){(m.get(s[1])??m.set(s[1],[]).get(s[1])).push(i+1)}});[...m].filter(([,v])=>v.length>1).forEach(([k,v])=>console.log(k,v))"`
- **That one-liner only sees rules at column zero, so it is blind to media queries.** Every rule
  inside one is indented, and two rules for the same selector at the same specificity in different
  blocks are decided purely by which comes later in the file. This has cost real time twice now.
  `.btn--sm` set `padding` and `font-size` nine hundred lines after the `@media (pointer: coarse)`
  rule meant to bump it, so **every secondary button in the app, 41 of them, was a 12.5px label in a
  26px box on a phone**, and it looked like a design choice rather than a bug. Then a new
  `.statGrid` and `.statsHero__facts` for phones lost to the existing ones a thousand lines below.
  When a rule does not seem to apply, `grep -n` the selector across the whole file before assuming
  anything. `src/lib/buttons.test.ts` pins the orderings that matter, and its comments say what
  breaks when each one moves.
- **Every `:hover` rule sits inside `@media (hover: hover)`.** A phone has no hover, so it leaves
  the state applied after a tap: tapping a note twice left it beige until you touched something
  else. Guard any new hover rule the same way. This finds a stray one:
  `node -e "require('fs').readFileSync('src/styles/app.css','utf8').split(/\r?\n/).forEach((l,i)=>{if(/^[.#a-zA-Z\[]/.test(l)&&l.includes(':hover'))console.log(i+1,l)})"`
- **A button invites a press by saying what pressing it does.** That is the rule behind all four of
  the controls the app is built around, and it is why none of them is a plain label any more. The
  today button carries a second line, "29 verses, about 3 min", which is the cost of saying yes in
  the reader's own units, and it may only say it because `TodayCard` prefetches the day's book:
  `loadBook` on mount, about sixty kilobytes, which also means Read opens on the text instead of on
  "Opening Genesis". `readingMinutes` in `format.ts` promises whole minutes at 200 words a minute,
  a slow reader taking scripture in, and never less than one. Back and Next in the reader name
  their destination in the display face, with an eyebrow that says when it is a different book,
  because "Next" says nothing and "Exodus 1" is a small event; the name truncates and the chapter
  number never does. The mark button names the consequence: "41 more to finish Genesis" above
  "Mark as read", and on the last unread chapter of a book it becomes **"Finish Genesis"** with a
  gold edge, so the celebration behind that press is announced rather than sprung.
- **Every `.btn` presses.** `:active` scales to 0.97 fast and flat, and the base rule lets it back
  with a small overshoot, because a transition belongs to the state being entered: `:active` owns
  the press, the base owns the release. That overshoot is what reads as springy rather than sticky,
  and it is the only feedback a phone gives at all, since hover never happens there. Keyboard focus
  is a gold ring, so it reads as chosen rather than as an error outline.
- **A button is a raised thing, not a hole cut in the page.** The base was a transparent rectangle
  with a hairline border and a 4px corner, which is what a browser gives you for nothing, and beside
  the today button and the mark button it read as the one control nobody had got to. Three things
  carry it now: the **pill**, which is the only shape on the page that is not a panel, so a control
  never has to be identified by its border alone; **warm paper with a hairline of light along the
  top edge**, which says "this sticks up" at a fraction of the weight of a shadow big enough to say
  it alone, and which inverts on press so the light goes and the shadow moves inside; and the
  **display face**, because the app speaks in Fraunces wherever it is being deliberate. The reader's
  three controls keep an 8px corner rather than the pill, since they are 44 to 61px tall and a pill
  that tall is a lozenge. `.btn--onDark` is gone; nothing had ever used it, and `.guide__back` is
  the real on-dark case, carrying a tenth of white so a pill is visible on near-black without
  reading as a second primary beside Next.
- **`white-space: nowrap` on every button.** A label is the control's name and a name does not break
  in half: "Show the guide" was wrapping inside a settings row, which turned a pill into a lozenge
  with a hole in it. The buttons that look multi-line are grids stacking their own rows, so this
  does not touch them.
- **The gold focus ring needs the ink edge to be a ring at all.** Gold on cream measures 1.7:1,
  under the 3:1 a graphic needs, and `outline-offset` puts the page between the button and the ring,
  so there was nothing for the gold to sit against. Two pixels of `--ink-700` fill exactly that gap:
  8.7:1 for the gold against it, 14.9:1 for the ink against the page, and the colour stays the
  reward colour. `:focus-visible` is written **above** `:active` on purpose, because they share
  `box-shadow` and the press has to win while a focused button is held down.
- **Every hover excludes `:disabled` rather than being undone afterwards.** The old reset named one
  background, so it could only ever put the plain button back: a disabled primary still repainted
  itself under the cursor, because each variant names its own.
- **Everything in the app answers to a finger.** `.btn` had pressed since the day it was written
  and nothing else ever did, so there was one control that felt connected and about a hundred that
  did not: seventy-one book squares, fifteen phase rows, the nav, the switches, every row in Notes.
  `src/lib/press.ts` is **one delegated listener** on `window`, matching element types and ARIA
  roles rather than the app's class names, because a class list would be wrong the first time
  anyone added a component and nothing would fail to say so. `pointerdown` and not `click`, so the
  knock lands with the finger; capture, so a component calling `stopPropagation` cannot silence
  itself; passive, so it can never delay a scroll. It marks with **`data-press`, never a class**,
  the same reason `useReveal` does. `pointercancel` matters as much as `pointerup`: a press that
  turns into a scroll fires only the former, and without it the element stays visibly held down.
- **The knock has no pitch, and that is the whole design.** Every other sound in the app is tuned
  because every other sound means something. A tap means nothing happened, someone touched
  something, and the moment it carries a note it competes with the cues for the same job. It is
  noise through a closing lowpass, 35ms, so it is over before a cue triggered by the same press
  arrives. **Measured, not judged**, like `MASTER`: -33 dBFS against the quietest cue's -17.5,
  which is 15.5 dB down. It fires hundreds of times a session against the chapter tick's three, so
  it has to read as the texture of pressing rather than as a sound the app is making at you. It is
  deliberately **not a `Cue`**: nothing in the journal changed, so it is not the reducer's business,
  the same reasoning as the two insight chimes.
- **The tap's rate limit is on `performance.now()`, never `currentTime`.** An audio clock stops
  advancing while its context is suspended, which is what iOS does the moment the app is
  backgrounded, so a gap measured that way would still be reading the moment before the phone went
  in a pocket and would refuse every tap from then on.
- **The dip is scaled to what is moving.** 0.96 on a 1000px row is fifteen pixels of travel, which
  reads as the layout lurching rather than as something being pressed; a gesture does not get bigger
  with the screen. Buttons take 0.97, rows 0.985 and 0.994 once they are wide, and the 14px book
  squares take 0.88 because anything gentler is invisible at that size. The reader's own text is
  exempt: a verse carries a label for highlighting, and someone reading is dragging across words,
  so a knock per word would turn reading into typing.
- **The press block has to be last in `app.css`.** `[data-press]` is one attribute, 0,1,0, and it
  is overriding `transform` and `transition` on components that declare their own. Written where it
  read best, next to the buttons, it lost to every rule below it: `.book__row` sets a 260ms
  transition two thousand lines further down, so the 90ms press never finished before the finger
  came off and the row simply never moved. `src/lib/press.test.ts` pins it below every rule it has
  to beat, and each of its pins was checked by breaking the thing it claims to catch.
- **The today button's motion is one-shot.** The arrow beckons once, a second after the card lands,
  and a sheen crosses the button once. Both used to loop, which made them the only motion in the
  app that ran without being asked for, and a thing that repeats every few seconds is a thing you
  stop seeing. Once says "here" and gets out of the way.
- **Marking sweeps gold across the button, once**, driven by `data-just`, which `Reader` sets for
  under a second on marking and never on unmarking. Gold is the progress colour, and this is the
  progress fill happening in the one place you are looking. The done state sits on a gold tint
  with ink text: a gold check on cream was tried and measured 1.68 against the 3 a graphic needs.
  Every new small text here was measured against the gradient's brightest point, and two tints
  failed and became solid white: a white tint at 0.82 measured 3.86 and at 0.85 measured 4.47,
  against the 4.5 that small text needs.
- Back, Mark and Next are a **named-area grid**, mark across the top and the two destinations
  beneath, at every width. They were a flex row that wrapped when it had to, which put the primary
  action wherever the wrap left it. Each is 52 to 61px tall, above the 44 a thumb needs.
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
- **Stats is eight blocks, not ten panels, and two columns from 720px.** Laying the same ten cards
  out side by side was the first attempt and it was not enough: it halved the laptop and barely
  touched the phone, because the cost was never the arrangement, it was that every panel carried a
  full set of panel furniture to say one thing. **Merging beat arranging.** The four stat squares
  and the hero's three facts became one **figure strip**, six numbers on hairlines in a single
  panel, which also killed the duplication those two had between them: books done was said twice
  and chapters remaining twice. The streak card and the "when you read" card became **one "Your
  week" card**, since the seven cells and the four bars are two halves of the same question. And
  the 30-day bar chart and the 30-day cumulative chart became **one chart**, bars for the day and a
  gold line for the running total, which is the pairing where a second axis earns its keep. 3,709px
  to 2,165 on a laptop, 3,530 to 2,061 on a tablet, 4,208 to 2,956 on a phone.
- **The figure strip's hairlines are the grid gap, not a border per cell.** A 1px gap over a
  `--line` background paints a perfect grid of rules, and no cell has to know whether it is in the
  last row or the last column, which is the thing that always breaks when the column count changes
  at three breakpoints. It goes two across, then three, then six.
- **"Your week" stacks at every width on purpose.** Side by side the two halves would each get half
  of a 334px column on a tablet, and seven day cells in 160px is exactly the squeezing this pass
  was meant to undo. `.figure__value` is `white-space: nowrap` for the same reason: "Feb 2028" is
  the longest thing that lands there and it must not wrap while five numbers beside it sit on one
  line.
- **The combined chart hides its right axis.** Two axes on a 288px phone leaves no room for thirty
  bars, and the shape of the climb is the answer the line is there to give; the number is in the
  tooltip and in the strip above. The source order pairs the panels for the two column layout, so
  the DOM order, the reading order and the tab order still agree and nothing needs `order`. 720 and
  not a round 800 because iPad portrait is 768.
- **On a phone the room comes out of the panels, and the card head was most of it.** 122px each: a
  1.32rem title over a note set to 62ch, which at 288px of usable width is three lines, over 34px of
  padding and margin and a rule. Six of those was 732px spent introducing charts that are already
  labelled. All of it is scoped to `.statsView`, because `.card` is shared with Notes and Settings.
  **`.statsView .card` has to say `:not(.fold)`**: a fold sets `padding: 0` on purpose, since a shut
  card is one tappable strip with nothing dead around it, and a descendant selector outranks it.
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
- **The welcome guide** is `src/components/Guide.tsx`, six stepped panels shown once. Each drawing is
  an inline SVG diagram of the screen it describes, so the shape you are shown is the shape you meet
  a minute later. Whether it has been seen is `prefs.guideSeenAt`, **synced on purpose**: being
  walked round the app again on the second device you sign into is an obstacle, not a welcome.
  Settings clears that field to show it again, which is the whole mechanism, and the component
  resets to step one when it opens because it stays mounted while hidden.
- **Coach marks were rejected for years, and `src/components/Tour.tsx` is the version that answers
  the objections instead of ignoring them.** They were real objections. A coach mark has to know
  where its target is, which breaks the first time a card moves; and it can say nothing at all about
  a screen you are not on. So this one **never stores a position**: each step names a `data-tour`
  attribute and the box is measured off the live element **every frame the tour is open**, which
  survives a card moving, a font landing late, a rotation, and the smooth scroll the tour itself
  starts to bring the target on screen. A rAF loop rather than scroll and resize listeners precisely
  because that scroll has no event that says "now I have finished". And it **drives the app**: each
  step names its view and the tour switches to it before pointing, which is the only reason it can
  cover Notes, Stats and Settings at all.
- **A step whose target is not in the document is skipped, never drawn.** The failure mode is a
  shorter tour and never a hole dimmed around nothing. That also means a renamed anchor fails
  silently: it does not throw, does not warn, and does not look broken, it just quietly gets
  shorter. `tour.test.ts` walks every source file and fails if a step names a `data-tour` nothing
  renders, which is the one pin here worth more than all the others.
- **The inner views are targeted by their masthead, not their nav button.** The nav collapses behind
  a menu on a phone, so those buttons have no box to point at, and the masthead is the one thing on
  an inner view that is there whether or not the account has read anything. A new reader's Stats
  screen is `NothingYet`, so a spotlight expecting the figure strip would have found nothing on the
  exact account the tour exists for.
- **The tour climbs a ladder rather than ringing one note six times.** It borrowed the insight bell
  first, which meant the same A5 on every stop, and that is the difference between a sound and a
  score: an identical chime says something happened and nothing else, so by the third one you have
  stopped hearing it. `TOUR_LADDER` is A3, E4, A4, E5, A5, one rung a stop, and the last stop stops
  climbing and **resolves** instead, root fifth and octave spread over a tenth of a second, the same
  arrival shape the streak cue lands on and no third in either. Octaves and fifths on A like the
  rest of the set, every rung inside the 220 to 880 a phone speaker can reproduce, and **measured**:
  about -15.7 dBFS a rung against the arrival's -12.8, which is what makes the end feel like an end.
  `E4` was added for this and is the only note in the palette that had no user before.
- **The tour's effects are the app's own, borrowed rather than invented.** Light crosses the lit
  control once as it lands, which is the move the today button already makes on arrival; a second
  flourish would make the tour feel like a different product. It travels by `background-position`
  and not by `transform`, because a transform carries the pseudo-element's rounded corners out of
  the box with it and the sweep has to stay clipped to the shape of the thing being lit.
- **The progress rail lives outside the keyed stage.** The words are keyed on the step so each one
  arrives rather than swapping in place, which means everything inside that key is replaced on every
  stop. A rail in there would start from nothing six times, which is the one thing a progress
  indicator may not do. It sits on the panel and only its width changes.
- **The spotlight is one box with a 9999px spread shadow**, so the hole *is* the element and there
  is nothing to keep in step with it. Four divs arranged around a gap have four edges to align and
  they drift the moment the target moves, which here is every frame. A full screen catcher sits over
  it so a tap anywhere advances: tapping the lit Read button on step one would otherwise land the
  reader in the reader, having lost the tour they had not finished.
- **The tour has no "seen" flag of its own, and that is deliberate.** Finishing the guide hands over
  to it and skipping the guide does not, so the guide's own synced `guideSeenAt` already gates both:
  one account, one tour. A new field on `prefs` would have needed a release that *reads* it shipped
  before any release *writes* it, since `normalize()` is a whitelist and an older client would strip
  it back out on the next sync. Settings has "Take the tour" for a replay, which fires
  `TOUR_EVENT`. That constant lives in `src/lib/tour.ts` and **not** in `App.tsx`: `App` imports the
  very view that wants it, so exporting it from there is a cycle whose safety depends on evaluation
  order, and a plain value exported beside a component turns off fast refresh for that module.
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
- **The `streak` voice is scored against `StreakCelebration`, and is the only one that is.** It runs
  about 3.4 seconds against the overlay's 3.6, because it used to run 0.7 and the cross landed, the
  reels turned and the number arrived in silence. `drone` is a filtered pair of triangles a few cents
  apart, felt under the rest rather than heard, and `sweep` is looped noise climbing a bandpass while
  the digits turn. Deliberately not a ratchet: a literal slot machine would be the one moment in this
  app that sounds like a casino. The arrival is root, fifth and octave, since a major third would
  read as a game rewarding you rather than a bell tower.
- **Attack envelopes are linear and only the decays are exponential.** An exponential ramp climbing
  from near zero is inaudible for most of its length, roughly 50 dB down a third of the way through a
  one second rise. Two of those overlapping left a hole at -44 dBFS in the streak cue exactly where
  the reels start turning, which measured as a dead spot and would have been heard as the sound
  cutting out. Linear attacks took the same window to -30. Decays stay exponential, because that is
  how a struck thing actually stops.
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

- Every control in the reader bar is the **same 38px circle**. On a phone the bar tightens its gaps
  rather than letting the book name collapse: at the desktop gap, Psalms rendered as "P..", and the
  book name is the one thing there that has to stay readable. That was measured with four controls
  in the bar and there are three now, so there is room, but the rule stands for whatever goes in
  next.
- **Rest days are what put something at stake, and they are derived, never stored.** Seven
  consecutive days earns one, two is the most that can be held, and a missed day spends one instead
  of ending the run. Out of cover and the run ends, taking its unspent rest days with it. A balance
  on the journal would need a `normalize()` whitelist entry, would have to survive a merge, and two
  devices could disagree about how many were left; walking the days costs nothing on a journal this
  size and cannot desync, because the days are the only source of truth there is. **A run counts
  days actually read**, so a covered day preserves the number without adding to it and "12 day
  streak" never means eleven days and an excuse. `REST_EVERY` and `REST_CAP` are the two knobs, and
  the arithmetic is pinned by tests because every rule in it is something a reader feels and none of
  it is visible in the UI until it bites.
- **`streakRisk` escalates with the clock, and is not allowed to bluff.** The old line said the same
  thing at eight in the morning as at midnight, and a warning that never changes is one nobody
  reads. After 20:00 with nothing in hand it says the streak ends tonight and turns red; **with a
  rest day in hand it must not**, because the streak genuinely does not end, and a threat the app
  gets caught inventing makes every later warning worth nothing. That honesty rule has its own test.
- **A broken streak is said once.** It used to become "No active streak" in the hero and nothing
  else, so twelve days vanished without a word. `lastRun` on the `Streak` carries what the run was
  after `current` has gone to zero, which is the only way to name what was lost. Runs under three
  days are not mourned, since that would be the app grieving on your behalf over nothing. What has
  been said is device-local, keyed by the run and the day it ended, the same pattern as the insight
  cards: a second break is mourned again, the same one never is.
- **The streak animation reads the cue channel the sounds use**, exposed as `cue` on the store, so
  one moment drives both rather than two systems separately noticing the same event and disagreeing
  about when. It is four small things: the flame swells and warms, the number counts up through
  `useCountUp`, today's cell fills, and four sparks leave the flame. **Restarting a CSS animation
  needs the element replaced**, so the flame is keyed on a burst counter; re-setting an attribute it
  already has does nothing, and a second streak would be silent while the bell still rang.
  `prefers-reduced-motion` was designed in rather than bolted on: no swell, no bounce and no sparks
  at all, but today's cell still changes colour, because that is the record of having read today and
  not decoration.
- **`StreakCelebration` is the version of that moment meant to be looked at, not glimpsed**, and it now carries the finished book as well. The
  hero's flame is an ambient touch for whoever is already looking there; this is a full screen
  takeover, centred, for when growing the streak deserves the reader's whole attention. Same trigger
  as the flame and the bell, `cue.name === 'streak'` on the store, so all three fire off one signal
  rather than three systems independently deciding the same thing happened. It reads `derived.streak`
  once, the instant the cue arrives, and holds that snapshot in its own state: a later mark changing
  `derived` must not renumber or reopen a celebration already on screen.
  The cross lands first, then a reel per digit rolls in like a slot machine, most significant digit
  left to right via `digitsOf` in `format.ts`. Each reel is a 30 entry strip, three runs of 0 to 9,
  with the target sitting in the last run: it is what makes a reel travel a full roll rather than
  nudge one step, and a single `--reel-end` custom property parameterises the keyframe so one
  `@keyframes` serves every digit rather than ten. It is keyed on the cue's `id`, not just shown or
  hidden, so a second streak later in the same session replaces the whole element and every animation
  restarts, the same reasoning as the flame's burst counter above. Dismisses on a timeout, a tap
  anywhere, or Escape. **Reduced motion skips the roll and the bounce, not the moment**: the reels sit
  at their final digits from the first frame and the scrim still fades in and out, because a full
  screen element snapping straight into existence is a bigger jolt than the fade it is trying to
  avoid. It lives in `Shell` beside `UndoBar`, never inside anything transformed, since `.celebrate`
  is `position: fixed` and a transformed ancestor becomes the containing block for that.
- **A finished book gets the bigger moment, and the cue carries the name.** `fire()` in the reducer
  attaches `books` to a `book` cue, because "a book finished" is not enough for a screen that wants
  to put the name on it; the other cues stay two fields. The book variant is the streak's machinery
  with what a book has that a streak does not: the name rises through a clip like a title card
  before the reels roll to where that leaves the count, three rings leave the cross, and it holds a
  second longer. Its chapter count comes from the canon, not the track, since a reader can finish a
  book their track does not contain by wandering into it from the reader. **This also settles the
  gap `chooseCue` left**: finishing a book on the day a streak grows used to ring the book bell and
  show nothing, because only the streak cue had a screen. Now the larger moment wins, which is what
  the ladder meant all along.
- **`.celebrate` reduced-motion rules key on `data-calm`, never on the media query.** The attribute
  is set from `reducedMotion()`, which reads that same query, so they agree in the wild, and keying
  on one switch rather than two is what keeps them from drifting. The book block was first written
  inside `@media (prefers-reduced-motion)` and failed silently: the rings kept expanding and the
  name kept rising for a reader who had asked for neither, and only the attribute-driven test
  caught it. The `book` voice runs about 4.2 seconds against a 4.6 second hold, scored the same way
  as `streak`: root and fifth under everything, a quick shimmer up through the octave as the rings
  leave, a chord as the name lands and a higher one as the count does.

- **Read aloud was removed.** It read a chapter through `speechSynthesis` with the spoken verse
  lit up, and it went because the voices a browser can reach were not good enough to want: on iOS
  the good Siri voices are not exposed to web pages at all, so the ceiling was low and no amount of
  ranking, pitch or resetting moved it. Four attempts are in the history if the reasoning is ever
  wanted. **`git revert` the removal commit brings all of it back**, including the tests, so this is
  a decision that can be taken again rather than work that has to be redone. If it does come back,
  the thing that would actually change the answer is not synthesis: it is the public domain human
  narrations of this exact translation, which are real recordings and would need hosting, verse
  timing, and a decision about the `<audio>` element the sound rules currently forbid.

- **A book introduces itself the first time it is opened, and key chapters say why they matter.**
  The words are in `public/bible/insights.json`: an eyebrow and three facts for all 73 books, and
  a titled note for around a hundred chapters, weighted toward the big books and the deuterocanon,
  which is what a reader is least likely to know. They live beside the text and are fetched the
  same way, on demand through `src/lib/insights.ts`, never bundled, because sixty kilobytes of
  prose has no business in the JavaScript. **The `/bible/` path is deliberate**: it is cache first
  with no revalidation, so the file is there offline, and **changing it requires bumping `CACHE`
  in `sw.js`** like any other file under it. `insights.test.ts` pins the content against the canon
  the app ships: every book present and none invented, no note on a chapter a book does not have,
  every line short enough to be read in a glance, and the house rule on dashes.
- **The card presents itself once, on the first open of a book with none of it read.** Not
  "chapter 1", because someone who opens Psalms at 23 is still starting Psalms, and not "never
  seen" alone, because a reader halfway through Genesis before this existed has not just started it
  and would be introduced to a book they are inside. After that it stays a tap away behind the
  About pill and never presents itself again. A chapter's note reveals itself once and is simply
  there after, so nobody watches the same lines rise twice. What has been seen is **device-local**,
  like the voice: seeing a card again on a second device is a small redundancy, not a harm, and it
  keeps the journal's whitelist untouched.
- **The sheet lives inside `reader__body`, not over the whole reader.** The book and chapter
  pickers in the bar stay usable, so someone who opened the wrong book does not have to dismiss an
  introduction to fix it; the body stops scrolling while it is up. The note is held back until the
  sheet has gone, so its lines rise after the card rather than underneath it, and so the two
  chimes never arrive together. Those chimes, `open` and `note` in `sound.ts`, are **not on the
  cue ladder**: nothing in the journal changed, so they are not the reducer's business. They play
  on the first arrival only; a re-open from the pill rises but makes no sound.
### The data model

One row per account in `public.journals`: `user_id`, `data` jsonb, `updated_at`. Row-level security
is the only thing protecting it, since the publishable key is public by design. The blob holds
`planId`, `read` (chapter key to day), `removed` tombstones, `markedAt` stamps, `notes`,
`startedAt`, `ownerId`, `prefs`.

Chapter keys are `"<Book>|<chapter>"`. Book names are unique across the Bible, which is what lets a
plan be a *view* over the journal rather than a container: switching plans never deletes anything,
chapters outside the new plan simply stop being counted.

**The SQL lives in `supabase/migrations/` now**, and it did not before: the two original migrations
existed only inside the Supabase project, so the schema had no history anywhere a reader could
follow. All three files are byte identical to what is deployed, checked by md5 against
`supabase_migrations.schema_migrations` rather than by eye.

### Friends, and why it is four new tables

**Nothing about friends touches the journal.** The journal is one jsonb blob per account holding
notes and highlights, and RLS is row level, so there is no version of "let a friend read my row"
that is not a data leak. What a friend sees is `public.progress`, a **projection the client computes
and publishes**, never a copy of anything.

- **`progress` is explicit columns, deliberately not another blob.** What leaves a device is then
  auditable by reading the schema, and there is no field a note could arrive in by accident. Same
  reasoning that keeps the cue off `AppData`.
- **The whole feature needs no staged release**, which is the reason handles and visibility live on
  `profiles` rather than in `prefs`. `normalize()` is a whitelist and `cloud.tsx` upserts the whole
  row, so a new `prefs` field has to ship read-only first. Touching nothing in the blob sidesteps
  that entirely.
- **A pending request must reveal nothing.** `is_friend` requires `status = 'accepted'`, or sending
  a request to a stranger would by itself be enough to read them. It is the single most important
  line in the migration and the one the tests lean on hardest.
- **`is_friend` has to keep `execute` on `authenticated`, and that is not an oversight.** A trigger
  function is invoked by the trigger system and never privilege checked against the caller, which
  is why `touch_journal_updated_at` could be revoked from everything. A function named in a
  **policy** is evaluated as the querying role, so revoking this one would not harden anything, it
  would make every read it guards fail with a permission error. It is safe to expose because it
  takes one argument and reads the caller from the session: there is no way to ask it about two
  other people.
- **`find_profile` is the one deliberate hole.** The select policies hide any profile you have no
  friendship with, so nothing could ever start; an exact match lookup on a handle is what lets
  somebody be added at all. It does no prefix matching, so the table cannot be walked, but a
  guessable handle is guessable, which is the same exposure every `@name` system has.
- **The two security advisor warnings about those functions are expected**, and the third is about
  leaked password protection, which does not apply to a Google-only app.
- **A passage stores the reference, never the words**, so it renders from the app's own text and the
  `{verse, offset}` pair a highlight already uses picks out the phrase. `freeze_passage` makes it
  immutable except for `seen_at`: the update policy that lets a recipient mark it read would
  otherwise let them rewrite what they were sent.

**`supabase/tests/rls.sql` is the test, and it needs no second Google account.** A policy only cares
about `auth.uid()`, which reads `request.jwt.claims`, so three rows in `auth.users` and a
`set_config` are a complete set of identities. 35 checks: what each of three people can read, what
each cannot write, and positive controls, **which are the point**, since a suite of "this was
refused" passes just as happily against tables nobody can touch at all.

Everything runs inside a sub-block that ends by raising, so the test data is rolled back whether it
passes or fails and a live database is never left dirty. Findings survive that rollback because they
are held in a plpgsql variable, and **variables are memory while table rows are not**: the first
draft wrote results to a temp table and the rollback took them with it.

**All 35 passing means nothing on its own**, so three mutations were run the same way, each applied
inside the same rolled-back block: dropping the `accepted` check from `is_friend` (a pending request
then read 2 rows instead of 1), removing `passages_freeze` (the recipient rewrote the passage), and
opening the progress policy to `using (true)` (a stranger read all 3). All three were caught, and
DDL is transactional, so production was never left mutated.

- **`src/lib/friends.ts` is where the leak would be, so it names every field and spreads nothing.**
  `projectProgress` builds the published row by writing all ten keys out. One `...rest` anywhere
  upstream and a note reaches a server, and **that is not a bug anyone would notice from inside the
  app**: the screen looks right, sync still works, and the only symptom is that somebody else can
  read your journal. So the test does not check that the right fields are present, it stuffs a
  journal with a canary string in every field that holds words, serialises the whole row and fails
  if the canary can be found. `PUBLISHED_KEYS` is written out by hand rather than derived from the
  type, because a type is gone at runtime and the point is to fail the commit that **adds** a field.
- **Quiet writes nulls rather than hiding columns.** A quiet reader's numbers are never on the
  server at all, instead of being on it and one policy mistake away from showing.
- **`current_book` comes from `markedAt`, and skips a chapter no longer in `read`.** A cleared
  chapter keeps its stamp, so the newest stamp is not on its own an answer to what somebody is
  reading.
- **`tz_offset` is minutes east of UTC, the opposite sign to `getTimezoneOffset()`**, and the flip
  happens once, in `tzOffsetMinutes`. `theirToday` then computes a friend's day rather than yours:
  computing the dot against your own midnight is the obvious implementation and it is wrong for most
  of the day for anyone far enough away, which would make the one honest thing on a friend card
  quietly untrue.
- **`canonicalPair` lowercases before comparing, and has to.** Postgres compares uuids by their
  bytes and a lowercase hyphenated uuid sorts identically as a string, since `0`-`9` precedes
  `a`-`f` in ASCII exactly as it does in hex. **Uppercase does not**: `A` is 65 and `a` is 97, so a
  capitalised id sorts to the wrong side of the `user_a < user_b` constraint and tries to write a
  second row for a pair that already has one.
- **Eight mutations were run against `friends.ts` and all eight were caught**, including the
  projection growing a field that carries a note, the timezone sign flipping, and `canonicalPair`
  dropping its lowercase.

- **`FriendsView` is never sorted by anything anyone can climb.** That one rule decides most of the
  file. Sorting by streak, or floating whoever read today to the top, turns reading scripture into
  standings, which is the thing the app has refused everywhere else. The order is alphabetical and
  stays that way whatever anybody does. **There is no feed** either, for the same reason: a feed is
  where this becomes performance, and an engagement loop is a bad thing for a Bible app to grow.
- **A lapsed friend gets no number at all**, which was the one real design fork and is decided in
  `presenceOf`. Both other answers are worse. `0 day streak` puts a scoreboard's worst figure on
  somebody having a hard month, on a screen they can see; their *longest* is crueller still, since
  it names exactly what they just lost. So the row says when they last read, in words. The app
  already mourns your own broken streak once and then stops; somebody else's was never yours to
  mourn.
- **A published streak is only trusted for a day.** A row is rewritten only when that reader opens
  the app, so a run of twelve can sit on the server long after it broke, and printing it would be
  inventing a streak on their behalf. One day of slack covers a friend who read yesterday and has
  not opened the app yet.
- **The dot is the only thing on a row given colour**, because it is the only thing always true.
  Everything else is a sentence, and a sentence cannot be scanned down a column and compared the way
  a row of numbers can, which is exactly what this screen is trying not to be. Measured like the
  rest: the dot is 5.6:1 as a graphic, the 12.5px line 6.1:1, the streak numeral 16.1:1 on its gold
  tint, which is the same tint-with-ink-text treatment the mark button uses since `--yellow` on
  paper is 1.7:1 and could never carry a numeral itself.
- **Publishing presence is its own effect in `cloud.tsx`, never a step inside the journal push.**
  The journal is the thing that matters and a friend's row is a convenience, so one catch there
  keeps a policy change or a paused project from turning "your reading is saved" into an error
  banner. Throttled to a minute, since a reading session that marks a dozen chapters deserves one
  write rather than a dozen.
- **`publishPresence` re-reads the profile rather than taking it as an argument.** Visibility is the
  thing being obeyed, so a cached copy is exactly how switching to quiet keeps publishing numbers
  until the next reload. No profile means no handle means nobody could have added you, so nothing is
  written at all, which is what makes "nothing is published until you pick a handle" true rather
  than a claim on a screen.

**`supabase/seed/friends-demo.sql` exists because some states cannot be produced by hand.** A seeded
friend exercises the list, the card, an incoming request and the inbox without anyone signing in
twice, which is most of the screen. More to the point, **a lapsed friend needs somebody to stop
reading for four days and a friend in another timezone needs somebody in another timezone**, and
waiting is not a test plan. So there are four: Hana in Tokyo at +540 whose today is already
tomorrow, Marc lapsed four days ago with a current streak of zero and a longest of 18, Ruth in quiet
mode with every number null, and Sam still pending, who is there so that "a pending request reveals
nothing" is falsifiable on screen and not only in the suite. Verified through the account's own
identity: 3 friends visible, 4 profiles including Sam so his request can carry a name, **0 rows of
Sam's progress**, 1 passage, 1 journal. `friends-demo-teardown.sql` removes all of it by deleting
the four accounts, since every table cascades from `auth.users`.

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
itself in a reader that sets it in paragraphs and poetry and opens at any book and any chapter,
headings over every chapter of the 66 with a note on the turning points, highlighting with a
thought attached,
notes, stats, streaks, an offline app shell, full text search over all 73 books, five synthesised sounds with a synced mute switch, a card introducing every book and a
note on the chapters that matter, a streak that celebrates itself when it grows and can be
protected by rest days it earns, a knock and a dip on every press in the app, a six panel welcome guide that
hands over to a tour of the real controls, and a synced settings screen.

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

**Friends works, except for sending a verse.** The four tables and their policies are deployed,
`supabase/tests/rls.sql` passes, and the screen is real: the list with presence, incoming requests
with accept and decline, the inbox, adding somebody by handle, your own handle and the two
visibility positions. `cloud.tsx` publishes the projection alongside the journal.

**Handing somebody a verse works too.** `SendVerse` opens over the highlight sheet from a "Send to a
friend" button, and the reader supplies the reference for a selection still being made as well as
for a saved highlight, so passing a verse on does not mean saving it, closing the sheet and opening
it again.

- **The message box starts empty and is never the highlight's own note.** The note is the private
  half of the app, so prefilling it would put one tap between a private thought and somebody else
  reading it. Two boxes that look alike doing opposite things is the quiet mistake worth designing
  out, so the label names who it is going to and a line under it says the note stays here.
- **Sending takes over the sheet rather than unfolding inside it.** A picker plus a second box under
  the note would put the send button back under the keyboard on a phone, which is the exact problem
  `useKeyboardInset` exists to solve.
- **The confirmation is `chime('note')`, not a `Cue`.** Nothing in the journal changed, the same
  reasoning that keeps the two insight chimes off the ladder.
- **`verseRef` in `highlight.ts` is the one spelling of a reference**, because the same string is
  printed for three different shapes now: a saved highlight, a selection being sent, and a passage
  that arrived.

Still not done: the reader does not open at a passage when one is tapped in the inbox, and nothing
tells you a verse arrived except opening the screen.

Not built yet, roughly in order:

1. **In-app account deletion.** Required by App Store guideline 5.1.1(v). Must clear the Supabase
   row and the local cache. Now also four friends tables, though every one of them cascades from
   `auth.users`, so deleting the account is enough and the ordering does not matter.
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
