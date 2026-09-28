/**
 * SM-08 / PL-02 — the labelling scheme, and the split between what the
 * client may decide and what the server decides.
 *
 * This model is the privacy design: which silo a record belongs to (who can
 * see it) and which types it carries (what it is about). Until S-6 it had
 * **no tests at all** — a designed scheme, a written spec in
 * `DATA_LABELS.md`, two hundred lines of rules, and nothing exercising any
 * of it. That is the more serious of S-6's two findings; the dead exports
 * were the symptom that led to it.
 *
 * The split S-6 makes: `data/labels.ts` holds the scheme and the two pure
 * operations a client legitimately needs (compare two silos, derive labels
 * for derived content), and `data/mock/labelRules.ts` holds the rules that
 * decide a NEW record's labels. A client that can choose its own labels can
 * choose a wider silo than it should have, so that decision belongs to the
 * server — which the mock is, in this build.
 *
 * Every expectation is written out from DATA_LABELS.md's own rules, not
 * derived from the implementation.
 */
import {
  SILO_META,
  TYPE_META,
  UNLABELLED,
  inheritLabels,
  isWideningSilo,
  removesRestrictedType,
  strictestSilo,
  type Labels,
  type Silo,
} from "@/data/labels";
import { applyContentRules, defaultLabelsFor } from "@/data/mock/labelRules";

const labels = (silo: Silo, types: string[], setBy = "source"): Labels =>
  ({ silo, types, setBy }) as Labels;

describe("R1 the scheme fails closed", () => {
  it("the unlabelled default is the narrowest silo and says a human must look", () => {
    expect(UNLABELLED).toEqual({ silo: "personal:josh", types: ["unlabelled"], setBy: "review" });
  });

  it("every silo and every type carries its metadata — no unnamed value", () => {
    for (const silo of Object.keys(SILO_META) as Silo[]) {
      expect(SILO_META[silo].shortName).toBeTruthy();
      expect(SILO_META[silo].who).toBeTruthy();
    }
    for (const [type, meta] of Object.entries(TYPE_META)) {
      expect(`${type}: ${meta.covers}`).not.toMatch(/: *$/); // every type says what it covers
      expect(["open", "review", "restricted", "identity"]).toContain(meta.tier);
    }
  });
});

describe("R2 strictest wins", () => {
  it("a one-person silo beats family, and family1 beats the household", () => {
    // personal:josh = personal:joce = work (one person) > family1 (two) > family2
    expect(strictestSilo("family2", "family1")).toBe("family1");
    expect(strictestSilo("family1", "work")).toBe("work");
    expect(strictestSilo("family2", "personal:joce")).toBe("personal:joce");
    expect(strictestSilo("work", "family2")).toBe("work");
  });

  it("a tie keeps the first source's silo (DATA_LABELS.md §2)", () => {
    expect(strictestSilo("personal:josh", "work")).toBe("personal:josh");
    expect(strictestSilo("work", "personal:joce")).toBe("work");
  });

  it("derived content takes the strictest silo and the union of types", () => {
    const derived = inheritLabels(labels("family2", ["open"]), labels("work", ["jstack"]), labels("family1", ["kids"]));
    expect(derived.silo).toBe("work");
    expect([...derived.types].sort()).toEqual(["jstack", "kids", "open"]);
    // and it records that it was derived rather than claimed by a source
    expect(derived.setBy).toBe("content");
  });

  it("deriving from nothing falls back to the fail-closed default, not to open", () => {
    expect(inheritLabels()).toEqual(UNLABELLED);
  });
});

describe("R3 declassification is visible", () => {
  it("moving to a less strict silo is a widening", () => {
    expect(isWideningSilo("work", "family2")).toBe(true);
    expect(isWideningSilo("family1", "family2")).toBe(true);
    // and the other direction, and a lateral move, are not
    expect(isWideningSilo("family2", "work")).toBe(false);
    expect(isWideningSilo("personal:josh", "work")).toBe(false);
  });

  it("dropping a restricted type is a declassify whatever the silo does", () => {
    const restricted = (Object.keys(TYPE_META) as (keyof typeof TYPE_META)[]).filter((t) => TYPE_META[t].tier === "restricted");
    expect(restricted.length).toBeGreaterThan(0); // else the case below proves nothing
    const from = [restricted[0], "open"] as never;
    expect(removesRestrictedType(from, ["open"] as never)).toBe(true);
    expect(removesRestrictedType(from, from)).toBe(false);
    // an open type going missing is not a declassify
    expect(removesRestrictedType(["open"] as never, [] as never)).toBe(false);
  });
});

describe("R3 content rules are additive, never subtractive", () => {
  it("adds the type its keywords name", () => {
    expect(applyContentRules(labels("family1", ["open"]), "swim squad on Tuesday").types).toContain("kids");
    expect(applyContentRules(labels("family1", ["open"]), "transfer the deposit").types).toContain("money");
    expect(applyContentRules(labels("family1", ["open"]), "book a check-up").types).toContain("health");
  });

  it("never removes a type it did not add", () => {
    const before = labels("work", ["open", "jstack"]);
    const after = applyContentRules(before, "the school run and a $40 bill");
    for (const t of before.types) expect(after.types).toContain(t);
  });

  it("leaves the silo alone — content can say what a thing is about, never who may see it", () => {
    expect(applyContentRules(labels("family2", ["open"]), "doctor at nine").silo).toBe("family2");
  });

  it("text that matches nothing is returned untouched, same object", () => {
    const before = labels("work", ["open"]);
    expect(applyContentRules(before, "a quiet afternoon")).toBe(before);
  });

  it("promotes setBy from source to content only when it actually added something", () => {
    expect(applyContentRules(labels("work", ["open"], "source"), "a $40 bill").setBy).toBe("content");
    // an explicit human decision is never downgraded to a machine one
    expect(applyContentRules(labels("work", ["open"], "josh"), "a $40 bill").setBy).toBe("josh");
  });
});

describe("PL-02 the server's defaults at creation", () => {
  it("a known project gets its silo; an unknown one fails closed", () => {
    expect(defaultLabelsFor({ noun: "task", project: "JSTACK" })).toEqual({ silo: "work", types: ["jstack"], setBy: "source" });
    // R1: never guess a silo for a project nobody has classified
    expect(defaultLabelsFor({ noun: "task", project: "Something New" })).toEqual(UNLABELLED);
  });

  it("a journal entry is personal; an auto-filed dump waits for review", () => {
    expect(defaultLabelsFor({ noun: "brain", category: "Journal" })).toEqual({
      silo: "personal:josh",
      types: ["journal"],
      setBy: "source",
    });
    expect(defaultLabelsFor({ noun: "brain", category: "Auto" })).toEqual(UNLABELLED);
  });

  it("a work event naming the build picks up jstack; one that does not, does not", () => {
    expect(defaultLabelsFor({ noun: "event", source: "work", title: "JSTACK standup" }).types).toContain("jstack");
    expect(defaultLabelsFor({ noun: "event", source: "work", title: "Dentist" }).types).not.toContain("jstack");
  });

  it("a family event runs the content rules over its own title", () => {
    expect(defaultLabelsFor({ noun: "event", source: "family", title: "school pickup" }).types).toContain("kids");
  });

  it("a finance message is money, and an unrecognised card type stays open", () => {
    expect(defaultLabelsFor({ noun: "financeMessage" }).types).toEqual(["money"]);
    expect(defaultLabelsFor({ noun: "action", type: "Bill" }).types).toEqual(["money"]);
    expect(defaultLabelsFor({ noun: "action", type: "Something Else" })).toEqual({
      silo: "personal:josh",
      types: ["open"],
      setBy: "source",
    });
  });
});
