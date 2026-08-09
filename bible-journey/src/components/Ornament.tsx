/**
 * The cross from the app's own mark, on its own.
 *
 * Drawn rather than sourced. Everything in this app is type and two colours, so
 * a photograph or a painting would read as pasted on, and an SVG weighs nothing,
 * stays sharp at any size, and takes its colour from whatever it sits in. It
 * also carries no licence with it, which matters for a build going to an App
 * Store.
 *
 * Latin proportions, with the crossbar a third of the way down, because that is
 * what the icon does and the two are seen together.
 */
export function Cross({
  size = 48,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 60 96"
      width={size}
      height={(size * 96) / 60}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M24 0h12v96H24z" />
      <path d="M0 26h60v12H0z" />
    </svg>
  );
}

/**
 * The cross set in the ring sweep the mastheads use, as a watermark. Sized in
 * its own viewBox and stretched by the caller, so one shape covers a corner of
 * any panel it is put behind.
 */
export function CrossWatermark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 240"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="120" cy="120" r="52" />
        <circle cx="120" cy="120" r="78" />
        <circle cx="120" cy="120" r="104" />
      </g>
      <g fill="currentColor">
        <path d="M111 44h18v152h-18z" />
        <path d="M74 84h92v18H74z" />
      </g>
    </svg>
  );
}
