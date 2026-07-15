export default function DashboardPage() {
  return (
    <section className="flex w-full items-center justify-center">
      <div className="w-full max-w-3xl rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-paper)] p-10 shadow-[0_20px_60px_rgba(31,27,22,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-copper)]">
          Dashboard
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-[var(--color-ink)]">
          App-Bereich als Platzhalter
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--color-muted)]">
          Diese Ansicht dient nur dazu, die Struktur fuer den kuenftigen
          geschuetzten Bereich von Bissinger OS vorzubereiten.
        </p>
      </div>
    </section>
  );
}
