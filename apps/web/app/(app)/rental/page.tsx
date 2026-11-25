"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import { formatDate, type Article } from "@/lib/sales";
import { invalidateApi, useApi } from "@/lib/use-api";

type ReservationStatus = "TENTATIVE" | "CONFIRMED" | "RETURNED" | "CANCELLED";

type Reservation = {
  id: string;
  quantity: number;
  startsOn: string;
  endsOn: string;
  status: ReservationStatus;
  note: string | null;
  article: { id: string; articleNumber: string; name: string };
  customer: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
};

type Availability = {
  name: string;
  totalUnits: number;
  available: number;
  isRentable: boolean;
};

const statusLabels: Record<ReservationStatus, string> = {
  TENTATIVE: "Option",
  CONFIRMED: "Bestätigt",
  RETURNED: "Zurück",
  CANCELLED: "Storniert",
};

const statusStyles: Record<ReservationStatus, string> = {
  TENTATIVE: "bg-amber-50 text-amber-700",
  CONFIRMED: "bg-blue-50 text-blue-700",
  RETURNED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-zinc-100 text-zinc-500 line-through",
};

const inputClass =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";

const today = () => new Date().toISOString().slice(0, 10);

export default function RentalPage() {
  const { data: reservationData, error: loadError, isLoading, reload } =
    useApi<Reservation[]>("/reservations");
  const { data: articleData } = useApi<Article[]>("/articles");
  const { data: customerData } = useApi<{ id: string; name: string; archivedAt: string | null }[]>("/customers");
  const [showClosed, setShowClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reservations = useMemo(() => reservationData ?? [], [reservationData]);
  const rentable = useMemo(
    () => (articleData ?? []).filter((article) => article.isRentable && !article.archivedAt),
    [articleData],
  );
  const customers = useMemo(
    () => (customerData ?? []).filter((customer) => !customer.archivedAt),
    [customerData],
  );

  const [articleId, setArticleId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState(today());
  const [customerId, setCustomerId] = useState("");
  const [note, setNote] = useState("");
  const [tentative, setTentative] = useState(false);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!articleId || !startsOn || !endsOn || endsOn < startsOn) return;
    let cancelled = false;
    apiFetch<Availability>(
      `/reservations/availability?articleId=${articleId}&from=${startsOn}&to=${endsOn}`,
    )
      .then((result) => {
        if (!cancelled) setAvailability(result);
      })
      .catch(() => {
        if (!cancelled) setAvailability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId, startsOn, endsOn]);

  const shownAvailability = articleId && endsOn >= startsOn ? availability : null;
  const wanted = Math.max(1, Math.trunc(Number(quantity)) || 1);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await apiFetch("/reservations", {
        method: "POST",
        body: JSON.stringify({
          articleId,
          quantity: wanted,
          startsOn,
          endsOn,
          customerId: customerId || undefined,
          note: note.trim() || undefined,
          status: tentative ? "TENTATIVE" : "CONFIRMED",
        }),
      });
      setNote("");
      invalidateApi("/reservations");
      await reload();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Reservierung fehlgeschlagen");
    } finally {
      setIsSaving(false);
    }
  }

  async function changeStatus(reservation: Reservation, status: ReservationStatus) {
    try {
      await apiFetch(`/reservations/${reservation.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await reload();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Aktion fehlgeschlagen");
    }
  }

  const visible = reservations.filter(
    (reservation) =>
      showClosed || reservation.status === "TENTATIVE" || reservation.status === "CONFIRMED",
  );

  if (isLoading) return <p className="p-8 text-sm text-zinc-400">Lädt...</p>;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <p className="text-xs font-medium tracking-[0.28em] text-amber-600">VERLEIH</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Equipment-Reservierungen</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Die Verfügbarkeit wird pro Tag geprüft; Überbuchungen sind nicht möglich. Artikel
          werden unter „Artikel“ als mietbar markiert.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-6"
      >
        <label className="text-xs font-medium text-zinc-600 lg:col-span-2">
          Artikel
          <select value={articleId} onChange={(event) => setArticleId(event.target.value)} required className={`${inputClass} mt-1`}>
            <option value="">Bitte wählen</option>
            {rentable.map((article) => (
              <option key={article.id} value={article.id}>
                {article.articleNumber} – {article.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Menge
          <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="numeric" className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Von
          <input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} required className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Bis
          <input type="date" value={endsOn} min={startsOn} onChange={(event) => setEndsOn(event.target.value)} required className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Kunde
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className={`${inputClass} mt-1`}>
            <option value="">–</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-600 sm:col-span-2 lg:col-span-3">
          Notiz
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} className={`${inputClass} mt-1`} />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 lg:col-span-1">
          <input type="checkbox" checked={tentative} onChange={(event) => setTentative(event.target.checked)} />
          Nur Option
        </label>
        <div className="flex items-center justify-between gap-3 sm:col-span-2 lg:col-span-2">
          <p
            className={`text-sm ${
              shownAvailability && wanted > shownAvailability.available ? "text-red-600" : "text-zinc-600"
            }`}
          >
            {shownAvailability
              ? shownAvailability.isRentable
                ? `Frei im Zeitraum: ${shownAvailability.available} von ${shownAvailability.totalUnits}`
                : "Artikel ist nicht als mietbar markiert"
              : "Artikel und Zeitraum wählen"}
          </p>
          <button
            type="submit"
            disabled={isSaving || !articleId || (shownAvailability !== null && wanted > shownAvailability.available)}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            Reservieren
          </button>
        </div>
      </form>

      {(error ?? loadError) && <p className="text-sm text-red-600">{error ?? loadError}</p>}

      <label className="flex items-center gap-2 text-sm text-zinc-600">
        <input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} />
        Zurückgegebene und stornierte anzeigen
      </label>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Zeitraum</th>
              <th className="px-4 py-3">Artikel</th>
              <th className="px-4 py-3 text-right">Menge</th>
              <th className="px-4 py-3">Kunde / Projekt</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.map((reservation) => (
              <tr key={reservation.id} className="border-b border-zinc-100">
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDate(reservation.startsOn)} – {formatDate(reservation.endsOn)}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-zinc-500">{reservation.article.articleNumber}</span>{" "}
                  {reservation.article.name}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{reservation.quantity}</td>
                <td className="px-4 py-3">
                  {reservation.customer?.name ?? "–"}
                  {reservation.project && <div className="text-xs text-zinc-500">{reservation.project.name}</div>}
                  {reservation.note && <div className="text-xs text-zinc-400">{reservation.note}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[reservation.status]}`}>
                    {statusLabels[reservation.status]}
                  </span>
                </td>
                <td className="space-x-3 px-4 py-3 text-right">
                  {reservation.status === "TENTATIVE" && (
                    <button type="button" onClick={() => void changeStatus(reservation, "CONFIRMED")} className="text-zinc-700 hover:text-zinc-900">
                      Bestätigen
                    </button>
                  )}
                  {reservation.status === "CONFIRMED" && (
                    <button type="button" onClick={() => void changeStatus(reservation, "RETURNED")} className="text-zinc-700 hover:text-zinc-900">
                      Zurückgegeben
                    </button>
                  )}
                  {(reservation.status === "TENTATIVE" || reservation.status === "CONFIRMED") && (
                    <button type="button" onClick={() => void changeStatus(reservation, "CANCELLED")} className="text-red-600 hover:underline">
                      Stornieren
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  Keine Reservierungen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
