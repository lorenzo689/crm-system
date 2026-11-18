"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FiBriefcase } from "react-icons/fi";
import { apiFetch } from "@/lib/auth-api";
import type { Project } from "../../projects/_components/project-form-modal";
import { statusLabels as projectStatusLabels } from "../../projects/_components/project-constants";
import { ContactList } from "./contact-list";
import { ActivityTimeline } from "@/components/activity-timeline";
import { DocumentsSection } from "@/components/documents-section";
import { NotesSection } from "@/components/notes-section";
import type { Customer } from "./customer-types";
import { statusLabels, statusStyles } from "./customer-types";

type CustomerDetailSheetProps = {
  customer: Customer | null;
  isActionPending: boolean;
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onToggleArchive: () => void;
};

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function CustomerDetailSheet({
  customer,
  isActionPending,
  isOpen,
  onClose,
  onEdit,
  onToggleArchive,
}: CustomerDetailSheetProps) {
  const [tab, setTab] = useState("overview");
  const [projectData, setProjectData] = useState<{
    customerId: string;
    projects: Project[];
  } | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  useEffect(() => {
    if (!customer || !isOpen) return;
    const controller = new AbortController();
    apiFetch<Project[]>("/projects", { signal: controller.signal })
      .then((projects) => {
        setProjectData({
          customerId: customer.id,
          projects: projects.filter(
            (project) =>
              project.customer.id === customer.id && !project.archivedAt,
          ),
        });
        setProjectError(null);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setProjectError(
            error instanceof Error
              ? error.message
              : "Projekte konnten nicht geladen werden.",
          );
      });
    return () => controller.abort();
  }, [customer, isOpen]);
  const projects =
    projectData?.customerId === customer?.id ? projectData?.projects : null;
  if (!isOpen || !customer) {
    return null;
  }

  return (
    <div className="crm-customer-detail">
      <aside
        aria-label="Kundendetails"
        className="relative flex h-full w-full flex-col overflow-y-auto"
      >
        <div className="border-b border-zinc-200 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-amber-600">
                Kundenprofil
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-950">
                {customer.name}
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                {customer.customerNumber}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kundendetails schließen"
              className="rounded-full p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
            >
              ×
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusStyles[customer.status]}`}
            >
              {statusLabels[customer.status]}
            </span>
            {customer.archivedAt && (
              <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500">
                Archiviert
              </span>
            )}
          </div>
        </div>

        <nav className="crm-tabs" aria-label="Kundendetails">
          {[
            ["overview", "Übersicht"],
            ["projects", `Projekte${projects ? ` (${projects.length})` : ""}`],
            ["contacts", "Kontakte"],
            ["documents", "Dokumente"],
            ["activity", "Aktivitäten"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="crm-customer-detail-body space-y-6 px-6 py-6">
          <div hidden={tab !== "overview"}>
            <section className="grid gap-4 sm:grid-cols-2">
              <InfoField label="Kundennummer" value={customer.customerNumber} />
              <InfoField
                label="Zuletzt geändert"
                value={formatDate(customer.updatedAt)}
              />
              <InfoField
                label="Website"
                value={
                  customer.website ? (
                    <a
                      href={customer.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-600 hover:underline"
                    >
                      {customer.website}
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
              <InfoField
                label="Archiviert am"
                value={formatDate(customer.archivedAt)}
              />
            </section>

            <section>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
                Beschreibung
              </p>
              <div className="mt-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm leading-6 text-zinc-700">
                {customer.description || "Keine Beschreibung vorhanden."}
              </div>
            </section>
          </div>
          {(tab === "overview" || tab === "projects") && (
            <section>
              <h3>Aktive Projekte</h3>
              {projectError ? (
                <p role="alert" className="text-sm text-red-600">
                  {projectError}
                </p>
              ) : !projects ? (
                <p className="crm-empty">Projekte werden geladen ...</p>
              ) : projects.length ? (
                projects.map((project) => (
                  <Link
                    className="crm-customer-project"
                    key={project.id}
                    href={`/projects/${project.id}`}
                  >
                    <FiBriefcase />
                    <span>
                      <strong>{project.name}</strong>
                      <small>{project.projectNumber}</small>
                    </span>
                    <span className="crm-badge">
                      {projectStatusLabels[project.status]}
                    </span>
                    <span aria-hidden>›</span>
                  </Link>
                ))
              ) : (
                <p className="crm-empty">Keine aktiven Projekte.</p>
              )}
            </section>
          )}
          <div hidden={tab !== "contacts"}>
            <ContactList customerId={customer.id} isOpen={isOpen} />
          </div>
          <div hidden={tab !== "overview"}>
            <NotesSection
              contextParam="customerId"
              contextId={customer.id}
              isOpen={isOpen}
            />
          </div>
          <section hidden={tab !== "activity"}>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
              Aktivitäten
            </p>
            <ActivityTimeline
              contextParam="customerId"
              contextId={customer.id}
            />
          </section>
          <section hidden={tab !== "documents"}>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
              Dokumente
            </p>
            <DocumentsSection
              contextParam="customerId"
              contextId={customer.id}
            />
          </section>
        </div>

        <div className="mt-auto border-t border-zinc-200 px-6 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              Bearbeiten
            </button>
            <button
              type="button"
              onClick={onToggleArchive}
              disabled={isActionPending}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {isActionPending
                ? "Wird gespeichert..."
                : customer.archivedAt
                  ? "Entarchivieren"
                  : "Archivieren"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function InfoField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
        {label}
      </p>
      <div className="mt-2 text-sm text-zinc-700">{value}</div>
    </div>
  );
}
