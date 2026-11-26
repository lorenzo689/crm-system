# Sichtbare KI-Oberfläche im UI/UX-Sprint

Der eingebettete Assistent ist aus Sidebar, Befehlspalette und Posteingang entfernt. Die Frontendroute `/assistant` leitet auf `/dashboard` weiter. Die vorhandene API und ihre Daten bleiben für eine spätere MCP-Integration erhalten.

## Verbleibende API

Unter `/api/v1/ai` bleiben folgende Routen bestehen:

| Route | Zugriff |
| --- | --- |
| `GET /status` | Angemeldete Benutzer |
| `POST /chat`, `POST /chat/stream` | Angemeldete Benutzer; je 20 Anfragen pro Minute |
| `GET /proposals` | Owner und Admin |
| `POST /proposals/:id/approve`, `POST /proposals/:id/reject` | Owner und Admin |
| `POST /agents/run` | Owner und Admin; 5 Anfragen pro Minute |

Der Controller verwendet `JwtAuthGuard` und `RolesGuard`. Er ermittelt die Organisation aus der authentifizierten Benutzeridentität und nicht aus Clientparametern. Die serverseitige Sitzungs- und CSRF-Prüfung bleibt unverändert. Die Routen sind weiterhin erreichbar für berechtigte API-Clients; die UI-Änderung ist keine API-Abschaltung.
