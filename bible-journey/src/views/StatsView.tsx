import type { CSSProperties, ReactNode } from 'react';
import {
  Bar,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FoldCard } from '../components/FoldCard';
import { Heatmap } from '../components/Heatmap';
import { ShareCard } from '../components/ShareCard';
import { StatRing } from '../components/StatRing';
import { Flame } from '../components/icons';
import { HeadChip, ViewHeader } from '../components/ViewHeader';
import { formatDay, fromDayKey, today } from '../lib/dates';
import { formatNumber, plural } from '../lib/format';
import { useCountUp, useReveal } from '../lib/motion';
import { cumulative, last30Days, nextUnread } from '../lib/progress';
import { recentDays } from '../lib/readingLog';
import { SLOTS, SLOT_LABELS, type Slot } from '../lib/storage';
import { useReader } from '../state/useReader';
import { useStore } from '../state/useStore';

const RED = '#c81d25';
const YELLOW = '#f7b801';
const LINE = '#e2d8c8';
const MUTED = '#6b5e55';

/*
 * Both 30-day charts, so they stay the same height as each other: side by side
 * on a wide screen they are one picture of the same window, and a 40px
 * difference between them would read as a mistake.
 */
const CHART_H = 180;

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type TipPayload = { payload?: { day: string; chapters: number; total: number } }[];

/** One day, both series. The chart draws two things, so the tooltip says two. */
function ChartTip({ active, payload }: { active?: boolean; payload?: TipPayload }) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div className="tooltip">
      <div>{formatDay(point.day)}</div>
      <b>{plural(point.chapters, 'chapter')}</b>
      <div className="tooltip__sub">{formatNumber(point.total)} read in total</div>
    </div>
  );
}

/** A figure that counts up the first time it is painted. */
function Counter({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const n = useCountUp(value);
  return <>{decimals ? n.toFixed(decimals) : formatNumber(Math.round(n))}</>;
}

/**
 * One figure in the strip: a label, a number, and what the number is out of.
 *
 * These were four cards and a three item list in the hero, which between them
 * said books done twice and the chapters remaining twice, in 560px of bordered
 * boxes. A figure is not a panel and does not need panel furniture, so the
 * strip carries all six on hairlines and takes about a third of the room.
 */
function Figure({
  label,
  value,
  note,
  icon,
  gold,
}: {
  label: string;
  value: ReactNode;
  note: ReactNode;
  icon?: ReactNode;
  gold?: boolean;
}) {
  return (
    <div className={`figure${gold ? ' figure--gold' : ''}`}>
      <span className="figure__label">{label}</span>
      <span className="figure__value">
        {icon}
        {value}
      </span>
      <span className="figure__note">{note}</span>
    </div>
  );
}

/**
 * What a reader sees before there is anything to chart.
 *
 * Every panel below this works perfectly well on an empty journal, which is the
 * problem: a ring at nothing, a month of no bars, a heatmap of blanks and a
 * finish date that cannot be worked out. Nine panels agreeing there is nothing
 * is the least encouraging thing a new reader can open, so none of them are
 * drawn until there is a single chapter behind them.
 */
function NothingYet({ planTotal }: { planTotal: number }) {
  const { data, derived } = useStore();
  const { open } = useReader();
  const [first] = nextUnread(data.read, 1, derived.plan);

  return (
    <div className="empty statsEmpty">
      <span className="empty__mark" aria-hidden="true">
        %
      </span>
      <h3>Nothing to chart yet</h3>
      <p>
        Mark one chapter and this fills in. Everything here is worked out from what you have read,
        so it has nothing to say until you have read something.
      </p>

      <ul className="statsEmpty__list">
        <li>A streak, from the first day you mark anything</li>
        <li>Your pace, and the date the last of {formatNumber(planTotal)} chapters lands</li>
        <li>Every day of the last eighteen weeks, darkest where you read most</li>
        <li>A card of the whole Bible, filling in book by book, worth sending someone</li>
      </ul>

      {first && (
        <div className="statsEmpty__actions">
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={() => open(first.book, first.chapter)}
          >
            Read {first.book} {first.chapter}
          </button>
        </div>
      )}
    </div>
  );
}

export function StatsView() {
  const { data, derived } = useStore();
  const { overall, pace, phases, streak, plan } = derived;
  const reveal = useReveal();

  const daily = last30Days(data.read);
  const running = cumulative(data.read);
  /*
   * One row per day carrying both series. They were two charts of the same
   * thirty days with the same x-axis stacked one above the other, which is two
   * cards, two heads and two axes to say "here is the month" twice.
   */
  const thirty = daily.map((d, i) => ({
    day: d.day,
    chapters: d.chapters,
    total: running[i].total,
  }));
  const todayKey = today();
  const busiest = daily.reduce((max, d) => Math.max(max, d.chapters), 0);
  const lastWeek = last30Days(data.read, 7);
  const days = recentDays(data.read);

  // Time of day is opt-in, so this counts only what was actually tagged rather
  // than treating untagged chapters as a fifth, largest category.
  const slotCounts = SLOTS.reduce(
    (acc, slot) => ({ ...acc, [slot]: 0 }),
    {} as Record<Slot, number>,
  );
  for (const slot of Object.values(data.slots ?? {})) slotCounts[slot] += 1;
  const taggedTotal = SLOTS.reduce((n, slot) => n + slotCounts[slot], 0);
  const topSlot = Math.max(...SLOTS.map((slot) => slotCounts[slot]));

  const phasesDone = phases.filter((p) => p.done).length;
  const loggedChapters = days.reduce((n, d) => n + d.total, 0);

  const tickStyle = { fill: MUTED, fontSize: 11, fontFamily: 'Inter Variable, sans-serif' };

  /*
   * Before the first chapter there is nothing to draw, and the masthead's own
   * chips would be three zeros. It says what is ahead instead.
   */
  if (overall.planRead === 0) {
    return (
      <>
        <ViewHeader
          eyebrow="How it’s actually going"
          title="Stats"
          lede="Pace, streaks and where the chapters have gone. This is where it all shows up."
          meta={
            <>
              <HeadChip gold>{plan.label}</HeadChip>
              <HeadChip>{formatNumber(overall.planTotal)} chapters ahead</HeadChip>
              <HeadChip>{plural(plan.bookCount, 'book')}</HeadChip>
            </>
          }
        />
        <div className="container statsView">
          <NothingYet planTotal={overall.planTotal} />
        </div>
      </>
    );
  }

  return (
    <>
      <ViewHeader
        eyebrow="How it’s actually going"
        title="Stats"
        lede="Pace, streaks and where the chapters have gone."
        meta={
          <>
            <HeadChip gold>{plural(streak.current, 'day')} streak</HeadChip>
            <HeadChip>{pace.perWeek.toFixed(1)} chapters a week</HeadChip>
            <HeadChip>{plural(overall.booksDone, 'book')} finished</HeadChip>
          </>
        }
        aside={
          <>
            <span className="viewHead__stat">{overall.percent.toFixed(1)}%</span>
            <span className="viewHead__statLabel">
              of {formatNumber(overall.planTotal)} chapters
            </span>
          </>
        }
      />

      <div className="container statsView">
        <section ref={reveal} className="statsHero reveal">
          <StatRing
            percent={overall.percent}
            label={`${overall.percent.toFixed(1)}%`}
            sublabel="complete"
          />
          <div className="statsHero__body">
            <p className="eyebrow eyebrow--onDark">{plan.label}</p>
            <h3 className="statsHero__title">
              {formatNumber(overall.planRead)}
              <span> of {formatNumber(overall.planTotal)} chapters read</span>
            </h3>
            <p className="statsHero__note">
              {overall.planRead === 0
                ? 'Nothing marked yet. The first chapter is the whole trick.'
                : pace.finishBy
                  ? `Hold this pace and the last chapter lands ${formatDay(pace.finishBy)}.`
                  : 'Plan complete. Every chapter in this plan is marked.'}
            </p>
          </div>
        </section>

        {/*
          Six figures on hairlines rather than four bordered cards and a list in
          the hero. Between them those two said books done twice and the
          chapters remaining twice, and spent about 560px doing it.
        */}
        <section ref={reveal} className="figures reveal">
          <Figure
            label="Chapters read"
            value={<Counter value={overall.planRead} />}
            note={`of ${formatNumber(overall.planTotal)}`}
          />
          <Figure
            label="Pace"
            value={<Counter value={pace.perWeek} decimals={1} />}
            note="chapters a week"
          />
          <Figure
            label="Books done"
            value={overall.booksDone}
            note={`of ${overall.booksTotal}`}
          />
          <Figure
            label="Streak"
            value={streak.current}
            note={streak.current === 1 ? 'day running' : 'days running'}
            icon={
              <Flame size={19} className={`flame${streak.current > 0 ? ' flame--lit' : ''}`} />
            }
          />
          <Figure
            label="Longest"
            value={streak.longest}
            note={streak.longest === 1 ? 'day' : 'days'}
          />
          <Figure
            gold
            label="At this pace"
            value={pace.finishBy ? formatDay(pace.finishBy, { day: undefined }) : 'Not yet'}
            note={
              pace.finishBy
                ? `${formatNumber(pace.remaining)} to go`
                : overall.planRead === overall.planTotal
                  ? 'Plan complete'
                  : 'Mark a few more'
            }
          />
        </section>

        {/*
          Both halves of the same question. The seven days say whether you read,
          the four bars say when, and they were two cards asking it separately.
        */}
        <section ref={reveal} className="card reveal">
          <div className="card__head">
            <div>
              <h3 className="card__title">Your week</h3>
              <p className="card__note">
                {streak.current === 0
                  ? 'No streak going. Mark anything today and it starts at one.'
                  : `Longest run so far is ${plural(streak.longest, 'day')}.`}
              </p>
            </div>
          </div>
          <div className="habit">
            <div className="weekStrip">
              {lastWeek.map((d, i) => (
                <span
                  key={d.day}
                  className={`weekStrip__day${d.chapters > 0 ? ' is-read' : ''}${
                    d.day === todayKey ? ' is-today' : ''
                  }`}
                  style={{ '--i': i } as CSSProperties}
                  title={`${formatDay(d.day)} · ${plural(d.chapters, 'chapter')}`}
                >
                  <i>{WEEKDAYS[fromDayKey(d.day).getDay()]}</i>
                  <b>{d.chapters > 0 ? d.chapters : '·'}</b>
                </span>
              ))}
            </div>

            <div className="habit__slots">
              <p className="habit__sub">
                When you read
                <span>
                  {taggedTotal === 0
                    ? 'Optional. Tag a chapter when you mark it.'
                    : `from ${plural(taggedTotal, 'tagged chapter')}`}
                </span>
              </p>
              <div className="slotChart">
                {SLOTS.map((slot) => {
                  const count = slotCounts[slot];
                  const pct = taggedTotal === 0 ? 0 : (count / taggedTotal) * 100;
                  const best = count > 0 && count === topSlot;
                  return (
                    <div className={`slotBar${best ? ' slotBar--best' : ''}`} key={slot}>
                      <span className="slotBar__name">
                        {SLOT_LABELS[slot].replace(/^in the /, '')}
                      </span>
                      <span className="slotBar__track" aria-hidden="true">
                        <span className="slotBar__fill" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="slotBar__count">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/*
          One chart, two series. The bars are the day and the gold line is the
          running total, which is the one pairing where a second axis earns its
          keep: the shape of the climb is the answer, so the right axis is
          hidden and the tooltip carries the number.
        */}
        <section ref={reveal} className="card reveal">
          <div className="card__head">
            <div>
              <h3 className="card__title">The last 30 days</h3>
              <p className="card__note">
                Chapters a day, and the total climbing behind them. Busiest day: {busiest}.
              </p>
            </div>
            <div className="legend">
              <span className="legend__key">
                <span className="legend__swatch" style={{ background: RED }} /> a day
              </span>
              <span className="legend__key">
                <span className="legend__swatch legend__swatch--line" /> total
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={CHART_H}>
            <ComposedChart data={thirty} margin={{ top: 6, right: 4, bottom: 4, left: -18 }}>
              <defs>
                <linearGradient id="barRed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e0313a" />
                  <stop offset="100%" stopColor="#96161f" />
                </linearGradient>
                <linearGradient id="barGold" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffd447" />
                  <stop offset="100%" stopColor="#e09a00" />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                tick={tickStyle}
                tickLine={false}
                axisLine={{ stroke: LINE }}
                interval={6}
                tickFormatter={(d: string) => formatDay(d, { year: undefined })}
              />
              <YAxis
                yAxisId="day"
                tick={tickStyle}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={44}
              />
              {/* Hidden on purpose. Two axes on a 288px phone leaves no room for
                  thirty bars, and the total is in the tooltip and the strip. */}
              <YAxis yAxisId="total" orientation="right" hide />
              <Tooltip cursor={{ fill: 'rgba(200,29,37,0.07)' }} content={<ChartTip />} />
              <Bar yAxisId="day" dataKey="chapters" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {thirty.map((d) => (
                  <Cell key={d.day} fill={d.day === todayKey ? 'url(#barGold)' : 'url(#barRed)'} />
                ))}
              </Bar>
              <Line
                yAxisId="total"
                type="monotone"
                dataKey="total"
                stroke={YELLOW}
                strokeWidth={2.5}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4, fill: YELLOW, stroke: '#96161f', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </section>

        <section ref={reveal} className="card reveal">
          <div className="card__head">
            <div>
              <h3 className="card__title">Reading rhythm</h3>
              <p className="card__note">
                Every day of the last eighteen weeks, darkest where you read most
              </p>
            </div>
          </div>
          <Heatmap read={data.read} />
        </section>

        <section ref={reveal} className="card reveal">
          <div className="card__head">
            <div>
              <h3 className="card__title">Share where you are</h3>
              <p className="card__note">
                Everything on one card. Save it, send it, or just screenshot what is below.
              </p>
            </div>
          </div>
          <ShareCard />
        </section>

        {/*
          The two long tables end the page, shut. Both repeat in rows what the
          charts above say in a picture, so they are worth keeping and not worth
          a screen each.
        */}
        <FoldCard
          reveal={reveal}
          title="What you read, and when"
          summary={
            days.length === 0
              ? 'Nothing marked yet'
              : `${plural(days.length, 'reading day')} · ${plural(loggedChapters, 'chapter')}`
          }
        >
          {days.length === 0 ? (
            <p className="card__note">Nothing marked yet, so there is nothing to look back on.</p>
          ) : (
            <div className="dayLog dayLog--tight">
              {days.map((entry) => (
                <div className="dayLog__row" key={entry.day}>
                  <span className="dayLog__day">
                    {formatDay(entry.day, { year: undefined })}
                  </span>
                  <span className="dayLog__books">
                    {entry.books.map((b) => (
                      <span className="dayLog__book" key={b.book}>
                        {b.book} {b.label}
                      </span>
                    ))}
                  </span>
                  <span className="dayLog__count">{entry.total}</span>
                </div>
              ))}
            </div>
          )}
        </FoldCard>

        <FoldCard
          reveal={reveal}
          title="Phase by phase"
          summary={`${plural(phases.length, 'phase')} · ${phasesDone} complete`}
        >
          <div className="phaseTable phaseTable--tight">
            {phases.map((p) => {
              const pct = p.chapters === 0 ? 0 : (p.read / p.chapters) * 100;
              return (
                <div
                  className={`phaseRow${p.done ? ' phaseRow--done' : ''}`}
                  key={p.phase}
                  style={{ '--pct': `${pct}%` } as CSSProperties}
                >
                  <span className="phaseRow__num">{String(p.phase).padStart(2, '0')}</span>
                  <span className="phaseRow__title">{p.title}</span>
                  <span className="phaseRow__count">
                    {p.read}
                    <small>/{p.chapters}</small>
                  </span>
                  <span className="phaseRow__track" aria-hidden="true">
                    <span className="phaseRow__fill" />
                  </span>
                </div>
              );
            })}
          </div>
        </FoldCard>
      </div>
    </>
  );
}
