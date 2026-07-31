import { useMemo, useState } from 'react';
import { plural } from '../lib/format';
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

function NoteCard({ note, query, plan }: { note: Note; query: string; plan: Plan }) {
  const { saveNote, deleteNote } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);

  return (
    <article className="noteCard">
      <div className="noteCard__head">
        <h3 className="noteCard__ref">
          {note.book}
          {note.chapter !== null && ` ${note.chapter}`}
        </h3>
        <span className="noteCard__phase">{phaseLabel(note.book, plan)}</span>
        <span className="noteCard__date">
          {new Date(note.updatedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>

      {editing ? (
        <>
          <textarea
            className="field"
            rows={4}
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
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => deleteNote(note.id)}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </article>
  );
}

export function NotesView() {
  const { data, derived } = useStore();
  const { plan } = derived;
  const [query, setQuery] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [bookFilter, setBookFilter] = useState('all');

  const books = useMemo(
    () => [...new Set(data.notes.map((n) => n.book))].sort(),
    [data.notes],
  );

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

  return (
    <div className="container notesView">
      <div className="sectionHead">
        <div>
          <p className="eyebrow">Everything you wrote down</p>
          <h2>My notes</h2>
        </div>
      </div>

      <div className="notesBar">
        <input
          className="field"
          type="search"
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search notes"
        />
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
        <span className="notesCount">{plural(notes.length, 'note')}</span>
      </div>

      {notes.length === 0 ? (
        <div className="empty">
          <h3>{data.notes.length === 0 ? 'No notes yet' : 'Nothing matches those filters'}</h3>
          <p>
            {data.notes.length === 0
              ? 'Open any book on the journey, pick a chapter in the “Note on” selector, and write down whatever you want to keep.'
              : 'Try clearing the search or the phase filter.'}
          </p>
        </div>
      ) : (
        <div className="noteList">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} query={query} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}
