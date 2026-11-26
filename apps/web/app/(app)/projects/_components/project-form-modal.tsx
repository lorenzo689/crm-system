"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import { useDialogFocus } from "@/components/layout/use-dialog-focus";
import {
  priorityLabels,
  statusLabels,
  type ProjectPriority,
  type ProjectStatus,
} from "./project-constants";

export type Project = {
  id: string;
  name: string;
  projectNumber: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  archivedAt: string | null;
  customer: { id: string; name: string };
  members: { user: { id: string; displayName: string } }[];
};

export type CustomerOption = {
  id: string;
  name: string;
};

type SavedProjectResponse = Omit<Project, "members">;

type ProjectFormModalProps = {
  isOpen: boolean;
  project?: Project | null;
  customers: CustomerOption[];
  onClose: () => void;
  onSaved: (project: Project) => void;
};

type FormState = {
  customerId: string;
  name: string;
  projectNumber: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  description: string;
  startsAt: string;
  endsAt: string;
};

const initialFormState: FormState = {
  customerId: "",
  name: "",
  projectNumber: "",
  status: "PLANNED",
  priority: "MEDIUM",
  description: "",
  startsAt: "",
  endsAt: "",
};

function toDateInputValue(isoString: string | null): string {
  if (!isoString) {
    return "";
  }

  return isoString.slice(0, 10);
}

function ProjectFormModalContent({
  project,
  customers,
  onClose,
  onSaved,
}: ProjectFormModalProps) {
  const { dialogRef, onDialogKeyDown } = useDialogFocus(onClose);
  const [formState, setFormState] = useState<FormState>(() =>
    project
      ? {
          customerId: project.customer.id,
          name: project.name,
          projectNumber: project.projectNumber,
          status: project.status,
          priority: project.priority,
          description: project.description ?? "",
          startsAt: toDateInputValue(project.startsAt),
          endsAt: toDateInputValue(project.endsAt),
        }
      : initialFormState,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        name: formState.name.trim(),
        projectNumber: formState.projectNumber.trim(),
        status: formState.status,
        priority: formState.priority,
        description: formState.description.trim() || undefined,
        startsAt: formState.startsAt || undefined,
        endsAt: formState.endsAt || undefined,
      };

      const savedProject = project
        ? await apiFetch<SavedProjectResponse>(`/projects/${project.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiFetch<SavedProjectResponse>("/projects", {
            method: "POST",
            body: JSON.stringify({
              ...payload,
              customerId: formState.customerId,
            }),
          });

      onSaved({
        ...savedProject,
        members: project?.members ?? [],
      });
      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Fehler beim Speichern",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={project ? "Projekt bearbeiten" : "Neues Projekt anlegen"} tabIndex={-1} onKeyDown={onDialogKeyDown} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">
            {project ? "Projekt bearbeiten" : "Neues Projekt anlegen"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dialog schließen"
            className="text-zinc-400 hover:text-zinc-600"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Kunde
            </label>
            <select
              value={formState.customerId}
              onChange={(event) =>
                updateField("customerId", event.target.value)
              }
              required
              disabled={Boolean(project)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
            >
              <option value="" disabled>
                Kunde wählen…
              </option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            {project && (
              <p className="mt-1 text-xs text-zinc-400">
                Der Kunde kann nach dem Anlegen nicht mehr geändert werden.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Projektname
            </label>
            <input
              type="text"
              value={formState.name}
              onChange={(event) => updateField("name", event.target.value)}
              required
              maxLength={200}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Projektnummer
            </label>
            <input
              type="text"
              value={formState.projectNumber}
              onChange={(event) =>
                updateField("projectNumber", event.target.value)
              }
              required
              maxLength={50}
              placeholder="z.B. P-1002"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-300 focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Status
              </label>
              <select
                value={formState.status}
                onChange={(event) =>
                  updateField("status", event.target.value as ProjectStatus)
                }
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Priorität
              </label>
              <select
                value={formState.priority}
                onChange={(event) =>
                  updateField("priority", event.target.value as ProjectPriority)
                }
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              >
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Startdatum
              </label>
              <input
                type="date"
                value={formState.startsAt}
                onChange={(event) =>
                  updateField("startsAt", event.target.value)
                }
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Zieldatum
              </label>
              <input
                type="date"
                value={formState.endsAt}
                onChange={(event) =>
                  updateField("endsAt", event.target.value)
                }
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              />
            </div>
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
              {isSubmitting
                ? "Wird gespeichert…"
                : project
                  ? "Änderungen speichern"
                  : "Projekt anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Mounted only while open (and re-keyed per record), so every opening starts
 * from fresh form state without an effect that resets it.
 */
export function ProjectFormModal(props: ProjectFormModalProps) {
  if (!props.isOpen) {
    return null;
  }
  return <ProjectFormModalContent key={props.project?.id ?? "new"} {...props} />;
}
