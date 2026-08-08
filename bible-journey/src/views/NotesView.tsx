import { useMemo, useState, type CSSProperties } from 'react';
import { HeadChip, ViewHeader } from '../components/ViewHeader';
import { Chevron, Search } from '../components/icons';
import { plural } from '../lib/format';
import { highlightRef } from '../lib/highlight';
import { useReveal } from '../lib/motion';
import type { Plan } from '../data/plans';
import type { Highlight, Note } from '../lib/storage';
import { useReader } from '../state/useReader';
import { useStore } from '../state/useStore';

/** One feed, two shapes: a chapter note, or a passage marked while reading. */
type Entry =
  | { kind: 'note'; note: Note }
  | { kind: 'highlight'; highlight: Highlight };

const entryId = (e: Entry) => (e.kind === 'note' ? e.note.id : e.highlight.id);
const entryBook = (e: Entry) => (e.kind === 'note' ? e.note.book : e.highlight.book);
const entryDate = (e: Entry) => (e.kind === 'note' ? e.note.updatedAt : e.highlight.updatedAt);
const entryThought = (e: Entry) => (e.kind === 'note' ? e.note.text : (e.highlight.note ?? ''));

function entryRef(e: Entry): string {
  if (e.kind === 'highlight') return highlightRef(e.highlight);
  return e.note.chapter === null ? e.note.book : `${e.note.book} ${e.note.chapter}`;
}

/** The one line a collapsed row shows: the thought, or the passage if there is none. */
function entryPreview(e: Entry): string {
  const thought = entryThought(e).trim();
  if (thought) return thought;
  return e.kind === 'highlight' ? e.highlight.text : '';
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
 * One row per entry, collapsed to a single line.
 *
 * These used to be full cards, which meant three notes filled a screen and
 * finding anything was a scroll. A row says what it is and the first line of
 * what you wrote; the rest, and everything that edits it, waits until you open
 * it.
 */
function EntryRow({
  entry,
  query,
  plan,
  open,
  onToggle,
  reveal,
  index,
}: {
  entry: Entry;
  query: string;
  plan: Plan;
  open: boolean;
  onToggle: () => void;
  reveal: (node: Element | null) => void;
  index: number;
}) {
  const { saveNote, deleteNote, noteHighlight, removeHighlight } = useStore();
  const { open: openReader } = useReader();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(entryThought(entry));

  const isNote = entry.kind === 'note';
  const preview = entryPreview(entry);

  return (
    <article
      ref={reveal}
      className={`entry reveal${open ? ' entry--open' : ''}${isNote ? '' : ' entry--hl'}`}
      style={{ '--i': index % 8 } as CSSProperties}
    >
      <button
        type="button"
        className="entry__head"
        aria-expanded={open}
        onClick={() => {
          onToggle();
          setEditing(false);
          setConfirming(false);
        }}
      >
        <span className="entry__ref">{entryRef(entry)}</span>
        <span className="entry__preview">
          {preview ? <Highlighted text={preview} query={query} /> : <em>No thoughts yet</em>}
        </span>
        <span className="entry__date">
          {new Date(entryDate(entry)).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </span>
        <Chevron size={14} className={`entry__chev${open ? ' entry__chev--open' : ''}`} />
      </button>

      {open && (
        <div className="entry__body">
          <span className="entry__phase">{phaseLabel(entryBook(entry), plan)}</span>

          {entry.kind === 'highlight' && (
            <blockquote className="entry__passage">
              <Highlighted text={entry.highlight.text} query={query} />
            </blockquote>
          )}

          {editing ? (
            <>
              <textarea
                className="field"
                rows={4}
                value={draft}
                placeholder={isNote ? 'Your note' : 'What did you make of it?'}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
              />
              <div className="entry__actions">
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  onClick={() => {
                    if (entry.kind === 'note') saveNote(entry.note.book, entry.note.chapter, draft);
                    else noteHighlight(entry.highlight.id, draft);
                    setEditing(false);
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => {
                    setDraft(entryThought(entry));
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              {entryThought(entry).trim() && (
                <p className="entry__text">
                  <Highlighted text={entryThought(entry)} query={query} />
                </p>
              )}
              <div className="entry__actions">
                {entry.kind === 'highlight' && (
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => openReader(entry.highlight.book, entry.highlight.chapter)}
                  >
                    Open
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => setEditing(true)}
                >
                  {entryThought(entry).trim() ? 'Edit' : 'Add a thought'}
                </button>
                {confirming ? (
                  <>
                    <button
                      type="button"
                      className="btn btn--sm btn--danger"
                      onClick={() => {
                        if (entry.kind === 'note') deleteNote(entry.note.id);
                        else removeHighlight(entry.highlight.id);
                      }}
                    >
                      {isNote ? 'Delete for good' : 'Remove it'}
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
                  // Someone wrote this by hand. One extra tap is cheap.
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => setConfirming(true)}
                  >
                    {isNote ? 'Delete' : 'Remove'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
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
  const [byBook, setByBook] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

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

  const books = useMemo(() => [...new Set(entries.map(entryBook))].sort(), [entries]);

  const shown = useMemo(() => {
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
        const haystack = `${book} ${entryThought(entry)} ${
          entry.kind === 'highlight' ? entry.highlight.text : ''
        }`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, query, phaseFilter, bookFilter, kind, plan]);

  /** Grouped under book headings, or one flat run in the order they were touched. */
  const groups = useMemo(() => {
    if (!byBook) return [{ book: '', items: shown }];
    const map = new Map<string, Entry[]>();
    for (const entry of shown) {
      const book = entryBook(entry);
      const list = map.get(book);
      if (list) list.push(entry);
      else map.set(book, [entry]);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([book, items]) => ({ book, items }));
  }, [shown, byBook]);

  const filtered =
    query.trim() !== '' || phaseFilter !== 'all' || bookFilter !== 'all' || kind !== 'all';
  const highlightCount = data.highlights?.length ?? 0;

  return (
    <>
      <ViewHeader
        eyebrow="Everything you wrote down"
        title="My notes"
        lede="Verses that stuck, questions, summaries. Searchable, and filed by book."
        meta={
          <>
            <HeadChip gold>{plural(data.notes.length, 'note')}</HeadChip>
            <HeadChip>{plural(highlightCount, 'highlight')}</HeadChip>
            <HeadChip>{plural(books.length, 'book')} annotated</HeadChip>
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

          <div className="kindSwitch" role="group" aria-label="Show">
            {(['all', 'notes', 'highlights'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`kindSwitch__item${kind === option ? ' kindSwitch__item--on' : ''}`}
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
              >
                {option === 'all' ? 'All' : option === 'notes' ? 'Notes' : 'Highlights'}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`chipBtn${byBook ? ' chipBtn--on' : ''}`}
            aria-pressed={byBook}
            onClick={() => setByBook((on) => !on)}
          >
            Group by book
          </button>

          <span className="notesCount" aria-live="polite">
            {plural(shown.length, 'entry', 'entries')}
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

        {shown.length === 0 ? (
          <div className="empty">
            <span className="empty__mark" aria-hidden="true">
              “
            </span>
            <h3>
              {entries.length === 0 ? 'Nothing written down yet' : 'Nothing matches those filters'}
            </h3>
            <p>
              {entries.length === 0
                ? 'Two ways in: select any passage while reading to highlight it and write what you made of it, or open a book on the journey and use the “Note on” selector for a whole chapter.'
                : 'Try clearing the search or the filters.'}
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <div className="entryGroup" key={group.book || 'all'}>
              {group.book && (
                <h3 className="entryGroup__title">
                  {group.book}
                  <span>{plural(group.items.length, 'entry', 'entries')}</span>
                </h3>
              )}
              <div className="entryList">
                {group.items.map((entry, i) => (
                  <EntryRow
                    key={entryId(entry)}
                    entry={entry}
                    query={query}
                    plan={plan}
                    open={openId === entryId(entry)}
                    onToggle={() =>
                      setOpenId((current) =>
                        current === entryId(entry) ? null : entryId(entry),
                      )
                    }
                    reveal={reveal}
                    index={i}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
