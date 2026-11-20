# Privates Staging

Bissinger OS läuft als Staging-Umgebung auf einem Linux-Host. Erreichbar ist es nur für berechtigte Geräte im Tailnet, über HTTPS mit dem Tailscale-Zertifikat. Es gibt keinen öffentlichen Port und keinen öffentlichen DNS-Eintrag.

Weitere Dokumente:

- Backups und Wiederherstellung: [backup-and-restore.md](backup-and-restore.md)
- Laufender Betrieb: [operations-runbook.md](operations-runbook.md)

## Architektur

```
Mitarbeiter-Browser (Gerät im Tailnet)
        │  HTTPS  https://<host>.<tailnet>.ts.net   (Tailscale-Zertifikat, nur Tailnet)
        ▼
tailscaled auf dem Host  ──  tailscale serve --bg http://127.0.0.1:8080
        │  HTTP, nur Loopback
        ▼
proxy (Caddy)  127.0.0.1:8080 -> :80      Netz: ingress + edge
        ├── /api/*  ─▶ api (NestJS) :4000   Netz: edge + backend
        └── /*      ─▶ web (Next.js) :3000  Netz: edge
                         │
api ──▶ postgres :5432 (PostgreSQL 17)         Netz: backend (intern)
api ──▶ seaweedfs :8333 (S3, Bucket privat)    Netz: backend (intern)
api ──▶ mailpit :1025 (fängt alle Mails ab)    Netz: backend (intern)
backup ──▶ postgres + seaweedfs ──▶ ${STAGING_BACKUP_DIR} (verschlüsselt) ──▶ offsite (empfohlen)
```

| Dienst | Image | Netz | Host-Port | Persistenz |
|---|---|---|---|---|
| proxy | `caddy:2.11.4-alpine` | ingress, edge | `127.0.0.1:${STAGING_PROXY_PORT}` (Standard 8080) | `caddy_data`, `caddy_config` |
| web | `bissinger-os/web` (Next.js 16 standalone) | edge | – | – (read-only) |
| api | `bissinger-os/api` (NestJS) | edge, backend | – | – (read-only) |
| migrate | `bissinger-os/migrate` (Prisma-CLI) | backend | – | einmaliger Job |
| storage-init | `bissinger-os/backup` | backend | – | einmaliger Job |
| postgres | `postgres:17.11-alpine` | backend | – | `pgdata` |
| seaweedfs | `chrislusf/seaweedfs:4.54` | backend | – | `objects` |
| mailpit | `axllent/mailpit:v1.30.4` | backend | – | im Speicher |
| backup | `bissinger-os/backup` | backend | – | `${STAGING_BACKUP_DIR}` |

`edge` und `backend` sind interne Docker-Netze ohne Internetzugang. Staging kann deshalb keine externen Dienste erreichen: kein SMTP, kein IMAP, keine KI-API. Das gilt auch bei einer Fehlkonfiguration.

**Objektspeicher: SeaweedFS statt MinIO.** Die MinIO-Images sind nicht mehr öffentlich abrufbar; Pulls von Docker Hub und quay.io scheitern mit „access denied“. Ein reproduzierbares Deployment und die CI wären damit nicht möglich. SeaweedFS ist ein S3-kompatibler, gepflegter Ersatz (Apache-2.0) mit getrennten Zugangsdaten und Rechten pro Bucket:

| Identität | Rechte |
|---|---|
| `admin` | alles (Bucket-Initialisierung, Restore) |
| `api` | Lesen, Schreiben, Auflisten, Löschen – nur im Dokument-Bucket |
| `backup` | Lesen und Auflisten – nur im Dokument-Bucket |

Anonymer Zugriff ist abgelehnt; `storage-init` prüft das bei jedem Start.

**Dokumente:**

- Downloads und Vorschauen streamt die API über `GET /api/v1/documents/:id/download`, authentifiziert und auf die Organisation beschränkt.
- Der Objektschlüssel kommt aus der Datenbank, der Content-Type aus dem beim Upload geprüften Typ.
- Inline ausgeliefert werden nur PDF, PNG und JPEG.
- Presigned-URLs auf den internen Speicher gibt es nicht mehr. Der Objektspeicher ist nie vom Browser aus erreichbar.

## Voraussetzungen

- Linux-Host (getestet mit Docker Engine 29 / Compose v5) mit mindestens 4 GB RAM und 2 vCPU.
- Datenträger: ein eigener Datenträger oder eine eigene Partition für Backups (`STAGING_BACKUP_DIR`), getrennt von `/var/lib/docker`.
- Docker Engine mit dem Compose-Plugin, `git`, `openssl`, `curl`.
- Tailscale-Konto der Firma. Im Admin-Panel aktiviert: **MagicDNS** und **HTTPS certificates**.
- Auf dem Admin-Rechner, nicht auf dem Host: `age` bzw. `age-keygen` für das Backup-Schlüsselpaar.

## Tailscale und Tailscale Serve einrichten

Befehle nach den offiziellen Docs (Stand 11/2026):

- <https://tailscale.com/kb/1312/serve>
- <https://tailscale.com/kb/1242/tailscale-serve>

Diese Anleitung verbindet sich nicht automatisch mit einem Tailnet. Jeder Schritt erfordert einen bewussten Login durch einen Administrator.

1. **Tailscale installieren** (Paketquellen laut <https://tailscale.com/download/linux>):

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   ```

2. **Host anmelden**. Für einen Server ist ein Tag sinnvoll, damit der Host nicht an einem Benutzerkonto hängt:

   ```bash
   sudo tailscale up --hostname=bos-staging --advertise-tags=tag:bos-staging
   ```

   Den Tag vorher in der Policy definieren (`tagOwners`).

3. **Zugriff einschränken** in der Tailnet-Policy (Admin-Panel → Access controls). Nur die Mitarbeitergruppe darf HTTPS auf den Staging-Host:

   ```json
   {
     "tagOwners": { "tag:bos-staging": ["group:it-admins"] },
     "grants": [
       { "src": ["group:bissinger-staff"], "dst": ["tag:bos-staging"], "ip": ["tcp:443"] },
       { "src": ["group:it-admins"], "dst": ["tag:bos-staging"], "ip": ["tcp:22", "tcp:443"] }
     ]
   }
   ```

   Hinweis: Bei Geräten mit Tag setzt Tailscale Serve keine Identitäts-Header (`Tailscale-User-Login`). Bissinger OS nutzt sie ohnehin nicht, die Anmeldung läuft über das eigene Login.

4. **Stack starten** (Abschnitt Erstinstallation) und lokal prüfen:

   ```bash
   curl -s http://127.0.0.1:8080/api/v1/health/ready
   ```

5. **Tailscale Serve aktivieren**. Nur HTTPS im Tailnet, Ziel ist der Loopback-Port:

   ```bash
   sudo tailscale serve --bg --https=443 http://127.0.0.1:8080
   tailscale serve status
   ```

   Die angezeigte URL (`https://bos-staging.<tailnet>.ts.net`) ist der Staging-Origin. Sie muss **exakt** in `STAGING_ORIGIN` stehen.

6. **Kein Funnel.** Funnel würde den Dienst ins öffentliche Internet stellen. Kontrolle:

   ```bash
   tailscale funnel status   # darf nichts für diesen Host zeigen
   ```

   Laut Doku sind Serve und Funnel pro Port exklusiv; der zuletzt gesetzte Befehl gilt. Deshalb keinen `tailscale funnel`-Befehl für Port 443 ausführen.

7. **Abschalten bzw. zurücksetzen:**

   ```bash
   sudo tailscale serve --https=443 off
   sudo tailscale serve reset
   ```

**DNS und HTTPS:**

- Der Name `<host>.<tailnet>.ts.net` wird nur über MagicDNS im Tailnet aufgelöst.
- Das Zertifikat stellt und erneuert Tailscale; Caddy macht im Staging kein HTTPS (`auto_https off`).
- HSTS wird ohne `includeSubDomains` gesetzt, weil andere ts.net-Namen anderen Geräten gehören.

**Firewall:**

- Der Host braucht keine eingehenden Ports außer SSH für Administratoren, idealerweise auch nur über Tailscale.
- Es gibt kein öffentliches 80/443.
- Prüfung: `ss -ltnp` zeigt den Proxy nur auf `127.0.0.1:8080`.

## Client-IP, Proxy-Kette und Spoofing

Die Kette ist: Browser → Tailscale Serve → Caddy → API.

- Ob Tailscale Serve `X-Forwarded-For` setzt, ist nicht dokumentiert. Darauf wird deshalb nicht vertraut.
- Caddy nimmt `X-Forwarded-For` nur von Peers aus privaten Adressbereichen an. Das sind Loopback und das Docker-Netz, denn nur dort ist der Proxy erreichbar.
- Caddy liest den Header von rechts nach links (`trusted_proxies_strict`) und gibt der API genau **eine** geprüfte Adresse weiter.
- Die API vertraut genau einem Proxy (`TRUST_PROXY=1`).
- Vom Client eingeschleuste XFF-Einträge werden ignoriert. Der Smoke-Test prüft, dass das Login-Rate-Limit trotz gefälschtem `X-Forwarded-For` greift.
- Liefert Tailscale keinen Header, sehen alle Tailnet-Clients dieselbe Adresse. Das Rate-Limit wird dadurch strenger, nicht schwächer.

## Konfiguration und Secrets

Alle Werte stehen in `infrastructure/docker/.env.staging`. Die Datei ist nicht im Git, hat Modus 600 und wird von `staging.sh init` aus `.env.staging.example` erzeugt.

| Variable | Bedeutung |
|---|---|
| `STAGING_ORIGIN` | exakt die Tailscale-Serve-URL (`https://…ts.net`), wird zu `WEB_ORIGIN` der API (Cookies `__Host-`, Origin-/CSRF-Prüfung) |
| `STAGING_PROXY_PORT` | Loopback-Port des Proxys (Ziel von `tailscale serve`) |
| `POSTGRES_*` | eigene Staging-Datenbank; Passwort als Hex-Wert (URL-sicher) |
| `JWT_SECRET` | ≥ 32 zufällige Zeichen, beendet bei Änderung alle Sessions |
| `S3_*` | drei getrennte Identitäten (admin, api, backup) |
| `BACKGROUND_JOBS` | `maintenance` (Standard). Geschäftsjobs werden auf Staging beim Start abgelehnt. |
| `STAGING_BACKUP_DIR` | Backup-Ziel auf anderem Datenträger |
| `BACKUP_AGE_RECIPIENTS` | Datei mit dem **öffentlichen** age-Schlüssel |

Fest im Compose, nicht überschreibbar:

- `APP_ENV=staging`, `NODE_ENV=production`
- `ANTHROPIC_API_KEY=""`, `IMAP_HOST=""`
- SMTP ausschließlich an Mailpit
- `LOG_FORMAT=json`

Die API prüft beim Start: Auf Staging sind KI-Schlüssel, IMAP, SMTP-Zugangsdaten, fremde SMTP-Hosts und Geschäftsjobs verboten.

**Trennung von Produktion:**

- eigener Compose-Projektname (`bissinger-staging`) mit eigenen Volumes und Netzen
- eigene Datenbank (`bissinger_os_staging`) und eigener Bucket
- eigene Secrets, eigene Domain (ts.net) und eigenes Backup-Verzeichnis
- Staging-Backups nie in Produktion einspielen und umgekehrt (außer bewusst anonymisiert)

**Images:** Sie enthalten keine Secrets und keine Hostnamen. Das Web-Image ruft die API relativ unter `/api/v1` auf und ist damit für jede Umgebung dasselbe. `.dockerignore` ist eine Allowlist; `.env`-Dateien gelangen nie in den Build-Kontext.

## Erstinstallation

```bash
git clone <repo> /opt/bissinger-os && cd /opt/bissinger-os
git checkout <freigegebener Stand>

# 1. Backup-Schlüssel auf dem ADMIN-RECHNER erzeugen (nicht auf dem Host):
age-keygen -o bos-staging-backup.agekey      # privater Schlüssel: offline/Passwortmanager
#    nur die "public key"-Zeile (age1…) auf den Host kopieren:
sudo install -d -m 700 /etc/bissinger-staging
echo 'age1…' | sudo tee /etc/bissinger-staging/backup-recipients.txt
sudo install -d -m 700 -o 70 -g 70 /srv/bissinger-staging/backups   # uid 70 = Backup-Container

# 2. Konfiguration
infrastructure/scripts/staging.sh init https://bos-staging.<tailnet>.ts.net
#    STAGING_BACKUP_DIR und BACKUP_AGE_RECIPIENTS in infrastructure/docker/.env.staging prüfen
infrastructure/scripts/staging.sh validate

# 3. Bauen und starten (migrate läuft automatisch vor der API)
infrastructure/scripts/staging.sh build
infrastructure/scripts/staging.sh up

# 4. Ersten Owner anlegen (Passwort wird verdeckt abgefragt)
infrastructure/scripts/staging.sh bootstrap-admin admin@bissinger-lights.de "Vorname Nachname"

# 5. Privaten Zugang freischalten
sudo tailscale serve --bg --https=443 http://127.0.0.1:8080
```

Weitere Konten (es gibt keine öffentliche Registrierung):

```bash
docker compose --env-file infrastructure/docker/.env.staging \
  -f infrastructure/docker/docker-compose.staging.yml \
  exec api node dist/src/cli/user-admin.js create-user \
  --email <mail> --name "<Name>" --role MEMBER
```

## Updates und Migrationen

```bash
git pull && infrastructure/scripts/staging.sh update
```

Ablauf:

1. Konfiguration prüfen.
2. **Verschlüsseltes Backup anlegen**; schlägt es fehl, wird abgebrochen.
3. Laufende Images als `:previous` markieren.
4. Neu bauen.
5. `prisma migrate deploy`.
6. Neu starten.
7. Auf Readiness warten.

Volumes werden nie gelöscht. Rollback und Recovery: [operations-runbook.md](operations-runbook.md).

## Hintergrundjobs

| Job | Art | Staging |
|---|---|---|
| `session-purge` (stündlich) | Wartung | **aktiv** |
| `calendar-reminders` (minütlich) | Geschäft, Benachrichtigungen | deaktiviert, beim Start verboten |
| `inbox-poll` (5 min, IMAP + KI) | Geschäft, extern | deaktiviert, beim Start verboten |
| `ai-agents` (06:00) | Geschäft, KI | deaktiviert, beim Start verboten |
| `recurring-invoices` (05:00) | Geschäft, Rechnungen | deaktiviert, beim Start verboten |

Steuerung:

- **`BACKGROUND_JOBS`**: `all`, `none`, `maintenance` oder eine Namensliste. Ohne Angabe gilt auf Staging `maintenance`, sonst `all`.
- **Start:** Deaktivierte Crons werden beim Start aus dem Scheduler entfernt. Ein Cron, der nicht im Katalog steht (`background-jobs.config.ts`), verhindert den Start.
- **Mehrere API-Instanzen:** Jeder Lauf holt sich zuerst eine clusterweite Lease in `background_job_runs`. Dadurch führt immer nur eine Instanz denselben Job aus. Fällt eine Instanz aus, läuft ihre Lease nach `leaseSeconds` ab.
- **Monitoring:** Status, Zeitpunkte und Fehlerklasse des letzten Laufs stehen ebenfalls in `background_job_runs`.

## Sicherheitsgrenzen

- **Zugang:** nur Geräte und Benutzer des Tailnets gemäß Policy, dazu das eigene Login, Rollen und CSRF-Schutz aus Sprint 1 und 2.
- **Wer Root auf dem Host hat**, hat Zugriff auf alles: Volumes, `.env.staging`, laufende Container. Das Backup ist trotzdem geschützt, weil auf dem Host nur der öffentliche Schlüssel liegt.
- **Lokale Prozesse auf dem Host** können `127.0.0.1:8080` direkt erreichen und dabei Tailscale umgehen. Das ist bewusst so (Healthchecks, Diagnose); der Host gilt als vertrauenswürdig.
- **SeaweedFS-Interna** (Master, Volume, Filer) haben im internen `backend`-Netz keine eigene Authentifizierung. Nur API, Backup und `storage-init` hängen in diesem Netz.
- **CSP:** strikte Script-Policy mit Nonce pro Request (`proxy.ts`), `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. Styles erlauben weiter `'unsafe-inline'`, weil Reacts `style`-Props nicht mit Nonce versehen werden können.

## Was vor einem echten Produktivbetrieb fehlt

- **Offsite-Backup** (`BACKUP_OFFSITE_REMOTE`) auf ein getrenntes Konto mit Object Lock (Unveränderbarkeit), dazu ein regelmäßiger Restore-Test auf einem zweiten Host.
- **Produktions-Compose:** Die Dateien sind vorbereitet (`api.Dockerfile`, `web.Dockerfile`, `migrate`). `docker-compose.prod.yml` bindet noch keinen Objektspeicher ein (externes S3 nötig) und veröffentlicht 80/443. Ob öffentlich oder ebenfalls über Tailscale, ist zu entscheiden.
- **Alarmierung** an einen echten Kanal (Mail/Chat) anbinden (siehe Runbook).
- **Datenschutz:** Auftragsverarbeitung (AVV) mit Tailscale; Verzeichnis der Verarbeitungstätigkeiten; Löschkonzept für Backups (Aufbewahrung).
- **Tests:** Lasttest, Penetrationstest, unabhängige Prüfung der Sprints 2 und 3.
- **Images:** verkleinern (das API-Image ist ~1,1 GB, das Migrationsimage ~1,7 GB) und auf Schwachstellen scannen.
