---
name: frontend-ux
description: Use for user-facing work in apps/web of Bissinger OS – building or changing pages, forms, tables, dialogs, loading/empty/error states, German UI texts, accessibility and responsive layout in the Next.js 16 App Router. Covers the session-safe data access rules, styling conventions and how to verify UI changes. For changes that also add API endpoints, combine with implement-feature.
---

# Frontend and UX

## Before writing code

- **Next.js 16 differs from training data.** Read the relevant guide in `apps/web/node_modules/next/dist/docs/` (e.g. routing, `proxy.ts`, data fetching) and heed deprecations. Do not use APIs from memory.
- Look at a comparable page first: lists/sheets/modals in `app/(app)/customers/` (`_components/` per area), shared pieces in `components/`, layout in `app/(app)/_components/` (`app-shell`, `crm.css`).

## Rules

- Signed-in pages live under `app/(app)/` and are client components (`"use client"`). `AuthGuard` already wraps them; do not add your own session checks.
- **Data access** only through `lib/auth-api.ts` (`apiFetch`, `apiFetchRaw`) or the hooks `lib/use-api.ts` (`useApi`, `prefetchApi`, `invalidateApi`) and `lib/use-api-resource.ts`. These bind answers to the session context and carry CSRF. Never raw `fetch`, never API URLs in `href`/`src`; files via `lib/documents.ts` (`fetchDocumentBlob`, `openDocumentDownload`).
- **Session change:** `SessionChangedError` is not a normal error – do not show it as one and do not retry; the guard shows its own dialog.
- **Roles:** `useCurrentUser()` / `components/admin-only.tsx` only hide controls; every action must also be refused by the API.
- **States:** every data view has loading, empty and error states; errors show the API message in German, never stack traces.
- **Texts:** German, du-form as in existing pages (e.g. "Bitte erneut versuchen"); dates/numbers with `Intl` and `de-DE`; money from cents.
- **Styling:** Tailwind classes and the variables in `app/(app)/_components/crm.css` (e.g. `var(--color-ink)`); match neighbouring components instead of new colours or spacing.
- **Accessibility:** real `<button>`/`<a>`, labels for inputs, `role="dialog"`/`aria-modal` for modals, Escape closes, focus visible, keyboard reachable.
- **CSP:** no inline `<script>`, no `eval`, no external script/style hosts (`proxy.ts` sets a nonce-based policy). Images/frames only `self`/`blob:`.
- **No user input lost silently:** forms keep input on API errors; destructive actions ask for confirmation.

## Verify

1. `pnpm --filter my-app typecheck` (or `cd apps/web && pnpm typecheck`), `pnpm lint`, `cd apps/web && pnpm test`, `pnpm --filter my-app build`.
2. Logic that can run without a browser gets a test in `apps/web/test/` (render checks via `react-dom/server`, see `test/guard-view.test.ts`).
3. Visual/interaction check: start the app (`run` skill or `pnpm dev`) and look at the page; if not possible in this session, say so explicitly instead of claiming it works.

## Done when

- [ ] Data only via the session-safe client; no raw fetch or direct URLs
- [ ] Loading/empty/error states and German texts present
- [ ] Keyboard and screen-reader basics work
- [ ] typecheck, lint, web tests, build ran green; visual check done or its absence stated
