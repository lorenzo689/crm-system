# ADR 003: PostgreSQL als primäre Datenbank

- **Status:** Accepted
- **Datum:** 2026-07-11

## Kontext

Die Kerndaten von Bissinger OS sind stark relational. Kunden, Kontakte, Projekte, Aufgaben, Mitglieder, Dokumente, Angebote und Aktivitäten besitzen zahlreiche fachliche Beziehungen und benötigen konsistente Transaktionen.

Zusätzlich werden flexible Metadaten, Volltextsuche und später möglicherweise semantische Suche benötigt.

## Entscheidung

**PostgreSQL** wird als primäre relationale Datenbank für Bissinger OS eingesetzt.

Der reguläre Datenzugriff erfolgt ausschließlich über die NestJS-API. Als ORM und Migrationswerkzeug wird zunächst **Prisma** verwendet. Komplexe oder performancekritische Abfragen dürfen bei Bedarf gezielt als SQL umgesetzt werden.

Dateibinärdaten werden nicht standardmäßig in PostgreSQL gespeichert. Die Datenbank speichert fachliche Dokumentdatensätze, Metadaten und Referenzen auf externe oder objektbasierte Speicher.

## Begründung

- Geeignet für komplexe relationale Datenmodelle
- Transaktionen, Constraints und referenzielle Integrität
- Unterstützung für JSON-Daten ohne Wechsel zu einer separaten NoSQL-Datenbank
- Gute Unterstützung durch Node.js, NestJS und Prisma
- Reife Backup-, Replikations- und Monitoring-Werkzeuge
- Erweiterbarkeit um Volltext- und Vektorsuche
- Geringes Vendor-Lock-in durch einen etablierten offenen Standard

## Konsequenzen

### Positiv

- Konsistente Datenhaltung
- Datenbankseitige Unique-, Check- und Foreign-Key-Constraints
- Gute Abfragemöglichkeiten für CRM- und ERP-Auswertungen
- Breite Hosting-Auswahl
- Langfristig gute Portierbarkeit

### Negativ

- Schemaänderungen müssen kontrolliert migriert werden.
- PostgreSQL ersetzt kein Objekt- oder Dokumenten-Dateisystem.
- Prisma bildet nicht jede PostgreSQL-Funktion vollständig ab.
- Betrieb, Backups und Wiederherstellung müssen trotz Managed Service regelmäßig geprüft werden.

### Vorgaben

- UUIDs als technische Primärschlüssel
- Fachliche Nummern wie Kunden- oder Projektnummern als separate eindeutige Felder
- Fremdschlüssel und Unique Constraints werden in der Datenbank definiert
- Kein direkter Datenbankzugriff aus der Next.js-Webanwendung
- Produktionsmigrationen sind versioniert und Bestandteil des Deployments
- Hard Deletes werden nur für ausdrücklich freigegebene Datenarten verwendet
- Backup-Wiederherstellungen werden regelmäßig getestet
