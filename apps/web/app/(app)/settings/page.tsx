"use client";

import { useEffect, useState } from "react";
import {
  FiBell,
  FiLogOut,
  FiMonitor,
  FiSliders,
  FiSettings,
  FiBriefcase,
} from "react-icons/fi";
import Link from "next/link";
import { organizationRoleLabels, type CurrentUser } from "@/lib/user-profile";
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
  "general" | "appearance" | "notifications" | "behavior" | "session";

const navigationItems = [
  { key: "general", label: "Allgemein", icon: FiSettings },
  { key: "appearance", label: "Darstellung", icon: FiMonitor },
  { key: "notifications", label: "Benachrichtigungen", icon: FiBell },
  { key: "behavior", label: "Verhalten", icon: FiSliders },
  { key: "session", label: "Sitzung", icon: FiLogOut },
] as const;

export default function SettingsPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("general");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    apiFetch<CurrentUser>("/users/me")
      .then(setUser)
      .catch(() => setUserError("Kontodaten konnten nicht geladen werden."));
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
    <div className="crm-page settings-page">
      <div className="w-full">
        <div className="crm-page-heading flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Einstellungen
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Verwaltung von Arbeitsbereich, Benachrichtigungen und System.
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
          <div className="crm-settings-layout">
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
                    aria-pressed={isActive}
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

            <section
              className={`crm-settings-content ${activeSection === "general" ? "is-general" : "crm-card"}`}
            >
              {activeSection === "general" && (
                <div className="crm-settings-general">
                  <section className="crm-card">
                    <div className="crm-section-heading">
                      <h2>Arbeitsbereich & Konto</h2>
                      <Link className="crm-outline-button" href="/profile">
                        Bearbeiten
                      </Link>
                    </div>
                    {userError ? (
                      <p role="alert" className="text-red-600">
                        {userError}
                      </p>
                    ) : user ? (
                      <>
                        <div className="crm-organization">
                          <span className="crm-icon-disc">
                            <FiBriefcase />
                          </span>
                          <div>
                            <strong>{user.organizationName}</strong>
                            <p>
                              {organizationRoleLabels[user.organizationRole]}
                            </p>
                          </div>
                        </div>
                        <dl className="crm-account-details">
                          <dt>Name</dt>
                          <dd>{user.displayName}</dd>
                          <dt>E-Mail</dt>
                          <dd>{user.email}</dd>
                          <dt>Mitglied seit</dt>
                          <dd>
                            {new Date(user.createdAt).toLocaleDateString(
                              "de-DE",
                            )}
                          </dd>
                        </dl>
                      </>
                    ) : (
                      <p className="crm-empty">Kontodaten werden geladen ...</p>
                    )}
                  </section>
                  <section className="crm-card crm-system-settings">
                    <h2>System</h2>
                    <label>
                      Erscheinungsbild
                      <select
                        disabled={isSaving}
                        value={settings.theme}
                        onChange={(event) =>
                          void updateSettings({
                            theme: event.target.value as UserSettings["theme"],
                          })
                        }
                      >
                        <option value="LIGHT">Hell</option>
                        <option value="DARK">Dunkel</option>
                        <option value="SYSTEM">System</option>
                      </select>
                    </label>
                    <label>
                      Startseite
                      <select
                        disabled={isSaving}
                        value={settings.defaultLandingPage}
                        onChange={(event) =>
                          void updateSettings({
                            defaultLandingPage: event.target
                              .value as UserSettings["defaultLandingPage"],
                          })
                        }
                      >
                        <option value="DASHBOARD">Übersicht</option>
                        <option value="TASKS">Aufgaben</option>
                        <option value="CALENDAR">Kalender</option>
                        <option value="PROJECTS">Projekte</option>
                      </select>
                    </label>
                    <label>
                      Kalenderansicht
                      <select
                        disabled={isSaving}
                        value={settings.calendarDefaultView}
                        onChange={(event) =>
                          void updateSettings({
                            calendarDefaultView: event.target
                              .value as UserSettings["calendarDefaultView"],
                          })
                        }
                      >
                        <option value="AGENDA">Agenda</option>
                        <option value="MONTH">Monat</option>
                      </select>
                    </label>
                    <label>
                      Kompakte Tabellenansicht
                      <button
                        className="crm-switch"
                        role="switch"
                        aria-checked={settings.density === "COMPACT"}
                        aria-label="Kompakte Tabellenansicht"
                        disabled={isSaving}
                        onClick={() =>
                          void updateSettings({
                            density:
                              settings.density === "COMPACT"
                                ? "COMFORTABLE"
                                : "COMPACT",
                          })
                        }
                      >
                        <span />
                      </button>
                    </label>
                    <label>
                      Erledigte Aufgaben anzeigen
                      <button
                        className="crm-switch"
                        role="switch"
                        aria-checked={settings.showCompletedTasks}
                        aria-label="Erledigte Aufgaben anzeigen"
                        disabled={isSaving}
                        onClick={() =>
                          void updateSettings({
                            showCompletedTasks: !settings.showCompletedTasks,
                          })
                        }
                      >
                        <span />
                      </button>
                    </label>
                  </section>
                </div>
              )}
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
              {activeSection === "session" && <SessionSection />}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
