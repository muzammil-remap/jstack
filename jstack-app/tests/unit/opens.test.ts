/**
 * OP-07 (O-1) — the guard behind "everything listed opens" (ADR-52).
 *
 * A rule about every list in the app cannot be held by remembering it. Two
 * things shipped in V2.1 because nobody could see them: rows that looked
 * tappable and were not (Find's results, Latest in), and a verb that toasted
 * "Opened" over a screen where nothing had opened. Both are the same failure —
 * a control that reports success instead of doing the thing.
 *
 * So the rule gets a registry (`layout/lists.ts`) and this walks it:
 *
 *  1. every file that renders `Row` is IN the registry — a new list is red the
 *     day it is written, not the day somebody notices;
 *  2. every entry names either what its rows open or a `static` REASON, and
 *     never both, so an omission cannot be spelled like a decision;
 *  3. every entry names a file that still exists — a stale exemption is a hole
 *     (the lesson `unused-exports`'s allow-list check already learned);
 *  4. every bound `rows` block either carries a verb or is named static, so a
 *     configured section cannot quietly become a dead list.
 *
 * The grep is proven against a planted violation, because a scan whose regex
 * has stopped matching reports a clean tree for ever (qa A-4).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { LIST_COMPONENTS } from "@/layout/lists";
import { BINDS } from "@/layout/sources";

const APP_ROOT = join(__dirname, "..", "..");
const SCOPE = ["components", "layout"];

/** matches a file that pulls the row primitive out of the UI barrel */
const IMPORTS_ROW = /\bRow\b[^;]*from "@\/theme\/ui"/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (entry.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const rel = (p: string) => p.slice(APP_ROOT.length + 1).replace(/\\/g, "/");

describe("OP-07 · every list is registered, and says how its rows open", () => {
  const listed = new Set(LIST_COMPONENTS.map((e) => e.file));

  it("every file that renders a Row is in LIST_COMPONENTS", () => {
    const rendering = SCOPE.flatMap((d) => sourceFiles(join(APP_ROOT, d)))
      .filter((f) => IMPORTS_ROW.test(readFileSync(f, "utf8")))
      .map(rel);
    // else the scan is asserting nothing
    expect(rendering.length).toBeGreaterThan(20);
    expect(rendering.filter((f) => !listed.has(f))).toEqual([]);
  });

  it("the grep catches a planted list, so a green result means something", () => {
    const planted = 'import { ListCard, Row, Txt } from "@/theme/ui";';
    expect(IMPORTS_ROW.test(planted)).toBe(true);
    // and does not fire on a file that merely says the word
    expect(IMPORTS_ROW.test("// a Row is not imported here")).toBe(false);
  });

  it("every entry names a file that exists — a stale exemption is a hole", () => {
    const missing = LIST_COMPONENTS.filter((e) => !existsSync(join(APP_ROOT, e.file))).map((e) => e.file);
    expect(missing).toEqual([]);
  });

  it("every entry says EITHER what it opens OR why it does not, never both and never neither", () => {
    const bad = LIST_COMPONENTS.filter((e) => (e.opens == null) === (e.static == null)).map((e) => e.file);
    expect(bad).toEqual([]);
  });

  it("a static reason is a sentence somebody can check, not a shrug", () => {
    // the shape the allow-list rule asks for everywhere in this build: one
    // reason, long enough to be an argument rather than a label
    const thin = LIST_COMPONENTS.filter((e) => e.static != null && e.static.trim().length < 40).map((e) => e.file);
    expect(thin).toEqual([]);
  });
});

describe("OP-07 · every bound rows block is accounted for", () => {
  /**
   * The configured half of the same rule. A `sections.json` rows block
   * resolves through `BINDS`, so a binding nobody has classified is a list
   * that might quietly have no way in — and `usage.tasks` and
   * `capabilities.list` are `rows` blocks whose names do not end in ".rows",
   * which is exactly the kind of thing a shape-based guess gets wrong.
   *
   * So the set is DECLARED. A new rows binding is red until somebody says
   * which of the two it is, which is the point.
   */
  const OPENS: Record<string, string> = {
    "people.rows": "the person's own verb — draft, nudge or done",
    "learning.rows": "`learning`, through the `open` verb O-1 gave it (OP-06)",
    "goals.rows": "`goal` — the goal detail, with its tasks, deliverables and KPIs (LG-02)",
    "usage.tasks": "the task the usage row is about (resolution #51)",
    "brain.replies": "`reply`, and opening it is what marks it read (RP-02)",
    "files.recent": "`file` — the text viewer or the Dropbox link, decided by the file rather than by the list (FL-03)",
  };
  const STATIC: Record<string, string> = {
    "capabilities.list": "each row is a statement about the build ('Spoken replies: this device's browser'), not a record — the same reason Help's rows are static",
  };

  it("every rows binding is classified, and none is classified twice", () => {
    const rowBinds = Object.entries(BINDS)
      .filter(([, b]) => b.block === "rows")
      .map(([name]) => name);
    expect(rowBinds.length).toBeGreaterThan(3);

    const unclassified = rowBinds.filter((n) => OPENS[n] == null && STATIC[n] == null);
    expect(unclassified).toEqual([]);

    const both = rowBinds.filter((n) => OPENS[n] != null && STATIC[n] != null);
    expect(both).toEqual([]);

    // and the registries name nothing that has gone away
    const stale = [...Object.keys(OPENS), ...Object.keys(STATIC)].filter((n) => !rowBinds.includes(n));
    expect(stale).toEqual([]);
  });

  it("learning.rows carries the `open` verb O-1 gave it (OP-06)", () => {
    expect(BINDS["learning.rows"].block).toBe("rows");
    // the binding is a hook, so the verb itself is asserted where it renders
    // (e2e OP-06); what is pinned here is that the published name still exists,
    // because `sections.json` refers to it by that name
    expect(BINDS["learning.rows"].endpoint).toBe("/learning");
  });
});
