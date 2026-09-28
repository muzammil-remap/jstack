/**
 * The fast half of the CODEMAP guard — the walker, and nothing else (M-1).
 *
 * `.githooks/pre-commit` runs this on every commit, so it has to finish in
 * well under a second: it opens no test runner and starts no TypeScript
 * program. It checks one thing, which is the thing a human actually gets
 * wrong: that every path and every `testID` named in a HAND-WRITTEN section
 * of `CODEMAP.md` still exists.
 *
 * The generated sections are not checked here — they are rewritten from the
 * source moments earlier by `pnpm codemap`, so they cannot be stale. The
 * hand-written ones are where somebody writes `stores/calendar.ts` from
 * memory, or keeps a recipe step for a file that was merged away two rows
 * ago, and a map that confidently names a file that is not there is worse
 * than no map: it is read by agents that will not think to doubt it.
 *
 * `tests/unit/codemap.test.ts` does the slower half — drift, freshness and
 * the companion lists — in the board.
 *
 * One class of path is named but NOT checked: anything git ignores. Those are
 * runtime artefacts — `e2e/.artifacts/` is written by a Playwright run and is
 * absent from a fresh clone — so "does it exist" has no stable answer, and
 * checking it made the board red on a runner while passing on the laptop that
 * had just run the suite (B-14, v2.1).
 *
 * Exit 0 and silent when clean; exit 1 naming every broken reference.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/** The map to check. Defaults to the real one; a path argument lets
 * `tests/unit/hooks.test.ts` point it at a modified COPY and watch it
 * refuse, without writing to the file the repository depends on. */
const MAP = process.argv[2] ? process.argv[2] : join(root, "CODEMAP.md");

/** Strip every generated block, leaving only what a person wrote. */
function handwrittenOnly(md) {
  return md.replace(/<!-- generated:start[\s\S]*?<!-- generated:end -->/g, "");
}

/** A backticked token that looks like a repo path: has a slash or a known
 * source extension, and no spaces. Prose in backticks (`approve`, `202
 * queued`) is not a path and must not be treated as one. */
const PATHLIKE = /`([A-Za-z0-9_.@\-/()[\]]+\.(?:ts|tsx|mjs|cjs|js|json|md|yml|yaml|html|ttf)|[A-Za-z0-9_.@\-/]+\/)`/g;

/** Directories the map may name that live above `jstack-app/`. */
const REPO_LEVEL = /^(design|prompts|evidence)\//;

function existsAnywhere(rel) {
  if (existsSync(join(root, rel))) return true;
  if (existsSync(join(root, "..", rel))) return true;
  return false;
}

/**
 * Does git ignore this path? Gitignored paths are runtime artefacts and are
 * allowed to be named without existing (see the header). `check-ignore` answers
 * from the ignore rules alone, so it works for a path that is not on disk —
 * which is the whole point.
 *
 * BOTH spellings are asked, and the trailing slash is load-bearing. The rule
 * here is `/e2e/.artifacts/`, which by git's own semantics matches only a
 * DIRECTORY — and for a path that is not on disk, `check-ignore` cannot tell
 * a directory from a file unless the slash is there to say so. Asking for
 * `e2e/.artifacts` in a fresh clone answers "not ignored", which is the exact
 * tree this has to work in.
 *
 * Only consulted for a path that is ALREADY missing, so a clean map spends no
 * git calls and the pre-commit hook stays under its second.
 */
function isIgnored(rel) {
  const bare = rel.endsWith("/") ? rel.slice(0, -1) : rel;
  const spellings = [rel, bare, `${bare}/`];
  for (const cwd of [root, join(root, "..")]) {
    for (const spelling of new Set(spellings)) {
      try {
        execFileSync("git", ["check-ignore", "-q", "--", spelling], { cwd, stdio: "ignore" });
        return true;
      } catch {
        // exit 1 = not ignored under this spelling; 128 = not a repository.
        // Try the others, then the repo root, then treat it as not ignored —
        // a missing path stays a broken reference.
      }
    }
  }
  return false;
}

function allTestIds() {
  const ids = new Set();
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name)) {
        for (const m of readFileSync(p, "utf8").matchAll(/testID=(?:"([^"]+)"|\{`([^`$]+)`\})/g)) {
          ids.add(m[1] ?? m[2]);
        }
      }
    }
  };
  for (const d of ["components", "app", "layout", "theme"]) walk(join(root, d));
  return ids;
}

function brokenReferences(mapPath = MAP) {
  const md = handwrittenOnly(readFileSync(mapPath, "utf8"));
  const broken = [];

  for (const m of md.matchAll(PATHLIKE)) {
    const rel = m[1];
    // a bare directory reference ends in "/"; check it as a directory
    if (rel.endsWith("/")) {
      const dir = rel.slice(0, -1);
      if (!existsAnywhere(dir) && !REPO_LEVEL.test(rel) && !isIgnored(rel)) broken.push(`directory not found: ${rel}`);
      continue;
    }
    if (!existsAnywhere(rel) && !isIgnored(rel)) broken.push(`file not found: ${rel}`);
  }

  const ids = allTestIds();
  for (const m of md.matchAll(/`(testID:[A-Za-z0-9_-]+)`/g)) {
    const id = m[1].slice("testID:".length);
    if (!ids.has(id)) broken.push(`testID not found: ${id}`);
  }

  return broken;
}

if (process.argv[1] && process.argv[1].endsWith("codemap-check.mjs")) {
  const broken = brokenReferences();
  if (broken.length === 0) {
    process.exit(0);
  }
  console.error(`CODEMAP.md names ${broken.length} thing(s) that do not exist:`);
  for (const b of broken) console.error("  " + b);
  console.error("\nFix the reference (or the file) and commit again. This is the hand-written half of");
  console.error("the map — the generated sections regenerate themselves and are not checked here.");
  process.exit(1);
}
