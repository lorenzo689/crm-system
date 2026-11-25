"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import { formatDate } from "@/lib/sales";
import { useApi } from "@/lib/use-api";

type EmailStatus = "NEW" | "DONE" | "IGNORED";

type InboundEmail = {
  id: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  textBody: string;
  receivedAt: string;
  status: EmailStatus;
  category: string | null;
  aiSummary: string | null;
  customer: { id: string; name: string } | null;
};

const categoryLabels: Record<string, string> = {
  QUOTE_REQUEST: "Anfrage",
  ORDER: "Auftrag",
  PAYMENT: "Zahlung",
  SUPPORT: "Support",
  SPAM: "Spam",
  OTHER: "Sonstiges",
};

const statusFilters: { value: EmailStatus | "ALL"; label: string }[] = [
  { value: "NEW", label: "Neu" },
  { value: "DONE", label: "Erledigt" },
  { value: "IGNORED", label: "Ignoriert" },
  { value: "ALL", label: "Alle" },
];

export default function InboxPage() {
  const [filter, setFilter] = useState<EmailStatus | "ALL">("NEW");
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const { data, error, isLoading, reload } = useApi<{
    configured: boolean;
    emails: InboundEmail[];
  }>(filter === "ALL" ? "/inbox" : `/inbox?status=${filter}`);
  const emails = useMemo(() => data?.emails ?? [], [data]);

  async function poll() {
    setIsPolling(true);
    setMessage(null);
    try {
      const result = await apiFetch<{ imported: number }>("/inbox/poll", { method: "POST" });
      setMessage(`${result.imported} neue E-Mail(s) abgerufen.`);
      await reload();
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Abruf fehlgeschlagen");
    } finally {
      setIsPolling(false);
    }
  }

  async function setStatus(email: InboundEmail, status: EmailStatus) {
    try {
      await apiFetch(`/inbox/${email.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await reload();
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Fehlgeschlagen");
    }
  }

  if (isLoading) return <p className="p-8 text-sm text-zinc-400">Lädt...</p>;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.28em] text-amber-600">POSTEINGANG</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">E-Mails</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Eingehende Mails werden alle 5 Minuten abgerufen, Kunden zugeordnet und von der KI
            eingeordnet. Handlungsbedarf landet als Vorschlag im{" "}
            <Link href="/assistant" className="underline">
              KI-Postfach
            </Link>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={() => void poll()}
          disabled={isPolling || !data?.configured}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPolling ? "Ruft ab…" : "Jetzt abrufen"}
        </button>
      </div>

      {data && !data.configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Posteingang ist nicht verbunden. Trage <code>IMAP_HOST</code>, <code>IMAP_USER</code> und{" "}
          <code>IMAP_PASSWORD</code> in <code>apps/api/.env</code> ein.
        </div>
      )}

      <div className="flex gap-2">
        {statusFilters.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              filter === option.value ? "bg-zinc-900 text-white" : "border border-zinc-200 text-zinc-600"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {(error || message) && <p className="text-sm text-zinc-600">{error ?? message}</p>}

      <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
        {emails.length === 0 && (
          <p className="p-8 text-center text-sm text-zinc-400">Keine E-Mails.</p>
        )}
        {emails.map((email) => (
          <article key={email.id} className="p-4">
            <button
              type="button"
              onClick={() => setOpenId(openId === email.id ? null : email.id)}
              className="block w-full text-left"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span className="font-medium text-zinc-800">{email.fromName ?? email.fromAddress}</span>
                {email.customer && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                    {email.customer.name}
                  </span>
                )}
                {email.category && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                    {categoryLabels[email.category] ?? email.category}
                  </span>
                )}
                <span className="ml-auto">{formatDate(email.receivedAt)}</span>
              </div>
              <h2 className="mt-1 text-sm font-medium text-zinc-900">{email.subject}</h2>
              {email.aiSummary && <p className="mt-1 text-sm text-zinc-600">{email.aiSummary}</p>}
            </button>

            {openId === email.id && (
              <div className="mt-3 space-y-3">
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 font-sans text-sm text-zinc-700">
                  {email.textBody}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/assistant?q=${encodeURIComponent(
                      `Hilf mir mit der E-Mail von ${email.fromAddress} mit dem Betreff "${email.subject}" (Posteingang).`,
                    )}`}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                  >
                    Mit KI bearbeiten
                  </Link>
                  {email.status !== "DONE" && (
                    <button type="button" onClick={() => void setStatus(email, "DONE")} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-50">
                      Erledigt
                    </button>
                  )}
                  {email.status !== "IGNORED" && (
                    <button type="button" onClick={() => void setStatus(email, "IGNORED")} className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100">
                      Ignorieren
                    </button>
                  )}
                  {email.status !== "NEW" && (
                    <button type="button" onClick={() => void setStatus(email, "NEW")} className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100">
                      Wieder öffnen
                    </button>
                  )}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
