/**
 * Generates the machine-known half of `CODEMAP.md` (M-1, ADR-35, CM-01..10).
 *
 * `CODEMAP.md` is what a future agent — a fresh Claude Code instance, the
 * EA's coding sub-agent, REMAP's developer — reads instead of re-deriving
 * the codebase. Four of its ten sections are facts that can be read off the
 * source, so they are generated and stamped with the commit sha they were
 * true at; the other six carry judgement and are written by hand and
 * guarded (see `tests/unit/codemap.test.ts`).
 *
 * Generated here:
 *   (2) the map of the territory — every source file, the first sentence of
 *       its header comment, its line count, and what imports it
 *   (3) the chains — from `wiring.json`, one block per contract group
 *   (7) the decision index — ADR titles and first sentences
 *   (8) the test map — every spec and the IDs it names, every lint rule and
 *       the invariant it guards
 *
 * And the three COMPANION LISTS that keep the hand-written sections from
 * rotting silently (ADR-35's liveness layer 3): what is new since section 6
 * was curated, which guards section 4 does not yet name, which file families
 * section 5 has no recipe for. A release requires them empty, so judgement
 * is refreshed at least once per release and never by accident.
 *
 * Generated blocks are delimited so a regeneration never touches a
 * hand-written one:
 *   <!-- generated:start section=2 sha=… date=… --> … <!-- generated:end -->
 *
 * Run: `node tools/gen-codemap.mjs` (or `pnpm codemap`, which runs every
 * generator in order). Idempotent — running it twice changes nothing.
 *
 * REPRODUCIBLE, which is stronger than idempotent and is what the drift check
 * needs: the same commit must produce byte-identical output on a Windows
 * laptop and an ubuntu runner. That costs four rules (B-14, v2.1) —
 * every directory listing is sorted with a byte comparator rather than trusted
 * in `readdir` order, which is alphabetical on NTFS and hash order on ext4;
 * every derived list is sorted too; paths are emitted POSIX-style; and the
 * only clock reading is the stamped commit's own date, never today's.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "..");
const OUT = join(root, "CODEMAP.md");

/** The folders section 2 maps. Tools and tests are deliberately included —
 * an agent asking "where does the board come from" needs them. */
const SOURCE_DIRS = ["app", "components", "data", "layout", "lib", "stores", "theme", "tools", "eslint-rules"];

/** Byte order, not `localeCompare` — ICU collation depends on the runner's
 * locale, so a locale-aware sort is not the fixed comparator this needs. */
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Windows `path` helpers hand back backslashes; the map is read by people and
 * by greps, and must look the same on both platforms. */
const toPosix = (p) => p.split("\\").join("/");

/** Every CRLF in the assembled map, so the file written is LF on any host. */
const CRLF = /\r\n/g;

const git = (...args) => {
  try {
    return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

function headSha() {
  return git("rev-parse", "--short", "HEAD") || "unknown";
}

/** The stamp's date is the STAMPED COMMIT's date, not today's. A wall-clock
 * date makes the generator non-reproducible: regenerating the same commit
 * tomorrow rewrites the file, so whether the map "drifted" would depend on
 * what day the board happened to run. */
function shaDate(sha) {
  return git("log", "-1", "--format=%cs", sha) || new Date().toISOString().slice(0, 10);
}

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(join(root, dir));
  } catch {
    return acc;
  }
  // sorted, not readdir order: NTFS returns alphabetical and ext4 returns hash
  // order, and this traversal order reaches the output
  for (const name of [...entries].sort(byName)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, acc);
    else if (/\.(ts|tsx|mjs|cjs|js)$/.test(name)) acc.push(rel);
  }
  return acc;
}

/** The first SENTENCE of a file's opening block comment — what the file is
 * for, in the author's own words, rather than a name restated. */
function purposeOf(src) {
  const m = /^\/\*\*([\s\S]*?)\*\//.exec(src.trimStart());
  if (!m) return "";
  const body = m[1]
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const stop = body.search(/\.(\s|$)/);
  return (stop === -1 ? body : body.slice(0, stop + 1)).trim();
}

const lineCount = (src) => {
  const lines = src.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.length;
};

/** file → the files that import it, resolved from `@/` and relative paths. */
function importGraph(files) {
  const importers = new Map(files.map((f) => [f, []]));
  const candidates = (spec, from) => {
    const bases = [];
    if (spec.startsWith("@/")) bases.push(spec.slice(2));
    else if (spec.startsWith(".")) {
      const dir = dirname(from);
      bases.push(relative(root, join(root, dir, spec)).split("\\").join("/"));
    } else return [];
    const out = [];
    for (const b of bases) for (const ext of [".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"]) out.push(b + ext);
    return out;
  };
  for (const f of files) {
    const src = readFileSync(join(root, f), "utf8");
    for (const m of src.matchAll(/from\s+"([^"]+)"/g)) {
      for (const cand of candidates(m[1], f)) {
        if (importers.has(cand)) {
          importers.get(cand).push(f);
          break;
        }
      }
    }
  }
  // the importer lists are printed in order, and their order is the order the
  // files were walked in — sort them so it is the order of their names instead
  for (const list of importers.values()) list.sort(byName);
  return importers;
}

// ─────────────────────────────────────────────────── section 2: the map

function sectionTerritory(files, importers) {
  const byDir = new Map();
  for (const f of files) {
    const dir = toPosix(dirname(f));
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(f);
  }
  const out = [];
  for (const dir of [...byDir.keys()].sort(byName)) {
    out.push(`\n### \`${dir}/\`\n`);
    out.push("| file | lines | purpose | imported by |");
    out.push("|---|---|---|---|");
    for (const f of byDir.get(dir).sort(byName)) {
      const src = readFileSync(join(root, f), "utf8");
      const purpose = purposeOf(src).replace(/\|/g, "\\|") || "_(no header comment)_";
      const used = importers.get(f) ?? [];
      const by = used.length === 0 ? "—" : used.length <= 3 ? used.map((u) => `\`${u}\``).join(", ") : `${used.length} files`;
      out.push(`| \`${f.split("/").pop()}\` | ${lineCount(src)} | ${purpose} | ${by} |`);
    }
  }
  return out.join("\n");
}

// ──────────────────────────────────────────────── section 3: the chains

function sectionChains() {
  const wiringPath = join(root, "wiring.json");
  if (!existsSync(wiringPath)) return "_`wiring.json` not generated yet — run `pnpm codemap`._";
  const wiring = JSON.parse(readFileSync(wiringPath, "utf8"));
  const byGroup = new Map();
  for (const r of wiring.routes) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r);
  }
  const out = [];
  for (const group of [...byGroup.keys()].sort(byName)) {
    out.push(`\n### ${group}\n`);
    out.push("| endpoint | store action | component | testIDs |");
    out.push("|---|---|---|---|");
    for (const r of byGroup.get(group)) {
      const cell = (a) => (a == null || a.length === 0 ? "—" : a.slice(0, 4).map((x) => `\`${x}\``).join(", ") + (a.length > 4 ? ` +${a.length - 4}` : ""));
      out.push(`| \`${r.method} ${r.path}\` | ${cell(r.storeActions)} | ${cell(r.components)} | ${cell(r.testIds)} |`);
    }
  }
  const orphans = wiring.orphans ?? [];
  out.push(`\n**${orphans.length} orphan route(s)** — reachable in the contract, no client caller traced. \`wiring.json\` lists them.`);
  return out.join("\n");
}

// ───────────────────────────────────────── section 7: the decision index

function sectionDecisions() {
  const out = [];
  // A-5: the consolidated index, one row per ADR with its status — a superseded
  // decision is shown as superseded, never quoted as if it stood (the stale
  // ADR-12 quote, RM-06), and V2.2's ADR-41..65 are in it
  const consolidated = join(repo, "DECISIONS.md");
  if (existsSync(consolidated)) {
    out.push("\n`DECISIONS.md` — ADR-01..75, each with its status; the versioned decision files hold the full reasoning.\n");
    for (const line of readFileSync(consolidated, "utf8").split(/\r?\n/)) {
      if (!/^\| \d{2} \|/.test(line)) continue;
      const [num, title, decision, status] = line.split(/(?<!\\)\|/).slice(1, 5).map((c) => c.trim());
      out.push(`- **ADR-${num} · ${title}** — ${decision} (${status})`);
    }
    return out.join("\n");
  }
  for (const file of ["history/v2/V2_DECISIONS.md", "history/v21/V21_DECISIONS.md"]) {
    const p = join(repo, file);
    if (!existsSync(p)) continue;
    out.push(`\n### \`${file}\`\n`);
    const src = readFileSync(p, "utf8");
    const parts = src.split(/^## (ADR-\d+ · .+)$/m);
    for (let i = 1; i < parts.length; i += 2) {
      const title = parts[i].trim();
      const body = parts[i + 1] ?? "";
      const decision = /\*\*Decision\.\*\*\s*([\s\S]*?)(?:\n\n|$)/.exec(body);
      const text = (decision ? decision[1] : body).replace(/\s+/g, " ").trim();
      const stop = text.search(/\.(\s|$)/);
      const first = (stop === -1 ? text : text.slice(0, stop + 1)).replace(/\|/g, "\\|");
      out.push(`- **${title}** — ${first}`);
    }
  }
  return out.join("\n");
}

// ───────────────────────────────────────────── section 8: the test map

function sectionTests() {
  const out = ["\n### Specs\n", "| spec | titles | acceptance IDs named |", "|---|---|---|"];
  for (const rel of walk("e2e").filter((f) => f.endsWith(".spec.ts")).sort(byName)) {
    const src = readFileSync(join(root, rel), "utf8");
    const titles = [...src.matchAll(/^\s*test(?:\.describe)?\(\s*"([^"]+)"/gm)].length;
    const ids = [...new Set([...src.matchAll(/\b([A-Z]{2,3}-\d{2})\b/g)].map((m) => m[1]))].sort();
    out.push(`| \`${rel}\` | ${titles} | ${ids.length ? ids.join(", ") : "—"} |`);
  }
  out.push("\n### Unit tests\n", "| test | acceptance IDs named |", "|---|---|");
  for (const rel of walk("tests").filter((f) => /\.test\.tsx?$/.test(f)).sort(byName)) {
    const src = readFileSync(join(root, rel), "utf8");
    const ids = [...new Set([...src.matchAll(/\b([A-Z]{2,3}-\d{2})\b/g)].map((m) => m[1]))].sort();
    out.push(`| \`${rel}\` | ${ids.length ? ids.join(", ") : "—"} |`);
  }
  out.push("\n### Lint rules\n", "| rule | guards |", "|---|---|");
  for (const rel of walk("eslint-rules").sort(byName)) {
    const src = readFileSync(join(root, rel), "utf8");
    const guards = /^\/\/\s*guards:\s*(.+)$/m.exec(src);
    out.push(`| \`${rel.split("/").pop()}\` | ${guards ? guards[1].trim() : purposeOf(src) || "—"} |`);
  }
  return out.join("\n");
}

// ─────────────────────────────────── the three companion lists (layer 3)

/** Every B-row in either bug log, so section 6 can be checked against them. */
function bugRows() {
  const rows = [];
  for (const file of ["history/v2/BUGLOG_v2.md", "history/v21/BUGLOG_v21.md"]) {
    const p = join(repo, file);
    if (!existsSync(p)) continue;
    for (const m of readFileSync(p, "utf8").matchAll(/^##\s+(B-\d+|B\d+-\d+)\b(.*)$/gm)) {
      // headings read `## B-01 (row 6) — what broke`; keep the description,
      // drop the row reference and the dash that introduces it
      const title = m[2]
        .replace(/^\s*\([^)]*\)\s*/, "")
        .replace(/^\s*[—–-]\s*/, "")
        .trim();
      rows.push({ file, id: m[1], title });
    }
  }
  return rows;
}

function companionLists(handwritten) {
  const section6 = handwritten.get(6) ?? "";
  const section4 = handwritten.get(4) ?? "";
  const section5 = handwritten.get(5) ?? "";

  const newBugRows = bugRows().filter((r) => !section6.includes(r.id));

  const guards = [...walk("eslint-rules"), ...walk("tests").filter((f) => /\.test\.tsx?$/.test(f))].sort(byName);
  const unnamedGuards = guards.filter((g) => !section4.includes(g.split("/").pop()));

  const families = [
    ...new Set(
      walk(".")
        .filter((f) => SOURCE_DIRS.some((d) => f.startsWith(`./${d}/`) || f.startsWith(`${d}/`)))
        .map((f) => toPosix(dirname(f))),
    ),
  ].sort(byName);
  const noRecipe = families.filter((f) => !section5.includes(f));

  const list = (title, items, how) =>
    [
      `\n### ${title}`,
      items.length === 0 ? "\nNone. ✅" : `\n${how}\n`,
      ...items.map((i) => `- ${i}`),
    ].join("\n");

  return [
    list(
      "New since section 6 was curated",
      newBugRows.map((r) => `\`${r.id}\` (${r.file}) — ${r.title.slice(0, 110)}`),
      "Each of these is a bug that changed a rule and is not yet named in section 6. A release requires this empty.",
    ),
    list(
      "Guards section 4 does not name",
      unnamedGuards.map((g) => `\`${g}\``),
      "Each is a lint rule or test file that enforces something section 4 does not claim.",
    ),
    list(
      "File families with no recipe in section 5",
      noRecipe.map((f) => `\`${f}/\``),
      "Each is a directory nobody has written a how-to-add checklist for.",
    ),
  ].join("\n");
}

// ───────────────────────────────────────────────────────── assembly

const START = (n, sha, date) => `<!-- generated:start section=${n} sha=${sha} date=${date} -->`;
const END = "<!-- generated:end -->";

/** Pull the hand-written sections out of the existing file so a
 * regeneration cannot touch them. Section n's prose is everything between
 * its `## n.` heading and the next `## `. */
function handwrittenSections(md) {
  const out = new Map();
  const parts = md.split(/^## (\d+)\. .*$/m);
  for (let i = 1; i < parts.length; i += 2) out.set(Number(parts[i]), parts[i + 1] ?? "");
  return out;
}

function replaceGenerated(md, n, body, sha, date) {
  const block = `${START(n, sha, date)}\n${body}\n${END}`;
  const re = new RegExp(`<!-- generated:start section=${n}[^>]*-->[\\s\\S]*?<!-- generated:end -->`);
  if (re.test(md)) return md.replace(re, block);
  return md;
}

/**
 * `--out <path>` writes the regenerated map somewhere else, reading the
 * hand-written sections from the real one. `tests/unit/codemap.test.ts`'s
 * drift check uses it: regenerating in place would mutate a file that
 * `tests/unit/hooks.test.ts` reads, and Jest runs those two files in
 * parallel — a race that failed one run in several and would have been
 * dismissed as noise.
 */
function generate(outPath = OUT) {
  if (!existsSync(OUT)) throw new Error(`${OUT} does not exist — M-1 writes the hand-written skeleton once, by hand.`);
  const sha = headSha();
  const date = shaDate(sha);
  const files = SOURCE_DIRS.flatMap((d) => walk(d));
  const importers = importGraph(files);

  let md = readFileSync(OUT, "utf8");
  const hand = handwrittenSections(md);

  md = replaceGenerated(md, 2, sectionTerritory(files, importers), sha, date);
  md = replaceGenerated(md, 3, sectionChains(), sha, date);
  md = replaceGenerated(md, 7, sectionDecisions(), sha, date);
  md = replaceGenerated(md, 8, sectionTests(), sha, date);
  md = replaceGenerated(md, 11, companionLists(hand), sha, date);

  // LF only. `.gitattributes` checks every text file out as LF, so this is
  // belt and braces — but a generator that emits the host's line ending is a
  // reproducibility bug waiting for the next machine.
  writeFileSync(outPath, md.replace(CRLF, "\n"));
  return { sha, files: files.length };
}

if (process.argv[1] && process.argv[1].endsWith("gen-codemap.mjs")) {
  const i = process.argv.indexOf("--out");
  const { sha, files } = generate(i === -1 ? OUT : process.argv[i + 1]);
  console.log(`CODEMAP.md regenerated at ${sha} (${files} source files mapped)`);
}
