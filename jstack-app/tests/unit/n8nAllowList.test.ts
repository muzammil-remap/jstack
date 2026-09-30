/**
 * ADR-76 — the webhook allow-list: the app's keys and the dev proxy's are one set, and nothing that
 * sends, pays, books, revokes or returns file bytes is reachable from the browser.
 *
 * Three places hold the list (`data/n8n/registry.ts`, `remap/dev-proxy.mjs`, the nginx config in
 * `remap/DEPLOY_N8N.md`); this holds the first two to each other. The proxy's `ALLOW` is read by
 * importing the real module in a child process, because it is an ES module Jest cannot load — and
 * importing it also runs the proxy's own refusal of a forbidden path.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { READS, WEBHOOK_KEYS, WRITES } from "@/data/n8n/registry";

const app = join(__dirname, "..", "..");
const proxyFile = join(app, "..", "remap", "dev-proxy.mjs");

/** The originals that send or return file bytes. Their DASH copies are fine; these never are. */
const FORBIDDEN = /jstack-calendar-create|gmail-compose|gmail-reply|send-or-queue|jstack-dropbox-fetch/i;

function proxyAllow(): Record<string, string> {
  const url = pathToFileURL(proxyFile).href;
  const script = `const m = await import(${JSON.stringify(url)}); console.log(JSON.stringify(m.ALLOW));`;
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: app, encoding: "utf8" })) as Record<string, string>;
}

/** Every `.ts`/`.tsx` the app ships, with comments blanked so a sentence about a rule is not the rule. */
function appSource(): { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(app, dir)).sort()) {
      const rel = `${dir}/${name}`;
      if (statSync(join(app, rel)).isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(name)) {
        const text = readFileSync(join(app, rel), "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
          .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
        out.push({ rel, text });
      }
    }
  };
  for (const dir of ["app", "components", "data", "layout", "lib", "stores", "theme"]) walk(dir);
  return out;
}

describe("ADR-76 · the app's webhook keys are the proxy's allow-list", () => {
  const allow = proxyAllow();

  it("reads the proxy's list — a comparison with nothing is not a comparison", () => {
    expect(Object.keys(allow).length).toBeGreaterThanOrEqual(10);
  });

  it("the two lists are one set", () => {
    expect([...WEBHOOK_KEYS].sort()).toEqual(Object.keys(allow).sort());
  });

  it("every key a registry row uses is on the list", () => {
    const used = [
      ...Object.values(READS).flatMap((row) => (row?.kind === "wired" ? [row.key] : row?.kind === "derived" ? [...row.uses] : [])),
      ...Object.values(WRITES).map((w) => w!.key),
    ];
    expect(used.filter((k) => !(WEBHOOK_KEYS as readonly string[]).includes(k))).toEqual([]);
  });

  it("no proxy path, and no key, is a workflow that sends or returns file bytes", () => {
    expect(Object.entries(allow).filter(([k, p]) => FORBIDDEN.test(k) || FORBIDDEN.test(p))).toEqual([]);
    expect(WEBHOOK_KEYS.filter((k) => FORBIDDEN.test(k))).toEqual([]);
  });

  it("the check can fail: the pattern catches every original it names", () => {
    for (const original of ["jstack-calendar-create", "jstack-gmail-compose", "jstack-gmail-reply", "JSTACK-SEND-OR-QUEUE", "jstack-dropbox-fetch"]) {
      expect({ original, caught: FORBIDDEN.test(original) }).toEqual({ original, caught: true });
    }
    expect(FORBIDDEN.test("jstack-dash-gmail-draft")).toBe(false);
  });
});

describe("ADR-76 · the app's code names no n8n path, secret or forbidden workflow", () => {
  const files = appSource();

  it("reads a real number of files", () => {
    expect(files.length).toBeGreaterThan(150);
  });

  it("no webhook path or workflow name in any string the app ships", () => {
    const hits = files.filter((f) => /webhook\/|jstack-dash-|jstack-memory-search/i.test(f.text) || FORBIDDEN.test(f.text)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it("no auth header is set anywhere near the n8n client", () => {
    const client = files.find((f) => f.rel === "data/n8n/client.ts")!.text;
    expect(client).toContain(`"content-type": "application/json"`);
    expect(/authorization|x-api-key|x-n8n|N8N_AUTH/i.test(client)).toBe(false);
  });
});
