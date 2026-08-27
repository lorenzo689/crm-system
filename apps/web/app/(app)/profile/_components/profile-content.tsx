"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import {
  getUserInitials,
  organizationRoleLabels,
  type CurrentUser,
} from "@/lib/user-profile";

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4">
      <dt className="text-xs font-medium uppercase tracking-wider text-zinc-400">
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-medium text-zinc-800">
        {value}
      </dd>
    </div>
  );
}

export function ProfileContent() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<CurrentUser>("/users/me")
      .then(setUser)
      .catch((caughtError: unknown) =>
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Profildaten konnten nicht geladen werden.",
        ),
      )
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <p className="p-6 text-sm text-zinc-400 sm:p-8">Lädt…</p>;
  }

  if (error) {
    return <p className="p-6 text-sm text-red-600 sm:p-8">{error}</p>;
  }

  if (!user) {
    return (
      <p className="p-6 text-sm text-zinc-400 sm:p-8">
        Keine Profildaten verfügbar.
      </p>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="h-2 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400" />
          <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-2xl font-semibold tracking-tight text-white shadow-sm">
              {getUserInitials(user.displayName)}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-amber-600">
                Profil
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
                {user.displayName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                Deine Kontodaten und dein Organisationskontext in Bissinger OS.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-600">
              Kontodaten
            </p>
            <h2 className="mt-2 text-lg font-semibold text-zinc-900">
              Persönliche Informationen
            </h2>
            <dl className="mt-5 space-y-3">
              <ProfileField label="Anzeigename" value={user.displayName} />
              <ProfileField label="E-Mail" value={user.email} />
              <ProfileField
                label="Mitglied seit"
                value={new Date(user.createdAt).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              />
            </dl>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-600">
              Organisation
            </p>
            <h2 className="mt-2 text-lg font-semibold text-zinc-900">
              Mitgliedschaft
            </h2>
            <dl className="mt-5 space-y-3">
              <ProfileField
                label="Organisationsname"
                value={user.organizationName}
              />
              <ProfileField
                label="Rolle"
                value={organizationRoleLabels[user.organizationRole]}
              />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
