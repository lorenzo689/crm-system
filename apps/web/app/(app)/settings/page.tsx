"use client";

import { useEffect, useState } from "react";
import { FiBell, FiBriefcase, FiLogOut, FiMonitor, FiSliders } from "react-icons/fi";
import { apiFetch } from "@/lib/auth-api";
import {
  AppearanceSection,
  type AppearanceSettings,
} from "./_components/appearance-section";
import {
  BehaviorSection,
  type BehaviorSettings,
} from "./_components/behavior-section";
import {
  NotificationsSection,
  type NotificationSettings,
} from "./_components/notifications-section";
import { CompanySection } from "./_components/company-section";
import { SessionSection } from "./_components/session-section";

type UserSettings = AppearanceSettings &
  BehaviorSettings &
  NotificationSettings & {
    id: string;
    userId: string;
    taskReminders: boolean;
    overdueTaskAlerts: boolean;
    createdAt: string;
    updatedAt: string;
  };

type SettingsSection =
  | "appearance"
  | "notifications"
  | "behavior"
  | "company"
  | "session";

const navigationItems = [
  { key: "appearance", label: "Darstellung", icon: FiMonitor },
  { key: "notifications", label: "Benachrichtigungen", icon: FiBell },
  { key: "behavior", label: "Verhalten", icon: FiSliders },
  { key: "company", label: "Firmendaten", icon: FiBriefcase },
  { key: "session", label: "Sitzung", icon: FiLogOut },
] as const;

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("appearance");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    apiFetch<UserSettings>("/settings")
      .then(setSettings)
      .catch((caughtError: unknown) =>
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Einstellungen konnten nicht geladen werden.",
        ),
      );
  }, []);

  async function updateSettings(patch: Partial<UserSettings>) {
    setError(null);
    setIsSaving(true);

    try {
      const updatedSettings = await apiFetch<UserSettings>("/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setSettings(updatedSettings);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Einstellungen konnten nicht gespeichert werden.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!settings && !error) {
    return <p className="p-6 text-sm text-zinc-400 sm:p-8">Lädt…</p>;
  }

  return (
    <div className="h-full overflow-y-auto p-6 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wider text-amber-600">
              EINSTELLUNGEN
            </p>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Dein Arbeitsbereich
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Passe Ansichten, Verhalten und Benachrichtigungen an.
            </p>
          </div>
          <p
            aria-live="polite"
            className="min-h-5 shrink-0 text-xs text-zinc-400"
          >
            {isSaving ? "Wird gespeichert…" : ""}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {settings && (
          <div className="grid gap-6 md:grid-cols-[210px_minmax(0,1fr)]">
            <nav
              aria-label="Einstellungsbereiche"
              className="flex gap-1 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-2 md:block md:self-start"
            >
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveSection(item.key)}
                    className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition md:mb-1 md:w-full md:last:mb-0 ${
                      isActive
                        ? "bg-zinc-900 text-white shadow-sm"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    }`}
                  >
                    <Icon className="shrink-0 text-base" aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <section className="min-h-[430px] rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
              {activeSection === "appearance" && (
                <AppearanceSection
                  settings={settings}
                  onUpdate={updateSettings}
                />
              )}
              {activeSection === "notifications" && (
                <NotificationsSection
                  settings={settings}
                  onUpdate={updateSettings}
                />
              )}
              {activeSection === "behavior" && (
                <BehaviorSection
                  settings={settings}
                  onUpdate={updateSettings}
                />
              )}
              {activeSection === "company" && <CompanySection />}
              {activeSection === "session" && <SessionSection />}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
