import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-neutral-200 text-sm text-neutral-500 dark:bg-neutral-900">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
