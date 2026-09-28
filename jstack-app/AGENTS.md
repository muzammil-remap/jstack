# AGENTS.md — JSTACK, for any coding agent

**Read `jstack-app/CODEMAP.md` before planning any change.** It is the map: what every file
is for, how a request reaches a screen, which invariants exist and what guards each one. This
file is only the entry point.

## The shape, in one paragraph

Five tabs (Today, Tasks, Brain, Life, Agents), each a `layout/registry.tsx` list of
`SectionDef`s rendered by `<TabScreen>`. Zustand stores under `stores/` hold every piece of
app state; a component reads one with `use<Name>Store((s) => s.field)` and never touches the
adapter. Store actions call `getAdapter()` — either `data/ApiAdapter.ts` over HTTP or the
in-process mock, both built from the one route table in `data/routes.ts`. Overlays are entries
in `layout/dialogs.tsx`, rendered by `DialogHost` at the root. Design tokens are generated
from `design/` into `theme/tokens.ts`; UI primitives live in `theme/ui/`.

## The five things V2.1 added that change how you work

**One route table.** `data/routes.ts` is the only place a route exists. Its rows carry
`body`/`response` shape names, so `openapi.yaml`, `wiring.json`, the mock's router, the
backend-marker grep and `CALL_ROUTES` are all generated from it. A route without a
`DataProvider` method fails `pnpm check`; a method without a route fails it too.

**A dialog registry.** `layout/dialogs.tsx` lists every overlay with its `kind`
(`modal | sheet | settings | screen`). `screen` replaces the tab bar and rail while it is
open, and Talk with EA is its only member — a second one is a design decision, not a registry
entry, and `tests/unit/dialogs.test.ts` asserts the count.

**Sections can be records.** A Life section is either a component in `layout/registry.tsx` or
a `SectionConfig` rendered by `layout/SectionRenderer.tsx` from blocks in
`layout/blocks.tsx`. A block names a BIND from a published list (`layout/sources.ts`) — never
a field path, a filter or a URL. Read ADR-39 before changing that; the config-as-a-small-
language version is deliberately not built.

**An outbox.** Six capture routes are marked `offline: true` in the route table and go through
`data/transport/outbox.ts`. A capture made offline is queued, replayed in order, and shown as
`queued · syncs when you're back online` — deciding is NOT queued, because a verb queued now
may be the wrong answer in an hour (OF-08).

**A conformance runner.** `node tools/conformance.mjs <BASE_URL>` drives every GET and the
safe writes against a real server and validates each response against `openapi.yaml`. It is
the first thing to run at go-live, before any of the app: it answers "does this backend match
the contract" in one command, and it names the endpoint and the field when it does not.

## Before you commit

```
pnpm codemap     # regenerate CODEMAP.md, wiring.json, WIRING.md — the pre-commit hook does this
pnpm check       # tsc --noEmit
pnpm lint        # expo lint (includes this repo's five custom rules)
pnpm test        # jest, unit + native lanes
pnpm build:web   # the export must build
pnpm test:e2e    # playwright, 8 width x scheme projects — slow, run before a push
pnpm unused      # nothing exported that nothing imports
node tools/audit-check.mjs   # advisories, against a reviewed allow-list
node tools/conformance.mjs <BASE_URL>   # only against a real server
```

A commit that changes a **convention** updates the matching hand-written `CODEMAP.md` section
in the same commit. The generated sections look after themselves.

## Boundaries

- A component never fetches. It reads a store; the store calls the adapter.
- A dialog mounts at the root through the registry, never inline — `position: absolute` only
  spans the nearest positioned ancestor.
- Colours come from `useTokens()`, sizes and families from a `Txt` kind. Both are lint errors
  otherwise.
- Dates go through `lib/time.ts`. Never read a local date field; the app is Brisbane, held as
  UTC fields.
- Only `theme/useLayout.ts` may read the window size.
- Anything test-only lives behind `lib/testBuild.ts` and must not reach a production build.

## Never

- Never add a dependency. Every tool in `tools/` is dependency-free Node.
- Never send, pay, book or revoke. Those verbs are refused in this build, by decision.
- Never edit a test so it passes. If an expectation must change, record why first.
- Never `--no-verify`. The hook regenerates the maps; skipping it commits a stale one.
- Never edit inside a `<!-- generated:start -->` block; the next regeneration overwrites it.
- Never put fixture text where it reads as something Josh wrote.

## Verify before you trust

`CODEMAP.md`'s generated sections are true at the sha stamped on each block, not necessarily
at your checkout. Open the file before acting on a path, a line count or a testID. The tests
keep the map from naming things that do not exist — a weaker claim than "all of this is
current".
