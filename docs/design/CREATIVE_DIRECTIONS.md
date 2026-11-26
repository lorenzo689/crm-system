# Zwei Richtungen für Bissinger OS

Beide Richtungen sind Entwürfe für ein dauerhaft genutztes Arbeitsprodukt. Sie teilen Datenstruktur, Barrierefreiheit, formelle deutsche Sprache und einheitliche Kernkomponenten. Die Entscheidung ist für Phase 2 offen.

| | A – Precision Workspace | B – Lighting Command Center |
| --- | --- | --- |
| Charakter | Geordnete technische Werkbank: souverän, leise, äußerst präzise. | Kontrollraum für Lichtprojekte: konzentriert, gegenwärtig, etwas expressiver. |
| Farbe | Graphit `#20282D`, kühles Offwhite `#F4F6F5`, Weiß `#FFFFFF`, warmes Gold `#A66B1D`, ruhiges Grün `#3F7563`, Warnung `#9A5B19`. Dunkel ist primär die Navigation. | Tiefer Schiefer `#17242B`, Nachtblau `#20343D`, helles Grau `#F1F4F3`, warmes Gold `#B98536`, Signal-Cyan `#4B91A3`, Warnung `#B26835`. Dunkle Flächen markieren Arbeitskontext, nicht jede Tabelle. |
| Typografie | Eine gut lesbare Sans mit festen, kompakten Größen; tabellarische Ziffern für Daten. Unaufgeregte Überschriften. | Dieselbe funktionale Sans, aber stärkere Größenkontraste für Projektname, Status und Zeitbezug; Datenzeilen bleiben nüchtern. Keine Display-Schrift in Tabellen. |
| Raster und Dichte | 4/8-px-Rhythmus, klare Inhaltskante, 40–44-px-Standardzeilen; optionale kompakte Ansicht. | Gleicher Grundrhythmus, stärkere Trennung von Arbeitsbereichen; Status- und Zeitachsen erhalten mehr Raum, Standardtabellen bleiben effizient. |
| Navigation | Schlanke dunkle Sidebar, eindeutiger aktiver Zustand, kontextuelle Unteransichten am Datensatz. | Dunkle Sidebar plus gut sichtbarer Projektkontext; wichtige Wechsel als klar lesbare „Kanäle“ ohne Cockpit-Symbolik oder Instrumentenattrappen. |
| Dashboard | Handlungsbedarf, Aufgaben, Termine und wenige verlässliche Kennzahlen in ruhiger Reihenfolge. | Dieselben Daten, aber ein fokussierter Projektlage-Bereich mit deutlicher Zeit- und Statushierarchie. Keine erfundenen Live-Metriken. |
| Tabellen und Formulare | Hohe Konsistenz; Filterleiste direkt über der Tabelle, detailreiche Datensatzseite, kurze Formabschnitte. | Gleiche Komponenten; ausgewählte Projekt- und Terminansichten dürfen Beziehungen und Verlauf räumlicher zeigen. Keine Spezialeffekte in Beleg- oder Kundentabellen. |
| Bewegung | 80–140 ms für Hover/Press, 160–220 ms für Panel/Dialog; kaum Bewegung beim Navigieren. | 80–140 ms für häufige Aktionen, 180–250 ms für Panel- und Kontextwechsel; eine räumliche Bewegung zeigt, wo ein Datensatz geöffnet wurde. |

## Ansichten als Prüfstein

- **Kundenliste:** A betont Sortierung und Scannbarkeit; B setzt einen stärkeren Fokus auf Beziehung und Projektkontext, ohne zusätzliche Spalten zu erzwingen.
- **Projekt-Detail:** A ordnet Status, nächste Aktion und Belege in einer festen Hierarchie. B kann eine prägnantere Projektlage mit Terminbezug zeigen.
- **Aufgaben:** In beiden Richtungen gleiche Spalten zwischen Gruppen, kurze Leergruppen und explizite „Überfällig“-Kennzeichnung statt Farbfleck.
- **Zeiten und Gutschriften:** Beide nutzen denselben Seitenkopf, dieselben Formfelder und denselben Tabellenstandard wie die Kernmodule.

## Entscheidungskriterien

A ist passend, wenn hohe Datendichte und schnelle Einarbeitung Vorrang haben. B ist passend, wenn der Projektkontext und die eigenständige Bissinger-Identität stärker sichtbar werden sollen. Beide müssen mit realistischen langen Namen, wenigen Datensätzen, 390-px-Mobilansicht, Tastatur und reduzierter Bewegung bestehen.

Die genannten `DESIGN_VARIANCE`, `MOTION_INTENSITY` und `VISUAL_DENSITY` sind in der installierten Design-Taste-Version nicht als steuerbare Einstellungen nachgewiesen. Ihre Werte 5/7/7 werden deshalb als Briefing interpretiert: mittlere Varianz, bewusste Bewegung und arbeitsfähige Informationsdichte.
