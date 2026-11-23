---
name: security-review
description: Use to review Bissinger OS changes or areas for security problems – before committing anything that touches authentication, sessions, CSRF, roles, organization or project scoping, uploads/documents, money/invoices, background jobs, raw SQL, logging, dependencies or infrastructure, or when the user asks for a security review/audit of a diff, branch or PR. Project-specific checklist, severity-sorted findings format and how to get an independent review via a subagent.
---

# Security review

## Scope and independence

1. Determine the scope: `git diff <base>...HEAD` (base usually `origin/feature/erp-ai-security`), or the files/area the user names.
2. **Independence:** if you wrote the code in this session, your review is a self-review. For security-relevant changes, start **one** fresh subagent (`Agent`, general-purpose, not a fork) with only: the base/branch, this checklist path (`.claude/skills/security-review/SKILL.md`), and the instruction to verify findings in code and tests. Do not pass your own conclusions. Report both, labelled as such. Never call a self-review independent.

## Checklist (verify in code, do not assume)

**Authentication and sessions** – every new controller has `@UseGuards(JwtAuthGuard)`; no route bypasses it unintentionally (`grep -L JwtAuthGuard apps/api/src/modules/*/*.controller.ts` – only `health.controller.ts` is public by design; the cookie-less routes in `auth.controller.ts` are listed in `docs/security/sprint-2-session-security.md`). No bearer/token fallback. Cookie stays `__Host-`, HttpOnly, Secure, SameSite=Lax (`modules/auth/session-cookie.ts`). Logout/password change revoke server sessions.
**CSRF and origin** – state-changing methods are checked by `JwtStrategy` (session-bound token); cookie-less auth routes keep `JsonBodyGuard`; origin middleware unchanged (`common/http/request-origin.ts`). No new exemptions, no `GET` with side effects.
**Authorization** – roles via `RolesGuard` + `@Roles`, enforced server-side; organization from the session, never from input; every query filtered by `organizationId`; foreign records → 404; project writes via `ProjectWriteGuard`; admin actions on other users via `AccessService` (locked actor).
**Web client** – all requests via `lib/auth-api.ts`/`use-api.ts`; answers bound to the session context (`X-Session-Context`), cache isolated; no direct document URLs; previews only safe MIME types; nothing of a foreign context stays in the DOM (`guard-view.tsx`).
**Input and files** – DTOs with class-validator for every body/query; `ParseUUIDPipe` for ids; uploads: size and type allowlist, content type from the stored type, `nosniff`; no path or object-key input from clients.
**Data and SQL** – Prisma or tagged `$queryRaw`; no `…Unsafe` with input; transactions where consistency matters; migrations additive.
**Jobs** – `BackgroundJobsService.run`, lease/fencing (`runFenced`) at side-effect boundaries, idempotency keys; no business jobs on staging.
**Secrets, logs, privacy** – no secrets or real data in code, tests, fixtures, logs or docs; logs without bodies, tokens, e-mail addresses, document contents; error responses without internals.
**Dependencies and infra** – if lockfile changed: `pnpm audit --prod`, assess each finding by reachability; Docker: non-root, read-only, no published ports beyond `127.0.0.1`, no Funnel; no secrets in images.

## Findings format

Sorted by severity (Critical, High, Medium, Low, Informational). Per finding:

| Field | Content |
|---|---|
| ID / severity | e.g. `SR-01 / High` |
| Location | `path:line` |
| Scenario | concrete attacker or failure steps |
| Reproducible? | test or command that shows it, or "code reading only" |
| Impact | what data/action is affected |
| Existing mitigation | what already limits it |
| Fix | smallest correct change |
| Status | open / fixed in this change / accepted (by whom) |

End with: what was checked, what was not (and why), whether the review is independent.

## Done when

- [ ] Every checklist area relevant to the diff was checked against the code
- [ ] Each finding has a location and either a reproduction or "code reading only"
- [ ] Independence stated correctly; no "no findings" claim for areas not checked
