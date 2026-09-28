/**
 * UP-10, `02_ACCEPTANCE_TESTS_v22.md` — the ingestion threat model is
 * written (injection through scraped content; the screened, tool-less
 * extract step; allow-lists, size caps, script stripping; the EA quotes,
 * never obeys), and the REMAP decision point (a dedicated screening agent,
 * an n8n ingestion workflow, a backend rule set) is named with the app's
 * assumption — `SECURITY.md`, `HANDOVER.md`, `CONTRACT.md` Q24.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repo = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(repo, rel), "utf8");

describe("UP-10 · the ingestion threat model is written, and the REMAP decision point is named", () => {
  it("SECURITY.md states the threat, the tool-less extract step, and that extracted text is evidence never instruction", () => {
    const src = read("SECURITY.md");
    expect(src).toMatch(/injection/i);
    expect(src).toMatch(/screened.{0,20}tool-less/is);
    expect(src).toMatch(/EVIDENCE, never INSTRUCTION/);
    expect(src).toMatch(/allow-list/i);
    expect(src).toMatch(/script and event-handler stripping/i);
  });

  it("HANDOVER.md points a REMAP engineer at Q24 (screening shared content before any agent with tools sees it)", () => {
    expect(read("HANDOVER.md")).toContain("Q24");
  });

  it("CONTRACT.md's Q24 names all three REMAP options and the app's assumption until one is chosen", () => {
    const src = read("CONTRACT.md");
    const q24 = /24\.[^\n]*\n?[^\n]*/.exec(src)?.[0] ?? "";
    expect(q24).toMatch(/screening agent/i);
    expect(q24).toMatch(/n8n/i);
    expect(q24).toMatch(/backend rule/i);
    expect(q24).toMatch(/Assumed until decided/i);
  });
});
