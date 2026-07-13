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

## Qualitätsprüfungen

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
