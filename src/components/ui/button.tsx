import Link from "next/link";
import { forwardRef } from "react";

const base =
  "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ring)]";

const variants = {
  primary:
    "bg-[color:var(--accent)] text-[color:var(--accent-foreground)] shadow-[0_14px_30px_-18px_rgba(141,86,64,0.65)] hover:-translate-y-px hover:brightness-[1.03] dark:shadow-[0_16px_34px_-22px_rgba(0,0,0,0.72)]",
  secondary:
    "border border-[color:var(--border)] bg-[color:var(--card)]/95 text-[color:var(--foreground)] shadow-[0_12px_24px_-20px_rgba(89,67,52,0.55)] hover:-translate-y-px hover:bg-[color:var(--muted)]/55 dark:shadow-[0_14px_28px_-22px_rgba(0,0,0,0.68)]",
  ghost:
    "text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)]/70 hover:text-[color:var(--foreground)]",
  danger:
    "bg-[#b95d54] text-[color:var(--accent-foreground)] shadow-[0_14px_30px_-18px_rgba(127,49,41,0.55)] hover:-translate-y-px hover:brightness-[1.03]",
} as const;

type Variant = keyof typeof variants;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`${base} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export function ButtonLink({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}
