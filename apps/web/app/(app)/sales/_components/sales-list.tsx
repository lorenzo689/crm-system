"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/use-api";
import {
  formatDate,
  formatMoney,
  statusLabels,
  statusStyles,
  typeLabels,
  type SalesDocument,
  type SalesDocumentStatus,
  type SalesDocumentType,
} from "@/lib/sales";
import { SalesFormModal } from "./sales-form-modal";

export function SalesList({ type }: { type: SalesDocumentType }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SalesDocumentStatus | "all">("all");
  const [isCreating, setIsCreating] = useState(false);
  const [now] = useState(() => Date.now());

  const {
    data,
    error: loadError,
    isLoading,
    reload: load,
  } = useApi<SalesDocument[]>(`/sales-documents?type=${type}`);
  const documents = useMemo(() => data ?? [], [data]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return documents.filter(
      (document) =>
        (status === "all" || document.status === status) &&
        (!query ||
          document.number.toLowerCase().includes(query) ||
          document.customer.name.toLowerCase().includes(query)),
    );
  }, [documents, search, status]);

  const openSum = useMemo(
    () =>
      documents
        .filter((document) => document.status === "SENT")
        .reduce((sum, document) => sum + document.grossCents, 0),
    [documents],
  );

  const label = typeLabels[type];
  const emptyTitle = type === "QUOTE" ? "Noch keine Angebote vorhanden" : type === "CREDIT_NOTE" ? "Noch keine Gutschriften vorhanden" : "Noch keine Rechnungen vorhanden";
  const emptyHint = type === "CREDIT_NOTE" ? "Gutschriften erstellen Sie aus einer ausgestellten Rechnung." : `Erstellen Sie ${type === "QUOTE" ? "Ihr erstes Angebot" : "Ihre erste Rechnung"} über die Aktion oben.`;

  if (isLoading) {
    return (
      <div className="sales-list" aria-label={`${label} werden geladen`} aria-busy="true">
        <div className="app-skeleton app-skeleton-title" />
        <div className="app-skeleton app-skeleton-row" />
        <div className="app-skeleton app-skeleton-panel" />
      </div>
    );
  }

  return (
    <div className="sales-list space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">
            {type === "QUOTE"
              ? "Angebotsübersicht"
              : type === "CREDIT_NOTE"
                ? "Gutschriften"
                : "Rechnungsübersicht"}
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {visible.length} von {documents.length} Belegen
            {type === "INVOICE" && <> · Offen: <span className="font-medium text-zinc-700">{formatMoney(openSum)}</span></>}
          </p>
        </div>
        {type === "CREDIT_NOTE" ? (
          <p className="max-w-xs text-xs text-zinc-500">
            Gutschriften entstehen aus einer ausgestellten Rechnung („Gutschrift erstellen“).
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            <span className="text-base leading-none">+</span>
            {label} erstellen
          </button>
        )}
      </div>

      <div className="sales-filters flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Nummer oder Kunde suchen..."
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none"
        />
        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as SalesDocumentStatus | "all")
          }
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 focus:border-amber-400 focus:outline-none"
        >
          <option value="all">Alle Status</option>
          {(Object.keys(statusLabels) as SalesDocumentStatus[]).map((value) => (
            <option key={value} value={value}>
              {statusLabels[value]}
            </option>
          ))}
        </select>
      </div>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      <div className="sales-table overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Nummer</th>
              <th className="px-4 py-3">Kunde</th>
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">{type === "INVOICE" ? "Fällig" : "Gültig bis"}</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Brutto</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((document) => {
              const overdue =
                document.type === "INVOICE" &&
                document.status === "SENT" &&
                document.dueDate &&
                new Date(document.dueDate).getTime() < now;
              return (
                <tr
                  key={document.id}
                  className="border-b border-zinc-100 hover:bg-zinc-50"
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/sales/${document.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {document.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {document.customer.name}
                    {document.project && (
                      <div className="text-xs text-zinc-500">
                        {document.project.name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{formatDate(document.issueDate)}</td>
                  <td
                    className={`px-4 py-3 ${overdue ? "font-semibold text-red-600" : ""}`}
                  >
                    {formatDate(document.dueDate)}
                    {overdue && " (überfällig)"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[document.status]}`}
                    >
                      {statusLabels[document.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {formatMoney(document.grossCents)}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  <div className="app-table-empty">
                    <strong>{documents.length ? "Keine passenden Belege" : emptyTitle}</strong>
                    <span>{documents.length ? "Passen Sie Suche oder Statusfilter an." : emptyHint}</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isCreating && (
        <SalesFormModal
          type={type}
          onClose={() => setIsCreating(false)}
          onSaved={() => {
            setIsCreating(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
