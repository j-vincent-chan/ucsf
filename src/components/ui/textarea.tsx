import { forwardRef } from "react";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = "", ...props }, ref) => (
  <textarea
    ref={ref}
    className={`min-h-[120px] w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]/95 px-3.5 py-3 text-sm text-[color:var(--foreground)] shadow-[0_8px_18px_-16px_rgba(89,67,52,0.5)] placeholder:text-[color:var(--muted-foreground)]/85 focus:border-[color:var(--accent)] focus:outline-none focus:ring-4 focus:ring-[color:var(--ring)] ${className}`}
    {...props}
  />
));
Textarea.displayName = "Textarea";
