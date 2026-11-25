"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import { formatDate, formatMoney, parseEuroToCents } from "@/lib/sales";
import { useApi } from "@/lib/use-api";

type Recurring = {
  id: string;
  title: string;
  intervalMonths: number;
  nextRunDate: string;
  active: boolean;
  lastRunAt: string | null;
  customer: { id: string; name: string };
  items: { description: string; quantity: number; unitPriceCents: number; vatRateBp: number }[];
};

const inputClass =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";

const intervalLabel = (months: number) =>
  months === 1 ? "monatlich" : months === 3 ? "vierteljährlich" : months === 12 ? "jährlich" : `alle ${months} Monate`;

export default function RecurringPage() {
  const { data, error: loadError, isLoading, reload } = useApi<Recurring[]>("/recurring-invoices");
  const { data: customerData } = useApi<{ id: string; name: string; archivedAt: string | null }[]>("/customers");
  const templates = useMemo(() => data ?? [], [data]);
  const customers = (customerData ?? []).filter((customer) => !customer.archivedAt);

  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [intervalMonths, setIntervalMonths] = useState(1);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [vatRateBp, setVatRateBp] = useState(1900);
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const unitPriceCents = parseEuroToCents(price);
    const qty = Number(quantity.replace(",", "."));
    if (unitPriceCents === null || !(qty > 0)) {
      setMessage("Preis oder Menge ist ungültig.");
      return;
    }
    setIsBusy(true);
    setMessage(null);
    try {
      await apiFetch("/recurring-invoices", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          customerId,
          intervalMonths,
          startDate,
          items: [
            {
              description: description.trim(),
              quantity: qty,
              unit: "Stk",
              unitPriceCents,
              vatRateBp,
            },
          ],
        }),
      });
      setTitle("");
      setDescription("");
      setPrice("");
      await reload();
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Speichern fehlgeschlagen");
    } finally {
      setIsBusy(false);
    }
  }

  async function act(path: string, method: "POST" | "DELETE" = "POST") {
    setMessage(null);
    try {
      const result = await apiFetch<{ created?: number }>(path, { method });
      if (typeof result.created === "number") {
        setMessage(`${result.created} Rechnungsentwurf/-entwürfe erstellt (unter Rechnungen).`);
      }
      await reload();
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Aktion fehlgeschlagen");
    }
  }

  if (isLoading) return <p className="p-8 text-sm text-zinc-400">Lädt...</p>;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.28em] text-amber-600">ABOS</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Wiederkehrende Rechnungen</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Jeden Morgen um 05:00 Uhr entstehen fällige Rechnungsentwürfe. Sie werden nie automatisch
            ausgestellt: du prüfst und versendest sie selbst.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void act("/recurring-invoices/run")}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
        >
          Fällige jetzt erzeugen
        </button>
      </div>

      <form onSubmit={create} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs font-medium text-zinc-600 lg:col-span-2">
          Bezeichnung
          <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} placeholder="Wartungsvertrag Lichtanlage" className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-zinc-600 lg:col-span-2">
          Kunde
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required className={`${inputClass} mt-1`}>
            <option value="">Bitte wählen</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Rhythmus
          <select value={intervalMonths} onChange={(event) => setIntervalMonths(Number(event.target.value))} className={`${inputClass} mt-1`}>
            <option value={1}>Monatlich</option>
            <option value={3}>Vierteljährlich</option>
            <option value={6}>Halbjährlich</option>
            <option value={12}>Jährlich</option>
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Erste Rechnung
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-zinc-600 lg:col-span-3">
          Position
          <input value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={2000} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Menge
          <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Preis netto (€)
          <input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" required className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          USt.
          <select value={vatRateBp} onChange={(event) => setVatRateBp(Number(event.target.value))} className={`${inputClass} mt-1`}>
            <option value={1900}>19 %</option>
            <option value={700}>7 %</option>
            <option value={0}>0 %</option>
          </select>
        </label>
        <div className="sm:col-span-2 lg:col-span-6">
          <button type="submit" disabled={isBusy} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
            Abo anlegen
          </button>
        </div>
      </form>

      {(message ?? loadError) && <p className="text-sm text-zinc-700">{message ?? loadError}</p>}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Bezeichnung</th>
              <th className="px-4 py-3">Kunde</th>
              <th className="px-4 py-3">Rhythmus</th>
              <th className="px-4 py-3">Nächste</th>
              <th className="px-4 py-3 text-right">Netto</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => {
              const net = template.items.reduce(
                (sum, item) => sum + Math.round(item.quantity * item.unitPriceCents),
                0,
              );
              return (
                <tr key={template.id} className={`border-b border-zinc-100 ${template.active ? "" : "text-zinc-400"}`}>
                  <td className="px-4 py-3 font-medium">{template.title}</td>
                  <td className="px-4 py-3">{template.customer.name}</td>
                  <td className="px-4 py-3">{intervalLabel(template.intervalMonths)}</td>
                  <td className="px-4 py-3">{template.active ? formatDate(template.nextRunDate) : "pausiert"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(net)}</td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    <button type="button" onClick={() => void act(`/recurring-invoices/${template.id}/${template.active ? "pause" : "resume"}`)} className="text-zinc-700 hover:text-zinc-900">
                      {template.active ? "Pausieren" : "Fortsetzen"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Abo löschen? Bereits erstellte Rechnungen bleiben erhalten.")) {
                          void act(`/recurring-invoices/${template.id}`, "DELETE");
                        }
                      }}
                      className="text-red-600 hover:underline"
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              );
            })}
            {templates.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  Noch keine Abos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
