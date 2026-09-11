type IconProps = { size?: number; className?: string };

export function Flame({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 1.2c2.6 2.1 3.9 4 3.9 5.7 0 .8-.3 1.5-.8 2.1.9.6 1.4 1.5 1.4 2.6A4.5 4.5 0 0 1 8 15a4.5 4.5 0 0 1-4.5-4.4c0-1.6.8-2.8 2-4.2.9-1 1.4-2 1.4-3 0-.7-.1-1.4-.4-2.2.6.1 1.1.4 1.5.9.2-.3.2-.6 0-.9Zm0 11.9a2.2 2.2 0 0 0 2.2-2.2c0-.9-.5-1.6-1.5-2.4-.5-.4-.8-.8-1-1.2-.6.9-1.3 1.5-1.6 2a2.7 2.7 0 0 0-.4 1.6c0 1.2 1 2.2 2.3 2.2Z" />
    </svg>
  );
}

export function Check({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

export function Menu({ size = 18, className, open }: IconProps & { open?: boolean }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {open ? (
        <>
          <path d="m4 4 10 10" />
          <path d="M14 4 4 14" />
        </>
      ) : (
        <>
          <path d="M2.5 5h13" />
          <path d="M2.5 9h13" />
          <path d="M2.5 13h13" />
        </>
      )}
    </svg>
  );
}

export function Lock({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

export function Search({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  );
}

export function Chevron({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 3.5 5 4.5-5 4.5" />
    </svg>
  );
}

/*
 * The four marks that sit on a button face. A label says what a control does
 * and the mark says it a second time in a tenth of the space, which is what
 * lets someone find the one they want without reading the row. Same 16px box
 * and the same stroke as the rest, so they belong to the set rather than
 * looking borrowed.
 */
export function Sync({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Not a closed circle: the gap is where the arrowhead comes from, which
          is what makes it read as turning rather than as a ring. */}
      <path d="M13.7 8a5.7 5.7 0 1 1-1.9-4.2" />
      <path d="M13.4 1.9v3.2h-3.2" />
    </svg>
  );
}

export function Download({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 1.9v7.6" />
      <path d="m4.9 6.5 3.1 3.1 3.1-3.1" />
      <path d="M2.6 11.2v1.3a1.6 1.6 0 0 0 1.6 1.6h7.6a1.6 1.6 0 0 0 1.6-1.6v-1.3" />
    </svg>
  );
}

export function Share({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 10.1V2" />
      <path d="m4.9 5.1 3.1-3.1 3.1 3.1" />
      <path d="M2.6 9.5v3a1.6 1.6 0 0 0 1.6 1.6h7.6a1.6 1.6 0 0 0 1.6-1.6v-3" />
    </svg>
  );
}

export function Compass({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.2" />
      {/* The needle, drawn as one closed kite so it stays legible at 14px. */}
      <path d="m10.9 5.1-1.6 4.2-4.2 1.6 1.6-4.2z" />
    </svg>
  );
}

export function Route({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Two stops and the path between them, which is what a tour is. */}
      <circle cx="3.6" cy="12.4" r="1.9" />
      <circle cx="12.4" cy="3.6" r="1.9" />
      <path d="M5.5 12.4h3.1a2.9 2.9 0 0 0 0-5.8H7.4a2.9 2.9 0 0 1 0-5.8" strokeDasharray="0.1 2.6" />
    </svg>
  );
}

/* A speaker with two waves, for listening to the chapter rather than reading it. */
export function Speaker({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7.6 2.6 4.4 5.4H2.2v5.2h2.2l3.2 2.8Z" fill="currentColor" stroke="none" />
      <path d="M10.4 5.8a3.1 3.1 0 0 1 0 4.4" />
      <path d="M12.5 3.7a6 6 0 0 1 0 8.6" />
    </svg>
  );
}

/* Play and pause, the two states of one control, so they are drawn to the same weight. */
export function Play({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4.6 2.7a.7.7 0 0 1 1-.6l7.2 5.3a.7.7 0 0 1 0 1.2l-7.2 5.3a.7.7 0 0 1-1-.6Z" />
    </svg>
  );
}

export function Pause({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="4" y="2.6" width="2.8" height="10.8" rx="0.9" />
      <rect x="9.2" y="2.6" width="2.8" height="10.8" rx="0.9" />
    </svg>
  );
}
