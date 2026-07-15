import Link from 'next/link';

const navigationItems = [
  { label: 'Dashboard', active: true },
  { label: 'Projekte', active: false },
  { label: 'Kunden', active: false },
  { label: 'Aufgaben', active: false },
  { label: 'Kommunikation', active: false },
  { label: 'Organisation', active: false },
];

const metricCards = [
  {
    label: 'Aktive Projekte',
    value: '12',
    detail: '+2 seit letzter Woche',
  },
  {
    label: 'Offene Aufgaben',
    value: '37',
    detail: '9 mit hoher Prioritaet',
  },
  {
    label: 'Kundenkontakte',
    value: '184',
    detail: '14 neue Eintraege',
  },
  {
    label: 'Angebote in Arbeit',
    value: '8',
    detail: '3 zur Freigabe',
  },
];

const projectRows = [
  {
    name: 'Stadthalle Mannheim',
    stage: 'Umsetzung',
    owner: 'Max Mustermann',
    due: '22. Juli',
    status: 'On Track',
  },
  {
    name: 'Opernhaus Frankfurt',
    stage: 'Planung',
    owner: 'Anna Becker',
    due: '25. Juli',
    status: 'Pruefung',
  },
  {
    name: 'Congress Center Berlin',
    stage: 'Angebot',
    owner: 'Luca Weber',
    due: '29. Juli',
    status: 'Freigabe',
  },
];

const taskItems = [
  'Freigabe fuer Projektbudget abstimmen',
  'Rueckfrage zur Lichtsteuerung beantworten',
  'Angebotsunterlagen fuer Neuauftrag finalisieren',
  'Interne Abstimmung mit Vertrieb vorbereiten',
];

const timelineItems = [
  {
    title: 'Projektstatus aktualisiert',
    text: 'Stadthalle Mannheim wurde auf Umsetzung gesetzt.',
    time: 'Vor 18 Min.',
  },
  {
    title: 'Neuer Kontakt angelegt',
    text: 'Sabine Krauss wurde dem Kundenprofil hinzugefuegt.',
    time: 'Vor 42 Min.',
  },
  {
    title: 'Angebot freigegeben',
    text: 'Opernhaus Frankfurt steht zur finalen Uebermittlung bereit.',
    time: 'Heute, 09:12',
  },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[linear-gradient(135deg,#2f46ff,#5d6bff)] shadow-[0_10px_25px_rgba(47,70,255,0.22)]">
        <div className="grid h-5 w-5 grid-cols-2 gap-0.5">
          <span className="rounded-sm bg-white" />
          <span className="rounded-sm bg-white/80" />
          <span className="rounded-sm bg-white/80" />
          <span className="rounded-sm bg-white" />
        </div>
      </div>
      <div>
        <p className="text-base font-semibold text-slate-900">Bissinger OS</p>
        <p className="text-sm text-slate-500">Projektsteuerung</p>
      </div>
    </div>
  );
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[rgba(67,84,255,0.1)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4254ff]">
      {children}
    </span>
  );
}

export default function DashboardPage() {
  return (
    <section className="grid min-h-[calc(100vh-1.5rem)] grid-cols-1 gap-4 rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(245,248,252,0.96))] p-3 shadow-[0_25px_90px_rgba(38,51,77,0.12)] backdrop-blur lg:grid-cols-[280px_1fr] lg:p-4">
      <aside className="flex flex-col rounded-[1.6rem] bg-[linear-gradient(180deg,#ffffff_0%,#f7f9fc_100%)] p-5 shadow-[0_10px_35px_rgba(15,23,42,0.05)]">
        <BrandMark />

        <nav className="mt-10 space-y-2">
          {navigationItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                item.active
                  ? 'bg-[linear-gradient(135deg,#2f46ff,#5748ff)] text-white shadow-[0_12px_24px_rgba(67,84,255,0.22)]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span>{item.label}</span>
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  item.active ? 'bg-white' : 'bg-slate-300'
                }`}
              />
            </button>
          ))}
        </nav>

        <div className="mt-auto rounded-[1.5rem] bg-[linear-gradient(180deg,#0f172a_0%,#172554_100%)] p-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
            Heute
          </p>
          <p className="mt-3 text-3xl font-semibold">15</p>
          <p className="text-sm text-white/72">Juli 2026</p>
          <p className="mt-4 text-sm leading-6 text-white/72">
            3 Termine, 5 offene Freigaben und 2 wichtige Kundenrueckfragen.
          </p>
        </div>
      </aside>

      <div className="grid min-h-0 grid-cols-1 gap-4">
        <header className="flex flex-col gap-4 rounded-[1.6rem] bg-white p-5 shadow-[0_10px_35px_rgba(15,23,42,0.05)] xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#4254ff]">
              Dashboard
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-4xl">
              Willkommen zurück, Max.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
              Hier sehen Sie die wichtigsten Projekt-, Kunden- und
              Aufgabeninformationen auf einen Blick.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Organisation: <span className="font-semibold text-slate-900">Bissinger Lights</span>
            </div>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-transparent bg-[linear-gradient(135deg,#2f46ff,#5748ff)] px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(67,84,255,0.22)] transition-colors duration-200 hover:border-[#4a4cff] hover:bg-white hover:bg-none hover:text-[#4a4cff]"
            >
              Zur Auth-Strecke
            </Link>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => (
            <article
              key={card.label}
              className="rounded-[1.6rem] bg-white p-5 shadow-[0_10px_35px_rgba(15,23,42,0.05)]"
            >
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <p className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-900">
                {card.value}
              </p>
              <p className="mt-3 text-sm text-slate-500">{card.detail}</p>
            </article>
          ))}
        </div>

        <div className="grid min-h-0 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[1.6rem] bg-white p-5 shadow-[0_10px_35px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4254ff]">
                  Projekte
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">
                  Laufende Projekte
                </h2>
              </div>
              <StatusBadge>Live</StatusBadge>
            </div>

            <div className="mt-6 overflow-hidden rounded-[1.4rem] border border-slate-200">
              <div className="grid grid-cols-[1.6fr_1fr_1fr_0.8fr_0.8fr] bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <span>Projekt</span>
                <span>Phase</span>
                <span>Verantwortlich</span>
                <span>Faellig</span>
                <span>Status</span>
              </div>

              <div className="divide-y divide-slate-200">
                {projectRows.map((row) => (
                  <div
                    key={row.name}
                    className="grid grid-cols-[1.6fr_1fr_1fr_0.8fr_0.8fr] items-center px-4 py-4 text-sm text-slate-600"
                  >
                    <span className="font-medium text-slate-900">{row.name}</span>
                    <span>{row.stage}</span>
                    <span>{row.owner}</span>
                    <span>{row.due}</span>
                    <span className="font-medium text-[#4254ff]">{row.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="grid gap-4">
            <section className="rounded-[1.6rem] bg-[linear-gradient(180deg,#0f172a_0%,#1e3a8a_100%)] p-5 text-white shadow-[0_10px_35px_rgba(15,23,42,0.16)]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/60">
                Fokus
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                Prioritaeten heute
              </h2>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-white/78">
                {taskItems.map((task) => (
                  <li
                    key={task}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    {task}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-[1.6rem] bg-white p-5 shadow-[0_10px_35px_rgba(15,23,42,0.05)]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4254ff]">
                Aktivitaet
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">
                Letzte Aenderungen
              </h2>

              <div className="mt-6 space-y-4">
                {timelineItems.map((item) => (
                  <article
                    key={item.title}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
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
          </div>
        </div>
      </div>
    </section>
  );
}
