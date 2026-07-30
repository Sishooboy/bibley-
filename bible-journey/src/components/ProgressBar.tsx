type Props = {
  value: number;
  max: number;
  label: string;
  onDark?: boolean;
  thin?: boolean;
  className?: string;
};

export function ProgressBar({ value, max, label, onDark, thin, className }: Props) {
  const pct = max === 0 ? 0 : Math.min(100, (value / max) * 100);
  const done = value >= max && max > 0;

  return (
    <div
      className={[
        'bar',
        onDark ? 'bar--onDark' : '',
        thin ? 'bar--thin' : '',
        done ? 'bar--done' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className="bar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
