# ADR 001: Monorepo mit pnpm Workspaces und Turborepo

- **Status:** Accepted
- **Datum:** 2026-07-11

## Kontext

Bissinger OS besteht mindestens aus einer Next.js-Webanwendung und einer NestJS-API. Im weiteren Verlauf können gemeinsam genutzte Konfigurationen, ein generierter API-Client, Hintergrundprozesse und weitere interne Pakete hinzukommen.

Die Bestandteile sollen unabhängig strukturiert bleiben, aber gemeinsam entwickelt, geprüft und versioniert werden können.

## Entscheidung

Bissinger OS wird als Monorepo aufgebaut.

Die Workspace-Verwaltung erfolgt mit **pnpm Workspaces**. Wiederkehrende Aufgaben wie `lint`, `typecheck`, `test` und `build` werden mit **Turborepo** orchestriert.

Vorgesehene Grundstruktur:

```text
bissinger-os/
├── apps/
│   ├── web/
│   └── api/
├── packages/
├── docs/
├── infrastructure/
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

Shared Packages werden nur dann angelegt oder dauerhaft beibehalten, wenn sie einen klaren Verantwortungsbereich besitzen und tatsächlich von mindestens einer Anwendung verwendet werden.

## Begründung

- Frontend und Backend können in einem Pull Request gemeinsam geändert werden.
- Gemeinsame TypeScript- und ESLint-Konfigurationen lassen sich zentral verwalten.
- API-Änderungen und zugehörige Frontend-Anpassungen bleiben synchron.
- Installation, Builds und CI-Prüfungen können zentral ausgeführt werden.
- Die Trennung zwischen Anwendungen und gemeinsam genutzten Paketen bleibt erhalten.
- Ein zusätzliches Repository- und Release-Management ist in der frühen Projektphase nicht erforderlich.

## Konsequenzen

### Positiv

- Einheitliche Entwicklungsumgebung
- Zentrale Qualitätsprüfungen
- Einfachere atomare Änderungen über mehrere Anwendungen
- Wiederverwendbare Workspace-Pakete
- Gemeinsamer Lockfile- und Dependency-Stand

### Negativ

- Fehlerhafte Root-Konfigurationen können mehrere Anwendungen gleichzeitig betreffen.
- CI- und Build-Pipelines müssen den Workspace-Abhängigkeitsgraphen berücksichtigen.
- Shared Packages dürfen nicht zu unspezifischen Sammelpaketen werden.
- Zugriffsrechte lassen sich nicht auf Repository-Ebene zwischen Frontend und Backend trennen.

### Vorgaben

- Keine leeren Reservepakete ohne geplante Nutzung
- Keine zyklischen Workspace-Abhängigkeiten
- Jede App muss weiterhin separat lint-, test-, typecheck- und buildbar sein
- Root-Skripte müssen alle produktiven Apps und Pakete validieren
