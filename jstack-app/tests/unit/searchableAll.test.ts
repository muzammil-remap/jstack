/**
 * OP-08, `02_ACCEPTANCE_TESTS_v22.md` — every "All" list (and Today's own
 * read-only "history" link, which is the same shape) is one
 * `SearchableListDialog`/`SearchableList` per route, parameterised by it;
 * the OLD, one-off `HistoryDialog` some earlier stage may have had is gone
 * or IS the shared component — there is no second, hand-rolled list+search
 * implementation anywhere in the app. Every "all" component's own header
 * already says "like every other 'all' (OP-08)"; nothing had quoted the ID
 * in a test that actually reads the source and checks.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const app = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(app, rel), "utf8");

/** every "All"/history dialog the registry (layout/dialogs.tsx) wires up */
const ALL_LIST_DIALOGS = [
  "components/today/HistoryDialog.tsx",
  "components/agents/HistoryDialog.tsx",
  "components/brain/MemoryHistoryDialog.tsx",
  "components/agents/IssuesAllDialog.tsx",
  "components/life/GoalsAllDialog.tsx",
  "components/brain/FilesArchive.tsx",
];

describe('OP-08 · every "All" list is one SearchableListDialog per route', () => {
  it.each(ALL_LIST_DIALOGS)("%s renders through the shared SearchableList(Dialog), not its own list+search", (rel) => {
    const src = read(rel);
    expect(src).toMatch(/SearchableListDialog|SearchableList\b/);
  });

  it("no OTHER component under components/ reimplements a search field + row list by hand", () => {
    // a second implementation would be a Field/TextInput feeding a FlatList/
    // map inside some OTHER file that never imports the shared primitive —
    // walk every component file once and name any that both search AND are
    // not one of the six above and not the primitive itself
    const componentsDir = join(app, "components");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name.endsWith(".tsx")) files.push(full);
      }
    };
    walk(componentsDir);

    const exempt = new Set([join(app, "components", "chrome", "SearchableListDialog.tsx"), ...ALL_LIST_DIALOGS.map((r) => join(app, r))]);
    const suspects = files.filter((f) => {
      if (exempt.has(f)) return false;
      const src = readFileSync(f, "utf8");
      // a dialog with its own search placeholder AND its own row-list map,
      // neither importing the shared primitive — the shape OP-08 forbids
      return /placeholder="Search/.test(src) && !/SearchableListDialog|SearchableList\b/.test(src);
    });
    expect(suspects.map((f) => f.slice(app.length + 1))).toEqual([]);
  });
});
