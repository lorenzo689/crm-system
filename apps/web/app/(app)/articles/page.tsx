"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import { useApi } from "@/lib/use-api";
import {
  centsToEuroInput,
  formatMoney,
  formatVat,
  parseEuroToCents,
  type Article,
} from "@/lib/sales";

type FormState = {
  articleNumber: string;
  name: string;
  description: string;
  unit: string;
  price: string;
  vatRateBp: number;
  trackStock: boolean;
  stockQuantity: string;
  minStock: string;
  isRentable: boolean;
  rentalStock: string;
  rentalPrice: string;
};

const emptyForm: FormState = {
  articleNumber: "",
  name: "",
  description: "",
  unit: "Stk",
  price: "0,00",
  vatRateBp: 1900,
  trackStock: false,
  stockQuantity: "0",
  minStock: "0",
  isRentable: false,
  rentalStock: "0",
  rentalPrice: "0,00",
};

const inputClass =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";

export default function ArticlesPage() {
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Article | "new" | null>(null);

  const {
    data,
    error: loadError,
    isLoading,
    reload: load,
  } = useApi<Article[]>("/articles");
  const articles = useMemo(() => data ?? [], [data]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return articles.filter(
      (article) =>
        Boolean(article.archivedAt) === showArchived &&
        (!query ||
          article.name.toLowerCase().includes(query) ||
          article.articleNumber.toLowerCase().includes(query)),
    );
  }, [articles, search, showArchived]);

  async function toggleArchive(article: Article) {
    try {
      await apiFetch(
        `/articles/${article.id}/${article.archivedAt ? "unarchive" : "archive"}`,
        { method: "POST" },
      );
      await load();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Fehlgeschlagen",
      );
    }
  }

  if (isLoading) {
    return <p className="p-8 text-sm text-zinc-400">Lädt...</p>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.28em] text-amber-600">
            ARTIKEL
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">
            Artikelstamm & Lager
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {visible.length} Artikel sichtbar
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          <span className="text-base leading-none">+</span>
          Artikel anlegen
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Artikelnummer oder Name suchen..."
          className={inputClass}
        />
        <label className="flex shrink-0 items-center gap-2 text-sm text-zinc-600">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Archivierte
        </label>
      </div>

      {(error ?? loadError) && (
        <p className="text-sm text-red-600">{error ?? loadError}</p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Nr.</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 text-right">Preis (netto)</th>
              <th className="px-4 py-3">USt.</th>
              <th className="px-4 py-3 text-right">Bestand</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.map((article) => {
              const lowStock =
                article.trackStock && article.stockQuantity <= article.minStock;
              return (
                <tr key={article.id} className="border-b border-zinc-100">
                  <td className="px-4 py-3 font-mono text-xs">
                    {article.articleNumber}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900">
                      {article.name}
                    </div>
                    {article.description && (
                      <div className="line-clamp-1 text-xs text-zinc-500">
                        {article.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(article.unitPriceCents)} / {article.unit}
                  </td>
                  <td className="px-4 py-3">{formatVat(article.vatRateBp)}</td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${lowStock ? "font-semibold text-red-600" : ""}`}
                  >
                    {article.trackStock
                      ? `${article.stockQuantity} ${article.unit}`
                      : "–"}
                    {lowStock && " ⚠"}
                  </td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(article)}
                      className="text-zinc-600 hover:text-zinc-900"
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleArchive(article)}
                      className="text-zinc-400 hover:text-zinc-700"
                    >
                      {article.archivedAt ? "Wiederherstellen" : "Archivieren"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  Keine Artikel gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <ArticleModal
          article={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ArticleModal({
  article,
  onClose,
  onSaved,
}: {
  article: Article | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    article
      ? {
          articleNumber: article.articleNumber,
          name: article.name,
          description: article.description ?? "",
          unit: article.unit,
          price: centsToEuroInput(article.unitPriceCents),
          vatRateBp: article.vatRateBp,
          trackStock: article.trackStock,
          stockQuantity: String(article.stockQuantity),
          minStock: String(article.minStock),
          isRentable: article.isRentable,
          rentalStock: String(article.rentalStock),
          rentalPrice: centsToEuroInput(article.rentalPriceCents),
        }
      : emptyForm,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const unitPriceCents = parseEuroToCents(form.price);
    if (unitPriceCents === null) {
      setError("Bitte einen gültigen Preis eingeben (z. B. 12,50).");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await apiFetch(article ? `/articles/${article.id}` : "/articles", {
        method: article ? "PATCH" : "POST",
        body: JSON.stringify({
          articleNumber: form.articleNumber.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          unit: form.unit.trim() || "Stk",
          unitPriceCents,
          vatRateBp: form.vatRateBp,
          trackStock: form.trackStock,
          stockQuantity: Math.max(0, Math.trunc(Number(form.stockQuantity)) || 0),
          minStock: Math.max(0, Math.trunc(Number(form.minStock)) || 0),
          isRentable: form.isRentable,
          rentalStock: Math.max(0, Math.trunc(Number(form.rentalStock)) || 0),
          rentalPriceCents: parseEuroToCents(form.rentalPrice) ?? 0,
        }),
      });
      onSaved();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Fehler beim Speichern",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">
            {article ? "Artikel bearbeiten" : "Neuen Artikel anlegen"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dialog schließen"
            className="text-zinc-400 hover:text-zinc-600"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <label className="col-span-1 text-xs font-medium text-zinc-600">
              Artikelnr.
              <input
                value={form.articleNumber}
                onChange={(event) => update("articleNumber", event.target.value)}
                required
                maxLength={50}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="col-span-2 text-xs font-medium text-zinc-600">
              Name
              <input
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                required
                maxLength={200}
                className={`${inputClass} mt-1`}
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-zinc-600">
            Beschreibung
            <textarea
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              rows={2}
              maxLength={2000}
              className={`${inputClass} mt-1`}
            />
          </label>

          <div className="grid grid-cols-3 gap-4">
            <label className="text-xs font-medium text-zinc-600">
              Preis netto (€)
              <input
                value={form.price}
                onChange={(event) => update("price", event.target.value)}
                inputMode="decimal"
                required
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-xs font-medium text-zinc-600">
              Einheit
              <input
                value={form.unit}
                onChange={(event) => update("unit", event.target.value)}
                maxLength={20}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-xs font-medium text-zinc-600">
              USt.
              <select
                value={form.vatRateBp}
                onChange={(event) =>
                  update("vatRateBp", Number(event.target.value))
                }
                className={`${inputClass} mt-1`}
              >
                <option value={1900}>19 %</option>
                <option value={700}>7 %</option>
                <option value={0}>0 %</option>
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={form.trackStock}
              onChange={(event) => update("trackStock", event.target.checked)}
            />
            Lagerbestand führen
          </label>

          {form.trackStock && (
            <div className="grid grid-cols-2 gap-4">
              <label className="text-xs font-medium text-zinc-600">
                Bestand
                <input
                  type="number"
                  min={0}
                  value={form.stockQuantity}
                  onChange={(event) => update("stockQuantity", event.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="text-xs font-medium text-zinc-600">
                Mindestbestand
                <input
                  type="number"
                  min={0}
                  value={form.minStock}
                  onChange={(event) => update("minStock", event.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={form.isRentable}
              onChange={(event) => update("isRentable", event.target.checked)}
            />
            Zur Miete (Equipment-Verleih)
          </label>

          {form.isRentable && (
            <div className="grid grid-cols-2 gap-4">
              <label className="text-xs font-medium text-zinc-600">
                Mietbestand (Stück)
                <input
                  type="number"
                  min={0}
                  value={form.rentalStock}
                  onChange={(event) => update("rentalStock", event.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="text-xs font-medium text-zinc-600">
                Tagesmiete netto (€)
                <input
                  value={form.rentalPrice}
                  onChange={(event) => update("rentalPrice", event.target.value)}
                  inputMode="decimal"
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {isSubmitting ? "Speichert..." : "Speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
