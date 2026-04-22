import { forwardRef } from "react";

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className = "", ...props }, ref) => (
  <input
    ref={ref}
    className={`w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]/95 px-3.5 py-2.5 text-sm text-[color:var(--foreground)] shadow-[0_8px_18px_-16px_rgba(89,67,52,0.5)] placeholder:text-[color:var(--muted-foreground)]/85 focus:border-[color:var(--accent)] focus:outline-none focus:ring-4 focus:ring-[color:var(--ring)] dark:shadow-[0_10px_22px_-18px_rgba(0,0,0,0.65)] ${className}`}
    {...props}
  />
));
Input.displayName = "Input";
