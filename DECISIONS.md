# DECISIONS.md — every JSTACK architecture decision, ADR-01..75, in one list

The one current decision index, for REMAP. It merges `history/v2/V2_DECISIONS.md` (ADR-01..18, 4 Sep 2026), `history/v21/V21_DECISIONS.md` (ADR-19..40, 5–7 Sep) and `history/v22/V22_DECISIONS.md` (ADR-41..65, 7 Sep), which stay beside it as history and hold each decision's full reasoning and the alternatives it rejected. One line per decision here; open the source file for the argument. Design truth order, unchanged since V2: brief v2 > mock v11 > pack tokens and reference build > pack prose > the contract > older.

Status: **stands** · **amended by** (still true, with a later change) · **superseded by** (no longer the rule; the successor is named) · **historical** (a process rule for a build that has ended).

## ADR-01..18 — V2 (4 Sep 2026; full text `history/v2/V2_DECISIONS.md`)

| ADR | Title | Decision in one line | Status |
|---|---|---|---|
| 01 | Section registry and one `Columns` layout | Every tab is an ordered list of section ids in `layout/registry.tsx`; a section's column is fixed by the registry; Arrange reorders within it; three breakpoints (768, 1180) | stands; extended by ADR-20 (configured sections) |
| 02 | One data path: `ApiAdapter` over a transport, mock as an in-process server | One `DataProvider` implementation; `Transport` is mock or http; the mock server holds the contract semantics; stores reload after every mutation | stands; its "no OpenAPI" rejection superseded by ADR-19 |
| 03 | Tokens generated from the pack, not copied | `tools/gen-tokens.mjs` reads `design/tokens/*.css` into `theme/tokens.ts`; lint refuses colour literals outside `theme/` | stands |
| 04 | Seven stores by domain, undo ledger and notification groups first-class | session, today, tasks, brain, life, agents, settings; the ledger holds the ten-second undo | stands; ADR-36 and ADR-37 add `lib/serverEvents.ts` and `stores/sync.ts` beside them |
| 05 | Tests that pay rent | Acceptance IDs define done; eight Playwright projects; core specs on two, matrix on all; Jest at the seams; screenshot regression retired for a reviewed device pass | stands |
| 06 | Delete, do not hide | News, the Security tab, Direct lines, the Habits tab, Test mode, the bug reporter, Gantt drag and the backend starter deleted; capability-gated surfaces built | stands; Gantt drag returned in ADR-46 |
| 07 | Responsive in one hook | `theme/useLayout.ts` is the only reader of the window size | stands |
| 08 | Handover artefacts | The V2 reading order and evidence set | **superseded by ADR-60** (the consolidated set: `HANDOVER.md`, `CONTRACT.md`, this file, `KNOWN_GAPS.md`) |
| 09 | Icons generated from Material Symbols Rounded as SVG paths | `tools/gen-icons.mjs`; no icon font, no Google Fonts origin | stands |
| 10 | Fonts through Expo Google Fonts packages | Instrument Sans and Source Serif 4, self-hosted | amended by V2.1 row S-4: fonts are static web assets in `public/fonts/` |
| 11 | Design pack vendored, discrepancies logged | `jstack-app/design/` with `DISCREPANCIES.md` | stands |
| 12 | Gantt is read-only in V2; drag goes to Twenty | Bars from `GET /tasks/gantt`; tap opens the task | **superseded by ADR-46**: drag and resize returned, and `GET /tasks?view=gantt` replaced the route |
| 13 | Decision cards: one record shape, five verbs, server-held undo | `POST /actions/{id} { verb }`; undo within ten seconds, `409` after; Telegram answers the same record | stands |
| 14 | Voice: browser speech now, streaming later, one honest capability line | Talk shows the honest line without `liveVoice` | **superseded by ADR-24** (a real two-way client behind `liveVoice`) and ADR-49 (one microphone owner, `lib/mic.ts`) |
| 15 | Lock, recovery and sessions kept from v1.2, extended | Passkey gate, auto-lock, emergency lock, recovery, high-risk assertions | stands; amended by ADR-41 (touch devices lock on hide, desktop after a parameter) |
| 16 | Arrange, focus filters, settings and layout live on the server as config records | `GET/PUT /layout/{tab}` with history; `/focuses`; `/settings/*`; theme and blur per device | stands |
| 17 | Stage split and unattended rules | V2's stages and instance rules | historical; **superseded by ADR-34, then ADR-61** |
| 18 | Rebuild the UI layer; keep the seams | V2's row 1 removed v1.2's UI; `lib/`, `data/`, the tools and the rig survived | historical |

## ADR-19..40 — V2.1 (5–7 Sep 2026; full text `history/v21/V21_DECISIONS.md`)

| ADR | Title | Decision in one line | Status |
|---|---|---|---|
| 19 | Wiring map, OpenAPI and a conformance runner, all generated | `tools/gen-wiring.mjs`, `tools/gen-openapi.mjs`, `tools/conformance.mjs`, each with a drift test | stands |
| 20 | Section catalogue: config bricks the EA composes | Eight block types; `SectionConfig`; `POST /sections/propose` becomes a decision card | stands; refined by ADR-39 and ADR-40 |
| 21 | Offline capture: an outbox in the transport, replay on reconnect, decisions online-only | Capture routes carry `offlineId`; `202 { queued }`; a `409` is listed under Settings › Sync | stands; the allow-list is `offline: true` in `data/routes.ts` |
| 22 | Host-agnostic deploy, CI publishes the build, PWA ships tested on localhost | Vercel and Cloudflare configs; release workflow on `v*` tags; manifest and service worker | stands |
| 23 | Security hardening and identity before sharing | CSP and headers, CI security jobs, dependabot, `GET /session` identity, the demo watermark, refresh rotation with reuse detection | stands |
| 24 | Voice protocol defined; a real two-way client behind `liveVoice` | `WS /voice` messages; silence never ends a turn or session; hold/resume; end phrases; presence; `TalkScreen` full screen | stands; amended by ADR-50 (Close and End, replies read aloud, brief replies) |
| 25 | Push subscriptions end to end on the client | Web Push with the VAPID key from `/capabilities`; the service worker opens the tab and card in the payload | stands |
| 26 | Second user and silo readiness | Every mock read filters by the session's silos; `asUser("joce")` in the rig; identity is the backend's | stands |
| 27 | Repo readiness | PR template, CODEOWNERS, dependabot, CONTRIBUTING; branch protection as the last row | amended: branch protection not needed (Josh, 7 Sep); the pre-push hook is the gate |
| 28 | Phone performance: measure, then a first speed pass with a budget test | `evidence/perf-baseline.json`; lazy tabs and the blur override refused on evidence | stands; the recorded-number gate became a same-run A/B against a reference build (V2.2 row C-1) |
| 29 | Time zone and locale, stated and enforced | ISO 8601 with offset; server strings in Brisbane; `lib/time.ts` at a fixed +10:00 | **superseded by ADR-47**: the device's zone, instants only on the wire |
| 30 | Telegram mirror in the mock | `POST /__mirror__/telegram` answers a card `via: "telegram"` and emits a server event | stands |
| 31 | A second fixture day | `reset("day2")` | stands |
| 32 | `history/v2/JOSH_QA.md` intake | Every line becomes a row with its own check | stands |
| 33 | Simplification | `theme/ui/` split; one `data/routes.ts`; rows S-1..S-7 | **superseded by ADR-59** (two simplification passes in V2.2); the one route table stands |
| 34 | Stages and models for V2.1 | Sonnet stages 3a–3c, an Opus audit | historical; **superseded by ADR-61** |
| 35 | `CODEMAP.md`: a living map, generated where it can be, guarded where hand-written | Ten sections; four liveness layers; the pre-commit hook | stands |
| 36 | The server-event subscription lives in `lib/serverEvents.ts`, not the session store | The store was at its cap; wiring is not state | stands |
| 37 | The outbox gets its own store, `stores/sync.ts` | Queue, conflicts, last sync, replay; `online` stays on the session store | stands; ADR-57 derives the sync dot from it |
| 38 | The PWA head, manifest and icons are emitted by `tools/build-web.mjs`, not `app/+html.tsx` | `+html.tsx` is unread under `output: "single"` | stands |
| 39 | A section config picks its data from a published list; it never describes it | A block names a bind from `layout/sources.ts`; the validator is a whitelist that refuses unknown keys | stands |
| 40 | A proposal is not a section, and approving is what creates one | `state: "proposed"` is invisible; Revise keeps the card open; Never is permanent, server-enforced; undo restores both halves | stands |

## ADR-41..65 — V2.2 (7 Sep 2026, built 8–11 Sep; full text `history/v22/V22_DECISIONS.md`)

| ADR | Title | Decision in one line | Status |
|---|---|---|---|
| 41 | The inactivity lock is a tunable parameter, ten minutes, and the EA can propose a change | Touch devices lock when hidden; every device locks after `lock.afterMinutes` (a `Parameter`, 1–60); the EA changes it only through a decision card | stands |
| 42 | The task card completes | Dates, priority and owner edited in place; whole-task delegation; a subtask menu; one completion rule with an undo; timestamps on every change | stands |
| 43 | Usage accounting on tasks and subtasks | `Usage` rows per run priced server-side into `costAud`; shown on the card and in Agents › Usage with a CSV copy | stands |
| 44 | One filter model for List, Board, Gantt and Done | A date range, owners you can tell apart, visible active chips, an editable slicer row, one Clear, shared across the four views | stands |
| 45 | The board mirrors Twenty's columns | `GET /tasks/columns`; cards move by drag or by "Move to…"; agent cards look like agent cards | stands |
| 46 | The Gantt gets a real axis, the shared filters, and drag to move and resize | Day ticks, week bands, the today line at its true place; drag and resize write `PATCH /tasks/{id}` | stands; supersedes ADR-12 |
| 47 | Time on screen: one human format, in the device's time zone, never raw | `lib/time.ts` formats every time in the device zone; nothing else touches a `Date` getter (a grep guard); the server sends instants only | stands; supersedes ADR-29 |
| 48 | Files and deliverables: an archive that searches | `Attachment` records; the task card's Files; an archive with search | amended by ADR-64: Dropbox is the store of record and the section is "Files" |
| 49 | The microphone has one owner, visible states, an auto-stop, and a release on every exit | `lib/mic.ts` is the only code that opens a microphone; `off → requesting → listening → transcribing → done \| error`; at most one session app-wide | stands |
| 50 | Talk with EA and Dictate to EA: always an exit, both sides in text, replies read aloud | Talk has Close and End; "Chat" became "Dictate to EA" with the mic | stands |
| 51 | Where an answer comes back | Replies in Brain, the newest on Today, a push group "Replies from your EA" when the app is closed | stands |
| 52 | Everything listed opens | Every row that represents a record opens a detail dialog through `layout/dialogs.tsx`; a guard walks every list | stands |
| 53 | Global search | `GET /search` across twelve kinds, scoped by silo and clearance server-side; a Find surface on every width | stands |
| 54 | Life: goals edited and remembered, habits with real history, learning that opens | Goals as a set with archive and history; habits archive, never delete; week, month, year and all-time views | stands |
| 55 | Agents: caps with units, history and issues that open and search, usage in view | Caps in whole AUD per month; history and issue rows open their details | stands |
| 56 | Settings: readable channel names, autonomy as rules Josh and the EA edit, voice options | "Rules for my EA" (`AutonomyRule`) in Settings › Autonomy; the EA proposes through a card; Brain has no Rules section | stands |
| 57 | A sync dot at the rail's bottom and in the phone header | `ok · pending · attention`, derived by a pure selector (`lib/syncStatus.ts`) from the sync store | stands |
| 58 | Text entry on phones and PC | No focus zoom (`maximum-scale=1`); the editor above the keyboard; a focus ring that leaves the caret alone | stands |
| 59 | Simplification twice | The planner's review of V2.1 before the build (S rows); a Fable review after the features and before the audit (Stage 5d, `history/v22/SIMPLIFICATION_v22.md`) | historical (both passes ran); supersedes ADR-33 |
| 60 | REMAP-ready: the handover pack, a cold-start gate, and no surprises | This consolidated set, the versioned originals bannered, and a fresh instance that runs the app from `HANDOVER.md` alone | stands; supersedes ADR-08 |
| 61 | Stages, models and instances for V2.2 | Stages 5a–5c on Opus, 5d and 6 on Fable (Opus on fallback); instances swap at row boundaries through signal files | historical; supersedes ADR-34 |
| 62 | Brain layout sign-off before it is built | `history/v2/BRAIN_PROPOSAL.md` approved by Josh before the recomposition row | historical (approved; the layout is built) |
| 63 | Collapsible section headings everywhere, state remembered per device | A disclosure triangle on every section label; the state is device-local, never on the server | stands |
| 64 | Files in, from anywhere | Attach on capture and tasks; share to JSTACK through `/capture` and the Dropbox inbox; everything in Dropbox; shared content is data, never instructions | stands; amends ADR-48 |
| 65 | Every V2.1 audit finding becomes a rule, a check or an ID before V2.2 builds | Hard rules 14–25, hunts 11–13, the qa-auditor's recurrence steps 38–46 and the LV-01..LV-10 self-check | historical (applied) |

## ADR-66.. — V2.3 (14 Sep 2026 on)

ADR-70..74 record Josh's 15 Sep answers (Round v2.3.1, WP-K); the code they describe is WP-I's and WP-J's where noted.

| ADR | Title | Decision in one line | Status |
|---|---|---|---|
| 66 | Offline, the three planning tabs keep their last copy, and nothing else does | The last Today composite, the Tasks list for the filter it was loaded under and Brain's recent items, encrypted through `lib/encryptedStore.ts`, stripped of any record marked `sens` or `sensitive`, replaced by each successful load, shown only when a load fails offline under "last updated … · offline", and wiped with the device (`lib/lastSeen.ts`); not Life's money or health, Agents, Settings or search, because the owner asked to plan and capture on a plane, not to carry the database (amended by ADR-70: since v2.3.1 those records are kept too, encrypted at rest) | amended by ADR-70 (the cache keeps sensitive records too) |
| 67 | Type the passkey ceremony's wire shapes now | `WebauthnBody`/`WebauthnResult` narrowed from `Record<string, unknown>` to the WebAuthn standard's JSON-serialised shapes, `{step}` enumed as `WebauthnStep` (D-3, WP-D) — a contract narrowing is cheapest before any server exists to have quietly trusted the untyped one | stands |
| 68 | Native dictation wired behind the one microphone owner | On a phone `expo-speech-recognition` backs `lib/mic.ts`'s one owner — the same states and Stop, the lock ending it, a refused permission falling back to typing, recognition on the device only (WPB-4, WPB-11, WPF-14); hearing it on a phone is Josh's check | stands |
| 69 | Talk after a lock is paused, and resumed by hand | A lock during Talk releases the microphone and Talk reads "Paused — locked" with its transcript kept; the microphone reopens only when Resume is pressed, because a lock is an exit path for the microphone (WPB-3, A4R11-06) | stands; Josh confirms the copy |
| 70 | Amends ADR-66: the last-seen cache keeps every record, sensitive included | Josh, 15 Sep: "Last-seen cache keeps everything, sensitive included." The stripping of `sens`/`sensitive` records before the cache writes no longer holds; `lib/lastSeen.ts` and the `HANDOVER.md`/`SECURITY.md` cache lines are WP-I's to change (code: WP-I) | stands |
| 71 | Teach feeds V3's memory-curation agent | Josh, 15 Sep: "Teach to form part of JStack V3 multi agent as memory refinement will be an agent task. Teach feeds that agent better info from me based on what it finds as conflicts/gaps/improvements." A rule taught from a card or Settings (§4.22) stays what it is today; the memory-refinement destination — a V3 agent (working name "librarian") reading Teach's conflicts, gaps and improvements — is new work, not V2.3's | stands |
| 72 | Money and Health move to the V5 stage | Josh, 15 Sep: "Money & health move to JStack V5 stage." Supersedes the 14 Sep "later" wording in `V23_REQUIREMENTS.md` §2 with a numbered stage | stands |
| 73 | The emergency lock: local when unreachable, full on confirmation; a wipe never touches the memory or information store | Josh, 15 Sep: "Local lock when unreachable, full lock on confirmation. Wipe never changes the memory or information storage database, only agents, interfaces and caches." Matches what `SECURITY.md` already built (ADR entry added for the record); the device clears tokens, keys, the outbox queue, caches and preferences, the server revokes sessions and pauses agents, and no wipe ever touches a record | stands |
| 74 | Rules and memory history is append-only | Josh, 15 Sep: "Append only. Memory will evolve over time, history matters." Confirms `CONTRACT.md` §1.5 for rules specifically: a removal from `PUT /settings/autonomy/rules` is a new entry, never a deletion of the one it replaces | stands |
| 75 | P-1 clarified: JSTACK's lock and the device's lock | Josh, 15 Sep: "When you say 'Lock', do you mean phone or app lock? When talk / dictation is on — the app and phone/ipad/app should ensure the device remains open and screen on. If I lock the device, voice locks too." Two locks, one rule for the microphone. JSTACK's own lock — the inactivity timer, hold-to-lock, the emergency lock — pauses Talk as "Paused — locked", and only Resume reopens the microphone (ADR-69). The device's lock, or the app switched away, ends voice the same way: the words kept, Talk reading "Paused", Resume by hand. While a microphone is open the screen stays on, and JSTACK's inactivity lock waits, since a person speaking is not idle (WPJ-1, WPJ-2, WPJ-3) | stands |

## ADR-76.. — REMAP's n8n build (29 Sep 2026 on)

REMAP's own decisions, recorded where Josh's are. They sit in their own table, numbered `ADR-76` on, so that Josh's run of ADR-01..75 above — which `tests/unit/consolidation.test.ts` (RM-09) holds to exactly those numbers — is left as he wrote it. Scope and reasons: `CLAUDE.md` and `remap/` at the repository root.

| ADR | Title | Decision in one line | Status |
|---|---|---|---|
| ADR-76 | A third transport: Josh's n8n webhooks, through a proxy, with no backend server | `EXPO_PUBLIC_DATA_SOURCE` = `mock` (the default, every test) \| `http` \| `n8n`; on `n8n`, `jstack-app/data/transport/n8n.ts` matches each request against `data/routes.ts` and answers it by its row in `jstack-app/data/n8n/registry.ts` — a webhook through an adapter whose output is the `openapi.yaml` shape, a composite assembled from those, a configuration default, or the contract's empty value — and every write without a key answers `501 { reason: "not connected yet" }` without leaving the device. The browser names a short allow-listed key (`calendar`, `tasks`); the proxy (`remap/dev-proxy.mjs` locally, nginx in production) maps it to the webhook and adds the header auth, so no n8n path or secret is in the bundle. `USE_API_ADAPTER` is true on `n8n`: no mock sign-in, no demo watermark, no fixtures. Wired one webhook at a time, sample → adapter → test → registry row (`remap/N8N-INTEGRATION-PROMPT.md`) | stands (REMAP) |
| ADR-77 | On the n8n build the site password stands in for server-verified passkeys | `SECURITY.md` wants passkeys verified by a server, sessions and a server-side emergency lock; n8n has none of those, so the passkey gate runs on the device only (`jstack-app/lib/webauthnGate.ts`), HTTP Basic Auth on the whole site (nginx) is the real access control, the emergency lock is local, and every high-risk write answers `501` | proposed — Josh must agree; open in `KNOWN_GAPS.md` |
| ADR-78 | On n8n, an empty that would claim activity is "not connected", and only a real webhook call speaks for the connection | A route whose contract-valid empty value would be a statement — "$0 this month · 0 tokens" — answers `501 { reason: "not connected yet" }` instead (registry kind `unavailable`, `GET /usage` first), which its store records as that section's load error. The n8n transport reports reachability itself, around `callWebhook` only: a local answer (a default, an empty, a 501) says nothing, a network failure says offline, any answer from the proxy says online. Wrapped in `withReachability` instead, a local `GET /capabilities` would put a session with the proxy down back online. The Agents and Brain reads that would claim health stay empty until their stores can show one section's failure without the whole tab's (`KNOWN_GAPS.md` N8N-2) | stands (REMAP) |
| ADR-79 | The n8n build's quiet hours and autonomy defaults | Quiet hours default to 23:00–07:00 with Security excepted — the window `JSTACK-SEND-OR-QUEUE` holds Telegram messages in today, read in `Australia/Brisbane` — so the app and Telegram agree; the Needs-you schedule is the mock's (08:00–09:00 and 16:00–17:00, paused, respecting quiet hours). Autonomy defaults to "Ask me" in every category: nothing automatic until Josh changes it. The app reads quiet hours in the device's zone, so the two agree while Josh's device is in Brisbane. Once `records` is wired, Josh's saved values replace both | stands (REMAP, 30 Sep) |
| ADR-80 | A calendar event counts for every day it overlaps | The mock keeps an event only when it STARTS in the window (`data/mock/handlers/calendar.ts`), which its fixtures never tested: on real data a two-day event vanished on its second day and yesterday's two-day event was missing today. On the n8n build an event is in the window when it overlaps it (a zero-length one, when its instant is in it); Google already returns every overlapping event, so it is the calendar adapter's rule alone and the mock is left as it is | stands (REMAP, 30 Sep) |
| ADR-81 | Free time is counted around the events that take time | Today's gaps (06:00–20:00, an hour or more) leave out all-day events — birthdays, travel days, holidays: 12 of 26 events over 45 days — and events Google marks free (`transparency: "transparent"`), so neither empties a day of its free time. The mock counts every event; its fixtures hold neither kind. Adapter only; an event with no transparency is busy, as Google's default is | stands (REMAP, 30 Sep) |
| ADR-82 | Week and Month fetch exactly the days the grid draws | The grid draws Monday–Sunday of the anchor's week (`lib/timeGrid.ts` `daysFor` → `weekOf`) and the anchor's month grid (`lib/time.ts` `monthGrid`, 35 days), while the mock's `rangeFor` starts both at the anchor: on a Wednesday its week missed the Monday and Tuesday drawn, and its month drew one day of data. The calendar adapter asks for the grid's own days — the week from `weekStart(anchor)`, the month from the grid's first day for the grid's length (35 today, 42 if it ever grows; the webhook takes up to 45). Today and 3 days keep `rangeFor`'s window. The mock is left as it is; its mismatch is `KNOWN_GAPS.md` N8N-3 | stands (REMAP, 30 Sep) |
| ADR-83 | On the n8n build a locked app gets nothing: its calls wait for the unlock | Josh's server answers `401` to any call from a device that has not passed this open's passkey ceremony (`CONTRACT.md` §4); the n8n build had no server to refuse, so the tabs mounted under the lock screen read Josh's data before the passkey. The n8n transport now holds every call while the session is locked — nothing reaches the proxy — and lets each go the moment it unlocks; the rows `data/routes.ts` marks `whileLocked` (the nonce, the ceremony, recovery, the emergency lock) go through, as `lib/lockGate.ts` lets them. It WAITS rather than answering `401` because the shell loads its settings, parameters, the rail's agents and the mounted tab once, under the lock, and nothing loads them again on unlock (`lib/boot.ts`, `lib/syncInstall.ts`): refused, the focus chips stayed empty and Today said it could not load. Decided with REMAP 30 Sep. A real server's `401` will still need the shell to re-run what it refused on unlock (WPF-13, REMAP's). The mock is unchanged: it answers under the gate, as before | stands (REMAP, 30 Sep) |
| ADR-84 | Needs you is the actions store, read and answered with the mock's rules | `GET /actions`, `/actions/{id}`, `POST /actions/{id}` and `/undo` go to JSTACK-DASH-actions, and Today's Needs you is `GET /actions`'s own answer (a failed store fails Today, as the other sources do). The app never writes a card — `op: "put"` is the EA's. Four rules of its own: (1) a card the contract cannot draw — a required field missing or malformed — is left out of the list with one console warning naming it, never padded, because its why, then-what, silence, toast and receipt are the EA's words; asked for by id it is a 502; (2) approving an email card (`kind: "quote"`) answers `501` without answering it until the `gmail-draft` key is wired, because `outbox_user_sends` says a draft exists; (3) a write forgets its key's shared reads, so the reload after an answer sees it answered; (4) the store's refusals are the contract's — a second answer and a late undo `409`, an unknown card `404`, a bad body `422`. What the store does differently from the mock is `KNOWN_GAPS.md` N8N-10 | stands (REMAP, 30 Sep) |
| ADR-85 | The actions store keeps an answer undoable for 12 seconds; the app shows 10 | The toast counts ten seconds from the reply's arrival and the store measured ten from its own answer, a round trip earlier (0.5–1.5 s), so an Undo tapped in the toast's last second could arrive late and be refused in silence (`KNOWN_GAPS.md` N8N-11). The store's window is 12 s (`UNDO_SECONDS` in JSTACK-DASH-actions' Decide node; `remap/n8n/JSTACK-DASH-actions.json`); the app, the contract's ten seconds and the toast are unchanged, so every Undo the toast offers can land. A late one — after 12 s — is still `409` | decided (REMAP, 30 Sep); the re-check that day still found 10 s live |
| ADR-86 | A task write carries only what Twenty's writer holds, and refuses the rest whole | JSTACK-DASH-tasks-write writes a task's title, status (TODO, IN_PROGRESS, DONE), due date, assignee and body; not its bucket (the Board's stage), who it waits on, a priority, an area, start or end dates, a goal link, a project or subtasks. On n8n `PATCH /tasks/{id}`, `POST /tasks/{id}/complete`, `PUT /tasks/{id}` (the undo of a completion) and `POST /tasks` go to it; a patch or a new task that names anything else answers `422 { field, reason }` naming that field, BEFORE anything is sent — never a partial save the screen would show as whole. A due DAY goes as local noon, so every zone reads the same day back; an undone completion puts a waiting task back to the status Twenty had for it (`TODO` or `IN_PROGRESS`, from the last read). A refusal made on the device reports nothing about the connection (ADR-78, now enforced by counting the proxy's replies). What would let the rest be written is a DASH change (`remap/WORKFLOWS-NEEDED.md` §2) | stands (REMAP, 30 Sep) |

## Deferred and refused, merged

| Item | Ruling | Source |
|---|---|---|
| Backend starter (Postgres schema, reference server) | Retired; kept at tag `v1.2` | V2 |
| Board mode (iPad docked) | V3, if it earns it | V2 |
| Decision journal fields (expected outcome, confidence, review date) | Not built (Josh: no) | V2 |
| Family tenant, a second real user | V3; every record already carries `silo` | V2, V2.1 |
| Push notifications scheduled locally | Never; push comes from the backend, no polling | V2 |
| Screenshot visual regression as a gate | Retired for the reviewed device pass | V2 |
| Code-brick scaffold for a coding agent | V3, with REMAP's agent stack | V2.1 |
| Host account, streaming voice provider, real multi-writer sync | REMAP's | V2.1 |
| Error-reporting SaaS | None; privacy | V2.1 |
| Uploading files from the app; attachments UI | Built in V2.2 (ADR-64) | V2.1 → V2.2 |
| Gantt drag | Built in V2.2 (ADR-46) | V2.1 → V2.2 |
| A user-chosen time zone override | V3 if ever (ADR-47) | V2.2 |
| Branch protection on `main` | Not needed; the pre-push hook stays (Josh, 7 Sep) | V2.2 |
| Native iOS share extension (the share sheet's app row) | First item of the native track; needs a native Xcode build and an Apple developer account (Q22) | V2.2 |
| Rules for my EA on Brain | Removed; Settings only (ADR-56) | V2.2 |
| Editing Twenty's columns from the app | Refused; Twenty owns the pipeline | V2.2 |
| Task dependencies on the Gantt | V3; not asked | V2.2 |
| A sixth tab for Find | Refused; Find is a surface reachable from every tab | V2.2 |
| Client-side cost computation | Refused; the server sends `costAud` | V2.2 |
| A chart or drag-and-drop library | Refused; the no-dependency rule | V2.2 |
| Replies as interrupting modals | Refused | V2.2 |
