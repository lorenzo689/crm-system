# ADR 004: Versionierte REST-API mit OpenAPI

- **Status:** Accepted
- **Datum:** 2026-07-11

## Kontext

Neben der Next.js-Webanwendung sollen später Microsoft-365-Integrationen, Hintergrundprozesse, Automatisierungen, KI-Dienste und möglicherweise mobile Anwendungen auf die Geschäftslogik von Bissinger OS zugreifen.

Die Geschäftslogik darf deshalb nicht ausschließlich in React-Komponenten, Server Actions oder einzelnen Integrationsworkflows liegen.

## Entscheidung

Die NestJS-Anwendung stellt eine **API-first entwickelte, versionierte REST-API** bereit.

Die erste öffentliche interne Version verwendet den Präfix:

```text
/api/v1
```

Die API wird mit **OpenAPI** beschrieben. DTOs, Validierung, Fehlerformate und Authentifizierungsanforderungen werden zentral in der API definiert.

Für das Frontend wird aus der OpenAPI-Beschreibung ein typisierter TypeScript-Client erzeugt. GraphQL wird nicht zu Projektbeginn eingeführt.

## Begründung

- REST ist für die vorgesehenen CRUD- und Workflow-Endpunkte ausreichend.
- NestJS unterstützt Controller, DTO-Validierung und OpenAPI-Dokumentation direkt.
- Eine API-first-Struktur ermöglicht mehrere Clients und Integrationen.
- Generierte Clients reduzieren Unterschiede zwischen Frontend- und Backend-Typen.
- Versionierung schafft einen kontrollierten Rahmen für spätere inkompatible Änderungen.
- REST ist für interne Entwickler und Integrationspartner leicht nachvollziehbar.

## Konsequenzen

### Positiv

- Klare Trennung von Darstellung und Geschäftslogik
- Wiederverwendbare API für Web, Worker und Integrationen
- Automatisch dokumentierbare Endpunkte
- Typisierter Frontend-Client
- Bessere Testbarkeit der Geschäftslogik

### Negativ

- API-Verträge und generierter Client müssen gepflegt werden.
- Kleine Änderungen erfordern teilweise Anpassungen in mehreren Workspace-Paketen.
- REST kann bei stark verschachtelten Leseanforderungen zusätzliche Endpunkte benötigen.
- API-Versionierung darf nicht als Ersatz für saubere Abwärtskompatibilität verwendet werden.

### Vorgaben

- Ressourcenorientierte URLs und korrekte HTTP-Methoden
- Einheitliches Fehlerformat
- Serverseitige Eingabevalidierung
- Pagination, Filterung und Sortierung für Listenendpunkte
- Keine internen Datenbankmodelle als öffentliche Response-DTOs
- Idempotency für kritische wiederholbare Schreiboperationen
- Correlation IDs für nachverfolgbare Requests
- OpenAPI-Spezifikation ist Bestandteil der CI-Prüfung
