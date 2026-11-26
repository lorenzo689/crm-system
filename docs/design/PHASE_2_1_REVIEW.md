# Phase 2.1 · Radical Creative Reset

Stand: 26. November 2026. Die Richtungen A und B bleiben unter `prototypes/precision/` und `prototypes/command-center/` erhalten, sind aber verworfen. C, D und E sind neue, isolierte Prototypen. Sie nutzen denselben synthetischen Datensatz aus `prototypes/shared/data.js`; Produktionsanwendung und Geschäftsdaten wurden nicht geändert.

## Referenzen: beobachtet und übertragen

Die fünf vom Eigentümer bereitgestellten Bilder zeigen helle, präzise Produktflächen, kühle Blau- und Violettakzente, gut lesbare Datenblöcke und ein stärkeres Gefühl für räumliche Ordnung. Ihre eingebetteten Diagramme wurden nicht kopiert: Für Bissinger OS liegen keine entsprechenden Geschäftszeitreihen vor.

| Beobachtet an Produktoberflächen | Übertragung auf Bissinger OS |
| --- | --- |
| [Attio](https://attio.com/help/reference/managing-your-data/views/create-and-manage-table-views): Tabellenansichten mit Filtern, Spalten und Datensatzaktionen. [Attio-Suche](https://attio.com/help/reference/productivity-collaborating/navigating-your-workspace) verbindet Navigation mit Schnellsuche. | Filter, Suchfeld und Datensatzdetail bleiben direkt an der Kundenliste; Ctrl+K öffnet eine gemeinsame Befehlssuche. |
| [Linear](https://linear.app/docs/display-options): Listen lassen sich nach Arbeitskontext anpassen. [Linear UI Refresh](https://linear.app/changelog/2026-03-12-ui-refresh) betont einheitliche Kopfzeilen und Ansichtskontrollen. | Knappes Ansichtsmenü, klare aktive Zustände, nachvollziehbare Statusspalten. |
| [Raycast](https://manual.raycast.com/quicklinks): zentrale Suche mit Tastatursteuerung und schnell erreichbaren Zielen. | Suchdialog mit Filter, Pfeiltasten und Enter. |
| [Notion Calendar](https://www.notion.com/en-gb/help/notion-calendar-settings): Kontextbereich und einstellbare Dichte für Zeitansichten. | E zeigt Meilensteine neben Aufgaben und hält Kundendetails in einem eigenen Inspektor. |
| [Vercel](https://vercel.com/docs/projects): Ein Projekt besitzt einen eigenen Kontext aus Status und Details. | D ordnet Projektstatus und nächste Entscheidung in einem kompakten Leitstand. |
| [Height, offizielles Einführungsvideo](https://www.youtube.com/watch?v=7DdOf9nmGJ8): mehrere Ansichten derselben Arbeitsobjekte. | Dieselben Kunden und Projekte erscheinen in C, D und E ohne Datenwechsel. |
| [Ramp, offizielles Produktmaterial](https://assets.ramp.com/resource_library/Ramp-saas-tools-ebook.pdf): Kennzahlen stehen neben filterbaren Transaktionen. | Nur vorhandene synthetische Zahlen werden gezeigt; es gibt keine erfundenen Umsatzkurven. |

Dies sind Beobachtungen, keine Vorlagen für ein direktes Kopieren. Die drei Informationsarchitekturen wurden für Lichttechnik, Projektarbeit und Kundenbeziehungen neu gezeichnet.

## Konzepte und kritische Verfeinerung

| | C · Modern SaaS Workspace | D · Executive OS | E · Desktop Workspace |
| --- | --- | --- | --- |
| Navigation | Breite, offene Bereichsnavigation | Kompakte Symbolleiste; vollständiges Bereichsmenü bei Bedarf | Quellenliste mit dauerhaftem Arbeitsbereich |
| Dashboard | Entscheidung, Aufgaben und Projektbeziehungen auf einer offenen Fläche | Projektportfolio, Status und Arbeitslage als dichter dunkler Leitstand | Meilensteinliste neben Aufgaben; keine leere Tagesachse |
| Kunden | Breite Tabelle, optionaler rechter Inspektor | Dunkle Datentabelle, Detail als räumlicher Drawer | Schmale zweispaltige Tabelle, permanenter Inspektor |
| Interaktion | Direkter Übergang von Liste zu Detail | Kontext öffnet über der Arbeitsfläche | Datensatzwechsel ohne Seitenwechsel |
| Schwächster Punkt in der ersten Browserrunde | Bei wenig Daten zu leere untere Hälfte. Ein vorhandener offener Beleg ergänzt jetzt den Arbeitskontext. | Mobile Entscheidungsfläche wurde zu schmal. Der Button steht dort jetzt unter dem Text. | Leere Tagesachse verbrauchte zu viel Raum. Sie wurde durch drei reale synthetische Meilensteine ersetzt. |

## Tatsächlich geladene Skills

| Installierte Datei | Konkrete Anwendung |
| --- | --- |
| `C:/Users/Lorin/.agents/skills/frontend-design/SKILL.md` | Drei unterschiedliche Navigations- und Detailmodelle statt eines Layouts in drei Farben; Typografie und Sprache tragen die Richtung. |
| `C:/Users/Lorin/.agents/skills/design-taste-frontend/SKILL.md` | Reale Produkt-UI und ein visuelles System je Konzept; Browser-Sichtprüfung auf 1440, 1920 und Mobil. Die Marketingseiten-Regel „one section per screen“ und ihr Website-Gate wurden für diesen dichten internen Arbeitsbereich nicht übernommen. |
| `C:/Users/Lorin/.agents/skills/impeccable/SKILL.md`, `reference/new-work.md`, `reference/new-work-world.md`, `reference/craft-floor.md`, `reference/critique.md` | Verworfene Welt ersetzt, nicht weiter poliert; jede Richtung getrennt auf Hierarchie, Leerraum, mobile Brüche und Zustände geprüft. Der lokale Launcher konnte seine Engine außerhalb des Arbeitsbereichs nicht initialisieren; deshalb manuelle Browserkritik. |
| `C:/Users/Lorin/.agents/skills/ui-ux-pro-max/SKILL.md` | Die Suchfunktion für `keyboard focus modal` bestätigte Fokus im Dialog, Escape und Rückgabe an den Auslöser. Das allgemeine Designsystem-Ergebnis „Enterprise Gateway“ war für ein internes Produkt unpassend und wurde verworfen. |
| `C:/Users/Lorin/.agents/skills/web-design-guidelines/SKILL.md`, `references/command.md` | Sichtbarer Fokus, benannte Symbolbuttons, Labels, native Dialoge, reduzierte Bewegung und Lade-/Leerzustände überprüft. |
| `C:/Users/Lorin/.agents/skills/vercel-react-best-practices/SKILL.md`, `rules/js-batch-dom-css.md` | Gelesen; React-Regeln sind auf die statischen Vanilla-JS-Prototypen nicht anwendbar. DOM-Zustände werden pro Interaktion in einem Renderdurchgang aktualisiert. |
| `C:/Users/Lorin/.agents/skills/webapp-testing/SKILL.md` | Native Python-Playwright-Prüfung im lokalen Chrome und Screenshots unter `prototypes/screenshots/reset/`. |

## Browserprüfung und Grenzen

- Pro Konzept: Dashboard, Kunden, geöffneter Datensatz und Befehlssuche bei 1920×1080, 1440×900 und 390×844; insgesamt 36 Aufnahmen.
- Geprüft: Bereichswechsel, vollständiges Navigationsinventar, Suche, Statusfilter, Leerzustand, Ladeskelett, Datensatzdetail, Dialog und Tastenkürzel. Keine JavaScript-Seitenfehler, kein horizontaler Seitenüberlauf.
- Formulare speichern keine Daten. Andere Navigationspunkte zeigen einen ausdrücklichen Vorschauhinweis, weil Phase 2.1 nur Dashboard und Kundenverwaltung umfasst.
- Die drei Konzepte sind Designvorschläge. Keines wurde als Produktionsdesign freigegeben.
