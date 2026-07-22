# Architecture Decision Records

Dieses Verzeichnis enthält die verbindlichen Architekturentscheidungen für **Bissinger OS**.

## Statuswerte

- **Proposed** – vorgeschlagen, noch nicht verbindlich
- **Accepted** – angenommen und verbindlich
- **Superseded** – durch eine neuere ADR ersetzt
- **Deprecated** – weiterhin dokumentiert, aber nicht mehr empfohlen
- **Rejected** – geprüft und verworfen

## Regeln

1. Bestehende ADRs werden nach Annahme nicht inhaltlich umgeschrieben.
2. Eine geänderte Entscheidung erhält eine neue ADR.
3. Die neue ADR verweist auf die ersetzte Entscheidung.
4. Implementierungen sollen den angenommenen ADRs entsprechen.
5. Abweichungen werden dokumentiert und bewusst entschieden.

## Aktuelle Entscheidungen

| ADR | Titel | Status |
|---|---|---|
| [001](001-monorepo.md) | Monorepo mit pnpm Workspaces und Turborepo | Accepted |
| [002](002-modular-monolith.md) | Modularer NestJS-Monolith | Accepted |
| [003](003-postgresql.md) | PostgreSQL als primäre Datenbank | Accepted |
| [004](004-rest-api.md) | Versionierte REST-API mit OpenAPI | Accepted |
| [005](005-microsoft-365-authentication.md) | Authentifizierung mit Microsoft Entra ID | Superseded |
| [006](006-managed-cloud.md) | Managed Cloud in der EU, bevorzugt Microsoft Azure | Accepted |
| [007](007-local-password-authentication.md) | Lokale Authentifizierung mit E-Mail und Passwort | Accepted |

Letzte Aktualisierung: 2026-07-11
