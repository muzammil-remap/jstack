/**
 * Points git at `.githooks/` so the pre-commit hook is installed by
 * `pnpm install` (M-1, ADR-35 liveness layer 1).
 *
 * Wired to the `prepare` script, which pnpm runs after every install — so a
 * fresh clone gets the hook without anyone remembering, which is the whole
 * point of layer 1. `core.hooksPath` rather than writing into `.git/hooks/`:
 * the hook then lives in the repository, is reviewable in a diff, and
 * updates with a pull instead of drifting per machine.
 *
 * No dependency (husky and friends are what this replaces), and it never
 * fails an install: a machine without git, a tarball with no `.git`, or a
 * CI checkout that does not want hooks all just get a printed note. An
 * install that dies because a convenience could not be installed is worse
 * than the missing convenience.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function main() {
  if (!existsSync(join(repo, ".git"))) {
    console.log("install-hooks: no .git here — nothing to install.");
    return;
  }
  if (!existsSync(join(repo, ".githooks", "pre-commit"))) {
    console.log("install-hooks: .githooks/pre-commit is missing — nothing to install.");
    return;
  }
  try {
    execFileSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: repo, stdio: "pipe" });
    console.log("install-hooks: core.hooksPath → .githooks (pre-commit active)");
  } catch (e) {
    // CI often checks out without a usable git config; say so and move on
    console.log(`install-hooks: could not set core.hooksPath (${(e && e.message) || e}) — skipping.`);
  }
}

if (process.argv[1] && process.argv[1].endsWith("install-hooks.mjs")) main();
