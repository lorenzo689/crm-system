"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import { formatMoney } from "@/lib/sales";

type Summary = {
  revenueByMonth: { month: string; netCents: number }[];
  lowStockArticles: number;
  openInvoices: { count: number; grossCents: number };
  overdueInvoices: { count: number; grossCents: number };
  openQuotes: { count: number; grossCents: number };
  paidThisYearGrossCents: number;
};

const monthFormat = new Intl.DateTimeFormat("de-DE", { month: "short" });

export function FinanceOverview() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    apiFetch<Summary>("/sales-documents/summary")
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  if (!summary) return null;

  const maxRevenue = Math.max(1, ...summary.revenueByMonth.map((m) => m.netCents));
  const tiles = [
    {
      label: "Offene Rechnungen",
      value: formatMoney(summary.openInvoices.grossCents),
      detail: `${summary.openInvoices.count} Belege`,
      href: "/invoices",
    },
    {
      label: "Überfällig",
      value: formatMoney(summary.overdueInvoices.grossCents),
      detail: `${summary.overdueInvoices.count} Belege`,
      href: "/invoices",
      alert: summary.overdueInvoices.count > 0,
    },
    {
      label: "Offene Angebote",
      value: formatMoney(summary.openQuotes.grossCents),
      detail: `${summary.openQuotes.count} Belege`,
      href: "/quotes",
    },
    {
      label: "Bezahlt dieses Jahr",
      value: formatMoney(summary.paidThisYearGrossCents),
      detail:
        summary.lowStockArticles > 0
          ? `${summary.lowStockArticles} Artikel unter Mindestbestand`
          : "Lagerbestand in Ordnung",
      href: "/articles",
    },
  ];

  return (
    <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="rounded-2xl border border-zinc-200 bg-white p-5 transition hover:shadow-md"
          >
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              {tile.label}
            </p>
            <p
              className={`mt-3 text-2xl font-semibold tabular-nums ${tile.alert ? "text-red-600" : "text-zinc-900"}`}
            >
              {tile.value}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{tile.detail}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-zinc-400">
          Umsatz netto (12 Monate)
        </p>
        {summary.revenueByMonth.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-400">Noch keine Rechnungen.</p>
        ) : (
          <div className="mt-4 flex h-32 items-end gap-1.5">
            {summary.revenueByMonth.map((entry) => (
              <div
                key={entry.month}
                className="flex flex-1 flex-col items-center gap-1"
                title={`${entry.month}: ${formatMoney(entry.netCents)}`}
              >
                <div
                  className="w-full rounded-t bg-amber-400"
                  style={{ height: `${Math.max(4, (entry.netCents / maxRevenue) * 100)}%` }}
                />
                <span className="text-[0.65rem] text-zinc-400">
                  {monthFormat.format(new Date(`${entry.month}-01`))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
