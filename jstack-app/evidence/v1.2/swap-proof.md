# BS-05 swap proof — acceptance suite vs the reference backend

Date: 31 Aug 2026 · Board: **86 passed · 0 failed · 6 skipped (documented)**

## How it ran
```
backend-starter:  embedded Postgres :5433 (schema.sql + seed.sql from the app's
                  own fixtures) · node server.mjs --test  → :8787/api/v1
app:              pnpm build:web:swap  (metro resolves data/config → config.swap.ts:
                  USE_API_ADAPTER=true, base http://localhost:8787/api/v1)
suite:            JSTACK_SWAP=1 npx playwright test --project=phone
                  (per-test POST /__test__/reset; __JSTACK__.db() proxies to
                  /__test__/db; calls() reads the ApiAdapter request log)
contract tests:   13/13 green against the same server.
```

## The 6 documented skips (mock-only seams, each with its reason in-spec)
| Test | Reason |
|---|---|
| SEC-05 | web-storage/key custody is the MockAdapter build's seam; §9 moves at-rest custody server-side (cookie session) in API mode |
| SEC-06 | local encrypted persistence is MockAdapter-only; in API mode the db lives server-side |
| TM-02..TM-05 | Test-mode scenarios/levers drive the MockAdapter; the panel is present but inert against a live backend |

## Mode-aware asserts (both sides asserted, nothing weakened)
- BR-01 / VO-03/04: mock shows "routing when connected"; the swap run asserts the REAL "routing live" chips.
- SEC-09: the reference backend is the one sanctioned extra origin; third-party origins still fail.
- SEC-12: sanctioned data-API traffic excluded; any speech/audio path (or any other origin) still fails.
- GL-00: browser resource-log lines for contract-designed 4xx (423 locked / 403 Therapy / 422 / 409) excused in swap runs only; app-code console output still fails.

## Genuine gaps the rehearsal caught and fixed
1. app: calendarStore accepted out-of-order responses (3-day payload rendered into the week grid) — stale-response guard added.
2. app: ApiAdapter's call-log method names didn't reverse-map to the mock's names (postAction, postUndo, searchBrain args…).
3. app: test-clock changes now propagate to the server's /__test__/clock (defer-resurface, prep escalation).
4. server: /auth/nonce (§9) was missing — every high-risk approval failed.
5. server: undo of task_create hit the append-only trigger on task_activity (compensating-rollback transaction added).
6. server: GET /news ignored disabled source groups (TD-17); news reminder ids; security decision action shapes; habit→brain mirror text used ids not names; /calendar lacked the deterministic generated-event fill (CA-06 dot equality); /__test__/db dump lacked half the db keys.

## Reproduction (audit round 1, D-18) — 1 Sep 2026

Re-run on a DIFFERENT day than the original proof, with the seed regenerated per
the hardened runbook: **86 passed · 0 failed · 6 skipped** — identical board.
Three more harness defects were caught and fixed in the process:
1. `gen-seed` stamped its anchor date in UTC — at UTC+10 an evening/morning run
   anchored to yesterday and the freshness check rejected a just-generated seed.
   Now stamped in local time, matching the app's fixtures.
2. A leftover test clock (NC-04 posts "next morning" to /__test__/clock) made
   every later `/__test__/reset` fail its own freshness check (server "today"
   had moved past the anchor) — the reset now zeroes the clock FIRST.
3. The suite's per-test reset call ignored non-OK responses, which let that 500
   silently poison every later test — it now throws with the server's message.

## Contract-test count — current as of 4 Sep 2026

The "contract tests: 13/13" line in the 31 Aug run block above is that run's
record and stays as written: thirteen was the whole suite on that date, and the
"→ 15/15" in the 3 Sep Stage-2 block below is likewise that run's. The starter's
suite has since grown — v1.2 row 12 added the data-labels check (PL-08), Stage 2
added the §9 security-decision check, and audit round 4 added a check pinning
contract §12.2's absent-key exception on `PUT /brain/items/{id}` (R4-D2: an
absent `attachments` key preserves the stored list, `[]` clears it; a server that
read absence as "clear" wiped Brain attachments on every text-only save and still
passed 15/15). So the CURRENT gate is **contract tests 16/16**, re-run live
against the reference server on 4 Sep.

Ground truth is the runner itself: one `await check(` per check in
`backend-starter/contract-tests/run.mjs`. `tests/unit/handover.test.ts` asserts
every current-count mention in README.md / QA_REPORT.md / HANDOVER.md /
backend-starter/README.md against that live count, so this number cannot go
stale in one place again (AUDIT round 5, Question 5).

## Stage 2 re-run — 3 Sep 2026 · **133 passed · 0 failed · 6 documented skips**

The whole phone project (139 tests) against the reference backend on the finished v1.2
tree. This is the first swap proof run since **row 12**; Stage 1's exit statement carried
the clause forward rather than re-proving it, and the first Stage-2 run was **54 failed /
79 passed / 6 skipped**. Two distinct causes, both real, both now fixed — BUGLOG **B-24**
(app/server drift) and **B-25** (the parallel rig against a shared backend).

### The runbook changed: the swap run is SERIAL

```
backend-starter:  npm run db:local          # embedded Postgres :5433, schema + seed for TODAY
                  node server.mjs --test    # :8787/api/v1
app:              pnpm build:web:swap
suite:            JSTACK_SWAP=1 npx playwright test --project=phone --workers=1
contract tests:   node contract-tests/run.mjs http://127.0.0.1:8787/api/v1   → 15/15
```

**If the clock passes midnight mid-session, regenerate the seed before re-running.** The
server refuses a stale one — *"seed.sql is anchored to 2026-09-03 but today is 2026-09-04 —
regenerate it first"* — and because every test opens with `POST /__test__/reset`, that refusal
fails the whole board at once (129 of 139 on 4 Sep, until `npm run gen-seed`). That is the
freshness guard working, not a defect: the fixtures are date-relative, so yesterday's seed
describes a different week. `npm run db:local` regenerates it automatically; a long-running
server does not.

`--workers=1` is a **requirement, not a preference**. The ordinary board runs four parallel
workers (speed-up A-19), which is correct against the app's per-page MockAdapter and wrong
against a shared server: every test opens with `POST /__test__/reset`, which truncates and
reseeds the one database, so parallel workers destroy each other's fixtures mid-test. This
was proven from the traces, not inferred — NC-05's task count moved 22 → 23 between two
`/__test__/db` reads with no request of its own in between; GL-08 drew a `BUG-` id another
worker had taken; NX-04 saw a news item another worker had dismissed. Nothing in an HTTP
request identifies the issuing test, so the server cannot defend against this itself. The
parallel rig landed *after* the last green swap proof, so the two had never met until now.

### What the drift actually was (B-24)

Rows 7–15 added editable task meta, checklists, real attachments, Brain find, news detail,
agent runs and data labels; neither the reference server nor `ApiAdapter`'s call-log map
followed. One missing route — `GET /brain/search/recent` — accounted for **24 of the 54**
by itself: it logs a console error, and GL-00's zero-console-error budget then fails every
test that asserts a clean console.

Server side: `/brain/search/recent`; `PUT /tasks/:id` made a real save-on-close over the
whole editable set; a per-field activity diff ported from `MockAdapter.diffTaskActivity`;
checklist rows re-keyed on `(task_id, id)` so the app's own ids survive; attachments
persisted and returned; the fifth label route `PUT /brain/items/:id/labels` added (contract
§12.1 names five, only four existed); news-source body, habit→Brain mirror and fixture
ordering corrected; `GET /tasks` cut from 45 serialized queries to 3 (529ms → 13–27ms),
which had itself been failing timing-sensitive tests.

App side: the call-log map is now a `Record<keyof DataProvider, …>`, so TypeScript
*requires* an entry for every provider method and it cannot fall behind again. Three
further real app bugs surfaced while doing it — `postAction` never put contract §9's
`nonce`/`biometric_assertion` on the wire; `putLabels` built `/brain/{id}/labels` where
brain records live at `/brain/items/{id}`; and `call()` ran `res.json()` unconditionally,
so any 204 threw a parse error into the console.

### The two tests that changed, and why neither was a weakening

`MS-04`'s final check was `expect(await …count()).toBe(0)` — a single DOM sample taken the
instant after the close click. Closing task detail saves on close, which against a live
backend is an HTTP round-trip, so the surface unmounts a beat later. It now asserts the
identical condition (`await expect(locator).toHaveCount(0)`) in the retried form the suite
already uses elsewhere. A genuinely stacked surface still never reaches zero. MS-04 passes
in mock mode both before and after.

`e2e/cb.spec.ts` also changed in the same commit (`0573af5`), and the heading above used to say
"the one test", which was wrong. CB-01 and CB-02 asserted the MockAdapter's copy — "on this
device" — unconditionally. Against a live backend the app correctly says something else, because
BUGLOG **B-22** deliberately made those surfaces derive from `appCapabilities().data` so they
could not lie about where data goes. Both now assert **both** modes' honest strings through the
existing `SWAP_MODE` seam, with no `test.skip` and no loosened matcher — strictly more asserted
than before, on a surface whose entire purpose is not lying to the user.

**Dating.** The 133/0/6 board above was re-proven on the final tree after Stage 2's audit-round
fixes (the §9 server gates, the 15th contract test, the `/__test__/db` dump fix and the
focal-dialog work), not only on the earlier one — three green runs in total, the last of them
after the last app-source commit.

