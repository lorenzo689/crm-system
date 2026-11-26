"use client";

export type NotificationSettings = {
  notificationsEnabled: boolean;
  calendarReminders: boolean;
};

type Props = {
  settings: NotificationSettings;
  onUpdate: (patch: Partial<NotificationSettings>) => Promise<void>;
};

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-3 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <div>
        <p className="text-sm font-medium text-zinc-900">{label}</p>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-amber-500" : "bg-zinc-200"
        } ${disabled ? "cursor-not-allowed" : ""}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "left-5" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function NotificationsSection({ settings, onUpdate }: Props) {
  return (
    <div className="space-y-1">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-900">
          Benachrichtigungen
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
Legen Sie fest, wann Sie benachrichtigt werden.
        </p>
      </div>

      <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white px-4">
        <ToggleRow
          label="Benachrichtigungen aktiviert"
          description="Übergeordneter Schalter für alle In-App-Benachrichtigungen."
          checked={settings.notificationsEnabled}
          onChange={(value) => onUpdate({ notificationsEnabled: value })}
        />
        <ToggleRow
          label="Kalender-Erinnerungen"
          description="Benachrichtigung bei anstehenden Terminen."
          checked={settings.calendarReminders}
          onChange={(value) => onUpdate({ calendarReminders: value })}
          disabled={!settings.notificationsEnabled}
        />
        <ToggleRow
          label="Aufgaben-Erinnerungen"
          description="Bald verfügbar."
          checked={false}
          onChange={() => {}}
          disabled
        />
        <ToggleRow
          label="Überfällige Aufgaben"
          description="Bald verfügbar."
          checked={false}
          onChange={() => {}}
          disabled
        />
      </div>
    </div>
  );
}
