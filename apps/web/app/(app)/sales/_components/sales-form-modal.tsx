"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import { useDialogFocus } from "@/components/layout/use-dialog-focus";
import {
  calculateTotals,
  centsToEuroInput,
  formatMoney,
  parseEuroToCents,
  typeLabels,
  type Article,
  type SalesDocument,
  type SalesDocumentType,
} from "@/lib/sales";

type CustomerOption = { id: string; name: string; archivedAt: string | null };
type ProjectOption = { id: string; name: string };

type ItemState = {
  key: number;
  articleId: string;
  description: string;
  quantity: string;
  unit: string;
  price: string;
  vatRateBp: number;
};

type SalesFormModalProps = {
  type: SalesDocumentType;
  document?: SalesDocument | null;
  onClose: () => void;
  onSaved: (document: SalesDocument) => void;
};

const inputClass =
  "w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-sm focus:border-amber-400 focus:outline-none";

let itemKey = 0;
function emptyItem(): ItemState {
  itemKey += 1;
  return {
    key: itemKey,
    articleId: "",
    description: "",
    quantity: "1",
    unit: "Stk",
    price: "0,00",
    vatRateBp: 1900,
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function SalesFormModal({
  type,
  document,
  onClose,
  onSaved,
}: SalesFormModalProps) {
  const { dialogRef, onDialogKeyDown } = useDialogFocus(onClose);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [customerId, setCustomerId] = useState(document?.customer.id ?? "");
  const [projectId, setProjectId] = useState(document?.project?.id ?? "");
  const [issueDate, setIssueDate] = useState(
    document?.issueDate.slice(0, 10) ?? today(),
  );
  const [dueDate, setDueDate] = useState(document?.dueDate?.slice(0, 10) ?? "");
  const [headerText, setHeaderText] = useState(document?.headerText ?? "");
  const [footerText, setFooterText] = useState(document?.footerText ?? "");
  const [items, setItems] = useState<ItemState[]>(() =>
    document?.items?.length
      ? document.items.map((item) => {
          itemKey += 1;
          return {
            key: itemKey,
            articleId: item.articleId ?? "",
            description: item.description,
            quantity: String(Number(item.quantity)),
            unit: item.unit,
            price: centsToEuroInput(item.unitPriceCents),
            vatRateBp: item.vatRateBp,
          };
        })
      : [emptyItem()],
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<CustomerOption[]>("/customers"),
      apiFetch<Article[]>("/articles"),
    ])
      .then(([loadedCustomers, loadedArticles]) => {
        setCustomers(loadedCustomers.filter((customer) => !customer.archivedAt));
        setArticles(loadedArticles.filter((article) => !article.archivedAt));
      })
      .catch(() => setError("Stammdaten konnten nicht geladen werden."));
  }, []);

  useEffect(() => {
    if (!customerId) return;
    apiFetch<ProjectOption[]>(
      `/projects?customerId=${encodeURIComponent(customerId)}&archived=false`,
    )
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [customerId]);

  const totals = useMemo(
    () =>
      calculateTotals(
        items.map((item) => ({
          quantity: Number(item.quantity.replace(",", ".")) || 0,
          unitPriceCents: parseEuroToCents(item.price) ?? 0,
          vatRateBp: item.vatRateBp,
        })),
      ),
    [items],
  );

  function updateItem(key: number, patch: Partial<ItemState>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function pickArticle(key: number, articleId: string) {
    const article = articles.find((candidate) => candidate.id === articleId);
    if (!article) {
      updateItem(key, { articleId: "" });
      return;
    }
    updateItem(key, {
      articleId,
      description: article.name,
      unit: article.unit,
      price: centsToEuroInput(article.unitPriceCents),
      vatRateBp: article.vatRateBp,
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const payloadItems = [];
    for (const [index, item] of items.entries()) {
      const unitPriceCents = parseEuroToCents(item.price);
      const quantity = Number(item.quantity.replace(",", "."));
      if (unitPriceCents === null || !(quantity > 0)) {
        setError(`Position ${index + 1}: Menge oder Preis ist ungültig.`);
        return;
      }
      payloadItems.push({
        articleId: item.articleId || undefined,
        description: item.description.trim(),
        quantity,
        unit: item.unit.trim() || "Stk",
        unitPriceCents,
        vatRateBp: item.vatRateBp,
      });
    }

    setIsSubmitting(true);
    try {
      const saved = document
        ? await apiFetch<SalesDocument>(`/sales-documents/${document.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              customerId,
              projectId: projectId || null,
              issueDate,
              dueDate: dueDate || null,
              headerText: headerText.trim() || null,
              footerText: footerText.trim() || null,
              items: payloadItems,
            }),
          })
        : await apiFetch<SalesDocument>("/sales-documents", {
            method: "POST",
            body: JSON.stringify({
              type,
              customerId,
              projectId: projectId || undefined,
              issueDate,
              dueDate: dueDate || undefined,
              headerText: headerText.trim() || undefined,
              footerText: footerText.trim() || undefined,
              items: payloadItems,
            }),
          });
      onSaved(saved);
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
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={document ? `${typeLabels[type]} bearbeiten` : `Neues ${typeLabels[type]}`} tabIndex={-1} onKeyDown={onDialogKeyDown} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">
            {document
              ? `${typeLabels[type]} bearbeiten`
              : `Neues ${typeLabels[type]}`}
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

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-zinc-600 lg:col-span-2">
              Kunde
              <select
                value={customerId}
                onChange={(event) => {
                  setCustomerId(event.target.value);
                  setProjectId("");
                }}
                required
                className={`${inputClass} mt-1`}
              >
                <option value="">Bitte wählen</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-zinc-600 lg:col-span-2">
              Projekt (optional)
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                disabled={!customerId}
                className={`${inputClass} mt-1`}
              >
                <option value="">Kein Projekt</option>
                {(customerId ? projects : []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-zinc-600">
              Datum
              <input
                type="date"
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
                required
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-xs font-medium text-zinc-600">
              {type === "INVOICE" ? "Fällig am" : "Gültig bis"}
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className={`${inputClass} mt-1`}
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-zinc-600">
            Einleitungstext
            <textarea
              value={headerText}
              onChange={(event) => setHeaderText(event.target.value)}
              rows={2}
              maxLength={5000}
              className={`${inputClass} mt-1`}
            />
          </label>

          <div>
            <p className="mb-2 text-xs font-medium text-zinc-600">Positionen</p>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={item.key}
                  className="grid gap-2 rounded-lg border border-zinc-200 p-3 sm:grid-cols-12"
                >
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
                    onChange={(event) =>
                      updateItem(item.key, { description: event.target.value })
                    }
                    placeholder="Beschreibung"
                    required
                    maxLength={2000}
                    className={`${inputClass} sm:col-span-12`}
                  />
                  <input
                    value={item.quantity}
                    onChange={(event) =>
                      updateItem(item.key, { quantity: event.target.value })
                    }
                    inputMode="decimal"
                    aria-label="Menge"
                    placeholder="Menge"
                    className={`${inputClass} sm:col-span-2`}
                  />
                  <input
                    value={item.unit}
                    onChange={(event) =>
                      updateItem(item.key, { unit: event.target.value })
                    }
                    aria-label="Einheit"
                    maxLength={20}
                    className={`${inputClass} sm:col-span-2`}
                  />
                  <input
                    value={item.price}
                    onChange={(event) =>
                      updateItem(item.key, { price: event.target.value })
                    }
                    inputMode="decimal"
                    aria-label="Einzelpreis netto"
                    placeholder="Preis netto"
                    className={`${inputClass} sm:col-span-3`}
                  />
                  <select
                    value={item.vatRateBp}
                    onChange={(event) =>
                      updateItem(item.key, {
                        vatRateBp: Number(event.target.value),
                      })
                    }
                    aria-label="Umsatzsteuer"
                    className={`${inputClass} sm:col-span-2`}
                  >
                    <option value={1900}>19 %</option>
                    <option value={700}>7 %</option>
                    <option value={0}>0 %</option>
                  </select>
                  <div className="flex items-center justify-between sm:col-span-3">
                    <span className="text-sm font-medium tabular-nums">
                      {formatMoney(totals.lineNet[index] ?? 0)}
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setItems((current) =>
                            current.filter((candidate) => candidate.key !== item.key),
                          )
                        }
                        className="text-xs text-red-600 hover:underline"
                      >
                        Entfernen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setItems((current) => [...current, emptyItem()])}
              disabled={items.length >= 200}
              className="mt-3 text-sm font-medium text-amber-700 hover:underline"
            >
              + Position hinzufügen
            </button>
          </div>

          <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Netto</span>
              <span className="tabular-nums">{formatMoney(totals.net)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Umsatzsteuer</span>
              <span className="tabular-nums">{formatMoney(totals.vat)}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-200 pt-1 text-base font-semibold">
              <span>Brutto</span>
              <span className="tabular-nums">{formatMoney(totals.gross)}</span>
            </div>
          </div>

          <label className="block text-xs font-medium text-zinc-600">
            Schlusstext
            <textarea
              value={footerText}
              onChange={(event) => setFooterText(event.target.value)}
              rows={2}
              maxLength={5000}
              className={`${inputClass} mt-1`}
            />
          </label>

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
              {isSubmitting ? "Speichert..." : "Als Entwurf speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
