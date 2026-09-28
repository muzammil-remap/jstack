/**
 * US-01..US-05 — what the agents spent, on which task, and where that number
 * is allowed to come from (T-4, ADR-43).
 *
 * The whole point of this row is a single sentence: **the app never computes a
 * price.** `costAud` arrives on a `Usage` row and is displayed. Everything
 * else here follows from that — the mock derives a run's cost from its usage
 * rows rather than carrying its own copy (rule 16), the card's total line is a
 * sum of what the server sent, and US-05 below is a grep that fails the moment
 * a price table or a token-to-cost multiplication appears anywhere in the app.
 *
 * The reason it is worth a guard rather than a note: a price table is the kind
 * of thing that looks harmless when it is added ("just for the estimate") and
 * is wrong within a month of a provider changing a rate — and by then four
 * surfaces are quoting it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as db from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import { BINDS, ENDPOINTS, SECTION_VERBS } from "@/layout/sources";
import { catalogue } from "@/layout/catalogue";
import { validateSectionConfig } from "@/layout/validateSectionConfig";
import { dayKey, todayKey } from "@/lib/time";
import { usageCsv, usageLine, usageTotalLine } from "@/lib/usage";
import sectionsFixture from "@/data/mock/fixtures/sections.json";
import type { AgentRun, SectionConfig, Usage, UsageSummary } from "@/data/types";

const APP_ROOT = join(__dirname, "..", "..");

const taskUsage = async (id: string): Promise<UsageSummary> => (await handle({ method: "GET", path: `/tasks/${id}/usage` })).json as UsageSummary;
const allUsage = async (query?: Record<string, string>): Promise<UsageSummary> => (await handle({ method: "GET", path: "/usage", query })).json as UsageSummary;
const runs = async (): Promise<AgentRun[]> => (await handle({ method: "GET", path: "/agents/runs" })).json as AgentRun[];

const row = (over: Partial<Usage> = {}): Usage => ({
  id: "x1",
  taskId: "t2",
  agentId: "ea",
  model: "claude-sonnet-5",
  inputTokens: 12_400,
  outputTokens: 3_100,
  costAud: 0.38,
  at: "2026-09-11T02:14:00.000Z",
  labels: { silo: "work", types: [], setBy: "source" },
  setAt: "2026-09-11",
  focus: "work",
  ...over,
});

describe("US-01/US-02 · GET /tasks/{id}/usage", () => {
  beforeEach(() => db.reset());

  it("t2's two runs come back with totals by model and the cost the server priced", async () => {
    const summary = await taskUsage("t2");
    expect(summary.rows).toHaveLength(2);
    expect(summary.rows.every((r) => r.taskId === "t2")).toBe(true);
    expect(summary.totals).toHaveLength(2); // two models
    expect(summary.costAud).toBeCloseTo(0.4, 2);
    // the totals are the rows, grouped — not a second set of numbers
    const summed = summary.totals.reduce((n, t) => n + t.costAud, 0);
    expect(summed).toBeCloseTo(summary.costAud, 6);
    for (const t of summary.totals) {
      const mine = summary.rows.filter((r) => r.model === t.model);
      expect(t.inputTokens).toBe(mine.reduce((n, r) => n + r.inputTokens, 0));
      expect(t.outputTokens).toBe(mine.reduce((n, r) => n + r.outputTokens, 0));
    }
  });

  it("a task nobody's agent has touched answers with nothing, not a 404", async () => {
    const summary = await taskUsage("t5");
    expect(summary.rows).toEqual([]);
    expect(summary.totals).toEqual([]);
    expect(summary.costAud).toBe(0);
  });

  it("a SUBTASK's run is in its task's summary, carrying the subtask it belongs to (US-02)", () => {
    db.reset(0, "day2");
    const sub = db.get().usage.filter((u) => u.taskId === "t1");
    expect(sub).toHaveLength(1);
    expect(sub[0].subtaskId).toBe("t1-3");
    db.reset();
  });

  it("the overnight delegation's cost IS its usage row — the task carries no second number", () => {
    db.reset(0, "day2");
    const t1 = db.get().tasks.find((t) => t.id === "t1")!;
    const spent = db.get().usage.filter((u) => u.taskId === "t1").reduce((n, u) => n + u.costAud, 0);
    expect(t1.delegated?.cost).toBeCloseTo(spent, 2);
    db.reset();
  });
});

describe("US-01/US-02 · the lines the card draws", () => {
  it("a run line names the agent, the model, both token counts with separators, the cost and when", () => {
    // RELATIVE to now, not the literal `2026-09-11T02:14Z` this used to carry
    // (B-57). `formatWhen` says "Tomorrow 10:14pm" for an instant inside its
    // relative window and an absolute date outside it, so a hard-coded instant
    // asserts one shape or the other DEPENDING ON THE DAY THE SUITE RUNS: this
    // passed on 8 September with the date three days out and failed on the 9th
    // with it one day out in the America/New_York lane. Thirty days out is
    // outside the window under either zone, whenever it runs.
    const wellAhead = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const line = usageLine(row({ at: wellAhead }));
    expect(line).toContain("EA · claude-sonnet-5 · 12,400 in · 3,100 out · $0.38 · ");
    // the clock is the reader's, so the test asserts the SHAPE of the last
    // part rather than a literal — `lib/time.ts` owns the zone (ADR-47)
    expect(line).toMatch(/· [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}, \d{1,2}:\d{2}(am|pm)$/);
  });

  it("a total line counts models and tokens, and repeats no arithmetic of its own", () => {
    const summary: UsageSummary = {
      rows: [row(), row({ id: "x2", model: "claude-haiku-4-5", inputTokens: 4_200, outputTokens: 900, costAud: 0.02 })],
      totals: [
        { model: "claude-sonnet-5", inputTokens: 12_400, outputTokens: 3_100, costAud: 0.38 },
        { model: "claude-haiku-4-5", inputTokens: 4_200, outputTokens: 900, costAud: 0.02 },
      ],
      costAud: 0.4,
    };
    expect(usageTotalLine(summary)).toBe("Total · 2 models · 20,600 tokens · $0.40");
  });

  it("one model is not '1 models'", () => {
    const summary: UsageSummary = { rows: [row()], totals: [{ model: "claude-sonnet-5", inputTokens: 12_400, outputTokens: 3_100, costAud: 0.38 }], costAud: 0.38 };
    expect(usageTotalLine(summary)).toBe("Total · 1 model · 15,500 tokens · $0.38");
  });

  it("nothing to total is no line at all", () => {
    expect(usageTotalLine({ rows: [], totals: [], costAud: 0 })).toBeNull();
  });
});

describe("US-03 · GET /usage", () => {
  beforeEach(() => db.reset());

  it("returns every row newest first — it is a log Josh reads down, not a leaderboard", async () => {
    const summary = await allUsage();
    expect(summary.rows.length).toBeGreaterThanOrEqual(3);
    const times = summary.rows.map((r) => Date.parse(r.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("the totals cover the rows it returned", async () => {
    const summary = await allUsage();
    const fromRows = summary.rows.reduce((n, r) => n + r.costAud, 0);
    expect(summary.costAud).toBeCloseTo(fromRows, 2);
  });

  it("`range=month` is the month, and it is not the same question as `all`", async () => {
    // a row from a month ago exists only for this case
    const older = { ...row({ id: "u-old", at: "2026-01-04T01:00:00.000Z", costAud: 9.99 }) };
    db.get().usage.push(older);
    const month = await allUsage({ range: "month" });
    const all = await allUsage({ range: "all" });
    expect(all.rows.some((r) => r.id === "u-old")).toBe(true);
    expect(month.rows.some((r) => r.id === "u-old")).toBe(false);
    expect(all.costAud).toBeGreaterThan(month.costAud);
  });

  it("the month is the default — a section that names no range still asks one question", async () => {
    expect(await allUsage()).toEqual(await allUsage({ range: "month" }));
  });
});

describe("rule 16 · Usage is the ONE cost record", () => {
  beforeEach(() => db.reset());

  it("every agent run's cost is the sum of its own usage rows", async () => {
    const all = await allUsage({ range: "all" });
    const list = await runs();
    expect(list.length).toBeGreaterThan(0);
    for (const r of list) {
      const mine = all.rows.filter((u) => u.runId === r.id);
      expect(r.cost).toBeCloseTo(mine.reduce((n, u) => n + u.costAud, 0), 2);
    }
    // and at least one run really has rows, so the check is not vacuous
    expect(list.some((r) => r.cost > 0)).toBe(true);
  });

  it("the run fixture carries no cost of its own to drift from", () => {
    const fixture = JSON.parse(readFileSync(join(APP_ROOT, "data", "mock", "fixtures", "agents.json"), "utf8")) as { runs: Record<string, unknown>[] };
    for (const r of fixture.runs) expect(Object.keys(r)).not.toContain("cost");
  });

  it("spend today is the day's usage, reached through the runs", async () => {
    const summary = (await handle({ method: "GET", path: "/agents/summary" })).json as { spendToday: number };
    const list = await runs();
    const today = todayKey();
    const fromRuns = list.filter((r) => dayKey(new Date(r.at)) === today).reduce((n, r) => n + r.cost, 0);
    expect(summary.spendToday).toBeCloseTo(fromRuns, 2);
    expect(summary.spendToday).toBeGreaterThan(0);
  });
});

describe("US-04 · Copy as CSV", () => {
  beforeEach(() => db.reset());

  it("the first line names the columns the acceptance test names", () => {
    expect(usageCsv([row()]).split("\n")[0]).toBe("taskId,subtaskId,agent,model,in,out,cost,at");
  });

  it("one line per row, in the column order of the header", () => {
    const csv = usageCsv([row(), row({ id: "x2", taskId: "t1", subtaskId: "t1-3", agentId: "ea", model: "claude-haiku-4-5", inputTokens: 4_200, outputTokens: 900, costAud: 0.02 })]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("t2,,ea,claude-sonnet-5,12400,3100,0.38,2026-09-11T02:14:00.000Z");
    expect(lines[2]).toBe("t1,t1-3,ea,claude-haiku-4-5,4200,900,0.02,2026-09-11T02:14:00.000Z");
  });

  it("the numbers go out RAW — a separator or a dollar sign would break the spreadsheet it is going into", () => {
    const line = usageCsv([row({ inputTokens: 1_234_567 })]).split("\n")[1];
    expect(line).toContain(",1234567,");
    expect(line).not.toContain("$");
    expect(line).not.toContain("1,234,567");
  });

  it("a field containing a comma or a quote is quoted, so a model name can never shift a column", () => {
    const line = usageCsv([row({ model: 'sonnet, "long"' })]).split("\n")[1];
    expect(line).toBe('t2,,ea,"sonnet, ""long""",12400,3100,0.38,2026-09-11T02:14:00.000Z');
  });
});

describe("US-03/US-04 · the Agents › Usage section", () => {
  const usageSection = () => (sectionsFixture as unknown as SectionConfig[]).find((s) => s.id === "usage")!;

  it("is a configured section on the Agents tab and passes the validator as shipped", () => {
    const cfg = usageSection();
    expect(cfg).toBeDefined();
    expect(cfg.tab).toBe("agents");
    expect(validateSectionConfig(cfg)).toEqual({ ok: true });
  });

  it("its blocks are the published stats and rows binds, reading /usage", () => {
    const cfg = usageSection();
    expect(cfg.source.endpoint).toBe("/usage");
    expect((ENDPOINTS as readonly string[]).includes("/usage")).toBe(true);
    expect(cfg.blocks.map((b) => ("bind" in b ? b.bind : undefined))).toEqual(["usage.totals", "usage.tasks"]);
    expect(BINDS["usage.totals"].block).toBe("stats");
    expect(BINDS["usage.tasks"].block).toBe("rows");
  });

  it("carries the CSV verb, and the verb is a published action rather than a string", () => {
    expect(usageSection().verb).toEqual({ label: "Copy as CSV", action: "copy-csv" });
    expect(Object.keys(SECTION_VERBS)).toContain("copy-csv");
    expect(catalogue().sectionVerbs).toEqual(Object.keys(SECTION_VERBS).sort());
  });

  it("refuses a verb action nobody published (CB-02's rule, for the new slot)", () => {
    const cfg = JSON.parse(JSON.stringify(usageSection())) as SectionConfig;
    cfg.verb = { label: "Send to Xero", action: "wire-the-money" as never };
    const v = validateSectionConfig(cfg);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.field).toBe("verb.action");
  });

  it("refuses a verb with no label — a control nobody can read is not a control", () => {
    const cfg = JSON.parse(JSON.stringify(usageSection())) as SectionConfig;
    cfg.verb = { label: "  ", action: "copy-csv" };
    const v = validateSectionConfig(cfg);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.field).toBe("verb.label");
  });
});

/**
 * US-05 — the guard this row exists for.
 *
 * The same shape as TD-05's zone guard in `time.test.ts`: a regex over the
 * app's own source, with comments blanked first so that an explanation of the
 * rule cannot trip the rule.
 */
describe("US-05 · nothing in the app prices a token", () => {
  const PRICING = /perToken|pricePer|pricePerToken|PRICE_PER|\* ?0\.0{2}\d*/;

  /** comments out, string bodies kept: a rule may be described in prose. */
  function withoutComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(join(APP_ROOT, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(APP_ROOT, rel)).isDirectory()) {
        out.push(...sources(rel));
      } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
        out.push(rel);
      }
    }
    return out;
  }

  const FILES = ["lib", "stores", "components"].flatMap(sources);

  it("sweeps a real list of files (a guard over nothing is not a guard)", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("no price table and no token-to-cost arithmetic in lib/, stores/ or components/", () => {
    const hits = FILES.filter((f) => PRICING.test(withoutComments(readFileSync(join(APP_ROOT, f), "utf8"))));
    expect(hits).toEqual([]);
  });

  it("the sweep would catch one (the vacuity check)", () => {
    expect(PRICING.test(withoutComments("const c = tokens * 0.000015;"))).toBe(true);
    expect(PRICING.test(withoutComments("const pricePerToken = 3;"))).toBe(true);
    // and prose about the rule is still allowed to say the words
    expect(PRICING.test(withoutComments("// never compute pricePerToken here\nconst x = 1;"))).toBe(false);
  });

  it("costAud is displayed as received — the only maths on it is addition", () => {
    const src = withoutComments(readFileSync(join(APP_ROOT, "lib", "usage.ts"), "utf8"));
    expect(src).not.toMatch(/costAud\s*[*/]/);
    expect(src).toMatch(/costAud/);
  });
});
