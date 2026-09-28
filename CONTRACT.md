# CONTRACT.md — the JSTACK app ↔ backend contract (V2.2, consolidated)

The one current contract, for REMAP and anyone building the server. It merges `history/v2/CONTRACT_v2.md` (4 Sep), `history/v21/CONTRACT_v21.md` (5 Sep) and `history/v22/CONTRACT_v22.md` (7 Sep), which stay beside it as history, with what the builds retired taken out (listed in **RETIRED** at the end) and every open question answered or assumed (§8).

- **`jstack-app/openapi.yaml` is authoritative** for every path, parameter and body. It is generated from `jstack-app/data/routes.ts` (the one route table) and `jstack-app/data/types.ts` (the wire shapes). Where this prose and the YAML disagree, the YAML is what the app sends and the prose is the defect.
- **Section numbers are stable.** §4.1–§4.9 are V2's route families, §4.10–§4.13 V2.1's and §4.14–§4.23 V2.2's, numbered in the order they were added, so every `TODO(BACKEND: §4.n)` marker in `jstack-app/data/ApiAdapter.ts` (all of them: `jstack-app/evidence/todo-backend-grep.txt`) resolves to the section here that declares its route. A V2.2 section names the family it extends.
- **The mock is the executable half.** The app ships complete against an in-process mock of this contract (`jstack-app/data/mock/server.ts`, `jstack-app/data/mock/handlers/`). Set `EXPO_PUBLIC_API_BASE_URL` (read by `jstack-app/data/config.ts`) and the same app talks to a server that implements §4, with no UI change; `node jstack-app/tools/conformance.mjs <base URL>` is the check. Substitution rule: any component named here is a candidate; substitute what you have proven, provided §4 and the acceptance tests still pass. Conflicts go to Josh; nothing diverges silently.

## §1. Principles the backend enforces (the app is a remote)

1. **No send, pay, book or revoke verb exists in any agent grant.** The app renders drafts and staged items only. A blocked-action test proves it on every release (SEC-15). Device revocation (`/devices/{id}/revoke`) is a security control, not that verb.
2. **Credentials are brokered from the vault.** No agent holds a secret. Each agent gets its own token. Hard spend caps in LiteLLM stop a run; they do not just alert.
3. **Every record is labelled** (`silo`, `types`, fail-closed) **and carries a focus.** The backend filters reads by clearance; restricted types never leave. A focus is a saved filter over labels — the app sends `?focus=`, and the server applies it (`"all"` means no filter).
4. **Needs-you budget.** The server ranks and surfaces at most 5 open cards. Expiry triggers "then-what" server-side. Silence counts as a no.
5. **Append, never overwrite.** Memory proposals, rules, layouts, drafts, labels, goals and habit logs are versioned or archived. Superseded values are kept, not deleted.
6. **Provenance and receipt on every card and answer.** `why` with source refs, `sourceUrl?`, `receipt { cost, model, sources, seconds }`. A source's `url` is what makes it a link — without one the app renders plain provenance.
7. **Rules server-side.** Quiet hours, notification groups × devices, autonomy per card type and the rules for the EA (§4.22), prep escalation, undo windows.
8. **Sensitivity.** Record labels carry `normal | sens | t1`. `sens` blurs under privacy mode; `t1` is never served (`403`). A capture's routing label (§1.19) is `open | normal | sensitive`.
9. **Security by design is checked continuously.** Every failing or unrun check is a row in `GET /agents/issues`. Nothing stays only in a log.
10. **Delta on open.** Every composite carries `seenAt` and a `since` line. The app fetches once on open and once on push — never by polling.
11. **Timestamps.** Every timestamp on the wire is ISO 8601 with an explicit offset; money is a string. `GET /today` sends `todayDate` (`YYYY-MM-DD`, the machine key every surface filters by) and `dateLabel` (display only). How times are shown is §1.15.
12. **Idempotent captures.** Every capture write carries `offlineId` (uuid, client-generated). A repeat returns the original result with `200` and `{ duplicate: true }` — it never files twice. Decisions carry no `offlineId` and are refused offline by the app.
13. **Identity.** `GET /session` names the user and their silos; every read is silo-scoped server-side. A passkey binds a device to a session, not a person to an identity — identity is the backend's. A production build on the mock transport shows the demo watermark and never talks to a real backend.
14. **Server events, not polling.** State that changes without the app's own write (a Telegram answer, a finished delegation, an expired card, a new reply) reaches the app by push (§4.13) as `{ kind, ids }`. The app refetches the named composite once.
15. **Instants on the wire, prose in the app.** The app composes every time it shows from an instant, through `jstack-app/lib/time.ts`, in the device's time zone (ADR-47). Server strings carry no clock: tasks, feed events, activity, Latest in and Brain items send `at`, `due`, `startsAt`, `endsAt`, `completedAt` as instants, with their label parts as separate fields (`metaParts`).
16. **Everything listed opens.** Every record the API lists is fetchable by id through a detail route named in §4, and every list row opens it (ADR-52). A list without a detail route is a contract defect.
17. **One microphone owner.** The app opens at most one microphone at a time, shows it on every surface while open, stops it after `mic.autoStopSeconds` of silence, and releases the device on every exit (ADR-49). A voice session that loses its client sees `end { reason: "user" }` or a reconnect — never a silent stream.
18. **Parameters are records.** Tunable behaviour lives in `GET /parameters` (§4.14) with a declared range. The EA changes one only through a proposal card; the app refuses a value outside the range, and so does the server (`422`).
19. **Triage.** Every capture (typed, dictated, Telegram, shared, Dictate to EA) goes to the default agent. It decides whether the capture is a task, labels its sensitivity, chooses where it is stored (Twenty, journal, memory, Dropbox), and returns `routing { kind, silos, labels, sensitivity, storage, provisional?, reason?, also? }`, shown on the capture's row in Latest in. A question also yields a `Reply`. A backend duty (Q21) — the mock's triage is keyword-based, there only to prove the app's rendering.
20. **Shared content is data, never instructions.** Anything scraped from a shared link is stored as `extractedText` on the capture, tagged untrusted, rendered text-only, indexed for search, and read by the EA only as quoted material. The fetch-and-extract step runs with no tools and no memory access beyond writing the sanitised text; domain allow-lists, size caps and script stripping apply, and the triage card says what was extracted. The threat model is `SECURITY.md`; the screening design is REMAP's (Q24).

## §2. Systems of record (one home per noun)

| Noun | System of record | Notes |
|---|---|---|
| Tasks, subtasks, waiting-on, recurring rules, board columns | Twenty CRM | The backend reads and writes Twenty; EA edits carry a reason; delegation creates a child task owned by `agent:ea`; the board's columns mirror Twenty's pipeline and are never written by the app (Q18) |
| Delegation runs, EA reports, cost per run, usage rows | OpenClaw run log + LiteLLM ledger | Joined onto the task; `costAud` priced server-side from the provider's usage fields (Q17) |
| People | Twenty people + EA extraction | Birthdays, promises, last spoke |
| Calendar | Google Calendar through the backend connector | Write-back then re-sync; proposals are drafts; focus label per Q1 |
| Action records (cards), decision history | REMAP memory layer (EA writes) | App and Telegram resolve the same record; undo window held server-side |
| Captures, Latest in, journal, learning, replies | REMAP memory (Librarian files; the default agent triages) | The markdown vault stays the notes home |
| Memory proposals and their history, hit rate | REMAP memory, versioned files in the vault | |
| Files and deliverables | Dropbox under `/JSTACK/`, indexed in Postgres | Q16: Dropbox is the record; the index serves search and `dropboxUrl` |
| Search index | Postgres full-text, or the memory layer's index | Scoped by silo, focus and clearance server-side (§4.19) |
| Insights, review aggregates, journal prompt | EA (n8n on request; 19:00 prompt) | |
| Habits and logs | REMAP memory (config record + logs) | Logs are never deleted; archive is the only way off the list |
| Goals; Money, Health, Learning section configs; EA section proposals | Config records (EA proposes, Josh edits) | Goals archive with history; Money feed Redbark or PocketSmith later |
| Parameters, autonomy per card type, rules for the EA | Config records | Each EA change is a proposal card (§4.14, §4.22) |
| Agent stats, spend, caps, portals | LiteLLM (spend, caps) + OpenClaw (runs) | Stats derived from runs, never stored |
| Security checks, agent issues, heartbeat | OpenClaw watchdog (independent host), blocked-action and injection suites, canaries, secrets scan, restore drill, session store | Run-now through the backend |
| Schedules | OpenClaw cron + Twenty repeat rules | Pause, run now |
| Notification groups, quiet hours, voice, focuses, layouts, slicers | Config records (backend) | Versioned with history |
| Sessions, devices, tokens, emergency lock, recovery, secret rotation | Vault + session store | REMAP's runbook |
| Push subscriptions; server events | Backend push service; n8n for the Telegram mirror | The app registers per device |
| Two-way voice | Streaming provider (REMAP's choice) | §4.11 |
| Exit pack | REMAP fixed core (to confirm) | Q2 |

## §3. Shapes

camelCase on the wire; ISO 8601 with offset; money as strings, marked `sensitivity: sens`. Every labelled record carries `labels` (silo, types, who set them and when; `jstack-app/data/labels.ts`) and `focus` — `LabelledMeta`; every composite carries `seenAt` and `generatedAt` — `Composite`. **The shapes are `jstack-app/data/types.ts`**, one exported type per wire shape, and `openapi.yaml`'s components are generated from it, so this section does not copy them: a copy is a second truth. The records by family, with the type to open:

| Family | Records (`data/types.ts`) |
|---|---|
| Decisions | `ActionItem` (with `ActionKind`, `ActionOption`, `ActionSource`, `ActionHistoryEntry`, `ActionReceipt`, and the `section`, `rule`, `parameter`, `triage` payloads: `SectionConfig`, `ActionRule`, `ParameterProposal`, `TriageProposal`), `Insight`, `PostActionBody` |
| Tasks | `Task`, `Subtask`, `Work`, `TaskReport`, `Column`, `Slicer`, `SlicerPredicate`, `AgentRoster`, `WaitingRow` |
| Calendar | `CalEvent`, `FreeGap`, `CalendarWindow` |
| Brain | `BrainItem`, `CaptureRouting`, `Reply`, `MemoryProposal`, `MemoryHistoryEntry`, `MemoryHitRate`, `ChatThread`, `ShareIn`, `FindAnswer`, `FindResult` |
| Search | `SearchResponse`, `SearchGroup`, `SearchResult`, `SearchMatch`, `SearchRef` |
| Files and usage | `Attachment`, `Usage`, `UsageSummary` |
| Life | `Goal`, `GoalKpi`, `GoalHistoryEntry`, `GoalComposite`, `Habit`, `HabitLog`, `HabitStats`, `Person`, `MoneyRow`, `MoneyDue`, `LearningItem`, `LifeSectionConfig`, `LifeComposite` |
| Agents | `AgentSummary`, `Spend`, `AgentIssue`, `AgentRun`, `FeedEvent`, `SecurityCheck`, `Schedule`, `Portal` |
| Settings | `Parameter`, `ParameterDef`, `AutonomySettings`, `AutonomyRule`, `NotificationGroup`, `QuietHours`, `VoiceSettings`, `Focus`, `Layout`, `AppLayout`, `Capabilities` |
| Session and sync | `Session`, `SessionUser`, `Device`, `ServerEvent`, `OutboxEntry`, `SyncStatus`, `PushSubscribeBody` |
| Sections | `SectionConfig`, `Block`, `SectionCatalogue` |
| Composites | `TodayComposite`, `ReviewComposite`, `LifeComposite` |

The voice messages are JSON frames tagged by a field `t`, typed in `jstack-app/lib/voice/protocol.ts` (`ClientMessage`, `ServerMessage`): client → server `start { sessionId, voice: { style, speed, brevity? }, resume? } | audio { seq, chunk } | text { text, id? } | hold | resume | turn { intent?: "end?" } | presence | ping | end { reason: "user" | "confirmed" | "absent" }`; server → client `interim { text } | final { text, id? } | turn? | reply { text, sources: [{ label, ref }] } | speak { text, audioRef? } | filed { routed[] } | pong | error { reason } | end { summaryRef }`.

Rules the shapes carry that a type cannot say:

- **Task dates.** `startsAt`/`endsAt` replace V2's `gantt { start, end }`; `PATCH` refuses `endsAt < startsAt` (`422`). `column` is Twenty's kanban value (a `Column.id`); a board move sets it, and sets `status` only where the column has exactly one status. `work` is set by the backend while an agent run is active and cleared when it ends, with an activity entry `kind: "run"` carrying `usageId`.
- **Filters.** `TaskFilters.range.preset` is `default | thisWeek | next | last | all | custom`; `default` resolves to `next` on List, Board and Gantt and to `all` on Done; `next`/`last` span `tasks.rangeDays` days; `thisWeek` is Monday to Sunday; `columns` absent means all. `SlicerPredicate` is evaluated server-side from a table (`dueWithin`, `status`, `delegated`, `owner`, `repeat`, `priority`, `goal`).
- **Habit stats.** `month` and `year` are calendar periods at `anchor`, not rolling windows; `week` is rolling. `possible` never counts a day that has not happened. Streaks count over every log, never the window, and an unfinished today does not break one. `earliest` is the first day anybody logged — what the month and year views page back to.
- **Replies and refs.** A `ref` is `"<kind>:<id>"` over the search kinds; the app resolves every one through one `openRef()` (`jstack-app/layout/openRef.ts`). Replies from a Dictate turn are created `read: true`.
- **Attachments.** Every one carries `folder` (its Dropbox path under `/JSTACK/`) and `addedBy` (`josh | joce | ea | dev`); `url` is optional and short-lived when present (`urlExpiresAt`), never cached by the app.
- **Collapsed headings** are device-local (`CollapsedState`) and never on the wire.

## §4. Endpoints

Base `/api/v1`; auth is a short-lived scoped JWT per device, sent as `authorization: Bearer <token>` (`jstack-app/data/transport/http.ts`; the token comes from `AUTH.getToken()` in `jstack-app/data/config.ts`, Q20). Errors: `401` no session or locked, `403` clearance `{ reason }`, `409` late undo or conflict, `413` upload too large, `422` validation `{ field, reason }`, `423` locked rule, `429` rate limit `{ retryAfter }` (Q8). `?focus=` is optional everywhere; absent means Everything. A route marked *capture* accepts `offlineId`, may be queued offline by the app and replayed (§4.12).

### §4.1 Session, devices, lock
| Method and path | Purpose |
|---|---|
| GET `/auth/nonce` · POST `/auth/register-device` · POST `/auth/refresh` · POST `/auth/webauthn/{step}` | Device registration, rotation, the passkey ceremony (server-verified on every open); refresh rotation with reuse detection (`401 { reason: "reuse" }` locks the device) |
| GET `/session` | `Session`: user, silos, device, devices, `tokenTtlSeconds: 900` |
| POST `/devices/{id}/revoke` | High-risk (nonce + assertion) |
| POST `/lock` | Emergency lock: revokes every session and token, freezes the vault, pauses agents, disables outbound tools; `{ locked: true, at }`; fresh assertion required; the app then wipes this device's tokens, keys, outbox queue, caches and preferences. Nothing on the server's memory or information store is touched — only agents, interfaces and caches (Josh, 15 Sep, P-10). Unreachable, the app locks this device locally at once and wipes nothing until the server confirms |
| POST `/recover` `{ recoveryKey, nonce, biometricAssertion }` | Rotates every secret first, restores this session, resumes agents one at a time; `{ restored: true, agentsResuming: [...] }`. Every record the lock froze is still there — recovery reloads it, never rebuilds it |

`{step}` is `"options" | "verify"` (`WebauthnStep`, D-3, ADR-67), never a bare string. `options` answers `WebauthnOptions` — a challenge and, for a fresh registration only, `rp`/`user`/`pubKeyCredParams` (base64url buffers throughout, the JSON form `PublicKeyCredential.toJSON()` produces per the WebAuthn standard, Level 3); `verify` takes the credential the client sends back (`WebauthnCredential`, every field optional — the ceremony is checked on the device today, `jstack-app/lib/webauthnGate.ts`, not the server) and answers `{ verified: true }`. Both were `Record<string, unknown>` before D-3; narrowed now, before a real server exists to have silently trusted the untyped shape.

Push subscription routes are §4.13.

### §4.2 Today
| Method and path | Purpose |
|---|---|
| GET `/today?focus=&since=` | Composite: `dayName`, `dateLabel` (display), `todayDate` (`YYYY-MM-DD`), `since`, `health: { ok, spend }`, `needsYou: ActionItem[]` (≤5 open), `insight?`, `calendar: { events, gaps }`, `tasks` (top 3), `glance: { habits, people, money, goals }`, `close: { habits, logs, journalPrompt? }`, `endLine`, `seenAt`; with `?since=` adds `delta: { added, changed, removed }` |
| GET `/review?anchor=` | Last seven and next seven days: decisions, promises kept, time by focus, habits pct, spend, three priorities |
| POST `/journal` `{ text, source }` | Close-the-day line → brain item; *capture* |

### §4.3 Decisions
| Method and path | Purpose |
|---|---|
| GET `/actions?state=open\|history&focus=&q=` | Open cards ranked, or history with search |
| GET `/actions/{id}` | One card with its full history and receipt; the `decision` detail renders an answered card from it (§4.21) |
| POST `/actions/{id}` `{ verb: approve\|revise\|later\|never\|teach, option?, until?, revision?, rule? }` | Answers the card; approve on `quote` returns `{ status: "outbox_user_sends" }`; later sets `laterUntil` (server default Mon 8am); never records and offers a rule; teach records a rule (§4.22); records `history` with `via`; starts a 10 s undo window. The union in `PostActionBody` requires `revision` on revise and `rule` on teach |
| POST `/actions/{id}/undo` | Within the window restores `state: open` and reverts what the verb wrote (a parameter, a rule); after it `409` |
| PUT `/actions/{id}/draft` `{ subject?, body }` | Josh's edited draft saved as a version; never sends |
| POST `/actions/{id}/reopen` | Mock-shaped undo for the app's own recovery (`history/v2/BUGLOG_v2.md` A-26); implement as the mock does |
| POST `/insights/{id}` `{ action: "block"\|"leave" }` | Block creates the protected calendar block |

### §4.4 Calendar (Google through the backend)
| Method and path | Purpose |
|---|---|
| GET `/calendar?view=today\|3day\|week\|month&anchor=&focus=` | Merged events with `source`, free gaps, month dot summaries, `protectedByEa` |
| GET `/events/{id}` · PATCH `/events/{id}` · DELETE `/events/{id}` | Write-back then re-sync |
| POST `/calendar/propose` `{ gapStart, title, attendee? }` | A proposal draft, never sent |

### §4.5 Tasks (Twenty + run log)
| Method and path | Purpose |
|---|---|
| GET `/tasks?focus=&slice=&view=list\|board\|gantt\|done&q=&filters=&since=` | The shared filter payload (§3) on every view; `view=gantt` returns the same filtered set with `startsAt`/`endsAt`; `?since=` adds `delta` |
| GET `/tasks/{id}` · POST `/tasks` · PATCH `/tasks/{id}` · PUT `/tasks/{id}` | POST and PATCH are *captures* (`PATCH` field edits and their `422`s are §4.15); PUT save-on-close appends activity |
| POST `/tasks/{id}/subtasks` `{ title, owner }` | Add a subtask (a goal card uses it too, §4.20) |
| POST `/tasks/{id}/delegate` `{ to?, scope? }` | Whole-task delegation, §4.15; online-only (it starts an agent run) |
| POST `/tasks/{id}/report` `{ verb: accept\|revise\|teach, note? }` | On the EA's report |
| POST `/tasks/{id}/accept` | Accept a task from Joce (family silo) |
| GET `/tasks/waiting?focus=` | `[{ who, what, days, note?, taskId }]` |
| POST `/tasks/{id}/nudge` | Drafts a nudge in Gmail Drafts; `{ draftRef }`; never sends |
| POST `/undo` | Reverts the last undoable task mutation for this device |
| PUT `/{noun}/{id}/labels` | The label scheme on every labelled noun (`history/v2/DATA_LABELS.md`) |

### §4.6 Brain
| Method and path | Purpose |
|---|---|
| POST `/brain/dump` `{ text?, audioRef?, url?, source: voice\|typed\|share, attachmentIds? }` | *Capture*; `{ item: BrainItem, routed[] }` with `routing` on the item (§1.19) |
| GET `/brain/latest?focus=&since=` | Latest in with routing tags; `?since=` adds `delta` |
| PUT `/brain/items/{id}` · GET `/brain/items/{id}/versions` | Edit by voice or keyboard; versions kept (the detail read is §4.18) |
| GET `/brain/search?q=` | `{ answer: { headline, synthesis, sources, confidence, seconds }, results[] }` (§4.18 adds `matches` and `sourceIds`) |
| POST `/chat` `{ text }` | Dictate to EA: the EA replies in text, `{ reply, sources[] }` (the day's thread is §4.18) |
| GET `/memory/proposals?focus=` · POST `/memory/proposals/{id}` `{ verb: ok\|edit, text? }` · POST `/memory/proposals/{id}/undo` | Accept writes a version and a history entry (§4.18); edit also teaches; undo as the mock does |
| GET `/memory/hitrate` | `{ right, total, wrongSources, misses, rulesMisled, fixUrl }` |

### §4.7 Life
| Method and path | Purpose |
|---|---|
| GET `/life?focus=` | Composite: the ACTIVE goals, habits (today), people, money, health, learning, section configs |
| GET `/habits?includeArchived=` · POST `/habits/{id}/log` `{ date, done }` · GET `/habits/stats?period=week\|month\|year\|all&anchor=` | The tracking list (`includeArchived=true` for the editor's Add habit); the log is a *capture*; stats as §3 |
| GET `/people?focus=` · POST `/people/{id}/act` `{ action: draft\|nudge\|done }` | Draft writes to Gmail Drafts; never sends; the act is a *capture* |
| GET `/money` | Rows, due items, feed note; `sensitivity: sens` |
| GET `/health` | Ghost until `capabilities.healthFeed`. The liveness check is `/healthz`, outside the API (D-7; `BACKEND_HANDSHAKE.md`) — the two do not collide. |
| GET `/learning?focus=&q=` | Learning items (the detail is §4.20) |
| GET `/life/sections/{id}/config` · PUT · POST `/life/sections/{id}/config/revert` | EA-proposed templates with reason; Josh edits or reverts |

Goals and the habit list's writes are §4.20.

### §4.8 Agents
| Method and path | Purpose |
|---|---|
| GET `/agents/summary` | `AgentSummary`, derived from runs |
| GET `/agents/spend` · PUT `/agents/caps` `{ caps: [{ agent, cap }], nonce, biometricAssertion }` | Caps are hard stops in whole AUD per month; PUT is high-risk |
| GET `/portals` | `[{ name, purpose, url }]` |
| GET `/agents/issues?q=` · POST `/agents/issues/{id}` `{ action: renew\|run\|open }` · POST `/agents/issues/{id}/undo` | One row per failing or unrun check; the verb offers undo wherever it is pressed (the detail read is §4.21) |
| GET `/agents/feed?hours=24&since=` | `?since=` adds `delta` |
| GET `/security/checks` · POST `/security/checks/{id}/run` | The fixed set of seven |
| GET `/agents/runs?…` | Drill-down behind the stat cards |

### §4.9 Settings and configuration
| Method and path | Purpose |
|---|---|
| GET `/settings/notifications` · PUT `/settings/notifications/{id}` `{ devices }` | Groups × the four channels (`iphone`, `ipad`, `pc`, `telegram`); the `security` group is locked → `423`; V2.2 adds the group "Replies from your EA" |
| GET/PUT `/settings/quiet-hours` `{ start, end, exceptions, needsYou? }` | Quiet hours, and when Today raises Needs you (WPS-1): `needsYou { windows: [{ start, end }], respectsQuietHours, paused }` — outside every window, and inside these quiet hours when `respectsQuietHours`, the cards wait, the label keeps the count and the section reads "5 waiting · next at 8:00am"; no `needsYou`, or `paused`, raises them as they come. Times are `HH:MM` in the device's zone, an `end` before its `start` runs past midnight, and a schedule that can never open holds nothing |
| GET `/schedules` · POST `/schedules/{id}/run` · POST `/schedules/{id}/pause` · POST `/schedules/{id}/resume` | Routines and EA recurring tasks |
| GET/PUT `/settings/autonomy` | Per card type: ask, propose, auto (the rules for the EA are §4.22) |
| PUT `/settings/voice` | style, speed, `brevity`, `readAloud`, readBriefAt, cue word, end phrases, `silenceTurnSeconds`, car mode (the read is §4.22) |
| GET/PUT `/focuses` | Everything is fixed; others editable (the app sends `{ focuses }`) |
| GET `/layout/{tab}` · PUT · POST `/layout/{tab}/revert` · POST `/layout/{tab}/ea` `{ order, hidden, reason }` · GET/PUT `/layout/app` | Pinned sections rejected on hide (`422`); EA proposals need a reason and never re-show a Josh-hidden section (`422`) |
| GET `/capabilities` | `Capabilities`; the app has a local fallback |
| POST `/export` | Exit pack; `{ jobId }`; REMAP to confirm (Q2) |
| GET `/labels/scheme` · GET `/labels/audit?record=` | |

Parameters are §4.14.

### §4.10 Sections (config records; EA proposals)
| Method and path | Purpose |
|---|---|
| GET `/sections?tab=` | ACTIVE `SectionConfig[]` for the user; merged after the static registry entries per tab and column |
| GET `/sections/{id}` · PUT `/sections/{id}` · POST `/sections/{id}/revert` · DELETE `/sections/{id}` (retire) | Josh edits a config (validated, versioned); revert restores the previous version; retire keeps history |
| POST `/sections/propose` `{ config, reason }` | EA-only. Validates; creates a decision card `type: "Section"`, `kind: "section"` carrying the config; `422` on an invalid config, an empty reason or a retired id (permanent). Approve → `active`; Revise → the card's config opens in the configure dialog and re-proposes; Never → `retired`; Later → returns |
| GET `/sections/catalogue` | The block types, binds and verbs the server accepts; the app asserts equality with its own copy (`jstack-app/layout/catalogue.tsx`) |
| Validation | Unknown block type, verb or top-level key, a bind not on the published list, more than 12 blocks, any string over 200 characters, a pinned column position → `422 { field, reason }` |

### §4.11 Voice (`WS /voice`)
The socket is the base URL with `http` replaced by `ws`, plus `/voice` (`jstack-app/data/provider.ts`). Messages as in §3 (`jstack-app/lib/voice/protocol.ts`). Sequence: `start` (carrying `voice.brevity`) → any number of `audio` or `text` → server `interim`/`final`/`reply`/`speak`/`filed` → `end` from either side → server `end { summaryRef }` persists the summary as a brain item. A `reply` without a following `speak` means text only; a `speak` with an `audioRef` is fetched and played, otherwise the text is spoken locally. `error` closes the session; the app shows the honest line and keeps the typed path. The client sends `audio/webm;codecs=opus` chunks of about 250 ms, and `audio/mp4` on iOS Safari (Q19). Every client exit sends `end { reason: "user" }` or reconnects (§1.17).

**Pauses and turns.** Silence never ends a turn or a session on the server. The client sends `hold` after about five seconds of silence and `resume` when speech returns; between them no audio flows and the server keeps the session, its transcript and its context. A turn ends only when the client sends `turn` (cue word, tap, or the user's optional silence timer). The server may send `turn?`; the client decides. `ping`/`pong` every 20 seconds; `start` with `resume: true` and the same `sessionId` restores the session and returns the transcript so far: the `final`s already sent, each under the `id` it first carried, so a client that holds a line keeps one row of it and does not act on its words again. The server keeps a session's transcript by `sessionId`, and the summary it files holds the whole conversation, what was said before a drop included. A `text` carries the client's `id` for the line and the server's `final` for it carries the same `id`, so a typed line is drawn once; a `text` sent again under an `id` the session already holds is said back, not added, and on a resume the client sends again every typed line not yet said back. Ending: the client sends `turn { intent: "end?" }` on an end phrase; the server replies `speak` "End the conversation? Yes or no." and ends only on a following yes (`end { reason: "confirmed" }`); 20 seconds of silence after the question continues. Presence: after 10 minutes held the server sends `speak` "Still here? Say anything to continue."; any `resume`, `text` or `presence` answers; a second unanswered check at 20 minutes ends the session (`end { reason: "absent" }`, summary filed, a push "Conversation ended · 20 minutes quiet").

### §4.12 Sync and outbox
| Method and path | Purpose |
|---|---|
| Every *capture* in the allow-list — the routes marked `offline: true` in `jstack-app/data/routes.ts` | Accepts `offlineId`; `{ duplicate: true }` on a repeat (§1.12). A route not on the list is never queued; decisions, delegation and search refuse offline with the honest line |
| GET `/sync/status` | Last seen per device, pending `ServerEvent[]` since `seenAt` |
| `?since=<ISO>` on `/today`, `/tasks`, `/brain/latest`, `/agents/feed` | The response adds `delta: { added, changed, removed }` ids; the full body is still returned |
| Conflict | A replayed write the server cannot apply returns `409 { reason, server: <record> }`; the app keeps the server's version and lists the local text under Settings › Sync |
| The lock gate | Every write while the session is locked answers `401`; the app keeps the queued entry and replays it on unlock; a `5xx` keeps the entry too |

### §4.13 Push and server events
| Method and path | Purpose |
|---|---|
| POST `/push/subscribe` `PushSubscription` · DELETE `/push/subscribe/{device}` | Register or remove a device's Web Push subscription with its notification groups (removed on revoke, and when the switch on that device goes off) |
| Push payload | `{ group, title, body, tab?, ref?, event?: ServerEvent }`; the service worker (`jstack-app/public/sw.js`) shows it; a tap opens `/<tab>?ref=<kind>:<id>`; an `event` makes the app refetch the named composite once |

### §4.14 Parameters
| Method and path | Purpose |
|---|---|
| GET `/parameters` | Every `Parameter` with its current value: `lock.afterMinutes`, `lock.lockOnHideTouch`, `tasks.rangeDays`, `files.recentDays`, `mic.autoStopSeconds`, `search.maxResults` |
| PUT `/parameters/{key}` `{ value }` | Josh sets a value; outside `[min, max]` → `422 { field: "value", reason }` |
| POST `/parameters/propose` `{ key, value, reason }` | EA-only; creates a decision card `kind: "parameter"`; Approve applies (audited, undoable for ten seconds), Never records the refusal |

### §4.15 Tasks (extends §4.5)
| Method and path | Purpose |
|---|---|
| PATCH `/tasks/{id}` `{ title?, priority?, startsAt?, endsAt?, status?, owner?, goalId?, column? }` | Field edits; a *capture*; `endsAt < startsAt` → `422`; a status set through a board move uses the column's status |
| POST `/tasks/{id}/delegate` `{ to }` | Sets `owner`, `delegatedAt`, `delegated.state: "acknowledged"`, `work.state: "queued"`, and an activity entry `kind: "delegated"`; offline the app says "Delegation needs a connection" |
| GET `/agents` | The delegatee roster `AgentRoster`; the picker lists those with `canTakeTasks` (two or more → picker; one → none; zero → the verb is static with a reason) |
| POST `/tasks/{id}/complete` `{ includeSubtasks }` | Sets `status: "done"`, `completedAt`, `completedBy` (the caller), every open subtask done when `includeSubtasks`; one activity entry `kind: "completed"`; a *capture*; the ten-second undo reverses all of it |
| PATCH `/tasks/{id}/subtasks/{sid}` `{ title?, done?, owner?, delegatedTo? }` · DELETE `/tasks/{id}/subtasks/{sid}` | Subtask edit, toggle, reassign (a *capture*), delete (undoable) |
| GET `/tasks/{id}/usage` | `UsageSummary` for the task and its subtasks |
| GET `/tasks/{id}/files` | `Attachment[]` for the task and every subtask, newest first |
| GET `/tasks/columns` | `Column[]` mirroring Twenty's pipeline in Twenty's order; the app never writes columns |
| GET `/slicers` · PUT `/slicers` `{ slicers }` | The editable slicer row; the server evaluates `SlicerPredicate` from a table |
| `work` on tasks | Set while an agent run is active and cleared when it ends (§3) |

### §4.16 Usage
| Method and path | Purpose |
|---|---|
| GET `/usage?range=month\|all` | `UsageSummary` over the range (`month` default); Agents › Usage and its CSV copy read it. `totals` is by model and the summary carries its rows; the per-agent grouping happens in `jstack-app/lib/usage.ts` |
| Provenance | `costAud` is computed by the backend from the provider's usage fields (Q17); the app never prices tokens |

### §4.17 Files and deliverables
| Method and path | Purpose |
|---|---|
| GET `/files?q=&addedBy=&kind=&range=&taskId=` | The files archive; `q` searches name and `previewText` |
| GET `/files/{id}` | One `Attachment` with a fresh short-lived `url` when the backend holds a working copy, and `dropboxUrl`; the app opens `url` through the external-link confirmation, offers "Open in Dropbox", shows `previewText` in the text viewer and never caches `url` |
| POST `/files` (multipart: `file`, `taskId?`, `subtaskId?`, `captureId?`) | Stores the file in Dropbox under `/JSTACK/…`, indexes it, returns the `Attachment`; over the server's limit → `413`; a capture references it by `attachmentIds`; the app queues files up to 10 MB offline (Q23). A queued upload has no id yet, so a capture names it `offline:<offlineId>`; when that capture reaches the server before the upload does, the server keeps the reference and files the upload with the capture when it arrives (A4R8-03) |

### §4.18 Brain (extends §4.6)
| Method and path | Purpose |
|---|---|
| GET `/brain/replies?unread=` · PATCH `/brain/replies/{id}` `{ read }` | The EA's answers to captures that were questions; a server event `kind: "brain"` and a push `{ tab: "brain", ref }` announce a new one |
| GET `/brain/items/{id}` | A capture or transcript with its routing, for the `brain-item` detail |
| GET `/brain/search?q=` | Adds `matches` and `sourceIds` per result |
| GET `/memory/history?q=` | `MemoryHistoryEntry[]`, newest first; accepting or editing a memory proposal appends one (the mock does not yet: `KNOWN_GAPS.md`, MH-A) |
| GET `/chat/thread` | Today's `ChatThread`; `POST /chat` (§4.6) appends and replies |

### §4.19 Search
| Method and path | Purpose |
|---|---|
| GET `/search?q=&kinds=&focus=&sensitivity=&limit=` | `SearchResponse` across twelve kinds (task, subtask, brain, reply, file, decision, issue, learning, goal, habit, person, rule); silo-, focus- and clearance-scoped server-side — nothing outside the user's silos, nothing above the session's clearance; `sensitivity` filters within that; `limit` defaults to `search.maxResults`; offline the app refuses with the honest line |

### §4.20 Life (extends §4.7)
| Method and path | Purpose |
|---|---|
| GET `/goals?focus=` · PUT `/goals` `{ goals }` · GET `/goals/{id}` · GET `/goals/history` | `GET /goals` and the `/life` composite answer the ACTIVE set (`active`, `behind`); `done` and `dropped` are `/goals/history`. `GET /goals/{id}` answers `GoalComposite { goal, tasks, deliverables }`, the ids resolved server-side in the order the goal names them. **`PUT /goals` archives, never deletes**: a goal whose status becomes `done`/`dropped`, and one simply absent from the submitted list, is kept with a `history` entry the server appends and a brain item "Goal archived · <text>" (`source: "system"`); every goal already archived is carried through untouched. **Absence is judged only among the goals the caller may read**: a session can only submit what its silos let it see (MU-02), so every goal outside them is carried through untouched; a change to a goal the caller cannot read, or a new goal labelled in a silo it cannot read, is refused `403`. The backend appends `history`, updates `kpis[].value` from agent work and emits a `life` server event |
| POST `/tasks` `{ …, goalId }` · POST `/tasks/{id}/subtasks` | Create from a goal card |
| PUT `/habits` `{ habits }` | Archive, restore, rename, reorder; logs are never deleted. The route refuses a list with a habit missing from it (`422`, naming which): archiving (`archived: true`) is the only way off the list. `archivedAt` is stamped by the server on the archiving write and kept by later saves; a restore clears it; `sort` is renumbered from the list's order |
| GET `/learning/{id}` | The detail; `body` for `read` items |

### §4.21 Agents (extends §4.8)
| Method and path | Purpose |
|---|---|
| GET `/agents/issues/{id}` | One issue with `detail`, `lastSuccessAt` and its verbs, in any state (the list, §4.8, returns the open ones) |
| History rows | Open the `decision` detail from `GET /actions/{id}` (§4.3) |

### §4.22 Settings (extends §4.9)
| Method and path | Purpose |
|---|---|
| GET `/settings/autonomy/rules` · PUT `/settings/autonomy/rules` `{ rules }` | Rules for my EA (`AutonomyRule[]`), edited in Settings › Autonomy; Brain has no Rules section (ADR-56). PUT refuses a set with two rules sharing an id (`422`, naming which). `teach` on a card appends here with an id derived from the card, carrying the one line Josh typed (`TeachSheet.tsx`) as a free line — no classification travels with it — which V3's memory-curation agent classifies as a conflict, gap or improvement; a real backend keeps every version it replaces (§1.5) — a removal is a new entry, never a deletion (Josh, 15 Sep, Q4: "Append only. Memory will evolve over time, history matters."). What Teach writes is also memory-refinement information: V3's memory-curation agent (working name "librarian") is the consumer, not built in V2.3 (Josh, 15 Sep, P-7/Q2) |
| POST `/settings/autonomy/propose` `{ text? }` | Raises an `ActionItem` of `kind: "rule"` carrying the rule it would write; `approve` appends exactly that text with `on: true`, and the card's undo removes it |
| GET `/settings/voice` | `VoiceSettings` with `readAloud`, `brevity`, the speeds (0.8–2) and the silence options (the write is §4.9) |

### §4.23 Capture route and share-in (ADR-64)
| Method and path | Purpose |
|---|---|
| `/capture#text=&url=&title=` (an app route, not an API; the values travel in the URL fragment so no server, proxy or Shortcut log records them) | Lands the shared item in Brain's capture and sends it (`source: "share"`, the same validation as typed text; the lock gate still applies); the PWA `share_target` posts the title, text and link to the same route, and accepts no files; a file comes in through the attach control or the Dropbox inbox |
| Dropbox inbox `/JSTACK/Inbox/` | Files saved there by the iOS Shortcut are ingested as captures (`source: "share"`) and triaged |
| Triage card | A provisional filing arrives as `ActionItem { kind: "triage" }` in Needs you; ok keeps it, edit opens the item editor, later returns it, teach writes an autonomy rule (§4.22) |

### Mock-only routes (never in `openapi.yaml`; the rig's levers)
Matched before the route table and before the lock gate, in `jstack-app/data/mock/server.ts` (`TEST_ROUTES`, `TEST_PATTERNS`); no real backend serves them.

| Route | Purpose |
|---|---|
| POST `/__mirror__/telegram` `{ actionId, verb, option? }` | Answers a card `via: "telegram"` and emits a `ServerEvent { kind: "actions" }` — a demo of a second channel |
| POST `/__test__/user` `{ id }` · POST `/__test__/refresh-reuse` · POST `/__test__/revoke` | Switch the session user (Josh or Joce); arm a refresh-token reuse; revoke this device |
| POST `/__test__/work` `{ taskId, state }` · POST `/__test__/inbox` `{ name, kind, dataUrl? }` | Flip a task's `work.state` on the server; simulate a file arriving in the Dropbox inbox from the iOS Shortcut |
| GET `/__test__/files/{id}` | The bytes an upload stored |
| `window.__JSTACK__` (the test build only, `jstack-app/lib/testHook.ts`) | In-process levers, not routes: `reset("day2")`, `setClockOffsetMs`, `push`, `goOffline`/`goOnline`, `forceConflict`, `asUser`, `mic({ available, mime?, denied? })` and the rest; the production build has no `__JSTACK__` (SEC-01) |
| POST `/__test__/reset` · POST `/__test__/clock` on YOUR server | Only if you run the e2e suite against your server: a test build with `EXPO_PUBLIC_USE_API_ADAPTER=1` sends `reset` and the clock offset to the API's origin (`jstack-app/lib/testHook.ts`, `jstack-app/e2e/helpers.ts`). Never in production |

## §5. Feeds and timing

| Feed | Serves | Source | Endpoints | When |
|---|---|---|---|---|
| Action records with options, recommendation, why, expiry, then-what, state history | Needs you, Telegram, history | EA writes; app and Telegram resolve | §4.3 | V2 |
| Delegation: child tasks, progress, cost, report; EA edits with reason; repeat rules | Tasks, detail, schedules | Twenty plus run log; EA skill; n8n | §4.5, §4.15, §4.9 | V2, V2.2 |
| Focus definitions and labels on every record, including calendar | Focus switcher, Review | Silo and project labels; focus config | `?focus=`, §4.9 | V2 |
| Calendar read and write-back; free-gap proposals | Today calendar | Google through the backend | §4.4 | V2 |
| Push subscriptions per device; notification groups; server events | Notifications, every composite | Backend push service; n8n for Telegram | §4.9, §4.13 | V2, V2.1 |
| Memory proposals and history, autonomy and the rules for the EA | Brain, Teach, Settings | Librarian queue; versioned vault files | §4.6, §4.18, §4.9, §4.22 | V2, V2.2 |
| People items; Life section templates and config; EA section proposals | Life, Arrange, Needs you | Twenty people plus EA extraction; config records | §4.7, §4.10 | V2, V2.1 |
| Journal prompt; review aggregates | Close the day; Review | EA at 19:00; n8n on request | §4.2 | V2 |
| Schedules and heartbeat; portals; voice settings | Settings, Agents | OpenClaw cron and watchdog; config records | §4.8, §4.9, §4.22 | V2 |
| Emergency lock, recovery, secret rotation | Emergency lock | Backend endpoints; vault; REMAP's runbook | §4.1 | V2 |
| Security check statuses and every failed or unrun check | Agents | Watchdog, suites, canaries, secrets scan, restore drill, session store | §4.8, §4.21 | V2 |
| Layout records per tab with history | Arrange | Config records; EA proposals with reason | §4.9 | V2 |
| Two-way voice session | Brain › Talk with EA, car mode | Streaming provider (REMAP's choice) | §4.11 | client V2.1; server when chosen |
| Sync status and `since` deltas | Delta line, offline replay | Backend | §4.12 | V2.1 |
| Session user and silos | Watermark, silo scoping, From Joce | Auth service | `GET /session` | V2.1 (mock), V3 (a real second user) |
| Parameters and EA proposals | Settings › Security, decision cards | Config records; EA skill | §4.14 | V2.2 (mock), backend at go-live |
| Task edits, completion, subtasks; board columns | Task card, List, Board, Gantt, Done | Twenty (tasks and the pipeline field) | §4.15 | V2.2 (mock), backend at go-live |
| Usage | Task card activity, Agents › Usage | Provider usage fields via the backend | §4.16 | V2.2 (mock), backend at go-live |
| Files | Task card, Brain › Files, Find | Dropbox (the record) + Postgres index | §4.17 | V2.2 (mock), backend at go-live |
| Replies and triage | Brain › Replies, Today › From your EA, push, Needs you | EA skill; the default agent | §4.18, §4.23 | V2.2 (mock), backend at go-live |
| Global search | Find | Postgres full-text (or the memory layer's index) | §4.19 | V2.2 (mock), backend at go-live |
| Goals, habit history, learning | Life | Config records; habit logs | §4.20 | V2.2 (mock), backend at go-live |
| Finance feed | Money | Redbark or PocketSmith; Amex by statement | §4.7 | later |
| Helped-or-misled report | Brain › Memory | Librarian weekly from run logs | §4.6 hitrate | later |
| Family tenant and second user | Tasks from Joce, Family focus | Per-user auth, silo-scoped reads | §4.1 | V3 |

## §6. CONTRACT_MAP

The endpoint family → system of record → screen → acceptance IDs → marker table is `CONTRACT_MAP.md` at the repository root, kept identical to its sources by `jstack-app/tests/unit/contract.test.ts` and `jstack-app/tests/unit/openapi.test.ts`.

## §7. Mock server semantics the developer must match

The in-process mock (`jstack-app/data/mock/server.ts`, `jstack-app/data/mock/handlers/`) is the executable half of this contract. It:

- ranks open cards by `rank`, caps at 5, and expires cards past the clock applying `thenWhat`; holds a 10-second undo window per answered card, `409` after, and an undo reverts exactly what the verb wrote — the parameter it set, the rule it appended — and nothing else: every card effect records what it WROTE, and `POST /actions/{id}/undo` takes back exactly that, from the card's LATEST answer. `POST /actions/{id}/reopen` (a mock addition, A-31) takes the answer back the same way outside the window and opens the card again; an answer given after a reopen writes the card's rule under its id again, never a second beside it — and never over a rule that stands under that id and says something else. Every revert takes back only what still holds its own write: a parameter is put back only while it still holds the value the answer wrote, and a rule is removed only while it still says what the answer wrote (text, scope, mode, on) — a value or a rule Josh changed since is his, and an answer given after a reopen writes nothing over a rule he rewrote. An agent-issue verb's undo restores what THAT press overwrote, the issue and its security check together, inside ten seconds, and answers `409` after, or when either has changed since the press;
- acknowledges delegation within one tick and creates the child task; derives `AgentSummary` from the runs table on every read;
- versions rules, proposals, drafts, layouts and section configs, never deleting; applies `?focus=` on every noun;
- rejects hiding a pinned section (`422`), an EA layout without a reason or one that re-shows a Josh-hidden section (`422`), a locked notification group (`423`), a late undo (`409`), a `t1` read (`403`); validates every request body against `openapi.yaml` (`422 { field, reason }`; `jstack-app/data/mock/validateBody.ts`); refuses every write while the session is locked (`401`);
- validates section proposals exactly as §4.10 and generates the catalogue from `jstack-app/layout/catalogue.tsx`;
- dedupes capture writes on `offlineId` for the life of the db and computes `?since=` deltas from each record's `changedAt`. The two captures that mint their record's id from their `offlineId` do so (a journal line is `journal-<offlineId>`, as a dump is `dump-<offlineId>`), so a replay can never file two under one id (a task created offline is numbered like any other, and an upload is found again through its `offlineId`); an upload is deduped by the `offlineId` its multipart FIELDS carry; a capture's `attachmentIds` may name a file queued with it as `offline:<that upload's offlineId>`, which the server resolves to the file the upload created (the upload replays first) — or, when the capture went through before its upload, keeps the reference and files the upload with the capture when it arrives (A4R8-03); and a completion of a task already done answers the task as it is and writes nothing twice;
- carries an event channel on which the Telegram mirror, delegation completion (day 2), expiry and new replies emit;
- seeds day 1 and `reset("day2")`, from `jstack-app/data/mock/fixtures/*.json`, date-shifted to today on reset and daily; `db.now()`, day keys and the fixtures' shift follow the device zone through `lib/time.ts`, and no fixture or handler composes a clock string;
- defaults the session user to Josh, with `/__test__/user` switching to Joce and her silos;
- seeds the six parameters and validates their ranges; `propose` raises the card exactly as the section proposal does, with the same five verbs;
- triages `POST /brain/dump` with a keyword rule (verbs and dates → task/twenty; "felt", "energy" → journal; names and facts → memory; a trailing "?" → question) and the label rules' sensitivity;
- resolves `range.preset: "default"` to `all` on Done and to `next` on the open views; evaluates the slicer table; returns `?view=gantt` as the same filtered set with `startsAt`/`endsAt`; sets `work.state` on t2 on day 1 and clears it with a `run` activity on day 2;
- serves five columns (Now, Next, In progress, Waiting, Done) from `columns.json`; a board move sets `column`, sets `status` only where the column has exactly one status, and a move into the done column goes through `complete`;
- seeds the roster (EA and Dev, `canTakeTasks: true`), usage for t2, t9 and the day-2 finished delegation (a fixed `costAud` per row), ten attachments (every one `storage: "dropbox"` with a `folder` under `/JSTACK/`, three with `previewText`, one per `addedBy`), two replies (one unread; a dump ending in `?` creates a reply after 1.5 s and emits `brain`), four memory-history entries, the rules fixture as the autonomy rules;
- runs share-in (the capture route and the Dropbox inbox) down one path, `jstack-app/data/mock/ingest.ts`: extract, triage, standing rules, card — a card only if the filing is still provisional after all four; `extract.json` seeds four pages including one that asks to be obeyed, and its text is never an input to a filing, a rule, a memory or a verb; `teach` on a triage card appends a rule composed from the host and the routing;
- tokenises every fixture record of the twelve search kinds at reset (lower-cased, punctuation stripped, prefix match on tokens of three or more characters), respects `inSilo` and the active focus, and returns groups in the order task, brain, reply, file, decision, issue, learning, goal, habit, person, rule, subtask, with `matches` as character ranges in the snippet;
- archives on `PUT /goals` and keeps every earlier archive; refuses `PUT /habits` with a habit missing and keeps every log; computes `habits/stats` from 184 seeded days; refuses `PUT /settings/autonomy/rules` with a duplicate id;
- answers `delegate` and `search` only online; `complete` and the subtask routes are captures.

## §8. Open questions for REMAP (each with the answer the app assumes)

1. **Focus labels.** Can every calendar event and captured item carry a focus or project label in the memory layer, set by the EA on ingest and editable by Josh? Assumed yes.
2. **Exit pack.** Does the fixed core include `POST /export`? Assumed yes; REMAP to confirm, or say what it would take.
3. **Recovery.** Who owns the recovery-key ceremony (`POST /recover`) and the respin runbook? REMAP per the brief; confirm the endpoint shape.
4. **Streaming voice provider.** The developer's choice; flag options to Josh.
5. **Push service.** Web Push with VAPID from the backend, or APNs only at the phone build? The client ships Web Push (`jstack-app/public/sw.js`).
6. **Voice audio.** Is `speak` audio returned by reference or streamed? The client plays an `audioRef` it can fetch and otherwise speaks the text locally.
7. **Section proposals.** Does the EA skill produce `SectionConfig` directly, or a brief the backend turns into one? The app accepts only the config.
8. **Rate limits** on `/auth/*`, `/recover`, `/brain/dump` and `/chat`? Assumed yes, per device and per IP, `429 { retryAfter }`, shown as the honest line.
9. **Web refresh-token custody?** Assumed an httpOnly Secure SameSite=Strict cookie the app never sees; native keeps the Keychain.
10. **Request validation?** Assumed every body validated against `openapi.yaml`, `422 { field, reason }`, matching the mock.
11. **Token binding?** A per-device WebCrypto key signing each request is an option the app can ship in V3 if REMAP verifies it. Not assumed.
12. **Session lifetime?** Assumed 12 hours absolute, 15-minute access tokens. The app is meant to relock on `401`; today only a refresh the server answers as reuse locks (ID-04), any other `401` fails its call, and that relock, with the token refresh, is REMAP's (`KNOWN_GAPS.md`).
13. **Audit log** of high-risk actions with actor, device and nonce? Assumed yes, readable through Agents › Decision history.
14. **Host level:** WAF or bot protection, TLS 1.2+, HSTS preload, the CSP in `jstack-app/public/_headers`? Assumed the host applies the committed headers unchanged — widened only by the API's own origin in `connect-src` if the API is not same-origin.
15. **Display time zone.** Answered 7 Sep: the device's zone (ADR-47). The backend sends every timestamp as ISO 8601 with an offset and composes no clock strings.
16. **File storage.** Closed 7 Sep (Josh): Dropbox is the record for every file, Josh's uploads and the EA's deliverables alike, under `/JSTACK/` (uploads beside their capture or task; deliverables under `/JSTACK/Deliverables/<year>/<task>/`; shared images under `/JSTACK/Inbox/`). Assumed: the backend writes through the Dropbox API, indexes the folder (metadata, extracted text) in Postgres, watches `/JSTACK/Inbox/`, and serves `dropboxUrl`; the EA and `/search` answer from the index. Andy may still object on cost or latency; the app is agnostic in code.
17. **Usage accounting.** Assumed: every agent run records the provider's usage fields (input, output, cache-read tokens, model id) per task and subtask and prices them server-side into `costAud` with a versioned price table; the app shows what it is given.
18. **Twenty columns.** Assumed: `GET /tasks/columns` mirrors Twenty's kanban field values in Twenty's order and a status change from a board move writes the corresponding Twenty field; column edits happen only in Twenty.
19. **Speech capture on iOS.** The client records `audio/mp4` on Safari and `audio/webm;codecs=opus` elsewhere (chosen by `MediaRecorder.isTypeSupported`). Assumed: the voice provider accepts both, or the backend transcodes.
20. **The backend beyond the client's mirror.** `openapi.yaml` describes what the app calls. Assumed, and restated in `HANDOVER.md`: **auth** end to end — passkey registration and assertion (§4.1), a refresh token in an httpOnly cookie (Q9) rotated with reuse detection, and a 15-minute access token the app sends as `authorization: Bearer`, obtained by the function you write in `AUTH.getToken()` (`jstack-app/data/config.ts`, a stub returning `null` today); **errors** — `401`, `403`, `409`, `413`, `422`, `423`, `429`, each with a JSON body carrying `reason` (and `field` on `422`, `retryAfter` on `429`, `server` on a replay `409`); **pagination** — none at go-live: the app reads each list whole and sends no cursor (only `/search` takes `limit`, defaulting to `search.maxResults`), so a server that must page `/files`, `/search`, `/usage`, `/memory/history` or `/goals/history` returns the first page and following a cursor is a client change (`KNOWN_GAPS.md`); **latency** — assumed under 5 s per request; the client abandons one after 15 s (60 s for an upload) — `jstack-app/data/transport/http.ts`'s own `AbortController`, `EXPO_PUBLIC_API_TIMEOUT_MS` overriding the ordinary figure (D-4) — surfacing as the same network failure the outbox already queues a write against, never a silent, unretried hang.
21. **Capture triage.** Assumed: the default agent triages every capture and returns `routing` with the capture's response for typed captures (under two seconds) or by a `brain` server event when slower; a question yields a `Reply`; the app shows the routing and never triages itself.
22. **Share extension.** The iOS share sheet's app row needs a native share extension; assumed for the native track (a native Xcode build); until then the Shortcut described in `HANDOVER.md` carries text and links to `/capture` and images to `/JSTACK/Inbox/`. The extension will call the same capture route and `POST /files`.
23. **Upload limits and offline.** Assumed: `POST /files` accepts up to 25 MB; the app queues files up to 10 MB offline and asks for a connection above that.
24. **Ingestion screening** (Josh, 7 Sep: "this is an attack vector for prompt injection"). How is scraped content screened before any agent with tools or memory access sees it — a dedicated screening agent, an n8n ingestion workflow, a backend rule set, or a combination? Which domains are allow-listed, what size caps, how are YouTube transcripts fetched, is the extracted text ever shown to the EA unquoted? Assumed until decided: a tool-less extract-and-sanitise step writes `extractedText` tagged untrusted; the EA quotes it and never obeys it; the app renders it text-only and shows what was extracted on the triage card.

## RETIRED

Rules, routes and headings of the three versioned contracts that are not carried into the text above, each with the reason. Everything else in them is folded into its numbered section.

| What | Where it was | Why it is gone |
|---|---|---|
| Server-composed display strings in Australia/Brisbane and en-AU; the app's fixed +10:00 | `history/v2/CONTRACT_v2.md` §1.11, `history/v21/CONTRACT_v21.md` §1.11 | ADR-47: the device's zone is the single basis and the server composes no clock strings (§1.15); the timestamp rule stays as §1.11 |
| GET `/tasks/gantt` and `gantt: { start, end }` on tasks | `history/v2/CONTRACT_v2.md` §4.5 and §3 | ADR-46 and row F-1: the Gantt reads `GET /tasks?view=gantt` with the shared filters; `startsAt`/`endsAt` replace the pair |
| `boardColumn` on tasks | `history/v2/CONTRACT_v2.md` §3 | Replaced by `column`, Twenty's kanban value (§4.15) |
| `Rule` and GET `/rules` · POST `/rules` · PUT `/rules/{id}` · DELETE `/rules/{id}` | `history/v2/CONTRACT_v2.md` §4.6 and §3 | ADR-56 and row ST-1: a rule taught from a card and one written in Settings are the same `AutonomyRule` record (§4.22) |
| `producedBy` on attachments; `TaskReport.files` | `history/v22/CONTRACT_v22.md` §3, `history/v2/CONTRACT_v2.md` §3 | `addedBy` replaces `producedBy`; files are `Attachment` records (§4.17) |
| `routed: string[]` as the capture's filing | `history/v2/CONTRACT_v2.md` §3 | `routing` replaces it (resolution #50); `routed` is still sent for older fixtures and is display-only |
| `DecisionDetail` as a separate response | `history/v22/CONTRACT_v22.md` §3, §4.21 | GET `/actions/{id}` answers the `ActionItem` with its history and receipt; no second shape was built |
| POST `/__test__/reset`, `/__test__/clock`, `/__test__/push` as the mock's HTTP rig; POST `/__test__/reply` | `history/v2/CONTRACT_v2.md` and `history/v21/CONTRACT_v21.md` mock-only routes, `history/v22/CONTRACT_v22.md` mock-only routes | The in-process mock takes these as `__JSTACK__` levers (`jstack-app/lib/testHook.ts`); a reply is raised by a dump ending in `?`, not a route. The routes the mock does serve are listed above |
| POST `/settings/autonomy/propose` `{ rule, reason }` | `history/v22/CONTRACT_v22.md` §4.22, second row | The route takes `{ text? }` (row ST-1, `AutonomyProposeBody` in `data/types.ts`); the first row of that table is the one built |
| Heading "Hardening questions for REMAP" | `history/v21/CONTRACT_v21.md` §8 | Folded into §8 as questions 8–14, numbered with the rest |
| Headings "§N additions · …" | `history/v21/CONTRACT_v21.md`, `history/v22/CONTRACT_v22.md` | Folded into the numbered section §N they add to |
