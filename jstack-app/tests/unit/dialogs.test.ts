/**
 * SM-05 — the dialog registry is the whole list, and it is in the right
 * order.
 *
 * The most valuable test here is the last one. `session.modal` is a plain
 * string, so `openModal("rules-al")` type-checks, lints clean, and opens
 * nothing at all — the control looks dead and there is no error anywhere.
 * That was survivable while `app/_layout.tsx` listed every name inline
 * beside its component; with the list moved to a registry it needs a guard,
 * so this walks the real source for every `openModal`/`openSheet` call and
 * checks the name against the registry.
 *
 * The ordering assertions are literal positions rather than a re-derivation
 * of the array (hard rule 11): asserting "settings comes before devices" by
 * reading both indexes out of the same array proves only that the array
 * equals itself. Each one below states the defect it exists to prevent.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DIALOGS, MODAL_NAMES, SHEET_NAMES, screenDialogOpenIn, type DialogEntry } from "@/layout/dialogs";
import { optionalPayload, packPayload, SURFACE_WIDTH, unpackPayload } from "@/layout/dialogKit";

const root = join(__dirname, "..", "..");

const at = (name: string) => DIALOGS.findIndex((d) => d.name === name);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...walk(rel));
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

describe("SM-05 · the dialog registry", () => {
  it("a `screen`-kind entry renders inside ScreenSurface — the kind covers the viewport, not the component (ux-review R1-01)", () => {
    const screens = DIALOGS.filter((d) => d.kind === "screen");
    expect(screens.map((d) => d.name)).toEqual(["find-phone", "talk"]);
    // EVERY screen, not the first one: with two entries, asserting index 0
    // would have left the second free to render bare — which is exactly the
    // defect ux-review R1-01 found on the first.
    for (const screen of screens) {
      const el = screen.render("", () => {});
      // by name rather than by import, so this test can be red before the
      // surface exists and green only once the registry wraps with it
      expect((el.type as { name?: string }).name).toBe("ScreenSurface");
    }
  });

  it("every entry has a unique name and a real component", () => {
    expect(DIALOGS.length).toBeGreaterThan(20);
    const names = DIALOGS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    for (const d of DIALOGS) {
      expect(typeof d.component).toBe("function");
      expect(typeof d.render).toBe("function");
    }
  });

  it("exactly one settings entry, and exactly one task entry", () => {
    expect(DIALOGS.filter((d) => d.source === "settings").map((d) => d.name)).toEqual(["settings"]);
    expect(DIALOGS.filter((d) => d.source === "task").map((d) => d.name)).toEqual(["task"]);
  });

  it("the sheets are teach, talk and the task card's two choosers", () => {
    // T-2 added `delegate-picker` and `subtask-menu` (§4's expectation record).
    // Still exact, and deliberately so: a third sheet added carelessly fails
    // here, which is the whole reason this case lists them rather than counts.
    expect(SHEET_NAMES).toEqual(["delegate-picker", "subtask-menu", "teach", "talk"]);
  });

  // B-15: devices, focus-edit and emergency-confirm are each opened FROM
  // WITHIN the settings sheet. Before settings in the array means behind it
  // on the screen — DOM order is stacking order, there is no z-index.
  it("the three dialogs opened from inside Settings render after it (B-15)", () => {
    for (const name of ["devices", "focus-edit", "emergency-confirm"]) {
      expect(at(name)).toBeGreaterThan(at("settings"));
    }
  });

  // The same rule generalised: external-link and teach can each be opened
  // from inside an already-open dialog, so nothing may paint over them.
  it("external-link, teach and talk are the last three (B-14's lesson)", () => {
    expect(DIALOGS.slice(-3).map((d) => d.name)).toEqual(["external-link", "teach", "talk"]);
  });

  it("a dialog that edits something declares that it needs a payload", () => {
    // ST-1: `rule-edit` is gone with Brain's Rules section. Its replacement,
    // `rules-edit`, is NOT here — it opens both ways, with an id to edit one
    // rule and with nothing to open the list, exactly as `slicer-edit`,
    // `goal-edit`, `habit-edit` and `focus-edit` do.
    for (const name of ["revise-card", "item-editor", "proposal-edit", "life-config", "external-link", "task"]) {
      expect(DIALOGS[at(name)].requiresPayload).toBe(true);
    }
    // and one that does not, so the assertion above is not vacuous
    expect(DIALOGS[at("help")].requiresPayload).toBe(false);
  });

  it("Talk and the phone's Find are the app's two `screen`s, and opening one hides the rail and tab bar", () => {
    // S-3 wrote the kind and this test asserted nothing claimed it yet; V-2's
    // TalkScreen was the first, so the assertion inverted rather than being
    // deleted — the count matters as much as the mechanism, because a second
    // full-screen surface is a design decision, not a registry entry. K-1 is
    // that decision, made once and written down here (GS-03): a phone has no
    // rail, and Find on a phone is the screen, not a modal over the tab bar.
    expect(DIALOGS.filter((d) => d.kind === "screen").map((d) => d.name)).toEqual(["find-phone", "talk"]);
    expect(screenDialogOpenIn(DIALOGS, { modal: "find-phone", sheet: null })).toBe(true);
    // and the DESKTOP entry is not one: `find` is a modal, so the rail stays
    expect(screenDialogOpenIn(DIALOGS, { modal: "find", sheet: null })).toBe(false);
    expect(screenDialogOpenIn(DIALOGS, { modal: null, sheet: "talk" })).toBe(true);
    expect(screenDialogOpenIn(DIALOGS, { modal: "help", sheet: "teach" })).toBe(false);

    const stub = { name: "elsewhere", kind: "screen", source: "modal" } as DialogEntry;
    expect(screenDialogOpenIn([stub], { modal: "elsewhere" })).toBe(true);
    expect(screenDialogOpenIn([stub], { modal: "help" })).toBe(false);
  });

  it("every openModal/openSheet in the source names a dialog that exists", () => {
    const files = [...walk("components"), ...walk("app"), ...walk("layout"), ...walk("stores"), ...walk("lib")];
    const bad: string[] = [];
    let found = 0;
    for (const rel of files) {
      const src = readFileSync(join(root, rel), "utf8");
      for (const [, fn, name] of src.matchAll(/\bopen(Modal|Sheet)\(\s*"([^"]+)"/g)) {
        found++;
        const list = fn === "Modal" ? MODAL_NAMES : SHEET_NAMES;
        if (!list.includes(name)) bad.push(`${rel}: open${fn}("${name}")`);
      }
    }
    // guard the guard — a walker that finds nothing would pass silently
    expect(found).toBeGreaterThan(10);
    expect(bad).toEqual([]);
  });

  it("no entry is an alias of another — one component wears one name per kind (F-29, P-6)", () => {
    // `brain-chat` was `brain-dictate` under a second name "for one release";
    // V2.2 is that release. Find is legitimately two entries — a modal on a
    // desktop and a screen on a phone — which is why the key includes the kind.
    // by the component's IDENTITY, not its name — `history` and `agents-history`
    // are two components that are both called HistoryDialog
    const aliases = DIALOGS.filter((d) => DIALOGS.some((o) => o !== d && o.component === d.component && o.kind === d.kind)).map((d) => d.name);
    expect(aliases).toEqual([]);
  });

  it("optionalPayload maps the store's empty string to an absent payload (F-31)", () => {
    expect(optionalPayload("")).toEqual({ payload: undefined });
    expect(optionalPayload("new")).toEqual({ payload: "new" });
  });

  it("packPayload/unpackPayload is the one codec for a payload with two parts (F-63)", () => {
    expect(unpackPayload(packPayload("https://x.test/a", "The label"))).toEqual(["https://x.test/a", "The label"]);
    // a missing part packs as nothing and unpacks as nothing — a label that
    // is undefined must not become the word "undefined" on a button
    expect(packPayload(undefined, "Twenty")).toBe("|Twenty");
    expect(unpackPayload(undefined)).toEqual([""]);
  });

  it("no site packs a payload by hand — every url|label goes through packPayload (F-63)", () => {
    const files = [...walk("components"), ...walk("app"), ...walk("layout"), ...walk("stores"), ...walk("lib")];
    const bad: string[] = [];
    for (const rel of files) {
      const src = readFileSync(join(root, rel), "utf8");
      // an opener handed a template literal with a `|` in it — the separator
      // the codec owns; `\s*` after the comma so a Prettier-wrapped call is seen
      if (/\bopen(Modal|Sheet)\(\s*"[^"]+",\s*`[^`]*\|[^`]*`/.test(src)) bad.push(rel);
    }
    expect(bad).toEqual([]);
  });
});

/**
 * JQ-02 (Josh, 8 Sep) — the delegate picker's surface depends on the device.
 *
 * The registry is where that fact lives, so it is where it is asserted: a
 * component that quietly rendered a Dialog while its entry still said "sheet"
 * would be a registry that had stopped describing the app.
 */
describe("JQ-02 · a chooser can wear a different surface on a desktop", () => {
  it("delegate-picker is a sheet on the phone and a modal on a desktop", () => {
    const entry = DIALOGS.find((d) => d.name === "delegate-picker");
    expect({ kind: entry?.kind, desktopKind: entry?.desktopKind }).toEqual({ kind: "sheet", desktopKind: "modal" });
  });

  it("and it is the ONLY entry that does — a second one is a pattern, not an exception", () => {
    // if this ever fails, the answer is probably a `Surface` primitive rather
    // than a third component branching on `phone` by hand
    expect(DIALOGS.filter((d) => d.desktopKind != null).map((d) => d.name)).toEqual(["delegate-picker"]);
  });
});

/**
 * S6-26 (ux round, Stage 6) — every dialog in the app was 900 px wide,
 * regardless of what was in it: a one-sentence completion confirm and a
 * nine-card grid wore the same slab, and the pack sets `max-width: 900` for
 * the SETTINGS SHEET specifically (README Components), not for every dialog.
 *
 * A width is a property of a surface KIND, so it is one table and one word
 * on the registry entry — never a number in a dialog's own file. The three
 * literals are asserted as literals (hard rule 11): a test that read them
 * back out of the table would prove the table equals itself.
 */
describe("S6-26 · a dialog is the width of its surface kind, from one table", () => {
  it("the table is three literals, and the registry declares the confirms, the four panels inside Settings and the two sheets", () => {
    expect(SURFACE_WIDTH).toEqual({ confirm: 480, panel: 640, sheet: 900 });
    const declared = Object.fromEntries(DIALOGS.filter((d) => d.surface != null).map((d) => [d.name, d.surface]));
    expect(declared).toEqual({
      // a question and two buttons
      "complete-confirm": "confirm",
      "emergency-confirm": "confirm",
      "external-link": "confirm",
      // opened INSIDE the Settings sheet — at its 900 they were a band cut out
      // of it (S6-05); B-15 is why they sit after it in the registry
      devices: "panel",
      sync: "panel",
      "focus-edit": "panel",
      "rules-edit": "panel",
      // the pack's 900 by name: the Settings sheet, and the task card, which
      // is the one record with sections of its own and was measured at that
      // width (JQ-01)
      settings: "sheet",
      task: "sheet",
    });
    // everything else takes the default — RL-06's recorded 66vw / 900, which
    // `e2e/matrix/layout.spec.ts` measures on Help. The ux round's `panel`
    // for all of them waits on that row (`layout/dialogKit.tsx`).
    expect(DIALOGS.filter((d) => d.surface == null).length).toBeGreaterThan(30);
  });
});
