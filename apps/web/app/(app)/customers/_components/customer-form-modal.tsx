"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import { useDialogFocus } from "@/components/layout/use-dialog-focus";
import type { Customer } from "./customer-types";

type CustomerFormModalProps = {
  customer?: Customer | null;
  isOpen: boolean;
  mode: "create" | "edit";
  onClose: () => void;
  onSaved: (customerId?: string) => void;
};

type FormState = {
  customerNumber: string;
  description: string;
  name: string;
  status: Customer["status"];
  website: string;
};

const initialFormState: FormState = {
  customerNumber: "",
  description: "",
  name: "",
  status: "ACTIVE",
  website: "",
};

function normalizeCustomerNumber(value: string) {
  return value.toUpperCase().replace(/\s+/g, "");
}

function normalizeWebsite(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function mapCustomerError(message: string) {
  if (message.includes("Customer number already exists")) {
    return "Die Kundennummer ist bereits vergeben.";
  }

  return message;
}

function CustomerFormModalContent({
  customer,
  mode,
  onClose,
  onSaved,
}: CustomerFormModalProps) {
  const { dialogRef, onDialogKeyDown } = useDialogFocus(onClose);
  const [formState, setFormState] = useState<FormState>(() =>
    customer
      ? {
          customerNumber: customer.customerNumber,
          description: customer.description ?? "",
          name: customer.name,
          status: customer.status,
          website: customer.website ?? "",
        }
      : initialFormState,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function validateForm() {
    if (!formState.name.trim()) {
      return "Bitte einen Firmennamen eingeben.";
    }

    if (!/^K-\d+$/.test(formState.customerNumber.trim())) {
      return "Bitte eine Kundennummer im Format K-1234 eingeben.";
    }

    if (formState.website.trim()) {
      try {
        new URL(normalizeWebsite(formState.website));
      } catch {
        return "Bitte eine gültige Website-URL eingeben.";
      }
    }

    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        customerNumber: normalizeCustomerNumber(formState.customerNumber),
        description: formState.description.trim() || undefined,
        name: formState.name.trim(),
        status: formState.status,
        website: formState.website.trim()
          ? normalizeWebsite(formState.website)
          : undefined,
      };

      if (mode === "create") {
        const createdCustomer = await apiFetch<Customer>("/customers", {
          body: JSON.stringify(payload),
          method: "POST",
        });
        onSaved(createdCustomer.id);
      } else if (customer) {
        const updatedCustomer = await apiFetch<Customer>(
          `/customers/${customer.id}`,
          {
            body: JSON.stringify(payload),
            method: "PATCH",
          },
        );
        onSaved(updatedCustomer.id);
      }

      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? mapCustomerError(caughtError.message)
          : "Fehler beim Speichern des Kunden.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={mode === "create" ? "Neuen Kunden anlegen" : "Kunden bearbeiten"} tabIndex={-1} onKeyDown={onDialogKeyDown} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-amber-600">
              Kunden
            </p>
            <h2 className="mt-2 text-lg font-semibold text-zinc-900">
              {mode === "create"
                ? "Neuen Kunden anlegen"
                : "Kunden bearbeiten"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dialog schließen"
            className="rounded-full p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Firmenname
            </label>
            <input
              type="text"
              value={formState.name}
              onChange={(event) => updateField("name", event.target.value)}
              required
              maxLength={200}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Kundennummer
              </label>
              <input
                type="text"
                value={formState.customerNumber}
                onChange={(event) =>
                  updateField(
                    "customerNumber",
                    normalizeCustomerNumber(event.target.value),
                  )
                }
                required
                maxLength={50}
                placeholder="K-2019"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-300 focus:border-amber-400 focus:outline-none"
              />
              <p className="mt-1 text-xs text-zinc-400">Format: K-1234</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Status
              </label>
              <select
                value={formState.status}
                onChange={(event) =>
                  updateField("status", event.target.value as Customer["status"])
                }
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 focus:border-amber-400 focus:outline-none"
              >
                <option value="ACTIVE">Aktiv</option>
                <option value="LEAD">Lead</option>
                <option value="INACTIVE">Inaktiv</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Website
            </label>
            <input
              type="text"
              value={formState.website}
              onChange={(event) => updateField("website", event.target.value)}
              placeholder="example.com oder https://example.com"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-300 focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Notiz
            </label>
            <textarea
              value={formState.description}
              onChange={(event) =>
                updateField("description", event.target.value)
              }
              rows={4}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {isSubmitting
                ? "Wird gespeichert..."
                : mode === "create"
                  ? "Kunde anlegen"
                  : "Änderungen speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Mounted only while open (and re-keyed per record), so every opening starts
 * from fresh form state without an effect that resets it.
 */
export function CustomerFormModal(props: CustomerFormModalProps) {
  if (!props.isOpen) {
    return null;
  }
  return <CustomerFormModalContent key={props.customer?.id ?? "new"} {...props} />;
}
