import Image from "next/image";

import { attentionProjects, kpiItems, tasks } from "../../_components/app-data";

export function DashboardContent() {
  return (
    <div className="flex-1 overflow-auto bg-[linear-gradient(180deg,#f4f4f5_0%,#fafafa_100%)] px-8 py-8">
      <div className="space-y-5">
        <section className="grid min-h-[448px] overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.06)] xl:grid-cols-[1.08fr_0.92fr]">
          <div className="flex flex-col justify-between px-10 py-10">
            <div className="max-w-[560px]">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                Dashboard
              </p>
              <h2 className="mt-6 text-[3.35rem] font-semibold leading-[1.02] tracking-[-0.07em] text-zinc-950">
                Guten Morgen, Benjamin.
              </h2>
              <p className="mt-5 max-w-xl text-[1.05rem] leading-8 text-zinc-500">
                Kurzüberblick über deine Projekte, Freigaben und anstehenden
                Aufgaben.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <article className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-6 py-6">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                  Heute im Fokus
                </p>
                <p className="mt-4 max-w-[18ch] text-[1.12rem] font-semibold leading-8 tracking-[-0.03em] text-zinc-900">
                  Zwei Freigaben und ein Kundenfeedback benötigen direkte
                  Rückmeldung.
                </p>
              </article>

              <article className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-6 py-6">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                  Nächster Termin
                </p>
                <p className="mt-4 max-w-[19ch] text-[1.12rem] font-semibold leading-8 tracking-[-0.03em] text-zinc-900">
                  11:30 Projektabstimmung mit Atelier Moser
                </p>
              </article>
            </div>
          </div>

          <div className="relative h-full min-h-[320px] overflow-hidden border-l border-zinc-200">
            <Image
              src="/images/background.jpg"
              alt="Dashboard Hintergrund"
              fill
              priority
              className="object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,17,17,0.2)_0%,rgba(17,17,17,0.44)_52%,rgba(17,17,17,0.72)_100%)]" />

            <div className="absolute inset-x-8 bottom-8">
              <div className="max-w-[360px] rounded-[1.5rem] border border-white/10 bg-[rgba(24,24,27,0.58)] px-6 py-6 shadow-[0_18px_40px_rgba(0,0,0,0.2)] backdrop-blur-md">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-300">
                  Tagesstatus
                </p>
                <p className="mt-4 text-[1.9rem] font-semibold leading-10 tracking-[-0.05em] text-white">
                  Drei Projekte laufen planmäßig.
                </p>
                <p className="mt-4 max-w-[28ch] text-[0.98rem] leading-7 text-white/72">
                  Ein ruhiger Überblick mit Fokus auf Freigaben, Aufgaben und
                  offene Kundenthemen.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-4">
          {kpiItems.map((item) => (
            <article
              key={item.label}
              className="rounded-[1.5rem] border border-zinc-200 bg-white px-6 py-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)]"
            >
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                {item.label}
              </p>
              <p className="mt-4 text-[2.35rem] font-semibold tracking-[-0.07em] text-zinc-950">
                {item.value}
              </p>
              <p className="mt-3 text-[0.98rem] leading-7 text-zinc-500">
                {item.detail}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.55fr_0.8fr]">
          <article className="rounded-[2rem] border border-zinc-200 bg-white px-8 py-8 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                  Meine Aufgaben
                </p>
                <h3 className="mt-3 text-[2.05rem] font-semibold tracking-[-0.05em] text-zinc-950">
                  Fokus für heute
                </h3>
              </div>
              <p className="pb-1 text-sm text-zinc-400">5 Einträge</p>
            </div>

            <div className="mt-8 overflow-hidden rounded-[1.5rem] border border-zinc-200">
              <table className="min-w-full border-separate border-spacing-0">
                <thead className="bg-[rgba(255,252,247,0.72)]">
                  <tr>
                    {["Titel", "Projekt", "Priorität", "Fällig", "Status"].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="border-b border-zinc-200 px-4 py-4 text-left text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.title} className="bg-white/55">
                      <td className="border-b border-zinc-200 px-4 py-5 text-[0.98rem] font-medium leading-7 text-zinc-900">
                        {task.title}
                      </td>
                      <td className="border-b border-zinc-200 px-4 py-5 text-[0.95rem] leading-7 text-zinc-500">
                        {task.project}
                      </td>
                      <td className="border-b border-zinc-200 px-4 py-5">
                        <span className="inline-flex rounded-full border border-zinc-900 bg-zinc-900 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-white">
                          {task.priority}
                        </span>
                      </td>
                      <td className="border-b border-zinc-200 px-4 py-5 text-[0.95rem] leading-7 text-zinc-700">
                        {task.due}
                      </td>
                      <td className="border-b border-zinc-200 px-4 py-5 text-[0.95rem] font-medium leading-7 text-zinc-700">
                        {task.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-[2rem] border border-zinc-200 bg-white px-8 py-8 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                Projekte mit Handlungsbedarf
              </p>
              <h3 className="mt-3 text-[2.05rem] font-semibold tracking-[-0.05em] text-zinc-950">
                Priorisierte Abstimmungen
              </h3>
            </div>

            <div className="mt-7 space-y-4">
              {attentionProjects.map((project) => (
                <article
                  key={project.title}
                  className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-6 py-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-zinc-900">
                        {project.title}
                      </h4>
                      <p className="mt-1 text-[0.95rem] text-zinc-500">
                        {project.client}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full border border-zinc-200 bg-white px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                      {project.due}
                    </span>
                  </div>

                  <p className="mt-4 text-[0.96rem] leading-7 text-zinc-500">
                    {project.detail}
                  </p>
                  <p className="mt-4 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                    Verantwortlich: {project.owner}
                  </p>
                </article>
              ))}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
