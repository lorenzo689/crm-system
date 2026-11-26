"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import type { Contact } from "./customer-types";

type ContactFormModalProps = {
  customerId: string;
  contact?: Contact | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (contact: Contact) => void;
};

type FormState = {
  email: string;
  fullName: string;
  jobTitle: string;
  phone: string;
};

const initialFormState: FormState = {
  email: "",
  fullName: "",
  jobTitle: "",
  phone: "",
};

function ContactFormModalContent({
  customerId,
  contact,
  onClose,
  onSaved,
}: ContactFormModalProps) {
  const [formState, setFormState] = useState<FormState>(() =>
    contact
      ? {
          email: contact.email ?? "",
          fullName: contact.fullName,
          jobTitle: contact.jobTitle ?? "",
          phone: contact.phone ?? "",
        }
      : initialFormState,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function validateForm() {
    if (!formState.fullName.trim()) {
      return "Bitte einen Namen eingeben.";
    }

    if (formState.email.trim()) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(formState.email.trim())) {
        return "Bitte eine gültige E-Mail-Adresse eingeben.";
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
        email: formState.email.trim() || undefined,
        fullName: formState.fullName.trim(),
        jobTitle: formState.jobTitle.trim() || undefined,
        phone: formState.phone.trim() || undefined,
      };

      const savedContact = contact
        ? await apiFetch<Contact>(`/contacts/${contact.id}`, {
            body: JSON.stringify(payload),
            method: "PATCH",
          })
        : await apiFetch<Contact>("/contacts", {
            body: JSON.stringify({ ...payload, customerId }),
            method: "POST",
          });

      onSaved(savedContact);
      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Fehler beim Speichern des Kontakts.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-amber-600">
              Ansprechpartner
            </p>
            <h2 className="mt-2 text-lg font-semibold text-zinc-900">
              {contact
                ? "Ansprechpartner bearbeiten"
                : "Neuen Ansprechpartner anlegen"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Name
            </label>
            <input
              type="text"
              value={formState.fullName}
              onChange={(event) => updateField("fullName", event.target.value)}
              required
              maxLength={150}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Position
              </label>
              <input
                type="text"
                value={formState.jobTitle}
                onChange={(event) => updateField("jobTitle", event.target.value)}
                maxLength={100}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Telefon
              </label>
              <input
                type="text"
                value={formState.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                maxLength={30}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              E-Mail
            </label>
            <input
              type="email"
              value={formState.email}
              onChange={(event) => updateField("email", event.target.value)}
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
                : contact
                  ? "Änderungen speichern"
                  : "Ansprechpartner anlegen"}
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
export function ContactFormModal(props: ContactFormModalProps) {
  if (!props.isOpen) {
    return null;
  }
  return <ContactFormModalContent key={props.contact?.id ?? "new"} {...props} />;
}
