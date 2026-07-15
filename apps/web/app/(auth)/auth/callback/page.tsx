import Link from 'next/link';
import { AuthShell } from '../../_components/auth-shell';

export default function AuthCallbackPage() {
  return (
    <AuthShell
      eyebrow="Authentifizierung"
      title="Anmeldung wird verarbeitet"
      description="Die Rueckmeldung des Identity-Providers wird hier spaeter verarbeitet. Diese Seite ist aktuell nur als technischer Platzhalter vorhanden."
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5">
          <p className="text-sm leading-6 text-[var(--color-muted)]">
            In der finalen Version validieren wir hier das Rueckgabe-Token,
            pruefen Benutzer- und Organisationsstatus und erzeugen danach die
            interne Session.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="h-3 w-3 animate-pulse rounded-full bg-[var(--color-gold)]" />
          <p className="text-sm font-medium text-[var(--color-ink)]">
            Status: Wartet auf Backend-Integration
          </p>
        </div>

        <Link
          href="/login"
          className="inline-flex rounded-full border border-[var(--color-line)] px-5 py-3 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-paper-strong)]"
        >
          Zurueck zum Login
        </Link>
      </div>
    </AuthShell>
  );
}
