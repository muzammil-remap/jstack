/**
 * The pack's own scrollbars, web only — README, Do and don't: "Scrollbars: 5px,
 * thumb `rgba(122,119,111,.3)`, transparent track, thin on Firefox. Never a
 * styled or visible track." The app shipped with none of this, so every scroll
 * region used the platform's default.
 *
 * That is not only a cosmetic gap. On the web the Tasks board is a horizontal
 * scroller, and Chromium's default there is an OVERLAY scrollbar that appears
 * only while scrolling — so the board's fourth lane was simply cut mid-word at
 * 393, 1024 and 1366 with nothing on screen to say it could be scrolled at all
 * (ux-review R2-02). A permanently visible 5px thumb is the affordance, and it
 * is the one the pack already specifies.
 *
 * The `::-webkit-scrollbar` block carries Chromium and Safari at the pack's
 * exact 5px; `scrollbar-width: thin` covers Firefox but is scoped behind
 * `@supports not selector(::-webkit-scrollbar)`, because unscoped it wins over
 * the webkit sizing in Chromium too and paints 6px with end arrows. Inert on
 * native, where this never runs.
 */
import { Platform } from "react-native";
import { misc } from "@/theme/tokens";

const STYLE_ID = "jstack-scrollbars";

export function installWebScrollbars(): void {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID) != null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    // Chromium and Safari: the exact 5px the pack names.
    `::-webkit-scrollbar{width:${misc.scrollbarSize}px;height:${misc.scrollbarSize}px}`,
    `::-webkit-scrollbar-track{background:transparent}`,
    `::-webkit-scrollbar-thumb{background:${misc.scrollbarThumb};border-radius:3px}`,
    // Firefox, which has no ::-webkit-scrollbar and only the coarse `thin`.
    // Guarded, because an unscoped `scrollbar-width` SUPERSEDES the webkit
    // sizing above in Chromium too — which painted a 6px thumb with Chromium's
    // own end arrows instead of the pack's 5 (ux-review round 4's one caveat).
    `@supports not selector(::-webkit-scrollbar){*{scrollbar-width:thin;scrollbar-color:${misc.scrollbarThumb} transparent}}`,
  ].join("\n");
  document.head.appendChild(style);
}
