# CLAUDE.md — JSTACK

**Read `jstack-app/CODEMAP.md` before planning any change.** Everything below is in
`AGENTS.md`, which this mirrors; these are the two notes specific to Claude Code.

## Working directory

The app is `jstack-app/` inside the repo root. `pnpm` commands run from there, and the
repo-level docs (`STATE.md`, `BUILD_PLAN_v21.md`, the bug logs, the decision records) are one
level up. Sessions have opened in the wrong folder before — check `git rev-parse
--show-toplevel` ends in `JStack/App/App`.

## Verify before you trust

`CODEMAP.md` is generated from the source and stamped with the commit it was true at. It is
there so you do not have to re-derive the codebase — not so you can quote it without looking.
Before you act on a path, a line count or a testID from it, open the file. If a guard says
something passes, and you have not seen it fail, you have not verified it.

## The gates

```
pnpm codemap && pnpm check && pnpm lint && pnpm test
```

`pnpm test:e2e` (Playwright, eight projects, ~12 minutes) before a push. The pre-commit hook
runs `pnpm codemap` and refuses a commit whose `CODEMAP.md` names something that does not
exist; do not bypass it with `--no-verify`.

## What V2.1 changed about working here

One route table (`data/routes.ts`) generates the contract, the wiring map, the mock's router
and the markers. Overlays are registry entries; `screen` is a kind, and Talk is its only
member. A Life section may be a config RECORD rather than a file — blocks bind to a published
data source, never to a field path (ADR-39). Captures go through an outbox; decisions do not.
And `node tools/conformance.mjs <BASE_URL>` is the one command that answers whether a real
backend matches the contract. `AGENTS.md` has the paragraph on each.

## Boundaries and the never-list

See `AGENTS.md`. The short version: components read stores, stores call the adapter; dialogs
mount at the root through `layout/dialogs.tsx`; colours from `useTokens()`, type from a `Txt`
kind, dates from `lib/time.ts`; no new dependencies; no send/pay/book/revoke; never edit a
test so it passes.
