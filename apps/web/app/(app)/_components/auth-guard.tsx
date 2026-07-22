"use client";

import { useAuthGuard } from "@/lib/use-auth-guard";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isChecking } = useAuthGuard();

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-zinc-400">Wird geladen…</p>
      </div>
    );
  }

  return <>{children}</>;
}
