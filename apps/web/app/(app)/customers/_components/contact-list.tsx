"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import { useApiResource } from "@/lib/use-api-resource";
import { ContactFormModal } from "./contact-form-modal";
import type { Contact } from "./customer-types";

type ContactListProps = {
  customerId: string;
  isOpen: boolean;
};

export function ContactList({ customerId, isOpen }: ContactListProps) {
  const {
    data,
    error,
    isLoading,
    setData: setContacts,
    setError,
  } = useApiResource<Contact[]>(
    isOpen ? `/contacts?customerId=${customerId}` : null,
    "Ansprechpartner konnten nicht geladen werden.",
  );
  const contacts = data ?? [];
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  function upsertContact(updated: Contact) {
    setContacts((current) => {
      const exists = current.some((contact) => contact.id === updated.id);
      const next = exists
        ? current.map((contact) =>
            contact.id === updated.id ? updated : contact,
          )
        : [...current, updated];

      return next.sort((left, right) =>
        left.fullName.localeCompare(right.fullName, "de"),
      );
    });
  }

  async function handleArchiveToggle(contact: Contact) {
    setOpenMenuId(null);
    setArchivingId(contact.id);

    try {
      const action = contact.archivedAt ? "unarchive" : "archive";
      const updated = await apiFetch<Contact>(`/contacts/${contact.id}/${action}`, {
        method: "POST",
      });
      upsertContact(updated);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Aktion konnte nicht ausgeführt werden.",
      );
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <>
      <section>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
              Ansprechpartner
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              {contacts.length} Kontakt{contacts.length === 1 ? "" : "e"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingContact(null);
              setIsFormOpen(true);
            }}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            + Neuer Ansprechpartner
          </button>
        </div>

        <div className="mt-3 rounded-2xl border border-zinc-200 bg-white">
          {isLoading ? (
            <p className="px-4 py-4 text-sm text-zinc-500">Lädt...</p>
          ) : error ? (
            <p className="px-4 py-4 text-sm text-red-600">{error}</p>
          ) : contacts.length === 0 ? (
            <p className="px-4 py-4 text-sm text-zinc-500">
              Noch keine Ansprechpartner vorhanden.
            </p>
          ) : (
            <div className="divide-y divide-zinc-200">
              {contacts.map((contact) => (
                <article key={contact.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900">
                        {contact.fullName}
                      </h3>
                      {contact.jobTitle && (
                        <p className="mt-1 text-sm text-zinc-500">
                          {contact.jobTitle}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {contact.archivedAt && (
                        <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                          Archiviert
                        </span>
                      )}

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenMenuId((current) =>
                              current === contact.id ? null : contact.id,
                            )
                          }
                          className="rounded-full p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
                          aria-label="Aktionen"
                        >
                          ⋮
                        </button>

                        {openMenuId === contact.id && (
                          <div
                            className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
                            onMouseLeave={() => setOpenMenuId(null)}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setEditingContact(contact);
                                setIsFormOpen(true);
                                setOpenMenuId(null);
                              }}
                              className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                            >
                              Bearbeiten
                            </button>
                            <button
                              type="button"
                              disabled={archivingId === contact.id}
                              onClick={() => handleArchiveToggle(contact)}
                              className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                            >
                              {contact.archivedAt
                                ? "Entarchivieren"
                                : "Archivieren"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-1 text-sm text-zinc-600">
                    {contact.phone && <p>{contact.phone}</p>}
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-amber-600 hover:underline"
                      >
                        {contact.email}
                      </a>
                    )}
                    {!contact.phone && !contact.email && (
                      <p className="text-zinc-400">
                        Keine Kontaktdaten hinterlegt.
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <ContactFormModal
        customerId={customerId}
        contact={editingContact}
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingContact(null);
        }}
        onSaved={upsertContact}
      />
    </>
  );
}
