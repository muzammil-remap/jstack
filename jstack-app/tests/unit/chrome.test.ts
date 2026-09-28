/**
 * chrome.test.ts (Stage 5d P-8, F-41 + F-42 + F-43 + F-70) — the chrome written
 * once. Each of the four pieces used to be written twice (the health line in
 * the rail and the phone header, the floating bar under two banners, the
 * overlay recipe and the close button under Dialog and Sheet) or in the root
 * layout (the privacy shield). The guards here are about where a thing LIVES,
 * because every one of them renders the same pixels before and after: the
 * board proves the pixels, this file proves there is one copy.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HealthLine } from "@/components/chrome/HealthLine";
import { BottomBanner } from "@/components/chrome/BottomBanner";
import { PrivacyShield } from "@/components/chrome/PrivacyShield";
import { CloseButton, overlayBackdrop } from "@/layout/dialogKit";

const root = join(__dirname, "..", "..");
const src = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("P-8 · the chrome written once", () => {
  it("the health line is one component; the rail and the phone header render it and keep their own wrappers (F-41)", () => {
    expect(typeof HealthLine).toBe("function");
    for (const f of ["components/chrome/Header.tsx", "components/chrome/Rail.tsx"]) {
      expect(src(f)).not.toMatch(/offline · captures queue|summary\.health/);
    }
    // the ids stay on the callers, where CONTROLS and the specs look for them
    expect(src("components/chrome/Rail.tsx")).toMatch(/testID="rail-health"/);
    expect(src("components/chrome/Header.tsx")).toMatch(/testID="header-health"/);
    expect(src("components/chrome/HealthLine.tsx")).toMatch(/offline · captures queue/);
  });

  it("the floating bar is one shell under MicBanner and TalkBanner (F-42)", () => {
    expect(typeof BottomBanner).toBe("function");
    for (const f of ["components/chrome/MicBanner.tsx", "components/chrome/TalkBanner.tsx"]) {
      expect(src(f)).not.toMatch(/position: "absolute"|frostedStyle/);
    }
    expect(src("components/chrome/MicBanner.tsx")).toMatch(/testID="mic-banner"/);
    expect(src("components/chrome/TalkBanner.tsx")).toMatch(/testID="talk-banner"/);
  });

  it("the overlay recipe and the close button are the kit's, and Dialog and Sheet read them (F-43)", () => {
    expect(typeof CloseButton).toBe("function");
    const backdrop = overlayBackdrop(100) as { position?: string; zIndex?: number };
    expect(backdrop.position).toBe("absolute");
    expect(backdrop.zIndex).toBe(100);
    for (const f of ["components/chrome/Dialog.tsx", "components/chrome/Sheet.tsx"]) {
      expect(src(f)).not.toMatch(/misc\.scrim|name="close"/);
      // the per-instance close id is still forwarded from the surface, so controls.test.ts can reconstruct it
      expect(src(f)).toMatch(/testID=\{`\$\{testID\}-close`\}/);
    }
  });

  it("the privacy shield is its own component, out of the root layout (F-70)", () => {
    expect(typeof PrivacyShield).toBe("function");
    expect(src("app/_layout.tsx")).not.toMatch(/privacy-shield/);
    expect(src("components/chrome/PrivacyShield.tsx")).toMatch(/testID="privacy-shield"/);
  });
});
