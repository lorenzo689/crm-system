import Image from 'next/image';
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

            <div className="mx-auto flex w-full max-w-[470px] flex-1 flex-col justify-center py-6">
              <div className="space-y-3 text-center">
                <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-[3.25rem]">
                  Willkommen zurück
                </h1>
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
                    placeholder="name@bissinger-lights.de"
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
                      placeholder="Passwort eingeben"
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

                <button
                  type="button"
                  className="inline-flex h-13 w-full items-center justify-center rounded-2xl border border-transparent bg-[linear-gradient(135deg,#2f46ff,#5748ff)] text-base font-semibold text-white shadow-[0_16px_32px_rgba(67,84,255,0.28)] transition-colors duration-200 hover:border-[#4a4cff] hover:bg-white hover:bg-none hover:text-[#4a4cff] hover:shadow-[0_16px_32px_rgba(67,84,255,0.18)]"
                >
                  Mit Microsoft anmelden
                </button>

                <p className="text-center text-sm leading-6 text-slate-500">
                  Noch kein Zugang? Bitte an den Administrator wenden.
                </p>
              </form>
            </div>

            <div className="flex items-end justify-between pt-6 text-sm text-slate-400">
              <p>Copyright © 2026 Bissinger Lights</p>
              <p>Interner Zugriff</p>
            </div>
          </section>

          <aside className="relative hidden h-full min-h-0 overflow-hidden rounded-[1.6rem] bg-[linear-gradient(180deg,#413bff_0%,#3a33e7_50%,#3027d9_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] lg:flex lg:flex-col lg:justify-between">
            <Image
              src="/images/background.jpg"
              alt="Bissinger Lights Projektansicht"
              fill
              priority
              className="object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,24,0.66)_0%,rgba(8,12,24,0.52)_32%,rgba(8,12,24,0.6)_100%)]" />
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-[-8%] top-[-10%] h-72 w-72 rounded-full border border-white/10 bg-white/5" />
              <div className="absolute right-[-12%] top-[8%] h-96 w-96 rounded-full border border-white/8 bg-white/5" />
              <div className="absolute bottom-[-18%] left-[18%] h-72 w-72 rounded-full border border-white/10 bg-white/5" />
            </div>

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
