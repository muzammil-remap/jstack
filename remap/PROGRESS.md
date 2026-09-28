# Progress — REMAP n8n wiring

_(the coding agent fills this in from Phase 0)_

## Setup — 2026-09-28 (Windows 11, Git Bash)

Assembled per `remap/SETUP-PROMPT.md` from the three downloaded folders. Environment only; no
app code changed.

### What was assembled

| Source | Went to | Files | Check |
|---|---|---|---|
| `C:\Users\Admin\Downloads\josh` (app) | `jstack-app/` | 647 | `diff -rq`: byte-identical |
| `C:\Users\Admin\Downloads\one level above josh` (docs) | repo root | 27 | `cmp` each: byte-identical |
| `jstack-remap-context\jstack-app-source\` (ours) | `CLAUDE.md`, `remap/` | 5 | byte-identical |

- **Source fingerprint: `2e75cc7bbded` over 364 files.** This matches the stamp in
  `jstack-mock-v15.html` (`jstack-source: 2e75cc7bbded9f83… (364 files)`), so this is the right source.
- Every text file in the download was already LF. Nothing got converted.
- `jstack-app/tests/.tmp-migration/store.reconciliation.json` came with the download and was
  imported as-is. It's a leftover migration report dated 2026-08-31, and nothing references it.
  It's probably a stray scratch file on the client's machine.

### Reconstructed (the originals weren't in the download)

| File | Contents | Why |
|---|---|---|
| `jstack-app/.npmrc` | `node-linker=hoisted`, `minimum-release-age=4320` | Without it every Jest suite fails to parse `react-native/jest/setup.js`. `security.test.ts` asserts the 4320 value, and it passes. Commit `chore: reconstruct .npmrc (original not in download)`. |
| `.gitignore` (root) | deps/caches/build output, plus the runtime paths the project documents as gitignored: `jstack-app/e2e/.artifacts/`, `evidence/.e2e-raw/`, `evidence/connect/` (WPD-15), `tests/lint-guard-scratch-*/` | Some of these rules are load-bearing. `tools/codemap-check.mjs` and `hooks.test.ts` ask `git check-ignore` about `e2e/.artifacts/`. |
| `.gitattributes` (root) | `* text=auto eol=lf` + binary types | per SETUP-PROMPT step 2 |

Git config (per clone, not versioned): `git config core.autocrlf false`.

### Toolchain

- Node v24.16.0, git 2.55.0.windows.2, pnpm 10.33.2 (via corepack 0.35.0).
- **`corepack enable` is blocked by Windows.** The exact error:
  `Internal Error: EPERM: operation not permitted, open 'C:\Program Files\nodejs\yarn'`
  (it writes shims into Program Files, which needs admin rights).
  Workaround with no admin needed: `corepack enable --install-directory "C:/Users/Admin/AppData/Roaming/npm" pnpm`.
  That folder was already on PATH; it had to be created first (`mkdir`). To undo:
  `corepack disable --install-directory "C:/Users/Admin/AppData/Roaming/npm" pnpm`.
- `pnpm install --frozen-lockfile` works (35 s). Two expected notes:
  - `install-hooks: .githooks/pre-commit is missing — nothing to install.`
  - pnpm 10 skips the build scripts for `esbuild` and `unrs-resolver` by default. Nothing
    depends on them.

### Gate results (baseline)

| Gate | Result |
|---|---|
| `pnpm check` | **pass** (tsc, 5 s) |
| `pnpm lint` | **pass** (27 s) |
| `pnpm test` (Jest's default zone is `America/New_York`) | **114 passed, 16 failed, 1 skipped (131 suites)**; tests 1762 passed / 81 failed / 1 skipped (1844) — 80 s |
| `JSTACK_TZ=Australia/Brisbane pnpm test` | **identical**: the same 16 suites and the same 81 tests fail |
| `node tools/build-web.mjs` | **pass**: `source fingerprint 2e75cc7bbded over 364 files`, exported to `~/.jstack-dist` (31 s) |

**Baseline = these 16 failing suites.** A change counts as green only if it adds no failure to
this list. All 81 failed tests were checked one by one. Each fails because a path is missing from
the download, or because the client's git history isn't here. **None of them is Windows-specific
(paths, CRLF, shell).**

| Suite | Fails on | Verdict |
|---|---|---|
| `consolidation.test.ts` (21 tests) | `history/v2,v21,v22/{CONTRACT,HANDOVER,*_DECISIONS,CARRIED_DEFECTS}_*.md`, `history/v1/*`, `appendix/USER_STORIES_DRAFT.md`; paths named in `HANDOVER.md`/`KNOWN_GAPS.md`/`DEVICE_RUNBOOK.md` under `history/`, `diagrams/`, `appendix/` | missing from download |
| `workflows.test.ts` (34 tests) | `.github/workflows/` (`board.yml`, `nightly.yml`, `release.yml`) | missing from download |
| `handover.test.ts` (14 tests) | `history/v2/JOSH_QA.md`, `history/v2/QA_REPORT_v2.md`, `history/v21/QA_REPORT_v21.md`, `history/v22/HANDOVER_v22.md`; screenshot passes `history/v22/demo/v21/` and `history/v22/demo/v22/` (~1,570 PNGs) | missing from download |
| `brainProposalApplied.test.ts` (5 tests) | `history/v2/BRAIN_PROPOSAL.md`, `history/v22/demo/v22/brain-proposal-*.png` | missing from download |
| `codemap.test.ts` (3 tests) | CM-02: the map is stamped `sha=71f9d7d8`, a client commit that isn't in this repo's history. Walker: CODEMAP names 22 `history/` + `.github/` paths. §4 guard column: `.github/workflows/board.yml`. (CM-01 drift passes.) | missing from download (folders + client git history) |
| `bundle-budget.test.ts` (2 tests) | `history/v22/HANDOVER_v22.md` | missing from download |
| `qaReport22.test.ts` (1 test) | `history/v2/QA_REPORT_v2.md` | missing from download |
| `openapi.test.ts` (1 test) | `history/v2/CONTRACT_v2.md` | missing from download |
| `hooks.test.ts` (suite) | `.githooks/pre-commit` | missing from download |
| `contract.test.ts` (suite) | `history/v2/CONTRACT_v2.md` | missing from download |
| `controls.test.ts` (suite) | `history/v2/CONTROLS_v2.md` | missing from download |
| `controls-v21.test.ts` (suite) | `history/v21/CONTROLS_v21.md` | missing from download |
| `controls-v22.test.ts` (suite) | `history/v22/CONTROLS_v22.md` | missing from download |
| `buglogRows.test.ts` (suite) | `history/v22/BUGLOG_v22.md` | missing from download |
| `qa-citations.test.ts` (suite) | `history/v2/QA_REPORT_v2.md` | missing from download |
| `bnCaptureCarried.test.ts` (suite) | `history/v2/QA_REPORT_v2.md` | missing from download |

Versus the Linux dry run (18 failing, 112 passing): this run has 2 fewer failures. I can't name
them without the dry run's list. The likely cause is that this run happened after the source was
committed and the root `.gitignore` existed. `files.test.ts` runs `git grep` over tracked
files, and `hooks.test.ts`/`codemap-check` ask `git check-ignore`.

Note: every `pnpm test` run rewrites the tracked `jstack-app/evidence/jest-summary.json` with
this copy's smaller counts (the client's committed file says 2476 tests). Restore it with
`git checkout -- jstack-app/evidence/jest-summary.json` and don't commit the change.

### Running it

| What | Command (from `jstack-app/`) | URL |
|---|---|---|
| Production-style build, served | `node tools/build-web.mjs` then `pnpm serve:web` | http://localhost:4173 |
| Expo dev server (hot reload) | `pnpm web` | http://localhost:8081 |

Smoked both in headless Chromium (Playwright 1.62.1), at 1366×900, on both unlock paths:
- **Passkey:** virtual authenticator, the same way `e2e/helpers.ts` does it. Lock screen → ceremony → unlocked.
- **Mock sign-in:** the passkey is cancelled (`NotAllowedError`) → "mock sign-in" is offered → unlocked,
  with the toast "Signed in to the mock · fixture data".
- All five tabs render fixture data (Today, Tasks "11 open · 2 waiting", Brain, Life,
  Agents "2 need you · 5 runs today").
- **Console on `serve:web`: 0 errors, 0 warnings** on both paths.
- **Console on `pnpm web` (dev) isn't clean.** These messages are dev-only and pre-existing in the
  client's code, not caused by this setup. None of the docs mention them:
  - 96× Metro `Require cycle` warnings (e.g. `stores/session.ts → data/provider.ts → … → stores/session.ts`)
  - react-native-web deprecations: `"shadow*" style props are deprecated`, `props.pointerEvents is deprecated`
  - **React DOM-nesting error on the Agents tab:** `<button> cannot contain a nested <button>`.
    The `Row` `issue-e1` Pressable in Agents › Agent issues wraps the `BtnSm` "Renew"
    (`issue-act-e1`). The same invalid HTML ships in production too; React only reports it in dev.
    **Real, minor, not fixed** (app code; needs an OK).

### Still missing from the download — what to fetch from the client's server

All paths are relative to `jstack-app-source/` on the server:

1. `jstack-app/.npmrc`, to replace the reconstruction.
2. The hidden files at the root: `.gitattributes`, `.gitignore`, plus `jstack-app/.gitignore` if it exists.
3. `.githooks/` (`pre-commit`, `pre-push`)
4. `.github/` (`workflows/board.yml`, `nightly.yml`, `release.yml`, `dependabot.yml`, CODEOWNERS, PR template)
5. `history/`, whole, including `history/v22/demo/v21/` and `history/v22/demo/v22/` (the screenshot
   passes, ~1,570 PNGs), `history/v1/`, `history/v2/`, `history/v21/`, `history/v22/`,
   `history/expo-go/`, `history/README.md`
6. `appendix/` (`USER_STORIES_DRAFT.md`, `JO_PREFERENCES.md`, `CONTEXT_INDEX.md`)
7. `diagrams/` (`1-architecture-seams.html`, `2-offline-capture.html`, `3-lock-states.html`, `4-stage2-plugin.html`)

Getting the hidden files and subfolders means copying the tree with a tool that keeps them, e.g.
`tar czf jstack-app-source.tgz --exclude=node_modules jstack-app-source`, or `rsync -a`. A browser
or file-manager download loses them. With those folders in place, every failure that's an
`ENOENT` or a missing path should clear (not verified; re-run the gates). `codemap.test.ts` CM-02
stays red until the client's git history (`.git`, commit `71f9d7d8`) is here, or until the map is
re-stamped by a `pnpm codemap` commit in this repo.
