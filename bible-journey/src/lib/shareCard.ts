import type { Plan } from '../data/plans';
import { formatDay } from './dates';
import { formatNumber } from './format';
import { highlightRef } from './highlight';
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
   * The passage the card quotes: the reader's most recently touched highlight.
   * Null until they have marked one. The words only, never the thought they
   * wrote beside it, which is theirs and not for a card going to other people.
   */
  verse: { text: string; ref: string } | null;
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
  /*
   * The most recently touched highlight, which is the one they are most likely
   * to still be thinking about. Sorted rather than assumed: highlights merge
   * from two devices and arrive in whatever order the server had them.
   */
  const latest = [...(data.highlights ?? [])]
    .filter((h) => h.text.trim() !== '')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const verse = latest ? { text: latest.text.trim(), ref: highlightRef(latest) } : null;

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
    verse,
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

/**
 * Breaks a passage into lines that fit, and says so with an ellipsis when it
 * does not. Canvas has no notion of wrapping, and a highlight can be a sentence
 * or half a chapter, so the card has to decide where the words break itself.
 */
export function wrapText(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }

  if (lines.length < maxLines && line) lines.push(line);

  // Anything left over is cut, and the cut is admitted rather than hidden.
  const consumed = lines.join(' ');
  if (consumed.length < text.replace(/\s+/g, ' ').trim().length) {
    const last = lines.length - 1;
    let tail = `${lines[last]}…`;
    while (tail.length > 1 && measure(tail) > maxWidth) {
      tail = `${tail.slice(0, -2).trimEnd()}…`;
    }
    lines[last] = tail;
  }

  return lines;
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
   * A verse the reader marked themselves. This used to be three bar charts of
   * their most-read books, which said the same thing as the figures above it in
   * a slower way. Scripture in Fraunces on a gradient is the part of this card
   * anyone would actually want to send.
   */
  if (s.verse) {
    label(ctx, 'A verse that stuck', M, 934);

    // An opening quote in gold, set behind the text the way a pull quote is.
    ctx.font = `600 150px ${DISPLAY}`;
    ctx.fillStyle = 'rgba(247, 184, 1, 0.22)';
    ctx.fillText('“', M - 8, 1058);

    ctx.font = `600 42px ${DISPLAY}`;
    const lines = wrapText(
      (text) => ctx.measureText(text).width,
      s.verse.text,
      barW - 40,
      3,
    );
    ctx.fillStyle = CREAM;
    let y = 1004;
    for (const line of lines) {
      ctx.fillText(line, M + 40, y);
      y += 56;
    }

    ctx.font = `600 26px ${BODY}`;
    ctx.fillStyle = GOLD;
    ctx.letterSpacing = '3px';
    ctx.fillText(s.verse.ref.toUpperCase(), M + 40, y + 8);
    ctx.letterSpacing = '0px';
  } else {
    // Day one still deserves a card worth sending, rather than a blank half.
    ctx.font = `600 46px ${DISPLAY}`;
    ctx.fillStyle = CREAM;
    ctx.fillText(
      s.chaptersRead === 0 ? 'Just getting started.' : 'Highlight a verse as you read.',
      M,
      1010,
    );
    ctx.font = `400 28px ${BODY}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(
      s.chaptersRead === 0
        ? `${formatNumber(s.chaptersTotal)} chapters ahead.`
        : 'Whichever one you marked last lands here.',
      M,
      1060,
    );
  }

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
    `${s.perWeek.toFixed(1)} chapters a week.` +
    (s.verse ? ` Quoting ${s.verse.ref}.` : '')
  );
}
