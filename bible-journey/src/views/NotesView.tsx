import { useMemo, useState, type CSSProperties } from 'react';
import { HeadChip, ViewHeader } from '../components/ViewHeader';
import { Search } from '../components/icons';
import { plural } from '../lib/format';
import { useReveal } from '../lib/motion';
import type { Plan } from '../data/plans';
import type { Note } from '../lib/storage';
import { useStore } from '../state/useStore';

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

  const books = useMemo(() => [...new Set(data.notes.map((n) => n.book))].sort(), [data.notes]);

  const notes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.notes
      .filter((n) => {
        if (bookFilter !== 'all' && n.book !== bookFilter) return false;
        if (phaseFilter !== 'all') {
          const phase = plan.phaseOfBook.get(n.book);
          const key = phase === undefined || phase === 0 ? 'prologue' : String(phase);
          if (key !== phaseFilter) return false;
        }
        if (q && !n.text.toLowerCase().includes(q) && !n.book.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [data.notes, query, phaseFilter, bookFilter, plan]);

  const filtered = query.trim() !== '' || phaseFilter !== 'all' || bookFilter !== 'all';
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
            <HeadChip>{plural(books.length, 'book')} annotated</HeadChip>
            <HeadChip>{plural(words, 'word')} written</HeadChip>
          </>
        }
        aside={
          <>
            <span className="viewHead__stat">{data.notes.length}</span>
            <span className="viewHead__statLabel">
              {data.notes.length === 1 ? 'note' : 'notes'}
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

          <span className="notesCount" aria-live="polite">
            {plural(notes.length, 'note')}
          </span>

          {filtered && (
            <button
              type="button"
              className="btn btn--sm btn--ghost notesBar__clear"
              onClick={() => {
                setQuery('');
                setPhaseFilter('all');
                setBookFilter('all');
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
            <h3>{data.notes.length === 0 ? 'No notes yet' : 'Nothing matches those filters'}</h3>
            <p>
              {data.notes.length === 0
                ? 'Open any book on the journey, pick a chapter in the “Note on” selector, and write down whatever you want to keep.'
                : 'Try clearing the search or the phase filter.'}
            </p>
          </div>
        ) : (
          <div className="noteList">
            {notes.map((note, i) => (
              <NoteCard
                key={note.id}
                note={note}
                query={query}
                plan={plan}
                reveal={reveal}
                index={i}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
