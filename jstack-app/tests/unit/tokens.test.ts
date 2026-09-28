/**
 * DS-01/DS-03 — tools/gen-tokens.mjs is the source of truth for
 * theme/tokens.ts (ADR-03): a fresh run into a temp path must equal the
 * committed file byte-for-byte, every light key must have a dark
 * counterpart, and the pack README's own named values must hold.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { blur, dark, grid, light, misc, motion, pagePadPhone, radius, sizes, space, type } from "@/theme/tokens";

const ROOT = join(__dirname, "..", "..");

describe("DS-01 tools/gen-tokens.mjs regenerates theme/tokens.ts exactly", () => {
  it("a fresh run into a temp path equals the committed file", () => {
    const scratch = mkdtempSync(join(tmpdir(), "jstack-gen-tokens-"));
    const outPath = join(scratch, "tokens.ts");
    try {
      execFileSync(process.execPath, [join(ROOT, "tools", "gen-tokens.mjs"), "--out", outPath]);
      const generated = readFileSync(outPath, "utf8");
      const committed = readFileSync(join(ROOT, "theme", "tokens.ts"), "utf8");
      expect(generated).toBe(committed);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("every light key has a dark counterpart", () => {
    for (const key of Object.keys(light)) {
      expect(dark).toHaveProperty(key);
    }
    for (const key of Object.keys(dark)) {
      expect(light).toHaveProperty(key);
    }
  });

  it("the pack README's named values hold (ground, card, stat)", () => {
    expect(light.ground).toBe("#EDEBE5");
    expect(light.card).toBe("rgba(255,255,255,.58)");
    expect(type.size.stat).toBe(18);
  });

  it("DISCREPANCIES.md #3 override: habit sizes are 34/32, not the vendored CSS's 36/34", () => {
    expect(sizes.habit).toBe(34);
    expect(sizes.habitCompact).toBe(32);
  });

  it("DISCREPANCIES.md #2 override: phone page padding uses the mock/reference values", () => {
    expect(pagePadPhone.topBase).toBe(22);
    expect(pagePadPhone.sides).toBe(20);
    expect(pagePadPhone.bottom).toBe(120);
  });

  it("radius.round is a percentage, not a px number", () => {
    expect(radius.round).toBe("50%");
  });
});

describe("DS-03 the type scale in tokens.ts matches design/tokens/typography.css", () => {
  it("title, body and meta sizes match the pack", () => {
    expect(type.size.titleDesktop).toBe(32);
    expect(type.size.titlePhone).toBe(26);
    expect(type.size.body).toBe(12.5);
    expect(type.size.meta).toBe(10.5);
  });

  it("weights match the pack (regular 400, emphasis 500, wordmark 600)", () => {
    expect(type.weight.regular).toBe(400);
    expect(type.weight.emphasis).toBe(500);
    expect(type.weight.wordmark).toBe(600);
  });
});

/**
 * DS-01 proves the generator round-trips. It does NOT prove a single generated
 * value reaches a pixel — change a pack value, regenerate, and the app can sit
 * perfectly still. This build hit that four times before anyone noticed
 * (B-38 `blur.card`, B-41 the overlay frost recipe, B-56 the whole scrollbar
 * rule, A-05 `motion.pulseDuration`), and AUDIT_v2.md A-08 then found nine
 * generated tokens with no consumer at all — three of them shadowed by
 * hand-typed copies of their own values.
 *
 * So: every leaf of every exported token group must be READ somewhere outside
 * theme/tokens.ts, or be named here with a reason. The allow-list is the point
 * — it turns "nobody wired this" into a decision somebody had to write down.
 */
describe("DS-01b every generated token has a consumer", () => {
  /** Tokens with no reader today, each for a stated reason. Keep this SHORT. */
  const ALLOWED_UNUSED: Record<string, string> = {
    "sizes.labelCol":
      "the waiting row type column. The pack fixes it at 48; V2.1 overrode it to 60 because SECTION broke (DISCREPANCIES row 20), and V2.2 row C-5 replaced the fixed width with lib/labelColumn.ts, which sizes the column to the widest type present with 48 as its floor (UX-H). The token stays generated because it is the pack value; nothing reads it now, and that is the decision.",
    "motion.fast":
      "the 80ms pressed transition. RN animates imperatively, so this has no declarative home; the pressed state is an opacity swap (misc.pressedOpacity), which is applied.",
    // The four below are a different class from the rest of this list, and the
    // distinction is the whole point of the guard: a SCALE legitimately carries
    // values no screen happens to need yet, whereas a DESIGNED BEHAVIOUR nobody
    // implemented (the frost, the scrollbar, the pulse) is a bug. These are the
    // former, and they must stay generated so the scale stays the pack's.
    "motion.base": "the 160ms default transition; RN has no declarative transition property, so the animations that exist set their own durations.",
    "grid.one": "the phone's single-column `grid-template-columns`. `<Columns>` renders one column by stacking, not by a grid template, so there is nothing to feed the string to; `grid.three` and `grid.two` DO drive the desktop ratios.",
    "type.lineHeight.row": "a row line-height the components set from their own font sizes; kept generated so the scale stays the pack's."
  };

  const GROUPS = { blur, grid, misc, motion, radius, sizes, space, type };

  function leaves(prefix: string, value: unknown, out: string[]): void {
    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) leaves(`${prefix}.${k}`, v, out);
    } else {
      out.push(prefix);
    }
  }

  it("every token leaf is read outside theme/tokens.ts, or allow-listed with a reason", () => {
    const names: string[] = [];
    for (const [group, value] of Object.entries(GROUPS)) leaves(group, value, names);

    const roots = ["app", "components", "layout", "lib", "stores", "theme", "data"];
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && full !== join(ROOT, "theme", "tokens.ts")) sources.push(readFileSync(full, "utf8"));
      }
    };
    for (const r of roots) walk(join(ROOT, r));
    const haystack = sources.join("\n");
    // A leaf is "read" if its own property access appears anywhere in source.
    // Matching the FULL path would miss almost everything real: the group is
    // routinely aliased (`type as typeScale` -> `typeScale.family.body`) and
    // numeric keys are always bracketed (`space[3]`, never `space.3`). So the
    // signal is the access itself - `.pulseDuration` or `[3]` - which is loose
    // by design: this guard exists to catch a token nothing reads AT ALL, not
    // to police which module reads it.
    //
    // The looseness has one honest cost, and it is better stated than hidden:
    // a leaf whose name collides with a common method escapes the check —
    // `motion.open` reads as used because `indexedDB.open(` is in lib/. So a
    // clean run means "no token is INVISIBLE to the codebase", not "every
    // token is applied". That is still the four bugs this exists for.
    const unused = names.filter((n) => {
      const key = n.split(".").pop() as string;
      // `.open` must not be satisfied by `.openTask`, hence the trailing \b.
      const access = /^[0-9]+$/.test(key) ? new RegExp(`\\[${key}\\]`) : new RegExp(`\\.${key}\\b`);
      return !haystack.includes(n) && !access.test(haystack);
    });

    // jest's `expect` takes no message argument (that is Playwright's), so the
    // explanation rides on the asserted value — a failure names the tokens.
    const undocumented = unused.filter((n) => ALLOWED_UNUSED[n] == null);
    expect({ tokensWithNoConsumerAndNoRecordedReason: undocumented }).toEqual({ tokensWithNoConsumerAndNoRecordedReason: [] });

    // and the allow-list may not rot: an entry that IS used must be removed
    const stale = Object.keys(ALLOWED_UNUSED).filter((n) => !unused.includes(n));
    expect({ allowListedTokensThatNowHaveAConsumer: stale }).toEqual({ allowListedTokensThatNowHaveAConsumer: [] });
  });
});

/**
 * A4R2-10 — three of the design pack's "Don't" rules, as a sweep rather than
 * as a thing an auditor re-checks by hand every round.
 *
 * All three had landed in shipped source and none had a guard: a `600` weight
 * on the chosen day numeral (`Nothing is 600 except the JSTACK wordmark`), a
 * hand-rolled `borderRadius: 12` on the applied-filter chips where the pack's
 * chips are radius 8 and `theme/ui/chips.tsx` uses the token correctly, and a
 * third font family (`monospace`) in the recovery screen. There is a lint rule
 * for inline font SIZE and for colour literals, and none for these.
 */
describe("DS-02 · the pack's Don't list, swept over shipped source (A4R2-10)", () => {
  const APP_DIRS = ["app", "components", "layout", "theme", "lib", "stores", "data"];
  const sources = (): { path: string; text: string }[] => {
    const out: { path: string; text: string }[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules") continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name)) out.push({ path: relative(ROOT, full).split(sep).join("/"), text: readFileSync(full, "utf8") });
      }
    };
    for (const d of APP_DIRS) walk(join(ROOT, d));
    return out;
  };

  it("nothing is weight 600 except the wordmark", () => {
    // `theme/tokens.ts` is GENERATED and reserves `wordmark: 600` — it is the
    // one declaration of the exception, not a violation of the rule.
    const hits = sources()
      .filter((f) => f.path !== "theme/tokens.ts")
      .flatMap((f) =>
        f.text
          .split("\n")
          .map((line, i) => ({ path: f.path, line: i + 1, text: line.trim() }))
          // NOT `fontWeight:\s*"600"` — the real violation was
          // `fontWeight: chosen ? "600" : undefined`, a ternary, and a pattern
          // that demands the quote hug the colon cannot see it. Planted it
          // back and watched this pass before widening it (B-08's shape).
          .filter((l) => /fontWeight:/.test(l.text) && /["']600["']/.test(l.text) && !/wordmark/i.test(l.text)),
      );
    expect(hits.map((h) => `${h.path}:${h.line} ${h.text}`)).toEqual([]);
  });

  it("no component hand-rolls a chip radius the pack sets to 8", () => {
    const hits = sources().flatMap((f) =>
      f.text
        .split("\n")
        .map((line, i) => ({ path: f.path, line: i + 1, text: line.trim() }))
        .filter((l) => /borderRadius:\s*1[0-9]\b/.test(l.text) && /paddingVertical:\s*[2-6]\b/.test(l.text)),
    );
    expect(hits.map((h) => `${h.path}:${h.line} ${h.text}`)).toEqual([]);
  });

  it("there are two font families, not three", () => {
    const hits = sources().flatMap((f) =>
      f.text
        .split("\n")
        .map((line, i) => ({ path: f.path, line: i + 1, text: line.trim() }))
        // the VALUE position only. Widening this the way the 600 sweep above
        // was widened made it match `textAlign: "center"` sitting on the same
        // line and report six correct `fontFamily: fonts.body` lines — a sweep
        // that cries wolf gets an allow-list and then means nothing. A hard
        // family is written as a literal here (`fontFamily: "monospace"`), so
        // the literal is what this looks for, and a plant proves it.
        .filter((l) => /fontFamily:\s*["']/.test(l.text)),
    );
    expect(hits.map((h) => `${h.path}:${h.line} ${h.text}`)).toEqual([]);
  });

  it("each sweep catches a plant — otherwise their silence proves nothing", () => {
    expect(/fontWeight:/.test('fontWeight: chosen ? "600" : undefined,') && /["']600["']/.test('fontWeight: chosen ? "600" : undefined,')).toBe(true);
    expect(/fontWeight:\s*["']600["']/.test('fontWeight: "500",')).toBe(false);
    expect(/borderRadius:\s*1[0-9]\b/.test("borderRadius: 12, paddingVertical: 4") && /paddingVertical:\s*[2-6]\b/.test("borderRadius: 12, paddingVertical: 4")).toBe(true);
    expect(/fontFamily:\s*["'](?!.*typeScale)/.test('fontFamily: "monospace",')).toBe(true);
    expect(/fontFamily:\s*["'](?!.*typeScale)/.test("fontFamily: typeScale.family.body,")).toBe(false);
  });
});
