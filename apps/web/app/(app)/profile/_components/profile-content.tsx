const quickStats = [
  { label: "Rolle", value: "Projektleitung" },
  { label: "Organisation", value: "Bissinger Lights" },
  { label: "Letzter Login", value: "Heute, 08:14" },
];

const profileFields = [
  { label: "Vorname", value: "Max" },
  { label: "Nachname", value: "Mustermann" },
  { label: "E-Mail", value: "max.mustermann@bissinger-lights.de" },
  { label: "Telefon", value: "+49 711 555 12 40" },
  { label: "Abteilung", value: "Projektleitung" },
  { label: "Standort", value: "Stuttgart" },
];

const securityItems = [
  {
    title: "Microsoft 365 Anmeldung",
    text: "Die Anmeldung erfolgt über Ihr Unternehmenskonto bei Microsoft 365.",
    status: "Aktiv",
  },
  {
    title: "Sitzungsverwaltung",
    text: "Ihre letzte erfolgreiche Sitzung wurde heute um 08:14 Uhr gestartet.",
    status: "Gültig",
  },
  {
    title: "Kontostatus",
    text: "Benutzerkonto und Organisationsmitgliedschaft sind aktiv.",
    status: "Aktiv",
  },
];

const activityItems = [
  {
    title: "Profil aktualisiert",
    text: "Telefonnummer und Standort wurden zuletzt angepasst.",
    time: "Vor 2 Tagen",
  },
  {
    title: "Anmeldung erfolgreich",
    text: "Letzter Zugriff über Microsoft 365.",
    time: "Heute, 08:14",
  },
  {
    title: "Projektrolle erweitert",
    text: "Zugriff auf neue Projektbereiche freigeschaltet.",
    time: "11. Juli 2026",
  },
];

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-[2.05rem] font-semibold tracking-[-0.05em] text-zinc-950">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-[0.98rem] leading-7 text-zinc-500">
        {description}
      </p>
    </div>
  );
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-zinc-900 bg-zinc-900 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-white">
      {children}
    </span>
  );
}

export function ProfileContent() {
  return (
    <div className="h-full overflow-y-auto bg-[linear-gradient(180deg,#f4f4f5_0%,#fafafa_100%)] px-8 py-8">
      <div className="space-y-5">
        <section className="rounded-[2rem] border border-zinc-200 bg-white px-8 py-8 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-[1.75rem] border border-zinc-200 bg-zinc-50">
                <span className="text-3xl font-semibold tracking-[-0.05em] text-zinc-900">
                  MM
                </span>
              </div>

              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                  Profil
                </p>
                <h1 className="mt-3 text-[2.8rem] font-semibold tracking-[-0.06em] text-zinc-950">
                  Max Mustermann
                </h1>
                <p className="mt-3 max-w-2xl text-[1rem] leading-8 text-zinc-500">
                  Verwalten Sie hier Ihre persönlichen Kontodaten, Ihren
                  Organisationskontext und die wichtigsten
                  sicherheitsrelevanten Informationen.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-700 transition-colors duration-150 hover:bg-zinc-50"
              >
                Profil bearbeiten
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-full border border-transparent bg-zinc-950 px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-zinc-800"
              >
                Sicherheit prüfen
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {quickStats.map((item) => (
              <article
                key={item.label}
                className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-6 py-6"
              >
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                  {item.label}
                </p>
                <p className="mt-4 text-[1.25rem] font-semibold tracking-[-0.03em] text-zinc-950">
                  {item.value}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-[2rem] border border-zinc-200 bg-white px-8 py-8 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <SectionHeader
              eyebrow="Kontodaten"
              title="Persönliche Informationen"
              description="Diese Angaben werden für die interne Zuordnung, Benachrichtigungen und den Zugriff innerhalb von Bissinger OS verwendet."
            />

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {profileFields.map((field) => (
                <article
                  key={field.label}
                  className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-6 py-5"
                >
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                    {field.label}
                  </p>
                  <p className="mt-3 text-[1rem] font-semibold text-zinc-900">
                    {field.value}
                  </p>
                </article>
              ))}
            </div>
          </article>

          <div className="grid gap-5">
            <article className="rounded-[2rem] border border-zinc-200 bg-white px-8 py-8 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <SectionHeader
                eyebrow="Sicherheit"
                title="Anmeldung und Zugriff"
                description="Der Zugriff auf Bissinger OS wird über das Unternehmenskonto gesteuert und intern zusätzlich geprüft."
              />

              <div className="mt-8 space-y-4">
                {securityItems.map((item) => (
                  <article
                    key={item.title}
                    className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-6 py-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[1rem] font-semibold text-zinc-900">
                          {item.title}
                        </p>
                        <p className="mt-3 text-[0.96rem] leading-7 text-zinc-500">
                          {item.text}
                        </p>
                      </div>
                      <StatusBadge>{item.status}</StatusBadge>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="rounded-[2rem] border border-zinc-200 bg-white px-8 py-8 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <SectionHeader
                eyebrow="Organisation"
                title="Mitgliedschaft"
                description="Überblick über Ihren aktuellen Organisationskontext innerhalb von Bissinger OS."
              />

              <div className="mt-8 rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-6 py-5">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                  Aktueller Kontext
                </p>
                <p className="mt-3 text-[1.1rem] font-semibold text-zinc-900">
                  Bissinger Lights
                </p>
                <p className="mt-3 text-[0.96rem] leading-7 text-zinc-500">
                  Rolle: Projektleitung
                  <br />
                  Zugriff: Projekte, Kunden, Aufgaben und Dokumente
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="rounded-[2rem] border border-zinc-200 bg-white px-8 py-8 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
          <SectionHeader
            eyebrow="Aktivität"
            title="Letzte Kontobewegungen"
            description="Die wichtigsten konto- und zugriffsbezogenen Ereignisse im zeitlichen Verlauf."
          />

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {activityItems.map((item) => (
              <article
                key={item.title}
                className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-6 py-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[1rem] font-semibold text-zinc-900">
                      {item.title}
                    </p>
                    <p className="mt-3 text-[0.96rem] leading-7 text-zinc-500">
                      {item.text}
                    </p>
                  </div>
                  <span className="whitespace-nowrap text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                    {item.time}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
