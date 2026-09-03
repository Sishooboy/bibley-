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

/**
 * A speaker with two waves, for reading a chapter aloud. Filled cone against
 * stroked waves, so it still reads as a speaker at 16px where a fully stroked
 * one turns to mush.
 */
export function Speaker({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 2.6 4.8 5.6H2.4v4.8h2.4l3.7 3V2.6Z" fill="currentColor" stroke="none" />
      <path d="M11 5.8a3 3 0 0 1 0 4.4" />
      <path d="M12.9 3.7a5.8 5.8 0 0 1 0 8.6" />
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
      <rect x="4" y="3" width="3" height="10" rx="1" />
      <rect x="9" y="3" width="3" height="10" rx="1" />
    </svg>
  );
}

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
      <path d="M5 3.4a.8.8 0 0 1 1.2-.7l6 4.6a.8.8 0 0 1 0 1.4l-6 4.6A.8.8 0 0 1 5 12.6V3.4Z" />
    </svg>
  );
}

export function Stop({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.6" />
    </svg>
  );
}
