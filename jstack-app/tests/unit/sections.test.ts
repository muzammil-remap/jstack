/**
 * CB-01..CB-04, CB-09, CB-10 (B-1) — the section-config machinery, minus
 * the rendering (`tests/native/sections.test.tsx` does that half).
 *
 * The validator gets its own describe with one case per rejection the
 * acceptance test names, because a validator tested only on the happy
 * path is a validator that has never been asked the question it exists
 * to answer.
 */
import { BINDS, ENDPOINTS } from "@/layout/sources";
import { BLOCK_TYPES, FEEDS, LIMITS, catalogue } from "@/layout/catalogue";
import { validateSectionConfig } from "@/layout/validateSectionConfig";
import { ROUTES, pathToPattern } from "@/data/routes";
import { localCapabilitiesFallback } from "@/data/capabilities";
import * as db from "@/data/mock/db";
import { EFFECT_KINDS, UNDO_KINDS } from "@/data/mock/handlers/decisions";
import { handle } from "@/data/mock/server";
import sectionsFixture from "@/data/mock/fixtures/sections.json";
import type { ActionItem, BlockLink, SectionConfig } from "@/data/types";

const base = (): SectionConfig => JSON.parse(JSON.stringify(sectionsFixture[0])) as SectionConfig;

describe("the catalogue is a closed list", () => {
  it("every bind names an endpoint from the allow-list", () => {
    for (const [name, def] of Object.entries(BINDS)) {
      expect((ENDPOINTS as readonly string[]).includes(def.endpoint)).toBe(true);
      expect(BLOCK_TYPES).toContain(def.block);
      expect(name).toMatch(/^[a-z]+\.[a-z]+$/);
    }
  });

  it("FEEDS is exactly the boolean capability flags (CB-02's `feed` check)", () => {
    const caps = localCapabilitiesFallback();
    const booleans = Object.entries(caps)
      .filter(([, v]) => typeof v === "boolean")
      .map(([k]) => k)
      .sort();
    expect([...FEEDS].sort()).toEqual(booleans);
  });

  it("GET /sections/catalogue equals the app's own catalogue (CB-09)", async () => {
    const res = await handle({ method: "GET", path: "/sections/catalogue" });
    expect(res.status).toBe(200);
    expect(res.json).toEqual(catalogue());
  });

  it("the literal catalogue path resolves before /sections/{id}", () => {
    // load-bearing table ORDER: `{id}` matches "catalogue" too, so the row
    // that wins is whichever comes first (see the note in data/routes.ts).
    const first = ROUTES.find((r) => r.method === "GET" && pathToPattern(r.path).test("/sections/catalogue"));
    expect(first?.name).toBe("getSectionCatalogue");
  });
});

describe("validateSectionConfig", () => {
  it("accepts every fixture as shipped (CB-04)", () => {
    for (const cfg of sectionsFixture) expect(validateSectionConfig(cfg)).toEqual({ ok: true });
  });

  const reject = (mutate: (c: SectionConfig) => void, field: string) => {
    const cfg = base();
    mutate(cfg);
    const v = validateSectionConfig(cfg);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.field).toBe(field);
    return v;
  };

  it("an unknown block type", () => {
    reject((c) => { (c.blocks[0] as { type: string }).type = "carousel"; }, "blocks[0].type");
  });

  it("an unknown verb", () => {
    reject((c) => {
      c.blocks[0] = { type: "chips", idPrefix: "x", items: [{ id: "a", label: "A", on: false, verb: { label: "Send", action: "send" } }] } as never;
    }, "blocks[0].items[0].verb.action");
  });

  it("an endpoint off the allow-list", () => {
    reject((c) => { c.source.endpoint = "/admin/users"; }, "source.endpoint");
  });

  it("thirteen blocks — the number, not `LIMITS.blocks + 1`", () => {
    // T-1's mutation seam 4 found this: written against `LIMITS.blocks + 1`
    // the test moved WITH the limit, so raising the cap to 13 left it green.
    // CB-02 says thirteen blocks are refused; that is a literal, and so is
    // the limit it rests on.
    expect(LIMITS.blocks).toBe(12);
    const cfg = base();
    cfg.blocks = Array.from({ length: 13 }, () => ({ type: "text", text: "line" }) as never);
    expect(validateSectionConfig(cfg)).toEqual({ ok: false, field: "blocks", reason: "at most 12 blocks" });

    // and twelve are accepted, so the refusal is a CAP rather than a ban
    cfg.blocks = Array.from({ length: 12 }, () => ({ type: "text", text: "line" }) as never);
    expect(validateSectionConfig(cfg)).toEqual({ ok: true });
  });

  it("a 201-character string", () => {
    const v = reject((c) => { c.title = "x".repeat(LIMITS.string + 1); }, "title");
    if (!v.ok) expect(v.reason).toBe(`must be ${LIMITS.string} characters or fewer`);
  });

  it("a 201-character string nested inside a block", () => {
    reject((c) => {
      c.blocks[0] = { type: "text", text: "y".repeat(LIMITS.string + 1) } as never;
    }, "blocks[0].text");
  });

  it("a pinned column — a privilege, not a field", () => {
    const v = reject((c) => { (c as unknown as { pinned: boolean }).pinned = true; }, "pinned");
    if (!v.ok) expect(v.reason).toBe("not a field a section config may carry");
  });

  it("a bind that feeds a different block type", () => {
    reject((c) => { c.blocks[0] = { type: "bars", idPrefix: "m", bind: "people.rows" } as never; }, "blocks[0].bind");
  });

  it("a bind that does not exist", () => {
    reject((c) => { c.blocks[0] = { type: "rows", idPrefix: "m", bind: "secrets.all" } as never; }, "blocks[0].bind");
  });

  it("a rows block carrying its own fifty rows instead of binding (CB-10)", () => {
    reject((c) => {
      c.blocks[0] = { type: "rows", idPrefix: "m", rows: [{ id: "a", name: "A" }] } as never;
    }, "blocks[0].rows");
  });

  it("a bound block that also carries inline content", () => {
    reject((c) => {
      c.blocks[0] = { type: "chips", idPrefix: "h", bind: "habits.chips", items: [{ id: "a", label: "A", on: true }] } as never;
    }, "blocks[0].items");
  });

  it("an idPrefix that is not a slug (it becomes a testID)", () => {
    reject((c) => { c.blocks[0].idPrefix = "Person Rows"; }, "blocks[0].idPrefix");
  });

  it("a link that is not http(s)", () => {
    reject((c) => {
      c.blocks[0] = { type: "links", idPrefix: "l", items: [{ id: "a", label: "A", url: "javascript:alert(1)" }] } as never;
    }, "blocks[0].items[0].url");
  });

  it("a capability flag that does not exist", () => {
    reject((c) => { c.feed = "moonPhase"; }, "feed");
  });

  it("no blocks at all", () => {
    reject((c) => { c.blocks = []; }, "blocks");
  });
});

/**
 * A-0 review, R-08. `LinksBlock` keyed every row on `item.id` and derived its
 * testID from it; the validator refused a links item without an id; and the
 * TYPE (`BlockLink = { label, url }`) and the contract's §3 shape had no id at
 * all. A config written to the published shape could never validate, and a
 * config that validated was outside the type. Three descriptions of one item,
 * two of them wrong.
 */
describe("R-08 · a links item carries the id the renderer keys on", () => {
  it("the type, the validator and the renderer agree: a links item as BlockLink declares it validates", () => {
    const item: BlockLink = { id: "docs", label: "The docs", url: "https://example.test/docs" };
    const cfg = base();
    cfg.blocks = [{ type: "links", idPrefix: "links", items: [item] }];
    expect(validateSectionConfig(cfg)).toEqual({ ok: true });
  });

  it("an item without an id is refused by name, not rendered with a missing key", () => {
    const cfg = base();
    cfg.blocks = [{ type: "links", idPrefix: "links", items: [{ label: "Docs", url: "https://example.test" } as unknown as BlockLink] }];
    const v = validateSectionConfig(cfg);
    expect(v).toMatchObject({ ok: false, field: "blocks[0].items[0].id" });
  });
});

describe("the sections endpoints", () => {
  beforeEach(() => db.reset());

  it("GET /sections returns the active configs, filtered by tab", async () => {
    const all = await handle({ method: "GET", path: "/sections" });
    expect(all.status).toBe(200);
    expect((all.json as SectionConfig[]).map((s) => s.id)).toEqual(["people", "money", "learning", "usage", "health", "replies", "files"]);

    // T-4: the filter is worth more than it was. This used to assert that the
    // Agents tab had NO configured sections, which was true only because no
    // section had ever been written for another tab — a filter that has never
    // returned anything is a filter nobody has tested.
    const life = await handle({ method: "GET", path: "/sections", query: { tab: "life" } });
    expect((life.json as SectionConfig[]).map((s) => s.id)).toEqual(["people", "money", "learning", "health"]);

    const other = await handle({ method: "GET", path: "/sections", query: { tab: "agents" } });
    expect((other.json as SectionConfig[]).map((s) => s.id)).toEqual(["usage"]);

    // R-1 gave Brain its first configured section, so the filter now answers
    // for three different tabs rather than two
    const brain = await handle({ method: "GET", path: "/sections", query: { tab: "brain" } });
    expect((brain.json as SectionConfig[]).map((s) => s.id)).toEqual(["replies", "files"]);
  });

  it("PUT versions the record and takes the server's own version, not the client's", async () => {
    const res = await handle({ method: "PUT", path: "/sections/money", body: { title: "Budget", version: 99 } });
    expect(res.status).toBe(200);
    const saved = res.json as SectionConfig;
    expect(saved.title).toBe("Budget");
    expect(saved.version).toBe(2);
    expect(saved.managedBy).toBe("josh");
  });

  // TWO validators sit in front of this endpoint and the test proves both.
  // H-1 put an OpenAPI request-schema check in the mock server, which catches
  // anything of the wrong SHAPE before a handler sees it; §4.10's own
  // validator catches what a schema cannot express — a bind that isn't
  // published, an endpoint off the allow-list, a verb that isn't a verb.
  it("PUT refuses a wrongly-shaped body with 422 naming the field (CB-02)", async () => {
    const res = await handle({ method: "PUT", path: "/sections/money", body: { column: 4 } });
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ field: "column" });
    expect(((await handle({ method: "GET", path: "/sections/money" })).json as SectionConfig).column).toBe(2);
  });

  /**
   * CB-A (qa A-6, L-1) — the two validators must name a field the same way.
   *
   * The schema check truncated `field` to its first segment, so a wrongly
   * TYPED block came back as `field: "blocks"` while §4.10's own validator,
   * for a wrongly BOUND one, came back as `field: "blocks[0].bind"`. Both are
   * shown to a person by the same code path, so one of them was pointing at
   * the list instead of the thing in it — and the app's one 422 renderer
   * cannot highlight a field it is not told about.
   */
  it("the schema's 422 names the FULL path, like the section validator's does (CB-A)", async () => {
    const nested = await handle({ method: "PUT", path: "/sections/money", body: { source: { endpoint: 12 } } });
    expect(nested.status).toBe(422);
    expect(nested.json).toMatchObject({ field: "source.endpoint" });

    // A block is a UNION, so the honest answer for an element that matches no
    // alternative is the element — `blocks[0]`, not `blocks[0].type`. Picking
    // a field inside it would mean guessing which alternative was meant from a
    // schema that declares no discriminator. Pinned here so nobody "tidies"
    // this back to `blocks`, which is the truncation CB-A is about.
    const union = await handle({ method: "PUT", path: "/sections/money", body: { blocks: [{ type: 12, idPrefix: "money" }] } });
    expect(union.status).toBe(422);
    expect(union.json).toMatchObject({ field: "blocks[0]" });
  });

  it("PUT refuses a well-shaped but disallowed config with the validator's own reason", async () => {
    const res = await handle({ method: "PUT", path: "/sections/money", body: { source: { endpoint: "/admin/users" } } });
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ field: "source.endpoint", reason: "not an endpoint a section may read" });
    expect(((await handle({ method: "GET", path: "/sections/money" })).json as SectionConfig).source.endpoint).toBe("/money");
  });

  it("revert restores the record, not merely the fields the edit touched", async () => {
    await handle({ method: "PUT", path: "/sections/money", body: { title: "Budget", hint: "invented" } });
    const res = await handle({ method: "POST", path: "/sections/money/revert" });
    const back = res.json as SectionConfig;
    expect(back.title).toBe("Money");
    expect(back.hint).toBeUndefined();
    expect(back.version).toBe(3);
  });

  it("DELETE retires and keeps the record", async () => {
    expect((await handle({ method: "DELETE", path: "/sections/health" })).status).toBe(200);
    expect(((await handle({ method: "GET", path: "/sections/health" })).json as SectionConfig).state).toBe("retired");
    expect(((await handle({ method: "GET", path: "/sections" })).json as SectionConfig[]).map((s) => s.id)).not.toContain("health");
  });

  it("404s on an id that is not there", async () => {
    expect((await handle({ method: "GET", path: "/sections/nope" })).status).toBe(404);
    expect((await handle({ method: "PUT", path: "/sections/nope", body: {} })).status).toBe(404);
    expect((await handle({ method: "POST", path: "/sections/nope/revert" })).status).toBe(404);
  });
});

describe("CB-05..CB-08 · the EA proposes a section", () => {
  beforeEach(() => db.reset());

  const proposal = (over: Partial<SectionConfig> = {}): SectionConfig => ({
    ...(base()),
    id: "reading",
    title: "Reading",
    tab: "life",
    column: 3,
    source: { endpoint: "/learning" },
    blocks: [{ type: "rows", idPrefix: "reading", bind: "learning.rows" }],
    ...over,
  });

  const propose = (config: SectionConfig, reason = "You open Learning most mornings; this puts it where you look first.") =>
    handle({ method: "POST", path: "/sections/propose", body: { config, reason } });

  it("creates a card carrying the config, and does NOT add a section (CB-05)", async () => {
    const res = await propose(proposal());
    expect(res.status).toBe(201);
    const card = res.json as ActionItem;
    expect(card.kind).toBe("section");
    expect(card.type).toBe("Section");
    expect(card.section?.id).toBe("reading");
    expect(card.section?.state).toBe("proposed");
    expect(card.why).toContain("most mornings");
    // the card carries the same furniture every other card does
    expect(card.expiresAt).toBeTruthy();
    expect(card.thenWhat).toBeTruthy();
    expect(card.receipt).toBeTruthy();

    const listed = (await handle({ method: "GET", path: "/sections" })).json as SectionConfig[];
    expect(listed.map((s) => s.id)).not.toContain("reading");
  });

  it("refuses a proposal with no reason (CB-05)", async () => {
    const res = await handle({ method: "POST", path: "/sections/propose", body: { config: proposal(), reason: "   " } });
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ field: "reason", reason: "a proposal needs a reason" });
  });

  it("refuses a proposal whose config would be refused anywhere else (CB-02)", async () => {
    const res = await propose(proposal({ blocks: [{ type: "rows", idPrefix: "x", bind: "nope.rows" }] as never }));
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ field: "blocks[0].bind", reason: "no such data source" });
  });

  it("approve makes it a real section (CB-06)", async () => {
    const card = (await propose(proposal())).json as ActionItem;
    const answered = await handle({ method: "POST", path: `/actions/${card.id}`, body: { verb: "approve" } });
    expect(answered.status).toBe(200);

    const listed = (await handle({ method: "GET", path: "/sections" })).json as SectionConfig[];
    expect(listed.map((s) => s.id)).toContain("reading");
    expect(listed.find((s) => s.id === "reading")?.state).toBe("active");
  });

  it("undo within the window puts the section back to proposed (CB-06)", async () => {
    const card = (await propose(proposal())).json as ActionItem;
    await handle({ method: "POST", path: `/actions/${card.id}`, body: { verb: "approve" } });
    const undone = await handle({ method: "POST", path: `/actions/${card.id}/undo` });
    expect(undone.status).toBe(200);

    const listed = (await handle({ method: "GET", path: "/sections" })).json as SectionConfig[];
    expect(listed.map((s) => s.id)).not.toContain("reading");
    // and the card is back, open, so it can be answered again
    expect((undone.json as ActionItem).state).toBe("open");
  });

  it("never retires the id, and it is not proposed again (CB-08)", async () => {
    const card = (await propose(proposal())).json as ActionItem;
    await handle({ method: "POST", path: `/actions/${card.id}`, body: { verb: "never" } });
    expect(((await handle({ method: "GET", path: "/sections/reading" })).json as SectionConfig).state).toBe("retired");

    const again = await propose(proposal());
    expect(again.status).toBe(422);
    expect(again.json).toMatchObject({ field: "id" });
  });

  it("later leaves the tab exactly as it was (CB-08)", async () => {
    const card = (await propose(proposal())).json as ActionItem;
    const answered = await handle({ method: "POST", path: `/actions/${card.id}`, body: { verb: "later" } });
    expect((answered.json as ActionItem).state).toBe("later");
    expect((answered.json as ActionItem).laterUntil).toBeTruthy();
    expect(((await handle({ method: "GET", path: "/sections/reading" })).json as SectionConfig).state).toBe("proposed");
  });

  it("a revision re-proposes at version + 1 (CB-07)", async () => {
    const first = (await propose(proposal())).json as ActionItem;
    expect(first.section?.version).toBe(1);
    const second = (await propose(proposal({ title: "Reading list" }))).json as ActionItem;
    expect(second.section?.version).toBe(2);
    expect(second.section?.title).toBe("Reading list");
    expect(second.id).not.toBe(first.id);
  });

  it("a proposed section's row verbs are still limited to the five (CB-10)", async () => {
    const res = await propose(
      proposal({ blocks: [{ type: "chips", idPrefix: "r", items: [{ id: "a", label: "A", on: false, verb: { label: "Send", action: "approve" } }] }] as never }),
    );
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ field: "blocks[0].items[0].verb.action" });
  });
});

/**
 * A4R2-02, generalised — every card kind that HAS an effect has a revert.
 *
 * Three audit rounds found the same shape three times: refetchFor covered two
 * of four kinds on the client (B-174), postActionUndo reverted two of four on
 * the server (B-183), and only `section` had ever been driven through Approve
 * then Undo by any test. Each was fixed as an instance; this is the class. The
 * two tables are keyed by the same ActionKind, so a kind that gains an effect
 * without a revert is red HERE rather than found by an auditor, or by Josh, or
 * by nobody. Set-equality against the registry, never a hand-listed copy of it
 * (rule 16).
 */
describe("A4R2-02 · KIND_EFFECTS and UNDO_EFFECTS cover the same kinds", () => {
  it("every kind with an effect has a revert, and no revert is orphaned", () => {
    expect(EFFECT_KINDS.length).toBeGreaterThan(3); // an empty table would pass silently
    expect(UNDO_KINDS).toEqual(EFFECT_KINDS);
  });
});
