/**
 * AG-01 — what counts as a spending cap, and what the refusal says.
 *
 * One function decides, so the line under the field and the reason on a
 * disabled Save cannot disagree: they are the same string from the same call
 * (rule 16). The cases pin the LITERAL sentence rather than asserting
 * "something was returned" — a refusal nobody can read is the defect, not the
 * refusal (R-01).
 */
import { capProblem } from "@/components/agents/CapsDialog";

describe("AG-01 · a cap is digits, and at most five of them", () => {
  it("accepts what a cap actually is", () => {
    for (const good of ["0", "5", "50", "150", "99999"]) {
      expect({ value: good, problem: capProblem(good) }).toEqual({ value: good, problem: null });
    }
  });

  it("refuses an empty field, and says a cap is a number", () => {
    expect(capProblem("")).toBe("A cap is a number");
    expect(capProblem("   ")).toBe("A cap is a number");
  });

  it("refuses symbols and decimals, naming which rule", () => {
    // the dollar sign is now PRINTED beside the field, so typing one is the
    // natural mistake and the line has to be about that mistake
    for (const bad of ["$50", "50.00", "50c", "fifty", "-5", "1,000"]) {
      expect({ value: bad, problem: capProblem(bad) }).toEqual({ value: bad, problem: "Digits only — no symbols, no decimals" });
    }
  });

  it("refuses more than five digits, and says how many is too many", () => {
    expect(capProblem("999999")).toBe("That is more than 5 digits");
    // the boundary from both sides, so the number in the sentence is the
    // number in the check
    expect(capProblem("99999")).toBeNull();
  });

  it("every refusal is a sentence, not a code", () => {
    for (const bad of ["", "$5", "123456"]) {
      const problem = capProblem(bad)!;
      expect(problem[0]).toBe(problem[0].toUpperCase());
      expect(problem.length).toBeGreaterThan(10);
    }
  });
});
