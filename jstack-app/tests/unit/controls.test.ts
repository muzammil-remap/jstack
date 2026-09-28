/**
 * QA-01 — `CONTROLS_v2.md` (repo root) cannot drift from the shipped app.
 * Two-directional guard: every testID documented in the file exists in
 * source, and every interactive-primitive testID in source is documented
 * in the file. Ported from v1.2's `tests/unit/controls.test.ts` (retired
 * row 1, `chore(v2): retire the v1.2 UI layer`), adapted to v2's own
 * primitive vocabulary (`theme/ui.tsx`: Btn/BtnPrimary/BtnSm/IconBtn/
 * Switch/Chip/Seg/Checkbox/HabitChip/Tag/FieldButton/Field) and its
 * Dialog/Sheet `${testID}-close`/`-scrim` forwarding pattern.
 *
 * Field and Switch are inherently interactive by their required props
 * (`onChangeText`, `onValueChange`) — no `onPress` scan needed for those
 * two; every other tag below is only counted when an `onPress` appears in
 * its own opening-tag window, so a testID on a Checkbox/Pressable with no
 * handler wired (TaskDetail's `subtask-cb-${id}`, LockedScreen's plain
 * `View` `unlock-btn`) correctly finds nothing to flag, matching
 * CONTROLS_v2.md's own documented exclusions for both.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");
const CONTROLS = readFileSync(join(APP_ROOT, "..", "history", "v2", "CONTROLS_v2.md"), "utf8");

function allSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "dist", ".expo", "e2e", "tests"].includes(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...allSourceFiles(p));
    else if (/\.tsx$/.test(entry)) out.push(p);
  }
  return out;
}

const SOURCE = allSourceFiles(APP_ROOT)
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

type Entry = { literal: string; isTemplate: boolean; staticPrefix: string };

function toEntry(literal: string): Entry {
  const isTemplate = literal.includes("${");
  return { literal, isTemplate, staticPrefix: isTemplate ? literal.split("${")[0] : literal };
}

/** true when a documented testID and a source testID could plausibly name
 * the same control: identical literals, or (when either side is a
 * template) one's static prefix leads the other's. A template with an
 * empty static prefix carries no usable signal and never counts. */
function compatible(a: Entry, b: Entry): boolean {
  if (!a.isTemplate && !b.isTemplate) return a.literal === b.literal;
  const pa = a.isTemplate ? a.staticPrefix : a.literal;
  const pb = b.isTemplate ? b.staticPrefix : b.literal;
  if (!pa || !pb) return false;
  return pa.startsWith(pb) || pb.startsWith(pa);
}

/** every backtick-quoted testID token in CONTROLS_v2.md's `| testID |
 * Effect | Test |` tables — cells sometimes list several separated by
 * " / " (e.g. `tab-today` / `tab-tasks` / ...), each is its own token.
 * Only harvests rows belonging to a table whose OWN header reads
 * `testID` in its first column — the file's one non-testID table (§10's
 * `| Root modal/sheet key | Component | Documented in |` cross-reference,
 * listing state values like `talk`/`trends`/`devices`, not testIDs) is
 * correctly skipped by this rather than mistaken for one. */
function documentedTestIds(): Entry[] {
  const out: Entry[] = [];
  const re = /`([a-zA-Z][^`]*)`/g;
  let inTestIdTable = false;
  for (const line of CONTROLS.split("\n")) {
    if (!line.startsWith("|")) {
      inTestIdTable = false;
      continue;
    }
    if (/^\|\s*testID\s*\|/i.test(line)) {
      inTestIdTable = true;
      continue;
    }
    if (/^\|\s*-{2,}\s*\|/.test(line)) continue; // the header's own separator row
    if (!inTestIdTable) continue;
    const testIdCell = line.split("|")[1] ?? "";
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(testIdCell)) !== null) out.push(toEntry(m[1]));
  }
  return out;
}

/** the value bound to testID= at one JSX opening tag — plain/braced
 * string, backtick template, or `cond ? `a` : `b`` (Dialog/Sheet's
 * default `testID = "dialog"` param never appears as a JSX attribute, so
 * that shape doesn't arise here, but the ternary form still covers any
 * call site that computes its own testID conditionally). */
const VALUE_RE = /testID=\{?\s*(?:[a-zA-Z0-9_.]+\s*\?\s*)?(?:`([^`]+)`|"([^"]+)")/;
/** true when `window` (the JSX tag body being examined) carries an onPress
 * prop of its own — used to gate the press-based primitives below. As an
 * attribute (`onPress=`) or inside a spread (`{...(ok ? { onPress: … } :
 * { disabledReason: … })}`), the idiom every control with a stated reason
 * uses: read as the attribute alone, it hid sixteen controls from the
 * source→doc direction below, six of them Needs you's verbs (B-245). */
const HAS_ONPRESS = /\bonPress\s*[=:]/;

function scanTags(tagOpenRe: RegExp, requireOnPress: boolean): Entry[] {
  const out: Entry[] = [];
  let m: RegExpExecArray | null;
  tagOpenRe.lastIndex = 0;
  while ((m = tagOpenRe.exec(SOURCE)) !== null) {
    const window = SOURCE.slice(m.index, m.index + 3000).replace(/=>/g, "  ");
    const closeMatch = /\/?>/.exec(window);
    const body = closeMatch ? window.slice(0, closeMatch.index + closeMatch[0].length) : window;
    if (requireOnPress && !HAS_ONPRESS.test(body)) continue;
    const idMatch = VALUE_RE.exec(body);
    if (!idMatch) continue;
    out.push(toEntry(idMatch[1] ?? idMatch[2]));
  }
  return out;
}

/**
 * B-2: four of Life's sections have no component file any more — they are
 * config records rendered by `layout/SectionRenderer.tsx`, whose testIDs are
 * DERIVED (`{tab}-{id}-section`, `{id}-configure`, `{idPrefix}-{rowId}`). A
 * grep for string literals cannot see them, so this expands the shipped
 * fixture through the renderer's own naming rules.
 *
 * This is not a test deriving its expectation from the thing it checks
 * (hard rule 11): the ids exist because the fixture and the rules exist, and
 * `tests/native/sections.test.tsx` proves the renderer emits exactly these
 * by looking them up in a real rendered tree. Here they only ever explain
 * away a DOCUMENTED id — never to require one.
 */
type FixtureSection = { id: string; tab: string; configure?: boolean; verb?: { label: string; action: string }; blocks: { type: string; idPrefix?: string }[] };

function configuredSectionIds(): Entry[] {
  const configs = JSON.parse(readFileSync(join(APP_ROOT, "data", "mock", "fixtures", "sections.json"), "utf8")) as FixtureSection[];
  const ID = "${id}";
  const out: string[] = [];
  for (const c of configs) {
    out.push(`${c.tab}-${c.id}-section`);
    if (c.configure) out.push(`${c.id}-configure`);
    // T-4: the section-level verb, the same standing as `-configure` — derived
    // by `SectionRenderer` from the config, and `tests/native/sections.test.tsx`
    // proves the rendered tree carries it with the config's own label.
    if (c.verb != null) out.push(`${c.id}-verb`);
    for (const b of c.blocks) {
      const p = b.idPrefix;
      if (p == null) continue;
      if (b.type === "ghost") out.push(`${p}-ghost`);
      else if (b.type === "bars") out.push(`${p}-row-${ID}`, `${p}-amount-${ID}`);
      else if (b.type === "rows") out.push(`${p}-${ID}`, `${p}-act-${ID}`);
      else if (b.type === "grid") out.push(`${p}-${ID}`, `${p}-open-${ID}`);
      else out.push(`${p}-${ID}`);
    }
  }
  return out.map(toEntry);
}

/**
 * S-3: the focus editor became a config over \`ChipSetEditDialog\`, whose every
 * testID is derived from one \`prefix\` prop (\`focus\` → \`focus-edit-row-\${id}\`,
 * \`focus-name\`, \`focus-silo-work\`). A grep for string literals cannot see them,
 * for the same reason it cannot see the configured sections' — so they are
 * expanded here through the component's own naming rules.
 *
 * Same standing as \`configuredSectionIds\` (hard rule 11): the ids exist because
 * the component and its config exist, \`e2e/core/focus.spec.ts\` and
 * \`settings.spec.ts\` prove the rendered tree really carries them, and this only
 * ever explains away a DOCUMENTED id — never requires one.
 */
function chipSetIds(): Entry[] {
  const ID = "${id}";
  const out: string[] = [];
  for (const file of allSourceFiles(APP_ROOT)) {
    const text = readFileSync(file, "utf8");
    if (!text.includes("<ChipSetEditDialog")) continue;
    for (const m of text.matchAll(/prefix="([a-z-]+)"/g)) {
      const p = m[1];
      out.push(`${p}-edit-dialog`, `${p}-add-open`, `${p}-form`, `${p}-save`, `${p}-cancel`);
      out.push(`${p}-edit-row-${ID}`, `${p}-edit-open-${ID}`, `${p}-remove-${ID}`);
      // one entry per configured field: a text field is {p}-{field}, a
      // checklist is {p}-{field}-{option}
      // `\s*$` rather than `,$`: this tree checks out CRLF (B-07), and a
      // carriage return sits between the comma and the line end
      for (const f of text.matchAll(/^\s*id: "([a-z-]+)",\s*$/gm)) out.push(`${p}-${f[1]}`, `${p}-${f[1]}-${ID}`);
    }
  }
  return out.map(toEntry);
}


/**
 * S-4: the two decision histories and Done are one component now, and their
 * testIDs are passed in as props rather than written as `testID=` literals —
 * so the same grep that could not see the chip-set ids cannot see these.
 * Expanded the same way, and with the same standing: `agents.spec.ts`,
 * `decisions.spec.ts` and `tasks.spec.ts` prove the rendered tree carries them.
 */
function searchableListIds(): Entry[] {
  const out: string[] = [];
  for (const file of allSourceFiles(APP_ROOT)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/<SearchableListDialog[\s\S]*?testID="([a-z-]+)"/g)) {
      const p = m[1];
      out.push(`${p}-dialog`, `${p}-search`, `${p}-rows`);
    }
    for (const m of text.matchAll(/(?:searchTestID|listTestID)="([a-z-]+)"/g)) out.push(m[1]);
  }
  return out.map(toEntry);
}
// QA-01's automated scope: v2's own interactive-primitive vocabulary
// (CONTROLS_v2.md's own scope paragraph). Field/Switch are inherently
// interactive by their required onChangeText/onValueChange prop, so they
// scan without an onPress gate; every other tag needs one found in its
// own opening-tag window.
const PRESS_TAGS = /<(?:Btn|BtnPrimary|BtnSm|IconBtn|Chip|Seg|Checkbox|HabitChip|Tag|FieldButton|Pressable)\b/g;
const ALWAYS_INTERACTIVE_TAGS = /<(?:Field|Switch)\b/g;
const interactiveInSource = [...scanTags(PRESS_TAGS, true), ...scanTags(ALWAYS_INTERACTIVE_TAGS, false)];
// Broader — every testID-bearing tag, any component — used only as a
// doc→source existence fallback, since CONTROLS_v2.md documents a few
// controls beyond this exact tag list (e.g. a bare <Text onPress=...>).
const anyTagInSource = [...scanTags(/<[A-Za-z][\w.]*\b/g, false), ...configuredSectionIds(), ...chipSetIds(), ...searchableListIds()];

/** reconstructs Dialog.tsx/Sheet.tsx's per-instance `${testID}-close` /
 * `${testID}-scrim` forwarding: every literal testID seen anywhere,
 * crossed with every such suffix seen anywhere. A generous cross product
 * is safe — only ever used to explain away a documented literal, never to
 * require one. */
function reconstructForwardedIds(): Set<string> {
  const suffixes = new Set(
    anyTagInSource
      .filter((e) => e.isTemplate && e.staticPrefix === "" && /^\$\{[a-zA-Z0-9_.]+\}-/.test(e.literal))
      .map((e) => e.literal.replace(/^\$\{[a-zA-Z0-9_.]+\}/, "")),
  );
  const bases = new Set(anyTagInSource.filter((e) => !e.isTemplate).map((e) => e.literal));
  const out = new Set<string>();
  for (const base of bases) for (const suf of suffixes) out.add(base + suf);
  return out;
}

describe("QA-01 CONTROLS_v2.md matches shipped source (both directions)", () => {
  const documented = documentedTestIds();
  const reconstructed = reconstructForwardedIds();

  it("documents a substantial number of controls", () => {
    expect(documented.length).toBeGreaterThan(150);
  });

  describe("every documented testID exists in source", () => {
    it.each(documented)("$literal", (entry) => {
      const found = anyTagInSource.some((s) => compatible(s, entry)) || (!entry.isTemplate && reconstructed.has(entry.literal));
      expect({ literal: entry.literal, found }).toEqual({ literal: entry.literal, found: true });
    });
  });

  describe("every interactive-primitive testID in source is documented", () => {
    // a bare `${testID}-suffix` line (empty static prefix) names no real
    // control by itself — see file header. Per-instance values are still
    // covered, via reconstruction, by the doc→source direction above.
    const checkable = interactiveInSource.filter((e) => !(e.isTemplate && e.staticPrefix === ""));

    it("found a substantial number of interactive controls in source", () => {
      expect(interactiveInSource.length).toBeGreaterThan(100);
    });

    it.each(checkable)("$literal", (entry) => {
      const documentedHere = documented.some((d) => compatible(d, entry));
      expect({ literal: entry.literal, documentedHere }).toEqual({ literal: entry.literal, documentedHere: true });
    });
  });
});
