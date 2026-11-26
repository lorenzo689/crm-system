"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import { formatDate, formatMoney, parseEuroToCents } from "@/lib/sales";
import { invalidateApi, useApi } from "@/lib/use-api";

type Tab = "bank" | "payables";

type Suggestion = {
  kind: "INVOICE" | "SUPPLIER_INVOICE";
  id: string;
  label: string;
  confidence: "HIGH" | "MEDIUM";
};

type Transaction = {
  id: string;
  bookingDate: string;
  amountCents: number;
  counterparty: string | null;
  purpose: string | null;
  status: "UNMATCHED" | "MATCHED" | "IGNORED";
  salesDocument: { id: string; number: string } | null;
  supplierInvoice: { id: string; invoiceNumber: string; supplier: { name: string } } | null;
  suggestion: Suggestion | null;
};

type SupplierInvoice = {
  id: string;
  invoiceNumber: string;
  status: "OPEN" | "PAID" | "DISPUTED";
  issueDate: string;
  dueDate: string | null;
  netCents: number;
  vatCents: number;
  grossCents: number;
  supplier: { id: string; name: string };
};

const inputClass =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>("bank");
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Bankabgleich & Eingangsrechnungen</h1>
      </div>
      <div className="flex gap-2">
        {([
          ["bank", "Bankabgleich"],
          ["payables", "Eingangsrechnungen"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              tab === value ? "bg-zinc-900 text-white" : "border border-zinc-200 text-zinc-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "bank" ? <BankTab /> : <PayablesTab />}
    </div>
  );
}

function BankTab() {
  const [filter, setFilter] = useState<"UNMATCHED" | "MATCHED" | "IGNORED">("UNMATCHED");
  const { data, error, isLoading, reload } = useApi<Transaction[]>(
    `/finance/bank/transactions?status=${filter}`,
  );
  const transactions = useMemo(() => data ?? [], [data]);
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function run(action: () => Promise<string | void>) {
    setIsBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (result) setMessage(result);
      ["/finance", "/sales-documents"].forEach(invalidateApi);
      await reload();
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Aktion fehlgeschlagen");
    } finally {
      setIsBusy(false);
    }
  }

  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 2_000_000) {
      setMessage("Datei ist zu groß (max. 2 MB).");
      return;
    }
    // Banks export Windows-1252 or UTF-8; try UTF-8 first and fall back.
    const buffer = await file.arrayBuffer();
    let text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    if (text.includes("�")) {
      text = new TextDecoder("windows-1252").decode(buffer);
    }
    await run(async () => {
      const result = await apiFetch<{ imported: number; duplicates: number; skipped: number }>(
        "/finance/bank/import",
        { method: "POST", body: JSON.stringify({ csv: text }) },
      );
      return `${result.imported} Buchungen importiert, ${result.duplicates} Duplikate übersprungen.`;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">
          Kontoauszug (CSV) importieren
          <input type="file" accept=".csv,text/csv" onChange={importFile} className="hidden" />
        </label>
        <button
          type="button"
          disabled={isBusy}
          onClick={() =>
            void run(async () => {
              const result = await apiFetch<{ matched: number; checked: number }>(
                "/finance/bank/auto-match",
                { method: "POST" },
              );
              return `${result.matched} von ${result.checked} Buchungen automatisch zugeordnet (Rechnungsnummer und Betrag stimmten exakt).`;
            })
          }
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
        >
          Eindeutige automatisch zuordnen
        </button>
        <div className="ml-auto flex gap-2">
          {([
            ["UNMATCHED", "Offen"],
            ["MATCHED", "Zugeordnet"],
            ["IGNORED", "Ignoriert"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-1 text-sm ${
                filter === value ? "bg-zinc-900 text-white" : "border border-zinc-200 text-zinc-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {(message ?? error) && <p className="text-sm text-zinc-700">{message ?? error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">Auftraggeber / Zweck</th>
              <th className="px-4 py-3 text-right">Betrag</th>
              <th className="px-4 py-3">Zuordnung</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                  Lädt…
                </td>
              </tr>
            )}
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-zinc-100 align-top">
                <td className="whitespace-nowrap px-4 py-3">{formatDate(tx.bookingDate)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-900">{tx.counterparty ?? "–"}</div>
                  <div className="max-w-md text-xs text-zinc-500">{tx.purpose}</div>
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums ${
                    tx.amountCents < 0 ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {formatMoney(tx.amountCents)}
                </td>
                <td className="px-4 py-3">
                  {tx.status === "MATCHED" && (
                    <>
                      {tx.salesDocument && (
                        <Link href={`/sales/${tx.salesDocument.id}`} className="underline">
                          {tx.salesDocument.number}
                        </Link>
                      )}
                      {tx.supplierInvoice &&
                        `${tx.supplierInvoice.supplier.name} ${tx.supplierInvoice.invoiceNumber}`}
                    </>
                  )}
                  {tx.status === "IGNORED" && <span className="text-zinc-400">Ignoriert</span>}
                  {tx.status === "UNMATCHED" && (
                    <div className="flex flex-wrap items-center gap-2">
                      {tx.suggestion ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void run(async () => {
                              await apiFetch(`/finance/bank/transactions/${tx.id}/match`, {
                                method: "POST",
                                body: JSON.stringify(
                                  tx.suggestion!.kind === "INVOICE"
                                    ? { salesDocumentId: tx.suggestion!.id }
                                    : { supplierInvoiceId: tx.suggestion!.id },
                                ),
                              });
                            })
                          }
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                            tx.suggestion.confidence === "HIGH"
                              ? "bg-emerald-600 text-white hover:bg-emerald-700"
                              : "bg-amber-100 text-amber-900 hover:bg-amber-200"
                          }`}
                          title={tx.suggestion.confidence === "HIGH" ? "Nummer und Betrag stimmen" : "Bitte prüfen"}
                        >
                          {tx.suggestion.label} zuordnen
                        </button>
                      ) : (
                        <span className="text-xs text-zinc-400">Kein Vorschlag</span>
                      )}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void run(async () => {
                            await apiFetch(`/finance/bank/transactions/${tx.id}/ignore`, { method: "POST" });
                          })
                        }
                        className="text-xs text-zinc-400 hover:text-zinc-700"
                      >
                        Ignorieren
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && transactions.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                  Keine Buchungen. Importiere einen Kontoauszug als CSV.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PayablesTab() {
  const { data, error, isLoading, reload } = useApi<SupplierInvoice[]>("/finance/supplier-invoices");
  const { data: suppliers } = useApi<{ id: string; name: string; archivedAt: string | null }[]>("/suppliers");
  const invoices = useMemo(() => data ?? [], [data]);
  const [supplierId, setSupplierId] = useState("");
  const [number, setNumber] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [net, setNet] = useState("");
  const [vat, setVat] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const openSum = invoices
    .filter((invoice) => invoice.status === "OPEN")
    .reduce((sum, invoice) => sum + invoice.grossCents, 0);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const netCents = parseEuroToCents(net);
    const vatCents = parseEuroToCents(vat || "0");
    if (netCents === null || vatCents === null) {
      setMessage("Netto und USt. bitte als Betrag eingeben (z. B. 120,50).");
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      await apiFetch("/finance/supplier-invoices", {
        method: "POST",
        body: JSON.stringify({
          supplierId,
          invoiceNumber: number.trim(),
          issueDate,
          dueDate: dueDate || undefined,
          netCents,
          vatCents,
        }),
      });
      setNumber("");
      setNet("");
      setVat("");
      await reload();
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Speichern fehlgeschlagen");
    } finally {
      setIsSaving(false);
    }
  }

  async function setStatus(invoice: SupplierInvoice, status: "OPEN" | "PAID" | "DISPUTED") {
    try {
      await apiFetch(`/finance/supplier-invoices/${invoice.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await reload();
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Aktion fehlgeschlagen");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-7">
        <label className="text-xs font-medium text-zinc-600 lg:col-span-2">
          Lieferant
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required className={`${inputClass} mt-1`}>
            <option value="">Bitte wählen</option>
            {(suppliers ?? [])
              .filter((supplier) => !supplier.archivedAt)
              .map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Rechnungsnr.
          <input value={number} onChange={(event) => setNumber(event.target.value)} required maxLength={100} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Datum
          <input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} required className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Fällig
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Netto (€)
          <input value={net} onChange={(event) => setNet(event.target.value)} inputMode="decimal" required className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          USt. (€)
          <input value={vat} onChange={(event) => setVat(event.target.value)} inputMode="decimal" placeholder="0,00" className={`${inputClass} mt-1`} />
        </label>
        <div className="sm:col-span-2 lg:col-span-7">
          <button type="submit" disabled={isSaving} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
            Eingangsrechnung erfassen
          </button>
        </div>
      </form>

      <p className="text-sm text-zinc-500">
        Offene Verbindlichkeiten: <span className="font-medium text-zinc-800">{formatMoney(openSum)}</span>
      </p>
      {(message ?? error) && <p className="text-sm text-red-600">{message ?? error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Lieferant</th>
              <th className="px-4 py-3">Nummer</th>
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">Fällig</th>
              <th className="px-4 py-3 text-right">Brutto</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                  Lädt…
                </td>
              </tr>
            )}
            {invoices.map((invoice) => {
              const overdue =
                invoice.status === "OPEN" && invoice.dueDate && new Date(invoice.dueDate) < new Date();
              return (
                <tr key={invoice.id} className="border-b border-zinc-100">
                  <td className="px-4 py-3">{invoice.supplier.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{invoice.invoiceNumber}</td>
                  <td className="px-4 py-3">{formatDate(invoice.issueDate)}</td>
                  <td className={`px-4 py-3 ${overdue ? "font-semibold text-red-600" : ""}`}>
                    {formatDate(invoice.dueDate)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(invoice.grossCents)}</td>
                  <td className="px-4 py-3">
                    {{ OPEN: "Offen", PAID: "Bezahlt", DISPUTED: "Strittig" }[invoice.status]}
                  </td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    {invoice.status !== "PAID" && (
                      <button type="button" onClick={() => void setStatus(invoice, "PAID")} className="text-zinc-700 hover:text-zinc-900">
                        Bezahlt
                      </button>
                    )}
                    {invoice.status === "OPEN" && (
                      <button type="button" onClick={() => void setStatus(invoice, "DISPUTED")} className="text-zinc-400 hover:text-zinc-700">
                        Strittig
                      </button>
                    )}
                    {invoice.status !== "OPEN" && (
                      <button type="button" onClick={() => void setStatus(invoice, "OPEN")} className="text-zinc-400 hover:text-zinc-700">
                        Wieder öffnen
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!isLoading && invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                  Noch keine Eingangsrechnungen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
