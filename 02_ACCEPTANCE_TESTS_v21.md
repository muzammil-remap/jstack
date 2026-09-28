# 02_ACCEPTANCE_TESTS_v21.md — JSTACK V2.1 definition of done

Planner: Claude Fable 5.1, 5 September 2026. Adds to `02_ACCEPTANCE_TESTS_v2.md` (its 166 IDs stay in force and must stay green). Every row: ID · screen · the check in one line. Core specs run at `w393-light` and `w1366-light`; matrix specs on all eight projects; Jest rows say so. §2 is the protocol; §3 holds Josh's `JOSH_QA.md` rows the builder appends; §4 holds expected-value updates.

## §1. V2.1 acceptance IDs

### SM · Simplification (Jest unless noted)
| ID | Where | Check |
|---|---|---|
| SM-01 | `data/routes.ts` | One route table (name, method, pattern, marker, handler) is the only source for `CALL_ROUTES`, the mock server's router, `gen-backend-grep`, `gen-wiring` and `gen-openapi`; a route added to the table without a `DataProvider` method, or a method without a route, fails `pnpm check` |
| SM-02 | `data/ApiAdapter.ts` | Every method is a one-line `this.req(name, params?, body?)`; the file is under 350 lines; behaviour unchanged (every V2 CT and core test green) |
| SM-03 | `theme/ui/` | `theme/ui.tsx` is a barrel over `surfaces`, `text`, `controls`, `chips`, `lists`, `fields`; no source file outside `theme/tokens.ts`, `icons.generated.ts` and `data/mock/fixtures` exceeds 250 lines (a test walks the tree) |
| SM-04 | lint | `fontSize:` outside `theme/` fails lint (planted fixture); every text in components goes through `Txt` or a text primitive; the count of inline `fontSize` outside `theme/` is 0 |
| SM-05 | `layout/dialogs.tsx` | Every dialog and sheet is one registry entry `{ name, component, kind: "modal" | "sheet" | "settings" }`; `app/_layout.tsx` renders `<DialogHost />` and is under 100 lines; adding a dialog touches one file plus its component |
| SM-06 | fonts | The five faces load on web from `public/fonts/` through `@font-face` in `app/+html.tsx` under the pack's family names; `lib/webFonts.ts` is gone; DS-03 (computed families and weights on Today) still passes; native keeps `useFonts` |
| SM-07 | `lib/time.ts` | One time library (fixed +10:00, `formatDay`, `formatShort`, `formatTime`, `dayKey`, `addDays`, `weekOf`, `monthGrid`, `gridPosition`) replaces `date-utils.ts`, `calendarMath.ts` and `clock.ts`; the three are deleted; CG and LF tests green |
| SM-08 | `data/labels.ts`, unused code | `labels.ts` holds only the scheme, types and `inheritLabels` (under 90 lines); content rules and per-noun defaults live in `data/mock/labelRules.ts`; `tools/unused-exports.mjs` reports zero unused exports outside `theme/ui/` and generated files |

### WM · Wiring map, OpenAPI, conformance (Jest unless noted)
| ID | Where | Check |
|---|---|---|
| WM-01 | `wiring.json` | Regenerated equals committed; every route in `data/routes.ts` appears with adapter method, marker, store actions, sections, components, testIDs and acceptance IDs; an orphan (a route no store calls, or a section no route feeds) is listed under `orphans` |
| WM-02 | `WIRING.md`, `WIRING.html` | Rendered from the JSON; one Mermaid diagram per contract section; the HTML opens offline with no external request |
| WM-03 | `openapi.yaml` | Generated from `routes.ts`, `types.ts` and the fixtures; regenerated equals committed; every path has a request and response schema and one example; `tools/validate-openapi.mjs` (own, no dependency) passes |
| WM-04 | `tools/conformance.mjs` | Against the mock server behind `node:http`: every `GET` in the table and the safe writes pass, undo after the window reports `409` as expected, and the run writes `evidence/conformance-<date>.json` |
| WM-05 | `tools/conformance.mjs` | Against a deliberately broken server (a Jest fixture that returns a wrong shape on one endpoint): that endpoint fails with the field named; the exit code is non-zero |
| WM-06 | `CONTRACT_MAP.md` | Carries the `CONTRACT_v21.md` §6 rows and equals `CONTRACT_v2.md` §6 plus `CONTRACT_v21.md` §6 (test) |

### TZ · Time zone and locale
| ID | Where | Check |
|---|---|---|
| TZ-01 | `CONTRACT_v21.md` §1.11, `lib/time.ts` | Every app-formatted date uses the fixed +10:00 offset; a `23:30Z` timestamp renders as the next day 9:30am; Jest |
| TZ-02 | Jest | `jest.config.js` sets `TZ=America/New_York`; every fixture-derived string asserted by the V2 suite is unchanged |
| TZ-03 | core (Playwright `timezoneId: "America/Los_Angeles"`) | Today's header date, the calendar grid positions and the due labels are identical to the Brisbane run |
| TZ-04 | mock | `db.now()` and every server-composed string use Brisbane; the delta line and expiry text match the fixture expectations under the foreign `TZ` |

### ID · Identity before sharing
| ID | Where | Check |
|---|---|---|
| ID-01 | `GET /session` | Returns `user { id, name, role }`, `silos`, `tokenTtlSeconds: 900`; the session store carries `user` after unlock |
| ID-02 | production build | On the mock transport the `DemoWatermark` ("Demo · fixture data · nothing sends") renders on every tab and the locked screen; on `httpTransport` it does not |
| ID-03 | production build | `httpTransport` refuses to start on a non-HTTPS origin other than `localhost` and shows the honest line; Jest on the guard |
| ID-04 | session | A refresh-token reuse (rig) returns `401 { reason: "reuse" }`, locks the device and shows the emergency text; SEC-05 still holds |
| ID-05 | `SECURITY.md` | States the identity limit and the demo rule (test greps the two sentences) |

### MU · Second user and silo readiness
| ID | Where | Check |
|---|---|---|
| MU-01 | rig | `__JSTACK__.asUser("joce")` reseeds the session as Joce with silos `personal:joce`, `family1` |
| MU-02 | every list | As Joce, no record with silo `personal:josh` appears in Today, Tasks, Brain, Life or Agents history |
| MU-03 | Tasks | As Josh, a task from Joce carries the J tag and the accept verb; as Joce the same task is hers with no tag |
| MU-04 | focus | The Family focus resolves to the family silos server-side (`?focus=family` returns only `family1` records) |

### D2 · Day-2 fixture
| ID | Where | Check |
|---|---|---|
| D2-01 | rig | `reset("day2")` seeds `seenAt` yesterday, one expired card with then-what applied, one Later card returned, yesterday's habit logs, a finished overnight subtask |
| D2-02 | Today | Delta line reads "Since yesterday: …" with the counts from the fixture |
| D2-03 | Decision history | The expired card shows `via: expiry` with the recommended option applied; the returned Later card is open in Needs you |
| D2-04 | Task detail | The overnight subtask is done with its cost and the EA report present |

### TM · Telegram mirror
| ID | Where | Check |
|---|---|---|
| TM-01 | mock | `POST /__mirror__/telegram { actionId, verb }` answers the card with `via: "telegram"` and emits a server event |
| TM-02 | Today | Within two seconds and without a reload the card leaves Needs you and the next opens (one refetch, asserted via `calls()`) |
| TM-03 | Decision history | The row reads "via Telegram"; undo is not offered in the app for a Telegram answer |

### OF · Offline capture and sync (core unless Jest)
| ID | Where | Check |
|---|---|---|
| OF-01 | every capture write | `offlineId` is present on `POST /brain/dump`, `/journal`, `/habits/{id}/log`, `PATCH /tasks/{id}`, `POST /tasks`, `POST /people/{id}/act` online and offline (`calls()`) |
| OF-02 | Brain dump, offline | With `context.setOffline(true)` a dump returns `202 { queued }`, the row appears with "queued · syncs when you're back online", and `__JSTACK__.outbox()` holds one entry |
| OF-03 | Today, Life, Tasks, offline | Journal, habit toggle, task done, new task and a People verb queue the same way with their own optimistic state |
| OF-04 | reconnect | Going online replays in order; the server receives each `offlineId` once; a forced second replay returns `{ duplicate: true }` and creates nothing |
| OF-05 | toast | After replay: "Synced · 3 captures"; the rows lose the queued line; the affected stores reloaded once each |
| OF-06 | reload | The queue survives a page reload while offline (IndexedDB) and replays after |
| OF-07 | Settings › Sync | A `409` on replay keeps the server's version, drops the entry, and lists the local text with the server's reason; nothing lost silently |
| OF-08 | Needs you, offline | Verb buttons disabled with "needs a connection"; the health line reads "offline · captures queue"; the mic still files to the queue |
| OF-09 | open | On reconnect and on app focus each composite is fetched once with `?since=seenAt`; the delta line names what changed |
| OF-10 | Jest | The native queue uses `encryptedStore`; entries are unreadable at rest; the web queue wrapper handles a missing IndexedDB by falling back to memory with a logged capability |

### PW · PWA and host-agnostic deploy
| ID | Where | Check |
|---|---|---|
| PW-01 | prod build | `manifest.webmanifest` served with name, icons (generated from the wordmark), `display: standalone`, theme and background = ground |
| PW-02 | prod build on localhost | The service worker registers in production only, caches the shell and fonts, never caches `/api/` or a response carrying `sensitivity: sens`; a second load with the server stopped still renders the shell and the gate |
| PW-03 | `app/+html.tsx` | Head carries the CSP meta, `theme-color` for both schemes, `apple-touch-icon`, viewport-fit cover |
| PW-04 | repo | `jstack-app/vercel.json` and `jstack-app/public/_headers` exist with the SPA rewrite and the security headers; a test parses both and asserts the same header set |
| PW-05 | `DEPLOY.md` | One page each for Vercel and Cloudflare Pages (connect, build command, output dir, env) and the three first-deploy checks |
| PW-06 | `.github/workflows/release.yml` | On a `v*` tag builds prod, runs the SEC-01 grep, attaches `jstack-web-<tag>.zip` and `jstack-mock-<tag>.html`; YAML parses; the steps reference only scripts that exist |

### CI · Continuous integration
| ID | Where | Check |
|---|---|---|
| CI-01 | `.github/workflows/board.yml` | Runs check, lint, both Jest projects, prod build, SEC-01 grep, secret scan, log scan on push and PR; YAML parses; every referenced script exists |
| CI-02 | `board.yml` | Uploads the prod build as an artifact; `JSTACK_PROD_DIST` points inside the workspace |
| CI-03 | `board.yml` or `nightly.yml` | Playwright runs in-job if under 20 minutes on a hosted runner, else nightly; the choice is recorded in `BUGLOG_v21.md` with the measured time |

### SH · Security hardening
| ID | Where | Check |
|---|---|---|
| SH-01 | prod build | CSP and security headers present; the Playwright console shows no CSP violation across the core suite |
| SH-02 | `audit-allowlist.json` | The two Metro `image-size` advisories are listed with the reason; `tools/audit-check.mjs` fails on any high not listed (Jest with a fake audit report) |
| SH-03 | release | `gen-sbom` output attached to the release workflow |
| SH-04 | `.github/dependabot.yml` | Weekly grouped updates, daily security updates, for npm in `jstack-app` and GitHub Actions |
| SH-05 | CI | `secret-scan`, `log-scan` and the blocked-action grep run as CI steps and fail the job |
| SH-06 | rendering | Every EA-authored field renders through `Txt` or `RichText` (only `<b>` survives; other tags show as text); no `innerHTML`/`dangerouslySetInnerHTML` path exists; `SectionRenderer` drops an unknown verb at render (Jest + core) |
| SH-07 | supply chain | `tools/secret-scan.mjs --history` clean once and recorded; CI scans the prod bundle for secret-like strings, installs with `--frozen-lockfile`, and `.npmrc` sets `minimum-release-age=3d` |
| SH-08 | headers | CSP carries `frame-ancestors 'none'`, `worker-src 'self'`, `base-uri 'self'`, `form-action 'self'`; HSTS present; the prod build loads under them with no console violation |
| SH-09 | session | A `session.revoked` server event (rig) locks the app immediately, purges the access and refresh tokens, and the locked screen reads "This device was signed out."; the next request without re-auth is refused |
| SH-10 | mock, conformance | The mock validates request bodies against `openapi.yaml` and returns `422 { field, reason }`; the conformance runner sends one invalid body per write and expects the 422 |

### PU · Push subscriptions
| ID | Where | Check |
|---|---|---|
| PU-01 | capabilities | `pushPublicKey` present from the mock; absent → the Notifications sheet shows "push needs the backend" and no prompt |
| PU-02 | Settings › Notifications | The browser permission prompt is requested only from an explicit switch, never on load (rig counts `Notification.requestPermission` calls) |
| PU-03 | adapter | `POST /push/subscribe` carries endpoint, keys and the enabled groups; toggling a group updates the subscription |
| PU-04 | service worker | `__JSTACK__.push(payload)` shows a notification; a tap opens the named tab and card (Playwright with the SW rig) |
| PU-05 | devices | Revoking a device removes its subscription (`DELETE /push/subscribe/{device}`) |

### VP · Voice protocol and client
| ID | Where | Check |
|---|---|---|
| VP-01 | `CONTRACT_v21.md` §4.11 | Message types documented; `lib/voice.ts` exports the same union (type-level test) |
| VP-02 | Jest | The client state machine (idle → starting → listening → replying → speaking → ended, error) with a fake socket; audio chunks carry increasing `seq` |
| VP-03 | mock | `data/mock/voice.ts` plays the scripted conversation (interim, final, reply, speak, filed, end) and files the summary as a brain item |
| VP-04 | Talk with EA | With `liveVoice` on, the sheet shows interim text, then the reply rows with sources, and calls `speechSynthesis.speak` (stubbed) when `speak` has no audio |
| VP-05 | Talk with EA | The typed fallback sends `text` messages in the same session |
| VP-06 | Talk with EA | An `error` message ends the session with the honest line; typing still works |
| VP-07 | Settings › Voice | Car mode enlarges the sheet's controls to 64px, requests a wake lock while a session runs and releases it on end; hands-free turn-taking: after each spoken reply the session returns to listening with no tap, a final transcript of "stop" or a tap on End ends it, and the mic is muted while the EA is speaking so it does not hear itself |
| VP-08 | Talk with EA | A three-minute silence (clock offset) inside a turn ends nothing: the client sends `hold` after five seconds and `resume` on speech, the session and the transcript survive, no reply is spoken; the turn ends only on the cue word ("over", editable), the Reply tap, or the optional silence timer, which is off by default in car mode |
| VP-09 | Talk with EA | A socket drop during a pause reconnects with `start { resume: true, sessionId }`; the transcript so far is restored and no turn is duplicated; `ping`/`pong` every 20 s while held (fake socket, Jest + core) |
| VP-10 | Talk with EA | A server `turn?` is ignored unless the silence timer is on; the presence check comes at 10 minutes held, a second at 20 ends the session with the summary filed and a notification; any speech or tap between them is presence |
| VP-11 | TalkScreen | The live conversation is a full-screen surface on the ground tokens: 96px live orb with the pulse, state line (listening · thinking… · speaking · held), transcript rows, End (64px in car mode); the tab bar and rail are replaced while it runs; document title "● Talking · JSTACK" |
| VP-12 | every tab | Navigating away from TalkScreen keeps the session: a persistent frosted banner "Talking with EA · tap to return · End" shows on every tab, the health line reads "in conversation", End in the banner ends the session; no session can run without the banner or the surface visible |
| VP-13 | Talk with EA | A final transcript matching an end phrase (default list, editable in Settings › Voice) → the EA asks "End the conversation? Yes or no."; "yes" ends and files the summary; "no", other speech, or 20 s of silence continues; a phrase inside a longer sentence does not trigger |
| VP-14 | Settings › Voice | End phrases and the cue word are editable and persisted through `PUT /settings/voice`; a removed phrase no longer triggers |

### CB · Section catalogue (config bricks)
| ID | Where | Check |
|---|---|---|
| CB-01 | `layout/catalogue.tsx` | The eight block types render under `jest-expo/ios` and on web from a config record, using only `theme/ui` primitives |
| CB-02 | validator | Unknown block type, unknown verb, endpoint off the allow-list, 13 blocks, a 201-character string, a pinned column → `422 { field, reason }` each (Jest, and the mock server) |
| CB-03 | registry, Arrange | `GET /sections` configs appear after the static sections in their tab and column; Arrange lists them with the same controls; hide and reorder persist |
| CB-04 | Life | Money, People, Learning and Health render through `SectionRenderer` from `fixtures/sections.json`; every LF test passes unchanged (same `testID`s) |
| CB-05 | Needs you | `POST /sections/propose` creates a card `type: Section` whose body previews the blocks; the card carries why, expiry and then-what like any other |
| CB-06 | Needs you | Approve → the section is `active`, renders in its tab, and appears in Arrange; undo within 10 s reverts |
| CB-07 | Needs you | Revise → `ConfigureDialog` opens on the config; saving re-proposes with `version + 1` |
| CB-08 | Needs you | Never → `retired` and never re-proposed with the same `id`; Later → returns at `laterUntil` |
| CB-09 | `GET /sections/catalogue` | Equals the app's catalogue (block types, verbs, allow-list); test asserts equality |
| CB-10 | dynamic sections | A row verb inside a dynamic section is limited to `open`, `draft`, `nudge`, `done`, `toggle`; each calls the same endpoints the static sections use; a config with `approve` is rejected |

### CM · Codebase map (Jest unless noted)
| ID | Where | Check |
|---|---|---|
| CM-01 | `jstack-app/CODEMAP.md` | Exists with the ten sections of ADR-35; the generated sections equal a fresh `tools/gen-codemap.mjs` run (drift test) |
| CM-02 | stamp | The header carries the sha and date of generation; a freshness test fails when any source file is newer than the stamp |
| CM-03 | hand-written sections | Every path, symbol, command and testID named in sections 1, 4, 5, 6, 9 and 10 exists (walker test); a renamed file fails the test |
| CM-04 | invariants | Every invariant row names a guard (lint rule file or test file) that exists and runs in `pnpm lint` or `pnpm test`; a guard that is not in the board fails the test |
| CM-05 | headers | Every source file under `app`, `components`, `stores`, `data`, `lib`, `layout`, `theme`, `tools` opens with a purpose header comment (lint rule, planted fixture); the inventory in section 2 is harvested from those headers |
| CM-06 | `AGENTS.md`, `CLAUDE.md` | Under 150 lines, first instruction is to read `CODEMAP.md`, carry the exact gate commands, the boundaries and the never-list, the disclaimer to verify paths before relying on them, and "run `pnpm codemap` before every commit"; `.github/PULL_REQUEST_TEMPLATE.md` asks whether CODEMAP's hand-written sections changed |
| CM-07 | pre-commit hook | `pnpm install` sets `core.hooksPath=.githooks`; the hook regenerates and stages `CODEMAP.md`, `wiring.json`, `WIRING.md`, `openapi.yaml` and refuses a commit whose hand-written references are broken, naming the path (Jest drives the hook script directly) |
| CM-08 | CI | `board.yml` runs the drift, freshness and walker tests; a commit made with `--no-verify` that leaves CODEMAP stale turns the board red (workflow references the test; the seam proves it) |
| CM-09 | companion lists | Section 6 carries a generated "new since curation" list of bug-log B-rows newer than its stamp, section 4 lists guards not yet named, section 5 lists file families without a recipe; `release.yml` fails when any list is non-empty at a `v*` tag |
| CM-10 | `pnpm codemap` | One script regenerates every generated artefact in under 10 seconds and is what the hook, CI, the builder rows and the audit all call; running it twice is a no-op |

### UX · Text entry (core; UX-01 also matrix at 393 and 1024)
| ID | Where | Check |
|---|---|---|
| UX-01 | every text field | On a touch width (393, 1024) focusing any text field (dump, journal, chat, find, teach, revise draft, proposal edit, rule edit, configure, section config) opens it as a large editor: full content width, at least 40% of the visible viewport above the keyboard, growing with the content, scrolling inside the editor never the page, the keyboard inset respected (`session.keyboardInset`), mic and send controls pinned at its foot |
| UX-02 | every text field | Blur with empty content, or Cancel, collapses it back to its one-line resting state; blur with content keeps a two-line preview and a "continue" affordance; nothing is lost on collapse |
| UX-03 | desktop | At 1366 and 1920 the field grows in place with the content up to twelve lines, no modal, no page scroll |

### PF · Phone performance
| ID | Where | Check |
|---|---|---|
| PF-01 | `evidence/perf-baseline.json` | Recorded from the prod build at 393: first contentful paint, long tasks over 50 ms during load and a Today scroll, scroll frame times, gzipped entry size; the script and the numbers are committed |
| PF-02 | prod build | Tab screens load lazily on web: the entry chunk excludes Tasks, Brain, Life and Agents code (chunk names asserted); Today interactive before the others load |
| PF-03 | phone | Under 768 the card blur is the reduced value and list-card rows carry no backdrop filter; bars and dialogs keep 24 px; `design/DISCREPANCIES.md` records the override; matrix at 393 |
| PF-04 | Jest | `bundle-budget.test.ts` fails when the gzipped entry exceeds the baseline by more than 10% |
| PF-05 | process | `DEVICE_RUNBOOK_v21.md` has the five-minute phone check with expected results (the LAN address, the four screens, the scroll) |

### RR · Repo readiness
| ID | Where | Check |
|---|---|---|
| RR-01 | `.github/PULL_REQUEST_TEMPLATE.md` | Board checklist, acceptance IDs touched, `CHANGES` line, markers touched |
| RR-02 | `CODEOWNERS` | `* @OMJO26` |
| RR-03 | `dependabot.yml` | SH-04 |
| RR-04 | `CONTRIBUTING.md` | Branches, gates, markers, the never-list, how to run conformance |
| RR-05 | `main` (final row of Stage 4) | Branch protection applied with `gh api` (required check `board`, PR required, no force push) and verified by a read-back, or the exact settings written to `NEEDS_JOSH.md` |

### QA · Process gates
| ID | Owner | Check |
|---|---|---|
| QA-01 | Stage 3d | `CONTROLS_v21.md` covers every new `testID`; the cross-check test is green |
| QA-02 | Stage 3d | `tests/unit/handover.test.ts` guards the counts in `HANDOVER_v21.md`, `README.md`, `QA_REPORT_v21.md`, this file's ID count and the routes count |
| QA-03 | Stage 3d | `evidence/mutation-pass.json` gains ten seams: routes-table drift, inline `fontSize` lint, offline dedupe, catalogue validator, CSP header, time zone, conformance failure detection, bundle budget, stale CODEMAP, hook bypass caught by CI |
| QA-04 | Stage 4 | `evidence/ux-review.md` signed on captures of both fixture days at 393, 1024, 1366, 1920 × light, dark |
| QA-05 | Stage 4 | `AUDIT_v21.md` SIGNED OFF by `qa-auditor` (Fable, or Opus on fallback, named in the file) dated after the last code commit |
| QA-06 | Stage 4 | `jstack-mock-v13.html` built from the prod export, newer than the last app source change, with the demo watermark |
| QA-07 | Stage 4 | `demo/v21/` captures complete: every V2 screen plus Settings › Sync, the Section card, a dynamic section, Talk with EA two-way, offline state, day-2 Today |
| QA-08 | Stage 4 | `main` == tag `v2.1` == `origin/main`, branch protection applied last, `DONE_v21.md` written |

**Count: 123** (SM 8, WM 6, TZ 4, ID 5, MU 4, D2 4, TM 3, OF 10, PW 6, CI 3, SH 10, PU 5, VP 14, CB 10, CM 10, UX 3, PF 5, RR 5, QA 8) plus §3's JQ rows. `tests/unit/handover.test.ts` asserts the number against this table plus §3.

## §2. Protocol

As `02_ACCEPTANCE_TESTS_v2.md` §3, plus: offline tests use Playwright's `context.setOffline(true)` and a reload, never a mocked fetch; time-zone tests run the browser with `timezoneId` set to a non-Brisbane zone; performance numbers come from the production build served by `tools/serve-web.mjs`, never the dev server; a V2 ID that changes expectation because of a V2.1 row is recorded in §4 first.

## §3. Josh's rows (`JOSH_QA.md` intake, ADR-32) and carried V2 defects (`CARRIED_DEFECTS_v2.md`)

<!-- JQ-n · Josh's line verbatim · screen · the check the builder wrote · row -->
<!-- CD-n · carried defect id and title · screen or file · the check (a test that reproduces it, then green) · row C-n -->

### Row 0 intake — `CARRIED_DEFECTS_v2.md` at `3d0beda`, applied per `BUILD_PLAN_v21.md` §4 carried-defect map

| ID | Title | Screen / file | Check | Row |
|---|---|---|---|---|
| B10-01 | QA_REPORT_v2.md QA-04/05/07 re-derived | `QA_REPORT_v2.md` | Re-read QA-07/04/05 against the tree and `evidence/ux-review.md`; `handover.test.ts` `describe("QA-07 the device pass")` (set-equality of `demo/v2/` vs `capture-v2.mjs` `SCREENS`, no frame count in the report) stays green | C-1 |
| B10-02 | saturated-fill guard reads the value, not the line | `tests/unit/saturated-fill.test.ts` | Replay the auditor's eleven forms (multi-line object, split ternary, spread, alias, destructured token, renamed hook var, `layout/`) plus the `c.ground`/`c.alert` false-positive stays green | C-1 |
| B10-03 | 0x08 bytes gone from delivery docs | `QA_REPORT_v2.md`, `BUILD_PLAN_v2.md`, `BUGLOG_v2.md` | `security.test.ts` "the delivery documents are free of them too" green | C-1 |
| R23-01 | RACQ bill due date vs expiry, two days apart | `data/mock/fixtures/life.json`, `actions.json` | Confirm on a capture run; `tests/unit/fixture-dates.test.ts` both halves green; forward-date rule does not fire on provenance dates | C-1 |
| CD-06 | HistoryDialog has no `ListCard` container | `components/tasks/HistoryDialog.tsx` | Give it a `ListCard`, or a `design/DISCREPANCIES.md` row if declined | C-2 |
| CD-10 | People verb `void`s its promise | `components/life/People.tsx:32` | `await actPerson(id, action)` with an honest error toast on rejection; Jest asserts the await | C-2 |
| CD-15 | copy glyph inset off by 8–9px | bill card, copy glyph | Visual nit fixed to the pack's inset | C-2 |
| CD-16 | Gantt `— Now` legend orphan at 1024 | Gantt legend | Legend re-flows with no orphan at 1024 | C-2 |
| CD-11 | Jest worker leak every run | `jstack-app` test run | `--detectOpenHandles` once, leaked handle closed; clean run recorded | C-3 |
| CD-12 | ~20 orphaned lint-guard fixtures | `tests/unit/lint-guards.test.ts` | Fixture cleanup in `finally`; a re-run leaves zero orphans | C-3 |
| CD-13 | saturated-fill allow-list entries not distinctive | `tests/unit/saturated-fill.test.ts` | Allow-list entries name the offence, not `width: 6, height: 6` | C-3 |
| CD-02 | empty `@timing` Playwright lane | `playwright.config.ts`, `run-e2e.mjs` | Lane deleted (no members) or populated; `evidence/e2e-summary.json` summary shape updated; `handover.test.ts` updated | S-7 |
| CD-04 | eight v1.2 evidence leftovers | `jstack-app/evidence/` | Moved under `evidence/v1.2/` | S-7 |
| CD-05 | no enforcement of the 250/200/60 size limits | `theme/ui.tsx`, `app/(tabs)/_layout.tsx` | `tests/unit/sizes.test.ts` walks the tree and enforces component 250, store 200 (superseded — see S-2/S-3 split), tab file 60 | S-2 |
| CD-08 | dead `lib/clock.ts` exports | `lib/clock.ts` | File deleted with its four dead exports; `date-basis.test.ts` allow-list entry removed | S-5 |
| CD-09 | `calAnchor` seeded at module load | `stores/today.ts:97` | Anchor resolves at read time through `lib/time.ts`, never at module load | S-5 |
| CD-17 | `misc.hoverLift` token has no consumer | web hover | `Card`/`Btn`/`BtnPrimary`/`Chip`/`Row`-as-button gain `onHoverIn`/`onHoverOut` applying the token; a Jest test hovers a `Btn` and asserts the style | S-2 |
| CD-18 | fixture prose names a weekday, clock is live | Needs-you cards, calendar | Weekday prose derives from the shifted timestamp (`{weekday:<field>}`); school pickup lands on a school day | D-1 |
| CD-14 | synthetic click behind `inert` still dispatches | `app/_layout.tsx` | Every store mutation checks `session.locked` first and refuses with a logged reason; Jest dispatches a synthetic click behind the gate and asserts `db()` unchanged | H-1 |
| CD-01 | QA_REPORT_v2.md QA-05 still says PENDING | `QA_REPORT_v2.md` | Row points at the closed-by-decision paragraph and `CARRIED_DEFECTS_v2.md` | T-2 |
| CD-03 | log-scan row doesn't name the directory | `QA_REPORT_v2.md` SEC-14 | Row states the scan is clean from `jstack-app/` (root scan trips on the v1.2 `migration/import.ts` leftover, out of scope) | T-2 |
| CD-07 | alert-on-ground contrast 3.61:1 in light | `theme/tokens.ts` `alert` | Pack-token question — see `NEEDS_JOSH.md`; default: keep, measurement recorded in `design/DISCREPANCIES.md`, large-text floor (3:1) accepted for alert text | NEEDS_JOSH.md |
| A-39 | `pnpm audit --prod` — 3 build-time-only findings | `audit-allowlist.json` | Two Metro `image-size` HIGHs + one `xcode` `uuid` MODERATE listed by advisory id with the build-time-only reason; `tools/audit-check.mjs` fails on anything else | C-1 (allow-list) |
| A-09 | hard-coded `t1` silo id | mock handlers | Silo id resolved from session user, not hard-coded | I-1 |
| A-23, A-24 | Stage-1 simplifications carried | `BUGLOG_v2.md` | Recorded as known simplifications, not fixed, in `HANDOVER_v21.md` | HANDOVER_v21.md (docs only) |
| §7 pattern | guards that report green over the thing they check | `CHANGES_v2.md` (fifteen cases) | Hard rule 11 in `14_CC_V21_EXEC_PROMPT.md`; `CODEMAP.md` §6 seeds the pattern; qa-auditor checklist carries it forward | process (no single row) |

R22-01 is not listed: round 23 already independently verified it (17 of 17 families caught by name over 51 removal runs and 10 mutations); carried only for completeness in `CARRIED_DEFECTS_v2.md`, not for re-work.

## §4. Expected-value updates (the build appends; never deletions)

<!-- ID · old expectation · new expectation · BUGLOG_v21 A-row · reason -->

| ID | Old expectation | New expectation | A-row | Reason |
|---|---|---|---|---|
| SM-01 (routes.ts) | `PUT /settings/notifications/{id}` declares body `NotificationDevices` (flat) | Body is `NotificationDevicesBody` = `{ devices: Partial<NotificationDevices> }` | B-24 | The declared shape disagreed with the adapter, which wraps, and with the handler, which reads `body.devices`. The document described a request nothing has ever sent. |
| DC-05/06/07/08/09 | The e2e assertions restate the c1 card's copy — `Dev call Thursday overlaps school pickup`, `expires Wed 5pm` | The spec reads the card's `title` and `thenWhat` from the server it is testing | A-06 | CD-18 makes both derive their weekday from the card's own `expiresAt`. The literals were only ever right one day in seven, and were wrong in the same way the fixture was — which is why nothing caught it. |
| DC-06/UN-01 | The Later toast reads `Later · returns Mon 8am · Dev call Thursday overlaps school pickup` | The toast's card title is read FROM the card under test, not restated in the assertion | A-05 | CD-18 (row `D-1`) makes the card's weekday derive from `expiresAt`, so the literal "Thursday" was only ever right on one day in seven. The assertion restated a fixture string; it now reads it. |
| LF-04..09 (source) | People, Money, Learning and Health are components under `components/life/` | The same four are §4.10 config records rendered by `layout/SectionRenderer.tsx`; every LF assertion and every `testID` is unchanged | B-2 | The row's own proof: the specs did not move, so the sections did not change. The four component files are deleted. |
| LF-08 | Learning's rows are counted as `[data-testid^="learning-"]` inside the section, expecting 2 | Unchanged — but the tab's closing line moved OUT of the Learning card to `TabScreen`'s `footer` prop, keeping its `life-footer` id | B-28 | As a section footer the line took the derived id `learning-footer` and was counted as a third row. It describes the tab, not Learning. |
| CB-04 (new, LF-10) | — | `config-title` edits a section's title through `PUT /sections/{id}` and the rendered section changes; `config-block-{i}` edits a literal `text`/`ghost` block; a BOUND block is listed with its data source and offers no field; Revert restores both records | — | B-2 gave `ConfigureDialog` its §4.10 half. The asymmetry is deliberate (ADR-39): editing what a section SAYS is a person's job, repointing where it READS is a release. |
| CB-03 (new) | — | Arrange lists configured sections beside components on Life, and hiding one persists through `PUT /layout/life` | — | `ArrangeDialog` reads the merged list; a section you can see but cannot arrange would be worse than not building it. |
| SM-01 (routes.ts) | `PUT /focuses` declares body `FocusList` (a bare array) | Body is `FocusesBody` = `{ focuses: Focus[] }` | B-29 | The adapter has always sent the wrapped object and the handler has always read `body.focuses`; only the declaration disagreed. Invisible until H-1 taught the mock to validate request bodies. |
| PU-01/PU-02 (fake) | The push tests' fake browser always has a service worker registered | The fake takes `registered`, and with `registered: false` its `ready` never settles — the browser's own behaviour | B-30 | The one state the bug lives in could not be expressed, which is why U-1 shipped a device revoke that hangs when no worker is registered. |
| CB-07 (revise) | — | Revise on a section card opens the config with the card still OPEN; saving answers it and re-proposes at version + 1 | — | A revise you abandon should not consume the proposal, and a revision that failed to re-propose would otherwise lose it entirely. |
| LF-09 (loadSectionConfig) | `GET /life/sections/{id}/config` 404 is an error | A missing per-section config is a normal answer and sets nothing | B-3 | Since §4.10 three kinds of id reach that endpoint and only one has a record; the 404 became an unhandled rejection in the dialog that asked. |
| CB-05 (Needs you) | — | A proposal ranks 3 and arrives COLLAPSED behind higher-ranked cards, like any other; `waiting-open-{id}` expands it | — | A new section is not more urgent than a calendar clash, and the rank says so. |
| QA-07 (device pass) | 19 declared screens | 20: `arrange-life` joins them, and like `arrange` it has no 393 frame | — | Today's Arrange shows six components; only Life holds both kinds of section, so only Life's frame can show what B-2 changed (ux-review B3R1-12). |
| CB-01 (blocks) | Each block component draws its own surface | No block draws a surface; `SURFACE` in `layout/catalogue.tsx` declares one per type and `SectionRenderer` groups consecutive blocks into it | B-33/B-34 | A `text` block could not be inside a `bars` block's card, which is where Money's due line had always lived. |
| Device pass (all dialogs) | Frames are `fullPage` at the page's scroll height | An open overlay is captured at VIEWPORT size | B-35 | A viewport-sized dialog stretched to 2362px is not what anyone sees, and it made every dialog frame in the pass misleading. |
| §3 `VoiceSettings` | `{ style, speed, readBriefAt }` | Adds `cueWord`, `endPhrases`, `silenceTurnSeconds`, `carMode` — all optional | — | ADR-24's settings. Each exists because the alternative is the app deciding something about a person's own conversation; `silenceTurnSeconds: null` is OFF and is the default, and car mode ignores it entirely. |
| BR-03 | Talk shows the honest line while `liveVoice` is off | Talk opens the conversation; the honest line is reached by flipping the capability OFF through GL-08's rig, and both are asserted | — | V-2 turned `liveVoice` on in the mock because there is now something behind it. The honest-line path did not disappear, it moved to where it belongs. |
| RL-06 | The plain-sheet geometry is measured on `talk-sheet` | Measured on `teach-sheet` | — | Talk is a `screen` since V-2 and has no sheet geometry at all. Same rule, a sheet that is still a sheet. |
| VP-08 (presence) | — | The mock asks at 10 minutes held and ends at 20, filing the summary; answering resets it | — | The exec brief said 30 and 60; `CONTRACT_v21.md` §4.11 says 10 and 20, and the contract is what a backend will be built to. `data/mock/voice.ts` says so where the constants are. |
| PF-02 (lazy tabs) | The entry chunk excludes Tasks, Brain, Life and Agents code; chunk names asserted | UNCHANGED as a target, REFUSED for V2.1: `app.json` sets `web.output: "single"`, so Metro emits one bundle and `React.lazy` can defer evaluation but never a download (B-26). Splitting is a deployment decision (`NEEDS_JOSH.md`, the bundle). Status DEVIATION in `QA_REPORT_v21.md`; `PF-04`'s budget holds the one bundle | A-12 | A row that cannot be met by construction must say so, not PASS on a baseline number |
| PF-03 (phone blur) | Under 768 the card blur is the reduced value and list rows carry no backdrop filter | REFUSED on the baseline's evidence: scroll p95 at 393 is 21.9 ms with the pack's blur, so there is no problem to trade a visible design decision for (B-26). `design/DISCREPANCIES.md` row 19 records the override as NOT taken. Status DEVIATION | A-12 | Same: the row's premise (a phone that cannot paint the blur) was measured false |
| OF-09 (`?since=`) | Each composite is fetched once with `?since=seenAt`; the delta line names what changed | The refetch-once (OF-05, server events) and the delta line (server-composed from the mock's `seenAt`, D2-01) are built and proven; the app does NOT send `?since=` and does not read a `delta` block. Status PARTIAL; `CARRIED_DEFECTS_v21.md` OF-A | A-12 | Half a row cannot be PASS |
| SH-07 (audit) | `tools/audit-check.mjs` runs `pnpm audit --json` and parses it line by line | `pnpm audit --prod --json`, whole document first, line-by-line as the fallback | B-37 | It never parsed anything and printed "0 advisory(ies)" over three real advisories on every board since C-1. Two high `image-size` advisories are now accepted in `audit-allowlist.json` with a reason: build-time only, through Metro, no patched version. |
| CB-02 (13 blocks) | The test builds `LIMITS.blocks + 1` blocks | It asserts the literal 12, builds 13, and checks that 12 are ACCEPTED | B-38 | Written against the constant, the test moved with it: T-1's mutation seam 4 raised the cap to 13 and the test stayed green. |
| PF-04 (bundle budget) | `currentEntry()` prefers `~/.jstack-dist` | It prefers `~/.jstack-dist-prod`, and names the dist it measured in the failure | B-38 | The production budget had been measuring the test-flavoured build since F-2; seam 8 put 282KB into the prod bundle and the test read a stale one. |
| RL-06 (dialog ceiling) | Desktop dialogs are 66vw, max 1000 | 66vw, max 900 — the pack ceiling (handoff.md Settings, "sheet max-width 900") | R-14 | a2f6f82 (A-0 row 2, B3R2-09) set `Dialog` to 900 and ran the touched specs on w393 and w1366 only, where 66vw is 901.56 and the 4px tolerance hid the change; the FULL run on the A-0 tree went red on both w1920 projects (expected 1000, measured 900). The spec asserts the number the component and the pack agree on; a 1000 ceiling fails it again by 100px at 1920. |
| LF-08 (row count) | Learning rows are counted as `[data-testid^="learning-"]` inside the section, expecting 2 | The same count, less the section's own `learning-configure` link, which now sits inside the section because Learning carries `configure: true` like People, Money and Health | R-22 | The link was the one thing the other three records rendered that Learning did not (ux-review R1-11). A link is not a row; the selector was written when nothing else in the section shared the prefix, and it says so now. Two rows, still. |
| DC-05 (the card's expiry) | The card contains the first clause of the server's `thenWhat` verbatim ("expires Thursday 5pm") | The card contains that clause with the weekday in the pack's short form ("expires Thu 5pm"); the spec shortens what it reads through `lib/time.ts` `shortWeekday`, the function the card uses | R-29 | README Content's expiry form is short and the waiting rows already used it (R-21); one decision spelled its day two ways 40px apart (ux-review R2-06). The server's string is unchanged; the app shortens wherever it shows an expiry. |
