function PeopleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-11 w-11 text-amber-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
      <path d="M16.5 10a2.5 2.5 0 1 0 0-5" />
      <path d="M3.5 18.5c0-2.8 2.7-4.5 5.8-4.5s5.7 1.7 5.7 4.5" />
      <path d="M15 14.7c2.3.2 4.5 1.5 4.5 3.8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-11 w-11 text-amber-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="3.5" width="12" height="17" rx="2.5" />
      <path d="m8 11.5 2.2 2.2 4.8-5" />
      <path d="M16 18h2a2 2 0 0 0 2-2V8" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-11 w-11 text-amber-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 20V9" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20V7" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 text-zinc-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 text-zinc-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
      <path d="M12 15v2" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.9-5.4 3.9-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3 .8 3.7 1.4l2.5-2.4C16.6 3.5 14.5 2.6 12 2.6A9.4 9.4 0 0 0 2.6 12 9.4 9.4 0 0 0 12 21.4c5.4 0 8.9-3.8 8.9-9.1 0-.6-.1-1.2-.2-1.6H12Z"
      />
      <path
        fill="#34A853"
        d="M2.6 12c0 1.5.4 3 1.2 4.2l3-2.3a5.8 5.8 0 0 1 0-3.8l-3-2.3A9.4 9.4 0 0 0 2.6 12Z"
      />
      <path
        fill="#FBBC05"
        d="M12 21.4c2.5 0 4.7-.8 6.2-2.3l-3-2.4c-.8.5-1.8.9-3.2.9-2.5 0-4.6-1.7-5.3-4l-3 2.3a9.4 9.4 0 0 0 8.3 5.5Z"
      />
      <path
        fill="#4285F4"
        d="M20.9 12.3c0-.6-.1-1.2-.2-1.7H12v3.9h5.4a4.6 4.6 0 0 1-2.2 3.1l3 2.4c1.8-1.7 2.7-4.2 2.7-7.7Z"
      />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <div className="grid min-h-screen lg:grid-cols-[1.12fr_1fr]">
        <section className="relative hidden overflow-hidden lg:flex">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,10,16,0.48),rgba(7,10,16,0.75)),radial-gradient(circle_at_18%_82%,rgba(234,179,8,0.14),transparent_24%),linear-gradient(115deg,#111723_0%,#070b11_42%,#16110d_72%,#090a0d_100%)]" />
          <div className="absolute inset-y-0 right-[12%] w-[44%] skew-x-[-22deg] bg-[linear-gradient(180deg,rgba(36,30,24,0.9),rgba(15,12,10,0.98))] shadow-[-80px_0_160px_rgba(0,0,0,0.45)]" />
          <div className="absolute inset-y-0 right-[6%] w-[20%] bg-[linear-gradient(180deg,rgba(34,29,25,0.24),rgba(22,19,17,0.9))]" />
          <div className="absolute inset-x-0 bottom-0 h-[34%] bg-[linear-gradient(180deg,transparent_0%,rgba(4,6,10,0.8)_58%,rgba(4,6,10,0.98)_100%)]" />
          <div className="absolute bottom-0 left-[4%] right-[18%] h-[26%] [background:repeating-linear-gradient(90deg,rgba(18,18,18,0.65)_0_2px,transparent_2px_120px),linear-gradient(180deg,rgba(13,14,18,0)_0%,rgba(13,14,18,0.2)_12%,rgba(7,8,10,0.86)_100%)]" />

          <div className="absolute bottom-[7.5%] left-[7%] h-[24%] w-[25%]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(14,16,18,0)_0%,rgba(14,16,18,0.1)_38%,rgba(6,7,8,0.7)_76%,rgba(6,7,8,0.95)_100%)]" />
            <div className="absolute left-[10%] top-[15%] h-[76%] w-px bg-zinc-700/40" />
            <div className="absolute left-[26%] top-[12%] h-[80%] w-px bg-zinc-700/25" />
            <div className="absolute left-[0] bottom-[38%] h-[40%] w-[16%] rounded-t-full border border-zinc-700/35 border-b-0" />
            <div className="absolute left-[12%] bottom-[41%] h-[44%] w-[20%] rounded-t-full border border-zinc-700/30 border-b-0" />
            <div className="absolute left-[2%] bottom-[18%] h-[18%] w-[26%] rounded-full bg-zinc-950/95 shadow-[0_0_0_1px_rgba(82,82,91,0.15)]" />
          </div>

          {[
            "left-[8%]",
            "left-[18%]",
            "left-[28%]",
            "left-[38%]",
            "left-[48%]",
            "left-[58%]",
            "left-[68%]",
            "left-[78%]",
          ].map((left, index) => (
            <div
              key={left}
              className={`absolute bottom-[6.5%] ${left} h-[18px] w-[18px] rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.95),0_0_28px_rgba(251,191,36,0.7)]`}
              style={{ opacity: 0.7 + index * 0.03 }}
            />
          ))}

          {[
            "right-[34%]",
            "right-[31%]",
            "right-[28%]",
            "right-[25%]",
            "right-[22%]",
            "right-[19%]",
            "right-[16%]",
            "right-[13%]",
            "right-[10%]",
          ].map((right, index) => (
            <div
              key={right}
              className={`absolute bottom-[12%] ${right} h-[43%] w-[3px] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(254,215,170,0.06)_20%,rgba(251,191,36,0.85)_100%)] blur-[0.3px]`}
              style={{ opacity: 0.45 + index * 0.04 }}
            />
          ))}

          <div className="relative z-10 flex min-h-screen w-full flex-col justify-between px-12 py-10 xl:px-14 xl:py-12">
            <div>
              <div className="inline-flex flex-col text-white">
                <div className="flex items-start gap-2">
                  <span className="text-[4.1rem] font-light leading-none tracking-[-0.06em]">
                    BISSINGER
                  </span>
                  <span className="mt-1 text-4xl leading-none text-amber-400">
                    ✦
                  </span>
                </div>
                <span className="mt-1 pl-[2px] text-[1.45rem] font-light tracking-[0.85em] text-white/92">
                  LIGHTS
                </span>
              </div>
            </div>

            <div className="max-w-[30rem] pb-8">
              <p className="text-[1.05rem] font-semibold tracking-[0.34em] text-amber-400 uppercase">
                Bissinger OS
              </p>
              <h1 className="mt-6 text-[4.55rem] font-semibold leading-[0.95] tracking-[-0.05em] text-white">
                IHR BUSINESS.
                <br />
                IHRE PROJEKTE.
                <br />
                <span className="text-amber-400">ALLES IM BLICK.</span>
              </h1>
              <p className="mt-9 max-w-[34rem] text-[1.05rem] leading-9 text-white/86">
                Bissinger OS ist Ihre zentrale Plattform fuer Kunden,
                Projekte, Angebote, Kommunikation und Aufgaben. Durchdacht.
                Strukturiert. Auf den Punkt.
              </p>
            </div>

            <div className="grid max-w-[42rem] grid-cols-3 gap-8 pb-8">
              <div>
                <PeopleIcon />
                <h2 className="mt-4 text-[1.2rem] font-semibold text-white">
                  Kunden &amp; Projekte
                </h2>
                <p className="mt-2 text-base leading-8 text-white/78">
                  Alle Informationen an einem Ort.
                </p>
              </div>
              <div>
                <CheckIcon />
                <h2 className="mt-4 text-[1.2rem] font-semibold text-white">
                  Effiziente Ablaeufe
                </h2>
                <p className="mt-2 text-base leading-8 text-white/78">
                  Aufgaben, Termine und Prozesse im Griff.
                </p>
              </div>
              <div>
                <ChartIcon />
                <h2 className="mt-4 text-[1.2rem] font-semibold text-white">
                  Klare Uebersicht
                </h2>
                <p className="mt-2 text-base leading-8 text-white/78">
                  Kennzahlen, Historie und Fortschritt jederzeit.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(0,0,0,0.05),transparent_32%),linear-gradient(180deg,#ffffff_0%,#faf8f5_100%)] px-5 py-8 sm:px-8 lg:px-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,0,0,0.04),transparent_28%)]" />
          <div className="relative w-full max-w-[41rem] rounded-[2rem] border border-white/80 bg-white/92 px-7 py-8 shadow-[0_18px_70px_rgba(17,24,39,0.1)] sm:px-10 sm:py-10 lg:px-12 lg:py-12">
            <p className="text-sm font-semibold tracking-[0.26em] text-amber-500 uppercase">
              Willkommen zurueck
            </p>
            <h2 className="mt-6 text-[2.6rem] font-semibold leading-tight tracking-[-0.04em] text-zinc-950">
              Anmelden bei Bissinger OS
            </h2>
            <p className="mt-5 max-w-[30rem] text-[1.05rem] leading-9 text-zinc-500">
              Melden Sie sich an, um auf Ihre Projekte, Aufgaben und alle
              Unternehmensdaten zuzugreifen.
            </p>

            <form className="mt-12 space-y-8">
              <label className="block">
                <span className="mb-4 block text-[1.05rem] font-semibold text-zinc-900">
                  E-Mail-Adresse
                </span>
                <div className="flex h-14 items-center rounded-2xl border border-zinc-200 bg-white px-5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] transition focus-within:border-amber-400 focus-within:ring-4 focus-within:ring-amber-100">
                  <input
                    type="email"
                    placeholder="name@bissinger-lights.de"
                    className="h-full flex-1 bg-transparent text-lg text-zinc-900 outline-none placeholder:text-zinc-400"
                  />
                  <MailIcon />
                </div>
              </label>

              <label className="block">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <span className="text-[1.05rem] font-semibold text-zinc-900">
                    Passwort
                  </span>
                  <a
                    href="#"
                    className="text-[1.05rem] font-medium text-amber-500 transition hover:text-amber-600"
                  >
                    Passwort vergessen?
                  </a>
                </div>
                <div className="flex h-14 items-center rounded-2xl border border-zinc-200 bg-white px-5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] transition focus-within:border-amber-400 focus-within:ring-4 focus-within:ring-amber-100">
                  <input
                    type="password"
                    placeholder="••••••••••"
                    className="h-full flex-1 bg-transparent text-lg text-zinc-900 outline-none placeholder:text-zinc-500"
                  />
                  <LockIcon />
                </div>
              </label>

              <label className="flex items-center gap-3 text-lg text-zinc-600">
                <input
                  type="checkbox"
                  defaultChecked
                  className="h-5 w-5 rounded border-zinc-300 bg-white text-amber-400 focus:ring-amber-300"
                />
                Angemeldet bleiben
              </label>

              <button
                type="submit"
                className="h-14 w-full rounded-2xl bg-[linear-gradient(180deg,#f4be47_0%,#e5a92f_100%)] text-[1.15rem] font-semibold text-zinc-950 shadow-[0_10px_30px_rgba(234,179,8,0.24)] transition hover:brightness-[1.02]"
              >
                Anmelden
              </button>
            </form>

            <div className="my-7 flex items-center gap-5">
              <div className="h-px flex-1 bg-zinc-200" />
              <span className="text-sm font-semibold tracking-[0.36em] text-zinc-400 uppercase">
                Oder
              </span>
              <div className="h-px flex-1 bg-zinc-200" />
            </div>

            <button
              type="button"
              className="flex h-14 w-full items-center justify-center gap-4 rounded-2xl border border-zinc-200 bg-white text-[1.05rem] font-medium text-zinc-900 transition hover:bg-zinc-50"
            >
              <GoogleMark />
              Mit Google anmelden (SSO)
            </button>

            <p className="mt-10 text-[1.05rem] text-zinc-600">
              Noch kein Zugang?{" "}
              <a href="#" className="font-medium text-amber-500 hover:text-amber-600">
                Administrator kontaktieren
              </a>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
