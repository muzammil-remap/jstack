# DONE — JSTACK V2.3

v2.3 builds on tag `v2.2` so the handover works on a real network and a real phone. Every row is in `BUGLOG_v23.md` with the test that was red first, and one line each in `CHANGES_v23.md`: offline that survives a flight (WP-A); voice on the phone and the writes that lied (WP-B); keyboard, dialogs and the acceptance IDs no test named (WP-C); the connect toolkit, request timeouts, explicit credentials and the native build profiles (WP-D); Learning's archive and the collapse check (WP-G); the code review's fourteen fixes (WP-F); these documents (WP-E).

## v2.3.1 — Josh's 15 September review, the same day

**v2.3.3** (16 September) is v2.3.2 plus the same day's review: the floating push-to-talk orb, the dictation orb, the keyboard and the zoom, the needs-you schedule, the handover's stages and appendix — rows WPR-1..8, WPS-1 and WPT-1..3 under `## v2.3.3, 16 Sep`. Take tag `v2.3.3`.

Six packages on v2.3, every row in `BUGLOG_v23.md` under `## v2.3.1` with the test that was red first (24 rows: WPI-1..3, WPJ-1..3, WPK-1..5, WPL-1..4, WPM-1..7, WPN-1..2): the last-seen cache keeps sensitive records too (P-3 revised); a boot probe for the native crypto the encrypted store needs, with a memory-only fallback and the proposal for REMAP (`HANDOVER.md` §1.8); the screen stays on while Talk or dictation is open, JSTACK's idle lock waits, and locking the phone ends voice as a pause (P-1 clarified, ADR-75); Josh's answers written where REMAP reads them (ADR-70..74, `SECURITY.md`, `CONTRACT.md`, `KNOWN_GAPS.md`, `V23_REQUIREMENTS.md`); four archify diagrams under `diagrams/` with their specs; the packaged mock signs in from a file in any browser; every earlier version's build record moved into `history/` with nothing deleted. The board below is v2.3.1's.

## For Josh's phone

- **The mock**: `jstack-mock-v15.html`, the app on fixture data in one file; `README.md` says how to serve it.
- **The handover as a page**: `REMAP_HANDOVER.html`.
- **The iPhone app**: build and submit on your own Apple account with `NATIVE_RUNBOOK.md`. Dictation is wired and transcribes on the device; hearing it on the phone is your check (`DEVICE_RUNBOOK.md` §3).

## The board at the tag

From the release candidate's own tree (`jstack-app/evidence/jest-summary.json`, `jstack-app/evidence/e2e-summary.json`,
both written by the runs named here):

```
pnpm check        0 errors
pnpm lint         0 errors, 0 warnings
pnpm test         2475 passed, 1 skipped by design / 2476, 131 suites (unit + native), in BOTH zones —
                  TZ=America/New_York and JSTACK_TZ=Australia/Brisbane, identical; the skip is
                  tests/unit/serveMockRig.test.ts, the mock server pnpm serve:mock hosts
pnpm test:e2e     971 passed, 0 failed, 0 flaky, 87 skipped of 1058, across 8
                  width × scheme projects (core 850: 793 passed, 57 skipped · matrix 208
                  over 8 projects: 178 passed, 30 skipped)
```

`QA_REPORT_v22.md` §1 reads 211 rows — 199 PASS, 11 PARTIAL, one DEVIATION.

## The audit

`AUDIT_v23.md` is the qa-auditor's, and its last verdict is what opens `main` (`.githooks/pre-push`). It ran once on v2.3's release candidate `bffb227f` and found one security-class defect (D1 — `BUGLOG_v23.md` WPA-14 to WPA-17: the web build's emergency wipe could leave a capture readable under a key it kept), fixed in the next commits and signed off on its second run at `90ef2247`; its third run, on v2.3.1's boarded tree `ac15bcee`, signed off at cap with two carried rows. Its last line is the verdict that opened `main`.

## What is carried

`KNOWN_GAPS.md`, one line per gap with whose it is. Security-class defects and data loss are never carried: they block the release.

## What REMAP plumbs

The server behind `CONTRACT.md` and `jstack-app/openapi.yaml`, with the server-side security of Q8–Q14 and Q20 and the screening of shared content (Q24). `pnpm connect:check <BASE_URL>` answers whether a server matches (`HANDOVER.md` §4). The store track is Josh's (`NATIVE_RUNBOOK.md`).

## The tag, and where the zip goes

**`v2.3`** was tagged on 15 September 2026 at `290e2708` and its zip exported to `JStack/App/releases/v2.3/`; **`v2.3.1`** — the same day's afternoon round, below — is tagged on `main` at the merge of `v231-build` once its audit round signs off, its zip to `JStack/App/releases/v2.3.1/`. `HANDOVER.md` §9 is REMAP's reading order. **`v2.3.2`** (16 September, 05:47) is Josh's evening review, tagged at `3fef302f`; **`v2.3.3`** (16 September) is his phone review of that build plus the audit's round-5 fixes, tagged on `main` at the merge of `v233-build` once round 5 signs off, its zip to `JStack/App/releases/v2.3.3/`.
