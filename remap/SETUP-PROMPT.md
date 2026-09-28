# Setup prompt — assemble the project from the downloaded folders

> Paste into Claude Code, opened in **your own repo** (the empty or near-empty one you'll push to). Check the three paths in the table first.

---

We don't have GitHub access to the client's project, but we have a complete download of it in two folders on this Windows machine. Your job today is **environment setup only**: assemble the project inside this repo in the layout its own tools expect, make it install, test, build and run locally on its mock data, and commit it. Don't start the n8n work yet; that's `remap/KICKOFF-PROMPT.md`, next session.

## Inputs

| Name | Path | What it is |
|---|---|---|
| `APP_SRC` | `C:\Users\Admin\Downloads\josh` | The app. On the client's server this folder is `jstack-app-source/jstack-app`. It contains `package.json`, `app.json`, `CODEMAP.md`, `e2e/`, `data/`… |
| `DOCS_SRC` | `C:\Users\Admin\Downloads\one level above josh` | The folder one level above the app on the server (`jstack-app-source/`): `HANDOVER.md`, `CONTRACT.md`, `jstack-mock-v15.html` and ~25 other docs |
| `REMAP_SRC` | the `jstack-remap-context.zip` I downloaded (unzip it anywhere) | Our own files: `CLAUDE.md`, `remap/KICKOFF-PROMPT.md`, `remap/WEBHOOKS.md`, `remap/PROGRESS.md`, this prompt |

If a path doesn't exist, ask me; don't guess. Use Git Bash-style paths in commands (`/c/Users/Admin/Downloads/josh`). The project's scripts and hooks are POSIX shell and need Git Bash on Windows.

## Target layout (this repo's root = the server's `jstack-app-source/`)

```
<this repo>/
  CLAUDE.md                ← from REMAP_SRC (REMAP scope; loads alongside the app's own CLAUDE.md)
  remap/                   ← from REMAP_SRC (KICKOFF-PROMPT.md, WEBHOOKS.md, PROGRESS.md, SETUP-PROMPT.md)
  HANDOVER.md, CONTRACT.md, … jstack-mock-v15.html   ← every file from DOCS_SRC, at the root
  jstack-app/              ← the contents of APP_SRC (the folder must be named exactly `jstack-app`)
```

The app's tools read documents from `jstack-app/..`, so the docs **must** be at the repo root and the app **must** be in `jstack-app/`.

## Steps

1. **Look before copying.** List this repo's current contents. If it isn't empty, tell me what's there and don't overwrite anything without asking. Confirm `git` works here (`git rev-parse --show-toplevel`). If it isn't a git repo yet, ask me before `git init`.

2. **Line endings first, before any file is added to git.** Create `.gitattributes` at the root with `* text=auto eol=lf` (plus `*.png binary`, `*.jpg binary`, `*.woff2 binary`, `*.ttf binary`, `*.ico binary`), and run `git config core.autocrlf false` for this repo. The project hashes its own source (`tools/source-fingerprint.mjs`) and its hooks are shell scripts, so CRLF conversion would break both.

3. **Copy.**
   - `APP_SRC` → `./jstack-app/`, excluding `node_modules`, `.expo`, `dist`, `web-build` and any `.git`. On Windows, `robocopy "<APP_SRC>" "jstack-app" /E /XD node_modules .expo dist web-build .git` works; check its exit code (0–7 means success).
   - `DOCS_SRC`'s files → the repo root.
   - `REMAP_SRC`'s `CLAUDE.md` and `remap/` → the root.

   Don't modify any copied file in this step.

4. **Verify it's the right source.** After step 7's build, `tools/build-web.mjs` prints `source fingerprint <hash> over <n> files`. It must read **`2e75cc7bbded` over 364 files**, which matches the fingerprint stamped in `jstack-mock-v15.html` (search the file for `jstack-source:`). If it differs, stop and tell me.

5. **Known gaps in this copy (from an earlier dry run).** The download lost hidden files and every subfolder of `DOCS_SRC`. Specifically:

   | Missing | Effect | What to do today |
   |---|---|---|
   | `jstack-app/.npmrc` | **Blocks everything.** Without it pnpm uses its default isolated layout, and every Jest suite fails to parse `react-native/jest/setup.js`. | If I give you the real file, use it. Otherwise create it with exactly these two lines: `node-linker=hoisted` and `minimum-release-age=4320`. Commit it with the message `chore: reconstruct .npmrc (original not in download)`, and log that in `remap/PROGRESS.md`. |
   | Root `.github/` (workflows, CODEOWNERS, PR template) | ~7 doc/CI test suites fail with `ENOENT` | Don't recreate; mark as "missing from download". |
   | Root `.githooks/` | No pre-commit hook (`install-hooks` prints a note and continues) | Same. |
   | Root `history/`, `appendix/`, `diagrams/` | ~10 doc-consistency suites fail with `ENOENT` | Same. |

   Don't fabricate any of the missing documents, and never edit a test to make it pass. If I later provide the full tree, copy it in and re-run.

6. **Install.** From `jstack-app/`: Node ≥ 20 (`node -v`), then `corepack enable` and `corepack prepare pnpm@10.33.2 --activate`, then `pnpm install --frozen-lockfile`. If Windows blocks corepack, tell me the exact error.

7. **Run the gates and record results** in `remap/PROGRESS.md` under "Setup":

   ```
   pnpm check
   pnpm lint
   pnpm test
   JSTACK_TZ=Australia/Brisbane pnpm test
   node tools/build-web.mjs
   ```

   Expected from the dry run on Linux: `check` and `lint` pass; `pnpm test` is **112 of 130 suites passing** (1 skipped). All 18 failures are documentation and CI tests that read the missing folders in step 5, plus `codemap.test.ts` (CM-02/CM-03: the map is older than freshly copied files, and it names docs that aren't here). For **every** failing suite, write one line in `PROGRESS.md`: the suite name, the missing path or reason, and "missing from download" or "real". If anything fails for a reason that isn't a missing file (especially anything Windows-specific: paths, CRLF, shell syntax), flag it clearly and propose a fix, but don't change app code without my OK.

8. **Run it.** `pnpm serve:web` serves the build on `http://localhost:4173`. Also try the dev server (`pnpm web`). Open it and confirm:
   - the lock screen, then the mock sign-in or passkey
   - all five tabs render with fixture data
   - no console errors

   Tell me both commands and URLs.

9. **Commit** in logical commits:
   1. `.gitattributes` and git config notes
   2. `chore: import client source (jstack-app-source) as downloaded`
   3. `.npmrc` reconstruction, if needed
   4. `docs(remap): setup results`

   Keep `node_modules`, `.expo`, `dist` and build output out of git. The app has no root `.gitignore` in this copy, so add one covering those. Don't push unless I say so. This is the client's private code: the remote must be a **private** repo; ask me to confirm before any push.

## Report

1. The final tree (top two levels).
2. The gate results table, including every failing suite and its reason.
3. How to run it locally.
4. What's still missing and exactly which files I should fetch from the client's server to close the gaps.

Then stop. Next session starts with `remap/KICKOFF-PROMPT.md`.
