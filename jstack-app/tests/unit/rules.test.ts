/**
 * ST-02, ST-03, ST-04 — the EA's standing instructions, and the card that
 * proposes one.
 *
 * V2.1 had a `Rule`: a numbered sentence on Brain with its own type, its own
 * four routes and its own two dialogs, which said nothing about WHEN it
 * applies or whether the EA should act on it or ask first. ST-1 retired all of
 * that in favour of `AutonomyRule`, which is the list the mock actually obeys —
 * `ingestShare` reads it before deciding whether to raise a card at all.
 *
 * THE MIGRATION IS ASSERTED, not assumed. The four rules that were on Brain are
 * proven to be in the new list by their own text: a migration that quietly
 * dropped what somebody had taught would look exactly like a migration that
 * worked, and "the list is non-empty" would pass either way (R-01).
 */
import * as db from "@/data/mock/db";
import { handle } from "@/data/mock/server";
import { ROUTES } from "@/data/routes";
import type { ActionItem, AutonomyRule, AutonomyRuleList } from "@/data/types";

async function rules(): Promise<AutonomyRule[]> {
  const res = await handle({ method: "GET", path: "/settings/autonomy/rules" });
  expect(res.status).toBe(200);
  return (res.json as AutonomyRuleList).rules;
}

const put = (next: AutonomyRule[]) => handle({ method: "PUT", path: "/settings/autonomy/rules", body: { rules: next } });

beforeEach(() => {
  db.reset();
  db.asUser("josh");
});

describe("ST-02 · V2.1's four rules survived the move", () => {
  it("every rule Brain's list showed is in the EA's rules now, by its own words", async () => {
    const texts = (await rules()).map((r) => r.text);
    for (const kept of [
      "School pickup days are fixed; move the meeting or ask Joce first.",
      "Never book anything before 7:30am.",
      'Deal documents never appear in a "summarise my week" answer.',
      "Replies to Andy: short, first names, no bullet points.",
    ]) {
      expect({ kept, present: texts.includes(kept) }).toEqual({ kept, present: true });
    }
  });

  it("each one says when it applies and what the EA does — which the old list could not", async () => {
    for (const rule of await rules()) {
      expect(["all", "opts", "quote", "bill", "section", "parameter", "triage", "rule"]).toContain(rule.scope);
      expect(["auto", "ask"]).toContain(rule.mode);
      expect(typeof rule.on).toBe("boolean");
    }
  });

  it("V2.1's four routes are GONE from the table, not merely unused", async () => {
    // a retired route left in the table is a route somebody will call
    const names = ROUTES.map((r) => r.name as string);
    for (const gone of ["getRules", "postRule", "putRule", "deleteRule"]) {
      expect({ route: gone, present: names.includes(gone) }).toEqual({ route: gone, present: false });
    }
    // and the paths answer nothing
    expect((await handle({ method: "GET", path: "/rules" })).status).toBe(404);
  });
});

describe("ST-02 · the set is saved whole, and refused when it is wrong", () => {
  it("saves an edit and reads it back", async () => {
    const next = (await rules()).map((r) => (r.id === "ar2" ? { ...r, mode: "auto" as const } : r));
    expect((await put(next)).status).toBe(200);
    expect((await rules()).find((r) => r.id === "ar2")?.mode).toBe("auto");
  });

  it("refuses a body that is not a list, and a rule with nothing to say", async () => {
    const bad = await handle({ method: "PUT", path: "/settings/autonomy/rules", body: { rules: "all of them" } });
    expect(bad.status).toBe(422);
    expect((bad.json as { field?: string }).field).toBe("rules");

    const [first, ...rest] = await rules();
    expect((await put([{ ...first, text: "   " }, ...rest])).status).toBe(422);
    // the positive half: the same body with the text restored is accepted
    expect((await put([first, ...rest])).status).toBe(200);
  });

  it("refuses a scope and a mode it has never heard of, naming WHICH rule and which field", async () => {
    // The generated schema catches these before the handler's own check does,
    // and the field it names is the full path — `rules[0].scope`, not `scope`.
    // That precision is CD-13's fix (the validator used to truncate to the
    // first segment), and it is the better answer: with eight rules on screen,
    // "scope" does not say which row to look at.
    const [first, ...rest] = await rules();
    const badScope = await put([{ ...first, scope: "everything" as AutonomyRule["scope"] }, ...rest]);
    expect(badScope.status).toBe(422);
    expect((badScope.json as { field?: string }).field).toBe("rules[0].scope");

    const badMode = await put([{ ...first, mode: "sometimes" as AutonomyRule["mode"] }, ...rest]);
    expect(badMode.status).toBe(422);
    expect((badMode.json as { field?: string }).field).toBe("rules[0].mode");
  });

  it("a removal really removes — a rule has no history to keep", async () => {
    // unlike a habit, which archives: an off rule still in the list is a rule
    // somebody reads as active one day
    const before = await rules();
    expect((await put(before.filter((r) => r.id !== "ar1"))).status).toBe(200);
    expect((await rules()).map((r) => r.id)).not.toContain("ar1");
  });
});

describe("ST-03 · the EA proposes a rule, and Approve writes exactly it", () => {
  async function propose(text?: string): Promise<ActionItem> {
    const res = await handle({ method: "POST", path: "/settings/autonomy/propose", body: { text } });
    expect(res.status).toBe(200);
    return res.json as ActionItem;
  }

  it("raises a `rule` card carrying the rule it would write, and its evidence", async () => {
    const card = await propose("File EO invoices under Work · money without asking");
    expect(card.kind).toBe("rule");
    expect(card.state).toBe("open");
    expect(card.rule?.text).toBe("File EO invoices under Work · money without asking");
    // the evidence is on the card: a proposal that says only "shall I?" is
    // asking you to take its word for the pattern
    expect(card.why.length).toBeGreaterThan(10);
    expect(card.rule?.why).toContain("four times");
    // and it is a real card, on the list Needs you reads
    expect((db.get().actions ?? []).some((a) => a.id === card.id)).toBe(true);
  });

  it("Approve appends EXACTLY the text the card showed, switched on", async () => {
    const card = await propose("Never move a Thursday meeting without asking");
    const before = await rules();

    const res = await handle({ method: "POST", path: `/actions/${card.id}`, body: { verb: "approve" } });
    expect(res.status).toBe(200);

    const after = await rules();
    expect(after.length).toBe(before.length + 1);
    const added = after.at(-1)!;
    // what was agreed to and what was stored are the same string — which is
    // the whole reason the card carries its own wording
    expect(added.text).toBe("Never move a Thursday meeting without asking");
    expect({ on: added.on, addedBy: added.addedBy }).toEqual({ on: true, addedBy: "josh" });
  });

  it("Never writes nothing, and says so in the card's history", async () => {
    const card = await propose("Book the gym at 6am");
    const before = await rules();

    const res = await handle({ method: "POST", path: `/actions/${card.id}`, body: { verb: "never" } });
    expect(res.status).toBe(200);

    expect((await rules()).length).toBe(before.length);
    expect((res.json as ActionItem).history.at(-1)?.verb).toBe("never");
  });

  it("A4R2-02: Undo takes the rule back off — an Undo that does not undo is worse than no Undo", async () => {
    // The A-4 audit drove this on the running app: Approve took the list from
    // seven rules to eight, Undo returned the CARD to Needs you and left the
    // eighth rule in force — `mode: "auto"`, `on: true` — permanently, with no
    // signal. That is the EA keeping standing authority to act without asking,
    // which the person had just withdrawn. `postActionUndo` reverted a
    // `section` snapshot and a `parameter` snapshot and nothing else, though
    // `KIND_EFFECTS` has four entries.
    const before = await rules();
    const card = await propose("Pay any invoice under fifty dollars without asking");

    expect((await handle({ method: "POST", path: `/actions/${card.id}`, body: { verb: "approve" } })).status).toBe(200);
    const approved = await rules();
    expect(approved.length).toBe(before.length + 1);

    expect((await handle({ method: "POST", path: `/actions/${card.id}/undo` })).status).toBe(200);
    const undone = await rules();
    // the list is exactly what it was — by id and by text, not merely by count
    expect(undone.map((r) => r.id)).toEqual(before.map((r) => r.id));
    expect(undone.some((r) => r.text === "Pay any invoice under fifty dollars without asking")).toBe(false);
    // and the card really did come back, so this is not passing because the
    // undo failed outright
    expect((db.get().actions as ActionItem[]).find((a) => a.id === card.id)?.state).toBe("open");
  });

  it("A4R2-02: a rule TAUGHT from a triage card comes back off on undo too", async () => {
    // `applyTriageVerb` appends by the same shape and the same derived id, so
    // the revert covers both paths by construction rather than by a second
    // branch that could drift from the first.
    //
    // A4R3-05: this case first looked for a triage card in the day-1 fixture,
    // found none — `actions.json` has no `kind: "triage"` row — and fell back
    // to asserting that a template literal equals itself. That is a tautology
    // wearing a test's clothes: it could not go red, so it proved nothing
    // about the path it names, and it was cited in B-189 as though it had.
    // A triage card is RAISED here instead, the way `share.test.ts` raises
    // one: a shared link nothing classifies is filed provisionally and asks.
    const before = await rules();
    const shared = await handle({
      method: "POST",
      path: "/brain/dump",
      body: { text: "https://afr.com/dental-rollups", url: "https://afr.com/dental-rollups", source: "share" },
    });
    expect(shared.status).toBe(200);
    const captureId = (shared.json as { item: { id: string } }).item.id;
    const action = (db.get().actions as ActionItem[]).find((a) => a.kind === "triage" && a.state === "open" && a.triage?.captureId === captureId);
    expect(action).toBeDefined(); // the card is the SUBJECT — no silent skip

    // `teach` carries a `rule` string by the contract's own union, and the
    // triage path composes its OWN text from the host and the routing rather
    // than storing this one — so the body is required and its content is not
    // what lands. Sending `{ verb: "teach" }` alone is a 422.
    const taughtRes = await handle({ method: "POST", path: `/actions/${action!.id}`, body: { verb: "teach", rule: "File afr.com under Work" } });
    expect(taughtRes.status).toBe(200);
    const taught = await rules();
    expect(taught.length).toBe(before.length + 1);
    expect(taught.some((r) => r.id === `ar-${action!.id}`)).toBe(true);

    expect((await handle({ method: "POST", path: `/actions/${action!.id}/undo` })).status).toBe(200);
    expect((await rules()).map((r) => r.id)).toEqual(before.map((r) => r.id));
  });

  it("Later leaves it proposed — an undecided rule is not a rule", async () => {
    const card = await propose("Something I have not thought about");
    const before = await rules();
    await handle({ method: "POST", path: `/actions/${card.id}`, body: { verb: "later" } });
    expect((await rules()).length).toBe(before.length);
  });
});

describe("A4R4-04 · one rule, one id — the route's guarantee, not each client's", () => {
  it("refuses a set carrying two rules with the same id, naming which", async () => {
    // `applyTriageVerb` mints `ar-${card.id}` when a triage card is answered
    // `teach`, and the Teach SHEET then minted `ar-${from}` for the sentence
    // the person typed — the same card id, so two different rules shared one
    // id. `Rules.tsx` keys by `rule.id` and opens the editor with it, so one
    // of the two could be neither edited nor deleted, and a card undo removed
    // the person's own sentence along with the card's rule.
    const current = await rules();
    const clash = { ...current[0], id: current[1].id };
    const res = await put([...current, clash]);
    expect(res.status).toBe(422);
    expect((res.json as { field?: string; reason?: string }).field).toBe("rules");
    expect((res.json as { reason?: string }).reason).toContain(current[1].id);
  });

  it("and takes the same set with distinct ids", async () => {
    const current = await rules();
    expect((await put(current)).status).toBe(200);
  });
});
