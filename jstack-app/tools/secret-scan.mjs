/**
 * Secret scan (spec §14.9 — SEC-13): gitleaks-class regex rules over the
 * repo's tracked source (node_modules/dist excluded). Exit 1 on any hit —
 * a release gate. Findings print file:line and the rule, never the secret.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * `--history` scans `git log -p` instead of the working tree (H-1b).
 *
 * A secret deleted in the next commit is still in the history, still in every
 * clone, and still valid until it is rotated — `git rm` is not revocation.
 * The working-tree scan is a gate on every push; this is the one-off question
 * "was anything ever committed", and the answer is recorded in BUGLOG_v21.md
 * rather than re-derived by whoever wonders next.
 */
const HISTORY = process.argv.includes("--history");
const ROOT = process.argv.filter((a) => !a.startsWith("--"))[2] ?? ".";
const SKIP_DIRS = new Set(["node_modules", ".git", ".expo", "dist", ".artifacts", "e2e", ".pgdata"]);
const SKIP_FILES = [/\.png$/, /\.jpg$/, /\.ttf$/, /\.zip$/, /\.lock$/, /pnpm-lock\.yaml$/, /secret-scan\.mjs$/];
const RULES = [
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "generic api key assignment", re: /(api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]/i },
  { name: "bearer token literal", re: /authorization['":\s]+bearer\s+[A-Za-z0-9\-_.]{25,}/i },
  { name: "private key block", re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "anthropic key", re: /sk-ant-[A-Za-z0-9\-_]{20,}/ },
  { name: "openai-style key", re: /sk-[A-Za-z0-9]{40,}/ },
  { name: "slack token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "github token", re: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: "jwt literal", re: /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "password assignment", re: /password\s*[:=]\s*['"][^'"]{8,}['"]/i },
];
// fixture/demo phrases that are data, not secrets
const ALLOW = [/POSTGRES_PASSWORD: jstack/, /password: "jstack"/, /PGPASSWORD/, /jstack",/];

let hits = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full);
      continue;
    }
    if (SKIP_FILES.some((re) => re.test(name))) continue;
    if (st.size > 2_000_000) continue;
    let text;
    try {
      text = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      for (const rule of RULES) {
        if (rule.re.test(line) && !ALLOW.some((a) => a.test(line))) {
          hits++;
          console.log(`HIT  ${relative(ROOT, full)}:${i + 1}  [${rule.name}]`);
        }
      }
    });
  }
}
function scanHistory() {
  // Added lines only: a `-` line is something being REMOVED, and flagging
  // those would report every secret that was already cleaned up as if it
  // were still there.
  const patch = execFileSync("git", ["log", "-p", "--no-color", "--unified=0"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  let commit = "(head)";
  let file = "(unknown)";
  for (const line of patch.split("\n")) {
    if (line.startsWith("commit ")) commit = line.slice(7, 14);
    else if (line.startsWith("+++ b/")) file = line.slice(6);
    else if (line.startsWith("+") && !line.startsWith("+++")) {
      const added = line.slice(1);
      if (SKIP_FILES.some((re) => re.test(file))) continue;
      for (const rule of RULES) {
        if (rule.re.test(added) && !ALLOW.some((a) => a.test(added))) {
          hits++;
          console.log(`HIT  ${commit} ${file}  [${rule.name}]`);
        }
      }
    }
  }
}

if (HISTORY) scanHistory();
else walk(ROOT);
console.log(hits === 0 ? `secret scan clean${HISTORY ? " (whole history)" : ""}` : `${hits} finding(s) — release blocked`);
process.exit(hits === 0 ? 0 : 1);
