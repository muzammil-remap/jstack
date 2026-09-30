# CHANGESET.md — every file REMAP changed or added, and why

One line per file. Newest phase first. Josh's own files are named with what was added to them; nothing of his was removed or rewritten.

**Generated files** are marked **regenerate in the target repo, don't port**: `jstack-mock-v15.html` (re-packaged from the source) and `REMAP_HANDOVER.html` (never committed changed; `remap/codemap.sh` restores it). Port the source and rebuild them there.

## Phase 5 follow-ups — a locked app gets nothing (30 Sep 2026)

| File | Change | Why |
|---|---|---|
| `jstack-app/data/transport/n8n.ts` | a `Gate` beside `report`: while it is shut every call but the `whileLocked` ones waits | ADR-83 |
| `jstack-app/data/provider.ts` | **edit to an existing file (Josh's):** passes the session's `locked` to the n8n transport as its gate | ADR-83; mock and http untouched |
| `jstack-app/tests/unit/n8nLocked.test.ts` | new | locked → 0 calls, unlocked → one per workflow, the mock unchanged |
| `jstack-app/tests/unit/n8nReachability.test.ts` | its helper passes the gate (`locked: false`) before driving the provider | precondition made explicit, as `n8nConfig.test.ts` does |
| `jstack-app/CODEMAP.md` | §4 row for the new test; maps regenerated | a guard is named in §4 |
| `DECISIONS.md` | ADR-83 | the decision |
| `KNOWN_GAPS.md` | N8N-1 rewritten for the hold; N8N-9 marked must-fix | Checkpoint 5 answers |
| `jstack-mock-v15.html` | re-packaged (own commit). **Generated — regenerate in the target repo, don't port** | QA-06 |
| `remap/PROGRESS.md` | the must-fix row 3; the follow-ups section | Checkpoint 5 answers |

## Phase 5 — the Today composite, live (30 Sep 2026)

| File | Change | Why |
|---|---|---|
| `jstack-app/data/n8n/adapters/today.ts` | new: `GET /today` from the calendar and the tasks, the rest at the contract's empty value | the Today composite, as the mock's `getToday` builds it |
| `jstack-app/data/n8n/registry.ts` | `getToday` derived with that answer | wires it |
| `jstack-app/data/n8n/adapters/tasks.ts` | `tasksAnswers.all` — every task with no list rule | what Today picks its three from |
| `jstack-app/data/n8n/empty.ts` | `EMPTY_TODAY` exported; no `delta` on the empty Today, even with `?since=` | an empty delta prints "Nothing changed while you were away", a claim with no source |
| `jstack-app/tests/unit/n8nToday.test.ts` | new | the composite, its failures, one call per webhook per load |
| `jstack-app/tests/unit/n8nConfig.test.ts` | the provider case answers the `calendar` key too, and expects `tasks` then `calendar` | expectation changed on purpose: Today's calendar is live |
| `jstack-app/CODEMAP.md` | §4 row for the new test; maps regenerated | a guard is named in §4 |
| `KNOWN_GAPS.md` | N8N-1: reads load beneath the lock screen; N8N-4 marked must-fix; N8N-7 points at the `columns` spec; N8N-9 (the Calendar heading at 820 px) | Checkpoint 4 answers; seen at Checkpoint 5 |
| `remap/WORKFLOWS-NEEDED.md` | the `columns` op spec for JSTACK-DASH-tasks-read (not deployed, nothing built on it) | Checkpoint 4 answer 2 |
| `jstack-mock-v15.html` | re-packaged (own commit). **Generated — regenerate in the target repo, don't port** | QA-06 |
| `remap/PROGRESS.md` | the must-fix list, the open decisions, the overdue finding, the Phase 5 section | Checkpoint 5 |

## Phase 4 — Tasks, live (30 Sep 2026)

| File | Change | Why |
|---|---|---|
| `jstack-app/data/n8n/adapters/tasks.ts` | new: paging, the guard, the map (one line per Checkpoint 2 answer), the four answers | `GET /tasks`, `/tasks/{id}`, `/tasks/waiting`, `/tasks/columns` from Twenty |
| `jstack-app/data/n8n/taskRules.ts` | new: slicers, range, filters, copied from `data/mock/predicates.ts` | the mock's list rules (CT-03) |
| `jstack-app/data/n8n/registry.ts` | a second adapter form (`answer`) and derived rows with an `answer`; the four tasks rows live | paging needs several calls per answer |
| `jstack-app/data/transport/n8n.ts` | `reached()` reports the connection around any answer that goes out | the same reachability rule for both adapter forms |
| `jstack-app/data/n8n/adapters/calendar.ts` | `satisfies WebhookAdapter` instead of the annotation | keeps its precise type under the union |
| `jstack-app/data/config.ts`, `jstack-app/data/config.swap.ts` | `TWENTY_PRIORITY_FIELD`, `TWENTY_AREA_FIELD` (off), `TASK_PRIORITY_KNOWN` | answers 1 and 5, as switches |
| `jstack-app/lib/taskMeta.ts` | **edit to an existing file (Josh's):** the priority phrase only where `TASK_PRIORITY_KNOWN`; the high-priority split guarded | answer 1 — no "medium priority" on every task |
| `CONTRIBUTING.md` | the two switch variables | RM-03 |
| `jstack-app/tests/unit/n8nTasks.test.ts` | new | the adapter, both zones |
| `jstack-app/tests/unit/n8nRoutes.test.ts`, `n8nReachability.test.ts`, `n8nConfig.test.ts` | the stub and the provider cases answer the `tasks` key; a derived row with an answer may reach the keys it names | expectations changed on purpose: tasks are live |
| `jstack-app/CODEMAP.md` | §4 row for the new test; maps regenerated | a guard is named in §4 |
| `KNOWN_GAPS.md` | N8N-6 (waiting days), N8N-7 (the Board's columns), N8N-8 (priority) | what Phase 4 could not state |
| `jstack-mock-v15.html` | re-packaged (own commit). **Generated — regenerate in the target repo, don't port** | QA-06 |
| `remap/PROGRESS.md` | Phase 4 section | Checkpoint 4 |

## Phase 3 follow-ups — all-day, overlap, the grid's window (30 Sep 2026)

| File | Change | Why |
|---|---|---|
| `jstack-app/data/n8n/adapters/calendar.ts` | overlap rule; gaps count only events that take time; Week/Month ask for the grid's days | ADR-80, ADR-81, ADR-82 |
| `jstack-app/lib/timeGrid.ts` | **edit to an existing file (Josh's):** `isAllDay`, `eventsCovering` added | option C's one shared helper |
| `jstack-app/components/today/AllDayStrip.tsx` | **new UI file**: the all-day strip above a day's hours | option C (`CalendarGrid.tsx` had 10 lines left of its 250) |
| `jstack-app/components/today/CalendarGrid.tsx` | **edit to an existing file (Josh's UI):** all-day events out of the track, the strip above it, the hour gutter moved by its height, month dots on every covered day | option C |
| `jstack-app/components/today/CalendarList.tsx` | **edit to an existing file (Josh's UI):** "all day" instead of "0:00" | option C |
| `jstack-app/WIRING.md`, `jstack-app/wiring.json` | regenerated: the strip's testIDs in the calendar chain | `pnpm codemap` |
| `jstack-app/tests/fixtures/n8n/calendar.cases.json` | new, constructed in the exact DASH shape | the edge cases the live week did not hold at once |
| `jstack-app/tests/unit/n8nCalendar.test.ts` | overlap, gaps, Week/Month windows and month boundaries; the changed expectations marked | the behaviour changed on purpose |
| `jstack-app/tests/unit/allDay.test.ts`, `jstack-app/tests/native/calendarAllDay.test.tsx` | new | option C's helper and rendering |
| `jstack-app/CODEMAP.md` | §4 rows for the two new tests | a guard is named in §4 |
| `DECISIONS.md` | ADR-80, ADR-81, ADR-82 | items 1–3 |
| `KNOWN_GAPS.md` | N8N-3 (the mock's window), N8N-4 (the 35-day grid), N8N-5 (`CalEvent.allDay`, proposed) | for Josh |
| `jstack-mock-v15.html` | re-packaged (own commit). **Generated — regenerate in the target repo, don't port** | QA-06 |
| `remap/PROGRESS.md` | follow-ups and Checkpoint 3b | the log |

## Phase 3 — the calendar, live (30 Sep 2026)

| File | Change | Why |
|---|---|---|
| `jstack-app/data/n8n/adapters/calendar.ts` | new: the calendar adapter (the request, the guard, the map) | `GET /calendar` from the `calendar` webhook, mock-exact |
| `jstack-app/data/n8n/focus.ts` | new: the owner's silos, the four focuses, `inFocus` | the mock's rule, copied (CT-03); the defaults and the adapter share it |
| `jstack-app/data/n8n/defaults.ts` | imports the focuses and silos from `focus.ts` | one copy |
| `jstack-app/data/n8n/registry.ts` | `getCalendar` has its adapter: the first live row | Phase 3 |
| `jstack-app/data/config.ts`, `jstack-app/data/config.swap.ts` | `N8N_CALENDAR_SOURCE` (deferred from Phase 1) | its reader exists now |
| `CONTRIBUTING.md` | the `EXPO_PUBLIC_N8N_CALENDAR_SOURCE` row | RM-03 |
| `jstack-app/tests/unit/n8nCalendar.test.ts` | new | the adapter against the samples, both zones |
| `jstack-app/tests/unit/n8nContract.ts` | new: test helper (schemas from `openapi.yaml`, the samples) | shared by the sweep and the adapter tests |
| `jstack-app/tests/unit/n8nRoutes.test.ts` | the stub answers wired keys with their samples; per route, only a live wired row reaches a webhook | the expectation changed on purpose: calendar is live |
| `jstack-app/CODEMAP.md` | the adapters directory row, the recipe's real paths, the new test's row; maps regenerated | a new directory family |
| `jstack-mock-v15.html` | re-packaged (own commit) | QA-06. **Generated — regenerate in the target repo, don't port** |
| `remap/PROGRESS.md` | Phase 3 section, the all-day and window options | Checkpoint 3 |

## Phase 2 — the real webhooks, samples and the Twenty inventory (30 Sep 2026)

| File | Change | Why |
|---|---|---|
| `jstack-app/tests/fixtures/n8n/calendar.json`, `calendar.empty.json`, `calendar.month.json` | new: redacted DASH calendar replies (this week, a window with nothing, 45 days) | the Phase 3 adapter is tested against real shapes |
| `jstack-app/tests/fixtures/n8n/tasks.page1.json`, `tasks.empty.json` | new: redacted DASH tasks replies (the only page, and the reply past the end) | the Phase 4 adapter and its paging loop |
| `remap/redact-samples.mjs` | new: the redactor, with its refuse-on-leak check | samples are re-taken as webhooks change; never commit an unredacted one |
| `remap/PROGRESS.md` | Phase 2 section: the calls, the calendar shape, the Twenty field inventory, the open questions | Checkpoint 2 |
| `.gitignore` | `remap/n8n/reference/` and `remap/screens/private/` | Josh's original workflows carry his Telegram chat id; real-data screenshots never go into git |
| `KNOWN_GAPS.md` | N8N-2 marked "must fix before Josh sees the dashboard", with the decided fallback | answer to Checkpoint 2 |

## Phase 1 follow-ups — the answers to Checkpoint 1 (30 Sep 2026)

| File | Change | Why |
|---|---|---|
| `jstack-app/data/n8n/registry.ts` | new kind `unavailable`; `getUsage` uses it | an empty that claims activity ("$0 · 0 tokens") answers 501 instead (ADR-78) |
| `jstack-app/data/transport/n8n.ts` | `createN8nTransport(report)`: reachability reported around `callWebhook` only; `unavailable` → 501 | local answers were read as the server answering (ADR-78) |
| `jstack-app/data/provider.ts` | n8n uses `createN8nTransport(reportReachable)`, not `withReachability` | the same |
| `jstack-app/data/n8n/defaults.ts` | quiet hours 23:00–07:00 with the mock's Needs-you schedule; autonomy comment | ADR-79 |
| `jstack-app/components/tasks/Gantt.tsx` | **edit to an existing file (Josh's UI):** `TWENTY_URL` from `TWENTY_APP_URL`, `null` on a real build without it, the placeholder kept on the mock; its "Open in Twenty" link hidden when `null` | answer 4 |
| `jstack-app/components/tasks/TaskViews.tsx` | **edit to an existing file (Josh's UI):** the footer's "open in Twenty" hidden when `TWENTY_URL` is `null` | answer 4 (a guard at each of the three call sites) |
| `jstack-app/components/tasks/Board.tsx` | **edit to an existing file (Josh's UI):** "Columns · edit in Twenty" hidden when `TWENTY_URL` is `null` | answer 4 (Board is now 246 of its 250 lines) |
| `jstack-app/tests/unit/n8nReachability.test.ts` | new | ADR-78: a local answer and a 501 leave `online` alone; a webhook call reports it |
| `jstack-app/tests/unit/n8nRoutes.test.ts` | `getUsage` added to the literal 501 list | the expectation changed on purpose (ADR-78), recorded here and in PROGRESS.md |
| `jstack-app/CODEMAP.md` | §1 paragraph (reachability, `unavailable`), §4 row for the new test; maps regenerated | a convention changed |
| `DECISIONS.md` | ADR-78, ADR-79 in REMAP's table | answers 3, 5, 6 |
| `KNOWN_GAPS.md` | N8N-2 rewritten: what `unavailable` fixed and what the Agents and Brain stores prevent | answer 3 |
| `jstack-mock-v15.html` | re-packaged again, own commit | QA-06. **Generated — regenerate in the target repo, don't port** |
| `.gitignore` | `!remap/.env.local.example` | answer 7 |
| `remap/.env.local.example` | now tracked (no values in it) | answer 7 |
| `remap/PROGRESS.md` | follow-ups section | the log |
| `remap/screens/checkpoint-1-followups/` | new: the changed sections on the n8n build and the mock build, with the facts read off each | answer 3's "screenshot every changed section" |

## Phase 1 — the n8n transport, no live calls (29 Sep 2026)

### App code (`feat(n8n): …`)

| File | Change | Why |
|---|---|---|
| `jstack-app/data/config.ts` | added `DATA_SOURCE`, `N8N_BASE_URL`, `TWENTY_APP_URL`; `USE_API_ADAPTER` now means "not the mock" | `CLAUDE.md` §3's mode switch; unset keeps the old http/mock rule, so every existing test stays on the mock |
| `jstack-app/data/config.swap.ts` | the same three names, fixed to the HTTP swap build's values | metro resolves `data/config` to this file for `build:web:swap`; every name must exist in both |
| `jstack-app/data/provider.ts` | picks `n8nTransport` on n8n (under reachability, under the outbox, as HTTP is); n8n voice socket | the one swap point (ADR-02); on n8n the mock's scripted voice would be fixture content |
| `jstack-app/data/transport/http.ts` | `assertSecureOrigin` exported (one word) | the n8n client obeys the same HTTPS-or-loopback rule instead of keeping a second copy of it |
| `jstack-app/data/transport/n8n.ts` | new: the dispatcher (the third `Transport`) | `CLAUDE.md` §3 |
| `jstack-app/data/n8n/registry.ts` | new: one row per GET route, the write keys, the webhook key allow-list | `CLAUDE.md` §3, `remap/WEBHOOKS.md` §B–§D |
| `jstack-app/data/n8n/client.ts` | new: `callWebhook(key, body)` — timeout, one retry, unwrap, typed errors, 30 s sharing | the one way out to n8n |
| `jstack-app/data/n8n/defaults.ts` | new: the configuration answers (session, capabilities, layouts, focuses, parameters, sections…) | configuration only; fixture content in Josh's voice left out |
| `jstack-app/data/n8n/empty.ts` | new: the contract's empty value per response shape; single records 404 | an unwired section shows its empty state, never demo data |
| `jstack-app/tools/web-n8n.mjs` | new: `pnpm web:n8n` (dev server, `--build`, `--serve`) with settings from `.env.n8n.local` | Expo loads `.env.local` into every export, so n8n settings there would turn the mock gate build into an n8n build |
| `jstack-app/package.json` | added the `web:n8n` script | runs the tool above |
| `jstack-app/tests/unit/n8nRoutes.test.ts` | new | every GET validates against `openapi.yaml`; every keyless write is 501 with no call; registry covers the table; no fixture personal text |
| `jstack-app/tests/unit/n8nClient.test.ts` | new | the client's request, error mapping, retry, timeout and sharing |
| `jstack-app/tests/unit/n8nAllowList.test.ts` | new | registry keys = dev proxy `ALLOW`; nothing that sends or returns bytes; no n8n path in app source |
| `jstack-app/tests/unit/n8nConfig.test.ts` | new | the mode switch, and the provider really routing through n8n |
| `jstack-app/CODEMAP.md` | hand-written: §1 paragraph, §4 test rows, §5 recipe and directory row; generated sections regenerated | a new convention updates its CODEMAP section (AGENTS.md) |
| `jstack-mock-v15.html` | re-packaged from this source (`build:web:prod` + `tools/build-mock.mjs`), in its own commit | QA-06: the packaged mock must carry the current source's fingerprint; mock mode itself is unchanged. **Generated — regenerate in the target repo, don't port** |

### Josh's documents (additions only)

| File | Change | Why |
|---|---|---|
| `DECISIONS.md` | new section "ADR-76.. — REMAP's n8n build": ADR-76 (the transport), ADR-77 (site password as the passkey stand-in, proposed) | `CLAUDE.md` §2, §5; in a table of its own so RM-09's pinned 01..75 run stays as Josh wrote it |
| `KNOWN_GAPS.md` | new subsection "REMAP's n8n build": N8N-1 (no server-side session/lock), N8N-2 (empties that read as facts) | `CLAUDE.md` §5 |
| `CONTRIBUTING.md` | four rows in the environment table (`EXPO_PUBLIC_DATA_SOURCE`, `EXPO_PUBLIC_N8N_BASE_URL`, `EXPO_PUBLIC_TWENTY_APP_URL`, `JSTACK_N8N_DIST`) | RM-03: every variable the app and its tools read is listed |

### REMAP files (`chore(remap): …`)

| File | Change | Why |
|---|---|---|
| `remap/PROGRESS.md` | Phase 1 section | the progress log |
| `remap/CHANGESET.md` | new | this file |
| `remap/codemap.sh` | new: `pnpm codemap`, then restores `REMAP_HANDOVER.html` while `diagrams/` is missing | the generator drops the page's four diagrams without that folder; Josh's tools are not edited |
| `remap/screens/checkpoint-1/` | new: 14 screenshots and the capture report | Checkpoint 1 evidence (the n8n build, empty, proxy unreachable) |

### Committed as found (REMAP's own files, written before Phase 1)

| File | What it is |
|---|---|
| `CLAUDE.md`, `remap/KICKOFF-PROMPT.md`, `remap/WEBHOOKS.md` | REMAP's scope and webhook analysis, as edited before this session |
| `remap/IMPORT-GUIDE.md`, `remap/N8N-INTEGRATION-PROMPT.md`, `remap/WORKFLOWS-NEEDED.md` | how the DASH workflows were imported, the phased prompt, which workflow serves which route |
| `remap/dev-proxy.mjs` | the local proxy; `tests/unit/n8nAllowList.test.ts` reads its `ALLOW` |
| `remap/n8n/JSTACK-DASH-*.json` | the nine DASH workflows as deployed (record only) |
| `remap/n8n/reference/` | **not committed**: Josh's original workflows carry his Telegram chat id |
