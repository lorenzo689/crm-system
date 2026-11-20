"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiFetchRaw } from "@/lib/auth-api";
import {
  calculateTotals,
  dunningLabels,
  centsToEuroInput,
  parseEuroToCents,
  formatDate,
  formatMoney,
  formatVat,
  nextActions,
  statusLabels,
  statusStyles,
  typeLabels,
  type CompanyProfile,
  type SalesDocument,
  type SalesDocumentStatus,
} from "@/lib/sales";
import { SalesFormModal } from "../_components/sales-form-modal";
import { SendDocumentDialog } from "../_components/send-document-dialog";

export default function SalesDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [document, setDocument] = useState<SalesDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [paymentMethod, setPaymentMethod] = useState("Überweisung");
  const [now] = useState(() => Date.now());

  useEffect(() => {
    apiFetch<CompanyProfile>("/company-profile")
      .then(setCompany)
      .catch(() => setCompany(null));
  }, []);

  const load = useCallback(async () => {
    try {
      setDocument(await apiFetch<SalesDocument>(`/sales-documents/${id}`));
      setError(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Beleg konnte nicht geladen werden.",
      );
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
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Aktion fehlgeschlagen",
      );
    } finally {
      setIsPending(false);
    }
  }

  function changeStatus(status: SalesDocumentStatus) {
    if (
      status === "CANCELLED" &&
      !window.confirm("Beleg wirklich stornieren? Das kann nicht rückgängig gemacht werden.")
    ) {
      return;
    }
    void run(() =>
      apiFetch(`/sales-documents/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    );
  }

  async function convert() {
    setIsPending(true);
    setError(null);
    try {
      const invoice = await apiFetch<SalesDocument>(
        `/sales-documents/${id}/convert-to-invoice`,
        { method: "POST" },
      );
      router.push(`/sales/${invoice.id}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Umwandlung fehlgeschlagen",
      );
    } finally {
      setIsPending(false);
    }
  }

  function addPayment(event: React.FormEvent) {
    event.preventDefault();
    const amountCents = parseEuroToCents(paymentAmount);
    if (amountCents === null || amountCents <= 0) {
      setError("Bitte einen gültigen Zahlungsbetrag eingeben.");
      return;
    }
    void run(async () => {
      await apiFetch(`/sales-documents/${id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amountCents,
          paidAt: paymentDate,
          method: paymentMethod.trim() || undefined,
        }),
      });
      setPaymentAmount("");
    });
  }

  async function downloadXRechnung() {
    setError(null);
    try {
      const response = await apiFetchRaw(`/sales-documents/${id}/xrechnung`);
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${document?.number ?? "rechnung"}_xrechnung.xml`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "E-Rechnung konnte nicht erzeugt werden");
    }
  }

  async function createCreditNote() {
    const reason = window.prompt(
      "Grund der Gutschrift (optional). Es wird die gesamte Rechnung gutgeschrieben.",
      "",
    );
    if (reason === null) return;
    setIsPending(true);
    setError(null);
    try {
      const note = await apiFetch<SalesDocument>(
        `/sales-documents/${id}/credit-note`,
        { method: "POST", body: JSON.stringify({ reason: reason.trim() || undefined }) },
      );
      router.push(`/sales/${note.id}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Gutschrift fehlgeschlagen");
    } finally {
      setIsPending(false);
    }
  }

  async function openPdf() {
    setError(null);
    try {
      const response = await apiFetchRaw(`/sales-documents/${id}/pdf`);
      const url = URL.createObjectURL(await response.blob());
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "PDF konnte nicht erzeugt werden");
    }
  }

  async function remove() {
    if (!window.confirm("Entwurf endgültig löschen?") || !document) return;
    setIsPending(true);
    try {
      await apiFetch(`/sales-documents/${id}`, { method: "DELETE" });
      router.push(document.type === "QUOTE" ? "/quotes" : "/invoices");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Löschen fehlgeschlagen",
      );
      setIsPending(false);
    }
  }

  if (!document) {
    return error ? (
      <p className="p-8 text-sm text-red-600">{error}</p>
    ) : (
      <p className="p-8 text-sm text-zinc-400">Lädt...</p>
    );
  }

  const items = document.items ?? [];
  const totals = calculateTotals(items);
  const actions = nextActions[document.type][document.status] ?? [];
  const isDraft = document.status === "DRAFT";
  const outstandingCents =
    document.grossCents - document.paidCents - document.creditedCents;
  const isOverdue =
    document.type === "INVOICE" &&
    document.status === "SENT" &&
    document.dueDate !== null &&
    new Date(document.dueDate).getTime() < now;
  const heading =
    document.type === "INVOICE" && document.dunningLevel > 0
      ? `${dunningLabels[document.dunningLevel]} zu Rechnung ${document.number}`
      : `${typeLabels[document.type]} ${document.number}`;
  const backHref =
    document.type === "QUOTE"
      ? "/quotes"
      : document.type === "CREDIT_NOTE"
        ? "/credit-notes"
        : "/invoices";

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Zurück zur Übersicht
        </Link>
        <div className="flex flex-wrap gap-2">
          {isDraft && document.type !== "CREDIT_NOTE" && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
            >
              Bearbeiten
            </button>
          )}
          {document.type === "QUOTE" && document.status === "ACCEPTED" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => void convert()}
              className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              In Rechnung umwandeln
            </button>
          )}
          {actions.map((action) => (
            <button
              key={action.status}
              type="button"
              disabled={isPending}
              onClick={() => changeStatus(action.status)}
              className={
                action.danger
                  ? "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  : "rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              }
            >
              {action.label}
            </button>
          ))}
          {document.type === "INVOICE" &&
            (document.status === "SENT" || document.status === "PAID") &&
            document.grossCents > document.creditedCents && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => void createCreditNote()}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
              >
                Gutschrift erstellen
              </button>
            )}
          {document.type !== "QUOTE" && !isDraft && (
            <button
              type="button"
              onClick={() => void downloadXRechnung()}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
            >
              E-Rechnung (XML)
            </button>
          )}
          <button
            type="button"
            onClick={() => void openPdf()}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
          >
            PDF
          </button>
          {document.status !== "CANCELLED" && (
            <button
              type="button"
              onClick={() => setIsSendOpen(true)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
            >
              Per E-Mail senden
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
          >
            Drucken
          </button>
          {isOverdue && document.dunningLevel < 3 && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                void run(() =>
                  apiFetch(`/sales-documents/${id}/dunning`, { method: "POST" }),
                )
              }
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              {dunningLabels[document.dunningLevel + 1]} erstellen
            </button>
          )}
          {isDraft && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => void remove()}
              className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-red-600"
            >
              Löschen
            </button>
          )}
        </div>
      </div>

      {error && <p className="no-print text-sm text-red-600">{error}</p>}
      {notice && <p className="no-print text-sm text-emerald-700">{notice}</p>}

      <article className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {company && (
          <div className="mb-8 text-right text-xs leading-5 text-zinc-500">
            <p className="text-sm font-semibold text-zinc-900">
              {company.legalName}
            </p>
            {company.street && <p>{company.street}</p>}
            {(company.postalCode || company.city) && (
              <p>
                {company.postalCode} {company.city}
              </p>
            )}
            {company.email && <p>{company.email}</p>}
            {company.phone && <p>{company.phone}</p>}
          </div>
        )}

        <header className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{heading}</h1>
            {document.dunningLevel > 0 && document.type === "INVOICE" && (
              <p className="mt-2 max-w-md text-sm text-zinc-600">
                Zu unserer Rechnung {document.number} vom{" "}
                {formatDate(document.issueDate)} konnten wir bisher keinen
                (vollständigen) Zahlungseingang feststellen. Bitte überweisen
                Sie den offenen Betrag von{" "}
                <strong>{formatMoney(outstandingCents)}</strong> umgehend.
              </p>
            )}
            <span
              className={`no-print mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[document.status]}`}
            >
              {statusLabels[document.status]}
            </span>
          </div>
          <dl className="text-right text-sm text-zinc-600">
            <div>Datum: {formatDate(document.issueDate)}</div>
            {document.dueDate && (
              <div>
                {document.type === "INVOICE" ? "Fällig am" : "Gültig bis"}:{" "}
                {formatDate(document.dueDate)}
              </div>
            )}
            {document.project && <div>Projekt: {document.project.name}</div>}
            {document.sourceQuote && (
              <div>
                Zu Angebot{" "}
                <Link
                  href={`/sales/${document.sourceQuote.id}`}
                  className="no-print underline"
                >
                  {document.sourceQuote.number}
                </Link>
                <span className="hidden print:inline">
                  {document.sourceQuote.number}
                </span>
              </div>
            )}
          </dl>
        </header>

        <section className="mt-6 text-sm">
          <p className="font-medium text-zinc-900">{document.customer.name}</p>
          <p className="text-zinc-500">
            Kundennr. {document.customer.customerNumber}
          </p>
        </section>

        {document.headerText && (
          <p className="mt-6 whitespace-pre-line text-sm text-zinc-700">
            {document.headerText}
          </p>
        )}

        <table className="mt-6 w-full text-left text-sm">
          <thead className="border-b border-zinc-300 text-xs uppercase text-zinc-500">
            <tr>
              <th className="py-2 pr-2">Pos.</th>
              <th className="py-2 pr-2">Beschreibung</th>
              <th className="py-2 pr-2 text-right">Menge</th>
              <th className="py-2 pr-2 text-right">Einzel</th>
              <th className="py-2 pr-2 text-right">USt.</th>
              <th className="py-2 text-right">Netto</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id ?? index} className="border-b border-zinc-100 align-top">
                <td className="py-2 pr-2">{index + 1}</td>
                <td className="whitespace-pre-line py-2 pr-2">{item.description}</td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {Number(item.quantity).toLocaleString("de-DE")} {item.unit}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {formatMoney(item.unitPriceCents)}
                </td>
                <td className="py-2 pr-2 text-right">{formatVat(item.vatRateBp)}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatMoney(item.netCents ?? totals.lineNet[index])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-6 w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Netto</span>
            <span className="tabular-nums">{formatMoney(document.netCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Umsatzsteuer</span>
            <span className="tabular-nums">{formatMoney(document.vatCents)}</span>
          </div>
          <div className="flex justify-between border-t border-zinc-300 pt-1 text-base font-semibold">
            <span>Gesamt</span>
            <span className="tabular-nums">{formatMoney(document.grossCents)}</span>
          </div>
        </div>

        {document.type === "INVOICE" &&
          (document.paidCents > 0 || document.creditedCents > 0) && (
            <p className="mt-2 text-right text-sm text-zinc-600">
              {document.creditedCents > 0 &&
                `Gutschriften: ${formatMoney(document.creditedCents)} · `}
              {document.paidCents > 0 &&
                `Bereits gezahlt: ${formatMoney(document.paidCents)} · `}
              Offen: {formatMoney(outstandingCents)}
            </p>
          )}

        {document.creditedInvoice && (
          <p className="no-print mt-4 text-xs text-zinc-500">
            Gutschrift zu Rechnung{" "}
            <Link href={`/sales/${document.creditedInvoice.id}`} className="underline">
              {document.creditedInvoice.number}
            </Link>
          </p>
        )}
        {document.creditNotes && document.creditNotes.length > 0 && (
          <p className="no-print mt-4 text-xs text-zinc-500">
            Gutschriften:{" "}
            {document.creditNotes.map((note, index) => (
              <span key={note.id}>
                {index > 0 && ", "}
                <Link href={`/sales/${note.id}`} className="underline">
                  {note.number}
                </Link>
              </span>
            ))}
          </p>
        )}

        {document.footerText && (
          <p className="mt-8 whitespace-pre-line text-sm text-zinc-700">
            {document.footerText}
          </p>
        )}

        {company && document.type === "INVOICE" && (
          <footer className="mt-10 border-t border-zinc-200 pt-4 text-xs leading-5 text-zinc-500">
            {company.invoiceFooter && (
              <p className="mb-2 whitespace-pre-line">{company.invoiceFooter}</p>
            )}
            <p>
              {[company.bankName, company.iban && `IBAN ${company.iban}`, company.bic && `BIC ${company.bic}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p>
              {[company.vatId && `USt-IdNr. ${company.vatId}`, company.taxNumber && `Steuernr. ${company.taxNumber}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </footer>
        )}

        {document.invoices && document.invoices.length > 0 && (
          <p className="no-print mt-6 text-xs text-zinc-500">
            Rechnungen:{" "}
            {document.invoices.map((invoice, index) => (
              <span key={invoice.id}>
                {index > 0 && ", "}
                <Link href={`/sales/${invoice.id}`} className="underline">
                  {invoice.number}
                </Link>
              </span>
            ))}
          </p>
        )}
      </article>

      {document.type === "INVOICE" &&
        (document.status === "SENT" || document.status === "PAID") && (
          <section className="no-print mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-zinc-900">Zahlungen</h2>
            {document.payments && document.payments.length > 0 ? (
              <ul className="mt-3 divide-y divide-zinc-100 text-sm">
                {document.payments.map((payment) => (
                  <li key={payment.id} className="flex justify-between py-2">
                    <span>
                      {formatDate(payment.paidAt)}
                      {payment.method && ` · ${payment.method}`}
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(payment.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-zinc-400">Noch keine Zahlungen.</p>
            )}
            <p className="mt-3 text-sm text-zinc-600">
              Offen: <strong>{formatMoney(outstandingCents)}</strong>
            </p>

            {document.status === "SENT" && (
              <form onSubmit={addPayment} className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-xs font-medium text-zinc-600">
                  Betrag (€)
                  <input
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder={centsToEuroInput(outstandingCents)}
                    className="mt-1 block w-32 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-medium text-zinc-600">
                  Datum
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(event) => setPaymentDate(event.target.value)}
                    required
                    className="mt-1 block rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-medium text-zinc-600">
                  Zahlart
                  <input
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    maxLength={50}
                    className="mt-1 block w-36 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  Zahlung buchen
                </button>
              </form>
            )}
          </section>
        )}

      {isSendOpen && (
        <SendDocumentDialog
          document={document}
          onClose={() => setIsSendOpen(false)}
          onSent={() => {
            setIsSendOpen(false);
            setNotice("E-Mail wurde versendet.");
            void load();
          }}
        />
      )}

      {isEditing && (
        <SalesFormModal
          type={document.type}
          document={document}
          onClose={() => setIsEditing(false)}
          onSaved={(saved) => {
            setIsEditing(false);
            setDocument(saved);
          }}
        />
      )}
    </div>
  );
}
