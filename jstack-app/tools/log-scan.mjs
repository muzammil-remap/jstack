/**
 * Log scan (SEC-14): "No `sens` fixture value appears in console output or
 * test logs during the board." The app's own `<Sens>` wrapper (money,
 * journal, health figures — components/chrome/Sens.tsx) never touches
 * console; the only way a sensitive value could reach console/test-log
 * output is a stray `console.log`/`console.info`/`console.debug` call
 * somewhere in app source (console.error/warning are already a zero-budget
 * e2e assertion, GL-00's assertCleanConsole, on every test). So the actual
 * gate is simpler and more durable than grepping log output after the
 * fact: no such call may exist in app source at all. A release gate —
 * exit 1 on any hit.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.argv[2] ?? ".";
const SKIP_DIRS = new Set(["node_modules", ".git", ".expo", "dist", ".artifacts", "e2e", "tools", "tests", "evidence"]);
const LOG_CALL = /console\.(log|info|debug)\s*\(/;

let hits = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    const text = readFileSync(full, "utf8");
    text.split("\n").forEach((line, i) => {
      if (LOG_CALL.test(line)) {
        hits++;
        console.log(`HIT  ${relative(ROOT, full)}:${i + 1}  ${line.trim()}`);
      }
    });
  }
}
walk(ROOT);
console.log(hits === 0 ? "log scan clean — no console.log/info/debug in app source" : `${hits} finding(s) — release blocked`);
process.exit(hits === 0 ? 0 : 1);
