/**
 * `pnpm audit`, with a reviewed allow-list (C-1, SH-07).
 *
 * `pnpm audit` on its own is a gate nobody can keep green: a transitive
 * advisory with no patched version turns the board red until somebody either
 * fixes the ecosystem or deletes the gate. Both happen, and the second one is
 * what actually happens.
 *
 * So every advisory this build has LOOKED AT and decided to accept is written
 * down in `audit-allowlist.json` with who decided and why. Anything not on
 * that list fails. And an allow-list entry that no longer matches a real
 * advisory ALSO fails — a stale exemption is how a list like this quietly
 * becomes permission for everything.
 *
 * Exit 0 and one line when clean; exit 1 naming every advisory that is not
 * accounted for.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWLIST = join(root, "audit-allowlist.json");

/** `pnpm audit --json` emits one object; a non-zero exit is normal when
 * advisories exist, so the output matters and the status does not. */
function runAudit() {
  try {
    // `--prod`: production dependencies are what ships. A high advisory in
    // a build-time tool is worth knowing about and is not the same claim.
    return execFileSync("pnpm", ["audit", "--prod", "--json"], { cwd: root, encoding: "utf8", shell: true });
  } catch (error) {
    const out = error?.stdout == null ? "" : String(error.stdout);
    if (out.trim() === "") throw error;
    return out;
  }
}

export function advisories(raw) {
  // pnpm's shape: { advisories: { "<id>": {...} }, metadata: {...} }. Older
  // versions stream one JSON object per line; handle both rather than pin a
  // version, because the whole point is to still work in six months.
  // T-1 found this reading pnpm's PRETTY-PRINTED output line by line and
  // requiring each line to be complete JSON — so nothing ever parsed, `found`
  // was always empty, and the gate printed "audit clean: 0 advisory(ies)"
  // over three real advisories for as long as it has existed. The 0 was the
  // tell, and nobody read it (B-37).
  //
  // Whole document first; the line-by-line pass below stays as the fallback
  // for the streaming shape older versions emit.
  const found = [];
  const brace = raw.indexOf("{");
  if (brace !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(brace));
      if (parsed.advisories != null) {
        for (const [id, a] of Object.entries(parsed.advisories)) {
          found.push({ id: String(id), module: a.module_name ?? a.name ?? "?", severity: a.severity ?? "?", title: a.title ?? "" });
        }
        return found;
      }
    } catch {
      // not one document — fall through to the streaming reader
    }
  }
  for (const line of raw.split("\n")) {
    const text = line.trim();
    if (text === "" || !text.startsWith("{")) continue;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    if (parsed.advisories != null) {
      for (const [id, a] of Object.entries(parsed.advisories)) {
        found.push({ id: String(id), module: a.module_name ?? a.name ?? "?", severity: a.severity ?? "?", title: a.title ?? "" });
      }
    } else if (parsed.id != null && parsed.severity != null) {
      found.push({ id: String(parsed.id), module: parsed.module_name ?? "?", severity: parsed.severity, title: parsed.title ?? "" });
    }
  }
  return found;
}

const SEVERITY_ORDER = ["info", "low", "moderate", "high", "critical"];

function main() {
  const allow = existsSync(ALLOWLIST) ? JSON.parse(readFileSync(ALLOWLIST, "utf8")) : { minimumSeverity: "high", accepted: [] };
  const floor = SEVERITY_ORDER.indexOf(allow.minimumSeverity ?? "high");
  const found = advisories(runAudit());

  const accepted = new Map((allow.accepted ?? []).map((a) => [String(a.id), a]));
  const blocking = found.filter((a) => SEVERITY_ORDER.indexOf(a.severity) >= floor && !accepted.has(a.id));
  const stale = [...accepted.keys()].filter((id) => !found.some((a) => a.id === id));

  if (blocking.length === 0 && stale.length === 0) {
    console.log(`audit clean: ${found.length} advisory(ies), ${accepted.size} accepted, none blocking at ${allow.minimumSeverity} or above`);
    process.exit(0);
  }

  for (const a of blocking) {
    console.error(`BLOCKING ${a.severity} ${a.module} (${a.id}): ${a.title}`);
    console.error(`  Fix it, or add {"id": "${a.id}", "module": "${a.module}", "why": "...", "decidedBy": "...", "decidedOn": "..."} to audit-allowlist.json`);
  }
  for (const id of stale) {
    console.error(`STALE allow-list entry ${id}: no advisory matches it any more — remove it.`);
    console.error("  A list of exemptions nobody prunes becomes permission for everything.");
  }
  process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith("audit-check.mjs")) main();
