# Sprint 2 – Session-Sicherheit und Frontend-Härtung

Branch: `security/sprint-2-cookie-sessions`, abgezweigt von `feature/erp-ai-security` (Stand `5108afd`, enthält Sprint 1/1.1 über PR #2).

## 1. Ausgangslage und Bedrohungsmodell

Vor Sprint 2 sah die Anmeldung so aus:

- Die API gab nach dem Login ein JWT im JSON-Body zurück. Der Browser speicherte es in `localStorage` und schickte es als `Authorization: Bearer` mit.
- Der Auth-Guard im Frontend prüfte nur, ob dieser Eintrag existierte, nicht, ob die Sitzung auf dem Server noch galt.
- Logout löschte nur den Eintrag im Browser. Auf dem Server gab es nichts zu widerrufen: Ein kopiertes Token blieb bis zum Ablauf gültig (bis 8 h), außer es wurden mit `tokenVersion` alle Sitzungen des Benutzers beendet.
- Upload-Komponenten umgingen den API-Client und lasen das Token selbst aus `localStorage`.

| Bedrohung | Auswirkung vorher | Maßnahme in Sprint 2 |
|---|---|---|
| XSS liest das Token aus `localStorage` | Übernahme des Kontos bis Token-Ablauf, auch von einem fremden Rechner aus | HttpOnly-Cookie: JavaScript sieht das Session-Geheimnis nie |
| Gestohlenes Token nach Logout | blieb gültig | Serverseitige Session wird beim Logout widerrufen |
| CSRF (fremde Seite löst Mutation aus) | nicht möglich, weil Bearer-Header nötig war; mit Cookies wäre es möglich | Session-gebundener CSRF-Token, Origin-/Fetch-Metadata-Prüfung, SameSite=Lax |
| Login-CSRF (Opfer wird in Angreifer-Konto eingeloggt) | – | Origin-Prüfung und nur `application/json` bei Login, Forgot und Reset |
| Session-Fixation | – | Jeder Login erzeugt eine neue Session; ein mitgeschicktes altes Cookie wird widerrufen |
| Datenbank-Leak | – | Es wird nur der SHA-256-Hash des Session-Geheimnisses gespeichert |
| Leak des JWT-Signaturschlüssels | Fälschung beliebiger Tokens | Ein gültig signiertes JWT reicht nicht: Es muss zu einer gespeicherten Session und deren Geheimnis passen |

Nicht abgedeckt: XSS kann innerhalb der offenen Seite weiterhin Anfragen im Namen des Benutzers auslösen, denn das Cookie wird mitgesendet und der CSRF-Token liegt im Speicher. Das Cookie verhindert den Diebstahl und die Nutzung außerhalb des Browsers, ersetzt aber keine XSS-Vermeidung (siehe Restrisiken).

## 2. Cookie- und Session-Architektur

```
Browser                              API (NestJS)                      PostgreSQL
  │ POST /auth/login (JSON)             │                                    │
  │────────────────────────────────────▶│ Passwort prüfen (Sprint-1-Regeln)  │
  │                                     │ secret = 32 Zufallsbytes           │
  │                                     │ INSERT user_sessions               │
  │                                     │   (secretHash = sha256(secret))  ─▶│
  │                                     │ JWT {sub, tv, sid, jti=secret}     │
  │◀── Set-Cookie: __Host-bissinger_session=<JWT>; HttpOnly; Secure;        │
  │    SameSite=Lax; Path=/; Max-Age≤28800                                  │
  │    Body: {user, organization, role, csrfToken, expiresAt}  (kein JWT)   │
```

**Cookie** (`apps/api/src/modules/auth/session-cookie.ts`):

| Attribut | Standard (jede HTTPS-Origin, jede `NODE_ENV` außer development/test) | Nur lokal: development/test **und** alle Origins `http://` auf `localhost`, `127.0.0.1` oder `[::1]` |
|---|---|---|
| Name | `__Host-bissinger_session` | `bissinger_session` |
| HttpOnly | ja | ja |
| Secure | ja | nein |
| SameSite | Lax | Lax |
| Path | `/` | `/` |
| Domain | nicht gesetzt (Host-Only) | nicht gesetzt |
| Max-Age | Restlaufzeit der Session (≤ 8 h) | gleich |

Es gibt keinen Schalter, der `Secure` oder das `__Host-`-Präfix abschaltet. Seit Sprint 2.1 (R2-02) hängt die Entscheidung nicht mehr allein an `NODE_ENV`: Eine HTTPS-Origin bekommt immer das sichere Cookie, auch bei versehentlichem `NODE_ENV=development`. HTTP auf einer externen Domain und eine Mischung aus HTTP und HTTPS lassen die API gar nicht erst starten. Der Browser lehnt ein `__Host-`-Cookie ohne `Secure`, mit `Domain` oder mit anderem Pfad ab. Beim Login und Logout wird ein übrig gebliebenes Cookie der anderen Variante (nach einem Konfigurationswechsel auf demselben Host) mitgelöscht.

**Cookie-Inhalt**: ein mit HS256 signiertes JWT (gleiches Secret und gleiche Laufzeitbegrenzung wie in Sprint 1, höchstens 8 h). Claims:

- `sub`: Benutzer-ID
- `tv`: `tokenVersion`
- `sid`: ID der Session-Zeile
- `jti`: zufälliges Session-Geheimnis

**Tabelle `user_sessions`** (Migration `20261125120000_user_sessions`):

| Spalte | Bedeutung |
|---|---|
| `id` | UUID, Session-ID (`sid`) |
| `userId` | FK auf `users`, `ON DELETE CASCADE` |
| `secretHash` | SHA-256 des Geheimnisses (hex), eindeutig; nie das Geheimnis selbst |
| `createdAt`, `expiresAt` | Ablauf = Login + Session-Laufzeit |
| `revokedAt` | gesetzt bei Logout, Sperre, Admin-Widerruf, Passwort-Reset |
| `lastUsedAt` | höchstens alle 5 Minuten aktualisiert |

Indizes: `secretHash` (eindeutig), `(userId, revokedAt)`, `expiresAt`.

**Prüfung bei jeder geschützten Anfrage** (`jwt.strategies.ts`), in dieser Reihenfolge:

1. Das JWT kommt nur aus dem Session-Cookie. Es gibt keinen Bearer-Fallback mehr, siehe unten. Signatur (nur HS256) und `exp` werden geprüft.
2. Die Session-Zeile existiert, gehört zu `sub`, ist nicht widerrufen und nicht abgelaufen. `sha256(jti)` entspricht `secretHash` (zeitkonstanter Vergleich).
3. Die Sprint-1-Regeln bleiben unverändert: Konto nicht archiviert, Mitgliedschaft in einer aktiven Organisation, `tokenVersion` stimmt. Danach greifen Rollen und Projektrechte wie bisher (`RolesGuard`, `ProjectWriteGuard`, Service-Prüfungen).
4. Bei zustandsändernden Methoden muss der CSRF-Token zu genau dieser Session passen, sonst 403 (Abschnitt 3).

**Bearer-Authentifizierung entfernt.** Im Repository gibt es keinen Nicht-Browser-Client der API. Die KI-Agenten laufen im API-Prozess, das CLI greift direkt auf die Datenbank zu. Ein zweiter Anmeldeweg würde CSRF- und Session-Regeln umgehen. Ein `Authorization: Bearer <Session-JWT>` wird daher mit 401 abgelehnt; das ist getestet. Braucht es später eine Maschinenschnittstelle, bekommt sie eigene API-Schlüssel mit eigenen Regeln.

**Bereinigung**: Beim Login werden abgelaufene und widerrufene Sessions des Benutzers gelöscht. Ein stündlicher Cron (`SessionService.purgeEndedSessions`) löscht alle Sessions, die seit mehr als 24 h beendet sind. Die Tabelle wächst damit nicht unbegrenzt.

## 3. CSRF-Schutz und Origin-Prüfung

Drei Schichten, jede für sich getestet:

1. **Session-gebundener CSRF-Token** (`csrf.ts`), OWASP-Muster "HMAC-based token":
   - `token = HMAC-SHA256(K, "session:" + sid)`, mit `K = HMAC-SHA256(JWT_SECRET, "bissinger-os/csrf/v1")` (Domänentrennung).
   - Der Client kann den Token nicht selbst erzeugen: Der Schlüssel bleibt auf dem Server, und die `sid` steckt nur im HttpOnly-Cookie.
   - Eine andere Session (auch desselben Benutzers) hat einen anderen Token.
   - Der Token wird zeitkonstant verglichen.
   - Der Browser bekommt ihn im JSON von `POST /auth/login` und `GET /auth/session`, hält ihn nur im Arbeitsspeicher und sendet ihn als `X-CSRF-Token`. Er steht in keinem Cookie, keiner URL und keinem Web Storage. Ein Double-Submit-Cookie gibt es nicht.
   - Geprüft wird bei allen Methoden außer GET, HEAD und OPTIONS, also POST, PUT, PATCH, DELETE und alle anderen. Die Prüfung sitzt in der Authentifizierungsstrategie und gilt damit automatisch für jede geschützte Route, auch Multipart-Uploads und den KI-Stream. Tests zählen alle Express-Routen auf und prüfen, dass jede mutierende Route ohne Token und mit dem Token einer anderen Session mit genau dieser CSRF-Ablehnung antwortet.
   - Die Ablehnung ist eindeutig erkennbar: `{"statusCode":403,"error":"Forbidden","message":"CSRF-Prüfung fehlgeschlagen","code":"CSRF_INVALID"}`. Rollen- und Projektfehler tragen keinen `code`, Origin-Ablehnungen `ORIGIN_REJECTED`. Nur `CSRF_INVALID` darf der Client mit einer erneuten Session-Abfrage beantworten (Abschnitt 11).
2. **Origin und Fetch Metadata** (`common/http/request-origin.ts`) für jede zustandsändernde Anfrage, angemeldet oder nicht:
   - Steht ein `Origin`-Header in der Anfrage, muss er exakt auf der Allowlist aus `WEB_ORIGIN` stehen, sonst 403. Das gilt auch für `Origin: null` und Lookalikes wie `http://localhost:3000.evil.example`.
   - Fehlt `Origin` und meldet `Sec-Fetch-Site` `cross-site` oder `same-site`, folgt 403.
   - Fehlen beide Header, handelt es sich um einen Nicht-Browser-Client; der kann keine Cookies eines Opfers mitschicken. Für alles Authentifizierte gilt trotzdem der CSRF-Token.
3. **Content-Type und Parser**:
   - Login, Forgot und Reset akzeptieren nur `application/json`, sonst 415. Ein HTML-Formular kann kein JSON senden, und ein Cross-Origin-`fetch` mit JSON braucht einen Preflight, den fremde Origins nicht bestehen. Seit Sprint 2.1 (R2-03) hängt die Prüfung als `JsonBodyGuard` direkt an den drei Routen, statt URL-Strings zu vergleichen. Sie greift damit für jede Pfadvariante, die der Router annimmt (Groß-/Kleinschreibung, Schrägstrich am Ende).
   - Die API registriert keinen urlencoded-Parser mehr (`bodyParser: false` und nur JSON). Formular-Bodies bleiben leer und scheitern an der Validierung.
   - `X-HTTP-Method-Override` wird nicht ausgewertet.

Weitere Punkte:

- **SameSite=Lax** ist nur Zusatzschutz, die Tokens sind die eigentliche Absicherung.
- **GET-Endpunkte** verändern keinen Zustand. Logout gibt es nur als POST; `GET /auth/logout` liefert 404.
- **Logout** ist ohne gültige Session erreichbar, damit ein totes Cookie immer gelöscht werden kann. Bei gültiger Session verlangt Logout den CSRF-Token, sonst 403 und die Session bleibt bestehen. Von fremden Origins wird Logout ebenfalls abgelehnt.

**CORS** (`app-setup.ts`):

- `credentials: true` nur für die exakte Allowlist, niemals `*`.
- Methoden `GET POST PATCH PUT DELETE`, Header `Content-Type, X-CSRF-Token`, Preflight-Cache 600 s.
- Fremde Origins bekommen keinen `Access-Control-Allow-Origin`-Header.

## 4. Login, Logout, Session-Abfrage

| Endpunkt | Verhalten |
|---|---|
| `POST /api/v1/auth/login` | Sprint-1-Prüfungen, Rate-Limit 5/min. Neue Session, Cookie setzen, ein mitgeschicktes altes Cookie widerrufen (Fixation). Der Body enthält `user`, `organization`, `role`, `csrfToken`, `expiresAt`, aber kein JWT und kein Geheimnis. |
| `GET /api/v1/auth/session` | 200 mit denselben Feldern für die aktuelle Session (Reload, Tab-Fokus). 401 löscht das Cookie (`Set-Cookie` mit Ablauf 1970). |
| `POST /api/v1/auth/logout` | 204. Widerruft nur die aktuelle Session und löscht das Cookie. Andere Geräte bleiben angemeldet. |

Alle API-Antworten tragen `Cache-Control: no-store` und `Pragma: no-cache`.

**Frontend** (`apps/web/lib`):

- **`session.ts`** hält den Session-Zustand im Arbeitsspeicher und wird über `useSyncExternalStore` gelesen.
  - Parallele Abfragen teilen sich einen Request.
  - Ein alter `accessToken` in `localStorage` wird beim Start gelöscht und nicht übernommen.
  - Logins und Logouts werden per `BroadcastChannel` an andere Tabs gemeldet; diese fragen die Session neu ab.
  - Gehört die Session danach einem anderen Benutzer oder einer anderen Organisation, lädt die Seite **nicht** neu. Sie zeigt ein Banner, behält ungespeicherte Eingaben und sendet keine Requests mehr (Abschnitt 11).
- **`auth-api.ts`**: `apiFetch` und `apiFetchRaw` senden immer `credentials: "include"`.
  - Mutationen bekommen den CSRF-Header. FormData und Blob behalten den Content-Type des Browsers.
  - Retry-Regeln siehe Abschnitt 11: höchstens ein Retry, nur nach `CSRF_INVALID` und nur bei unveränderter Identität.
  - 401 führt zu "Sitzung abgelaufen" und zur Login-Seite.
- **Auth-Guard** (`use-auth-guard.ts`, `auth-guard.tsx`): Geschützte Inhalte erscheinen erst, wenn der Server die Session bestätigt hat, es gibt also keinen Flash.
  - Ohne Session geht es zu `/login`. War der Tab zuvor angemeldet, erscheint der Hinweis "Sitzung abgelaufen".
  - Bei einem Netzwerkfehler vor dem ersten Rendern erscheint eine Fehlermeldung mit "Erneut versuchen".
  - Wird der Tab wieder sichtbar, prüft der Guard die Session neu. Damit werden Rollenwechsel, Sperren und Logouts aus anderen Tabs erkannt. Schlägt diese Prüfung fehl, bleibt die offene Seite stehen.
- **Logout** (`useLogout`): Zur Login-Seite geht es nur nach 204 vom Server. Bei Netzwerk- oder Serverfehler erscheint "Abmelden fehlgeschlagen … Sitzung ist weiterhin aktiv". Die Navigation per `window.location` verwirft alle Caches im Speicher.
- **`useCurrentUser`** liest aus der Session statt aus einem modulweiten Promise. Rolle und Benutzer stammen damit immer aus der aktuellen Session.
- Gesperrte Konten bekommen vom Server bewusst dieselbe 401 wie abgelaufene Sessions, ohne Hinweis auf den Grund. Sie landen deshalb wie bei einer abgelaufenen Session auf der Login-Seite. Fehlende Rollenrechte zeigen weiterhin die vorhandene "Kein Zugriff"-Seite (`AdminOnly`).

## 5. Session-Invalidierung

| Ereignis | Session-Zeilen | `tokenVersion` |
|---|---|---|
| Logout | nur die aktuelle wird widerrufen | unverändert |
| `POST /users/:id/revoke-sessions` | alle des Benutzers | +1 |
| `POST /users/:id/deactivate` (Sperre) | alle | +1, `archivedAt` gesetzt |
| Passwort-Reset | alle (in derselben Transaktion) | +1 |
| Organisation gesperrt oder Mitgliedschaft entfernt | bleiben bestehen, werden aber bei jeder Anfrage über die Sprint-1-Prüfung abgelehnt | – |

`tokenVersion` bleibt als zweite Barriere erhalten. Auch eine Session, deren Widerruf aus irgendeinem Grund fehlen sollte, scheitert an der Versionsprüfung.

## 6. Lokale Entwicklung und HTTPS-Produktion

**Produktion** (Caddy, `infrastructure/docker/Caddyfile`): Website und API liegen auf derselben Domain (`/` und `/api/*`). Die Requests sind same-origin; CORS spielt praktisch keine Rolle. Das Cookie ist `__Host-…; Secure`. `WEB_ORIGIN` muss genau `https://<DOMAIN>` sein, sonst startet die API nicht.

**Lokal**: Next.js läuft auf `http://localhost:3000`, die API auf `http://localhost:4000`.

- Die beiden Ports sind verschiedene Origins, aber dieselbe Site (Cookies und SameSite unterscheiden keine Ports).
- Das Cookie wird deshalb bei `fetch(..., {credentials: "include"})` mitgesendet.
- CORS erlaubt `http://localhost:3000` mit Credentials.

**`localhost` und `127.0.0.1` nicht mischen.**

- Für den Browser sind das zwei verschiedene Hosts und Sites. Ein Cookie, das `localhost:4000` setzt, wird an `127.0.0.1:4000` nicht gesendet.
- `http://127.0.0.1:3000` steht nicht auf der Origin-Allowlist; Mutationen von dort werden mit 403 abgelehnt (getestet).
- Ein Aufruf von `localhost:3000` an `127.0.0.1:4000` wäre cross-site: SameSite=Lax würde das Cookie zurückhalten.
- Darum `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` und `WEB_ORIGIN=http://localhost:3000` verwenden und die App unter `http://localhost:3000` öffnen.

## 7. Umgebungsvariablen

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `JWT_SECRET` | Produktion | Signiert das Session-JWT. Der CSRF-Schlüssel wird daraus abgeleitet. Ein Wechsel beendet alle Sessions. |
| `JWT_EXPIRES_IN_MINUTES` | nein | Sessiondauer, 1–480, Standard 480 |
| `WEB_ORIGIN` | Produktion | exakte `https://`-Origin(s), kommagetrennt, ohne Pfad und ohne Slash am Ende. In development/test sind zusätzlich `http://`-Origins auf `localhost`, `127.0.0.1` oder `[::1]` erlaubt, aber nicht gemischt mit HTTPS. Die Origin bestimmt die Cookie-Sicherheit. |
| `TRUST_PROXY` | hinter Caddy | Client-IP für das Rate-Limiting (unverändert) |
| `NEXT_PUBLIC_API_URL` | Web-Build | Produktion: `https://<DOMAIN>/api/v1`; lokal: `http://localhost:4000/api/v1` |

Neue Secrets gibt es nicht.

## 8. Migration

`20261125120000_user_sessions` ist rein additiv: eine neue Tabelle mit Fremdschlüssel und Indizes. Benutzer- und Organisationsdaten werden nicht angefasst. Folgen:

- Alte JWTs aus `localStorage` enthalten keine `sid` und werden abgelehnt. Nach dem Deployment meldet sich jeder Benutzer einmal neu an.
- Lokal:
  1. Schritte aus Sprint 1 erledigen, falls noch offen: `user-admin check-emails`.
  2. `pnpm --filter api exec prisma migrate deploy` ausführen.
  3. API neu starten.
- Prüfung: gegen die Testdatenbank `bissinger_os_test` und die isolierte Smoke-Datenbank `bissinger_os_smoke` ausgeführt. `prisma migrate diff` zwischen migrierter Datenbank und `schema.prisma` ergibt eine leere Migration.

## 9. Tests und Ergebnisse

Siehe Abschnitt "Testergebnisse" am Ende dieses Dokuments. Dort stehen die exakten Befehle und Zahlen des letzten Laufs.

Neue oder geänderte Tests:

- **`apps/api/test/session-security.e2e-spec.ts`** (39 Tests)
  - Cookie-Attribute in Test- und Produktionskonfiguration, kein JWT im Body
  - Hash-Speicherung, Session-Fixation, Login-CSRF (fremde Origin, Formular, text/plain)
  - fehlende, kaputte, abgelaufene und widerrufene Sessions, falsches Geheimnis, gefälschtes JWT ohne Session, Bearer abgelehnt
  - Reload, Rollenwechsel, Organisations- und Kontosperre
  - Logout: nur aktuelles Gerät, CSRF-Pflicht, fremde Origin, ohne Session
  - Passwort-Reset und Admin-Widerruf beenden alle Sessions
  - CSRF bei POST, PATCH und DELETE: fehlender, manipulierter oder fremder Token, fremde Origin, `null`, Lookalike, cross-site, Method-Override, Formular-Body
  - Multipart-Upload und KI-Stream mit und ohne Token; Sweep über alle mutierenden Routen
  - CORS-Preflight erlaubt und fremd, `127.0.0.1` vs. `localhost`, Session-Bereinigung
- **`apps/api/src/modules/auth/session-security.spec.ts`** (Unit): Cookie-Konfiguration je Umgebung, Cookie-Parser, CSRF-Token-Bindung, Origin-Middleware.
- **`auth-config.spec.ts`**: Produktion verlangt eine gültige `WEB_ORIGIN`.
- **`auth.service.spec.ts`**: Login öffnet eine Session, kein Cookie-Wert im Body, Fixation.
- **Sprint-1-Suiten** (`auth`, `authorization`, `provisioning`, `security-review`): unverändert in ihren Assertions, nur auf Cookie und CSRF umgestellt (`asUser()` statt `bearer()`).
  - Der Harness nutzt jetzt dieselbe HTTP-Pipeline wie der Server (`configureApp`), also mit CORS, Origin-Prüfung und JSON-only.
  - Einzige fachliche Anpassung: `POST /auth/logout` steht in der Liste der öffentlichen Routen des Default-Deny-Tests. Ohne Session ändert Logout nichts und löscht nur das Cookie; mit Session gilt die CSRF-Pflicht, die eigene Tests abdecken.

Der Browser-Smoke-Test läuft mit Chromium (Playwright, headless) gegen API und Next-Dev-Server mit der isolierten Smoke-Datenbank. Ablauf:

1. Login, Dashboard, Reload
2. Kunden, Projekt, Upload
3. Mutation ohne Token (403)
4. Logout, zweites Gerät bleibt angemeldet
5. Login als anderer Benutzer, MEMBER sieht "Kein Zugriff"
6. Storage-Prüfung

## 10. Restrisiken und offene Punkte

- **XSS bleibt das Hauptrisiko.** Das Cookie ist nicht stehlbar, aber Script im Seitenkontext kann Anfragen auslösen. Empfehlung für Sprint 3: eine Content-Security-Policy für die Next-App (nonce-basiert); Next setzt derzeit keine CSP.
- **Rate-Limiting** zählt weiter pro IP und im Speicher einer Instanz (aus Sprint 1).
- **Keine Liste aktiver Sitzungen in der UI** und kein "Alle anderen Geräte abmelden" für den Benutzer selbst; Admins können per `revoke-sessions` alle beenden.
- **Keine gleitende Verlängerung**: Eine Session endet spätestens 8 h nach dem Login, auch bei Aktivität. Das ist gewollt (Obergrenze aus Sprint 1).
- **`JWT_SECRET`-Rotation** beendet alle Sessions und ändert alle CSRF-Tokens. Ein Mehr-Schlüssel-Betrieb ist nicht vorgesehen.
- **Nicht-Browser-Clients ohne `Origin` und `Sec-Fetch-Site`** passieren die Origin-Schicht. Sie können aber keine fremden Cookies mitschicken und brauchen für Mutationen trotzdem Session und CSRF-Token.
- **Sehr alte Browser** ohne `Origin` bei POST und ohne Fetch Metadata: Bei Login, Forgot und Reset bleibt der JSON-Zwang als Schutz, bei allem Authentifizierten der CSRF-Token.
- **Abhängigkeiten** (`pnpm audit --prod`): 0 kritisch, 21 hoch, alle in Tooling-Ketten (Prisma-CLI, ESLint, browserslist über Next/Babel). Moderat: unter anderem eine eigene `nodemailer`-Kopie von `mailparser` (Posteingang). Unverändert gegenüber Sprint 1.1, nicht Teil dieses Sprints.

## 11. Sprint 2.1: Behebung der Review-Befunde

### Befunde, Ursachen, Korrekturen

| ID | Schwere | Ursache | Korrektur | Dateien |
|---|---|---|---|---|
| R2-04 | Mittel | Der Client wiederholte eine Mutation nach jedem 403 mit "CSRF-Prüfung fehlgeschlagen" mit dem Token der neu geladenen Session, ohne zu prüfen, wem diese gehört. War das Cookie inzwischen an einen anderen Benutzer übergegangen, lief die Mutation unter dessen Identität (Notiz mit falschem Autor, Kunde in fremder Organisation). | Identitätsgebundenes Senden (`sendAsCurrentIdentity`). Es gibt höchstens einen Retry, nur nach `code: CSRF_INVALID` und nur bei gleichem Benutzer **und** gleicher Organisation. Sonst wird der Request mit `SessionChangedError` abgebrochen. Ein Banner erscheint, Eingaben bleiben erhalten, es folgen keine weiteren Requests und kein Reload. Das gilt auch für Logout. | `apps/web/lib/session.ts`, `apps/web/lib/auth-api.ts`, `apps/web/app/(app)/_components/auth-guard.tsx`, `apps/api/src/modules/auth/csrf.ts`, `jwt.strategies.ts`, `auth.service.ts` |
| R2-02 | Niedrig–mittel | Die Cookie-Sicherheit hing nur an `NODE_ENV`. Mit `NODE_ENV=development` auf einer HTTPS-Domain entstand ein Cookie ohne `Secure`. | Die Cookie-Variante folgt der Origin (`allowsInsecureLocalCookies`). Strengere Startprüfung: kein HTTP außerhalb von Loopback, keine Mischung aus HTTP und HTTPS. Stale Duplikate werden gelöscht. | `apps/api/src/common/http/request-origin.ts`, `apps/api/src/modules/auth/session-cookie.ts` |
| R2-01 | Niedrig | Ein Python-Edit hat unter Windows ohne Encoding-Angabe (cp1252) geschrieben. Dadurch lag in `auth.service.ts` ein Einzelbyte `0xFC` in einer UTF-8-Datei, und die Logout-Meldung kam mit einem Ersatzzeichen statt „ü“ an. | Datei repariert. Die Meldung kommt jetzt aus einer zentralen Konstante (`CsrfTokenException`). `apps/api/.env.example` ist von Latin-1 auf UTF-8 umgestellt. Ein Repo-weiter Encoding-Test prüft alle Textdateien. | `auth.service.ts`, `csrf.ts`, `apps/api/.env.example`, `apps/api/src/source-encoding.spec.ts` |
| R2-03 | Info | Die JSON-Pflicht verglich `req.path` exakt. Express routet aber ohne Rücksicht auf Groß-/Kleinschreibung und Schrägstrich am Ende, daher lieferte `/auth/LOGIN/` 400 statt 415. Ausnutzbar war das nicht. | `JsonBodyGuard` an den drei Routen; die Pfadliste in der Middleware ist entfernt. | `apps/api/src/modules/auth/guards/json-body.guard.ts`, `auth.controller.ts`, `request-origin.ts` |

### Verhalten bei einem Sessionwechsel

Serverseitig bindet der CSRF-Token jede Mutation an genau die Session, die die Seite kannte (`HMAC(K, sid)`). Wechselt das Cookie, gleich zu welchem Zeitpunkt (vor dem Absenden, während der Request unterwegs ist, kurz vor einem Retry), passt der Token nicht mehr zur Session des Cookies. Der Server lehnt dann mit `403 CSRF_INVALID` ab, bevor ein Handler läuft. Deshalb ist kein zusätzlicher Session-Kontext nötig: Der Token **ist** die serverseitig geprüfte Bindung.

Der Client entscheidet danach:

| Fall | Verhalten |
|---|---|
| GET, HEAD, OPTIONS | nie wiederholt |
| Mutation, Antwort ≠ 403 oder 403 ohne `CSRF_INVALID` (Rolle, Projekt, Origin) | kein Retry, Fehler wird angezeigt |
| Mutation, `CSRF_INVALID`, neu gelesene Session gehört **demselben** Benutzer und derselben Organisation (z. B. Neuanmeldung desselben Benutzers in einem anderen Tab) | genau **ein** Retry mit dem Token der neuen Session; eine zweite Ablehnung ist endgültig |
| Mutation, `CSRF_INVALID`, anderer Benutzer **oder** andere Organisation | kein Retry. `SessionChangedError`, Banner „Die Anmeldung hat sich geändert. Bitte überprüfe deine Eingaben und lade die Seite neu.“ Die Seite bleibt stehen, Eingaben bleiben erhalten. |
| Danach | Jeder weitere Request dieser Seite wird lokal blockiert, auch GET und Logout, bis der Benutzer neu lädt. Erst der Reload baut alle Caches aus der neuen Session auf. |
| Anderer Tab meldet Login/Logout (BroadcastChannel), Tab wird wieder sichtbar | Session wird neu gelesen. Andere Identität: Banner wie oben, kein Reload. Abgemeldet: wie bisher Hinweis "Sitzung abgelaufen" und Login-Seite. |

Ein Rollenwechsel desselben Benutzers (z. B. OWNER → MEMBER durch einen Admin) ist kein Identitätswechsel. Er wird beim nächsten Request serverseitig durchgesetzt.

### Neue Regressionstests

- `apps/web/test/session-switch.test.ts` (19 Tests, `pnpm --filter my-app test`, läuft über `pnpm test` auch in der CI): der echte Browser-Client gegen eine Fake-API mit der CSRF-Regel des Servers.
  - Wechselpaare: OWNER → MEMBER, MEMBER → OWNER, Benutzer A → B, Organisation A → B.
  - Mutationen: Kunde, Notiz, Rechnung, Upload, Projektbearbeitung.
  - Zeitpunkte: Wechsel während des Requests, kurz vor dem Retry, fünf parallele POSTs.
  - Erlaubter Retry bei gleicher Identität; generischer 403 ohne Retry.
  - Blockade nach einem Wechsel; Hintergrundprüfung ohne Reload; Logout ohne Fremd-Logout.
  - Gegenprobe: Mit dem alten Retry-Verhalten scheitern 15 der 19 Tests.
- `apps/api/test/session-switch.e2e-spec.ts` (13 Tests): API-seitig dieselben Wechsel.
  - Ein fremder Session-Token führt auf keiner mutierenden Route zur Ausführung (Sweep über alle Routen, Code `CSRF_INVALID`).
  - Parallele POSTs: Nur Requests mit passendem Token laufen.
  - Fehlercodes sind unterscheidbar.
  - JSON-Pflicht für alle Routenvarianten × Formular, text/plain, Multipart, ohne Body; Enumeration aller cookie-losen Auth-Routen.
- `apps/api/test/sprint2-review.e2e-spec.ts`: R2-01, R2-02 und R2-03 laufen jetzt als normale `it`-Tests, die Assertions sind teils strenger (exakter Fehler-Body, nur 415, genau ein Session-Cookie).
- `apps/api/test/auth.e2e-spec.ts`: Die Sprint-1-JWT-Fälschungstests nutzen jetzt eine echte, gespeicherte Session (gültige `sid`/`jti`) und eine Positivkontrolle. Sie prüfen damit tatsächlich Algorithmus, Signatur, Schlüssel, Ablauf, Claims sowie widerrufene, abgelaufene und gelöschte Session-Zeilen.
- Unit-Tests: Cookie-Matrix (HTTP-Loopback, HTTPS in Entwicklung, HTTPS in Produktion, externe HTTP-Domain, Mischung, ungültig), Cookie-Löschung mit exakten Attributen, Startprüfung der Origins, `JsonBodyGuard`, CSRF-Fehler-Body, Repo-weite UTF-8-Prüfung (Gegenprobe: ein eingefügtes `0xFC` wird erkannt).
- Browser (`docs/security/probes/sprint2-frontend-probes.mjs`, Chromium gegen die isolierte Smoke-Datenbank):
  - R2-04 ist nicht mehr reproduzierbar: genau ein POST (403), keine Notiz gespeichert, Banner sichtbar, Eingabe erhalten, keine Navigation.
  - Ein anderer Tab zeigt bei einem Benutzerwechsel das Banner, ohne neu zu laden, und behält den Entwurf.
  - Back-Button nach Logout und Leak-Prüfung halten weiterhin.

### Testisolation

Im Gesamtlauf deadlockte das `TRUNCATE … CASCADE` in `resetDatabase` gelegentlich (`40P01`), danach liefen Folgetests in Timeouts. Einzeln liefen alle Suiten grün, ohne lange Transaktionen.

Wahrscheinliche Ursache: die Cron-Jobs der Test-Apps, vor allem der minütliche Reminder-Job, der `reminders` zusammen mit `calendar_events` liest. Er lief gleichzeitig mit dem TRUNCATE und sperrte die Tabellen in anderer Reihenfolge. Den Deadlock gezielt nachzustellen ist nicht gelungen.

Der Test-Harness stoppt jetzt alle Cron-Jobs nach dem Start der Test-App; Tests rufen benötigte Jobs direkt auf. Der Produktivcode ist davon nicht betroffen. Browser- und Integrationstests laufen gegen getrennte Datenbanken (`bissinger_os_smoke`, `bissinger_os_test`) und nicht gleichzeitig.

### Verbleibende Risiken

- Eine GET-Antwort, die exakt im Moment des Cookie-Wechsels unterwegs ist, kann Daten der neuen Identität in die alte Seite liefern, bevor der Wechsel erkannt wird. Das betrifft nur Lesezugriffe im selben Browser; die nächste Session-Prüfung zeigt das Banner.
- Der Abmelde-Fall in einem anderen Tab führt weiterhin zur Login-Seite. Ungespeicherte Eingaben gehen dort verloren; das ist bewusst so, damit nach einem Logout keine geschützten Daten sichtbar bleiben.
- Lokale Entwicklung: `bissinger_session` ist nicht an einen Port gebunden und wird an jeden Dienst auf `localhost` geschickt.
- Die Browser-Proben laufen nicht in der CI (sie brauchen API, Web, Datenbank und Chromium). Die CI deckt R2-04 über die Web-Unit-Tests und die API-Integrationstests ab.

## Testergebnisse Sprint 2 (19.11.2026, lokal, Windows 11, PostgreSQL 17 in Docker)

| Befehl | Ergebnis |
|---|---|
| `pnpm --filter api test` | bestanden: 25 Suiten, 215/215 Tests |
| `pnpm --filter api test:e2e` (`bissinger_os_test`) | bestanden: 6 Suiten, 138/138 Tests, davon 39 neue in `session-security.e2e-spec.ts` |
| `pnpm typecheck` | bestanden (API und Web) |
| `pnpm lint` | bestanden (API und Web, 0 Fehler, 0 Warnungen) |
| `pnpm --filter api build`, `pnpm --filter my-app build` | bestanden. Einzeln ausgeführt, weil `turbo build` unter Windows nach den Builds hängen bleibt (bekannt aus Sprint 1). |
| `pnpm audit --prod` | 0 kritisch, 21 hoch, 28 moderat, 4 niedrig. Alle hohen Befunde liegen in Tooling-Ketten (siehe Restrisiken). |
| `git diff --check` | sauber |
| Browser-Smoke-Test (Chromium headless, Playwright) | 23/23 Prüfungen bestanden |

**Hinweis zum e2e-Lauf:** Lief die Suite parallel zu Browser-Test, Next-Dev-Server und API, liefen einzelne `beforeEach`-Hooks (TRUNCATE) in das 30-s-Timeout. Ohne parallele Last lief sie vollständig grün. Dabei wurden die Datenbank-Sperren mitprotokolliert: Es blieb keine Transaktion offen, es gab nur die beabsichtigten, kurzen Organisationssperren von `runAsAdmin`.

**Smoke-Ablauf:**

- Alter `accessToken` in `localStorage` wird gelöscht.
- Geschützte Seite ohne Session leitet auf `/login`.
- Login führt auf `/dashboard`. Das Cookie ist HttpOnly, SameSite=Lax und Host-Only; in `document.cookie` ist es nicht sichtbar, im Web Storage liegt kein JWT.
- Nach einem Reload bleibt die Session bestehen.
- Kundenliste, Projektseite und Upload im Dokumente-Tab funktionieren (201, mit `X-CSRF-Token`, ohne `Authorization`).
- Eine Mutation ohne Token aus dem Seitenkontext ergibt 403.
- Logout liefert 204, das Cookie ist gelöscht, `/dashboard` leitet auf `/login`. Das zweite Gerät bleibt angemeldet (200).
- Nach dem Login als MEMBER zeigt `/finance` "Kein Zugriff". Danach liegt weiterhin kein JWT im Speicher.

In der Browser-Konsole erscheinen nur die erwarteten Antworten: 401 bei Session-Prüfungen ohne Anmeldung und 403 beim absichtlich gefälschten Request.

## Testergebnisse Sprint 2.1 (19.11.2026, lokal, Windows 11, PostgreSQL 17 in Docker)

Alle Läufe nacheinander, nie zwei Testprozesse gegen dieselbe Datenbank.

| Befehl | Ergebnis |
|---|---|
| `pnpm --filter api test` | bestanden: 26 Suiten, 246/246 Tests (inkl. Encoding-Prüfung) |
| `pnpm --filter my-app test` | bestanden: 19/19 Tests (R2-04, Client) |
| `pnpm --filter api test:e2e` | bestanden: 8 Suiten, 175/175 Tests, zweimal hintereinander. Vor dem Harness-Fix: ein Lauf mit 3 Fehlern durch einen TRUNCATE-Deadlock (siehe Testisolation). |
| `pnpm typecheck` | bestanden |
| `pnpm lint` | bestanden (API und Web) |
| `pnpm --filter api build`, `pnpm --filter my-app build` | bestanden |
| `pnpm audit --prod` | 0 kritisch, 21 hoch, 28 moderat, 4 niedrig; unverändert, alle hohen Befunde im Tooling |
| `git diff --check` | sauber |
| Browser-Proben R2-04 (`docs/security/probes/sprint2-frontend-probes.mjs`) | alle 6 Prüfungen halten |
| Browser-Smoke-Test (`docs/security/probes/sprint2-smoke.mjs`) | 23/23 |
