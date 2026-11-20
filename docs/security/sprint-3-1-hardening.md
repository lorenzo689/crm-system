# Sprint 3.1 – Sitzungskontext im Frontend und Job-Leases im Backend

Branch: `security/sprint-3-1-hardening`, abgezweigt von `feature/erp-ai-security` (Basis `aef8c5cb998dedb67b2cd9acefcda1c91f55b932`, CI-Lauf #8 grün).

Status: **nur lokal, nichts committet, gepusht oder deployt.** Die Prüfung in Abschnitt 8 stammt vom selben Agenten, der die Änderung geschrieben hat. Sie ist **keine unabhängige Prüfung**; Abschnitt 9 beschreibt, was ein zweiter Prüfer gezielt ansehen sollte.

## 1. Zwei bekannte Rennen (vor der Änderung nachgewiesen)

### 1.1 Frontend: Antworten und Cache gehörten keinem Sitzungskontext

Cookies sind zwischen Tabs geteilt. Der Browser hängt bei jedem Request das *aktuelle* Cookie an, die Seite weiß aber nur, als wer sie gestartet wurde.

| Ursache | Wirkung |
|---|---|
| GET-Antworten wurden nicht an die Sitzung gebunden (`sendAsCurrentIdentity` machte bei GET einfach `send(null)`) | Nach Benutzer-/Organisationswechsel in einem anderen Tab zeigte die alte Seite Daten des neuen Benutzers |
| `use-api.ts`: ein globaler Cache, Schlüssel nur der Pfad; Ergebnisse wurden ohne Prüfung geschrieben, `invalidateApi` startete Requests ohne Zuordnung | Cache-Eintrag von Benutzer A wurde Benutzer B ausgeliefert; ein älterer Request überschrieb einen neueren |
| `loadSession({force:true})` ohne Reihenfolge | eine ältere Antwort konnte eine neuere Sitzung überschreiben, ein altes 401 konnte eine gültige Sitzung abmelden |
| Dokument-Vorschau und Download über direkte URLs | umgingen `apiFetch` vollständig (kein Kontext, kein Abbruch) |

**Vorher-Nachweis** (`apps/web/test/session-context.test.ts` gegen den unveränderten Client): 19 Tests, **16 schlugen fehl**, 2 bestanden (8c „Wechsel bleibt erkannt“, 15 „Mutation mit CSRF“, beide waren schon vorher korrekt), 1 hing (Test 11). Die Ausgabe liegt im Scratchpad der Sitzung (`web-prefix-result.txt`). Beispiele: `actual: { secret: 'data-of-alice' }` für Benutzer B, `actual: 'anonymous'` statt `authenticated` bei altem 401.

### 1.2 Backend: Lease ohne Verlängerung

`BackgroundJobsService` hielt die Lease nur `leaseSeconds` (5 bis 60 min), egal wie lange der Job lief, und hatte kein Konzept von „Eigentümer dieses Laufs“.

**Vorher-Nachweis** (temporärer Test gegen echtes PostgreSQL, danach gelöscht): Lease läuft während eines Jobs ab → eine zweite Instanz startet denselben Job (`expect(ranSecond).toBe(false)`, erhalten `true`). Beide Läufe arbeiteten gleichzeitig.

## 2. Frontend: Sitzungskontext-Modell

**Server (`apps/api/src/modules/auth/session-context.ts`, `JwtAuthGuard`):**
`X-Session-Context` = HMAC-SHA256 (abgeleiteter Schlüssel, Label `bissinger-os/session-context/v1`) über `[sessionId, userId, organizationId, role]`. Jede authentifizierte Antwort trägt ihn (gesetzt, bevor der Handler läuft, also auch bei Streams); Login und `/auth/session` liefern denselben Wert als `contextId`.

Entscheidung **Marker statt Cookie-Auswertung**: Der Browser kann das HttpOnly-Cookie nicht lesen, also muss der Server sagen, für welchen Kontext er geantwortet hat. Der Marker ist
- **kein Geheimnis und kein Berechtigungsnachweis:** einseitig (HMAC), enthält weder Session-ID noch Token, wird vom Server nie als Eingabe gelesen (Test: als Header oder als CSRF-Token wird er abgelehnt);
- **getrennt vom CSRF-Token** (anderes Schlüssel-Label, anderer Wert);
- ändert sich bei Wechsel von Sitzung, Benutzer, Organisation **oder Rolle**.

**Client (`lib/session.ts`):**
- Kontextschlüssel: `ctx:<contextId>` | `blocked` | `anonymous` | `unknown`. Jeder Wechsel erhöht die **Epoche** und bricht alle laufenden Anfragen des alten Kontexts ab (`AbortSignal`).
- GET/HEAD/OPTIONS (`sendBoundToContext`): Antwort wird nur verwendet, wenn Header = erwarteter Marker und die Epoche unverändert ist. Sonst wird sie **verworfen**, die Sitzung neu gelesen:
  - andere Person oder Organisation → Seite wird **gesperrt** (sticky), `SessionChangedError`;
  - gleiche Person, neue Sitzung oder Rolle → übernehmen, genau **ein** erneuter Versuch;
  - Sitzung nicht prüfbar (Netz) → **fail closed** (`SessionChangedError`);
  - 2xx ohne Marker gilt als Abweichung; ein 401 wird erst nach erneutem Lesen der Sitzung geglaubt.
- `loadSession`: jede Anfrage bekommt eine Nummer; ältere Antworten (Daten wie 401) werden ignoriert, Login und Logout machen laufende Prüfungen veraltet; ein erkannter Wechsel wird nie zurückgenommen.
- **Cache (`use-api.ts`):** der Cache gehört genau einem Kontext. Kontextwechsel leert ihn; ein Request darf sein Ergebnis nur schreiben, wenn er noch der registrierte Request seines Schlüssels **und** seine Epoche aktuell ist. `invalidateApi` entzieht älteren Requests die Registrierung. Blockierte oder abgemeldete Seiten starten keine Requests (auch kein `prefetch`). `SessionChangedError` wird nicht als Ladefehler gecacht.
- `useApiResource`: Epoche ist Teil des Schlüssels; Ergebnisse eines alten Kontexts gelten nie als „aktuell“.
- **Dokumente:** Vorschau und Download laufen über `apiFetchRaw` → Blob (`fetchDocumentBlob`). Der Kontext wird nach dem **letzten Byte** erneut geprüft. Vorschau nur für PDF und PNG/JPEG/GIF/WebP (ein `blob:`-Dokument gehört zu unserer Origin; HTML/SVG dürfen nie so gerendert werden). CSP: `frame-src` um `blob:` erweitert, `img-src` hatte es schon.
- **Mutationen:** unverändert (CSRF-Token an die Sitzung gebunden; ein Request mit Token einer anderen Sitzung wird mit 403 `CSRF_INVALID` abgelehnt, bevor ein Handler läuft; maximal ein Retry, nur bei gleicher Person). Das Rennen betrifft nur Lesezugriffe.
- **Oberfläche:** Bei Sperre bleibt die Seite eingehängt, ist aber unsichtbar und `inert` (nichts bearbeitbar, keine Daten sichtbar). Ein Dialog erklärt die Lage und bietet „Seite neu laden“ und „Zur Anmeldung“. Es lädt **nichts automatisch** neu. Vom Benutzer geänderte Textfelder (keine Passwörter, nichts persistent) werden im Dialog angezeigt und lassen sich kopieren.

## 3. Backend: Lease-Modell

- **Erwerb:** ein einziges Statement (`INSERT … ON CONFLICT DO UPDATE … WHERE abgelaufen`), je Lauf ein Zufalls-`runToken`, `fence` zählt bei jeder Übernahme hoch; die vorherige Instanz wird im Log genannt.
- **Heartbeat:** alle 30 s (`HEARTBEAT_INTERVAL_MS`), TTL 120 s. Verlängert nur `WHERE runToken = <eigenes>`. Nur ein Timer je Lauf, seriell (der nächste wird nach dem Ende des vorigen geplant), `unref`, beim Ende und Shutdown gestoppt.
- **Verlust:** wird die Verlängerung abgelehnt (0 Zeilen) oder lässt sich die Lease länger als die TTL nicht erneuern (Datenbank weg), wird der `AbortSignal` des Laufs ausgelöst. Die lokale Frist rechnet ab Sendezeit der Anfrage mit einer monotonen Uhr und ist damit nie später als die der Datenbank.
- **Abschluss:** `UPDATE … WHERE runToken = <eigenes>`; ein Lauf ohne Lease schreibt nichts (nur Logzeile `finish=skipped reason=lease-lost`). Neue Status: `interrupted` (Shutdown).
- **Fencing an Nebenwirkungsgrenzen:** `context.runFenced(tx => …)` öffnet eine kurze Transaktion, beweist unter `SELECT … FOR SHARE`, dass die Lease dem Lauf noch gehört, und führt dann die Arbeit aus. Solange sie offen ist, kann keine andere Instanz übernehmen. Keine langen Transaktionen (Timeout 30 s, Arbeit je Vorlage/Erinnerung).
- **Shutdown:** `onModuleDestroy` bricht laufende Jobs ab, wartet höchstens 10 s, gibt die Leases frei.

## 4. Geschäftsjobs: konkrete Doppelwirkungen

| Job | Befund | Änderung |
|---|---|---|
| `recurring-invoices` | **Konkretes Problem.** Erst „Termin vorrücken“ (Claim), dann Rechnung anlegen. Ein Absturz dazwischen verliert die Rechnung (Termin schon weiter, Entwurf fehlt); der Rollback im `catch` greift bei hartem Abbruch nicht. Kein Schutz gegen doppelten Entwurf bei Wiederholung nach Übernahme. | Claim und Entwurf in **einer** fenced Transaktion. Neue Spalten `sales_documents.recurringInvoiceId/recurrenceDate`, **eindeutig** je Vorlage und Fälligkeitsdatum (Migration `20261204130000`). |
| `calendar-reminders` | **Konkretes Problem.** `SENT` gesetzt, dann Benachrichtigung: Absturz dazwischen = Erinnerung „gesendet“, aber keine Benachrichtigung. | Beides in einer fenced Transaktion; `reminderId` ist bereits eindeutig. |
| `inbox-poll` | Bereits idempotent (`messageId` eindeutig; ungelesen bleibt die Mail, bis sie verarbeitet ist). | Nur Abbruchprüfung je Mail, IMAP-Verbindung wird bei Abbruch geschlossen. |
| `ai-agents` | Bereits idempotent (`dedupeKey` eindeutig). | Nur Abbruchprüfung je Organisation. |
| `session-purge` | Löschen ist idempotent. | keine |

**Grenzen (nicht exactly-once):** Ein Job kann nach Übernahme erneut laufen; Wiederholung ist dank der Schlüssel folgenlos. Offen bleibt: (a) Posteingang: Absturz zwischen Anlegen der Mail und KI-Einordnung → Mail ohne Einordnung (kein Duplikat, aber verlorene Einordnung); (b) externe Systeme (IMAP, KI-Anbieter) sind nicht transaktional; (c) nicht „fenced“ Schritte (Inbox, KI) können kurz nach einem Lease-Verlust noch einmal schreiben; die eindeutigen Schlüssel machen das folgenlos.

## 5. Tests

| Bereich | Datei | Anzahl | Vorher → nachher |
|---|---|---|---|
| Frontend: Kontextbindung, Revalidierung, Cache, Dokumente | `apps/web/test/session-context.test.ts` (+ `fake-api.ts`) | 28 | 16 von 19 fehlgeschlagen (Test 16–19 neu) → alle bestanden |
| Frontend (bestehend, an Marker angepasst) | `apps/web/test/session-switch.test.ts` | 20 | bestanden |
| Backend: Marker | `apps/api/test/session-context.e2e-spec.ts` | 6 | neu, bestanden |
| Backend: Lease mit zwei Instanzen auf PostgreSQL | `apps/api/test/jobs-lease.e2e-spec.ts` | 8 | Vorher-Nachweis siehe 1.2 → bestanden |
| Backend: Heartbeat/Timer/DB-Ausfall | `apps/api/src/common/jobs/background-jobs.spec.ts` | 23 (3 neu) | bestanden |
| Backend: Doppelwirkungen | `apps/api/test/jobs-idempotency.e2e-spec.ts` | 10 | bestanden |

Alle ohne `sleep`: Barrieren sind Promises; das „Zeitverstreichen“ der Lease wird per SQL (`lockedUntil` in die Vergangenheit) oder mit Jest-Fake-Timern nachgestellt.

Zuordnung der zehn geforderten Frontend-Szenarien: A→B während GET (Tests 1, 2), Organisation A→B (3), OWNER→MEMBER (4, 6), neue Sitzung gleicher Benutzer (5), Logout bei fünf parallelen GETs (7), umsortierte Revalidierung (8a–8d), Prefetch unter A / Login B (9, 10, 11), Invalidierung bei älterem Request (12, 13, 14), Wechsel bei Dokument-Download (1b, 16, 17, 18), Mutation bei Wechsel mit intaktem CSRF (15).

**Grenzen der Vorher-Nachweise:** (1) Der Hook `useApiResource` selbst ist ohne React-Renderer nicht testbar; die Logik dahinter (Cache, Kontext, Fehlerpfad) ist es. (2) Der harte Prozess-Absturz zwischen Claim und Anlegen lässt sich in einem Prozess nicht auslösen; die Tests injizieren den Fehler an dieser Stelle, und die Atomarität folgt aus der einen Transaktion. Vorher-Fehlschlag gibt es dafür nicht, die Lücke ergibt sich aus dem Code. (3) Die Draft-Erfassung der Oberfläche (`lib/draft-capture.ts`) und der Dialog haben keinen automatischen Test (kein DOM im Testlauf).

## 6. Qualitätsläufe (lokaler Endstand)

Siehe Abschlussbericht der Sitzung (Zahlen dort, weil sie sich bis zur Abnahme noch ändern können). Nicht lokal ausführbar: der Docker-Staging-Smoketest (`infrastructure/tests/staging-smoke.sh`, neue Prüfung des Headers durchs Gateway); er läuft in der CI.

## 7. `pnpm audit --prod`: Bewertung nach Erreichbarkeit

Keine Abhängigkeit wurde geändert; der Befund ist identisch zur Basis (54 Meldungen: 4 niedrig, 28 mittel, 22 hoch).

| Paket(e) | Pfad | Erreichbar? | Bewertung |
|---|---|---|---|
| `hono`, `@hono/node-server`, `fast-uri`, `valibot`, `effect`, `deepmerge-ts`, `mysql2` | `prisma` CLI (`@prisma/dev`, `@prisma/config`) | Nein im API-Betrieb: Der Laufzeitcode importiert nur `@prisma/client`; `prisma dev` (Hono-Server) und MySQL werden nicht gestartet (PostgreSQL). Im Migrate-Image läuft nur `migrate deploy`. | niedrig |
| `brace-expansion`, `minimatch`, `js-yaml`, `browserslist`, `baseline-browser-mapping` | ESLint, Next-Build (styled-jsx, Babel) | Nur Entwicklung/Build, nie mit fremden Eingaben | niedrig |
| `nodemailer` (Adressparser) | `mailparser` im Posteingang | **Ja**, wenn IMAP konfiguriert ist: Der Parser verarbeitet Adressen fremder Mails. Auswirkung laut Meldung: falsch ausgewertete Adresse (nested comment). In Staging ausgeschaltet (kein IMAP). | mittel für Produktion; vor dem Einsatz `mailparser`/`nodemailer` anheben |

## 8. Skeptische Eigenprüfung (nicht unabhängig)

Reihenfolge nach Schwere. „Status“: geschlossen = in diesem Sprint behoben, offen = bleibt, dokumentiert.

| # | Schwere | Fundort | Szenario / Reproduzierbarkeit | Auswirkung | Bestehende Minderung | Empfehlung | Status |
|---|---|---|---|---|---|---|---|
| F-01 | Mittel | `lib/documents.ts` (neu) | Server liefert ein Dokument mit `Content-Type: text/html`; Vorschau aus `blob:`-URL würde Skript in unserer Origin ausführen | gespeichertes XSS | Upload-Allowlist, `nosniff` | Nur PDF/PNG/JPEG/GIF/WebP als Blob anzeigen | **geschlossen** (`isPreviewableType`, Test 19) |
| F-02 | Mittel | Reverse Proxy | Ein Proxy/CDN entfernt `X-Session-Context`: Alle GETs gelten als „Abweichung“, die Seite bleibt leer (fail closed, kein Datenleck) | Verfügbarkeit | Caddy-Config reicht Header durch; Smoketest prüft ihn | Smoketest in der CI abwarten | offen (Prüfung in CI) |
| F-03 | Mittel | `reminders-scheduler.service.ts` | Jeder Fehler beim Verarbeiten setzt die Erinnerung auf `FAILED` und sie wird nie wiederholt, auch bei kurzem DB-Fehler | Erinnerung geht verloren (war vorher gleich) | – | Wiederholungszähler statt sofort `FAILED` | offen (unverändert zur Basis) |
| F-04 | Niedrig | `background-jobs.service.ts` | Nicht kooperative Schritte (laufendes SQL, IMAP-Befehl) laufen nach Lease-Verlust bis zum nächsten Abbruchpunkt weiter; ein Prozess-Einfrieren (SIGSTOP, VM-Pause) zwischen `assertLeaseHeld` und Schreiben ist ohne `runFenced` nicht ausgeschlossen | kurzer Doppellauf | `runFenced` bei Rechnungen und Erinnerungen; eindeutige Schlüssel bei Inbox/KI | Neue Jobs mit externen Wirkungen immer mit Schlüssel oder `runFenced` bauen | offen (dokumentiert, Abschnitt 4) |
| F-05 | Niedrig | `onModuleDestroy` | Die Reihenfolge der Destroy-Hooks von Nest zwischen `PrismaService` und `BackgroundJobsService` ist nicht garantiert; kommt die Trennung zuerst, schlägt die Freigabe fehl | Lease läuft erst nach ≤120 s ab (kein Datenfehler) | TTL | Ablauf mit echtem `SIGTERM` im Staging prüfen | offen (nur auf Service-Ebene getestet) |
| F-06 | Niedrig | `lib/session.ts` | Vor der ersten Sitzungsprüfung (`unknown`/`error`) sind GETs nicht gebunden | Daten der gerade aktiven Sitzung (kein Fremdkontext, weil die Seite noch keinen hat) | `AuthGuard` rendert Inhalte erst ab `authenticated` | – | akzeptiert |
| F-07 | Niedrig | `auth-guard.tsx` | Der Sperrdialog zeigt vom Benutzer getippten Text an; an einem geteilten Rechner sieht ihn, wer nach dem Wechsel vor dem Tab sitzt | geringfügige Offenlegung eigener Eingaben | nur im Speicher, nur geänderte Textfelder, keine Passwörter | Bei Bedarf Anzeige ausblenden und nur Kopieren anbieten | offen (Produktentscheidung) |
| F-08 | Niedrig | `fetchDocumentBlob` | Datei (bis 50 MB) liegt im Arbeitsspeicher | Speicherverbrauch im Browser | Größenlimit beim Upload | – | akzeptiert |
| F-09 | Info | CI/Test | Beim ersten vollständigen Lauf der API-Integrationstests schlugen zwei fremde Suiten mit Hook-Timeout (`resetDatabase`, 30 s) fehl; einzeln und im zweiten vollständigen Lauf bestanden alle (12 von 12, 210 Tests). Ursache nicht geklärt (Docker Desktop unter Windows, Sperre auf `TRUNCATE`). | – | – | Beobachten; CI-Lauf entscheidet | offen |
| F-10 | Info | Mutationen | Antworten auf Mutationen tragen den Marker, werden aber nicht geprüft | keine, CSRF ist an die Sitzung gebunden | CSRF-Token je Sitzung | – | akzeptiert |

Absichtlich **nicht** geändert: Login-Rate-Limit je Instanz (bekannt, Runbook), Retry-Verhalten bei Mutationen, Rollenlogik.

## 9. Hinweise für eine unabhängige Zweitprüfung

1. `session.ts` `sendBoundToContext` Zeile für Zeile gegen die Zustandsübergänge in `setState` lesen (Epoche, Abbruch, Wiederholung, Sperre).
2. Prüfen, ob irgendein `fetch` außerhalb von `session.ts`/`auth-api.ts` existiert (Suche `fetch(` in `apps/web`; heute nur dort).
3. `background-jobs.service.ts`: Rennen zwischen `beat`, `finish` und `abort`; Bedingung `WHERE runToken`; `FOR SHARE` gegen `UPDATE`-Heartbeat (Wartezeit bis zum Ende der kurzen Transaktion).
4. Migrationen `20261204120000` und `20261204130000` auf Rückwärtskompatibilität (nur additive Spalten, Fremdschlüssel `ON DELETE SET NULL`); `prisma migrate diff` zeigt keine Abweichung.
5. Nach dem Deployment in Staging: `SIGTERM` an die API während eines laufenden Jobs, Logzeilen `interrupted` / `took-over` kontrollieren (F-05).

## 10. Nacharbeit nach dem unabhängigen Review von PR #5

Zwei Punkte, beide zuerst per Test reproduziert (Tests 20 und 22 schlugen vor der Änderung fehl).

**10.1 Komponentenzustand nach Kontextwechsel.** Viele Seiten halten ihre Daten in eigenem `useState` (z. B. Dashboard, Verkaufsbeleg, Dokumentvorschau) und bekamen vom Cache-Schutz nichts mit. Zentrale Lösung in `AuthGuard`: Wechselt der Kontext derselben Person (neue Sitzung, neue Rolle), wird der gesamte Inhalt unter dem Guard neu aufgebaut (`key` pro Epoche, `lib/context-key.ts`). Dadurch verschwindet jeder Zustand der alten Rolle, auch offene Dialoge und Vorschauen (Blob-URLs werden beim Abbau freigegeben). Bei einem Wechsel zu einer anderen Person oder Organisation wird der Inhalt dagegen **vollständig aus dem DOM entfernt** (siehe 10.3). Vor dem Neuaufbau werden getippte Eingaben erfasst; ein Hinweis bietet „Eingaben kopieren“ an. Nicht gespeicherte Eingaben gehen beim Neuaufbau verloren, das ist der Preis der Garantie „keine Daten der alten Rolle“.

**Draft-Anzeige:** Nur für dieselbe Person (Rollen-/Sitzungswechsel) wird nach dem Neuaufbau „Eingaben kopieren“ angeboten; Inhalte werden nie angezeigt.

**10.2 Prüfung nur bei den Headern.** Die Kontextprüfung galt beim Eintreffen der Antwort-Header; der Body (JSON, Dateien, Streams) konnte danach noch unter dem alten Kontext ankommen. `sendBoundToContext` liefert jetzt eine Antwort, deren Body-Stream vor jedem Chunk und am Ende die Epoche prüft und sonst mit `SessionChangedError` abbricht (wirkt für `json()`, `blob()`, `text()` und Reader). Auch der KI-Chat (`POST /ai/chat/stream`, `text/event-stream`) ist so abgesichert; andere Mutationsantworten bleiben unverändert (sie beschreiben, was bereits geschehen ist).

Grenzen: Der Neuaufbau und die Dialoge sind ohne DOM im Testlauf nicht automatisch testbar; getestet ist die Entscheidungslogik (`advanceContentKey`, Test 24). Serverseitig laufende Streams (Chat) werden bei Wechsel nicht abgebrochen, nur der Client hört auf zu lesen.

**10.3 Letzter Fix vor dem Merge (Review-Befund).** Bei Wechsel zu einer anderen Person oder Organisation blieb der alte Inhalt per `visibility: hidden` im DOM, und die Drafts waren über „Eingaben kopieren“ lesbar. Jetzt rendert `GuardedContent` (`guard-view.tsx`) im Sperrzustand **nur** den Dialog: kein Inhalts-Teilbaum, keine Drafts, keine Kopierfunktion, nur „Seite neu laden“ und „Zur Anmeldung“. Beim Sperren werden zusätzlich bereits gehaltene Drafts verworfen (`setRefreshed(null)`). Rollen-/Sitzungswechsel derselben Person bleibt beim Remount. Regressionstest `test/guard-view.test.ts` rendert die echte View-Komponente zu HTML (`react-dom/server`; ein kleiner Test-Loader transpiliert `.tsx`) und prüft: kein altes Datum, keine Eingabe, kein `<main`, kein `visibility:hidden`, kein Kopier-Button; und dass er gegen das alte Verhalten fehlschlägt (Mutationsprüfung). Grenzen: kein echter Browser; Hooks von `AuthGuard` selbst (Epoche, Listener) sind nicht Teil des Tests.
