/**
 * enumLabels.test.ts (Stage 5d P-5, F-56 + F-23) — every wire enum a row
 * prints has a label, and the maps are complete.
 *
 * Each union is spelled out as LITERALS here rather than derived from the
 * map (the pattern files.test.ts set for FILE_KIND_LABELS): a map checked
 * against itself proves nothing, and a new member of a union is meant to
 * fail HERE, by name, the day it is added to data/types.ts. The last case
 * walks the four files that used to carry their own copy or a fallback.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ENDPOINT_LABEL, endpointLabel, KIND_LABEL, MODE_LABEL, PERSON_LABEL, SCOPE_LABEL, VERB_LABEL, VIA_LABEL } from "@/lib/enumLabels";
import { personLabel } from "@/lib/taskMeta";

const keys = (map: Record<string, string>) => Object.keys(map).sort();

describe("LV-08 · one home for wire-enum labels (rule 21)", () => {
  it("VIA_LABEL covers ActionHistoryEntry.via, and Telegram is a proper noun (ux-review R1-12)", () => {
    expect(keys(VIA_LABEL)).toEqual(["app", "expiry", "telegram"]);
    expect(VIA_LABEL.telegram).toBe("Telegram");
  });

  it("VERB_LABEL covers ActionVerb plus the mirror's undone", () => {
    expect(keys(VERB_LABEL)).toEqual(["approve", "later", "never", "revise", "teach", "undone"]);
  });

  it("SCOPE_LABEL covers all plus every ActionKind, and MODE_LABEL both modes", () => {
    expect(keys(SCOPE_LABEL)).toEqual(["all", "bill", "opts", "parameter", "quote", "rule", "section", "triage"]);
    expect(keys(MODE_LABEL)).toEqual(["ask", "auto"]);
    expect(SCOPE_LABEL.all).toBe("Everything");
  });

  it("KIND_LABEL covers SearchKind", () => {
    expect(keys(KIND_LABEL)).toEqual(["brain", "decision", "file", "goal", "habit", "issue", "learning", "person", "reply", "rule", "subtask", "task"]);
  });

  it("PERSON_LABEL covers TaskOwner, and personLabel keeps an unknown id as it came", () => {
    expect(keys(PERSON_LABEL)).toEqual(["dev", "ea", "joce", "josh"]);
    expect(personLabel("ea")).toBe("EA");
    // inventing a name for a value nobody recognised is worse than showing it
    expect(personLabel("someone-new")).toBe("someone-new");
  });

  it("no component keeps its own copy or a fallback, and DecisionDetail prints no raw member", () => {
    const root = join(__dirname, "..", "..");
    const src = (rel: string) => readFileSync(join(root, rel), "utf8");
    // `VIA_LABEL[x] ?? x` is unreachable by type and would print the wire enum if it fired
    expect(src("components/agents/History.tsx")).not.toMatch(/VIA_LABEL\[[^\]]+\] \?\?|const VIA_LABEL/);
    expect(src("components/agents/HistoryDialog.tsx")).not.toMatch(/VIA_LABEL\[[^\]]+\] \?\?/);
    expect(src("components/settings/RulesEditDialog.tsx")).not.toMatch(/\?\? rule\.(scope|mode)/);
    expect(src("components/chrome/FindDialog.tsx")).not.toMatch(/const KIND_LABEL/);
    // F-56: `via {answered.via}` and `{answered.verb}` reached the screen as wire members
    expect(src("components/detail/DecisionDetail.tsx")).not.toMatch(/\{answered\.(via|verb)\}/);
  });
});

describe("Stage 6 A-3 · an endpoint reads as a noun on the section card (S6-07)", () => {
  it("ENDPOINT_LABEL covers every endpoint a section may name, and endpointLabel keeps an unknown one as it came", () => {
    expect(keys(ENDPOINT_LABEL)).toEqual(["/brain/replies", "/files", "/goals", "/habits", "/health", "/learning", "/life", "/money", "/people", "/usage"]);
    expect(endpointLabel("/learning")).toBe("Learning");
    expect(endpointLabel("/brain/replies")).toBe("Replies");
    // the same rule `personLabel` follows: inventing a word is worse than showing the value
    expect(endpointLabel("/somewhere-new")).toBe("/somewhere-new");
  });
});
