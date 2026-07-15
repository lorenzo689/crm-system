import Link from 'next/link';
import { AuthShell } from '../_components/auth-shell';

export default function AccessDeniedPage() {
  return (
    <AuthShell
      eyebrow="Zugriff"
      title="Zugriff verweigert"
      description="Ihr Microsoft-Konto wurde erfolgreich erkannt, ist fuer Bissinger OS jedoch aktuell nicht freigeschaltet."
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5">
          <p className="text-sm leading-6 text-[var(--color-muted)]">
            Bitte wenden Sie sich an die interne Administration, wenn Sie
            Zugriff auf Projekte, Kunden oder Unternehmensdaten benoetigen.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/login"
            className="inline-flex justify-center rounded-full bg-[var(--color-ink)] px-5 py-3 text-sm font-semibold text-[var(--color-paper)] transition hover:bg-[var(--color-ink-soft)]"
          >
            Erneut anmelden
          </Link>
          <Link
            href="/account-disabled"
            className="inline-flex justify-center rounded-full border border-[var(--color-line)] px-5 py-3 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-paper-strong)]"
          >
            Kontostatus ansehen
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
