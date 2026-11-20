"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import { formatDate, formatMoney } from "@/lib/sales";
import { invalidateApi, useApi } from "@/lib/use-api";

type Entry = {
  id: string;
  workDate: string;
  minutes: number;
  description: string;
  billable: boolean;
  hourlyRateCents: number;
  billedDocumentId: string | null;
  user: { id: string; displayName: string };
  project: { id: string; name: string } | null;
  customer: { id: string; name: string } | null;
};

type Summary = {
  byProject: { projectId: string | null; name: string; minutes: number }[];
  unbilledMinutes: number;
  unbilledValueCents: number;
};

const inputClass =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";

const hours = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} h`;

/** "1:30", "1,5" or "90m" -> minutes. */
function parseDuration(input: string): number | null {
  const value = input.trim().toLowerCase();
  let match = /^(\d+):(\d{1,2})$/.exec(value);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  match = /^(\d+)\s*m(in)?$/.exec(value);
  if (match) return Number(match[1]);
  match = /^(\d+(?:[.,]\d+)?)\s*h?$/.exec(value);
  if (match) return Math.round(Number(match[1].replace(",", ".")) * 60);
  return null;
}

export default function TimePage() {
  const router = useRouter();
  const { data, error: loadError, isLoading, reload } = useApi<Entry[]>("/time-entries");
  const { data: summary, reload: reloadSummary } = useApi<Summary>("/time-entries/summary");
  const { data: projectData } = useApi<{ id: string; name: string }[]>("/projects?archived=false");
  const entries = useMemo(() => data ?? [], [data]);
  const projects = projectData ?? [];

  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [duration, setDuration] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [billable, setBillable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function refresh() {
    await Promise.all([reload(), reloadSummary()]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const minutes = parseDuration(duration);
    if (!minutes || minutes < 1 || minutes > 1440) {
      setError("Dauer bitte als 1:30, 1,5 oder 90m eingeben (max. 24 h).");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await apiFetch("/time-entries", {
        method: "POST",
        body: JSON.stringify({
          workDate,
          minutes,
          description: description.trim(),
          projectId: projectId || undefined,
          billable,
        }),
      });
      setDuration("");
      setDescription("");
      await refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Speichern fehlgeschlagen");
    } finally {
      setIsSaving(false);
    }
  }

  async function remove(entry: Entry) {
    try {
      await apiFetch(`/time-entries/${entry.id}`, { method: "DELETE" });
      await refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Löschen fehlgeschlagen");
    }
  }

  async function invoiceCustomer(customerId: string) {
    setError(null);
    try {
      const invoice = await apiFetch<{ id: string }>("/time-entries/invoice", {
        method: "POST",
        body: JSON.stringify({ customerId }),
      });
      ["/sales-documents", "/time-entries"].forEach(invalidateApi);
      router.push(`/sales/${invoice.id}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Abrechnung fehlgeschlagen");
    }
  }

  const unbilledCustomers = useMemo(() => {
    const map = new Map<string, { name: string; minutes: number; valueCents: number }>();
    for (const entry of entries) {
      if (!entry.billable || entry.billedDocumentId || !entry.customer) continue;
      const current = map.get(entry.customer.id) ?? { name: entry.customer.name, minutes: 0, valueCents: 0 };
      current.minutes += entry.minutes;
      current.valueCents += Math.round((entry.minutes / 60) * entry.hourlyRateCents);
      map.set(entry.customer.id, current);
    }
    return [...map.entries()];
  }, [entries]);

  if (isLoading) return <p className="p-8 text-sm text-zinc-400">Lädt...</p>;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <p className="text-xs font-medium tracking-[0.28em] text-amber-600">ZEITERFASSUNG</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Arbeitszeiten</h1>
        {summary && (
          <p className="mt-2 text-sm text-zinc-500">
            Noch nicht abgerechnet: <span className="font-medium text-zinc-800">{hours(summary.unbilledMinutes)}</span>{" "}
            ({formatMoney(summary.unbilledValueCents)}). Den Stundensatz legst du unter Einstellungen → Firmendaten fest.
          </p>
        )}
      </div>

      <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs font-medium text-zinc-600">
          Datum
          <input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} required className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Dauer
          <input value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="1:30" required className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-zinc-600 lg:col-span-2">
          Projekt
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className={`${inputClass} mt-1`}>
            <option value="">Ohne Projekt</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-600 lg:col-span-2">
          Tätigkeit
          <input value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={500} className={`${inputClass} mt-1`} />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={billable} onChange={(event) => setBillable(event.target.checked)} />
          Abrechenbar
        </label>
        <div className="sm:col-span-2 lg:col-span-5">
          <button type="submit" disabled={isSaving} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
            Zeit erfassen
          </button>
        </div>
      </form>

      {(error ?? loadError) && <p className="text-sm text-red-600">{error ?? loadError}</p>}

      {unbilledCustomers.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Zur Abrechnung bereit</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {unbilledCustomers.map(([customerId, info]) => (
              <button
                key={customerId}
                type="button"
                onClick={() => void invoiceCustomer(customerId)}
                className="rounded-lg bg-white px-3 py-2 text-sm hover:bg-amber-100"
              >
                {info.name}: {hours(info.minutes)} · {formatMoney(info.valueCents)} → Rechnungsentwurf
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">Mitarbeiter</th>
              <th className="px-4 py-3">Projekt / Kunde</th>
              <th className="px-4 py-3">Tätigkeit</th>
              <th className="px-4 py-3 text-right">Dauer</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-zinc-100">
                <td className="whitespace-nowrap px-4 py-3">{formatDate(entry.workDate)}</td>
                <td className="px-4 py-3">{entry.user.displayName}</td>
                <td className="px-4 py-3">
                  {entry.project?.name ?? "–"}
                  {entry.customer && <div className="text-xs text-zinc-500">{entry.customer.name}</div>}
                </td>
                <td className="px-4 py-3">
                  {entry.description}
                  {!entry.billable && <span className="ml-2 text-xs text-zinc-400">nicht abrechenbar</span>}
                  {entry.billedDocumentId && <span className="ml-2 text-xs text-emerald-700">abgerechnet</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{hours(entry.minutes)}</td>
                <td className="px-4 py-3 text-right">
                  {!entry.billedDocumentId && (
                    <button type="button" onClick={() => void remove(entry)} className="text-xs text-zinc-400 hover:text-red-600">
                      Löschen
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  Noch keine Zeiten erfasst.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
