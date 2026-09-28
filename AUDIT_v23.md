# AUDIT_v23.md — the independent audit of JSTACK V2.3

Written by `qa-auditor` (QA opus 1) under `_v23-command/AUDIT-BRIEF.md`, once, on `v23-build` at **`bffb227f`** — the release candidate: every package, delta and QA fix merged, WP-E's documents in, the planner's certifying board committed at `7e390724`. Source fingerprint `fcc5d4bc3aca` over 362 files (`jstack-app/tools/source-fingerprint.mjs`). Run in a fresh scratch clone (`git clone --shared`, then `pnpm install --frozen-lockfile --offline`), on a machine no builder was using.

**Model that ran: Claude Opus 5 (`claude-opus-5`).**

`AUDIT_v2.md`, `AUDIT_v21.md` and `AUDIT_v22.md` stand; nothing here supersedes them.

> **The release gate.** `.githooks/pre-push` opens `main` only when this file's last verdict is a sign-off. This audit found a security-class defect, so no line below carries the sign-off phrase, and `main` stays closed.

---

## 1 · The board is this commit's

| Command, at `bffb227f` | Printed |
|---|---|
| `pnpm check` · `pnpm lint` · `pnpm unused` | exit 0 · exit 0 · exit 0 |
| `pnpm test` (New York) | `Tests: 1 skipped, 2384 passed, 2385 total` · `Test Suites: 1 skipped, 123 passed, 123 of 124 total` |
| `JSTACK_TZ=Australia/Brisbane pnpm test` | the same |
| `node tools/audit-check.mjs` | `audit clean: 3 advisory(ies), 2 accepted, none blocking at high or above` |
| `node tools/secret-scan.mjs .` · `node tools/log-scan.mjs .` | `secret scan clean` · `log scan clean — no console.log/info/debug in app source` |

The summary the run wrote — 2385 total, 2384 passed, 1 pending, 124 suites — is the committed `jstack-app/evidence/jest-summary.json` exactly, and the delivery documents print the same line, `2384 passed, 1 skipped by design / 2385, 124 suites`: `QA_REPORT_v22.md:402` (§3), `QA_REPORT_v2.md:60`, `HANDOVER_v2.md:21`, `DONE_v23.md:19`.

The e2e evidence is this tree's. `jstack-app/evidence/e2e-summary.json` (`generatedAt` 2026-09-14T19:01:35Z) holds 1050 tests — 964 passed, 0 failed, 0 flaky, 86 skipped; core 842 (786 passed, 56 skipped); matrix 208 over 8 projects (178 passed, 30 skipped) — the figures `QA_REPORT_v22.md:404`, `QA_REPORT_v2.md:61` and `DONE_v23.md:22` print. The last commit to what the bundle is built from (the fingerprint's source folders) or to the specs is `fe9e1721` (18:34:53Z), before the run; the two after it, `7e390724` and `bffb227f`, change only documents, the evidence file, `jstack-app/CODEMAP.md` and `jstack-app/tools/gen-codemap.mjs` (that map's generator), none of which is in the bundle.

One targeted spec, under `E2E_LOCK` (held 19:26:16Z–19:28:40Z, released), against an export built from this tree into a scratch folder (`JSTACK_DIST`; the shared `~/.jstack-dist` untouched): `pnpm exec playwright test --project=w393-light --project=w1366-light e2e/core/life.spec.ts` printed `78 passed (2.1m)`, `LF-08 Learning › two rows with meta from GET /learning` among them at both widths.

## 2 · Every BUGLOG_v23 row was red first

The package verifies hold most rows, each with the line it printed: WPA-1..12 (`37185714`); WPB-1..11 (`2a5787b5`, `924a1964`); WPC-1..7 with C-3b and C-7b..f (`4f5406f2`, `2e5ce4a0`); WPC-5b, GS-02 and WPC-3c (`79f5fc6b`, GS-02 and C-5 also planted in the browser); WPD-1..8 (`bd532926`); WPD-11..17 (`53754649`); WPD-12b and WPD-13b (`075e6bf7`); WPF-1..14 (`4c30ba39`) and the WP-F merge (`3259bd7d`); WPF-7b (`ea5ee141`); WPG-1 (`be5db275`); WPG-1c (`6fb40fd4`); WPG-1d (`8a852de0`). Rows with no red run by nature carry a plant instead: WPD-16 (a dangling junction and two scratch folders against the reversed walk), WPD-17 (a wrong interface type through `pnpm check`), and the documents rows (WPE-1..3b quote what stood before; RM-09 planted).

Sampled again at `bffb227f` — every security-class row, one row per package, and A-13 — by reversing the item's own source patch, or with an anchored plant where later work moved its lines. Every case went red, and the tree was clean after each:

| Row | Reversed or planted | Printed |
|---|---|---|
| WPF-1 | its patch | `Expected: "/api/v1/today" / Received: "/today"`; conformance `Expected: "/api/v1/brain/dump" / Received: "/brain/dump"` |
| WPF-2 | `bodyOf`'s status keep; the 429 in the keep-line | `Rejected to value: [SyntaxError: Unexpected token '<', "<html><bod"... is not valid JSON]`; `- Array [] / + Array [ { … "serverReason": "slow down" }, … ]` |
| WPF-3 | its patch | `Error name: "LockedError"`, `Error message: "refused: the session is locked (/auth/webauthn/assertion)"`; server half `- "again": 200, "ceremony": 200 / + 401, 401` |
| WPF-4 | the unreachable branch; the token clear in the wipe | `TypeError: Failed to fetch` out of `lock()`; `Expected: false / Received: true` for the refresh token |
| WPF-14 | `requiresOnDeviceRecognition: false` | `- ObjectContaining { "requiresOnDeviceRecognition": true } / + { … "requiresOnDeviceRecognition": false }` |
| WPA-4 | the web queue's seal | `- "plaintext": false, "sealed": true / + "plaintext": true, "sealed": false` |
| WPA-6 | its patch | `- "first": "the first capture", "mints": 1 / + null, 2` |
| WPA-8 | its patch | `- "carries": "string", "otherShareOtherKey": true / + "undefined", false` |
| WPA-13 | its patch | `- "copyOnDevice": false / + true` |
| WPB-5 | its patch | `Expected number of calls: 0 / Received number of calls: 1` |
| WPC-3c | its patch | `Expected number of calls: 0 / Received number of calls: 1` |
| WPD-13b | its patch | `- "API_TIMEOUT_MS": 15000 / + 0`, in `data/config` and `data/config.swap` |
| WPF-7b | the reloads above the Undo | `Expected length: 1 / Received length: 0` |
| WPG-1c | the verb on the files archive; the route's meta search | `Expected: "learning-archive" / Received: "files-archive"`; `- Array [ "le2" ] / + Array []` |
| WPE-3 | an open id's gap line removed, its row given `**CLOSED at v2.3**` with no commit | `+ "A4R6-07"` |

## 3 · Nothing security-class or data-loss is carried — one is

`KNOWN_GAPS.md` at `bffb227f`: every row has an owner (REMAP or Josh). The fourteen carried ids v2.3 fixed are gone from it, and `CARRIED_DEFECTS_v22.md` marks each `**CLOSED at v2.3 (<commit>)**` beside its `BUGLOG_v23.md` row; every commit exists and is in this tree (MH-A `53a3bf9d`, A4R6-11 `caac84ba`, A4R7-08 `e7927b3e`, A4R7-11 / A4R8-07 / A4R8-09 `c9f5695a`, A4R7-15 `1fc6f7d7`, A4R8-02 `9c52585b`, A4R8-03 `ff4ea2b3`, A4R8-05 `79107c5c`, A4R10-07 `c56a7467`, A4R10-04 `ffb84ac7`, A4R11-06 `f0df05bb`, A4R11-08 `5b83c73b`). RM-09 refuses the looser phrasings (no commit, not bold, lower case) and is green.

**WPA-4 (rest) is security-class.** The row (`KNOWN_GAPS.md:43`) says a web capture still being sealed can land after the emergency wipe clears the outbox. Asked of the code on the web branch, over the in-memory IndexedDB the A-4 cases use and in `lib/emergencyWipe.ts`'s own order, it is worse than the row says, because the web cipher key is never deleted:

- a queue write already under way when the wipe runs lands after it, and a reload reads it: `rowsAtRest: ["in-flight"]`, `readBack: ["the words typed as the phone was taken"]`;
- a capture whose own request fails after the lock is queued onto the wiped device — `data/transport/outbox.ts:193` passes every network failure to `enqueue` (`:145`), with no lock or wipe check: `rowsAtRest: ["after"]`, readable after a reload;
- after the wipe and a reload the key is still in IndexedDB and opens what was sealed before it: `keysLeft: ["kv"]`, `unsealedAfterWipe: "sealed before the wipe"`.

`wipeAllLocalData` (`lib/encryptedStore.ts:190`) clears AsyncStorage and deletes the SecureStore key on native only; on web the non-extractable `CryptoKey` stays in `jstack-keys`/`keys` and `webKeyPromise` stays cached, and `webQueue.put` (`lib/queueStore.ts:201`) seals and writes without the wipe count `encryptedSet` reads (`:171`). The emergency lock is the control for "someone has my phone"; on the web build it can leave a capture readable under a key it keeps. Native is not affected: its queue writes through `encryptedSet`, and its key is deleted.

**Also found, not security-class:** `KNOWN_GAPS.md:42`, "WPA-2 (rest) · Offline, the tabs' secondary loads … still reject into nothing", describes what WPA-2b (`e536ffbf`) fixed — the replies load and Tasks' waiting rows and open count record and settle (`stores/replies.ts:37`, `stores/tasks.ts:100`, `:125`). A gap line for a fixed gap.

**Carried, with evidence its row lacks:** Review 20's "whether `crypto.getRandomValues` exists on the native runtime" (`KNOWN_GAPS.md:17`). Nothing in this tree provides it: no polyfill in `package.json`, and none in `react-native`, Expo 54.0.37's runtime (`expo/src/winter`), `expo-modules-core`, `@expo/metro-runtime` or any direct dependency. `lib/encryptedStore.ts` calls it for the native key and nonce (`:50`, `:62`) and itself notes Hermes has no WebCrypto (`:6`); `@noble/ciphers` throws without it (`utils.js:810`); the native Jest lane runs on Node, which has it. On a device every encrypted write may reject, the native offline queue and the offline copies with it. It fails at the write rather than silently (the capture fields keep the words on a failed write, A-9 and WPA-9), no native build has been made, and the fix is a dependency v2.3 may not add, so it is carried: Josh's first check on the development build, then REMAP.

Judged, not defects: A-13's left-as-found (a copy queued before an unconfirmed lock is still written) is WPF-4's design — an unconfirmed lock wipes nothing until the server confirms, and that wipe takes the copy. The two-device races carried from V2.2 (A4R9-06, A4R7-13) are unchanged since `AUDIT_v22.md` judged them.

## 4 · The documents tell the truth about the code

- `QA-FINAL.md` check 3: `HANDOVER.md` §1.8 against `lib/mic.ts:489` (`requiresOnDeviceRecognition: true`) and `jstack-app/eas.json`'s three profiles — true; §1.3's credentials and timeouts against `data/transport/http.ts` (`credentials: API_CREDENTIALS`, the abort timer around the fetch and its body, `bodyOf` inside it at `:127`) and `data/config.ts` (15 s, 60 s, `Number.isFinite(parsed) && parsed > 0`) — true; `SECURITY.md`'s pinning section (`:75`) against `data/pins.ts` (an empty `SPKI_PINS`, `registerPinVerifier`, `guardTransport` closed for a pinned host with no verifier) — true; `DONE_v23.md`'s carried list is `KNOWN_GAPS.md` — true; "`KNOWN_GAPS.md` holds no row `BUGLOG_v23.md` fixed" — false at `KNOWN_GAPS.md:42` (§3).
- `CHANGES_v23.md`: one `# ` header; 86 `BUGLOG_v23.md` rows and 86 ids in its lines, none missing, none extra, none twice.
- `DONE_v23.md`: its board is the two evidence files, number for number — `2384 passed, 1 skipped by design / 2385, 124 suites` against `jest-summary.json`, and `964 passed, 0 failed, 0 flaky, 86 skipped of 1050` with core 842 (786, 56) and matrix 208 over 8 projects (178, 30) against `e2e-summary.json`. Two sentences are not evidence: "24.5 minutes on a quiet machine" (the summary carries no duration), and "It has not run yet" under "The audit", which this file makes false. No guard reads the file (QA-02 reads `HANDOVER_v2.md`, `README.md`, `QA_REPORT_v2.md`, `HANDOVER.md`).
- `HANDOVER.md` §1.3, §1.7 (`pnpm connect:check` with `--writes`, serve:mock's half-minute start) and §1.8 — true; §4 and §5 lead with `pnpm connect:check`. The mock is `jstack-mock-v15.html` in `HANDOVER.md` §1.1, `README.md:9`, `HANDOVER_OUTLINE.md` and `DONE_v23.md`, and it is in the tree.
- `NATIVE_RUNBOOK.md` carries D-11's three corrections (the base URL in the profile's `env`, no Settings deep-link, `--groups` internal) and names `DEVICE_RUNBOOK.md`; its `eas` commands and flags were checked against eas-cli 18.8.1's own `--help` at `53754649` and are unchanged since.
- `DECISIONS.md` ADR-66..69, in the file's table, each with a status; RM-09 counts ADR-01..69. `REMAP_READINESS.md`'s connect-check row points at `jstack-app/tests/unit/serveMock.test.ts`; the audit's row follows this file.

## 5 · The guards go red when their subject breaks

- **The last-seen cache's `sens` strip.** `lib/lastSeen.ts:41` `new Set(["sens", "sensitive"])` → `new Set(["sens"])`: `tests/unit/lastSeen.test.ts` "nothing marked sens or sensitive reaches the store…" printed `- "brainKeptSensitive": false / + true`. Restored; `git diff --quiet`.
- **The lock gate's `whileLocked` flag.** `whileLocked: true` added to `postBrainDump` (`data/routes.ts:147`): `tests/unit/lockGate.test.ts` went red on both halves — "throws LockedError for each one" `+ "POST /brain/dump"`, and "every mutating route is 401 while the mock session is locked" `+ "POST /brain/dump → 422"`. Restored; `git diff --quiet`.

## 6 · Maps and the packaged mock

No `CODEMAP.md`, `WIRING.md`, `WIRING.html`, `wiring.json`, `openapi.yaml` or `PARAMETERS.md` at the repository root, and no commit since `v2.2` added one. All 67 non-merge commits since `v2.2` that touch app source carry a `jstack-app/CODEMAP.md` change. `pnpm codemap` at `bffb227f` changed CODEMAP.md's section stamps and no other line. QA-06 (`tests/unit/pwa.test.ts:267`, the packaged mock built from this source) is green in both zones.

## Defects

**D1 · security-class · the web build's emergency wipe can leave a capture readable, under a key it keeps.** `lib/queueStore.ts:201-203` and `lib/encryptedStore.ts:190-200`; its row is `KNOWN_GAPS.md:43` (WPA-4 (rest)), which understates it. §3 has what was run and printed. What would close it: `webQueue.put` reads the wipe count before sealing and writes nothing if a wipe ran, as `encryptedSet` does; `wipeAllLocalData` deletes the web key and forgets `webKeyPromise`, as it deletes the native one; the three probe cases become tests, red first; the row goes.

**Not security-class, to fix in the same pass:** `KNOWN_GAPS.md:42` (WPA-2 (rest), fixed by WPA-2b); `DONE_v23.md`'s "It has not run yet".

## Not defects, said out loud so silence is not read as approval

- PROTOCOL §5's four words appear in lines v2.3 added, none of them an affordance or a handler: the WebSocket's own method in `lib/voice/session.ts:72`; a test title in `tests/unit/enterSends.test.ts:31`; a spoken-transcript fixture in `tests/unit/voice.test.ts:372` and `:378`; comments at `stores/parameters.ts:84`, `stores/settings.ts:46`, `data/types.ts:893`, `data/config.ts:62` and `tests/unit/writePaths.test.ts:274`. SEC-15 reads method names, routes and handler paths, and none of those carries one.
- A-13's unconfirmed-lock copy and the V2.2 two-device races, as §3 says.

## Carried, with owners

Every row of `KNOWN_GAPS.md` at `bffb227f`, with the owner the file names, except D1 and line 42. Beside them, from this audit and the delta round:

| What | Owner |
|---|---|
| Native `crypto.getRandomValues`: nothing in the tree provides it, so the native encrypted store may reject every write (§3) — the development build's first check | Josh, then REMAP |
| A4R11-01's e2e case can go red at w1366 when the second keydown reaches the handler after the 800 ms settle window (1 run in 31; 30 repeats green at `79f5fc6b`, `145a3812`, `2e5ce4a0`) | REMAP |
| Find restores no focus on close: GS-02 leaves `opener` unset when a child already holds focus | REMAP |

## What closes this round

D1 fixed red first, the two lines above corrected, and the four gates green at the fix's commit. The one re-invocation re-runs the three probe cases as committed tests, both mutation plants, the gates in both zones, and the documents D1 and the fixes touch.

*Dated 15 September 2026, by the machine clock (the last run ended 19:28:40Z, 05:28 AEST), on `bffb227f`.*

Verdict: DEFECTS FOUND — D1 (WPA-4 (rest)): the web build's emergency wipe can leave a capture readable, under a key it keeps

---

# Round 2 · the re-invocation, at `90ef2247`

Written by `qa-auditor` (QA opus 1) under `_v23-command/AUDIT-BRIEF.md`'s one re-invocation after fixes, on `v23-build` at **`90ef2247`**: round 1's candidate `bffb227f`, then D1's fix and the writers of its class found while verifying it — `c30c91ff` (WPA-14, WPA-15), `5ccdde2a` (WPA-16), `def9b799` (WPA-17), and the cases `3db1bda3` and `87cbe1fb` added for parts no case of their own held — the map stamps (`bed9cd91`, `55968ef3`), the certifying board's evidence commit `399cea16`, and `90ef2247`, which corrects two dates in the QA reports. Run in the same scratch clone, checked out at each sha; the lockfile is unchanged since `bffb227f`.

**Model that ran: Claude Opus 5 (`claude-opus-5`).**

Round 1 stands as written above, and its verdict held for `bffb227f`; its note on the release gate described that round. This round's verdict is the last line of the file, and it is the one the gate reads.

## R2.1 · The board is this commit's

| Command, at `87cbe1fb` (`55968ef3` adds only CODEMAP.md's stamps; `399cea16` the board's evidence and the lines that print it; `90ef2247` two lines of the QA reports) | Printed |
|---|---|
| `pnpm check` · `pnpm lint` · `pnpm unused` | exit 0 · exit 0 · exit 0 |
| `pnpm test` (New York) | `Tests: 1 skipped, 2406 passed, 2407 total` · `Test Suites: 1 skipped, 123 passed, 123 of 124 total` |
| `JSTACK_TZ=Australia/Brisbane pnpm test` | the same |
| `node tools/audit-check.mjs` | `audit clean: 3 advisory(ies), 2 accepted, none blocking at high or above` |
| `node tools/secret-scan.mjs .` · `node tools/log-scan.mjs .` | `secret scan clean` · `log scan clean — no console.log/info/debug in app source` |

The evidence commit `399cea16` changes `DONE_v23.md` (the Jest line and the audit sentence), `QA_REPORT_v22.md` (the e2e line's duration, dropped), `jstack-app/evidence/e2e-summary.json` (its `generatedAt`) and `jstack-app/CODEMAP.md`'s stamps, and nothing else; `90ef2247` then changes one line each of `QA_REPORT_v2.md` and `QA_REPORT_v22.md` (R2.4), and nothing else. `jest-summary.json` reads 2407 total, 2406 passed, 1 pending, 124 suites — the run above — and the delivery documents print `2406 passed, 1 skipped by design / 2407, 124 suites`: `DONE_v23.md:19`, `HANDOVER_v2.md:21`, `QA_REPORT_v2.md:60`, `QA_REPORT_v22.md:402` (§3) and `:419`. The document guards (`qaReport22`, `handover`, `consolidation`, `buglogRows`, `codemap`, `pwa`, `qa-citations`) passed 165 of 165 at `399cea16` and again at `90ef2247`.

The e2e evidence is this tree's. `jstack-app/evidence/e2e-summary.json` (`generatedAt` 2026-09-14T21:45:26Z, the planner's board on `55968ef3` under `E2E_LOCK`) holds 1050 tests — 964 passed, 0 failed, 0 flaky, 86 skipped; core 842 (786 passed, 56 skipped); matrix 208 over 8 projects (178 passed, 30 skipped) — the figures `QA_REPORT_v22.md:404-407` (§3), `QA_REPORT_v2.md:61-63` and `DONE_v23.md:22-24` print. The last commit to what the web export is built from (`tools/source-fingerprint.mjs`'s eight folders and four scripts) is `def9b799` (20:58:14Z), and the specs were last changed at `952363a4`, both before the run; the commits after it — `3db1bda3`, `87cbe1fb`, `55968ef3`, `399cea16` and `90ef2247` — change tests, documents, the evidence files and CODEMAP.md, none of which is in the export. This round ran no spec of its own: the summary is written only by a complete `pnpm test:e2e` (`tools/run-e2e.mjs`), and nothing the export is built from changed after the run.

## R2.2 · D1 and its class are closed, each red first

Each row's own source was reversed at its commit, and each part planted out alone; every case went red with the line its row quotes, and the tree was clean after each.

| Row | Reversed or planted | Printed |
|---|---|---|
| WPA-14 | `lib/queueStore.ts`, `lib/encryptedStore.ts`, `lib/emergencyWipe.ts` (11 hunks) | `"queueRows": ["in-flight"]`, `"conflictRows": ["list"]`; `"opened": "sealed before the wipe"`, `"keysLeft": ["kv"]`; `"before": "sealed before the wipe"`; `"countedBeforeTheQueueWasCleared": false` |
| WPA-14, one part at a time | the old order · no check on the transaction's tick · a read that mints · key rows kept · the key not forgotten · A-4b's re-seal gate | the order case · the in-flight case · `"keysLeft": ["kv"]` · `"opened"` and `"before"` · `"after": null`, `"keys": 0` · `"keysLeft": 1` |
| WPA-15 | `data/transport/outbox.ts`, `data/provider.ts` (7 hunks) | `"lockedError": false` with a row at rest; `"typed while locked"` still queued; native `"keyMinted": true`, `"queueOnDisk": "jstack-enc-v1:…"` |
| WPA-15, one part at a time | no refusal before the write · `data/provider.ts`'s emergency callback · the refusal after the write | the native case and both web cases · `"status": 202` with a queued row and a key row (web), `"queueOnDisk": true`, `"keyMinted": true` (native), and the refused list rewritten under the lock · `"status": 202`, `"queued": true` |
| WPA-16 | `lib/recentFiles.ts`, `stores/device.ts`, the two mint hunks of `lib/encryptedStore.ts` (8 hunks) | `"jstack.recentFiles"` on disk, `"keyMinted": true`; `"unchangedOnDisk": false`; the three preference keys on disk; `"kv"` in `keysLeft`; `"keyInKeychain": true` |
| WPA-17 | `lib/emergencyWipe.ts`, `data/transport/outbox.ts` (2 hunks) | `"conflictRows": 1`, `"keyRows": 1`, `"readBack": 1`; native `"listOnDisk": true`, `"keyMinted": true`; `"conflicts": 2`; `"keptRows": 1`, `"keyRows": 1` |
| WPA-17, one part at a time | the wipe leaves the sync store's list · `keepConflicts` ungated | only the reset's case, `"conflicts": 2`, `"entriesNow": 1`, `"queued": 1` · only the gate's cases, `"keptRows": 1`, `"keyRows": 1` and, under a lock that wiped nothing, `"listRewritten": true` on web and native |

Three of those parts at first had no case of their own — planted out, only QA-06's source fingerprint went red — and each has one now (`def9b799`, `3db1bda3`). Each half of WPA-17 is held by a case of its own as well, because either half alone turns the end-to-end Dismiss cases green: the reset by the sync store's case (`def9b799`), the gate by `outbox.test.ts`'s case (`def9b799`) and, through the app's own wiring under a lock that wiped nothing, by two more on web and native (`87cbe1fb`).

The probes this audit wrote (scratch only, never committed), each green at `87cbe1fb` and red at the commit before its fix and with its fix reversed: the app's own `wipeThisDevice` with a capture and a refused list being sealed as it runs leaves nothing at rest and no key (web); the outbox `data/provider.ts` builds refuses a capture while the session store's `emergency` is set (web and native); a lock landing during the write is refused, not answered queued; a plain row being re-sealed as the wipe runs mints no key; a Files load answered after the wipe, the three preferences, and the first key mint racing the wipe keep nothing (web and native); a refused capture dismissed after the wipe, and one dismissed under a lock that wiped nothing, write no list (web and native). Round 1's three probe cases stand as committed tests.

## R2.3 · Nothing security-class or data-loss is carried

Verifying D1's fix found two more writers of its class before the merge, both fixed above: the file details and this device's preferences (WPA-16), and Settings › Sync's Dismiss, which wrote the other refused captures' words back after the wipe under a new key, readable after a reload (WPA-17). The rest of what the app writes to the device, read at `55968ef3` in the folders the web export is built from: the cipher key (WPA-14, WPA-16); the seven `encryptedSet` call sites — the offline copies (`lib/lastSeen.ts:75`, A-13), the file cache and the preferences (`lib/recentFiles.ts:110`, `:124`; `stores/device.ts:86`; WPA-16), the native queue and refused list (`lib/queueStore.ts:101`, `:121`; WPA-15, WPA-17), and the unconfirmed-lock flag (`lib/emergencyLock.ts:66`), written only by the lock that wipes nothing; the refresh token, written only on a server grant; the passkey credential id in `localStorage`, which the wipe's `multiRemove` takes; and the service worker's cache, which holds the app shell only (`public/sw.js`, unchanged since `bffb227f`). No persist middleware, no file-system writes.

`KNOWN_GAPS.md` at `90ef2247`: WPA-2 (rest) and WPA-4 (rest) are gone, and every row has an owner.

## R2.4 · The documents tell the truth about the code

- `SECURITY.md:145-157`: what the wipe takes on both platforms, the count, what the device keeps under the lock, and what a refused and an unreachable lock do — true against `lib/emergencyWipe.ts`, `lib/encryptedStore.ts`, `data/transport/outbox.ts`, `lib/recentFiles.ts`, `stores/device.ts` and `stores/sync.ts`.
- `DONE_v23.md:31`: the audit sentence names D1 and `BUGLOG_v23.md` WPA-14 to WPA-17, and its board (`:19`, `:22-24`) is the two evidence files, number for number.
- `BUGLOG_v23.md` 90 rows and `CHANGES_v23.md` 90 ids, none missing, none extra, none twice; WPA-14..17 are headed security-class and carry the lines R2.2 quotes.
- `QA_REPORT_v22.md:404-407` prints the summary's figures, and since `399cea16` no duration.
- `QA_REPORT_v2.md:59` dates `ev:e2e-summary.json` 2026-09-15, and `QA_REPORT_v22.md:46` says §3's Jest and e2e lines are this tree's, from the board on the fixed tree on 15 September, committed at `399cea16` — true against the summary's stamp (2026-09-14T21:45:26Z, 07:45 on 15 September in Brisbane). At `399cea16` the two lines still dated the evidence 13 and 12 September, as they had at `bffb227f`, where round 1 read them without saying so; `90ef2247` corrected both.

## R2.5 · The guards go red when their subject breaks

At `55968ef3`: the last-seen cache's `sens` strip narrowed to `"sens"` (`lib/lastSeen.ts:41`) printed `- "brainKeptSensitive": false / + true`; `whileLocked: true` on `postBrainDump` (`data/routes.ts:147`) printed `+ "POST /brain/dump"` in "throws LockedError for each one" and `+ "POST /brain/dump → 422"` in "every mutating route is 401 while the mock session is locked". Each restored; `git diff --quiet`.

## R2.6 · Maps and the packaged mock

No root map copies, and every fix commit of this round carries its regenerated `jstack-app/CODEMAP.md`. `pnpm codemap` at `87cbe1fb` changed only the five section stamps — what `55968ef3` commits — and at `55968ef3` only the stamps again. QA-06 and CM-01 are green in both zones; with the document guards (`pwa`, `codemap`, `qaReport22`, `handover`, `consolidation`, `buglogRows`), 160 passed at `55968ef3`.

## Not defects, said out loud

- Two checks are defence in depth and cannot be observed in the committed order: the re-seal's own count check (the queue clear always follows the count), and the web key forgotten only after IndexedDB's clear.
- The web case "under a lock that wiped nothing, a Dismiss rewrites no list at rest and mints no key" reads `"keyRows": 1`, which a key minted afresh in place of the one row would also give; its `listRewritten` half is what holds the gate, and goes red. Its native twin compares the key itself.
- The rebuilt mock bundle re-emits the same fixture and library text at every sha, the four words included (84 at each); no authored line of this round adds one.
- An unconfirmed lock refuses new captures, keeps no new copy of the refused list, and wipes nothing (WPA-15's and WPA-17's decision); whether it should wipe stays Josh's question in `KNOWN_GAPS.md`.

## Carried, with owners

Every row of `KNOWN_GAPS.md` at `90ef2247`, with the owner the file names. Beside them, unchanged from round 1:

| What | Owner |
|---|---|
| Native `crypto.getRandomValues`: nothing in the tree provides it, so the native encrypted store may reject every write — the development build's first check | Josh, then REMAP |
| A4R11-01's e2e case can go red at w1366 when the second keydown reaches the handler after the 800 ms settle window | REMAP |
| Find restores no focus on close: GS-02 leaves `opener` unset when a child already holds focus | REMAP |

> I independently re-ran both Jest projects in both zones at the fix's commit, reversed every fix of D1's class and planted out its parts one at a time, probed the wipe on web and native through the app's own wiring, checked the evidence commit against the board it records, and read the documents the fixes touch against the code, and found the reports truthful. Signed: qa-auditor (Claude Opus 5, `claude-opus-5`).

*Dated 15 September 2026, by the machine clock (the last check of the tree ended 2026-09-14T21:56:10Z, 07:56 AEST), on `90ef2247`.*

Verdict: SIGNED OFF AT CAP — 3 carried

---

# Round 3 · v2.3.1, at `ac15bcee`

Written by `qa-auditor` (QA opus 2) under `_v23-command/AUDIT-BRIEF.md` and `QA-HANDOVER.md`, on `v231-build` at **`ac15bcee`** — the evidence commit on the release candidate `cf5dfb28`, which merges WP-K, WP-I, WP-J, WP-L and WP-N, and last WP-M's move of every earlier version's documents into `history/`.

**Model that ran: Claude Opus 5 (`claude-opus-5`).**

Rounds 1 and 2 stand as written above, and their verdicts held for their own commits. This round's verdict is the last line of the file. Every package was verified once at its own head, in a scratch clone at `C:\Users\joshu\AppData\Local\jstack-qa\wpk`, before this round: WP-K at `2916084a`, WP-M at `ad377057`, WP-I at `debf9996`, WP-J at `46fe9b0f`, WP-L at `c879da57` and again at `c37290f3`, WP-N at `9a612e5c`. What follows re-checks the merged tree.

## R3.1 · The board is this commit's

| Command, at `ac15bcee` | Printed |
|---|---|
| `pnpm test` (New York) | `Tests: 1 skipped, 2443 passed, 2444 total` · `Test Suites: 1 skipped, 127 passed, 127 of 128 total` |
| `JSTACK_TZ=Australia/Brisbane pnpm test` | the same |
| `jest-summary.json` after both runs | byte-identical to the committed file; `git diff --stat` printed nothing |

Both runs were mine, under `_v23-command/BOARD_LOCK`, on a machine with no other test process; the tree was clean before and after.

The five count lines agree with that board and with each other: `DONE_v23.md:19`, `history/v2/HANDOVER_v2.md:21`, `history/v2/QA_REPORT_v2.md:60`, `QA_REPORT_v22.md:402` and the narrative at `:419` all read **2443 passed, 1 skipped by design / 2444, 128 suites**. `DONE_v23.md` was the one that had not moved — it stood at WP-I's `2411 / 2412, 125 suites` through WP-J, WP-L, WP-N and the release candidate itself, which I recorded against WP-J and again against WP-L and WP-N; `ac15bcee` closes it. That is the whole of this round's defect list.

The evidence commit changes only what the rule allows: `DONE_v23.md` (the Jest line and the e2e line), `QA_REPORT_v22.md` (§3's e2e figures — a word-diff shows the changed tokens are `1,050`→`1,056`, `1050`→`1056`, `964`→`970` and `842: 786`→`848: 792`, and no prose), `history/v2/HANDOVER_v2.md` and `history/v2/QA_REPORT_v2.md` (their e2e lines), `jstack-app/CODEMAP.md` (five section stamps, `97a3e2f2`→`cf5dfb28`, no content) and `jstack-app/evidence/e2e-summary.json`. It carries `[skip ci]`.

The e2e evidence belongs to this tree. `e2e-summary.json` holds 1056 tests — 970 passed, 0 failed, 0 flaky, 86 skipped; core 848 with 792 passed and 56 skipped, matrix 208 with 178 passed and 30 skipped — with `generatedAt` **2026-09-15T04:21:43Z**. The last commit to `jstack-app/e2e/` and to every folder of the export's own fingerprint (`app`, `components`, `layout`, `lib`, `stores`, `theme`, `data`, `public`, and build-web, build-mock, sw-precache, vendor-fonts) is `d54bc4db`, committed 2026-09-15T03:35:31Z — forty-six minutes before the board ran. Nothing under any of those paths changed between `d54bc4db` and `ac15bcee`; what did change is documents, the `history/` move, evidence and stamps.

## R3.2 · Every v2.3.1 row was red first

`BUGLOG_v23.md` and `CHANGES_v23.md` carry one `## v2.3.1` heading each and the same twenty-six ids in the same order — WPK-1..5, WPM-1..7, WPI-1..3, WPJ-1..3, WPL-1..4, WPM-9, WPN-1..2, WPM-10 — none missing, none twice.

I reproduced each code row's red myself, at the package's own head, by reversing its own source and running the cases the row names:

- **WPI-1** — the strip put back: `"todayKeptSens": false` and `"brainKeptSensitive": false` where the case wants both true.
- **WPI-2** — the whole probe and fallback reversed: all three `secureStore.test.ts` cases red with `"probe": "none"` and `"persistent": true`, and `screens.test.tsx`'s Sync case with `"secureLine": 0`.
- **WPI-3** — the budget planted to 1 ms: exactly ten cases red on "Exceeded timeout of 1 ms", the seven in `sync.test.ts` and the three in `secureStore.test.ts`, and no others. The diff of those seven is the comment, the constant and seven timeout arguments; no assertion moved.
- **WPJ-1** — the screen-awake tag taken out of the microphone owner: 18 of 21 `micAwake` cases red.
- **WPJ-2** — the microphone hold taken out of `autoLock.ts`: three cases red with 1, 2 and 3 calls where none is wanted. The fourth case in that group stays green by design, and its row says so.
- **WPJ-3** — the source reversed: `micAwake.test.ts`'s background case red with `Expected: false / Received: true`, and `screens.test.tsx`'s WPJ-3 case with `Expected: 0 / Received: 1`.
- **WPN-1** — `Gate.tsx` reverted: two of four `gateMockSignIn` cases red with "Unable to find an element with testID: mock-sign-in". Its negative case is a real guard, not scenery: with the four adapter checks stripped, the case that wants no fallback on a server build goes red.

WP-K's, WP-L's and WP-M's rows are documents, diagrams and a file move, each proved in its own way — WP-L by the four validate receipts, re-run here at showcase quality with nine checks, zero errors and zero warnings each; WP-M by the tree itself, below.

Two rows were wrong when I first read them and are right now. WP-L's diagram 1 drew the transport calling the sync store, where `stores/sync.ts` is the only caller of `replay()`; diagram 3 offered no route to a confirmed emergency lock except through the unconfirmed one, where `lib/emergencyLock.ts` goes straight to `confirmed()` when the server answers. Both were corrected at `c37290f3`, the second with the refused case added, and both rows record the correction rather than quietly absorbing it.

## R3.3 · Nothing security-class or data-loss is carried

Every row of `KNOWN_GAPS.md` at this commit carries an owner, and none of them heads a v2.3.1 fix. Two are this round's own, added after my package verdicts:

- **WPI-2 (rest)**, owner REMAP — on a phone whose runtime has no secure random source, the flag that carries an unconfirmed emergency lock across a relaunch is written through the very store that cannot keep anything, so it is lost. This is carried, not blocking, and the reason is structural: on such a device nothing is persisted at all, so there is nothing at rest for the lost state to expose; and `stores/session.ts` opens with `locked: true` whatever happens, so the passkey gate still stands on the next launch. What is lost is the emergency escalation, not the lock.
- **WPJ-3 (rest)**, owner Josh — on an iPhone with `lock.lockOnHideTouch` on, the first dictation's permission prompt reports `AppState` `"inactive"` and the inactivity lock treats any non-active state as a hide, so JSTACK may end the session it just asked permission for. It fails towards locking, never away from it, and B-4 keeps the words already heard; it is a device check, unproven on a device.

Neither is a weakening and neither loses a record. Round 2's three carried rows are still rows, still with their owners.

## R3.4 · The documents tell the truth about the code

Josh's 15 September answers are where WP-K put them. Three, checked at this commit: "Money & health move to JStack V5 stage" in `DECISIONS.md` (ADR-72) and twice in `KNOWN_GAPS.md`'s Deferred-to-V5 list; "Local lock when unreachable, full lock on confirmation…" in `DECISIONS.md` (ADR-73) and in `SECURITY.md`'s emergency-lock section; "Append only. Memory will evolve over time, history matters" in `DECISIONS.md` (ADR-74) and in `CONTRACT.md` §4.22's rules row.

`SECURITY.md`, `HANDOVER.md` and `DONE_v23.md` say nothing about the offline copies dropping a record marked sensitive — a claim none of them ever made, which WPI-1's row states plainly. The two places that did are corrected: `CHANGES_v23.md`'s WPA-3 line and `CODEMAP.md` §4's row for `lastSeen.test.ts`. `DECISIONS.md`'s ADR-66 now carries the amendment inside its decision cell as well as in its status.

`HANDOVER.md` §1.1 says the packaged mock opens from disk and what its lock screen offers there, with the caveat that only the mock offers it; §1.8 carries WP-J's three behaviours in the owner's own terms, the app's lock against the device's; §1.9 links all four diagrams and their spec files. `README.md` is 284 words against its 300-word cap.

WP-M moved 2,231 files into `history/` and deleted nothing. At this commit `git diff --name-status -M100% 290e2708 ac15bcee` reports three deletions, and they are not losses: under ordinary rename detection all three — `CONTROLS_v2.md`, `HANDOVER_v2.md`, `QA_REPORT_v2.md` — are R099 moves into `history/v2/`, and the one per cent is exactly WP-N's `mock-sign-in` row in the first and the count lines in the other two, edited on other branches after WP-M moved them. With rename detection at its default there is no deletion anywhere in the range.

## R3.5 · The guards go red when their subject breaks

`AUDIT-BRIEF.md`'s plant P2, at this commit: `whileLocked: true` added to `postBrainDump` turns `lockGate.test.ts` red, printing `+ "POST /brain/dump"` and `+ "POST /brain/dump → 422"`. Restored, the tree is clean.

P1 is retired with the strip it planted. Its replacement, named in WPI-1's row, is "`encryptedSet` writes the plaintext": at this commit, sealing swapped for the plain string turns the A-3 case red with `"ciphertext": false` and `"plaintextOnDisk": true`. Restored, the tree is clean.

## R3.6 · Maps and the packaged mock

No root copy of `CODEMAP.md`, `wiring.json`, `WIRING.md`, `WIRING.html` or `openapi.yaml`. QA-06 and CM-01 are green at this commit, forty-six cases between them.

The packaged mock opens from a file. WP-N's case is in the core project and ran on the certifying board: the core project moves from 842 tests to 848, which is `e2e/core/mockfile.spec.ts`'s three cases at each of the two widths. It opens the committed `jstack-mock-v15.html` by its file URL, deliberately without the virtual authenticator the shared helper installs, and reaches Today on fixture data.

## Not defects, said out loud so silence is not read as approval

- The mock sign-in is reachable on any build running against the in-process mock, not only on a page where no ceremony can run: a person who declines the prompt gets a refusal the gate treats the same way. On a fixture-data build that is the intended trade, and four separate checks — three at the setters and one at the render — keep it out of a build pointed at a server. It is a wider door than "only where a passkey cannot run", and it should be read as deliberate.
- The `v2.3.1` id sequence skips WPM-8. Both files agree, so nothing is missing from either; the gap is in the numbering only.
- Diagram 4's spec quotes the backend agent rules verbatim, including the sentence that names the four forbidden verbs. The same sentence already stands in `CONTRACT.md` §1.
- `tests/unit/rules.test.ts`'s removal case is still named for the behaviour the mock has today, which ADR-74 now answers differently. The case pins the mock, and `KNOWN_GAPS.md` names the mock as the gap.
- The rebuilt mock bundle re-emits its own fixture and library text at every commit; no authored line of this round adds one of the four verbs.

## Carried, with owners

Every row of `KNOWN_GAPS.md` at `ac15bcee`, with the owner the file names. This round's own two, beside round 2's three:

| What | Owner |
|---|---|
| WPI-2 (rest) · the unconfirmed emergency lock is not restored at the next launch on a runtime with no secure random source | REMAP |
| WPJ-3 (rest) · on an iPhone the permission prompt's `"inactive"` may let the inactivity lock end the session it just asked for | Josh |
| Native `crypto.getRandomValues`: nothing in the tree provides it, so the native encrypted store may reject every write — now guarded at boot, and the device check is still the proof | Josh, then REMAP |
| A4R11-01's e2e case can go red at w1366 when the second keydown reaches the handler after the 800 ms settle window | REMAP |
| Find restores no focus on close: GS-02 leaves `opener` unset when a child already holds focus | REMAP |

## What closes this round

> I verified each package once at its own head in my own clone, reversed every code row's source and ran the cases it names, planted the budget and the adapter guard to prove two green cases were guards rather than scenery, re-ran both Jest projects in both zones at this commit under the board lock, re-ran the two document plants here, re-ran the four diagram receipts, and checked the move of 2,231 files into `history/` against the tree rather than against the report. The two diagram errors I found were corrected before this round, and the one count line that had not moved is corrected by this commit. Signed: qa-auditor (Claude Opus 5).

*Dated 15 September 2026, by the machine clock (the last check of the tree ended 2026-09-15T04:47Z, 14:47 AEST), on `ac15bcee`.*

Verdict: SIGNED OFF AT CAP — 2 carried

---

# Round 4 · v2.3.2, at `8143db3e`

Written by `qa-auditor` (QA opus 2) under `_v23-command/AUDIT-BRIEF.md` and `QA-HANDOVER.md`, on `v232-build` at **`8143db3e`** — the evidence commit on v2.3.2, the round Josh asked for on the evening of 15 September: the Expo services out of the app, and one document REMAP reads first.

**Model that ran: Claude Opus 5 (`claude-opus-5`).**

Rounds 1 to 3 stand as written above, and their verdicts held for their own commits. This round's verdict is the last line of the file. Each package was verified once at its own head before this round: WP-O at `cf00fd84`, WP-P and WP-Q together at `0084aa4b`.

## R4.1 · The board is this commit's

| Command, at `8143db3e` | Printed |
|---|---|
| `pnpm test` (New York) | `Tests: 1 skipped, 2430 passed, 2431 total` · `Test Suites: 1 skipped, 126 passed, 126 of 127 total` |
| `JSTACK_TZ=Australia/Brisbane pnpm test` | the same |
| `jest-summary.json` after both runs | byte-identical to the committed file |

Both runs were mine, under `_v23-command/BOARD_LOCK`; the tree was clean before and after. `pnpm check` and `pnpm build:web` both answered 0 at `cf00fd84`, where the dependency change landed.

The five count lines agree with that board and with each other: `DONE_v23.md:23`, `history/v2/HANDOVER_v2.md:21`, `history/v2/QA_REPORT_v2.md:60`, `QA_REPORT_v22.md:402` and the narrative at `:419`, all **2430 passed, 1 skipped by design / 2431, 127 suites**.

The evidence commit changes only what the rule allows, plus the two corrections this audit asked for: the count and e2e lines in `DONE_v23.md` and `QA_REPORT_v22.md`, `jstack-app/evidence/e2e-summary.json`, `jstack-app/CODEMAP.md`'s stamps, `REMAP_HANDOVER.html` regenerated from its source, four edits to `HANDOVER.md` (two citations of a disabled CI workflow replaced by the local gate commands, check 3 given the two commands it actually needs, one filler sentence cut), and `consolidation.test.ts` — the prose cap returned to 3,000 words and the stale comment corrected. It carries `[skip ci]`.

The e2e evidence belongs to this tree. `e2e-summary.json` holds 1056 tests — 970 passed, 0 failed, 0 flaky, 86 skipped — with `generatedAt` **2026-09-15T19:38:20Z**, sixteen hours after `d54bc4db`, the last commit to `jstack-app/e2e/` or to any folder of the export's own fingerprint.

## R4.2 · Every v2.3.2 row was verified

`BUGLOG_v23.md` and `CHANGES_v23.md` carry one `## v2.3.2` heading each and the same fourteen ids — WPO-1..2, WPP-1..9, WPQ-1..3 — none missing, none twice.

This round removed rather than repaired, so the proof is of a different kind: that what went was dead, and that what stayed still compiles and runs.

- **The Expo services are gone and the SDK modules are not.** `expo-updates` and `@expo/ngrok` leave `package.json`; the lockfile loses 395 lines and gains none. `app.json` loses its `extra.eas`, `runtimeVersion` and `updates` blocks. `eas.json` moves to `history/expo-services/` whole. All fifteen Expo SDK packages the app compiles from remain. Nothing under `app/`, `lib/`, `stores/`, `components/`, `data/`, `layout/`, `theme/`, `tools/`, `tests/` or `e2e/` refers to either removed package; `pnpm check` and `pnpm build:web` both answer 0.
- **Three guards went with their subjects, and none was weakened to pass.** A-6 compared a generated QR, its link file and a project id in `app.json`: the generator is deleted and the id is gone, so there is nothing left to compare. The whole of `deploy.test.ts` read `jstack-app/eas.json` and nothing else — I checked every one of its eight cases — and that file is now frozen history. The dependabot case read a file Josh asked to be deleted. In each the premise is gone, not inconvenient. The arithmetic closes exactly: 2444 − 8 − 2 − 1 = 2433 at `cf00fd84`.
- **The consolidation lost no fact.** I tokenised `PLAN_BY_STAGE.md`, `HANDOVER_OUTLINE.md` and `REMAP_READINESS.md` as they stood before deletion and chased every token now absent from `HANDOVER.md`. Each one survives in the kept set — `CODEMAP.md`, `history/README.md`, `KNOWN_GAPS.md` or the logs. What is absent is self-reference and citation marks.
- **The schema table is the code's.** All twenty-eight wire shapes named in `HANDOVER.md` §4 resolve in `jstack-app/data/types.ts`, but for `OutboxEntry`, which the row itself marks client-side and which lives in `data/transport/outbox.ts`. Every command in the document is a script that exists or a tool file that exists.
- **The four pictures were re-drawn and re-checked against the code.** The reversed edge round 3 recorded is gone with the re-spec, which makes the transport and the sync store one node; the emergency lock's ordinary path is the emphasised one and the refusal is stated; each of the four validates at showcase quality with no error and no warning.

## R4.3 · Nothing security-class or data-loss is carried

Every row of `KNOWN_GAPS.md` carries an owner. Round 3's two remain, and the microphone-prompt check is now REMAP's in that file as well as in the plan, which is what closed the disagreement I recorded against WP-O. Nothing in this round touched the lock, the wipe, the outbox or the encrypted store: `lib/emergencyLock.ts`, `lib/emergencyWipe.ts`, `lib/lockGate.ts`, `lib/highRisk.ts`, `data/routes.ts` and `stores/session.ts` are untouched across it.

Five files are deleted outright since the v2.3.1 tag, and all five are deliberate: `.github/dependabot.yml` and `jstack-app/tools/gen-expo-qr.mjs` on Josh's own instruction, `jstack-app/tests/unit/deploy.test.ts` with the file it read, and `HANDOVER_OUTLINE.md` and `REMAP_READINESS.md` into `HANDOVER.md`. Round 3's "nothing deleted" was WP-M's rule for moving history, and it still holds of that move: every versioned original is where it was put.

## R4.4 · The documents tell the truth about the code

`HANDOVER.md` is the one document: the plan by stage, the run, the build, the database shape, the security checks, what is carried, three agent prompts and the reference table. It is 1,183 prose words against a 3,000-word cap. `README.md` is 116 words against 300.

No instruction anywhere tells a reader to use an Expo service. The few remaining mentions are negations or pointers into `history/`: "no EAS or Expo service", the retirement lines in `DEPLOY.md` and `NATIVE_RUNBOOK.md`, and the font packages in an amended decision, which are libraries. The one honest sentence about the SDK modules stands in both `README.md` and `HANDOVER.md`.

`NATIVE_RUNBOOK.md` describes a path that exists: `npx expo prebuild --platform ios`, open the workspace, choose a signing team, run on the device, then TestFlight and the App Store, with the server URL exported before Xcode opens. Expo 54.0.37 is installed and every script it names is in `package.json`.

## R4.5 · The guards go red when their subject breaks

The two document plants still bite at this commit — P2, which gives a capture route a lock exemption it should not have, and WPI-1's replacement, which writes the plain text where the sealed payload belongs. Both were re-run here; both went red on the lines their rows quote, and the tree was clean after each.

One guard had been loosened and is loosened no longer. `HANDOVER.md`'s prose cap was raised to 4,000 words when the three files were folded in; the document is 1,183 words and was 2,673 before the fold, so the cap had been raised for a document that had shrunk. `8143db3e` puts it back to 3,000.

## R4.6 · Maps and the packaged mock

No root copy of `CODEMAP.md`, `wiring.json`, `WIRING.md`, `WIRING.html` or `openapi.yaml`. The handover page is regenerated from `HANDOVER.md`, renders every section as a collapsible, and carries all four pictures inside itself as encoded images, so it opens from disk with nothing to fetch — which is the same failure, and the same fix, as the packaged mock's.

## Not defects, said out loud so silence is not read as approval

- The session-security picture no longer shows the app's own inactivity lock, only the emergency path. Nothing it says is untrue; a reader should not take it for the whole of what locks JSTACK.
- The stage-2 table names ten domains and now says they are the main ones. Search, settings, sync, parameters, usage and sections have no row of their own.
- Fourteen added lines carry one of the four verbs the contract forbids in an agent grant. None is such a grant: they are the rule's own statement, the name of Josh's iOS Shortcut, the app's own controls in the device check, and device revocation, which the rule excepts.
- The CI workflows are disabled in GitHub's settings, by Josh, and the files are kept. There was no run to read this round; the gates above are local, and the documents no longer cite a workflow as evidence.
- `pnpm lint` and `pnpm unused` were the builder's runs, not mine.

## Carried, with owners

Every row of `KNOWN_GAPS.md` at `8143db3e`, with the owner the file names, unchanged in substance from round 3:

| What | Owner |
|---|---|
| WPI-2 (rest) · the unconfirmed emergency lock is not restored at the next launch on a runtime with no secure random source | REMAP |
| WPJ-3 (rest) · on an iPhone the permission prompt's `"inactive"` may let the inactivity lock end the session it just asked for | REMAP |
| Native `crypto.getRandomValues`: nothing in the tree provides it, so the native encrypted store may reject every write — guarded at boot; the device check is the proof | Josh, then REMAP |
| A4R11-01's e2e case can go red at w1366 when the second keydown reaches the handler after the 800 ms settle window | REMAP |
| Find restores no focus on close: GS-02 leaves `opener` unset when a child already holds focus | REMAP |

## What closes this round

> I verified each package once at its own head in my own clone, read every deletion against the file it removed rather than against the report, chased every token of the three folded documents to where it now lives, checked all twenty-eight wire shapes and every command against the code, re-drew nothing but re-checked all four pictures against the code and re-ran their receipts, re-ran both document plants here, and ran both Jest projects in both zones at this commit under the board lock. The two findings I raised against this round — a prose cap raised for a document that had shrunk, and a stale reference in the same file — are fixed by this commit. Signed: qa-auditor (Claude Opus 5).

*Dated 16 September 2026, by the machine clock, on `8143db3e`.*

Verdict: SIGNED OFF AT CAP — 2 carried

---

# Round 5 · v2.3.2's 16 September update, at `122642ff`

Written by `qa-auditor` under `_v23-command/AUDIT-BRIEF-r5.md`, `QA-HANDOVER.md` and the v2.3 `AUDIT-BRIEF.md`, once, on `v233-build` at **`122642ff`** — the boarded release candidate for the 16 September update (`origin/v233-build` is the same commit). Everything below ran in a scratch clone of my own at that sha, `pnpm install --frozen-lockfile --prefer-offline`; the worktrees and the Dropbox checkout were not touched, nothing was committed or pushed, and no Playwright ran.

**Model that ran: Claude Opus 5 (1M context) (`claude-opus-5[1m]`).**

Rounds 1 to 4 stand as written above, and their verdicts held for their own commits. This round's verdict is the last line of the file.

The eight rows under test are `BUGLOG_v23.md`'s `## v2.3.2, 16 Sep`: WPS-1, WPT-1, WPT-2 and WPR-1..5.

## R5.1 · The board is this commit's

| Command, at `122642ff` | Printed |
|---|---|
| `pnpm check` | exit 0, no output (`tsc --noEmit`) |
| `pnpm lint` | exit 0, no findings (`expo lint`) |
| `pnpm unused` | `unused-exports: none` |
| `node tools/audit-check.mjs` | `audit clean: 3 advisory(ies), 2 accepted, none blocking at high or above` |
| `node tools/secret-scan.mjs .` | `secret scan clean` |
| `node tools/log-scan.mjs .` | `log scan clean — no console.log/info/debug in app source` |
| `JSTACK_TZ=Australia/Brisbane pnpm test` | `Tests: 1 skipped, 2472 passed, 2473 total` · `Test Suites: 1 skipped, 130 passed, 130 of 131 total` (128.8 s) |
| `pnpm test` (`TZ=America/New_York`, run 2) | the same, 114.5 s |
| `pnpm test` (default zone, after `jest --clearCache`, run 3) | the same, 123.9 s |
| `pnpm test` (default zone, run 1 — the first run in the fresh clone) | **`Tests: 1 failed, 1 skipped, 2471 passed, 2473 total`** · `Test Suites: 1 failed, 1 skipped, 129 passed, 130 of 131 total` (319.8 s) |

That one red is **R5-01** below; it is a test-lane timeout, not an app behaviour, and it did not recur in three further full boards. `evidence/jest-summary.json` came back byte-identical after every run (`git diff` empty), and `git status --porcelain --untracked-files=all` is empty as I finish, at `122642ff`.

The summary reads `{ "numTotalTests": 2473, "numPassedTests": 2472, "numPendingTests": 1, "numTotalTestSuites": 131 }`, and the five count lines print D-12's form of exactly that — **2472 passed, 1 skipped by design / 2473, 131 suites** — at `DONE_v23.md:25`, `history/v2/HANDOVER_v2.md:21`, `history/v2/QA_REPORT_v2.md:60`, `QA_REPORT_v22.md:402` and the narrative at `:419`. The one skip is `tests/unit/serveMockRig.test.ts`, by design.

The e2e evidence belongs to this tree. `evidence/e2e-summary.json` holds 1058 tests — 971 passed, 0 failed, 0 flaky, 87 skipped; core 850 (793 passed, 57 skipped); matrix 208 over 8 projects (178 passed, 30 skipped) — with `generatedAt` **2026-09-16T01:27:59.428Z**. The last commit to `jstack-app/` outside `evidence/` and `*.md` is `4613fcd2` (2026-09-16T00:48:31Z, WPR-5's own), thirty-nine minutes before the run; the last commit to any folder of the export's own fingerprint is `5268009e` (2026-09-15T22:46:59Z). Those figures are what `DONE_v23.md:28-29`, `QA_REPORT_v22.md:404-407` and `history/v2/QA_REPORT_v2.md:61-63` print, number for number. `failed: 0` over 971 executed tests is also GL-01's answer: the console guard is an `auto` fixture on every test, so a single console error would have shown as a failure.

The evidence commit `122642ff` changes only what the rule allows — the e2e lines in four documents, `evidence/e2e-summary.json` and `jstack-app/CODEMAP.md`'s stamps — and carries `[skip ci]`. It did not run its own Jest: `jest-summary.json` is untouched since `b79dde36`, and my four runs reproduce it exactly.

## R5.2 · Every 16 September row was red first

Each row's non-test source was reverse-applied in my clone, the row's own cases run, and the tree restored (`git status --porcelain` empty after each).

| Row | Reversed | One printed line |
|---|---|---|
| **WPS-1** | `lib/needsYouSchedule.ts`, `data/types.ts`, `data/mock/fixtures/settings.json`, `components/settings/Schedules.tsx`, `components/today/NeedsYou.tsx`, `lib/cardVerbs.ts`, `data/requestSchemas.json`, `openapi.yaml` | `Tests: 3 failed, 122 passed, 125 total`. The store: `Expected: {"paused": true, …} / Received: undefined`. The schedule file: `Could not locate module @/lib/needsYouSchedule`. Settings: `Unable to find an element with testID: schedule-needs-you`. Today: `- "cards": 0 / + "cards": 1`, `- "endLine": 0 / + "endLine": 1`, `- "waitingLine": 1 / + "waitingLine": 0` |
| **WPR-1** (the band) | `layout/TabScreen.tsx`, `components/chrome/DemoWatermark.tsx` | `Expected substring: not "ORB_BAND"` — and the received string is `TabScreen.tsx` with `import { ORB_BAND } from "@/components/chrome/Orb";` back in it |
| **WPR-1 / WPR-2** (the orb itself) | `components/chrome/Orb.tsx`, `lib/pushToTalk.ts` — the diff does not separate them, and I say so | `Tests: 4 failed, 2 passed, 6 total`: `Expected: ObjectContaining {"purpose": "brain"} / Number of calls: 0`; the tap case `Number of calls: 0`; the rest/held case `Received: null`; the hit area `TypeError: Cannot read properties of undefined (reading 'top')`. "A hold that heard nothing files nothing" was green before and after, as the row says |
| **WPR-3** | `components/brain/DictateDialog.tsx`, `components/chrome/Dialog.tsx` | `Unable to find an element with testID: dictate-mic-circle`, and `Expected: ObjectContaining {"purpose": "dictate"} / Number of calls: 0` |
| **WPR-4 (a)** | `theme/ui/fields.tsx` | `Expected: >= 16 / Received: 12.5` |
| **WPR-4 (b), (c)** | `lib/keyboard.ts`, `theme/ui/fieldEditor.ts`, `components/chrome/TabBar.tsx` | `Tests: 5 failed, 3 passed, 8 total`: the tab bar `Expected: 304 / Received: 0`; the Enter and leave cases `Expected: 0, 0` and `Number of calls: 0` |
| **WPR-4 (d)** | `tools/build-web.mjs`, `tools/build-mock.mjs` | `Expected substring: "interactive-widget=resizes-content"` / `Received string: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"` — and QA-06 went red beside it, the fingerprint doing its job |
| **WPT-1** | `HANDOVER.md` and `tools/gen-handover-html.mjs` returned to `15e9e154^` (the hunks will not reverse alone — WPS-1 edited `HANDOVER.md` after — so this also rolls back WPS-1's four lines, and I say so) | `Tests: 8 failed, 82 passed, 90 total`: RM-01 "opens with the five-check reading list, before §1" → `Expected: < -1 / Received: 259`; RM-08 "§9 names the consolidated set" → `Expected: > 200 / Received: 0` |
| **WPT-2** | `appendix/USER_STORIES_DRAFT.md` returned to `4f4a2888^` (WPT-1's 37-line unsourced draft) | **Nothing went red.** `pnpm exec jest handover consolidation codemap` → `Tests: 104 passed`; a full `pnpm test` with the reversal in place → `Tests: 1 skipped, 2472 passed, 2473 total`. See **R5-02** |
| **WPR-5** | e2e only — no Playwright ran this round, by the brief | Judged by reading; see R5.7 |

WPT-2's *claim* is nevertheless true, and I checked it the only way that settles it: `appendix/USER_STORIES_DRAFT.md` from line 5 on is byte-identical to `C:\Users\joshu\Dropbox\Claude Sandbox\JStack\App\REMAP_v23\USER_STORIES.md` (`diff` after CRLF normalisation: no output, 926 lines each). The four lines above it are the draft disclaimer WPT-2 kept. Nothing invented remains.

`BUGLOG_v23.md` and `CHANGES_v23.md` carry the same eight ids under `## v2.3.2, 16 Sep` — WPS-1, WPT-1, WPT-2, WPR-1..5 — none missing, none twice, none extra.

## R5.3 · Security-class and data-loss, by probe

A Jest probe of my own, copied into `tests/unit/`, run, and deleted (the tree is clean). It uses the **real** `lib/mic.ts` behind a fake `getUserMedia` whose tracks count their own `stop()`, and drives the real `<Orb />` and the real `<DictateDialog />`.

**WPR-2 — the one owner, and every way out.** Every line below is a printed object from the probe.

| Path | Printed |
|---|---|
| press-in | `{ purpose: "brain", state: "listening", stopped: [0, 0] }` — `activeMic()` is `lib/mic.ts`'s own handle |
| release after a 900 ms hold | `{ stopped: [1, 1], open: false, state: "off", filed: [["voice", "Ring the school"]] }` |
| release after a 200 ms tap | `{ stopped: [1, 1], open: false, filed: 0 }` |
| a 2 s hold that heard nothing | `{ stopped: [1, 1], open: false, filed: 0 }` |
| the inactivity lock mid-hold (`session.relock()`) | `{ stopped: [1, 1], open: false, state: "off" }` |
| the emergency lock mid-hold (`emergencyLock(...)`) | `{ stopped: [1, 1], open: false, state: "off" }` |
| AppState `"inactive"`, then `"background"` | `{ stopped: [0, 0], open: true }`, then `{ stopped: [1, 1], open: false }` |

No path leaves a microphone open, and nothing is filed on an empty hold or a tap.

**What a release AFTER a lock writes.** `tests/setup.ts:27` forces the lock gate open for every unit test (`setLockSource(() => false)`), so a probe that does not put the app's own source back measures the harness. With `setLockSource(() => useSessionStore.getState().locked)` restored, and the same hold interrupted:

- idle lock → `{ added: [], locked: true, queued: [] }`
- emergency lock → `{ added: [], emergency: true, locked: true, queued: [], tracks: [1, 1] }`

Nothing reaches the mock's `brainItems` and nothing reaches the outbox. The refusal comes from `lib/lockGate.ts:56` through `data/ApiAdapter.ts:165` — `LockedError: refused: the session is locked (/brain/dump)` — and `POST /brain/dump` is not `whileLocked` in `data/routes.ts`. **Nothing security-class and nothing data-loss.** What the refusal does with the words is **R5-05**.

**WPR-3 — the same owner behind Dictate to EA's orb.** press-in `{ purpose: "dictate", state: "listening", stopped: [0, 0] }`; release `{ micOpen: false, state: "off", stopped: [1, 1] }`, the field holding `"the words for the field"` and `sentToThread: 0` — nothing reaches the thread until the field's arrow.

**WPS-1 — no card is ever hidden for good.** Driven through `lib/needsYouSchedule.ts` and `lib/cardVerbs.ts` themselves:

- every window inside quiet hours, asked at noon, inside the window and inside quiet hours → `[false, false, false]`: a schedule that can never open holds nothing.
- no window at all, a paused schedule, a quiet-hours record with no schedule, and no record at all → `[false, false, false, false]`.
- a live schedule at noon → `{ held: true, next: 16, inside: false }` (and `false` at 08:30).
- the desktop keys: `keyableCard(true)` is `null` while Needs you waits and the open card's own id when it is not — with the card loaded and `openDecisionId` set, so the null is the schedule's doing and not an empty stack.

**WPR-4 — what is unit-proven, and what only a phone proves.** The scroll reset and the chrome that follows the viewport are proven by reverse-apply above (`lib/keyboard.ts` out → five of eight cases red). The visualViewport subscription is proven **for `resize` only** — see **R5-08**. The row says plainly what only a real phone proves (iOS Safari's focus zoom, the bar and orb above a real keyboard, the page whole after Enter), and `DEVICE_RUNBOOK.md` §2 and §3 ask for it by hand in three checks. Where that disclosure does not reach is **R5-06**.

## R5.4 · The documents against the code

`QA-FINAL.md` check 3's five spot checks, at this commit:

- **Dictation and the store track.** `HANDOVER.md:20` says the build assumes on-device dictation (`expo-speech-recognition`); `lib/mic.ts:507` starts the recogniser with `requiresOnDeviceRecognition: true` and `:324` turns away a phone that cannot. `eas.json` is gone since WP-O, and `HANDOVER.md` no longer names it anywhere: the release row (`:85`) reads `NATIVE_RUNBOOK.md`, `npx expo prebuild`, Xcode, his own Apple developer account. True.
- **`KNOWN_GAPS.md` holds no row `BUGLOG_v23.md` fixed.** The only `WP*` ids in the file are `WPI-2`, `WPJ-3`, `WPB-11` — each marked `(rest)`, the disclosed-remainder convention — and `WPA-9`, `WPB-4`, `WPC-3`, `WPF-4`, `WPF-14` cited as the reason a row holds. No WPR, WPS or WPT id appears. True.
- **Credentials and the timeouts.** `HANDOVER.md:79` names `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_API_TIMEOUT_MS`; §8's first prompt asks for "the credentials mode, the two timeouts". `data/config.ts:44` and `:52` are the two (15 s, 60 s), `:64` is `API_CREDENTIALS`, and `data/transport/http.ts:101` and `:117` are where both land. True.
- **`SECURITY.md`'s pinning paragraph (`:68`) against `data/pins.ts`.** `SPKI_PINS` is empty (`:12`), `registerPinVerifier` is the native seam (`:21`), and `guardTransport` (`:30`) refuses a pinned host with no verifier rather than connecting unverified (`:45`). True.
- **`DONE_v23.md`'s carried list is `KNOWN_GAPS.md`** (`:39-41`), and `HANDOVER.md` §7 points at the same file. True.

This round's own additions:

- **§3's five stages are Josh's words.** Each of the five rows in `HANDOVER.md:52-56` is `_v23-command/WP-T.md`'s verbatim quote, tidied only: V1's "stand up aws env, security, openclaw, memory, telegram (mvp), infisical, connect input sources"; V2's "user interface Jstack app (incl features the backend will support, but not all of them yet), twenty crm, n8n"; V3's "multi agent … without dev doing it or handholding. First ones are librarian and security"; V4's "cost optimisation. Model routing … my other home rtx4090 pc when it's turned on, else cloud token optimisation"; V5's "review and refinement of the whole stack. Eval candidates for other major feature upgrades". Nothing is added that Josh did not say, and the old V4 "unstaged hardening" wording is folded into V5's app-part cell as T-1 asked.
- **Questions and security precede the plan.** The order is: the five-check reading list, §1 "Questions for you, and decisions you must make" (seven rows), §2 "Session security", opening "Review the whole security design before you rely on any of it… nothing here proves a server is secure", then §3 the plan, §4 Run it, §5 The build, §6 The backend, §7 Carried, §8 Prompts, §9 Reference files, §10 Appendix.
- **Every path and command `HANDOVER.md` names exists.** I extracted all 300-odd backticked tokens and resolved them: every `pnpm <script>` is in `jstack-app/package.json`'s scripts (`check`, `lint`, `test`, `test:e2e`, `serve:web`, `serve:mock`, `connect:check`, `build:web`, `build:web:prod` among them), and every path resolves at the repo root or under `jstack-app/`. The only three that do not are an environment-variable assignment, a Dropbox folder (`/JSTACK/Inbox/`) and an app route (`/capture`).
- **The re-tag note (T-5)** is at `HANDOVER.md:5` and at `DONE_v23.md:7`, at the top of the v2.3.1/v2.3.2 section (its heading is `:5`), in the words T-5 gives.
- **`appendix/USER_STORIES_DRAFT.md`** holds the real file, byte-for-byte (R5.2). **`appendix/JO_PREFERENCES.md`** is 597 words against T-4's under-600 cap and cites its sources — with **R5-07** against it. **`appendix/CONTEXT_INDEX.md`**'s eleven rows all name files that exist.
- **`DEVICE_RUNBOOK.md`** carries the three phone checks WP-R names: §2 the focus zoom, the chrome above the keyboard and the page whole after Enter; §3 the floating orb held (including "hold it for several seconds: no text selection or copy menu appears") and Dictate to EA's large orb.
- **`CHANGES_v23.md`** has one line per 16 September row and no extra. **`DONE_v23.md`**'s board block is the two evidence files, number for number, and its v2.3.1/v2.3.2 section names this update. **No document claims an e2e duration** the summary does not hold — the summary carries none, and none is claimed.
- **No `v2.3.3` anywhere** (`git grep` over the tracked tree: no match).

## R5.5 · The guards go red when their subject breaks

Four plants of my own among the new seams, each written to disk as an anchored replacement, each restored byte-identical (`git diff --quiet` after every one).

| Plant | Case that went red | What it printed |
|---|---|---|
| `Orb.tsx` `ORB_SLOP` 12 → 4 | "the press lands 12 px or more outside the drawn circle on every side" | `Expected: >= 12 / Received: 4` |
| `needsYouSchedule.ts` "never opens" → `held: true` | "a schedule that can never open holds nothing — no card is hidden for good" | `- "held": false / + "held": true` |
| `pushToTalk.ts` `PTT_MIN_HOLD_MS` 250 → 0 | "a tap shorter than a hold closes the microphone and files nothing" | `Expected number of calls: 0 / Received number of calls: 1` · `1: "voice", "half a word"` |
| `keyboard.ts` — the `resize` listener removed | "the visual viewport's resize and scroll are what the keyboard band is read from" | `TypeError: listeners.resize is not a function` |

A fifth plant is the finding **R5-08**: removing the `scroll` listener from the same three lines leaves the whole board green but for QA-06.

**PROTOCOL §5's four words.** `git diff 3fef302f 122642ff -- . ':!jstack-mock-v15.html'` adds 44 lines carrying one of `send`, `pay`, `book`, `revoke`. Exactly one is in app source or a test — `tests/native/dictateOrb.test.tsx`'s `jest.spyOn(useDictateStore.getState(), "sendChat")`, and `sendChat` already existed at `3fef302f` (`stores/dictate.ts:24`). The other 43 are `HANDOVER.md` §2's own statement of the ban and its audit-log row, the generated page and wire table (where `POST /devices/{id}/revoke` is SEC-15's named exception), and `appendix/USER_STORIES_DRAFT.md`'s rows, which say what the app refuses to do ("never sends", "no pay verb exists", "the app never pays"). No new affordance, route, handler or adapter method.

## R5.6 · Maps, the mock, and the map's own liveness

No root copy of `CODEMAP.md`, `wiring.json`, `WIRING.md`, `WIRING.html` or `openapi.yaml`.

`pnpm codemap` at this sha changes **only the four `<!-- generated:start … sha=… -->` stamps** (`3dd58c2a` → `122642ff`, the head moving); every generated body is byte-identical. It printed `openapi.yaml written: 135 paths, 212 schemas`, `142 markers written to evidence/todo-backend-grep.txt`, `gen-handover-html: REMAP_HANDOVER.html — 10 '##' sections`, `CODEMAP.md regenerated at 122642ff (372 source files mapped)` — the 135 routes and 142 markers the six `handover.test.ts` guards pin, so WPS-1 riding on quiet hours' record rather than taking a route of its own held that line. I restored the file; CM-01 and QA-06 are green in every full board above.

QA-06 by hand: `sourceFingerprint(jstack-app)` is `08a3189907dd97a30f593db38618f02351e076790c035466ccd4c5aeaeabbfd8` over 364 files, and `jstack-mock-v15.html`'s second line is `<!-- jstack-source: 08a3189907dd97a30f593db38618f02351e076790c035466ccd4c5aeaeabbfd8 (364 files) -->`. The packaged mock is this source, and its head carries `interactive-widget=resizes-content` — WPR-4 (d) is in the file Josh opens.

## R5.7 · The board's one red and its class

WPR-5's evidence holds. Its change is `e2e/core/gantt.spec.ts` only: both handle cases now `await expect.poll(...)` for the edge the drag moved and then read the other edge, which is unchanged. Nothing either case asserts was dropped — the moved edge is still `before + 1 day` and the other edge is still `before` — the gesture is still `+28` px, and no app file is in the commit. The row's reasoning is measured rather than argued: the probe's `onDrop moved=1 edge=end` in each of the three red repeats is what makes "the read was late, not the drag" a finding rather than a guess.

**The sweep for the same class, by reading** (no run). I scanned all `e2e/**/*.spec.ts` for a read of server state or a count (`db(page)`, `dates(page`, `.count()`) within four statements of an interaction (`.click(`, `mouse.up(`, `.press(`, `.fill(`, `.tap(`, `keyboard.press(`) with nothing awaited between. Four sites came back, and all four are clean:

- `e2e/core/gantt.spec.ts:188` and `:205` — WPR-5's own two polls.
- `e2e/core/gantt.spec.ts:157` (the bar drag) — `await expectUndoToast(page)` stands between the `mouse.up()` and the read. This is the case the row itself names as the one that never flaked, and that is why.
- `e2e/core/decisions.spec.ts:533` — `await expectToast(page, "Went with option 2 · Dev call")` stands between the keypress and `db(page)`.

**No other case in the suite reads a write it has not waited for.** Nothing is carried from this sweep.

## Not defects, said out loud so silence is not read as approval

- **The 16 px rule reaches the desktop.** `theme/ui/fields.tsx:201` raises every text input to 16 px on the web, not on touch widths only, so at 1366 and 1920 one control is 28 % off the pack's 12.5 px body size; and because the longer question then overran its field at 1366 (BR-04), `components/brain/Find.tsx` now asks the phone's shorter "Find · what did Andy say?" on every web page. Both are disclosed — `design/DISCREPANCIES.md` row 23 says "one control off the type scale by design", and the BUGLOG row says why — and the narrower alternative is named in the same row. No ux round has seen the desktop consequence; it is a deliberate, recorded trade, and a reader should not take it for an oversight.
- **TE-01's requirement changed, and A-6's got stronger.** TE-01's e2e case moved from "every field is at the pack's body size" to "16 px or more", and gained two assertions on the viewport meta; A-6's case moved from two assertions to three (`runsUnderTheOrb`, `endAboveTheOrb`, `endAboveTheMark`) and now scrolls the page to its end before measuring. Neither is a weakened test; both are a requirement replaced in the open.
- **The contract does not constrain a window's time format.** `openapi.yaml`'s `needsYou.windows` items are `{ start: string, end: string }` with no pattern, so a server copied from it would accept `"banana"`. The client drops a window it cannot read (`lib/needsYouSchedule.ts:81-85`), which makes the schedule one that can never open, and that holds nothing. It fails open, to "raise the cards", which is the safe direction.
- **`jstack-app/CLAUDE.md:26`'s "~12 minutes"** for `pnpm test:e2e` is advice to a developer about how long to budget, not a claim about the recorded board. The summary carries no duration and no delivery document claims one.
- **`pnpm lint` and `pnpm unused` are mine this round**, run in my own clone, not read from a report.
- The rebuilt mock re-emits its own fixture and library text at every commit; none of the four verbs in it is an authored line of this round.

## Carried, with owners

Every row of `KNOWN_GAPS.md` at `122642ff` — the file is byte-identical to `3fef302f`, so the disclosed set is unchanged in substance from round 4 — with the owner the file names:

| What | Owner |
|---|---|
| WPI-2 (rest) · the unconfirmed emergency lock is not restored at the next launch on a runtime with no secure random source | REMAP |
| WPJ-3 (rest) · on an iPhone the permission prompt's `"inactive"` may let the inactivity lock end the session it just asked for | REMAP |
| Native `crypto.getRandomValues`: nothing in the tree provides it, so the native encrypted store may reject every write — guarded at boot; the device check is the proof | Josh, then REMAP |
| A4R11-01's e2e case can go red at w1366 when the second keydown reaches the handler after the 800 ms settle window | REMAP |
| Find restores no focus on close: GS-02 leaves `opener` unset when a child already holds focus | REMAP |

And this round's own eight, none security-class and none data-loss:

| id | What, with the evidence | Owner |
|---|---|---|
| **R5-01** | `jstack-app/tests/unit/orbPushToTalk.test.tsx:67` — "press-in opens a Brain session; a release after a real hold closes it and files what was heard, as voice" went red on the first of my four full boards with `thrown: "Exceeded timeout of 5000 ms for a test."`, turning an otherwise green board to `Tests: 1 failed, 1 skipped, 2471 passed, 2473 total`. The case has no timeout of its own and the file is slow to reach its first render: measured alone it is `duration: 177` ms of a 10.2–11.5 s suite, and under a full board it took 24.9 s in one run and 6.7 s in another. Five runs of the file alone, a run with the Jest cache cleared (42.7 s, green), and three further full boards were all green, so it wants a loaded machine — which is what a fresh CI runner is. The fix is one argument: a timeout on that case | the builder, then REMAP |
| **R5-02** | `appendix/USER_STORIES_DRAFT.md` has no guard. Returning it to WPT-1's 37-line unsourced draft leaves `handover`, `consolidation` and `codemap` green (`Tests: 104 passed`) and a full board green (`Tests: 1 skipped, 2472 passed, 2473 total`). The content is right today — I diffed it byte-for-byte against `REMAP_v23/USER_STORIES.md` — but nothing in the tree would notice if it stopped being, and the pack now reads this file | the builder, then REMAP |
| **R5-03** | Stale cross-references into `HANDOVER.md`'s retired `§1.x` numbering, in live files: `KNOWN_GAPS.md:17`, `NATIVE_RUNBOOK.md:24` and `jstack-app/lib/encryptedStore.ts:207` each send the reader to "`HANDOVER.md` §1.8, 'Native crypto — what to do'" — a section number and a heading that exist nowhere in `HANDOVER.md` today; `BACKEND_HANDSHAKE.md:3` and `:14` send REMAP to "§1.3" (the base URL is §4 step 2 now); `DONE_v23.md:45` and `CONTRIBUTING.md:43` cite "§1.7" (now §4). The subsections went at WP-Q, before this round, and round 4 did not catch it; WPT-1 renumbered the file again without sweeping the inbound citations, and its own verification checked only `HANDOVER.md`'s internal `§N`s. A REMAP lead following the crypto pointer lands nowhere | the builder, then REMAP |
| **R5-04** | `history/v2/QA_REPORT_v2.md:59` reads "`ev:jest-summary.json` generated 2026-09-15, `ev:e2e-summary.json` 2026-09-15" while the committed `e2e-summary.json`'s `generatedAt` is `2026-09-16T01:27:59.428Z` — 16 September, 11:27 on this machine's clock. The evidence commit `122642ff` moved the numbers two lines below and left the date. `QA_REPORT_v22.md:46` still says the committed `e2e-summary.json` "was committed at `399cea16`", two rounds stale. `QA-HANDOVER.md` §4 names the first of these lines as one that must match `generatedAt`; no test reads either | the builder, then REMAP |
| **R5-05** | `jstack-app/lib/pushToTalk.ts:49` files the hold's words with `void useBrainStore.getState().dump("voice", text)`. When a lock lands during the hold the gate refuses correctly — nothing written, nothing queued (R5.3) — but `LockedError` comes back as an **unhandled rejection**: no toast, no draft restored (the store restores a draft only when `textOverride == null`, and this path passes the text), so the words the person just spoke are dropped in silence, and in a browser it is an uncaught promise rejection. Same class as `KNOWN_GAPS.md`'s "Review 14" (about 140 `void action()` calls with no handler behind them), and `components/brain/Entry.tsx`'s `void send()` shares it — but that path keeps the draft and this one does not | REMAP |
| **R5-06** | WPR-4's three core claims — iOS Safari no longer zooms on focus, the bar and the orb sit above the real keyboard, the page is whole after Enter — are device-only, and are disclosed in the BUGLOG row and `DEVICE_RUNBOOK.md` §2. `KNOWN_GAPS.md`, which `HANDOVER.md` §7 and `DONE_v23.md` both name as "the full list, one line each with whose it is", is byte-identical to `3fef302f` and carries none of them. The disclosure is real but it is not where the two documents send the reader to find it | the builder, then REMAP |
| **R5-07** | `appendix/JO_PREFERENCES.md` cites `_v23-command/COMMAND.md` five times, including in its "Sourced:" line. That path is the planner's Dropbox folder and is not in the repository, so a REMAP reader handed this appendix cannot open a fifth of its sources | the builder |
| **R5-08** | `jstack-app/lib/keyboard.ts:53`'s `vv.addEventListener("scroll", onChange)` is unguarded. `tests/unit/keyboardZoom.test.tsx:86`, the case titled "the visual viewport's resize **and scroll** are what the keyboard band is read from (the subscription stays)", drives `listeners.resize()` only and asserts `removeEventListener` for `"resize"` only. Planting the scroll listener out left that file green (`Tests: 8 passed`) and a **full board** green but for QA-06 (`Tests: 1 failed, 1 skipped, 2471 passed, 2473 total`, the one red being the mock fingerprint) — the QA-HANDOVER §2 signature for "no case tests that part". The removed half is the one the file's own comment says exists for iOS, where "scrolling it up under the keyboard afterwards only fires scroll — and that is precisely when offsetTop changes", which is the cropping Josh reported. The behaviour is right; the guard is half the size of its title | the builder, then REMAP |

## What closes this round

> I re-ran the whole board myself in a scratch clone at this commit — `check`, `lint`, `unused`, `audit-check`, `secret-scan`, `log-scan`, and both Jest projects four times across the two zones, under `_v23-command/BOARD_LOCK` — reverse-applied every one of the eight 16 September rows and quoted what each printed, proved the microphone's every exit path and the locked write's refusal with a probe of my own through the app's real wiring rather than through the tests, planted four of the new seams red and restored each byte-identical, checked the appendix's user stories byte-for-byte against the file they claim to be, read the e2e suite for the class of race WPR-5 fixed and found no other, and left the tree clean. Eight findings are carried below with owners; none is security-class and none loses data. Signed: qa-auditor (Claude Opus 5, 1M context).

*Dated 16 September 2026, by the machine clock, on `122642ff`.*

Verdict: SIGNED OFF AT CAP — 8 carried

---

# Round 5 · re-invocation, the fixes to round 5's findings, at `27d36139`

Written by `qa-auditor` under `AUDIT-BRIEF-r5b.md` (the rules of `AUDIT-BRIEF-r5.md` still holding), once, on `v233-build` at **`27d36139`** — `origin/v233-build` is the same commit. The delta under test is three commits: `8ba1678f` (the fix: rows WPR-6, WPR-7, WPR-8 and WPT-3), `24478fd3` (the board's evidence) and `27d36139` (docs only, the v2.3.3 naming). Everything below ran in a scratch clone of my own at that sha (`git clone --shared`, `pnpm install --frozen-lockfile --prefer-offline`); the worktrees and the Dropbox checkout were not touched, nothing was committed or pushed, no Playwright ran, and the clone is clean as I finish.

**Model that ran: Claude Opus 5 (1M context) (`claude-opus-5[1m]`).**

Rounds 1 to 5 stand as written above. This round verifies the deltas, not the whole tree; the verdict is the last line of the file.

## R5b.1 · The board is this commit's

| Command, at `27d36139` | Printed |
|---|---|
| `pnpm check` | exit 0, no output (`tsc --noEmit`) |
| `pnpm lint` | exit 0, no findings |
| `pnpm unused` | `unused-exports: none` |
| `node tools/audit-check.mjs` | `audit clean: 3 advisory(ies), 2 accepted, none blocking at high or above` |
| `node tools/secret-scan.mjs .` · `node tools/log-scan.mjs .` | `secret scan clean` · `log scan clean — no console.log/info/debug in app source` |
| `JSTACK_TZ=Australia/Brisbane pnpm test` (both projects) | `Tests: 1 skipped, 2474 passed, 2475 total` · `Test Suites: 1 skipped, 130 passed, 130 of 131 total`, 105.2 s |

`evidence/jest-summary.json` came back **byte-identical** (`git diff` empty) and `git status --porcelain --untracked-files=all` printed nothing. The summary reads `{ "numTotalTests": 2475, "numPassedTests": 2474, "numPendingTests": 1, "numTotalTestSuites": 131 }` — two cases more than round 5's 2473, which is exactly what the fix adds (the WPR-6 case in `orbPushToTalk.test.tsx`, RM-11 in `consolidation.test.ts`; WPR-8 extends an existing case rather than adding one). The five count lines print D-12's form of that number — **2474 passed, 1 skipped by design / 2475, 131 suites** — at `DONE_v23.md:25`, `QA_REPORT_v22.md:402` and `:419`, `history/v2/HANDOVER_v2.md:21` and `history/v2/QA_REPORT_v2.md:60`. The one skip is `tests/unit/serveMockRig.test.ts`, by design. Run under `_v23-command/BOARD_LOCK` (taken 13:25:23, released when the run ended; the acting planner's own lock at 13:23 had cleared first).

The e2e evidence is this commit's. `evidence/e2e-summary.json`'s `generatedAt` is **2026-09-16T03:12:56.578Z**, twenty-four minutes after the fix commit `8ba1678f` (2026-09-16T02:49:12Z) and the only commit to the export's source; its counts — 1058 tests, 971 passed, 0 failed, 0 flaky, 87 skipped; core 850 (793/57); matrix 208 over 8 projects (178/30) — are unchanged from round 5 and are what `DONE_v23.md:28`, `QA_REPORT_v22.md:404` and `history/v2/QA_REPORT_v2.md:61` print, number for number.

QA-06 by hand: `sourceFingerprint(jstack-app)` = `dc7a84a47c992ad9a7f79a32938f22edb92fda64976fccc460daba5d07894dc2` over 364 files, and `jstack-mock-v15.html`'s second line is `<!-- jstack-source: dc7a84a4…d07894dc2 (364 files) -->`. The packaged mock is this source: its `useBrainPushToTalk` bundle carries `.catch(()=>{…setDumpDraft(n),…showToast("Locked \xb7 your words are kept in Brain")})`, so the fix is in the file Josh opens.

## R5b.2 · R5-05 / WPR-6, through the app's wiring

**Red first, by my hand.** `git diff 122642ff 27d36139 -- jstack-app/lib/pushToTalk.ts | git apply -R` (source only; the test file left as it stands), then the unit project:

```
● WPR-2 · … › WPR-6: a hold released after the app locked keeps its words as Brain's draft and says so, and files nothing
    - Expected  - 2   + Received  + 2
    -   "draft": "Book the dentist for the twins",
    +   "draft": "",
    -   "toast": "Locked · your words are kept in Brain",
    +   "toast": null,
```

(QA-06 and CM-01 went red beside it, the fingerprint and the map doing their job.) Restored with `git checkout --`: `Tests: 1 skipped, 2228 passed, 2229 total`, tree clean.

**My own probe**, copied into `tests/unit/`, run, deleted — the real `lib/mic.ts` behind a fake browser, the real `<Orb />`, the real stores and the in-process mock, with the app's own lock source restored (`setLockSource(() => useSessionStore.getState().locked)`, which `tests/setup.ts` otherwise forces open). Every line below is a printed object:

| Path | Printed |
|---|---|
| unlocked | `{"added":[{"text":"PROBE UNLOCKED VOICE","source":"voice"}],"thrown":null,"draft":"","toast":"Filed to Brain · → filing · Librarian"}` |
| the idle lock (`relock()`), field empty | `{"added":[],"queued":[],"locked":true,"draft":"PROBE IDLE LOCK WORDS","toast":"Locked · your words are kept in Brain","tracks":[1,1],"thrown":null}` |
| the emergency lock, field empty | `{"added":[],"queued":[],"emergency":true,"draft":"PROBE EMERGENCY WORDS","toast":"Locked · your words are kept in Brain","thrown":null}` |
| the idle lock, **a draft already typed** | `{"added":[],"queued":[],"draft":"a note I typed first","toast":"Locked · your words are kept in Brain","thrown":null}` |

So: nothing reaches the mock's `brainItems` and nothing reaches the outbox while locked, both microphone tracks are stopped, the unhandled rejection is gone (`thrown: null` where round 5 read `LockedError`), the words are Brain's own draft, and unlocked the filing still goes through as `source: "voice"`. R5-05 is closed on the path it was found on.

**The judgement the brief asks for.** On the fourth path the spoken words are **lost** — they are not in the draft, not in the mock, not in the queue, and `heard.current` was cleared before the call (`lib/pushToTalk.ts:48`) — and the toast still says "Locked · your words are kept in Brain". Dropping them rather than overwriting what was typed is the right half of the trade; **the sentence is not**, because it is false in exactly the case where something was lost, and it is the only thing Josh would see. The same holds for a second locked hold while the first one's words are still in the field, and — by reading, `lib/pushToTalk.ts:57-61` catching every rejection without inspecting it — for a 5xx or a transport throw while unlocked, where the words are kept but the reason given is "Locked". Carried as **R5b-01**; the fix is one line (say what happened, or append rather than drop).

## R5b.3 · R5-01 / WPR-7, R5-08 / WPR-8, R5-02 / WPT-3

- **WPR-7.** `tests/unit/orbPushToTalk.test.tsx:47` carries `jest.setTimeout(60_000)` with the reason in the comment above it. Nothing asserted changed (the diff adds the line and the WPR-6 case only), and the file passed inside the full board here. R5-01 closed.
- **WPR-8, planted red.** With `vv.addEventListener("scroll", onChange)` removed from `lib/keyboard.ts:53`: `● WPR-4 · … › the visual viewport's resize and scroll are what the keyboard band is read from (the subscription stays) — Expected: "function" / Received: "undefined"`. Restored byte-identical (`git status` empty). The case now moves `offsetTop` to 120, fires `scroll`, asserts the store read it, and asserts the unsubscribe of both listeners — so the half that only iOS fires is guarded. R5-08 closed.
- **WPT-3 / RM-11, planted red.** `appendix/USER_STORIES_DRAFT.md` (931 lines) replaced by a 40-line sketch: `● RM-11 · the appendix holds the real user stories, not a sketch … Expected: >= 400 / Received: 0`. Restored byte-identical. R5-02 closed — the file now has a guard that notices if it stops being the real thing.

## R5b.4 · The document lines

- **R5-03, closed, with one left.** No live file cites a `HANDOVER.md` "§1.x" any more: `lib/encryptedStore.ts:207`, `KNOWN_GAPS.md:17` and `NATIVE_RUNBOOK.md:24` now all read `HANDOVER.md` §7, "Native crypto — what to add", and that paragraph exists at `HANDOVER.md:191` under §7 "Carried and not received"; `BACKEND_HANDSHAKE.md:3` and `:14` and `CONTRIBUTING.md:43` now read §4 (and §4 step 2 for the base URL). The remaining `§1.x` hits in the tree are `CONTRACT_v21.md`'s own sections, the append-only audit and bug logs, and `BACKEND_HANDSHAKE.md`'s `CONTRACT.md` references — none of them a pointer into `HANDOVER.md`. **What the sweep missed:** `DONE_v23.md:49` still tells REMAP "`HANDOVER_OUTLINE.md` is REMAP's reading order", and that file does not exist in the tree (retired into `HANDOVER.md` at WPQ-1; only `history/v2/V2_HANDOVER_OUTLINE.md` remains). It is the only missing `.md` path named in `DONE_v23.md`, `HANDOVER.md` names none, and no test reads it. Carried as **R5b-02**.
- **R5-04, half closed.** `history/v2/QA_REPORT_v2.md:59` now reads "generated 2026-09-16" for both summaries, which is what `evidence/e2e-summary.json` (`2026-09-16T03:12:56Z`) and `jest-summary.json` hold. But `QA_REPORT_v22.md:46` now says "the summary in the tree now is v2.3.2's 16 September board, committed at `122642ff`", and that is **one round stale in both readings**: `jest-summary.json` in this tree was committed at `8ba1678f` (its numbers moved 2473 → 2475 there) and `e2e-summary.json` at `24478fd3` (the board commit). `BUGLOG_v23.md`'s WPT-3 row repeats the same claim. Carried as **R5b-03**.
- **R5-06, closed.** `KNOWN_GAPS.md` carries a `WPR-4 (phone)` row naming the three device-only claims — no zoom on focus, the bar and orb above the keyboard, nothing cropped after Enter — with `DEVICE_RUNBOOK.md` §2 as the check and **Josh** as the owner. The document `HANDOVER.md` §7 and `DONE_v23.md` send the reader to now carries it.
- **R5-07, closed.** `appendix/JO_PREFERENCES.md` is 586 words and cites no path outside the repository: every backticked file it names (`V23_REQUIREMENTS.md`, `DECISIONS.md`, `CHANGES_v23.md`, `HANDOVER.md`, `history/v2/JOSH_QA.md`, `history/v22/JOSH_QA_v22.md`) exists; the three it names as absorbed and `NEEDS_JOSH.md` are named as history and as an instruction, not as pointers. `_v23-command` appears nowhere in a live file.
- **The naming.** `v2.3.3` appears where the round now ships under that name — `HANDOVER.md:5`, `DONE_v23.md:7` and `:49`, `REMAP_HANDOVER.html:78`, and the `## v2.3.3, 16 Sep` headings in `BUGLOG_v23.md` and `CHANGES_v23.md`. The BUGLOG rows' `*Commit:*` lines still read `fix(v2.3.2)` because that is the commit's real message; not a defect. `CHANGES_v23.md` has one line per row under the heading — WPS-1, WPT-1..3, WPR-1..8 — none missing, none extra.

## R5b.5 · Nothing else moved

`git diff --stat 122642ff 27d36139 -- jstack-app ':(exclude)*.md' ':(exclude)jstack-app/evidence/'` is exactly five files: `lib/pushToTalk.ts` (+14/-1), `lib/encryptedStore.ts` (one comment), and the three test files `tests/unit/orbPushToTalk.test.tsx`, `tests/unit/keyboardZoom.test.tsx`, `tests/unit/consolidation.test.ts`. Outside that: the documents above, `jstack-app/CODEMAP.md` (the four generated stamps, `pushToTalk.ts` 65 → 77 lines, `session.ts` 107 → 108 importers, RM-11 added to the test map), the two evidence summaries, `REMAP_HANDOVER.html` and `jstack-mock-v15.html` (rebuilt, fingerprint above). No conflict marker anywhere in the tracked tree. No app behaviour changed but the one the row names.

## Not defects, said out loud so silence is not read as approval

- The `catch` keeps the words for **any** failure, not only a lock — that is the right shape, and the comment says so. What is wrong is only the sentence it shows (R5b-01).
- `pushToTalk.ts`'s file header (`:9`) still reads "A draft typed into the dump field is never touched: the words go straight to Brain." That is still true of the unlocked path and of the new one; it just no longer describes the whole function. Not worth a row.
- The `jest.setTimeout(60_000)` budget hides nothing: the case that timed out runs in 177 ms, and the file's other cases are unchanged.
- `pnpm codemap` at this sha would move the four stamps from `24478fd3` to the head, as it did at round 5 — CM-01 does not pin the stamp to HEAD, and it is green in the board above.
- The e2e figures are the planner's board's, not mine: no Playwright ran this round, by the brief. What I can say is that `generatedAt` is after the only source commit and the counts are the ones the documents print.

## Carried, with owners

The disclosed set of `KNOWN_GAPS.md`, plus this round's three.

| What | Owner |
|---|---|
| WPI-2 (rest) · the unconfirmed emergency lock is not restored at the next launch on a runtime with no secure random source | REMAP |
| WPJ-3 (rest) · on an iPhone the permission prompt's `"inactive"` may let the inactivity lock end the session it just asked for | REMAP |
| Review 20 · native `crypto.getRandomValues`: nothing in the tree provides it, so the native encrypted store may reject every write — guarded at boot; `HANDOVER.md` §7 says what to add; the device check is the proof | Josh, then REMAP |
| A4R11-01 (flake) · its e2e case can go red at w1366 when the second keydown reaches the handler after the 800 ms settle window | REMAP |
| GS-02 (rest) · Find restores no focus on close when a child already holds it | REMAP |
| WPR-4 (phone) · the three claims only a real phone proves — no zoom on focus, the bar and orb above the keyboard, nothing cropped after Enter (new this round, `DEVICE_RUNBOOK.md` §2) | Josh |
| **R5b-01** | `jstack-app/lib/pushToTalk.ts:57-61`. When the dump field already holds a draft, a hold released after the app locked **drops the spoken words** — probe: `{"added":[],"queued":[],"draft":"a note I typed first","toast":"Locked · your words are kept in Brain"}` — and the toast tells Josh they were kept. The same sentence appears for a second locked hold while the first one's words still sit in the field, and (by reading; the catch inspects no error) for a 5xx or a transport throw while unlocked, where "Locked" is simply the wrong reason. The no-overwrite half of the trade is right; the claim is false exactly where something was lost. One line fixes it: name what happened, or append the words instead of dropping them. Not security-class, and narrower than the R5-05 it replaces (which lost the words on **every** locked release and was itself carried), so it does not close the gate — but it should not reach Josh's phone as it stands | the builder, then REMAP |
| **R5b-02** | `DONE_v23.md:49` sends REMAP to "`HANDOVER_OUTLINE.md` is REMAP's reading order"; that file was retired into `HANDOVER.md` at WPQ-1 and exists nowhere in the tree (only `history/v2/V2_HANDOVER_OUTLINE.md`). It is the one missing `.md` path named in `DONE_v23.md` — one of the two files a REMAP lead opens first — the same class as R5-03, and WPT-3's sweep of the document lines did not reach it. No test reads the paths `DONE_v23.md` names | the builder |
| **R5b-03** | `QA_REPORT_v22.md:46` (and `BUGLOG_v23.md`'s WPT-3 row) says the summary in the tree was "committed at `122642ff`". `jstack-app/evidence/jest-summary.json` was committed at `8ba1678f` — that is the commit whose numbers it carries, 2475/2474 — and `evidence/e2e-summary.json` at `24478fd3`, the board commit. R5-04's own class, one round on: the line was written by the fix commit and the board that followed it moved the file underneath | the builder |

## What closes this round

> I re-ran the whole board myself in a scratch clone at `27d36139` — `check`, `lint`, `unused`, `audit-check`, `secret-scan`, `log-scan`, and both Jest projects in the Brisbane zone under `_v23-command/BOARD_LOCK`, reproducing `evidence/jest-summary.json` byte-identical and leaving the tree clean — reverse-applied `lib/pushToTalk.ts`'s own hunk and quoted the WPR-6 case going red for the right reason, planted the keyboard's `scroll` subscription out and the user-stories appendix back to a sketch and quoted both guards biting, proved through a probe of my own over the real microphone, the real orb, the real stores and the in-process mock that a hold released after the idle lock and after the emergency lock now keeps its words as Brain's draft with nothing written and nothing queued and that an unlocked hold still files as voice, checked the packaged mock's fingerprint against this source by hand, read every document line the round claims to have fixed, and found the reports truthful except for the three rows carried above. Signed: qa-auditor (Claude Opus 5, 1M context).

*Dated 16 September 2026, by the machine clock, on `27d36139`.*

Verdict: SIGNED OFF AT CAP — 3 carried

---

## Round 5 · final delta at `1c05e8e7`

The fix to R5b-01, R5b-02 and R5b-03 (`71f9d7d8`, row WPR-9) and the board that followed it (`1c05e8e7`, `origin/v233-build`'s head). A fresh scratch clone of my own at that sha; the worktrees and the Dropbox checkout untouched, nothing committed or pushed, no Playwright, the clone clean at the end.

**The board, at `1c05e8e7`, under `_v23-command/BOARD_LOCK` (taken 14:24:38, released when the run ended).** `pnpm check` exit 0 · `pnpm lint` exit 0 · `pnpm unused` `unused-exports: none` · `JSTACK_TZ=Australia/Brisbane pnpm test` → `Tests: 1 skipped, 2475 passed, 2476 total` · `Test Suites: 1 skipped, 130 passed, 130 of 131 total` (184.3 s). `evidence/jest-summary.json` came back byte-identical (`{"numTotalTests":2476,"numPassedTests":2475,"numPendingTests":1,"numTotalTestSuites":131}`) and `git status --porcelain --untracked-files=all` printed nothing. That is one case more than `27d36139` — the WPR-9 case — and the four count lines print D-12's form of it: **2475 passed, 1 skipped by design / 2476, 131 suites** at `DONE_v23.md:25`, `QA_REPORT_v22.md:402` and `:419`, `history/v2/HANDOVER_v2.md:21` and `history/v2/QA_REPORT_v2.md:60`. `evidence/e2e-summary.json`'s `generatedAt` is `2026-09-16T04:16:25.752Z`, 35 minutes after the fix commit `71f9d7d8` (2026-09-16T03:41:54Z), and its counts — 1058 tests, 971 passed, 0 failed, 0 flaky, 87 skipped; core 850 (793/57); matrix 208 over 8 (178/30) — are what `DONE_v23.md:28` and `QA_REPORT_v22.md:404` print. QA-06 by hand: `sourceFingerprint` `2e75cc7bbded9f83…0a7fb28f` (364 files) == `jstack-mock-v15.html:3`.

**Nothing else moved.** `git diff --stat 27d36139 1c05e8e7 -- jstack-app ':(exclude)*.md' ':(exclude)jstack-app/evidence/'` is two files: `lib/pushToTalk.ts` (+8/-2… net six lines inside the existing `catch`) and `tests/unit/orbPushToTalk.test.tsx` (the WPR-9 case, plus `useSessionStore.setState({ locked: true })` in the WPR-6 case so the toast's new branch is driven honestly). Outside that: the documents named below, `jstack-app/CODEMAP.md` (stamps and the `pushToTalk.ts` line count), the two evidence summaries and the rebuilt `jstack-mock-v15.html`.

**WPR-9, red first by my hand.** `git diff 27d36139 1c05e8e7 -- jstack-app/lib/pushToTalk.ts | git apply -R` (source only), then the unit project:

```
● WPR-2 · … › WPR-9: a locked release with a draft already in the field keeps both — the words join the draft on a new line
    - Expected  - 2   + Received  + 1
      Object {
    -   "draft": "a note I typed first
    - and the dentist for the twins",
    +   "draft": "a note I typed first",
        "toast": "Locked · your words are kept in Brain",
      }
```

Restored with `git checkout --`; tree clean.

**My probe again** (real `lib/mic.ts` behind a fake browser, real `<Orb />`, real stores, the in-process mock, the app's own lock source restored), copied into `tests/unit/`, run, deleted. Every line is printed:

| Path, with `"a note I typed first"` already in the field | Printed |
|---|---|
| the idle lock (`relock()`) | `{"added":[],"queued":[],"draft":"a note I typed first\nPROBE IDLE WORDS","toast":"Locked · your words are kept in Brain","thrown":null}` |
| the emergency state (`emergencyLock(...)`) | `{"added":[],"queued":[],"draft":"a note I typed first\nPROBE EMERGENCY WORDS","toast":"Locked · your words are kept in Brain","thrown":null,"emergency":true,"tracks":[1,1]}` |
| a transport throw while unlocked (the adapter's `postBrainDump` rejecting) | `{"added":[],"queued":[],"draft":"a note I typed first\nPROBE THROWN WORDS","toast":"Not sent · your words are kept in Brain","thrown":null,"locked":false}` |
| an empty field, unlocked | `{"added":["PROBE UNLOCKED VOICE 2"],"queued":[],"draft":"","toast":"Filed to Brain · → filing · Librarian"}` |

The spoken words survive on every path, the typed draft keeps its place above them, nothing is written to the mock or left in the outbox while refused, both microphone tracks are stopped, and the toast names the real reason — "Locked" only when the session is locked or in the emergency state, "Not sent" otherwise. **R5b-01 is closed**, on the path it was found on and on the two others it implied.

**R5b-02 is closed.** `DONE_v23.md:49` now reads "`HANDOVER.md` §9 is REMAP's reading order", and §9 "Reference files" exists at `HANDOVER.md:226`. No `.md` path named in `DONE_v23.md` or `HANDOVER.md` is missing from the tree.

**R5b-03 is not closed — it recurred, and it was false at birth.** `QA_REPORT_v22.md:46` now says the summaries "are the 16 September board's — `jest-summary.json` at `8ba1678f`, `e2e-summary.json` at `24478fd3`". At this sha `jest-summary.json` was last committed at **`71f9d7d8`** — the very commit that wrote this sentence, which rewrote the file to 2476/2475 — and `e2e-summary.json` at **`1c05e8e7`**, the board commit that followed. So the line named a stale commit the moment it was committed, and the board then moved the other file underneath it, exactly as it did last round. This is the third turn of the same screw (R5-04 → R5b-03 → this). The shape of the claim is what is wrong: a sentence naming the commit its own evidence was committed at cannot be true when the evidence commit comes after it. Carried as **R5c-01**; the fix is to drop the commit names (the file's `generatedAt` and the counts already prove provenance), or to have the board commit rewrite the line, with a guard that reads `git log -1 -- evidence/…`.

### Not defects, said out loud

- `QA_REPORT_v22.md` names ten V2.2-era documents by bare filename (`BUGLOG_v22.md`, `CONTRACT_v22.md`, `QA_REPORT_v21.md` and so on) that now live under `history/v22/` and `history/v21/`. That is the archived report's own convention from before the move, not a pointer regression from this round, and `RM-10`'s banners are what carry a reader across. Said out loud rather than carried.
- The WPR-6 case gained `useSessionStore.setState({ locked: true })` beside its `setLockSource(() => true)`. That is the harness catching up with the toast's new branch, not a weakened assertion: the case still asserts the draft, the toast and `mic: "off"`.
- The e2e figures remain the planner's board's; no Playwright ran this round either. What I verified is that `generatedAt` follows the only source commit and that the counts are the ones the documents print.

### Carried, with owners

| What | Owner |
|---|---|
| WPI-2 (rest) · the unconfirmed emergency lock is not restored at the next launch on a runtime with no secure random source | REMAP |
| WPJ-3 (rest) · on an iPhone the permission prompt's `"inactive"` may let the inactivity lock end the session it just asked for | REMAP |
| Review 20 · native `crypto.getRandomValues`: nothing in the tree provides it; guarded at boot, `HANDOVER.md` §7 says what to add, the device check is the proof | Josh, then REMAP |
| A4R11-01 (flake) · its e2e case can go red at w1366 when the second keydown lands after the 800 ms settle window | REMAP |
| GS-02 (rest) · Find restores no focus on close when a child already holds it | REMAP |
| WPR-4 (phone) · the three claims only a real phone proves — no zoom on focus, the bar and orb above the keyboard, nothing cropped after Enter (`DEVICE_RUNBOOK.md` §2) | Josh |
| **R5c-01** | `QA_REPORT_v22.md:46` names `8ba1678f` and `24478fd3` for summaries that this tree committed at `71f9d7d8` and `1c05e8e7`. Documentation only — the numbers themselves are right, reproduced byte-identical above — but it is the third recurrence of one class, and the shape of the sentence is what keeps failing | the builder |

### What closes this delta

> I re-ran the board myself in a fresh scratch clone at `1c05e8e7` — `check`, `lint`, `unused` and both Jest projects in the Brisbane zone under `_v23-command/BOARD_LOCK`, reproducing `evidence/jest-summary.json` byte-identical and leaving the tree clean — reverse-applied `lib/pushToTalk.ts`'s WPR-9 hunk and quoted the case going red for the right reason, drove a probe of my own over the real microphone, the real orb, the real stores and the in-process mock to prove that a hold released under the idle lock, under the emergency state and under a transport throw while unlocked now keeps both the typed draft and the spoken words and names the real reason each time, with nothing written and nothing queued, checked the packaged mock's fingerprint against this source by hand, and read the two document lines the round claims to have fixed — one true, one stale again and carried below. Signed: qa-auditor (Claude Opus 5, 1M context).

*Dated 16 September 2026, by the machine clock, on `1c05e8e7`.*

Verdict: SIGNED OFF AT CAP — 1 carried
