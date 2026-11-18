"use client";

import Link from "next/link";
import { useCurrentUser } from "@/lib/use-current-user";

/** Wraps areas the API only serves to owners and admins. */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading } = useCurrentUser();

  if (isLoading) {
    return <p className="p-6 text-sm text-zinc-400 sm:p-8">Lädt…</p>;
  }
  if (!isAdmin) {
    return (
      <div className="p-6 sm:p-8">
        <div className="max-w-xl rounded-xl border border-zinc-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-zinc-900">
            Kein Zugriff
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Dieser Bereich ist Inhabern und Administratoren vorbehalten. Wenden
            Sie sich bei Bedarf an Ihre Administration.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block text-sm font-medium text-zinc-900 underline"
          >
            Zur Übersicht
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
