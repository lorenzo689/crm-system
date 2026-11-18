# Sprint 1 / 1.1 – Authentifizierung und Zugriffsschutz

Branch: `security/sprint-1-auth-hardening`. Er baut auf `feature/erp-ai-security` auf, nicht auf `main`, weil `main` die früheren Härtungen nicht enthält. Was das für einen Merge nach `main` bedeutet, steht in Abschnitt 11.

Sprint 1.1 behebt die acht Befundgruppen (F-01 bis F-08) aus dem adversarialen Review von Sprint 1. Die Exploit-Tests dazu stehen in `apps/api/test/security-review.e2e-spec.ts`.

## 1. Festgestellte Probleme

### Sprint 1 (Audit von `main`)

| Nr. | Problem | Zustand vorher |
|---|---|---|
| P0-1 | Öffentliche Registrierung | `POST /auth/register` legte ein Konto an und gab sofort ein JWT zurück. Das erste Konto wurde automatisch `OWNER`. |
| P0-2 | JWT-Konfiguration | Bekannte Platzhalter wurden akzeptiert. Es gab einen fest codierten Fallback, die Laufzeit war nicht begrenzt. |
| P0-3 | Gesperrte Benutzer | Mitgliedschaft und Organisationsstatus wurden ignoriert. Ausgestellte Tokens ließen sich nicht entwerten. |
| P0-4 | Rollen | Rollen wurden nicht durchgesetzt. Ein gültiges JWT reichte für Admin-Aktionen. |
| P0-5 | Organisationsisolation | Benutzer aus fremden Organisationen konnten Projekten oder Aufgaben zugeordnet werden. |
| P1 | Reset-Token / Deployment | Reset-Links waren nicht atomar einlösbar. `@prisma/adapter-pg` fehlte im Produktions-Image. |

### Sprint 1.1 (Review von Sprint 1)

| Nr. | Schwere | Befund |
|---|---|---|
| F-01 | Hoch | Die VIEWER-Sperre ließ sich über Kalender, Verkaufsbelege, Bestellungen, Reservierungen, wiederkehrende Rechnungen, Zeiteinträge und KI-Freigaben umgehen. |
| F-02 | Mittel | TOCTOU: Ein Admin, dem während der Anfrage die Rechte entzogen wurden, konnte die Aktion trotzdem abschließen. |
| F-03 | Mittel | `forgot-password` verriet über Status 500 oder 201, ob ein Konto existiert. |
| F-04 | Niedrig | Konten, die sich nur in der Groß-/Kleinschreibung unterscheiden, wurden beim Login dem falschen Konto zugeordnet. Die Eindeutigkeit war nicht in der Datenbank abgesichert. |
| F-05 | Mittel bis hoch | Jedes MEMBER erreichte Finanz-, Bank-, Berichts-, Posteingangs- und Rechnungsfunktionen sowie KI-Freigaben. |
| F-06 | Niedrig bis mittel | Ungültige IDs führten zu HTTP 500 (Prisma-Fehler P2007). |
| F-07 | Niedrig | Das Frontend verlangte 8 Zeichen, die API 10 plus Kleinbuchstaben. |
| F-08 | Niedrig | Der Entwicklungs-Fallback für das JWT-Secret war eine öffentlich bekannte Konstante. |
| Abh. | Kritisch | `next` hatte zwei RCE-Lücken und einen Middleware-Bypass. `proxy-addr` erlaubte IP-Spoofing und damit die Umgehung des Rate-Limitings. Dazu kamen DoS-Lücken in `body-parser`, `multer`, `nodemailer` und `zod` (Fund aus `pnpm audit --prod`). |

## 2. Umgesetzte Änderungen

### Sprint 1

- **Registrierung entfernt:** Die Route gibt 404 zurück. Konten entstehen nur noch über die CLI (Abschnitt 3).
- **Zentrale Auth-Konfiguration:** in `auth-config.ts`, mit Prüfung beim Start in `main.ts`.
- **Kontostatus:** wird bei jedem Request aus der Datenbank geprüft (`account-status.ts`, `jwt.strategies.ts`).
- **Token-Version:** neues Feld `User.tokenVersion`, das JWT trägt die Version als `tv`.
- **Rollen:** `RolesGuard` mit `@Roles(...)`. Benutzerverwaltung über `PATCH /users/:id/role`, `POST /users/:id/deactivate` und `POST /users/:id/revoke-sessions`.
- **Isolation:** Benutzer-IDs werden gegen die eigene Organisation geprüft. Fremde Ressourcen liefern 404.

### Sprint 1.1

- **F-01, VIEWER überall durchgesetzt** (`access/project-write.guard.ts`, `access.service.ts`):
  - Der Decorator `@ProjectWrite({ entity, bodyField })` mit dem `ProjectWriteGuard` schützt Kalender (anlegen, ändern, stornieren, archivieren).
  - Ebenso Verkaufsbelege: anlegen, ändern, Status, Umwandlung in eine Rechnung, Zahlung, Gutschrift, Mahnung, Versand und Löschen.
  - Ebenso Bestellungen (anlegen, Status, Wareneingang, löschen), Reservierungen (anlegen, Status), wiederkehrende Rechnungen (anlegen, pausieren, fortsetzen, löschen) und Zeiteinträge (anlegen, löschen, abrechnen).
  - Bei bestehenden Datensätzen wird das Projekt **aus der Datenbank** gelesen (`projectIdOf`). Bei einem Projektwechsel (z. B. `PATCH /sales-documents/:id` mit neuer `projectId`) werden alte und neue Zuordnung geprüft.
  - Die Zeitabrechnung prüft jedes betroffene Projekt, auch wenn die Anfrage nur einen Kunden nennt.
  - KI-Freigaben prüfen die `projectId` im Vorschlag gegen den freigebenden Benutzer.
  - Aufgaben, Notizen, Dokumente und Projekte prüfen weiterhin im Service.
- **F-02, Akteur unter der Sperre neu prüfen** (`AccessService.runAsAdmin`):
  - Admin-Mutationen laufen in einer Transaktion, die zuerst die Organisationszeile sperrt: Rollen ändern, sperren und Sitzungen entziehen exklusiv (`FOR UPDATE`), Projektmitglieder verwalten geteilt (`FOR SHARE`).
  - Danach werden Kontostatus, Organisationsstatus, Token-Version und Rolle des Akteurs innerhalb derselben Transaktion neu gelesen.
  - Wurde das Recht entzogen, antwortet die API mit 403, bei Sperrung oder neuer Token-Version mit 401.
  - Die Regeln (letzter Owner, nur ein Owner vergibt Owner-Rechte) gelten mit der *frisch gelesenen* Rolle.
- **F-03, keine Konto-Enumeration** (`auth.service.ts`, `auth-config.ts`):
  - `forgot-password` antwortet immer mit 201 und demselben Text, auch bei SMTP-Fehlern.
  - Der Versand läuft innerhalb der Anfrage (kein Fire-and-Forget), mit 8 Sekunden Timeout und einem Wiederholungsversuch. Fehler werden ohne Token und Link geloggt.
  - Jede Antwort dauert mindestens `PASSWORD_RESET_MIN_RESPONSE_MS` (Standard 1500 ms), damit echte Konten nicht langsamer antworten.
  - Die API startet außerhalb von development/test nicht ohne `SMTP_HOST` und `MAIL_FROM`.
  - Reset-Link oder Token stehen nie in der Antwort. Das Frontend zeigt keinen Direktlink mehr.
  - Den Reset-Link loggt die API nur bei `NODE_ENV=development` und fehlender SMTP-Konfiguration.
- **F-04, E-Mail-Strategie** (Migration `20261118130000_user_email_case_insensitive_unique`, `user-provisioning.ts`, `dto/email-input.ts`): siehe Abschnitt 3.1.
- **F-05, sensible Bereiche nur für OWNER und ADMIN:**
  - Alle Methoden von `/finance`, `/reports`, `/inbox` und `/recurring-invoices`.
  - Außerdem `GET /sales-documents/summary` (Umsatz- und Offene-Posten-Kennzahlen), `GET /ai/proposals`, `POST /ai/proposals/:id/approve|reject` und `POST /ai/agents/run`.
  - Im KI-Chat bekommt ein MEMBER keine Finanz-, Bank-, Lieferanten- und Posteingangs-Werkzeuge, auch keine Vorschläge für Versand, Gutschrift, Zeitrechnung, Bestellung oder Mahnung (`ADMIN_ONLY_TOOLS`). Sie werden nicht angeboten und bei einem Aufruf trotzdem abgelehnt.
  - Oberfläche: Die Menüpunkte und Seiten (mit „Kein Zugriff“-Hinweis), Befehlspalette, Finanzwidget im Dashboard und der Agenten-Knopf sind für MEMBER ausgeblendet.
- **F-06, UUID-Validierung:**
  - `ParseUUIDPipe` sitzt an allen ID-Routenparametern und an allen ID-Query-Filtern (`customerId`, `projectId`, `taskId`, `assigneeId`, `authorId`).
  - Ungültige IDs liefern 400, unbekannte oder fremde 404.
  - Es gibt keinen pauschalen Exception-Filter, andere Fehler bleiben sichtbar.
- **F-07, Passwortregel im Frontend:** `apps/web/lib/password-policy.ts` spiegelt die API-Regel: 10 bis 128 Zeichen, Groß- und Kleinbuchstabe, Zahl, Sonderzeichen. Die Reset-Seite nutzt sie. Die Registrierung gibt es nicht mehr, die CLI nutzt `validatePassword` der API.
- **F-08, kein bekanntes Entwicklungs-Secret:** Ohne `JWT_SECRET` erzeugt die API in development und test ein kryptografisch zufälliges Secret pro Prozess (48 Byte, nie geloggt). Nach jedem Neustart müssen sich Entwickler neu anmelden. Wer das vermeiden will, setzt lokal einen eigenen Wert. Die Tests setzen ihr Secret explizit (`test/setup-env.ts`).
- **Abhängigkeiten:**
  - Direkt aktualisiert: `next` 16.2.10 auf 16.4.5, `eslint-config-next` 16.4.5, `nodemailer` 9 auf ~10.1.7 (Major-Sprung, API-kompatibel, Tests grün) und `@nestjs/core`/`common`/`platform-express` auf 11.2.10.
  - Per Override in `pnpm-workspace.yaml`: `proxy-addr` ≥ 2.0.8, `body-parser` ≥ 2.4.0, `source-map-js` ≥ 1.2.2 und `zod` ≥ 4.6.7 (nur innerhalb der betroffenen Versionsbereiche).
- **Lint:** Der API-Lint ist fehlerfrei, deshalb ist er in der CI jetzt Pflicht (`continue-on-error` entfernt). Die Korrekturen waren typisierte Test-Matcher, unbenutzte Variablen und der Health-Test. Keine Regel wurde abgeschaltet.

## 3. Benutzerkonten sicher erstellen

Es gibt nur den CLI-Weg. Das Passwort wird verdeckt zweimal abgefragt, nie als Argument übergeben. Ohne interaktives Terminal bricht der Befehl ab.

```bash
pnpm --filter api user-admin bootstrap   --email chef@bissinger-lights.de --name "Vorname Nachname"
pnpm --filter api user-admin create-user --email a@bissinger-lights.de --name "Vorname Nachname" --role MEMBER
pnpm --filter api user-admin check-emails   # E-Mail-Konflikte finden (siehe 3.1)
```

Im Produktionscontainer: `node dist/src/cli/user-admin.js …` im interaktiven Terminal (`docker compose exec`, `-t` nicht weglassen). `bootstrap` scheitert absichtlich, sobald ein Owner existiert. Owner-Rechte vergibt nur ein bestehender Owner (`PATCH /users/:id/role`).

### 3.1 E-Mail-Normalisierung und Eindeutigkeit (F-04)

- **Speichern:** Neue Adressen werden getrimmt und kleingeschrieben gespeichert (CLI). Bestehende Konten behalten ihre Schreibweise, es wird nichts umgeschrieben und nichts zusammengeführt.
- **Vergleichen:** Login, Passwort-Reset und Duplikatprüfung vergleichen ohne Rücksicht auf Groß-/Kleinschreibung und ignorieren Leerzeichen am Rand (`EmailInput`-Decorator).
- **Datenbank:** Der eindeutige Index `users_email_lower_key` auf `lower(email)` verhindert Konten, die sich nur in der Schreibweise unterscheiden. Damit gibt es pro Adresse höchstens ein Konto, und der Login kann kein falsches Konto treffen.
- **Bestehende Konflikte:** Die Migration bricht ab und nennt die betroffenen Adressen, statt etwas zu ändern. Vorgehen:
  1. Vor dem Deploy `pnpm --filter api user-admin check-emails` ausführen. Exit-Code 2 bedeutet, dass es Konflikte gibt.
  2. Jeden Konflikt manuell klären, z. B. das nicht mehr genutzte Konto umbenennen oder archivieren und seine Adresse ändern.
  3. `prisma migrate deploy` erneut ausführen.
- **Registrierung:** Es gibt keine.

## 4. Berechtigungsmatrix (Version 1.1)

| Aktion | OWNER | ADMIN | MEMBER |
|---|---|---|---|
| Kunden, Projekte, Aufgaben, Notizen, Dokumente, Kalender, Angebote/Rechnungen, Bestellungen, Verleih, Zeiten lesen und bearbeiten | ja | ja | ja |
| Finanzen, Bankimport und -abgleich, Eingangsrechnungen, Zahlungsübersicht | ja | ja | **nein** |
| Auswertungen und Exporte (Gewinn, Umsatz) | ja | ja | **nein** |
| Umsatz-Kennzahlen (`/sales-documents/summary`, Dashboard-Finanzwidget) | ja | ja | **nein** |
| Wiederkehrende Rechnungen und Rechnungslauf | ja | ja | **nein** |
| Posteingang (lesen, einordnen, abrufen) | ja | ja | **nein** |
| KI-Chat | ja (alle Werkzeuge) | ja (alle Werkzeuge) | ja (ohne Finanz-, Bank-, Lieferanten-, Posteingangs- und Finanzvorschlags-Werkzeuge) |
| KI-Vorschläge sehen, freigeben, ablehnen; Agentenlauf | ja | ja | **nein** |
| Benutzer sperren, Sitzungen entziehen | ja | ja (nicht Owner) | nein |
| Rollen ändern | ja | nur zwischen ADMIN und MEMBER | nein |
| Projektmitgliedschaften verwalten | ja | ja | nein |
| Owner ernennen oder ändern | ja | nein | nein |
| Firmenstammdaten | ja | ja | nein |

Projektrolle VIEWER: Der Betrachter darf alle Daten des Projekts lesen, aber nichts daran ändern. Das gilt für alle Organisationsrollen, auch für einen ADMIN, der als Betrachter eingetragen ist. Der letzte aktive Owner ist geschützt (`409`). Ein Akteur, der während der Aktion gesperrt wird, bekommt `401`.

### Fachliche Auswirkungen für MEMBER (vorläufig, kann angepasst werden)

- Keine Seiten **Finanzen**, **Auswertungen**, **Abos** und **Posteingang**. Eingangsrechnungen, Bankabgleich und Rechnungsläufe macht nur noch ein OWNER oder ADMIN.
- Das Dashboard zeigt keine Umsatz- und Offene-Posten-Kennzahlen.
- KI-Vorschläge, auch für Aufgaben, kann nur ein OWNER oder ADMIN freigeben. Vorschläge, die ein MEMBER im Chat erzeugt, landen in der Freigabeliste der Admins. Der MEMBER sieht sie danach nicht mehr.
- Der KI-Chat beantwortet einem MEMBER keine Fragen zu Finanzen, Bankbewegungen, Lieferanten, Projektgewinn und Posteingang.
- Angebote, Rechnungen, Gutschriften, Bestellungen und Lieferanten bleiben für MEMBER bearbeitbar. Ob das so bleiben soll, ist eine offene fachliche Entscheidung.

## 5. Sperren und Sitzungen

- **Sperren:** `POST /users/:id/deactivate` setzt `archivedAt` und erhöht `tokenVersion`. Der Login schlägt danach fehl, ebenso die nächste Anfrage mit einem alten Token (401).
- **Sitzungen beenden:** `POST /users/:id/revoke-sessions` erhöht nur die Token-Version.
- **Passwort-Reset:** erhöht `tokenVersion`, alle alten Tokens sind sofort ungültig.
- **Organisation:** Suspendierung, Archivierung oder entfernte Mitgliedschaft wirken sofort.
- **Während einer Aktion:** Admin-Aktionen prüfen den Akteur unter der Datenbanksperre neu (F-02).

## 6. Umgebungsvariablen

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `JWT_SECRET` | außerhalb `NODE_ENV=development\|test` | Zufallswert, ≥ 32 Zeichen, kein Platzhalter. Erzeugen mit `openssl rand -base64 48` oder `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Lokal optional: leer bedeutet ein zufälliges Secret pro Prozess. |
| `JWT_EXPIRES_IN_MINUTES` | nein | 1–480, Standard 480 (8 Stunden). |
| `SMTP_HOST`, `MAIL_FROM` | außerhalb development/test | Ohne diese Werte startet die API nicht (Passwort-Reset). Optional dazu `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`. |
| `PASSWORD_RESET_MIN_RESPONSE_MS` | nein | Mindestdauer jeder `forgot-password`-Antwort, Standard 1500. |
| `TEST_DATABASE_URL` | nur Tests | Der Datenbankname muss auf `_test` enden. |

`REGISTRATION_CODE` wird nicht mehr gelesen.

## 7. Tests ausführen

```bash
docker exec docker-postgres-1 psql -U bissinger -d postgres -c "CREATE DATABASE bissinger_os_test"   # einmalig
DATABASE_URL=postgresql://bissinger:bissinger_dev@localhost:5432/bissinger_os_test pnpm --filter api exec prisma migrate deploy

pnpm --filter api test        # 196 Unit-Tests
pnpm --filter api test:e2e    # 99 Integrationstests gegen die echte Testdatenbank
pnpm lint && pnpm typecheck && pnpm build
pnpm audit --prod             # Abhängigkeiten
```

Die Integrationstests leeren alle Tabellen und verweigern den Start, wenn der Datenbankname nicht auf `_test` endet. `security-review.e2e-spec.ts` deckt ab:
- **Default-Deny:** jede Route ohne Token liefert 401.
- **Fremde IDs:** zufällige fremde UUID an jeder ID-Route, nie 2xx oder 5xx.
- **Ungültige IDs:** an jeder Route mit ID-Parameter immer 400.
- **Org-Isolation:** keine Kennungen einer fremden Organisation in Listen.
- **Befunde:** F-01 bis F-06, jeweils mit erlaubtem Gegenbeispiel.

## 8. Migrationen

| Migration | Inhalt | Risiko |
|---|---|---|
| `20261118120000_user_token_version` | `users.tokenVersion INTEGER NOT NULL DEFAULT 0` | Additiv. Bestandskonten bleiben aktiv, alle Benutzer müssen sich einmal neu anmelden. |
| `20261118130000_user_email_case_insensitive_unique` | eindeutiger Index auf `lower(email)` | Bricht bei Konflikten mit einer Meldung ab und ändert dann nichts. Ohne Konflikte rein additiv. |

Beide Migrationen habe ich gegen eine frische Datenbank mit Bestandsnutzern geprüft, die zweite zusätzlich mit und ohne Konflikt. Rollback-Skripte gibt es keine: Feld oder Index lassen sich bei Bedarf per `ALTER TABLE … DROP COLUMN` bzw. `DROP INDEX` entfernen.

## 9. Restrisiken

- **Session-Speicherung:** Das JWT liegt im `localStorage`. Eine XSS-Lücke könnte Tokens stehlen. HttpOnly-Cookies und CSRF-Schutz kommen im Folge-Sprint.
- **Rate-Limiting:** zählt pro IP und im Speicher. Es gibt keine kontobezogene Sperre und keine Verteilung über mehrere Instanzen. Hinter einem Proxy muss `TRUST_PROXY` stimmen; `proxy-addr` ist jetzt gepatcht.
- **Timing bei `forgot-password`:** Dauert der SMTP-Versand länger als die Mindestdauer (1,5 s), ist der Unterschied wieder messbar. Ein ausgefallener Mailserver bedeutet, dass die Mail fehlt (das ist im Log sichtbar). Eine persistente Mail-Queue gibt es nicht.
- **Kurzlebiger Akteur-Status:** Nicht-administrative Anfragen prüfen den Benutzerstatus einmal zu Beginn der Anfrage. Eine Sperrung, die genau während einer laufenden normalen Anfrage passiert, wirkt erst ab der nächsten Anfrage.
- **VIEWER und Dokument-Downloads:** Lesen ist erlaubt, Downloads bleiben für Betrachter möglich (so gewollt). Personenbezogene Erinnerungen an Terminen sind nicht projektgebunden.
- **ADMIN-Befugnisse:** Ein ADMIN kann andere ADMINs herabstufen oder sperren. Konten lassen sich über die API nicht reaktivieren, es gibt keine Oberfläche für die Benutzerverwaltung.
- **Abhängigkeiten:** `pnpm audit --prod` meldet noch 22 High-Befunde, alle nur in Entwicklungs- und Build-Werkzeugen. Betroffen sind ESLint (`brace-expansion`, `js-yaml`, `picomatch`), die Prisma-CLI (`fast-uri`, `deepmerge-ts`, `mysql2`; die API nutzt PostgreSQL) und Browserslist im Next-Build. Keiner davon ist über einen API- oder Web-Request erreichbar. Dazu kommen 31 Moderate-Befunde, u. a. weitere in `nodemailer` vor 10.1.x.
- **Web-Lint:** 11 vorbestehende `react-hooks/set-state-in-effect`-Fehler und 1 Warnung in UI-Komponenten (Kunden, Projekte, Aufgaben, Login, Notizen, Dokumente, Benachrichtigungen). Sie haben keinen Sicherheitsbezug, ein Umbau der Effekte wäre ein UI-Refactoring außerhalb dieses Sprints.
- **Nicht durchgeführt:** Penetrationstest, Lasttest. Der CLI-Passwortprompt ist nicht automatisiert getestet.

## 10. Sprint 2 (verbleibend)

1. Session mit HttpOnly-Cookies und CSRF-Schutz, Refresh- und Abmelde-Endpunkt.
2. Fachliche Freigabe der Matrix für Verkaufsbelege, Einkauf und Finanzen.
3. Persistente Mail-Queue (Outbox) mit Wiederholungen.
4. Atomare Dokumentversionsnummern, Storage-Download-URLs, Backups mit Restore-Test.
5. Konten reaktivieren, Benutzerverwaltung in der Oberfläche, Audit-Log für Admin-Aktionen.
6. Kontobezogenes und verteiltes Rate-Limiting, Web-Lint bereinigen, Pen-Test.

## 11. Diff gegenüber `main` und Release-Risiken

`main` (letzter Stand `9b39a28`) ist vollständig im Branch enthalten. Auf `main` gibt es keine Commits, die im Branch fehlen. Der Branch enthält zusätzlich die drei Commits aus `feature/erp-ai-security` (`a404e48`, `5a15cb5` und den Merge `4653324`) und die nicht committeten Sprint-1- und 1.1-Änderungen.

**Zusätzlich gegenüber `main` (ohne Sprint 1 und 1.1):**
- **ERP-Module:** Artikel, Verkaufsbelege (Angebote, Rechnungen, Gutschriften, XRechnung, PDF, Mahnwesen), Einkauf und Lieferanten, Finanzen (Bank-CSV-Import, Abgleich, Eingangsrechnungen), Verleih, Zeiterfassung, wiederkehrende Rechnungen, Auswertungen und Exporte, Firmenprofil sowie Volltext- und Trigram-Suche.
- **KI-Assistent** auf Basis von Anthropic Claude: Chat mit Werkzeugzugriff, Vorschläge mit Freigabe, täglicher Agent.
- **E-Mail-Posteingang** per IMAP mit KI-Einordnung, Versand von Belegen per E-Mail.
- **Deployment:** `api.Dockerfile`, `web.Dockerfile`, `docker-compose.prod.yml`, `Caddyfile`, `.env.prod.example`, CI-Workflow.
- **Härtung aus dem Vor-Sprint:** helmet, compression, Body-Limits, `TRUST_PROXY`, gehashte Reset-Tokens, Throttling.
- **8 zusätzliche Migrationen** (`20261017*`), die neuer sind als die letzte auf `main` (`20261008140000`). Die Reihenfolge ist also unkritisch.
- **Gelöscht:** versionierte Logs, kompilierte Skripte (`dist-scripts/`) und ein verirrtes `apps/api/apps/api/prisma/migrations/migration_lock.toml`.
- **Neue Laufzeitabhängigkeiten:** `@anthropic-ai/sdk`, `helmet`, `compression`, `imapflow`, `mailparser`, `pdfkit`, dazu `@prisma/adapter-pg` als Laufzeitabhängigkeit.
- **Umfang:** 188 Dateien vor Sprint 1. Mit Sprint 1 und 1.1 sind es 253 Dateien (223 geänderte plus 30 neue, +21.712/−8.257 Zeilen in den bestehenden Dateien). Sprint 1 und 1.1 allein: 77 geänderte und 30 neue Dateien.

**Neue Release-Risiken durch diese zusätzlichen Inhalte:**
1. **Datenschutz (DSGVO):** Der KI-Assistent und die Posteingangs-Einordnung senden Kundendaten, Dokumenttexte und E-Mail-Inhalte an Anthropic. Dafür braucht es einen Auftragsverarbeitungsvertrag und eine Prüfung, welche Daten übertragen werden dürfen. Bis dahin sollte `ANTHROPIC_API_KEY` leer bleiben.
2. **Großer Funktionssprung:** Die ERP-Module sind fachlich nicht abgenommen. Rechnungsnummern, XRechnung und Mahnwesen sind buchhaltungsrelevant (GoBD). Vor echten Rechnungen braucht es eine fachliche Abnahme und eine Steuerberater-Prüfung.
3. **Automatische Hintergrundjobs:** IMAP-Abruf alle 5 Minuten, KI-Agent täglich um 06:00 Uhr, Lauf der wiederkehrenden Rechnungen. Sie laufen ohne Benutzeraktion. Bei einem falsch konfigurierten Server können Rechnungen erzeugt oder Mails eingelesen werden.
4. **Migrationen:** 8 ERP-Migrationen und 2 Sprint-Migrationen in einem Release. Vorher ist ein Backup nötig, ebenso ein Probedurchlauf auf einer Kopie der Produktionsdatenbank und `user-admin check-emails`.
5. **Next 16.4.5 und nodemailer 10:** Minor- bzw. Major-Sprung. Build und Typecheck sind grün, ein manueller UI-Test steht aus (laut `AGENTS.md` hat diese Next-Version Breaking Changes).
6. **Einmaliges Ausloggen** aller Benutzer durch die Token-Version.
