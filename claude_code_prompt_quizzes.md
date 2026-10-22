# Prompt: book quizzes for Bibley

Use this as the brief for building the quiz feature. Read all of it before touching code. It is
written for Claude working in this repository, and every rule in it either comes from `CLAUDE.md`
or exists because getting it wrong would put a false sentence about scripture in front of a
reader.

---

## The task

Build an optional quiz for every book in the 73 book Catholic canon the app ships: short multiple
choice questions that remind a reader what happened in a book and check they followed it. Each
quiz is sized to its book. A quiz is offered, never imposed, when a reader finishes a book, and
every quiz lives in a new **Quiz** tab. A phase quiz draws on all the books of a phase in the
reader's plan ("Foundations", "The Hook") and is offered when the phase is finished.

**The content is the product, and an error in it is worse than no feature.** A reader who is told
the wrong answer about scripture by a Bible app has been taught something false by the one source
they trusted to be careful. So most of this brief is about making a wrong question impossible to
ship, not about the UI.

## Read first

- `CLAUDE.md`, all of it. In particular: the canon and its numbering, the 39 null verses, the
  Prayer of Azariah being absent, the `normalize()` whitelist and staged releases, `sameJournal`,
  the merge rules, the service worker's caching, the class name and media query traps, contrast
  measured not judged, `:hover` inside `@media (hover: hover)`, the press block staying last, no
  em dashes, and why nothing in the app is ever ranked.
- `src/data/numbers.ts` and `src/lib/numbers.test.ts`: the pattern this feature copies. Every
  claim cites a verse, and a test reads the shipped text and fails if the verse does not say it.
- `src/lib/insights.test.ts`: content pinned against the canon (every book present, none invented,
  no chapter a book lacks).
- `src/lib/bibleSearch.ts`, for `fold()`, the one-for-one character normaliser.
- `public/sw.js`, `src/state/reader.tsx`, `src/state/readerContext.ts`, `src/App.tsx` (`VIEWS`),
  `src/lib/tour.test.ts`, `src/components/Tour.tsx`, `src/lib/friends.ts` (`PUBLISHED_KEYS`),
  `src/lib/storage.ts` (`normalize`), `src/lib/merge.ts`, `src/lib/sound.ts` (`ARRIVALS`, `chime`).

## The one source of truth

**The answer to every question is in the World English Bible text the app ships, under
`public/bible/`, and nowhere else.** Not memory, not another translation, not a commentary, not a
study Bible, not Wikipedia.

- **Read the verse out of the JSON before writing the question.** Memory of the KJV or the NIV is
  the main way an error gets in: the WEB says "a great fish" in Jonah, not a whale; there is no
  apple in Genesis 3; Matthew 2 never counts the magi; Mary Magdalene is never called a prostitute.
  If the question depends on wording, the wording is the WEB's.
- **Spell names the way the WEB spells them**, and use its divine name where it uses it (Yahweh).
  The evidence test below enforces this mechanically.
- **The Berean Standard Bible headings already in `insights.json` are a map, not a source.** Use
  them to find where a scene is and which moments a book turns on. Never quote them as the text.
- The deuterocanonical books are in scope and get quizzes like the rest. Esther's chapters 10 to 16
  and Daniel's 13 and 14 are the appended Greek material as this app numbers it. The Prayer of
  Azariah is not in the app, so nothing may cite it. None of the 39 null verses may be cited.

## What a question may ask

**Only what the text says, never what anybody says about the text.**

Allowed, all answerable from one cited passage of one to three consecutive verses:

- who did something, said something, or went somewhere
- what happened, and what happened next (sequence within the book)
- where, when relative to another event, how many, or what was named what
- which words a person said, when they are memorable and short

Banned, with no exceptions:

- interpretation, meaning, theology or doctrine ("what does this teach about grace")
- anything a tradition says and the text does not: authorship or date not stated in the book
  itself, the number of the magi, the names of unnamed characters
- denominational fault lines, including anything where Catholic and Protestant readers would
  answer differently
- negative stems ("which of these did NOT", "all except"), "all of the above", "none of the
  above", trick questions, and answers that depend on a single easily missed word
- questions whose answer only follows if you also know another book

**Distractors** are plausible and from the same book's world: other people, places and numbers
the reader has met. Each must be clearly wrong according to the cited passage, and none may
appear in the evidence span (a test checks). The four options sit at similar lengths, so the
longest is never the tell, and the correct position is spread across A to D within each book.

**What to ask about.** Weight each quiz towards what a reader who finished the book should carry
away: its turning points, main people and the events its headings mark. In a long book, add a
couple of detail questions. Spread questions across the whole book: first, middle and last third.

**After every answer the reader sees the verse itself**, printed from the shipped text with its
reference, not a paraphrase written by the author of the question. That is what makes a quiz a
reminder rather than an exam, and it keeps the only words of explanation the scripture's own.

## Sizing

Quiz size grows with the book but more slowly than it, so Genesis is a proper quiz and Jude is a
moment:

```
questions(chapters) = clamp(round(2 * sqrt(chapters)), 3, 15)
```

Measured against the shipped canon: Jude, Obadiah and Philemon get 3, Ruth 4, Mark and Romans 8,
John and Revelation 9, Genesis and Sirach 14, Psalms and Isaiah 15. **536 questions across the 73
books** (13 books at 3, two at the cap of 15). Put the function in `src/lib/quiz.ts`, and pin
those examples in a test so the formula cannot change unnoticed.

**A phase quiz** is drawn from its books' questions, not written separately, sized by
`clamp(round(2 * sqrt(phaseChapters)), 5, 20)` and sampled in proportion to each book's chapters,
with every book in the phase represented at least once.

For v1 the bank equals the quiz: one fixed set of questions per book, with question order and
option order shuffled on each attempt. The schema must allow a larger bank later, so retakes can
vary without a migration.

## Where the questions live, and why there

**`src/data/quiz/<book-slug>.json`, one file per book, loaded with `import.meta.glob` lazily.** Not
under `public/bible/`.

`public/sw.js` serves `/bible/` cache first with no revalidation, so every correction there would
need a `CACHE` bump, and a bump throws away every reader's downloaded books. Quiz content will be
corrected more often than the Bible text will. Imported through Vite, each book's questions become
a fingerprinted chunk that is fetched on demand, never in the main bundle, cached first because it
is fingerprinted, and replaced automatically when its content changes. Use the same slug as the
book's own file in `public/bible/`.

Each question:

```json
{
  "id": "ruth-3",
  "ref": [1, 16, 16],
  "q": "Who said, \"Your people will be my people\"?",
  "options": ["Ruth", "Naomi", "Orpah", "Boaz"],
  "answer": 0,
  "evidence": "your people will be my people"
}
```

- `id` is stable for ever and never reused, because results are stored against it.
- `ref` is chapter, first verse, last verse, inside the book the file is for.
- `evidence` is an **exact substring of the cited verses** as shipped, after `fold()`. It is the
  sentence that proves the answer, and it is what the test checks.
- Optionally `answerTerms`: words from the correct option that must appear in `evidence`, for
  questions where the option is a paraphrase of a name or number.

## The tests are the credibility

`src/lib/quiz.test.ts` reads the shipped text the way `numbers.test.ts` does, and fails if:

1. any file names a book outside the canon, or any canon book has no file
2. a book's question count is not `questions(chapters)`
3. a `ref` points at a chapter or verse the book does not have, or at a null verse
4. `evidence` is not found in the cited verses
5. the correct option (or its `answerTerms`) does not appear in `evidence`
6. **any distractor appears in `evidence`**, which is what catches a question with two right
   answers
7. a question has other than four options, duplicate options, or an `answer` out of range
8. a stem is negative (`not`, `except`, `never` as the question's own verb), or an option is "all
   of the above" or "none of the above"
9. an `id` repeats anywhere, or does not start with its book's slug
10. the correct position in a book of five or more questions is the same more than half the time
11. a stem runs over 120 characters or an option over 48, which is what fits a 375px phone
12. a book of three or more chapters has questions from fewer than `min(count, 3)` distinct
    chapters, or misses its first or last third
13. anything contains an em dash

Then **mutation test it**, the house practice: move a `ref` to a neighbouring verse, change an
answer index, copy a distractor into its evidence, add a negative stem, cite a null verse, spell a
name the KJV way. Every one must fail the suite. Write down which were run and that each was
caught.

**A test proves a question is consistent with the text. It cannot prove the question is good.**
So every batch also gets a cold verification pass: reread each question against nothing but its
printed verse and ask whether a careful reader of that verse alone would pick that answer and only
that answer, and whether the question would read the same to a Catholic and a Protestant reader.
Then generate a **review page** from the data, each question beside its verse text, for the user
to skim before the batch ships.

## Results, sync and the staged release

Scores sync with the account, and that means a staged release, because `normalize()` is a
whitelist and `cloud.tsx` upserts the whole row: an older client would strip a field it does not
know and write the stripped journal back.

1. **Release one reads, and writes nothing.** Add `quizzes?: Record<string, { best: number; of:
   number; at: string }>` to `AppData`, validated in `normalize()`, compared in `sameJournal`, and
   merged as per key: keep the higher `best`, and the later `at` on a tie. No tombstones, since
   nothing is ever deleted. Include it in the export. Commit, push, and let it deploy **before**
   anything writes the field.
2. **Release two writes**: the quiz sheet records an attempt when one finishes.

Keys are `<book-slug>` for a book and `phase:<track-id>:<n>` for a phase.

**Scores are never published.** They are not part of `progress`, and adding them must fail the
`PUBLISHED_KEYS` test. Nothing about a quiz is ranked, compared, or shown to a friend. That is the
same rule that keeps the friends screen alphabetical.

## The experience

- **A Quiz tab** in `VIEWS`, with a `ViewHeader` masthead and the shared `.card` system. It needs
  a tour stop on its masthead, or `tour.test.ts` fails, which is what that test is for. Books are
  listed in the phases of the reader's active plan, the journey's own spine, each row showing the
  book, its question count and the best score so far. Books not yet finished sit below a "Not read
  yet" label but stay open, since a reader may want to test themselves. A phase's quiz row closes
  its group and opens when the phase is finished.
- **The offer after finishing a book.** Never during the celebration and never automatically. Once
  the celebration has closed, the finished book's row on the journey and the reader's footer offer
  "Take the Ruth quiz, 4 questions", once, with the offer remembered as seen on the device the way
  the book cards are. The same goes for a finished phase. An offer that comes back every time is a
  nag, and this app does not nag.
- **The quiz sheet** opens over the app like the reader: `aria-modal`, focus moved in, Tab trapped,
  focus handed back, Escape to leave, `overscroll-behavior: contain` like every sheet. One question
  at a time, under a progress rail that lives outside the keyed stage, the same reason the tour's
  does. Four options as large buttons, at least 44px. Tap to answer, with no separate confirm. The
  right option takes the gold done treatment with ink text; a wrong pick takes a red edge, and the
  right one is shown too. Then the verse, with its reference and "Read it in context", which opens
  the reader **at that verse**. That means extending `ReaderApi.open` with an optional verse, fed
  into the reader's existing `landedOn` marking, and it also closes the CLAUDE.md gap that the
  reader cannot open at a passage. Next follows the one-red-button rule.
- **The end** counts the score up, "7 of 8", lists what was missed with its verse, and offers Try
  again with a fresh shuffle. A perfect score gets a quiet moment inside the sheet, a rule drawing
  and a soft arrival, and not a fourth full-screen celebration: those three are for reading, and a
  quiz is not reading.
- **No timer, no points, no streak, no leaderboard.** It is a reminder, not a game show. The user's
  word "game" is honoured by the feel (the press, the reveal, the sound), not by pressure.
- **Sound** through `ARRIVALS` and `chime`, not `Cue`, because a single answer changes nothing in
  the reading journal: a quiet A5 for right, a soft low touch for a miss that does not sound like a
  failure buzzer, and a small resolve at the end. Octaves and fifths on A, no third, measured
  through `OfflineAudioContext`, and kept under the chapter tick so a quiz is never louder than
  reading.
- **Reduced motion, contrast and the CSS traps**: every new colour measured at its worst point,
  every new class name checked with the duplicate one-liner, every hover guarded, every media query
  rule placed below the rule it beats, and the press block still last.

## Build order

Build a vertical slice first, then fill it in.

1. `src/lib/quiz.ts` (sizing, sampling, seeded shuffle, scoring) and `quiz.test.ts`, with **Mark
   (8 questions)** as the first content, verified and mutation tested.
2. **Release one**: the `quizzes` field read, merged and compared. Commit, push and deploy it on
   its own.
3. The sheet, the tab, the tour stop, the reader opening at a verse, and the two offers, all
   against Mark. Verify in the browser at 375 by 812 with the gate bypass, then revert the bypass.
   **Release two.**
4. **The rest of the canon, in batches** of roughly 60 to 80 questions, phase by phase of The Full
   Arc so the books a reader meets first are covered first. Each batch is authored, put through
   the cold verification pass, tested, turned into a review page, skimmed by the user, and only
   then committed. Expect seven or eight batches for the 536 questions, and plan them as separate
   sessions: the budget in memory is about $70 a month, and this is the expensive part.
5. Phase quizzes once all the books of a phase have their questions.
6. `CLAUDE.md`: the decisions above, why each was made, and what each test pins.

## Decisions to confirm with the user before step 1

Each has a default, so none of them blocks starting:

- Sync scores with the account (default), or keep them on the device and skip the staged release.
- Unread books' quizzes open but listed separately (default), or locked until the book is finished.
- A fixed set per book in v1 (default), or a bank half as large again so retakes vary, which is
  about 270 more questions to write and verify.
- Phase quizzes follow the reader's active plan (default), since phases differ from plan to plan.

## Done means

- Every canon book has a quiz of the right size, and every question passes all thirteen checks.
- The mutations were run and each was caught.
- Every batch had its cold verification pass and its review page.
- Release one deployed before anything wrote `quizzes`.
- Nothing about a quiz reaches a friend, a ranking or the published progress.
- The tab, the sheet, the offers and the reader opening at a verse were verified in the browser on
  a phone-sized viewport, with reduced motion on and off.
- Lint, the full suite and the build pass, and `CLAUDE.md` says what was built and why.
