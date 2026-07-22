# ADR 007: Lokale Authentifizierung mit E-Mail und Passwort

- **Status:** Accepted
- **Datum:** 2026-07-22
- **Ersetzt:** ADR 005

## Kontext

Die initial geplante Microsoft-Entra-ID-Integration wird für die lokale Entwicklungsphase zurückgestellt. Bissinger OS benötigt zunächst einen einfachen, lokal betreibbaren Registrierungs- und Anmeldeprozess.

## Entscheidung

Benutzer registrieren sich vorerst mit einer E-Mail-Adresse der Domain `bissinger-lights.de` und einem Passwort. Passwörter werden ausschließlich als bcrypt-Hash gespeichert. Nach erfolgreicher Anmeldung stellt die API ein kurzlebiges JWT aus.

Eine E-Mail-Verifizierung und administrative Freigabe sind in dieser lokalen Entwicklungsphase nicht vorgesehen. Organisationsmitgliedschaft und fachliche Autorisierung werden weiterhin serverseitig aus der Datenbank geladen und nicht allein aus der E-Mail-Domain abgeleitet.

Microsoft Entra ID bleibt eine mögliche spätere Authentifizierungsoption, ist aber nicht Bestandteil dieser Ausbaustufe.

## Konsequenzen

- Die API benötigt Endpunkte für Registrierung und Anmeldung.
- Das Benutzerkonto erhält einen optionalen Passwort-Hash, damit bestehende Testdaten migrierbar bleiben.
- Registrierungsdaten werden serverseitig validiert.
- Klartextpasswörter werden niemals gespeichert oder protokolliert.
- Die Domainprüfung ersetzt keine Organisationsmitgliedschaft oder Berechtigungsprüfung.
- Vor einem extern erreichbaren Betrieb müssen E-Mail-Verifizierung, Rate Limiting, sichere Secret-Verwaltung und Schutz vor automatisierten Anmeldeversuchen ergänzt werden.
