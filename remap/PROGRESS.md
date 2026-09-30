# Progress — REMAP n8n wiring

_(the coding agent fills this in from Phase 0)_

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
