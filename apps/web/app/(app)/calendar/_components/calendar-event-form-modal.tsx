"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth-api";

export type CalendarEventStatus =
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED";

export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  status: CalendarEventStatus;
  customer: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  createdBy: { id: string; displayName: string };
};

export type CustomerOption = {
  id: string;
  name: string;
};

export type ProjectOption = {
  id: string;
  name: string;
  customer: { id: string; name: string };
};

type CalendarEventFormModalProps = {
  customers: CustomerOption[];
  projects: ProjectOption[];
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
};

type ReminderPreset =
  | "none"
  | "10min"
  | "30min"
  | "1hour"
  | "1day"
  | "custom";

type FormState = {
  customerId: string;
  projectId: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
};

function toLocalDateTimeInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function createInitialFormState(): FormState {
  const startsAt = new Date();
  startsAt.setMinutes(0, 0, 0);
  startsAt.setHours(startsAt.getHours() + 1);

  const endsAt = new Date(startsAt);
  endsAt.setHours(endsAt.getHours() + 1);

  return {
    customerId: "",
    projectId: "",
    title: "",
    description: "",
    location: "",
    startsAt: toLocalDateTimeInput(startsAt),
    endsAt: toLocalDateTimeInput(endsAt),
    allDay: false,
  };
}

export function CalendarEventFormModal({
  customers,
  projects,
  onClose,
  onSaved,
}: CalendarEventFormModalProps) {
  const [formState, setFormState] = useState<FormState>(
    createInitialFormState,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reminderPreset, setReminderPreset] =
    useState<ReminderPreset>("none");
  const [customReminderAt, setCustomReminderAt] = useState("");

  const availableProjects = formState.customerId
    ? projects.filter(
        (project) => project.customer.id === formState.customerId,
      )
    : projects;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function updateCustomer(customerId: string) {
    setFormState((current) => {
      const selectedProject = projects.find(
        (project) => project.id === current.projectId,
      );
      const projectStillMatches =
        !customerId || selectedProject?.customer.id === customerId;

      return {
        ...current,
        customerId,
        projectId: projectStillMatches ? current.projectId : "",
      };
    });
  }

  function calculateReminderTime(
    preset: ReminderPreset,
    startsAt: string,
  ): string | null {
    if (preset === "none") return null;
    if (preset === "custom") return customReminderAt || null;

    const start = new Date(startsAt);
    const offsetMinutes: Record<
      Exclude<ReminderPreset, "none" | "custom">,
      number
    > = {
      "10min": 10,
      "30min": 30,
      "1hour": 60,
      "1day": 60 * 24,
    };

    const reminderTime = new Date(
      start.getTime() - offsetMinutes[preset] * 60000,
    );
    return reminderTime.toISOString();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const savedEvent = await apiFetch<CalendarEvent>("/calendar-events", {
        method: "POST",
        body: JSON.stringify({
          customerId: formState.customerId || undefined,
          projectId: formState.projectId || undefined,
          title: formState.title.trim(),
          description: formState.description.trim() || undefined,
          location: formState.location.trim() || undefined,
          startsAt: new Date(formState.startsAt).toISOString(),
          endsAt: new Date(formState.endsAt).toISOString(),
          allDay: formState.allDay,
        }),
      });

      const reminderTime = calculateReminderTime(
        reminderPreset,
        formState.startsAt,
      );
      if (reminderTime) {
        try {
          await apiFetch(`/calendar-events/${savedEvent.id}/reminders`, {
            method: "POST",
            body: JSON.stringify({ remindAt: reminderTime }),
          });
        } catch (reminderError) {
          setError(
            "Termin wurde erstellt, die Erinnerung konnte aber nicht gesetzt werden: " +
              (reminderError instanceof Error
                ? reminderError.message
                : "Unbekannter Fehler"),
          );
          onSaved(savedEvent);
          return;
        }
      }

      onSaved(savedEvent);
      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Termin konnte nicht gespeichert werden.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">
            Neuen Termin anlegen
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dialog schließen"
            className="text-xl text-zinc-400 hover:text-zinc-600"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Titel
            </label>
            <input
              type="text"
              value={formState.title}
              onChange={(event) => updateField("title", event.target.value)}
              required
              maxLength={200}
              autoFocus
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Kunde
              </label>
              <select
                value={formState.customerId}
                onChange={(event) => updateCustomer(event.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              >
                <option value="">Kein Kunde</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Projekt
              </label>
              <select
                value={formState.projectId}
                onChange={(event) =>
                  updateField("projectId", event.target.value)
                }
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              >
                <option value="">Kein Projekt</option>
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Beginn
              </label>
              <input
                type="datetime-local"
                value={formState.startsAt}
                onChange={(event) =>
                  updateField("startsAt", event.target.value)
                }
                required
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Ende
              </label>
              <input
                type="datetime-local"
                value={formState.endsAt}
                onChange={(event) =>
                  updateField("endsAt", event.target.value)
                }
                required
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Erinnerung
            </label>
            <select
              value={reminderPreset}
              onChange={(event) =>
                setReminderPreset(event.target.value as ReminderPreset)
              }
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            >
              <option value="none">Keine Erinnerung</option>
              <option value="10min">10 Minuten vorher</option>
              <option value="30min">30 Minuten vorher</option>
              <option value="1hour">1 Stunde vorher</option>
              <option value="1day">1 Tag vorher</option>
              <option value="custom">Benutzerdefiniert</option>
            </select>

            {reminderPreset === "custom" && (
              <input
                type="datetime-local"
                value={customReminderAt}
                onChange={(event) => setCustomReminderAt(event.target.value)}
                className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              />
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={formState.allDay}
              onChange={(event) =>
                updateField("allDay", event.target.checked)
              }
              className="h-4 w-4 rounded border-zinc-300 text-amber-600 accent-amber-600"
            />
            Ganztägiger Termin
          </label>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Ort
            </label>
            <input
              type="text"
              value={formState.location}
              onChange={(event) =>
                updateField("location", event.target.value)
              }
              maxLength={200}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Beschreibung
            </label>
            <textarea
              value={formState.description}
              onChange={(event) =>
                updateField("description", event.target.value)
              }
              rows={3}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {isSubmitting ? "Wird gespeichert…" : "Termin anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
