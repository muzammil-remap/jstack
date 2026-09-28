/**
 * SBOM (spec §14.9 — SEC-13): CycloneDX 1.5 JSON from the installed
 * dependency tree (pnpm ls), written to evidence/sbom.cdx.json.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tree = JSON.parse(execSync("pnpm ls --depth 10 --json --prod", { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));

const components = new Map();
function walk(deps) {
  for (const [name, info] of Object.entries(deps ?? {})) {
    const key = `${name}@${info.version}`;
    if (!components.has(key)) {
      components.set(key, {
        type: "library",
        name,
        version: info.version,
        purl: `pkg:npm/${name.replace("@", "%40")}@${info.version}`,
      });
      walk(info.dependencies);
    }
  }
}
walk(tree[0]?.dependencies);

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    component: { type: "application", name: tree[0]?.name ?? "jstack-app", version: tree[0]?.version ?? "1.1.0" },
  },
  components: [...components.values()].sort((a, b) => a.name.localeCompare(b.name)),
};
// `--out <path>` so the release workflow can drop the SBOM beside the built
// site rather than only in `evidence/` (P-1).
const outArg = process.argv.indexOf("--out");
const out = outArg === -1 ? join(root, "evidence", "sbom.cdx.json") : process.argv[outArg + 1];
writeFileSync(out, JSON.stringify(sbom, null, 2));
console.log(`${sbom.components.length} components → ${out}`);
