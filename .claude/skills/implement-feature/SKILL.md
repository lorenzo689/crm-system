---
name: implement-feature
description: Use when adding or extending functionality in Bissinger OS – a new API endpoint, module, Prisma model/field/migration, business rule, or a new page/form that talks to the API. Gives the standard workflow (requirements → plan → implementation → tests → verification → report) and the project patterns for NestJS modules, organization scoping, roles, Prisma migrations and web data access. Not for pure bug fixes (use fix-bug) or UI-only polish (use frontend-ux).
---

# Implement a feature

## Workflow

1. **Requirements.** Restate the request as acceptance criteria (who may do what, which organization/role/project, what is persisted, what the UI shows). Ask only if a decision changes the design.
2. **Explore.** Read the closest existing module end to end before writing anything (e.g. `apps/api/src/modules/customers/`, `…/sales-documents/`; web: the matching `apps/web/app/(app)/<area>/`). Reuse its structure; do not invent a new pattern.
3. **Plan.** Smallest change that meets the criteria: files to touch, schema change (if any), endpoints with method + role, tests. Mention anything security-relevant.
4. **Implement** following the rules below.
5. **Tests** (see below). New behaviour without a test is not done.
6. **Verify** with the `verify-changes` skill.
7. **Security-relevant?** (auth, roles, org/project scoping, sessions, CSRF, uploads, money, jobs, raw SQL) → run the `security-review` skill; prefer an independent subagent for it.
8. **Report:** what changed (files), how it was verified (commands + results), open risks. No commit/push without approval.

## API rules (`apps/api`)

- Module layout: `<name>.module.ts`, `.controller.ts`, `.service.ts`, optional `.repository.ts`, `dto/*.dto.ts` with `class-validator` decorators (the global `ValidationPipe` uses `whitelist` + `forbidNonWhitelisted`).
- Controller: `@UseGuards(JwtAuthGuard)` at class level; add `RolesGuard` + `@Roles('OWNER', 'ADMIN')` where only admins may act (`modules/auth/decorators/roles.decorator.ts`). Project-scoped records: `ProjectWriteGuard` + `@ProjectWrite(...)` (`modules/access/project-write.guard.ts`).
- Organization: take it on the server – follow the module's existing pattern (`usersService.getOrganizationId(payload.sub)` or `(req.user as AuthUser).organizationId`). Never accept an `organizationId` from body, query or params.
- Every read and write filters by `organizationId` (`findFirst({ where: { id, organizationId } })`, `updateMany`/`deleteMany` with the same filter and check `count`). A record of another organization answers 404, not 403.
- IDs in routes: `ParseUUIDPipe`. Multi-step writes that must be consistent: `prisma.$transaction`.
- Raw SQL only as tagged `$queryRaw`/`$executeRaw` templates; never `…Unsafe` with input.
- Background jobs: only via `BackgroundJobsService.run` and its `JobContext` (lease, `assertLeaseHeld`, `runFenced`); side effects must be idempotent (see `docs/security/sprint-3-1-hardening.md`).
- Logs: no request bodies, tokens, e-mail addresses or document contents.

## Prisma

- Edit `apps/api/prisma/schema.prisma`, then `pnpm exec prisma migrate dev --create-only --name <snake_case>` (in `apps/api`), review the SQL, apply to the test DB, and check `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` = no difference.
- Additive and backwards compatible by default (nullable or defaulted columns). Destructive changes need an explicit plan and approval. Never edit an applied migration.

## Web (`apps/web`) – see also `frontend-ux`

- Data via `apiFetch`/`apiFetchRaw` (`lib/auth-api.ts`) or `useApi`/`useApiResource`; after mutations `invalidateApi(prefix)`. Never raw `fetch`, never a direct API URL in `<a>`, `<img>` or `<iframe>` (documents: `lib/documents.ts`).
- Hiding a button for non-admins (`useCurrentUser().isAdmin`) is only a hint; the API must enforce the role.

## Tests

- API unit tests next to the code (`*.spec.ts`, Jest).
- API behaviour with auth, roles or organizations: integration test in `apps/api/test/*.e2e-spec.ts` using `test/helpers/harness.ts` (`createTestApp`, `resetDatabase`, `createOrganization`, `createUser`, `loginAs`, `asUser`). Always include: unauthenticated → 401, wrong role → 403, other organization → 404, mutation without CSRF token → 403.
- Web logic: `apps/web/test/*.test.ts` (`node --test`, fake API in `test/fake-api.ts`).
- Synthetic data only (`@bissinger-lights.de`/`.test` addresses created by the harness).

## Done when

- [ ] Acceptance criteria met and covered by tests that ran green in this session
- [ ] Org scoping, roles and CSRF unchanged or stronger; no new unauthenticated route
- [ ] `verify-changes` completed; results reported with commands
- [ ] Migration (if any) additive and drift-free
- [ ] Security-relevant change reviewed (`security-review`), independence stated honestly
