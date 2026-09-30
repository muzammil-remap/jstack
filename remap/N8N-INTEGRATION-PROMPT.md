# N8N integration prompt — paste into Claude Code at the repo root

> **Do this in n8n before you paste** (5 minutes, details at the bottom under "Before you start").
> 1. Follow `remap/IMPORT-GUIDE.md`: create the two Data Tables, import the nine `JSTACK-DASH-*` workflows, set the two table ids, and activate them.
> 2. Create `remap/.env.local` with `N8N_BASE`, `N8N_AUTH_HEADER` and `N8N_AUTH_VALUE`.
> 3. Start the proxy (`node remap/dev-proxy.mjs`) and run the two curl checks.

---

You're connecting JSTACK (a finished Expo / React Native Web app in `jstack-app/`) to Josh's **real data, reads and writes as his documents specify** (never send, pay, book or revoke), through n8n webhooks. There's no backend to build. The design is fixed in `CLAUDE.md` §3 and §5, and the webhook analysis is in `remap/WEBHOOKS.md`. I supervise: stop at every checkpoint with a short report and wait for my "go".

## Ground truth to read first

1. `CLAUDE.md`, `remap/WEBHOOKS.md` (all four sections), `remap/PROGRESS.md` (the setup baseline: 18 known failing suites from missing files), `remap/dev-proxy.mjs`.
2. `jstack-app/CLAUDE.md`, `jstack-app/AGENTS.md`, `jstack-app/CODEMAP.md` §1, §3, §4 and §6. Follow the app's boundaries and never-list.
3. The data path:
   - `data/transport/Transport.ts`, `http.ts`, `mock.ts`, `outbox.ts`, `reachability.ts`
   - `data/provider.ts`, `data/config.ts`, `data/ApiAdapter.ts`, `data/routes.ts`, `data/types.ts`, `data/labels.ts`
   - `components/chrome/Gate.tsx`
4. **The mock is the spec for every route's semantics.** For each route you wire, read its mock handler and reproduce its query handling, filtering and ordering:
   - `data/mock/handlers/calendar.ts`: `rangeFor`, `gapsFor`, `inFocus`
   - the tasks handler and `data/mock/handlers/today.ts`
   - `data/mock/util.ts`
   - how `data/mock/db.ts` fixtures fill `labels`, `setAt` and `focus`
5. `remap/WORKFLOWS-NEEDED.md` and `remap/WEBHOOKS.md` §C: every proxy key, what it accepts (`op` and fields) and what it answers. The `JSTACK-DASH-*` JSON files in `remap/n8n/` show each workflow's exact request validation and reply shape. Read them as documentation only; the app calls the **published webhooks**, never these files.

## Phase 1 — The `n8n` transport, with no live calls yet

Skip this phase if `data/transport/n8n.ts` already exists from `remap/KICKOFF-PROMPT.md` Phase 1; just verify it against this list.

- `data/config.ts`:
  - `EXPO_PUBLIC_DATA_SOURCE = "mock" | "http" | "n8n"` (default `mock`)
  - `EXPO_PUBLIC_N8N_BASE_URL` (dev `http://127.0.0.1:8787/n8n`, prod `/n8n`)
  - `N8N_CALENDAR_SOURCE` (default `personal`)
  - `TWENTY_APP_URL` (for "open in Twenty" links; empty means no link)
- `data/provider.ts` picks the transport. Outbox and reachability wrap `n8nTransport` the way they wrap `httpTransport`.
- In `n8n` mode:
  - every `USE_API_ADAPTER` branch behaves as a real build: no mock sign-in, no fixtures
  - list each branch and its decision in `PROGRESS.md`
- `data/n8n/registry.ts`:
  - one row per GET in `data/routes.ts`: `{ kind: "wired" | "derived" | "default" | "empty", key?, buildBody?, adapter? }`
  - `wired` rows exist only for `calendar` and `tasks` (`WEBHOOKS.md` §B)
- `data/n8n/client.ts`:
  - `callWebhook(key, body)` POSTs JSON to `${N8N_BASE_URL}/${key}` with `request_id: "dash-" + random`, and **no auth header** (the proxy adds it)
  - `API_TIMEOUT_MS`, one retry on network errors and 5xx, none on 4xx
  - unwraps `{ ok: true, data }`; `{ ok: false, error }` or a non-2xx becomes a typed error
  - share in-flight calls: the same key and body within 30 s gives one request. `/today` and `/calendar` both need the calendar, so a page load must run each workflow once.
- `data/n8n/defaults.ts` and `data/n8n/empty.ts` as in `CLAUDE.md` §3. Defaults are configuration only, never fixture text in Josh's voice.
- Every app write that has no wired key yet returns `{ status: 501, json: { reason: "not connected yet" } }` without calling anything. Writes are wired one by one as their workflows arrive (`remap/WORKFLOWS-NEEDED.md`), with the same sample → adapter → test loop as reads.
- Tests (new files only):
  1. Every GET route answered by `n8nTransport`, with `callWebhook` stubbed, validates against its response schema in `openapi.yaml`, using the app's existing validator.
  2. Every write without a wired key answers 501 and makes no call.
  3. Every `routes.ts` GET has a registry row.
  4. **Allow-list test:** every key `registry.ts` uses exists in `dev-proxy.mjs`'s `ALLOW`, and no registry entry, config value or proxy path matches `jstack-calendar-create|gmail-compose|gmail-reply|send-or-queue|jstack-dropbox-fetch` (the originals that send or return bytes).
- Env files: put dev settings in `jstack-app/.env.local` (gitignored). **Check that `pnpm test` still runs in mock mode with that file present.** If Expo or Jest picks it up, use `pnpm` scripts with inline env vars instead (e.g. `web:n8n`), not `.env.local`.
- Add a `DECISIONS.md` ADR (next free number) and a hand-written `CODEMAP.md` paragraph. Run `pnpm codemap`.

**Checkpoint 1:**
- gates at the setup baseline (no new failures) in both zones
- `n8n` mode running against a stopped proxy: every tab renders its empty or error state without crashing, and no console errors other than the expected network ones
- screenshots

## Phase 2 — Talk to the real webhooks, and capture samples

1. With the proxy running (`node remap/dev-proxy.mjs`), call both keys with realistic bodies from Git Bash. If my curl checks from "Before you start" already passed, reuse those.
   - calendar: `{"timeMin":"<Brisbane today 00:00 as UTC ISO>","timeMax":"<+7 days>","maxResults":250}`
   - tasks: `{"limit":60}`, then again with `cursor` = the first response's `pageInfo.endCursor`, if `hasNextPage`
2. Save redacted samples to `jstack-app/tests/fixtures/n8n/`:
   - `calendar.json`, `calendar.empty.json` (a window with no events)
   - `tasks.page1.json`, `tasks.page2.json` if one exists, `tasks.empty.json`

   Redact names, emails and free text (for example "Meeting A"), but keep **every field and value type exactly**. Never commit an unredacted sample.
3. Write the **field inventory** for Twenty tasks into `PROGRESS.md`: every field present, its type, example values, and which contract `Task` field it could fill. Look especially for:
   - status values
   - `dueAt`
   - assignee (id vs relation)
   - any priority field
   - body/description
   - `taskTargets` (links to people/companies)
   - `position`
   - timestamps
   - any custom fields that could carry a silo or project

**Checkpoint 2:** the inventory, and the open questions it raises. I'll answer the mapping questions before Phase 4.

## Phase 3 — Calendar, live (`GET /calendar`)

`data/n8n/adapters/calendar.ts`:

- **Request:**
  - `buildBody({ view, anchor })` gives the exact window `rangeFor` builds (Brisbane midnight to midnight: `today` 1 day, `3day` 3, `week` 7, `month` 1 month)
  - `anchor` defaults to today in Brisbane via `lib/time.ts`
  - `maxResults`: 500 for month, 250 otherwise
- **Guard:**
  - `ok === true`
  - `data.events` is an array
  - each event has `id` and `title` strings, `start` a string, `end` a string or null, and `allDay` a boolean

  Anything else becomes a 502-class error for that section only.
- **Map to `CalEvent`:**

  | CalEvent | From |
  |---|---|
  | `id` | `raw.id` |
  | `title` | `raw.title` |
  | `startsAt` / `endsAt` | Timed: `new Date(raw.start).toISOString()`. All-day: Brisbane midnight of the date via `lib/time.ts`; the Google end date is exclusive. Null `end`: `startsAt` plus 30 minutes, flagged in a comment. |
  | `source` | `N8N_CALENDAR_SOURCE` (only `primary` exists in V2; HANDOVER §1 Q7) |
  | `googleUrl` | `raw.htmlLink` |
  | `labels` | `{ silo: "personal:josh", types: [], setBy: "source" }`, unless fixtures show personal events labelled differently |
  | `setAt` | `raw.updated ?? now` |
  | `focus` | whatever the mock's fixtures use for an event from that source |
  | `prep`, `protectedByEa` | omitted (EA features, no source yet) |
- **Filter:** apply `?focus=` like the mock's `inFocus`, and keep only events whose start falls in the window (mock rule).
- **`gaps`:** only for `view=today`, computed exactly like the mock's `gapsFor` (06:00–20:00 Brisbane, at least 60 minutes). If `data/n8n` may not import from `data/mock` (check the boundaries tests), copy the pure function, citing its source in a comment. If you do import, leave `data/mock` itself unchanged.
- **All-day events:** check how `CalendarGrid`/`CalendarList` draw an event spanning 00:00–24:00. If it paints a full-day bar or blocks all the free gaps, **don't change the UI**. Tell me and propose options (exclude from gaps, keep in the list only…).
- **Tests:**
  - adapter against `calendar.json` and `calendar.empty.json`
  - output validated against `CalendarWindow`
  - one test per view's window across a Brisbane midnight
  - an all-day case and a null-end case
- Turn on `calendar` in the registry, then run the app in `n8n` mode and compare Today's calendar cards and the Week/Month views with the real Google Calendar.

**Checkpoint 3:** screenshots next to Google Calendar for the same days, what doesn't match yet, and the all-day decision.

## Phase 4 — Tasks, live (`GET /tasks`, derived `/tasks/{id}`, `/tasks/waiting`)

Start only after I've answered Checkpoint 2's mapping questions. Then write `data/n8n/adapters/tasks.ts`:

- Page with `cursor` until `pageInfo.hasNextPage` is false, capped at 10 pages; log a warning if capped. Cache the full list for 30 s (shared in-flight).
- **Map to `Task`** using the answered inventory. The defaults below apply unless I said otherwise:

  | Task field | Rule |
  |---|---|
  | `status` | `TODO`→`open`, `IN_PROGRESS`→`in_progress`, `DONE`→`done`. Anything else becomes `open`, plus one console warning naming the value. |
  | `due` | `dueAt` as ISO UTC. `dueLabel` stays unset; the app composes labels itself (`lib/taskMeta.ts`, ADR-47). |
  | `owner` | Assignee → `josh` / `joce` / `ea` / `dev` through a config map of workspace-member ids. Unassigned or unknown → `josh`. |
  | `priority` | **Only from a real field.** If Twenty has none, look at how `lib/taskMeta.ts` prints priority. If every task would read "medium priority" without it being true, stop and ask me. |
  | `links` | `[{ label: "Twenty", url: TWENTY_APP_URL + "/object/task/" + id }]` when `TWENTY_APP_URL` is set, else `[]` |
  | `subtasks` | `[]` |
  | `metaParts.source` | `"Twenty"` |
  | `labels` / `focus` / `setAt` | As agreed at Checkpoint 2. If there's no silo signal, use one agreed default and write it down. |
- `GET /tasks`: apply the mock tasks handler's view and filter semantics client-side to the full list.
- `GET /tasks/{id}`: find it in the cached list, else 404.
- `GET /tasks/waiting`: only from a real waiting signal, else `[]`. `GET /tasks/columns`: default columns as the mock defines them, unless Twenty has stages.
- Tests: the adapter against both pages and the empty sample; the paging loop, including the cap; output validated against `TaskList`; every status mapping.

**Checkpoint 4:** the Tasks tab (List, plus Board/Gantt/Done if the data supports them), Today's "Your tasks" card, next to Twenty for the same tasks.

## Phase 5 — Today composite (`GET /today`)

Read `data/mock/handlers/today.ts` and build `TodayComposite` the same way from the wired calendar and tasks data:
- `needsYou: []`, and the page's `endLine`/since-line only where the data is real
- `glance` computed from what's known, otherwise the composite's empty value
- the other composite fields at their contract-valid empties

One page load must run each n8n workflow **once**: verify in the proxy log.

**Checkpoint 5:** Today on live data at 390 / 820 / 1440 px, plus the proxy log for one cold load.

## Phase 6 — Writes and the remaining reads, one key at a time

After Phase 5, wire the other keys from `remap/WEBHOOKS.md` §C in this order:
1. `actions` (Needs you)
2. `calendar-edit`
3. `tasks-write`
4. `records` (settings, layouts, focuses, parameters, goals, habits; habit logs are keys `habitlog:<habitId>:<YYYY-MM-DD>`, with stats computed in the adapter)
5. `people`
6. `gmail-draft`
7. `files`
8. `memory` (Brain › Find)

For each one:
- **Read its mock handler first.** The adapter must reproduce the mock's behaviour and the contract's status codes: `409` late undo or conflict, `422` validation (map the DASH `VALIDATION_ERROR`), `404`.
- **Save real samples** to `tests/fixtures/n8n/`, including one error reply per write.
- **Captures** (`offline: true` in `routes.ts`, e.g. task create) must pass the app's `offlineId` through, so the outbox's replays dedupe (`{ duplicate: true }`).
- **Approve on an email card** (`kind: "quote"`): after `actions` answers, the transport calls `gmail-draft` with the card's `draft` fields and `quote` text, and returns `{ status: "outbox_user_sends" }`. Never call anything that sends.
- **Undo:** `POST /actions/{id}/undo` calls `actions` `op: "undo"`, and the store enforces the 10-second window.
- **Test each write end to end against real data**, with test records you then delete (a test task, a test event, a test draft). Tell me before any test that touches Josh's existing records.

**Checkpoint 6 (per key):** what's live, the screenshots, and the error cases you checked.

## Phase 7 — Production networking doc (write only; no deploy)

Write `remap/DEPLOY_N8N.md`. It covers:
- An nginx server block for the production build: `EXPO_PUBLIC_DATA_SOURCE=n8n EXPO_PUBLIC_N8N_BASE_URL=/n8n pnpm build:web:prod`
  - the SPA rewrite and every header from `public/_headers`, with `sw.js` and the manifest uncached
  - one `location = /n8n/<key>` per key in `remap/WEBHOOKS.md` §C, each allowing POST only, with `proxy_set_header <auth header> <value>`, `client_max_body_size 16k` and a 20 s timeout
  - HTTP Basic Auth on the whole site
  - HTTPS
- How to point those `location` blocks at `http://127.0.0.1:5678/webhook/…` on the same box.
- A checklist that the three allow-lists agree (`dev-proxy.mjs`, nginx, `registry.ts`).
- A bundle check: after `build:web:prod`, grep the output for `webhook/`, `jstack-`, the auth header value and every write path. All must be absent. Automate it as a test or script if it fits the app's conventions without editing existing tests.

**Checkpoint 7:** the doc, the bundle-check result, and what you need from me (domain, whether nginx exists on the box).

## Rules (non-negotiable)

- Only allow-listed keys are ever called. No key may point at a workflow that sends, pays, books or revokes (`CONTRACT.md` §1.1); email always becomes a Gmail draft.
- No auth header, secret or n8n path in app code, config defaults or the bundle. `remap/.env.local` and `jstack-app/.env.local` stay gitignored. Run `tools/secret-scan.mjs` before each checkpoint.
- Raw n8n JSON never reaches a store; adapters only, validated against `openapi.yaml`.
- Don't edit any existing n8n workflow. If a webhook needs more, propose a change to the **DASH** copy and say exactly what it should return.
- No new dependencies. Never edit an existing test to pass. Mock mode stays at the setup baseline.
- Don't invent UI. Wire only routes the app already calls, in the wave order of `remap/WORKFLOWS-NEEDED.md`.
- Commits: `feat(n8n): …` for app work, `chore(remap): …` for `remap/` tooling and docs; no `setup:` changes mixed in. Keep `remap/CHANGESET.md` current: one line per changed or added file, and why.

---

## Before you start (for me, in n8n and on my machine)

1. **Import** the `JSTACK-DASH-*` workflows as described in `remap/IMPORT-GUIDE.md` (two Data Tables first, then nine imports). They're new workflows on new paths; WF-01 and everything OpenClaw uses stay untouched.
2. **Credentials** should link automatically (same instance). If not, pick:
   - Webhook → *JSTACK Webhook Auth*, or better, a new header-auth credential just for the dashboard, so it can be rotated on its own
   - Google Calendar → *JSTACK Google Calendar*
   - Twenty Tasks → *JSTACK Twenty*
3. Open each, **Execute workflow** once with a test body to check it, then **Activate**.
4. **Reaching n8n from this laptop.** n8n listens on the server's `localhost:5678`. If it has no public HTTPS URL, open an SSH tunnel and use `N8N_BASE=http://127.0.0.1:5678`:

   ```
   ssh -N -L 5678:localhost:5678 ubuntu@<server>
   ```
5. Create `remap/.env.local` (gitignored):

   ```
   N8N_BASE=http://127.0.0.1:5678
   N8N_AUTH_HEADER=<header name from the credential>
   N8N_AUTH_VALUE=<its value>
   ```
6. Run `node remap/dev-proxy.mjs`, then check both keys from Git Bash:

   ```
   curl -s -X POST http://127.0.0.1:8787/n8n/calendar -H 'content-type: application/json' -d '{"timeMin":"2026-09-27T14:00:00Z","timeMax":"2026-10-04T14:00:00Z"}'
   curl -s -X POST http://127.0.0.1:8787/n8n/tasks -H 'content-type: application/json' -d '{"limit":5}'
   ```

   Both should answer `{"ok":true,...}`. Then start the prompt above.
