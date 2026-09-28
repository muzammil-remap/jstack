import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
/**
 * CL-01..CL-03 — the collapsed map, and what it must never become.
 *
 * The store half of H-1. The a11y half lives in `tests/native/collapse.test.tsx`,
 * because "the triangle announces itself as a button with an expanded state"
 * is a question about a rendered tree, not about a map.
 *
 * The shape is COLLAPSED-ONLY on purpose (`{ [id]: true }`). A map of every
 * section to a boolean would have to be migrated every time a section is added
 * or renamed, and a section nobody has ever touched would carry a stored
 * opinion about itself. Everything starts open, so `{}` is the correct first
 * run — and these cases exist to stop somebody "improving" that into a map of
 * false.
 */
import * as encryptedStore from "@/lib/encryptedStore";
import { useDeviceStore } from "@/stores/device";

const reset = () => useDeviceStore.setState({ collapsed: {} });

describe("CL-01 · everything starts open", () => {
  beforeEach(reset);

  it("the map is empty on a first run, not a map of false", () => {
    expect(useDeviceStore.getState().collapsed).toEqual({});
  });

  it("hydrating with nothing stored leaves it empty", async () => {
    await encryptedStore.encryptedSet("jstack.collapsed", "");
    await useDeviceStore.getState().hydrateLocal();
    expect(useDeviceStore.getState().collapsed).toEqual({});
  });
});

describe("CL-02 · toggling", () => {
  beforeEach(reset);

  it("collapses, and collapses back open", () => {
    const { toggleCollapsed } = useDeviceStore.getState();
    toggleCollapsed("needs-you");
    expect(useDeviceStore.getState().collapsed).toEqual({ "needs-you": true });
    toggleCollapsed("needs-you");
    expect(useDeviceStore.getState().collapsed).toEqual({});
  });

  it("an open section is ABSENT, never present-and-false", () => {
    const { toggleCollapsed } = useDeviceStore.getState();
    toggleCollapsed("glance");
    toggleCollapsed("glance");
    expect(Object.keys(useDeviceStore.getState().collapsed)).toEqual([]);
    expect("glance" in useDeviceStore.getState().collapsed).toBe(false);
  });

  it("one section does not move another (CL-03)", () => {
    const { toggleCollapsed } = useDeviceStore.getState();
    toggleCollapsed("goals");
    toggleCollapsed("habits");
    toggleCollapsed("goals");
    expect(useDeviceStore.getState().collapsed).toEqual({ habits: true });
  });
});

describe("CL-03 · it survives a reload", () => {
  beforeEach(reset);

  it("what was collapsed is still collapsed after hydrating", async () => {
    useDeviceStore.getState().toggleCollapsed("agents-issues");
    useDeviceStore.getState().toggleCollapsed("memory");
    // the write is fire-and-forget so the tap is never blocked; wait for it
    // rather than race the read below
    await new Promise((r) => setTimeout(r, 0));

    reset();
    await useDeviceStore.getState().hydrateLocal();
    expect(useDeviceStore.getState().collapsed).toEqual({ "agents-issues": true, memory: true });
  });

  it("a corrupted store opens everything rather than showing a blank tab", async () => {
    for (const bad of ["not json at all", '["needs-you"]', '{"needs-you":"yes"}', "null"]) {
      await encryptedStore.encryptedSet("jstack.collapsed", bad);
      useDeviceStore.setState({ collapsed: { stale: true } });
      await useDeviceStore.getState().hydrateLocal();
      expect({ input: bad, collapsed: useDeviceStore.getState().collapsed }).toEqual({ input: bad, collapsed: {} });
    }
  });

  it("only `true` survives a read — a hand-edited store cannot smuggle a value in", async () => {
    await encryptedStore.encryptedSet("jstack.collapsed", '{"a":true,"b":1,"c":"true","d":false}');
    await useDeviceStore.getState().hydrateLocal();
    expect(useDeviceStore.getState().collapsed).toEqual({ a: true });
  });
});

/**
 * JQ-06 (Josh, 8 Sep) — "when I collapse the 'Waiting on' subheading, it hides
 * the Gantt", and the guard that keeps the class out.
 *
 * REPRODUCTION, stated plainly rather than implied: on the post-G-1 tree the
 * symptom is GONE. `e2e/core/collapse.spec.ts`'s JQ-06 case collapses Waiting on
 * with the Gantt view selected and the axis and bars are still there, at the
 * same height, at 393 and 1366 — it passed the first time it was run, before
 * any fix. Josh reviewed the mock through B-1, and G-1 rebuilt the Gantt out of
 * the section that used to contain what he was looking at: the mini "this
 * month" card lives inside Waiting on and goes with it, correctly, while the
 * FULL Gantt is its own registry section in column 1.
 *
 * The guard stays anyway, because the cause the planner predicted — two
 * headings sharing one collapse key — is real in shape even though it is not
 * present: `stores/device.ts` keys collapsed state by a plain string, so two
 * sections claiming one id would collapse together and the symptom would be
 * exactly what Josh described. H-1 already refuses the other half of it (a
 * `Label` with no `sectionId` shows no disclosure and writes no key, so a dozen
 * anonymous headings cannot pile up under `undefined`).
 */
describe("JQ-06 · one collapse key per section", () => {
  const root = join(__dirname, "..", "..");
  const files = ["components", "layout"].flatMap((d) => walk(join(root, d)));

  it("no two headings claim the same collapse id", () => {
    const seen = new Map<string, string[]>();
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/sectionId=["'{]?["']([a-z0-9-]+)["']/g)) {
        seen.set(m[1], [...(seen.get(m[1]) ?? []), file.slice(root.length + 1)]);
      }
    }
    const shared = [...seen.entries()].filter(([, where]) => new Set(where).size > 1);
    expect(shared).toEqual([]);
  });

  it("and the scan is real — it finds the ids that exist", () => {
    // a guard that matched nothing would pass the case above for ever (qa A-4)
    const all = files.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/sectionId=["'{]?["']([a-z0-9-]+)["']/g)].map((m) => m[1]));
    expect(all).toContain("waiting-on");
    expect(all.length).toBeGreaterThan(3);
  });
});

/** every .ts/.tsx under a directory, recursively. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}
