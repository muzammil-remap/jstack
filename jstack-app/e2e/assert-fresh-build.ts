/**
 * The e2e suite refuses to run against a bundle that is not this source (B-03).
 *
 * `playwright.config.ts` serves `~/.jstack-dist` — a PREBUILT export — and
 * nothing in the run rebuilds it. So editing a component and running the suite
 * exercises the previous build and reports green, which is not a weaker signal
 * than no signal: it is a false one. Four V2.2 rows were reported green against
 * a bundle built before any of them existed, and those runs only became
 * evidence when the bundle was rebuilt and they were run again.
 *
 * This is QA-06's rule one layer down: the capture rig already "asserts the
 * port serves the build it expects before the first frame" (rule 22), and an
 * e2e run deserves the same.
 *
 * Compared by CONTENT, never by mtime: `pnpm codemap` rewrites generated files
 * with byte-identical output on every commit, and an mtime check called that a
 * stale bundle. A guard that cries wolf gets switched off.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sourceFingerprint } = require("../tools/source-fingerprint.mjs") as { sourceFingerprint: (root: string) => { hash: string; files: number } };

export default function assertFreshBuild(): void {
  const app = join(__dirname, "..");
  const dist = process.env.JSTACK_DIST ?? join(homedir(), ".jstack-dist");
  const stamp = join(dist, ".jstack-source.json");

  if (!existsSync(join(dist, "index.html"))) {
    throw new Error(`e2e: no test export at ${dist}. Run \`node tools/build-web.mjs\` first — the suite serves a prebuilt bundle and does not build one.`);
  }

  if (!existsSync(stamp)) {
    throw new Error(
      [`e2e: the export at ${dist} carries no source fingerprint, so it predates this guard and cannot be trusted (B-03).`, "", "Run `node tools/build-web.mjs` and try again."].join("\n"),
    );
  }

  const built = JSON.parse(readFileSync(stamp, "utf8")) as { hash: string; files: number; at: string };
  const now = sourceFingerprint(app);

  if (built.hash !== now.hash) {
    throw new Error(
      [
        `e2e: the bundle at ${dist} was built from different source than the tree.`,
        `  built:   ${built.hash.slice(0, 12)} (${built.files} files, ${built.at})`,
        `  working: ${now.hash.slice(0, 12)} (${now.files} files)`,
        "",
        "The suite serves a PREBUILT export and never builds one, so running now",
        "would test the previous build and report green for changes it has never",
        "seen (B-03).",
        "",
        "Run `node tools/build-web.mjs` and try again.",
      ].join("\n"),
    );
  }
}
