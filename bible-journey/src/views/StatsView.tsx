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
import { ProgressBar } from '../components/ProgressBar';
import { formatDay, today } from '../lib/dates';
import { formatNumber, plural } from '../lib/format';
import { cumulative, last30Days } from '../lib/progress';
import { useStore } from '../state/useStore';

const RED = '#c81d25';
const YELLOW = '#f7b801';
const LINE = '#e2d8c8';
const MUTED = '#6b5e55';

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
      <b>
        {unit === 'chapters' ? plural(value, 'chapter') : `${value} read in total`}
      </b>
    </div>
  );
}

export function StatsView() {
  const { data, derived } = useStore();
  const { overall, pace, phases, streak } = derived;

  const daily = last30Days(data.read);
  const running = cumulative(data.read);
  const todayKey = today();
  const busiest = daily.reduce((max, d) => Math.max(max, d.chapters), 0);

  const booksSplit = [
    { name: 'Completed', value: overall.booksDone, fill: RED },
    { name: 'Remaining', value: overall.booksTotal - overall.booksDone, fill: LINE },
  ];

  const tickStyle = { fill: MUTED, fontSize: 11, fontFamily: 'Inter Variable, sans-serif' };

  return (
    <div className="container statsView">
      <div className="sectionHead">
        <div>
          <p className="eyebrow">How it’s actually going</p>
          <h2>Stats</h2>
        </div>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="tile__label">Chapters read</span>
          <span className="tile__value">{formatNumber(overall.planRead)}</span>
          <span className="tile__note">
            of {formatNumber(overall.planTotal)} · {overall.percent.toFixed(1)}%
          </span>
        </div>
        <div className="tile">
          <span className="tile__label">Books complete</span>
          <span className="tile__value">
            {overall.booksDone}
            <span style={{ fontSize: '1rem', color: MUTED }}> / {overall.booksTotal}</span>
          </span>
          <span className="tile__note">
            {plural(overall.booksTotal - overall.booksDone, 'book')} to go
          </span>
        </div>
        <div className="tile">
          <span className="tile__label">Pace</span>
          <span className="tile__value">{pace.perWeek.toFixed(1)}</span>
          <span className="tile__note">
            chapters / week over {plural(pace.daysActive, 'reading day')}
          </span>
        </div>
        <div className="tile tile--accent">
          <span className="tile__label">At this pace</span>
          <span className="tile__value">
            {pace.finishBy ? formatDay(pace.finishBy, { day: undefined }) : 'Not yet'}
          </span>
          <span className="tile__note">
            {pace.finishBy
              ? `${formatNumber(pace.remaining)} chapters left · finishes ${formatDay(pace.finishBy)}`
              : overall.planRead === overall.planTotal
                ? 'Plan complete'
                : 'Mark a few chapters to get an estimate'}
          </span>
        </div>
      </div>

      <div className="charts">
        <section className="chartBlock">
          <div className="chartBlock__head">
            <div>
              <h3>Chapters read, last 30 days</h3>
              <p className="chartBlock__note">
                Busiest day: {busiest} · current streak {streak.current} · longest {streak.longest}
              </p>
            </div>
            <div className="legend" style={{ paddingBottom: 0 }}>
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
              <Bar dataKey="chapters" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                {daily.map((d) => (
                  <Cell key={d.day} fill={d.day === todayKey ? YELLOW : RED} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        <div className="chartRow">
          <section className="chartBlock">
            <div className="chartBlock__head">
              <div>
                <h3>Cumulative progress</h3>
                <p className="chartBlock__note">Total plan chapters read, same 30-day window</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={running} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
                <defs>
                  <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={RED} stopOpacity={0.28} />
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
                  strokeWidth={2}
                  fill="url(#cumFill)"
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </section>

          <section className="chartBlock">
            <div className="chartBlock__head">
              <div>
                <h3>Books</h3>
                <p className="chartBlock__note">Completed vs. remaining</p>
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
            <div className="legend">
              <span className="legend__key">
                <span className="legend__swatch" style={{ background: RED }} /> completed
              </span>
              <span className="legend__key">
                <span className="legend__swatch" style={{ background: LINE }} /> remaining
              </span>
            </div>
          </section>
        </div>

        <section className="chartBlock" style={{ paddingBottom: '1.5rem' }}>
          <div className="chartBlock__head">
            <div>
              <h3>Phase by phase</h3>
              <p className="chartBlock__note">Where the chapters have gone</p>
            </div>
          </div>
          <div className="phaseTable">
            {phases.map((p) => (
              <div className="phaseTable__row" key={p.phase}>
                <span className="phaseTable__num">{String(p.phase).padStart(2, '0')}</span>
                <span className="phaseTable__label">
                  <span>{p.title}</span>
                  <ProgressBar
                    value={p.read}
                    max={p.chapters}
                    label={`Phase ${p.phase}`}
                    thin
                    className="phaseTable__bar"
                  />
                </span>
                <span className="phaseTable__count">
                  {p.read}/{p.chapters}
                </span>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
