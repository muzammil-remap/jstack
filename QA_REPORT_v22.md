# QA_REPORT_v22.md — JSTACK V2.2

**Status: COMPLETE.** This file was opened at row T2-1 with §2, the `LV-01..LV-10` self-check,
because that is the row that owed it (`17_CC_V22_EXEC_PROMPT.md` §C). §1 — every V2, V2.1 and
V2.2 acceptance ID with a status and an evidence path — was **row T2-2's**, and §3 the board. The
completion statement below could not be written until the audit signed off, and
`tests/unit/qaReport22.test.ts` held that both ways: it asserted the statement's ABSENCE until A-6,
and asserts now that it is here and that `AUDIT_v22.md`'s **last** verdict is a sign-off.

## Completion statement

Every acceptance ID of `02_ACCEPTANCE_TESTS_v2.md` (166), `02_ACCEPTANCE_TESTS_v21.md` (123) and
`02_ACCEPTANCE_TESTS_v22.md` (190), together with Josh's six `JQ` rows and the fifteen `CD` rows
carried from V2.1, is judged in §1 above — **211 rows: 199 PASS, 11 PARTIAL, one DEVIATION** — on
the PRODUCTION web build at 393, 1024, 1366 and 1920 in both themes, on both fixture days, in the
native Jest lane, with `node tools/conformance.mjs` green against the mock over HTTP. The template
this statement is written from says "every acceptance ID passes", and that is not what this report
found: **PARTIAL** means no test file quotes that ID — the behaviour may be built and usually is —
and all twenty are named in §1 rather than buried, with the one DEVIATION declared beside them.
Writing "every ID passes" over a table that says otherwise is the failure this report spent four
audit findings correcting in itself.

The independent **qa-auditor (Claude Opus 5)** signed `AUDIT_v22.md`: eleven A-4 rounds, then two
invocations outside that cap, the last of them dated after the final code commit and reproducing
this board. The **ux-reviewer** ran four rounds on the device pass; its last verdict is
`DEFECTS FOUND`, and everything it named is either fixed in `BUGLOG_v22.md` or carried in
`CARRIED_DEFECTS_v22.md` with an owner. That verdict line is carried as **D-1** rather than dressed
up: a round that finds something worth fixing causes the fix, and the fix re-takes the pass that
round judged, so the frames that ship are always one version ahead of the last eye on them. The
build bounded its own instance of that — the final pass differs from the reviewed one by two files.

A fresh instance ran the app from `HANDOVER.md` alone and added an endpoint by the CODEMAP recipe
without asking a question (`jstack-app/evidence/cold-start-2026-09-12.md`). **257 bugs found and
fixed**, each with the test that was red before the fix; **ten mutation seams** driven red→green
and re-proved at A-6 (`jstack-app/evidence/mutation-pass.json`); the simplification pass ran
sixteen rows and left its report (`SIMPLIFICATION_v22.md`). **Zero console errors** across the
1,058 e2e tests, asserted on every one of them rather than where a spec remembers to.

`main` holds this tree at tag `v2.2`; `jstack-mock-v14.html` is the built app on fixture data,
stamped with the source fingerprint it was built from. What remains is REMAP's backend per
`CONTRACT.md` — checked with `node jstack-app/tools/conformance.mjs <BASE_URL>` — the server-side
security of Q8–Q14 and Q20, and Josh's phone check from `DEVICE_RUNBOOK.md`.

## §0. Conventions

**v2.3 (15 September 2026).** This report stays the acceptance record for v2.3, under its own name, because the guards parse it. Nine rows moved from PARTIAL to PASS in v2.3, each with a test that quotes it: UP-10, MC-05, MC-10, OP-08, BN-02, LL-01 and BN-04 at WP-C, and LL-03 and CL-04 at WP-G; the completion statement's tally counts them. §3's Jest and e2e lines are this tree's: the v2.3 board ran on the fixed tree on 15 September, and its evidence (`jstack-app/evidence/e2e-summary.json`) was committed at `399cea16`; the summaries in the tree now are the 16 September board's (the board commit's, named by `git log -1 -- jstack-app/evidence/`).

**Statuses are four literals and nothing else:** `PASS` · `PARTIAL` · `DEVIATION` · `STAGE 6`.
(V2.1's report used `STAGE 4` for the same idea — work deferred to the audit stage. The V2.2
stage that owes it is Stage 6, so the token is `STAGE 6`; `tests/unit/handover.test.ts` reads
the token, and T2-2's guard for this file is written against these four.)

**Evidence cites test TITLES, never line numbers.** By round 7 of the V2 audit, thirty-nine of
a hundred and thirteen line-numbered pointers in `QA_REPORT_v2.md` named a different test than
the row claimed — line numbers rot the moment anything above them moves. A title moves with the
code it names. `tests/unit/qa-citations.test.ts` is the guard for the V2 report and T2-2 adds
the equivalent here.

**Every row names a file that exists and QUOTES its ID.** A row that cannot be proven names the
document recording why instead. Neither `02_ACCEPTANCE_TESTS_v22.md` nor this file counts as
evidence for anything: both quote every ID by construction, which proves nothing.

## §1. Every acceptance ID

### How this table was built, and what a status means

**The rows are GENERATED, not typed** (`node tools/qa-rows.mjs`). 211 rows typed by hand is 211
chances to name a test that is not there — and that is not hypothetical: by round 7 of the V2
audit, thirty-nine of a hundred and thirteen hand-written pointers in `QA_REPORT_v2.md` named a
different test than their row claimed. Every evidence path below was found by SEARCHING the tree
for the ID, so no row can cite a file that does not quote it.

The four statuses (§0 has the vocabulary):

- **PASS** — a test or spec file quotes the ID, and the board in §3 is green. The board is what
  proves it passes; the citation is what says where to look. Where an ID's check delegates to
  another ID rather than owning a test ("OP-07 covers Brain's rows"), the row cites the delegate's
  file and says `via <ID>`.
- **STAGE 6** — the ID belongs to a stage that has not run: REMAP consolidation (A-5), the
  release (A-7), or the Stage 5d simplification pass. It names the file that stage writes. The
  capture pass (A-2) has run, so QA-07 and LV-09 are PASS below.
- **DEVIATION** — the behaviour is RECORDED as departing from the row, with the reason, rather
  than flattened to PASS because a test happens to name the ID. One row carries it (`LV-07`), and
  it is declared once in `tools/qa-rows.mjs`'s `DEVIATION_IDS` so §1 and §2 cannot disagree
  (A4R2-05).
- **PARTIAL** — **no test file quotes this ID.** Eleven rows carry it, listed below. The behaviour
  may work perfectly; what is absent is the gate that says so, and calling that PASS is exactly
  the "claim without a gate" of hard rule 15.

### The eleven PARTIAL rows, named rather than buried

`SP-03` · `SP-04` · `RM-04` · `RM-05` · `LV-10` · `QA-04` · `QA-05` · `CD-06` · `CD-07` · `CD-08` · `CD-15`

Seven of them — `SP-03`, `SP-04`, `RM-04`, `RM-05`, `LV-10`, `QA-04`, `QA-05` — arrived at A-6, when
emptying the STAGE 6 sets (A-169) moved rows that had been "a stage that has not run" onto the status
their evidence actually earns. The sentence that counts them did not move with them until the A-6
re-audit read it (D11), and `tests/unit/qaReport22.test.ts` now holds this count and this list against
the table itself.

The last four arrived when §3's IDs were brought into this table at A4R2-08 — Josh's six `JQ`
rows and the fifteen `CD` rows carried from V2.1 had no status ANYWHERE in this report, though
its own opening scopes it to every acceptance ID and `CODEMAP.md` §1 names §3 as part of the
truth. Seventeen of the twenty-one came in PASS. The four here are findable under the
underlying defect's name rather than under the CD id, which is a traceability gap, not an
absent behaviour — and it is stated rather than smoothed over.

These are the ones Stage 6 A-1's auditor should go at first. Two shapes are mixed in them and they
deserve different treatment: some are umbrella claims whose delegates could not be resolved
automatically, and some are behaviours that really do have no test naming them. Neither was
resolved here, because guessing which is which is how an ID gets marked PASS on a hunch.

### V2 (166) and V2.1 (123) — a deviation, stated

**Their per-ID rows are NOT copied into this file.** `QA_REPORT_v2.md` and `QA_REPORT_v21.md`
already carry all 289 with statuses and evidence, and duplicating them into a third document is
precisely "a second copy is a copy that drifts" (hard rule 16) — the two would disagree at the
first fix and nothing would say which was right. What holds them is that every V2 and V2.1 suite
runs in this build's board and is green, and `tests/unit/handover.test.ts` asserts both reports
still carry a row for every ID in their own acceptance tables.

If Stage 6's auditor wants the three merged into one table, A-5's consolidation is the row that
should do it, once — not T2-2 making a copy that A-5 then has to reconcile.

### The V2.2 rows

| ID | Status | Check | Evidence |
|---|---|---|---|
| LK-01 | PASS | On a touch device (`maxTouchPoints > 0`, or native) hiding the app or locking the screen locks the app at once and the passkey reopens it (`lock.lockOnHideTouch`, default true); on… | `e2e/core/lock.spec.ts`, `e2e/core/shell.spec.ts`, `e2e/matrix/theme.spec.ts` |
| LK-02 | PASS | The six parameters are one typed table; `pnpm codemap` generates `PARAMETERS.md` (key, default, range, used by, how to change, how the EA proposes) and the drift test fails when it is… | `e2e/core/lock.spec.ts`, `tests/unit/codemap.test.ts`, `tests/unit/parameters.test.ts` |
| LK-03 | PASS | The lock timeout is editable (1–60 minutes); a value outside the range shows the honest line and the mock returns `422 { field: "value" }` | `e2e/core/lock.spec.ts`, `e2e/core/share.spec.ts`, `tests/unit/parameters.test.ts` |
| LK-04 | PASS | `POST /parameters/propose` yields a card `kind: "parameter"` showing key, current, proposed and reason; Approve applies the value (Settings reads it) with the ten-second undo; Never… | `e2e/core/lock.spec.ts`, `e2e/core/settings.spec.ts`, `tests/unit/parameters.test.ts` |
| LK-05 | PASS | Emergency lock, `session.revoked`, refresh reuse and a `401` still lock immediately regardless of the parameter | `e2e/core/lock.spec.ts`, `tests/unit/parameters.test.ts` |
| TK-01 | PASS | `Task` carries `startsAt`, `endsAt`, `completedAt`, `completedBy`, `delegatedAt`, `goalId`, `work`, `metaParts`; `gantt` is gone from the type, the schema and every fixture; `Subtask` is… | `e2e/core/tasks.spec.ts`, `e2e/matrix/tasks.spec.ts`, `tests/unit/taskEdit.test.ts` |
| TK-02 | PASS | Priority is a three-way control on the card; changing it PATCHes and the row's priority mark updates without a reload | `e2e/core/task-detail.spec.ts`, `e2e/core/tasks.spec.ts`, `tests/unit/taskEdit.test.ts` |
| TK-03 | PASS | Start and end are `DateTimeField`s; picking a day with no time fills 9:00am (start) and 5:00pm (end); an end before the start shows the honest line and keeps the old value (mock `422`) | `e2e/core/task-detail.spec.ts`, `e2e/core/tasks.spec.ts`, `tests/unit/taskEdit.test.ts` |
| TK-04 | PASS | Tapping the title edits it in place through `Field`; blur saves; empty is refused with the honest line | `e2e/core/task-detail.spec.ts`, `e2e/core/tasks.spec.ts`, `tests/unit/taskEdit.test.ts` |
| TK-05 | PASS | A field edit made offline shows the queued line, replays on reconnect, and a forced `409` lists the local value under Settings › Sync (`context.setOffline`) | `e2e/core/task-detail.spec.ts`, `e2e/core/tasks.spec.ts`, `e2e/matrix/tasks.spec.ts` |
| TK-06 | PASS | "Delegate to EA" delegates the whole task: `owner`, `delegatedAt`, `delegated.state`, `work.state: "queued"` set; the delegated marker appears on the row, the card header, the board card… | `e2e/core/task-detail.spec.ts`, `e2e/core/tasks.spec.ts`, `tests/unit/delegation.test.ts` |
| TK-07 | PASS | With two or more delegatees in `GET /agents` (+ the dev), the verb opens a picker with the default pre-selected; one tap sends; with one delegatee no picker appears (`GET /agents` is… | `e2e/core/task-detail.spec.ts`, `e2e/core/tasks.spec.ts` |
| TK-08 | PASS | The subtask checkbox toggles (`PATCH …/subtasks/{sid}`), optimistic, undoable, queued offline | `e2e/core/task-detail.spec.ts`, `tests/unit/delegation.test.ts`, `tests/unit/taskEdit.test.ts` |
| TK-09 | PASS | Each subtask's ⋮ menu offers Edit, Change delegation, Delete; Edit saves a title; Change delegation sets `owner` and the EA tag; Delete removes with the undo toast and reverts on undo | `e2e/core/task-detail.spec.ts`, `tests/unit/delegation.test.ts` |
| TK-10 | PASS | Ticking a task with open subtasks opens the confirm dialog naming the count; "Yes, complete all" (the default, primary) completes task and subtasks; "No, open the task" opens the card… | `e2e/core/board.spec.ts`, `e2e/core/task-detail.spec.ts`, `e2e/core/tasks.spec.ts` |
| TK-11 | PASS | "Complete all subtasks" on the card completes everything with `completedAt` and `completedBy: "josh"` and writes one activity entry "Completed · Josh · <formatWhen>"; undo reopens task… | `e2e/core/task-detail.spec.ts`, `e2e/core/tasks.spec.ts`, `tests/unit/completion.test.ts` |
| TK-12 | PASS | A task the EA completed shows "Completed · EA · <when>" from `completedBy: "ea"` (Done rows carry "Completed · formatWhen(completedAt)") | `e2e/core/task-detail.spec.ts`, `e2e/core/tasks.spec.ts`, `tests/unit/completion.test.ts` |
| TK-13 | PASS | Every timestamp on the card (activity, completed, delegated, start, end) renders through `formatWhen`/`formatSpan`; no raw `at` string appears (sweep) | `e2e/core/task-detail.spec.ts`, `e2e/core/tasks.spec.ts`, `tests/unit/completion.test.ts` |
| WK-01 | PASS | `work: { agentId, state, since, step? }` exists on the wire; t2 is `running` since 2:14am on day 1 and cleared on day 2 with a `run` activity entry | `tests/unit/work.test.ts` |
| WK-02 | PASS | A task with `work.state: "running"` shows "EA working · since 2:14am" and the 8 px pulse (`data-animating="on"`); `queued` shows "EA · queued"; `blocked` shows "EA · blocked · <step>" in… | `e2e/core/tasks.spec.ts`, `tests/unit/work.test.ts` |
| WK-03 | PASS | The board card and the Gantt bar carry the same marker; `/__test__/work` flipping the state updates all three without a reload (server event `tasks`) | `e2e/core/tasks.spec.ts`, `tests/unit/work.test.ts` |
| WK-04 | PASS | When the run ends the marker clears and the activity shows the run with its usage line | `tests/unit/work.test.ts` |
| US-01 | PASS | Each agent run shows "EA · <model> · <in> in · <out> out · $<cost> · <when>" from `GET /tasks/{id}/usage`; numbers are formatted with thousands separators | `e2e/core/task-detail.spec.ts`, `tests/unit/usage.test.ts` |
| US-02 | PASS | A subtask's runs list under the subtask; a completed task shows the total line "Total · N models · <tokens> tokens · $<cost>" | `e2e/core/task-detail.spec.ts`, `tests/unit/usage.test.ts` |
| US-03 | PASS | A configured section shows the month's totals by agent and by model (`stats`) and the tasks the agents worked on, **newest first with the cost shown** (`rows`), each opening the task;… | `e2e/core/agents.spec.ts`, `tests/unit/usage.test.ts` |
| US-04 | PASS | "Copy as CSV" puts `taskId,subtaskId,agent,model,in,out,cost,at` rows on the clipboard as text; a toast confirms the row count | `e2e/core/agents.spec.ts`, `tests/unit/usage.test.ts` |
| US-05 | PASS | No price table or token-to-cost arithmetic exists in the app (a grep guard over `lib/`, `stores/`, `components/` for `perToken`, `pricePer`, `* 0.00`); `costAud` is displayed as received | `tests/unit/usage.test.ts` |
| TF-01 | PASS | The range chip is the first item of the slicer row and always visible; default "Next 90 days" on List, Board and Gantt and "All time" on Done (Josh, 7 Sep); the day windows follow… | `e2e/core/tasks.spec.ts`, `tests/unit/predicates.test.ts`, `tests/unit/slicers.test.ts` |
| TF-02 | PASS | Tapping opens the presets (This week, Next 30, Next 90, Last 90, All, Custom); Custom shows two date fields; the chip label updates ("11 Sep – 30 Nov") | `e2e/core/tasks.spec.ts`, `tests/unit/taskRange.test.ts` |
| TF-03 | PASS | Owner chips show people as an initial-in-a-circle with the name and agents with the EA mark and the name; Josh and EA are on by default; statuses read "In progress", never `in_progress` | `e2e/core/tasks.spec.ts` |
| TF-04 | PASS | With a filter applied and the panel closed, a chip row under the slicer shows every active filter; tapping a chip removes that filter; the filter button shows the count | `e2e/core/tasks.spec.ts` |
| TF-05 | PASS | The slicer row with the same items appears on all four views and filters each | `e2e/core/tasks.spec.ts` |
| TF-06 | PASS | Slicers come from `GET /slicers`; the tune button opens `ChipSetEditDialog` (the same component as focuses) to add, rename, reorder and remove; a `fixed` slicer cannot be removed; a new… | `e2e/core/tasks.spec.ts`, `tests/unit/predicates.test.ts`, `tests/unit/slicers.test.ts` |
| TF-07 | PASS | "Clear" appears at the right end, left of the filter button, only when a slicer, a filter or a non-default range is active; one tap resets all three and hides itself | `e2e/core/tasks.spec.ts`, `tests/unit/taskRange.test.ts` |
| TF-08 | PASS | Setting a focus and the Waiting slicer shows the same task set on List, Board, Done and Gantt (ids compared); `GET /tasks/gantt` no longer exists in `routes.ts` (List, Board and Gantt… | `e2e/core/tasks.spec.ts`, `tests/unit/slicers.test.ts` |
| TF-09 | PASS | `serializeFilters` carries `range` and `columns`; the mock evaluates `SlicerPredicate` from a table; a predicate kind missing from the table fails a unit test | `tests/unit/predicates.test.ts`, `tests/unit/taskRange.test.ts` |
| BD-01 | PASS | Columns come from `GET /tasks/columns` in server order (five in the fixture, including "In progress"); a task with `status: "in_progress"` is visible in that column; no client-side… | `e2e/core/board.spec.ts`, `e2e/core/tasks.spec.ts`, `e2e/matrix/tasks.spec.ts` |
| BD-02 | PASS | `filters.columns` is the visible set (absent = all); the hidden set persists with the other filters and shows as an active chip | `e2e/core/board.spec.ts` |
| BD-03 | PASS | "Columns · edit in Twenty" opens the external-link confirmation; "Refresh" refetches the columns | `e2e/core/board.spec.ts` |
| BD-04 | PASS | Dragging a card to another column (`mouse.down/move/up`) sends `PATCH { status }` with the column's first status, moves the card, shows the undo toast; undo moves it back (a move into… | `e2e/core/board.spec.ts`, `tests/unit/drag.test.ts` |
| BD-05 | PASS | The card's ⋮ menu offers "Move to…" listing the other columns; choosing one performs the same move | `e2e/core/board.spec.ts` |
| BD-06 | PASS | EA-owned cards carry the EA tag and the dashed marker; a `running` card pulses; human cards show the initial circle; the ux-reviewer confirms the two are told apart at 393 | `e2e/core/board.spec.ts` |
| GT-01 | PASS | The axis shows day ticks, week bands starting Monday with the date, month labels and weekend shading; the today line sits at today's true position (computed from the range, asserted… | `e2e/core/gantt.spec.ts`, `tests/unit/ganttAxis.test.ts` |
| GT-02 | PASS | The axis spans the active range; a range wider than the viewport scrolls horizontally with a sticky header; "Fit" snaps the range to the visible tasks | `e2e/core/gantt.spec.ts`, `tests/unit/ganttAxis.test.ts` |
| GT-03 | PASS | Bars are grouped by project with a lane label; the lane order follows the list | `e2e/core/gantt.spec.ts` |
| GT-04 | PASS | Dragging a bar moves both dates with day snapping and sends `PATCH { startsAt, endsAt }` on drop with the undo toast; the bar's new position equals the new dates | `e2e/core/gantt.spec.ts`, `e2e/core/tasks.spec.ts`, `tests/unit/ganttAxis.test.ts` |
| GT-05 | PASS | Dragging an end handle changes only that date, snapped to days; the start handle likewise; end cannot cross start | `e2e/core/gantt.spec.ts`, `tests/unit/ganttAxis.test.ts` |
| GT-06 | PASS | A tap without movement (under 4 px) opens the task card; a drag does not | `e2e/core/gantt.spec.ts`, `tests/unit/drag.test.ts` |
| GT-07 | PASS | Tasks without dates sit in an "Unscheduled" lane; dropping one on the axis schedules it 9:00am–5:00pm on the drop day (tasks with no `project` share a "No project" lane just before… | `e2e/core/gantt.spec.ts`, `tests/unit/drag.test.ts`, `tests/unit/ganttAxis.test.ts` |
| GT-08 | PASS | A long press picks a bar up on touch; the card's date fields remain the fallback and change the bar (driven with CDP `Input.dispatchTouchEvent`: touchStart, 600 ms, three touchMoves,… | `e2e/core/gantt.spec.ts`, `tests/unit/drag.test.ts` |
| TD-01 | PASS | `formatWhen` returns "Today 2:14pm", "Tomorrow 9:00am", "Yesterday 4:30pm", "Thu 11 Sep, 9:00am" (this year), "11 Sep 2025, 9:00am" (other years) for a table of instants and nows, in… | `e2e/core/today.spec.ts`, `tests/unit/qa-citations.test.ts`, `tests/unit/time.test.ts` |
| TD-02 | PASS | `formatSpan` returns "Thu 11 Sep, 9:00am – 5:00pm" and "Thu 11 – Fri 12 Sep" for same-day and multi-day spans (`formatDate` renders day-only values — `due` day keys, `Goal.targetDate`,… | `e2e/core/offline.spec.ts`, `e2e/core/today.spec.ts`, `tests/native/screens.test.tsx` |
| TD-03 | PASS | `formatAgo` returns "just now", "4 min ago", "2 h ago" under an hour/day and falls back to `formatWhen` | `e2e/core/decisions.spec.ts`, `tests/unit/time.test.ts` |
| TD-04 | PASS | No fixture string and no schema example contains a clock (`\d{1,2}:\d{2}(am|pm)?` in `meta`, `since`, feed text); tasks carry `metaParts`; Feed, Activity, Latest in carry `at` instants | `e2e/core/today.spec.ts` |
| TD-05 | PASS | `Feed.tsx`, `handlers/brain.ts`, `handlers/today.ts`, `CalendarGrid.tsx` and `Gantt.tsx` no longer slice or hand-format instants; `BRISBANE_OFFSET_MIN` and `toBrisbane` are gone; no… | `e2e/core/timezone.spec.ts`, `e2e/core/today.spec.ts`, `e2e/matrix/theme.spec.ts` |
| TD-06 | PASS | Activity, Feed, Latest in and task rows show `formatWhen`/`formatAgo` output in twelve-hour en-AU form in the device's zone; the same instant reads identically on every tab; the… | `e2e/core/life.spec.ts`, `e2e/core/timezone.spec.ts`, `e2e/core/today.spec.ts` |
| TD-07 | PASS | A line "Time zone · Australia/Brisbane (this device)" names the platform's resolved zone; under `timezoneId: "America/Los_Angeles"` it names that zone | `e2e/core/today.spec.ts`, `tests/unit/time.test.ts` |
| FL-01 | PASS | `Attachment` (with `addedBy`, `captureId`, `folder`) replaces `TaskReport.files`; `GET /tasks/{id}/files` returns the task's and every subtask's files newest first, each row naming its… | `e2e/core/files.spec.ts`, `tests/unit/files.test.ts` |
| FL-02 | PASS | Rows show name · kind · producer · when · subtask; a row opens its signed `url` through the external-link confirmation (the sheet names the store); "Open in Dropbox" appears when… | `e2e/core/files.spec.ts` |
| FL-03 | PASS | A configured section "Files" lists `GET /files` newest first with who added each (me · EA · others), kind, when and what it belongs to; rows open as FL-02; "all" opens the archive with… | `e2e/core/files.spec.ts`, `tests/unit/opens.test.ts` |
| FL-04 | PASS | `GET /files?q=&addedBy=&kind=&range=` matches name and preview text and filters; global search returns a `file` group and its rows open the same viewer (`q, addedBy, kind, range, taskId`) | `e2e/core/files.spec.ts`, `tests/unit/files.test.ts` |
| FL-05 | PASS | Files listed or opened within `files.recentDays` render from the device cache with `context.setOffline(true)` and a reload; the cache holds metadata, `previewText` and `dropboxUrl` only,… | `tests/unit/files.test.ts`, `tests/unit/recentFiles.test.ts` |
| FL-06 | PASS | The fabricated `dropboxUrlFor` is gone; a task's Dropbox link exists only as an `Attachment` with `storage: "dropbox"` | `e2e/core/files.spec.ts`, `e2e/core/task-detail.spec.ts`, `tests/unit/files.test.ts` |
| UP-01 | PASS | An attach control opens the file picker; on desktop paste and drag onto the field attach too; chosen files show as chips under the field before send and can be removed | `e2e/core/files.spec.ts` |
| UP-02 | PASS | `POST /files` (multipart) stores the file (the mock keeps it in memory), returns an `Attachment` with `dropboxUrl` and `folder` under `/JSTACK/…`, and `POST /brain/dump` / `POST /tasks`… | `e2e/core/files.spec.ts`, `tests/unit/files.test.ts` |
| UP-03 | PASS | A 2 MB file attached offline queues with its capture (blob in `queueStore`) and replays on reconnect in order; a 20 MB file shows the honest line "needs a connection" and is not queued | `e2e/core/files.spec.ts` |
| UP-04 | PASS | Opening `/capture#text=&url=&title=` (the fragment; nothing reaches a server log) lands in Brain with the field filled and sends it; `share_target` in the manifest points at it (PW test… | `e2e/core/share.spec.ts`, `tests/unit/pwa.test.ts`, `tests/unit/share.test.ts` |
| UP-05 | PASS | A shared item the EA files provisionally arrives as a `triage` card ("Filed X under Work · reading. Keep it there?") with ok · edit · later · teach; teach writes a rule visible under… | `e2e/core/share.spec.ts`, `tests/unit/share.test.ts` |
| UP-06 | PASS | A file arriving in the Dropbox inbox becomes a capture with `source: "share"`, an `Attachment` and a triage line | `e2e/core/share.spec.ts`, `tests/unit/share.test.ts` |
| UP-08 | PASS | A shared article or page stores `extractedText` (the mock extracts from fixtures: an x.com post, a page, a YouTube link with a transcript sample); the row reads "content saved · N… | `tests/unit/share.test.ts` |
| UP-09 | PASS | The triage card shows the proposed silo, labels and sensitivity as tags before the why line, and says what was extracted ("content saved · 412 words"); edit lets Josh change any tag… | `e2e/core/share.spec.ts`, `tests/unit/share.test.ts` |
| UP-10 | PASS | The ingestion threat model is written (injection through scraped content; the screened, tool-less extract step; allow-lists, size caps, script stripping; the EA quotes, never obeys), the REMAP decision point (screening agent vs n8n workflow vs backend rules) is named with the app's assumption, and a test asserts the sections exist | `tests/unit/ingestionThreatModel.test.ts` |
| UP-07 | PASS | The iOS Shortcut recipe ("Send to JSTACK": receive any input; text and URLs → the capture route; images → `/JSTACK/Inbox/`) is written step by step with the JSTACK icon and colour, and… | `tests/unit/share.test.ts` |
| CL-01 | PASS | Every section heading (static and configured) has a triangle on its left with a **36 px** hit area and `aria-expanded`; all sections open on first run | `e2e/core/collapse.spec.ts`, `tests/native/collapse.test.tsx`, `tests/unit/collapse.test.ts` |
| CL-02 | PASS | Tapping the triangle collapses the section to its heading, badge and "all" link; tapping again opens it; the keyboard (Enter/Space) works | `e2e/core/collapse.spec.ts`, `tests/native/collapse.test.tsx`, `tests/unit/collapse.test.ts` |
| CL-03 | PASS | A collapsed section stays collapsed after a reload and on the next day (device-local store); a different section is unaffected; Arrange's hidden sections stay hidden regardless | `e2e/core/collapse.spec.ts`, `tests/native/collapse.test.tsx`, `tests/unit/collapse.test.ts` |
| CL-04 | PASS | The delta review passes with two sections collapsed on each tab at 393 and 1366 (nothing overlaps, spacing holds) | `e2e/core/collapse.spec.ts` |
| MC-01 | PASS | At most one mic session exists app-wide: starting a second stops the first; no state exists with a mic open and neither the field indicator, the `MicBanner` nor the Talk screen visible… | `e2e/core/voice.spec.ts`, `tests/unit/mic.test.ts`, `tests/unit/voice-ui.test.ts` |
| MC-02 | PASS | The field's mic button shows the state: resting glyph; `listening` = pulse in the alert tone + "Listening"; `transcribing` = "Working…"; `error` = the honest line under the field | `e2e/core/brain.spec.ts`, `e2e/core/talk.spec.ts`, `e2e/core/voice.spec.ts` |
| MC-03 | PASS | While a mic is open, `MicBanner` ("Mic on · listening for Brain · Stop") shows on every tab, the health line reads "mic on", the document title is "● Listening · JSTACK"; Stop on the… | `e2e/core/brain.spec.ts`, `e2e/core/voice.spec.ts` |
| MC-04 | PASS | Interim transcript streams into the field as muted text; the final text replaces it and stays for review; nothing is filed until send | `e2e/core/voice.spec.ts` |
| MC-05 | PASS | Enter sends the dump (same as the arrow); Shift+Enter inserts a newline; the journal and other multi-line fields keep Enter as newline (desktop only: on touch, return inserts a newline and the arrow sends) | `tests/unit/enterSends.test.ts`, `e2e/core/textentry.spec.ts` |
| MC-06 | PASS | After `mic.autoStopSeconds` of silence the mic stops with the notice "Mic off · nothing heard for a minute"; the parameter is honoured when changed (the notice composes from the… | `e2e/core/find.spec.ts`, `e2e/core/voice.spec.ts`, `tests/unit/mic.test.ts` |
| MC-07 | PASS | Every exit path (Stop, Cancel, send, navigation away, unmount, Talk `end()`, auto-stop) calls `track.stop()` on every track of the stream (a fake `MediaStream` counts the calls) (a lock… | `e2e/core/talk.spec.ts`, `tests/native/screens.test.tsx`, `tests/unit/mic.test.ts` |
| MC-08 | PASS | With no speech recognition, an unsupported mime type, or a denied permission, the button reads "Mic unavailable here · type instead", the session never enters `listening`, and the honest… | `e2e/core/brain.spec.ts`, `e2e/core/voice.spec.ts`, `tests/unit/mic.test.ts` |
| MC-09 | PASS | The mime type is chosen with `MediaRecorder.isTypeSupported`: `audio/mp4` when webm/opus is unsupported (Safari), `audio/webm;codecs=opus` otherwise; a constructor that throws surfaces… | `tests/unit/mic.test.ts`, `tests/unit/voice.test.ts` |
| MC-10 | PASS | The orb and Talk's Mute use the same states and the same release; the orb cannot start a session while one is open | `tests/unit/orbOverlay.test.tsx`, `tests/unit/mic.test.ts` |
| TS-01 | PASS | A header with "Talk with EA" and a Close control exists before Start (Close returns to the tab Talk was opened from with the tab bar restored); during a session the control is End with… | `e2e/core/talk.spec.ts`, `e2e/matrix/layout.spec.ts`, `tests/native/screens.test.tsx` |
| TS-02 | PASS | Both sides' text shows as rows without separator lines and the typed field works mid-session (a typed line appears as "you"); `start` carries `voice.brevity: "brief"` by default and the… | `e2e/core/talk.spec.ts` |
| TS-03 | PASS | A `reply` followed by `speak` is spoken (`speechSynthesis.speak` called, or an `audioRef` fetched and played — carried VO-A closes here); "Read replies aloud" in Settings › Voice turns… | `e2e/core/talk.spec.ts` |
| TS-04 | PASS | The "Chat" entry is "Dictate to EA"; the dialog has the mic with MC-02 states; the thread persists across a reload through `GET /chat/thread` | `e2e/core/brain.spec.ts`, `e2e/core/talk.spec.ts` |
| TS-05 | PASS | "Talk with EA" and "Dictate to EA" sit under the card; each opens its surface | `e2e/core/talk.spec.ts` |
| TS-06 | PASS | With car mode on, the controls are 64 px and End is visible on the screen and on the banner while away from it | `e2e/core/talk.spec.ts` |
| TS-07 | PASS | An iPhone-shaped run (no speech recognition, `audio/mp4` only) starts a Talk session, exchanges one turn, ends cleanly and releases the mic; nothing freezes (the page answers a click… | `e2e/core/talk.spec.ts` |
| RP-01 | PASS | `Reply` exists; `GET /brain/replies`, `PATCH /brain/replies/{id}` present; a dump ending in "?" produces a reply and a `brain` server event in the mock | `e2e/core/brain.spec.ts`, `tests/unit/replies.test.ts` |
| RP-02 | PASS | A configured section lists replies unread first; a row opens the `reply` detail with its sources; opening marks it read | `e2e/core/brain.spec.ts`, `tests/unit/opens.test.ts` |
| RP-03 | PASS | The newest unread reply shows as a second card with Open (opens the detail) and Dismiss (marks read); none → no card | `e2e/core/brain.spec.ts` |
| RP-04 | PASS | A push payload `{ tab: "brain", ref: <replyId> }` opens the reply detail (rig `push`); the group "Replies from your EA" exists with four channel switches (iPhone and iPad on by default);… | `e2e/core/brain.spec.ts` |
| RP-05 | PASS | An EA turn in the thread is also listed under Replies with `toCaptureId` naming the turn (created `read: true`; only question replies arrive unread) | `e2e/core/brain.spec.ts` |
| RP-06 | PASS | Every capture row is title, one meta line (routing — kind and where it went; a dump ending in "?" shows "question" and, once answered, "replied"; a provisional filing says so — then… | `e2e/core/brain.spec.ts`, `e2e/core/opens.spec.ts`, `tests/unit/replies.test.ts` |
| OP-01 | PASS | A result row opens the `brain-item` detail with the query's matches highlighted in the accent tone; a source label opens its record | `e2e/core/opens.spec.ts`, `tests/unit/richText.test.ts` |
| OP-02 | PASS | A row opens the item (routing shown); a queued row opens the local text with the queued line | `e2e/core/opens.spec.ts` |
| OP-03 | PASS | "All" opens the memory history (accepted, edited, declined; date; who; the previous value); accepting a proposal adds a row | `e2e/core/opens.spec.ts` |
| OP-04 | PASS | A row opens the `decision` detail: the card as answered, its options, the receipt (model, cost, channel); the search dialog's rows open the same | `e2e/core/opens.spec.ts` |
| OP-05 | PASS | A row opens the `issue` detail (what failed, when, last success, verbs); "All" opens a searchable list | `e2e/core/opens.spec.ts` |
| OP-06 | PASS | A row opens: `read` shows the body in the viewer, `watch`/`listen` open the external-link confirmation; "All" opens a searchable list | `e2e/core/opens.spec.ts`, `tests/native/screens.test.tsx`, `tests/unit/opens.test.ts` |
| OP-07 | PASS | A walker over every `rows` block and every list component asserts each row with an `id` has an `onOpen` or is marked `static` with a reason naming the line (the walker iterates a… | `e2e/core/opens.spec.ts`, `tests/unit/opens.test.ts`, `tests/unit/search.test.ts` |
| OP-08 | PASS | Every "All" list is one `SearchableListDialog` (query, rows, open) parameterised by its route; `HistoryDialog` is gone or is that component | `tests/unit/searchableAll.test.ts` |
| BN-01 | PASS | Sections in order: Brain (capture with attach, mic and send; Talk with EA · Dictate to EA in the same card), Ask (the answer card — the global search dialog is Find and nothing else is… | `tests/unit/registry.test.ts` |
| BN-02 | PASS | Every V2 and V2.1 BR/TM/OF check still passes (no capture behaviour lost) | `tests/unit/bnCaptureCarried.test.ts` |
| BN-03 | PASS | Every row on the tab opens something (OP-07 covers Brain's rows) | `e2e/core/opens.spec.ts` (via OP-07) |
| BN-04 | PASS | `BRAIN_PROPOSAL.md` (approved by Josh in the planning chat on 7 Sep; the Decision section says so) is applied by N-1; `demo/v22/brain-proposal-*` captures record the result; N-1's commit… | `tests/unit/brainProposalApplied.test.ts` |
| GS-01 | PASS | `GET /search?q=moz` returns groups across the twelve kinds with snippet and match ranges; a record outside the user's silos never appears; a record above the session's clearance never… | `tests/unit/search.test.ts` |
| GS-02 | PASS | The rail's Find and `Ctrl/Cmd+K` open the Find dialog with the query field focused; typing "steve" and Enter shows groups (the chips are the focus chips; sensitivity values `all · normal… | `e2e/core/find.spec.ts`, `tests/unit/search.test.ts` |
| GS-03 | PASS | A search glyph in every tab's header opens the Find screen (tab bar replaced); Close returns | `e2e/core/find.spec.ts`, `tests/unit/dialogs.test.ts`, `tests/unit/search.test.ts` |
| GS-04 | PASS | Every result row opens its detail (task card, brain item, file viewer, decision, issue, learning, goal, habit trends, person, rule) (subtask → the parent task card; rule → `rule-edit`;… | `e2e/core/find.spec.ts`, `tests/unit/search.test.ts` |
| GS-05 | PASS | The EA answer card is followed by the plain matches from `/search`; both open | `e2e/core/find.spec.ts` |
| GS-06 | PASS | Results cap at `search.maxResults` with "Showing 50 · refine your search" (the cap is the total; each group keeps its full `count`) | `e2e/core/find.spec.ts`, `tests/unit/search.test.ts` |
| GS-07 | PASS | Silo chips (Everything · Personal · Family · Work) and a sensitivity filter (All · Not sensitive · Sensitive only) scope the results; sensitive rows render blurred under privacy blur… | `e2e/core/find.spec.ts`, `tests/unit/search.test.ts` |
| LG-01 | PASS | "Edit" opens the goal editor (list, new, edit — one `ChipSetEditDialog`-style component with a goal form); saving PUTs the set and the section updates | `e2e/core/life.spec.ts`, `tests/unit/goals.test.ts` |
| LG-02 | PASS | A goal card opens its detail with tasks, deliverables and KPIs (value of target, unit) | `e2e/core/life.spec.ts`, `tests/unit/goalMeta.test.ts`, `tests/unit/goals.test.ts` |
| LG-03 | PASS | "Add task" creates a task with `goalId` (the task card shows the goal chip); "Add subtask" adds to a chosen task of the goal | `e2e/core/life.spec.ts`, `tests/unit/stores/taskCard.test.ts` |
| LG-04 | PASS | "Done" or "Drop" archives the goal with its history; "All goals" lists archived ones, each opening read-only; a brain item "Goal archived · <text>" appears in Latest in | `e2e/core/life.spec.ts`, `tests/unit/goals.test.ts` |
| LG-05 | PASS | `life.spec.ts` row-count pins are updated in §4 first with the reason (goals now editable) | `e2e/core/life.spec.ts` |
| LH-01 | PASS | `GET /habits/stats?range=month|year|all` returns day keys, streaks, done and possible per habit from the seeded logs (184 days) | `tests/unit/habitStats.test.ts` |
| LH-02 | PASS | One calendar-month grid per habit: seven columns Mon–Sun, day numbers; hit = accent fill with ink text, miss = hairline cell with muted text, future = blank, today ringed; the month name… | `e2e/core/life.spec.ts`, `tests/unit/habitStats.test.ts` |
| LH-03 | PASS | The year as weeks × weekdays with month labels; hits and misses in the same tokens; below it twelve bars of completions per month with the number above each bar (`Txt kind="stat"`)… | `e2e/core/life.spec.ts`, `tests/unit/habitStats.test.ts` |
| LH-04 | PASS | Yearly bar rows for every year with data and the line "current streak N · longest N · done of possible · rate%" | `e2e/core/life.spec.ts`, `tests/unit/habitStats.test.ts` |
| LH-05 | PASS | Each habit shows its last seven days as hit/miss cells beside the name; today's cell toggles (optimistic, undo, queued offline as now); the chips' `aria-selected` behaviour stays | `e2e/core/life.spec.ts` |
| LH-06 | PASS | Archive keeps every log (stats for an archived habit still compute); the habit leaves the Life list | `e2e/core/life.spec.ts`, `tests/unit/habitArchive.test.ts` |
| LH-07 | PASS | Archived habits are listed first with "Restore · keeps N days of history"; restoring returns the habit with its logs and its stats | `e2e/core/life.spec.ts`, `tests/unit/habitArchive.test.ts` |
| LH-08 | PASS | Every habit visual uses only pack tokens (colour-literal lint stays green); hit vs miss contrast ≥ 3:1 on the card ground in both themes (measured in `theme.spec.ts`) | `e2e/matrix/theme.spec.ts` |
| LL-01 | PASS | `LearningItem` with kind, url or body; `GET /learning?q=`, `GET /learning/{id}` | `tests/unit/learningShape.test.ts` |
| LL-02 | PASS | Rows open (OP-06); the configured section keeps its `testID`s and gains `open` as the verb | `e2e/core/opens.spec.ts` (via OP-06) |
| LL-03 | PASS | "All" opens the searchable list; "podcast" finds the listen item | `tests/native/screens.test.tsx` |
| AG-01 | PASS | Each field shows "$" before and "AUD / month" after, the month's spend beside it ("$12.40 of $50"); non-numeric or over five digits is refused with the honest line; the assertion still… | `e2e/core/agents.spec.ts`, `tests/unit/caps.test.ts` |
| AG-02 | PASS | Rows open the `decision` detail (OP-04) | `e2e/core/agents.spec.ts` |
| AG-03 | PASS | Rows open; "All" with search (OP-05) | `e2e/core/agents.spec.ts` |
| AG-04 | PASS | Hold to completion then release: the hint returns to its resting text after the dialog; cancelling the confirm dialog restores the resting hint (Jest on `lib/holdToLock.ts` and an e2e at… | `e2e/core/agents.spec.ts`, `e2e/core/lock.spec.ts`, `tests/unit/holdToLock.test.ts` |
| AG-05 | PASS | US-03 and US-04 hold on the Agents tab | `e2e/core/agents.spec.ts` |
| AG-06 | PASS | Both emergency-lock controls share `lib/holdToLock.ts`; no second timer implementation exists (grep guard) | `e2e/core/agents.spec.ts`, `tests/unit/holdToLock.test.ts` |
| ST-01 | PASS | Column labels read iPhone, iPad, PC, Telegram at 1366; at 393 each group is a labelled row with four named switches; no label is truncated (clip sweep) | `e2e/core/settings.spec.ts` |
| ST-02 | PASS | "Rules for my EA" lists rules with scope and mode; add, edit, remove through the editor; PUT persists; no Rules section exists on Brain (registry test) | `e2e/core/memory.spec.ts`, `e2e/core/settings.spec.ts`, `tests/unit/rules.test.ts` |
| ST-03 | PASS | `POST /settings/autonomy/propose` yields a card `kind: "rule"`; Approve appends the rule `on: true` (visible in Settings); Never records | `e2e/core/settings.spec.ts`, `tests/unit/rules.test.ts` |
| ST-04 | PASS | Teach writes a rule into the list (visible under Rules for my EA with `addedBy: "josh"`) | `e2e/core/decisions.spec.ts`, `e2e/core/memory.spec.ts`, `tests/unit/rules.test.ts` |
| ST-05 | PASS | Speeds 0.8, 1, 1.2, 1.5, 1.75, 2 selectable and persisted | `e2e/core/settings.spec.ts` |
| ST-06 | PASS | "End my turn after a silence of" offers Off (default), 10 s, 60 s; 5 s is gone; the Talk client honours 60 s under the clock offset | `e2e/core/settings.spec.ts` |
| ST-07 | PASS | "Read replies aloud" exists, on by default in car mode, and TS-03 follows it | `e2e/core/settings.spec.ts` |
| SY-01 | PASS | `status` derives: online and nothing queued → ok; offline, queued > 0 or syncing → pending; conflicts > 0 or `lastError` → attention (table test) | `tests/unit/stores/sync.test.ts`, `tests/unit/syncStatus.test.ts` |
| SY-02 | PASS | A 6 px dot with the label "sync status" at the bottom of the rail above the health line on desktop, and in the header's health line on phone, with `aria-label` "Sync · ok" / "Sync · 2… | `e2e/core/offline.spec.ts` |
| SY-03 | PASS | ok = ok token, pending = the new `warn` token (amber), attention = alert; contrast ≥ 3:1 against the bar in both themes | `e2e/matrix/theme.spec.ts` |
| SY-04 | PASS | Tapping the dot opens Settings › Sync (the `sync` modal) | `e2e/core/offline.spec.ts` |
| TE-01 | PASS | Every `Field` input uses the pack's body size on every width (no 16 px exception); the served head carries `maximum-scale=1` in the viewport meta (PW test on the prod build) and… | `e2e/core/textentry.spec.ts`, `tests/unit/pwa.test.ts` |
| TE-02 | PASS | With the viewport reduced to a keyboard-height band (393 × 500), a focused multi-line field's editor is at least 40% of that band and entirely inside it (bounding box) (and at 1024 × 600… | `e2e/core/textentry.spec.ts` |
| TE-03 | PASS | While an editor is expanded the demo watermark and the mock banner are hidden (the elements are absent or `visibility: hidden`) | `e2e/core/textentry.spec.ts`, `tests/native/screens.test.tsx` |
| TE-04 | PASS | `jstack-mock-v14.html` renders no mock banner under 768 (Playwright on the built mock at 393) | `e2e/core/textentry.spec.ts` |
| TE-05 | PASS | A focused `Field` shows a 2 px accent outline at 2 px offset, the border unchanged, the caret in the accent tone, inner padding ≥ 10 px; the browser's default outline is not shown… | `e2e/core/textentry.spec.ts`, `tests/native/primitives.test.tsx` |
| TE-06 | PASS | Enter sends in single-line fields and the dump field; Shift+Enter inserts a newline there; the journal keeps Enter as newline (desktop only; on touch, return is a newline and the arrow… | `e2e/core/textentry.spec.ts` |
| SP-01 | PASS | Every pass-1 S row is built with before/after line counts in `BUGLOG_v22.md` and its behaviour tests green before and after | `tests/unit/predicates.test.ts` |
| SP-02 | PASS | The pass-2 report opens with what the V2.1 review (ADR-33, S-1..S-7) did and which of its goals this pass continued, then lists every row (what, before/after, guarding tests), what was… | `tests/unit/lint-guards.test.ts` (via ADR-33) |
| SP-03 | PARTIAL | No acceptance expectation changed except through §4 with a reason; the full board is green after every refactor row | no test file quotes this ID and its check names no delegate — see §1's note |
| SP-04 | PARTIAL | Size limits hold with margin: no component within 15 lines of 250, no store within 10 of 200 (a second, advisory sizes report lists the nearest files); `unused-exports` is zero; the… | no test file quotes this ID and its check names no delegate — see §1's note |
| RM-01 | PASS | Reading order first; a "Connect and run" section right after it (what the client expects from a server as a table, a suggested relational schema, what REMAP must build or decide beyond… | `tests/unit/consolidation.test.ts`, `tests/unit/handover.test.ts` |
| RM-02 | PASS | A checklist with an evidence path per line: build, unit, e2e board, conformance over http, security scans, size guards, docs drift, cold start, known gaps; `handover.test.ts` asserts… | `tests/unit/consolidation.test.ts`, `tests/unit/handover.test.ts` |
| RM-03 | PASS | One section states prerequisites (Node, pnpm, Playwright browsers, Git Bash for hooks, `core.hooksPath`) and every environment variable and secret the app or CI reads… | `tests/unit/consolidation.test.ts` |
| RM-04 | PARTIAL | The backend assumptions beyond the client mirror are stated: auth flow end to end, error taxonomy with bodies, pagination on the growing lists, tolerated latency | no test file quotes this ID and its check names no delegate — see §1's note |
| RM-05 | PARTIAL | A fresh instance in a fresh clone followed `HANDOVER.md` alone, ran the board and the conformance runner, added one read-only endpoint by the recipe, and asked no question; the report is… | no test file quotes this ID and its check names no delegate — see §1's note |
| RM-06 | PASS | The three companion lists are empty; `CODEMAP.md`, `WIRING.md`, `openapi.yaml`, `PARAMETERS.md`, `CONTRACT_MAP.md` regenerate identically (drift tests); the stale ADR-12 quote is gone | `tests/unit/consolidation.test.ts`, `tests/unit/handover.test.ts` |
| RM-07 | PASS | A native section states what exists for the Expo app, what is parked (EAS) and the exact next step, honestly | `tests/unit/consolidation.test.ts` |
| RM-08 | PASS | One reading order for tag `v2.2` over the consolidated set only; every named file exists (walker) | `tests/unit/consolidation.test.ts` |
| RM-09 | PASS | The consolidated set exists: `CONTRACT.md` carries every section of the three contracts folded into one current text with retired rules removed and every §8 question answered or assumed;… | `tests/unit/consolidation.test.ts` |
| RM-10 | PASS | Each versioned handover, contract, decisions and carried-defects file starts with "Superseded for REMAP by <file>; kept as history" naming a file that exists (walker); nothing was moved… | `tests/unit/consolidation.test.ts` |
| LV-01 | PASS | Every B-row names the guarding test that was red before the fix and what it printed; ten rows sampled by the auditor re-falsify (the subject mutated, the named test red); no test reads… | `tests/unit/buglogRows.test.ts` |
| LV-02 | PASS | Every route in `CONTRACT_v22.md` §4.14–4.23 has a routes-table row, an adapter method, a mock handler, an OpenAPI path and a caller; the wiring map's zero-caller list is empty or every… | `tests/unit/wiringOrphans.test.ts` |
| LV-03 | PASS | Every mutating row of `data/routes.ts` is refused with 401 while locked, through the adapter, with the queue intact; the outbox holds while locked and replays on unlock; a 5xx keeps the… | `tests/unit/lockGate.test.ts` |
| LV-04 | PASS | Every gate a delivery doc claims ("refuses", "empty", a count, PASS) exists as a workflow step or a test; the counts in `HANDOVER.md`, `README.md` and `QA_REPORT_v22.md` equal… | `tests/unit/workflows.test.ts` |
| LV-05 | PASS | One z-order table; no literal `zIndex` number elsewhere; at 393 and 1366 with a toast up, a sheet open, Talk open, the mic banner up, Find open and a field focused, every floating box is… | `e2e/core/voice.spec.ts`, `tests/unit/zorder.test.ts` |
| LV-06 | PASS | Fixtures carry no literal weekday or date, long or short, outside the recurring-cadence exemptions; the rendered text at four widths has no ISO instant, no bare `HH:MM` off the calendar… | `tests/unit/fixture-weekdays.test.ts`, `tests/unit/fixtures.test.ts` |
| LV-07 | DEVIATION | Every state V2.2 adds (sync ok · pending · attention; mic listening · transcribing · error · unavailable; the working pulse; the triage tags; the offline line's dot) reads its token off… | react-native-web 0.21 maps `accessibilityLabel` to `aria-label` and does NOT map `accessibilityState` (B-10), so a native-renderer test sees the prop and never the DOM; the `aria-*` prop is passed alongside and asserted as an ATTRIBUTE in an e2e instead — `e2e/matrix/theme.spec.ts` |
| LV-08 | PASS | Every enum rendered in a row has a label map with a test that every member has a label; the rendered-text sweep finds no raw member (`telegram`, `share`, `queued`, `listening`, snake or… | `tests/unit/enumLabels.test.ts`, `tests/unit/files.test.ts` |
| LV-09 | PASS | The capture pass holds the driven states: Sync with a queued capture and a conflict, the mic listening, a toast over a sheet, Settings scrolled to VOICE, a board card mid-drag, the Gantt… | `tests/unit/handover.test.ts` |
| LV-10 | PARTIAL | Every V2.1 carried row (PF-A, VO-A, OF-A, UX-A..UX-K, FX-A, the qa round's) is closed by a named commit, carried with severity and reason, or marked "stands" with the reason; none is… | no test file quotes this ID and its check names no delegate — see §1's note |
| QA-01 | PASS | `CONTROLS_v22.md` covers every new `testID`; the cross-check test is green | `e2e/core/brain.spec.ts`, `e2e/core/today.spec.ts`, `tests/unit/controls-v21.test.ts` |
| QA-02 | PASS | `tests/unit/handover.test.ts` guards the counts in `HANDOVER_v22.md`, `README.md`, `QA_REPORT_v22.md`, this file's ID count and the routes count | `tests/unit/handover.test.ts`, `tests/unit/qa-citations.test.ts` |
| QA-03 | PASS | `evidence/mutation-pass.json` gains ten seams: parameter range `422`, shared filter payload, drag threshold, `formatWhen` under a foreign zone, mic release, the opens walker, search silo… | `tests/unit/lint-guards.test.ts` |
| QA-04 | PARTIAL | `evidence/ux-review.md` signed on captures of both fixture days at 393, 1024, 1366, 1920 × light, dark | no test file quotes this ID and its check names no delegate — see §1's note |
| QA-05 | PARTIAL | `AUDIT_v22.md` SIGNED OFF by `qa-auditor` (Fable, or Opus on fallback, named in the file) dated after the last code commit | no test file quotes this ID and its check names no delegate — see §1's note |
| QA-06 | PASS | `jstack-mock-v14.html` built from the prod export, newer than the last app source change, with the demo watermark and no banner under 768 (V2.1's R-41 freshness guard: the mock's commit… | `tests/unit/pwa.test.ts` |
| QA-07 | PASS | `demo/v22/` captures complete: every V2.1 screen plus the task card edit row, the completion dialog, the board with columns, the Gantt axis, Find, Replies, Files, the mic banner, Talk… | `tests/unit/captureRig.test.ts`, `tests/unit/handover.test.ts` |
| QA-08 | PASS | `main` == tag `v2.2` == `origin/main`, `DONE_v22.md` written, the pre-push guard satisfied by a signed `AUDIT_v22.md`; no branch protection required (RR-05 closed as not needed, Josh 7 Sep) | `tests/unit/hooks.test.ts` |
| JQ-01 | PASS | e2e at 393 and 1366: the edit row shows "Start" with the start field and "End" with the end field; both labels render with the card meta line's computed `font-family` and `font-size`,… | `e2e/core/task-detail.spec.ts`, `tests/unit/dialogs.test.ts`, `tests/unit/handover.test.ts` |
| JQ-02 | PASS | e2e at 1366 and 1920: after "Delegate to EA" the picker's bounding box is centred horizontally (centre within 8 px of the viewport centre) and lies in the middle third vertically; at 393… | `e2e/core/task-detail.spec.ts`, `tests/unit/dialogs.test.ts`, `tests/unit/handover.test.ts` |
| JQ-03 | PASS | e2e at 393 and 1366, both fixture days: EVERY List row's meta contains exactly one of "high priority" / "medium priority" / "low priority"; the "high priority" run's computed colour… | `e2e/core/tasks.spec.ts`, `tests/unit/taskEdit.test.ts` |
| JQ-04 | PASS | Jest: every person in the roster fixture carries a two-letter `short` and the circle and chip components read it — a person without `short` fails the test, so a derived first letter… | `e2e/core/tasks.spec.ts`, `tests/unit/fixtures.test.ts` |
| JQ-05 | PASS | Jest on the presets table: labels unique, the custom preset labelled "Select date range"; e2e at 393 and 1366: the Range dialog's chip row reads "This week · Next 90 days · Last 90 days… | `tests/unit/taskRange.test.ts` |
| JQ-06 | PASS | a `BUGLOG_v22.md` row naming the red test first; e2e at 393 and 1366: with the Gantt view selected, collapsing "Waiting on" leaves the Gantt axis and bars visible at their previous… | `e2e/core/collapse.spec.ts`, `tests/native/screens.test.tsx`, `tests/unit/collapse.test.ts` |
| CD-01 | PASS | `workflows.test.ts`: the board keeps the reference artefact and the compare step names `--reference-url`; the recorded-number verdict is marked advisory in the report | `tests/unit/workflows.test.ts` |
| CD-02 | PASS | `stores/sync.test.ts`: the composite requests carry `?since=<seenAt>` and the delta line is composed from the response's `delta` (red first on the current adapter) | `tests/unit/stores/sync.test.ts` |
| CD-03 | PASS | `fixture-weekdays.test.ts` refuses short and long literal weekdays outside the cadence exemptions (red on the six literals first); the resolved rows name the right day on every day of… | `tests/unit/fixture-weekdays.test.ts` |
| CD-04 | PASS | native test: the footer's runs bind at the last dot; no single-token last line at 1024 and 1366 | `tests/native/screens.test.tsx`, `tests/unit/hardening.test.ts`, `tests/unit/richText.test.ts` |
| CD-05 | PASS | e2e at 393: every fixture row shows at least twenty characters of its title (the two-line row) | `e2e/core/decisions.spec.ts`, `tests/unit/labelColumn.test.ts`, `tests/unit/sizes.test.ts` |
| CD-06 | PARTIAL | `voice.test.ts` and `talk.spec.ts`: a scripted `speak` carrying an `audioRef` plays through the audio element and the transcript marks it (red first) | no test file quotes this ID and its check names no delegate — see §1's note |
| CD-07 | PARTIAL | `tasks.spec.ts` on all eight projects: no lane clipped mid-word; four lanes whole at 1366; at 1024 the strip scrolls with at least two lanes visible and none cut | no test file quotes this ID and its check names no delegate — see §1's note |
| CD-08 | PARTIAL | `talk.spec.ts` at 1366 and 1920: the Talk panel is 880 px wide and Reply keeps the decision card's primary proportion | no test file quotes this ID and its check names no delegate — see §1's note |
| CD-09 | PASS | `handover.test.ts` QA-07: the driven-state frames of LV-09 exist | `tests/unit/handover.test.ts`, `tests/unit/time.test.ts` |
| CD-10 | PASS | the consolidation test finds all five ids with the reason and the one-line lever each | `tests/native/people-verb-error.test.tsx`, `tests/unit/consolidation.test.ts` |
| CD-11 | PASS | on the prod build: one online load, server stopped, reload → the gate renders (`#root` non-empty); the two tests run (skip count asserted) | `e2e/core/pwa.spec.ts`, `tests/unit/handover.test.ts`, `tests/unit/lint-guards.test.ts` |
| CD-12 | PASS | a grep guard: no spec imports `test` from `@playwright/test`; the console budget covers the PWA tests | `tests/unit/lint-guards.test.ts` |
| CD-13 | PASS | `POST /sections/propose` with an unknown block type answers `422 { field: "blocks[0].type" }` over HTTP; `PUT /parameters/{key}` out of range answers `{ field: "value" }` | `tests/unit/rules.test.ts`, `tests/unit/saturated-fill.test.ts` |
| CD-14 | PASS | every seam's named guards go red under the mutation (the auditor re-runs three) | `tests/unit/hardening.test.ts`, `tests/unit/stores/sync.test.ts` |
| CD-15 | PARTIAL | the five guards run green on `v22-build` at row 0 and stay green: digit-prefixed IDs counted (123 for V2.1), `SURFACES == DIALOGS`, the presence clock ends a held session at twenty… | no test file quotes this ID and its check names no delegate — see §1's note |

## §2. The `LV-01..LV-10` self-check (ADR-65, row T2-1)

The ten lessons of the V2.1 audit, checked against this tree rather than against the intention
that they would hold. Two needed a guard written before they could be cited honestly; one is
recorded as a deviation because the check lives somewhere other than where the acceptance row
says; two belong to Stage 6 and say so.

| ID | Status | Check | Evidence |
|---|---|---|---|
| LV-01 | PASS | Every B-row names the guarding test that was red before the fix and what it printed; no test reads its subject as text or derives its expectation from the tool it judges | `tests/unit/buglogRows.test.ts` "every row from B-49 on carries a *Red first:* line" and "every test file a row names exists on the tree". Seen to fail both ways (B-58 in `BUGLOG_v22.md`). The sentence that stood here until A4R3-02 said `BUGLOG_v22.md` lacked the sections for N-1, LG-1, LH-1, LH-2, AG-1, ST-1 and SY-1 — "roughly fifty rows T2-2 owes". All seven exist now, so the reason is spent and the status is the generator's PASS. |
| LV-02 | PARTIAL | Every route in `CONTRACT_v22.md` §4.14–4.23 has a routes-table row, an adapter method, a mock handler, an OpenAPI path and a caller; the wiring map's zero-caller list is empty or every entry is named | `tests/unit/wiringOrphans.test.ts` "the tool's split equals the committed one, method for method" and "no uncalled route was added by V2.2 — every one predates tag v2.1"; the decomposition is `evidence/wiring-orphans.json`; the tool is `tools/orphan-callers.mjs`. 34 orphans = 14 component-called + 2 rig-only + 18 uncalled (35 and 20 until B-196 gave `getGoals` a store caller; 13 and 19 until `getLearning` gained a caller at WP-G, LL-03).  All 18 predate tag `v2.1`; V2.2 added 26 routes and wired all 26 **PARTIAL, and §1 says PASS — the two are different claims and this is the one that is judged.** §1's PASS means a test quotes the ID. The PROPERTY this row states is "…or every entry is named", and the eighteen uncalled routes are named here and in `evidence/wiring-orphans.json` and, since A-5 wrote it, in `KNOWN_GAPS.md` §1 as well — which is where this row says they belong. (Until the A-6 re-audit read it, this sentence still said they were NOT there: E2.) Raising this to PASS to match §1 (which is what A4R2-05's fix did) changed no fact; A4R3-02 put it back. |
| LV-03 | PASS | Every mutating row of `data/routes.ts` is refused with 401 while locked, through the adapter, with the queue intact; the outbox holds while locked and replays on unlock | `tests/unit/lockGate.test.ts` "the routes table is what this test is driven from", "the client gate refuses every mutating route while locked", "the server half answers 401, for when the client gate is bypassed", "the queue survives a refusal". Driven from the table, so a route added later is covered by construction |
| LV-04 | PASS | Every gate a delivery doc claims exists as a workflow step or a test; the counts in `HANDOVER.md`, `README.md` and `QA_REPORT_v22.md` equal `evidence/jest-summary.json` and the acceptance tables | `tests/unit/workflows.test.ts` (the claimed-gate half, green — see its header note on LV-04) and `tests/unit/handover.test.ts` (the counts half). The sentence that stood here until A4R3-02 said the counts half could not close until T2-2 wrote `HANDOVER_v22.md`, `README.md` and this file's §1. All three exist, the counts were moved to the run that wrote them (B-185, A-150), and `handover.test.ts` reads §8's five numbers against the artefacts — so the reason is spent. |
| LV-05 | PASS | One z-order table; no literal `zIndex` number elsewhere; every floating box disjoint from every control and text box with a toast, a sheet, Talk, the mic banner and Find up, at 393 and 1366 | `tests/unit/zorder.test.ts` "the z-order table is the only place a layer number is written"; `e2e/core/identity.spec.ts` "ID-02 the demo watermark" carries the disjointness sweep and grows with every row that adds a floating element |
| LV-06 | PASS | Fixtures carry no literal weekday or date outside the recurring-cadence exemptions; rendered text at four widths has no ISO instant, no bare `HH:MM` off the calendar grid and no "in N days" | `tests/unit/fixture-weekdays.test.ts` (the fixture half — see its header note on LV-06); `e2e/matrix/theme.spec.ts` "GL-07 dates and times are written for a person" (the rendered half, at four widths) |
| LV-07 | DEVIATION | Every state V2.2 adds reads its token off the rendered element, and contrast is measured on the painted ground | **The checks exist and are green, but not where the acceptance row's "Where" column points.** The row names `tests/native/screens.test.tsx`; the checks live in `e2e/matrix/theme.spec.ts` — "SY-03 the sync dot's three colours clear the bar behind them" and "LH-08 habit grids: a hit is visibly a hit, and its number is legible" — and `e2e/core/voice.spec.ts` "MC-02 the button says what the microphone is doing". The reason is B-10: a native-renderer test sees the PROP and never the DOM, so a token assertion in the native lane would read back the value it was handed. Measuring the painted pixel requires a browser. The deviation is the lesson being met more strictly than written, not less; the header note in `e2e/matrix/theme.spec.ts` records it |
| LV-08 | PARTIAL | Every enum rendered in a row has a label map with a test that every member has a label; the rendered-text sweep finds no raw member | The pattern is followed and tested per domain: `tests/unit/files.test.ts` "every AttachmentKind has a label — a wire enum never reaches a row (rule 21)" spells the union out rather than reading the keys off the map (R-02), and `tests/unit/goalMeta.test.ts` does the same for `GOAL_STATUS_LABELS`.  `VIA_LABEL` in `components/agents/History.tsx` has no completeness test at all. A per-domain habit is not the same as a gate, and calling this PASS would be the exact shape rule 15 warns about. Stage 6 A-1's auditor should treat it as an open target **PARTIAL, and §1 says PASS — the honest gap of the ten.** `enumLabels.test.ts` closed the `VIA_LABEL` clause that used to stand here, and the per-domain pattern is real and tested. What is still absent is a SINGLE guard that enumerates every enum reaching a row, and a rendered-text sweep for raw members: a whole-tree search for either finds nothing. `HANDOVER_v22.md`'s known-gaps table lists this and cites this row, so the two agree again. |
| LV-09 | PASS | The capture pass holds the driven states; day 2 differs from day 1 on every family claiming a day-2 change; prod and test frames match | `demo/v22/` — three passes (day 1 prod, day 1 test, day 2 test) at four widths × two schemes from `tools/capture-v2.mjs`, forty-seven declared screens, ten of them A-2's: the completion dialog, a board card mid-drag, the Gantt lane for undated tasks, a reply, the files archive, two collapsed sections and a triage card from a share in both flavours; the mic listening and Sync with a queued capture and then a conflict through the rig, so test-flavour only. `tests/unit/handover.test.ts` QA-07: the tool's declarations equal the literal lists, `demo/v22/` holds exactly the declared screens on every pass, and each of LV-09's driven states is present by name, with no `-prod` frame of a rig state. The day-2 difference and the prod/test match are judged frame against frame by the ux-reviewer at A-3, not by a test |
| LV-10 | PARTIAL | Every V2.1 carried row is closed by a named commit, carried with severity and reason, or marked "stands" — none silently dropped | The work is DONE and the evidence is `CARRIED_DEFECTS_v22.md` and `KNOWN_GAPS.md` (A-5 wrote them; `tests/unit/consolidation.test.ts` gates their shape), and §1 says PARTIAL for the reason it says PARTIAL anywhere: **no test file quotes the id LV-10 itself**. It was STAGE 6 here until the A-6 audit's D-4 — a status meaning "a stage that has not run" about a stage that had. The two sections agree now: the rows are written and nothing gates the ID by name |

**Six of the ten are green on this tree** (LV-03, LV-05, LV-06 and LV-09 outright; LV-01 and
LV-04 as guards whose earlier remainder is spent). **One is a deviation** (LV-07 — met in a
stricter lane than the row names, declared once in `tools/qa-rows.mjs`). **Three are real gaps**
(LV-02, whose twenty — now eighteen, since v2.3's Learning archive calls `getLearning` — uncalled routes are named here, in the evidence file
and in `KNOWN_GAPS.md` §1, which is where the row says they belong; LV-08, which has no
cross-cutting enum guard and no rendered-text sweep; and LV-10, whose work is DONE — A-5 wrote the
carried-defect and gap files it asks for — and which stays PARTIAL because no test quotes the id
itself). **None is Stage 6's**: that status meant "a stage that has not run", and at A-6 every
stage has (the A-6 audit's D-4).

This paragraph said "six green … one real gap … two are Stage 6's" until A4R4-06, and its table
said otherwise on LV-02 and LV-09. That is the third residue of one edit: A4R2-05 raised four
status literals to match §1, A4R3-02 put the two that were still true back and rewrote the
reasoning, and this prose — which both guards read past, because they read table rows — kept the
original count. A summary is a claim like any other.

### What this self-check found that nothing else had

Two things, both recorded in `BUGLOG_v22.md` under T2-1:

1. **B-58** — `wiring.json` reported `getParameters` as having no caller because Prettier had
   wrapped the call across two lines and the scanner's regex required the dot to hug the
   parenthesis. No test was red, because no test read the orphan list against the source: the
   map printed a number and every guard around it compared that number to itself.

2. **LG-1's stated outcome and its actual one differ.** Its tree anchor said the row would give
   `GET /goals` its callers. It gave them to `/goals/{id}` and `/goals/history`; `/goals` itself
   is still uncalled, because the tab reads goals through the `/life` composite. Nothing said so
   until the orphan list was decomposed. Not a defect — the tab works — but a plan and a tree
   that disagreed, unnoticed for six rows.

## §3. The board

Every number below was read off the run's own stdout and the evidence file the run wrote, in
that order — never off a previous board. `jstack-app/evidence/jest-summary.json` and
`e2e-summary.json` are written by the runs themselves; `tests/unit/qaReport22.test.ts` compares
what this section says against them, so a stale figure here fails the board rather than
misleading a reader.

```
pnpm check           0 errors
pnpm lint            0 errors, 0 warnings
pnpm test            2475 passed, 1 skipped by design / 2476, 131 suites (unit + native), in BOTH zones —
                     TZ=America/New_York and JSTACK_TZ=Australia/Brisbane, identical
pnpm test:e2e        971 passed, 0 failed, 0 flaky, 87 skipped of 1058, across 8 width x
                     scheme projects
                     (core 850: 793 passed, 57 skipped · matrix 208 over 8 projects:
                     178 passed, 30 skipped)
pnpm unused          none
node tools/build-web.mjs        clean (the export the e2e serves)
pnpm build:web:prod             clean
openapi.yaml         valid — 135 routes, 210 schemas, every example checked against its schema
audit-check          3 advisories, 2 accepted with a reason, none blocking at high or above
secret-scan          clean
log-scan             clean — no console.log/info/debug in app source
markers              142 TODO(BACKEND: §4.n), every one naming a section that specifies it
mutation seams       30 recorded in evidence/mutation-pass.json, the last ten V2.2's
```

**The board above is A-6's, and the qa-auditor reproduced every line of it independently at `d812c9b7`, first attempt.** The Jest line has moved since: v2.21 added one case (TE-01's packaged-mock viewport, in `tests/unit/pwa.test.ts`) and v2.3 the cases `BUGLOG_v23.md` names, so it reads 2475 passed, 1 skipped by design (`tests/unit/serveMockRig.test.ts`, self-skipping outside `pnpm serve:mock`) across 131 suites where that tree printed 2148 across 105 — and the line itself changed shape at v2.3's own D-12: "passed / total" used to let the two read equal over a suite that always skips one by design, so passed and skipped are now the two different, checked numbers a stale "X / X" could not tell apart. The numbers are that tree's: `4c4302be` printed 2137 across 104 suites, and naming it here for a 2148/105 board was D12's own shape a third time (A-6 re-audit E1). The paragraph that
follows is A-4 round 11's — it is kept because what it records is a LESSON about how a board goes
green, not a number — but the numbers above it have been rewritten five times since that round, and
until the re-audit read this sentence (D12) it still told the reader they were looking at round 11's
run. In the one section whose job is to say what to distrust, that is the error that costs most.

**A-4 round 11's e2e needed four runs — three of them that round's own doing, which is worth recording
rather than discarding.** B-246's settle window refuses a press that
lands where a control has just moved, and four specs pressed rows in sequence faster than a person
can aim: the first run named five such cases, the tightened rule named two more, and the run above is
the green one — nothing but the cadence changed, five `settle()` calls and not one assertion. A run
before those died in three seconds rather than test a stale export after a source edit, which is
B-03's guard working. Round 10's first full Jest run passed 2031, three short of the cases that round
had added, which is how `BUGLOG_v22.md` B-245 was found: the controls guard had stopped checking
sixteen controls. Round 9's e2e was green on its first run; round 8's row needed three: the first reported
926 passed, 2 failed, 78 skipped — CG-02 at `w393-light` and `w1366-light`, both times
`cal-event-ev3` not found, because it ran from 00:30 on a Saturday and `ev3` is a school-day fixture
event, so the case could pass only on a weekday (a real defect in the test, fixed as B-229, not a
flake); the second was stopped by hand ten minutes in, because a source change (B-227's retry half)
made the tree it was testing stale. A reader deciding whether to trust this board should be told
which run they are reading and that the others exist. (An earlier row's disclosure, a 48.3-minute run
under load whose six failures all passed in isolation, stands in this file's history.)

**The known flakes, none claimed fixed:** CL-03, OF-05 and TK-09 did not fire on any of these runs, round 11's four included.
`unused-exports.test.ts`'s B-41 case (Dropbox refusing to delete its own probe file, `EPERM`) did not
fire this round, though two Jest runs left their empty probe directories behind, removed by hand; it fired
on two of round 8's runs and passed on each re-run, as it has before.

### What this board does NOT prove, said plainly

- **Three V2.2 acceptance IDs are named by no test** — CL-04, BN-04, LL-03. Six others in this
  same original list (UP-10, MC-05, MC-10, OP-08, BN-02, LL-01) now have one (v2.3, WP-C, C-7).
  Of the three still open: LL-03 and BN-04 were checked directly rather than assumed and the
  behaviour they describe does not currently hold — Learning (a config-record section) has no
  "All" link or search anywhere in the app, and `demo/v22/brain-proposal-*` does not exist in
  this tree — logged as found-not-fixed in `BUGLOG_v23.md`. CL-04 is a visual claim at two named
  widths with two sections collapsed and was not attempted. §1 carries all three as they stand.
- **LV-07 is a DEVIATION** (B-10): react-native-web maps `accessibilityLabel` to `aria-label`
  and does not map `accessibilityState`, so a native-renderer test sees the prop and never the
  DOM. The `aria-*` prop is passed alongside and asserted as an ATTRIBUTE in an e2e instead.
- **Eighteen routes have no caller anywhere.** All eighteen predate tag `v2.1`; V2.2 added 26
  routes and wired all 26. `evidence/wiring-orphans.json` decomposes the 34 orphans into 13
  component-called, 2 rig-only and 19 uncalled — it was 35 and 20 until B-196 gave `getGoals` a
  store caller. `KNOWN_GAPS.md` §1 carries them.
- **The production bundle is inside its budget, and this section said otherwise until A4R2-04.**
  the production entry is 694,654 gzipped against a 761,274 budget — **8.8% UNDER**, 0.4% above the 692,067 baseline of 9 September (`evidence/perf-baseline.json`, plus `bundle-budget.test.ts`'s 10% headroom). The
  figure printed here was carried from an older disclosure rather than measured, in the one
  section whose job is to tell a reader what to distrust; it is measured now. F-2's refusal to
  lazy-load the tabs remains a recorded decision (§4 A-116), and PF-04 passes with headroom.
- **The device pass and the ux sign-off are their own rows.** A-2 took the frames, A-3 closed at
  its three-round cap with the remainder disclosed in `CARRIED_DEFECTS_v22.md` §2 and §3, and
  three post-cap fixes (B-171..B-173) are in the frames but were never re-reviewed — `19_` A-6's
  one-round pass on the affected frames and the qa-auditor's step 46 are the checks on them.
- **The cold-start gate has not run.** It is A-5's, and `evidence/cold-start-<date>.md` cannot
  exist until it does — which is why the qa-auditor's step 32 is not-yet-applicable in round 1
  and why `19_` A-6 invokes the auditor once more, outside A-4's cap, against the finished tree.

### The evidence map

Where each kind of evidence lives. `HANDOVER.md` sends a reader here rather than carrying the map itself.

| What | Where |
|---|---|
| The e2e board | `jstack-app/evidence/e2e-summary.json`, written only by `pnpm test:e2e` |
| The Jest board | `jstack-app/evidence/jest-summary.json`, written only by a full `pnpm test` |
| Every acceptance ID with the file that proves it | §1 above |
| The V2.1 lessons re-checked | §2 above |
| Mutation seams, red then green | `jstack-app/evidence/mutation-pass.json` |
| Routes with no caller, decomposed | `jstack-app/evidence/wiring-orphans.json` |
| The backend markers | `jstack-app/evidence/todo-backend-grep.txt` |
| The bundle and the interaction timings | `jstack-app/evidence/perf-baseline.json`, `jstack-app/evidence/perf-interactions.json` |
| Every testID, with what it promises | `CONTROLS_v22.md`, guarded by `jstack-app/tests/unit/controls-v22.test.ts` |
| Every bug, with the test that was red first | `BUGLOG_v22.md` |
| The device pass and its review | `demo/v22/`, `jstack-app/evidence/ux-review.md` |
| The independent audit | `AUDIT_v22.md` |
| What is not done, and whose it is | `KNOWN_GAPS.md` |
| The cold-start report | `jstack-app/evidence/cold-start-<date>.md`, once A-5 step 3 has committed it |
