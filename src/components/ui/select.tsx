import { forwardRef } from "react";

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className = "", children, ...props }, ref) => (
  <select
    ref={ref}
    className={`w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]/95 px-3.5 py-2.5 text-sm text-[color:var(--foreground)] shadow-[0_8px_18px_-16px_rgba(89,67,52,0.5)] focus:border-[color:var(--accent)] focus:outline-none focus:ring-4 focus:ring-[color:var(--ring)] ${className}`}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
