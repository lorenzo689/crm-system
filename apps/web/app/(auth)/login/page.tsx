import Image from 'next/image';
import Link from 'next/link';

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[linear-gradient(135deg,#2f46ff,#5d6bff)] shadow-[0_10px_25px_rgba(47,70,255,0.28)]">
        <div className="grid h-5 w-5 grid-cols-2 gap-0.5">
          <span className="rounded-sm bg-white" />
          <span className="rounded-sm bg-white/80" />
          <span className="rounded-sm bg-white/80" />
          <span className="rounded-sm bg-white" />
        </div>
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-900">Bissinger OS</p>
        <p className="text-sm text-slate-500">Interner Zugriff</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="h-screen w-full overflow-hidden bg-[linear-gradient(180deg,#edf1f7_0%,#dfe6f2_100%)]">
      <div className="grid h-screen w-full overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(246,248,252,0.92))] p-3 md:p-4 lg:grid-cols-[1.02fr_1fr]">
          <section className="flex h-full min-h-0 flex-col justify-between rounded-[1.5rem] px-4 py-4 sm:px-8 sm:py-5">
            <BrandMark />

            <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center py-6">
              <div className="space-y-3 text-center">
                <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-[3.25rem]">
                  Willkommen zurück
                </h1>
                <p className="text-sm leading-7 text-slate-500 sm:text-base">
                  Anmelden bei Bissinger OS. Melden Sie sich mit Ihrem
                  Bissinger-Lights-Konto an, um auf Ihre Projekte und
                  Unternehmensdaten zuzugreifen.
                </p>
              </div>

              <form className="mt-10 space-y-5">
                <div className="space-y-1.5 text-left">
                  <label
                    htmlFor="email"
                    className="text-sm font-medium text-slate-700"
                  >
                    E-Mail
                  </label>
                  <input
                    id="email"
                    type="email"
                    defaultValue="name@bissinger-lights.de"
                    className="h-13 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 shadow-[0_4px_12px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 focus:border-[#4254ff] focus:ring-4 focus:ring-[#4254ff]/10"
                  />
                </div>

                <div className="space-y-1.5 text-left">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-slate-700"
                  >
                    Passwort
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type="password"
                      defaultValue="bissinger-os"
                      className="h-13 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-12 text-base text-slate-900 shadow-[0_4px_12px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 focus:border-[#4254ff] focus:ring-4 focus:ring-[#4254ff]/10"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-slate-400">
                      <svg
                        aria-hidden="true"
                        className="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="3" />
                        <path d="m3 3 18 18" />
                      </svg>
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 text-sm">
                  <label className="flex items-center gap-2 text-slate-500">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-[#4254ff] focus:ring-[#4254ff]"
                    />
                    Angemeldet bleiben
                  </label>
                  <Link
                    href="/account-disabled"
                    className="font-medium text-[#4254ff] transition hover:text-[#2f46ff]"
                  >
                    Zugang prüfen
                  </Link>
                </div>

                <button
                  type="button"
                  className="inline-flex h-13 w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#2f46ff,#5748ff)] text-base font-semibold text-white shadow-[0_16px_32px_rgba(67,84,255,0.28)] transition hover:translate-y-[-1px] hover:shadow-[0_20px_38px_rgba(67,84,255,0.35)]"
                >
                  Mit Microsoft anmelden
                </button>
              </form>

              <div className="mt-6 flex items-center gap-4 text-sm text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                <span>Interner Zugriff</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Link
                  href="/auth/callback"
                  className="inline-flex h-13 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Auth Callback
                </Link>
                <Link
                  href="/access-denied"
                  className="inline-flex h-13 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Access denied
                </Link>
              </div>

              <p className="mt-6 text-center text-sm text-slate-500">
                Kein Zugang?{' '}
                <span className="font-semibold text-[#4254ff]">
                  Administrator kontaktieren.
                </span>
              </p>
            </div>

            <div className="flex flex-col gap-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <p>Copyright © 2026 Bissinger Lights</p>
              <Link href="/" className="transition hover:text-slate-600">
                Plattforminfo
              </Link>
            </div>
          </section>

          <aside className="relative hidden h-full min-h-0 overflow-hidden rounded-[1.6rem] bg-[linear-gradient(180deg,#413bff_0%,#3a33e7_50%,#3027d9_100%)] p-8 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] lg:flex lg:flex-col lg:justify-between xl:p-10">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-[-8%] top-[-10%] h-72 w-72 rounded-full border border-white/10 bg-white/5" />
              <div className="absolute right-[-12%] top-[8%] h-96 w-96 rounded-full border border-white/8 bg-white/5" />
              <div className="absolute bottom-[-18%] left-[18%] h-72 w-72 rounded-full border border-white/10 bg-white/5" />
              <div className="absolute inset-x-0 top-[24%] h-px bg-white/8" />
              <div className="absolute bottom-[46%] left-0 right-0 h-px bg-white/8" />
              <div className="absolute bottom-0 top-0 left-[48%] w-px bg-white/8" />
            </div>

            <div className="relative z-10 max-w-xl pt-4">
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

            <div className="relative z-10 mt-8">
              <div className="relative mx-auto max-w-[720px] rounded-[2rem] border border-white/10 bg-white/95 p-3 shadow-[0_28px_60px_rgba(15,23,42,0.24)]">
                <Image
                  src="/images/background.jpg"
                  alt="Bissinger Lights Projektansicht"
                  width={1400}
                  height={960}
                  priority
                  className="h-[340px] w-full rounded-[1.35rem] object-cover xl:h-[390px]"
                />

                <div className="absolute left-5 top-5 rounded-2xl bg-[#4b42ff] px-4 py-3 text-white shadow-[0_12px_24px_rgba(75,66,255,0.28)]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/72">
                    Projektstatus
                  </p>
                  <p className="mt-2 text-2xl font-semibold">Aktiv</p>
                </div>

                <div className="absolute bottom-5 right-5 rounded-2xl bg-white px-4 py-3 text-slate-900 shadow-[0_16px_32px_rgba(15,23,42,0.14)]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                    Organisation
                  </p>
                  <p className="mt-2 text-lg font-semibold">Bissinger Lights</p>
                </div>
              </div>
            </div>
          </aside>
      </div>
    </main>
  );
}
