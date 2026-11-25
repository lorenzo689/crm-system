# Sprint 4: Echtes privates Staging – Checkliste und Abnahmematrix

Basis: `feature/erp-ai-security` @ `863023c` (Merge von PR #5). Branch dieser Vorbereitung: `ops/sprint-4-private-staging`.

Nur synthetische Daten. Keine echten Unternehmensdaten, keine E-Mail-Zugangsdaten, keine KI-Schlüssel, kein Funnel, keine öffentlichen Ports, kein Produktivbetrieb.

**Stand: Phase A (Vorbereitung) abgeschlossen, Phase B nicht begonnen.** Für Phase B fehlen Host, Zugriff und Entscheidungen (Abschnitt 6).

## 1. Was die CI schon belegt und was nur der Host belegen kann

| Bereich | In der CI geprüft (grüne Läufe auf PR #4 und #5) | Erst auf der Zielhardware prüfbar |
|---|---|---|
| Images | bauen, laufen als Nicht-Root, enthalten keine `.env` | Bauzeit und Speicher auf der echten Hardware |
| Stack | Start, Health, Readiness, Migrationen, Smoketest (Proxy, Cookies, CSRF, Dokumente, Jobs, Ports, Backup, Persistenz) | Verhalten bei Host-Reboot, echte Festplatten, echte Last |
| Zugriff | HTTPS-Origin über Test-TLS-Gateway (eigene CA) | **Tailscale Serve, MagicDNS, Zertifikat, ACLs, Funnel aus** |
| Backup | verschlüsseln, Prüfsummen, Restore in leere Umgebung, manipulierte Datei und falscher Schlüssel abgelehnt, Rechtemodell uid 70 | Backup-Datenträger getrennt von Docker, echter privater Schlüssel an zwei Orten, Offsite |
| Monitoring | Logik von `staging.sh monitor` | **Zustellung des Alarms an einen echten Kanal**, Timer nach Reboot |
| Sicherheit | Session, CSRF, Session-Kontext, Rollen (API-Integrationstests) | dieselben Abläufe von zwei echten Geräten und Browsern |
| Update/Rollback | Skripte vorhanden | **ein realer Update- und Rollback-Durchlauf** |

## 2. Preflight-Befunde (Phase A)

Bewertung der vorhandenen Konzepte gegen die Anforderungen. „Blocker“ = verhindert eine korrekte Erstinstallation oder Abnahme.

| # | Punkt | Befund | Status |
|---|---|---|---|
| P-01 | Backup-Verzeichnis | `staging.sh validate` und `up` prüften es nicht. Fehlt es, legt Docker es **root-eigen** an; der Backup-Container (uid 70) kann dann nicht schreiben. Erst nach der ersten Wartezeit (10 min) scheitert das Backup, die Dienste laufen scheinbar gesund. | **Blocker, behoben**: `validate` verlangt `uid 70, Modus 700` (sonst Abbruch mit Befehl zur Korrektur); `host-preflight.sh` prüft es ebenfalls. |
| P-02 | Alarmzustellung | Das Runbook-Beispiel nutzt `mail`, das auf einem Server meist fehlt; es gab keinen Zustellweg und keinen Test. Ein Monitoring ohne zugestellte Meldung ist keines. | **Blocker, behoben (Werkzeug)**: `scripts/alert.sh`, systemd-Units `infrastructure/systemd/`, `staging.sh alert-test`. Der **Kanal** (URL) ist eine Entscheidung der IT und fehlt noch (Abschnitt 6). |
| P-03 | Host-Voraussetzungen prüfbar machen | Es gab keine ausführbare Prüfung von Docker-Autostart, `tailscaled`-Autostart, Serve-Ziel, Funnel, Listenern, Restart-Policy. | **behoben**: `scripts/host-preflight.sh` (`--post` nach dem Start). |
| P-04 | Neustart nach Reboot | Alle Dienste haben `restart: unless-stopped`; `migrate` und `storage-init` laufen bewusst einmalig. Abhängigkeiten (`depends_on`) gelten nur beim `up`, nicht beim Daemon-Neustart: Die API startet nach einem Reboot evtl. vor Postgres und neu startet dann bis Postgres bereit ist. | Kein Blocker (Neustart-Schleife endet von selbst); **auf dem Host zu belegen** (Test H-6). |
| P-05 | Tailscale Serve nach Reboot | `serve --bg` bleibt laut Tailscale-Doku über Neustarts erhalten; Funnel und Serve schließen sich pro Port aus. | Auf dem Host zu belegen (H-7, H-8). |
| P-06 | Reproduzierbarkeit | Basis-Images sind per Tag gepinnt (`node:24.13.1-alpine3.23`, `postgres:17.11-alpine`, …), nicht per Digest; `pnpm install --frozen-lockfile`. Ein Tag kann theoretisch neu veröffentlicht werden. | Risiko, kein Blocker. Digest-Pinning wäre eine spätere Härtung. |
| P-07 | Update-Rollback | `update` markiert die laufenden Images als `:previous`. Ein **zweiter** `update` nach einem fehlgeschlagenen ersten überschreibt `:previous` mit dem fehlerhaften Stand. | Risiko, kein Blocker; Runbook: nach fehlgeschlagenem Update zuerst `rollback`, dann erst erneut `update`. |
| P-08 | Alarm-Wiederholung | Der Timer meldet jeden fehlschlagenden Lauf (alle 5 min) erneut; es gibt keine Entwarnung. | Bekannte Einschränkung, dokumentiert. |
| P-10 | Monitor-Meldung bei fehlendem Container | `staging.sh monitor` setzte für einen fehlenden Container den Zustand als `"
missing"` und die Neustartzahl als `"
0"`: Die Meldung war zerrissen, und der Zahlenvergleich warf einen Shell-Fehler. Gefunden beim Test von `host-preflight.sh`, das denselben Ausdruck hatte. | **behoben** in beiden Skripten. |
| P-09 | Tailscale-ACL | Das Beispiel in `staging.md` (`grants`, Tag `tag:bos-staging`, 443 für Mitarbeitergruppe, 22 für Admins) ist plausibel, aber nicht gegen ein echtes Tailnet geprüft. | Auf dem Host zu belegen (H-9). |

**Lokal nicht ausführbar:** Der Nachweis von P-01 im Container (uid 70 schreibt in ein root-eigenes Verzeichnis) hing auf dem Entwicklungsrechner (Docker Desktop startete keine Container mehr; nicht neu gestartet, weil dort andere Projekte laufen). Belegt ist P-01 durch das dokumentierte Docker-Verhalten (fehlender Bind-Pfad wird als root angelegt) und das Rechtemodell, das `permissions-test.sh` in der CI auf Linux prüft. `host-preflight.sh` lief unter Git Bash (alle Prüfungen ohne Absturz, erwartete FAILs); auf echtem Linux ist es noch nicht gelaufen.

Nicht geändert: Produktfunktionen, Compose-Aufbau, Sicherheitsmodell.

## 3. Checkliste Erstinstallation (frischer Linux-Host)

Reihenfolge einhalten. Jeder Schritt hat eine Kontrolle. Alle Befehle auf dem Host, außer wo „Admin-Rechner“ steht.

```bash
# 0. Voraussetzungen: Linux (Debian/Ubuntu LTS), >= 4 GB RAM, >= 2 vCPU, >= 20 GB frei,
#    eigener Datenträger oder eigene Partition für Backups. Docker Engine + Compose-Plugin,
#    git, openssl, curl. Tailscale-Konto: MagicDNS und HTTPS-Zertifikate aktiv.
sudo systemctl enable --now docker            # Kontrolle: systemctl is-enabled docker -> enabled

# 1. Repository auf den freigegebenen Commit (kein Branch-Name, ein SHA)
sudo git clone https://github.com/lorenzo689/crm-system /opt/bissinger-os
cd /opt/bissinger-os && sudo git checkout <FREIGEGEBENER-SHA>
git rev-parse HEAD                            # Kontrolle: = freigegebener SHA

# 2. Admin-Rechner: Backup-Schlüsselpaar erzeugen; privaten Schlüssel an ZWEI getrennten Orten
#    sichern (Passwortmanager + Ausdruck im Tresor), niemals auf dem Host.
age-keygen -o bos-staging-backup.agekey       # nur die Zeile "Public key: age1..." auf den Host
sudo install -d -m 700 /etc/bissinger-staging
echo 'age1…' | sudo tee /etc/bissinger-staging/backup-recipients.txt >/dev/null
sudo install -d -m 700 -o 70 -g 70 /srv/bissinger-staging/backups   # eigener Datenträger!

# 3. Tailscale (Administrator meldet den Host bewusst an; Tag vorher in der Policy definieren)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --hostname=bos-staging --advertise-tags=tag:bos-staging
tailscale status --json | grep -m1 DNSName     # = <host>.<tailnet>.ts.net  -> STAGING_ORIGIN

# 4. Konfiguration (erzeugt .env.staging mit Zufallssecrets, Modus 600)
infrastructure/scripts/staging.sh init https://bos-staging.<tailnet>.ts.net
infrastructure/scripts/staging.sh validate
infrastructure/scripts/host-preflight.sh      # Kontrolle: 0 failed

# 5. Bauen und starten (migrate läuft vor der API)
infrastructure/scripts/staging.sh build
infrastructure/scripts/staging.sh up          # wartet auf Readiness

# 6. Ersten Owner anlegen (Passwort wird verdeckt abgefragt; synthetische Adresse)
infrastructure/scripts/staging.sh bootstrap-admin admin@staging.test "Staging Admin"

# 7. Privater Zugang: nur Serve, nie Funnel
sudo tailscale serve --bg --https=443 http://127.0.0.1:8080
tailscale serve status

# 8. Monitoring und Alarmzustellung (infrastructure/systemd/README.md), dann Zustellung beweisen
infrastructure/scripts/staging.sh alert-test  # Kontrolle: Nachricht kommt am Kanal an

# 9. Gesamtprüfung nach dem Start
infrastructure/scripts/host-preflight.sh --post   # Kontrolle: 0 failed
infrastructure/scripts/staging.sh diagnose
```

## 4. Abnahmematrix

Jede Zeile hat ein eindeutiges Kriterium. **PASS** nur, wenn das Kriterium nachweisbar erfüllt ist; der Nachweis (Ausgabe, Screenshot-Verweis ohne Daten) kommt in den Abnahmebericht. Alles andere ist **FAIL**. „Phase A“ = bereits lokal oder in der CI belegt; „Host“ = erst auf der Zielhardware.

### A. Host und Installation

| ID | Prüfung | PASS, wenn | Befehl / Nachweis | Wo |
|---|---|---|---|---|
| H-1 | Preflight vor dem Start | `host-preflight.sh` endet mit `0 failed` | Ausgabe | Host |
| H-2 | Commit-Bindung | `git rev-parse HEAD` = freigegebener SHA; Images tragen `:<sha>` | `docker images bissinger-os/api` | Host |
| H-3 | Secrets | `.env.staging` Modus 600; `validate` ok; keine Platzhalter; privater age-Schlüssel nicht auf dem Host | `stat -c %a`, `grep AGE-SECRET-KEY -r /etc/bissinger-staging` leer | Host |
| H-4 | Start und Migrationen | `up` endet mit „ready“; `migrate` meldet aktuelles Schema; Readiness 200 | `staging.sh health` | Host |
| H-5 | Restart-Policy | alle 7 Dienste `unless-stopped` | `host-preflight.sh --post` | Host |
| H-6 | **Host-Reboot** | Nach `sudo reboot` sind ohne Eingriff innerhalb 10 min alle Dienste healthy und Readiness = 200; Serve-Ziel unverändert | `staging.sh health`, `tailscale serve status` | Host |
| H-7 | Serve/HTTPS | `https://<host>.<tailnet>.ts.net/login` antwortet 200 mit gültigem Tailscale-Zertifikat von einem Tailnet-Gerät | Browser/`curl -v` | Host |
| H-8 | **Kein Funnel, keine öffentlichen Ports** | `serve status` ohne Funnel; `--post`: keine Anwendungsports auf 0.0.0.0; von einem Gerät **außerhalb** des Tailnets ist `https://<host>.ts.net` und die öffentliche IP auf 80/443/8080 nicht erreichbar | `host-preflight.sh --post`, externer `curl` (Timeout/Refused = PASS) | Host |
| H-9 | ACL | Gerät ohne Tag/Gruppe erreicht den Host nicht; Mitarbeitergerät erreicht nur 443; Admin zusätzlich 22 | zwei Geräte, je `curl`/`ssh` | Host |

### B. Funktion mit synthetischen Konten

| ID | Prüfung | PASS, wenn | Wo |
|---|---|---|---|
| F-1 | Konten | OWNER, ADMIN, MEMBER und ein Mitglied einer zweiten Organisation sind angelegt (`user-admin create-user`) | Host |
| F-2 | Login/Logout | Login mit jedem Konto klappt; Logout beendet die Sitzung serverseitig (altes Cookie danach 401) | Host, 2 Geräte |
| F-3 | Zwei Geräte | Dasselbe Konto gleichzeitig auf zwei Geräten; Logout auf Gerät 1 beendet Gerät 2 nicht | Host |
| F-4 | Rollenwechsel | Rolle OWNER→MEMBER in der Datenbank/CLI ändern: offene Seite zeigt nach Revalidierung keine Admin-Daten mehr, Admin-Aktionen liefern 403 | Host |
| F-5 | Session-Isolation | Konto A im Tab 1, Konto B im Tab 2 (gleicher Browser): Tab 1 zeigt den Sperr-Dialog, keine Daten von B, kein Inhalt von A im DOM | Host, Browser |
| F-6 | CSRF | Mutation ohne/mit falschem `X-CSRF-Token` → 403 `CSRF_INVALID`; fremder `Origin` → `ORIGIN_REJECTED` | Host (`staging-smoke.sh` prüft das gegen den Stack) |
| F-7 | Dokumente | PDF/PNG hochladen, ansehen (Vorschau), herunterladen: SHA-256 identisch; fremde Organisation erhält 404/403 | Host |
| F-8 | Staging-Schutz | `ANTHROPIC_API_KEY`/IMAP/SMTP-Zugang gesetzt → API startet nicht; Geschäftsjobs aus | Phase A (CI, `infrastructure.e2e`) + Host-Stichprobe |

### C. Betrieb, Backup, Monitoring

| ID | Prüfung | PASS, wenn | Wo |
|---|---|---|---|
| M-1 | Container-Neustart | `docker restart <api>` und `<postgres>` einzeln: danach Readiness 200 ≤ 2 min, keine Datenverluste (Testdatensatz noch da) | Host |
| M-2 | Monitoring-Logik | `staging.sh monitor` → Exit 0 im Normalfall; nach `docker stop <web>` Exit 1 mit Zeile `ALERT container web is …` | Host (Logik: Phase A/CI) |
| M-3 | **Alarmzustellung** | `staging.sh alert-test` **und** ein künstlicher Ausfall (`docker stop <web>`, Timer abwarten) erzeugen je eine Nachricht am echten Kanal ≤ 10 min | Host |
| M-4 | Backup | `staging.sh backup` erfolgreich; Datei `.tar.age` und `.sha256` in `STAGING_BACKUP_DIR` (uid 70, 0600/0700); Backup-Alter in `diagnose` < 1 h | Host |
| M-5 | **Restore aus verschlüs. Backup** | `staging.sh restore <datei> <schlüssel>` (nach Freigabe, destruktiv) stellt Konten, Dokumente (SHA-256) und Migrationsstand her; Login klappt | Host (Logik: Phase A/CI-Restore-Test) |
| M-6 | Schlüsselverwaltung | privater age-Schlüssel an zwei getrennten Orten bestätigt; Restore mit der Kopie aus Ort 2 gelungen | Host/Admin |
| M-7 | Update | `staging.sh update` auf einen zweiten freigegebenen Commit: Backup davor, Migration, Readiness 200, `:previous`-Images vorhanden | Host |
| M-8 | Rollback | `staging.sh rollback` danach: alte Version läuft, Readiness 200 (bei additiver Migration ohne Restore) | Host |
| M-9 | Speicher | Plattenbelegung `/` und Backup-Verzeichnis < 85 %; Backup-Datenträger ≠ Docker-Datenträger (`host-preflight.sh`) | Host |

Gesamtregel für **GO** (Abschnitt 7): alle Zeilen H-1 bis H-9, F-1 bis F-8 und M-1 bis M-9 sind PASS.

## 5. Reproduzierbare Befehle (Auswahl)

```bash
infrastructure/scripts/host-preflight.sh            # vor dem Start
infrastructure/scripts/host-preflight.sh --post     # nach Start und Serve
infrastructure/scripts/staging.sh health | diagnose | monitor
infrastructure/scripts/staging.sh alert-test
infrastructure/scripts/staging.sh backup
# lokal/CI (Phase A, Docker): Images bauen und Smoketest
API_IMAGE=… WEB_IMAGE=… MIGRATE_IMAGE=… BACKUP_IMAGE=… infrastructure/tests/staging-smoke.sh
infrastructure/tests/restore-test.sh
infrastructure/tests/permissions-test.sh
```

## 6. Was für Phase B fehlt (Stopp-Punkte)

Phase B beginnt erst, wenn diese Punkte vorliegen. Nichts davon kann ich selbst beschaffen.

1. **Der Linux-Host** (VM oder Server) mit SSH-Zugang für einen Administrator, Sudo-Rechten und einem **separaten Datenträger** für Backups.
2. **Ein freigegebener Commit** (SHA), der deployt werden soll. Vorschlag: der Stand dieses Branches nach Review und Merge.
3. **Tailscale:** Zugang zum Tailnet-Admin (Tag `tag:bos-staging`, ACL/Grants, Gruppen), Bestätigung, dass **MagicDNS** und **HTTPS-Zertifikate** aktiv sind; ein zweites Tailnet-Gerät und ein Gerät außerhalb des Tailnets für H-8/H-9.
4. **Alarmkanal:** Entscheidung und URL (z. B. ntfy-Topic, Slack/Mattermost/Teams-Webhook). Die URL ist ein Secret.
5. **Backup-Schlüssel:** Die IT erzeugt das age-Schlüsselpaar und bestätigt zwei getrennte Aufbewahrungsorte.
6. **Freigabe destruktiver Schritte:** `staging.sh restore` (M-5) löscht Daten des Staging-Projekts; Reboot (H-6); Stoppen einzelner Container (M-1, M-2, M-3).

## 7. Aktuelles Urteil

**Phase A: abgeschlossen. Privater Staging-Betrieb: NO-GO, bis Phase B die Matrix mit PASS belegt.** Es gibt keinen bekannten Blocker mehr im Repository; offen sind ausschließlich Punkte, die nur auf dem Host nachweisbar sind (H-*, F-*, M-*) und die Entscheidungen aus Abschnitt 6. Ein GO ohne diese Nachweise wäre eine Behauptung ohne Beleg.
