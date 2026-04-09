export function Label({
  children,
  htmlFor,
  className = "",
}: {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={`block text-sm font-medium text-neutral-700 dark:text-neutral-300 ${className}`}>
      {children}
    </label>
  );
}
