import Image from 'next/image';

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: AuthShellProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(203,151,73,0.28),_transparent_30%),linear-gradient(135deg,_#18130f_0%,_#211a15_45%,_#f4eee3_45%,_#f4eee3_100%)] text-[var(--color-ink)]">
      <div className="mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[1.15fr_0.85fr]">
        <section className="flex flex-col justify-between px-6 py-10 text-[var(--color-paper)] sm:px-10 lg:px-14 lg:py-14">
          <div className="space-y-10">
            <Image src="/images/images.jpg" alt="Bissinger Lights" width={112} height={98} className="h-[98px] w-28 object-contain" priority />

            <div className="max-w-xl space-y-6">
              <h1 className="max-w-md text-4xl font-semibold uppercase tracking-[0.08em] sm:text-5xl lg:text-6xl">
                Ihr Business.
                <br />
                Ihre Projekte.
                <br />
                Alles im Blick.
              </h1>
              <p className="max-w-lg text-base leading-7 text-[color:rgba(244,238,227,0.78)] sm:text-lg">
                Die zentrale Plattform für Kunden, Projekte, Angebote,
                Kommunikation und Aufgaben.
              </p>
            </div>
          </div>

        </section>

        <section className="flex items-center px-6 py-10 sm:px-10 lg:px-14 lg:py-14">
          <div className="w-full rounded-[2rem] border border-[color:rgba(30,23,18,0.08)] bg-[color:rgba(255,252,247,0.82)] p-8 shadow-[0_28px_80px_rgba(24,19,15,0.18)] backdrop-blur md:p-10">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-copper)]">
                {eyebrow}
              </p>
              <h2 className="text-3xl font-semibold text-[var(--color-ink)]">
                {title}
              </h2>
              <p className="max-w-md text-sm leading-6 text-[var(--color-muted)] sm:text-base">
                {description}
              </p>
            </div>

            <div className="mt-10">{children}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
