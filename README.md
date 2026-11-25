# Bissinger OS

## Lokale Entwicklungsumgebung

Die Anwendung läuft lokal per `pnpm`, die Infrastruktur-Dienste per Docker Compose.

### Standard-Ports

- Next.js Web: `http://localhost:3000`
- NestJS API: `http://localhost:4000`
- PostgreSQL: `localhost:5432`
- Mailpit UI: `http://localhost:8025`
- Mailpit SMTP: `localhost:1025`

### Infrastruktur starten

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

### Anwendungen lokal starten

```bash
pnpm dev
```

Oder einzeln:

```bash
pnpm --filter my-app dev
pnpm --filter api start:dev
```

### Datenbank prüfen

```bash
pnpm --filter api exec prisma migrate status
pnpm --filter api exec prisma studio
```

## Erstes lokales Setup

1. Infrastruktur starten und Migrationen anwenden:

   ```bash
   docker compose -f infrastructure/docker/docker-compose.yml up -d
   pnpm --filter api exec prisma migrate deploy
   ```

2. `apps/web/.env.local` aus `apps/web/.env.example` anlegen (`NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`). Ohne diese Variable ruft das Frontend die API relativ unter `/api/v1` auf; so ist es für Reverse-Proxy-Setups (Staging, Produktion) gedacht.

3. Den ersten Owner anlegen. Es gibt **keine öffentliche Registrierung**. Der Befehl legt auch die Organisation `bissinger-lights` an, das Passwort wird verdeckt abgefragt:

   ```bash
   pnpm --filter api user-admin bootstrap --email admin@bissinger-lights.de --name "Vorname Nachname"
   pnpm --filter api user-admin create-user --email kollege@bissinger-lights.de --name "Name" --role MEMBER
   ```

## Sicherheitskonfiguration (API)

- `JWT_SECRET`: außerhalb von `NODE_ENV=development|test` Pflicht (mind. 32 zufällige Zeichen, z. B. `openssl rand -base64 48`). Fehlt er oder ist er schwach/ein Platzhalter, startet die API nicht.
- `JWT_EXPIRES_IN_MINUTES`: optionale Sitzungsdauer (1–480, Standard 480 = 8 Stunden).
- `WEB_ORIGIN`: exakte Herkunft der Weboberfläche (z. B. `https://erp.example.com`, mehrere kommagetrennt). Außerhalb von development/test Pflicht und nur als `https://`-Origin ohne Pfad; sonst startet die API nicht. Daraus leiten sich CORS und die Origin-Prüfung ab.
- Anmeldung über ein HttpOnly-Session-Cookie (`__Host-bissinger_session`, lokal `bissinger_session`) mit serverseitiger Sitzung und CSRF-Token; im Browser-Speicher liegt kein Token. Lokal immer `http://localhost:3000` und `http://localhost:4000` verwenden, nicht `127.0.0.1` mischen (Details: `docs/security/sprint-2-session-security.md`).
- Es gibt keine öffentliche Registrierung. Konten legt ein Administrator per CLI an: `pnpm --filter api user-admin bootstrap …` bzw. `create-user …` (Details: `docs/security/sprint-1-auth-hardening.md`).
- `TRUST_PROXY`: Anzahl vorgeschalteter Reverse Proxies, damit das Rate-Limiting die echte Client-IP sieht.
- Passwort-Reset-Tokens liegen nur als SHA-256-Hash in der Datenbank.
- `BACKGROUND_JOBS`: `all` (Standard), `none`, `maintenance` oder eine Namensliste (`session-purge`, `calendar-reminders`, `inbox-poll`, `ai-agents`, `recurring-invoices`). Mit `APP_ENV=staging` sind nur Wartungsjobs erlaubt.
- Health: `GET /api/v1/health/live` (Prozess läuft) und `GET /api/v1/health/ready` (Datenbank, Objektspeicher, Migrationen; sonst 503).
- `LOG_FORMAT=json`: strukturierte Logs mit Request-ID (`X-Request-Id`).

## KI-Assistent

1. `ANTHROPIC_API_KEY` in `apps/api/.env` eintragen, API neu starten. Mehr ist nicht nötig.
2. Im Menü **KI-Assistent** öffnen oder überall `Strg/⌘ + K` drücken und eine Frage eintippen.

- Die KI liest Kunden, Projekte, Aufgaben, Artikel, Belege, Lieferanten und Dokumenttexte, immer nur innerhalb der eigenen Organisation.
- Sie ändert nichts selbst: Aufgaben, Angebote, Bestellungen und Mahnungen landen als **Vorschlag** im Postfach und werden erst nach „Freigeben“ ausgeführt (mit erneuter Eingabeprüfung). Jede Entscheidung wird mit Nutzer und Zeitpunkt protokolliert (`ai_proposals`).
- Ein Hintergrund-Agent prüft täglich um 06:00 Uhr überfällige Rechnungen, unbeantwortete Angebote (> 7 Tage) und Mindestbestände und legt Vorschläge an. Er arbeitet regelbasiert und funktioniert auch ohne API-Key.
- Optionale Variablen: `AI_MODEL` (Standard `claude-opus-5-5`), `AI_EFFORT` (`low`/`medium`/`high`), `AI_FALLBACKS=off`.

## Belege per E-Mail & Posteingang

- Angebote und Rechnungen lassen sich als PDF öffnen und direkt per E-Mail senden (SMTP-Einstellungen wie beim Passwort-Reset; lokal landen Mails in Mailpit unter `http://localhost:8025`). Ein Entwurf wird beim Senden automatisch ausgestellt.
- Der Posteingang (`/inbox`) ruft per IMAP ungelesene Mails ab (`IMAP_*` in `apps/api/.env`), ordnet sie über die Kontakt-E-Mail einem Kunden zu und lässt die KI Kategorie, Kurzfassung und ggf. eine Aufgabe vorschlagen.

## Geschäftsprozesse im System

| Bereich | Was es kann |
|---|---|
| **Angebote → Rechnungen** | Entwurf, Ausstellen mit lückenloser Nummer (AN-/RE-/GS-Jahr-Nr.), Umwandlung Angebot → Rechnung, Teilzahlungen, Mahnstufen, PDF, E-Mail-Versand |
| **Gutschriften** | Aus einer ausgestellten Rechnung erzeugen (komplett oder anteilig per API); reduziert den offenen Betrag, schließt die Rechnung bei Volldeckung |
| **E-Rechnung** | XRechnung 3.0 (CII-XML) für ausgestellte Rechnungen und Gutschriften. **Vor dem produktiven Einsatz mit dem KoSIT-Validator prüfen.** |
| **Artikel & Lager** | Bestand mit Mindestbestand, automatische Lagerbuchung bei Rechnung und Wareneingang |
| **Verleih** | Mietbare Artikel mit Mietbestand; Reservierungen werden pro Tag gegen den Bestand geprüft (Überbuchung ausgeschlossen, auch bei gleichzeitigen Anfragen) |
| **Einkauf** | Lieferanten, Bestellungen (optional mit Projekt), Teil-Wareneingang, Eingangsrechnungen |
| **Bankabgleich** | CSV-Kontoauszug importieren, Zahlungen Rechnungen zuordnen (Vorschläge; exakte Treffer aus Rechnungsnummer **und** Betrag werden automatisch gebucht) |
| **Zeiterfassung** | Zeiten pro Projekt/Kunde, Abrechnung als Rechnungsentwurf mit Stundensatz aus den Firmendaten |
| **Abos** | Wiederkehrende Rechnungen, täglich 05:00 Uhr als *Entwurf*, nie automatisch ausgestellt |
| **Auswertungen** | Deckungsbeitrag je Projekt (Umsatz − Gutschriften − Einkauf), Top-Kunden, CSV-Exporte Rechnungsausgang/-eingang |

Der Hintergrund-Agent (täglich 06:00 Uhr) legt zusätzlich Vorschläge für überfällige Rechnungen, fällige Eingangsrechnungen, unbeantwortete Angebote, Mindestbestände und unabgerechnete Zeiten an. Er braucht keinen API-Key.

## Deployment

- **Privates Staging** (über Tailscale, nicht öffentlich), inklusive verschlüsselter Backups mit automatisiertem Restore-Test und Monitoring:
  - [docs/deployment/staging.md](docs/deployment/staging.md)
  - [docs/deployment/backup-and-restore.md](docs/deployment/backup-and-restore.md)
  - [docs/deployment/operations-runbook.md](docs/deployment/operations-runbook.md)
- **Produktion:** noch nicht freigegeben.
  - `docker-compose.prod.yml` nutzt dieselben Images, braucht aber einen externen S3-Speicher und veröffentlicht 80/443.
  - Backups sind dort noch **nicht** eingerichtet. Die Staging-Backup-Komponente ist die Vorlage; vor einem Produktivbetrieb kommen Offsite-Backups und ein Restore-Test auf getrennter Hardware dazu.
- **CI** (`.github/workflows/ci.yml`):
  - bei jedem PR Typecheck, Unit-, Web- und Integrationstests, Lint und Build
  - Bau der Container-Images
  - kompletter Staging-Stack mit Smoke-Test: HTTPS-Origin, Cookies, CSRF, Up- und Download, Hintergrundjobs, Ports, Readiness
  - Backup und Restore in eine neue Umgebung

## Rollen

- Den ersten `OWNER` legt `user-admin bootstrap` an, alle weiteren Konten `user-admin create-user` (Rolle `ADMIN` oder `MEMBER`).
- Rollen ändern `OWNER` und `ADMIN` über die API (`PATCH /api/v1/users/:id/role`). Owner-Konten verwaltet nur ein Owner; der letzte Owner ist geschützt.
- Finanzen, Auswertungen, Posteingang, Abos und KI-Freigaben sind `OWNER` und `ADMIN` vorbehalten (siehe `docs/security/sprint-1-auth-hardening.md`).

## Qualitätsprüfungen

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Integrationstests (`pnpm --filter api test:e2e`) brauchen eine leere Test-Datenbank, deren Name auf `_test` endet (`TEST_DATABASE_URL`). Lokal unter Windows mit Docker Desktop immer `127.0.0.1` statt `localhost` verwenden (so ist der Standardwert gesetzt): Neue Verbindungen über den Namen `localhost` bleiben dort sporadisch 10 Sekunden hängen, was in den Tests als HTTP 500 („timeout exceeded when trying to connect“) erscheint. Nie zwei Testläufe gleichzeitig gegen dieselbe Datenbank starten.

Die Infrastrukturtests (Container-Images, Staging-Stack, Backup/Restore) laufen mit `infrastructure/tests/staging-smoke.sh` und `restore-test.sh`; Details in `docs/deployment/staging.md`.
