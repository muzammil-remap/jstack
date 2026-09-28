/**
 * DS-04 — components/chrome/icons.generated.ts holds every name in
 * design/tokens.json's iconName block plus the mock's extras, each with a
 * plain `d` (and a `fillD` where the glyph has a filled variant).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ICONS } from "@/components/chrome/icons.generated";

const ROOT = join(__dirname, "..", "..");

function readIconNames(): Record<string, string> {
  const json = JSON.parse(readFileSync(join(ROOT, "design", "tokens.json"), "utf8")) as {
    iconName: Record<string, { $value: string }>;
  };
  return Object.fromEntries(Object.entries(json.iconName).map(([k, v]) => [k, v.$value]));
}

const EXTRA_NAMES = [
  "chevron_left",
  "check",
  "close",
  "edit",
  "arrow_upward",
  "arrow_downward",
  "arrow_forward",
  "keyboard_arrow_down", // stands in for expand_more (BUGLOG_v2.md A-05)
  "light_mode",
  "search",
  "keyboard",
  "mic",
];

describe("DS-04 icons.generated.ts holds every iconNames entry plus the mock's extras", () => {
  it("every design/tokens.json iconName value has an entry with a plain d and a viewBox", () => {
    for (const name of Object.values(readIconNames())) {
      expect(ICONS).toHaveProperty(name);
      expect(typeof ICONS[name].d).toBe("string");
      expect(ICONS[name].d.length).toBeGreaterThan(0);
      expect(typeof ICONS[name].viewBox).toBe("string");
    }
  });

  it("every mock extra name has an entry", () => {
    for (const name of EXTRA_NAMES) {
      expect(ICONS).toHaveProperty(name);
    }
  });

  it("chevron_right (the active-tab / selected-state glyph family) has a fill variant", () => {
    expect(ICONS.chevron_right.fillD).toBeDefined();
  });

  it("a fresh gen-icons.mjs run into a temp path equals the committed file", () => {
    const scratch = mkdtempSync(join(tmpdir(), "jstack-gen-icons-"));
    const outPath = join(scratch, "icons.generated.ts");
    try {
      execFileSync(process.execPath, [join(ROOT, "tools", "gen-icons.mjs"), "--out", outPath]);
      const generated = readFileSync(outPath, "utf8");
      const committed = readFileSync(join(ROOT, "components", "chrome", "icons.generated.ts"), "utf8");
      expect(generated).toBe(committed);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
