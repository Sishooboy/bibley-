import { useMemo, useState, type CSSProperties } from 'react';
import { HeadChip, ViewHeader } from '../components/ViewHeader';
import { Search } from '../components/icons';
import { plural } from '../lib/format';
import { useReveal } from '../lib/motion';
import type { Plan } from '../data/plans';
import { highlightRef } from '../lib/highlight';
import type { Highlight, Note } from '../lib/storage';
import { useReader } from '../state/useReader';
import { useStore } from '../state/useStore';

/** One feed, two shapes: a chapter note, or a passage you marked while reading. */
type Entry =
  | { kind: 'note'; note: Note }
  | { kind: 'highlight'; highlight: Highlight };

function entryBook(entry: Entry): string {
  return entry.kind === 'note' ? entry.note.book : entry.highlight.book;
}

function entryDate(entry: Entry): string {
  return entry.kind === 'note' ? entry.note.updatedAt : entry.highlight.updatedAt;
}

function entryText(entry: Entry): string {
  return entry.kind === 'note' ? entry.note.text : (entry.highlight.note ?? '');
}

function phaseLabel(book: string, plan: Plan): string {
  const phase = plan.phaseOfBook.get(book);
  if (phase === undefined) return 'Not in this plan';
  const title = plan.phases.find((p) => p.phase === phase)?.title ?? '';
  return phase === 0 ? `Start here · ${title}` : `Phase ${phase} · ${title}`;
}

function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? <mark key={i}>{part}</mark> : part,
      )}
    </>
  );
}

/**
 * A highlight in the notes feed. It reads as the passage first and the thought
 * second, because the passage is what you will be scanning for, and it opens the
 * reader at the right chapter rather than making you find it again.
 */
function HighlightCard({
  highlight,
  query,
  plan,
  reveal,
  index,
}: {
  highlight: Highlight;
  query: string;
  plan: Plan;
  reveal: (node: Element | null) => void;
  index: number;
}) {
  const { noteHighlight, removeHighlight } = useStore();
  const { open } = useReader();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(highlight.note ?? '');

  return (
    <article
      ref={reveal}
      className={`noteCard noteCard--hl reveal${editing ? ' noteCard--editing' : ''}`}
      style={{ '--i': index % 8 } as CSSProperties}
    >
      <div className="noteCard__head">
        <h3 className="noteCard__ref">{highlightRef(highlight)}</h3>
        <span className="noteCard__date">
          {new Date(highlight.updatedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>

      <span className="noteCard__phase">{phaseLabel(highlight.book, plan)}</span>

      <blockquote className="noteCard__passage">
        <Highlighted text={highlight.text} query={query} />
      </blockquote>

      {editing ? (
        <>
          <textarea
            className="field"
            rows={4}
            value={draft}
            placeholder="What did you make of it?"
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div className="noteCard__actions">
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => {
                noteHighlight(highlight.id, draft);
                setEditing(false);
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => {
                setDraft(highlight.note ?? '');
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          {highlight.note ? (
            <p className="noteCard__text">
              <Highlighted text={highlight.note} query={query} />
            </p>
          ) : (
            <p className="noteCard__text noteCard__text--empty">No thoughts written down yet.</p>
          )}
          <div className="noteCard__actions">
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => open(highlight.book, highlight.chapter)}
            >
              Open
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setEditing(true)}
            >
              {highlight.note ? 'Edit' : 'Add a thought'}
            </button>
            {confirming ? (
              <>
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  onClick={() => removeHighlight(highlight.id)}
                >
                  Remove it
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => setConfirming(false)}
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setConfirming(true)}
              >
                Remove
              </button>
            )}
          </div>
        </>
      )}
    </article>
  );
}

function NoteCard({
  note,
  query,
  plan,
  reveal,
  index,
}: {
  note: Note;
  query: string;
  plan: Plan;
  reveal: (node: Element | null) => void;
  index: number;
}) {
  const { saveNote, deleteNote } = useStore();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(note.text);

  return (
    <article
      ref={reveal}
      className={`noteCard reveal${editing ? ' noteCard--editing' : ''}`}
      style={{ '--i': index % 8 } as CSSProperties}
    >
      <span className="noteCard__quote" aria-hidden="true">
        “
      </span>

      <div className="noteCard__head">
        <h3 className="noteCard__ref">
          {note.book}
          {note.chapter !== null && <span> {note.chapter}</span>}
        </h3>
        <span className="noteCard__date">
          {new Date(note.updatedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>

      <span className="noteCard__phase">{phaseLabel(note.book, plan)}</span>

      {editing ? (
        <>
          <textarea
            className="field"
            rows={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div className="noteCard__actions">
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => {
                saveNote(note.book, note.chapter, draft);
                setEditing(false);
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => {
                setDraft(note.text);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="noteCard__text">
            <Highlighted text={note.text} query={query} />
          </p>
          <div className="noteCard__actions">
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            {confirming ? (
              <>
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  onClick={() => deleteNote(note.id)}
                >
                  Delete for good
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => setConfirming(false)}
                >
                  Keep
                </button>
              </>
            ) : (
              // A note is a paragraph someone wrote by hand. One extra tap is cheap.
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setConfirming(true)}
              >
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </article>
  );
}

export function NotesView() {
  const { data, derived } = useStore();
  const { plan } = derived;
  const reveal = useReveal();
  const [query, setQuery] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [bookFilter, setBookFilter] = useState('all');
  const [kind, setKind] = useState<'all' | 'notes' | 'highlights'>('all');

  /**
   * Chapter notes and highlights are different objects with the same purpose, so
   * they share one feed. Sorting by when they were last touched puts whatever you
   * were just working on at the top, whichever kind it was.
   */
  const entries = useMemo<Entry[]>(() => {
    const fromNotes: Entry[] = data.notes.map((n) => ({ kind: 'note' as const, note: n }));
    const fromHighlights: Entry[] = (data.highlights ?? []).map((h) => ({
      kind: 'highlight' as const,
      highlight: h,
    }));
    return [...fromNotes, ...fromHighlights].sort((a, b) =>
      entryDate(b).localeCompare(entryDate(a)),
    );
  }, [data.notes, data.highlights]);

  const books = useMemo(
    () => [...new Set(entries.map(entryBook))].sort(),
    [entries],
  );

  const notes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (kind === 'notes' && entry.kind !== 'note') return false;
      if (kind === 'highlights' && entry.kind !== 'highlight') return false;

      const book = entryBook(entry);
      if (bookFilter !== 'all' && book !== bookFilter) return false;
      if (phaseFilter !== 'all') {
        const phase = plan.phaseOfBook.get(book);
        const key = phase === undefined || phase === 0 ? 'prologue' : String(phase);
        if (key !== phaseFilter) return false;
      }
      if (q) {
        const haystack = `${book} ${entryText(entry)} ${
          entry.kind === 'highlight' ? entry.highlight.text : ''
        }`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, query, phaseFilter, bookFilter, kind, plan]);

  const filtered =
    query.trim() !== '' || phaseFilter !== 'all' || bookFilter !== 'all' || kind !== 'all';
  const highlightCount = data.highlights?.length ?? 0;
  const words = useMemo(
    () => data.notes.reduce((n, note) => n + note.text.trim().split(/\s+/).filter(Boolean).length, 0),
    [data.notes],
  );

  return (
    <>
      <ViewHeader
        eyebrow="Everything you wrote down"
        title="My notes"
        lede="Verses that stuck, questions, summaries. Searchable, and filed by phase."
        meta={
          <>
            <HeadChip gold>{plural(data.notes.length, 'note')}</HeadChip>
            <HeadChip>{plural(highlightCount, 'highlight')}</HeadChip>
            <HeadChip>{plural(books.length, 'book')} annotated</HeadChip>
            <HeadChip>{plural(words, 'word')} written</HeadChip>
          </>
        }
        aside={
          <>
            <span className="viewHead__stat">{entries.length}</span>
            <span className="viewHead__statLabel">
              {entries.length === 1 ? 'entry' : 'entries'}
            </span>
          </>
        }
      />

      <div className="container notesView">
        <div className="notesBar">
          <div className="searchBox">
            <Search size={15} className="searchBox__icon" />
            <input
              className="field searchBox__input"
              type="search"
              placeholder="Search your notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search notes"
            />
          </div>

          <select
            className="select"
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            aria-label="Filter by phase"
          >
            <option value="all">All phases</option>
            {plan.phases.map((p) => (
              <option key={p.phase} value={p.phase === 0 ? 'prologue' : String(p.phase)}>
                {p.phase === 0 ? 'Start here' : `Phase ${p.phase}`} · {p.title}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={bookFilter}
            onChange={(e) => setBookFilter(e.target.value)}
            aria-label="Filter by book"
          >
            <option value="all">All books</option>
            {books.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <div className="kindSwitch" role="group" aria-label="Show">
            {(['all', 'notes', 'highlights'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`kindSwitch__item${kind === option ? ' kindSwitch__item--on' : ''}`}
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
              >
                {option === 'all' ? 'Everything' : option === 'notes' ? 'Notes' : 'Highlights'}
              </button>
            ))}
          </div>

          <span className="notesCount" aria-live="polite">
            {plural(notes.length, 'entry', 'entries')}
          </span>

          {filtered && (
            <button
              type="button"
              className="btn btn--sm btn--ghost notesBar__clear"
              onClick={() => {
                setQuery('');
                setPhaseFilter('all');
                setBookFilter('all');
                setKind('all');
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {notes.length === 0 ? (
          <div className="empty">
            <span className="empty__mark" aria-hidden="true">
              “
            </span>
            <h3>{entries.length === 0 ? 'Nothing written down yet' : 'Nothing matches those filters'}</h3>
            <p>
              {entries.length === 0
                ? 'Two ways in: select any passage while reading to highlight it and write what you made of it, or open a book on the journey and use the “Note on” selector for a whole chapter.'
                : 'Try clearing the search or the phase filter.'}
            </p>
          </div>
        ) : (
          <div className="noteList">
            {notes.map((entry, i) =>
              entry.kind === 'note' ? (
                <NoteCard
                  key={entry.note.id}
                  note={entry.note}
                  query={query}
                  plan={plan}
                  reveal={reveal}
                  index={i}
                />
              ) : (
                <HighlightCard
                  key={entry.highlight.id}
                  highlight={entry.highlight}
                  query={query}
                  plan={plan}
                  reveal={reveal}
                  index={i}
                />
              ),
            )}
          </div>
        )}
      </div>
    </>
  );
}
