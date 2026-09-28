/**
 * CD-17 · `hoverSurface` — the arithmetic behind the pack's hover rule
 * ("surface lightens one step (Card alpha +.08)").
 *
 * Every expectation here is a literal written out by hand. The one input
 * read from the app is `misc.hoverLift`, and it is asserted to equal .08
 * first — so if the token ever moves, this file fails and says so, rather
 * than quietly re-deriving its own expected answers from the new value
 * (hard rule 11).
 */
import { hoverSurface } from "@/theme/ui/hover";
import { misc } from "@/theme/tokens";

describe("CD-17 · hoverSurface", () => {
  it("the pack's step is .08", () => {
    expect(misc.hoverLift).toBe(0.08);
  });

  it("raises an rgba alpha by one step — the light card, .58 → .66", () => {
    expect(hoverSurface("rgba(255,255,255,.58)", "rgba(255,255,255,.58)")).toBe("rgba(255,255,255,0.66)");
  });

  it("raises the dark card the same way, .08 → .16", () => {
    expect(hoverSurface("rgba(255,255,255,.08)", "rgba(255,255,255,.08)")).toBe("rgba(255,255,255,0.16)");
  });

  it("gives a transparent surface exactly one step of the colour it borrows", () => {
    expect(hoverSurface("transparent", "rgba(255,255,255,.58)")).toBe("rgba(255,255,255,0.08)");
  });

  it("clamps at fully opaque rather than producing alpha > 1", () => {
    expect(hoverSurface("rgba(10,20,30,.97)", "rgba(255,255,255,.58)")).toBe("rgba(10,20,30,1)");
  });

  it("returns null for an opaque hex — there is no alpha to lift", () => {
    expect(hoverSurface("#2B2A26", "rgba(255,255,255,.58)")).toBeNull();
  });

  it("returns null for rgb() with no alpha channel", () => {
    expect(hoverSurface("rgb(20,20,20)", "rgba(255,255,255,.58)")).toBeNull();
  });

  it("returns null when a transparent surface has no rgba to borrow from", () => {
    expect(hoverSurface("transparent", "#EDEBE5")).toBeNull();
  });

  it("honours an explicit step, so the caller is never stuck with the default", () => {
    expect(hoverSurface("rgba(0,0,0,.5)", "rgba(0,0,0,.5)", 0.25)).toBe("rgba(0,0,0,0.75)");
  });
});
