/**
 * The one data path (CODEMAP §1): a component never fetches. It reads a store;
 * the store calls the adapter.
 *
 * Sixteen files under `components/` and `app/` imported `@/data/provider` when
 * the Stage 5d read reached them (F-47), and nothing said so — CT-03 guards
 * the MOCK import only. This pins the rule as it now stands: a detail dialog
 * fetches through ONE hook (`useDetail`, P-3), an archive through ONE dialog
 * (`SearchableListDialog`, P-4), and nothing else. Both directions: an importer
 * that is not listed is red, and a listed file that no longer imports is red
 * too, so the list cannot outlive the fetches it excuses (B10-02's class). The
 * count is pinned as a literal (R-01), and the scanner is proven on a temp
 * tree rather than trusted (rule 14).
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP = join(__dirname, "..", "..");

/** every `.ts`/`.tsx` under `components/` and `app/` of `root` that imports the provider */
function providerImporters(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(root, dir)).sort()) {
      const rel = `${dir}/${name}`;
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(name) && /from "@\/data\/provider"/.test(readFileSync(join(root, rel), "utf8"))) out.push(rel);
    }
  };
  for (const dir of ["components", "app"]) walk(dir);
  return out.sort();
}

/** the two places a component reaches the provider, and why each is the one */
const ALLOWED: Record<string, string> = {
  "components/detail/useDetail.ts": "the ONE detail fetch (F-68, P-3): a record by id, MISSING when it has gone",
  "components/chrome/SearchableListDialog.tsx": "the ONE archive fetch (F-55, P-4): a `source` fetched whole on open, the needle applied here",
};

describe("a component never fetches — the boundary, as it stands", () => {
  it("the only provider importers under components/ and app/ are the detail hook and the archive dialog", () => {
    const found = providerImporters(APP);
    const listed = Object.keys(ALLOWED).sort();
    expect({ unlisted: found.filter((f) => ALLOWED[f] == null), stale: listed.filter((f) => !found.includes(f)) }).toEqual({ unlisted: [], stale: [] });
    // R-01: the number, as a literal — a scan that matched nothing could not read as clean
    expect(found.length).toBe(2);
  });

  it("the scanner finds an importer under either root and ignores a file that reads a store (a temp tree)", () => {
    const root = mkdtempSync(join(tmpdir(), "jstack-boundary-"));
    mkdirSync(join(root, "components", "x"), { recursive: true });
    mkdirSync(join(root, "app"), { recursive: true });
    writeFileSync(join(root, "components", "x", "Fetches.tsx"), 'import { getAdapter } from "@/data/provider";\n');
    writeFileSync(join(root, "components", "x", "Reads.tsx"), 'import { useTasksStore } from "@/stores/tasks";\n');
    writeFileSync(join(root, "app", "index.tsx"), 'import { getAdapter } from "@/data/provider";\n');
    expect(providerImporters(root)).toEqual(["app/index.tsx", "components/x/Fetches.tsx"]);
  });
});
