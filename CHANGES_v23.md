# CHANGES_v23.md — JSTACK V2.3

One line per row of `BUGLOG_v23.md`, which has the finding, the fix, the test that was red first and the commit. Grouped as the packages grouped them; the ids are the log's.

## Offline

- **WPA-1** · The connection is read off the requests, so a phone knows when it is offline: a network failure takes the app offline, any answer brings it back, a capture made offline queues at once, and while captures wait the retry timer asks the server before it replays (`jstack-app/data/transport/reachability.ts`).
- **WPA-2** · A tab whose load fails with nothing cached shows one sentence — "You're offline · captures still queue" or "Couldn't load · tap to retry" — and a tap loads it again; the tab stores record a failed load instead of throwing it (`jstack-app/lib/loadError.ts`).
- **WPA-3** · Offline, Today, the Tasks list for its filter and Brain's recent items show their last copy under "last updated … · offline"; the copy is encrypted, holds nothing marked sensitive (since v2.3.1 it keeps those too — WPI-1), is kept for those three tabs only and goes with the emergency wipe (ADR-66).
- **WPA-4** · On the web the offline queue is ciphertext at rest, as the phone's already was, and a capture queued before the change still reads back.
- **WPA-5** · A capture the server refuses survives a reload: Settings › Sync lists it with its words and the server's reason until it is dismissed (A4R7-08).
- **WPA-6** · On the phone build the encryption key is minted once, even when two writes start together on a fresh install or after a wipe (A4R8-05).
- **WPA-7** · When the device offers nowhere to keep the queue and captures are held in memory only, the sync dot turns to attention and Settings › Sync says they are not being saved on this device.
- **WPA-8** · A shared page carries its own `offlineId`, read off its words and link, so the same share filed twice is one capture to a server that dedupes on it (R11-REMAP-1).
- **WPA-9** · Three small losses: a line typed in Close the day while the previous one was on its way is no longer wiped; a subtask title comes back to its field when adding it throws; a task ticked offline reads done on Today and in Tasks until its completion lands (A4R8-07, A4R7-11, A4R8-09).
- **WPA-10** · The offline allow-list test names all ten routes a capture can queue on, read off the route table; it named six.
- **WPA-11** · The limit is recorded: captures replay only while the app is open — on reconnect, focus, unlock and the 30-second retry — with no background wake on either platform (`KNOWN_GAPS.md` §2).
- **WPA-12** · An edit made online no longer overtakes an older queued edit to the same task or setting: it joins the queue behind it, and replay keeps the order.
- **WPA-1b** · The reachability cases that drive the retry timer carry their own 60-second budget, so a busy machine no longer times them out.
- **WPA-2b** · The tabs' other loads fail quietly too: the replies Today and Brain load, and the Tasks tab's waiting rows and open count, each record a failed load under a key of their own and settle, and none of them can clear or stand in for the tab's own load failure.
- **WPA-3b** · Coming back online takes the offline copies down: on a reconnect the queue replays first, then Today, the Tasks list and Brain reload, so "last updated … · offline" no longer outlives the offline state.
- **WPA-4b** · A capture queued on the web before the queue was encrypted is sealed where it lies the first time the queue reads it, not left plain on the disk until it goes; a row that leaves the queue while its seal is being made is not put back.
- **WPA-13** · A device under the emergency lock keeps no offline copy: while the lock is on, a planning tab's load leaves nothing on the device, so a read answered just before the lock cannot put a copy back after the wipe.
- **WPA-14** · After the emergency wipe nothing the web build held can be read: the cipher key goes with the wipe on the web as it already did on the phone, and a capture or a refused list still being sealed when the wipe runs writes nothing (the audit's D1).
- **WPA-15** · While the emergency lock is on, a capture whose request fails is no longer queued onto the device, on either platform: it is refused as a locked write, its words stay in the field, and captures queue again once recovery clears the lock (the audit's D1).
- **WPA-16** · Under the emergency lock, file details and this device's preferences stay off the device too: a Files load that lands after the wipe keeps nothing and mints no key, a preference still changes on screen without being written, and a key mint the wipe overtakes keeps no key (the audit's D1).
- **WPA-17** · After the emergency wipe, dismissing a refused capture in Settings › Sync no longer writes the other refused words back to the device: the wipe empties the list the app was showing, and under the lock the refused list is not written at all (the audit's D1).

## Voice

- **WPB-1** · A dropped Talk connection keeps what was said before the drop: the conversation is kept by its `sessionId`, and the summary filed at the end holds all of it (A4R7-15).
- **WPB-2** · A line typed into Talk is shown once, and a line typed while the connection was down goes out again on the reconnect and is filed once (A4R11-08).
- **WPB-3** · After a lock, Talk says "Paused — locked", keeps the transcript, and reopens the microphone only when Resume is pressed (A4R11-06).
- **WPB-4** · Dictation works on the iPhone build: the phone's recogniser backs the one microphone owner, with the same states and the same Stop, the lock ending it and a refused permission falling back to typing; Talk on a phone passes what it hears as text. Hearing it on a real phone is Josh's check.
- **WPB-8** · The phone check gains Talk in Safari: `audio/mp4` is chosen where `webm;codecs=opus` is not, and a conversation goes through — a runbook step, since no automated lane runs Safari on an iPhone.
- **WPB-9** · A browser speech recogniser that fails or gives up mid-dictation ends the session with its reason, or off after a silence, instead of reading "listening" over a released microphone.
- **WPB-10** · The Talk banner's mic glyph wears the live colour only while Talk's microphone is open.
- **WPB-11** · On a phone, stopping and starting the microphone at once — a second field's mic, a double press, Mute then Unmute — leaves a microphone open: the next start waits for the previous recognition to finish, its last words reach their own field, and a recogniser that is switched off says the mic is unavailable.

## Writes

- **WPB-5** · A failed settings load no longer lets a later save write the defaults over the server: until a load lands, the saves that write a whole record refuse with "needs a connection" and try the load again (A4R6-11).
- **WPB-6** · A lock setting that could not reach the server is not enforced on the device before the server has judged it; Settings shows the new value as queued until it syncs (A4R8-02).
- **WPB-7** · A file attached to a capture that went through while the file was still waiting is filed with that capture when it arrives, not loose in the inbox (A4R8-03).

## Keyboard and dialogs

- **WPC-1** · Escape, and `closeAll()`, close the open task card as well as modals, sheets and Settings.
- **WPC-2** · Escape reaches an open dialog from inside a text field; letters stay blocked while typing.
- **WPC-3** · Every dialog is a modal on the web: `role="dialog"` and `aria-modal`, focus moved in, Tab kept inside, focus given back to the opener on close, and the screen behind `inert`. After QA (C-3b) a dialog opened in the frame another closed keeps its own focus; on native there is no modal equivalent yet.
- **WPC-4** · Revise's Save, the Teach sheet's Save, a proposal's Configure Save and Decision history's reopen are disabled offline with the "needs a connection" toast, as the decision verbs are (A4R10-04).
- **WPC-5** · The desktop letter keys (A, R, L) no longer act at the phone width; the digit tabs and Cmd/Ctrl+K and Z are unaffected (A4R10-07).
- **WPC-6** · Accepting or editing a memory proposal appends a memory-history entry, as `CONTRACT.md` §4.18 says (MH-A).
- **WPC-5b** · The letter-key e2e cases expect A, R and L to leave the card open at the phone width, as C-5 built, and to answer it at the wider widths.
- **GS-02** · The desktop Find opens with its query field focused: a dialog no longer moves focus off a control that already took it.
- **WPC-3c** · Two dialogs closing in the same frame both have their focus restore cancelled when a third opens, and a native test's stale name is corrected.

## Acceptance

- **WPC-7** · Seven acceptance IDs no test named now have one and are PASS in `QA_REPORT_v22.md` §1: UP-10, MC-05, MC-10, OP-08, BN-02, LL-01 and BN-04. After QA (C-7b, C-7c) the orb hides while any microphone is open, so it cannot stop Talk's live session, and `GET /learning?q=` narrows the list.

## Connect

- **WPD-1** · `pnpm serve:mock [--port <n>] [--test]` serves the in-process mock over real HTTP, at `http://127.0.0.1:4181/api/v1` by default — a known-good server for the conformance runner and a browser.
- **WPD-2** · `pnpm connect:check <base>` wraps the conformance runner with a dated report under `jstack-app/evidence/connect/<date>/` and one verdict line, `CONNECT OK` or `CONNECT FAILED` naming the first field that disagreed.
- **WPD-3** · The passkey ceremony's wire shapes are typed (ADR-67), and the mock answers real options and a real confirmation for each step instead of `{ ok: true }` for both.
- **WPD-7** · `CONTRACT.md`'s `GET /health` row says the liveness check is `/healthz`, outside the API, as `BACKEND_HANDSHAKE.md` already did.
- **WPD-14** · `pnpm serve:mock` takes about half a minute to start, and `HANDOVER.md` §1.7 says so and names the line that means it is ready.
- **WPD-15** · `jstack-app/evidence/connect/` is ignored by git: a connect-check report is the deploying team's evidence, not the app's.
- **WPD-17** · `DataProvider.ts` types the passkey ceremony with the D-3 shapes the adapter and the mock already use.

## Transport

- **WPD-4** · A request that never answers is abandoned — after 15 s, 60 s for an upload, with `EXPO_PUBLIC_API_TIMEOUT_MS` overriding the first — as the network failure the outbox recognises, so a queueable write times out into the queue.
- **WPD-5** · Every request's `credentials` is explicit: `"same-origin"` by default, `EXPO_PUBLIC_API_CREDENTIALS=include` for a cross-origin API with CORS credentials.
- **WPD-6** · Certificate pinning fails closed: a host in `SPKI_PINS` with no verifier registered is refused instead of looking checked.
- **WPD-10** · Tried, not fixed: the swap lane against `pnpm serve:mock --test`. The three root-level `__test__` routes the rig calls (`reset`, `clock`, `db`) were never implemented (`KNOWN_GAPS.md` §1).
- **WPD-13** · A response whose body stalls after its headers is abandoned at the timeout too, and a blank or non-numeric `EXPO_PUBLIC_API_TIMEOUT_MS` falls back to 15 s instead of zero.
- **WPD-13b** · A timeout of zero or less in `EXPO_PUBLIC_API_TIMEOUT_MS` means the 15 s default too.

## Native

- **WPD-8** · `jstack-app/eas.json` carries the development, preview and production iOS build profiles and a submit block with placeholders; no build was run.
- **WPD-9** · `NATIVE_RUNBOOK.md` is Josh's own walkthrough for building and submitting the iPhone app, from prerequisites to TestFlight.
- **WPD-11** · `NATIVE_RUNBOOK.md`'s three false steps are corrected — the base URL lives in the EAS profile's `env`, a declined microphone says typing still works, and `eas submit --groups` means internal TestFlight groups — and it, `DEPLOY.md` and `HANDOVER.md` say dictation is wired.

## Life

- **WPG-1** · Life › Learning gets an "All": a searchable archive over every learning item, opening the same detail each row opens (LL-03).
- **WPG-1b** · Life's learning row count no longer counts the section's own verb (LF-08, regressed at integration).
- **WPG-1c** · LL-03's own case presses the real "All" link, and `GET /learning?q=` searches an item's meta as the dialog does, so a query finds the same rows either way (C-7c).
- **WPG-1d** · LF-08 keeps the two rows its acceptance ID names: the listen item is `le2`, not a third row added to the fixture.

## Layout

- **WPG-2** · An e2e case proves two collapsed sections on any tab leave nothing overlapping and nothing scrolling sideways, at 393 and 1366 (CL-04).

## The code review's fixes

- **WPF-1** · With a base URL that has a path (`https://<host>/api/v1`), every request keeps the path; it used to go to the host's root.
- **WPF-2** · A server that answers 429 or 408, or an error page that is not JSON, no longer costs a queued capture: it stays queued, and a 429's `retryAfter` is waited out before the next try.
- **WPF-3** · A locked app lets through the passkey ceremony that opens it, and the emergency lock stays reachable from a locked session on the server as on the device: one flag on the route table decides both.
- **WPF-4** · "Lock everything now" is never silent: a refusal changes nothing and says the server's reason; a server that cannot be reached still locks this device at once, tells the server when the connection returns, and wipes only once the server confirms — and the wipe takes the tokens too.
- **WPF-5** · `openapi.yaml` publishes the upload's multipart body and the `offlineId` every offline capture carries, so a backend generated from it can take a file and dedupe a replay.
- **WPF-6** · A slicers or sections load that fails no longer empties the list on screen, and keeps its reason as every tab load does; the slicer editor waits for a list that loaded before it saves the whole set.
- **WPF-14** · Dictation on a phone keeps its promise that nothing leaves the phone: the recogniser transcribes on the device, and a phone that cannot says the microphone is unavailable and types instead.
- **WPF-7** · An answer's Undo survives a reload that fails after the answer landed, and an Undo that fails on the network is offered again instead of vanishing.
- **WPF-7b** · The case that proves an answer's Undo survives a failed reload answers a rule card, whose reload still rejects since WP-A; the memory proposal's case keeps the order without proving it.
- **WPF-8** · A subtask delete the server refuses puts the subtask back and says why, and a mark-read it refuses rolls back only that reply.
- **WPF-9** · The conformance runner writes nothing unless run with `--writes`, says what those writes leave behind, and fails a layout revert that does not return the order it found; `pnpm connect:check` passes `--writes` through.
- **WPF-10** · The pre-commit hook stages every file `pnpm codemap` regenerates, regenerates for a commit that touches only a root file the maps read (`HANDOVER.md`, `DECISIONS.md` or an acceptance-test file), and names its work tree once.
- **WPF-11** · The Calendar card's free gaps are the reader's own 6am to 8pm, and a share rule taught for one site no longer covers another site whose name sits inside it.
- **WPF-12** · CODEMAP's first page and its invariants table state the date rule the app follows (ADR-47), not the retired Brisbane-in-UTC rule.
- **WPF-13** · The comments and `CONTRACT.md` Q12 no longer promise a relock on `401` that the app does not perform; only a refresh answered as reuse locks, and the relock on `401`, with the token refresh, is REMAP's.

## The build's own gates

- **A-01** · A push to `main` is refused unless `AUDIT_v23.md` carries a signed last verdict as well as the V2.1 and V2.2 audits (`.githooks/pre-push`).
- **B-01**, **WPB-0**, **WPD-B01** · In a linked worktree the pre-commit hook staged the maps at the repository root; the hook names its work tree now (`2a91fad2`).
- **WPD-12** · The Jest count line gives passed and skipped by design as two numbers, `<passed> passed, <skipped> skipped by design / <total>, <suites> suites`, and the report and handover tests check both.
- **WPD-16** · RM-03's walk over the source skips the scratch folders a parallel test creates and removes, so the two no longer race.
- **WPD-12b** · The count guards refuse the old count shapes in every document they read, and require the new shape exactly once where a document says it carries it, so a stale figure cannot read green.

## Docs

- **WPE-1** · The release records are one each: this file with one header and a line per row, `DONE_v23.md`, the log's rows under their own packages, and a dated v2.3 note in `QA_REPORT_v22.md` §0.
- **WPE-2** · `DEVICE_RUNBOOK.md` and `REMAP_HANDOVER.html` drop their v2.2 suffix, every live reference follows, and the handover page says V2.3.
- **WPE-3** · The consolidated set says v2.3: the gaps v2.3 fixed are gone and marked closed where they were carried, the rows packages found and left are in, `HANDOVER.md` §1.3 and §1.8 describe the transport and the iPhone track as built, the outline names the v2.3 records, ADR-68 and ADR-69 record native dictation and Talk after a lock, and the packaged mock is `jstack-mock-v15.html`.
- **WPE-3b** · `KNOWN_GAPS.md` carries the code review's open findings, QA's native-dialog and iOS recognition lines, what the mock actually filters and keeps, and two new questions for Josh.
- **WPE-3c** · After QA: `NATIVE_RUNBOOK.md` names `DEVICE_RUNBOOK.md`, the token-refresh gap in `KNOWN_GAPS.md` says what it costs, `HANDOVER.md` §4 and §5 name `pnpm connect:check`, and this file has a line for every row that landed since.

## v2.3.1

- **WPK-1** · `DECISIONS.md` gains ADR-70..74 for Josh's 15 Sep answers (the last-seen cache, Teach's V3 consumer, Money and Health at V5, the lock's local-vs-full behaviour, append-only rules history); ADR-66 reads amended by ADR-70; RM-09 counts ADR-01..74 and `CODEMAP.md` §7 is regenerated.
- **WPK-2** · `V23_REQUIREMENTS.md` stages Money and Health at V5, the calendar's write-back at V2 stage 2 with a second calendar and combined view at V3, and memory curation at V3; §6's open-question lists drop what 15 September answered.
- **WPK-3** · `KNOWN_GAPS.md` gains a Deferred-to-V5 list, a V3 row for the second calendar and combined view, a stage-2 row for the first, and two new REMAP tasks — the native-dictation approach and the unreachable-lock threat model; the rules-history row quotes Josh's append-only answer.
- **WPK-4** · `SECURITY.md`'s emergency-lock section states what the device clears and what the server does, in Josh's own 15 Sep words, and names the unreachable-lock threat-model task.
- **WPK-5** · `CONTRACT.md`'s `POST /lock`, `POST /recover` and the autonomy-rules row carry the same answers: what a wipe touches, that recovery reloads rather than rebuilds, that a rules removal is a new entry, and who reads what Teach finds.
- **WPM-1** · The repository root's V1 documents, its twenty-one numbered build prompts, `prompts/` and `reference/` move into `history/v1/` (105 files) — `git mv`, nothing deleted.
- **WPM-2** · V2's own eighteen documents, its brief and overview pages and `jstack-mock-v12.html` move into `history/v2/` (23 files).
- **WPM-3** · V2.1's own sixteen documents and `jstack-mock-v13.html` move into `history/v21/` (16 files).
- **WPM-4** · V2.2's own fourteen documents and `demo/` — 2,074 device-pass frames, filed here whole — move into `history/v22/` (2,088 files, the largest of the five moves).
- **WPM-5** · `EXPO_GO_LINK.md` and `EXPO_GO_QR.png`, the retired EAS Update / Expo Go channel, move into `history/expo-go/` (2 files); `eas.json` and `NATIVE_RUNBOOK.md` stay at the root.
- **WPM-6** · Every kept file's link to a moved one, and every guard that reads one, follows it into `history/`: the consolidated docs, nine guard test files, `tools/capture-v2.mjs` and `tools/gen-codemap.mjs`, `CODEOWNERS` and the PR template; `.githooks/pre-commit` drops its four now-frozen regen triggers (V2_DECISIONS.md, V21_DECISIONS.md, BUGLOG_v2.md, BUGLOG_v21.md) rather than re-pointing them, since none of the four is ever edited again; `CODEMAP.md` regenerated and its hand-written sections fixed by hand, verified with `codemap-check.mjs`.
- **WPM-7** · A full `pnpm test` found nine more test files (and one manual tool) reading a moved file directly, none named in the brief; all follow their files into `history/` now. Full board green both zones after the count settled: 2406 passed, 1 skipped by design / 2407, 124 suites. `git ls-files | wc -l`: 2917 before, 2918 after — the one difference is `history/README.md`, a new file the brief asked for; nothing tracked was deleted.
- **WPI-1** · The offline copies of Today, the Tasks list and Brain keep sensitive items too, as Josh decided: the copy is still ciphertext at rest, goes with the emergency wipe and its key, and is never written while the emergency lock is on.
- **WPI-2** · A phone whose runtime has no secure random source no longer refuses offline captures or drops its Files answers: boot checks the encrypted store once, and when it cannot keep anything the app still runs — captures go live and are held in memory only, nothing is saved offline, and Settings › Sync says so; `HANDOVER.md` says what REMAP should add.
- **WPI-3** · Seven cases in the sync store's tests that load the whole app afresh and then wait — among them the three proving that nothing reaches the device under the emergency lock — no longer fail on a busy machine: each has a time budget sized to that load, and what they check is unchanged.
- **WPJ-1** · While Talk or dictation is on, the screen stays on — `expo-keep-awake` on a phone, the browser's wake lock where it has one — and every way a session ends lets it sleep again.
- **WPJ-2** · JSTACK's inactivity lock waits while a microphone is open, counting a fresh window from the session's end; hold-to-lock, the emergency lock and a phone put down still lock at once.
- **WPJ-3** · Locking the phone or leaving the app ends voice the way a pause does — the words stay, Talk reads "Paused", and only Resume reopens the microphone — whether or not JSTACK locked too; ADR-75 names the two locks.
- **WPL-1** · A new "The app and its seams" diagram (architecture, archify, showcase quality) under `diagrams/`, with its spec JSON beside it, inline in the pack's tab 1.
- **WPL-2** · A new "A capture offline, end to end" diagram (sequence) under `diagrams/`, inline in the pack's tab 2.
- **WPL-3** · A new "The session's lock states" diagram (lifecycle) under `diagrams/`, inline in the pack's tab 2.
- **WPL-4** · A new "The stage-2 plug-in, human and agent" diagram (workflow) under `diagrams/`, inline in the pack's tab 3. `HANDOVER.md` §1.9 and `HANDOVER_OUTLINE.md` name all four pages and their specs.
- **WPM-9** · `v23/wpm` merges `origin/v231-build` (WP-I, WP-J, WP-L) by intent; five real conflicts and five generated-section sha stamps resolved, `pnpm codemap` regenerated clean. Folded in from QA: `DECISIONS.md` ADR-66's own decision cell names ADR-70's amendment in place; two `KNOWN_GAPS.md` rows (the unrestored unconfirmed-lock flag on a phone with no secure store, and an iOS AppState `"inactive"` case the auto-lock does not yet carve out the way the microphone listener does).
- **WPN-1** · The packaged mock opens from a file in any browser: where no passkey can run, the in-process mock's lock screen offers "Continue — passkeys unavailable here, mock sign-in" and opens the fixture data; a build pointed at a server never shows it.
- **WPN-2** · The file-open cases in `e2e/core/mockfile.spec.ts` guard it on the e2e board (Chromium, and WebKit where installed); `DEVICE_RUNBOOK.md`, `HANDOVER.md` §1.1 and `README.md` say the mock opens from disk in Chrome, Brave or Safari.
- **WPM-10** · `v23/wpm` merges `origin/v231-build` `9a612e5c` (WP-N) by intent; four conflicts resolved the same way as WPM-9's. `README.md`'s mock-sign-in bullet trimmed to fit the file's 300-word cap (303 → 284) without dropping either path (double-click, or serve and unlock with a passkey).

## v2.3.2

- **WPP-1** · `build_pack_v23.py` restored to the V2.2 page shape: two tabs, `PLAN_BY_STAGE.md` rendered verbatim as the first thing in Start here, the third tab and its 16-row questions table deleted, `FAMILIES.md`/`AGENTS_BACKEND.md`/`CODEMAP.md` named once rather than embedded, the "10a" facts folded into domains 6/7/11; page 71,745 words (cap 84,000), Start here 4,912 words (cap 6,000).
- **WPP-2** · Diagram 1 ("JStack system overview: the app, the backend REMAP builds, and the security boundary") renamed every box to a reader-facing name, file paths moved to sublabels, "Expo" removed, three technical cards replaced with What/Who/When/Why.
- **WPP-3** · Diagram 2 ("Offline capture: what happens to a note when there is no network") down to four plain-named participants (Josh, the app, the offline queue, REMAP's API), the emergency-lock branch as one message, What/Who/When/Why cards.
- **WPP-4** · Diagram 3 ("Session security: what locks, what is wiped, and who confirms it") — the stray "Auto-lock hold" box and the lane-title overlap fixed by dropping the second lane; Unlocked → Locked (wiped) drawn as the main path; What/Who/When/Why cards; `visual-check` clean at all four viewports, both themes.
- **WPP-5** · Diagram 4 ("Stage 2 delivery plan: who does what, in what order, and the gates") every node title reworded to plain words, section numbers/file names/product names moved to sublabels only; the five-rules and three-stops cards kept, reworded.
- **WPP-6** · `HANDOVER.md` §1.9 and `HANDOVER_OUTLINE.md` name the four diagrams' new titles; the retired third-tab reference replaced with `PLAN_BY_STAGE.md`.
- **WPP-7** · The pack's second pass: each of the four pictures now embeds once in the section it explains (stage-2 in Start here, architecture in What you build, offline in What changed, lock states in Honest limits), not linked once from the reading order; the "How we got here" version timeline is dropped as a v2.3.2-only addition; Q-1's plain-words rules applied to the pack's own prose. Page still 71,745 words (cap 84,000), Start here now 300 (cap 6,000).
- **WPP-8** · "One handover" (Josh's amendment): the pack's Start-here tab is `HANDOVER.md` rendered, nothing else — every `##` section a collapsible, the first open, an expand-all/collapse-all control; `COVER_NOTE.md`, `README_FIRST.md`, `WHATS_NEW_*.md`, `CHANGES_SINCE_ADBP_v0.5.md` and `AGENT_HANDOVER.md` retired from the pack folder and the generator; `FAMILIES.md`, `AGENTS_BACKEND.md` and the maps kept as linked reference files, not embedded. Page 57,574 words (cap 84,000), Start here 4,175 (cap 6,000).
- **WPP-9** · The four pictures move inside `HANDOVER.md`'s own sections, matched by keyword against each heading (two of four match today's headings; the rest wait on WP-Q's renumbering). `jstack-app/tools/gen-handover-html.mjs` gets the same collapsible/expand-all treatment for `REMAP_HANDOVER.html`, pure CSS (no script, RM-06); the four diagram PNGs move into the repository's `diagrams/` folder so it can embed them too. Sizes: the pack page 3,624,122 bytes; `REMAP_HANDOVER.html` 623 kB (was 64 kB).
- **WPO-1** · Every Expo account or service the app assumed is gone — `expo-updates`, `@expo/ngrok`, `app.json`'s EAS/updates/runtimeVersion blocks, `eas.json` (now `history/expo-services/eas.json`), `.github/dependabot.yml`; `NATIVE_RUNBOOK.md` and `DEPLOY.md` now describe `npx expo prebuild` → Xcode → Josh's own Apple developer account, no EAS. The open-source Expo SDK modules the app is built from stay, said once, plainly, in `README.md` and `HANDOVER.md`. Guards that outlived their premise (the app.json/QR check, `deploy.test.ts`, the dependabot block) are removed, not weakened.
- **WPO-2** · `PLAN_BY_STAGE.md`, a new root file under 900 words: what V2 does today, stage 2's scope for REMAP as one table per domain plus a security checklist and day sequence, the still-open questions, then V3/V4/V5 and what works at the end of each. `HANDOVER_OUTLINE.md`, `README.md` and `REMAP_READINESS.md` all point to it.
- **WPQ-1** · `HANDOVER.md` becomes the one handover document (Josh: "Consolidate. Handover is the handover") — `PLAN_BY_STAGE.md`, `HANDOVER_OUTLINE.md` and `REMAP_READINESS.md` deleted, folded into its eight numbered sections; a database schema, a numbered run-it process and the three REMAP agent prompts are new content, not just relocated. Under 950 prose words, against a 4,000-word cap. `README.md` cut to a 116-word GitHub landing page. Every guard that read the three deleted files now reads the same assertion from the `HANDOVER.md` section that holds it.
- **WPQ-2** · `v23/wpq` merges `origin/v232-build` `2921a457` (WP-P) by intent — the four re-titled pictures and sonnet 1's collapsible, keyword-embedding `gen-handover-html.mjs`, patched so tab 2 follows §2 ("Run it") rather than the pre-consolidation §1. Five `HANDOVER.md` headings gained a keyword phrase so each picture lands in the section Amendment 5 intended; the inline "(Picture: …)" pointers are removed as redundant now that the renderer embeds the image itself.
- **WPQ-3** · Two guards outside the brief's seven caught real gaps the full board found: `HANDOVER.md` had dropped its Q24 citation (prompt-injection screening) and the whole "Send to JSTACK" Shortcut recipe when it consolidated — both restored. The D-12 count line moved to 2430 passed / 2431 total once they landed.

## v2.3.3, 16 Sep

- **WPS-1** · Needs you has a schedule, in Settings › Schedules after the seven: its times, pause/resume, the windows it is raised in and whether quiet hours hold it — a field of quiet hours' record (`PUT /settings/quiet-hours` carries `needsYou`). Outside every window Today shows the count and "5 waiting · next at 8:00am" in place of the cards; inside one, the stack as before. It ships paused, at 8am and 4pm.
- **WPT-1** · `HANDOVER.md` renumbered to put questions and security first: §1 a new "Questions for you, and decisions you must make" table (seven rows); §2 security, opening "review the whole security design... nothing here proves a server is secure"; §3 the plan by stage rewritten as Josh's real V1–V5 (AWS/OpenClaw/Telegram; the app + Twenty + n8n; multi-agent; cost optimisation; review and refinement), each with the app's part; §4–§9 renumbered from the old §1–§8; §10 a new appendix. Three new files: `appendix/USER_STORIES_DRAFT.md`, `appendix/JO_PREFERENCES.md`, `appendix/CONTEXT_INDEX.md`. `gen-handover-html.mjs`'s tab-2 extractor now matches the "Run it" heading by text, not by number, so it survives the next renumbering too.
- **WPT-2** · `appendix/USER_STORIES_DRAFT.md` now holds the real content of `REMAP_v23/USER_STORIES.md` verbatim (469 rows, three parts), not the unsourced draft WPT-1 shipped when that path was unreachable from its worktree; `build_pack_v23.py` reads the pack's User-stories tab from this repo file from now on. `appendix/JO_PREFERENCES.md` trimmed 624 → 597 words, every sourced rule kept.
- **WPR-1** · The mic orb floats over the page again, bottom right above the tab bar: the band the phone's tab page kept for it and the demo watermark is gone, and the page's bottom padding lets its last card scroll clear. The orb rests half-transparent with no shadow, and while pressed it is opaque, lifted and 6% larger; a press lands 12 px beyond the circle on every side. The demo watermark is a one-line caption just above the tab bar's top edge.
- **WPR-2** · The orb is push-to-talk: pressing opens the Brain microphone, lifting closes it and files what it heard to Brain as voice, the way Brain's own dictation files; a quick tap files nothing, and the orb stays under the finger for its own hold.
- **WPR-3** · In Dictate to EA the small mic in the field is now a large orb, Talk's size, centred at the bottom of the sheet — the floating orb's own control: hold it to dictate, and the words land in the field for review as before. Every tab keeps the floating orb, Brain included, and it steps aside while the sheet is open.
- **WPR-4** · A field no longer zooms the phone or leaves the page cropped: every text input renders at 16 px or more on the web, the tab bar and the orb ride above the keyboard by the visual viewport and step aside for the expanded editor, Enter or leaving a field puts the page back at the top, and the viewport meta gains `interactive-widget=resizes-content`; Find asks its shorter question on every web page, the longer one no longer fitting at 16 px. TE-01's body-size inputs and A-6's page band give way, and their e2e cases say so.
- **WPR-5** · The two Gantt handle cases in the e2e board wait for the drag's commit to land instead of reading the mock's state a moment after the pointer lifted. Measured on the responder itself, the app committed the one-day resize in every one of the failures — what flaked was the read, not the drag. Test only: the app is untouched and nothing the cases assert changed.
- **WPR-6** · A hold released after the app locked keeps its words as Brain's draft and says so; nothing is dropped silently.
- **WPR-7** · `orbPushToTalk.test.tsx` carries the fresh-app budget, so a loaded board cannot time it out.
- **WPR-8** · The keyboard band's `scroll` listener has its own case.
- **WPR-9** · A locked release keeps the spoken words beside a draft already typed, and the toast names the reason.
- **WPT-3** · The audit's document lines: the appendix guard, the native-crypto paragraph back in `HANDOVER.md` §7 and every citation pointed at it, the evidence dates and commit, WPR-4's phone checks in `KNOWN_GAPS.md`, in-repo sources in the appendix.
