"use client";

import { useState } from "react";
import { apiFetchRaw } from "@/lib/auth-api";
import { formatMoney } from "@/lib/sales";
import { useApi } from "@/lib/use-api";

type ProjectRow = {
  projectId: string;
  name: string;
  projectNumber: string;
  customerName: string;
  revenueNetCents: number;
  purchaseNetCents: number;
  marginNetCents: number;
  hours: number;
};

type CustomerRow = { customerId: string; name: string; revenueNetCents: number };

const inputClass =
  "rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";

export default function ReportsPage() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const query = `from=${from}&to=${to}`;
  const { data: projects, isLoading } = useApi<ProjectRow[]>(`/reports/projects?${query}`);
  const { data: customers } = useApi<CustomerRow[]>(`/reports/customers?${query}`);
  const [message, setMessage] = useState<string | null>(null);

  async function download(path: string, fileName: string) {
    setMessage(null);
    try {
      const response = await apiFetchRaw(`${path}?${query}`);
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Export fehlgeschlagen");
    }
  }

  const totalRevenue = (projects ?? []).reduce((sum, row) => sum + row.revenueNetCents, 0);
  const totalMargin = (projects ?? []).reduce((sum, row) => sum + row.marginNetCents, 0);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Projekte, Kunden & Exporte</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} aria-label="Von" />
          –
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} aria-label="Bis" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void download("/reports/export/sales", "rechnungsausgang.csv")} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50">
          Export Rechnungsausgang (CSV)
        </button>
        <button type="button" onClick={() => void download("/reports/export/purchases", "rechnungseingang.csv")} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50">
          Export Rechnungseingang (CSV)
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        Die Exporte sind eine allgemeine Buchungsliste für den Steuerberater (Semikolon, Excel-tauglich), kein
        DATEV-Format.
      </p>
      {message && <p className="text-sm text-red-600">{message}</p>}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Deckungsbeitrag pro Projekt (netto)</h2>
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Projekt</th>
                <th className="px-4 py-3">Kunde</th>
                <th className="px-4 py-3 text-right">Umsatz</th>
                <th className="px-4 py-3 text-right">Einkauf</th>
                <th className="px-4 py-3 text-right">Marge</th>
                <th className="px-4 py-3 text-right">Stunden</th>
              </tr>
            </thead>
            <tbody>
              {(projects ?? []).map((row) => (
                <tr key={row.projectId} className="border-b border-zinc-100">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-zinc-500">{row.projectNumber}</span> {row.name}
                  </td>
                  <td className="px-4 py-3">{row.customerName}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(row.revenueNetCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(row.purchaseNetCents)}</td>
                  <td className={`px-4 py-3 text-right font-medium tabular-nums ${row.marginNetCents < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {formatMoney(row.marginNetCents)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.hours}</td>
                </tr>
              ))}
              {!isLoading && (projects ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    Keine Projektdaten im Zeitraum. Bestellungen und Rechnungen müssen einem Projekt zugeordnet sein.
                  </td>
                </tr>
              )}
              {(projects ?? []).length > 0 && (
                <tr className="font-semibold">
                  <td className="px-4 py-3" colSpan={2}>
                    Summe
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(totalRevenue)}</td>
                  <td />
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(totalMargin)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Top-Kunden nach Umsatz (netto)</h2>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          {(customers ?? []).length === 0 ? (
            <p className="text-sm text-zinc-400">Keine Umsätze im Zeitraum.</p>
          ) : (
            <ul className="space-y-2">
              {(customers ?? []).map((row) => {
                const max = Math.max(1, ...(customers ?? []).map((customer) => customer.revenueNetCents));
                return (
                  <li key={row.customerId} className="text-sm">
                    <div className="flex justify-between">
                      <span>{row.name}</span>
                      <span className="tabular-nums">{formatMoney(row.revenueNetCents)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded bg-zinc-100">
                      <div className="h-1.5 rounded bg-amber-400" style={{ width: `${Math.max(2, (row.revenueNetCents / max) * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
