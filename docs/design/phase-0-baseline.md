# Bissinger OS – Frontend-Baseline (Phase 0)

Stand: 26. November 2026. Diese Bestandsaufnahme ändert weder Produktoberfläche noch Geschäftsdaten.

## Repository und Integrationsbasis

- Aktueller Branch: `feature/ui-ux-presentation-sprint`, HEAD `c592c95`.
- `HEAD` ist identisch mit `origin/fix/p0a1b-concurrent-invoice-deletion`; gegenüber `main` liegen 35 Commits voraus, `main` liegt 0 Commits voraus. Der aktuelle Feature-Branch hat keinen eigenen Remote-Tracking-Branch. Die Remote-Referenzen wurden lokal geprüft, nicht neu gefetcht.
- Der Arbeitsbaum enthält 42 geänderte getrackte Dateien, eine gelöschte Favicon-Datei und mehrere ungetrackte Dateien, darunter `presentation.css`, `icon.jpg`, Dialog-Fokuscode und frühere Screenshots. Diese Änderungen sind Teil der vorangegangenen UI-Arbeit und bleiben erhalten.
- Vorschlag für Phase 1: `feature/frontend-transformation` auf Basis des aktuellen Feature-Branches **einschließlich** seiner noch uncommitteten UI-Arbeit. Vor einem Branch-Wechsel müssen diese Änderungen verlustfrei gesichert oder in einen eigenen Worktree übertragen werden. Ein Branch nur von `main` oder nur von `c592c95` würde die lokale UI-Arbeit nicht enthalten.

## Laufender Stand und Bildbelege

- `http://localhost:3000/login` und `http://localhost:4000/api/v1/health/ready` antworteten am 26. November jeweils mit HTTP 200. Lokale Infrastruktur: Postgres, Mailpit, MinIO.
- Vorhandene Browseraufnahmen: `artifacts/polish-sprint/after/` mit Dashboard, Kunden, Projekte, Aufgaben, Kalender, Zeiten, Dokumente, Artikel, Angebote, Rechnungen, Gutschriften, Lieferanten, Bestellungen, Abos, Finanzen, Auswertungen, Posteingang, Profil, Einstellungen sowie Auth-Seiten. Dashboard-Aufnahmen liegen für 1920, 1440, 1024 und 390 px vor.
- Provenienz: Diese Aufnahmen stammen aus dem vorherigen Polish-Sprint mit dem synthetischen Konto „Polish Review“. Sie sind **historische Referenzen** und keine frisch erzeugten Phase-0-Screenshots. Nachfolgende Änderungen (unter anderem die Entfernung des sichtbaren Verleih-Moduls) können abweichen. Keine bestehenden Geschäftsdaten wurden für Phase 0 verändert.
- Neue authentifizierte Modulaufnahmen sind offen: Der frühere temporäre Testzugang wurde gelöscht. Eine isolierte, rein synthetische Browserumgebung ist vor der nächsten visuellen Vergleichsserie einzurichten. Die lokale Entwicklungsdatenbank darf dafür nicht als Produktionsdatenbestand angenommen werden.

## Frontend-System und Grenzen

- Next.js `16.4.5`, React `19.2.4`, Tailwind `4`; gemeinsame Shell in `apps/web/app/(app)/_components/`, globale Tokens in `apps/web/app/globals.css`, Präsentationsregeln in `presentation.css`, ältere Regeln in `crm.css`.
- Die globale Palette definiert Hintergrund, Text, Flächen, Rahmen, Bronze-Akzent und Fokus. Zahlreiche modulbezogene Tailwind-Klassen und feste Hexwerte bestehen daneben weiter. Das ist eine nachweisbare Ursache für abweichende Tabellen-, Formular- und Statusdarstellung.
- Bewegung ist derzeit überwiegend CSS-basiert (140–180 ms, Dialoge, Navigation, Skeletons); `prefers-reduced-motion` ist vorhanden. Für Sidebar-Breite werden Layout-Eigenschaften animiert. Keine zusätzliche Animationsbibliothek in `apps/web/package.json`.
- Die App-Shell, Dashboard und Listen haben bereits Polish-Arbeit. Ältere Modulkomponenten und `crm.css` bleiben als parallele Stilquellen bestehen. Authentifizierte Ansichten, Tastaturpfade und mobile Querformate sind auf dem aktuellen Stand erneut zu prüfen.
- Sicherheitsgrenze: Authentifizierung und Datenzugriff erfolgen über die bestehende API; Frontend-Rollenhinweise ersetzen deren Berechtigungsprüfung nicht. In Phase 0 wurden keine API-Verträge, Schemata oder Datensätze geändert.

## Vorliegende Prüfergebnisse

- Aus dem vorherigen Polish-Durchgang: Web-Lint und Typecheck erfolgreich, 52 von 52 Web-Tests erfolgreich; API-Tests 278 von 278 erfolgreich. Diese Ergebnisse wurden am aktuellen Phase-0-Stand **nicht erneut ausgeführt** und gelten daher nicht als neue Freigabe.
- Für Phase 0 neu geprüft: beide lokalen HTTP-Endpunkte erfolgreich; Git-Status und Branch-Abstand ermittelt. Weitere Tests, Build und neue Modul-Screenshots sind offen.

## Phase-0-Abschlussgrenze

Die Bestandsaufnahme ist dokumentiert. Eine Designentscheidung, ein Branch-Wechsel, ein Commit oder eine Bereitstellung wurde nicht ausgeführt. Für eine vollständig frische visuelle Baseline fehlt derzeit eine isolierte authentifizierte Testumgebung.
