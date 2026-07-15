import Link from 'next/link';
import { AuthShell } from '../_components/auth-shell';

export default function AccountDisabledPage() {
  return (
    <AuthShell
      eyebrow="Kontostatus"
      title="Konto deaktiviert"
      description="Ihr Benutzerkonto oder Ihre Organisationszuordnung ist derzeit nicht aktiv. Diese Seite dient aktuell nur als Platzhalter fuer den spaeteren Produktionsfall."
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5">
          <ul className="space-y-3 text-sm leading-6 text-[var(--color-muted)]">
            <li>Benutzerkonto ist deaktiviert.</li>
            <li>Mitgliedschaft in der Organisation ist nicht aktiv.</li>
            <li>Organisation ist voruebergehend gesperrt.</li>
          </ul>
        </div>

        <p className="text-sm leading-6 text-[var(--color-muted)]">
          Wenn Sie glauben, dass dies ein Fehler ist, kontaktieren Sie bitte die
          interne Administration von Bissinger Lights.
        </p>

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
