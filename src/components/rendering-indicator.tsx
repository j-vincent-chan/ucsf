type RenderingSize = "sm" | "md" | "lg";

const SPINNER_CLASS: Record<RenderingSize, string> = {
  sm: "size-7",
  md: "size-10",
  lg: "size-[3.25rem]",
};

/**
 * Rotating ring for route loading, Suspense fallbacks, and inline busy states.
 * SVG (not CSS borders) so global `* { border-color }` does not flatten the arc.
 */
export function RenderingIndicator({
  size = "md",
  className = "",
}: {
  size?: RenderingSize;
  className?: string;
}) {
  return (
    <svg
      className={`shrink-0 animate-spin text-[color:var(--accent)] motion-reduce:animate-none ${SPINNER_CLASS[size]} ${className}`.trim()}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

type RenderingStatusProps = {
  label?: string;
  /** Secondary line; pass `null` to hide. Defaults to workspace fetch copy when centered. */
  description?: string | null;
  size?: RenderingSize;
  className?: string;
  /** Full-page route fallback vs compact inline row */
  variant?: "page" | "inline" | "compact";
};

/** Icon + label for loading / rendering states. */
export function RenderingStatus({
  label = "Rendering…",
  description,
  size = "md",
  className = "",
  variant = "page",
}: RenderingStatusProps) {
  const resolvedDescription =
    description === null
      ? null
      : description ??
        (variant === "page" ? "Fetching data from your workspace." : undefined);

  const spinnerSize: RenderingSize =
    variant === "page" ? "lg" : variant === "inline" ? "sm" : size;

  if (variant === "inline") {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={`flex items-center gap-2.5 ${className}`.trim()}
      >
        <RenderingIndicator size="sm" />
        <span className="text-sm text-[color:var(--muted-foreground)]">{label}</span>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={`flex flex-col items-center gap-2 py-4 ${className}`.trim()}
      >
        <RenderingIndicator size={size} />
        {label ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">{label}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex min-h-[min(48vh,380px)] flex-col items-center justify-center gap-4 px-4 py-12 ${className}`.trim()}
    >
      <RenderingIndicator size={spinnerSize} />
      {label ? (
        <p className="text-sm font-medium text-[color:var(--muted-foreground)]">{label}</p>
      ) : null}
      {resolvedDescription ? (
        <p className="max-w-sm text-center text-xs text-[color:var(--muted-foreground)]/90">
          {resolvedDescription}
        </p>
      ) : null}
    </div>
  );
}
