# Progress — REMAP n8n wiring

_(the coding agent fills this in from Phase 0)_

## Must fix before Josh sees the dashboard

| # | What | Where it is recorded | Fix |
|---|---|---|---|
| 1 | ~~The Agents tab and the rail claim health with no source~~ — **done 30 Sep** (option b, ADR-90): each such section says "Not connected yet" | `KNOWN_GAPS.md` N8N-2 | the agent-stats / agent-health workflows (`remap/WORKFLOWS-NEEDED.md` 2.13, 2.14); if they are not live by then, per-section loading in `stores/agents.ts` and `stores/brain.ts` |
| 2 | The month grid drops the last day of a six-row month — 30 November 2026 is the first, then 31 May 2027 | `KNOWN_GAPS.md` N8N-4 | a 42-day grid in `lib/time.ts` `monthGrid` (Josh's code; the calendar adapter already follows the grid's length) |
| 3 | At 820 px the Today Calendar card's heading runs into its links ("CALENDAR" over "today · 3 days · google"); the mock does the same | `KNOWN_GAPS.md` N8N-9 | Josh's layout (`components/today/CalendarList.tsx`); no change for now |

## Open decisions for Josh

| Decision | Until then | Recorded |
|---|---|---|
| Which Twenty contacts are Life › People, and where each one's item and verb come from | Life › People empty; the glance's "People 0" has no source | N8N-17 |
| Brain › Find on the private memory with only the site password in front of it — wait, or wire it without the sensitive types | not wired | N8N-18 |
| A `priority` SELECT on Twenty tasks (HIGH / MEDIUM / LOW) — **required, with a default** | no priority is printed; `EXPO_PUBLIC_TWENTY_PRIORITY_FIELD` off | N8N-8 |
| An `area` SELECT on Twenty tasks (PERSONAL / FAMILY / WORK), set by the EA's triage | every task `personal:josh`; `EXPO_PUBLIC_TWENTY_AREA_FIELD` off | Phase 4 |
| A `waitingSince` date on Twenty tasks | waiting days count from `createdAt` | N8N-6 |
| `CalEvent.allDay` in the contract | all-day is read from the times (`lib/timeGrid.ts` `isAllDay`) | N8N-5 |
| The site password as the stand-in for server-verified passkeys | proposed | ADR-77, N8N-1 |
| The mock's calendar window; the 35-day month grid | the n8n build asks for the grid's days | N8N-3, N8N-4 |
| Overdue tasks are hidden by the default 90-day range on List, Board and Gantt (TF-01); so the Due › Overdue filter cannot match under it, and the Tasks header's open count leaves them out | as specified — Josh's spec, no change from us | Phase 5 |

## Setup — 2026-09-28 (Windows 11, Git Bash)

Assembled per `remap/SETUP-PROMPT.md` from the three downloaded folders. Environment only; no
app code changed.

### What was assembled

| Source | Went to | Files | Check |
|---|---|---|---|
| `C:\Users\Admin\Downloads\josh` (app) | `jstack-app/` | 647 | `diff -rq`: byte-identical |
| `C:\Users\Admin\Downloads\one level above josh` (docs) | repo root | 27 | `cmp` each: byte-identical |
| `jstack-remap-context\jstack-app-source\` (ours) | `CLAUDE.md`, `remap/` | 5 | byte-identical |

- **Source fingerprint: `2e75cc7bbded` over 364 files.** This matches the stamp in
  `jstack-mock-v15.html` (`jstack-source: 2e75cc7bbded9f83… (364 files)`), so this is the right source.
- Every text file in the download was already LF. Nothing got converted.
- `jstack-app/tests/.tmp-migration/store.reconciliation.json` came with the download and was
  imported as-is. It's a leftover migration report dated 2026-08-31, and nothing references it.
  It's probably a stray scratch file on the client's machine.

### Reconstructed (the originals weren't in the download)

| File | Contents | Why |
|---|---|---|
| `jstack-app/.npmrc` | `node-linker=hoisted`, `minimum-release-age=4320` | Without it every Jest suite fails to parse `react-native/jest/setup.js`. `security.test.ts` asserts the 4320 value, and it passes. Commit `chore: reconstruct .npmrc (original not in download)`. |
| `.gitignore` (root) | deps/caches/build output, plus the runtime paths the project documents as gitignored: `jstack-app/e2e/.artifacts/`, `evidence/.e2e-raw/`, `evidence/connect/` (WPD-15), `tests/lint-guard-scratch-*/` | Some of these rules are load-bearing. `tools/codemap-check.mjs` and `hooks.test.ts` ask `git check-ignore` about `e2e/.artifacts/`. |
| `.gitattributes` (root) | `* text=auto eol=lf` + binary types | per SETUP-PROMPT step 2 |

Git config (per clone, not versioned): `git config core.autocrlf false`.

### Toolchain

- Node v24.16.0, git 2.55.0.windows.2, pnpm 10.33.2 (via corepack 0.35.0).
- **`corepack enable` is blocked by Windows.** The exact error:
  `Internal Error: EPERM: operation not permitted, open 'C:\Program Files\nodejs\yarn'`
  (it writes shims into Program Files, which needs admin rights).
  Workaround with no admin needed: `corepack enable --install-directory "C:/Users/Admin/AppData/Roaming/npm" pnpm`.
  That folder was already on PATH; it had to be created first (`mkdir`). To undo:
  `corepack disable --install-directory "C:/Users/Admin/AppData/Roaming/npm" pnpm`.
- `pnpm install --frozen-lockfile` works (35 s). Two expected notes:
  - `install-hooks: .githooks/pre-commit is missing — nothing to install.`
  - pnpm 10 skips the build scripts for `esbuild` and `unrs-resolver` by default. Nothing
    depends on them.

### Gate results (baseline)

| Gate | Result |
|---|---|
| `pnpm check` | **pass** (tsc, 5 s) |
| `pnpm lint` | **pass** (27 s) |
| `pnpm test` (Jest's default zone is `America/New_York`) | **114 passed, 16 failed, 1 skipped (131 suites)**; tests 1762 passed / 81 failed / 1 skipped (1844) — 80 s |
| `JSTACK_TZ=Australia/Brisbane pnpm test` | **identical**: the same 16 suites and the same 81 tests fail |
| `node tools/build-web.mjs` | **pass**: `source fingerprint 2e75cc7bbded over 364 files`, exported to `~/.jstack-dist` (31 s) |

**Baseline = these 16 failing suites.** A change counts as green only if it adds no failure to
this list. All 81 failed tests were checked one by one. Each fails because a path is missing from
the download, or because the client's git history isn't here. **None of them is Windows-specific
(paths, CRLF, shell).**

| Suite | Fails on | Verdict |
|---|---|---|
| `consolidation.test.ts` (21 tests) | `history/v2,v21,v22/{CONTRACT,HANDOVER,*_DECISIONS,CARRIED_DEFECTS}_*.md`, `history/v1/*`, `appendix/USER_STORIES_DRAFT.md`; paths named in `HANDOVER.md`/`KNOWN_GAPS.md`/`DEVICE_RUNBOOK.md` under `history/`, `diagrams/`, `appendix/` | missing from download |
| `workflows.test.ts` (34 tests) | `.github/workflows/` (`board.yml`, `nightly.yml`, `release.yml`) | missing from download |
| `handover.test.ts` (14 tests) | `history/v2/JOSH_QA.md`, `history/v2/QA_REPORT_v2.md`, `history/v21/QA_REPORT_v21.md`, `history/v22/HANDOVER_v22.md`; screenshot passes `history/v22/demo/v21/` and `history/v22/demo/v22/` (~1,570 PNGs) | missing from download |
| `brainProposalApplied.test.ts` (5 tests) | `history/v2/BRAIN_PROPOSAL.md`, `history/v22/demo/v22/brain-proposal-*.png` | missing from download |
| `codemap.test.ts` (3 tests) | CM-02: the map is stamped `sha=71f9d7d8`, a client commit that isn't in this repo's history. Walker: CODEMAP names 22 `history/` + `.github/` paths. §4 guard column: `.github/workflows/board.yml`. (CM-01 drift passes.) | missing from download (folders + client git history) |
| `bundle-budget.test.ts` (2 tests) | `history/v22/HANDOVER_v22.md` | missing from download |
| `qaReport22.test.ts` (1 test) | `history/v2/QA_REPORT_v2.md` | missing from download |
| `openapi.test.ts` (1 test) | `history/v2/CONTRACT_v2.md` | missing from download |
| `hooks.test.ts` (suite) | `.githooks/pre-commit` | missing from download |
| `contract.test.ts` (suite) | `history/v2/CONTRACT_v2.md` | missing from download |
| `controls.test.ts` (suite) | `history/v2/CONTROLS_v2.md` | missing from download |
| `controls-v21.test.ts` (suite) | `history/v21/CONTROLS_v21.md` | missing from download |
| `controls-v22.test.ts` (suite) | `history/v22/CONTROLS_v22.md` | missing from download |
| `buglogRows.test.ts` (suite) | `history/v22/BUGLOG_v22.md` | missing from download |
| `qa-citations.test.ts` (suite) | `history/v2/QA_REPORT_v2.md` | missing from download |
| `bnCaptureCarried.test.ts` (suite) | `history/v2/QA_REPORT_v2.md` | missing from download |

Versus the Linux dry run (18 failing, 112 passing): this run has 2 fewer failures. I can't name
them without the dry run's list. The likely cause is that this run happened after the source was
committed and the root `.gitignore` existed. `files.test.ts` runs `git grep` over tracked
files, and `hooks.test.ts`/`codemap-check` ask `git check-ignore`.

Note: every `pnpm test` run rewrites the tracked `jstack-app/evidence/jest-summary.json` with
this copy's smaller counts (the client's committed file says 2476 tests). Restore it with
`git checkout -- jstack-app/evidence/jest-summary.json` and don't commit the change.

### Running it

| What | Command (from `jstack-app/`) | URL |
|---|---|---|
| Production-style build, served | `node tools/build-web.mjs` then `pnpm serve:web` | http://localhost:4173 |
| Expo dev server (hot reload) | `pnpm web` | http://localhost:8081 |

Smoked both in headless Chromium (Playwright 1.62.1), at 1366×900, on both unlock paths:
- **Passkey:** virtual authenticator, the same way `e2e/helpers.ts` does it. Lock screen → ceremony → unlocked.
- **Mock sign-in:** the passkey is cancelled (`NotAllowedError`) → "mock sign-in" is offered → unlocked,
  with the toast "Signed in to the mock · fixture data".
- All five tabs render fixture data (Today, Tasks "11 open · 2 waiting", Brain, Life,
  Agents "2 need you · 5 runs today").
- **Console on `serve:web`: 0 errors, 0 warnings** on both paths.
- **Console on `pnpm web` (dev) isn't clean.** These messages are dev-only and pre-existing in the
  client's code, not caused by this setup. None of the docs mention them:
  - 96× Metro `Require cycle` warnings (e.g. `stores/session.ts → data/provider.ts → … → stores/session.ts`)
  - react-native-web deprecations: `"shadow*" style props are deprecated`, `props.pointerEvents is deprecated`
  - **React DOM-nesting error on the Agents tab:** `<button> cannot contain a nested <button>`.
    The `Row` `issue-e1` Pressable in Agents › Agent issues wraps the `BtnSm` "Renew"
    (`issue-act-e1`). The same invalid HTML ships in production too; React only reports it in dev.
    **Real, minor, not fixed** (app code; needs an OK).

### Still missing from the download — what to fetch from the client's server

All paths are relative to `jstack-app-source/` on the server:

1. `jstack-app/.npmrc`, to replace the reconstruction.
2. The hidden files at the root: `.gitattributes`, `.gitignore`, plus `jstack-app/.gitignore` if it exists.
3. `.githooks/` (`pre-commit`, `pre-push`)
4. `.github/` (`workflows/board.yml`, `nightly.yml`, `release.yml`, `dependabot.yml`, CODEOWNERS, PR template)
5. `history/`, whole, including `history/v22/demo/v21/` and `history/v22/demo/v22/` (the screenshot
   passes, ~1,570 PNGs), `history/v1/`, `history/v2/`, `history/v21/`, `history/v22/`,
   `history/expo-go/`, `history/README.md`
6. `appendix/` (`USER_STORIES_DRAFT.md`, `JO_PREFERENCES.md`, `CONTEXT_INDEX.md`)
7. `diagrams/` (`1-architecture-seams.html`, `2-offline-capture.html`, `3-lock-states.html`, `4-stage2-plugin.html`)

Getting the hidden files and subfolders means copying the tree with a tool that keeps them, e.g.
`tar czf jstack-app-source.tgz --exclude=node_modules jstack-app-source`, or `rsync -a`. A browser
or file-manager download loses them. With those folders in place, every failure that's an
`ENOENT` or a missing path should clear (not verified; re-run the gates). `codemap.test.ts` CM-02
stays red until the client's git history (`.git`, commit `71f9d7d8`) is here, or until the map is
re-stamped by a `pnpm codemap` commit in this repo.

## Phase 1 — the n8n transport, no live calls (29 Sep 2026)

Built to `remap/N8N-INTEGRATION-PROMPT.md` Phase 1. Nothing is committed yet; `remap/CHANGESET.md`
lists every file and why.

### Baseline, re-measured before any change

`pnpm test` on this tree: **16 failing suites, 81 failing tests** (1844 tests), in both zones —
the list in the Setup section above. `CLAUDE.md` and the prompt say 18; this Windows copy has
always had 16 (see "Versus the Linux dry run" above). The comparison below is test by test, not
only suite by suite, so a new failure inside an already-red suite would show.

### What was built

- `data/config.ts`: `DATA_SOURCE` (`EXPO_PUBLIC_DATA_SOURCE` = `mock` | `http` | `n8n`; unset keeps
  the old rule, so every test stays on the mock), `N8N_BASE_URL` (default `/n8n`),
  `TWENTY_APP_URL` (default empty). `USE_API_ADAPTER` is now `DATA_SOURCE !== "mock"`.
  `config.swap.ts` carries the same names. `N8N_CALENDAR_SOURCE` waits for Phase 3: nothing reads
  it before the calendar adapter, and CT-06 refuses an export nothing imports.
- `data/transport/n8n.ts`: the dispatcher. Routes matched in table order; a GET by its registry
  row, a write by `WRITES` (empty: every write answers `501 { reason: "not connected yet" }` with
  no call). Wrapped by reachability and the outbox exactly as HTTP is (`data/provider.ts`).
- `data/n8n/registry.ts`: 72 GET rows — 2 `wired` (calendar, tasks: stubs until their adapters
  exist), 4 `derived` (today; tasks/{id}; tasks/waiting; life), 23 `default`, 43 `empty`.
- `data/n8n/client.ts`: `callWebhook(key, body)`. Not called by anything yet (no adapter). A write
  is retried only when it carries an `offlineId` the workflow dedupes on; the prompt's "one retry
  on network/5xx" is kept for reads, because repeating any other write could apply it twice.
- `data/n8n/defaults.ts`, `data/n8n/empty.ts`: see the two tables below.
- `tools/web-n8n.mjs` + `pnpm web:n8n`: see "Env files".

### Every `USE_API_ADAPTER` branch, decided for n8n

| Where | What it decides | On n8n |
|---|---|---|
| `data/config.ts` | the flag itself | `true` |
| `data/provider.ts` `build()` | which transport | `n8nTransport`, under `withReachability`, under the outbox |
| `data/provider.ts` `getVoiceSocket()` | real socket or the mock's scripted voice | a socket that closes at once (`capabilities.liveVoice` is off, so Talk says it is unavailable before connecting) |
| `components/chrome/Gate.tsx` (four reads) | whether the mock's own sign-in is offered | never — passkey only |
| `components/chrome/DemoWatermark.tsx` | the "fixture data" mark | hidden |
| `components/chrome/Toast.tsx` | toast clears the watermark on a phone | no clearance needed |
| `lib/testHook.ts` (test builds only; `testBuild.prod.ts` in production) | `apiMode`, and the rig's `db`/`reset`/`telegramAnswer`/`setWork`/`inbox`/`setClockOffsetMs`/`asUser`/`revokeThisDevice`/`forceRefreshReuse` levers, which call `API_BASE_URL/__test__/…` | `apiMode: true`; those levers would throw (`API_BASE_URL` is null). The e2e rig does not run against n8n; left as is |
| `metro.config.js` (`EXPO_PUBLIC_USE_API_ADAPTER=1` → `config.swap.ts`) | the BS-05 swap build | not triggered: n8n does not set that flag |
| `lib/serverEvents.ts` (mock vs real, not the flag) | listens to the mock's in-process bus whatever is live | nothing emits on n8n, so no server events (already `KNOWN_GAPS.md` Review 7) |

### Defaults (`data/n8n/defaults.ts`) — configuration only

| Route | Answer | Source |
|---|---|---|
| `/session` | owner Josh, silos `personal:josh`, `family1`, `family2`, `work`; one device "This device" | mock `USERS.josh` |
| `/capabilities` | all off except `calendarViews`; `speech` decided on the device | `data/capabilities.ts` rule |
| `/focuses`, `/layout/{tab}`, `/layout/app` | the four focuses; each tab's designed order, none hidden | fixtures (configuration) |
| `/tasks/columns`, `/slicers`, `/agents` | the five board columns; the five slicers; who can take a task | fixtures (configuration) |
| `/parameters` | `defaultParameters()` | `data/parameters.ts` |
| `/sections`, `/sections/{id}` | the seven configured sections (People, Money, Learning, Health, Usage, Replies, Files) — an empty list would remove them from their tabs | fixture structure; the EA's `reason` texts dropped; Health's ghost without "Next: skin check, 2 Oct" |
| `/life/sections/{id}/config` | `{ id, managedByEa: false }` | the fixture's categories and budgets are Josh's |
| `/portals` | Gmail, Calendar, Dropbox (real URLs); Twenty only when `TWENTY_APP_URL` is set | fixture purposes; no n8n or OpenClaw URL in the bundle |
| `/settings/autonomy` | the six categories, all "Ask me" | the least-claiming value; nothing enforces it on n8n |
| `/settings/quiet-hours` | 21:30–07:00, Security excepted; no Needs-you schedule | fixture hours (question at the checkpoint) |
| `/settings/voice` | the documented defaults, no morning read time | ADR-24, TS-02/03, ST-06 |
| `/auth/nonce`, `/sync/status`, `/labels/scheme` | a random nonce nothing verifies; an empty queue; the label scheme | — |

Left out on purpose: notification groups (answered `[]`: no push service), EA rules
(`{ rules: [] }`), schedules (`[]`), the fixtures' devices, people, budgets and the health
appointment. `tests/unit/n8nRoutes.test.ts` reads those phrases off the fixture files and proves no
GET answer contains any of them.

### Empty values (`data/n8n/empty.ts`)

Lists are `[]`, composites have nothing counted. Nine single records by id (`/actions/{id}`,
`/events/{id}`, `/tasks/{id}`, `/brain/items/{id}`, `/goals/{id}`, `/learning/{id}`,
`/agents/issues/{id}`, `/files/{id}`, `/sections/{id}` for an unknown id) answer `404`.
`/sections/catalogue` answers `501`: it has no honest empty form, it is built in `layout/` (which
`data/` cannot import without a cycle), and nothing in the app calls it.

The validator (`data/mock/schemaValidate.ts`, and its twin `tools/schema-validate.mjs`) resolves a
`$ref` before its `nullable` sibling, so it refuses `BrainSearchResult.answer: null`, which the
contract allows. Already recorded as `KNOWN_GAPS.md` Review 17; the new sweep rewrites a nullable
`$ref` as the equivalent `oneOf` before checking, and proves the rewrite still refuses a wrong value.

### Env files (checked, not assumed)

- **Jest ignores `jstack-app/.env.local`**: a probe test with `EXPO_PUBLIC_DATA_SOURCE=n8n` in it
  read `undefined` and `DATA_SOURCE = "mock"`.
- **Expo loads it for `expo start` and `expo export`** (`@expo/env`, every mode but `test`:
  development → `n8n`, production → `n8n`). So an n8n setting in `.env.local` would turn
  `node tools/build-web.mjs` — the mock gate build — into an n8n build.
- So the settings go in **`jstack-app/.env.n8n.local`** (gitignored by `.env.*`; a name nothing but
  the tool reads), and `pnpm web:n8n` passes them on the command: `pnpm web:n8n` (dev server),
  `pnpm web:n8n --build` (export to `~/.jstack-dist-n8n`), `pnpm web:n8n --serve` (port 4174).
- **Metro's cache is a second trap.** The first n8n export came out with `DATA_SOURCE = "mock"`
  compiled in: Metro reused the mock build's transform of `config.ts` (the hazard
  `metro.config.js` already warns about). The reverse — n8n values cached where the next mock
  build picks them up — would put the gates on n8n. `tools/web-n8n.mjs` now points Metro's temp and
  cache (`os.tmpdir()`) at `~/.jstack-metro-n8n` and empties it first. Checked in the bundles:
  `~/.jstack-dist` and `~/.jstack-dist-prod` compile `"mock"`, `~/.jstack-dist-n8n` compiles
  `"n8n"` with its own base URL.

### Gates (after the change)

| Gate | Result |
|---|---|
| `pnpm codemap` | runs; the walker names the same 22 missing `history/`/`.github/` paths as before |
| `pnpm check`, `pnpm lint` | pass |
| `pnpm test` (New York) | the same 16 failing suites, **80** failing tests (2020 total). New failures: **none**. One baseline failure now passes: CM-02 (the map is stamped with this repo's commit) |
| `JSTACK_TZ=Australia/Brisbane pnpm test` | identical |
| `node tools/build-web.mjs` | pass |
| `tools/secret-scan.mjs` (app and repo root) | clean |

New tests: 177, all green. Each guard was seen to fail: a registry row removed, and a fixture
phrase planted in a default, each turned the sweep red.

Side effects handled:
- **QA-06** requires `jstack-mock-v15.html` to carry the current source's fingerprint, so any
  source change needs the mock re-packaged: `build:web:prod` + `tools/build-mock.mjs`. Done
  (`2116678e52a8` over 369 files); mock mode itself is unchanged.
- **`pnpm codemap` rewrites `REMAP_HANDOVER.html` without its four diagrams** (they come from
  `diagrams/`, missing from the download). Use `sh remap/codemap.sh` instead of plain
  `pnpm codemap`: it runs the maps, then restores the committed page while `diagrams/` is missing.
- **RM-09** pins `DECISIONS.md` to rows 01..75, so ADR-76/77 are in their own REMAP table.
- **RM-03**: the new variables are in `CONTRIBUTING.md`'s table.
- **`evidence/jest-summary.json`**: restore it between the two zone runs, not only after both
  (the Brisbane run's QA-03 reads what the New York run wrote).

### Checkpoint 1 capture — n8n build, proxy unreachable

The dev proxy was running on 8787 (one read-only probe of mine reached the `tasks` webhook), so
the "stopped proxy" run points the build at `http://127.0.0.1:8799/n8n`, where nothing listens.
Served export, Chromium, Brisbane zone, virtual authenticator, 1366 px and 390 px. Screenshots and
the raw report: `remap/screens/checkpoint-1/`.

- Locked screen: passkey only, no mock sign-in, no watermark.
- Every tab, Settings and Find render; nothing crashed.
- **Console: 0 messages. Requests off the page's origin: 0.** No row has an adapter yet, so nothing
  reaches the network at all; the expected network errors start in Phase 3.

Empty states that read wrong (app copy or contract-valid empties; none changed, the UI is Josh's):

1. The rail and phone header say **"all healthy · $0.00"**, and Agents › Runs and spend says 0
   runs, 100%, $0.00, 0 issues. `AgentSummary` has no empty form that makes no claim (N8N-2).
2. Agents › Spend reads **"heartbeat every"**: the sentence runs out because `heartbeat.every` is empty.
3. Agents › Agent issues says **"Nothing failing. Every check ran when it should."** over an empty list.
4. Brain › Memory says **"All caught up. The Librarian runs again at 2:00."** (hard-coded in
   `components/brain/Memory.tsx`) and "0 of 0 test questions right last week".
5. Tasks' footer **"open in Twenty"** opens `https://twenty.example/`, a placeholder hard-coded in
   `components/tasks/Gantt.tsx` (`TWENTY_URL`), not configuration.
6. Today › At a glance shows People 0, Goals 0, Habits "—", Money blank.
7. Empty sections draw as thin empty cards (Life's Goals, Habits, People, Money, Learning; Agents'
   Security checks, Last 24 hours, Decision history; Brain's Replies, Files).
8. Settings › Schedules shows Needs you at 8:00–9:00 and 16:00–17:00, paused: the app's own
   `PAUSED_SCHEDULE` for a record with no schedule, not data.
9. Brain's Find placeholder is "what did Andy say?" (app copy naming a fixture person).

## Phase 1 follow-ups — the answers to Checkpoint 1 (30 Sep 2026)

Committed on branch `remap/n8n` (from `main`); the untouched import is tagged `client-baseline`
(`f681c9b`). Nothing is pushed.

### Git

- Phase 1 went in as four commits: the pre-existing REMAP docs, dev proxy and DASH exports; the
  app work (`feat(n8n)`); the mock rebuild on its own (`chore(remap): rebuild packaged mock
  (generated)`); the notes. `remap/n8n/reference/` is **not committed**: Josh's original workflows
  carry his Telegram chat id. Say if you want it in anyway.
- `remap/codemap.sh` replaces plain `pnpm codemap`: it restores `REMAP_HANDOVER.html` only while
  `diagrams/` is missing, so once the folder is fetched the regenerated page is kept.
- `.gitignore`: `!remap/.env.local.example`. `git check-ignore`: `remap/.env.local`,
  `jstack-app/.env.n8n.local` and `jstack-app/.env.local` stay ignored; the example is tracked.

### Empty states that read as facts (answer 3)

How the app reacts, checked before choosing: `withReachability` counts any answer as the server
reachable and only a network failure as offline; the outbox never touches a GET; a store turns any
status ≥ 400 into its `loadError`. So `501 { reason: "not connected yet" }` is a section error, not
"offline" — **with one defect found on the way**: the n8n transport answers most routes on the
device, and wrapped in `withReachability` each local answer read as the server answering. With the
proxy down, `sync.probe`'s local `GET /capabilities` would have put the session back online. The
transport now reports reachability itself, around `callWebhook` only (ADR-78);
`tests/unit/n8nReachability.test.ts` proves a local answer and a 501 leave `online` as it was,
nothing is queued, and a webhook call reports false on a network failure and true on any answer
(the old wiring, planted back, turns it red).

What changed, and what could not without a UI edit — **the question for you is below**:

| Route or surface | Result |
|---|---|
| `GET /usage` | kind `unavailable` → 501. The Usage section (a config record) survives a failed load and shows an empty card instead of "$0 this month · 0 tokens". Screenshot `n8n-agents.png` |
| `GET /agents/summary`, `/agents/spend`, `/agents/issues`, `/agents/feed`, `/security/checks`, and the rail's "all healthy · $0.00" (fed by the summary) | **unchanged, still empty.** `stores/agents.ts` loads all seven Agents reads in one `Promise.all`, and `app/(tabs)/agents.tsx` shows the tab-level "Couldn't load · tap to retry" whenever the load failed and there is no summary. One 501 would replace the whole Agents tab — Portals and the Emergency lock card included — and leave its subtitle at "loading…". Even with the loads split, Issues, Feed and Checks render their empty copy ("Nothing failing…") for an empty list, so an honest state there needs a component change |
| `GET /memory/hitrate`, and the "Librarian runs again at 2:00" line | **unchanged.** `stores/brain.ts` loads Latest in, proposals and the hit-rate in one `Promise.all`, and a failure with no captures replaces the whole Brain tab — the capture field and Find with it. The Librarian sentence is hard-coded in `components/brain/Memory.tsx` for any empty proposal list; no route controls it |
| At a glance | People and Goals are required numbers in `TodayComposite.glance`, with no unknown value, so they wait for Phase 6. Money is a string and already reads blank |
| Health's ghost | the only honest "not connected" pattern the app has: a config section's `feed` names a capability, and its ghost shows while the flag is off. The capability names are a closed list (`layout/catalogue.tsx` `FEEDS`); none fits usage or agents |

### The other answers

- **Answer 4, "open in Twenty":** `components/tasks/Gantt.tsx`'s `TWENTY_URL` is `TWENTY_APP_URL`
  on a real build, `null` when that is unset, and the mock's placeholder on the mock. The three
  links (Tasks' footer, Gantt, Board) render only when it is set; the footer's "Tasks live in
  Twenty" stays. Mock mode is unchanged (all three links present, captured). Screenshots
  `n8n-tasks-*.png`, `mock-tasks-*.png`.
- **Answer 5, quiet hours:** 23:00–07:00, Security excepted, the mock's Needs-you schedule
  (ADR-79). Checked in `JSTACK-SEND-OR-QUEUE`: its Check Quiet Hours node reads the hour with
  `timeZone: 'Australia/Brisbane'` and holds 23:00–07:00, whatever the workflow's own Asia/Karachi
  setting — so the two agree. The app reads quiet hours in the device's zone. Settings shows
  "Quiet hours, 11pm to 7am, apply to all but security."
- **Answer 6, autonomy:** every category "Ask me" (already so; recorded in ADR-79).

Gates after the follow-ups: `pnpm check`, `pnpm lint`, codemap walker (the same 22), unused
exports: clean. `pnpm test` in both zones: the same 16 failing suites and 80 failing tests as after
Phase 1, no new failure. QA-06 went red in the board run because the mock was re-packaged after
the tests; re-run after the rebuild, `pwa.test.ts` passes 33/33. `build-web`, `build:web:prod` and
the mock rebuild pass (`58403ca31d5e`). Console on both builds: 0 messages; requests off the page's
origin: 0.

Port 4173 is still held by a `serve:web` node process started 28 Sep (the setup session); it serves
`~/.jstack-dist` from disk, so the mock capture above used it. Not stopped.

## Phase 2 — the real webhooks, samples and the Twenty inventory (30 Sep 2026)

Read-only calls through the running dev proxy (`127.0.0.1:8787`); nothing written anywhere.

| Call | Body | Answer |
|---|---|---|
| `calendar` | `{"timeMin":"2026-09-29T14:00:00.000Z","timeMax":"2026-10-06T14:00:00.000Z","maxResults":250}` (Brisbane today 00:00 + 7 days) | 200, `ok`, 3 events |
| `calendar` | the same week's shape in January 1990 | 200, `ok`, 0 events |
| `calendar` | 45 days from today, `maxResults` 500 (the month view's reach) | 200, `ok`, 26 events |
| `tasks` | `{"limit":60}` | 200, `ok`, 29 tasks, `totalCount` 29, `hasNextPage` false — **there is no page 2** |
| `tasks` | `{"limit":60,"cursor":<page 1's endCursor>}` | 200, `ok`, 0 tasks — the real "past the end" reply, used as the empty sample |

The replies carry no `request_id` back (keys: `ok`, `duration_ms`, `data`); the DASH reply shape
echoes it only when the request sends one.

### Samples (`jstack-app/tests/fixtures/n8n/`)

`calendar.json`, `calendar.empty.json`, `calendar.month.json` (the 45-day reply, for the Month
view), `tasks.page1.json`, `tasks.empty.json`. No `tasks.page2.json`: there is no second page.

Redacted by `remap/redact-samples.mjs` from raw replies kept outside the repository: titles, names,
free text, bodies (markdown syntax and blocknote structure kept, words replaced), locations, meet
links, Google links (their `eid` encodes the calendar's address), the search vector, and ids
(mapped consistently, so a recurring event's instances and a cursor's id still line up). Kept as
they came: timestamps, enums, counts, flags, time zones, and the names of software actors
(`openclaw-agent`, `jstack-n8n`, `Workflow`, `Standard`). The tool refuses to write while any
replaced original of 4+ characters survives in any output; a second, independent pass over every
field confirmed only those kept kinds are verbatim. No email address in any fixture; secret scan
clean.

### Calendar, as the DASH reply gives it

Per event: `id`, `title`, `start`, `end`, `allDay`, `timeZone`, `location`, `meet_link`, `htmlLink`,
`attendees_count`, `transparency`, `eventType`, `recurringEventId`, `updated`, `protectedByEa`,
`calendarId` — exactly `remap/n8n/JSTACK-DASH-calendar-read.json`'s "Shape Events".

- **All-day events are common**: 2 of this week's 3, 12 of the 45 days' 26. `start`/`end` are then
  bare dates with the end exclusive (one sample runs 2 Oct → 4 Oct: two days), and `timeZone` is
  null. This is Phase 3's all-day decision.
- Timed events carry an offset (`+10:00`); time zones seen: `Australia/Brisbane`,
  `Australia/Sydney`, null.
- `eventType`: `default`, `fromGmail`, `birthday` (contacts' birthdays, all-day).
- `transparency`: `opaque` and `transparent` (free/busy — relevant to gaps).
- Recurring instances: id `<base>_<instant>` with `recurringEventId` = the base.
- No event without an `end`; none `protectedByEa` yet; `updated` always present.

### Twenty tasks — the field inventory (29 records, every one present on every record)

| Field | Type | Values seen | Could fill |
|---|---|---|---|
| `id` | uuid | — | `Task.id`; the Twenty link `…/object/task/<id>` |
| `title` | string | — | `Task.title` |
| `status` | enum string | `TODO` ×6, `DONE` ×23. **`IN_PROGRESS` never seen** (Twenty's third standard value) | `Task.status` |
| `bucket` | custom enum, nullable | `INBOX` ×8, `DONE` ×20, null ×1. **Not kept in step with `status`**: 2 tasks are `DONE` but still `INBOX`, 1 `DONE` has none | `Task.column` (Board), if its options are the kanban stages |
| `waitingOn` | string, `""` when unset | non-empty on 2 tasks, both `TODO`/`INBOX`, both a short name | `status: "waiting"` and `Task.waitingOn.who` → `/tasks/waiting` |
| `dueAt` | ISO UTC instant, nullable | 17 set, 12 null; 2 of the 6 open tasks have one. Clock parts vary (`07:00Z`, `12:00Z` ×4, `21:00Z`, `09:55Z`…) | `Task.due` |
| `assigneeId` | uuid, nullable | **null on all 29** | `Task.owner` (via workspace members) |
| `createdBy` | `{ source, workspaceMemberId, name, context }` | `AGENT`/`openclaw-agent` ×25, `WORKFLOW`/`Workflow` ×3, `API`/`jstack-n8n` ×1; `workspaceMemberId` null on all | `Task.owner` "ea"? `Task.metaParts.note`? |
| `updatedBy` | the same | `API`/`openclaw-agent` ×25, `API`/`jstack-n8n` ×2, `APPLICATION`/`Standard` ×1, `MANUAL`/a person ×1 (one with a `workspaceMemberId`) | `Task.completedBy` for a done task? |
| `position` | integer | distinct, −48 … 0 | the List's order |
| `bodyV2` | `{ blocknote: JSON string \| null, markdown: string }` | 11 with a body (headings, bullets, numbered lists, bold), 18 empty | nothing on `Task` holds a body; the task card has no description field |
| `projectId` | uuid, nullable | null on all 29 | `Task.project` (needs the project's name, a second read) |
| `decisionId` | uuid, nullable | null on all 29 | — (a link to a decision record?) |
| `createdAt`, `updatedAt` | ISO UTC | — | `setAt` (updatedAt); `completedAt` for a done task? |
| `deletedAt` | null | null on all (REST leaves soft-deleted records out) | — |
| `searchVector` | Postgres tsvector string | — | nothing |

**Absent:** any priority field; `taskTargets` (links to people and companies — Twenty returns
relations only at `depth=1`, and the DASH workflow calls `/rest/tasks` without it); an assignee
object; any silo, focus, project name or label signal; start/end dates; a completion timestamp;
subtasks.

### Open questions — Phase 4 waits on these

1. **Priority** is required by the contract and printed on every task ("medium priority"), and
   Twenty has none. Options: (a) a `priority` select added to Twenty's task object (Josh's
   workspace) and passed through; (b) derive it (`dueAt` within 48 h → high?) — an invented claim;
   (c) a change to how `lib/taskMeta.ts` prints a priority the source does not have (a UI edit).
   Which?
2. **Status**: is a non-empty `waitingOn` `waiting` (so those two tasks show in Waiting on and the
   Waiting column)? And should `IN_PROGRESS` → `in_progress` stay mapped for when it appears?
3. **`bucket` and the Board**: what are its options in Twenty (the sample shows only `INBOX` and
   `DONE`)? Is it the kanban field the Board's columns should mirror (`GET /tasks/columns` from its
   options), or leave the default five columns and ignore `bucket`? A task `DONE` in `INBOX` — which
   wins?
4. **Owner**: nobody is assigned. Default everything to `josh`, or `ea` when `createdBy.source` is
   `AGENT` (25 of 29 were made by OpenClaw)? Which workspace-member ids are Josh and Joce, if
   assignment starts being used?
5. **Silo / focus**: no field says which silo a task is in, so the Personal/Family/Work chips cannot
   filter tasks. One default silo for every task (`work`? `personal:josh`?), or a custom field in
   Twenty?
6. **Waiting rows** need `days` waiting: count from `updatedAt`, `createdAt`, or leave the task out
   of `/tasks/waiting` until Twenty records when the wait began?
7. **Done tasks**: `completedAt` from `updatedAt` for a `DONE` task (approximate — any later edit
   moves it), or leave it unset? And the 23 done tasks feed the Done view: all of them, or only
   recent?
8. **`dueAt` clock times**: are the `12:00Z` ones (22:00 in Brisbane) meant as "due that day"? If
   OpenClaw writes date-only dues at noon UTC, the app would show "10pm".
9. **Links to people/companies (`taskTargets`)**: worth a DASH tasks-read change to call Twenty
   with `depth=1`? It would add the relations to every record (and the payload grows).
10. **Bodies**: Twenty holds a markdown body on 11 tasks; the contract's `Task` has no field for it,
    so it would not show anywhere. Leave it, or is it wanted somewhere (Josh's call — no new UI)?

### Answers (30 Sep) — each to be one switch in the tasks adapter

> **Must fix before Josh sees the dashboard:** the Agents tab and the rail still claim health with
> no source ("all healthy · $0.00", 0 runs, 100%, "Nothing failing"). Decision: leave it (option a)
> until agent-stats / agent-health are live; if they are not by then, per-section loading in
> `stores/agents.ts` and `stores/brain.ts` (option b). `KNOWN_GAPS.md` N8N-2.

1. **Priority**: map a Twenty SELECT `priority` (HIGH / MEDIUM / LOW) when present; never invent one.
   Until then, if `lib/taskMeta.ts` prints "medium priority" on every task, the smallest edit that
   prints priority only when it came from a real value — or stop if that needs a contract change.
2. **Waiting**: a non-empty `waitingOn` on a task that is not `DONE` → `waiting`, and it feeds
   `/tasks/waiting` with `waitingOn` as the who/what; days from the most honest timestamp, or none.
3. **Board**: columns mirror `bucket`'s options in Twenty's order; `status` decides done-ness when
   the two disagree; moving a card is a write (Phase 6).
4. **Owner**: `josh` until `assigneeId` is used; `createdBy` = openclaw-agent does not make it `ea`.
5. **Silo / focus**: `personal:josh` with the mock's focus for that silo; map a Twenty SELECT `area`
   (PERSONAL / FAMILY / WORK) when present.
6. **Completion time**: unset if optional; `updatedAt` on `DONE` only if required, commented as an
   approximation.
7. **The rest**: the most conservative option that states nothing Twenty does not hold; each listed
   at Checkpoint 4.

Housekeeping the same day: the raw unredacted replies were deleted from the session scratchpad
(re-fetch through the proxy when needed); `remap/n8n/reference/` and `remap/screens/private/`
(screenshots of the app on real data) are in `.gitignore`.

## Phase 3 — the calendar, live (30 Sep 2026)

`GET /calendar` answers from the `calendar` webhook through `data/n8n/adapters/calendar.ts`,
mock-exact: `rangeFor`'s window (local midnight to local midnight: 1, 3 or 7 days or a calendar
month from the anchor; `maxResults` 500 for the month, 250 otherwise), start-in-window,
`inFocus`, and `gapsFor` for `today` only — copied from `data/mock/handlers/calendar.ts` because
`data/n8n/` may not import the mock (CT-03). Each event: `id`, `title`, `startsAt`/`endsAt` (timed:
the instant; all-day: local midnight of each date, Google's end exclusive; no end: +30 min),
`source` = `N8N_CALENDAR_SOURCE` (`personal`), `labels` `{ personal:josh, [], source }`, `focus`
`personal` (what the mock gives a personal event), `setAt` = `updated`, `googleUrl` = `htmlLink`,
`protectedByEa` only when true, no `prep`. Anything else in the reply is the section's 502.
`data/n8n/focus.ts` now holds the owner's silos and the four focuses, which the defaults use too.

Tests: `tests/unit/n8nCalendar.test.ts` (26, both zones, literal instants per zone; a planted
one-day-short week turned two red), and the sweep now stubs each wired key with its redacted
sample and asserts per route that only a wired row with an adapter reaches a webhook, through its
own key (an expectation changed on purpose: calendar is the first live row). The schema loader
moved to a helper, `tests/unit/n8nContract.ts`.

### Live, against the running proxy (n8n build, Chromium in Brisbane, 30 Sep)

Screenshots are in `remap/screens/private/checkpoint-3/` — **gitignored, real calendar data**. I
could not open Google Calendar's own page (its connector is not authorised here), so "next to
Google" is the webhook's reply for the same days, which is what Google returned.

| View | Webhook calls | What the app draws | Google (the webhook) for the days drawn |
|---|---|---|---|
| Today (grid) | 1 | nothing on 30 Sep | nothing on 30 Sep ✅ |
| 3 days (grid) | 1 | Fri 2: the timed event in place ✅, and the all-day event — **drawn above the card** | Fri 2: 1 timed + 1 all-day (2–3 Oct) |
| Calendar card, "3 days" | 0 (shared the grid's 3-day call) | the same two, the all-day one as a **"0:00" row** | same |
| Week | 1 | Mon 28 – Sun 4: Fri 2 as above; **Sat 3 empty** | Fri 2 as above; the all-day event also covers Sat 3 |
| Month | 1 | **September, no dots at all** | 22 events in October, 0 in September |

Console on the run: 0 messages. Every call carried exactly the window `rangeFor` builds; the
Calendar card's 3-day list reused the grid's call (the 30-second sharing), so four views cost four
webhook runs.

### What does not match yet

1. **All-day events** (12 of 26 over 45 days) — the options below.
2. **Week and Month ask for a different window than they draw** — a mock defect the fixtures hide.
   `rangeFor` starts at the anchor (today), while the grid draws Monday–Sunday of the anchor's
   week (`lib/timeGrid.ts` `daysFor` → `weekOf`) and the anchor's calendar month
   (`monthGrid`). On Wednesday 30 Sep, Week fetches Wed 30 → Tue 6 and draws Mon 28 → Sun 4 (Mon
   and Tue drawn but never fetched; next Mon 5 fetched and never drawn); Month fetches 30 Sep →
   30 Oct and draws September (one day of overlap). Options: **W1** keep mock-exact (as now);
   **W2** the adapter asks for what the grid draws — week `weekStart(anchor)` + 7 days, month the
   35-day grid (`monthGrid(anchor)`, within the webhook's 45-day cap) — a deviation from the mock
   handler, recorded as an ADR, the mock itself left alone. I recommend W2.
3. **An event that began before the window** (a two-day all-day event started yesterday) is left
   out by the mock's start-in-window rule, where Google shows it on both days.
4. Today's Calendar card ("today") reads the `/today` composite, which is Phase 5's.

### All-day rendering — options, not decided

How it draws today: an all-day event is local midnight → next midnight. `lib/timeGrid.ts`
`gridPosition` places blocks by hour from 06:00, so it gets `top` −144 px and the 12 px minimum
height: a small pill above the day's track, over the section heading. `eventsOn` and the month dots
count an event on its start day only, so a two-day event shows once. The Calendar card prints
`formatTime(startsAt)`: "0:00". `gapsFor` counts the event as busy 06:00–20:00, so a day with a
birthday or a travel day has no free gaps. `CalEvent` has no all-day flag, so the UI cannot tell.

| Option | Data layer | UI | Contract | Result |
|---|---|---|---|---|
| **A** Leave all-day events out of `/calendar` | yes | — | — | the grid is clean; birthdays, travel and holidays (12 of 26) vanish from every view |
| **B** Keep them; leave them out of `gaps` (and, if you like, `transparency: "transparent"` events too — Google's "free") | yes | — | — | the gaps become honest; the pill above the card, the "0:00" row and the one-day showing stay |
| **C** B, plus the UI recognises an all-day event as one that runs local midnight to local midnight (a pure helper in `lib/timeGrid.ts`): a strip above the hours in Today/3-day/Week, a dot on every day it covers in Month, "all day" instead of "0:00" in the card, and the overlap rule for all-day events (item 3) | yes | `CalendarGrid.tsx`, `CalendarList.tsx`, `lib/timeGrid.ts` | — | Google's layout; a timed event that happens to run midnight to midnight would read as all-day |
| **D** C, but with `allDay?: boolean` added to `CalEvent` (set by the adapter; the UI reads the flag, not a heuristic) | yes | the same | `data/types.ts`, `openapi.yaml` regenerated, `CONTRACT.md` §3 | the same result, stated rather than inferred; the one contract change in this work so far |

My recommendation: **B now** (data layer only, and it stops a birthday wiping out a day's free
time), then **D** if a contract addition is acceptable, otherwise **C**. Nothing here is built yet.

## Phase 3 follow-ups and Checkpoint 3b (30 Sep 2026)

Decided: B, then C (not D). Built as separate commits:

1. **Overlap, not start** (ADR-80): an event is in the window when it overlaps it; a two-day event
   shows on both days and yesterday's shows today. Adapter only.
2. **Gaps** (ADR-81, option B): all-day events and events Google marks free
   (`transparency: "transparent"`) no longer take time; they stay in `/calendar`.
3. **Week and Month fetch what the grid draws** (ADR-82): Monday–Sunday, and the month grid's own
   days. Checked: `monthGrid` is always **35** days, never 42, so that is what is fetched (the
   adapter reads the grid's length, so a six-row grid would be followed, still inside the 45-day
   limit). Two defects of Josh's logged: the mock's window mismatch (`KNOWN_GAPS.md` N8N-3), and the
   35-day grid dropping a six-row month's last day — 31 Aug 2026, 30 Nov 2026, 31 May 2027 (N8N-4).
4. **Option C, the UI** (every edited file in `remap/CHANGESET.md`): one helper decides all-day
   (`lib/timeGrid.ts` `isAllDay`: local midnight to a later local midnight, which the adapter
   guarantees) and one decides the days an event covers (`eventsCovering`). A new
   `components/today/AllDayStrip.tsx` draws a day's all-day events above its hours; `CalendarGrid.tsx`
   keeps them out of the track, moves the hour gutter down by the strip, and puts month dots on every
   covered day; `CalendarList.tsx` prints "all day". Option D, `CalEvent.allDay`, is written up for
   Josh as a proposed contract addition (N8N-5).
5. **Tests**: `tests/fixtures/n8n/calendar.cases.json` (constructed, in the exact DASH shape: a
   one-day all-day event, a two-day one, one begun before the window, an overnight event, a free
   one, a busy one); Week and Month across month boundaries, one across New York's DST end;
   `tests/unit/allDay.test.ts` and `tests/native/calendarAllDay.test.tsx`. The expectations that
   changed on purpose (start → overlap; Week Monday-first; Month the grid) are marked in the tests.

Gates: `pnpm check`, `pnpm lint`, unused exports clean; `pnpm test` in both zones at the baseline
(the 16 suites; the one extra failure in the run, CM-04's "not prose" check reading a path in my
§4 row, was reworded and re-run green); builds pass; secret scan clean; mock re-packaged. Mock mode
is unchanged: no fixture event runs midnight to midnight.

### Checkpoint 3b — live, the browser's clock at Fri 2 Oct 10:00 Brisbane

Screenshots in `remap/screens/private/checkpoint-3b/` (gitignored, real data).

| View | Webhook window | All-day strip | Timed events |
|---|---|---|---|
| Today (Fri 2) | 1 Oct 14:00Z → 2 Oct 14:00Z | the two-day event, above the hours | the 16:00 event in its track |
| 3 days (Fri 2 – Sun 4) | → 4 Oct 14:00Z | Fri 2 and Sat 3 (both days of it) | Fri 2 |
| Week (Mon 28 – Sun 4) | 27 Sep 14:00Z → 4 Oct 14:00Z (Monday-first) | Fri 2 and Sat 3; the other columns keep the strip's height, hours level | Fri 2 |
| Month (October) | 27 Sep 14:00Z → 1 Nov 14:00Z (the grid's 35 days) | dots on every covered day, e.g. Sat 3 | — |
| Calendar card, 3 days | shared the grid's 3-day call | "all day" | "16:00" |

Console: 0 messages.

## Phase 4 — Tasks, live (30 Sep 2026)

`GET /tasks`, `GET /tasks/{id}`, `GET /tasks/waiting` and `GET /tasks/columns` answer from the
`tasks` webhook through `data/n8n/adapters/tasks.ts`: every page with Twenty's cursor (60 at a
time, ten pages at most, one warning if capped), each record guarded and mapped, then the mock's
list rules applied on the device — focus, slicer, view, the date range, filters, search
(`data/n8n/taskRules.ts`, copied from `data/mock/predicates.ts`). Every page call goes through
`callWebhook`'s 30-second sharing, so the four routes on a page load run the workflow once per
page. The registry now takes a second adapter form (`answer`, making its own calls) and derived
rows with an `answer`; reachability is still reported around every webhook call.

### The mapping, as built — each one line in the adapter

| Task field | From Twenty | Note |
|---|---|---|
| `status` | `DONE` → done; a non-empty `waitingOn` on a task not done → **waiting**; `TODO` → open; `IN_PROGRESS` → in_progress; anything else → open, one warning naming it | answer 2; `status` decides done-ness over `bucket` (answer 3) |
| `owner` | `josh`; `OWNER_BY_MEMBER` (empty) for when `assigneeId` is used | answer 4; `createdBy` is not read |
| `priority` | Twenty's `priority` SELECT **behind `EXPO_PUBLIC_TWENTY_PRIORITY_FIELD`**, off; off, `medium` is sent (the contract requires a value) and **nothing is printed** | answer 1, see below |
| `labels` / `focus` | Twenty's `area` SELECT **behind `EXPO_PUBLIC_TWENTY_AREA_FIELD`**, off; off, `personal:josh` / `personal` (the mock's focus for that silo) | answer 5 |
| `due` | **the local day of `dueAt`** (a day key) | a correction to the prompt's "ISO UTC": `Task.due` is a day key to every reader — `lib/taskMeta.ts`'s `formatDate`, the Gantt's `scheduleOnDay`, the filters' `dueBucket`. An instant there would print nonsense. The clock part (e.g. `12:00Z`) is dropped, which also retires Checkpoint 2's question 8 |
| `column` | `bucket-<bucket>`; a done task goes to the done column whatever its bucket | answer 3 |
| `waitingOn` | `{ who: waitingOn, what: title, days }` on a waiting task | `days` is required by the contract; it is **days since `createdAt`** — the earliest the wait can have begun, since Twenty holds no start. It can only overstate. See below |
| `links`, `twentyUrl` | `<TWENTY_APP_URL>/object/task/<id>` when set, else none | |
| `completedAt`, `completedBy` | unset | answer 6: optional in the contract, and Twenty holds none |
| `metaParts`, `subtasks`, `activity`, `setAt` | `{ source: "Twenty" }`, `[]`, `[]`, `updatedAt` | nothing composed that Twenty does not hold |
| order | Twenty's `position`, ascending | |

`GET /tasks/columns`: one column per `bucket` value, the done one last and statuses
`["done"]`, the others alphabetical with `["open","in_progress","waiting"]` — Twenty's own option
list and order are not in the webhook's reply. With no bucket on any task, the default five, so no
task falls off the Board.

**Priority, the one edit to Josh's code**: `lib/taskMeta.ts` prints "`<priority>` priority" only
where `TASK_PRIORITY_KNOWN` (`data/config.ts`): always on the mock and a real backend, on n8n
only with the priority switch on. No contract change. Its limit: once the switch is on, a task
whose `priority` is empty in Twenty still has to send a value and would print it — so the field
should be **required with a default** in Twenty, or `Task.priority` made optional (a contract
change, Josh's).

### Live, against the running proxy (Chromium, Brisbane, 30 Sep)

Screenshots in `remap/screens/private/checkpoint-4/` (gitignored — real task titles). The Twenty
connector is not authorised here, so "next to Twenty" is the webhook's own reply.

| | Twenty (the webhook) | The app |
|---|---|---|
| Tasks | 29: TODO 6, DONE 23; buckets INBOX 8, DONE 20, none 1 | header "6 open · 2 waiting" |
| List | the 6 open | 6 rows, 2 with a due date ("Wed 30 Sep", "Wed 7 Oct"), **no "medium priority" anywhere** |
| Waiting on | 2 with `waitingOn` | 2 rows, 4 and 6 days |
| Board | — | columns **Inbox** (6) and **Done** (8 of the 23 — see below) |
| Gantt | — | 2 bars (the dated ones), 4 unscheduled |
| Done | 23 | 23 rows |
| Webhook calls for the whole session | — | `tasks` once, `calendar` once |

Console: 0 messages.

### What does not match yet, or is worth a decision

1. **The Board's Done lane shows 8 of 23.** The mock's default range — the next 90 days — applies
   to the Board and the Gantt as well as the List, so a done (or overdue) task whose due date is
   past leaves them; Done itself defaults to all time. Mock-exact, as the spec; the "Next 90 days"
   chip says so. Same rule: **an overdue open task drops off the default List** — checked against
   the spec in Phase 5 (below): TF-01 specifies it, so it stays.
2. **Board columns' order**: Twenty's option order is not in the reply. Proposed DASH change —
   `JSTACK-DASH-tasks-read` answers `{ "op": "columns" }` with the `bucket` field's options
   from Twenty's metadata API, so the Board shows every stage, empty ones included, in Twenty's
   order and with Twenty's labels. Specified in `remap/WORKFLOWS-NEEDED.md` §2; not deployed.
3. **Waiting days** overstate when the wait began after the task was filed. The honest fixes are
   both Josh's: a `waitingSince` date on the Twenty task (set by the EA), or `days` made optional
   in the contract and hidden when absent (`components/tasks/WaitingOn.tsx` prints `{days} days`).
4. **Today's "Your tasks"** still reads the `/today` composite, which is Phase 5.
5. **Links to people/companies** (`taskTargets`) need Twenty's `depth=1` — a DASH change, not made.
   **Bodies** (`bodyV2`, on 11 tasks) have no field on `Task` and are not shown.
6. Data, not the app: Twenty holds several duplicate titles (e.g. four identical done tasks).

## Phase 5 — the Today composite, live (30 Sep 2026)

`GET /today` answers from `data/n8n/adapters/today.ts`, assembled as the mock's `getToday` builds
it from the two live sources:

| Part of the composite | On the n8n build |
|---|---|
| `calendar` | exactly `GET /calendar?view=today`'s answer for today — the same adapter and the same request body, so the Today grid and this share one webhook call (`callWebhook`'s 30-second sharing) |
| `tasks` | the first three tasks not done, in focus, in Twenty's order (the mock's rule; no range applies) |
| `needsYou`, `insight`, `since`, `endLine`, `glance`, `close` | the contract's empty value — no source yet (Needs-you is the `actions` store, Phase 6) |
| `delta` | **absent, even with `?since=`**: an empty delta is an answer — "Nothing changed while you were away" (`lib/deltaLine.ts`) — and nothing here knows what changed. A change to `empty.ts`, so every empty Today is the same |

If either source fails, the composite fails with its status (a 502, or the network's error for the
outbox and the sync dot): an empty half would read as "nothing on the calendar" or "nothing to do".

### Live, against a second dev proxy on 8788 (n8n build, Chromium in Brisbane, 30 Sep)

A proxy of its own so its log holds only these loads. Each load is a fresh browser context, so a
cold one: nothing cached, the passkey ceremony run, Today opened. Screenshots, `report.json` and the
proxy log are in `remap/screens/private/checkpoint-5/` (gitignored — real titles).

| Cold load | Proxy log, that load only | Composite |
|---|---|---|
| 1440 px | `tasks → 200 1182ms`, `calendar → 200 1616ms` | Wednesday 30 September; 0 events, one gap ("Free until 20:00"); 3 tasks, all open; no cards, no delta |
| 820 px | `tasks → 200 1115ms`, `calendar → 200 1470ms` | the same |
| 390 px | `tasks → 200 1267ms`, `calendar → 200 1636ms` | the same |

**Each workflow ran once per cold load.** Console: 0 messages on every load. The first attempt, on
`127.0.0.1`, never unlocked (a WebAuthn relying party cannot be an IP address; `localhost` works)
— and the proxy log shows that page still called `calendar` and `tasks` once each: the lock screen
is an overlay and the tabs beneath it load. On n8n nothing refuses those reads, so the site password
is the only gate; added to `KNOWN_GAPS.md` N8N-1.

### Overdue tasks — checked against the spec, no change

`02_ACCEPTANCE_TESTS_v22.md` TF-01: default "Next 90 days" on List, Board and Gantt, "a task outside
the range is absent from the open views", undated tasks always inside. `CONTRACT.md`: the default
resolves to `next` on List, Board and Gantt. So the n8n build follows it, and there is no ADR and no
mock defect. Shown with the browser's clock at Thu 1 Oct 10:00, the day after "Stretch" was due
(`checkpoint-5/overdue-list-default.png`, `overdue-list-all-time.png`):

| Range | List |
|---|---|
| Next 90 days (default) | 5 rows; Stretch absent |
| All time | 6 rows; Stretch first, "Wed 30 Sep" |

Two consequences, both the spec's and listed under **Open decisions for Josh**: the Due › Overdue
filter can only match under a range that reaches back (the default window starts today), and the
Tasks header's "5 open" is the default List's length (`stores/tasks.ts`), so it leaves the overdue
task out and is not recounted under All time. Today's "Your tasks" does show Stretch — no range
applies there.

### Gates

| Gate | Result |
|---|---|
| `sh remap/codemap.sh` | pass (384 source files mapped) |
| mock rebuild (`build:web:prod` + `tools/build-mock.mjs`), before the tests | pass |
| `pnpm check`, `pnpm lint` | pass |
| `pnpm test` (New York) | 16 failed suites, 80 failed tests — the baseline, no new failure; `n8nToday` 9/9. CM-02 passes until the commit, as before |
| `JSTACK_TZ=Australia/Brisbane pnpm test` | the same |
| `node tools/build-web.mjs` | pass (`224787a68bcd` over 375 files) |
| `tools/secret-scan.mjs` | clean |

### Seen, not ours

At 820 px the Calendar card's heading and its links overlap ("CALENDAR" / "today · 3 days ·
google"). The packaged mock does the same at that width, so it's the layout: `KNOWN_GAPS.md` N8N-9,
Josh's.

## Phase 5 follow-ups — a locked app gets nothing (30 Sep 2026)

**Decided (ADR-83):** on the n8n build, every call made while the session is locked waits for the
unlock; nothing reaches the proxy before it. The unlocking routes (`whileLocked` in
`data/routes.ts`: the nonce, the ceremony, recovery, the emergency lock) go through. Built in
`data/transport/n8n.ts` (a `Gate` beside `report`) and `data/provider.ts` (the session's
`locked`); `lib/lockGate.ts` and every UI file are untouched.

**Why it waits rather than answering 401**, which is what Josh's server answers (`CONTRACT.md`
§4). How the app treats a refused read, checked before building:

| | What happens |
|---|---|
| Boot | `lib/boot.ts` loads settings (focuses, layout, capabilities, sections), parameters and the rail's agents once, under the lock; the mounted tab loads on mount (`app/(tabs)/*.tsx`) |
| Unlock | only the outbox replay (`lib/syncInstall.ts`) and `GET /session` (`stores/session.ts`) run again |
| A 401 on a read | fails that call: `recordLoad` keeps the error and shows an offline copy if there is one (`lib/loadError.ts`); only `401 { reason: "reuse" }` relocks (`lib/authTokens.ts`); "any other 401 does not lock yet: that relock is REMAP's" (`lib/autoLock.ts`, WPF-13); `signedOut` comes only from a server event |

So refused, the focus chips would have stayed empty (`settings.focuses` `[]`), every settings save
would say "Settings haven't loaded", and Today would say it could not load until tapped. Waiting,
the loads the shell already made are the ones that go out. Josh's real server will need the
re-run-on-unlock (WPF-13); `KNOWN_GAPS.md` N8N-1 says so.

**Proved** — `tests/unit/n8nLocked.test.ts` (5), and live against a second proxy on 8788 (one cold
load, Chromium at 1440; `remap/screens/private/checkpoint-5b/`):

| | Proxy log | Browser requests to `/n8n/` | App |
|---|---|---|---|
| Locked, 10 s | none | none | settings not loaded, no Today |
| Unlocked | `tasks → 200 1111ms`, `calendar → 200 1448ms` | — | Josh signed in; settings loaded, focuses all/personal/family/work; Today 3 tasks, no load error |
| Then the Tasks tab | none (the list shares the unlock's call) | — | 6 rows, 2 waiting, no load error |

Console: 0 messages.

`tests/unit/n8nReachability.test.ts` drives the provider without passing the gate; its helper now
sets `locked: false` first, as `n8nConfig.test.ts`'s already did — the precondition made
explicit, not an expectation changed.

Also from Checkpoint 5: the overdue row is under **Open decisions for Josh** (Josh's spec, no change
from us), and N8N-9, the 820 px Calendar heading, is on the must-fix list, unchanged for now.

## Phase 6 · `actions` — Needs you, live (30 Sep 2026)

`GET /actions`, `GET /actions/{id}`, `POST /actions/{id}` and `POST /actions/{id}/undo` answer
from JSTACK-DASH-actions through `data/n8n/adapters/actions.ts` (ADR-84), and Today's Needs you is
`GET /actions`'s own answer. The app never writes a card; `op: "put"` is the EA's. No capability
gates Needs you (`Capabilities` has none for it), so there was no switch to flip: its buttons
answered `501` before and reach the store now. Still `501`, nothing sent: approving an email card
(until `gmail-draft`), reopening from the history (no op in the store), editing a draft
(`records`).

The table was empty before the test (no open cards, no history): the EA has written no card yet.

### Test cards — for REMAP to delete from the actions data table

| Card id | Created | Answered |
|---|---|---|
| `dashtest-p6-curl` | 30 Sep 06:15 UTC, `op: "put"` by curl | Never (06:15), undone, Never again (06:15) — answered |
| `dashtest-p6-ui` | 30 Sep 06:15 UTC, put again at 06:16 with its title's UTF-8 intact | Never in the app (06:22), undone, Never again (06:22) — answered |
| `dashtest-p6-undo12` | 30 Sep 07:48 UTC, `op: "put"` (the N8N-11 re-check) | Never (07:48); the undo 11.6 s later was refused — answered |
| `dashtest-p6-email-1` | 30 Sep 08:55 UTC, `op: "put"` by script (item 3, kind `quote`) | **Approve** in the app (08:56, the one approve item 3 authorised) — answered, Gmail draft made |
| `dashtest-p6-undo12b` | 30 Sep 09:02 UTC, `op: "put"` (the second N8N-11 re-check) | Never (09:02); the undo 11 s later was refused — answered |


`dashtest-p6-missing` was only ever ASKED for (the 404 and the 422) — there is no row. No other
card was touched: every call named a `dashtest-` id, and `never` is the only verb sent.
`dashtest-p6-curl`'s title shows "�" for its dash: the first put went through a Windows command
line.

### The store's replies (curl, through the 8787 proxy)

| Call | HTTP | Reply |
|---|---|---|
| `list` open / history | 200 | `{ items, totalOpen }` / `{ items }`, each item the card plus `state`, and once answered `answer` and `undoUntil` |
| `get`, `answer` (never), `undo` | 200 | `{ item }`; the answer also `undoUntil` |
| `answer` a second time | 409 | `CONFLICT` "card is already answered" |
| `undo` after 10 s | 409 | `UNDO_EXPIRED` |
| `undo` a card never answered | 409 | `CONFLICT` "nothing to undo" |
| `get` an unknown id | 404 | `NOT_FOUND` |
| `answer` with verb `bogus` | 400 | `VALIDATION_ERROR` → the app's `422` |

Saved as `jstack-app/tests/fixtures/n8n/actions.*.json` — REMAP's own test cards, nothing of
Josh's (the one "josh" in them is the silo `personal:josh`).

### Live in the app (n8n build, Chromium in Brisbane, a second proxy on 8788)

Screenshots, `report.json` and the proxy log in `remap/screens/private/checkpoint-6-actions/`.

| Step | Proxy log | Needs you |
|---|---|---|
| Cold load, 390 and 1440 | `tasks`, `actions`, `calendar` once each, per load | 1 — `dashtest-p6-ui`, drawn as the contract card it is |
| Never (⋯ › Never) | `actions` (the answer), `actions` (Today's reload) | 0; toast "Never · rule offered · DASH test card (UI) — REMAP, ignore", Undo 9 |
| Undo, inside the window | `actions` (undo), `actions` (reload) | 1 again |
| Never again, then 14 s | `actions`, `actions` | 0 |
| Decision history | `actions` (the history) | both test cards, "Test · never · via app" |

Console: 0 messages. The reload after each write went to the store (the write forgot its shared
reads); the calendar and the tasks came from the shared calls.

### What does not match yet

1. The store against the mock (`KNOWN_GAPS.md` N8N-10): the open cap before the focus, history
   answered-only and 100 at most, no `thenWhat` at expiry, no reopen — a DASH change is specified
   in `remap/WORKFLOWS-NEEDED.md` §2.
2. The undo window and the round trip (N8N-11): an Undo in the toast's last second can arrive
   after the store's ten seconds; the app then says nothing. Josh's call.
3. The toast's "rule offered" after Never is the mock's copy (`lib/decisionCopy.ts`); on n8n the
   offer is the EA's to make.
4. Test cards stay until deleted (N8N-12); the EA contract now says never to act on `dashtest-`.

## The hand test's crash — a refused write (30 Sep 2026)

**The bug:** a write the n8n build does not connect answers `501`, which is right, but the store
action rejected with nothing catching it: "Uncaught Error: contract error 501: not connected yet"
(a Board drag into Done: `moveTask` → `requestComplete` → `completeTask`; Dictate to EA:
`sendChat`). A real server's 5xx took the same path.

**The audit.** All 69 non-GET routes (`data/routes.ts`) traced to their store actions and from
there to every call. The ones that could reject into nothing — a `void action()` from a tap, or
an `await` in a handler with no `catch` — are the writes in `remap/CHANGESET.md`'s table, and so
could the reads a tab or dialog starts on its own (the calendar window, the history, the review,
schedules, layouts, devices, habits, projects, a task's usage and the boot settings load).
Already safe: the writes through `optimisticWrite` (task fields, subtasks, the Gantt), the life
editors, the parameter, the upload, marking a reply read, the section verbs
(`layout/SectionRenderer.tsx`), and the Emergency lock's own dialog.

**The fix** (`remap/CHANGESET.md` lists every file): the convention already in the app, applied
where it was missing — a tap's write says "Couldn't · <reason>" and changes nothing (what it had
moved goes back: the dragged card stays in its column, Dictate's line comes off the thread, the
journal and dump drafts come back); an editor's save answers `false` and its dialog stays open; a
read that fails keeps what is on screen. No UI changed shape; three helpers in `lib/optimistic.ts`.

**Proved:** `tests/unit/writeRefusals.test.ts` (26), with every write answering `501` and an
`unhandledRejection` listener on the file. With three of the fixes undone it fails 7 cases —
the two reported paths among them.

**The Emergency lock on n8n:** "Hold to lock" asks for a fresh passkey (the nonce is a local
default), then `POST /lock` answers `501`; its dialog says "Nothing was locked · the server said:
not connected yet" and the app stays as it was — unlocked and working. It cannot reach the
emergency-locked screen on n8n; if it ever did, Recover now says its refusal instead of sticking on
"recovering". `KNOWN_GAPS.md` N8N-1 corrected (it said "local only").

## N8N-11 — the undo window at 12 s (30 Sep 2026)

Decided: the actions store keeps an answer undoable for 12 s while the app shows 10 (ADR-85);
`remap/n8n/JSTACK-DASH-actions.json` now holds `UNDO_SECONDS = 12`. **The re-check did not see it
live**: a new test card (`dashtest-p6-undo12`) answered Never at 07:48:50 UTC came back with
`undoUntil` exactly 10 s after its answer, and the undo 11.6 s later was refused
(`UNDO_EXPIRED`). The deployed Decide node still answers 10 s — the change needs saving (and the
workflow re-activating) in n8n. Nothing in the app depends on it; re-checked before the final
report.

**Re-checked 30 Sep 09:02 UTC, after the re-export: still 10 s live.** A new card
(`dashtest-p6-undo12b`) answered Never came back with `at` 09:02:21.032Z and `undoUntil`
09:02:31.032Z — ten seconds — and the undo sent 11 s later was refused (`UNDO_EXPIRED`). The
export in `remap/n8n/JSTACK-DASH-actions.json` says `UNDO_SECONDS = 12`, so the running version is
not the exported one: the change is saved in the editor but not published (n8n runs the published
version). (This machine's clock is 8 s behind; the store stamps both ends with its own, so it does
not change the result.)

## Phase 6 · `calendar-edit` — nothing to wire yet (30 Sep 2026)

The app calls none of its routes: `GET`/`PATCH`/`DELETE /events/{id}` and `POST /calendar/propose`
have no caller in the app (the adapter, the mock and e2e only), and "Block it" is on an insight,
which has no source on n8n. It could not be wired anyway without changing the contract: an
`Insight` holds its text and `primary.action: "block"` but no block (title, start, end), while
the workflow's `block` needs all three (`KNOWN_GAPS.md` N8N-13). `capabilities.calendarWrite`
stays off, since Help would otherwise list "Writing back to your calendar". No test event was made:
nothing in the app would use it.

## Phase 6 · `tasks-write` — live (30 Sep 2026)

`PATCH /tasks/{id}`, `POST /tasks/{id}/complete`, `PUT /tasks/{id}` and `POST /tasks` answer from
JSTACK-DASH-tasks-write through `data/n8n/adapters/tasksWrite.ts` (ADR-86): the title, the status
and the due date; everything else Twenty's writer cannot hold is refused, naming the field. No
capability gates task writes. Still `501`: subtasks, delegate, accept, the EA report (no source
or no field), and the nudge (the `gmail-draft` key).

**The test task** — created by curl, the only Twenty record touched:

| Id | Title | State |
|---|---|---|
| `68367f7f-fca7-47e7-9994-030332b958ff` | "dashtest-p6 task (from the app) — REMAP, ignore" | **still in Twenty, DONE**: the writer's API key cannot delete (`PERMISSION_DENIED`) — delete it by hand, or give the key delete rights and REMAP will |

**The writer's replies** (curl, saved as `tests/fixtures/n8n/tasks-write.*`): create 200 with the
full record; the same create again 200 with `duplicate: true` and the same id (the `offlineId`
dedupe works); update 200; a status Twenty doesn't know 400 `VALIDATION_ERROR`; nothing to update
400; an unknown id 404; delete 400 `PERMISSION_DENIED` (mapped to 422 by the workflow). A new task
sorts first in Twenty (`position` -49), so until it was DONE it led Today's "Your tasks".

**Live in the app** (the test task only; `remap/screens/private/checkpoint-6-tasks-write/`):

| Step | Sent | Proxy | Then |
|---|---|---|---|
| Tick | `update { status: DONE }` | `tasks-write`, then `tasks` | gone from the List; "Completed · Undo" |
| Undo | `update { title, status: IN_PROGRESS, dueAt }` | `tasks-write`, `tasks` | back, in progress, Sun 4 Oct |
| Rename (card) | `update { title }` | `tasks-write`, `tasks` | renamed |
| Priority High | nothing | nothing | the control snaps back to Medium — **with no line** (N8N-15, the card has none for priority) |
| Board › move to Done | `update { status: DONE }` | `tasks-write`, `tasks` | in the Done lane |

A Board move between stages could not be tried live: Twenty's tasks have two buckets (Inbox,
Done) and the test task, having none, stands in Inbox; the unit test covers the refusal. Console:
0 messages.

## Phase 6 · `records` — live (30 Sep 2026)

Every settings route, the goals, the habits and their logs and stats, the sections' edits and an
email card's revised draft read and write JSTACK-DASH-records through
`data/n8n/adapters/records.ts` (ADR-87); Today's glance and close-the-day and `GET /life` are
built from the same records. Before this, the store held one key (`test:hello`, not ours) — Josh
has no records yet, so every key answers the default the build already had until he saves. No
capability gates any of it.

**The test records** — every one under `dashtest-p6/`, written with the build's test namespace
(`EXPO_PUBLIC_N8N_RECORDS_NAMESPACE=dashtest-p6`) or by curl; **delete every row whose key starts
with `dashtest-p6/`** from the records data table:

| Key | Versions | What |
|---|---|---|
| `dashtest-p6/settings:quietHours` | 2 | the curl samples (absent → put → stale 409 → put) |
| `dashtest-p6/habitlog:2026-09-30:dashtest-habit` | 1 | a curl sample |
| `dashtest-p6/habits` | 2 | one test habit, "DASH test habit — REMAP" (seeded by curl) |
| `dashtest-p6/goals` | 2 | one test goal, "DASH test goal — REMAP" (seeded by curl) |
| `dashtest-p6/habitlog:2026-09-30:dashtest-habit-1` | 2 | ticked, then unticked, in the app |
| `dashtest-p6/settings:voice` | 1 | the voice style set to Clear in the app |
| `dashtest-p6/layout:today` | 2 | saved reversed, then reverted |

**The store's replies** (`tests/fixtures/n8n/records.*`): an absent key `version: 0, value: null`; a
put appends `version + 1`; a put with a stale `expectedVersion` 409 `CONFLICT`; `history` newest
first; `list` the latest of each key with `truncated`; a bad key 400 `VALIDATION_ERROR` (the app's 422).

**Live in the app** (the test namespace; `remap/screens/private/checkpoint-6-records/`):

| Step | Records calls | Then |
|---|---|---|
| Cold load at 1440 | 12 reads, one per key (goals, habits, today's logs, seven settings, a layout, the sections' overrides) beside `tasks`, `calendar`, `actions` | the glance counts the test habit and the test goal (behind) |
| Tick the habit's chip on Today | the day's key read, then put | logged |
| Life | the goals, habits, the week's stats | the test goal and habit, the week's strip |
| Settings › Voice › style Clear | read, put | saved |
| A fresh context at 390 | — | the voice style reads back Clear |
| A layout reversed, then reverted (through the adapter) | read, put, read, put | Josh's, then the tab's own order |

Console: 0 messages. Found and fixed on the way: the glance counted a log of a habit no longer
tracked ("2/1"); it counts the tracked ones now.

## Phase 6 · `people` — not wired (30 Sep 2026)

JSTACK-DASH-people-read answers Twenty's contacts: 1,230, paged 60 at a time, each with a name and
some of emails (41 of the first 60), phones (39), a job title (24) and a company (41) — and every
"last contact" field empty. Life › People is a short list of people to act on (`item`, `meta`, a
verb). Mapping the contacts would invent every item and verb, so `GET /people` stays empty and the
person verbs `501`: **Josh decides** which contacts belong there and where their item and verb come
from (`KNOWN_GAPS.md` N8N-17; CLAUDE.md §7 names this very case as his).

## Phase 6 · `gmail-draft` — live, behind Approve on an email card (30 Sep 2026)

Approve on a `quote` card answers it, then JSTACK-DASH-gmail-draft makes its `quote` a Gmail
DRAFT to the card's `draft.to` — never sent; the answer is `outbox_user_sends` (ADR-88). A card
naming nobody is `422` before anything is sent; a draft Gmail refuses is undone in the store. Not
wired: the nudge (a waiting task's `waitingOn` is a name, and the app would be writing in Josh's
name) and a person's draft (no people).

**The test draft — in Josh's Gmail Drafts, to delete by hand** (the workflow cannot delete, N8N-19):

| Draft id | Subject | To |
|---|---|---|
| `r-3443898180391257001` | "DASH test draft — REMAP, delete me" | `dashtest@example.com` (a draft; never sent) |

Replies (`tests/fixtures/n8n/gmail-draft.*`): 200 `{ status: outbox_user_sends, draftId, messageId,
threadId, gmailUrl }`; an invalid address 400 `VALIDATION_ERROR`. **Approve end to end was not run
live**: the only cards are REMAP's `dashtest-` ones and they are answered Never only (your rule).
It is proved by `tests/unit/n8nActions.test.ts` against the real replies of both workflows; say if
you want it run live on a `dashtest-` email card (one more draft to delete).

## Phase 6 · `files` — live, read only (30 Sep 2026)

`GET /files`, `/files/{id}` and `/tasks/{id}/files` read JSTACK-DASH-files-list (ADR-89). /JSTACK
does not exist in Josh's Dropbox yet (`root_missing: true`), so every list is empty — honestly.
`capabilities.fileStore` stays off: nothing serves a file's bytes, a file opens as its Dropbox link.

## Phase 6 · `memory` — not wired (30 Sep 2026)

`remap/WEBHOOKS.md` §A: memory-search returns Josh's private memory, sensitive types included
with a blank filter — "don't expose it until access control is stronger than one site password".
It still is one site password, so Brain › Find and Find stay empty (N8N-18). **Josh (or you) to
decide**: wait, or wire it with the sensitive types always excluded and his own silos only.

## Phase 6 · capabilities

None of the writes wired in Phase 6 has a capability flag (`Capabilities` has none for Needs you,
tasks, the settings or Life), so none was flipped. `calendarWrite` (Help: "Writing back to your
calendar") and `fileStore` ("Opening a picked file attachment") stay off: neither is true.

## N8N-2 — no section claims health it has no source for (30 Sep 2026)

Option (b), ADR-90. On n8n the Agents summary, spend, issues, feed and security checks and Brain's
memory proposals and hit rate answer `501`; the Agents and Brain stores record that per section
(`lib/loadError.ts` `orNotConnected`), so one missing source no longer replaces the whole tab — and
each of those sections shows "Not connected yet" (`components/chrome/NotConnected.tsx`):

| Before | Now |
|---|---|
| rail: "all healthy · $0.00" | nothing (the line draws nothing without a summary) |
| Agents › Runs and spend: 0 runs, 100%, $0.00, 0 issues | "Not connected yet" |
| Agents › Agent issues: "Nothing failing. Every check ran when it should." | "Not connected yet" |
| Agents › feed, Security checks: empty lists | "Not connected yet" |
| Brain › Memory: "All caught up. The Librarian runs again at 2:00." · "0 of 0 test questions right" | "Not connected yet" |

Proved: `tests/native/notConnected.test.tsx` (rendered: the line, none of the claims, the rail empty,
and a connected empty section keeping its own words) and `tests/unit/n8nConfig.test.ts` (through the
n8n provider: the flags set, the tab's `loadError` null, Portals loaded).

## The `brain` key — live (30 Sep 2026)

JSTACK-DASH-brain (added by you: the workflow, the proxy key, the WEBHOOKS row, the import guide's
table) serves Brain and Today's "From your EA" through `data/n8n/adapters/brain.ts` (ADR-91): a
capture, a journal line (Close the day) and a Dictate line go in by Josh; Latest in, the thread, the
EA's replies and Today's insight come back; "Block it" makes the event through calendar-edit and
answers the insight, "Leave it" answers it, Dismiss is the reply dismissed. `capabilities.calendarWrite`
is on now ("Block it" writes). Your `WORKFLOWS-NEEDED.md` edit had been made on an older copy; its two
additions (the 2.11 brain row and "Brain store, the EA's side") are merged onto the committed version,
which keeps REMAP's specs.

**Live, on REMAP's test items only** (the 8788 proxy restarted to take the new key; screenshots in
`remap/screens/private/checkpoint-6-brain/`): Today showed the newer test insight and the test reply;
Block it → `calendar-edit block` then the insight answered; Leave it on the other → answered, nothing
made; Dismiss → the reply dismissed; a journal line and a capture → Latest in, "→ filing · Librarian",
"personal · unlabelled"; a Dictate line → in the thread (read back on reopening). Console: 0.

**Test data — the brain data table** (delete these rows):

| Id | Kind, by | State now |
|---|---|---|
| `dashtest-p6-insight-1` | insight, ea | answered (leave) |
| `dashtest-p6-insight-2` | insight, ea | answered (block) |
| `dashtest-p6-reply-1` | reply, ea | dismissed |
| `b-munvbtr7-jnknz8un` | journal, josh ("dashtest journal line — REMAP, ignore") | filed `{ test: true }` |
| `b-munvbygm-ld1s21ef` | capture, josh ("dashtest capture — REMAP, ignore") | filed `{ test: true }` |
| `b-munvc8ih-4idfboaa` | chat, josh ("dashtest chat line — REMAP, ignore") | filed `{ test: true }` |

The three `b-` ids are the store's own (the app sends no `offlineId` for a typed capture), so the
EA's "ignore `dashtest-`" rule does not name them — being `filed`, they are never in its inbox. **The
calendar event** "Block it" made (`p7jhviuch2b3fth4707at4dfi0`, "DASH test block 2 — REMAP, delete")
is deleted (calendar-edit `delete`, answered `deleted: true`).

## Talk with EA and the floating mic — "not yet" (30 Sep 2026)

ADR-92. Talk with EA already says so on its own screen, from `capabilities.liveVoice` (off): "Two-way
voice conversation isn't available in this build yet — dictate into Brain or use Chat instead." The
floating mic now shows "Coming soon" on a press (checked live with a real mouse press). One edit,
`components/chrome/Orb.tsx`; the mock and its orb tests unchanged.

## Approving an email card, end to end — live (30 Sep 2026)

One `dashtest-` card of kind `quote` (`dashtest-p6-email-1`, put by curl as the EA would, `draft.to`
`test@example.com`), approved in the app: the actions store answered it (`outbox_user_sends`), then
JSTACK-DASH-gmail-draft made the draft (`r818215861100218682`, never sent); the app showed the card's
own toast, "Approved · in Gmail Drafts · you send it", and the card left Needs you. The undo window
passed untouched. Screenshots in `remap/screens/private/checkpoint-6-email/`.

**Gmail drafts to delete** (Josh's Drafts; the workflow cannot delete, N8N-19):

| Subject | To | Draft id |
|---|---|---|
| "[DASHTEST] Approve-path test — REMAP, delete me" | `test@example.com` | `r818215861100218682` |
| "DASH test draft — REMAP, delete me" | `dashtest@example.com` | `r-3443898180391257001` |

And `dashtest-p6-email-1` joins the actions table's test cards (answered approve — the EA ignores
`dashtest-` ids).
