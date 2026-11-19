# Backup und Wiederherstellung (Staging)

Ein Backup gilt erst als vorhanden, wenn es sich nachweislich wiederherstellen lässt. Deshalb gehört zu jedem Backup ein automatisierter Restore-Test (`infrastructure/tests/restore-test.sh`, läuft in der CI).

## Was gesichert wird

Ein Backup-Satz (`bissinger-os-<UTC-Zeitstempel>.tar.age`) enthält:

| Datei im Satz | Inhalt |
|---|---|
| `database.dump` | `pg_dump --format=custom --compress=6 --no-owner --no-privileges`: alle Tabellen inkl. Sessions, Job-Status und `_prisma_migrations` |
| `objects/` | vollständige Kopie des Dokument-Buckets (alle Dateiversionen) |
| `referenced-keys.txt` | alle Objektschlüssel, auf die der Dump verweist |
| `manifest.txt` | Name, Zeitpunkt, Datenbank, Anzahl Objekte |
| `checksums.sha256` | SHA-256 jeder Datei im Satz |

**Konsistenz zwischen Datenbank und Dateien:**

- Zuerst wird die Datenbank gesichert, danach der Bucket.
- Die Anwendung löscht Dokumentdateien nie; neue Versionen bekommen neue Schlüssel. Die Bucket-Kopie ist deshalb immer eine Obermenge dessen, was der Dump referenziert.
- Ob das stimmt, prüft das Backup selbst: Fehlt ein im Dump referenziertes Objekt in der Kopie, bricht es mit Fehler ab.
- Eine Schreibsperre ist dadurch nicht nötig. Dateien, die zwischen Dump und Kopie hochgeladen werden, liegen im Backup, sind aber nicht referenziert; das ist unschädlich.

## Verschlüsselung und Schlüssel

- **Verfahren:** [age](https://age-encryption.org) mit einem X25519-Empfängerschlüssel. Der Satz wird als Stream verschlüsselt (`tar | age`); ein unverschlüsseltes Archiv entsteht nie auf der Platte.
- **Auf dem Staging-Host liegt nur der öffentliche Schlüssel** (`BACKUP_AGE_RECIPIENTS`). Wer den Host übernimmt, kann Backups erzeugen, aber nicht lesen.
- **Der private Schlüssel** (`*.agekey`) wird auf einem Admin-Rechner erzeugt und offline aufbewahrt, z. B. im Passwortmanager plus eine ausgedruckte Kopie im Tresor. Ohne ihn ist keine Wiederherstellung möglich, auch nicht nach Verlust des Hosts. Der Schlüssel muss deshalb an **zwei getrennten Orten** liegen.
- Mehrere Empfänger sind möglich: eine Zeile pro Schlüssel in der Recipients-Datei, z. B. IT-Leitung und Notfallschlüssel.
- **Dateirechte:** Das Backup-Verzeichnis hat Modus 700 (uid 70), die Dateien 600 (`umask 077`). Zugangsdaten stehen nur in Umgebungsvariablen; es gibt keine rclone-Konfigurationsdatei mit Secrets.

## Ablauf eines Backups

`backup.sh` im `backup`-Container (Scheduler: alle `BACKUP_INTERVAL_HOURS`, Standard 24 h; nach einem Fehler ein neuer Versuch nach 60 min):

1. `pg_dump` erstellen, danach mit `pg_restore --list` die Struktur prüfen.
2. Bucket mit der Leseidentität `backup` kopieren (`rclone copy`).
3. Prüfen, ob jedes referenzierte Objekt in der Kopie liegt.
4. Manifest und Prüfsummen erzeugen.
5. `tar | age` in die Datei `…tar.age.partial` schreiben, dann atomar umbenennen und die Prüfsumme `.sha256` daneben ablegen.
6. Optional offsite kopieren (`BACKUP_OFFSITE_REMOTE`, siehe unten).
7. **Erst danach** aufräumen: Sätze älter als `BACKUP_RETENTION_DAYS` (Standard 14) löschen, die neuesten `BACKUP_MIN_KEEP` (Standard 3) bleiben immer erhalten.
8. Zeitpunkt in `last-success` schreiben (für das Monitoring).

Jeder Fehler beendet das Skript mit einem Exit-Code ungleich 0. Die Logs enthalten nur Name, Größe, Anzahl und Dauer, keine Secrets und keine Daten.

Manuell auslösen: `infrastructure/scripts/staging.sh backup`.

## Speicherorte

| Ebene | Ort | Schützt vor |
|---|---|---|
| 1 | `STAGING_BACKUP_DIR` auf eigenem Datenträger (nicht `/var/lib/docker`) | versehentlichem Löschen, Fehlern in Migrationen, defekten Volumes |
| 2 | **Offsite:** S3-Bucket bei einem anderen Anbieter/Konto mit Object Lock (`BACKUP_OFFSITE_REMOTE=offsite:bucket/pfad`, `RCLONE_CONFIG_OFFSITE_*` in der Env-Datei) | Verlust des ganzen Hosts, Ransomware auf dem Host |

Backups nur auf demselben Server reichen für die Produktion **nicht**. Offsite ist vorbereitet, aber noch nicht eingerichtet (es braucht ein externes Konto, das nicht ohne Freigabe angelegt wird).

## Wiederherstellung

`restore.sh` arbeitet so:

- Prüfsumme der Datei prüfen, dann entschlüsseln.
- Prüfsumme jeder Datei im Satz prüfen und die Dump-Struktur prüfen.
- Ist die Ziel-Datenbank nicht leer, bricht es ab.
- `pg_restore` läuft in **einer** Transaktion.
- Die Dateien werden hochgeladen, danach prüft `rclone check --download` jede Datei inhaltlich und jedes referenzierte Objekt.

### Staging-Daten zurücksetzen (Host läuft)

```bash
infrastructure/scripts/staging.sh restore /srv/bissinger-staging/backups/bissinger-os-<ts>.tar.age ~/bos-staging-backup.agekey
```

Das Skript fragt nach dem Projektnamen als Bestätigung. Danach:

1. Proxy, Web, API und Backup stoppen.
2. **Nur** die Volumes `pgdata` und `objects` löschen und neu anlegen.
3. `storage-init` ausführen, dann `restore.sh`.
4. `migrate` ausführen; bei gleichem Stand ist das ein No-Op, bei neuerem Code werden ausstehende Migrationen nachgezogen.
5. Alles wieder starten und auf Readiness warten.

Den privaten Schlüssel nur für die Dauer der Wiederherstellung auf den Host kopieren und danach löschen (`shred -u`).

### Neuer Host (Totalverlust)

1. Linux-Host vorbereiten wie in [staging.md](staging.md) unter „Voraussetzungen“ und „Tailscale“ beschrieben.
2. Repository auf **denselben Commit** auschecken, aus dem das Backup stammt. Neuere Commits gehen auch; dann zieht `migrate` die fehlenden Migrationen nach.
3. `staging.sh init <origin>` ausführen. Secrets dürfen neu sein; sie sind nicht im Backup.
   - Ausnahme `JWT_SECRET`: Ein neuer Wert beendet nur alle Sessions.
4. Backup-Datei vom Offsite-Speicher holen und den privaten Schlüssel bereitstellen.
5. `staging.sh build`, dann `staging.sh restore <datei> <schlüssel>`.
6. Tailscale Serve wieder aktivieren. Benutzer melden sich mit ihren bisherigen Passwörtern an, denn die Passwort-Hashes liegen in der Datenbank.

## Restore-Test

`infrastructure/tests/restore-test.sh` (lokal mit Docker oder in der CI):

1. Isolierte Quellumgebung starten und den Admin anlegen.
2. Testdaten erzeugen: Kunde, Projekt, zwei Dokumente mit zufälligen PDF-Inhalten, Login-Session.
3. Verschlüsseltes Backup erstellen.
4. Quellumgebung **samt Volumes löschen** und prüfen, dass keine Volumes übrig sind.
5. Neue, leere Umgebung mit eigenen Secrets starten.
6. Negativtests:
   - manipulierte Datei → abgelehnt
   - falscher Schlüssel → abgelehnt
   - danach ist die Datenbank weiterhin leer
7. Restore ausführen. Ein zweiter Restore in die nun gefüllte Datenbank wird abgelehnt.
8. Prüfen:
   - Anzahl der Datensätze (Benutzer, Kunden, Projekte, Dokumente, Versionen, **Sessions**, Migrationen) stimmt überein
   - Beziehungen Dokument → Projekt → Kunde sind intakt
   - `prisma migrate status` meldet ein aktuelles Schema
   - Readiness ist grün
   - Login mit dem wiederhergestellten Konto funktioniert
   - die Downloads beider Dokumente haben identische SHA-256-Werte
9. Bericht mit gemessenen Zeiten nach `infrastructure/docker/.staging-test/restore-report.md` schreiben (in der CI als Artefakt).

### RPO und RTO (Staging)

| Ziel | Wert | Begründung |
|---|---|---|
| **RPO** (maximaler Datenverlust) | 24 h | tägliches Backup; nach einem Fehler neuer Versuch nach 1 h; Alarm, wenn das letzte Backup älter als 26 h ist |
| **RTO** (Wiederherstellungszeit) | 2 h | Host bereitstellen (falls nötig), Images bauen, Restore, Prüfung |

Gemessene Werte: siehe „Ergebnisse“. Sie gelten für die kleine Testdatenmenge; die Restore-Dauer wächst etwa linear mit Datenbank- und Dokumentgröße. Für die Produktion mit echten Datenmengen muss das neu gemessen werden.

## Ergebnisse

### Restore-Test vom 19.11.2026 (lokal: Docker Engine 29.6, Linux-VM unter Windows 11)

Ausgeführt mit `infrastructure/tests/restore-test.sh`, gegen die Images `api`, `web`, `migrate` und `backup` dieses Branches. Ergebnis: **17 von 17 Prüfungen bestanden.**

| Messgröße | Wert |
|---|---|
| Backup-Satz | `bissinger-os-20261119T113907Z.tar.age`, 1 085 896 Byte, age-verschlüsselt |
| Datensätze (Benutzer, Kunden, Projekte, Dokumente, Versionen, Sessions, Migrationen) | Quelle 1,1,1,2,2,1,32 = wiederhergestellt 1,1,1,2,2,1,32 |
| Dokumente | 2 PDFs (300 KB, 600 KB), SHA-256 nach Download identisch |
| Dauer Backup | 5 s |
| Dauer Wiederherstellung inkl. Start einer neuen Umgebung (gemessene RTO) | 102 s |
| Negativtests | manipulierte Datei, falscher Schlüssel und nicht leere Ziel-DB werden abgelehnt; die Ziel-DB bleibt leer |
| `prisma migrate status` nach Restore | „Database schema is up to date“ |

Ein vorheriger Lauf (14 von 17) scheiterte an einem Fehler im Test, nicht in Backup oder Restore. Das Admin-Passwort wurde aus den neu erzeugten Secrets der Zielumgebung abgeleitet, statt das ursprüngliche Passwort zu verwenden. Nach der Korrektur ist der Lauf grün.

Die Messwerte gelten nur für diese kleine Testmenge. Mit echten Datenmengen muss der Restore-Test auf der Zielhardware wiederholt und die RTO neu gemessen werden.
