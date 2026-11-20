# Betriebs-Runbook (Staging)

Alle Befehle laufen auf dem Staging-Host im Repository-Verzeichnis. `staging.sh` steht für `infrastructure/scripts/staging.sh`.

## Tägliche Kontrolle und Monitoring

```bash
staging.sh health      # Container-Status + Readiness
staging.sh diagnose    # zusätzlich Backups, Jobs, Speicher, letzte Fehler
staging.sh monitor     # Exit 0 = alles gut; sonst je Problem eine Zeile "ALERT …"
```

`monitor` prüft:

| Prüfung | Schwelle (Variable) |
|---|---|
| Container laufen bzw. sind healthy (postgres, seaweedfs, api, web, proxy, mailpit, backup) | – |
| Neustarts je Dienst | > 3 (`MONITOR_MAX_RESTARTS`) |
| API-Readiness über den Proxy (Datenbank, Objektspeicher, Migrationen) | ≠ 200 |
| Alter des letzten erfolgreichen Backups | > 26 h (`MONITOR_MAX_BACKUP_AGE_HOURS`) |
| Hintergrundjobs mit Fehlern in Folge (`background_job_runs`) | > 0 |
| Plattenbelegung `/` und Backup-Verzeichnis | ≥ 85 % (`MONITOR_MAX_DISK_PERCENT`) |
| API-Fehler (`"level":"error"`) im Zeitfenster | > 20 in 15 min |

**Alarmierung:** Ein systemd-Timer führt `monitor` alle 5 Minuten aus und meldet jede Ausgabe ungleich 0 weiter, z. B. an eine Mail- oder Chat-Adresse. Ein Beispiel liegt unten. Grafana, Prometheus oder Loki sind bewusst nicht nötig.

```ini
# /etc/systemd/system/bos-monitor.service
[Service]
Type=oneshot
WorkingDirectory=/opt/bissinger-os
ExecStart=/opt/bissinger-os/infrastructure/scripts/staging.sh monitor
# Bei Fehler: Ausgabe an die IT schicken (Mailer/Webhook nach Wahl)
ExecStopPost=/bin/sh -c '[ "$SERVICE_RESULT" = success ] || journalctl -u bos-monitor -n 20 --no-pager | mail -s "Bissinger OS Staging ALERT" it@bissinger-lights.de'

# /etc/systemd/system/bos-monitor.timer
[Timer]
OnBootSec=5min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
```

| Ereignis | Erkennung | Reaktion |
|---|---|---|
| Datenbank ausgefallen | Readiness 503, Container nicht healthy | `staging.sh diagnose`; `docker compose … logs postgres`; Speicherplatz prüfen; Container neu starten; bei Datenschaden Restore |
| Backup fehlgeschlagen | `last-success` > 26 h, Log `status=failed reason=…` | Ursache im Log (`… logs backup`), dann `staging.sh backup` |
| Dienst länger nicht verfügbar | Readiness ≠ 200 in zwei Läufen hintereinander (10 min) | `diagnose`, Neustart des Dienstes, ggf. Rollback |
| Hintergrundjob scheitert wiederholt | `consecutiveFailures` > 0 | Log `job=<name> status=failed error=<Klasse>`; der Job läuft beim nächsten Termin erneut |

## Logs

- **Format:** Alle Container schreiben nach stdout. Docker rotiert die Logs (`json-file`, 5 × 10 MB je Container).
- **API:** JSON (`LOG_FORMAT=json`), pro Request eine Zeile `requestId=… method=… path=… status=… durationMs=… userId=…`.
  - **Nicht geloggt:** Query-Strings, Header (Cookies, CSRF-Tokens), Bodies, IP-Adressen, E-Mail- oder Dokumentinhalte.
  - **Unerwartete Fehler:** Klasse und Stack-Frames, ohne die Fehlermeldung, weil sie Eingaben enthalten kann. Dazu die `requestId`, die auch in der 500-Antwort steht.
- **Proxy:** Caddy-JSON-Access-Log. Cookie-, Set-Cookie- und Authorization-Werte sind von Caddy standardmäßig geschwärzt.
- **Request-ID:** Caddy vergibt pro Request eine UUID (`X-Request-Id`) und gibt sie an die API weiter. Sie steht im Response-Header und in allen Logzeilen, über sie findet man einen gemeldeten Fehler wieder.

```bash
docker compose --env-file infrastructure/docker/.env.staging -f infrastructure/docker/docker-compose.staging.yml logs --since 1h api | grep <requestId>
```

## Update

```bash
git fetch && git checkout <freigegebener Commit>
staging.sh update
```

`update` läuft so ab:

1. Konfiguration prüfen.
2. **Backup erstellen**; schlägt es fehl, wird abgebrochen.
3. Laufende Images als `:previous` markieren.
4. Images bauen.
5. `migrate`.
6. `up -d`.
7. Auf Readiness warten.

Volumes werden nie gelöscht. Vor jeder riskanten Migration, etwa bei Spaltenlöschungen oder Typänderungen, muss ein **frisches, erfolgreiches** Backup vorliegen; `update` und `migrate` erzwingen das.

## Rollback

| Lage | Vorgehen |
|---|---|
| Neue Version startet nicht, **keine** neue Migration | `staging.sh rollback`: alte Images (`:previous`) starten. Die Daten sind unverändert. |
| Neue Version hat **additive** Migrationen angewendet (neue Tabellen oder Spalten, wie bisher alle Migrationen) | `staging.sh rollback` reicht meist; der alte Code ignoriert neue Tabellen und Spalten. `/health/ready` der alten Version meldet aber 503 nicht, weil sie die neueren Migrationen nicht kennt; prüfen. |
| Migration ist **nicht abwärtskompatibel** (Löschen, Umbenennen, Datenumbau) oder ist halb fehlgeschlagen | Ein Image-Rollback **reicht nicht**, denn die Datenbank bleibt im neuen Zustand. Stattdessen: `staging.sh rollback` **und** `staging.sh restore <Backup von vor dem Update>`. Daten zwischen Backup und Rollback gehen verloren; deshalb vor riskanten Migrationen ein Wartungsfenster ansetzen und Schreibzugriffe anhalten (Proxy stoppen). |

Prisma kennt kein automatisches „down“. Eine fehlgeschlagene Migration markiert man nach dem Restore nicht von Hand; der Restore stellt den Zustand vor der Migration vollständig wieder her.

## Fehlersuche

| Symptom | Prüfen |
|---|---|
| Browser: Seite nicht erreichbar | Gerät im Tailnet? `tailscale serve status` auf dem Host; `curl http://127.0.0.1:8080/api/v1/health/live` |
| Login klappt, danach sofort wieder abgemeldet | `STAGING_ORIGIN` exakt gleich der Browser-URL? Das Cookie `__Host-…` braucht HTTPS. |
| 403 „Anfrage von nicht erlaubter Herkunft“ | Origin weicht ab (anderer Hostname, Port oder http statt https) |
| Readiness `storage: error` | `… logs seaweedfs storage-init`; Volume `objects` voll? |
| Readiness `migrations: error` | `docker compose … run --rm migrate` ausführen; Log prüfen |
| API startet nicht: „must not enable business jobs“ / „requires an empty ANTHROPIC_API_KEY“ | Staging-Schutz greift; Env-Datei korrigieren |
| Uploads scheitern | Readiness, Speicherplatz, `… logs api` mit der `requestId` aus der Fehlermeldung |
| Mails | Mailpit-Oberfläche per SSH-Tunnel: `ssh -L 8025:<mailpit-container-ip>:8025 host`, oder `docker compose … exec mailpit wget -qO- http://127.0.0.1:8025/api/v1/messages` |

## Mehrere API-Instanzen

Die Hintergrundjobs sind über Leases in `background_job_runs` abgesichert: Jeder Lauf ist clusterweit exklusiv. Ein laufender Job verlängert seine Lease per Heartbeat (alle 30 s, Lease-TTL 120 s). Eine abgestürzte oder eingefrorene Instanz sendet keinen Heartbeat mehr; nach spätestens 120 s übernimmt eine andere Instanz. Die alte Instanz bricht beim nächsten Heartbeat ab (`signal`), sobald ihre Lease weg ist.

- **Geordnetes Beenden:** Beim Herunterfahren (`SIGTERM`) werden laufende Jobs abgebrochen und bis zu 10 s abgewartet. Ihre Lease wird mit Status `interrupted` freigegeben, eine andere Instanz kann sofort weitermachen. Der `stop_grace_period` der API muss über 10 s liegen (Staging: 20 s).
- **Monitoring (Logzeilen `job=<name> status=…`):** `took-over` (Lease einer toten Instanz übernommen, mit `fence`), `lease-lost` (laufender Job hat seine Lease verloren und stoppt), `heartbeat-failed` (Datenbank nicht erreichbar, der Job läuft bis zum Ablauf der lokalen Lease weiter), `interrupted` (Shutdown). Ein dauerhaftes `lease-lost` deutet auf zu lange Pausen der Instanz (z. B. CPU-Starvation, GC) hin.
- **Nicht exactly-once:** Nach einer Übernahme kann ein Job erneut laufen. Doppelte Wirkungen verhindern Idempotenzschlüssel in der Datenbank (wiederkehrende Rechnung: eindeutig je Vorlage und Fälligkeitsdatum; Erinnerung: Markierung und Benachrichtigung in einer Transaktion; Posteingang: eindeutige `messageId`; KI-Vorschläge: eindeutiger `dedupeKey`). Siehe `docs/security/sprint-3-1-hardening.md`.
- **Testhilfe:** `BACKGROUND_JOB_HEARTBEAT_MS` überschreibt das Heartbeat-Intervall; nur für Tests, nicht in Produktion setzen.
- **Reverse Proxy:** Der Header `X-Session-Context` aller API-Antworten muss unverändert beim Browser ankommen. Fehlt er, blockiert die Web-App aus Sicherheitsgründen (Seite bleibt leer). `infrastructure/tests/staging-smoke.sh` prüft das.

Nicht verteilt sind:

- **Login-Rate-Limit:** zählt im Speicher jeder Instanz. Mit mehreren Instanzen braucht es einen geteilten Speicher (Redis).
- **Readiness-Cache:** gilt je Instanz; das ist unkritisch.
