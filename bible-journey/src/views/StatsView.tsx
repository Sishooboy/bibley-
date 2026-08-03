import type { CSSProperties, ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Heatmap } from '../components/Heatmap';
import { ShareCard } from '../components/ShareCard';
import { Sparkline } from '../components/Sparkline';
import { StatRing } from '../components/StatRing';
import { Flame } from '../components/icons';
import { HeadChip, ViewHeader } from '../components/ViewHeader';
import { formatDay, fromDayKey, today } from '../lib/dates';
import { formatNumber, plural } from '../lib/format';
import { useCountUp, useReveal } from '../lib/motion';
import { cumulative, last30Days } from '../lib/progress';
import { SLOTS, SLOT_LABELS, type Slot } from '../lib/storage';
import { useStore } from '../state/useStore';

const RED = '#c81d25';
const YELLOW = '#f7b801';
const LINE = '#e2d8c8';
const MUTED = '#6b5e55';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type TipPayload = { payload?: { day: string; chapters?: number; total?: number } }[];

function ChartTip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: TipPayload;
  unit: 'chapters' | 'total';
}) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  const value = unit === 'chapters' ? point.chapters ?? 0 : point.total ?? 0;
  return (
    <div className="tooltip">
      <div>{formatDay(point.day)}</div>
      <b>{unit === 'chapters' ? plural(value, 'chapter') : `${value} read in total`}</b>
    </div>
  );
}

/** A figure that counts up the first time it is painted. */
function Counter({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const n = useCountUp(value);
  return <>{decimals ? n.toFixed(decimals) : formatNumber(Math.round(n))}</>;
}

function StatCard({
  label,
  value,
  note,
  spark,
  tone,
  reveal,
  index,
}: {
  label: string;
  value: ReactNode;
  note: ReactNode;
  spark?: number[];
  tone?: 'accent';
  reveal: (node: Element | null) => void;
  index: number;
}) {
  return (
    <div
      ref={reveal}
      className={`statCard reveal${tone === 'accent' ? ' statCard--accent' : ''}`}
      style={{ '--i': index } as CSSProperties}
    >
      <span className="statCard__label">{label}</span>
      <span className="statCard__value">{value}</span>
      <span className="statCard__note">{note}</span>
      {spark && <Sparkline values={spark} tone={tone === 'accent' ? 'gold' : 'red'} />}
    </div>
  );
}

export function StatsView() {
  const { data, derived } = useStore();
  const { overall, pace, phases, streak, plan } = derived;
  const reveal = useReveal();

  const daily = last30Days(data.read);
  const running = cumulative(data.read);
  const todayKey = today();
  const busiest = daily.reduce((max, d) => Math.max(max, d.chapters), 0);
  const lastWeek = last30Days(data.read, 7);
  const spark = daily.slice(-14).map((d) => d.chapters);

  // Time of day is opt-in, so this counts only what was actually tagged rather
  // than treating untagged chapters as a fifth, largest category.
  const slotCounts = SLOTS.reduce(
    (acc, slot) => ({ ...acc, [slot]: 0 }),
    {} as Record<Slot, number>,
  );
  for (const slot of Object.values(data.slots ?? {})) slotCounts[slot] += 1;
  const taggedTotal = SLOTS.reduce((n, slot) => n + slotCounts[slot], 0);
  const topSlot = Math.max(...SLOTS.map((slot) => slotCounts[slot]));

  const booksSplit = [
    { name: 'Completed', value: overall.booksDone, fill: RED },
    { name: 'Remaining', value: overall.booksTotal - overall.booksDone, fill: LINE },
  ];

  const tickStyle = { fill: MUTED, fontSize: 11, fontFamily: 'Inter Variable, sans-serif' };

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
            <dl className="statsHero__facts">
              <div>
                <dt>Remaining</dt>
                <dd>{formatNumber(pace.remaining)}</dd>
              </div>
              <div>
                <dt>Books done</dt>
                <dd>
                  {overall.booksDone}
                  <small>/{overall.booksTotal}</small>
                </dd>
              </div>
              <div>
                <dt>Longest streak</dt>
                <dd>
                  {streak.longest}
                  <small> {streak.longest === 1 ? 'day' : 'days'}</small>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <div className="statGrid">
          <StatCard
            reveal={reveal}
            index={0}
            label="Chapters read"
            value={<Counter value={overall.planRead} />}
            note={`of ${formatNumber(overall.planTotal)} · ${overall.percent.toFixed(1)}%`}
            spark={spark}
          />
          <StatCard
            reveal={reveal}
            index={1}
            label="Books complete"
            value={
              <>
                <Counter value={overall.booksDone} />
                <small> / {overall.booksTotal}</small>
              </>
            }
            note={`${plural(overall.booksTotal - overall.booksDone, 'book')} to go`}
          />
          <StatCard
            reveal={reveal}
            index={2}
            label="Pace"
            value={<Counter value={pace.perWeek} decimals={1} />}
            note={`chapters / week over ${plural(pace.daysActive, 'reading day')}`}
            spark={spark}
          />
          <StatCard
            reveal={reveal}
            index={3}
            tone="accent"
            label="At this pace"
            value={pace.finishBy ? formatDay(pace.finishBy, { day: undefined }) : 'Not yet'}
            note={
              pace.finishBy
                ? `${formatNumber(pace.remaining)} chapters left · finishes ${formatDay(pace.finishBy)}`
                : overall.planRead === overall.planTotal
                  ? 'Plan complete'
                  : 'Mark a few chapters to get an estimate'
            }
          />
        </div>

        <section ref={reveal} className="card streakPanel reveal">
          <div className="streakPanel__figure">
            <Flame size={30} className={`flame${streak.current > 0 ? ' flame--lit' : ''}`} />
            <span className="streakPanel__count">{streak.current}</span>
            <span className="streakPanel__unit">
              {streak.current === 1 ? 'day' : 'days'} running
            </span>
          </div>
          <div className="streakPanel__body">
            <h3 className="card__title">Streak</h3>
            <p className="card__note">
              {streak.current === 0
                ? 'No streak going. Mark anything today and it starts at one.'
                : `Longest run so far is ${plural(streak.longest, 'day')}.`}
            </p>
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
          </div>
        </section>

        <section ref={reveal} className="card reveal">
          <div className="card__head">
            <div>
              <h3 className="card__title">Chapters read, last 30 days</h3>
              <p className="card__note">
                Busiest day: {busiest} · current streak {streak.current} · longest {streak.longest}
              </p>
            </div>
            <div className="legend">
              <span className="legend__key">
                <span className="legend__swatch" style={{ background: RED }} /> chapters
              </span>
              <span className="legend__key">
                <span className="legend__swatch" style={{ background: YELLOW }} /> today
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={daily} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
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
                tick={tickStyle}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={44}
              />
              <Tooltip
                cursor={{ fill: 'rgba(200,29,37,0.07)' }}
                content={<ChartTip unit="chapters" />}
              />
              <Bar dataKey="chapters" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {daily.map((d) => (
                  <Cell key={d.day} fill={d.day === todayKey ? 'url(#barGold)' : 'url(#barRed)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
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

        <section ref={reveal} className="card reveal">
          <div className="card__head">
            <div>
              <h3 className="card__title">When you read</h3>
              <p className="card__note">
                {taggedTotal === 0
                  ? 'Optional. Tag a chapter with a time of day when you mark it and this fills in.'
                  : `From the ${plural(taggedTotal, 'chapter')} you have tagged.`}
              </p>
            </div>
          </div>
          <div className="slotChart">
            {SLOTS.map((slot) => {
              const count = slotCounts[slot];
              const pct = taggedTotal === 0 ? 0 : (count / taggedTotal) * 100;
              const best = count > 0 && count === topSlot;
              return (
                <div className={`slotBar${best ? ' slotBar--best' : ''}`} key={slot}>
                  <span className="slotBar__name">{SLOT_LABELS[slot].replace(/^in the /, '')}</span>
                  <span className="slotBar__track" aria-hidden="true">
                    <span className="slotBar__fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="slotBar__count">{count}</span>
                </div>
              );
            })}
          </div>
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

        <div className="chartRow">
          <section ref={reveal} className="card reveal">
            <div className="card__head">
              <div>
                <h3 className="card__title">Cumulative progress</h3>
                <p className="card__note">Total plan chapters read, same 30-day window</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={running} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
                <defs>
                  <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={RED} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={RED} stopOpacity={0.02} />
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
                  tick={tickStyle}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={44}
                />
                <Tooltip content={<ChartTip unit="total" />} />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke={RED}
                  strokeWidth={2.5}
                  fill="url(#cumFill)"
                  isAnimationActive={false}
                  dot={false}
                  activeDot={{ r: 4, fill: YELLOW, stroke: '#96161f', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </section>

          <section ref={reveal} className="card reveal">
            <div className="card__head">
              <div>
                <h3 className="card__title">Books</h3>
                <p className="card__note">Completed vs. remaining</p>
              </div>
            </div>
            <div className="donut">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={booksSplit}
                    dataKey="value"
                    innerRadius={58}
                    outerRadius={86}
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {booksSplit.map((slice) => (
                      <Cell key={slice.name} fill={slice.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <span className="donut__label" aria-hidden="true">
                {overall.booksDone}/{overall.booksTotal}
              </span>
            </div>
            <div className="legend legend--centred">
              <span className="legend__key">
                <span className="legend__swatch" style={{ background: RED }} /> completed
              </span>
              <span className="legend__key">
                <span className="legend__swatch" style={{ background: LINE }} /> remaining
              </span>
            </div>
          </section>
        </div>

        <section ref={reveal} className="card reveal">
          <div className="card__head">
            <div>
              <h3 className="card__title">Phase by phase</h3>
              <p className="card__note">Where the chapters have gone</p>
            </div>
          </div>
          <div className="phaseTable">
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
        </section>
      </div>
    </>
  );
}
