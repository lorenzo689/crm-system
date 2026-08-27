"use client";

export type AppearanceSettings = {
  theme: "LIGHT" | "DARK" | "SYSTEM";
  density: "COMPACT" | "COMFORTABLE";
};

type Props = {
  settings: AppearanceSettings;
  onUpdate: (patch: Partial<AppearanceSettings>) => Promise<void>;
};

const themes = [
  { value: "LIGHT", label: "Hell", description: "Klare, helle Oberfläche" },
  { value: "DARK", label: "Dunkel", description: "Reduzierte Helligkeit" },
  {
    value: "SYSTEM",
    label: "System",
    description: "Geräteeinstellung übernehmen",
  },
] as const;

export function AppearanceSection({ settings, onUpdate }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Darstellung</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Passe das Erscheinungsbild deines Arbeitsbereichs an.
        </p>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-zinc-700">Farbschema</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {themes.map((theme) => (
            <button
              key={theme.value}
              type="button"
              onClick={() => onUpdate({ theme: theme.value })}
              className={`rounded-xl border p-4 text-left transition ${
                settings.theme === theme.value
                  ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                  : "border-zinc-200 bg-white hover:border-zinc-300"
              }`}
            >
              <span className="block text-sm font-medium text-zinc-900">
                {theme.label}
              </span>
              <span className="mt-1 block text-xs text-zinc-500">
                {theme.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-zinc-700">
          Informationsdichte
        </p>
        <div className="flex flex-wrap gap-2">
          {(["COMFORTABLE", "COMPACT"] as const).map((density) => (
            <button
              key={density}
              type="button"
              onClick={() => onUpdate({ density })}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                settings.density === density
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {density === "COMFORTABLE" ? "Komfortabel" : "Kompakt"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
