# AUDIT_v21.md — the independent audit of JSTACK V2.1

Written by `qa-auditor` (Stage 4, A-4), under `15_CC_V21_AUDIT_PROMPT.md`. The verdict line
below the disclosures is the release gate: `.githooks/pre-push` refuses any push to `main`
until this file carries the auditor's sign-off.

## Disclosures from the builder

Recorded by the Stage 4 builder (Fable 5.1) before the audit ran, so the auditor judges the
disclosure rather than re-finding it.

1. **VP-06, VP-10 and VP-14 are proven at the socket, not in a browser.** The state machine
   in `lib/voice.ts` is where the rules live, and `tests/unit/voice.test.ts` can put twenty
   minutes of silence into a session for nothing; an e2e cannot. Josh ruled on 7 September
   2026 (via the planning session) that socket-level proof is acceptable for these three, and
   that this file should say so with the reason. VP-14's "a removed phrase no longer triggers"
   is covered at the socket by `matchesPhrase` against the edited list.
2. **Carried defects.** `CARRIED_DEFECTS_v21.md` lists every defect the A-0 review found and
   did not fix, with the reason: PF-A (the recorded perf baseline is below the instrument's
   noise; the same-run A/B is the evidence) and VO-A (a `speak` with an `audioRef` is not yet
   played).
3. **The A-0 review's fixes** are `BUGLOG_v21.md`'s R-rows and B-41, each with what was seen
   to fail before the fix. Two of them changed contracts a backend is built to:
   `CONTRACT_v21.md` §3 gained `id` on links and stats items (R-08), and §4.11 carries the
   VO-A note.
4. **Branch protection.** GitHub's branch-protection API is unavailable on this repository's
   plan; RR-05 is met by the tracked pre-push hook and a `NEEDS_JOSH.md` entry recommending
   GitHub Pro or a public repository. `QA_REPORT_v21.md` marks RR-05 PARTIAL for that reason.
   Josh then decided (7 September 2026, via the planning session) that branch protection is
   not needed — GitHub is the backup of the Dropbox tree — so the release row skips it and
   `DONE_v21.md` says so; the hook stays.
5. **The A-3 ux-review closed at its cap, not signed.** Three rounds on `demo/v21/` (508
   frames, both fixture days, three passes), all in `jstack-app/evidence/ux-review.md` under
   `## V2.1 Stage 4 — round 1..3`. Round 1 raised 14 rows, round 2 eight, round 3 six; the
   last verdict line is `UX REVIEW: DEFECTS FOUND`. Twenty-one findings were fixed at the
   root, one commit each with a BUGLOG row that names the guard that was red before —
   `BUGLOG_v21.md` R-14 (the FULL e2e on the A-0 tree) and R-15..R-35 — and the round-3
   fixes (R-31..R-35, among them a regression of R-26+R-27 on the phone and a raw ISO
   timestamp on the task card) were NOT seen by the reviewer: there was no fourth round, and
   they are proven by their guards and by the builder's own read of the frames regenerated
   after them (that read found two more things: R-34's first cut bound the wrong run, fixed
   in a follow-up, and the capture rig itself pressed a toast instead of the lock button once
   R-31 moved the toast, R-36). Twelve findings are carried with severity, reason and evidence
   in `CARRIED_DEFECTS_v21.md` §4 — UX-A..UX-K and FX-A (UX-K and FX-A are the builder's own:
   the mark's opaque chip over scrolling content on the phone, and short-weekday fixture
   literals the R-33 sweep found; the reviewer raised neither). `QA_REPORT_v21.md` marks QA-04
   PARTIAL for that reason. Judge whether the disclosure is adequate and whether any carried row is a
   defect that must not ship; the frames the audit opens should include `undo-toast-d1-393-*`,
   `offline-d1-393-*` and `task-detail-d2-*`, where the round-3 fixes land.
6. **The qa loop is capped at one round by Josh, 7 September evening (token budget); the V2.2
   Stage 6 audit re-covers every V2.1 ID.** Relayed by the planning session. After the one
   round the builder fixes only security-class or data-loss findings, plus anything that meets
   the first-week rule in one commit under fifteen minutes with a test; every other finding is
   one line in `CARRIED_DEFECTS_v21.md` with severity and the fix, and the audit closes with
   the at-cap verdict the auditor's definition names (signed off at cap, N carried). The
   auditor ran on Opus, by the same instruction.

---

## The audit

Written by `qa-auditor` at Stage 4 A-4 on **7 September 2026, 20:51 AEST (UTC+10)** — after the
last code commit `5f016a8` (7 September, 19:10:59 +1000). One round, by Josh's cap.

**Model: Opus** (`claude-opus-5[1m]`), by the instruction relayed with disclosure 6, not by a
Fable capacity fallback.

**Tree as audited:** `v21-build` at `65f15a6`, `HEAD == origin/v21-build`, `git status` clean
before and after. Every mutation below was restored and the tree re-verified clean;
`CODEMAP.md`, `openapi.yaml`, `wiring.json` and `theme/tokens.ts` are byte-identical to HEAD
after being regenerated. Nothing was committed or pushed. Both servers I started (4173, 8788)
are stopped; 4180 was not touched.

### 1 · What I ran, and what it said

| Step | Result |
|---|---|
| `pnpm check` | 0 errors |
| `pnpm lint` | 0 errors, 5 warnings (2 `import/no-duplicates` in `Sync.tsx`, 3 `import/first` in `DecisionCard.tsx`) — matches the report |
| `pnpm test` (both Jest projects) | **1097 passed / 1097, 60 suites**, unit + `jest-expo/ios` — exactly the recorded numbers |
| `pnpm build:web` | clean; CSP + SRI injected (test flavour) |
| `pnpm test:e2e` | **530 passed, 0 failed, 42 skipped of 572**, core 428 · matrix 144 over **8** `w<width>-<scheme>` projects, 18.7 min. Byte-identical to the committed `evidence/e2e-summary.json` apart from its timestamp |
| GL-00/GL-01 console budget | **0**. `e2e/helpers.ts`'s `consoleGuard` is an `auto` fixture, so the assertion is structural — but see A-7: `pwa.spec.ts` is outside it |
| `pnpm build:web:prod` + SEC-01 grep | clean; `grep -rl __JSTACK__ ~/.jstack-dist-prod` exits 1, and the same grep **hits** the test bundle, so the grep can find what it looks for |
| `tools/audit-check.mjs` | 3 advisories, 2 accepted, none blocking |
| `tools/secret-scan.mjs` and `--history` | clean, working tree and whole history |
| `tools/log-scan.mjs`, `tools/unused-exports.mjs` | clean; none |
| conformance over HTTP | run through `tests/unit/conformance.test.ts`'s own `node:http` harness: 11/11, `>30` endpoints swept, dedupe and layout-revert lines present, WM-05's planted defect named |
| 42 skips | all read: width-conditional (Arrange desktop-only, phone/desktop text-entry, GL-05 phone floors) plus the two PWA service-worker tests — which is finding A-1 |

The 42 skips and the 530/572 split reproduce the report exactly. **No red anywhere on the board.**

### 2 · Coverage

- **V2 (166).** Every ID in `02_ACCEPTANCE_TESTS_v2.md` §1 appears in `QA_REPORT_v2.md` with a
  status: 156 PASS, 8 PASS (phone-skip), QA-05 CLOSED BY DECISION, QA-08 PENDING (Stage 2).
  Four rows carry "same test as …" rather than a path (AR-02, AR-03, RL-02, RL-03); each names
  the sibling ID whose row does carry one, which is a citation, not a gap. The ID-count guard
  (`tests/unit/handover.test.ts`) reads §1 and asserts 166 against the table rows — green, and
  it is a literal compared to a count derived from the document, which is the arrangement that
  can actually catch a lost row. No test is deleted or weakened relative to the document.
- **V2.1.** The report covers 119 IDs, all with a status and an evidence path: 112 PASS, 3
  PARTIAL (OF-09, RR-05, QA-04), 2 DEVIATION (PF-02, PF-03), 2 STAGE 4 (QA-05, QA-08). The
  cross-reference guard genuinely reads the report, resolves each cited file and requires it to
  contain the ID, and refuses `02_ACCEPTANCE_TESTS*`/`QA_REPORT_v21` as self-evidence. **But §1
  holds 123 ID rows, not 119** — see A-4.
- Every PARTIAL/DEVIATION says what is missing and why, and each points at the document that
  records it. I judge all five disclosures adequate: OF-09 names the exact wire half that is
  absent (`?since=`/`delta`) and the store field the fix needs; RR-05 names the plan limitation
  and the hook that stands in; QA-04 says "NOT signed" in its own first words; PF-02 and PF-03
  are refusals argued from measurements in `BUGLOG_v21.md` B-25/B-26, which is the honest shape
  for a deviation.

### 3 · Evidence opened (24 artefacts)

Frames: `undo-toast-d1-393-light-test` (R-31's toast above the mark — landed; and UX-K's opaque
chip sitting over card text, exactly as carried), `offline-d1-393-light-test` (the "offline ·
captures queue" health line, the queued row, and FX-A's "→ reminder Fri" visible as disclosed),
`task-detail-d2-1366-light-test` (**R-32 landed** — Activity reads "EA · 7 September" / "EA · 6
September", no raw instant), `brain-d1-1366-light-prod` (**R-34 landed** — "under Work · jstack"
is whole and "as Personal" is two words, so neither the dot nor the emphasised value leads a
line), `settings-d1-1366-light-prod` (**R-35 landed** — the push notice is a row of the
Notifications card). I judge the round-3 fixes the reviewer never saw: all five are in the
frames, and R-36's cause and cure are visible in the rig. Also: `evidence/e2e-summary.json`,
`jest-summary.json`, `mutation-pass.json` (all 20 seams), `perf-baseline.json`,
`ux-review.md` (round 3's coverage paragraph and verdict), `todo-backend-grep.txt`,
`CONTRACT_MAP.md` vs `CONTRACT_v2.md` §6, `public/_headers`, both builds' `index.html`,
`public/sw.js`, `CODEMAP.md` §§1/4/5/6/11, and the check/lint/test/e2e/prod-build logs. Every
one showed what the report claims of it, with the exceptions listed as findings.

### 4 · Twelve V2 IDs re-verified by hand through the rig

Driven with my own Playwright driver written from `lib/testHook.ts` and `CONTROLS_v2.md`, not
from the existing specs; asserted on `db()` and store snapshots. All twelve pass.

DC-02 (picked option 2, the primary re-read "Go with 2", server `option: 2, via: "app"`) ·
UN-01 (undo returned c1 to `open` and to Needs you) · TD-05 (Today's checkbox moved t1 to
`done` on the server) · CG-03 (Week issued a fresh `getCalendar` with `{view:"week"}`) · TK-09
(delegate wrote `{to:"ea",state:"acknowledged"}` and appended "Acknowledged — on it.") · BR-01
(dump created one item, routed "→ filing · Librarian", labels `unlabelled`) · LF-04 (draft
toasted "Drafted · never sends itself") · **AG-02/SEC-07** (a declined biometric left
`agentCaps` byte-identical and toasted "Cancelled — editing caps needs a fresh Face ID"; an
approved one wrote 999) · SE-01 (theme dark, ground `rgb(25,24,21)`, survives a full reload) ·
AR-01 (moving a row rewrote `layouts.today.order` on the server) · **LK-04** (hold-to-lock →
confirm → `session.locked`, the gate returns, and a write attempted through the adapter came
back `refused: the session is locked (/brain/dump)`) · VO-02 (dictation filed one `source:
"voice"` item and closed the bar). Zero console errors or warnings across every session.

### 5 · Mutation audit — five seams redone (three required)

| Seam | Red, for the right reason | Restored green |
|---|---|---|
| Forbidden verb on `DataProvider` (`sendReminder`) | `contract.test.ts` SEC-15 grep half: `Received ["sendReminder"]` | yes |
| Mock `offlineId` dedupe removed (`replayed()` → `null`) | `outbox.test.ts` OF-04: 2 failed — but see A-8 | yes |
| CSP line deleted from `public/_headers` | `pwa.test.ts`: 5 failed, including SH-08's meta-vs-served cross-check | yes |
| A mock handler's response shape broken (`/sync/status` `queued` → string) | conformance runner: `FAIL GET /sync/status — $.queued expected number, got string` | yes |
| A mapped source file renamed (`theme/useLayout.ts`) | `codemap-check.mjs` exit 1 naming the file; CM-01 and CM-03 red | yes |

### 6 · Contract, design system, labels, native, delivery

- **Contract.** Every `TODO(BACKEND: §4.n)` marker resolves: §4.1–§4.9 in `CONTRACT_v2.md`,
  §4.10/§4.12/§4.13 in `CONTRACT_v21.md`; no orphan. `CONTRACT_MAP.md` §6 is character-identical
  to `CONTRACT_v2.md` §6 but for a trailing newline. `CALL_ROUTES` is generated from
  `data/routes.ts` (109 routes = `wiring.json` = `declaredRoutes`), and CT-02 resolves every §6
  endpoint against it. Nothing outside `data/mock/` imports the mock server except
  `data/provider.ts`, `data/transport/mock.ts` and `lib/testHook.ts` — all three named in
  CT-03's allow-list with a reason, and `testHook` is proven absent from the production bundle
  by my own SEC-01 grep. **Both SEC-15 halves bite**: the grep named my planted verb, and
  `assertAllowedPath` throws before the transport for `send`/`pay`/`book` while allowing only
  `/devices/{id}/revoke`.
- **Design system.** `node tools/gen-tokens.mjs` regenerated `theme/tokens.ts` **byte-identical**
  (DS-01). Both lint rules bite on planted fixtures: `jstack/no-colour-literal` on `#ff00ff` and
  `jstack/no-window-dimensions` on the import and the call, and `pnpm lint` exits 1. No component
  over 250 lines, no store over 200, no tab file over 60 — and the guard walks
  `components`, `theme/ui` and `layout`, with a floor that stops an empty walk passing.
- **Label honesty.** Twenty-two controls read against `CONTROLS_v2.md`/`CONTROLS_v21.md`:
  `sync-now`, `sync-copy-*`, `sync-dismiss-*`, `push-switch`, `talk-start/reply/mute/end`,
  `proposal-ok-*`, `rule-edit-save`, `rule-edit-retire`, `insight-block`, `insight-leave`,
  `close-habit-*`, `report-accept/revise/teach`, `{idPrefix}-act-{id}`, `subtask-cb-*`,
  `settings-export`, `device-revoke-*`, plus the eight driven live in §4. Every one does what
  its label says. Two deserve naming as the *right* answers: `subtask-cb-*` renders with no
  `onPress` and `Checkbox` therefore announces itself `role="image"` with "— done" rather than
  promising an action (V2's A-07), and `settings-export` posts the contract's real `POST /export`
  job and toasts a promise about a link rather than pretending a file exists. `{idPrefix}-act`
  only paints a button when the server's verb is one of the five (SH-06) — I read
  `knownVerbsOnly` and the `RowsBlock` call site. QA-01/QA-01b (`controls.test.ts`,
  `controls-v21.test.ts`) exist and are green.
- **BUGLOG smell test.** `BUGLOG_v21.md` carries 41 B-rows, 34 R-rows and 7 A-rows;
  `BUGLOG_v2.md` 102. This is **not** an implausibly clean or uniform log — it is the opposite,
  and that is the finding. Spot-checked three: **B-26** records four refusals with the numbers
  that justified them and says outright that the one thing kept "cannot be measured here";
  **R-31** names its own defect as a regression of R-26+R-27, states what the fix costs
  (the toast band moves from 90–146 to 122–178) and points forward to R-36 as the thing that
  assumption broke; **R-36** admits the capture rig pressed a toast instead of the lock button
  and that all three passes died in forty seconds. Rows that self-incriminate at that level of
  detail are not written backwards. Every one names a guard, and I confirmed R-31's two guards
  exist and are green.
- **Native lane.** Both Jest projects ran (`Ran all test suites in 2 projects`). `tests/native/`
  mounts the five tabs and 23 of the 24 registered overlays with the real stores, and the
  stray-text walk (`collectViolations`, shared by `primitives` and `screens` so the two cannot
  drift) is intact and applied to every surface. The missing one is A-5.
- **Delivery.** `git status` clean; `HEAD == origin/v21-build`; `demo/v21/` holds 508 frames and
  QA-07 asserts the set against literal screen lists that the capture tool must equal, so the
  pass cannot shrink by an edit in one place. `evidence/ux-review.md` is dated 7 September but is
  **not signed** — disclosed, and QA-04 is PARTIAL for it. `jstack-mock-v13.html` is **not**
  newer than the last code change — A-3.

### 7 · The V2.1 steps, by hand

- **13 · the routes table is the sole source.** Planted `auditStrayRoute` in `CALL_ROUTES`:
  `pnpm check` failed with `data/routes.ts(185,5): error TS2322: Type '"auditStrayRoute"' is not
  assignable to type 'keyof DataProvider'.` Restored.
- **14 · offline dedupe (OF-04).** Through the rig: offline capture queued (server unchanged,
  outbox 1); `goOnline()` drained it (server +1, outbox 0); the dedupe table holds **one** key
  for the `offlineId`; replaying the same `offlineId` at the adapter returned
  `duplicate: true` with the same item id and **no second record**.
- **15 · the catalogue refuses.** All six of CB-02's configs through `POST /sections/propose`
  returned 422 with a field: `source.endpoint · not an endpoint a section may read`,
  `blocks · at most 12 blocks`, `blocks[0].text · must be 200 characters or fewer`,
  `pinned · not a field a section config may carry`. The two remaining answers are A-6.
- **16 · headers.** CSP present in `public/_headers` and in the prod build's
  `<meta http-equiv>`, and they agree exactly but for `frame-ancestors 'none'`, which a meta tag
  cannot carry. The test flavour widens `connect-src` to loopback and nothing else.
- **17 · time zone.** The suite forces `TZ` in `jest.config.js`, so to make this a real test I
  changed that literal to `Australia/Brisbane` and re-ran: **1095 of 1097 identical**. The two
  that changed are the meta-guards that assert the process zone is not Brisbane
  (`time.test.ts` TZ-01, `fixture-dates.test.ts` TZ-04) — nothing date-derived moved. Restored.
- **18 · conformance.** Covered in §5; the runner named the endpoint and the field.
- **19 · the map.** CM-01 and CM-03 both red on a rename, `codemap-check.mjs` exit 1. Read
  `CODEMAP.md` §§1, 4, 5, 6 cold: **yes, a fresh agent could add a section brick from them
  alone.** §5 does the one thing that matters — it separates a *static* section (a component in
  `layout/registry.tsx`) from a *configured* one (a `SectionConfig` through
  `layout/SectionRenderer.tsx`), says which to reach for, then names every file for a new block
  type, a new binding, a new record and the propose flow. I checked each named file exists. §4
  pairs every invariant with a guard, §6 gives the gotchas with the bug numbers, and §11's three
  companion lists are empty.
- **20 · voice pauses (VP-08).** Session started, one turn taken, then a three-minute clock
  offset: `running: true`, transcript intact at 2 rows, **0** EA rows added, TalkScreen still
  mounted, state back to `listening`. Silence spoke nothing and ended nothing. I verified
  separately that `setClockOffsetMs` really moves the mock clock (a capture's meta went
  20:36 → 20:47 → 23:36), so this is not a vacuous pass.
- **21 · ending and presence.** VP-13 passes completely: "I'm going to head off in a minute but
  that's all right" did **not** trigger; "that's all" made the EA ask; "no" continued the session
  with nothing filed; the phrase again then "yes" ended it and filed the summary as a brain item
  (`source: "voice"`). The presence half is A-2.
- **22 · the map's liveness.** Instead of committing with `--no-verify` (my constraints forbid
  committing) I produced the same state — a renamed file with a stale map — and confirmed the
  board goes red on the drift test and `codemap-check.mjs` exits 1. `package.json`'s `prepare`
  runs `tools/install-hooks.mjs`, which sets `core.hooksPath` to the tracked `.githooks/`, so a
  fresh clone's `pnpm install` installs it; `core.hooksPath` is `.githooks` on this clone. I read
  `.githooks/pre-push`: it refuses `refs/heads/main` unless `AUDIT_v21.md` carries the
  auditor's sign-off phrase, and `tests/unit/hooks.test.ts` proves both directions (including
  that the at-cap wording counts, since it is the auditor's phrase).

### 8 · Spec drift

No reintroduction found. The Gantt has no `PanResponder`, gesture or drag handler — read-only
per ADR-12. No send, pay, book or revoke affordance: the grep half, the runtime guard and
`DataProvider` are all clean, and the one `revoke` is device revocation. The pack's Don't list
holds: no emoji anywhere in app source, no `fontStyle`, no gradient, no pure black or white in
`theme/tokens.ts`, no pill radius, no third font, no centred desktop layout. `01_APP_SPEC.md`
§13: no Projects view, no learning feed as a tab (Learning is a Life section), no COSOL surface
— `cosol` survives only as a historical silo label in `data/labels.ts`, used by no fixture and
rendered nowhere, which is the ruling `AUDIT_v2.md` already made.

### 9 · Findings

| ID | Evidence | Severity | Class | Fix in one line |
|---|---|---|---|---|
| **A-1** | `public/sw.js` `SHELL`; driven on the prod build at :8788 — after ONE online load the cache holds 5 files and an offline reload gives `#root` **0 bytes**, no `facelock`; after a second ONLINE load it holds the entry bundle and fonts and renders (`#root` 96,382, gate present). The two tests that would say so, `e2e/core/pwa.spec.ts:104` and `:121`, `test.skip` on an **un-polled** `hasWorker(page)` straight after `goto`, while `:87` needs `expect.poll(…, 10000)` to see the same worker — so both skip on every run, including the prod-build command the file documents. Made to poll, "the shell opens with the server stopped" **fails**. `QA_REPORT_v21.md` marks PW-02 PASS and does not list it under "What this board does NOT prove". | MAJOR | FIRST-WEEK | Precache the built entry bundle (`build-web.mjs` already rewrites `index.html`, so it can write the hashed path into `sw.js`), and poll the two skip guards so they run |
| **A-2** | Driven through the rig at 1366: session held, clock +11 min → the ten-minute check is spoken (states pass `speaking → listening → held` a second time); at **+21 min** and **+31 min** `running: true`, `state: "held"`, no brain item. The client's own `spoken() → armHold() → hold()` re-stamps `heldAt` (`data/mock/voice.ts:157`), so the absence clock restarts every time the check is spoken and `ABSENT_AT_MS` is unreachable. The green guard, `tests/unit/voice.test.ts` "asks at ten minutes held and ends at twenty", drives the raw socket with **no `VoiceSession` attached**. VP-10 is PASS in the report. | MAJOR | FIRST-WEEK | Don't re-stamp `heldAt` while `presenceAsked` (or don't re-`hold` after an unanswered server `speak`), with a browser-level test |
| **A-3** | `jstack-mock-v13.html` committed `22d5345` at 2026-09-07 10:08:55; last code commit `5f016a8` at 19:10:59 — **27 code commits later**, including the whole A-3 fix run R-15..R-36 and the emergency-lock wipe. `QA_REPORT_v21.md` QA-06 PASS reads "newer than the last app source change"; its only evidence is that `tools/build-mock.mjs` exists, and no guard checks freshness. | MODERATE | FIRST-WEEK | Re-run `node tools/build-mock.mjs`; add a guard comparing the mock's commit to the newest commit under `jstack-app/{app,components,layout,lib,stores,theme,data,public}` |
| **A-4** | `02_ACCEPTANCE_TESTS_v21.md` §1 holds **123** ID rows; `tests/unit/handover.test.ts`'s `idsIn` uses `/^\| ([A-Z]{2,3}-\d{2})/gm`, which cannot match a digit in a prefix, so **D2-01..D2-04 are invisible** to both the count (asserted 119) and the cross-reference guard's `declared` list — which is why "every §1 ID has exactly one row" passes while four IDs have **no row at all** in `QA_REPORT_v21.md`. D2-03 is quoted by no file in the tree; its substance is covered unlabelled by `e2e/core/day2.spec.ts`. | MODERATE | FIRST-WEEK | Widen to `[A-Z][A-Z0-9]{1,2}`, add the four rows, change the literal to 123, and name D2-03 in the day-2 spec |
| **A-5** | `layout/dialogs.tsx` declares 24 overlays; `tests/native/screens.test.tsx`'s `SURFACES` mounts 23 — `sync` (V2.1's Settings › Sync, row O-2) is absent, and nothing asserts `SURFACES ⊇ DIALOGS`. Same class as `AUDIT_v2.md` AA-05. | MODERATE | FIRST-WEEK | Add the `Sync` entry and a set-equality assertion against `DIALOGS` |
| **A-6** | Driven at `POST /sections/propose`: unknown block type and unknown verb both answer `422 { field: "config", reason: "matches none of the 8 alternatives" }`. `data/mock/validateBody.ts` runs the OpenAPI schema first and truncates the path to its first segment, so `validateSectionConfig`'s `blocks[0].type` never reaches the wire. `tests/unit/sections.test.ts` asserts `field === "blocks[0].type"` against the validator directly — so the two halves CB-02 names ("Jest, and the mock server") disagree, and only the Jest half is checked. | LOW | OTHER | Fall through to `validateSectionConfig` for this route, or keep the full JSON path in `field` |
| **A-7** | `e2e/core/pwa.spec.ts:15` imports `test` from `@playwright/test`, not `../helpers`, so the `auto` `consoleGuard` does not run for its six tests. GL-01 says the budget is zero "across every Playwright test". Same shape as `AUDIT_v2.md` A-01, which is why the fixture was made automatic. | LOW | OTHER | Import `test` from `../helpers` (`BASE` already overrides the URL) |
| **A-8** | `evidence/mutation-pass.json` v2.1 seam 3 names `outbox.test.ts + conformance.test.ts`. Redoing it (`replayed()` → `return null`): outbox goes red exactly as recorded; **conformance stays green**, because `data/mock/handlers/brain.ts:16-19` keeps its own `dump-${offlineId}` dedupe, so the runner's `duplicate: true` check still passes. The recorded red/green output is accurate; the named guard list is not. | TRIVIAL | OTHER | Drop `conformance.test.ts` from that seam's `test` field, or note the second dedupe |
| **A-9** | `reset("day2")` marks subtask `t1-3` **"Send from the JSTACK inbox"** done with an `EA` badge (`demo/v21/task-detail-d2-1366-light-test.png`) — on the card whose own report reads "Draft is in Dropbox; nothing sent", under a watermark reading "nothing sends". `tests/unit/day2.test.ts` asserts "nothing was sent" about the *report* and never looks at the subtask. Not a live affordance (the checkbox is a status mark), but the demo's story contradicts SEC-15's principle that the EA produces work and does not act outward. | LOW | OTHER | Rename the subtask in `data/mock/fixtures/tasks.json` (e.g. "Draft the covering note") |

Nothing above is security-class, a wrong write, or data loss. I considered both majors against
that bar and record why they fall short of it: A-1 loses no data (the outbox persists in browser
storage and drains on reconnect) and opens no gate; A-2 sends no audio while held (`pushAudio`
drops every chunk outside `listening`) and the session is never invisible (VP-12's banner is
asserted). I found no design-level defect: every finding has a fix inside the ADRs already
written.

### 10 · The disclosures, judged

1. **VP-06, VP-10, VP-14 at the socket — adequate for two of three, and the third is A-2.** The
   reasoning ("the state machine is where the rules live") holds for VP-06 (an `error` ends the
   session) and VP-14 (`matchesPhrase` against an edited list) — both are wholly inside
   `lib/voice.ts`, and I read the tests. It does **not** hold for VP-10, because that rule lives
   in the *pair*: the server owns the clock, the client owns the re-hold, and only together do
   they exhibit the behaviour. The socket test cannot see it, and in a browser it fails. The
   disclosure is honest about the method; the ruling rests on a premise that is false for this
   one ID. Carried as A-2, not a reason to refuse sign-off.
2. **PF-A and VO-A — adequate.** PF-A **retracts its own earlier evidence** ("A-1's '0 of 5
   regressed' is retracted") and replaces it with the same-run A/B; I confirmed
   `--reference-url` exists in `tools/perf-baseline.mjs`. VO-A names the test that proves the
   gap and I read it: `voice.test.ts:104` "a speak WITH an audioRef is not spoken locally".
   Both name the reason and the size of the fix. Honest, not hidden.
3. **The A-0 fixes as R-rows — adequate.** See the smell test in §6. Two contract changes
   (`id` on links/stats items, the §4.11 narrowing) are recorded in `CONTRACT_v21.md`, which is
   the right place for something a backend is built to.
4. **Branch protection — adequate.** The hook is tracked, installed by `prepare`, tested in both
   directions, and RR-05 is PARTIAL rather than PASS. Josh's decision is recorded with its date
   and its reason.
5. **The ux-review at cap — adequate, and I verified the part nobody else did.** The review is
   real work: round 3 alone reads all 508 frames with programmatic corner sampling, 254
   light/dark pairs and 254 prod/test diffs, and it closes `DEFECTS FOUND` rather than talking
   itself into a signature. The five round-3 fixes the reviewer never saw are **all present in
   the regenerated frames** — I checked each one by eye (§3). The twelve carried rows are
   disclosed honestly: I saw UX-H's twelve-character waiting titles, UX-K's opaque chip over
   card text and FX-A's "→ reminder Fri" in the frames, each exactly as written, each with a
   reason and a named lever. **None of the twelve is a defect that must not ship.**
6. **One round, Opus — adequate.** A scope statement with a date and a reason, and V2.2 Stage 6
   re-covers every V2.1 ID. I have honoured it: one round, and the nine findings above are
   listed so they can be carried or fixed rather than re-discovered.

### 11 · Verdict

The board is green and reproducible: I re-ran all of it and got the recorded numbers to the
test. The security surface holds under my own probes — the production bundle carries no rig,
the SEC-15 grep and the runtime guard both bite, a write behind the lock gate is refused, a cap
change without a fresh biometric changes nothing on the server, the CSP is present and
consistent in both places it ships, and the secret scan is clean over the whole history. The
reports are truthful in substance; where they overreach (QA-06, PW-02, VP-10) I have said so as
a row rather than softened it.

Nine findings are open, none of them security-class, a wrong write or data loss. Under the cap
Josh set, they are carried:

I independently re-ran the suite (both Jest projects and Playwright on eight projects),
re-verified 12 V2 tests and the V2.1 steps above by hand, read 20 control handlers against
CONTROLS_v2.md and CONTROLS_v21.md, and found the reports truthful. Signed: qa-auditor (Opus).

SIGNED OFF AT CAP — 9 carried

---

## After the round (written by the builder, Fable 5.1, 7 September 2026 — not by the auditor)

Under the planning session's shortening (disclosure 6) there was no second round. Of the nine
findings above, none security-class, the builder dispositioned each under the first-week rule:

| Finding | Disposition |
|---|---|
| A-2 (VP-10's end unreachable) | **Fixed after the round**, `BUGLOG_v21.md` R-39: the mock no longer re-stamps `heldAt` on a hold while held; the client's exact sequence is driven at the socket, and `talk.spec.ts` is green after |
| A-3 (mock v13 stale) | **Fixed after the round**, R-41: rebuilt from the final production export, with a freshness guard (QA-06) |
| A-4 (D2-01..04 invisible to the guard) | **Fixed after the round**, R-37: the regex sees a digit in a prefix, the count is 123, the four rows exist, D2-03 is quoted |
| A-5 (Settings › Sync not mounted natively) | **Fixed after the round**, R-38, with an assertion against the registry |
| A-9 ("Send from the JSTACK inbox") | **Fixed after the round**, R-40, with a fixture guard on EA-owned titles |
| A-1 (PWA precache), A-6, A-7, A-8 | **Carried**, `CARRIED_DEFECTS_v21.md` §5 (PW-A, CB-A, GL-A, MP-A) |

The five fixes are code the auditor did not see; `QA_REPORT_v21.md` marks QA-05 PARTIAL for
exactly that reason, and the V2.2 Stage 6 audit re-covers every V2.1 ID. The auditor's verdict
line above is unchanged and is the release gate.
