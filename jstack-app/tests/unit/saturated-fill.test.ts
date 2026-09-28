/**
 * B9-01 — the pack's "Never a saturated fill" is a source-level rule, so it is
 * checked at source level.
 *
 * `design/README.md`: "Never a saturated fill, never white text." `handoff.md`
 * says "outlined in alert" twice, and mock v11's `.btn.alert` sets `color` and
 * `border-color` only. But the Emergency dialog's "Lock everything now"
 * shipped as `backgroundColor: c.alert` with ink text — measured live at
 * 2.88:1 in light and 2.55:1 in dark, under even the 3:1 large-text floor.
 *
 * What makes it worth a guard rather than a one-line fix is how long it stood.
 * B-50 declared this exact defect fixed a whole stage earlier and found two of
 * the three instances: the Emergency card and its Hold-to-lock button were
 * outlined, and the dialog behind them was not. Nothing caught it because that
 * dialog sits behind a 1.2s press-and-hold and `demo/v2/` had no frame of it,
 * so eighteen rounds of visual review judged the card and never the thing it
 * opens. A rule enforced by looking is enforced only where somebody looked.
 *
 * `alert` and `ok` are the two saturated signal colours. They belong to text,
 * borders, strokes and dots — never to a filled surface with text on it.
 *
 * THIS FILE HAS BEEN CORRECTED THREE TIMES, BY BOTH REVIEWERS, ALWAYS FOR THE
 * SAME THING — the guard claiming more than it enforced:
 *
 *   R19-02  Both allow-list entries matched NOTHING. The suite passed
 *           identically with the list emptied, because `Header.tsx` writes the
 *           colour as a ternary and `Spend.tsx` uses `stroke=`, and the walk
 *           never entered `theme/`.
 *   R20-01  The exemption was per FILE, so one 6px `Track` fill excused all of
 *           `theme/ui.tsx` — the very file the previous fix had claimed to
 *           start covering.
 *   B10-02  The pattern was "a signal colour ANYWHERE after `backgroundColor:`
 *           on the same line", which over- and under-shoots at once. It missed
 *           a multi-line style object, a ternary split across lines, a spread,
 *           a variable alias, a destructured token and a renamed hook
 *           variable — and it went RED on the perfectly legal
 *           `backgroundColor: c.ground, borderColor: c.alert`, which is the
 *           outlined form the rule exists to REQUIRE. It also skipped
 *           `layout/`, the one unwalked directory that actually sets a
 *           full-screen background.
 *
 * So it now reads the VALUE rather than the line. Newlines are flattened to
 * spaces first (one byte for one byte, so offsets still map to line numbers),
 * the value is taken up to the next comma or closing brace, and a hit is any
 * `<something>.alert` / `<something>.ok` inside it — which catches `c.alert`,
 * a renamed `t.alert` and a destructured `alert` alike, across lines, and does
 * not care what else is on the line.
 *
 * Aliasing is closed separately, because no regex can follow an indirection:
 * a signal colour may not be assigned to a variable or destructured out of the
 * token object at all. There is nothing legitimate that needs to.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const app = join(__dirname, "..", "..");

/** `backgroundColor:` and its value, up to the next comma or closing brace. */
const FILL = /backgroundColor:\s*([^,}\]]*)/g;
/** A signal colour reached through any object, or bare after destructuring. */
const SIGNAL = /(?:^|[^A-Za-z0-9_$.])(?:[A-Za-z_$][A-Za-z0-9_$]*\.)?(alert|ok)(?![A-Za-z0-9_$])/;
/** Capturing a signal colour in a name, which would hide it from the above. */
const ALIAS = /(?:(?:const|let|var)\s+[A-Za-z0-9_${},\s:]*=\s*[A-Za-z_$][A-Za-z0-9_$]*\.(alert|ok)(?![A-Za-z0-9_$]))/;
const DESTRUCTURE = /(?:const|let|var)\s*\{[^}]*\b(?:alert|ok)\b[^}]*\}\s*=/;

/**
 * Every directory under `jstack-app/` that holds shipped source, discovered
 * rather than listed — the previous version named its directories by hand and
 * left out `layout/`, which is where the one full-screen background lives.
 */
function sourceDirs(): string[] {
  const skip = new Set(["node_modules", "e2e", "tests", "tools", "evidence", "design", "eslint-rules", "dist"]);
  return readdirSync(app, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !skip.has(e.name))
    .map((e) => e.name)
    .sort();
}

function sources(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, acc);
    else if (/\.tsx?$/.test(name) && !/\.(spec|test)\.tsx?$/.test(name)) acc.push(full);
  }
  return acc;
}

type Hit = { line: number; value: string };

/** Newline to space is one byte for one byte, so offsets still find lines. */
function fills(text: string): Hit[] {
  const flat = text.replace(/\n/g, " ");
  const out: Hit[] = [];
  for (const m of flat.matchAll(FILL)) {
    const value = m[1].trim();
    if (!SIGNAL.test(value)) continue;
    out.push({ line: text.slice(0, m.index).split("\n").length, value: value.slice(0, 70) });
  }
  return out;
}

/**
 * Each entry excuses ONE line, quoted, for a written reason. A dot is not a
 * surface. A bar IS its value and has nothing written on it.
 */
const ALLOWED: { file: string; line: string; why: string }[] = [
  {
    // CD-13: "width: 6, height: 6" is the dot's SIZE, not its signal colour —
    // any unrelated 6px dot elsewhere would match it too, and a failure here
    // named the allow-list rather than what it was supposed to excuse. The
    // ternary itself is what `fills()` actually captures as `hit.value` for
    // this line, and it is unique to this one expression.
    //
    // P-8 (F-41): ONE entry, because there is one line now — `HealthLine.tsx`
    // is what the rail and the phone header both render. Two entries used to
    // excuse the same ternary in Header.tsx and Rail.tsx. O-2/OF-08 had quoted
    // the offline branch too; ux-review R2-08 made that dot Muted — connectivity
    // is not an alert — and those entries matched nothing and were removed,
    // which is exactly what this test exists to notice.
    file: "components/chrome/HealthLine.tsx",
    line: 'summary.health === "degraded" ? c.alert : c.ok',
    why: "the 6px health dot the rail and the phone header share, written as a ternary — a dot, not a surface with text on it",
  },
  {
    // SY-1: the sync dot, and there is ONE entry for it because there is one
    // component — the rail's and the phone header's are the same file, which
    // is the difference between this dot and the health dot two entries above
    // that needs two. Three states, one of them the `warn` token this row
    // added, and nothing is written on any of them.
    file: "components/chrome/SyncDot.tsx",
    line: 'status === "attention" ? c.alert : status === "pending" ? c.warn : c.ok',
    why: "the 6px sync dot, in the rail and the phone header — a dot, not a surface with text on it",
  },
  {
    // S-2: Track moved from theme/ui.tsx to theme/ui/lists.tsx in the split.
    file: "theme/ui/lists.tsx",
    line: "over ? c.alert : c.accent",
    why: "the shared Track primitive, which renders no children at all — B-2 deleted Money.tsx's own copy of this bar, so this is now the only one",
  },
];

function excused(rel: string, text: string, hit: Hit): boolean {
  const lineText = text.split("\n")[hit.line - 1] ?? "";
  return ALLOWED.some((a) => a.file === rel && (lineText.includes(a.line) || hit.value.includes(a.line)));
}

describe("B9-01 no saturated signal fill behind text", () => {
  it("no source sets a background to a signal colour, except the lines the allow-list quotes", () => {
    const offenders: string[] = [];
    for (const dir of sourceDirs()) {
      for (const file of sources(join(app, dir))) {
        const rel = relative(app, file).split("\\").join("/");
        const text = readFileSync(file, "utf8");
        for (const hit of fills(text)) {
          if (!excused(rel, text, hit)) offenders.push(`${rel}:${hit.line} — backgroundColor: ${hit.value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no source captures a signal colour in a name, which would hide it from the rule above", () => {
    const offenders: string[] = [];
    for (const dir of sourceDirs()) {
      for (const file of sources(join(app, dir))) {
        const text = readFileSync(file, "utf8").replace(/\n/g, " ");
        const alias = ALIAS.exec(text);
        const destructure = DESTRUCTURE.exec(text);
        const rel = relative(app, file).split("\\").join("/");
        if (alias != null) offenders.push(`${rel} aliases c.${alias[1]}`);
        if (destructure != null) offenders.push(`${rel} destructures a signal colour`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // R19-02: an allow-list entry that matches nothing is not a permission, it
  // is a hole where a permission looks like it is. R20-01: and it must excuse
  // one line, not a file.
  it("every allow-list entry names a real file, carries a reason, and matches exactly one line", () => {
    for (const { file, line, why } of ALLOWED) {
      const full = join(app, file);
      expect(() => statSync(full)).not.toThrow();
      expect(why.length).toBeGreaterThan(20);
      const text = readFileSync(full, "utf8");
      const hits = fills(text).filter((h) => (text.split("\n")[h.line - 1] ?? "").includes(line) || h.value.includes(line));
      expect({ file, line, hits: hits.length }).toEqual({ file, line, hits: 1 });
    }
  });

  it("the walk discovers its own directories, so a new one cannot be missed", () => {
    const dirs = sourceDirs();
    // layout/ is the one B10-02 found missing from the hand-written list.
    expect(dirs).toEqual(expect.arrayContaining(["app", "components", "data", "layout", "lib", "stores", "theme"]));
  });
});
