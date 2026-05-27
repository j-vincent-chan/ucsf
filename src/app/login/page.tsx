import { Suspense } from "react";
import { RenderingStatus } from "@/components/rendering-indicator";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-neutral-200 dark:bg-neutral-900">
          <RenderingStatus
            label="Loading sign-in…"
            description={null}
            className="min-h-0 py-0"
          />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
