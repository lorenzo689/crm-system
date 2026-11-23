---
name: fix-bug
description: Use when something in Bissinger OS behaves wrongly – an error report, failing test, wrong data, crash, race condition, flaky test or a review finding that must be fixed. Enforces reproduce-first (a test that fails before the fix), root-cause analysis, the smallest correct fix and a regression test, without weakening tests or security. Not for new functionality (use implement-feature).
---

# Fix a bug

## Workflow

1. **Understand the symptom.** Exact input, role, organization, expected vs. actual result, error text or log line (API logs contain a `requestId`).
2. **Reproduce with a test first.** Write the smallest automated test that shows the bug and **run it: it must fail** for the right reason. Record the failing output.
   - API logic → `*.spec.ts`; anything with HTTP, auth, roles, organizations or the database → `apps/api/test/*.e2e-spec.ts` (harness in `test/helpers/harness.ts`).
   - Web client/session/cache → `apps/web/test/*.test.ts` with `test/fake-api.ts`; render logic of a view → `react-dom/server` as in `test/guard-view.test.ts`.
   - Races: control the interleaving with promises/barriers (`fake-api.ts` `hold`/`holdBody`), never with `sleep` or timing.
   - If it truly cannot be automated (e.g. needs a real host), say why and describe the manual reproduction.
3. **Find the root cause.** Explain why it happens, not only where. Check whether the same cause exists elsewhere (same pattern in other modules) and list those places.
4. **Fix minimally.** Change the cause, not the symptom. No unrelated refactoring, no new features.
5. **Prove it.** The reproduction test now passes; the existing suites still pass (`verify-changes`).
6. **Report:** symptom, root cause, fix, test before (fail) / after (pass), other affected places, remaining risk.

## Never

- `skip`/`only`, deleted tests, loosened assertions, longer timeouts to hide a race, or catching and ignoring the error.
- Disabling a guard, CSRF check, org filter or validation to make something work.
- Claiming "fixed" without having run the failing test and the suites in this session.
- Restarting shared infrastructure (Docker Desktop, databases of other projects) without asking.

## Hints for this repo

- Hook timeouts in `test:e2e` on this Windows machine are usually environment: check for parallel/orphaned `jest` processes and slow Docker I/O before suspecting the code; rerun the single suite alone.
- Session/CSRF/context problems: `apps/web/lib/session.ts` and `docs/security/sprint-2-session-security.md`, `sprint-3-1-hardening.md` explain the model.
- Job duplicates: leases and idempotency keys in `docs/security/sprint-3-1-hardening.md`.

## Done when

- [ ] A test failed before and passes after the fix (both runs in this session), or the manual reproduction is documented with the reason
- [ ] Root cause stated; similar places checked
- [ ] No test weakened; security unchanged or stronger
- [ ] `verify-changes` completed
