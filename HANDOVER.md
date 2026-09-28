# HANDOVER.md — JSTACK V2.3.2, the one document

JSTACK is a finished client with an in-process mock of its backend. Your job is the server behind it. This is the only handover document — everything else in the repo is a reference file, listed once in §9, with more context in §10's appendix.

**v2.3.3** (16 September) is v2.3.2 plus the same day's review: the floating push-to-talk orb, the dictation orb, the keyboard and the zoom, the needs-you schedule, this handover's stages and appendix. Take tag `v2.3.3`.

**Read this first, check these:**

1. Clone the repo and run the ten commands in §4, step 1. The app opens on a lock screen.
2. Open `jstack-mock-v15.html` from disk. It signs you in without a passkey and shows real fixture data.
3. Run `pnpm serve:mock` in one terminal and `pnpm connect:check <the JSTACK_MOCK_BASE it prints>` in another. It prints `CONNECT OK`.
4. Read §3 — the plan by stage.
5. Read §2 — the security checklist you must pass before go-live.

## 1. Questions for you, and decisions you must make

| # | Question or decision | Why it matters | Where the detail is |
|---|---|---|---|
| 1 | Hosting — Cloudflare or Vercel; Josh has no preference | Where the server runs | §2, `DEPLOY.md` |
| 2 | The native dictation approach — on-device or cloud, weighed for accuracy, languages, offline behaviour and privacy | Today's build assumes on-device (`expo-speech-recognition`); confirm before committing past the phone check | `KNOWN_GAPS.md` §3, `DEVICE_RUNBOOK.md` §3 |
| 3 | The unreachable-lock threat model — does "lock locally, wipe nothing" hold across a network cut, a stolen unlocked device taken offline, and a server-refused lock? | Security-critical; Josh asked REMAP to check the logic, not just the code | `SECURITY.md`, `KNOWN_GAPS.md` §3 |
| 4 | Prompt injection on shared content — a dedicated screening agent, an n8n ingestion workflow, or a backend rule set | Anything scraped from a shared link is a potential attack surface on the EA | §2, `CONTRACT.md` §8 Q24 |
| 5 | The two phone checks — secure storage on the development build (`crypto.getRandomValues`), and the iOS microphone-permission prompt's interaction with the auto-lock | REMAP's to verify on a real device, not Josh's | `NATIVE_RUNBOOK.md`, `DEVICE_RUNBOOK.md` §3 |
| 6 | The streaming voice provider, and Web Push vs APNs-only | Needed before Voice and push notifications go live | `KNOWN_GAPS.md` §4 Q4–Q6 |
| 7 | The Google Calendar account — one calendar for V2; a second and a combined view are V3 | Confirms the scope of §6's calendar row | `KNOWN_GAPS.md` §3, Q1 |

Every other open question REMAP must answer — rate limits, session lifetime, the audit log, the recovery-key ceremony's owner, and the rest — is `KNOWN_GAPS.md` §3 and §4 in full.

## 2. Session security and the checks REMAP must pass

Review the whole security design before you rely on any of it. The app implements the client side of these rules and the mock stands in for the server; nothing here proves a server is secure. Treat the checklist as your review scope, not as done work.

| Check | What to verify |
|---|---|
| Passkeys and sessions | Registration and assertion server-side; refresh-token reuse detection |
| The emergency lock | Passes §6's wipe rule |
| The four banned verbs | No `send`/`pay`/`book`/`revoke` verb in any agent grant, absent from every handler (device revocation excepted, SEC-15) |
| Secrets | Every secret brokered from the vault; no agent holds one |
| Pinning | Certificate pinning with a real verifier ready (SEC-08) |
| Audit log | High-risk actions (caps, revoke, lock, recover) logged with actor, device, nonce |

Hosting, the prompt-injection screening design, the unreachable-lock threat model and the two phone checks are open questions, not settled — §1 has them, with why each matters and where the detail is.

Source: `SECURITY.md`, `CONTRACT.md` §1, §8 Q8–Q14.

## 3. The plan by stage — V1 to V5 (stage 2 is now)

Josh's own stage definitions, tidied only:

| Stage | What it is | Status | The app's part |
|---|---|---|---|
| V1 | The AWS environment, security, OpenClaw, memory, Telegram (the MVP), Infisical, the input sources connected | The platform stage REMAP owns. The V1.2 Postgres starter is retired; the Telegram bot's history sits in `history/v1/` | None — the app assumes V1's memory, vault and agent runtime exist behind the contract |
| V2 | The JStack app UI (built; includes features the backend will support, but not all of them yet), Twenty CRM, n8n, and anything else the UI needs | The app is built and audited; the backend plugs in — this handover | Everything in §4–§6, and the security checklist in §2 |
| V3 | Multi-agent: the environment and orchestration for Josh to spin up other agents himself, with no developer hand-holding. First the librarian (memory curation, fed by Teach) and security; more agents follow | Next, once V2's backend is live | Teach on every card, the agents tab's roster and spend, the second calendar and combined view, true background sync — from `KNOWN_GAPS.md` §2 "Deferred to V3" |
| V4 | Cost optimisation: model routing, local compute as an option (batch processing on Josh's home RTX 4090 PC when it is on, otherwise cloud token optimisation) | After V3 | The usage and spend surfaces already in the app; a routing indicator if V4 adds one; nothing else changes in the app |
| V5 | Review and refinement of the whole stack; evaluate candidates for the next major features | Ongoing — no fixed trigger | The v2.3 code review's structural findings from `KNOWN_GAPS.md` (one write-error convention across every store, the server-event source moving off the in-process mock, one dialog slot serving two independent views, the token-refresh and relock gap, the conformance runner's own limits, notifications and push at scale); money and health, per Josh's 15 Sep note |

**Stage 2 (now, REMAP's).** Build the backend §6 specifies, in the order §4 walks; the build itself is §5. Pass every check in §2 before go-live.

**What works at the end of each stage:**

| Stage | What works |
|---|---|
| V1 | The platform exists: AWS, security, OpenClaw, memory, Telegram MVP, Infisical, the input sources connected |
| V2 | The app runs on Josh's real data — Twenty, Google, Dropbox, a voice provider, TestFlight |
| V3 | Josh spins up agents himself — librarian and security first, no developer hand-holding |
| V4 | The same runs, cheaper — model routing, local compute on the RTX 4090 when it is on |
| V5 | The stack reviewed and refined; new major features evaluated |

Source: `KNOWN_GAPS.md` §2, §1 "From the v2.3 code review and QA", `DECISIONS.md` ADR-71, ADR-72.

## 4. Run it

Prerequisites (`CONTRIBUTING.md` has the full inventory): Node 20 or later, pnpm 10.33.2, Git. On Windows use Git Bash — the hooks and commands below are POSIX shell.

| Step | Who · what | Command or file | The check that proves it |
|---|---|---|---|
| 1. Clone and run on the mock | You, from `jstack-app/` | `pnpm install && pnpm check && pnpm lint && pnpm test && JSTACK_TZ=Australia/Brisbane pnpm test && node tools/build-web.mjs && pnpm test tests/unit/conformance.test.ts && pnpm serve:web` | App opens on the lock screen at `http://localhost:4173`; both Jest zones and the conformance test pass |
| 2. Point the app at your server | You, environment | `EXPO_PUBLIC_API_BASE_URL=https://<host>/api/v1` at build time (`jstack-app/data/config.ts`, `jstack-app/data/provider.ts`); auth in `AUTH.getToken()`; CSP in `jstack-app/public/_headers` and `vercel.json`; `EXPO_PUBLIC_API_TIMEOUT_MS` for timeouts | `pnpm connect:check <base URL>` prints `CONNECT OK` |
| 3. Stand up identity first | REMAP | Passkey registration/assertion, sessions, refresh tokens (§4.1) | `connect:check` green for the session family |
| 4. Each record family, in order | REMAP | Today → Decisions → Calendar → Tasks → Brain → Share-in → Life → Sections → Usage/files → Search → Sync (§6) | `connect:check` green per family, one deliberately broken response per family to prove the check is real |
| 5. Voice | REMAP | `WS /voice`, the chosen speech provider | Talk works against staging |
| 6. Agents and notifications | REMAP | Runs, spend, caps, issues, notification groups, and quiet hours with the Needs you schedule they carry (`needsYou`, `PUT /settings/quiet-hours`) | `connect:check` green |
| 7. Security checks | REMAP | Every row of §2's checklist | All pass, evidence attached |
| 8. Release build | Josh | `NATIVE_RUNBOOK.md`: `npx expo prebuild`, Xcode, his Apple developer account | TestFlight build installed |

Three traps: `pnpm test:e2e` is the only command that writes `jstack-app/evidence/e2e-summary.json`; it serves a prebuilt export, so run `node tools/build-web.mjs` first. Give the board the machine — a second heavy job beside it produces timeouts that look like defects. `pnpm serve:mock` runs the mock over real HTTP for `connect:check`; wait for `JSTACK_MOCK_BASE=…`, not the earlier Jest banner.

### "Send to JSTACK" — the iOS Shortcut (W-1, UP-07)

The iOS share sheet's icon row is for native apps with a share extension; a web app sits in the actions list below it, as a Shortcut. One Shortcut, installed once, carries text, links and images into JSTACK until the native extension exists (`CONTRACT.md` Q22). Build it in the Shortcuts app:

1. **New Shortcut**, named `Send to JSTACK`; in its details turn on **Show in Share Sheet**, with the types **Text**, **URLs** and **Images** only.
2. Add **If** `Shortcut Input` **has any value**; inside it, **Get Type of** `Shortcut Input`, then **If** the type **is** `Image`: **Save File** to `/JSTACK/Inbox/` with **Ask Where to Save** off. The backend watches that folder and ingests the file as a capture (§4.23).
3. **Otherwise** (text or a URL): a **Text** action containing `https://<your JSTACK host>/capture#text=[Shortcut Input]&url=[Shortcut Input]&title=[Name]`, **URL Encode** the inserted values, then **Open URLs**.
4. Share anything, scroll to the actions list, choose **Send to JSTACK**.

**Why the fragment.** Everything after `#` never reaches a server, a proxy log, the Shortcut's run history or a `Referer` — a query string reaches all four. The values land in Brain's capture field, go through the same validation as typed text, and the lock gate still applies. Android and desktop need no Shortcut: the PWA's `share_target` posts the title, text and link to the same `/capture` route (no files — those come through the attach control or the Dropbox inbox).

The routes the recipe depends on, asserted by `jstack-app/tests/unit/share.test.ts`:

| Step | Route |
|---|---|
| 3 · text and links | `/capture` (an app route; the fragment carries the values) |
| 2 · images | the Dropbox inbox, ingested as a capture — `POST /__test__/inbox` simulates it in the mock |
| both | `POST /brain/dump` with `source: "share"` |
| the triage card's teach | `PUT /settings/autonomy/rules` |

## 5. The build — architecture and what changed since ADBP v0.5

Five tabs plus Settings, one React Native codebase built with the open-source Expo SDK modules (no Expo account or service), shipped as a web PWA and built for iPhone. One adapter (`jstack-app/data/ApiAdapter.ts`) talks to one route table (`jstack-app/data/routes.ts`), which generates the mock's router, `openapi.yaml` and the backend markers — a route added once is added everywhere.

**What changed since the ADBP v0.5 brief** (`history/v1/JSTACK_ADBP_v0.5.docx`, the infra brief this app was built from):

| Domain | What changed | Where |
|---|---|---|
| Today | Sketch only → full composite: needs-you cards, calendar, top tasks, close-of-day habits/journal | `CONTRACT.md` §4.2, §4.3 |
| Tasks | "One Task object" → kanban/list/Gantt/done views, subtasks, delegation, usage-per-task | §4.5, §4.15 |
| Brain | Not a tab in ADBP → capture, triage routing, Find, chat, memory proposals | §4.6, §4.18, §4.19 |
| Life | Loosely scoped → configurable EA-proposed sections, learning, gated health | §4.7, §4.10 |
| Agents | CEO agent + sub-agents (V3 in ADBP) → summary/spend/caps/issues surfaced now; multi-agent roster still V3 | §4.8 |
| Settings | One line in ADBP → parameters, autonomy rules, notifications, quiet hours, voice, focuses, layouts | §4.9, §4.14, §4.22 |
| Security | Backend-only in ADBP → native app security layered on top: emergency lock, recovery, WebAuthn, device revoke, pinning | `SECURITY.md` |
| Native | Not in ADBP (assumed web) → Expo/React Native app: offline outbox, push, native share, biometric gate | `NATIVE_RUNBOOK.md`, `DEVICE_RUNBOOK.md` |
| Backend infra | Twenty, Google, Dropbox, LiteLLM, OpenClaw | Unchanged from ADBP — now formalized as `CONTRACT.md` §2's systems-of-record table |

The full domain-by-domain architecture is `jstack-app/CODEMAP.md` §1; the structural decisions and what was rejected are `DECISIONS.md`.

**Proven, not claimed** — one evidence path per check:

| Check | Evidence |
|---|---|
| The app builds | `pnpm build:web` and `pnpm build:web:prod` from `jstack-app/` (the CI workflows are kept but disabled; run the gates locally) |
| Types and lint | `pnpm check` and `pnpm lint` from `jstack-app/` |
| Unit and native tests, two time zones | `jstack-app/evidence/jest-summary.json` |
| The e2e board | `jstack-app/evidence/e2e-summary.json` |
| The conformance runner, over HTTP | `jstack-app/tests/unit/conformance.test.ts` |
| A server checked in one command | `jstack-app/tests/unit/serveMock.test.ts` |
| Every acceptance ID has a status and a file that proves it | `QA_REPORT_v22.md` |
| The independent audit | `AUDIT_v22.md`, `AUDIT_v23.md` |
| Secrets and logs | `jstack-app/tools/secret-scan.mjs`, `jstack-app/tools/log-scan.mjs` |
| Dependencies | `jstack-app/audit-allowlist.json` |
| Size guards | `jstack-app/tests/unit/sizes.test.ts` |
| The maps regenerate identically | `jstack-app/CODEMAP.md` |
| Every route has a caller, or is named | `jstack-app/evidence/wiring-orphans.json` |
| The guards go red when their subject breaks | `jstack-app/evidence/mutation-pass.json` |
| The documents suffice — a fresh instance ran the app from this file alone | `jstack-app/evidence/` (`cold-start-<date>.md`) |
| The consolidated set exists and is consistent | `jstack-app/tests/unit/consolidation.test.ts` |
| What is not done, and whose it is | `KNOWN_GAPS.md` |

## 6. What the backend must provide, and offline capture

There is no backend today — everything runs on the mock. `jstack-app/evidence/todo-backend-grep.txt` lists the 142 `TODO(BACKEND)` markers where a server must answer, named by their `CONTRACT.md` section; the 142 markers are your task list, one per place the mock stands in for you.

One system of record per noun (`CONTRACT.md` §2 is authoritative). REMAP fixes every wire shape below to `jstack-app/data/types.ts`; REMAP designs the storage freely unless a column says otherwise.

| Record family | Wire shape (`data/types.ts`) | Key fields | Relations | Append-only or mutable | Routes | Storage |
|---|---|---|---|---|---|---|
| users, devices, sessions | `SessionUser`, `Device`, `Session` | id, name; device id, lastSeen; session/lock state | session → user, device | Mutable | `GET /session`, `POST /auth/*`, `POST /devices/{id}/revoke` | Vault + session store, REMAP's |
| refresh tokens | `AuthToken` | token id, device, reuse flag | → device | Append (rotate, flag reuse) | `POST /auth/refresh` | REMAP's — no store-level shape beyond `AuthToken` |
| tasks, subtasks, columns | `Task`, `Subtask`, `Column` | id, title, owner, due, status, column, goalId | subtask → task; task → column, goal | Mutable | `GET/POST/PATCH /tasks*` | **Twenty is the record**; REMAP proxies it |
| calendar_events | `CalEvent` | id, title, startsAt, endsAt, source | — | Mutable, write-back | `GET/PATCH/DELETE /events`, `POST /calendar/propose` | **Google Calendar is the record** |
| files/attachments | `Attachment` | id, name, kind, dropboxUrl, folder | → task, subtask, brain item, capture | Mutable metadata | `GET/POST /files` | **Dropbox is the record**; Postgres is the index |
| brain_items, replies | `BrainItem`, `Reply` | id, text, routing, versions[] | reply → brain item | versions append-only | `POST /brain/dump`, `PUT /brain/items/{id}` | REMAP memory layer |
| memory_proposals, memory_history | `MemoryProposal`, `MemoryHistoryEntry` | id, text, decision | — | history append-only | `GET/POST /memory/proposals`, `GET /memory/history` | REMAP memory, versioned vault files |
| goals, habits | `Goal`, `Habit`, `HabitLog` | id, status, history[]; habit id + log date | log → habit; goal → tasks | history append-only, habit logs never deleted | `PUT /goals`, `PUT /habits`, `POST /habits/{id}/log` | REMAP config store |
| agent_runs, usage, spend | `AgentRun`, `Usage`, `Spend` | id, agent, cost, tokens | → agent, task | Append-only | `GET /agents/runs`, `GET /usage` | **LiteLLM ledger / OpenClaw log is the record** |
| autonomy_rules, parameters, notification_groups, quiet_hours, layouts, focuses | `AutonomyRule`, `Parameter`, `NotificationGroup`, `QuietHours` (its `needsYou` field is when Today raises Needs you), `Layout`, `Focus` | id, scope/key, value | — | Mutable, versioned | `PUT /settings/*` (`needsYou` saves with `PUT /settings/quiet-hours`), `PUT /layout/*`, `PUT /focuses` | REMAP config store |
| outbox dedup ledger | `OutboxEntry` (client side) | offlineId | → whichever record the replayed write creates | Append-only, never re-applied | every `offline: true` route | Entirely REMAP's — behavior only, no server-side wire shape |
| search index | `SearchResult` | derived, not primary | spans every record family, by reference | Rebuilt from source | `GET /search` | Entirely REMAP's (Postgres full-text, or the memory layer) |
| agent_issues, security_checks | `AgentIssue`, `SecurityCheck` | id, status, checkId | issue → check | Mutable | `GET /agents/issues`, `GET /security/checks` | REMAP's watchdog store |

Three rules that shape every table above:
- **Triage is a backend duty.** The default agent decides task-or-not, labels sensitivity, and chooses storage (Twenty, journal, memory, Dropbox), returning `routing { kind, silos, labels, sensitivity, storage }` (`CONTRACT.md` §4.6, §4.18).
- **Append, never overwrite.** Memory, rules, layouts, goals and habit logs are versioned or archived — a superseded value is kept, never deleted.
- **The wipe rule.** `POST /lock` revokes sessions, freezes the vault, pauses agents — it never touches a record, only agents/interfaces/caches. Unreachable, the device locks locally and wipes nothing until the server confirms.

A capture made offline queues and replays on reconnect — nothing is lost to a dropped connection.

## 7. Carried and not received

**You do not receive:** a backend (the V1.2 Postgres starter is retired at tag `v1.2`), a host, or a streaming voice provider. Josh builds and submits the iPhone app himself (`NATIVE_RUNBOOK.md`).

| Gap | Detail |
|---|---|
| Time zone | Device-set only; a user-chosen override is not asked for, or V3 by decision |
| Identity | The passkey binds a device to a session, not a person to an identity; a real second user and family tenant is REMAP's, V3 |

The full list, one line each with whose it is, is `KNOWN_GAPS.md`.

**Native crypto — what to add (the phone check's fix, if it fails):** nothing in the tree provides `crypto.getRandomValues` on Hermes, and the native key mint and every seal in `jstack-app/lib/encryptedStore.ts` call it; until something does, boot's probe keeps such a phone working — captures go live and are held in memory, and Settings › Sync says "Secure storage is unavailable on this device". Either `expo-crypto` (an Expo SDK 54 module), calling its `getRandomValues` explicitly in `jstack-app/lib/encryptedStore.ts` with no global polyfill, or `react-native-get-random-values` imported first in the app's entry, before anything that seals. The boot guard stays whichever lands: a device is the only proof. `NATIVE_RUNBOOK.md`'s first check on a development build is the test.

## 8. Agent prompts

Three prompts to paste into a coding agent, in order — environment first, then the backend scaffold, then the security check. Fill in every `<YOUR_…>` value; everything else names a real file here.

**1. Environment and connection**
```
Read jstack-app/data/config.ts and §4 above. Produce the .env the app needs
to talk to our server at <YOUR_BASE_URL>: every EXPO_PUBLIC_* variable with
its meaning and default, the credentials mode, the two timeouts, pinning off
until we have a certificate. Then run
pnpm connect:check <YOUR_BASE_URL>
and explain each line of its report.
```

**2. Backend scaffold from the contract**
```
Read jstack-app/openapi.yaml, CONTRACT.md and CONTRACT_MAP.md. For our stack
<YOUR_STACK> and database <YOUR_DB>, produce the tables in §6 above for
family <YOUR_FAMILY>, the route handlers for it, and

  node tools/conformance.mjs <YOUR_BASE_URL>

green for that family, with one response deliberately broken to prove the
check is real. Follow §6's three rules (triage, append-only, the wipe rule)
and CONTRACT.md §1's rule 1 (no send/pay/book/revoke verb) as constraints.
```

**3. Security checks before go-live**
```
Read §2 above and SECURITY.md. Verify on our server every row of §2's
checklist. Report each as pass/fail with the request and response.
```

## 9. Reference files

| File | What it is |
|---|---|
| `CONTRACT.md`, `jstack-app/openapi.yaml` | The wire, in prose and machine-readable |
| `CONTRACT_MAP.md`, `jstack-app/WIRING.md` | Route → system of record → store → screen |
| `DECISIONS.md` | Every architecture decision, ADR-01..75 |
| `KNOWN_GAPS.md` | Every open gap, one line each, with whose it is |
| `jstack-app/CODEMAP.md` | The living map of the code |
| `QA_REPORT_v22.md`, `AUDIT_v22.md`, `AUDIT_v23.md` | Every acceptance ID with its proof; the independent audits |
| `DEVICE_RUNBOOK.md` | The check on a phone, in Safari itself |
| `NATIVE_RUNBOOK.md` | Josh's own build and submit: prerequisites, the development build, TestFlight |
| `SECURITY.md` | The full threat model |
| `DEPLOY.md`, `CONTRIBUTING.md` | Hosting; prerequisites, environment inventory, gates |
| `BACKEND_HANDSHAKE.md` | The form you fill in and hand back — current against `data/routes.ts`, checked this round |
| `jstack-mock-v15.html` | The built app on fixture data, in one file |
| `jstack-app/evidence/` | Board summaries, mutation pass, backend markers, wiring orphans |
| `jstack-app/design/` | The vendored design pack |
| `V23_REQUIREMENTS.md` | Josh's requirements and working rules, as this build read them |
| `history/` | Every earlier version's own documents, nothing deleted (`history/README.md`) |
| `history/v1/JSTACK_ADBP_v0.5.docx` | The original infra brief this app was built from |
| `diagrams/1-architecture-seams.html` | "JStack system overview: the app, the backend REMAP builds, and the security boundary" |
| `diagrams/2-offline-capture.html` | "Offline capture: what happens to a note when there is no network" |
| `diagrams/3-lock-states.html` | "Session security: what locks, what is wiped, and who confirms it" |
| `diagrams/4-stage2-plugin.html` | "Stage 2 delivery plan: who does what, in what order, and the gates" |
| `02_ACCEPTANCE_TESTS_v2.md`, `02_ACCEPTANCE_TESTS_v21.md`, `02_ACCEPTANCE_TESTS_v22.md` | The acceptance list, mock and server |

## 10. Appendix — more context, so Josh does not repeat himself

| File | What it is |
|---|---|
| `appendix/USER_STORIES_DRAFT.md` | Claude-defined user stories (draft) — written by the build, not by Josh |
| `appendix/JO_PREFERENCES.md` | Josh's working preferences and rules, as the build learned them |
| `appendix/CONTEXT_INDEX.md` | Where to dig for more context, one line per source |
