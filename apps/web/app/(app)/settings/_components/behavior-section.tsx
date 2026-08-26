"use client";

export type BehaviorSettings = {
  defaultTaskView: "LIST" | "KANBAN";
  showCompletedTasks: boolean;
  calendarDefaultView: "AGENDA" | "MONTH" | "WEEK";
};

type Props = {
  settings: BehaviorSettings;
  onUpdate: (patch: Partial<BehaviorSettings>) => Promise<void>;
};

export function BehaviorSection({ settings, onUpdate }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Verhalten</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Lege fest, wie Listen und Ansichten sich standardmäßig verhalten.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-700">
          Standardansicht Aufgaben
        </label>
        <div className="flex gap-2">
          {(["LIST", "KANBAN"] as const).map((view) => (
            <button
              key={view}
              type="button"
              disabled={view === "KANBAN"}
              onClick={() =>
                view !== "KANBAN" && onUpdate({ defaultTaskView: view })
              }
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                view === "KANBAN"
                  ? "cursor-not-allowed border-zinc-200 text-zinc-300"
                  : settings.defaultTaskView === view
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {view === "LIST" ? "Liste" : "Kanban · Bald verfügbar"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <div>
          <p className="text-sm font-medium text-zinc-900">
            Erledigte Aufgaben anzeigen
          </p>
          <p className="text-xs text-zinc-500">
            In der Aufgabenliste standardmäßig mit anzeigen.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            onUpdate({ showCompletedTasks: !settings.showCompletedTasks })
          }
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${
            settings.showCompletedTasks ? "bg-amber-500" : "bg-zinc-200"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
              settings.showCompletedTasks ? "left-5" : "left-0.5"
            }`}
          />
        </button>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-700">
          Standardansicht Kalender
        </label>
        <select
          value={settings.calendarDefaultView}
          onChange={(event) =>
            onUpdate({
              calendarDefaultView: event.target
                .value as BehaviorSettings["calendarDefaultView"],
            })
          }
          className="w-full max-w-xs rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
        >
          <option value="AGENDA">Agenda</option>
          <option value="MONTH">Monat</option>
        </select>
      </div>
    </div>
  );
}
