"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { apiFetch } from "@/lib/auth-api";
import { useApi } from "@/lib/use-api";
import {
  centsToEuroInput,
  formatDate,
  formatMoney,
  parseEuroToCents,
  type Article,
} from "@/lib/sales";

type OrderStatus =
  | "DRAFT"
  | "ORDERED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";

type OrderItem = {
  id: string;
  position: number;
  articleId: string | null;
  description: string;
  quantity: number;
  receivedQuantity: number;
  unit: string;
  unitPriceCents: number;
};

type Order = {
  id: string;
  number: string;
  status: OrderStatus;
  orderDate: string;
  expectedDate: string | null;
  notes: string | null;
  netCents: number;
  supplier: { id: string; name: string };
  items?: OrderItem[];
};

type SupplierOption = { id: string; name: string; archivedAt: string | null };

const statusLabels: Record<OrderStatus, string> = {
  DRAFT: "Entwurf",
  ORDERED: "Bestellt",
  PARTIALLY_RECEIVED: "Teilweise geliefert",
  RECEIVED: "Geliefert",
  CANCELLED: "Storniert",
};

const inputClass =
  "w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-sm focus:border-amber-400 focus:outline-none";

export default function PurchaseOrdersPage() {
  const [isCreating, setIsCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const {
    data,
    error: loadError,
    isLoading,
    reload: load,
  } = useApi<Order[]>("/purchase-orders");
  const orders = useMemo(() => data ?? [], [data]);

  if (isLoading) return <p className="p-8 text-sm text-zinc-400">Lädt...</p>;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.28em] text-amber-600">
            EINKAUF
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Bestellungen</h1>
          <p className="mt-2 text-sm text-zinc-500">{orders.length} Bestellungen</p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          <span className="text-base leading-none">+</span>
          Bestellung anlegen
        </button>
      </div>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Nummer</th>
              <th className="px-4 py-3">Lieferant</th>
              <th className="px-4 py-3">Bestellt am</th>
              <th className="px-4 py-3">Erwartet</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Netto</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr
                key={order.id}
                onClick={() => setOpenId(order.id)}
                className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50"
              >
                <td className="px-4 py-3 font-mono text-xs font-medium">{order.number}</td>
                <td className="px-4 py-3">{order.supplier.name}</td>
                <td className="px-4 py-3">{formatDate(order.orderDate)}</td>
                <td className="px-4 py-3">{formatDate(order.expectedDate)}</td>
                <td className="px-4 py-3">{statusLabels[order.status]}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(order.netCents)}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  Noch keine Bestellungen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isCreating && (
        <CreateOrderModal
          onClose={() => setIsCreating(false)}
          onSaved={() => {
            setIsCreating(false);
            void load();
          }}
        />
      )}
      {openId && (
        <OrderDetailModal
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}

function OrderDetailModal({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [receive, setReceive] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrder(await apiFetch<Order>(`/purchase-orders/${id}`));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Laden fehlgeschlagen");
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setIsPending(true);
    setError(null);
    try {
      await action();
      await load();
      onChanged();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Aktion fehlgeschlagen");
    } finally {
      setIsPending(false);
    }
  }

  function setStatus(status: OrderStatus) {
    void run(() =>
      apiFetch(`/purchase-orders/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    );
  }

  function submitReceipt() {
    const items = Object.entries(receive)
      .map(([itemId, value]) => ({ itemId, quantity: Math.trunc(Number(value)) }))
      .filter((line) => line.quantity > 0);
    if (items.length === 0) {
      setError("Bitte mindestens eine Liefermenge eintragen.");
      return;
    }
    void run(async () => {
      await apiFetch(`/purchase-orders/${id}/receive`, {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      setReceive({});
    });
  }

  async function remove() {
    if (!window.confirm("Entwurf endgültig löschen?")) return;
    setIsPending(true);
    try {
      await apiFetch(`/purchase-orders/${id}`, { method: "DELETE" });
      onChanged();
      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Löschen fehlgeschlagen");
      setIsPending(false);
    }
  }

  const canReceive =
    order?.status === "ORDERED" || order?.status === "PARTIALLY_RECEIVED";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">
            Bestellung {order?.number ?? ""}
          </h2>
          <button type="button" onClick={onClose} aria-label="Dialog schließen" className="text-zinc-400 hover:text-zinc-600">
            ×
          </button>
        </div>

        {!order ? (
          <p className="text-sm text-zinc-400">{error ?? "Lädt..."}</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              {order.supplier.name} · {statusLabels[order.status]} · bestellt am{" "}
              {formatDate(order.orderDate)}
            </p>
            {order.notes && <p className="text-sm text-zinc-500">{order.notes}</p>}

            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="py-2 pr-2">Pos.</th>
                  <th className="py-2 pr-2">Beschreibung</th>
                  <th className="py-2 pr-2 text-right">Bestellt</th>
                  <th className="py-2 pr-2 text-right">Geliefert</th>
                  <th className="py-2 pr-2 text-right">EK netto</th>
                  {canReceive && <th className="py-2 text-right">Jetzt erhalten</th>}
                </tr>
              </thead>
              <tbody>
                {order.items?.map((item) => {
                  const remaining = item.quantity - item.receivedQuantity;
                  return (
                    <tr key={item.id} className="border-b border-zinc-100">
                      <td className="py-2 pr-2">{item.position}</td>
                      <td className="py-2 pr-2">{item.description}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{item.receivedQuantity}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(item.unitPriceCents)}</td>
                      {canReceive && (
                        <td className="py-2 text-right">
                          {remaining > 0 ? (
                            <input
                              type="number"
                              min={0}
                              max={remaining}
                              value={receive[item.id] ?? ""}
                              onChange={(event) =>
                                setReceive({ ...receive, [item.id]: event.target.value })
                              }
                              placeholder={String(remaining)}
                              className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-right text-sm"
                            />
                          ) : (
                            "✓"
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-right text-sm font-semibold">Summe netto: {formatMoney(order.netCents)}</p>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              {order.status === "DRAFT" && (
                <>
                  <button type="button" disabled={isPending} onClick={() => void remove()} className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-red-600">
                    Löschen
                  </button>
                  <button type="button" disabled={isPending} onClick={() => setStatus("ORDERED")} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
                    Bestellen
                  </button>
                </>
              )}
              {(order.status === "DRAFT" || order.status === "ORDERED") && (
                <button type="button" disabled={isPending} onClick={() => setStatus("CANCELLED")} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                  Stornieren
                </button>
              )}
              {canReceive && (
                <button type="button" disabled={isPending} onClick={submitReceipt} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50">
                  Wareneingang buchen
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type DraftItem = {
  key: number;
  articleId: string;
  description: string;
  quantity: string;
  unit: string;
  price: string;
};

let draftKey = 0;
function emptyDraft(): DraftItem {
  draftKey += 1;
  return { key: draftKey, articleId: "", description: "", quantity: "1", unit: "Stk", price: "0,00" };
}

function CreateOrderModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [projectId, setProjectId] = useState("");
  const { data: projectData } = useApi<{ id: string; name: string }[]>("/projects?archived=false");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>(() => [emptyDraft()]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<SupplierOption[]>("/suppliers"),
      apiFetch<Article[]>("/articles"),
    ])
      .then(([loadedSuppliers, loadedArticles]) => {
        setSuppliers(loadedSuppliers.filter((supplier) => !supplier.archivedAt));
        setArticles(loadedArticles.filter((article) => !article.archivedAt));
      })
      .catch(() => setError("Stammdaten konnten nicht geladen werden."));
  }, []);

  function updateItem(key: number, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function pickArticle(key: number, articleId: string) {
    const article = articles.find((candidate) => candidate.id === articleId);
    updateItem(
      key,
      article
        ? { articleId, description: article.name, unit: article.unit }
        : { articleId: "" },
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const payloadItems = [];
    for (const [index, item] of items.entries()) {
      const unitPriceCents = parseEuroToCents(item.price);
      const quantity = Math.trunc(Number(item.quantity));
      if (unitPriceCents === null || !(quantity > 0)) {
        setError(`Position ${index + 1}: Menge (ganze Zahl) oder Preis ist ungültig.`);
        return;
      }
      payloadItems.push({
        articleId: item.articleId || undefined,
        description: item.description.trim(),
        quantity,
        unit: item.unit.trim() || "Stk",
        unitPriceCents,
      });
    }

    setIsSubmitting(true);
    try {
      await apiFetch("/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          supplierId,
          projectId: projectId || undefined,
          orderDate,
          expectedDate: expectedDate || undefined,
          notes: notes.trim() || undefined,
          items: payloadItems,
        }),
      });
      onSaved();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Fehler beim Speichern");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Neue Bestellung</h2>
          <button type="button" onClick={onClose} aria-label="Dialog schließen" className="text-zinc-400 hover:text-zinc-600">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-medium text-zinc-600 sm:col-span-3">
              Lieferant
              <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required className={`${inputClass} mt-1`}>
                <option value="">Bitte wählen</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-zinc-600 sm:col-span-3">
              Projekt (für die Auswertung, optional)
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className={`${inputClass} mt-1`}>
                <option value="">Kein Projekt</option>
                {(projectData ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-zinc-600">
              Bestelldatum
              <input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} required className={`${inputClass} mt-1`} />
            </label>
            <label className="text-xs font-medium text-zinc-600">
              Erwartet am
              <input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} className={`${inputClass} mt-1`} />
            </label>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item.key} className="grid gap-2 rounded-lg border border-zinc-200 p-3 sm:grid-cols-12">
                <select
                  value={item.articleId}
                  onChange={(event) => pickArticle(item.key, event.target.value)}
                  aria-label={`Artikel Position ${index + 1}`}
                  className={`${inputClass} sm:col-span-12`}
                >
                  <option value="">Freie Position</option>
                  {articles.map((article) => (
                    <option key={article.id} value={article.id}>
                      {article.articleNumber} – {article.name}
                    </option>
                  ))}
                </select>
                <input
                  value={item.description}
                  onChange={(event) => updateItem(item.key, { description: event.target.value })}
                  placeholder="Beschreibung"
                  required
                  maxLength={2000}
                  className={`${inputClass} sm:col-span-12`}
                />
                <input value={item.quantity} onChange={(event) => updateItem(item.key, { quantity: event.target.value })} inputMode="numeric" aria-label="Menge" className={`${inputClass} sm:col-span-3`} />
                <input value={item.unit} onChange={(event) => updateItem(item.key, { unit: event.target.value })} aria-label="Einheit" maxLength={20} className={`${inputClass} sm:col-span-3`} />
                <input
                  value={item.price}
                  onChange={(event) => updateItem(item.key, { price: event.target.value })}
                  inputMode="decimal"
                  aria-label="Einkaufspreis netto"
                  placeholder={centsToEuroInput(0)}
                  className={`${inputClass} sm:col-span-4`}
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setItems((current) => current.filter((candidate) => candidate.key !== item.key))}
                    className="text-xs text-red-600 hover:underline sm:col-span-2"
                  >
                    Entfernen
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setItems((current) => [...current, emptyDraft()])} className="text-sm font-medium text-amber-700 hover:underline">
              + Position hinzufügen
            </button>
          </div>

          <label className="block text-xs font-medium text-zinc-600">
            Notizen
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={2000} className={`${inputClass} mt-1`} />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
              Abbrechen
            </button>
            <button type="submit" disabled={isSubmitting} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
              {isSubmitting ? "Speichert..." : "Als Entwurf speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
