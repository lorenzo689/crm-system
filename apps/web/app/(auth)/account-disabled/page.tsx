import Image from 'next/image';
import Link from 'next/link';

function BrandMark() {
  return (
    <Image src="/images/images.jpg" alt="Bissinger Lights" width={96} height={84} className="h-[84px] w-24 object-contain" priority />
  );
}

export default function AccountDisabledPage() {
  return (
    <main className="h-screen w-full overflow-hidden bg-[#f5f6f7]">
      <div className="grid h-screen w-full overflow-hidden p-3 md:p-4 lg:grid-cols-[1.02fr_1fr]">
        <section className="flex h-full min-h-0 flex-col justify-between rounded-[1.5rem] px-4 py-4 sm:px-8 sm:py-5">
          <BrandMark />

          <div className="mx-auto flex w-full max-w-[470px] flex-1 flex-col justify-center py-6">
            <div className="space-y-4 text-center">
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-[3.25rem]">
                Konto deaktiviert
              </h1>
              <p className="text-sm leading-7 text-slate-500 sm:text-base">
                Ihr Benutzerkonto oder Ihre Organisationszuordnung ist derzeit
                nicht aktiv. Bitte wenden Sie sich an Ihre Administration, um
                den Zugriff zu prüfen.
              </p>
            </div>

            <div className="mt-10 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
                <p className="text-sm font-medium text-slate-900">
                  Mögliche Ursachen
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-500">
                  <li>Ihr Benutzerkonto wurde vorübergehend deaktiviert.</li>
                  <li>Ihre Mitgliedschaft ist derzeit nicht aktiv.</li>
                  <li>Die zugehörige Organisation ist momentan gesperrt.</li>
                </ul>
              </div>

              <Link
                href="/login"
                style={{ color: '#fff' }}
                className="auth-status-action inline-flex h-12 w-full items-center justify-center rounded-lg text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9d6419]"
              >
                Zurück zum Login
              </Link>

              <p className="text-center text-sm leading-6 text-slate-500">
                Wenn Sie glauben, dass dies ein Fehler ist, wenden Sie sich
                bitte an den Administrator.
              </p>
            </div>
          </div>

          <div className="flex items-end justify-between pt-6 text-sm text-slate-400">
            <p>Copyright (c) 2026 Bissinger Lights</p>
            <p>Interner Zugriff</p>
          </div>
        </section>

        <aside className="relative hidden h-full min-h-0 overflow-hidden rounded-[1.6rem] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] lg:flex lg:flex-col lg:justify-between">
          <Image
            src="/images/background.jpg"
            alt="Bissinger Lights Projektansicht"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,24,0.66)_0%,rgba(8,12,24,0.52)_32%,rgba(8,12,24,0.6)_100%)]" />


          <div className="relative z-10 max-w-xl px-8 pt-8 xl:px-10 xl:pt-10">
            <h2 className="text-4xl font-semibold leading-tight tracking-[-0.05em] xl:text-[3.35rem]">
              IHR BUSINESS.
              <br />
              IHRE PROJEKTE.
              <br />
              ALLES IM BLICK.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-7 text-white/72 sm:text-base">
              Die zentrale Plattform für Kunden, Projekte, Angebote,
              Kommunikation und Aufgaben.
            </p>
          </div>

          <div className="relative z-10 flex-1" />
        </aside>
      </div>
    </main>
  );
}
