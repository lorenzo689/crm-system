# ADR 005: Authentifizierung mit Microsoft Entra ID

- **Status:** Accepted
- **Datum:** 2026-07-11

## Kontext

Bissinger Lights verwendet Microsoft 365. Mitarbeiter sollen sich mit ihrer bestehenden Unternehmensidentität anmelden, ohne ein zusätzliches Bissinger-OS-Passwort verwalten zu müssen.

Die erfolgreiche Anmeldung bei Microsoft allein darf jedoch nicht automatisch den fachlichen Zugriff auf Unternehmensdaten gewähren. Mitgliedschaft, Status und spätere Berechtigungen werden weiterhin in Bissinger OS verwaltet.

## Entscheidung

Die Benutzer-Authentifizierung erfolgt über **Microsoft Entra ID** als Identity Provider.

Bissinger OS wird zunächst als **Single-Tenant-Anwendung** im Microsoft-Entra-Tenant von Bissinger Lights registriert. Für die Webanmeldung wird OpenID Connect auf Basis des OAuth-2.0-Authorization-Code-Flows mit PKCE verwendet.

Bissinger OS speichert keine lokalen Benutzerpasswörter.

Die Identität wird anhand der stabilen Entra-Identifikatoren, insbesondere Tenant-ID und Subject/Object-ID, mit einem internen `User` verknüpft. Die E-Mail-Adresse dient nicht als alleiniger dauerhafter Identitätsschlüssel.

Nach der Microsoft-Authentifizierung prüft die NestJS-API zusätzlich:

1. Ist der Tenant zugelassen?
2. Existiert eine interne Benutzerzuordnung?
3. Ist die Organisationsmitgliedschaft aktiv?
4. Ist die Organisation aktiv?
5. Ist der Zugriff nach dem internen Rechtekonzept erlaubt?

Eine offene Selbstregistrierung ist nicht vorgesehen. Neue Benutzer werden administrativ angelegt oder eingeladen.

## Begründung

- Bestehende Microsoft-365-Unternehmensidentitäten werden wiederverwendet.
- Keine zusätzliche Passwortverwaltung in Bissinger OS
- Zentrale Kontosperrung und Identitätsverwaltung über Microsoft Entra ID
- Gute Grundlage für spätere Microsoft-Graph-Integrationen
- Single-Tenant reduziert die Angriffsfläche und verhindert unbeabsichtigte externe Anmeldungen
- Interne Mitgliedschaft bleibt unabhängig von der technischen Identitätsbestätigung kontrollierbar

## Konsequenzen

### Positiv

- Einheitliches Mitarbeiter-Login
- Weniger Passwort- und Supportaufwand
- Möglichkeit zur Nutzung bestehender Entra-Sicherheitsrichtlinien
- Klare Trennung zwischen externer Identität und interner Autorisierung
- Vorbereitung auf Outlook-, Kalender-, Teams-, SharePoint- und OneDrive-Integrationen

### Negativ

- Bissinger OS ist für die Anmeldung von der Verfügbarkeit des Microsoft Identity Platform abhängig.
- App-Registrierung, Redirect URIs und Secrets beziehungsweise Zertifikate müssen sicher verwaltet werden.
- Lokale Entwicklung benötigt separate, kontrollierte Redirect URIs.
- Externe Partner benötigen später einen bewusst entworfenen Gast- oder B2B-Prozess.
- Microsoft-Graph-Berechtigungen erfordern ein separates Consent- und Least-Privilege-Konzept.

### Vorgaben

- Single-Tenant-App-Registrierung
- Keine lokale Passwortanmeldung in Version 1
- Keine Autorisierung ausschließlich anhand der E-Mail-Domain
- Serverseitige Prüfung von Issuer, Audience, Tenant und Token-Signatur
- Kurzlebige Sessions und sichere HTTP-only-Cookies
- Client Secrets niemals im Browser oder Repository
- Bevorzugt Zertifikate oder Managed Identities für produktive Server-zu-Server-Zugriffe
- Microsoft-Graph-Berechtigungen werden separat und nach Least Privilege freigegeben
- Authentifizierung und interne Berechtigungen bleiben getrennte Verantwortungsbereiche
