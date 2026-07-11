# ADR 002: Modularer NestJS-Monolith

- **Status:** Accepted
- **Datum:** 2026-07-11

## Kontext

Bissinger OS soll Kunden, Projekte, Aufgaben, Dokumente, Kommunikation, Angebote, Integrationen, Automatisierungen und KI-Funktionen verbinden.

Die Domänen benötigen klare Grenzen. Gleichzeitig wäre eine Microservice-Architektur zu Beginn mit zusätzlichem Deployment, verteilten Transaktionen, Netzwerkfehlern, Observability und höherem Betriebsaufwand verbunden.

## Entscheidung

Das Backend wird als **modularer Monolith mit NestJS und TypeScript** entwickelt.

Alle Kernmodule laufen zunächst als eine deploybare API-Anwendung. Die Module werden fachlich getrennt und kommunizieren über klar definierte Services, Ports oder interne Domain Events.

Beispielhafte Module:

```text
auth
organizations
users
customers
contacts
projects
tasks
activities
documents
communications
offers
integrations
automation
ai
```

Module dürfen nicht direkt auf interne Implementierungsdetails anderer Module zugreifen. Datenbankzugriffe und öffentliche Modul-Schnittstellen werden eindeutig zugeordnet.

## Begründung

- Einfacher Betrieb und überschaubares Deployment
- Klare fachliche Modulgrenzen ohne verteilte Systemkomplexität
- Transaktionen über zusammengehörige Geschäftsvorgänge bleiben handhabbar
- Gute Unterstützung durch NestJS-Module, Dependency Injection, Guards und Interceptors
- Einzelne rechenintensive oder integrationslastige Komponenten können später gezielt ausgelagert werden
- Für die erwartete frühe Last besteht kein technischer Bedarf für Microservices

## Konsequenzen

### Positiv

- Schnellerer Entwicklungsstart
- Einfachere lokale Entwicklungsumgebung
- Einheitliches Logging, Error Handling und Security-Modell
- Weniger Infrastruktur und geringere Betriebskosten
- Refactoring über Modulgrenzen bleibt innerhalb eines Repositories möglich

### Negativ

- Fehler oder Ressourcenprobleme können die gesamte API betreffen.
- Unsaubere Modulgrenzen können zu einem schwer wartbaren Monolithen führen.
- Unabhängige Skalierung einzelner Module ist zunächst nicht möglich.
- Datenbanktabellen liegen anfangs in derselben PostgreSQL-Instanz.

### Vorgaben

- Fachmodule besitzen klar definierte öffentliche Schnittstellen.
- Direkte Cross-Module-Repository-Zugriffe sind zu vermeiden.
- Externe Integrationen und langlaufende Verarbeitung werden asynchron ausgeführt.
- Eine spätere Auslagerung erfordert einen belegbaren technischen oder organisatorischen Nutzen.
- Microservices werden nicht vorsorglich eingeführt.
