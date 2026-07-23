# Bissinger OS

## Lokale Entwicklungsumgebung

Die Anwendung läuft lokal per `pnpm`, die Infrastruktur-Dienste per Docker Compose.

### Standard-Ports

- Next.js Web: `http://localhost:3000`
- NestJS API: `http://localhost:4000`
- PostgreSQL: `localhost:5432`
- Mailpit UI: `http://localhost:8025`
- Mailpit SMTP: `localhost:1025`

### Infrastruktur starten

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

### Anwendungen lokal starten

```bash
pnpm dev
```

Oder einzeln:

```bash
pnpm --filter my-app dev
pnpm --filter api start:dev
```

### Datenbank prüfen

```bash
pnpm --filter api exec prisma migrate status
pnpm --filter api exec prisma studio
```

## Erstes lokales Setup

Nach dem ersten `prisma migrate dev` muss die Basis-Organisation
`bissinger-lights` einmalig in der Datenbank vorhanden sein, damit die
Registrierung funktioniert.

Praktischer Dev-Weg:

1. Infrastruktur starten und Migrationen anwenden.
2. Falls die Organisation noch fehlt, per idempotentem SQL anlegen:

```bash
cd apps/api
pnpm exec prisma db execute --stdin
```

```sql
INSERT INTO organizations (id, name, slug, status, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Bissinger Lights', 'bissinger-lights', 'ACTIVE', NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;
```

Alternativ könnt ihr die vorhandenen Test-Skripte in `apps/api/scripts`
verwenden, wenn ihr den Setup-Flow gezielt mit User und Organisation
nachbauen wollt.

## Qualitätsprüfungen

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
