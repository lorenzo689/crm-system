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

Nach dem ersten `prisma migrate dev` muss die Basis-Organisation
`bissinger-lights` einmalig in der Datenbank vorhanden sein, damit die
Registrierung funktioniert.

Praktischer Dev-Weg:

1. Infrastruktur starten und Migrationen anwenden.
2. Falls die Organisation noch fehlt, per idempotentem SQL anlegen:

```bash
cd apps/api
pnpm exec prisma db execute --stdin
```

```sql
INSERT INTO organizations (id, name, slug, status, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Bissinger Lights', 'bissinger-lights', 'ACTIVE', NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;
```

Alternativ könnt ihr die vorhandenen Test-Skripte in `apps/api/scripts`
verwenden, wenn ihr den Setup-Flow gezielt mit User und Organisation
nachbauen wollt.

## Sicherheitskonfiguration (API)

- `JWT_SECRET`: außerhalb von `NODE_ENV=development|test` Pflicht (mind. 32 Zeichen), sonst startet die API nicht.
- `REGISTRATION_CODE`: Solange leer, ist die Registrierung deaktiviert. Der Code muss im Registrierungsformular eingegeben werden.
- `TRUST_PROXY`: Anzahl vorgeschalteter Reverse Proxies, damit das Rate-Limiting die echte Client-IP sieht.
- Passwort-Reset-Tokens liegen nur als SHA-256-Hash in der Datenbank.

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

## Produktion (Docker)

```bash
cd infrastructure/docker
cp .env.prod.example .env.prod        # alle Werte ausfüllen (DOMAIN, Passwörter, JWT_SECRET, SMTP, S3 ...)
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Caddy holt automatisch ein HTTPS-Zertifikat für `DOMAIN`; Postgres ist nicht von außen erreichbar; Migrationen laufen vor dem API-Start. Die KI startet, sobald `ANTHROPIC_API_KEY` in `.env.prod` steht. Backups der Volume `pgdata` (z. B. `pg_dump` per Cron) sind nicht Teil dieses Setups.

CI (`.github/workflows/ci.yml`) führt bei jedem Push Migrationen, Typecheck, Tests und Build aus.

## Rollen

Der erste registrierte Nutzer einer Organisation wird `OWNER`, alle weiteren `MEMBER`.
Firmendaten (Briefkopf, Bankverbindung) dürfen nur `OWNER` und `ADMIN` ändern.
Bestehende Nutzer befördert man per SQL:

```sql
UPDATE organization_members SET role = 'OWNER'
WHERE "userId" = (SELECT id FROM users WHERE email = 'name@bissinger-lights.de');
```

## Qualitätsprüfungen

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
