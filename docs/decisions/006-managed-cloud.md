# ADR 006: Managed Cloud in der EU, bevorzugt Microsoft Azure

- **Status:** Accepted
- **Datum:** 2026-07-11

## Kontext

Bissinger OS verarbeitet Kunden-, Projekt-, Kommunikations- und perspektivisch kaufmännische Daten. Ein selbst betriebener Server würde eigene Verantwortung für Betriebssysteme, Datenbank-Patching, Backups, Wiederherstellung, Monitoring, Hochverfügbarkeit und Notfallbetrieb erzeugen.

Durch die bestehende Nutzung von Microsoft 365 bietet Microsoft Azure organisatorische und technische Integrationsvorteile. Gleichzeitig soll die Anwendung nicht unnötig eng an proprietäre Dienste gekoppelt werden.

## Entscheidung

Produktive Workloads werden zunächst in einer **Managed Cloud innerhalb einer geeigneten EU-Region** betrieben. Bevorzugter Cloud-Anbieter ist **Microsoft Azure**.

Vorgesehene Zielkomponenten:

- Container- oder App-Service für die NestJS-API
- geeignetes Hosting für die Next.js-Webanwendung
- Azure Database for PostgreSQL Flexible Server als Managed PostgreSQL
- Managed Secret Store, vorzugsweise Azure Key Vault
- zentralisiertes Logging und Monitoring
- Objekt- oder Microsoft-365-Speicher für Dokumente, abhängig vom jeweiligen Fachprozess

Die Anwendung bleibt so weit wie wirtschaftlich sinnvoll portierbar. Kernlogik wird nicht unnötig an proprietäre Azure-Laufzeitmodelle gekoppelt.

## Begründung

- Reduzierter Betriebs- und Wartungsaufwand
- Managed Backups, Patching und optionale Hochverfügbarkeit
- Gute Integration mit Microsoft Entra ID und Microsoft 365
- Zentrale Verwaltung von Identitäten, Secrets, Monitoring und Netzwerkzugriffen
- EU-Regionen unterstützen die datenschutzorientierte Betriebsplanung
- PostgreSQL und containerisierte Anwendungen bewahren grundsätzliche Portierbarkeit

## Konsequenzen

### Positiv

- Kein eigener physischer Serverbetrieb zum Projektstart
- Schnellere Bereitstellung reproduzierbarer Umgebungen
- Professionelle Backup-, Monitoring- und Skalierungsoptionen
- Vereinfachte Microsoft-Identitätsintegration
- Getrennte Entwicklungs-, Test- und Produktionsumgebungen möglich

### Negativ

- Laufende Cloudkosten
- Abhängigkeit von Cloud-Verfügbarkeit und Anbieterprozessen
- Kosten müssen aktiv überwacht und begrenzt werden.
- Datenschutzkonfiguration entsteht nicht automatisch durch die Wahl einer EU-Region.
- Bestimmte Managed Services können späteren Providerwechsel erschweren.

### Vorgaben

- Entwicklungs-, Test- und Produktionsumgebungen werden getrennt.
- Infrastruktur wird nach Möglichkeit als Code verwaltet.
- Secrets werden nicht in Repositorys oder normalen Umgebungsdateien der Produktion gespeichert.
- Datenbankzugriff wird netzwerkseitig eingeschränkt.
- Automatische Backups und Aufbewahrungsfristen werden konfiguriert.
- Wiederherstellungstests sind verpflichtend.
- Logging darf keine Tokens, Secrets oder unnötige personenbezogene Inhalte enthalten.
- Kostenbudgets und Warnungen werden eingerichtet.
- Hochverfügbarkeit wird nach Kritikalität und nicht pauschal aktiviert.
- Datenschutz, Auftragsverarbeitung und Löschkonzepte werden separat dokumentiert.
