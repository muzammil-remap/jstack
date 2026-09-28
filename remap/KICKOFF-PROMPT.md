# Kickoff prompt — paste into Claude Code, started in `jstack-app-source/`

---

You're working on JSTACK, a finished Expo / React Native Web app. The goal is to make it show the client's **real data, read-only, by calling n8n webhooks directly**. There is no backend server to build. I supervise: you plan, build, test and report at each checkpoint, then wait for my "go".

## Phase 0 — Orient (no code changes)

1. Read, in this order:
   - `CLAUDE.md` (this folder), `remap/WEBHOOKS.md`
   - `jstack-app/CLAUDE.md`, `jstack-app/AGENTS.md`
   - `jstack-app/CODEMAP.md` §1, §3 (the chains), §4 (invariants) and §6 (gotchas)
   - `HANDOVER.md` §6 and `CONTRACT.md` §1–§3 for reference

   Follow the app's own boundaries and never-list throughout.
2. Read the data path end to end:
   - `data/transport/Transport.ts`, `http.ts`, `mock.ts`, `outbox.ts`, `reachability.ts`
   - `data/provider.ts`, `data/config.ts`, `data/ApiAdapter.ts`, `data/routes.ts`
   - one store (`stores/today.ts`)
   - `components/chrome/Gate.tsx`
3. Setup must already be done (`remap/SETUP-PROMPT.md`). Read the setup results in `remap/PROGRESS.md`, especially the list of baseline test failures (missing files from the download). If setup isn't done, stop and tell me.
4. From `jstack-app/`, run the baseline gates:

   ```
   pnpm install
   pnpm check && pnpm lint && pnpm test
   JSTACK_TZ=Australia/Brisbane pnpm test
   node tools/build-web.mjs
   ```

   Compare with the setup baseline in `remap/PROGRESS.md`. Any failure that isn't on the baseline list: report it and stop; don't fix Josh's code unasked.
5. List every place that reads `USE_API_ADAPTER` or otherwise branches on mock vs real. Say what each should do in `n8n` mode.
6. Write your plan for Phases 1–3 into `remap/PROGRESS.md`, including anything in my docs you think is wrong.

**Checkpoint 0:** report the gate results, the `USE_API_ADAPTER` list, and your plan.

## Phase 1 — The n8n transport, with no webhooks yet

Build what `CLAUDE.md` §3 describes:

- `EXPO_PUBLIC_DATA_SOURCE = mock | http | n8n` in `data/config.ts` (default `mock`), plus `EXPO_PUBLIC_N8N_BASE_URL`. `data/provider.ts` picks the transport. The outbox and reachability layers wrap `n8nTransport` the same way they wrap `httpTransport`.
- `data/transport/n8n.ts` and `data/n8n/{registry,client,defaults,empty}.ts`, with one registry row for **every GET in `data/routes.ts`**. Use the kinds from `remap/WEBHOOKS.md` Table B. Everything starts as `default` or `empty`, and `wired` rows are stubbed until webhooks arrive.
- Every write returns `403 { reason: "read-only" }` without calling anything.
- In `n8n` mode the gate must never offer the mock sign-in, and nothing may serve fixture data.
- Tests:
  - every GET route answered by `n8nTransport` validates against its response schema in `openapi.yaml` (reuse the existing validator)
  - every write is refused
  - every `data/routes.ts` GET has a registry row
  - mock mode is untouched
- An ADR in `DECISIONS.md` and a hand-written `CODEMAP.md` paragraph for the new transport. Run `pnpm codemap`.
- Run the app locally in `n8n` mode (`EXPO_PUBLIC_DATA_SOURCE=n8n pnpm web`) and click through every tab. Every section should show its honest empty state, nothing should crash, and the console should have no errors. List any screen that looks broken when empty.

**Checkpoint 1:** no new test failures beyond the setup baseline, in both time zones, screenshots of each tab in `n8n` mode (empty), and a list of the empty-state problems.

## Phase 2 — Networking

- Write `remap/DEPLOY_N8N.md` for the preferred same-origin setup (`CLAUDE.md` §5):
  - an nginx server block that serves the production build (`pnpm build:web:prod` with `EXPO_PUBLIC_DATA_SOURCE=n8n EXPO_PUBLIC_N8N_BASE_URL=/n8n`)
  - the SPA rewrite and the headers from `public/_headers`
  - `location /n8n/` proxying to the n8n webhook host
  - HTTP Basic Auth on the site, and HTTPS
- Also document the direct-to-n8n alternative: the exact `connect-src` edit in **both** header files (keep `tests/unit/pwa.test.ts` green) and the CORS settings each webhook needs.
- Don't deploy anything.

**Checkpoint 2:** the deploy doc. Also tell me what you need from me: n8n host, domain, whether nginx is already on the server.

## Phase 3 — Wire the webhooks, one at a time (repeat per webhook I give you)

For each webhook I add to `remap/WEBHOOKS.md` Table A:

1. Call it once, if I've given you access, or use the sample I paste. Save it redacted to `jstack-app/tests/fixtures/n8n/<name>.json`, plus an empty-result sample.
2. Check it's structured JSON with stable ids and timestamps. If it's prose or an LLM summary, **stop** and tell me exactly which fields a dashboard webhook should return instead.
3. Write `data/n8n/adapters/<name>.ts`: a raw-shape guard, then `toContract()` into the `data/types.ts` shape. Map every source enum explicitly (e.g. Twenty status → `TaskStatus`). Derive silo and focus labels deterministically. Emit ISO 8601 UTC.
4. Test the adapter against both samples, and validate the output against `openapi.yaml`.
5. Flip the registry row(s) to `wired`. Update any `derived` route that uses it (e.g. `/today` uses calendar + tasks), sharing one in-flight call per webhook.
6. Run it in the browser in `n8n` mode against the real webhook, compare with `jstack-mock-v15.html`, and fix mapping gaps.
7. Update Table A's status, run `pnpm codemap` and all gates, and commit (`feat(n8n): wire <name>`).

**Checkpoint per webhook:** what's now live, screenshots, fields we couldn't fill and why.

## Rules that override convenience

- Read-only. No write leaves the browser.
- Raw n8n JSON never reaches a store.
- No new dependencies (the app's rule).
- Never edit an existing test to make it pass. Mock mode stays at the setup baseline (no new failures).
- Don't modify n8n workflows that OpenClaw shares. Propose a dashboard webhook instead.
- Don't redesign the UI. If data has no place on screen, ask me.

Start with Phase 0.
