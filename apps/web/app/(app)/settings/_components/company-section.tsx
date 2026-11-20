"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import { parseEuroToCents, type CompanyProfile } from "@/lib/sales";

const inputClass =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";

const fields: { key: keyof CompanyProfile; label: string; wide?: boolean }[] = [
  { key: "legalName", label: "Firmenname", wide: true },
  { key: "street", label: "Straße & Nr.", wide: true },
  { key: "postalCode", label: "PLZ" },
  { key: "city", label: "Ort" },
  { key: "email", label: "E-Mail" },
  { key: "phone", label: "Telefon" },
  { key: "website", label: "Website (https://…)", wide: true },
  { key: "vatId", label: "USt-IdNr." },
  { key: "taxNumber", label: "Steuernummer" },
  { key: "bankName", label: "Bank" },
  { key: "iban", label: "IBAN" },
  { key: "bic", label: "BIC" },
];

export function CompanySection() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    apiFetch<CompanyProfile>("/company-profile")
      .then(setProfile)
      .catch(() =>
        setMessage({ ok: false, text: "Firmendaten konnten nicht geladen werden." }),
      );
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        defaultPaymentTermDays: profile.defaultPaymentTermDays,
        defaultHourlyRateCents: profile.defaultHourlyRateCents ?? 0,
      };
      for (const { key } of fields) {
        const value = profile[key];
        payload[key] = typeof value === "string" && value.trim() ? value.trim() : null;
      }
      payload.legalName = profile.legalName.trim();
      payload.invoiceFooter = profile.invoiceFooter?.trim() || null;
      setProfile(
        await apiFetch<CompanyProfile>("/company-profile", {
          method: "PUT",
          body: JSON.stringify(payload),
        }),
      );
      setMessage({ ok: true, text: "Gespeichert." });
    } catch (caughtError) {
      setMessage({
        ok: false,
        text:
          caughtError instanceof Error
            ? caughtError.message
            : "Speichern fehlgeschlagen.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (!profile) {
    return <p className="text-sm text-zinc-400">{message?.text ?? "Lädt…"}</p>;
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Firmendaten</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Erscheinen als Briefkopf und Fußzeile auf Angeboten und Rechnungen.
          Änderungen sind nur für Administratoren möglich.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(({ key, label, wide }) => (
          <label
            key={key}
            className={`text-xs font-medium text-zinc-600 ${wide ? "sm:col-span-2" : ""}`}
          >
            {label}
            <input
              value={(profile[key] as string | null | undefined) ?? ""}
              onChange={(event) =>
                setProfile({ ...profile, [key]: event.target.value })
              }
              required={key === "legalName"}
              className={`${inputClass} mt-1`}
            />
          </label>
        ))}
        <label className="text-xs font-medium text-zinc-600">
          Zahlungsziel (Tage)
          <input
            type="number"
            min={0}
            max={365}
            value={profile.defaultPaymentTermDays}
            onChange={(event) =>
              setProfile({
                ...profile,
                defaultPaymentTermDays: Number(event.target.value) || 0,
              })
            }
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Stundensatz netto (€)
          <input
            inputMode="decimal"
            value={((profile.defaultHourlyRateCents ?? 0) / 100).toFixed(2).replace(".", ",")}
            onChange={(event) => {
              const cents = parseEuroToCents(event.target.value);
              if (cents !== null) {
                setProfile({ ...profile, defaultHourlyRateCents: cents });
              }
            }}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-zinc-600 sm:col-span-2">
          Fußtext für Rechnungen
          <textarea
            value={profile.invoiceFooter ?? ""}
            onChange={(event) =>
              setProfile({ ...profile, invoiceFooter: event.target.value })
            }
            rows={2}
            maxLength={2000}
            className={`${inputClass} mt-1`}
          />
        </label>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {isSaving ? "Speichert…" : "Speichern"}
        </button>
        {message && (
          <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
