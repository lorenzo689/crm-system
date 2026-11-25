"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import { useApi } from "@/lib/use-api";

type Supplier = {
  id: string;
  supplierNumber: string;
  name: string;
  email: string | null;
  phone: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  notes: string | null;
  archivedAt: string | null;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";

const formFields = [
  ["supplierNumber", "Lieferantennr.", 50],
  ["name", "Name", 200],
  ["email", "E-Mail", 254],
  ["phone", "Telefon", 50],
  ["street", "Straße & Nr.", 200],
  ["postalCode", "PLZ", 20],
  ["city", "Ort", 100],
] as const;

type FormKey = (typeof formFields)[number][0];

export default function SuppliersPage() {
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);

  const {
    data,
    error: loadError,
    isLoading,
    reload: load,
  } = useApi<Supplier[]>("/suppliers");
  const suppliers = useMemo(() => data ?? [], [data]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return suppliers.filter(
      (supplier) =>
        Boolean(supplier.archivedAt) === showArchived &&
        (!query ||
          supplier.name.toLowerCase().includes(query) ||
          supplier.supplierNumber.toLowerCase().includes(query)),
    );
  }, [suppliers, search, showArchived]);

  async function toggleArchive(supplier: Supplier) {
    try {
      await apiFetch(
        `/suppliers/${supplier.id}/${supplier.archivedAt ? "unarchive" : "archive"}`,
        { method: "POST" },
      );
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Fehlgeschlagen");
    }
  }

  if (isLoading) return <p className="p-8 text-sm text-zinc-400">Lädt...</p>;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.28em] text-amber-600">
            EINKAUF
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Lieferanten</h1>
          <p className="mt-2 text-sm text-zinc-500">{visible.length} sichtbar</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          <span className="text-base leading-none">+</span>
          Lieferant anlegen
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name oder Nummer suchen..."
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
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
              <th className="px-4 py-3">Kontakt</th>
              <th className="px-4 py-3">Ort</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.map((supplier) => (
              <tr key={supplier.id} className="border-b border-zinc-100">
                <td className="px-4 py-3 font-mono text-xs">{supplier.supplierNumber}</td>
                <td className="px-4 py-3 font-medium text-zinc-900">{supplier.name}</td>
                <td className="px-4 py-3 text-zinc-600">
                  {supplier.email}
                  {supplier.phone && <div className="text-xs">{supplier.phone}</div>}
                </td>
                <td className="px-4 py-3">
                  {[supplier.postalCode, supplier.city].filter(Boolean).join(" ")}
                </td>
                <td className="space-x-3 px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(supplier)}
                    className="text-zinc-600 hover:text-zinc-900"
                  >
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleArchive(supplier)}
                    className="text-zinc-400 hover:text-zinc-700"
                  >
                    {supplier.archivedAt ? "Wiederherstellen" : "Archivieren"}
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                  Keine Lieferanten gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <SupplierModal
          supplier={editing === "new" ? null : editing}
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

function SupplierModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<FormKey | "notes", string>>({
    supplierNumber: supplier?.supplierNumber ?? "",
    name: supplier?.name ?? "",
    email: supplier?.email ?? "",
    phone: supplier?.phone ?? "",
    street: supplier?.street ?? "",
    postalCode: supplier?.postalCode ?? "",
    city: supplier?.city ?? "",
    notes: supplier?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = Object.fromEntries(
        Object.entries(form)
          .map(([key, value]) => [key, value.trim()] as const)
          .filter(([key, value]) => value || key === "name" || key === "supplierNumber"),
      );
      await apiFetch(supplier ? `/suppliers/${supplier.id}` : "/suppliers", {
        method: supplier ? "PATCH" : "POST",
        body: JSON.stringify(payload),
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">
            {supplier ? "Lieferant bearbeiten" : "Neuer Lieferant"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Dialog schließen" className="text-zinc-400 hover:text-zinc-600">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {formFields.map(([key, label, max]) => (
              <label key={key} className="text-xs font-medium text-zinc-600">
                {label}
                <input
                  value={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  required={key === "name" || key === "supplierNumber"}
                  maxLength={max}
                  type={key === "email" ? "email" : "text"}
                  className={inputClass}
                />
              </label>
            ))}
          </div>
          <label className="block text-xs font-medium text-zinc-600">
            Notizen
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              rows={2}
              maxLength={2000}
              className={inputClass}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
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
