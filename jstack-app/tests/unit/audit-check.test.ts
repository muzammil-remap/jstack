/**
 * SH-07 (T-1) — the audit gate can see an advisory.
 *
 * It could not. `tools/audit-check.mjs` read `pnpm audit --json` LINE BY LINE
 * and required each line to be complete JSON; pnpm pretty-prints one object
 * across many lines, so nothing ever parsed, the advisory list was always
 * empty, and the gate printed "audit clean: 0 advisory(ies)" over three real
 * advisories for as long as it had existed (BUGLOG_v21.md B-37).
 *
 * The number in its own output was the tell. So the test that matters is not
 * "does it run" — it ran, and passed, every board since C-1 — but "does it
 * FIND anything", and the only way to ask that honestly is to hand it output
 * with advisories in it and check what comes back.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const TOOL = join(root, "tools", "audit-check.mjs");

/** pnpm's real shape, pretty-printed exactly as pnpm prints it. */
const PRETTY = JSON.stringify(
  {
    actions: [],
    advisories: {
      "1138808": { module_name: "image-size", severity: "high", title: "image-size: ICNS parser DoS" },
      "1119441": { module_name: "uuid", severity: "moderate", title: "uuid: something" },
    },
    metadata: { vulnerabilities: { moderate: 1, high: 1 } },
  },
  null,
  2,
);

/** and the older streaming shape, one object per line. */
const STREAMED = ['{"id":1138808,"module_name":"image-size","severity":"high","title":"x"}', '{"id":1119441,"module_name":"uuid","severity":"moderate","title":"y"}'].join("\n");

function parse(raw: string): { id: string; severity: string }[] {
  const out = execFileSync(process.execPath, ["-e", `import("file://${TOOL.split("\\").join("/")}").then((m) => { let s=""; process.stdin.on("data",(d)=>s+=d).on("end",()=>console.log(JSON.stringify(m.advisories(s)))); });`], {
    input: raw,
    encoding: "utf8",
  });
  return JSON.parse(out.trim()) as { id: string; severity: string }[];
}

describe("SH-02 / SH-07 · the audit gate can see an advisory, and refuses a high it has not reviewed", () => {
  it("reads pnpm's pretty-printed output — the shape that defeated it", () => {
    const found = parse(PRETTY);
    expect(found.map((a) => a.id).sort()).toEqual(["1119441", "1138808"]);
    expect(found.find((a) => a.id === "1138808")?.severity).toBe("high");
  });

  it("still reads the older one-object-per-line shape", () => {
    expect(parse(STREAMED).map((a) => a.id).sort()).toEqual(["1119441", "1138808"]);
  });

  it("finds nothing in output that genuinely has nothing", () => {
    expect(parse(JSON.stringify({ actions: [], advisories: {}, metadata: {} }, null, 2))).toEqual([]);
  });

  it("every allow-list entry carries a reason, a decider and a date", () => {
    // an exemption without those three is an exemption nobody can review,
    // and a list of those becomes permission for everything
    const allow = JSON.parse(readFileSync(join(root, "audit-allowlist.json"), "utf8")) as {
      accepted: { id: string; why: string; decidedBy: string; decidedOn: string }[];
    };
    for (const a of allow.accepted) {
      expect({ id: a.id, hasWhy: a.why.length > 80, hasWho: a.decidedBy.length > 0, hasWhen: /^\d{4}-\d{2}-\d{2}$/.test(a.decidedOn) }).toEqual({
        id: a.id,
        hasWhy: true,
        hasWho: true,
        hasWhen: true,
      });
    }
  });
});
