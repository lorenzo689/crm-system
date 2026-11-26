# Phase 2 · Prototypenvergleich

Stand: 26. November 2026. Beide Richtungen nutzen ausschließlich den synthetischen Datensatz in `prototypes/shared/data.js`. Die Produktanwendung, API und Datenbank wurden in dieser Phase nicht verändert.

## A · Precision Workspace

**Absicht:** Ein ruhiger, präziser Arbeitsbereich für tägliche Aufgaben mit hoher Lesbarkeit und klarer Reihenfolge.

**Im Browser geprüft:** Die Entscheidung im Dashboard steht vor den Kennzahlen; Kundentabelle, Projektlage und Rechnung behalten bei 1440 und 1920 Pixel eine lesbare Dichte. Die mobile Tabellenansicht scrollt innerhalb der Tabelle horizontal.

**Impeccable-Kritik und Verfeinerung:** Die erste Fassung wirkte in der Kundenansicht zu statisch. Statusfilter, Suche, Aktualisieren mit Ladeskelett und ein klarer Leerzustand machen die Informationsfläche nachvollziehbar. Der dunkle Projektfokus schafft einen einzelnen visuellen Schwerpunkt, ohne weitere Zierdiagramme einzuführen.

**Offene Entscheidung:** Die Richtung ist absichtlich zurückhaltend. Bei einer Umsetzung sollte die Informationsdichte mit realen langen Namen, zahlreichen Zeilen und komplexeren Rollen erneut geprüft werden.

## B · Lighting Command Center

**Absicht:** Ein technischer Leitstand mit stärkerer Identität, sichtbarer Projektlage und kontrollierter Lichtmetapher.

**Im Browser geprüft:** Dunkle Kopfzeile, Bahnschrift, gestufte Statusflächen und ein grafisch betonter Projektfokus unterscheiden diese Richtung deutlich von A. Tabellen und Formulare bleiben helle, gut lesbare Arbeitsflächen. Mobil bleibt die dunkle Kopfzeile erhalten.

**Impeccable-Kritik und Verfeinerung:** Die erste Fassung war A in der Fläche zu ähnlich. Kopfzeile und Kennzahlen wurden daher dunkler und technischer; der Ring im Projektfokus bleibt dezent und trägt keine erfundene Kennzahl. Die vertikale goldene Akzentlinie führt den Blick auf dringende Arbeit.

**Offene Entscheidung:** Der stärkere Kontrast kann bei sehr langen Arbeitstagen intensiver wirken. Bei einer Umsetzung sollten Nutzerinnen und Nutzer die reale Datenmenge und die Wirkung der dunklen Kopfzeile beurteilen.

## Browserprüfung

- Ansichten: Dashboard, Kunden, Projekt und Rechnung für beide Richtungen bei 1920×1080, 1440×900, 1024×768 und 390 Pixel Breite.
- Zusätzlich je Richtung: Befehlssuche und Formular bei 1440×900.
- Ergebnis: 32 Ansichtsaufnahmen, 4 Interaktionsaufnahmen; keine Seitenfehler und kein horizontaler Seitenüberlauf. Die Kundentabelle scrollt auf schmalen Displays intern.
- Interaktionen geprüft: Navigation, Statusfilter, Suche mit Leerzustand, Ladeskelett, Detail-Tabs, Ctrl+K und Enter, Formularbestätigung mit Toast.
- Ablage: `prototypes/screenshots/`; Prüfskripte: `prototypes/review.py` und `prototypes/interaction_review.py`.
- Kurze Videoaufnahme war mit der vorhandenen lokalen Playwright-Version nicht möglich: die benötigte FFmpeg-Version fehlt. Die Interaktionen wurden stattdessen automatisiert im echten Chrome geprüft.

## Prototypgrenzen

Die Formulare bestätigen nur eine Vorschau und speichern keine Daten. Sekundäre Detail-Tabs zeigen exemplarische Inhalte oder Leerzustände. Es wurden keine produktiven Geschäftsprozesse nachgebildet.
