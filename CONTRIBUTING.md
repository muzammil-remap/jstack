# CONTRIBUTING

For whoever picks this up next — REMAP's developer, a future agent, or Josh in
six months. Read `jstack-app/CODEMAP.md` first; it is written to be read
INSTEAD of the source, and it is regenerated on every commit so it is either
true or the board is red.

## Getting it running

```bash
cd jstack-app
pnpm install          # installs the pre-commit hook too (core.hooksPath)
pnpm start            # Expo dev server
```

There is no backend to run. The app ships with an in-process mock
(`data/mock/`) that IS the contract, executably — `USE_API_ADAPTER` in
`data/config.ts` is the one flag that swaps it for a real one, and `DEPLOY.md`
covers that.

## Prerequisites, environment and secrets

Everything the app, its tools and CI need, and every variable they read (RM-03).

| Need | Version or value | Where it is set |
|---|---|---|
| Node | 20 or later; CI runs 20, and the board also runs on 24 | `jstack-app/package.json` `engines`; `.github/workflows/board.yml` `node-version` |
| pnpm | 10.33.2 | `jstack-app/package.json` `packageManager` (`corepack enable` picks it up) |
| Playwright's Chromium | the version the lockfile pins | `pnpm exec playwright install chromium`, once |
| Git hooks | `core.hooksPath` = `.githooks` | set by `pnpm install` (`jstack-app/tools/install-hooks.mjs`); on Windows the hooks need Git Bash |

| Variable | Read by | What it does |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | `jstack-app/data/config.ts`, at build time | The backend base URL, e.g. `https://api.example.com/api/v1`. Unset, the app runs on the in-process mock; set, it talks HTTP. The voice socket is derived from it (`jstack-app/data/provider.ts`) |
| `EXPO_PUBLIC_USE_API_ADAPTER` | `jstack-app/data/config.ts`, `jstack-app/metro.config.js` | The swap flavour: the test build on a real server. Set by `node tools/build-web.mjs --swap` |
| `EXPO_PUBLIC_JSTACK_TEST` | `jstack-app/metro.config.js` | The test flavour, with the `__JSTACK__` rig. Set by `tools/build-web.mjs` and `jstack-app/.env.development`; never in production, where the SEC-01 step greps the export for `__JSTACK__` |
| `EXPO_PUBLIC_API_TIMEOUT_MS` | `jstack-app/data/config.ts`, at build time | Overrides the ordinary request's abandon time (default 15000ms; an upload always gets 60000ms, not overridable) — `jstack-app/data/transport/http.ts`'s own `AbortController` (D-4) |
| `EXPO_PUBLIC_API_CREDENTIALS` | `jstack-app/data/config.ts`, at build time | `"include"` sends the fetch `credentials: "include"` (a cross-origin API with CORS credentials); anything else, the default, is `"same-origin"` (D-5) |
| `EXPO_PUBLIC_DATA_SOURCE` | `jstack-app/data/config.ts`, at build time | REMAP (ADR-76): `mock`, `http` or `n8n`. Unset keeps the older rule — a base URL or the swap flag means HTTP, otherwise the mock — so every test runs on the mock |
| `EXPO_PUBLIC_N8N_BASE_URL` | `jstack-app/data/config.ts`, at build time | REMAP (ADR-76): where the n8n proxy answers, default `/n8n` (same origin, production); local dev `http://127.0.0.1:8787/n8n` (`remap/dev-proxy.mjs`). Never an n8n host or a secret |
| `JSTACK_N8N_DIST` | `jstack-app/tools/web-n8n.mjs` | REMAP (ADR-76): where `pnpm web:n8n --build` puts the n8n export (default `~/.jstack-dist-n8n`), kept apart from the mock build. The tool reads its other settings from `jstack-app/.env.n8n.local` (gitignored), never `.env.local`, which Expo would load into every export |
| `EXPO_PUBLIC_N8N_CALENDAR_SOURCE` | `jstack-app/data/config.ts`, at build time | REMAP (ADR-76): the calendar source (`personal`, `work` or `family`) Google's primary calendar is shown as; default `personal`, anything else falls back to it |
| `EXPO_PUBLIC_TWENTY_PRIORITY_FIELD` | `jstack-app/data/config.ts`, at build time | REMAP (Phase 4): `1` once Twenty's task object has a `priority` SELECT (HIGH / MEDIUM / LOW); the tasks adapter maps it and the app prints a priority. Unset, no priority is printed on the n8n build |
| `EXPO_PUBLIC_N8N_RECORDS_NAMESPACE` | `jstack-app/data/config.ts`, at build time | REMAP (Phase 6, ADR-87): a prefix for every key the n8n build reads and writes in the records store (`<namespace>/<key>`). Unset for Josh; REMAP's test runs set `dashtest-…` so a test never writes one of his records |
| `EXPO_PUBLIC_TWENTY_AREA_FIELD` | `jstack-app/data/config.ts`, at build time | REMAP (Phase 4): `1` once Twenty's task object has an `area` SELECT (PERSONAL / FAMILY / WORK); it becomes the task's silo and focus. Unset, every task is `personal:josh` |
| `EXPO_PUBLIC_TWENTY_APP_URL` | `jstack-app/data/config.ts`, at build time | REMAP (ADR-76): Twenty's web address, for "open in Twenty" links and the Agents portal; unset, no link is drawn |
| `JSTACK_DIST`, `JSTACK_PROD_DIST` | `jstack-app/tools/build-web.mjs`, `serve-web.mjs`, `build-mock.mjs` | Where the test and production exports go (default `~/.jstack-dist`, `~/.jstack-dist-prod`, outside the repository) |
| `JSTACK_MOCK_OUT` | `jstack-app/tools/build-mock.mjs` | Where the one-file mock is written (default the repository root) |
| `JSTACK_MOCK_PORT`, `JSTACK_MOCK_TEST_ROUTES`, `JSTACK_SERVE_MOCK_RIG` | `jstack-app/tools/serve-mock.mjs`, `jstack-app/tests/unit/serveMockRig.test.ts` | `pnpm serve:mock` (D-1): the port, whether `/__test__/*` is served, and the switch that turns the rig test from a no-op skip into the real server. Set by `tools/serve-mock.mjs`; never set by hand |
| `JSTACK_TZ` | `jstack-app/jest.config.js` | Jest's time zone; the board runs the suite in two |
| `JSTACK_SWAP`, `JSTACK_SWAP_API` | `jstack-app/e2e/helpers.ts`, `jstack-app/tools/build-web.mjs` | The e2e suite against a real server (`HANDOVER.md` §4) |
| `JSTACK_PROD_URL` | `jstack-app/e2e/core/pwa.spec.ts` | The offline PWA checks against a production build (`.github/workflows/nightly.yml`) |

**Secrets.** The client holds none: the access token comes from `AUTH.getToken()` (`jstack-app/data/config.ts`), the refresh token lives in an httpOnly cookie (`CONTRACT.md` Q9), and the Web Push VAPID public key is served by `GET /capabilities`. The server's credentials — Dropbox, Google, Twenty, the voice provider, LiteLLM — are REMAP's (`KNOWN_GAPS.md` §3). CI reads no repository secrets (`.github/workflows/`).

## Branches

`main` is the release branch: it moves only at a release row, by a `--no-ff` merge from
the build branch, tagged (`v2.1`), and only through the pre-push gate below. `v21-build` is
where V2.1 was built, one commit per row; `v21-plan` holds the plan the build ran under. A
new piece of work branches from `main` and lands on it the same way. Nothing is force-pushed.

## The gates, and what each is for

```bash
pnpm check            # tsc
pnpm lint             # eslint, including this repo's own rules
pnpm test             # Jest: unit + native projects
pnpm unused           # an export nothing imports is dead code or a missing wire
pnpm codemap          # regenerates wiring.json, WIRING.md/html, openapi.yaml, CODEMAP.md
node tools/validate-openapi.mjs   # the published contract is current and internally true
node tools/audit-check.mjs        # advisories, against a reviewed allow-list
pnpm test:e2e         # Playwright, 482 tests over eight projects (~13 min)
```

The per-push board runs everything except `test:e2e`, which runs nightly —
the reasoning and the measurement are in `history/v21/BUGLOG_v21.md`'s `B-23`.

**Never `git commit --no-verify`.** The hook regenerates the maps and refuses
a commit whose hand-written `CODEMAP.md` references are broken. Bypassing it
turns the board red one push later, which is strictly worse than being stopped
now.

## The rules that are not obvious

These are the ones that have actually cost time. Each has a bug row behind it.

- **One route table.** `data/routes.ts` is the only place an endpoint is
  declared. The adapter, the mock router, the wiring map, the OpenAPI document
  and the conformance runner all read it through `tools/read-routes.mjs`. Do
  not write a sixth reader (`B-15`).
- **A generated document is only as true as the column somebody typed.** The
  route table's `body`/`response` columns are hand-written, and one wrong one
  passed every self-consistency check for a whole stage (`B-24`). If you add a
  route, send a real request through it.
- **Two date bases is one too many** — and the fixtures count as date-derived.
  Everything goes through `lib/time.ts` and the fixtures anchor to the same
  instant the server's clock uses (`B-09`, `B-22`). A test that computes a
  date has a second clock in it.
- **A unit test must never make an outbound network call, or leave a timer
  pending.** Both hang CI for minutes with every test green and nothing red to
  read (`B-17`).
- **A zustand selector is not a place to compute.** Anything that maps,
  filters or allocates returns a fresh object, `Object.is` never matches, and
  the component re-renders forever (`B-19`).
- **An unrun test is not evidence.** Four specs written across a whole stage
  failed ten of nineteen assertions the first time a browser executed them
  (`B-21`).
- **A guard must be seen to fail.** Plant the defect, watch it go red, revert.
  `history/v2/CHANGES_v2.md` lists fifteen cases in this build where a green guard
  covered exactly the thing it was written to catch.

## Adding things

`CODEMAP.md` §5 has a checklist per kind — an endpoint, a wire shape, a store
action, a dialog, a setting, a fixture, a capability flag, a UI primitive,
a conformance check. Each names files that must exist; if a step's file does
not, the recipe is wrong and it is the recipe that should be fixed.

## The markers

Every adapter method that a real backend has to answer carries a `// TODO(BACKEND: §4.n)`
comment naming its section of `history/v2/CONTRACT_v2.md` / `history/v21/CONTRACT_v21.md`. They are not to-dos to
delete: they are the contract surface, counted into `evidence/todo-backend-grep.txt` by
`tools/gen-backend-grep.mjs` and guarded by `tests/unit/contract.test.ts`, so a route the app
sends and the contract does not describe cannot exist quietly. Add one with every route.

## Running conformance against a real server

`node tools/conformance.mjs <BASE_URL>` from `jstack-app/` sweeps every `GET` in the route
table and the safe writes against a server, validating each response against `openapi.yaml`;
`--write <dir>` leaves `conformance-<date>.json` behind as evidence. It is how REMAP's backend
is checked before the app is pointed at it (`WM-04`, `history/v21/HANDOVER_v21.md`).

## Decisions

`history/v2/V2_DECISIONS.md` and `history/v21/V21_DECISIONS.md` carry the architecture decisions with
their reasoning and what was rejected. If you are about to do something the
build does differently, the ADR probably says why — and if it does not, write
one before you change it, not after.

## Pushing to `main`

You cannot, until `AUDIT_v21.md` says the auditor signed off — `.githooks/pre-push` refuses
the push and says why. That hook is installed with the pre-commit one by `pnpm install`
(`core.hooksPath=.githooks`); if `git config --get core.hooksPath` is empty, run `pnpm install`
again. Do not use `--no-verify` on either hook (SECURITY.md, "The release gate").
