const W = 96;
const H = 26;

/**
 * A wordless trend line for a stat card. Decorative by design: the number beside
 * it carries the meaning, so this is hidden from assistive tech.
 */
export function Sparkline({ values, tone = 'red' }: { values: number[]; tone?: 'red' | 'gold' }) {
  if (values.length < 2) return null;

  const max = Math.max(1, ...values);
  const step = W / (values.length - 1);
  const y = (v: number) => H - 2 - (v / max) * (H - 5);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);

  return (
    <svg className={`spark spark--${tone}`} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline className="spark__area" points={`0,${H} ${points.join(' ')} ${W},${H}`} />
      <polyline className="spark__line" points={points.join(' ')} />
    </svg>
  );
}
