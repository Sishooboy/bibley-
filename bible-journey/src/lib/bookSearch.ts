/**
 * Matching is loose on purpose. Sixty-six books is a lot to scroll, and what
 * someone types on a phone is rarely what is printed on the page: "1john" and
 * "1 John" should both work, and so should an abbreviation like "jhn".
 */
export function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function matchesBook(book: string, query: string): boolean {
  const q = normalise(query);
  if (!q) return true;
  const name = normalise(book);
  if (name.includes(q)) return true;

  // Subsequence, so "jhn" reaches John and "rvltn" reaches Revelation.
  let i = 0;
  for (const ch of name) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

/**
 * Best matches first: a name that starts with what you typed beats one that
 * merely contains it, which beats one that only matches letter by letter.
 */
export function rankBooks(books: readonly string[], query: string): string[] {
  const q = normalise(query);
  if (!q) return [];
  const score = (book: string): number => {
    const name = normalise(book);
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.includes(q)) return 2;
    return 3;
  };
  return books
    .filter((b) => matchesBook(b, query))
    .map((b, i) => ({ b, i, s: score(b) }))
    .sort((x, y) => x.s - y.s || x.i - y.i)
    .map((e) => e.b);
}
