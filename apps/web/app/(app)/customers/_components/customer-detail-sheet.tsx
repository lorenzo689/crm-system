"use client";

import { ContactList } from "./contact-list";
import { NoteList } from "./note-list";
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
  if (!isOpen || !customer) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/25">
      <button
        type="button"
        aria-label="Detailansicht schließen"
        onClick={onClose}
        className="flex-1"
      />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl">
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

        <div className="space-y-6 px-6 py-6">
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

          <ContactList customerId={customer.id} isOpen={isOpen} />
          <NoteList customerId={customer.id} isOpen={isOpen} />
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
