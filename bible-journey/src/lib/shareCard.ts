import { CANON } from '../data/canon';
import type { Plan } from '../data/plans';
import { formatDay } from './dates';
import { formatNumber } from './format';
import type { OverallProgress, Pace, Streak } from './progress';
import { SLOTS, SLOT_LABELS, type AppData, type Slot } from './storage';

export type ShareStats = {
  planLabel: string;
  chaptersRead: number;
  chaptersTotal: number;
  percent: number;
  booksDone: number;
  booksTotal: number;
  streak: number;
  longestStreak: number;
  perWeek: number;
  daysActive: number;
  /**
   * Every book in the plan, in printed order, with how far into it the reader
   * has got. The card draws it as a grid, which is the one thing on there that
   * says something a percentage cannot: which parts, and how evenly.
   */
  books: { name: string; read: number; total: number }[];
  /** Started but not finished. `booksDone` covers the rest. */
  booksStarted: number;
  /** Only when the reader actually tagged some readings. */
  favouriteSlot: Slot | null;
  since: string;
};

/**
 * Everything the card shows, worked out once and kept plain, so the drawing code
 * has no decisions left in it and the numbers can be tested without a canvas.
 */
export function buildShareStats(
  data: AppData,
  plan: Plan,
  overall: OverallProgress,
  streak: Streak,
  pace: Pace,
): ShareStats {
  const totals = new Map(plan.phases.flatMap((p) => p.books).map((b) => [b.name, b.chapters]));

  const perBook = new Map<string, number>();
  for (const key of Object.keys(data.read)) {
    const book = key.slice(0, key.lastIndexOf('|'));
    // Chapters outside the current plan are still stored, but a card about this
    // plan should not quietly count them.
    if (!totals.has(book)) continue;
    perBook.set(book, (perBook.get(book) ?? 0) + 1);
  }

  /*
   * Printed order, not the plan's reading order. The grid is meant to be
   * recognisable as a Bible, Genesis in the corner and Revelation at the end,
   * rather than as this app's opinion about what to read first.
   */
  const books = CANON.filter((name) => totals.has(name)).map((name) => ({
    name,
    read: Math.min(perBook.get(name) ?? 0, totals.get(name) ?? 0),
    total: totals.get(name) ?? 0,
  }));
  const booksStarted = books.filter((b) => b.read > 0 && b.read < b.total).length;

  const slotCounts = new Map<Slot, number>();
  for (const slot of Object.values(data.slots ?? {})) {
    slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1);
  }
  let favouriteSlot: Slot | null = null;
  let best = 0;
  for (const slot of SLOTS) {
    const count = slotCounts.get(slot) ?? 0;
    if (count > best) {
      best = count;
      favouriteSlot = slot;
    }
  }

  return {
    planLabel: plan.label,
    chaptersRead: overall.planRead,
    chaptersTotal: overall.planTotal,
    percent: overall.percent,
    booksDone: overall.booksDone,
    booksTotal: overall.booksTotal,
    streak: streak.current,
    longestStreak: streak.longest,
    perWeek: pace.perWeek,
    daysActive: pace.daysActive,
    books,
    booksStarted,
    favouriteSlot,
    since: data.startedAt,
  };
}

/** Portrait, the shape a phone screen and every share sheet expects. */
export const CARD_W = 1080;
export const CARD_H = 1350;

const RED_DARK = '#47090e';
const INK = '#1a1512';
const GOLD = '#f7b801';
const CREAM = '#f7f2e9';
const MUTED = 'rgba(247, 242, 233, 0.62)';

const DISPLAY = '"Fraunces Variable", Georgia, serif';
const BODY = '"Inter Variable", system-ui, sans-serif';

/**
 * The fonts have to be loaded before anything is drawn. Canvas silently falls
 * back to a default face rather than waiting, and a card in the wrong typeface
 * is the one thing worth blocking on here.
 */
export async function readyFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all([
    document.fonts.load(`600 120px ${DISPLAY}`),
    document.fonts.load(`400 32px ${BODY}`),
    document.fonts.load(`600 32px ${BODY}`),
  ]);
  await document.fonts.ready;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.font = `600 24px ${BODY}`;
  ctx.fillStyle = MUTED;
  ctx.letterSpacing = '3px';
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
}

export type Grid = { cols: number; rows: number; cell: number; width: number; height: number };

/**
 * How to lay `count` squares out in a box. Columns come first from a target
 * square size, then more columns are added until the whole thing fits the height
 * it has been given, because a grid that reaches past the footer is worse than
 * one with slightly small squares.
 *
 * The number of books depends on the plan, 73 or 46 or 27, so none of this can
 * be a constant.
 */
export function gridLayout(
  count: number,
  maxWidth: number,
  maxHeight: number,
  gap = 8,
  target = 44,
): Grid {
  if (count <= 0) return { cols: 0, rows: 0, cell: 0, width: 0, height: 0 };

  const measure = (cols: number): Grid => {
    const cell = (maxWidth - (cols - 1) * gap) / cols;
    const rows = Math.ceil(count / cols);
    return {
      cols,
      rows,
      cell,
      width: cols * cell + (cols - 1) * gap,
      height: rows * cell + (rows - 1) * gap,
    };
  };

  let cols = Math.min(count, Math.max(1, Math.round(maxWidth / (target + gap))));
  let grid = measure(cols);
  while (grid.height > maxHeight && cols < count) {
    cols += 1;
    grid = measure(cols);
  }
  return grid;
}

/** One statistic: a small label with a large Fraunces figure under it. */
function stat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  value: string,
  note?: string,
): void {
  label(ctx, text, x, y);
  ctx.font = `600 76px ${DISPLAY}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(value, x, y + 82);
  if (note) {
    ctx.font = `400 26px ${BODY}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(note, x, y + 122);
  }
}

export function drawShareCard(ctx: CanvasRenderingContext2D, s: ShareStats): void {
  ctx.clearRect(0, 0, CARD_W, CARD_H);

  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, INK);
  bg.addColorStop(0.45, RED_DARK);
  bg.addColorStop(1, '#8e1420');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // The same off-canvas rings the mastheads use, so a shared card still reads
  // as this app rather than as a generic stats image.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
  ctx.lineWidth = 2;
  for (const r of [380, 520, 660]) {
    ctx.beginPath();
    ctx.arc(CARD_W - 60, 120, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const glow = ctx.createRadialGradient(140, CARD_H - 80, 0, 140, CARD_H - 80, 520);
  glow.addColorStop(0, 'rgba(247, 184, 1, 0.20)');
  glow.addColorStop(1, 'rgba(247, 184, 1, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, CARD_H - 600, 700, 600);

  const M = 84;
  ctx.textBaseline = 'alphabetic';

  ctx.font = `600 34px ${DISPLAY}`;
  ctx.fillStyle = CREAM;
  ctx.fillText('Bibley', M, 110);
  label(ctx, s.planLabel, M + 130, 108);

  // Headline: the number the whole card is about.
  ctx.font = `600 210px ${DISPLAY}`;
  ctx.fillStyle = GOLD;
  const percent = `${s.percent.toFixed(1)}%`;
  ctx.fillText(percent, M, 330);

  ctx.font = `400 34px ${BODY}`;
  ctx.fillStyle = CREAM;
  ctx.fillText(
    `${formatNumber(s.chaptersRead)} of ${formatNumber(s.chaptersTotal)} chapters read`,
    M,
    386,
  );

  // Progress bar.
  const barY = 430;
  const barW = CARD_W - M * 2;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  roundRect(ctx, M, barY, barW, 18, 9);
  ctx.fill();
  const fill = ctx.createLinearGradient(M, 0, M + barW, 0);
  fill.addColorStop(0, '#e09a00');
  fill.addColorStop(1, GOLD);
  // A zero-width rounded rect still paints its corners, which reads as progress
  // nobody has made. Nothing read draws nothing.
  if (s.percent > 0) {
    ctx.fillStyle = fill;
    roundRect(ctx, M, barY, Math.max(18, (barW * Math.min(100, s.percent)) / 100), 18, 9);
    ctx.fill();
  }

  // Four figures, two by two.
  const colTwo = CARD_W / 2 + 20;
  stat(ctx, M, 560, 'Day streak', `${s.streak}`, `longest ${s.longestStreak}`);
  stat(ctx, colTwo, 560, 'Books finished', `${s.booksDone}`, `of ${s.booksTotal}`);
  stat(ctx, M, 740, 'Chapters a week', s.perWeek.toFixed(1), `over ${s.daysActive} reading days`);
  stat(
    ctx,
    colTwo,
    740,
    'Reads most',
    s.favouriteSlot ? SLOT_LABELS[s.favouriteSlot].replace(/^in the /, '') : '—',
    s.favouriteSlot ? 'by their own account' : 'no times tagged yet',
  );

  /*
   * One square per book, in printed order, each filled from the bottom by how
   * far into it the reader has got. It is the only thing on the card that says
   * something a percentage cannot: which parts, and how evenly, and it stays
   * worth looking at from an entirely empty grid to a gold one.
   */
  label(ctx, 'Book by book', M, 916);

  // The height is everything between here and the footer rule, less the line of
  // counts underneath. Squares as big as that allows, which for 73 books is
  // four rows of nineteen.
  const grid = gridLayout(s.books.length, barW, 196);
  const gap = 8;
  const gridTop = 950;

  s.books.forEach((book, i) => {
    const x = M + (i % grid.cols) * (grid.cell + gap);
    const y = gridTop + Math.floor(i / grid.cols) * (grid.cell + gap);
    const done = book.total > 0 && book.read >= book.total;
    const part = book.total === 0 ? 0 : Math.min(1, book.read / book.total);
    const radius = Math.min(5, grid.cell / 5);

    // The empty square first, so a part-read book reads as a container with
    // something in it rather than as a short block floating on the gradient.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    roundRect(ctx, x, y, grid.cell, grid.cell, radius);
    ctx.fill();

    if (part === 0) return;

    // Filled from the bottom up, the way you would fill a glass.
    const filled = Math.max(3, grid.cell * part);
    ctx.save();
    roundRect(ctx, x, y, grid.cell, grid.cell, radius);
    ctx.clip();
    ctx.fillStyle = done ? GOLD : '#e0313a';
    ctx.fillRect(x, y + grid.cell - filled, grid.cell, filled);
    ctx.restore();
  });

  ctx.font = `400 28px ${BODY}`;
  ctx.fillStyle = MUTED;
  const remaining = s.books.length - s.booksDone - s.booksStarted;
  ctx.fillText(
    `${s.booksDone} finished · ${s.booksStarted} on the go · ${remaining} to open`,
    M,
    gridTop + grid.height + 46,
  );

  // Footer rule and credit.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M, CARD_H - 132);
  ctx.lineTo(CARD_W - M, CARD_H - 132);
  ctx.stroke();

  ctx.font = `400 26px ${BODY}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(`Reading since ${formatDay(s.since)}`, M, CARD_H - 82);

  ctx.font = `600 26px ${BODY}`;
  ctx.fillStyle = GOLD;
  const mark = 'Bibley';
  ctx.fillText(mark, CARD_W - M - ctx.measureText(mark).width, CARD_H - 82);
}

/** A one-line summary for anyone who cannot see the image. */
export function describeCard(s: ShareStats): string {
  return (
    `${s.percent.toFixed(1)}% of ${s.planLabel} read, ` +
    `${formatNumber(s.chaptersRead)} of ${formatNumber(s.chaptersTotal)} chapters, ` +
    `${s.booksDone} books finished, a ${s.streak} day streak, ` +
    `${s.perWeek.toFixed(1)} chapters a week. ` +
    `${s.booksStarted} of ${s.books.length} books part read.`
  );
}
