/**
 * `lib/richText.tsx` — the query highlight a Brain detail draws over a
 * capture's text (OP-01; Stage 5d P-1, F-69).
 *
 * `richRuns` (weight from `<b>`, the dot and orphan bindings) is proven in
 * `hardening.test.ts` SH-06 and `screens.test.tsx` CD-04, where those claims
 * live. `highlightRuns` had no test at all: it lived as a private `runs()`
 * inside `BrainItemDetail.tsx`, under a header that said the highlight ran
 * through `richRuns` — a claim the code did not keep. Now it is the one
 * splitter beside the other, and this is its guard.
 */
import { bindDots, fragment, highlightRuns, noOrphan, unbroken, valueLine } from "@/lib/richText";

describe("highlightRuns · the query's matches, as runs", () => {
  it("splits on every case-insensitive occurrence and keeps the text's own casing", () => {
    expect(highlightRuns("Steve about Bali, then Steve again", "steve")).toEqual([
      { text: "Steve", hit: true },
      { text: " about Bali, then ", hit: false },
      { text: "Steve", hit: true },
      { text: " again", hit: false },
    ]);
  });

  it("a match at the very start and at the very end are both hits, with nothing invented between", () => {
    expect(highlightRuns("bali to bali", "bali")).toEqual([
      { text: "bali", hit: true },
      { text: " to ", hit: false },
      { text: "bali", hit: true },
    ]);
  });

  it("a blank query lights nothing — one plain run, so the caller never branches", () => {
    expect(highlightRuns("Steve about Bali", "")).toEqual([{ text: "Steve about Bali", hit: false }]);
    expect(highlightRuns("Steve about Bali", "   ")).toEqual([{ text: "Steve about Bali", hit: false }]);
  });

  it("a query the text does not contain is one plain run", () => {
    expect(highlightRuns("Steve about Bali", "moz")).toEqual([{ text: "Steve about Bali", hit: false }]);
  });

  it("the runs rejoin to exactly the text, so a renderer cannot lose a character", () => {
    const text = "Ella's passport expires before Bali — start the renewal";
    for (const q of ["bali", "ELLA", "the", "renewal", "'s pass"]) {
      expect(highlightRuns(text, q).map((r) => r.text).join("")).toBe(text);
    }
  });
});

describe("noOrphan · a title's last word is bound to the one before it (P-9, N1-04b/N1-05)", () => {
  it("binds the final space with NBSP and leaves a one-word or empty string alone", () => {
    expect(noOrphan("start the renewal")).toBe("start the\u00A0renewal");
    expect(noOrphan("renewal")).toBe("renewal");
    expect(noOrphan("")).toBe("");
  });
});

describe("fragment · a provenance sentence loses its full stop before the separator (S6-49)", () => {
  it("strips one trailing full stop and nothing else", () => {
    // `decision-section-d1-1366-*`: "…where you look first. · your EA · …" —
    // a terminator and a separator in a row (README Content: provenance reads
    // as a sentence fragment)
    expect(fragment("this puts it where you look first.")).toBe("this puts it where you look first");
    expect(fragment("no stop")).toBe("no stop");
    expect(fragment("feed: Redbark, V2.1")).toBe("feed: Redbark, V2.1");
    expect(fragment("")).toBe("");
  });
});

describe("bindDots · a separator never opens or ends a line (hard rule 24; ux round A63-01)", () => {
  it("binds EVERY spaced middle dot to both neighbours, and leaves an unspaced one alone", () => {
    // Agents' Security card composes its line by hand, so it gets none of the
    // bindings `richRuns` gives a proposal's runs — and the fixture's own
    // status carries separators too, which is why the whole line goes through
    // this rather than only the join this card adds.
    expect(bindDots("Singapore · restored in 14 min · Sat 5 Sep")).toBe("Singapore · restored in 14 min · Sat 5 Sep");
    expect(bindDots("clean")).toBe("clean");
    // not a separator: no spaces around it, so nothing to bind
    expect(bindDots("a·b")).toBe("a·b");
  });
});

describe("unbroken · one value is never split across lines (ux round A63-01)", () => {
  it("binds every space in the value it is given", () => {
    // `Sat 5 Sep, 2:00am` broke after the 5 at 393 on the shipping frames:
    // two lines that each look like a date and neither of which is one.
    expect(unbroken("Sat 5 Sep, 2:00am")).toBe("Sat 5 Sep, 2:00am");
    expect(unbroken("ran just now")).toBe("ran just now");
    expect(unbroken("")).toBe("");
  });
});

describe("valueLine \u00b7 a wrap falls BETWEEN values, never inside one (ux round A64-01)", () => {
  it("binds each value whole and the separator to the value before it", () => {
    // Measured at 1366: the Security card's status column is 164px and this
    // line is 205px, so it MUST take two lines. Binding every separator to
    // both neighbours left the values as the only place to break, and the
    // card read "6 planted \u00b7 none" / "tripped \u00b7 Yesterday 6:00am".
    const line = valueLine(["6 planted", "none tripped", "Yesterday 6:00am"]);
    expect(line).toBe("6\u00a0planted\u00a0\u00b7 none\u00a0tripped\u00a0\u00b7 Yesterday\u00a06:00am");

    // the break points are exactly the gaps between values: one ordinary
    // space per separator, and none anywhere else
    expect(line.split(" ").length - 1).toBe(2);
    // no value carries an ordinary space, so none of them can split
    for (const value of line.split("\u00b7")) expect(value.trim().includes(" ")).toBe(false);
    // and no separator has a space BEFORE it, so none can open a line
    expect(/ \u00b7/.test(line)).toBe(false);
  });

  it("leaves a single value alone and survives an empty list", () => {
    expect(valueLine(["clean"])).toBe("clean");
    expect(valueLine([])).toBe("");
  });
});
