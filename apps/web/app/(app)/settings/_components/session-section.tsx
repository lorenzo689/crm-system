"use client";

import { useLogout } from "@/lib/use-logout";

export function SessionSection() {
  const { logout, isPending, error } = useLogout();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Sitzung</h2>
        <p className="mt-1 text-sm text-zinc-500">
Verwalten Sie Ihre aktuelle Anmeldung auf diesem Gerät.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <p className="text-sm font-medium text-zinc-900">Aktuelle Sitzung</p>
          <p className="mt-1 text-xs text-zinc-500">
            Beim Abmelden wird diese Sitzung auf dem Server beendet. Andere
            Geräte bleiben angemeldet.
          </p>
          {error && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          disabled={isPending}
          className="mt-4 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 sm:mt-0"
        >
          {isPending ? "Wird abgemeldet…" : "Abmelden"}
        </button>
      </div>
    </div>
  );
}
