/**
 * CT-07 — CONTRACT_v2.md §7 mock server semantics, and the row-4 slice of
 * BUILD_PLAN_v2.md §5's mutation seams: cap 5 open cards, expiry → then-
 * what, undo after 10s → 409, pinned hide → 422, EA layout without a
 * reason → 422, a locked notification group → 423, `?focus=` filters
 * every noun, and a `t1`-sensitivity read → 403 (BUGLOG_v2.md A-09).
 */
import { reset, setClockOffsetMs } from "@/data/mock/db";
import { OPEN_CARD_CAP, UNDO_WINDOW_MS } from "@/data/mock/handlers/decisions";
import { gapsFor } from "@/data/mock/handlers/calendar";
import { handle } from "@/data/mock/server";
import { proposalCard } from "@/data/mock/cards";
import { requireHighRisk } from "@/data/mock/util";
import { addDays, atTime, dayKey } from "@/lib/time";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ActionItem, Task } from "@/data/types";

beforeEach(() => {
  reset();
});

describe("CT-07 rank + cap 5 open cards", () => {
  it("GET /actions?state=open returns at most 5, sorted by rank", async () => {
    const res = await handle({ method: "GET", path: "/actions", query: { state: "open" } });
    expect(res.status).toBe(200);
    const rows = res.json as ActionItem[];
    // D-6's sibling, D-2 (the A-6 audit): both sides used to move with the
    // subject — `toBe(OPEN_CARD_CAP)` is true for any cap the fixture can
    // supply, so seam 4 of `evidence/mutation-pass.json` (cap 5 -> 6) stopped
    // reproducing and nothing said so. CT-07 pins the LITERAL "cap 5 open
    // cards", so the literal is what this asserts, with the constant beside it
    // — the same shape `sizes.test.ts` uses for 250 and 200.
    expect(OPEN_CARD_CAP).toBe(5);
    expect(rows.length).toBe(5); // actions.json ships 6 open cards (of 8 actions), so a cap that drifts either way is caught
    for (let i = 1; i < rows.length; i++) expect(rows[i].rank).toBeGreaterThanOrEqual(rows[i - 1].rank);
  });
});

describe("CT-07 expiry applies then-what", () => {
  it("an opts card past its expiresAt auto-approves the recommended option", async () => {
    setClockOffsetMs(4 * 86_400_000); // c1 expires in 3 days
    const res = await handle({ method: "GET", path: "/actions/c1", query: {} });
    const card = res.json as ActionItem;
    expect(card.state).toBe("answered");
    expect(card.history.at(-1)).toMatchObject({ verb: "approve", option: card.recommended, via: "expiry" });
  });

  it("a quote card past its expiresAt drops out of open (stays in drafts, not re-answered)", async () => {
    setClockOffsetMs(2 * 86_400_000); // c2 expires in 1 day
    const res = await handle({ method: "GET", path: "/actions/c2", query: {} });
    const card = res.json as ActionItem;
    expect(card.state).toBe("expired");
    const open = await handle({ method: "GET", path: "/actions", query: { state: "open" } });
    expect((open.json as ActionItem[]).find((a) => a.id === "c2")).toBeUndefined();
  });
});

describe("CT-07 undo window", () => {
  it("undo within 10s restores the card to open", async () => {
    await handle({ method: "POST", path: "/actions/c1", query: {}, body: { verb: "approve", option: 1 } });
    const res = await handle({ method: "POST", path: "/actions/c1/undo", query: {} });
    expect(res.status).toBe(200);
    expect((res.json as ActionItem).state).toBe("open");
  });

  it("undo after the 10s window returns 409", async () => {
    await handle({ method: "POST", path: "/actions/c1", query: {}, body: { verb: "approve", option: 1 } });
    // D-2: the clock used to move with the window, so seam 5 (the window x100)
    // stopped reproducing. CT-07 pins "undo after 10 s -> 409": the literal is
    // what the clock is moved by, and the constant is asserted beside it.
    expect(UNDO_WINDOW_MS).toBe(10_000);
    setClockOffsetMs(11_000);
    const res = await handle({ method: "POST", path: "/actions/c1/undo", query: {} });
    expect(res.status).toBe(409);
  });
});

describe("CT-07 pinned section hide → 422", () => {
  it("PUT /layout/today hiding the pinned 'needs' section is rejected", async () => {
    const res = await handle({ method: "PUT", path: "/layout/today", query: {}, body: { hidden: ["needs"] } });
    expect(res.status).toBe(422);
  });

  it("PUT /layout/today hiding a non-pinned section succeeds", async () => {
    const res = await handle({ method: "PUT", path: "/layout/today", query: {}, body: { hidden: ["glance"] } });
    expect(res.status).toBe(200);
  });
});

describe("CT-07 EA layout without a reason → 422", () => {
  it("POST /layout/today/ea with no reason is rejected", async () => {
    const res = await handle({ method: "POST", path: "/layout/today/ea", query: {}, body: { order: ["needs"], hidden: [] } });
    expect(res.status).toBe(422);
  });

  it("POST /layout/today/ea with a reason succeeds and sets managedBy: ea", async () => {
    const res = await handle({ method: "POST", path: "/layout/today/ea", query: {}, body: { order: ["needs"], hidden: [], reason: "the mornings run smoother this way" } });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ managedBy: "ea", reason: "the mornings run smoother this way" });
  });

  it("an EA layout proposal still cannot hide a pinned section, reason or not", async () => {
    const res = await handle({ method: "POST", path: "/layout/agents/ea", query: {}, body: { order: [], hidden: ["lock"], reason: "cleanup" } });
    expect(res.status).toBe(422);
  });

  it("an EA layout proposal that re-shows a section Josh hid is rejected (B-31/AR-06)", async () => {
    const hidden = await handle({ method: "PUT", path: "/layout/today", query: {}, body: { hidden: ["glance"] } });
    expect(hidden.status).toBe(200);
    const res = await handle({ method: "POST", path: "/layout/today/ea", query: {}, body: { order: ["needs"], hidden: [], reason: "tidying up" } });
    expect(res.status).toBe(422);
  });

  it("an EA layout proposal that keeps Josh's hide and adds its own succeeds", async () => {
    await handle({ method: "PUT", path: "/layout/today", query: {}, body: { hidden: ["glance"] } });
    const res = await handle({ method: "POST", path: "/layout/today/ea", query: {}, body: { order: ["needs"], hidden: ["glance", "close"], reason: "tidying up" } });
    expect(res.status).toBe(200);
    expect((res.json as { hidden: string[] }).hidden).toEqual(["glance", "close"]);
  });
});

describe("AR-05 revert restores the pristine layout (B-33)", () => {
  it("POST /layout/today/revert undoes a hide made earlier the same session", async () => {
    await handle({ method: "PUT", path: "/layout/today", query: {}, body: { hidden: ["glance"] } });
    const res = await handle({ method: "POST", path: "/layout/today/revert", query: {} });
    expect(res.status).toBe(200);
    expect((res.json as { hidden: string[]; managedBy: string }).hidden).toEqual([]);
    expect((res.json as { managedBy: string }).managedBy).toBe("josh");
  });

  it("also undoes an EA proposal, reason and all", async () => {
    await handle({ method: "POST", path: "/layout/today/ea", query: {}, body: { order: ["needs"], hidden: [], reason: "tidying up" } });
    const res = await handle({ method: "POST", path: "/layout/today/revert", query: {} });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ managedBy: "josh", reason: undefined });
  });
});

describe("CT-07 app layout", () => {
  it("GET/PUT /layout/app round-trips, merging partial updates", async () => {
    const before = await handle({ method: "GET", path: "/layout/app", query: {} });
    expect(before.status).toBe(200);
    const res = await handle({ method: "PUT", path: "/layout/app", query: {}, body: { hiddenTabs: ["life"] } });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ hiddenTabs: ["life"] });
    const after = await handle({ method: "GET", path: "/layout/app", query: {} });
    expect((after.json as { showFocusRow: boolean }).showFocusRow).toBe((before.json as { showFocusRow: boolean }).showFocusRow);
  });
});

describe("CT-07 locked notification group → 423", () => {
  it("PUT /settings/notifications/{security-group-id} is rejected", async () => {
    const groups = (await handle({ method: "GET", path: "/settings/notifications", query: {} })).json as { id: string; name: string }[];
    const security = groups.find((g) => g.name === "Security")!;
    const res = await handle({ method: "PUT", path: `/settings/notifications/${security.id}`, query: {}, body: { devices: { pc: false } } });
    expect(res.status).toBe(423);
  });
});

describe("CT-07 ?focus= filters every noun", () => {
  it.each([
    ["/actions", "state=open"],
    ["/tasks", ""],
    ["/calendar", "view=week&anchor=2026-09-01"],
    ["/brain/latest", ""],
    ["/goals", ""],
    ["/people", ""],
  ])("%s honours ?focus=work (never returns a non-work, non-Everything record)", async (path, extraQs) => {
    const query: Record<string, string> = { focus: "work" };
    for (const pair of extraQs.split("&")) {
      if (!pair) continue;
      const [k, v] = pair.split("=");
      query[k] = v;
    }
    const res = await handle({ method: "GET", path, query });
    expect(res.status).toBe(200);
    const rows = res.json as { focus?: string; events?: { focus?: string }[] }[] | { events: { focus?: string }[] };
    const flat = Array.isArray(rows) ? rows : (rows as { events: { focus?: string }[] }).events;
    for (const row of flat) expect(row.focus === undefined || row.focus === "work").toBe(true);
  });
});

describe("CT-07 (BUGLOG_v2.md A-09) a t1-sensitivity read is never served", () => {
  it("GET /tasks/t1-sensitive returns 403", async () => {
    const res = await handle({ method: "GET", path: "/tasks/t1-sensitive", query: {} });
    expect(res.status).toBe(403);
  });
});

describe("CT-07 locked session rejects everything except the unlocked routes", () => {
  it("POST /lock then GET /today returns 401", async () => {
    await handle({ method: "POST", path: "/lock", query: {}, body: { nonce: "n", biometricAssertion: "a" } });
    const res = await handle({ method: "GET", path: "/today", query: {} });
    expect(res.status).toBe(401);
  });

  it("GET /session 401s too while locked (LK-04, row 15) — the locked screen's emergency state comes from the client's own session store, which already knows it triggered the lock, not from re-fetching /session", async () => {
    await handle({ method: "POST", path: "/lock", query: {}, body: { nonce: "n", biometricAssertion: "a" } });
    const res = await handle({ method: "GET", path: "/session", query: {} });
    expect(res.status).toBe(401);
  });

  it("POST /recover restores access", async () => {
    await handle({ method: "POST", path: "/lock", query: {}, body: { nonce: "n", biometricAssertion: "a" } });
    await handle({ method: "POST", path: "/recover", query: {}, body: { recoveryKey: "k", nonce: "n", biometricAssertion: "a" } });
    const res = await handle({ method: "GET", path: "/today", query: {} });
    expect(res.status).toBe(200);
  });
});

describe("CT-07 delegation acknowledges within one tick", () => {
  it("POST /tasks/{id}/delegate returns an acknowledged state and creates activity", async () => {
    const res = await handle({ method: "POST", path: "/tasks/t1/delegate", query: {} });
    expect(res.status).toBe(200);
    const task = res.json as Task;
    expect(task.delegated?.state).toBe("acknowledged");
    expect(task.activity.at(-1)?.actor).toBe("ea");
  });
});

/**
 * P-11 (F-04, F-05, F-06, F-07, F-08, F-02) — the mock handlers as tables.
 * The behaviour is pinned by the suites each finding names (parameters,
 * sections, rules, share, outbox, conformance, identity, hardening); these
 * cases pin the SHAPE: one card builder, one verb table, one effect per
 * kind in the module that owns it, the rig in the rig file, one high-risk
 * check, and no second replay dedupe.
 */
describe("P-11 · the mock handlers as tables", () => {
  const root = join(__dirname, "..", "..");
  const src = (rel: string) => readFileSync(join(root, rel), "utf8");

  it("proposalCard fills the shape every EA proposal shares — open, rank 3, 5pm on the third day, the \" · then\" the waiting row splits on (F-04)", () => {
    const now = new Date("2026-09-10T02:00:00.000Z");
    const card = proposalCard({ id: "x-1", type: "Rule", kind: "rule", title: "Make this a standing rule?", why: "because", toast: "Rule added", silence: "silence leaves things as they are", sources: [{ label: "your EA", ref: "rule:proposed" }] }, now);
    expect(card).toMatchObject({ id: "x-1", kind: "rule", state: "open", rank: 3, verb: "Approve", history: [] });
    expect(card.expiresAt).toBe(atTime(addDays(dayKey(now), 3), 17).toISOString());
    expect(card.thenWhat).toContain(" · then");
    expect(card.labels).toEqual({ silo: "personal:josh", types: ["unlabelled"], setBy: "review" });
    // each handler passes what is its own — the receipt's seconds differ per kind
    expect(proposalCard({ ...card, receipt: { cost: 0.01, model: "haiku", sources: 1, seconds: 4 } }, now).receipt.seconds).toBe(4);
  });

  it("the three proposal handlers build their card through it, and nothing else builds one by hand", () => {
    for (const f of ["data/mock/handlers/parameters.ts", "data/mock/handlers/sections.ts", "data/mock/handlers/settings.ts"]) {
      expect(src(f)).toMatch(/proposalCard\(/);
      expect(src(f)).not.toMatch(/thenWhat: `expires/);
    }
  });

  it("the verb is a table and each kind's effect lives in the module that owns the kind (F-05, F-06)", () => {
    const decisions = src("data/mock/handlers/decisions.ts");
    expect(decisions).not.toMatch(/switch \(body\.verb\)/);
    expect(decisions).toMatch(/NEXT_STATE/);
    expect(decisions).toMatch(/KIND_EFFECTS/);
    expect(decisions).not.toMatch(/action\.kind === "triage"|action\.kind === "section"|action\.kind === "rule"/);
    expect(src("data/mock/ingest.ts")).toMatch(/export function applyTriageVerb/);
    expect(src("data/mock/handlers/sections.ts")).toMatch(/export function applySectionVerb/);
    expect(src("data/mock/handlers/settings.ts")).toMatch(/export function applyRuleVerb/);
  });

  it("the rig routes live in the rig module, and the high-risk check is written once (F-07, F-08)", () => {
    expect(src("data/mock/handlers/session.ts")).not.toMatch(/setTest(User|Revoke|RefreshReuse)/);
    expect(src("data/mock/handlers/test.ts")).toMatch(/export function setTestUser/);
    expect(typeof requireHighRisk).toBe("function");
    expect(requireHighRisk({})?.status).toBe(403);
    expect(requireHighRisk({ nonce: "n", biometricAssertion: "b" })).toBeNull();
    for (const f of ["data/mock/handlers/session.ts", "data/mock/handlers/agents.ts"]) expect(src(f)).not.toMatch(/"high-risk assertion required"/);
  });

  it("postBrainDump keeps no dedupe of its own — the router answers a replay before any handler runs (F-02)", () => {
    expect(src("data/mock/handlers/brain.ts")).not.toMatch(/b\.id === `dump-\$\{body\.offlineId\}`/);
  });
});

/**
 * v2.3 WPF-11 (CODE_REVIEW_v23.md finding 19). `gapsFor` built its day from
 * 06:00 to 20:00 in UTC while `rangeFor` beside it used the reader's own
 * midnight: for a Brisbane reader the "working day" ran from 4pm to 6am.
 */
describe("WPF-11 · the free gaps are counted in the reader's own day", () => {
  it("an empty day is free from six in the morning to eight at night, local time — not in UTC", () => {
    const day = "2026-09-14";
    expect(gapsFor(day, [])).toEqual([{ startsAt: atTime(day, 6).toISOString(), endsAt: atTime(day, 20).toISOString() }]);
  });
});
