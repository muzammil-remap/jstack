/**
 * A content fingerprint of everything the web export is built from (B-03).
 *
 * `tools/build-web.mjs` writes it into the export; `e2e/assert-fresh-build.ts`
 * recomputes it and refuses to run the suite when the two disagree.
 *
 * CONTENT, not mtimes. `pnpm codemap` rewrites generated files like
 * `data/requestSchemas.json` on every commit with byte-identical output, and
 * an mtime comparison called that a stale bundle and sent the reader off to
 * rebuild for nothing. A guard that cries wolf gets switched off, and this one
 * is the only thing standing between a source edit and a green run that never
 * saw it.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

/** the directories metro actually bundles from. Not exported: `sourceFingerprint`
 * is the whole interface, and CT-06 refuses an export nothing imports. */
const SOURCE_DIRS = ["app", "components", "layout", "lib", "stores", "theme", "data", "public"];

/** The two scripts that decide what an export and a mock CONTAIN. QA-06's
 * original source list named them for the same reason: a change here alters
 * the artefact without touching a line the directories above would notice. */
const SOURCE_FILES = ["tools/build-web.mjs", "tools/build-mock.mjs", "tools/sw-precache.mjs", "tools/vendor-fonts.mjs"];

/**
 * CRLF and LF are the same source (B-07).
 *
 * `.gitattributes` says `* text=auto eol=lf`, but this machine has
 * `core.autocrlf=true` and its working tree is full of CRLF anyway — so a
 * byte-for-byte hash computed here never matches the same commit checked out
 * on Linux, and the guard reported a stale mock on every CI run while being
 * green locally. A fingerprint that depends on the checkout is not a
 * fingerprint of the source.
 *
 * Text is detected by looking for a NUL byte rather than by extension: an
 * extension list is a second copy of `.gitattributes`, and it would be wrong
 * the first time somebody adds a format nobody listed.
 */
function normalise(buffer) {
  const head = buffer.subarray(0, 8192);
  if (head.includes(0)) return buffer; // binary — fonts, images
  return Buffer.from(buffer.toString("utf8").split("\r\n").join("\n"), "utf8");
}

export function sourceFingerprint(appRoot) {
  const hash = createHash("sha256");
  const files = [];

  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // a directory that does not exist contributes nothing
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (statSync(p).isFile()) files.push(p);
    }
  };

  for (const dir of SOURCE_DIRS) walk(join(appRoot, dir));
  for (const file of SOURCE_FILES) {
    const p = join(appRoot, ...file.split("/"));
    try {
      if (statSync(p).isFile()) files.push(p);
    } catch {
      // a build tool that is not there yet contributes nothing
    }
  }

  // sorted, so the fingerprint is the CONTENT and not the order the
  // filesystem happened to hand the entries back in
  for (const file of files.sort()) {
    hash.update(file.slice(appRoot.length).split(sep).join("/"));
    hash.update(normalise(readFileSync(file)));
  }

  return { hash: hash.digest("hex"), files: files.length };
}
