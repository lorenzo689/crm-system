# Verbindliche Grenzen für die Transformation

## Produkt und Daten

- Bestehende Geschäftslogik, API-Verträge, Datenbankschemata, Sicherheitsprüfungen und vorhandene Geschäftsdaten erhalten.
- Keine erfundenen Zahlen, Termine oder Projektzustände. Leere, kleine und sehr lange Datensätze ausdrücklich gestalten.
- Das echte Bissinger-Bildlogo, dunkle Navigation und warmes Gold bleiben Markenelemente. Gold signalisiert Aktion oder Auswahl; Statusfarben haben eine feste Bedeutung und stets Textunterstützung.
- Die Oberfläche bleibt konsistent deutsch mit formeller Anrede. Eingebetteter KI-Assistent, MCP und der sichtbare Verleihbereich bleiben außerhalb des Entwurfs.

## Zugänglichkeit und Verhalten

- Sichtbarer Tastaturfokus, semantische Bedienelemente, benannte Icon-Aktionen, stabile Fokusführung in Dialogen und vollständige Tastaturwege.
- Normaltext mindestens 4,5:1 Kontrast, große Schrift mindestens 3:1. Zustände nie nur über Farbe vermitteln.
- `prefers-reduced-motion` respektieren. Häufige Interaktionen kurz halten; keine zeilenweise Seitenlade-Animation oder Bewegung ohne Informationswert.
- Bei 390 px und breiteren Ansichten dürfen Inhalte nicht unkontrolliert überlaufen. Tabellen können gezielt horizontal scrollen; wichtige Aktionen müssen auffindbar bleiben.

## Architektur und Umsetzung

- Next.js 16.4.5: vor jeder Codeänderung die passende Anleitung unter `apps/web/node_modules/next/dist/docs/` lesen (`AGENTS.md`, `apps/web/AGENTS.md`).
- Vorhandene lokale UI-Änderungen auf `feature/ui-ux-presentation-sprint` verlustfrei übernehmen. Der vorgeschlagene Transformationsbranch darf nicht nur vom Commit `c592c95` ausgehen.
- Bestehende Tokens und Komponenten vor neuen Abstraktionen prüfen; `crm.css`, `presentation.css`, globale Tokens und modulbezogene Tailwind-Klassen sind derzeit parallele Stilquellen.
- Bei der späteren Prüfung ausschließlich isolierte synthetische Daten und sichere lokale Umgebungen verwenden. Keine Produktionsdaten verändern.

Phase 1 umfasst nur Recherche und Richtung. Es erfolgen keine UI-Änderungen, Commits, Merges oder Deployments.
