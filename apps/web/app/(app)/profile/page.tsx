import Link from 'next/link';

const quickStats = [
  { label: 'Rolle', value: 'Administrator' },
  { label: 'Organisation', value: 'Bissinger Lights' },
  { label: 'Letzter Login', value: 'Heute, 08:14' },
];

const profileFields = [
  { label: 'Vorname', value: 'Max' },
  { label: 'Nachname', value: 'Mustermann' },
  { label: 'E-Mail', value: 'max.mustermann@bissinger-lights.de' },
  { label: 'Telefon', value: '+49 711 555 12 40' },
  { label: 'Abteilung', value: 'Projektleitung' },
  { label: 'Standort', value: 'Stuttgart' },
];

const securityItems = [
  {
    title: 'Microsoft 365 Anmeldung',
    text: 'Die Anmeldung erfolgt ueber Ihr Unternehmenskonto bei Microsoft 365.',
    status: 'Aktiv',
  },
  {
    title: 'Sitzungsverwaltung',
    text: 'Ihre letzte erfolgreiche Sitzung wurde heute um 08:14 Uhr gestartet.',
    status: 'Gueltig',
  },
  {
    title: 'Kontostatus',
    text: 'Benutzerkonto und Organisationsmitgliedschaft sind aktiv.',
    status: 'Aktiv',
  },
];

const activityItems = [
  {
    title: 'Profil aktualisiert',
    text: 'Telefonnummer und Standort wurden zuletzt angepasst.',
    time: 'Vor 2 Tagen',
  },
  {
    title: 'Anmeldung erfolgreich',
    text: 'Letzter Zugriff ueber Microsoft 365.',
    time: 'Heute, 08:14',
  },
  {
    title: 'Projektrolle erweitert',
    text: 'Zugriff auf neue Projektbereiche freigeschaltet.',
    time: '11. Juli 2026',
  },
];

function Avatar() {
  return (
    <div className="grid h-24 w-24 place-items-center rounded-[1.8rem] bg-[linear-gradient(135deg,#2f46ff,#5d6bff)] text-3xl font-semibold text-white shadow-[0_18px_40px_rgba(47,70,255,0.24)]">
      MM
    </div>
  );
}

function SectionTitle({
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
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4254ff]">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
        {description}
      </p>
    </div>
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[rgba(67,84,255,0.1)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#4254ff]">
      {children}
    </span>
  );
}

export default function ProfilePage() {
  return (
    <section className="grid min-h-[calc(100vh-1.5rem)] grid-cols-1 gap-4 rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(245,248,252,0.96))] p-3 shadow-[0_25px_90px_rgba(38,51,77,0.12)] backdrop-blur lg:p-4">
      <header className="rounded-[1.6rem] bg-white p-5 shadow-[0_10px_35px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#4254ff]">
                Profil
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-4xl">
                Max Mustermann
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
                Verwalten Sie hier Ihre persoenlichen Kontodaten, Ihren
                Organisationskontext und die wichtigsten sicherheitsrelevanten
                Informationen.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Profil bearbeiten
            </button>
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-transparent bg-[linear-gradient(135deg,#2f46ff,#5748ff)] px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(67,84,255,0.22)] transition-colors duration-200 hover:border-[#4a4cff] hover:bg-white hover:bg-none hover:text-[#4a4cff]"
            >
              Zurueck zum Dashboard
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {quickStats.map((item) => (
            <article
              key={item.label}
              className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4"
            >
              <p className="text-sm font-medium text-slate-500">{item.label}</p>
              <p className="mt-3 text-xl font-semibold text-slate-900">
                {item.value}
              </p>
            </article>
          ))}
        </div>
      </header>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[1.6rem] bg-white p-5 shadow-[0_10px_35px_rgba(15,23,42,0.05)]">
          <SectionTitle
            eyebrow="Kontodaten"
            title="Persoenliche Informationen"
            description="Diese Angaben werden fuer die interne Zuordnung, Benachrichtigungen und den Zugriff innerhalb von Bissinger OS verwendet."
          />

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {profileFields.map((field) => (
              <article
                key={field.label}
                className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <p className="text-sm font-medium text-slate-500">{field.label}</p>
                <p className="mt-3 text-base font-semibold text-slate-900">
                  {field.value}
                </p>
              </article>
            ))}
          </div>
        </section>

        <div className="grid gap-4">
          <section className="rounded-[1.6rem] bg-[linear-gradient(180deg,#0f172a_0%,#172554_100%)] p-5 text-white shadow-[0_10px_35px_rgba(15,23,42,0.16)]">
            <SectionTitle
              eyebrow="Sicherheit"
              title="Anmeldung und Zugriff"
              description="Der Zugriff auf Bissinger OS wird ueber das Unternehmenskonto gesteuert und intern zusaetzlich geprueft."
            />

            <div className="mt-6 space-y-4">
              {securityItems.map((item) => (
                <article
                  key={item.title}
                  className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-white/72">
                        {item.text}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                      {item.status}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[1.6rem] bg-white p-5 shadow-[0_10px_35px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-4">
              <SectionTitle
                eyebrow="Organisation"
                title="Mitgliedschaft"
                description="Uebersicht ueber Ihren aktuellen Organisationskontext innerhalb von Bissinger OS."
              />
              <StatusPill>Aktiv</StatusPill>
            </div>

            <div className="mt-6 rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm font-medium text-slate-500">Organisation</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">
                Bissinger Lights
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Rolle: Administrator
                <br />
                Zugriff: Projekte, Kunden, Aufgaben und Organisation
              </p>
            </div>
          </section>
        </div>
      </div>

      <section className="rounded-[1.6rem] bg-white p-5 shadow-[0_10px_35px_rgba(15,23,42,0.05)]">
        <SectionTitle
          eyebrow="Aktivitaet"
          title="Letzte Kontobewegungen"
          description="Die wichtigsten konto- und zugriffsbezogenen Ereignisse im zeitlichen Verlauf."
        />

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {activityItems.map((item) => (
            <article
              key={item.title}
              className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-900">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {item.text}
                  </p>
                </div>
                <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {item.time}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
